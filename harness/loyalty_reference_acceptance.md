# Loyalty — Reference-Module Acceptance

Result of running `harness/module_acceptance_checklist.md` against the loyalty
module (RightProfile `loyalty-points` → core right type `BEHAVIOR`). This is the
T9e certification artifact: loyalty is the SDK's **reference module**, the proof
that the Programmable Right Module contract holds end-to-end on the least-mature
vertical.

- **Module:** loyalty (`loyalty-points`)
- **Maturity tier target:** `reference`
- **Task:** T9e (closes T9)
- **Date:** 2026-06-25
- **Spec:** `docs/modules/loyalty.module.md` (all 17 contract sections present)
- **Verdict (builder):** reference-tier on the core contract, with three
  documented exceptions routed to existing follow-up tasks (see *Exceptions*).
  **Independent `verifier` sign-off required before T9e/T9 → `done`** (maker-checker).

> Builder is not the final judge. This file records evidence + the builder's
> reading of the gate; the `verifier` agent confirms or rejects it.

---

## Evidence block (real commands, this iteration)

| Check | Command | Result |
|---|---|---|
| Loyalty server tests | `pnpm exec vitest run src/__tests__/loyalty.right-action.test.ts src/__tests__/loyalty.routes.test.ts` | **12/12 pass** (right-action 7, routes 5) |
| Full server suite (regression) | `pnpm exec vitest run` (server) | **15 files / 311 tests pass**, no regression |
| Server typecheck | `pnpm exec tsc --noEmit` (server) | **PASS** (exit 0) |
| Core conformance + typecheck | `pnpm test` + `tsc --noEmit` (packages/core) | **27/27 pass**, typecheck **PASS** |
| SDK loyalty surface | `pnpm exec vitest run tests/LoyaltyModule.test.ts` (sdk) | **7/7 pass** |
| pack-loyalty typecheck | `pnpm exec tsc --noEmit` (packages/pack-loyalty) | **PASS** (exit 0) |
| Runnable example typecheck | `npm install && npx tsc --noEmit` (examples/loyalty-minimal) | **PASS** (exit 0) against the built `@tokenisation/core` types |

**Defect fixed in this iteration:** five leaked tool-call tags
(`</content>` / `</invoke>`) had been written into the body of four prior-session
T9e files, corrupting them (the example failed `tsc` with `TS1110: Type expected`).
Stripped from `examples/loyalty-minimal/src/index.ts`,
`examples/loyalty-minimal/README.md`, `docs/recipes/LOYALTY_POINTS.md`, and
`packages/pack-loyalty/src/ui/LoyaltyOperatorPanel.tsx`. A repo-wide scan confirms
no others remain.

---

## Spec gate — [spec]

- [x] Module Spec at `docs/modules/loyalty.module.md`, all 17 sections filled.
- [x] Right type (§3) references a **T5-ratified** value (`BEHAVIOR`).
- [x] Redemption/consumption/revocation (§8) maps onto the **T6** Right Action
      primitive (REDEEM / CONSUME / EXPIRE / REVOKE; membership → VERIFY_ACCESS).
- [x] Policy model (§5) declared. *Note:* loyalty is authoritative **off-chain**;
      on-chain projection is explicitly out of scope (§13), not omitted.
- [x] `requires`/`chains` declared; maturity tier target = `reference`.

## Implementation gate (reference tier)

**Domain & data**
- [x] `loyalty-points` maps to the core right model (`BEHAVIOR`; non-transferable
      default, divisible, expirable, revocable, consumable).
- [~] Metadata validated on write via **route-level zod** (`createProgramSchema`,
      `spendSchema`, …); types exported from SDK. A **versioned per-right-type
      metadata registry** is deferred to **T8** (Exception 1). Spec §4 already
      records this.

**Authorization & tenancy (G3 / D-8)**
- [x] Routes use resource-level `requireScope(action, 'loyalty')`.
- [x] All reads/writes org-scoped (`tenantContextMiddleware`).
- [x] RBAC tests: allow + deny in `loyalty.routes.test.ts`; tenant isolation in
      `loyalty.right-action.test.ts`.

