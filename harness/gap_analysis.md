# Gap Analysis — vs Institutional-Grade Programmable-Rights Infrastructure

Agent: Repo Audit Agent · Date: 2026-06-24 · Read-only.

Target: "Enterprise programmable rights infrastructure for tokenized digital and real-world assets" — current modules (loyalty, real estate) + future modules (compute credits, dataset licenses, model/model-weight licenses, AI-agent access).

Severity: **P0** blocks institutional adoption · **P1** material quality gap · **P2** polish/coverage. Status reflects the existing repo after the prior `loop/` fixes (F9/F13/F14/F16/F22/F21/F20).

---

## A. Dimension-by-dimension assessment

| # | Dimension | Current state | Gap | Sev |
|---|-----------|---------------|-----|-----|
| G1 | **Typed SDK API** | Stripe-style `ApiClient` with 12 modules, full TS types, zod input validation. Root barrel is **very large** and mixes client + engines + plugins + orchestration. | Surface is broad and under-curated; no clear "stable public API" vs internal. No API versioning/deprecation policy. Some return types lied vs runtime (F21 class of bug — fixed for assets, but `assets.list()` envelope still wrong = F21b). Need an audited, documented, semver'd public surface. | P1 |
| G2 | **Typed errors** | `SDKError` hierarchy (`Authentication/Validation/Compliance/Contract/Network/Oracle/Asset/Storage`) + `ErrorCode`; client throws `TokenizationError`. | Two parallel error types (`SDKError` vs `TokenizationError`) — not unified. No documented error-code catalog for consumers. Server error envelope leaks stack traces in responses (seen in api_server_test 401/400 bodies) — **must not ship stacks to clients**. | P1 |
| G3 | **Roles / permissions** | IAM tables (orgs/users/roles/userRoles/apiKeys), 5 default roles, `requireScope`, API-key auth, OAuth2 + SIWE present. | **Scope↔permission mismatch**: middleware grants coarse `['admin']` for dev/x-api-key and checks `read`/`write`, while roles define `read:*`/`write:compliance`/`write:tokens`. No per-resource RBAC enforcement tied to the rich role permissions. No tenant-scoped, resource-level authorization tests. For institutional/programmable-rights, authz is the product — needs first-class, tested RBAC + per-right-type permissioning. | P0 |
| G4 | **Audit logs** | Strong: `auditService` + `audit` table/routes; core hash-chained `AuditChainManager`/`UnifiedAuditLog`; `DecisionReceipt`. | Audit is per-subsystem and not guaranteed to cover every state-changing op uniformly; no tamper-evidence verification endpoint documented; coverage not tested. Close to institutional, needs completeness guarantee + verification. | P1 |
| G5 | **Idempotency** | Global `idempotencyMiddleware`; `Idempotency-Key` required on token create; `idempotency` route exists. | **Inconsistent**: required on some mutations (tokens) but not surfaced/documented elsewhere; README examples omit it (F18). No documented idempotency contract across all POSTs. Institutional clients need every mutation idempotent + documented. | P1 |
| G6 | **Metadata schemas** | zod `RightModelSchema`, `AssetDescriptorSchema`; per-vertical models (`RealEstateMetadata`). | **No generic, per-right-type metadata schema registry**. Future modules (dataset/model licenses, AI-agent access) need typed, validated, versioned metadata contracts. Today each vertical hand-rolls its own. | P1 |
| G7 | **Transfer policies** | Rich: off-chain `TransferabilityRules` + `PolicyEvaluator`; on-chain `IPolicyModule` (Allow/Time/Volume) + ERC-3643 compliance modules (Whitelist/Country/MaxBalance/MaxHolders/HoldTime/Fees). | Off-chain and on-chain policy models are **not unified** (two policy languages). No single source of truth a programmable-rights product can author once and enforce both places. | P1 |
| G8 | **Redemption flows** | server `redemption.routes` + `redemptions` table; `tokens.redeem`; loyalty pack `redeem()`. | **Not unified** across verticals; loyalty redemption is in-memory only (not server-persisted). Future modules (compute credits = consumable, dataset/model licenses = metered, AI-agent access = usage-based) all need a consistent, server-persisted, audited redemption/consumption primitive. | P0 (for the product direction) |
| G9 | **Docs** | Solid architecture/getting-started/api/guides/recipes/security/deployment. | README quick-start still wrong at runtime (auth F1/F18); how-to-get-a-key not in main flow (F2); committed OpenAPI stale (F19); no loyalty recipe (F4); no LIMITATIONS doc for stubs (F6); no error-code catalog (G2); no metadata/right-type authoring guide. | P1 |
| G10 | **Dashboard / UI** | `ui` (=`@tokenisation/console`), `ui-kit` (Storybook), `sdk-react`, `sdk-react-native`, per-vertical components. | `ui` (console) and infra app builds fail (F17); React 18/19 split across workspace (F11/F12) destabilizes UI + SDK tests. No single institutional operator dashboard verified to build/run. | P1 |
| G11 | **Tests** | sdk 890 (11 files fail to load), server 11 suites, contracts 12 suites. | **`@tokenisation/core` (the foundation) has NO tests/runner** (P0). Vertical packages (`realestate`, `pack-loyalty`) have **0 tests**. No integration test for the full asset→token→transfer→redeem→audit path. No authz/idempotency conformance tests. `conformance-suite` exists but coverage unclear. | P0 |
| G12 | **Module symmetry / extensibility** | Real estate is mature & server-backed; loyalty is in-memory demo-grade. Pack manifest/registry + plugin system exist (good extension points). | The two "known" modules are at **very different maturity**, and the extension contract a new module must satisfy (right type + metadata schema + policy + redemption + audit + tests + docs) is **not codified**. Adding compute/dataset/model/agent modules today would repeat real-estate's bespoke effort. | P0 (for scaling to future modules) |
| G13 | **Right-type model** | `RightType` enum: OWNERSHIP/ACCESS/BEHAVIOR/VERIFICATION. | Loyalty manifest references `MEMBERSHIP` (not in the enum) → inconsistency. Future modules need rights like **USAGE/CONSUMPTION** (compute credits), **LICENSE** (dataset/model), **DELEGATED-ACCESS** (AI agents). The right-type taxonomy is the core abstraction and is currently ad-hoc. | P0 (for the product direction) |
| G14 | **Packaging / release** | Subpath exports fixed for core (F22); `@tokenisation/sdk` umbrella uses `workspace:*`. | Umbrella package's standalone publishability not verified (deferred to packaging_review); no changeset/release verification for the public surface; mixed/stray lockfiles (F5). | P2 |

