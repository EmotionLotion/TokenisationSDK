import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';

const BASE_URL = 'http://localhost:3001';

const headers = (extra: Record<string, string> = {}): Record<string, string> => ({
  'Content-Type': 'application/json',
  'X-Dev-Org-Id': 'test-org-1',
  ...extra,
});

const idempotentHeaders = (): Record<string, string> =>
  headers({ 'Idempotency-Key': crypto.randomUUID() });

/** Extract the main data object from various response shapes */
function extractData(json: any): any {
  return json.data ?? json.asset ?? json.token ?? json;
}

describe('Real Estate E2E Lifecycle', () => {
  let investorAId: string;
  let investorBId: string;
  let assetId: string;
  let tokenId: string;

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.ok).toBe(true);
  });

  // ── 1. Create Investor A ───────────────────────────────────────────
  it('should create Investor A', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/investors`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        type: 'individual',
        email: `alice-e2e-${Date.now()}@test.com`,
        countryCode: 'AE',
      }),
    });

    expect(res.status).toBe(201);
    const body = extractData(await res.json());
    expect(body.id).toBeDefined();
    investorAId = body.id;
  });

  // ── 2. Create Investor B ───────────────────────────────────────────
  it('should create Investor B', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/investors`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        type: 'institutional',
        email: `bob-e2e-${Date.now()}@test.com`,
        countryCode: 'AE',
      }),
    });

    expect(res.status).toBe(201);
    const body = extractData(await res.json());
    expect(body.id).toBeDefined();
    investorBId = body.id;
  });

  // ── 3. Create Asset ────────────────────────────────────────────────
  it('should create a real-estate asset', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/assets`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        name: 'E2E Marina Tower',
        rightType: 'OWNERSHIP',
        jurisdiction: {
          countryCode: 'AE',
          regulatoryFramework: 'UAE_VARA',
          accreditedOnly: false,
          blockedJurisdictions: [],
        },
        metadata: { location: 'Dubai Marina', floors: 45 },
      }),
    });

    expect(res.status).toBe(201);
    const body = extractData(await res.json());
    expect(body.id).toBeDefined();
    expect(body.state).toBe('DRAFT');
    assetId = body.id;
  });

  // ── 4. Transition Asset to PENDING_VERIFICATION ────────────────────
  it('should transition asset to PENDING_VERIFICATION', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/assets/${assetId}/transition`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ toState: 'PENDING_VERIFICATION' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newState).toBe('PENDING_VERIFICATION');
  });

  // ── 5. Transition Asset to VERIFIED ────────────────────────────────
  it('should transition asset to VERIFIED', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/assets/${assetId}/transition`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ toState: 'VERIFIED' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.newState).toBe('VERIFIED');
  });

  // ── 6. Create Token ────────────────────────────────────────────────
  it('should create a token for the asset', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tokens`, {
      method: 'POST',
      headers: idempotentHeaders(),
      body: JSON.stringify({
        name: 'E2E Marina Token',
        symbol: `E2E${Date.now() % 10000}`,
        standard: 'ERC3643',
        chainId: 8453,
        totalSupply: '1000000',
        assetId,
        metadata: {},
      }),
    });

    expect(res.status).toBe(201);
    const body = extractData(await res.json());
    expect(body.id).toBeDefined();
    expect(body.status).toBe('draft');
    tokenId = body.id;
  });

  // ── 7. Deploy Token ────────────────────────────────────────────────
  it('should deploy the token', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tokens/${tokenId}/deploy`, {
      method: 'POST',
      headers: idempotentHeaders(),
      body: JSON.stringify({
        deployerAddress: '0x' + '1'.repeat(40),
      }),
    });

    expect(res.status).toBe(200);
    const body = extractData(await res.json());
    expect(body.status).toBe('deploying');
  });

  // ── 8. Confirm Deployment ──────────────────────────────────────────
  it('should confirm token deployment', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tokens/${tokenId}/confirm-deployment`, {
      method: 'POST',
      headers: idempotentHeaders(),
      body: JSON.stringify({
        contractAddress: '0x' + 'A'.repeat(40),
        txHash: '0x' + 'D'.repeat(64),
        blockNumber: 12345,
      }),
    });

    expect(res.status).toBe(200);
    const body = extractData(await res.json());
    expect(body.status).toBe('deployed');
  });

  // ── 9. Issue Tokens to Investor A ──────────────────────────────────
  it('should issue tokens to Investor A', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tokens/${tokenId}/issue`, {
      method: 'POST',
      headers: idempotentHeaders(),
      body: JSON.stringify({
        investorId: investorAId,
        walletAddress: '0x' + 'A'.repeat(40),
        amount: '500000',
        reason: 'Initial allocation',
      }),
    });

    expect([200, 201]).toContain(res.status);
  });

  // ── 10. Check Positions ────────────────────────────────────────────
  it('should show Investor A position of 500000', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/tokens/${tokenId}/positions`, {
      method: 'GET',
      headers: headers(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const positions = body.data ?? body;
    expect(Array.isArray(positions)).toBe(true);
    expect(positions.length).toBeGreaterThanOrEqual(1);

    const pos = positions.find((p: any) =>
      (p.walletAddress || '').toLowerCase().includes('a'.repeat(10))
    );
    expect(pos).toBeDefined();
    expect(String(pos.balance)).toBe('500000');
  });

  // ── 11. Create Transfer ────────────────────────────────────────────
  it('should create a transfer between wallets', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/transfers`, {
      method: 'POST',
      headers: idempotentHeaders(),
      body: JSON.stringify({
        tokenId,
        fromWallet: '0x' + 'a'.repeat(40),
        toWallet: '0x' + 'b'.repeat(40),
        amount: '100000',
      }),
    });

    expect([200, 201]).toContain(res.status);
  });

  // ── 12. Create Distribution ────────────────────────────────────────
  it('should create a rent distribution', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/distributions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        tokenId,
        name: 'E2E Q1 Rent',
        type: 'rent',
        totalAmount: '50000',
        recordDate: '2026-05-15T00:00:00.000Z',
        paymentDate: '2026-06-01T00:00:00.000Z',
        paymentMethod: 'bank_transfer',
        currency: 'USD',
      }),
    });

    expect([200, 201]).toContain(res.status);
  });

  // ── 13. Get Audit Trail ────────────────────────────────────────────
  it('should return audit trail entries for the token', async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/audit?entityType=token&entityId=${tokenId}`,
      { method: 'GET', headers: headers() },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    const entries = body.data ?? body;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });
});
