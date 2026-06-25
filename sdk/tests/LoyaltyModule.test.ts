/**
 * T9d — Loyalty SDK surface conformance.
 * Verifies client.loyalty.* maps to the T9c routes, unwraps envelopes, attaches
 * Bearer auth, and sends Idempotency-Key on mutating point ops.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createApiClient } from '@tokenisation/core';

const KEY = 'sk_test_loyalty';

function mockFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = [];
  // @ts-expect-error test double
  global.fetch = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
  });
  return calls;
}
afterEach(() => vi.restoreAllMocks());

const client = createApiClient({ apiKey: KEY, baseUrl: 'http://localhost:3001' });

describe('client.loyalty surface (T9d)', () => {
  it('exposes the nested module shape', () => {
    expect(client.loyalty).toBeTruthy();
    expect(typeof client.loyalty.programs.create).toBe('function');
    expect(typeof client.loyalty.accounts.create).toBe('function');
    expect(typeof client.loyalty.points.earn).toBe('function');
    expect(typeof client.loyalty.points.balance).toBe('function');
    expect(typeof client.loyalty.points.redeem).toBe('function');
    expect(typeof client.loyalty.points.consume).toBe('function');
    expect(typeof client.loyalty.points.revoke).toBe('function');
    expect(typeof client.loyalty.transactions.list).toBe('function');
  });

  it('programs.create posts to /loyalty/programs with Bearer auth and unwraps {program}', async () => {
    const calls = mockFetch(201, { program: { id: 'prog-1', name: 'P' } });
    const program = await client.loyalty.programs.create({ name: 'P', earnRules: [{ action: 'seed', points: 100 }] });
    expect(calls[0].url).toContain('/api/v1/loyalty/programs');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers['Authorization']).toBe(`Bearer ${KEY}`);
    expect(program.id).toBe('prog-1');
  });

  it('points.balance gets balance and unwraps {balance}', async () => {
    mockFetch(200, { balance: { balance: 700, currentTier: '', lifetimeEarned: 1000, lifetimeSpent: 300 } });
    const bal = await client.loyalty.points.balance('acct-1');
    expect(bal.balance).toBe(700);
  });

  it('points.redeem sends Idempotency-Key and returns the spend result', async () => {
    const calls = mockFetch(200, { receipt: { id: 'ra_1', kind: 'REDEEM', status: 'COMPLETED' }, transactionId: 'txn-1', balanceBefore: 1000, balanceAfter: 700, redeemedValue: '3.00' });
    const res = await client.loyalty.points.redeem('acct-1', { amount: 300, action: 'gift', redemptionRate: 100 }, 'idem-redeem-1');
    expect(calls[0].url).toContain('/api/v1/loyalty/accounts/acct-1/redeem');
    expect(calls[0].init.headers['Idempotency-Key']).toBe('idem-redeem-1');
    expect(res.receipt.kind).toBe('REDEEM');
    expect(res.balanceAfter).toBe(700);
    expect(res.redeemedValue).toBe('3.00');
  });

  it('points.consume sends Idempotency-Key', async () => {
    const calls = mockFetch(200, { receipt: { id: 'ra_2', kind: 'CONSUME', status: 'COMPLETED' }, transactionId: 't', balanceBefore: 500, balanceAfter: 400 });
    await client.loyalty.points.consume('acct-9', { amount: 100, action: 'spend' }, 'idem-consume-1');
    expect(calls[0].url).toContain('/accounts/acct-9/consume');
    expect(calls[0].init.headers['Idempotency-Key']).toBe('idem-consume-1');
  });

  it('points.revoke sends Idempotency-Key and reason', async () => {
    const calls = mockFetch(200, { receipt: { id: 'ra_3', kind: 'REVOKE', status: 'COMPLETED' }, revoked: 800 });
    const res = await client.loyalty.points.revoke('acct-2', 'fraud', 'idem-revoke-1');
    expect(calls[0].init.headers['Idempotency-Key']).toBe('idem-revoke-1');
    expect(JSON.parse(calls[0].init.body).reason).toBe('fraud');
    expect(res.revoked).toBe(800);
  });

  it('transactions.list returns the paginated body', async () => {
    mockFetch(200, { data: [{ id: 't1' }], total: 1 });
    const hist = await client.loyalty.transactions.list('acct-1', { limit: 10 });
    expect(hist.total).toBe(1);
    expect(hist.data.length).toBe(1);
  });
});
