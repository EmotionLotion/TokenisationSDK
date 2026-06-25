# SDK Audit — Current State

Agent: Repo Audit Agent · Date: 2026-06-24 · Mode: read-only (no source modified).

> **Harness note:** The requested `harness/*` scaffold (mission.md, product_thesis.md, quality_bar.md, architecture_target.md, verification_rules.md, task_graph.json, decisions.md, rejected_assumptions.md) does **not** exist in the repo. Only the prior `loop/` harness is present (loop_state.json, decisions.md, fix_queue.md, and detailed reports from earlier iterations: repo_audit, install_test, api_server_test, sdk_consumer_test). This audit builds on that verified knowledge and writes the requested deliverables under `harness/`. The missing scaffold is flagged in `recommended_tasks.md` (T0).

---

## 1. Repository shape

Monorepo (`tokenisation-platform`, pnpm@9.15.0). Build/typecheck state from prior loop iterations: the **entire SDK/server path builds + typechecks green** (after fixes F9/F13/F14/F16); the external SDK consumer path **works end-to-end** (F22/F21/F20). Non-SDK app/docs builds (website, `ui`, infra app) remain deferred (F10/F15/F17).

```
packages/
  core/            @tokenisation/core      — asset-class-agnostic foundation (THE SDK)
  compliance/      @tokenisation/compliance — KYC/AML, identity claims, jurisdiction
  chains/          @tokenisation/chains     — EVM, Chainlink oracles, contract adapters, custody
  realestate/      @tokenisation/realestate — real-estate vertical (mature)
  compute/         @tokenisation/compute    — GPU compute vertical
  pack-loyalty/    @tokenisation/pack-loyalty — loyalty/behavior vertical (in-memory packs)
  pack-travel/, pack-securities/, pack-supply-chain/  — other verticals
  conformance-suite/, create-tokenised-asset/, sdk-playground/
sdk/               @tokenisation/sdk        — umbrella, re-exports everything; CLI `tokenise`
server/            @tokenisation/server     — Express API (SQLite dev / Postgres prod), IAM, 48 routers
contracts/         Foundry — ERC-3643 compliance stack + tokens + oracles + governance
sdk-react/, sdk-react-native/, ui/ (=@tokenisation/console), ui-kit/   — front-end
docs/              architecture, getting-started, api, guides, recipes, security, deployment
examples/          chainlink-starter, real-estate-demo, showcase, minimal-sdk-consumer (added)
_infrastructure/   apps + docusaurus website (off the SDK developer path)
```

## 2. Current public SDK API surface

Primary entry: `@tokenisation/core` (umbrella `@tokenisation/sdk` re-exports it). Stripe-style client:

```ts
import { createApiClient } from '@tokenisation/core';
const client = createApiClient({ apiKey: 'sk_test_…', baseUrl: 'http://localhost:3001' });
```

`ApiClient` exposes **12 resource modules** (`packages/core/src/ApiClient.ts`):

| Module | Purpose |
|--------|---------|
| `projects` | project/container grouping |
| `assets` | tokenizable assets (create/get/list/update/delete, activate/freeze/unfreeze, valuations) |
| `investors` | investor records, KYC, wallets |
| `tokens` | token issuance (create/get/list, deploy, tranches, issue, redeem, cap-table, …) |
| `transfers` | transfers + status |
| `compliance` | policy/compliance decisions |
| `events` | event stream |
| `webhooks` | webhook endpoints/deliveries |
| `audit` | audit log access |
| `governance` | proposals/voting (also offline `GovernanceEngine`) |
| `escrow` | conditional transfers/milestones |
| `cashflow` | distributions/dividends/payouts |

Auth: `apiKey` must start with `sk_`; sent as `Authorization: Bearer`. Optional `defaultHeaders` (dev-mode bypass). Subpath exports (post-F22): `@tokenisation/core/components` (React), `@tokenisation/core/storage` (+`/storage/postgres`).

Beyond the API client, the root barrel also exports: lifecycle/compliance/policy engines, state-machine registry, models, plugins, services, error classes + `ErrorCode`, AssetAbstraction (AssetType/TokenStandard/…), DecisionReceipt, DisasterRecovery, CustodyManager, IndexingEngine, orchestration (CrossPackEventBus, SagaOrchestrator, AuditChainManager), pack registry/manifests, offline engines, connectors. **Large surface** — institutional-grade but sprawling (see gap_analysis §typed-surface).

