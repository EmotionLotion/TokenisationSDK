/**
 * Scheduler Service
 *
 * DB-backed job scheduler for recurring and one-off tasks:
 * - Uses `scheduled_jobs` and `job_runs` tables (created at init)
 * - Polls DB for jobs due to run based on nextRunAt
 * - Simple row-level locking via status='running' + lockUntil timestamp
 * - Supports cron-like expressions and fixed-interval scheduling
 * - Built-in job types for distribution, vesting, compliance, reconciliation, lockup, CRE sync
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type JobType =
  | 'distribution.execute'
  | 'vesting.release'
  | 'compliance.expiry'
  | 'reconciliation.run'
  | 'lockup.check'
  | 'cre.sync'
  | string;

export type JobStatus = 'active' | 'paused' | 'running' | 'deleted';
export type RunStatus = 'success' | 'failure' | 'running' | 'skipped';

export interface ScheduledJob {
  id: string;
  orgId: string;
  name: string;
  jobType: JobType;
  schedule: string;            // cron expression or interval like '5m', '1h', '1d'
  scheduleType: 'cron' | 'interval';
  status: JobStatus;
  payload: Record<string, unknown>;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  lockUntil: string | null;
  lockedBy: string | null;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  orgId: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  error: string | null;
  attempt: number;
  triggeredBy: string;
  createdAt: string;
}

export interface CreateJobInput {
  orgId: string;
  name: string;
  jobType: JobType;
  schedule: string;
  scheduleType?: 'cron' | 'interval';
  payload?: Record<string, unknown>;
  nextRunAt?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Built-in Job Type Registry
// ============================================================================

const JOB_TYPE_HANDLERS: Record<string, (job: ScheduledJob) => Promise<Record<string, unknown>>> = {};

/**
 * Register a handler for a job type. Called by domain services at startup.
 */
export function registerJobHandler(
  jobType: string,
  handler: (job: ScheduledJob) => Promise<Record<string, unknown>>
): void {
  JOB_TYPE_HANDLERS[jobType] = handler;
  logger.info(`Scheduler: registered handler for job type "${jobType}"`);
}

// Register built-in stub handlers (real implementations call into domain services)
function registerBuiltinHandlers(): void {
  const builtinTypes: JobType[] = [
    'distribution.execute',
    'vesting.release',
    'compliance.expiry',
    'reconciliation.run',
    'lockup.check',
    'cre.sync',
  ];

  for (const jobType of builtinTypes) {
    if (!JOB_TYPE_HANDLERS[jobType]) {
      JOB_TYPE_HANDLERS[jobType] = async (job: ScheduledJob) => {
        logger.info(`Scheduler: executing built-in job type "${jobType}"`, { jobId: job.id, orgId: job.orgId });
        // Placeholder — real services override via registerJobHandler()
        return { executed: true, jobType, timestamp: new Date().toISOString() };
      };
    }
  }
}

// ============================================================================
// Cron Expression Parser (simple subset: minute hour dayOfMonth month dayOfWeek)
// ============================================================================

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function parseCronField(field: string, min: number, max: number): number[] {
  const values: number[] = [];

  for (const part of field.split(',')) {
    // Handle step syntax: */5 or 1-10/2
    const [rangePart, stepStr] = part.split('/');
    const step = stepStr ? parseInt(stepStr, 10) : 1;

    if (rangePart === '*') {
      for (let i = min; i <= max; i += step) values.push(i);
    } else if (rangePart.includes('-')) {
      const [startStr, endStr] = rangePart.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      for (let i = start; i <= end; i += step) values.push(i);
    } else {
      values.push(parseInt(rangePart, 10));
    }
  }

  return values.filter(v => v >= min && v <= max);
}

function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${parts.length}`);
  }
  return {
    minute: parseCronField(parts[0], 0, 59),
    hour: parseCronField(parts[1], 0, 23),
    dayOfMonth: parseCronField(parts[2], 1, 31),
    month: parseCronField(parts[3], 1, 12),
    dayOfWeek: parseCronField(parts[4], 0, 6),
  };
}

function getNextCronRun(expression: string, after: Date = new Date()): Date {
  const cron = parseCron(expression);
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1); // Start checking from next minute

  // Search up to 366 days ahead
  const limit = new Date(after);
  limit.setFullYear(limit.getFullYear() + 1);

  while (next < limit) {
    if (
      cron.month.includes(next.getMonth() + 1) &&
      cron.dayOfMonth.includes(next.getDate()) &&
      cron.dayOfWeek.includes(next.getDay()) &&
      cron.hour.includes(next.getHours()) &&
      cron.minute.includes(next.getMinutes())
    ) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  // Fallback: 24h from now
  return new Date(after.getTime() + 86400000);
}

// ============================================================================
// Interval Parser
// ============================================================================

function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid interval format: "${interval}". Use e.g. 30s, 5m, 1h, 1d`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    case 'd': return value * 86400 * 1000;
    default: throw new Error(`Unknown interval unit: ${unit}`);
  }
}