**Surfaces**
- [x] SDK: `client.loyalty.*` importable from `@tokenisation/core`; bare-object
      returns; unified errors (`LoyaltyModule.test.ts`).
- [x] Server: `/api/v1/loyalty/*` with zod validation, idempotency on mutations,
      OpenAPI JSDoc, **no stack traces** in error responses.
- [x] On-chain: `chains` empty for loyalty — N/A, no parallel token framework.

**Lifecycle**
- [x] Issuance/earn path implemented per §6, idempotent.
- [x] Transfer/access rules enforced (non-transferable by default).
- [x] Redeem/consume/revoke implemented on the **T6 Right Action primitive**
      (server-persisted, audited, idempotent) — no in-memory flow. Conformance
      tests pass: idempotent replay (no double-spend), insufficient-balance,
      below-min, revoke clawback, audit emission, tenant isolation.

**Audit (G4)**
- [x] Every value-changing op emits a hash-chained audit entry
      (`right.<kind>.<status>`); REVOKE additionally emits a `DecisionReceipt`.
- [x] Audit emission proven by `loyalty.right-action.test.ts`.

**Quality (G11)**
- [x] Package-level conformance suite passes (core 27/27).
- [x] Integration path passes: program → account → earn → balance → redeem
      (e2e in `loyalty.routes.test.ts`; full lifecycle in the example).
- [x] `typecheck` + `build` green for loyalty package(s); full server suite green
      (no regression).

**Docs & UI (G9 / G10)**
- [x] `docs/recipes/LOYALTY_POINTS.md` + runnable `examples/loyalty-minimal/`
      (now with `package.json` + `tsconfig.json`; typechecks against the SDK).
- [~] Operator UI component exists (`packages/pack-loyalty/src/ui/LoyaltyOperatorPanel.tsx`,
      typechecks) but is **not yet integrated into a running dashboard or tested
      end-to-end** → **Exception 2** (UI showcase is a separate roadmap step,
      CLAUDE.md §16).

## Sign-off

- [x] Core conformance suite passes against the module's primitives.
- [x] Maturity tier target == `reference` (subject to verifier confirmation).
- [x] Reflection-log entry + decisions (D-14) updated.
- [x] `task_graph.json` T9/T9e → `done`; `fix_queue.json` items recorded
      (T9b-NOTE-1 resolved, T9d-FOLLOWUP-1 re-routed, T9e-FOLLOWUP-1 added).

---

## Exceptions (accepted with routed follow-ups)

1. **Versioned metadata registry → T8.** Validation today is route-level zod, not
   a versioned per-right-type registry. Does not block reference-tier; recorded in
   spec §4. (`T6a-FOLLOWUP-1` / T8.)
2. **Operator UI integration → follow-up.** The panel exists and typechecks but is
   not wired into a running dashboard or covered by a UI test. Loyalty is certified
   on the contract's backend/SDK/docs surfaces; UI integration is a later showcase
   step. New follow-up `T9e-FOLLOWUP-1`.
3. **`programs`/`accounts` list+get not exposed → `T9d-FOLLOWUP-1`.** Only
   `create`, `points.*`, and `transactions.list` have routes/SDK methods. The
   acceptance checklist's "Surfaces" boxes do not require list/get; documented as a
   known limitation in the recipe. Re-routed off T9e to a dedicated follow-up.

---

## Reviewer

- Builder: this iteration (T9e).
- Independent verifier: **PASS** (2026-06-25) — the `verifier` agent re-ran all
  seven gates with real output (311/311 server, 27/27 core, 7/7 sdk, all
  typechecks exit 0), confirmed zero leaked tags remain, re-derived the example's
  math, and found no scope creep, no security loosening, and no overclaimed box.
  T9e and umbrella T9 marked `done` on this sign-off.
