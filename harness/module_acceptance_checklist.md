# Module Acceptance Checklist

The binding gate for any module (existing brought-to-conformance, or future). A module is **accepted** only when every box is checked and evidence (test output / file paths) is recorded. Derived from `programmable_right_module_contract.md`. Tiers: a `reference` module must pass all; an `experimental` module must at least pass the **[spec]** boxes before any code.

## Spec gate (before any code) — [spec]
- [ ] Module Spec exists at `docs/modules/<id>.module.md`, authored from `module_template.md`, all 17 sections filled (no blank required sections).
- [ ] Right type (§3) references a T5-ratified value, OR is marked `pending-T5` with justification → **acceptance blocked until T5**.
- [ ] Redemption/consumption/revocation (§8) maps onto the T6 primitive → **blocked until T6** if it cannot.
- [ ] Policy model (§5) declares both off-chain and on-chain projections.
- [ ] `requires`/`chains` declared; maturity tier target stated.

## Implementation gate (reference tier)
**Domain & data**
- [ ] assetType(s) map to core `Asset` with declared rightType/state/transferability/validity.
- [ ] Versioned zod metadata schema; validated on write; type exported from SDK.

**Authorization & tenancy (G3 / D-8)**
- [ ] Routes use `requireScope(action, '<resource>')` (resource-level).
- [ ] All reads/writes org-scoped (`tenantContextMiddleware`).
- [ ] RBAC tests: exact-permission allow, wildcard allow, missing-permission deny, tenant isolation.

**Surfaces**
- [ ] SDK: typed methods importable from `@tokenisation/core` (or subpath); bare-object returns; unified errors.
- [ ] Server: `/api/v1/<resource>` routes with zod validation, idempotency on mutations, OpenAPI JSDoc, **no stack traces** in errors.
- [ ] On-chain (if `chains` non-empty): uses an existing `contracts/src` standard; no parallel token framework.

**Lifecycle**
- [ ] Issuance/mint path implemented per §6 (idempotent).
- [ ] Transfer/access rules enforced (off-chain and on-chain as declared).
- [ ] Redemption/consumption/revocation implemented on the T6 **Right Action** primitive (`POST /api/v1/rights/actions`, server-persisted, audited, idempotent) — no bespoke/in-memory flow. Declared kinds match the RightProfile attributes (CONSUME⇒consumable, REVOKE⇒revocable, EXPIRE⇒expires). Conformance tests per `redemption_consumption_primitive.md` §9 pass for each supported kind (incl. idempotent replay, attribute guard, balance underflow, revoke→verify, audit emission).

**Audit (G4)**
- [ ] Every state-changing op emits a hash-chained audit entry; compliance decisions emit `DecisionReceipt`.
- [ ] Test proves audit emission for create/issue/transfer/redeem|consume|revoke.

**Quality (G11)**
- [ ] Package-level conformance tests pass (T1 pattern).
- [ ] Integration test passes: asset → token → transfer/access → redeem/consume/revoke → audit.
- [ ] `typecheck` + `build` green for the module's package(s); full server suite still green (no regression).

**Docs & UI (G9 / G10)**
- [ ] `docs/recipes/<MODULE>.md` + runnable `examples/<id>-minimal/`.
- [ ] Operator UI: list / detail / issue / (redeem|consume|revoke).

## Sign-off
- [ ] Core conformance suite passes against the module's primitives.
- [ ] Maturity tier == `reference`.
- [ ] Reflection-log entry + decisions/rejected-assumptions updated.
- [ ] `task_graph.json` module node → `done`; `fix_queue.json` items (if any) recorded.

> Evidence block (fill on acceptance): test command + result · changed files · spec path · reviewer.
