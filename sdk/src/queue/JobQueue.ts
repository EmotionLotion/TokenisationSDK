/**
 * Job Queue Abstraction
 *
 * Provides a Bull-compatible interface for distributed task processing.
 * Supports:
 * - Scheduled jobs (cron, delayed)
 * - Job priorities
 * - Retry with exponential backoff
 * - Dead letter queue
 * - Job events and progress tracking
 * - Concurrency control
 *
 * Can be backed by:
 * - Memory (for testing/development)
 * - Redis (for production via Bull/BullMQ)
 * - Custom storage adapters
 */

import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export enum JobStatus {
  WAITING = 'WAITING',
  DELAYED = 'DELAYED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  STUCK = 'STUCK',
  PAUSED = 'PAUSED',
}

export enum JobPriority {
  LOW = 10,
  NORMAL = 5,
  HIGH = 2,
  CRITICAL = 1,
}

export interface JobOptions {
  /** Job priority (lower = higher priority) */
  priority?: number;
  /** Delay before processing (ms) */
  delay?: number;
  /** Number of retry attempts */
  attempts?: number;
  /** Backoff strategy */
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  /** Remove job when completed */
  removeOnComplete?: boolean | number;
  /** Remove job when failed */
  removeOnFail?: boolean | number;
  /** Job timeout (ms) */
  timeout?: number;
  /** Unique job ID (for deduplication) */
  jobId?: string;
  /** Repeat options (cron scheduling) */
  repeat?: {
    cron?: string;
    every?: number;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  };
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  progress: number;
  delay: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  returnvalue?: unknown;
  opts: JobOptions;
}

export interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export type JobProcessor<T, R> = (job: Job<T>) => Promise<R>;

export interface QueueOptions {
  /** Default job options */
  defaultJobOptions?: Partial<JobOptions>;
  /** Max concurrent jobs */
  concurrency?: number;
  /** Rate limiting */
  limiter?: {
    max: number;
    duration: number;
  };
  /** Enable metrics collection */
  metrics?: boolean;
}

export interface IJobStore {
  /** Add a job */
  add(job: Job): Promise<void>;
  /** Get a job by ID */
  get(jobId: string): Promise<Job | null>;
  /** Update a job */
  update(job: Job): Promise<void>;
  /** Remove a job */
  remove(jobId: string): Promise<void>;
  /** Get jobs by status */
  getByStatus(status: JobStatus, limit?: number): Promise<Job[]>;
  /** Get next waiting job (with locking) */
  getNext(queueName: string): Promise<Job | null>;
  /** Release lock on a job */
  unlock(jobId: string): Promise<void>;
  /** Move job to dead letter */
  moveToDead(job: Job): Promise<void>;
  /** Get job counts */
  getCounts(queueName: string): Promise<JobCounts>;
  /** Clean old jobs */
  clean(queueName: string, gracePeriod: number, status: JobStatus): Promise<number>;
}

// ============================================================================
// MEMORY JOB STORE
// ============================================================================

export class MemoryJobStore implements IJobStore {
  private jobs: Map<string, Job> = new Map();
  private deadLetterJobs: Map<string, Job> = new Map();
  private locks: Set<string> = new Set();

