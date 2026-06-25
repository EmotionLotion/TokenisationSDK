# Compute Credits Module — Implementation Plan (M1)

Spec: `docs/modules/compute.module.md`. **M1a (this) = spec + plan, NO source.** Implementation is split so each subtask is narrow, tested, and independently verifiable per `verification_rules.md`. Each ends with: build/typecheck green, its tests pass, full server suite no-regression, memory updated, verifier PASS.

## Hard prerequisite — gated until T5a
The `USAGE` right type is **ratified** (T5/D-10) but its enum member lands in **T5a**. **No M1b… task may start until T5a is `done`** (and this spec accepted). T6 branches on attributes (`consumable`/`divisible`), so the *consumption* logic needs no enum change — only persisting `asset.rightType = USAGE` does. M1 therefore depends on **T5a** (not just the satisfied foundation gate).

## Why this split
The contract requires server-persistence on the Right Action primitive, RBAC, audit, idempotency, SDK, docs, UI, tests. Too broad for one safe change, so: **ledger+service → API → SDK → docs/example/UI**, dependency-ordered. T6a's Right Action core already exists; compute credits supply the **module-owned balance ledger** and wire CONSUME/REDEEM/EXPIRE/REVOKE through it — the loyalty pattern (D-13), typed `USAGE` instead of `BEHAVIOR`.

## M1b — Server persistence + ComputeCreditService (core)
- Module-owned **account-balance** ledger (per D-13; NOT a FIFO batch table): `compute_credit_accounts` (id, org_id, subject_id, gpu_model, balance, frozen, created_at) + append-only `compute_credit_transactions` (id, org_id, account_id, type ∈ issue|consume|redeem|expire|revoke, quantity, balance_before, balance_after, right_action_id?, created_at), via the lazy `ensureTable()`/`rawQuery` convention (DB-agnostic; auto-exists in test DB). No central drizzle-schema change.
- `ComputeCreditService`: `issueCredits` (mint, idempotent, audit `compute.credits.issued`), `getBalance`, and `applyConsumeOrRedeem` that (a) calls `RightActionService.createAction` (CONSUME/REDEEM) and (b) atomically debits the ledger, recording `balanceBefore/After`; underflow → `INSUFFICIENT_BALANCE` (no debit, action FAILED). `expireCredits` (EXPIRE) and `revokeCredits` (REVOKE, admin) too.
- `ComputeCreditMetadata` zod model (schemaVersion 1) in `packages/compute/src/models/` — reuse `GPUModelEnum` from the existing `ComputeMetadata.ts`.
- Tests `server/src/__tests__/compute-credits.service.test.ts`: issue/balance, consume decrement, redeem `redeemedValue`, underflow, idempotent replay, expire, revoke, tenant isolation, audit emission, `NOT_CONSUMABLE` guard.
- Deps: **T5a**, T6a. Closes: module persistence, G8 (compute on the primitive), G11 (compute tests start).

## M1c — Server API surface
- `/api/v1/compute/credits/*` routes (issue, balance, consume, redeem, actions history) with zod validation, `apiKeyMiddleware`+`tenantContextMiddleware`+**`requireScope(action,'compute')`** (closes the G3 gap that the legacy `gpu-compute.routes.ts` left open), `Idempotency-Key` on mutations, OpenAPI JSDoc, no stack traces. Mount in `server/src/index.ts`.
- Route tests (allow/deny by scope, idempotency, tenant isolation).
- Deps: M1b.

## M1d — SDK surface
- `client.compute.{issue,balance,consume,redeem,verifyAccess,actions}` typed module (mirrors `LoyaltyModule`; bare-object/receipt returns; unified errors; idempotencyKey on mutations), importable from `@tokenisation/core`.
- SDK tests (mock fetch: Bearer + Idempotency-Key + envelope unwrap), following `sdk/tests/LoyaltyModule.test.ts`.
- Deps: M1c.

## M1e — Docs + example + minimal UI + acceptance
- `docs/recipes/COMPUTE_CREDITS.md` + runnable `examples/compute-credits-minimal/` (issue → balance → consume → verify via SDK against local server).
- Minimal operator UI (issue/balance/consume/revoke) in `packages/compute/src/ui` (excluded from logic build).
- Run `module_acceptance_checklist.md` end-to-end; record evidence; set compute-credits maturity `reference`.
- Deps: M1b, M1c, M1d. Closes: G9 (docs), G10 (UI), module full conformance.

## Acceptance (M1 done when)
- compute-credits passes `module_acceptance_checklist.md` (reference tier).
- consume/redeem/expire/revoke run through `RightActionService` (no bespoke/in-memory path).
- Server suite green; SDK/core/server typecheck+build green; recipe + example runnable.
- `USAGE` landed in the enum (T5a) and persisted on `COMPUTE_CREDIT` assets.

## Out of scope (stay separate)
- The existing **GPU-node OWNERSHIP** stack (`packages/compute`, `gpu-compute.*`, `ComputeToken`/ERC-3643, revenue distribution) — that is the supply side; credits integrate with it but do not modify it (beyond the optional `GPUComputeOracle` pricing read).
- The demo `ComputeCreditPack` (federated-ML earn-credit, `VERIFICATION` assets) — non-authoritative; not migrated.
- On-chain tokenized credit variant (§13) — optional, deferred.
- T7 policy unification, T8 metadata registry (referenced as deps; module uses inline schema + off-chain policy until then).
- dataset/model-license + AI-agent-access modules (own specs; LICENSE modules also need T5a).
