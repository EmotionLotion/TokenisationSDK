/**
 * Right Action Service (T6a) — the unified, server-persisted, audited primitive for
 * REDEEM | CONSUME | REVOKE | EXPIRE | VERIFY_ACCESS over any RightProfile.
 *
 * Design: harness/redemption_consumption_primitive.md. This is the CORE only:
 *  - persistence (right_actions, lazily ensured — matches the theme/accreditation service pattern)
 *  - kind-specific request validation
 *  - status transition validation (REQUESTED -> AUTHORIZED -> EXECUTING -> COMPLETED|FAILED|EXPIRED|REJECTED)
 *  - service-level idempotency for mutating kinds
 *  - hash-chained audit entry for mutating actions
 *  - org/tenant scoping on every read/write
 *
 * NOT in T6a: HTTP routes (T6b), SDK surface (T6c), loyalty migration (T9),
 * securities migration (T10), balance ledger (module-owned, T9), policy gating (T7),
 * metadata-registry validation (T8).
 */
import { randomUUID } from 'crypto';
import { rawQuery } from '../config/database.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';

// ── Kinds & statuses ────────────────────────────────────────────────────────
export const RIGHT_ACTION_KINDS = ['REDEEM', 'CONSUME', 'REVOKE', 'EXPIRE', 'VERIFY_ACCESS'] as const;
export type RightActionKind = (typeof RIGHT_ACTION_KINDS)[number];

/** Kinds that mutate a right's state — require an Idempotency-Key. VERIFY_ACCESS is read-like. */
export const MUTATING_KINDS: ReadonlySet<RightActionKind> = new Set(['REDEEM', 'CONSUME', 'REVOKE', 'EXPIRE']);

export const RIGHT_ACTION_STATUSES = [
  'REQUESTED', 'AUTHORIZED', 'EXECUTING', 'COMPLETED', 'REJECTED', 'FAILED', 'EXPIRED',
] as const;
export type RightActionStatus = (typeof RIGHT_ACTION_STATUSES)[number];

const TERMINAL: ReadonlySet<RightActionStatus> = new Set(['COMPLETED', 'REJECTED', 'FAILED', 'EXPIRED']);

const TRANSITIONS: Record<RightActionStatus, RightActionStatus[]> = {
  REQUESTED: ['AUTHORIZED', 'REJECTED'],
  AUTHORIZED: ['EXECUTING', 'REJECTED'],
  EXECUTING: ['COMPLETED', 'FAILED', 'EXPIRED'],
  COMPLETED: [],
  REJECTED: [],
  FAILED: [],
  EXPIRED: [],
};

