/**
 * T9c — Loyalty HTTP routes: RBAC (resource-level requireScope), idempotency,
 * and end-to-end issue → balance → redeem against the real service.
 * Builds a minimal app (router + real errorHandler) with an injectable apiKey.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { db, schema } from '../config/database.js';
import { loyaltyRouter } from '../routes/loyalty.routes.js';
import { errorHandler } from '../middleware/errorHandler.js';

vi.mock('../middleware/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { orgs } = schema;
let counter = 0;
async function seedOrg(): Promise<string> {
  const n = ++counter;
  const [o] = await db.insert(orgs).values({ name: `Org ${n}`, slug: `org-loyr-${Date.now()}-${n}` }).returning();
  return o.id as string;
}

/** Minimal app mounting the loyalty router behind an injectable apiKey. */
function makeApp(orgId: string, scopes: string[]) {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.apiKey = { orgId, scopes, keyId: 'k-test' }; next(); });
  app.use('/api/v1/loyalty', loyaltyRouter);
  app.use(errorHandler);
  return app;
}

describe('Loyalty routes (T9c)', () => {
  let orgId: string;
  let app: express.Express;
  beforeAll(async () => { orgId = await seedOrg(); app = makeApp(orgId, ['*']); });

  async function seedAccountWithPoints(points: number): Promise<string> {
    const prog = await request(app).post('/api/v1/loyalty/programs')
      .send({ name: 'Prog', earnRules: [{ action: 'seed', points }] });
    expect(prog.status).toBe(201);
    const acct = await request(app).post('/api/v1/loyalty/accounts')
      .send({ programId: prog.body.program.id, investorId: `inv-${++counter}` });
    expect(acct.status).toBe(201);
    const accountId = acct.body.account.id;
    const earn = await request(app).post(`/api/v1/loyalty/accounts/${accountId}/earn`).send({ action: 'seed' });
    expect(earn.status).toBe(201);
    return accountId;
  }

  it('end-to-end: issue → balance → redeem (with Idempotency-Key)', async () => {
    const accountId = await seedAccountWithPoints(1000);

    const bal = await request(app).get(`/api/v1/loyalty/accounts/${accountId}/balance`);
    expect(bal.status).toBe(200);
    expect(bal.body.balance.balance).toBe(1000);

    const redeem = await request(app)
      .post(`/api/v1/loyalty/accounts/${accountId}/redeem`)
      .set('Idempotency-Key', 'route-redeem-1')
      .send({ amount: 250, action: 'gift', redemptionRate: 100 });
    expect(redeem.status).toBe(200);
    expect(redeem.body.receipt.kind).toBe('REDEEM');
    expect(redeem.body.balanceAfter).toBe(750);
    expect(redeem.body.redeemedValue).toBe('2.50');
  });

  it('redeem without Idempotency-Key → 400', async () => {
    const accountId = await seedAccountWithPoints(500);
    const res = await request(app)
      .post(`/api/v1/loyalty/accounts/${accountId}/redeem`)
      .send({ amount: 100, action: 'x' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('RBAC: a read-only key is denied write (redeem)', async () => {
    const readApp = makeApp(orgId, ['read:loyalty']);
    const accountId = await seedAccountWithPoints(300); // seeded with full-scope app
    const res = await request(readApp)
      .post(`/api/v1/loyalty/accounts/${accountId}/redeem`)
      .set('Idempotency-Key', 'route-deny-1')
      .send({ amount: 50, action: 'x' });
    expect(res.status).toBe(401); // UnauthorizedError from requireScope
  });

  it('RBAC: a read-only key CAN read balance', async () => {
    const readApp = makeApp(orgId, ['read:loyalty']);
    const accountId = await seedAccountWithPoints(120);
    const res = await request(readApp).get(`/api/v1/loyalty/accounts/${accountId}/balance`);
    expect(res.status).toBe(200);
    expect(res.body.balance.balance).toBe(120);
  });

  it('insufficient balance → 400', async () => {
    const accountId = await seedAccountWithPoints(40);
    const res = await request(app)
      .post(`/api/v1/loyalty/accounts/${accountId}/consume`)
      .set('Idempotency-Key', 'route-insf')
      .send({ amount: 100, action: 'x' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('INSUFFICIENT_BALANCE');
  });
});
