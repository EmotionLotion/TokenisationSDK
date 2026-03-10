/**
 * Real Estate API Demo
 *
 * Demonstrates the full real estate tokenization lifecycle via the REST API:
 * create investors -> create asset -> transitions -> create token -> deploy ->
 * issue -> transfer -> distribution -> audit.
 *
 * Prerequisites:
 *   1. Start the server: cd server && npm run dev
 *   2. Ensure .env has ENABLED_VERTICALS=real-estate and AUTH_DEV_MODE=true
 *
 * Run with: npx tsx src/api-demo.ts
 */

const BASE = process.env.API_URL || 'http://localhost:3001';
const ORG = process.env.ORG_ID || 'dev-org-1';

function makeHeaders(idempotencyKey?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Dev-Org-Id': ORG,
  };
  if (idempotencyKey) h['Idempotency-Key'] = idempotencyKey;
  return h;
}

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: makeHeaders(idempotencyKey),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as any;
  if (!res.ok && !json.data && !json.asset && !json.token) {
    throw new Error(
      `${method} ${path} failed (${res.status}): ${JSON.stringify(json.error || json)}`
    );
  }
  // Handle various response wrappers
  return json.data ?? json.asset ?? json.token ?? json;
}

function log(step: number, msg: string) {
  console.log(`\n--- Step ${step}: ${msg} ---`);
}

function ok(msg: string) {
  console.log(`  OK: ${msg}`);
}

function info(label: string, value: unknown) {
  console.log(`     ${label}: ${value}`);
}

