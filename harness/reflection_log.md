# Reflection Log

Append-only notes from harness task iterations (the 5-phase loop: context → plan → action → verification → memory).

---

## T1 — Test the foundation (2026-06-24)

**Context used:** harness/{mission, product_thesis, quality_bar, architecture_target, verification_rules, task_graph, loop_state, sdk_audit, gap_analysis, recommended_tasks} + the three diagrams. No CLAUDE.md present. Diagrams framed the seams: View 1/2 → `@tokenisation/core` = SDK surface (ApiClient, typed models/errors, HttpClient w/ Bearer+idempotency); View 3 → issue flow starts at `ApiClient.assets.create`. Confirmed T1 active (deps T0 done). Core had **no test runner** (RA-2); vitest@1.6.1 resolvable in workspace.

**Plan:** add a vitest config + `test` script + `vitest` devDep to `@tokenisation/core`; write one conformance suite covering the 7 foundation seams; tests + package-config only (no source change unless a tiny proven bug blocks tests).

**Action:** added `packages/core/vitest.config.ts`, `packages/core/tests/foundation.conformance.test.ts`, and `test`/`test:watch` scripts + `vitest` devDep to `packages/core/package.json`. `pnpm install` linked vitest into core.

**Verification:** first run 22/24 — two cross-barrel `instanceof` failures (ApiClient; ValidationError→SDKError). Investigated rather than papered over:
- ApiClient failure = vite **dual-instantiation** of the big barrel (circular imports) — a test artifact, not a shipped bug (built dist is one module graph).
- ValidationError failure = a **real latent bug**: two `ValidationError` classes (errors/index.ts extends SDKError; modules/validation.ts extends Error). Recorded as `fix_queue.json` T1-BUG-1, routed to **T3** (unify error model). Not fixed in T1 (not tiny/isolated; touches a public export).
Re-authored the two identity assertions to use **same-module imports** (real factory→class seam) + assert the root barrel **re-exports** the names behaviorally. Final: **26/26 pass**, core typecheck PASS, core build PASS (tests/ is excluded from tsconfig, so build/typecheck unaffected).

**Decisions:** (1) Foundation tests assert observable contract + same-module identity, not cross-barrel `instanceof` (brittle). (2) The dual-`ValidationError` is a discovery → fix task (T3), not an in-scope fix.

**Memory:** loop_state T1 → done; fix_queue.json created (T1-BUG-1, T1-NOTE-1); this log.

**Quality-bar impact:** G11 partially advanced — `@tokenisation/core` now has a runner + first conformance suite (7 seams). Remaining G11 work: vertical-package tests + an asset→token→transfer→redeem→audit integration test (T9/T10).

**Next recommended task:** **T2 — Fix RBAC** (also unblocked; P0). Then T4/T5/T6 (module contract / right-type taxonomy / redemption). T3 now additionally carries T1-BUG-1.

---

## T2 — Fix RBAC / roles ↔ scopes (2026-06-24)

**Context used:** harness/{mission,quality_bar,architecture_target,verification_rules,task_graph,loop_state,sdk_audit,gap_analysis,recommended_tasks,reflection_log,fix_queue}. Confirmed T2 active (deps T0). G3 is P0.

**Current RBAC (audited):** API keys carry coarse scopes (`createApiKey` default `['read','write']`); `validateApiKey` returns `{orgId,scopes,keyId}`; `apiKeyMiddleware` sets `scopes:['admin']` on the local-only dev bypass (gated `!IS_PRODUCTION && !IS_STAGING && AUTH_DEV_MODE==='true'` + IP/org allowlists). **Two divergent matchers existed:** route guard `requireScope` (exact-match + literal 'admin' only) and `iam.checkApiKeyScope` (smarter: `*`/admin/exact/prefix, but unused by routes and missing wildcard suffix). DEFAULT_ROLES define rich permissions (`*`, `read:*`, `write:compliance`, `write:tokens`) that the route guard could not understand — a role-aligned key was silently denied. Tenant isolation already exists via `tenantContextMiddleware` (enforces orgId).

