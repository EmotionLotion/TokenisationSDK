# Repo Audit Report

Stage: `repo_audit`
Date: 2026-06-24
Method: Static read-only inspection. No commands that mutate state were run; install/build verification is deferred to the `install_test` stage (one stage per iteration).

---

## 1. What this SDK is supposed to do

TokenisationSDK is a **modular TypeScript monorepo for building compliant tokenized real-world-asset (RWA) platforms**. It ships:

- A generic, asset-class-agnostic foundation (`@tokenisation/core`) providing a lifecycle engine, compliance engine, state machine, models, a Stripe-like `ApiClient`, and a plugin/pack system.
- Opt-in **vertical packs**: real estate, GPU compute, travel (airline/hotel/car/concert), loyalty points, US Reg D securities, supply chain.
- An **Express API server** (`@tokenisation/server`) with zero-config SQLite for dev and PostgreSQL for production, IAM (orgs/users/roles/API keys), KYC/custody/storage/signing service abstractions, OpenAPI/Swagger, and OpenTelemetry.
- **EVM smart contracts** (Foundry) under `contracts/`.
- Front-end SDKs: `sdk-react`, `sdk-react-native`, plus a `ui` app and `ui-kit`.

The umbrella package `@tokenisation/sdk` re-exports everything; individual `@tokenisation/*` packages can be installed à la carte.

Status is self-described as **Alpha** (README badge). That framing is broadly honest — several subsystems are explicitly stubbed (see §6).

## 2. Repo structure (map)

```
/                     root workspace (name: tokenisation-platform, pnpm@9.15.0)
├── sdk/              @tokenisation/sdk — umbrella, re-exports all packages; CLI bin "tokenise"
├── packages/
│   ├── core/         @tokenisation/core — foundation (ApiClient, createApiClient, lifecycle, packs)
│   ├── compliance/   @tokenisation/compliance — KYC/AML, identity claims, jurisdiction
│   ├── chains/       @tokenisation/chains — EVM, Chainlink, contracts, custody
│   ├── compute/      @tokenisation/compute — GPU compute vertical
│   ├── realestate/   @tokenisation/realestate — real estate vertical
│   ├── pack-travel/  airline, hotel, car rental, concert
│   ├── pack-loyalty/ loyalty points, behavior scores   ← mission target vertical
│   ├── pack-securities/   US Reg D
│   ├── pack-supply-chain/ warehouse receipts
│   ├── conformance-suite/ cross-pack conformance tests
│   ├── create-tokenised-asset/  scaffolder
│   └── sdk-playground/    dev playground
├── server/           Express API server (SQLite/Postgres, IAM, OpenAPI)
├── contracts/        Foundry smart contracts
├── sdk-react/, sdk-react-native/, ui/, ui-kit/   front-end
├── docs/             architecture, getting-started, api, guides, recipes, security, deployment
├── examples/         chainlink-starter, real-estate-demo, showcase, shared
├── _infrastructure/  apps + website (moved here in recent commit)
└── loop/             this vetting harness
```

Workspace globs (root `package.json` + `pnpm-workspace.yaml`) agree: `sdk, ui, ui-kit, sdk-react, sdk-react-native, server, packages/*, _infrastructure/apps/*, _infrastructure/website`.

## 3. Minimum path from clone to a working product (as actually implemented)

1. `git clone … && cd TokenisationSDK`
2. `pnpm install`
3. `pnpm -r run build`
4. `cp server/.env.example server/.env`
5. **Obtain auth** — one of:
   - Dev bypass: set `AUTH_DEV_MODE=true` in `server/.env`, then use header `X-Dev-Org-Id: <org>` / `x-dev-party-id`, **OR**
   - Real key: `cd server && pnpm db:seed` → it prints a one-time `sk_test_…` key; use it as `Bearer sk_…` / `X-API-Key` / SDK `apiKey`.
