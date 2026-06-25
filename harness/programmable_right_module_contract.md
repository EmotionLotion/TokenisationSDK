# Programmable Right Module Contract (T4)

**Status:** design contract (no implementation). **Authority:** every vertical module — existing (`loyalty`, `real estate`) and future (`compute credits`, `dataset licenses`, `model/model-weight licenses`, `AI-agent access`) — MUST satisfy this contract to be considered institutional-grade. **Companions:** `module_template.md` (fill-in skeleton) · `module_acceptance_checklist.md` (the gate) · `architecture_target.md` (north-star layering).

This contract formalizes — and extends — the existing `PackManifest` (`packages/core/src/packs/PackManifest.ts`), which already declares `id, version, name, description, assetTypes, rightTypes, chains, requires, extensions{packs,policies,workflows,serverPlugins,contracts,adapters,uiComponents}, tags`. The contract adds the institutional sections the manifest does not yet capture (metadata schema, redemption/revocation, audit events, RBAC, surfaces, docs/tests/conformance).

> **Scope boundaries (per harness):**
> - **T5 (right-type taxonomy)** is NOT finalized here. T4 only fixes the *required fields* a module must declare about its right (§3).
> - **T6 (redemption/consumption primitive)** is NOT designed here. T4 only fixes *what every module must declare* about redemption/consumption/revocation (§8).
> - **T7 (unified policy)** and **T8 (metadata registry)** are referenced as the substrate a module declares into (§4, §5).

---

## How a module is defined

A module is declared by a single **Module Spec** document (`docs/modules/<id>.module.md`, authored from `module_template.md`) plus a registered `PackManifest`. The Module Spec MUST contain all 17 sections below. A section may say "N/A — <reason>" only where this contract marks it optional. No code for a module is written until its Module Spec is complete and passes `module_acceptance_checklist.md`.

The 17 sections map onto the architecture layers (diagram `02-layer-view.svg`) and the issue flow (`03-issue-flow.svg`):

| § | Section | Maps to layer / diagram |
|---|---------|--------------------------|
| 1 | Module identity | PackManifest; cross-cutting |
| 2 | Asset model | ② Domain (Asset/lifecycle) |
| 3 | Right model | ② Domain (RightType) — *fields only; taxonomy = T5* |
| 4 | Metadata schema | ② Domain + T8 registry |
| 5 | Policy model | ③ Compliance & Policy — *declare into T7* |
| 6 | Issuance / mint flow | ② Domain → ⑤ Crypto → on-chain (issue flow steps 1–11) |
| 7 | Transfer / access rules | ③ Compliance (off-chain) + on-chain ModularCompliance |
| 8 | Redemption / consumption / revocation | ② Domain — *declare into T6* |
| 9 | Audit events | cross-cutting (hash-chained audit + decision receipts) |
| 10 | Permissions / RBAC | cross-cutting (permission matcher, D-8) |
| 11 | SDK API surface | ① Public API |
| 12 | Server / API surface | ⑥ Infra (Server routers) |
| 13 | Contract / on-chain surface | enforcement substrate (ERC-3643 stack) |
| 14 | UI / dashboard | front-end (sdk-react / components) |
| 15 | Docs | cross-cutting |
| 16 | Tests | cross-cutting (conformance + integration) |
| 17 | Conformance | gate (this contract) |

---

## Required sections

### 1. Module identity
- `id` (kebab-case, unique), `version` (semver), `name`, `description`, `tags`.
- `requires`: other module ids this depends on.
- `chains`: numeric chain ids it targets (or `[]` for off-chain-only).
- **Maturity tier**: `reference` (server-persisted, fully conformant) | `experimental` (in-memory/demo). Loyalty is `experimental` today; real estate is `reference`. New modules MUST target `reference`.

### 2. Asset model
- Which `assetTypes` the module introduces (uppercase SNAKE_CASE), each with a one-line definition.
- How each asset type maps to the core `Asset` (`packages/core` model + server `assets` table): `rightType`, default `state`, `jurisdiction` expectations, `transferabilityRules` defaults, `validityPeriod` (perpetual vs time-bound).
- Whether the asset is **singular** (one asset → one token) or **fungible/quantity-bearing** (supply + decimals).

