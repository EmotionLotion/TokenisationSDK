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

  ${colors.cyan}To connect to REAL COMET:${colors.reset}
  Replace ${COMET_API} with https://api.comet.ahoy.dev
  and add your API credentials to CometDataAdapter

`);
}

// Run the demo
runDemo().catch(console.error);
