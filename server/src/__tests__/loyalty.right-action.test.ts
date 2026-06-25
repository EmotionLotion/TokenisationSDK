/**
 * T9b — Loyalty on the Right Action primitive.
 * Proves loyalty redeem/consume/revoke flow through RightActionService (audited,
 * idempotent) over the EXISTING loyalty_accounts ledger — no parallel ledger.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { db, schema } from '../config/database.js';
import * as auditService from '../services/audit.service.js';
import * as loyalty from '../services/loyalty.service.js';

vi.mock('../middleware/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { orgs } = schema;
let counter = 0;
async function seedOrg(): Promise<string> {
  const n = ++counter;
  const [org] = await db.insert(orgs).values({ name: `Org ${n}`, slug: `org-loy-${Date.now()}-${n}` }).returning();
  return org.id as string;
}

/** Seed program + account + balance via the existing earn path. */
async function seedAccount(orgId: string, points: number): Promise<{ accountId: string; investorId: string }> {
  const program = await loyalty.createProgram(orgId, {
    name: 'Test Program', earnRules: [{ action: 'seed', points }],
  });
  const investorId = `inv-${++counter}`;
  const account = await loyalty.getOrCreateAccount(orgId, program.id, investorId);
  await loyalty.earnPoints(orgId, { accountId: account.id, action: 'seed' });
  return { accountId: account.id, investorId };
}

describe('Loyalty on RightAction (T9b)', () => {
  let orgId: string;
  beforeAll(async () => { orgId = await seedOrg(); });

  it('redeem: decrements the existing ledger AND records an audited RightAction', async () => {
    const { accountId } = await seedAccount(orgId, 1000);
    const res = await loyalty.redeemPoints(
      orgId,
      { accountId, amount: 300, action: 'gift-card', redemptionRate: 100 },
      { idempotencyKey: 'loy-redeem-1' },
    );
    expect(res.receipt.kind).toBe('REDEEM');
    expect(res.receipt.status).toBe('COMPLETED');
    expect(res.balanceBefore).toBe(1000);
    expect(res.balanceAfter).toBe(700);
    expect(res.redeemedValue).toBe('3.00'); // 300 / 100
    // ledger actually decremented
    const bal = await loyalty.getBalance(orgId, accountId);
    expect(bal.balance).toBe(700);
    // audit entry written + correct action
    const entry = await auditService.getAuditLogEntry(res.receipt.auditEntryId!, orgId);
    expect(entry.action).toBe('right.redeem.completed');
  });

  it('idempotent replay: same key does not double-spend', async () => {
    const { accountId } = await seedAccount(orgId, 500);
    const a = await loyalty.consumePoints(orgId, { accountId, amount: 200, action: 'spend' }, { idempotencyKey: 'loy-rep' });
    const b = await loyalty.consumePoints(orgId, { accountId, amount: 200, action: 'spend' }, { idempotencyKey: 'loy-rep' });
    expect(b.receipt.id).toBe(a.receipt.id);
    const bal = await loyalty.getBalance(orgId, accountId);
    expect(bal.balance).toBe(300); // decremented once, not twice
  });

  it('mutating without an idempotency key is rejected', async () => {
    const { accountId } = await seedAccount(orgId, 100);
    await expect(loyalty.consumePoints(orgId, { accountId, amount: 10, action: 'x' }, {})).rejects.toThrow(
      loyalty.LoyaltyRightErrorCode.IDEMPOTENCY_KEY_REQUIRED,
    );
  });

  it('insufficient balance is rejected (no decrement, no action)', async () => {
    const { accountId } = await seedAccount(orgId, 50);
    await expect(
      loyalty.redeemPoints(orgId, { accountId, amount: 100, action: 'big' }, { idempotencyKey: 'loy-insf' }),
    ).rejects.toThrow(loyalty.LoyaltyRightErrorCode.INSUFFICIENT_BALANCE);
    const bal = await loyalty.getBalance(orgId, accountId);
    expect(bal.balance).toBe(50); // untouched
  });

  it('below-minimum redemption is rejected', async () => {
    const { accountId } = await seedAccount(orgId, 1000);
    await expect(
      loyalty.redeemPoints(orgId, { accountId, amount: 5, action: 'min', minRedemptionAmount: 100 }, { idempotencyKey: 'loy-min' }),
    ).rejects.toThrow(loyalty.LoyaltyRightErrorCode.BELOW_MIN_REDEMPTION);
  });

  it('revoke: clawback zeroes balance and records a REVOKE RightAction', async () => {
    const { accountId } = await seedAccount(orgId, 800);
    const res = await loyalty.revokePoints(orgId, { accountId, reason: 'fraud' }, { idempotencyKey: 'loy-revoke' });
    expect(res.receipt.kind).toBe('REVOKE');
    expect(res.revoked).toBe(800);
    const bal = await loyalty.getBalance(orgId, accountId);
    expect(bal.balance).toBe(0);
  });

  it('tenant isolation: another org cannot act on the account', async () => {
    const { accountId } = await seedAccount(orgId, 100);
    await expect(
      loyalty.consumePoints('some-other-org', { accountId, amount: 10, action: 'x' }, { idempotencyKey: 'loy-iso' }),
    ).rejects.toThrow(loyalty.LoyaltyRightErrorCode.ACCOUNT_NOT_FOUND);
  });
});
