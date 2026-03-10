/**
 * SDK Client Verification
 *
 * Verifies that the ApiClient from @tokenisation/sdk works correctly
 * against the running server. Tests all major modules:
 * investors, assets, tokens, transfers, distributions, audit.
 *
 * Prerequisites:
 *   1. Start the server: cd server && npm run dev
 *   2. Ensure .env has AUTH_DEV_MODE=true
 *
 * Run with: npm run demo
 */

import { ApiClient } from '@tokenisation/sdk';

// Use the test environment preset: http://localhost:3001
const client = new ApiClient({
  apiKey: 'sk_test_demo_key',
  baseUrl: 'http://localhost:3001/api/v1',
  defaultHeaders: {
    'X-Dev-Org-Id': 'dev-org-1',
  },
  retry: { maxRetries: 0, retryDelay: 0, retryOn: [] },
});

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  PASS: ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name: string, err: unknown) {
  failed++;
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`  FAIL: ${name} — ${msg.slice(0, 120)}`);
}

async function main() {
  console.log('\nSDK Client Verification\n========================\n');

  // ── 1. Health check via raw http ─────────────────────────────────
  console.log('[Module: Core]');
  try {
    const org = await client.getOrganization();
    ok('getOrganization', `id=${org.id}`);
  } catch (e) {
    // May not be implemented — just note it
    fail('getOrganization', e);
  }

  // ── 2. Investors ──────────────────────────────────────────────────
  console.log('\n[Module: Investors]');
  let investorId = '';
  try {
    const inv = await client.investors.create({
      email: `sdk-test-${Date.now()}@test.com`,
      jurisdiction: 'AE',
      type: 'individual',
    });
    investorId = inv.id;
    ok('investors.create', `id=${inv.id}`);
  } catch (e) { fail('investors.create', e); }

  if (investorId) {
    try {
      const inv = await client.investors.get(investorId);
      ok('investors.get', `email=${inv.email}`);
    } catch (e) { fail('investors.get', e); }
  }

  try {
    const list = await client.investors.list();
    ok('investors.list', `count=${list.data?.length ?? list.count ?? '?'}`);
  } catch (e) { fail('investors.list', e); }

  // ── 3. Assets ──────────────────────────────────────────────────────
  console.log('\n[Module: Assets]');
  let assetId = '';
  try {
    const asset = await client.assets.create({
      name: `SDK Test Asset ${Date.now()}`,
      rightType: 'OWNERSHIP' as any,
      jurisdiction: {
        countryCode: 'AE',
        regulatoryFramework: 'UAE_VARA',
      },
    });
    assetId = asset.id;
    ok('assets.create', `id=${asset.id}, state=${asset.state}`);
  } catch (e) { fail('assets.create', e); }

  if (assetId) {
    try {
      const asset = await client.assets.get(assetId);
      ok('assets.get', `name=${asset.name}`);
    } catch (e) { fail('assets.get', e); }

    try {
      const list = await client.assets.list();
      ok('assets.list', `count=${list.data?.length ?? '?'}`);
    } catch (e) { fail('assets.list', e); }

    // Transition to VERIFIED via convenience endpoints
    try {
      // POST /assets/:id/transition with {toState}
      const http = client.getHttpClient();
      await http.post(`/api/v1/assets/${assetId}/transition`, { toState: 'PENDING_VERIFICATION' });
      await http.post(`/api/v1/assets/${assetId}/transition`, { toState: 'VERIFIED' });
      ok('assets.transition', 'DRAFT -> PENDING_VERIFICATION -> VERIFIED');
    } catch (e) { fail('assets.transition', e); }
  }

  // ── 4. Tokens ───────────────────────────────────────────────────────
  console.log('\n[Module: Tokens]');
  let tokenId = '';
  try {
    const token = await client.tokens.create({
      name: 'SDK Test Token',
      symbol: `ST${Date.now() % 10000}`,
      standard: 'ERC3643',
      chainId: 8453,
      totalSupply: '1000000',
      assetId,
    });
    tokenId = token.id;
    ok('tokens.create', `id=${token.id}, status=${token.status}`);
  } catch (e) { fail('tokens.create', e); }

  if (tokenId) {
    try {
      const token = await client.tokens.get(tokenId);
      ok('tokens.get', `symbol=${token.symbol}`);
    } catch (e) { fail('tokens.get', e); }

    try {
      const list = await client.tokens.list();
      ok('tokens.list', `count=${list.data?.length ?? '?'}`);
    } catch (e) { fail('tokens.list', e); }

    // Deploy
    try {
      const deployed = await client.tokens.deploy(tokenId);
      ok('tokens.deploy', `status=${deployed.status}`);
    } catch (e) { fail('tokens.deploy', e); }

    // Confirm deployment via raw HTTP (no SDK method for this)
    try {
      const http = client.getHttpClient();
      await http.post(`/api/v1/tokens/${tokenId}/confirm-deployment`, {
        contractAddress: '0x' + 'C'.repeat(40),
        txHash: '0x' + 'F'.repeat(64),
        blockNumber: 99999,
      });
      ok('tokens.confirmDeployment (raw)', 'deployed');
    } catch (e) { fail('tokens.confirmDeployment', e); }

    // Issue tokens
    if (investorId) {
      try {
        const issuance = await client.tokens.issue(tokenId, {
          investorId,
          walletAddress: '0x' + 'A'.repeat(40),
          amount: '500000',
          idempotencyKey: crypto.randomUUID(),
        });
        ok('tokens.issue', `amount=${issuance.amount}`);
      } catch (e) { fail('tokens.issue', e); }

      // Get cap table
      try {
        const capTable = await client.tokens.getCapTable(tokenId);
        ok('tokens.getCapTable', `holders=${capTable.holders?.length ?? '?'}`);
      } catch (e) { fail('tokens.getCapTable', e); }

      // Get balance
      try {
        const balance = await client.tokens.getBalance(tokenId, '0x' + 'A'.repeat(40));
        ok('tokens.getBalance', `balance=${balance.balance}`);
      } catch (e) { fail('tokens.getBalance', e); }
    }
  }

  // ── 5. Transfers ────────────────────────────────────────────────────
  console.log('\n[Module: Transfers]');
  if (tokenId) {
    try {
      const transfer = await client.transfers.create({
        tokenId,
        fromWallet: '0x' + 'a'.repeat(40),
        toWallet: '0x' + 'b'.repeat(40),
        amount: '50000',
        idempotencyKey: crypto.randomUUID(),
      });
      ok('transfers.create', `id=${transfer.id}, status=${transfer.status}`);
    } catch (e) { fail('transfers.create', e); }

    try {
      const list = await client.transfers.list();
      ok('transfers.list', `count=${list.data?.length ?? '?'}`);
    } catch (e) { fail('transfers.list', e); }
  }

  // ── 6. Cash Flow (Distributions) ───────────────────────────────────
  console.log('\n[Module: CashFlow]');
  if (tokenId) {
    // Use raw HTTP since CashFlowModule uses schedules, not direct distribution create
    try {
      const http = client.getHttpClient();
      const resp = await http.post('/api/v1/distributions', {
        tokenId,
        name: 'SDK Test Distribution',
        type: 'rent',
        totalAmount: '10000',
        recordDate: '2026-05-15T00:00:00.000Z',
        paymentDate: '2026-06-01T00:00:00.000Z',
        paymentMethod: 'bank_transfer',
        currency: 'USD',
      });
      ok('distributions.create (raw)', `id=${resp.data?.id}`);
    } catch (e) { fail('distributions.create', e); }

    try {
      const history = await client.cashflow.getDistributionHistory();
      ok('cashflow.getDistributionHistory', `count=${history.data?.length ?? '?'}`);
    } catch (e) { fail('cashflow.getDistributionHistory', e); }
  }

  // ── 7. Audit ────────────────────────────────────────────────────────
  console.log('\n[Module: Audit]');
  try {
    const events = await client.audit.list();
    ok('audit.list', `count=${events.data?.length ?? '?'}`);
  } catch (e) { fail('audit.list', e); }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log(`\n========================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