Server API: **48 routers** under `/api/v1` (assets, tokens, parties, investors, kyc, iam, compliance, audit, transfers, settlements, distributions, vesting, corporate-actions, issuance, redemption, …). Live OpenAPI at `/api/openapi.json` (311 paths); **committed** `server/openapi.{json,yaml}` are stale (6 paths — F19).

## 3. Current contract architecture (Foundry, `contracts/src`)

Built around the **ERC-3643 ("T-REX") permissioned-token** pattern, plus extensions:

- **Identity/compliance core:** `IdentityRegistry`, `ClaimTopicsRegistry`, `TrustedIssuersRegistry`, `ModularCompliance` + pluggable **compliance modules** (`Whitelist`, `CountryRestrictions`, `MaxBalance`, `MaxHolders`, `HoldTime`, `TransferFees`, `ACECompliance`, `HardwareVerification`).
- **Policy layer:** `IPolicyModule` + `PolicyModuleRegistry` + `AllowPolicy` / `TimePolicy` / `VolumePolicy`.
- **Tokens:** `ComplianceToken`, `ComplianceTokenUpgradeable` (UUPS), `ComplianceMultiToken` (1155), `ERC1410Token`/`ERC1410Compliance` (partitioned securities), `RealToken`, `ComputeToken`, `AhoyToken`, `ReputationSBT` (soulbound), and vertical NFTs (`AccessPassNFT`, `AirlineTicketNFT`, `CarRentalNFT`, `ConcertTicketNFT`, `HotelReservationNFT`, `GPUNodeNFT`).
- **Factory:** `TokenFactory` (+ `ITokenFactory`).
- **Oracles:** `ChainlinkPriceFeed`, `FunctionsConsumer`, `GPUComputeOracle`, `ACERouter`, `OracleRegistry`, `ProofOfReserveChecker`.
- **Distribution/automation:** `DividendDistributor`, `ComputeRevenueDistributor`, Chainlink keepers (`ComplianceKeeper`, `DistributionKeeper`, `TicketKeeper`).
- **Governance/ZKP:** `TokenGovernor`, `ZKPVerifierRegistry`, `ZKPComplianceModule`.
- **Interfaces/utils:** `IERC3643`, `ICompliance`, `IIdentityRegistry`, `IClaimTopicsRegistry`, `IERC1410`; `BatchOperations`, `GasOptimizedRegistry`, `PackedStorage`.

Coverage: **12 Foundry test files** in `contracts/test`.

## 4. Current loyalty flow (`packages/pack-loyalty`)

- **Model:** in-memory **pack** classes (not server-persisted), registered via a `PackManifest` (`id: 'loyalty'`, `rightTypes: ['BEHAVIOR','MEMBERSHIP']`). Packs: `LoyaltyPoints`, `BehaviorScore`, `ComputeCredit`, `DataStreamAccess`, `DriverReputation`, `FlyPlusPass`, `H2OUtilityCredit`, `AhoyToken`.
- **LoyaltyPoints flow:** configure (`redemptionRate`, `minRedemptionAmount`, `expiryDays`) → issue/earn (creates positions with `earnedAt`/`expiresAt`) → balance (available vs expired vs frozen) → `redeem({...})` returning `{success, redeemedValue|error}` with min-redemption + expiry checks. Right type `BEHAVIOR`, lifecycle `ACTIVE`, transferability rules set.
- **Maturity:** lowest of the verticals — **no server routes, no React-backed server persistence, 0 tests, no docs/recipe** (loyalty doc gap = prior F4). The `src/ui/*.tsx` components are excluded from the package build (prior F13).
- **Relevance to product direction:** the loyalty pack's `ComputeCredit` / `DataStreamAccess` packs and the `BEHAVIOR`/`ACCESS` right types are the closest existing primitives to the future modules (compute credits, dataset/model licenses, AI-agent access) — but they are demo-grade.

## 5. Current real estate flow (`packages/realestate`)