### 3. Right model *(taxonomy ratified in T5 — see `right_type_taxonomy.md`)*
Declare a **RightProfile** (Level 2) bound to a canonical **RightType** (Level 1):
- `rightType`: a canonical value from the **ratified taxonomy** — live: `OWNERSHIP | ACCESS | BEHAVIOR | VERIFICATION`; ratified and landing in **T5a**: `USAGE` (consumable/metered), `LICENSE` (terms-bound/revocable). `MEMBERSHIP` is an **ACCESS profile**, never a canonical type (RA-3/D-10).
- `RightProfile`: `{ id, rightType, attributes, metadataSchemaRef }`.
- Required attributes every module declares: `transferable` (bool/mode), `divisible` (bool), `expires` (bool + basis), `revocable` (bool), `delegable` (bool — AI-agent access), `consumable` (bool — USAGE; what T6 meters).
- **Gate:** a module needing `USAGE`/`LICENSE` is blocked until **T5a** lands those enum values (the taxonomy is ratified; the enum members are added on first consumer). T6 branches on the **attributes**, so it does not require the new enum values.

### 4. Metadata schema
- A **zod schema** for the asset/right's metadata, **versioned** (`schemaVersion`).
- MUST register into the per-right-type metadata registry once T8 exists; until then, declare the schema and where it lives (`packages/<module>/src/models`).
- MUST validate on write (server) and be exported as a type from the SDK.

### 5. Policy model *(declare into T7)*
- The transfer/usage policy the module needs, expressed in the unified authoring model (T7) — until T7, declare both projections explicitly:
  - **off-chain**: `PolicyEvaluator` rules / `TransferabilityRules`.
  - **on-chain**: which `ModularCompliance` modules / `IPolicyModule`s apply (Whitelist, CountryRestrictions, MaxBalance, MaxHolders, HoldTime, TransferFees, ACE, Hardware, Time, Volume, Allow).
- State **where enforcement happens**: in-SDK, on-chain, or both (institutional default: both for transferable rights).

### 6. Issuance / mint flow
- The end-to-end create→issue path, mapped to `03-issue-flow.svg`: `assets.create` → policy check → persist + audit → `tokens.create` → (optional) `tokens.deploy` → sign (KMS/custody) → on-chain → confirm → index → audit receipt.
- Declare: required inputs, idempotency key requirement (institutional default: **required** on all mutations), which steps are sync vs async, and the standard/contract used.

### 7. Transfer / access rules
- Allowed transitions and who/what may transfer or access. For non-transferable rights (loyalty behavior, SBT reputation, licenses), state the restriction and its enforcement (e.g. Soulbound on-chain).
- Access semantics for `ACCESS`-type rights (grant, scope, expiry).