export function isValidTransition(from: RightActionStatus, to: RightActionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Error codes (typed messages; unified error model lands in T3) ────────────
export const RightActionErrorCode = {
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  INVALID_KIND: 'INVALID_KIND',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  RIGHT_ACTION_NOT_FOUND: 'RIGHT_ACTION_NOT_FOUND',
} as const;

// ── Request / receipt ───────────────────────────────────────────────────────
export interface RightActionRequest {
  kind: RightActionKind;
  rightProfileId: string;
  subjectType: 'party' | 'investor' | 'user' | 'agent';
  subjectId: string;
  assetId?: string;
  tokenId?: string;
  quantity?: string; // integer string; required for CONSUME
  unit?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface RightActionReceipt {
  id: string;
  orgId: string;
  kind: RightActionKind;
  status: RightActionStatus;
  rightProfileId: string;
  assetId: string | null;
  tokenId: string | null;
  subjectType: string;
  subjectId: string;
  quantity: string | null;
  unit: string | null;
  reason: string | null;
  idempotencyKey: string | null;
  auditEntryId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

let tableInitialised = false;
async function ensureTable(): Promise<void> {
  if (tableInitialised) return;
  await rawQuery(`
    CREATE TABLE IF NOT EXISTS right_actions (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL,
      kind            TEXT NOT NULL,
      status          TEXT NOT NULL,
      right_profile_id TEXT NOT NULL,
      asset_id        TEXT,
      token_id        TEXT,
      subject_type    TEXT NOT NULL,
      subject_id      TEXT NOT NULL,
      quantity        TEXT,
      unit            TEXT,
      reason          TEXT,
      idempotency_key TEXT,
      audit_entry_id  TEXT,
      metadata        TEXT DEFAULT '{}',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL,
      completed_at    TEXT
    )
  `);
  // Idempotency uniqueness per org (NULL keys allowed for read-like VERIFY_ACCESS).
  await rawQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_right_actions_org_idem
    ON right_actions (org_id, idempotency_key)
  `);
  tableInitialised = true;
}

function rowToReceipt(r: any): RightActionReceipt {
  return {
    id: r.id, orgId: r.org_id, kind: r.kind, status: r.status,
    rightProfileId: r.right_profile_id, assetId: r.asset_id ?? null, tokenId: r.token_id ?? null,
    subjectType: r.subject_type, subjectId: r.subject_id,
    quantity: r.quantity ?? null, unit: r.unit ?? null, reason: r.reason ?? null,
    idempotencyKey: r.idempotency_key ?? null, auditEntryId: r.audit_entry_id ?? null,
    metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata ?? {}),
    createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at ?? null,
  };
}

function validateRequest(req: RightActionRequest): void {
  if (!RIGHT_ACTION_KINDS.includes(req.kind)) {
    throw new ValidationError(`${RightActionErrorCode.INVALID_KIND}: unknown kind '${req.kind}'`);
  }
  if (!req.rightProfileId || !req.subjectId || !req.subjectType) {
    throw new ValidationError('right action requires rightProfileId, subjectType, subjectId');
  }
  if (req.kind === 'CONSUME') {
    if (!req.quantity || !/^\d+$/.test(req.quantity) || BigInt(req.quantity) <= 0n) {
      throw new ValidationError(`${RightActionErrorCode.INVALID_QUANTITY}: CONSUME requires a positive integer quantity`);
    }
  }
}

export interface CreateActionOptions {
  idempotencyKey?: string;
  actorId?: string;
  actorType?: 'user' | 'api_key' | 'system' | 'webhook';
}

/** The final status a kind settles at on the happy path. */
function finalStatusFor(kind: RightActionKind): RightActionStatus {
  return kind === 'EXPIRE' ? 'EXPIRED' : 'COMPLETED';
}

/**
 * Create and execute a right action (happy path drives REQUESTED -> AUTHORIZED ->
 * EXECUTING -> final, validating each transition). Mutating kinds require an
 * idempotency key and emit an audit entry; replays return the prior receipt.
 */
export async function createAction(
  orgId: string,
  req: RightActionRequest,
  opts: CreateActionOptions = {},
): Promise<RightActionReceipt> {
  await ensureTable();
  validateRequest(req);

  const mutating = MUTATING_KINDS.has(req.kind);
  if (mutating && !opts.idempotencyKey) {
    throw new ValidationError(`${RightActionErrorCode.IDEMPOTENCY_KEY_REQUIRED}: ${req.kind} requires an Idempotency-Key`);
  }

  // Idempotent replay (mutating kinds): same (org, key) -> return existing receipt.
  if (mutating && opts.idempotencyKey) {
    const existing = await rawQuery(
      `SELECT * FROM right_actions WHERE org_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [orgId, opts.idempotencyKey],
    );
    if (existing.length) return rowToReceipt(existing[0]);
  }

  const id = `ra_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();
  const finalStatus = finalStatusFor(req.kind);

  // Insert at REQUESTED, then walk the validated transition path to the final status.
  await rawQuery(
    `INSERT INTO right_actions
      (id, org_id, kind, status, right_profile_id, asset_id, token_id, subject_type, subject_id,
       quantity, unit, reason, idempotency_key, metadata, created_at, updated_at)
     VALUES ($1,$2,$3,'REQUESTED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      id, orgId, req.kind, req.rightProfileId, req.assetId ?? null, req.tokenId ?? null,
      req.subjectType, req.subjectId, req.quantity ?? null, req.unit ?? null, req.reason ?? null,
      mutating ? opts.idempotencyKey ?? null : null, JSON.stringify(req.metadata ?? {}), now, now,
    ],
  );

  const path: RightActionStatus[] = ['AUTHORIZED', 'EXECUTING', finalStatus];
  let from: RightActionStatus = 'REQUESTED';
  for (const to of path) {
    if (!isValidTransition(from, to)) {
      throw new ValidationError(`${RightActionErrorCode.INVALID_TRANSITION}: ${from} -> ${to}`);
    }
    from = to;
  }

  let auditEntryId: string | null = null;
  if (mutating) {
    const entry = await auditService.log({
      orgId,
      actorId: opts.actorId ?? 'system',
      actorType: opts.actorType ?? 'system',
      action: `right.${req.kind.toLowerCase()}.${finalStatus.toLowerCase()}`,
      resourceType: 'right_action',
      resourceId: id,
      description: `Right action ${req.kind} ${finalStatus} for ${req.subjectType}:${req.subjectId}`,
      metadata: { rightProfileId: req.rightProfileId, quantity: req.quantity, unit: req.unit },
    });
    auditEntryId = entry.id;
  }

  const doneAt = new Date().toISOString();
  await rawQuery(
    `UPDATE right_actions SET status = $1, audit_entry_id = $2, updated_at = $3, completed_at = $4
     WHERE id = $5 AND org_id = $6`,
    [finalStatus, auditEntryId, doneAt, doneAt, id, orgId],
  );

  const rows = await rawQuery(`SELECT * FROM right_actions WHERE id = $1 AND org_id = $2`, [id, orgId]);
  return rowToReceipt(rows[0]);
}