## B. Cross-cutting themes (what "institutional-grade" really requires here)

1. **Authorization is the product, and it's the biggest gap (G3+G13+G8).** "Programmable rights" = who may do what with which right, enforced and audited. Today authz is coarse (scopes≠roles), right-types are ad-hoc, and redemption/consumption isn't a uniform, persisted, audited primitive. These three together are the P0 spine.
2. **A codified module contract is missing (G12).** Real estate and loyalty diverge; future modules need a single "Programmable Right Module" interface: right-type + versioned metadata schema + unified policy + redemption/consumption hooks + audit + required tests + docs. Without it, each new module is bespoke.
3. **The foundation is untested (G11).** `@tokenisation/core` has zero package-level tests. For institutional trust, the generic primitives (asset/right/token/policy/redemption/audit/permission) need a conformance test suite that every vertical also runs.
4. **Two of everything (G2 errors, G7 policy).** Unify error types and the off-chain/on-chain policy authoring model so consumers author once.
5. **Trust & safety hygiene (G2).** Stop leaking stack traces in API error bodies; publish an error-code catalog; guarantee audit covers every mutation.

## C. What is already strong (do not rebuild)

- Generic core abstraction (asset/right/token/policy/lifecycle) is genuinely asset-class-agnostic.
- ERC-3643 compliance contract stack is comprehensive and the right institutional standard.
- Audit primitive (hash-chained + decision receipts) is a real differentiator.
- Real estate vertical is a strong reference implementation of a mature module.
- Plugin/pack registry + manifest provides real extension points.
- SDK build/typecheck + external consumption now work end-to-end (prior fixes).
