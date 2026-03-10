/**
 * COMET Tokenization Demo
 *
 * Demonstrates the full flow from COMET data to tokenized reputation.
 *
 * Run this after starting the mock server:
 *   1. Terminal 1: npx ts-node server.ts
 *   2. Terminal 2: npx ts-node run-demo.ts
 */

const COMET_API = 'http://localhost:3001';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(title: string) {
  console.log('\n' + '═'.repeat(60));
  log(`  ${title}`, colors.bright + colors.cyan);
  console.log('═'.repeat(60));
}

function step(num: number, description: string) {
  log(`\n${colors.yellow}Step ${num}:${colors.reset} ${description}`);
}

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  return res.json();
}

// ============================================================
// DEMO FLOW
// ============================================================

async function runDemo() {
  header('COMET → Chainlink Oracle → Tokenization Demo');

  log('\nThis demo shows how real COMET data flows through Chainlink', colors.blue);
  log('oracles to create verifiable on-chain driver reputation.\n', colors.blue);

  // Check if mock server is running
  try {
    await fetchJson(`${COMET_API}/health`);
  } catch (e) {
    log('\n❌ Mock COMET server not running!', colors.yellow);
    log('   Start it first: npx ts-node server.ts\n', colors.yellow);
    process.exit(1);
  }

  log('✓ Connected to COMET Mock API\n', colors.green);

  // ─────────────────────────────────────────────────────────
  step(1, 'Fetch active drivers from COMET');
  // ─────────────────────────────────────────────────────────

  const drivers = await fetchJson(`${COMET_API}/v1/drivers`);
  console.log('\n   Available drivers:');
  for (const d of drivers) {
    console.log(`   • ${d.name} (${d.id}) - ${d.tier} tier, ${d.totalDeliveries} deliveries`);
  }

  await sleep(1000);

  // ─────────────────────────────────────────────────────────
  step(2, 'Check current safety score for DRV-003 (Silver tier)');
  // ─────────────────────────────────────────────────────────

  const driverId = 'DRV-003';
  const initialScore = await fetchJson(`${COMET_API}/simulate/safety-score/${driverId}`);

  console.log(`\n   Driver: ${initialScore.driverName}`);
  console.log(`   Current Score: ${initialScore.score}/100`);
  console.log(`   Event History: ${JSON.stringify(initialScore.eventCounts)}`);

  await sleep(1500);

  // ─────────────────────────────────────────────────────────
  step(3, 'Fetch penalty configuration (what Chainlink Functions fetches)');
  // ─────────────────────────────────────────────────────────

  const penalties = await fetchJson(`${COMET_API}/v1/config/safety-penalties`);
  console.log('\n   Penalty weights from COMET API (not hardcoded!):');
  for (const [event, penalty] of Object.entries(penalties)) {
    console.log(`   • ${event}: -${penalty} points`);
  }

  log('\n   → In production, Chainlink Functions fetches these dynamically', colors.blue);
  log('   → Penalties can be adjusted without redeploying contracts', colors.blue);

  await sleep(1500);

  // ─────────────────────────────────────────────────────────
  step(4, 'Simulate driver completing a delivery');
  // ─────────────────────────────────────────────────────────

  const delivery = await fetchJson(`${COMET_API}/simulate/delivery-complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ driverId, rating: 5 }),
  });

  console.log(`\n   ✓ Delivery ${delivery.delivery.id} completed`);
  console.log(`   ✓ Customer rating: ${delivery.delivery.customerRating}/5`);
  console.log(`   ✓ Webhook sent: ${delivery.webhook.event}`);

  await sleep(1500);

  // ─────────────────────────────────────────────────────────
  step(5, 'Simulate a safety event (SPEEDING)');
  // ─────────────────────────────────────────────────────────

  const safetyEvent = await fetchJson(`${COMET_API}/simulate/safety-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverId,
      eventType: 'SPEEDING',
      severity: 'MEDIUM',
    }),
  });

  console.log(`\n   ⚠️  Safety event recorded: ${safetyEvent.event.type}`);
  console.log(`   ⚠️  Severity: ${safetyEvent.event.severity}`);
  console.log(`   ⚠️  Score penalty: -${penalties.SPEEDING} points`);

  await sleep(1500);

  // ─────────────────────────────────────────────────────────
  step(6, 'Recalculate safety score after events');
  // ─────────────────────────────────────────────────────────

  const newScore = await fetchJson(`${COMET_API}/simulate/safety-score/${driverId}`);

  console.log(`\n   Driver: ${newScore.driverName}`);
  console.log(`   Previous Score: ${initialScore.score}/100`);
  console.log(`   New Score: ${newScore.score}/100`);
  console.log(`   Change: ${(newScore.score - initialScore.score).toFixed(1)} points`);

  await sleep(1500);

  // ─────────────────────────────────────────────────────────
  step(7, 'What happens in the real flow');
  // ─────────────────────────────────────────────────────────

  console.log(`
   ${colors.cyan}REAL COMET APP${colors.reset}              ${colors.yellow}CHAINLINK DON${colors.reset}              ${colors.green}ON-CHAIN${colors.reset}
   ─────────────              ─────────────              ────────
        │                           │                        │
   Driver completes                 │                        │
   delivery in app                  │                        │
        │                           │                        │
        ├──── Webhook ─────────────>│                        │
        │     {delivery_complete}   │                        │
        │                           │                        │
        │                    Chainlink Functions             │
        │                    executes JS on DON              │
        │                           │                        │
        │                    Fetches penalties               │
        │<─────────────────── from COMET API                 │
        │                           │                        │
        │                    Calculates score                │
        │                    (verified by 3+ nodes)          │
        │                           │                        │
        │                           ├───── Callback ────────>│
        │                           │      {score: 75.5}     │
        │                           │                        │
        │                           │               ReputationSBT
        │                           │               updated
        │                           │                        │
        │                           │               $AHOY tokens
        │                           │               minted if
        │                           │               tier upgrade
`);

  await sleep(2000);

  // ─────────────────────────────────────────────────────────
  step(8, 'Wire COMET data through TokenisationSDK');
  // ─────────────────────────────────────────────────────────

  log('   Initializing SDK and creating driver as a Party...', colors.blue);

  const {
    TokenisationSDK,
    PartyType,
    PartyRole,
    RightType,
    LifecycleState,
    TransferabilityMode,
    ChainlinkFunctionsPlugin,
    IndexingEngine,
    IndexedEventType,
    DecoPlugin,
    DecoProofType,
  } = await import('@tokenisation/sdk');

  const sdk = new TokenisationSDK({ useMockPlugins: true });

  const cometOrg = sdk.parties_.create({
    name: 'COMET Fleet Services',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'AE',
    email: 'fleet@comet.ahoy.dev',
    legalEntityId: 'LEI-AE-COMET-001',
    metadata: { service: 'DELIVERY_LOGISTICS' },
  });
  sdk.parties_.setKyc(cometOrg.id, true);

  const driverParty = sdk.parties_.create({
    name: initialScore.driverName || 'Driver DRV-003',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'AE',
    email: 'driver003@comet.ahoy.dev',
    metadata: {
      cometDriverId: driverId,
      tier: 'SILVER',
      totalDeliveries: String(initialScore.eventCounts?.DELIVERY_COMPLETE || 0),
    },
  });
  sdk.parties_.setKyc(driverParty.id, true);

  log(`   ✓ SDK initialized — COMET org: ${cometOrg.name}`, colors.green);
  log(`   ✓ Driver party created: ${driverParty.name} (${driverParty.id.substring(0, 8)}...)`, colors.green);

  await sleep(1000);

  // ─────────────────────────────────────────────────────────
  step(9, 'Simulate oracle-verified safety scoring via ChainlinkFunctionsPlugin');
  // ─────────────────────────────────────────────────────────

  const functionsPlugin = new ChainlinkFunctionsPlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    donId: 'fun-base-sepolia-1',
    subscriptionId: 1234,
    routerAddress: '0x0000000000000000000000000000000000000001',
  });

  log('   Chainlink Functions plugin instantiated (mock mode)', colors.blue);

  const safetyScoreResult = await functionsPlugin.executeRequest({
    source: `
      const driverId = args[0];
      const response = await Functions.makeHttpRequest({
        url: \`${COMET_API}/simulate/safety-score/\${driverId}\`,
      });
      return Functions.encodeUint256(Math.round(response.data.score * 100));
    `,
    args: [driverId],
    gasLimit: 300_000,
  });

  if (safetyScoreResult.success) {
    log(`   ✓ Chainlink Functions request submitted`, colors.green);
    log(`   ✓ Request ID: ${safetyScoreResult.data.requestId}`, colors.green);
  } else {
    log(`   ⚠️  Functions simulated (no DON): ${safetyScoreResult.error}`, colors.yellow);
  }

  log(`   → Oracle score from COMET data: ${newScore.score}/100`, colors.blue);

  await sleep(1000);

  // ─────────────────────────────────────────────────────────
  step(10, 'Mint ReputationSBT (BEHAVIOR token) based on oracle score');
  // ─────────────────────────────────────────────────────────

  const reputationSBT = await sdk.assets.create({
    name: `Driver Reputation SBT — ${driverParty.name}`,
    description: 'Soulbound reputation token representing verified driver safety score',
    rightType: RightType.BEHAVIOR,
    issuerId: cometOrg.id,
    jurisdiction: {
      countryCode: 'AE',
      regulatoryFramework: 'UAE_LOYALTY',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    validityPeriod: { isPerpetual: true, startTime: new Date().toISOString() },
    transferabilityRules: {
      mode: TransferabilityMode.NON_TRANSFERABLE,
      lockupPeriodSeconds: 0,
      requireKyc: true,
    },
    metadata: {
      assetType: 'BEHAVIOR',
      scoreType: 'SAFETY_REPUTATION',
      oracleScore: newScore.score,
      cometDriverId: driverId,
      lastUpdated: new Date().toISOString(),
    },
  });

  await sdk.assets.transition(reputationSBT.id, LifecycleState.PENDING_VERIFICATION, cometOrg.id);
  await sdk.assets.verify(reputationSBT.id, cometOrg.id);
  await sdk.assets.activate(reputationSBT.id, cometOrg.id);

  const mintResult = await sdk.tokens.mint(reputationSBT.id, driverParty.id, '1');
  if (mintResult.success) {
    log(`   ✓ ReputationSBT minted: ${reputationSBT.name}`, colors.green);
    log(`   ✓ Score embedded: ${newScore.score}/100`, colors.green);
    log(`   ✓ Non-transferable (soulbound) — cannot be sold or traded`, colors.green);
  }

  await sleep(1000);

  // ─────────────────────────────────────────────────────────
  step(11, 'Index safety events and generate compliance report');
  // ─────────────────────────────────────────────────────────

  const indexer = new IndexingEngine();

  indexer.indexEvent({
    type: IndexedEventType.MINT,
    assetId: reputationSBT.id,
    actor: cometOrg.id,
    data: { to: driverParty.id, amount: '1' },
  });

  indexer.indexEvent({
    type: IndexedEventType.COMPLIANCE_CHECK,
    assetId: reputationSBT.id,
    actor: cometOrg.id,
    data: {
      action: 'SAFETY_SCORE_UPDATE',
      score: newScore.score,
      driverId,
      source: 'CHAINLINK_FUNCTIONS',
    },
  });

  indexer.indexEvent({
    type: IndexedEventType.KYC_VERIFIED,
    assetId: reputationSBT.id,
    actor: cometOrg.id,
    data: { investor: driverParty.id, level: 'VERIFIED' },
  });

  const report = indexer.generateComplianceReport(reputationSBT.id);

  log(`   ✓ Indexed 3 events (MINT, COMPLIANCE_CHECK, KYC_VERIFIED)`, colors.green);
  log(`   ✓ Compliance report generated:`, colors.green);
  console.log(`      Total events: ${report.summary.totalEvents}`);
  console.log(`      Asset: ${reputationSBT.id.substring(0, 16)}...`);

  await sleep(1000);

  // ─────────────────────────────────────────────────────────
  step(12, 'DECO privacy proof — driver meets insurance threshold');
  // ─────────────────────────────────────────────────────────

  const deco = new DecoPlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    verifierAddress: '0x0000000000000000000000000000000000000001',
  });

  log('   Creating DECO proof: driver score >= 70 (insurance threshold)', colors.blue);
  log('   → Proves eligibility WITHOUT revealing actual score', colors.blue);

  const proofResult = await deco.createProof({
    proofType: DecoProofType.INSURANCE_COVERAGE,
    dataSource: {
      url: `${COMET_API}/simulate/safety-score/${driverId}`,
      method: 'GET',
      jsonPath: '$.score',
    },
    claim: {
      field: 'score',
      operator: 'gte',
      threshold: 70,
    },
    metadata: {
      purpose: 'Insurance eligibility verification',
      driverId,
      assetId: reputationSBT.id,
    },
  });

  if (proofResult.success) {
    log(`   ✓ DECO proof created: ${proofResult.data.proofId}`, colors.green);
    log(`   ✓ Proof type: ${DecoProofType[DecoProofType.INSURANCE_COVERAGE]}`, colors.green);
    log(`   ✓ Claim verified: score >= 70 (without revealing ${newScore.score})`, colors.green);
  } else {
    log(`   ⚠️  DECO proof simulated (no attestation node): ${proofResult.error}`, colors.yellow);
    log(`   ✓ In production, DECO proves score >= 70 without revealing ${newScore.score}`, colors.green);
  }

  deco.destroy();

  await sleep(1000);

  // ─────────────────────────────────────────────────────────
  header('Demo Complete');
  // ─────────────────────────────────────────────────────────

  console.log(`
  ${colors.green}Key Takeaways:${colors.reset}

  1. ${colors.bright}Data comes from COMET${colors.reset} - Not hardcoded in SDK
     Real telematics, deliveries, and ratings from the app

  2. ${colors.bright}Penalties are configurable${colors.reset} - Fetched via Chainlink Functions
     Can be adjusted without redeploying smart contracts

  3. ${colors.bright}Scores are oracle-verified${colors.reset} - Calculated on Chainlink DON
     Multiple nodes verify the calculation, not just one server

  4. ${colors.bright}Results go on-chain${colors.reset} - Stored in ReputationSBT
     Immutable, verifiable driver reputation

  5. ${colors.bright}SDK integration${colors.reset} - COMET data flows through full SDK pipeline
     Parties, Assets, Tokens, Indexing, and Compliance

  6. ${colors.bright}Privacy-preserving proofs${colors.reset} - DECO proves eligibility
     Insurance threshold met without revealing actual score

  ${colors.cyan}SDK Features Used:${colors.reset}
  • TokenisationSDK (Parties, Assets, Tokens)
  • ChainlinkFunctionsPlugin (oracle-verified scoring)
  • IndexingEngine (event indexing & compliance reports)
  • DecoPlugin (privacy-preserving proofs)

  ${colors.cyan}To connect to REAL COMET:${colors.reset}
  Replace ${COMET_API} with https://api.comet.ahoy.dev
  and add your API credentials to CometDataAdapter

`);
}

// Run the demo
runDemo().catch(console.error);
