# API Endpoint Matrix

Stage: `api_server_test` · Date: 2026-06-24 · Server: `http://localhost:3001`, SQLite, `AUTH_DEV_MODE=true`.

Auth accepted by `apiKeyMiddleware` (in order): `x-dev-org-id` (only if `AUTH_DEV_MODE=true`), `X-API-Key`, `Authorization: Bearer sk_…`.

## Endpoints exercised (live)

| Method | Path | Auth | Result | Notes |
|--------|------|------|--------|-------|
| GET | `/health` | none | **200** | `{status:ok, db:connected, version:1.0.0}` |
| GET | `/api/docs/` | none | **200** | Swagger UI (live) |
| GET | `/api/openapi.json` | none | **200** | Live spec, **311 paths** (JSDoc-generated) |
| POST | `/api/v1/assets` | `X-Dev-Org-Id`, dev off | **401** | README curl verbatim → UNAUTHORIZED (F1) |
| POST | `/api/v1/assets` | `X-Dev-Org-Id`, dev on | **201** | `{asset:{id,state:DRAFT,...}}`; `orgId:null` (F20) |
| GET | `/api/v1/assets/{id}` | `X-Dev-Org-Id` | **200** | read-after-write OK |
| GET | `/api/v1/assets` | `X-Dev-Org-Id` | **200** | list |
| POST | `/api/v1/tokens` | `X-Dev-Org-Id`, no Idempotency-Key | **400** | `IDEMPOTENCY_KEY_REQUIRED` (F18) |
| POST | `/api/v1/tokens` | + Idempotency-Key, no totalSupply | **400** | `VALIDATION_ERROR: totalSupply: Required` (F18) |
| POST | `/api/v1/tokens` | + Idempotency-Key + totalSupply | **201** | `{id,symbol,standard:ERC3643,...}`; `assetId:null` (F20) |
| GET | `/api/v1/tokens/{id}` | `X-Dev-Org-Id` | **200** | |
| GET | `/api/v1/tokens` | `X-Dev-Org-Id` | **200** | list |
| GET | `/api/v1/parties` | `X-Dev-Org-Id` | **200** | list |
| GET | `/api/v1/nonexistent` | `X-Dev-Org-Id` | **404** | correct not-found |
| GET | `/api/v1/assets` | none | **401** | auth enforced |

## Token create — required payload (from `server/src/routes/token.routes.ts:14-25`)

Required: `name` (1–100), `symbol` (1–10, alphanumeric), `totalSupply` (digit string), `chainId` (positive int).
Optional: `projectId`, `assetId` (uuid), `decimals` (0–18), `standard` (`ERC3643|ERC1400|ERC20`, default `ERC3643`), `maxSupply`, `complianceModules`, `metadata`.
Header: **`Idempotency-Key` required.**

## Documented vs actual surface

| Source | Paths | Status |
|--------|-------|--------|
| Live `/api/openapi.json` (runtime, JSDoc) | **311** | ✅ comprehensive |
| Committed `server/openapi.json` | **6** (investors only) | ❌ stale (F19) |
| Committed `server/openapi.yaml` | **6** (investors only) | ❌ stale (F19) |
| Mounted `/api/v1` routers (`src/index.ts`) | **48** | — |

## All 48 mounted `/api/v1` routers

`assets, audit, auth, car-rentals, chains, compliance, concerts, corporate-actions, custody, datasources, distributions, dld, eventbus, events, export, flights, gas, hotels, iam, idempotency, indexer, investors, issuance, kyc, kyc-webhooks, ledger, markets, metrics, parties, payment-rails, policies, projects, proofs, properties, reconciliation, relayer, reports, scheduler, settlements, storage, themes, tickets, tokens, transfers, transitions, truthview, vesting, webhooks`

Plus non-`/api/v1` mounts: `GET /health`, `/api/docs`, `/api/openapi.json`, `/oauth/*`.

## Public vs protected (from `src/index.ts`)

- **Public:** `/health`, `/api/docs`, `/api/openapi.json`, `/api/v1/auth`, `/api/v1/chains`, `/oauth`, `/api/v1/kyc-webhooks`, `/api/v1/events` (SSE).
- **Protected** (`apiKeyMiddleware` + `tenantContextMiddleware`): `assets, tokens, parties, investors, kyc, iam, projects, compliance, audit, transfers, settlements, distributions, vesting, corporate-actions, payment-rails, issuance, …` (remaining routers).
- Rate limiting: stricter on `/auth`, `/transfers`, `/tokens`, `/relayer`; standard elsewhere (in-memory without Redis).
