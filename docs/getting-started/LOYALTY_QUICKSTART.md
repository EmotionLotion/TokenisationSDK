---
sidebar_position: 1
title: Developer Quickstart (Loyalty)
---

# Developer Quickstart — Loyalty Points

This is the **fastest verified path** from a clone to a working programmable
right. It is built on **loyalty**, the SDK's [certified **reference module**](../modules/loyalty.module.md):
the one vertical proven end-to-end against the
[Programmable Right Module contract](../../harness/programmable_right_module_contract.md)
(server-persisted ledger, audited + idempotent redemption, RBAC, runnable example).

By the end you will have created a loyalty program, opened an account, earned
points, and redeemed them — every value-changing step hash-chained in the audit
log and safe to retry.

> **Why loyalty first?** Other verticals (real estate, compute, …) ship as packs
> but are still being brought to full conformance. Loyalty is the one you can run
> today against a local server with no chain, no custody, and no external
> dependencies.

---

## 1. Install & build

Requires Node 20+ and `pnpm`.

```bash
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
pnpm install && pnpm -r run build
```

`pnpm -r run build` compiles `@tokenisation/core`, which the example consumes via
a `file:` link.

## 2. Start the API server

The server runs on **SQLite with zero config** and listens on
`http://localhost:3001`.

```bash
cp server/.env.example server/.env
cd server && pnpm dev
```

Leave it running in this terminal; use a second terminal for the steps below.

## 3. Get an API key

The SDK requires a key that starts with `sk_`. Seed a sandbox org + key:

```bash
cd server && pnpm db:seed --org-only      # prints a one-time sk_test_... key
export AHOY_API_KEY="sk_test_..."          # paste the printed key
```

The seeded key carries coarse `read` + `write` scopes. The permission matcher
treats a coarse action as covering every resource under it
(`write` ⇒ `write:loyalty`), so this key satisfies the loyalty routes'
`requireScope('write', 'loyalty')` / `requireScope('read', 'loyalty')` guards. No
per-resource scope wiring is needed for the sandbox.

## 4. Run the loyalty lifecycle (SDK)

A runnable end-to-end consumer lives at
[`examples/loyalty-minimal/`](../../examples/loyalty-minimal/). With the server
running and `AHOY_API_KEY` exported:

```bash
cd examples/loyalty-minimal
npm install        # tsx + types only; @tokenisation/core is linked from the repo
npx tsx src/index.ts
```

Expected output (ids vary):

```
Created program: <uuid>
Opened account:  <uuid>
Earned. Balance: 500 (tier: )
Redeemed 250 → value 2.50  | balanceAfter 250 | receipt REDEEM/COMPLETED
Consumed 100               | balanceAfter 150 | receipt CONSUME/COMPLETED
Idempotent replay returned the same receipt (no double-spend): true
History: 3 transactions
Done.
```

The same flow, inline:

```ts
import { createApiClient } from '@tokenisation/core';

const client = createApiClient({
  apiKey: process.env.AHOY_API_KEY!,   // an sk_ key
  baseUrl: 'http://localhost:3001',
});

// 1. Program with one earn rule (action → points).
const program = await client.loyalty.programs.create({
  name: 'FlyPlus Rewards',
  currency: 'POINTS',
  earnRules: [{ action: 'flight_booked', points: 500 }],
});

// 2. Open an account for a holder.
const account = await client.loyalty.accounts.create({
  programId: program.id,
  investorId: 'holder-123',
});

// 3. Earn per the rule, then read the balance + tier.
await client.loyalty.points.earn(account.id, { action: 'flight_booked' });
const balance = await client.loyalty.points.balance(account.id); // { balance: 500, ... }

// 4. Redeem points for value — Idempotency-Key is REQUIRED (3rd arg).
const result = await client.loyalty.points.redeem(
  account.id,
  { amount: 250, action: 'gift_card', redemptionRate: 100 },
  'redeem-holder-123-001',           // stable key → safe to retry
);
// result.balanceAfter === 250, result.redeemedValue === '2.50' (250 / 100)

// 5. Consume points (no cash value) — also idempotent.
await client.loyalty.points.consume(
  account.id,
  { amount: 100, action: 'unlock_perk' },
  'consume-holder-123-001',
);
```

`redeem`, `consume`, and `revoke` are mutations that flow through the audited
**Right Action** primitive, so the SDK makes the `Idempotency-Key` a **required**
argument. Replaying a key returns the original receipt without debiting twice.

## 5. The same flow over HTTP (curl)

Auth is `Authorization: Bearer sk_...`; mutations carry an `Idempotency-Key`.

```bash
# Create a program
curl -X POST http://localhost:3001/api/v1/loyalty/programs \
  -H "Authorization: Bearer $AHOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"FlyPlus Rewards","earnRules":[{"action":"flight_booked","points":500}]}'

# Redeem (Idempotency-Key REQUIRED)
curl -X POST http://localhost:3001/api/v1/loyalty/accounts/<account-id>/redeem \
  -H "Authorization: Bearer $AHOY_API_KEY" \
  -H "Idempotency-Key: redeem-holder-123-001" \
  -H "Content-Type: application/json" \
  -d '{"amount":250,"action":"gift_card","redemptionRate":100}'
```

The full route table (earn, balance, consume, transactions, revoke) is in the
[Loyalty Points recipe](../recipes/LOYALTY_POINTS.md#rest--curl).

## Good to know

- **Mutations need an `Idempotency-Key`.** Use a stable, operation-specific key
  so retries never double-spend.
- **`programs`/`accounts` list & get are not yet exposed** over HTTP/SDK — keep
  the ids returned by `create` client-side (tracked as `T9d-FOLLOWUP-1`).
- **No chain required.** The authoritative points ledger is off-chain; tokenised
  variants are out of scope for the quickstart.

## Next steps

- [Loyalty Points recipe](../recipes/LOYALTY_POINTS.md) — full model, RBAC, audit, limitations.
- [Loyalty Module Spec](../modules/loyalty.module.md) — the 17-section conformance spec.
- [`examples/loyalty-minimal/`](../../examples/loyalty-minimal/) — the runnable source.
- [Aspirational real-estate / securities walkthrough](./QUICKSTART.md) — broader API surface, not yet certified end-to-end.
</content>
</invoke>
