---
sidebar_position: 5
title: Loyalty Points
---

# Loyalty Points

Issue, hold, and spend programmable loyalty points as an **off-chain, audited,
idempotent** programmable right. Loyalty is the SDK's **reference module**: it is
the proof that the [Programmable Right Module contract](../modules/loyalty.module.md)
works end-to-end on the least-mature vertical. Redeem / consume / revoke all flow
through the unified **Right Action** primitive (`POST /api/v1/rights/actions`
internally), so every value-changing operation is hash-chained in the audit log
and safe to retry.

## Model

Loyalty has three persisted, org-scoped entities (the **module-owned ledger**):

| Entity | What it is |
|---|---|
| **Program** | The rules: name, currency, `earnRules` (action → points), optional tiers. |
| **Account** | A holder's balance within a program (`balance`, `lifetimeEarned`, `lifetimeSpent`, `currentTier`). |
| **Transaction** | An append-only ledger row (`earn` / `spend` / `expire` / `adjust`) recording `balanceBefore` → `balanceAfter`. |

The balance is the account's running integer total over its transaction ledger
(an account-balance model — **not** a FIFO batch ledger). Points are
**non-transferable** by default, **divisible**, **expirable**, **revocable**, and
**consumable** (RightProfile `loyalty-points` → core right type `BEHAVIOR`).

## Lifecycle

```
create program ──► open account ──► earn ──► (balance / history)
                                       │
                                       ├──► redeem   (points → value, RightAction REDEEM)
                                       ├──► consume  (points spent, RightAction CONSUME)
                                       ├──► expire   (batch job,    RightAction EXPIRE)
                                       └──► revoke   (admin clawback, RightAction REVOKE)
```

| Operation | Right Action kind | Ledger effect | Audit event |
|---|---|---|---|
| `redeem` | `REDEEM` | debit; returns `redeemedValue = amount / redemptionRate`; `minRedemptionAmount` enforced | `right.redeem.completed` |
| `consume` | `CONSUME` | debit (no cash value) | `right.consume.completed` |
| `expire` | `EXPIRE` | debit stale points (scheduler) | `right.expire.expired` |
| `revoke` | `REVOKE` | zero the balance (admin) | `right.revoke.completed` + DecisionReceipt |
| membership check | `VERIFY_ACCESS` | read-like | — |

`redeem`, `consume`, and `revoke` are **mutations and require an
`Idempotency-Key`** — the SDK enforces it as a required argument. Replaying the
same key returns the original receipt without touching the ledger twice
(no double-spend).

## SDK usage

`client.loyalty.*` is importable from `@tokenisation/core` (or `@tokenisation/sdk`).
All methods return bare objects and throw unified SDK errors.

```ts
import { createApiClient } from '@tokenisation/core';

const client = createApiClient({
  apiKey: process.env.AHOY_API_KEY!, // an sk_ key scoped to read:loyalty / write:loyalty
  baseUrl: 'http://localhost:3001',
});

// 1. Define the program and its earn rules.
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

// 3. Earn (per an earn rule on the program).
await client.loyalty.points.earn(account.id, { action: 'flight_booked' });

// 4. Read the balance + tier.
const balance = await client.loyalty.points.balance(account.id);
console.log(balance.balance); // 500

// 5. Redeem points for value — Idempotency-Key is REQUIRED (3rd arg).
const result = await client.loyalty.points.redeem(
  account.id,
  { amount: 250, action: 'gift_card', redemptionRate: 100 },
  'redeem-holder-123-001', // stable key → safe to retry
);
console.log(result.receipt.kind);   // 'REDEEM'
console.log(result.balanceAfter);   // 250
console.log(result.redeemedValue);  // '2.50'  (250 / 100)

// 6. Consume points (no cash value).
await client.loyalty.points.consume(
  account.id,
  { amount: 100, action: 'unlock_perk' },
  'consume-holder-123-001',
);

// 7. History.
const { data, total } = await client.loyalty.transactions.list(account.id, { limit: 10 });
```

## REST / curl

Auth is `Authorization: Bearer sk_...`. Mutations carry an `Idempotency-Key` header.

```bash
# Create a program
curl -X POST http://localhost:3001/api/v1/loyalty/programs \
  -H "Authorization: Bearer $AHOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"FlyPlus Rewards","earnRules":[{"action":"flight_booked","points":500}]}'

# Open an account
curl -X POST http://localhost:3001/api/v1/loyalty/accounts \
  -H "Authorization: Bearer $AHOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"programId":"<program-id>","investorId":"holder-123"}'

# Earn
curl -X POST http://localhost:3001/api/v1/loyalty/accounts/<account-id>/earn \
  -H "Authorization: Bearer $AHOY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"flight_booked"}'

# Balance
curl http://localhost:3001/api/v1/loyalty/accounts/<account-id>/balance \
  -H "Authorization: Bearer $AHOY_API_KEY"

# Redeem (Idempotency-Key REQUIRED)
curl -X POST http://localhost:3001/api/v1/loyalty/accounts/<account-id>/redeem \
  -H "Authorization: Bearer $AHOY_API_KEY" \
  -H "Idempotency-Key: redeem-holder-123-001" \
  -H "Content-Type: application/json" \
  -d '{"amount":250,"action":"gift_card","redemptionRate":100}'
```

## Authorization (RBAC)

Routes guard with resource-level `requireScope(action, 'loyalty')` and are
org-scoped (`tenantContextMiddleware`):

| Scope | Grants |
|---|---|
| `read:loyalty` | balance, transaction history |
| `write:loyalty` | create program/account, earn, redeem, consume, revoke |

> Revoke (admin clawback) currently requires `write:loyalty`. It will tighten to a
> dedicated `write:loyalty:revoke` once API keys carry role permissions
> (harness `T2a`).

## Audit

Every value-changing operation emits a hash-chained audit entry
(`right.<kind>.<status>`); `REVOKE` additionally emits a `DecisionReceipt`. There
is no silent mutation — the ledger transaction and the Right Action receipt are
both persisted and linked by `metadata.transactionId`.

## Known limitations

- **`programs`/`accounts` list & get are not yet exposed** over HTTP/SDK (only
  `create`, `points.*`, and `transactions.list` have routes today). Keep the
  returned ids client-side. Tracked as `T9d-FOLLOWUP-1`.
- **Metadata validation is route-level zod** (`createProgramSchema`,
  `spendSchema`, …) today; a versioned per-right-type metadata registry lands in
  harness `T8`.
- **On-chain variants** (tokenised AhoyToken) are out of scope; the authoritative
  points ledger is off-chain.

## Try it

A runnable end-to-end example lives in
[`examples/loyalty-minimal/`](../../examples/loyalty-minimal/README.md):
program → account → earn → balance → redeem → consume against a local server.
