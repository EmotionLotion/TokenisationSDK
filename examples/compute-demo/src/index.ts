/**
 * GPU Compute Tokenization Demo
 *
 * Demonstrates the full lifecycle of GPU compute node tokenization
 * via the REST API: register -> verify -> tokenize -> revenue -> distribute.
 *
 * Prerequisites:
 *   1. Start the server: cd server && npm run dev
 *   2. Ensure .env has ENABLED_VERTICALS=gpu-compute and AUTH_DEV_MODE=true
 *
 * Run with: npm run demo
 */

const BASE = process.env.API_URL || 'http://localhost:3001';
const ORG = process.env.ORG_ID || 'dev-org-1';

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'X-Dev-Org-Id': ORG,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as any;
  if (!res.ok || json.error) {
    throw new Error(
      `${method} ${path} failed (${res.status}): ${JSON.stringify(json.error || json)}`
    );
  }
  return json.data ?? json;
}

function log(section: string, msg: string) {
  console.log(`\n[${'='.repeat(50)}]`);
  console.log(`[${section}] ${msg}`);
  console.log(`[${'='.repeat(50)}]`);
}

function ok(msg: string) {
  console.log(`  OK: ${msg}`);
}

function info(label: string, value: unknown) {
  console.log(`     ${label}: ${value}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`
  GPU COMPUTE TOKENIZATION DEMO
  ================================
  Server : ${BASE}
  Org    : ${ORG}
  `);

  // 1. Register GPU node
  log('STEP 1', 'Register GPU Node');
  const node = await api('POST', '/api/v1/gpu-nodes', {
    gpuModel: 'A100',
    gpuCount: 8,
    vramPerGpuGB: 80,
    interconnect: 'NVLink',
    datacenterName: 'Dubai DC-1',
    datacenterLocation: 'Dubai, UAE',
    datacenterTier: 3,
    acquisitionCostUsd: '250000',
    acquisitionDate: '2025-06-15',
    estimatedUsefulLifeMonths: 48,
  });
  ok(`Node registered: ${node.id}`);
  info('GPU', `${node.gpuModel} x${node.gpuCount}`);
  info('VRAM', `${node.totalVramGB} GB`);
  info('Status', node.status);

  const nodeId = node.id;

  // 2. List nodes
  log('STEP 2', 'List GPU Nodes');
  const nodes = await api('GET', '/api/v1/gpu-nodes');
  ok(`Found ${Array.isArray(nodes) ? nodes.length : '?'} node(s)`);

  // 3. Get node detail
  log('STEP 3', 'Get Node Detail');
  const detail = await api('GET', `/api/v1/gpu-nodes/${nodeId}`);
  ok(`${detail.gpuModel} x${detail.gpuCount} at ${detail.datacenterName}`);

  // 4. Update benchmark score
  log('STEP 4', 'Update Node Benchmark');
  const updated = await api('PATCH', `/api/v1/gpu-nodes/${nodeId}`, {
    benchmarkScore: 95000,
  });
  ok(`Benchmark score set to ${updated.benchmarkScore}`);

  // 5. Start verification
  log('STEP 5', 'Verify Node');
  await api('POST', `/api/v1/gpu-nodes/${nodeId}/verify`, {});
  ok('Verification started');

  // 5b. Complete verification
  const verified = await api(
    'POST',
    `/api/v1/gpu-nodes/${nodeId}/verify/complete`,
    { passed: true }
  );
  ok(`Verification complete: verified=${verified.verified}`);

  // 6. Tokenize node
  log('STEP 6', 'Tokenize Node');
  const listing = await api('POST', `/api/v1/gpu-nodes/${nodeId}/tokenize`, {
    tokenSymbol: 'GPU8A',
    tokenName: 'Dubai A100 Cluster Token',
    totalSupply: '1000000',
    pricePerToken: '0.25',
  });
  ok(`Tokenized! Listing: ${listing.id}`);
  info('Symbol', listing.tokenSymbol);
  info('Supply', listing.totalSupply);
  info('Price', `$${listing.pricePerToken}/token`);

  // 7. Get token info
  log('STEP 7', 'Get Token Info');
  const tokenInfo = await api('GET', `/api/v1/gpu-nodes/${nodeId}/token`);
  ok(`Token: ${tokenInfo.tokenName} (${tokenInfo.tokenSymbol})`);

  // 8. Record revenue
  log('STEP 8', 'Record Revenue Period');
  const revenue = await api('POST', `/api/v1/gpu-nodes/${nodeId}/revenue`, {
    grossRevenueUsd: '12500',
    electricityCostUsd: '1800',
    periodStart: '2026-02-01',
    periodEnd: '2026-02-28',
    hoursRented: '600',
    avgUtilizationPercent: '89',
  });
  ok('Revenue recorded');
  info('Gross', `$${revenue.grossRevenueUsd}`);
  info('Net', `$${revenue.netRevenueUsd}`);
  info('Platform Fee', `$${revenue.platformFeeUsd}`);

  // 9. Distribute yield
  log('STEP 9', 'Distribute Yield');
  const dist = await api('POST', `/api/v1/gpu-nodes/${nodeId}/distribute`, {
    revenuePeriodId: revenue.id,
  });
  ok(`Distributed $${dist.totalDistributed} to token holders`);
  info('Method', dist.distributionMethod);
  info('Status', dist.status);

  // 10. Marketplace & Analytics
  log('STEP 10', 'Marketplace');
  const market = await api('GET', '/api/v1/compute-market');
  const listings = Array.isArray(market) ? market : [];
  ok(`${listings.length} listing(s) on marketplace`);
  for (const l of listings) {
    info('Listing', `${l.tokenName} (${l.tokenSymbol}) - ${l.totalSupply} tokens @ $${l.pricePerToken}`);
  }

  const analytics = await api('GET', '/api/v1/compute-market/analytics');
  ok('Analytics retrieved');
  info('Total Nodes', analytics.totalNodes);
  info('Total GPUs', analytics.totalGpus);
  info('Total VRAM', `${analytics.totalVramTB} TB`);

  // Summary
  console.log(`
  ================================
  DEMO COMPLETED SUCCESSFULLY
  ================================

  Full GPU compute lifecycle completed:
    1. Registered A100 x8 node in Dubai DC-1
    2. Verified hardware
    3. Tokenized into ${listing.totalSupply} tokens at $${listing.pricePerToken}/token
    4. Recorded $${revenue.grossRevenueUsd} revenue (net: $${revenue.netRevenueUsd})
    5. Distributed $${dist.totalDistributed} yield to holders
    6. Listed on compute marketplace
  `);
}

main().catch((err) => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