Most mature vertical. Server-backed modules + rich domain:
- **Packs/lifecycle:** `real-estate.pack`, `real-estate-lifecycle`, `UAERealEstate`, condition evaluators `DLDConditionEvaluator` / `VARAConditionEvaluator`.
- **Modules:** `DLDClient` (Dubai Land Department), `NAVModule` (net asset value), `InvestorTierModule`, `ExitWindowModule`, `LegalModule`.
- **Metadata/validation:** `RealEstateMetadata` model + `validation/real-estate` zod schemas.
- **Policies:** `uae-real-estate-policy`.
- **Providers/UI:** DLD provider integration; React components + ui-kit + hooks (UI excluded from package build, like other packs).
- **Server:** dedicated routes (`dld`, `nav`, `property-management`, `investor-tier`, `exit-window`, `secondary-market`, `corporate-actions`) with tests (`nav.service.test`, `dld.service.test`, `property-management.service.test`, `investor-tier.test`, `exit-window.test`, `secondary-market.test`).

## 6. Current testing setup

| Area | Runner | Files | Notes |
|------|--------|-------|-------|
| `@tokenisation/core` (the SDK foundation) | **none** | 0 | ⚠️ no `test` script, no vitest config — the foundation is **untested at the package level** |
| `@tokenisation/sdk` (umbrella) | vitest | 52 | 890 tests pass; 11 files fail to *load* (React 18/19 split — prior F11) |
| `@tokenisation/server` | vitest | 11 | in-memory SQLite, FK-enforced; service/route tests |
| `@tokenisation/realestate`, `pack-loyalty` | **none** | 0 | ⚠️ vertical packages have no tests |
| `contracts/` | Foundry | 12 | `.t.sol` suites |

New (added during prior iterations): `sdk/tests/AssetsResponseContract.test.ts` (F21), `server/src/__tests__/token-assetid.test.ts` (F20).

## 7. Current docs / demo setup

- Docs present and linked from README: architecture, getting-started (INSTALLATION/QUICKSTART/FIRST_PROJECT), api (REST_API, SDK_REFERENCE, AUTHENTICATION), guides, recipes (airline/car/concert/hotel — **no loyalty**), security, deployment.
- Demo/examples: `real-estate-demo`, `chainlink-starter`, `showcase`, and `minimal-sdk-consumer` (added). **No loyalty example** (prior F3).
- Docusaurus website under `_infrastructure/website` (build broken — F10).
- Known doc gaps from prior audit: README quick-start auth (F1/F18), how to get an API key (F2), stale committed OpenAPI (F19), limitations doc for stubs (F6).

## 8. Reusable primitives inventory

| Primitive | Where it lives | State |
|-----------|----------------|-------|
| **Asset** | core `models` + `Asset` type + `AssetState`/lifecycle state machines; server `assets` table/routes | ✅ solid, generic |
| **Right** | core `RightType` enum (`OWNERSHIP`, `ACCESS`, `BEHAVIOR`, `VERIFICATION`) + `RightModelSchema`, `RightTypeRegistry` | ⚠️ generic but **enum lacks `MEMBERSHIP`** that loyalty manifest references (inconsistency) |
| **Token** | core `tokens` module + types; server `tokens` table; contracts `ComplianceToken`/ERC-1410/factory | ✅ solid |
| **Metadata** | zod schemas (RightModel, AssetDescriptor) + per-vertical models (RealEstateMetadata) | ⚠️ no generic, per-right-type metadata **schema registry** |
| **Policy** | core `PolicyEvaluator`/`Policy`/`PolicyRule`; contracts `IPolicyModule` + Allow/Time/Volume; compliance engine | ✅ rich (on-chain + off-chain) |
| **Redemption** | server `redemption.routes` + `redemptions` table; loyalty `redeem()`; tokens `redeem` | ⚠️ exists but **not unified** across verticals |
| **Audit** | server `auditService` + `audit` table/routes; core `AuditChainManager`/`UnifiedAuditLog` (hash-chained); `DecisionReceipt` | ✅ strong primitive |
| **Permission** | server IAM: `orgs/users/roles/userRoles/apiKeys`; 5 default roles (admin, compliance_officer, ops, developer, read_only); `requireScope` | ⚠️ **scope vs permission mismatch** (middleware grants coarse `['admin']`/`read`/`write`; roles use `read:*`/`write:compliance` patterns) |

These primitives are the foundation a programmable-rights product would compose. The generic core (asset/right/token/policy/audit) is genuinely asset-class-agnostic — the main weaknesses are consistency (RightType), uniformity (redemption, metadata schemas), and authz granularity (roles↔scopes).