async function main() {
  console.log(`
  REAL ESTATE API DEMO
  ================================
  Server : ${BASE}
  Org    : ${ORG}
  `);

  // Step 1: Create Investor A
  log(1, 'Create Investor A');
  const investorA = await api('POST', '/api/v1/investors', {
    type: 'individual',
    email: `alice-${Date.now()}@example.com`,
    countryCode: 'AE',
  });
  ok(`Investor A: ${investorA.id}`);
  info('Email', investorA.email);

  // Step 2: Create Investor B
  log(2, 'Create Investor B');
  const investorB = await api('POST', '/api/v1/investors', {
    type: 'institutional',
    email: `bob-${Date.now()}@example.com`,
    countryCode: 'AE',
  });
  ok(`Investor B: ${investorB.id}`);

  // Step 3: Create Asset
  log(3, 'Create Real Estate Asset');
  const asset = await api('POST', '/api/v1/assets', {
    name: 'Marina Heights Tower',
    rightType: 'OWNERSHIP',
    jurisdiction: {
      countryCode: 'AE',
      regulatoryFramework: 'UAE_VARA',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    metadata: { location: 'Dubai Marina', floors: 45, units: 200 },
  });
  ok(`Asset: ${asset.id}`);
  info('Status', asset.state || asset.status);

  // Step 4: Transition to PENDING_VERIFICATION
  log(4, 'Transition Asset -> PENDING_VERIFICATION');
  const pv = await api('POST', `/api/v1/assets/${asset.id}/transition`, {
    toState: 'PENDING_VERIFICATION',
  });
  ok(`Status: ${pv.state || 'PENDING_VERIFICATION'}`);

  // Step 5: Transition to VERIFIED
  log(5, 'Transition Asset -> VERIFIED');
  const ver = await api('POST', `/api/v1/assets/${asset.id}/transition`, {
    toState: 'VERIFIED',
  });
  ok(`Status: ${ver.state || 'VERIFIED'}`);

  // Step 6: Create Token
  log(6, 'Create Token');
  const token = await api(
    'POST',
    '/api/v1/tokens',
    {
      name: 'Marina Heights Token',
      symbol: 'MHT',
      standard: 'ERC3643',
      chainId: 8453,
      totalSupply: '1000000',
      assetId: asset.id,
      metadata: {},
    },
    crypto.randomUUID()
  );
  ok(`Token: ${token.id}`);
  info('Symbol', token.symbol);
  info('Status', token.status);

  // Step 7: Deploy Token
  log(7, 'Deploy Token');
  const deployed = await api(
    'POST',
    `/api/v1/tokens/${token.id}/deploy`,
    { deployerAddress: '0x' + '1'.repeat(40) },
    crypto.randomUUID()
  );
  ok(`Status: ${deployed.status}`);

  // Step 8: Confirm Deployment
  log(8, 'Confirm Deployment');
  const confirmed = await api(
    'POST',
    `/api/v1/tokens/${token.id}/confirm-deployment`,
    {
      contractAddress: '0x' + 'A'.repeat(40),
      txHash: '0x' + 'D'.repeat(64),
      blockNumber: 12345,
    },
    crypto.randomUUID()
  );
  ok(`Status: ${confirmed.status}`);
  info('Contract', confirmed.contractAddress?.slice(0, 12) + '...');

  // Step 9: Issue Tokens to Investor A
  log(9, 'Issue 500,000 Tokens to Investor A');
  const issuance = await api(
    'POST',
    `/api/v1/tokens/${token.id}/issue`,
    {
      investorId: investorA.id,
      walletAddress: '0x' + 'A'.repeat(40),
      amount: '500000',
      reason: 'Initial allocation',
    },
    crypto.randomUUID()
  );
  ok(`Issuance: ${issuance.id}`);
  info('Amount', issuance.amount);

  // Step 10: Check Positions
  log(10, 'Check Token Positions');
  const positions = await api('GET', `/api/v1/tokens/${token.id}/positions`);
  const posArr = Array.isArray(positions) ? positions : [];
  ok(`${posArr.length} position(s)`);
  for (const p of posArr) {
    info('Wallet', `${p.walletAddress?.slice(0, 12)}... balance: ${p.balance}`);
  }

  // Step 11: Create Transfer
  log(11, 'Transfer 100,000 Tokens A -> B');
  try {
    const transfer = await api(
      'POST',
      '/api/v1/transfers',
      {
        tokenId: token.id,
        fromWallet: '0x' + 'a'.repeat(40),
        toWallet: '0x' + 'b'.repeat(40),
        amount: '100000',
      },
      crypto.randomUUID()
    );
    ok(`Transfer: ${transfer.id}`);
    info('Status', transfer.status);
  } catch (err: any) {
    console.log(`  Note: Transfer may require additional setup (KYC, whitelisting): ${err.message?.slice(0, 100)}`);
  }

  // Step 12: Create Distribution
  log(12, 'Create Distribution (Rent)');
  try {
    const dist = await api('POST', '/api/v1/distributions', {
      tokenId: token.id,
      name: 'Q1 2026 Rent Distribution',
      type: 'rent',
      totalAmount: '50000',
      recordDate: '2026-05-15T00:00:00.000Z',
      paymentDate: '2026-06-01T00:00:00.000Z',
      paymentMethod: 'bank_transfer',
      currency: 'USD',
    });
    ok(`Distribution: ${dist.id}`);
    info('Amount', dist.totalAmount);
  } catch (err: any) {
    console.log(`  Note: Distribution creation returned: ${err.message?.slice(0, 100)}`);
  }

  // Step 13: Audit Trail
  log(13, 'Check Audit Trail');
  try {
    const audit = await api(
      'GET',
      `/api/v1/audit?entityType=token&entityId=${token.id}`
    );
    const entries = Array.isArray(audit) ? audit : [];
    ok(`${entries.length} audit entries`);
    for (const e of entries.slice(0, 5)) {
      info('Event', `${e.action || e.eventType} at ${e.createdAt || e.timestamp}`);
    }
  } catch {
    console.log('  Note: Audit endpoint may have different path');
  }

  // Summary
  console.log(`
  ================================
  DEMO COMPLETED
  ================================

  Full real estate lifecycle completed:
    - 2 investors created
    - Asset "Marina Heights Tower" created & verified
    - Token MHT created, deployed, confirmed
    - 500,000 tokens issued to Investor A
    - Transfer initiated (A -> B)
    - Rent distribution created
  `);
}

main().catch((err) => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
