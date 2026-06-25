/**
 * Minimal external loyalty consumer — runs the full loyalty lifecycle against a
 * local API server using @tokenisation/core: create program → open account →
 * earn → balance → redeem → consume, including an idempotent replay.
 *
 * Companion to docs/recipes/LOYALTY_POINTS.md and the loyalty Module Spec (§15).
 *
 * Prereqs:
 *   1. Server running on :3001 (see repo README; for local dev: `cd server && pnpm dev`).
 *   2. A real API key scoped for loyalty (read:loyalty + write:loyalty, or a `*` key):
 *      `cd server && pnpm db:seed --org-only`  → copy the printed `sk_test_...`.
 *      export AHOY_API_KEY="sk_test_..."
 *
 * Run:  npx tsx src/index.ts
 */
import { createApiClient } from '@tokenisation/core';

const apiKey = process.env.AHOY_API_KEY;
if (!apiKey) {
  throw new Error('Set AHOY_API_KEY to a seeded sk_test_ key (cd server && pnpm db:seed --org-only)');
}

const client = createApiClient({ apiKey, baseUrl: 'http://localhost:3001' });

async function main() {
  // 1. Program with one earn rule (action → points).
  const program = await client.loyalty.programs.create({
    name: 'FlyPlus Rewards',
    currency: 'POINTS',
    earnRules: [{ action: 'flight_booked', points: 500 }],
  });
  console.log('Created program:', program.id);

  // 2. Open an account for a holder.
  const account = await client.loyalty.accounts.create({
    programId: program.id,
    investorId: 'holder-123',
  });
  console.log('Opened account: ', account.id);

  // 3. Earn (per the program's earn rule), then read the balance.
  await client.loyalty.points.earn(account.id, { action: 'flight_booked' });
  const afterEarn = await client.loyalty.points.balance(account.id);
  console.log(`Earned. Balance: ${afterEarn.balance} (tier: ${afterEarn.currentTier})`);

  // 4. Redeem points for value — Idempotency-Key is REQUIRED (3rd arg).
  //    Keys are derived from the (fresh-per-run) account id so the example is
  //    safely re-runnable: each run gets a new account → new keys, while the
  //    replay in step 6 reuses the SAME key to prove no double-spend.
  const redeemKey = `redeem-${account.id}`;
  const redeem = await client.loyalty.points.redeem(
    account.id,
    { amount: 250, action: 'gift_card', redemptionRate: 100 },
    redeemKey,
  );
  console.log(
    `Redeemed 250 → value ${redeem.redeemedValue}  | balanceAfter ${redeem.balanceAfter} | receipt ${redeem.receipt.kind}/${redeem.receipt.status}`,
  );

  // 5. Consume points (no cash value) — also idempotent.
  const consume = await client.loyalty.points.consume(
    account.id,
    { amount: 100, action: 'unlock_perk' },
    `consume-${account.id}`,
  );
  console.log(
    `Consumed 100               | balanceAfter ${consume.balanceAfter} | receipt ${consume.receipt.kind}/${consume.receipt.status}`,
  );

  // 6. Idempotent replay: re-issuing the SAME redeem key must NOT debit again.
  const replay = await client.loyalty.points.redeem(
    account.id,
    { amount: 250, action: 'gift_card', redemptionRate: 100 },
    redeemKey,
  );
  console.log('Idempotent replay returned the same receipt (no double-spend):', replay.receipt.id === redeem.receipt.id);

  // 7. Ledger history.
  const history = await client.loyalty.transactions.list(account.id, { limit: 10 });
  console.log(`History: ${history.total} transactions`);

  console.log('Done.');
}

main()
  .then(() => process.exit(0)) // exit cleanly (HTTP keep-alive sockets would otherwise hang the process)
  .catch((err) => {
    console.error('Failed:', err?.code ?? '', err?.message ?? err);
    process.exit(1);
  });
