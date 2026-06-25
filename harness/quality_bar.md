# Quality Bar — Institutional Grade

The measurable bar this harness enforces. Each row is a gap dimension from `gap_analysis.md` with a **pass criterion** (objective, testable) and the task that closes it. A task may not be marked `done` unless its pass criterion is met and verified per `verification_rules.md`.

| Dim | Bar | Pass criterion (objective) | Task | Status |
|-----|-----|----------------------------|------|--------|
| G11 | **Tested foundation** | `@tokenisation/core` has a test runner + green conformance suite covering asset/right/token/policy/redemption/audit/errors; vertical packages have tests; one integration test covers asset→token→transfer→redeem→audit. | T1, T9, T10 | open |
| G3 | **RBAC** | `requireScope` and role permission strings reconciled; per-resource authorization enforced + tested; tenant isolation tested. No coarse `['admin']` grant on non-dev paths. | T2 | open |
| G2 | **Typed errors** | Single public error contract (no parallel `TokenizationError`/`SDKError`); **no stack traces in API responses**; documented error-code catalog. | T3 | open |
| G5 | **Idempotency** | Every mutating endpoint accepts/enforces `Idempotency-Key`; contract documented; tested. | T11 | open |
| G4 | **Audit completeness** | Test proves every state-changing op writes an audit entry; tamper-evidence verification path exists. | T12 | open |
| G12 | **Module contract** | A codified "Programmable Right Module" interface exists (`architecture_target.md`); both existing modules conform; a new module needs only to implement it. | T4, T9, T10 | open |
| G13 | **Right-type taxonomy** | `RightType` is consistent (no dangling `MEMBERSHIP`); taxonomy documents how USAGE/CONSUMPTION, LICENSE, DELEGATED-ACCESS map on. | T5 | open |
| G8 | **Unified redemption/consumption** | One server-persisted, audited redemption/consumption primitive used by loyalty, tokens, and future metered modules. | T6 | open |
| G7 | **Unified policy** | One policy authoring model that compiles to both off-chain (`PolicyEvaluator`) and on-chain (`IPolicyModule`/compliance modules). | T7 | open |
| G6 | **Metadata schemas** | Per-right-type, versioned, validated metadata schema registry. | T8 | open |
| G1 | **Typed/curated SDK surface** | Stable public API delineated from internal; semver/deprecation policy; `assets.list()` envelope correct (F21b). | T13 | open |
| G9 | **Docs truth** | README quick-start runs as written (auth F1/F18); how-to-get-a-key documented (F2); committed OpenAPI regenerated (F19); LIMITATIONS doc (F6); error catalog; authoring guide. | T14 | open |
| G10 | **Dashboard/UI** | React 18/19 split resolved (F11/F12); one operator dashboard builds + runs; `ui`/console build green (F17). | T15 | open |
| G14 | **Packaging/release** | Umbrella `@tokenisation/sdk` standalone-publishable; changeset release check; no stray lockfiles (F5). | T16 | open |

## Already met (do not regress)
- SDK builds + typechecks green across the SDK/server path (prior F9/F13/F14/F16).
- External app installs `@tokenisation/core` with no `--legacy-peer-deps` / no react/drizzle/pg, imports `createApiClient`, and runs the asset→token flow with the asset↔token link persisted (prior F22/F21/F20).

## Global gates (apply to every task)
- Build + typecheck stay green for the SDK/server path.
- Every code change ships with a matching test or doc update.
- No stack traces or secrets in API responses.
- No new module before T4 + T5 + T6 are `done` and proven on loyalty (T9).