/** Explicit transition (for multi-step module pipelines, e.g. securities burn+payout). */
export async function transition(
  orgId: string,
  id: string,
  to: RightActionStatus,
): Promise<RightActionReceipt> {
  await ensureTable();
  const current = await getAction(orgId, id); // org-scoped; throws if not found / other org
  if (TERMINAL.has(current.status)) {
    throw new ValidationError(`${RightActionErrorCode.INVALID_TRANSITION}: ${current.status} is terminal`);
  }
  if (!isValidTransition(current.status, to)) {
    throw new ValidationError(`${RightActionErrorCode.INVALID_TRANSITION}: ${current.status} -> ${to}`);
  }
  const now = new Date().toISOString();
  await rawQuery(
    `UPDATE right_actions SET status = $1, updated_at = $2, completed_at = $3 WHERE id = $4 AND org_id = $5`,
    [to, now, TERMINAL.has(to) ? now : null, id, orgId],
  );
  return (await getAction(orgId, id));
}

/** Look up a prior action by idempotency key (ensures the table). Null if none. */
export async function findByIdempotencyKey(orgId: string, idempotencyKey: string): Promise<RightActionReceipt | null> {
  await ensureTable();
  const rows = await rawQuery(
    `SELECT * FROM right_actions WHERE org_id = $1 AND idempotency_key = $2 LIMIT 1`,
    [orgId, idempotencyKey],
  );
  return rows.length ? rowToReceipt(rows[0]) : null;
}

/** Org-scoped fetch (tenant isolation: another org's id is not found). */
export async function getAction(orgId: string, id: string): Promise<RightActionReceipt> {
  await ensureTable();
  const rows = await rawQuery(`SELECT * FROM right_actions WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
  if (!rows.length) throw new NotFoundError(`${RightActionErrorCode.RIGHT_ACTION_NOT_FOUND}: ${id}`);
  return rowToReceipt(rows[0]);
}

export async function listActions(
  orgId: string,
  filters: { kind?: RightActionKind; subjectId?: string; status?: RightActionStatus } = {},
): Promise<RightActionReceipt[]> {
  await ensureTable();
  const conds = ['org_id = $1'];
  const params: any[] = [orgId];
  if (filters.kind) { params.push(filters.kind); conds.push(`kind = $${params.length}`); }
  if (filters.subjectId) { params.push(filters.subjectId); conds.push(`subject_id = $${params.length}`); }
  if (filters.status) { params.push(filters.status); conds.push(`status = $${params.length}`); }
  const rows = await rawQuery(
    `SELECT * FROM right_actions WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );
  return rows.map(rowToReceipt);
}
