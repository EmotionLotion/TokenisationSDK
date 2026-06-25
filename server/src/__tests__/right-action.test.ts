/**
 * T6a — Right Action core conformance.
 * Covers: idempotency on mutating kinds, VERIFY_ACCESS read-like (no key),
 * kind-specific validation, invalid transitions, tenant isolation, audit emission,
 * and each kind (REDEEM/CONSUME/REVOKE/EXPIRE/VERIFY_ACCESS).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { db, schema } from '../config/database.js';
import * as auditService from '../services/audit.service.js';
import {
  createAction,
  transition,
  getAction,
  listActions,
  isValidTransition,
  RightActionErrorCode,
} from '../services/right-action.service.js';

vi.mock('../middleware/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { orgs } = schema;
let counter = 0;
async function seedOrg(): Promise<string> {
  const n = ++counter;
  const [org] = await db.insert(orgs).values({ name: `Org ${n}`, slug: `org-ra-${Date.now()}-${n}` }).returning();
  return org.id as string;
}

const base = {
  rightProfileId: 'loyalty-points',
  subjectType: 'user' as const,
  subjectId: 'user-1',
};

describe('RightAction core (T6a)', () => {
  let orgId: string;
  beforeAll(async () => { orgId = await seedOrg(); });

  it('CONSUME: mutating happy path persists, completes, records quantity + audit entry', async () => {
    const r = await createAction(orgId, { ...base, kind: 'CONSUME', quantity: '100', unit: 'points' }, { idempotencyKey: 'k-consume-1' });
    expect(r.id).toMatch(/^ra_/);
    expect(r.kind).toBe('CONSUME');
    expect(r.status).toBe('COMPLETED');
    expect(r.quantity).toBe('100');
    expect(r.auditEntryId).toBeTruthy();
    expect(r.completedAt).toBeTruthy();
    // audit event actually written + correct action
    const entry = await auditService.getAuditLogEntry(r.auditEntryId!, orgId);
    expect(entry.action).toBe('right.consume.completed');
    expect(entry.resourceId).toBe(r.id);
  });

  it('idempotent replay: same (org, key) returns the same receipt', async () => {
    const a = await createAction(orgId, { ...base, kind: 'CONSUME', quantity: '5', unit: 'points' }, { idempotencyKey: 'k-rep' });
    const b = await createAction(orgId, { ...base, kind: 'CONSUME', quantity: '5', unit: 'points' }, { idempotencyKey: 'k-rep' });
    expect(b.id).toBe(a.id);
  });

  it('mutating kind without an Idempotency-Key is rejected', async () => {
    await expect(createAction(orgId, { ...base, kind: 'CONSUME', quantity: '1' })).rejects.toThrow(
      RightActionErrorCode.IDEMPOTENCY_KEY_REQUIRED,
    );
  });

  it('VERIFY_ACCESS is read-like: no idempotency key required, no audit entry', async () => {
    const r = await createAction(orgId, { ...base, kind: 'VERIFY_ACCESS' });
    expect(r.status).toBe('COMPLETED');
    expect(r.idempotencyKey).toBeNull();
    expect(r.auditEntryId).toBeNull();
  });

  it('CONSUME without a valid quantity is rejected', async () => {
    await expect(createAction(orgId, { ...base, kind: 'CONSUME' }, { idempotencyKey: 'k-bad' })).rejects.toThrow(
      RightActionErrorCode.INVALID_QUANTITY,
    );
    await expect(createAction(orgId, { ...base, kind: 'CONSUME', quantity: '0' }, { idempotencyKey: 'k-bad0' })).rejects.toThrow(
      RightActionErrorCode.INVALID_QUANTITY,
    );
  });

  it('REDEEM / REVOKE / EXPIRE settle correctly (EXPIRE -> EXPIRED, others -> COMPLETED)', async () => {
    const redeem = await createAction(orgId, { ...base, kind: 'REDEEM', quantity: '10' }, { idempotencyKey: 'k-redeem' });
    expect(redeem.status).toBe('COMPLETED');
    const revoke = await createAction(orgId, { ...base, kind: 'REVOKE', reason: 'fraud' }, { idempotencyKey: 'k-revoke' });
    expect(revoke.status).toBe('COMPLETED');
    const expire = await createAction(orgId, { ...base, kind: 'EXPIRE' }, { idempotencyKey: 'k-expire' });
    expect(expire.status).toBe('EXPIRED');
    expect(expire.completedAt).toBeTruthy();
  });

  it('invalid transitions are rejected (state machine)', async () => {
    expect(isValidTransition('REQUESTED', 'COMPLETED')).toBe(false); // cannot skip
    expect(isValidTransition('AUTHORIZED', 'EXECUTING')).toBe(true);
    expect(isValidTransition('EXECUTING', 'COMPLETED')).toBe(true);
    // a completed action is terminal — explicit transition must fail
    const r = await createAction(orgId, { ...base, kind: 'REDEEM' }, { idempotencyKey: 'k-term' });
    await expect(transition(orgId, r.id, 'EXECUTING')).rejects.toThrow(RightActionErrorCode.INVALID_TRANSITION);
  });

  it('tenant isolation: another org cannot read the action', async () => {
    const r = await createAction(orgId, { ...base, kind: 'REDEEM' }, { idempotencyKey: 'k-iso' });
    await expect(getAction('some-other-org', r.id)).rejects.toThrow(RightActionErrorCode.RIGHT_ACTION_NOT_FOUND);
    const mine = await getAction(orgId, r.id);
    expect(mine.id).toBe(r.id);
  });

  it('listActions is org-scoped and filterable', async () => {
    const all = await listActions(orgId, {});
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((a) => a.orgId === orgId)).toBe(true);
    const consumes = await listActions(orgId, { kind: 'CONSUME' });
    expect(consumes.every((a) => a.kind === 'CONSUME')).toBe(true);
  });
});