function getNextIntervalRun(interval: string, after: Date = new Date()): Date {
  const ms = parseInterval(interval);
  return new Date(after.getTime() + ms);
}

// ============================================================================
// Compute next run based on schedule type
// ============================================================================

function computeNextRun(scheduleType: 'cron' | 'interval', schedule: string, after?: Date): string {
  const base = after || new Date();
  if (scheduleType === 'cron') {
    return getNextCronRun(schedule, base).toISOString();
  }
  return getNextIntervalRun(schedule, base).toISOString();
}

// ============================================================================
// Table Initialization
// ============================================================================

let tablesInitialized = false;

async function ensureTables(): Promise<void> {
  if (tablesInitialized) return;

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL,
      name TEXT NOT NULL,
      job_type TEXT NOT NULL,
      schedule TEXT NOT NULL,
      schedule_type TEXT NOT NULL DEFAULT 'interval',
      status TEXT NOT NULL DEFAULT 'active',
      payload TEXT DEFAULT '{}',
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      last_run_status TEXT,
      lock_until TEXT,
      locked_by TEXT,
      max_retries INTEGER NOT NULL DEFAULT 3,
      retry_delay_ms INTEGER NOT NULL DEFAULT 5000,
      timeout_ms INTEGER NOT NULL DEFAULT 300000,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS job_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
      org_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      result TEXT,
      error TEXT,
      attempt INTEGER NOT NULL DEFAULT 1,
      triggered_by TEXT NOT NULL DEFAULT 'scheduler',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(status, next_run_at)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_org ON scheduled_jobs(org_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_job_runs_job_id ON job_runs(job_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_job_runs_org ON job_runs(org_id)`);

  tablesInitialized = true;
  logger.info('Scheduler: tables initialized');
}

// ============================================================================
// Row Mapping
// ============================================================================

function mapJobRow(row: any): ScheduledJob {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    jobType: row.job_type,
    schedule: row.schedule,
    scheduleType: row.schedule_type || 'interval',
    status: row.status,
    payload: safeJsonParse(row.payload, {}),
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    lockUntil: row.lock_until,
    lockedBy: row.locked_by,
    maxRetries: row.max_retries,
    retryDelayMs: row.retry_delay_ms,
    timeoutMs: row.timeout_ms,
    metadata: safeJsonParse(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRunRow(row: any): JobRun {
  return {
    id: row.id,
    jobId: row.job_id,
    orgId: row.org_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    result: safeJsonParse(row.result, null),
    error: row.error,
    attempt: row.attempt,
    triggeredBy: row.triggered_by,
    createdAt: row.created_at,
  };
}

function safeJsonParse(value: any, fallback: any): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Register (create) a new scheduled job
 */
export async function registerJob(input: CreateJobInput): Promise<ScheduledJob> {
  await ensureTables();

  const id = randomUUID();
  const now = new Date().toISOString();
  const scheduleType = input.scheduleType || (input.schedule.includes(' ') ? 'cron' : 'interval');
  const nextRunAt = input.nextRunAt || computeNextRun(scheduleType, input.schedule);

  // Validate schedule format
  if (scheduleType === 'cron') {
    parseCron(input.schedule); // throws on invalid
  } else {
    parseInterval(input.schedule); // throws on invalid
  }

  await rawQuery(
    `INSERT INTO scheduled_jobs (id, org_id, name, job_type, schedule, schedule_type, status, payload, next_run_at, max_retries, retry_delay_ms, timeout_ms, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.orgId,
      input.name,
      input.jobType,
      input.schedule,
      scheduleType,
      JSON.stringify(input.payload || {}),
      nextRunAt,
      input.maxRetries ?? 3,
      input.retryDelayMs ?? 5000,
      input.timeoutMs ?? 300000,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  logger.info('Scheduler: job registered', { id, name: input.name, jobType: input.jobType, nextRunAt });

  const rows = await rawQuery(`SELECT * FROM scheduled_jobs WHERE id = ?`, [id]);
  return mapJobRow(rows[0]);
}

/**
 * Get a job by ID
 */
export async function getJob(jobId: string): Promise<ScheduledJob | null> {
  await ensureTables();
  const rows = await rawQuery(`SELECT * FROM scheduled_jobs WHERE id = ? AND status != 'deleted'`, [jobId]);
  return rows.length > 0 ? mapJobRow(rows[0]) : null;
}

/**
 * List all jobs, optionally filtered by orgId and/or status
 */
export async function listJobs(filters?: {
  orgId?: string;
  status?: JobStatus;
  jobType?: JobType;
  limit?: number;
  offset?: number;
}): Promise<{ data: ScheduledJob[]; total: number }> {
  await ensureTables();

  const conditions: string[] = ["status != 'deleted'"];
  const params: any[] = [];

  if (filters?.orgId) {
    conditions.push('org_id = ?');
    params.push(filters.orgId);
  }
  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.jobType) {
    conditions.push('job_type = ?');
    params.push(filters.jobType);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = await rawQuery(`SELECT COUNT(*) as cnt FROM scheduled_jobs ${where}`, params);
  const total = countRows[0]?.cnt || 0;

  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;

  const rows = await rawQuery(
    `SELECT * FROM scheduled_jobs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { data: rows.map(mapJobRow), total };
}

/**
 * Pause a job (prevents it from being picked up)
 */
export async function pauseJob(jobId: string): Promise<ScheduledJob> {
  await ensureTables();
  const now = new Date().toISOString();

  await rawQuery(
    `UPDATE scheduled_jobs SET status = 'paused', updated_at = ? WHERE id = ? AND status IN ('active', 'running')`,
    [now, jobId]
  );

  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  logger.info('Scheduler: job paused', { id: jobId, name: job.name });
  return job;
}

/**
 * Resume a paused job
 */
export async function resumeJob(jobId: string): Promise<ScheduledJob> {
  await ensureTables();
  const now = new Date().toISOString();

  // Recompute next run from now
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const nextRunAt = computeNextRun(job.scheduleType, job.schedule);

  await rawQuery(
    `UPDATE scheduled_jobs SET status = 'active', next_run_at = ?, lock_until = NULL, locked_by = NULL, updated_at = ? WHERE id = ? AND status = 'paused'`,
    [nextRunAt, now, jobId]
  );

  logger.info('Scheduler: job resumed', { id: jobId, name: job.name, nextRunAt });

  const updated = await getJob(jobId);
  return updated!;
}

/**
 * Soft-delete a job
 */
export async function deleteJob(jobId: string): Promise<void> {
  await ensureTables();
  const now = new Date().toISOString();

  await rawQuery(
    `UPDATE scheduled_jobs SET status = 'deleted', updated_at = ? WHERE id = ?`,
    [now, jobId]
  );

  logger.info('Scheduler: job deleted', { id: jobId });
}

/**
 * Get run history for a specific job
 */
export async function getJobRuns(jobId: string, options?: {
  limit?: number;
  offset?: number;
  status?: RunStatus;
}): Promise<{ data: JobRun[]; total: number }> {
  await ensureTables();

  const conditions: string[] = ['job_id = ?'];
  const params: any[] = [jobId];

  if (options?.status) {
    conditions.push('status = ?');
    params.push(options.status);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRows = await rawQuery(`SELECT COUNT(*) as cnt FROM job_runs ${where}`, params);
  const total = countRows[0]?.cnt || 0;

  const limit = options?.limit || 50;
  const offset = options?.offset || 0;

  const rows = await rawQuery(
    `SELECT * FROM job_runs ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return { data: rows.map(mapRunRow), total };
}

// ============================================================================
// Job Execution
// ============================================================================

const INSTANCE_ID = `scheduler-${randomUUID().slice(0, 8)}`;
const DEFAULT_LOCK_DURATION_MS = 300000; // 5 minutes

/**
 * Attempt to acquire lock on a job (optimistic locking pattern)
 */
async function acquireLock(jobId: string, timeoutMs: number): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + (timeoutMs || DEFAULT_LOCK_DURATION_MS)).toISOString();

  // Only acquire if not locked or lock expired
  const result = await rawQuery(
    `UPDATE scheduled_jobs
     SET status = 'running', lock_until = ?, locked_by = ?, updated_at = ?
     WHERE id = ? AND status = 'active' AND (lock_until IS NULL OR lock_until < ?)`,
    [lockUntil, INSTANCE_ID, now.toISOString(), jobId, now.toISOString()]
  );

  // For SQLite, check changes; for PG, check rowCount
  // Since rawQuery returns rows, we do a read-back check
  const rows = await rawQuery(
    `SELECT id FROM scheduled_jobs WHERE id = ? AND locked_by = ? AND status = 'running'`,
    [jobId, INSTANCE_ID]
  );

  return rows.length > 0;
}

/**
 * Release lock and update next run time
 */
async function releaseLock(jobId: string, runStatus: RunStatus): Promise<void> {
  const now = new Date();
  const job = await getJob(jobId);
  if (!job) return;

  const nextRunAt = computeNextRun(job.scheduleType, job.schedule, now);

  await rawQuery(
    `UPDATE scheduled_jobs
     SET status = 'active', lock_until = NULL, locked_by = NULL,
         next_run_at = ?, last_run_at = ?, last_run_status = ?, updated_at = ?
     WHERE id = ?`,
    [nextRunAt, now.toISOString(), runStatus, now.toISOString(), jobId]
  );
}

/**
 * Execute a single job
 */
async function executeJob(job: ScheduledJob): Promise<void> {
  const runId = randomUUID();
  const startedAt = new Date();

  // Create run record
  await rawQuery(
    `INSERT INTO job_runs (id, job_id, org_id, status, started_at, attempt, triggered_by, created_at)
     VALUES (?, ?, ?, 'running', ?, 1, ?, ?)`,
    [runId, job.id, job.orgId, startedAt.toISOString(), 'scheduler', startedAt.toISOString()]
  );

  try {
    const handler = JOB_TYPE_HANDLERS[job.jobType];
    if (!handler) {
      throw new Error(`No handler registered for job type: ${job.jobType}`);
    }

    // Run with timeout
    const result = await Promise.race([
      handler(job),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Job timed out after ${job.timeoutMs}ms`)), job.timeoutMs)
      ),
    ]);

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Update run as success
    await rawQuery(
      `UPDATE job_runs SET status = 'success', finished_at = ?, duration_ms = ?, result = ? WHERE id = ?`,
      [finishedAt.toISOString(), durationMs, JSON.stringify(result), runId]
    );

    await releaseLock(job.id, 'success');

    logger.info('Scheduler: job completed', { jobId: job.id, runId, durationMs, jobType: job.jobType });
  } catch (error: any) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const errorMsg = error?.message || String(error);

    // Update run as failure
    await rawQuery(
      `UPDATE job_runs SET status = 'failure', finished_at = ?, duration_ms = ?, error = ? WHERE id = ?`,
      [finishedAt.toISOString(), durationMs, errorMsg, runId]
    );

    await releaseLock(job.id, 'failure');

    logger.error('Scheduler: job failed', { jobId: job.id, runId, error: errorMsg, jobType: job.jobType });
  }
}

// ============================================================================
// Polling Loop
// ============================================================================

let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
const DEFAULT_POLL_INTERVAL_MS = 15000; // 15 seconds

/**
 * Single poll cycle: find due jobs and execute them
 */
async function pollOnce(): Promise<number> {
  if (isPolling) return 0;
  isPolling = true;

  try {
    await ensureTables();

    const now = new Date().toISOString();

    // Find jobs that are due and not locked
    const dueJobs = await rawQuery(
      `SELECT * FROM scheduled_jobs
       WHERE status = 'active'
         AND next_run_at <= ?
         AND (lock_until IS NULL OR lock_until < ?)
       ORDER BY next_run_at ASC
       LIMIT 10`,
      [now, now]
    );

    let executed = 0;

    for (const row of dueJobs) {
      const job = mapJobRow(row);

      // Try to acquire lock
      const locked = await acquireLock(job.id, job.timeoutMs);
      if (!locked) {
        logger.debug('Scheduler: could not acquire lock, skipping', { jobId: job.id });
        continue;
      }

      // Execute asynchronously (don't block the poll loop)
      executeJob(job).catch(err => {
        logger.error('Scheduler: unhandled error in job execution', { jobId: job.id, error: (err as Error).message });
      });

      executed++;
    }

    if (executed > 0) {
      logger.debug(`Scheduler: picked up ${executed} job(s) this cycle`);
    }

    return executed;
  } catch (error: any) {
    logger.error('Scheduler: poll error', { error: error.message });
    return 0;
  } finally {
    isPolling = false;
  }
}

/**
 * Recover stale locks (jobs stuck in 'running' with expired lockUntil)
 */
async function recoverStaleLocks(): Promise<void> {
  await ensureTables();
  const now = new Date().toISOString();

  const staleRows = await rawQuery(
    `SELECT id, name FROM scheduled_jobs WHERE status = 'running' AND lock_until < ?`,
    [now]
  );

  for (const row of staleRows) {
    await rawQuery(
      `UPDATE scheduled_jobs SET status = 'active', lock_until = NULL, locked_by = NULL, updated_at = ? WHERE id = ?`,
      [now, row.id]
    );
    logger.warn('Scheduler: recovered stale lock', { jobId: row.id, name: row.name });
  }
}

// ============================================================================
// Start / Stop
// ============================================================================

/**
 * Start the scheduler polling loop
 */
export async function start(pollIntervalMs?: number): Promise<void> {
  if (pollTimer) {
    logger.warn('Scheduler: already running');
    return;
  }

  await ensureTables();
  registerBuiltinHandlers();

  // Recover any stale locks from previous crashes
  await recoverStaleLocks();

  const interval = pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;

  // Run first poll immediately
  await pollOnce();

  pollTimer = setInterval(async () => {
    await pollOnce();
  }, interval);

  // Periodic stale lock recovery every 5 minutes
  setInterval(async () => {
    await recoverStaleLocks();
  }, 300000);

  logger.info(`Scheduler: started with ${interval}ms poll interval (instance=${INSTANCE_ID})`);
}

/**
 * Stop the scheduler polling loop
 */
export function stop(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('Scheduler: stopped');
  }
}

/**
 * Check whether the scheduler is currently running
 */
export function isRunning(): boolean {
  return pollTimer !== null;
}

/**
 * Force a single poll cycle (useful for testing)
 */
export async function triggerPoll(): Promise<number> {
  return pollOnce();
}

/**
 * Manually trigger a job by ID (bypasses schedule, runs immediately)
 */
export async function triggerJob(jobId: string, triggeredBy: string = 'manual'): Promise<JobRun> {
  await ensureTables();

  const rows = await rawQuery(`SELECT * FROM scheduled_jobs WHERE id = ? AND status != 'deleted'`, [jobId]);
  if (rows.length === 0) throw new Error(`Job not found: ${jobId}`);

  const job = mapJobRow(rows[0]);
  const runId = randomUUID();
  const startedAt = new Date();

  await rawQuery(
    `INSERT INTO job_runs (id, job_id, org_id, status, started_at, attempt, triggered_by, created_at)
     VALUES (?, ?, ?, 'running', ?, 1, ?, ?)`,
    [runId, job.id, job.orgId, startedAt.toISOString(), triggeredBy, startedAt.toISOString()]
  );

  try {
    const handler = JOB_TYPE_HANDLERS[job.jobType];
    if (!handler) throw new Error(`No handler registered for job type: ${job.jobType}`);

    const result = await handler(job);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await rawQuery(
      `UPDATE job_runs SET status = 'success', finished_at = ?, duration_ms = ?, result = ? WHERE id = ?`,
      [finishedAt.toISOString(), durationMs, JSON.stringify(result), runId]
    );

    await rawQuery(
      `UPDATE scheduled_jobs SET last_run_at = ?, last_run_status = 'success', updated_at = ? WHERE id = ?`,
      [finishedAt.toISOString(), finishedAt.toISOString(), job.id]
    );

    const runRows = await rawQuery(`SELECT * FROM job_runs WHERE id = ?`, [runId]);
    return mapRunRow(runRows[0]);
  } catch (error: any) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await rawQuery(
      `UPDATE job_runs SET status = 'failure', finished_at = ?, duration_ms = ?, error = ? WHERE id = ?`,
      [finishedAt.toISOString(), durationMs, error.message, runId]
    );

    await rawQuery(
      `UPDATE scheduled_jobs SET last_run_at = ?, last_run_status = 'failure', updated_at = ? WHERE id = ?`,
      [finishedAt.toISOString(), finishedAt.toISOString(), job.id]
    );

    const runRows = await rawQuery(`SELECT * FROM job_runs WHERE id = ?`, [runId]);
    return mapRunRow(runRows[0]);
  }
}
