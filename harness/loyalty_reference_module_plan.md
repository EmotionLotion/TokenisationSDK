# Loyalty Reference Module — Implementation Plan (T9)

Spec: `docs/modules/loyalty.module.md`. T9a (this) = spec + plan, no source. Implementation is split so each subtask is narrow, tested, and independently verifiable per `verification_rules.md`. Each ends with: build/typecheck green, its tests pass, full server suite no-regression, memory updated.

## Why this split
The contract requires server-persistence on the RightAction primitive, RBAC, audit, idempotency, SDK, docs, UI, tests. That is too broad for one safe change, so: **ledger+service → API → SDK → docs/example/UI**, dependency-ordered. T6a's RightAction core already exists; loyalty supplies the **module-owned balance ledger** and wires REDEEM/CONSUME/EXPIRE/REVOKE through it.

## T9b — Server persistence + LoyaltyService (core)
- New `loyalty_balances` ledger (FIFO point batches: id, org_id, subject_id, program_id, remaining, earned_at, expires_at, frozen, created_at) via the lazy `ensureTable()`/`rawQuery` convention (DB-agnostic; auto-exists in test DB). No central drizzle-schema change.
- `LoyaltyService`: `issuePoints` (mint batch, idempotent, audit `loyalty.points.issued`), `getBalance` (available vs expired vs frozen), and `applyRedeemOrConsume` that (a) calls `RightActionService.createAction` (REDEEM/CONSUME) and (b) atomically FIFO-decrements the ledger, recording balanceBefore/After; underflow → `INSUFFICIENT_BALANCE` (no decrement, action FAILED). `expirePoints` (EXPIRE) and `revokePoints` (REVOKE, admin) too.
- `LoyaltyPointsMetadata` zod model (schemaVersion 1).
- Tests `server/src/__tests__/loyalty.service.test.ts`: issue/balance, redeem decrement + redeemedValue, consume, underflow, idempotent replay, expire, revoke, tenant isolation, audit emission.
- Mark in-memory `LoyaltyPointsEngine.redeem()` as non-authoritative (doc comment), do not delete.
- Deps: T6a. Closes: G12-loyalty (persistence), G8 (loyalty on primitive), G11 (loyalty tests start).

## T9c — Server API surface
- `/api/v1/loyalty/*` routes (issue, balance, redeem, consume, actions history) with zod validation, `apiKeyMiddleware`+`tenantContextMiddleware`+`requireScope(action,'loyalty')`, `Idempotency-Key` on mutations, OpenAPI JSDoc, no stack traces. Mount in server `index.ts`.
- Route tests (allow/deny by scope, idempotency, tenant).
- Deps: T9b.

## T9d — SDK surface
- `client.loyalty.{issue,balance,redeem,consume,verifyAccess}` typed module (mirrors AssetsModule pattern; bare-object/receipt returns; unified errors), importable from `@tokenisation/core`.
- SDK tests (mock fetch: Bearer + Idempotency-Key + envelope) following `AssetsResponseContract.test.ts`.
- Deps: T9c.

## T9e — Docs + example + minimal UI + acceptance
- `docs/recipes/LOYALTY_POINTS.md` + runnable `examples/loyalty-minimal/` (issue → balance → redeem via SDK against local server).
- Minimal operator UI (issue/balance/redeem) in `pack-loyalty/src/ui` (excluded from logic build).
- Run `module_acceptance_checklist.md` end-to-end; record evidence; set loyalty maturity `reference`.
- Deps: T9b, T9c, T9d. Closes: G9 (loyalty docs), G10 (loyalty UI), G12-loyalty (full conformance).

## Acceptance (T9 done when)
- Loyalty passes `module_acceptance_checklist.md` (reference tier).
- redeem/consume/expire/revoke run through `RightActionService` (no in-memory authoritative path).
- Server suite green; SDK/core/server typecheck+build green; recipe + example runnable.

## Out of scope (stay gated)
- compute/dataset/model/agent modules (need their own Module Spec + T5a for USAGE/LICENSE).
- securities-redemption migration onto the primitive (T10 follow-up).
- T7 policy unification, T8 metadata registry (referenced as deps; loyalty uses inline schema + off-chain policy until then).
- on-chain tokenized AhoyToken variant.
