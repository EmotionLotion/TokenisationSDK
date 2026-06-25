# Loyalty Minimal

A tiny external app that uses `@tokenisation/core` to run the full loyalty
lifecycle against a local API server: **create program → open account → earn →
balance → redeem → consume**. This is the runnable companion to
[`docs/recipes/LOYALTY_POINTS.md`](../../docs/recipes/LOYALTY_POINTS.md) and the
example referenced by the loyalty Module Spec (§15).

Redeem and consume flow through the audited, idempotent **Right Action**
primitive, so this example also demonstrates passing an `Idempotency-Key`.

## Prerequisites

1. **Run the API server** on `http://localhost:3001` (see the repo README; for
   local dev: `cd server && pnpm dev`).
2. **Get a real API key** (the SDK requires a key starting with `sk_`) scoped for
   loyalty (`read:loyalty` + `write:loyalty`, or a `*` sandbox key):
   ```bash
   cd server && pnpm db:seed --org-only      # prints a one-time sk_test_... key
   export AHOY_API_KEY="sk_test_..."
   ```

## Install

```bash
npm install @tokenisation/core
npm install -D tsx typescript @types/node
```

The root entry (`createApiClient`, types) is framework/DB-agnostic — no react,
drizzle, or pg needed for a backend consumer.

## Run

```bash
npx tsx src/index.ts
```

Expected output (ids will vary):

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

## What it shows

- `client.loyalty.programs.create` / `accounts.create` — set up the program + holder.
- `client.loyalty.points.earn` / `balance` — credit and read points.
- `client.loyalty.points.redeem` / `consume` — spend through the Right Action
  primitive, with a **required `Idempotency-Key`**.
- **Idempotent replay**: re-issuing the same redeem key returns the original
  receipt and does not debit twice.
- `client.loyalty.transactions.list` — the append-only ledger history.

## Files

- `src/index.ts` — the end-to-end smoke test.
