# Recommended Tasks — Toward an Institutional-Grade Programmable-Rights Harness

Agent: Repo Audit Agent · Date: 2026-06-24. (Re-created during T0 scaffold; interrupted on first write.)

Scope discipline: **do not rewrite the SDK, do not add new use cases yet, understand the existing product first.** Tasks solidify the *foundation and contracts* before any new module (compute/dataset/model/agent). Each task notes the gap it closes (see `gap_analysis.md`). Severity: **P0** must-do before scaling · **P1** material · **P2** polish.

---

## Phase 0 — Harness scaffold (prerequisite)
- **T0 (P0) — Create the harness scaffold.** Author mission/product_thesis/quality_bar/architecture_target/verification_rules/task_graph/loop_state/decisions/rejected_assumptions, seeded from this audit + `loop/`. (Done by the Harness Scaffold Agent.)

## Phase 1 — Solidify the foundation (no new use cases)
- **T1 (P0) — Test the foundation.** Add a vitest runner + `test` script to `@tokenisation/core`; write a primitives conformance suite (asset/right/token/policy/redemption/audit/errors). Closes G11.
- **T2 (P0) — Fix RBAC: unify roles ↔ scopes.** Reconcile `requireScope` (coarse) with role permission strings; enforce per-resource authz; add authz + tenant-isolation tests. Closes G3.
- **T3 (P1) — Unify error model + stop leaking stacks.** Collapse `TokenizationError`↔`SDKError`; remove stack traces from API responses; publish an error-code catalog. Closes G2.
- **T11 (P1) — Idempotency contract.** Every mutation idempotent + documented uniformly. Closes G5.
- **T12 (P1) — Audit completeness.** Test that every state-changing op writes audit; expose tamper-evidence verification. Closes G4.

## Phase 2 — Codify the module contract (no new modules)
- **T4 (P0) — Define the "Programmable Right Module" interface.** right-type + versioned metadata schema + unified policy (off+on chain) + redemption/consumption hooks + audit hooks + required tests/docs. Write to `architecture_target.md`. Closes G12.
- **T5 (P0) — Right-type taxonomy.** Resolve `MEMBERSHIP` inconsistency; design how future rights (USAGE/CONSUMPTION, LICENSE, DELEGATED-ACCESS) map onto/extend OWNERSHIP/ACCESS/BEHAVIOR/VERIFICATION. Closes G13.
- **T6 (P0) — Unify redemption/consumption primitive.** One server-persisted, audited redemption/consumption flow for loyalty/tokens/future metered modules. Closes G8.
- **T7 (P1) — Unify the policy model.** One authoring model compiling to off-chain + on-chain enforcement. Closes G7.
- **T8 (P1) — Generic metadata schema registry.** Per-right-type, versioned, validated metadata. Closes G6.

## Phase 3 — Reference module hardening
- **T9 (P1) — Bring loyalty up to the module contract.** Server-persist loyalty, tests, recipe + example, conform to T4/T5/T6. Validates the contract on the least-mature module. Closes G12(loyalty); prior F3/F4.
- **T10 (P1) — Real-estate conformance.** Package-level tests + assert RE conforms to T4. Closes G11/G12(RE).

## Phase 4 — Surface, docs, UI, packaging
- **T13 (P1) — Curate public SDK surface** (stable vs internal, semver, fix `assets.list()` F21b). Closes G1.
- **T14 (P1) — Docs truth pass** (F1/F18 auth, F2 key, F19 OpenAPI, F6 limitations, error catalog, authoring guide). Closes G9.
- **T15 (P1) — Stabilize UI + tests** (React 18/19 split F11/F12; verify operator dashboard; F15/F17). Closes G10.
- **T16 (P2) — Packaging/release** (umbrella publishability, changeset check, stray lockfiles F5). Closes G14.

## Explicitly deferred (do NOT start yet)
- New modules: **compute credits, dataset licenses, model/model-weight licenses, AI-agent access** — only after T4/T5/T6 (+T9 proof).
- Carried non-SDK items: F10 (website), F15 (sdk-react-native typecheck), F17 (ui/infra app) — schedule under T15/T16.

## Critical path
`T0 → T1 + T2 → T4 + T5 + T6 → T9 → (then) future modules.`