6. `cd server && pnpm dev` (listens on `:3001`, Swagger at `/api/docs`)
7. Create an asset → create a token (via curl or the `@tokenisation/core` `ApiClient`).

**The root README documents step 7 but omits step 5.** That omission is the headline finding (see §7, B1/B2).

## 4. Missing docs

See `missing_docs.md`. Summary: the **first-API-key / auth bootstrap** is not surfaced in the main getting-started flow, and there is **no loyalty guide/recipe** even though loyalty is a shipped pack and the harness mission's target product.

## 5. Broken or unclear commands

- **Root README curl Quick Start fails out of the box.** It sends `-H "X-Dev-Org-Id: dev-org-1"`, but `server/.env.example` ships `AUTH_DEV_MODE=false`. The dev-header bypass is gated on `AUTH_DEV_MODE=true` (`server/src/middleware/auth.ts:390-391`), so the call returns 401. The root README never mentions enabling dev mode or seeding a key. (`server/README.md:155` shows the correct `AUTH_DEV_MODE=true pnpm dev` form — the root README is the one that's wrong.)
- **SDK Quick Start uses a placeholder key.** README and `docs/getting-started/QUICKSTART.md` both use `apiKey: 'sk_test_xxxxx'`, which fails the IAM lookup. The working path (`pnpm db:seed`, which prints a real key — `server/src/db/seed.ts:766`) is not referenced from either.
- **Mixed lockfiles.** `server/` contains its own `package-lock.json` AND `pnpm-lock.yaml` alongside the root `pnpm-lock.yaml`; `sdk/`, `sdk-react/`, `ui/`, `ui-kit/` also carry stray `package-lock.json`. Potential install ambiguity — verify in `install_test`.
- `pnpm -r run build` / `typecheck` reliability is unverified — defer to `install_test`.

## 6. Incomplete / stubbed / overclaimed features

Confirmed stubs (explicit in code):
- **Jurisdiction adapters** `us.adapter.ts`, `sg.adapter.ts`: ownership verification, tokenization notification, and valuation all `console.warn(... not implemented - using stub)`.
- **`@tokenisation/core` `DatabaseAdapter`**: transaction insert/update/delete `not implemented` (`packages/core/src/storage/DatabaseAdapter.ts:601-613`).
- **KYC plugin**: direct provider integration not implemented — must route through `serverEndpoint` (`packages/compliance/src/plugins/kyc/KycPlugin.ts:276`).
- **Circle payment provider**: refund lookup not implemented (`packages/core/src/providers/payment/CircleProvider.ts:450`).
- **Azure storage adapter**: not implemented (`server/src/services/storage/index.ts:65`).
- **Defaults are mocks**: `KYC_PROVIDER=mock` (auto-approves), custody falls back to `mock`, `SIGNING_PROVIDER=ephemeral`. These refuse to start in production (good), but mean the dev experience is mock-backed by default — must not be described as production compliance.

Overclaim risk: README tagline "building **compliant** tokenized asset platforms" while compliance/jurisdiction pieces are partly stubbed. The Alpha badge mitigates this, but security/compliance language should be qualified (tracked for `security_review`).

## 7. What blocks an external developer

- **B1 (critical):** Root README Quick Start curl returns 401 out of the box — dev mode off by default and not mentioned.
- **B2 (critical):** No documented way to get a real `sk_test_` API key in the getting-started flow; the working `pnpm db:seed` path is undocumented in README/QUICKSTART.
- **B3 (high):** No minimal/loyalty end-to-end example exists (`examples/` has real-estate-demo, chainlink-starter, showcase only) — the mission's target product has no reference.
- **B4 (medium):** Mixed/stray lockfiles may cause install confusion.
- **B5 (medium):** Stubbed compliance/jurisdiction features are not flagged in user-facing docs; a developer may assume they work.

See `developer_path.md` for the corrected step-by-step path and `fix_queue.md` for actionable items.