  async add(job: Job): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async get(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) || this.deadLetterJobs.get(jobId) || null;
  }

  async update(job: Job): Promise<void> {
    if (this.jobs.has(job.id)) {
      this.jobs.set(job.id, { ...job });
    }
  }

  async remove(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
    this.locks.delete(jobId);
  }

  async getByStatus(status: JobStatus, limit?: number): Promise<Job[]> {
    const jobs = Array.from(this.jobs.values())
      .filter(j => j.status === status)
      .sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);

    return limit ? jobs.slice(0, limit) : jobs;
  }

  async getNext(queueName: string): Promise<Job | null> {
    const now = Date.now();

    // Find next job that's waiting and not locked
    const jobs = Array.from(this.jobs.values())
      .filter(j =>
        j.name.startsWith(queueName) &&
        (j.status === JobStatus.WAITING || j.status === JobStatus.DELAYED) &&
        !this.locks.has(j.id) &&
        (j.status !== JobStatus.DELAYED || j.timestamp + j.delay <= now)
      )
      .sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);

    if (jobs.length === 0) return null;

    const job = jobs[0];
    this.locks.add(job.id);
    return job;
  }

  async moveToDead(job: Job): Promise<void> {
    this.jobs.delete(job.id);
    this.deadLetterJobs.set(job.id, { ...job, status: JobStatus.FAILED });
    this.locks.delete(job.id);
  }

  async getCounts(queueName: string): Promise<JobCounts> {
    const jobs = Array.from(this.jobs.values()).filter(j => j.name.startsWith(queueName));

    return {
      waiting: jobs.filter(j => j.status === JobStatus.WAITING).length,
      active: jobs.filter(j => j.status === JobStatus.ACTIVE).length,
      completed: jobs.filter(j => j.status === JobStatus.COMPLETED).length,
      failed: jobs.filter(j => j.status === JobStatus.FAILED).length,
      delayed: jobs.filter(j => j.status === JobStatus.DELAYED).length,
      paused: jobs.filter(j => j.status === JobStatus.PAUSED).length,
    };
  }

  async clean(queueName: string, gracePeriod: number, status: JobStatus): Promise<number> {
    const cutoff = Date.now() - gracePeriod;
    let cleaned = 0;

    for (const [id, job] of this.jobs) {
      if (
        job.name.startsWith(queueName) &&
        job.status === status &&
        (job.finishedOn || job.timestamp) < cutoff
      ) {
        this.jobs.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  async unlock(jobId: string): Promise<void> {
    this.locks.delete(jobId);
  }

  getDeadLetterJobs(): Job[] {
    return Array.from(this.deadLetterJobs.values());
  }
}

// ============================================================================
// JOB QUEUE
// ============================================================================

export class JobQueue<T = unknown, R = unknown> extends EventEmitter {
  readonly name: string;
  private store: IJobStore;
  private options: QueueOptions;
  private processor?: JobProcessor<T, R>;
  private isProcessing = false;
  private isPaused = false;
  private processingInterval?: NodeJS.Timeout;
  private activeJobs: Map<string, Job<T>> = new Map();
  private repeatJobs: Map<string, { job: Job<T>; lastRun?: number }> = new Map();

  constructor(name: string, store?: IJobStore, options?: QueueOptions) {
    super();
    this.name = name;
    this.store = store ?? new MemoryJobStore();
    this.options = {
      concurrency: 1,
      metrics: true,
      ...options,
    };
  }

  // ============================================================================
  // JOB MANAGEMENT
  // ============================================================================

  /**
   * Add a job to the queue
   */
  async add(jobName: string, data: T, opts?: JobOptions): Promise<Job<T>> {
    const options = { ...this.options.defaultJobOptions, ...opts };

    // Check for duplicate job ID
    if (options.jobId) {
      const existing = await this.store.get(options.jobId);
      if (existing && existing.status !== JobStatus.COMPLETED && existing.status !== JobStatus.FAILED) {
        throw new Error(`Job with ID ${options.jobId} already exists`);
      }
    }

    const job: Job<T> = {
      id: options.jobId || uuidv4(),
      name: `${this.name}:${jobName}`,
      data,
      status: options.delay ? JobStatus.DELAYED : JobStatus.WAITING,
      priority: options.priority ?? JobPriority.NORMAL,
      attempts: 0,
      maxAttempts: options.attempts ?? 3,
      progress: 0,
      delay: options.delay ?? 0,
      timestamp: Date.now(),
      opts: options,
    };

    await this.store.add(job);

    this.emit('added', job);

    // Handle repeatable jobs
    if (options.repeat) {
      this.repeatJobs.set(job.id, { job });
    }

    return job;
  }

  /**
   * Add a bulk of jobs
   */
  async addBulk(jobs: Array<{ name: string; data: T; opts?: JobOptions }>): Promise<Job<T>[]> {
    const results: Job<T>[] = [];
    for (const jobDef of jobs) {
      const job = await this.add(jobDef.name, jobDef.data, jobDef.opts);
      results.push(job);
    }
    return results;
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<Job<T> | null> {
    return this.store.get(jobId) as Promise<Job<T> | null>;
  }

  /**
   * Remove a job
   */
  async removeJob(jobId: string): Promise<void> {
    await this.store.remove(jobId);
    this.repeatJobs.delete(jobId);
    this.emit('removed', jobId);
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, progress: number): Promise<void> {
    const job = await this.store.get(jobId);
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
      await this.store.update(job);
      this.emit('progress', job, progress);
    }
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<Job<T> | null> {
    const job = await this.store.get(jobId) as Job<T> | null;
    if (!job || job.status !== JobStatus.FAILED) {
      return null;
    }

    job.status = JobStatus.WAITING;
    job.attempts = 0;
    job.failedReason = undefined;
    job.finishedOn = undefined;
    job.processedOn = undefined;

    await this.store.update(job);
    this.emit('retried', job);

    return job;
  }

  // ============================================================================
  // QUEUE PROCESSING
  // ============================================================================

  /**
   * Define the job processor
   */
  process(processor: JobProcessor<T, R>): void {
    this.processor = processor;
  }

  /**
   * Start processing jobs
   */
  start(pollInterval = 1000): void {
    if (this.isProcessing) return;
    if (!this.processor) {
      throw new Error('No processor defined. Call process() first.');
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(() => this.tick(), pollInterval);
    this.emit('started');
  }

  /**
   * Stop processing jobs
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.isProcessing = false;
    this.emit('stopped');
  }

  /**
   * Pause the queue
   */
  async pause(): Promise<void> {
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * Resume the queue
   */
  async resume(): Promise<void> {
    this.isPaused = false;
    this.emit('resumed');
  }

  /**
   * Process one tick
   */
  private async tick(): Promise<void> {
    if (!this.isProcessing || !this.processor || this.isPaused) return;
    if (this.activeJobs.size >= (this.options.concurrency || 1)) return;

    // Check for repeatable jobs
    await this.scheduleRepeatableJobs();

    // Get next job
    const job = await this.store.getNext(this.name) as Job<T> | null;
    if (!job) return;

    // Process the job
    this.processJob(job);
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job<T>): Promise<void> {
    this.activeJobs.set(job.id, job);

    job.status = JobStatus.ACTIVE;
    job.processedOn = Date.now();
    job.attempts++;
    await this.store.update(job);

    this.emit('active', job);

    try {
      // Set timeout if configured
      const timeoutMs = job.opts.timeout || 0;
      let result: R;

      if (timeoutMs > 0) {
        result = await Promise.race([
          this.processor!(job),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Job timed out')), timeoutMs)
          ),
        ]);
      } else {
        result = await this.processor!(job);
      }

      // Job completed
      job.status = JobStatus.COMPLETED;
      job.finishedOn = Date.now();
      job.returnvalue = result;
      job.progress = 100;
      await this.store.update(job);

      this.emit('completed', job, result);

      // Handle removeOnComplete
      if (job.opts.removeOnComplete === true) {
        await this.store.remove(job.id);
      } else if (typeof job.opts.removeOnComplete === 'number') {
        setTimeout(() => this.store.remove(job.id), job.opts.removeOnComplete);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if should retry
      if (job.attempts < job.maxAttempts) {
        // Calculate backoff delay
        let retryDelay = 0;
        if (job.opts.backoff) {
          if (job.opts.backoff.type === 'exponential') {
            retryDelay = job.opts.backoff.delay * Math.pow(2, job.attempts - 1);
          } else {
            retryDelay = job.opts.backoff.delay;
          }
        }

        job.status = retryDelay > 0 ? JobStatus.DELAYED : JobStatus.WAITING;
        job.delay = retryDelay;
        job.timestamp = Date.now();
        job.failedReason = errorMessage;
        await this.store.update(job);

        this.emit('failed', job, new Error(errorMessage));
        this.emit('retrying', job, job.attempts);

      } else {
        // Move to dead letter queue
        job.status = JobStatus.FAILED;
        job.finishedOn = Date.now();
        job.failedReason = errorMessage;

        await this.store.moveToDead(job);

        this.emit('failed', job, new Error(errorMessage));
        this.emit('dead', job);

        // Handle removeOnFail
        if (job.opts.removeOnFail === true) {
          await this.store.remove(job.id);
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
      await this.store.unlock(job.id);
    }
  }

  /**
   * Schedule repeatable jobs
   */
  private async scheduleRepeatableJobs(): Promise<void> {
    const now = Date.now();

    for (const [id, repeatInfo] of this.repeatJobs) {
      const { job, lastRun } = repeatInfo;
      const repeat = job.opts.repeat;

      if (!repeat) continue;

      // Check end date
      if (repeat.endDate && now > repeat.endDate.getTime()) {
        this.repeatJobs.delete(id);
        continue;
      }

      // Check if should run
      let shouldRun = false;
      let nextDelay = 0;

      if (repeat.every) {
        if (!lastRun || now - lastRun >= repeat.every) {
          shouldRun = true;
          nextDelay = repeat.every;
        }
      } else if (repeat.cron) {
        // Simplified cron check - in production use node-cron or similar
        shouldRun = this.shouldRunCron(repeat.cron, lastRun);
      }

      if (shouldRun) {
        // Check limit
        const existingCount = (await this.store.getByStatus(JobStatus.COMPLETED))
          .filter(j => j.name === job.name).length;

        if (repeat.limit && existingCount >= repeat.limit) {
          this.repeatJobs.delete(id);
          continue;
        }

        // Create new job instance
        await this.add(job.name.replace(`${this.name}:`, ''), job.data, {
          ...job.opts,
          repeat: undefined, // Don't repeat the repeat
          jobId: `${id}-${now}`,
        });

        repeatInfo.lastRun = now;
      }
    }
  }

  private shouldRunCron(cron: string, lastRun?: number): boolean {
    // Simplified cron check for common patterns
    // In production, use a proper cron parser
    const now = new Date();

    if (cron === '* * * * *') {
      // Every minute
      return !lastRun || now.getTime() - lastRun >= 60000;
    }
    if (cron === '0 * * * *') {
      // Every hour
      return !lastRun || now.getTime() - lastRun >= 3600000;
    }
    if (cron === '0 0 * * *') {
      // Every day at midnight
      return !lastRun || now.getTime() - lastRun >= 86400000;
    }

    // Default: run if never run
    return !lastRun;
  }

  // ============================================================================
  // QUEUE MANAGEMENT
  // ============================================================================

  /**
   * Get job counts
   */
  async getJobCounts(): Promise<JobCounts> {
    return this.store.getCounts(this.name);
  }

  /**
   * Get waiting jobs
   */
  async getWaiting(limit?: number): Promise<Job<T>[]> {
    return this.store.getByStatus(JobStatus.WAITING, limit) as Promise<Job<T>[]>;
  }

  /**
   * Get active jobs
   */
  async getActive(): Promise<Job<T>[]> {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get completed jobs
   */
  async getCompleted(limit?: number): Promise<Job<T>[]> {
    return this.store.getByStatus(JobStatus.COMPLETED, limit) as Promise<Job<T>[]>;
  }

  /**
   * Get failed jobs
   */
  async getFailed(limit?: number): Promise<Job<T>[]> {
    return this.store.getByStatus(JobStatus.FAILED, limit) as Promise<Job<T>[]>;
  }

  /**
   * Get delayed jobs
   */
  async getDelayed(limit?: number): Promise<Job<T>[]> {
    return this.store.getByStatus(JobStatus.DELAYED, limit) as Promise<Job<T>[]>;
  }

  /**
   * Clean old jobs
   */
  async clean(gracePeriod: number, status: JobStatus = JobStatus.COMPLETED): Promise<number> {
    return this.store.clean(this.name, gracePeriod, status);
  }

  /**
   * Drain the queue (remove all jobs)
   */
  async drain(): Promise<void> {
    const jobs = await this.store.getByStatus(JobStatus.WAITING);
    for (const job of jobs) {
      if (job.name.startsWith(this.name)) {
        await this.store.remove(job.id);
      }
    }
    this.emit('drained');
  }

  /**
   * Close the queue
   */
  async close(): Promise<void> {
    this.stop();
    this.removeAllListeners();
  }
}

// ============================================================================
// SCHEDULED JOB MANAGER
// ============================================================================

/**
 * Manager for scheduling periodic jobs (distributions, reconciliations, etc.)
 */
export class ScheduledJobManager {
  private queues: Map<string, JobQueue> = new Map();
  private schedules: Map<string, {
    queueName: string;
    jobName: string;
    data: unknown;
    cron?: string;
    interval?: number;
    lastRun?: number;
  }> = new Map();

  /**
   * Register a queue
   */
  registerQueue<T, R>(queue: JobQueue<T, R>): void {
    this.queues.set(queue.name, queue as unknown as JobQueue);
  }

  /**
   * Schedule a recurring job
   */
  schedule(params: {
    id: string;
    queueName: string;
    jobName: string;
    data: unknown;
    cron?: string;
    interval?: number;
  }): void {
    if (!this.queues.has(params.queueName)) {
      throw new Error(`Queue ${params.queueName} not registered`);
    }

    this.schedules.set(params.id, {
      queueName: params.queueName,
      jobName: params.jobName,
      data: params.data,
      cron: params.cron,
      interval: params.interval,
    });
  }

  /**
   * Unschedule a job
   */
  unschedule(scheduleId: string): boolean {
    return this.schedules.delete(scheduleId);
  }

  /**
   * Run scheduled jobs check
   */
  async tick(): Promise<void> {
    const now = Date.now();

    for (const [id, schedule] of this.schedules) {
      let shouldRun = false;

      if (schedule.interval) {
        if (!schedule.lastRun || now - schedule.lastRun >= schedule.interval) {
          shouldRun = true;
        }
      }

      if (shouldRun) {
        const queue = this.queues.get(schedule.queueName);
        if (queue) {
          await queue.add(schedule.jobName, schedule.data, {
            jobId: `scheduled-${id}-${now}`,
          });
          schedule.lastRun = now;
        }
      }
    }
  }

  /**
   * Start the scheduler
   */
  start(pollInterval = 60000): NodeJS.Timeout {
    return setInterval(() => this.tick(), pollInterval);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a job queue with default settings
 */
export function createJobQueue<T = unknown, R = unknown>(
  name: string,
  options?: QueueOptions
): JobQueue<T, R> {
  return new JobQueue<T, R>(name, new MemoryJobStore(), options);
}

/**
 * Create a scheduled job manager
 */
export function createScheduledJobManager(): ScheduledJobManager {
  return new ScheduledJobManager();
}

// ============================================================================
// DISTRIBUTION JOB TYPES
// ============================================================================

export interface DistributionJobData {
  scheduleId: string;
  assetId: string;
  executionDate: string;
  snapshotBlockNumber?: number;
}

export interface ReconciliationJobData {
  assetId: string;
  contractAddress: string;
  chainId: number;
}

/**
 * Create a distribution job queue
 */
export function createDistributionQueue(
  options?: QueueOptions
): JobQueue<DistributionJobData, { distributionId: string }> {
  return createJobQueue<DistributionJobData, { distributionId: string }>('distributions', {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: 7 * 24 * 60 * 60 * 1000, // Keep for 7 days
    },
    ...options,
  });
}

/**
 * Create a reconciliation job queue
 */
export function createReconciliationQueue(
  options?: QueueOptions
): JobQueue<ReconciliationJobData, { reportId: string }> {
  return createJobQueue<ReconciliationJobData, { reportId: string }>('reconciliation', {
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 300000 }, // 5 min retry
      removeOnComplete: 30 * 24 * 60 * 60 * 1000, // Keep for 30 days
    },
    ...options,
  });
}