### 8. Redemption / consumption / revocation *(ratified primitive — see `redemption_consumption_primitive.md`)*
Every module declares which **Right Action** kinds its right supports, gated by its RightProfile attributes (T5):
- `REDEEM` (exchange for value/settlement) — `redeemable`.
- `CONSUME` (metered depletion by quantity/unit) — `consumable` + `divisible`.
- `REVOKE` (issuer/admin invalidation) — `revocable`.
- `EXPIRE` (lifecycle end by time/usage) — `expires`.
- `VERIFY_ACCESS` (entitlement check, may log) — any (esp. ACCESS/LICENSE).
The module declares, per kind: request fields used, quantity/unit (if any), permission, audit event, and error cases. All kinds run on the **single T6 primitive** (`POST /api/v1/rights/actions`, server-persisted + hash-chained audit + idempotent) — **no bespoke or in-memory redemption** (loyalty's in-memory `redeem()` is the anti-pattern, retired in T9). Implemented by T6a/T6b/T6c.

### 9. Audit events
- Enumerate the audit event types the module emits (e.g. `<id>.asset.created`, `<id>.token.issued`, `<id>.consumed`, `<id>.revoked`).
- Every state-changing operation MUST emit a hash-chained audit entry + (for compliance-relevant decisions) a `DecisionReceipt`. No silent mutations.

### 10. Permissions / RBAC requirements
- Declare the **resource name** the module uses (e.g. `tokens`, `compliance`, `licenses`) and the required permissions per operation, expressed for the permission matcher (D-8): `read:<resource>`, `write:<resource>`, and any admin-only ops.
- Routes MUST guard with `requireScope(action, resource)` (resource-level, per T2/T2b).
- All reads/writes are **org-scoped** (tenant isolation via `tenantContextMiddleware`).

### 11. SDK API surface
- The typed public methods consumers call: either a new `ApiClient` module (`client.<resource>.*`) or a pack export. Inputs/outputs are typed; errors use the unified error model (T3). Returns are bare domain objects (no envelope leakage — cf. F21).
- MUST be importable from `@tokenisation/core` (framework/DB-agnostic root — cf. F22) or an appropriate subpath.

### 12. Server / API surface
- REST routes under `/api/v1/<resource>` with: zod request validation, `apiKeyMiddleware` + `tenantContextMiddleware` + `requireScope(action,resource)`, `Idempotency-Key` on mutations, audit emission, and no stack traces in error responses (T3).
- OpenAPI JSDoc so the live spec stays complete (cf. F19).

### 13. Contract / on-chain surface *(if `chains` non-empty)*
- Which standard/contract represents the right: `ComplianceToken`/ERC-3643, `ERC1410` (partitioned), `ComplianceMultiToken` (1155), a vertical NFT, or `ReputationSBT` (soulbound/non-transferable). Reuse the existing `contracts/src` stack — do not introduce a parallel token framework.
- Which compliance/policy modules bind at deploy; which oracle(s) feed it (if any).

### 14. UI / dashboard requirements
- Operator (issuer) views and, if relevant, holder views. Components live in `sdk-react` / module `src/ui` (excluded from the logic-package build per convention — cf. F13/F22). At minimum: list + detail + issue + (redeem/consume/revoke) for the module's resource.

### 15. Docs requirements
- A recipe at `docs/recipes/<MODULE>.md` and a runnable example at `examples/<module>-minimal/` (mirrors `examples/minimal-sdk-consumer`). README/quickstart must show the correct auth + idempotency (cf. F1/F18).

### 16. Test requirements
- Package-level conformance tests (the T1 pattern) covering: asset create/get contract, right/metadata validation, policy decision, issuance, redemption/consumption/revocation, audit emission, and RBAC (allow/deny/tenant-isolation).
- One integration test for the module's critical path: `asset → token → transfer/access → redeem/consume/revoke → audit`.
- Server typecheck + build green; no regression in the full suite.

### 17. Conformance requirements
- The module passes `module_acceptance_checklist.md` in full.
- The core conformance suite (T1) passes against the module's primitives.
- Maturity tier is `reference`.

---

## Example mappings (illustrative — not authorizations to build)

Future-module rows are **planning sketches**; they do not unblock implementation (see gates). Right types marked `*pending-T5*` are proposed, not ratified.

| Section | loyalty (exists) | real estate (exists) | compute credits | dataset licenses | model/weight licenses | AI-agent access |
|---|---|---|---|---|---|---|
| Right type (§3) | BEHAVIOR / *MEMBERSHIP(pending-T5)* | OWNERSHIP | *USAGE(pending-T5)* | *LICENSE(pending-T5)* | *LICENSE(pending-T5)* | ACCESS (delegated) |
| Asset type (§2) | LOYALTY_POINTS, BEHAVIOR_SCORE | REAL_ESTATE (DLD title) | COMPUTE_CREDIT | DATASET_LICENSE | MODEL_LICENSE | AGENT_ACCESS_GRANT |
| Divisible/quantity (§2) | fungible (points) | fractional shares | fungible (credit units) | seat/usage-limited | seat/usage-limited | scoped, usually singular |
| Key metadata (§4) | rate, expiry, tier | valuation, NAV, jurisdiction, DLD ids | unit (GPU-hr), rate | dataset id, terms URI, scope | model id, weights hash, terms | agent id, scopes, TTL |
| Transfer (§7) | non-transferable | restricted (compliance) | transferable | usually non-transferable | non-transferable | non-transferable, delegable |
| Redemption/consumption (§8) | redeem points → value | redeem/exit; distributions | **consume** (meter GPU-hr) | **consume** (metered) + **revoke** | **revoke** + audit | **revoke**, expire (TTL) |
| On-chain (§13) | SBT / off-chain | ERC-3643 / ERC-1410 | ERC-20 ComputeToken + GPUComputeOracle | NFT/1155 + terms | NFT + weights hash anchor | NFT/SBT access pass |
| RBAC resource (§10) | loyalty | assets/tokens | compute | licenses | licenses | agent-access |

These illustrate that the **future modules cluster around two missing right types** (`USAGE/CONSUMPTION`, `LICENSE`) and a **consume/revoke** redemption shape — exactly the work T5 and T6 must finish first.

---

## Gates (binding)

1. **No future module starts without a completed Module Spec** authored from `module_template.md` and passing `module_acceptance_checklist.md`. (`task_graph.json` future-module nodes carry `gate: blocked-until-foundation`.)
2. A Module Spec with any `pending-T5` right type is **blocked until T5** ratifies that right type.
3. A Module Spec whose redemption/consumption/revocation (§8) cannot map onto the **T6** primitive is **blocked until T6**.
4. The four future modules (compute credits, dataset licenses, model licenses, AI-agent access) remain `deferred` until **T4 (this), T5, T6 are done and T9 (loyalty proof) passes** — proving the contract on the least-mature existing module before any new one.
5. Existing modules are grandfathered as-is but MUST be brought to conformance: **real estate via T10**, **loyalty via T9**.