**Smallest safe fix (compatibility-preserving):** one canonical matcher `permissionGranted(granted, required)` in `middleware/permission.ts` (superuser `*`/admin · exact · coarse-covers-resource · `prefix:*` wildcard; action never implies another action). `requireScope(action, resource?)` and `checkApiKeyScope` both delegate to it. Coarse keys still exact-match (no regression); rich role-permission keys now authorize correctly; resource-level checks newly possible.

**Verification:** new `rbac-permission.test.ts` 13/13; full server suite 12 files / 290 tests pass (no regression); server typecheck PASS.

**Deferred (too broad for T2 → fix_queue):** T2a — provision API keys from role permissions (keys don't carry role perms yet); T2b — apply `requireScope(action,resource)` across the 48 routers; T2-FOLLOWUP-3 — 403 vs 401 for authz denials (→ T3). These are why G3 is advanced but not fully closed.

**Dev-mode:** documented precisely; prod/staging force DEV_MODE=false at load + process.exit(1) on misconfig — asserted by code review (re-import under prod would process.exit and kill the runner; test asserts default-off instead).

**Decision:** D-8 (single permission matcher). **Next:** T2a/T2b to complete G3 enforcement, then T4/T5/T6 (module contract / right-types / redemption).

---

## T4 — Define the Programmable Right Module contract (2026-06-24)

**Context used:** harness/{mission,product_thesis,quality_bar,architecture_target,verification_rules,task_graph,loop_state,decisions,rejected_assumptions,sdk_audit,gap_analysis,recommended_tasks,reflection_log,fix_queue} + 3 diagrams. Confirmed T4 active (deps T1, T2 done). Design-only task.

**Grounding inspection (read-only):** existing `PackManifest` (packages/core/src/packs/PackManifest.ts) already declares id/version/name/assetTypes/rightTypes/chains/requires/extensions{packs,policies,workflows,serverPlugins,contracts,adapters,uiComponents}/tags + a `ModuleHooks` registration interface. Loyalty manifest confirmed the live shape — and re-surfaced two facts: `MEMBERSHIP` rightType (not in core enum, RA-3) and `COMPUTE_CREDIT`/`DATA_STREAM_ACCESS` assetTypes already squatting as demo packs in loyalty (future modules partially pre-staged, demo-grade).

**What I produced:** formalized the contract ON TOP of PackManifest, adding the institutional sections the manifest lacks. 17 required Module-Spec sections (identity, asset, right, metadata, policy, issuance, transfer/access, redemption/consumption/revocation, audit, RBAC, SDK, server, on-chain, UI, docs, tests, conformance), each mapped to the architecture layers/diagrams. Files: programmable_right_module_contract.md (authoritative), module_template.md (fill-in skeleton → docs/modules/<id>.module.md), module_acceptance_checklist.md (the gate), + architecture_target.md pointer.

**Boundaries honored:** §3 fixes only the *required right fields* (rightType + transferable/divisible/expires/revocable/delegable) and a `pending-T5` mechanism — does NOT finalize the taxonomy (T5). §8 fixes only *what every module must declare* about redemption/consumption/revocation and that it must map onto the T6 primitive — does NOT design the primitive (T6). Policy (§5) and metadata (§4) declare into T7/T8.

**Key insight from the example mappings:** the four future modules cluster around two missing right types (USAGE/CONSUMPTION, LICENSE) and a consume/revoke redemption shape — i.e. they are precisely blocked on T5 + T6, which validates the critical path.

**Gates encoded:** no future module starts without a completed Module Spec passing the checklist; pending-T5 right blocks until T5; redemption that can't map to T6 blocks until T6; the 4 future modules stay deferred until T4+T5+T6 done and T9 proves the contract on loyalty.

**Decision:** D-9 (module contract is the single definition-of-done for verticals). **Next:** T5 (right-type taxonomy) and T6 (redemption primitive) — both now unblocked and on the critical path.

---

## T5 — Right-type taxonomy (2026-06-24)

**Context used:** harness/{mission,product_thesis,quality_bar,architecture_target,programmable_right_module_contract,module_template,module_acceptance_checklist,verification_rules,task_graph,loop_state,decisions,rejected_assumptions,sdk_audit,gap_analysis,recommended_tasks,reflection_log,fix_queue}. Confirmed T5 active (deps T1,T2 done).

**Audit:** `RightType` = OWNERSHIP/ACCESS/BEHAVIOR/VERIFICATION (~44 `RightType.X` refs). `PackManifest.rightTypes` is unvalidated `string[]`. `MEMBERSHIP` is a legit `AssetType` + a `Governance` proposal type; the ONLY right-type misuse is loyalty manifest `rightTypes:['BEHAVIOR','MEMBERSHIP']`. `LICENSE`/`USAGE` are not right-types today. No exhaustive `switch(rightType)` → additive enum changes are safe.

**Design (ratified):** two-level model — canonical RightType (Level 1, small/stable) + RightProfile (Level 2, attributes). Ratified canonical set = the 4 live + `USAGE` (consumable/metered) + `LICENSE` (terms-bound/revocable). Distinct primitives justified because T6/audit need consumability + revocation-under-terms at the primitive level. RightProfile attributes: transferable, divisible, expires, revocable, delegable, consumable — these (not the enum) drive T6/T7. MEMBERSHIP resolved as an ACCESS profile (rejected as canonical). Full future-module mapping recorded.

**Lands now (smallest safe):** RA-3 fix — loyalty manifest `['BEHAVIOR','MEMBERSHIP']` → `['BEHAVIOR','ACCESS']` (metadata-only, non-breaking); core taxonomy-stability test (locks the 4-value enum; asserts MEMBERSHIP/USAGE/LICENSE not yet members — change-detector for T5a). **Deferred:** adding `USAGE`/`LICENSE` to the enum + the RightProfile type → **T5a** (on first consuming module; additive/low-risk). T6 = consumption primitive; T8 = metadata registry.

**Verification:** core test 27/27, core typecheck+build PASS; pack-loyalty typecheck+build PASS. No behavior change beyond the manifest metadata alignment.

**Decision:** D-10 (two-level taxonomy; MEMBERSHIP→ACCESS; USAGE/LICENSE ratified, T5a lands them). RA-3 resolved. **Next:** T6 (unified redemption/consumption/revocation primitive) — the last phase-2 critical-path item before T9.

---

## T6 — Unified redemption/consumption/revocation primitive (2026-06-24)

**Context used:** full harness set incl. T4 contract, T5 taxonomy. Confirmed T6 active (deps T1,T2 done). Design-only.

**Audit:** found a mature but fragmented landscape — securities `redemptionService` has a real 8-state machine (requested→…→completed +rejected/failed) on a `redemptions` table, but it's redemption-only and securities-shaped; loyalty `redeem()` is in-memory/no-audit (G8 anti-pattern); strong reusable substrates exist (hash-chained `audit.service`, org-scoped idempotency middleware w/ SHA-256+409+24h TTL, T2 permission matcher). So T6 unifies behind one model rather than building new infra.

**Design (ratified):** the **Right Action** primitive — 5 kinds (REDEEM, CONSUME, REVOKE, EXPIRE, VERIFY_ACCESS) over any RightProfile, each gated by a T5 attribute (consumable/revocable/expires/...). Generic `right_actions` table + `RightActionRequest`/`RightActionReceipt` + a canonical status machine (REQUESTED→AUTHORIZED→EXECUTING→COMPLETED | REJECTED|FAILED|EXPIRED) where the existing securities sub-states live under EXECUTING. Reuses audit (event `right.<kind>.<status>` + DecisionReceipt), idempotency (required on mutating kinds), RBAC (read for VERIFY_ACCESS, write for REDEEM/CONSUME, admin-gated REVOKE). Error codes, server surface (`POST /api/v1/rights/actions` + history + receipt, with back-compat shims for /tokens/:id/redeem and /redemptions/*), SDK surface (`client.rights.act` + sugar), and conformance acceptance criteria all specified. Mapping table proves all six modules (loyalty/compute/dataset/model/agent/real-estate) reduce to the 5 kinds + attributes — the G8 close.

**Scope decision:** the primitive is a broad build (table+migration+service+routes+SDK+wiring) — NOT a smallest-safe inline change. Per the loop rules I produced a design doc + acceptance criteria and created implementation tasks **T6a** (core service+table+tests), **T6b** (server API + back-compat), **T6c** (SDK). No source modified in T6. First consumer is **T9** (loyalty), which retires the in-memory redeem(); securities redemption migrates onto it as a T10 follow-up.

**Boundaries:** T7 (policy) surfaces as `POLICY_DENIED`; T8 (metadata) validates `context`; T5a (USAGE/LICENSE enum) NOT required — primitive keys off attributes. All kept separate.

**Decision:** D-11 (Right Action primitive). **Verification:** no source changed; all harness JSON valid. **Next:** T9 (loyalty proof) becomes the integration point once T6a–c land; with T4+T5+T6 designs done, the phase-2 core is complete — T9 proves the contract end-to-end before any future module unblocks.

---

## T6a — Implement Right Action core (2026-06-24)

**Context used:** full harness incl. redemption_consumption_primitive.md (the T6 design). Confirmed T6a active (dep T6 done).

**Infra reused (not rebuilt):** DB-agnostic `rawQuery`/`execStatement` helpers + the lazy `ensureTable()` `CREATE TABLE IF NOT EXISTS` convention (theme/accreditation services) — so `right_actions` auto-exists in the in-memory test DB and works on sqlite+pg without touching the central drizzle schema or migrations. Reused hash-chained `auditService.log` (action `right.<kind>.<status>`, resourceType `right_action`) and the existing in-memory-test-DB FK enforcement (seed an org for audit-emitting tests). Tenant scoping = org_id filter on every query.

**Implemented (server-only, narrow):** `server/src/services/right-action.service.ts` — kinds REDEEM/CONSUME/REVOKE/EXPIRE/VERIFY_ACCESS; status machine REQUESTED→AUTHORIZED→EXECUTING→COMPLETED|FAILED|EXPIRED|REJECTED with `isValidTransition`; `createAction` (drives validated happy path, service-level idempotency for mutating kinds, audit on mutating, EXPIRE→EXPIRED); `transition` (explicit, rejects terminal/invalid — for module pipelines); `getAction`/`listActions` (org-scoped); kind-specific validation (CONSUME requires positive-integer quantity); typed error codes. `right_actions` table via lazy DDL + unique index (org_id, idempotency_key).

**Tests:** `server/src/__tests__/right-action.test.ts` (9) — CONSUME happy path + audit-entry assertion (fetched via getAuditLogEntry, action `right.consume.completed`), idempotent replay, mutating-without-key rejected, VERIFY_ACCESS read-like (no key/no audit), CONSUME quantity validation, REDEEM/REVOKE/EXPIRE settlement, invalid-transition + terminal guard, tenant isolation, org-scoped list/filter.

**Bug found & fixed in-task (tiny/isolated):** `rawQuery` converts each `$n`→`?` textually, so REUSING a placeholder number (`$14,$14`; `$3` twice) produced more `?` than bound values → "Too few parameter values." Fixed to distinct placeholders + matching params. Recorded as fix_queue T6a-NOTE-1 (guidance for T6b/future raw SQL: never reuse $n with these helpers).

**Verification:** right-action 9/9; full server suite 13 files/299 tests pass (no regression); server typecheck PASS. No core types touched.

**Risks/follow-ups:** core does NOT own a balance ledger (CONSUME records quantity but doesn't decrement a balance — that's module-owned, T9); no policy gating (T7) / metadata-registry validation (T8) yet; no HTTP routes (T6b) / SDK (T6c). All tracked.

**Decision:** D-12 (Right Action core impl: lazy-DDL service pattern, service-level idempotency, audit on mutating). **Next:** T6b (server API) or straight to T9 (loyalty proof) which depends on T6a — both now unblocked.

---

## T9a — Loyalty Module Spec + plan (2026-06-24)

**Context used:** full harness incl. T4 contract/template/checklist, T5 taxonomy, T6/T6a primitive. Confirmed T9 active (deps T4,T5,T6a done). Spec/plan only — no source.

**Loyalty audit:** `LoyaltyPointsEngine` is in-memory (Maps for balances=FIFO point batches w/ earnedAt/expiresAt/remaining/frozen, dailyMints, fraudFlags), config {redemptionRate,minRedemptionAmount,expiryDays}, earn/redeem(FIFO)/transfer/freeze. No server dir, no persistence, no audit, no RBAC, no tests, no recipe/example — experimental tier (confirms RA-4). Manifest already fixed to rightTypes ['BEHAVIOR','ACCESS'] (T5).

**Spec (docs/modules/loyalty.module.md):** all 17 sections. RightProfile `loyalty-points` -> BEHAVIOR {consumable, divisible, expires(time), revocable(clawback), transferable:false default, delegable:false}; membership pass -> ACCESS profile. Lifecycle ops map onto the T6a RightAction primitive: redeem->REDEEM (FIFO decrement + redeemedValue), spend->CONSUME, expiry->EXPIRE, fraud clawback->REVOKE(admin), membership entitlement->VERIFY_ACCESS. Balance ledger is module-owned (server-persisted loyalty_balances) per T6a's split. RBAC resource `loyalty` (read/write/write:loyalty:revoke). In-memory redeem() retired as authoritative (kept as offline simulator).

**Plan:** T9b (server ledger + LoyaltyService wired to RightActionService + tests) -> T9c (routes) -> T9d (SDK) -> T9e (docs/example/UI + acceptance). Each narrow, tested, no-regression. Repo convention chosen: docs/modules/ (neither docs/modules nor harness/modules existed; contract specifies docs/modules/<id>.module.md).

**Verification:** no source modified; all harness JSON valid; spec satisfies the checklist [spec] gate (all 17 sections filled, no pending-T5 right, redemption maps to T6 primitive). Future modules remain gated.

**Next:** T9b — implement the loyalty server ledger + LoyaltyService on the RightAction primitive.

---

## T9b — Loyalty server persistence on the Right Action primitive (2026-06-24)

**Context:** confirmed T9b active (dep T9a). 

**MATERIAL DISCOVERY (corrects T9a audit):** a substantial `server/src/services/loyalty.service.ts` (25KB) ALREADY EXISTS — `loyalty_programs`/`loyalty_accounts`/`loyalty_transactions` tables, createProgram/getOrCreateAccount/earn/spend/balance/tier/expire, account-balance model. The T9a spec/audit (based only on packages/pack-loyalty) missed it and assumed a NEW FIFO `loyalty_balances` ledger + "no server service." Creating a parallel ledger would be the exact fragmentation the harness prevents. So I reconciled: **integrate** with the existing service, do NOT replace its ledger. (Recorded: RA + fix_queue.)

**Implemented (append-only to the existing service):** `redeemPoints`/`consumePoints`/`revokePoints` wrappers that flow through `RightActionService.createAction` (REDEEM/CONSUME/REVOKE) over the EXISTING `loyalty_accounts` ledger — audited (RightAction emits `right.<kind>.<status>`), idempotent (replay via new `findByIdempotencyKey`), typed errors, org-scoped. redeem computes redeemedValue = amount/redemptionRate, enforces minRedemption; spend reuses the existing `spendPoints` (which records a loyalty_transactions row). Also added `findByIdempotencyKey` to RightActionService (ensures table; better layering — loyalty no longer queries right_actions directly).

**Bug fixed in-task:** loyalty initially SELECTed `right_actions` directly before that table was ensured ("no such table") — fixed by routing the replay-check through `findByIdempotencyKey` (which calls ensureTable).

**Tests:** `loyalty.right-action.test.ts` (7) — redeem decrements ledger + audited RightAction (verified via getAuditLogEntry = right.redeem.completed), idempotent replay (no double-spend), missing-key rejected, insufficient-balance (no decrement), below-min-redemption, revoke clawback, tenant isolation.

**Verification:** loyalty 7/7; full server suite 14 files/306 tests (no regression); server typecheck PASS. In-memory pack engine left intact but non-authoritative.

**Decision:** D-13 (integrate with existing loyalty.service, no parallel ledger). **Next:** T9c (loyalty server API /api/v1/loyalty/* with RBAC+idempotency+OpenAPI).

---

## T9c — Loyalty HTTP routes (2026-06-24)

**Context:** confirmed T9c active (dep T9b). Studied route conventions (asset.routes relies on mount-level apiKeyMiddleware; redemption uses per-route requireScope). Mount pattern: `app.use('/api/v1/<x>', apiKeyMiddleware, tenantContextMiddleware, router)` + global idempotency middleware.

**Implemented:** `server/src/routes/loyalty.routes.ts` — `/api/v1/loyalty/*`: POST /programs, /accounts, /accounts/:id/earn (write:loyalty); GET /accounts/:id/balance, /transactions (read:loyalty); POST /accounts/:id/{redeem,consume,revoke} (write:loyalty, Idempotency-Key passed to service). zod validation, resource-level `requireScope(action,'loyalty')`, OpenAPI JSDoc, no per-route apiKeyMiddleware (mount provides it). Mounted in index.ts behind apiKeyMiddleware+tenantContextMiddleware. Revoke guarded by write:loyalty today; tighten to write:loyalty:revoke once keys carry role perms (T2a) — noted in code.

**Bug fixed in-task:** initially baked apiKeyMiddleware into each route (copied from redemption.routes), which overwrote the test's injected req.apiKey -> all 401. Switched to the asset.routes convention (auth at mount, requireScope per-route) — also makes routes unit-testable with injected auth.

**Tests:** `server/src/__tests__/loyalty.routes.test.ts` (5, supertest + minimal app + real errorHandler + real service) — end-to-end issue→balance→redeem (with Idempotency-Key), redeem without key→400, RBAC deny (read-only key → 401 on write), RBAC allow (read key reads balance), insufficient-balance→400.

**Verification:** loyalty routes 5/5; full server suite 15 files/311 tests pass (no regression); server typecheck PASS (incl. index.ts mount).

**Next:** T9d (SDK client.loyalty.*) then T9e (docs/example/UI + acceptance checklist; also reconcile loyalty.module.md FIFO wording per T9b-NOTE-1).

[Completed autonomously via /loop, continuing the interrupted T9c verification.]

---

## T9d — Loyalty SDK surface (2026-06-24)

**Context:** confirmed T9d active (dep T9c). Studied AssetsModule pattern (class takes HttpClient; methods via this.http.post/get(..., {idempotencyKey}); returns response.data) and ApiClient wiring (readonly module props + ctor `new XModule(this.http)`). Confirmed T9c server exposes 8 routes only (no programs/accounts list/get).

**Existing pattern reused:** module-class + HttpClient; ApiClient module wiring; barrel `export *` from modules/index. Idempotency via the existing `{ idempotencyKey }` post option (HttpClient sets the Idempotency-Key header).

**Implemented:** `packages/core/src/modules/loyalty.ts` — `LoyaltyModule` with nested sub-APIs: `programs.create`, `accounts.create`, `points.{earn,balance,redeem,consume,revoke}`, `transactions.list` — each mapping to a real T9c route, unwrapping the server envelope. redeem/consume/revoke take a REQUIRED idempotencyKey. Exported typed request/response interfaces (LoyaltyProgram/Account/Transaction/BalanceInfo/SpendResult/RightActionReceipt + inputs). Wired into ApiClient (import + `public readonly loyalty` + ctor); exported via modules/index.

**Scope honored:** only exposed methods backed by existing routes; programs/accounts list+get NOT added (no server routes) — recorded as fix_queue T9d-FOLLOWUP-1. No UI, no compute/dataset/model/agent, no route changes. Public API additive only (no behavior change to existing modules).

**Tests:** `sdk/tests/LoyaltyModule.test.ts` (7, mocked fetch) — nested shape present, programs.create (Bearer auth + envelope unwrap), balance unwrap, redeem/consume/revoke send Idempotency-Key + return results, transactions.list paginated.

**Verification:** SDK loyalty 7/7; core typecheck+build PASS; core foundation tests 27/27 (module-count guard intact); sdk typecheck+build PASS. No server changes -> no server run needed.

**Next:** T9e — docs recipe + examples/loyalty-minimal + minimal UI + run module_acceptance_checklist; also reconcile loyalty.module.md FIFO wording (T9b-NOTE-1) and consider programs/accounts list+get routes (T9d-FOLLOWUP-1).

---

## T9e — Loyalty docs/example/acceptance + reference certification (2026-06-25)

**Context used:** CLAUDE.md + STATE.md + loop_state.json (active_task T9e, deps T9b/T9c/T9d done) + module_acceptance_checklist.md + fix_queue (T9b-NOTE-1, T9d-FOLLOWUP-1). DISCOVERY: most T9e artifacts already existed in the working tree but were **unrecorded** in any system of record (untracked: docs/recipes/LOYALTY_POINTS.md, examples/loyalty-minimal/{README,src/index.ts}, packages/pack-loyalty/src/ui/LoyaltyOperatorPanel.tsx) — a prior session's interrupted work.

**Plan:** assess existing artifacts; fill the gaps (runnable example scaffolding + the acceptance certification); fix anything verification surfaces; gate through the verifier; persist. Keep UI integration out of scope (defer) — smallest safe change to certify loyalty on the contract.

**Action:** (1) Added `examples/loyalty-minimal/{package.json,tsconfig.json}` (file: dep to built core; example sits outside the pnpm workspace as an external consumer). (2) **Fixed a real defect:** 5 leaked tool-call tags (`</content>`/`</invoke>`) had been written into the *body* of 4 files (the example failed `tsc` with TS1110: Type expected). Stripped from index.ts, README.md, LOYALTY_POINTS.md, LoyaltyOperatorPanel.tsx; repo-wide scan confirmed clean. (3) Wrote `harness/loyalty_reference_acceptance.md` — ran module_acceptance_checklist against loyalty with real evidence, marking 3 honest exceptions.

**Verification:** builder ran, then the **verifier agent independently re-ran**: loyalty server tests 12/12; full server suite 15 files/311 tests (no regression); server tsc 0; core 27/27 + tsc 0; sdk LoyaltyModule 7/7; pack-loyalty tsc 0; **example tsc 0 against the real built `@tokenisation/core` types** (proves the recipe/example match the actual SDK surface). Verifier also re-derived the example's numbers (earn 500 → redeem 250 ⇒ balanceAfter 250, redeemedValue '2.50', idempotent replay → same receipt id) and confirmed no scope creep / no security loosening / no leak / honest exceptions. **VERDICT: PASS.**

**Decisions:** D-14 — loyalty certified reference-tier; T9 closed; blocked-until-foundation gate satisfied (not auto-starting modules). Exceptions routed: T8 (metadata registry), T9e-FOLLOWUP-1 (UI integration → T15), T9d-FOLLOWUP-1 (list/get → backlog). T9b-NOTE-1 resolved.

**Memory:** loop_state.json + task_graph.json (T9, T9e → done; active_task → T15; notes); decisions.md (D-14); fix_queue.json (T9b-NOTE-1 resolved, T9d-FOLLOWUP-1 re-routed, T9e-FOLLOWUP-1 added); STATE.md reconciled; acceptance sign-off flipped.

**Quality-bar impact:** G9 (docs/recipe), G10 (example; UI partial → T15), G12-loyalty closed. Loyalty is now the proof that the Programmable Right Module contract holds end-to-end.

**Next recommended task:** **T15** — operator dashboard / UI stabilization (wires LoyaltyOperatorPanel, closing T9e-FOLLOWUP-1). Also unblocked: T10 (real-estate conformance + securities-redemption migration), T2a/T2b (RBAC provisioning), T5a (USAGE/LICENSE enum, gates the first future module). Future M_* modules now openable via an accepted Module Spec — a strategic call, not auto-started.

---

## T15 — Loyalty operator dashboard (2026-06-25, partial: dashboard sub-goal)

**Context used:** STATE.md/CLAUDE.md/loop_state/task_graph + loyalty_reference_acceptance + the loyalty surfaces (routes, `client.loyalty.*`, `LoyaltyOperatorPanel.tsx`). Mapped the console (`ui/` = `@tokenisation/console`, React 19, react-router 7) via an Explore agent: routes in `src/routes.tsx`, nav in `layouts/PlatformLayout.tsx`, shared `CodeBlock`, glass Tailwind theme; `ui` depends on `@tokenisation/sdk` (which re-exports `@tokenisation/core` via `export *`), not on `pack-loyalty`.

**Plan:** smallest useful operator dashboard for loyalty only — a native console page on the real SDK; defer the broader T15 (React split, F-items, test infra).

**Action:** added `ui/src/pages/LoyaltyConsole.tsx` (8 panels: connect / setup / overview / earn / redeem / consume / revoke / RightAction receipt / ledger evidence / dev snippet) + route `/loyalty` + nav item; `ui/src/tests/loyalty/LoyaltyConsole.test.tsx`. Two course-corrections during verify: (1) eager `import { createApiClient }` pulled the SDK umbrella → broke on the pre-existing missing `crypto-browserify` mock → refactored to **lazy import on connect** (better design + dodges the infra gap); (2) test `findByText('100')` matched two stats → made fake balance values distinct.

**Verification (builder + independent verifier PASS):** new test 1/1; new files type-clean (full-project tsc shows no errors referencing them — pre-existing console errors remain); full ui suite 16 fail / 1 pass where all 16 are the **pre-existing** `crypto-browserify` infra failures (proven via stash-proof — identical failures with the T15 edits stashed); real `client.loyalty.*` argument-contract verified against `packages/core/src/modules/loyalty.ts`; scope = 4 ui files, no new dep, no secret/stack-trace leak.

**Decisions:** D-15. Closes T9e-FOLLOWUP-1 (native dashboard rather than importing the build-excluded pack panel). Logged UI-INFRA-1 (crypto-browserify breaks the console vitest suite) and UI-INFRA-2 (pre-existing console typecheck debt) — both fix_task T15.

**Memory:** loop_state (T15 → in_progress, active_task → DX1 reconciled to task_graph, DX1 added), task_graph (T15 in_progress + note), fix_queue (T9e-FOLLOWUP-1 resolved; UI-INFRA-1/2 added), decisions D-15, STATE.md, this log.

**Quality-bar impact:** G10 advanced for loyalty (operator dashboard exists + UI-tested); full G10/UI stabilization (React split, infra, type-debt, F-items) remains in T15.

**Next recommended task:** **DX1** (developer quickstart — already `active_task`, set externally), or continue T15's remaining UI-stabilization scope (start with UI-INFRA-1 to unbreak the console test suite).
