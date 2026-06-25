# API Server Test Report

Stage: `api_server_test`
Date: 2026-06-24
Verdict: **COMPLETED (with documentation gaps)** — a fresh developer **can** start the server (SQLite, zero config) and create the first asset and token. But the **root README's Quick Start does not work as written**: it 401s by default, and its token example is missing required fields. Workarounds are simple and the server itself behaves correctly.

Scope note: per the loop interpretation, full-monorepo blockers F10/F15/F17 were NOT touched. Only the API/server path was tested.

---

## Setup performed (the documented flow)

```bash
cp server/.env.example server/.env      # README step — OK
cd server && pnpm dev                    # README step — server starts on :3001
```

- DB: `sqlite` (default), connected, file at `server/data/ahoy.db`. **Zero-config startup works.**
- Server typecheck this stage: `pnpm --filter @tokenisation/server run typecheck` → **PASS**.
- Swagger UI: `GET /api/docs/` → **HTTP 200** (live).

## Required environment variables to actually use the API

| Var | Default in `.env.example` | Needed for first call? |
|-----|---------------------------|------------------------|
| `DB_MODE=sqlite` | sqlite | ✅ works as-is |
| `PORT=3001` | 3001 | ✅ |
| `AUTH_DEV_MODE` | **false** | ⚠️ **must be `true`** for the README's `X-Dev-Org-Id` header path (or seed a real `sk_test_` key). This is the #1 gap. |
| `KYC_PROVIDER=mock` | mock | ✅ (auto-approves in dev) |

## Commands, requests, and exact responses

### 1. Health — ✅ works
```
GET /health
→ 200 {"status":"ok","db":"connected","redis":"not configured","rateLimit":"in-memory","version":"1.0.0"}
```

### 2. Create asset — README curl VERBATIM, default `.env` — ❌ 401 (confirms F1)
```
POST /api/v1/assets  -H "X-Dev-Org-Id: dev-org-1"  (AUTH_DEV_MODE=false)
→ 401 {"error":{"message":"No valid authentication provided","code":"UNAUTHORIZED",...}}
```
Root cause: dev-header bypass is gated on `AUTH_DEV_MODE=true` (`server/src/middleware/auth.ts:390-391`); `.env.example` ships `false`. The README never says to change it. **F1 confirmed at runtime.**

### 3. Create asset — after setting `AUTH_DEV_MODE=true` — ✅ 201
```
POST /api/v1/assets  -H "X-Dev-Org-Id: dev-org-1"
  -d '{"name":"Marina Heights Unit 2501","rightType":"OWNERSHIP","jurisdiction":{"countryCode":"AE"}}'
→ 201 {"asset":{"id":"25419ac8-9c86-4ee0-b925-fcef6e8ab7dd","state":"DRAFT","orgId":null,...}}
```
Note: response is wrapped as `{"asset":{...}}`. `orgId` came back `null` even though `X-Dev-Org-Id` was sent (minor; see F20).

### 4. Create token — README fields only — ❌ two failures
```
POST /api/v1/tokens -H X-Dev-Org-Id:dev-org-1 -d '{"name":"MHT","symbol":"MHT","chainId":8453,"assetId":"<id>"}'
→ 400 {"error":"Idempotency-Key header is required for this operation","code":"IDEMPOTENCY_KEY_REQUIRED"}

# add -H "Idempotency-Key: ...":
→ 400 {"error":{"message":"totalSupply: Required","code":"VALIDATION_ERROR",...}}
```
The README's token example (`{name,symbol,chainId,assetId}`) is **missing the `Idempotency-Key` header and the required `totalSupply` field**. (Schema in `server/src/routes/token.routes.ts:14-25` requires `name`, `symbol`, `totalSupply` (digit string), `chainId`.)

### 4c. Create token — complete request — ✅ 201
```
POST /api/v1/tokens  -H "X-Dev-Org-Id: dev-org-1"  -H "Idempotency-Key: test-token-002"
  -d '{"name":"MHT","symbol":"MHT","chainId":8453,"assetId":"<id>","totalSupply":"1000000"}'
→ 201 {"id":"22f419fd-...","symbol":"MHT","standard":"ERC3643","decimals":18,"totalSupply":"1000000",
       "status":"draft","orgId":"dev-org-1","assetId":null,...}
```
⚠️ **Data-linking bug:** `assetId` was provided but the created token persisted `assetId: null` (see F20).

### 5–8. Read & error paths — ✅ all correct
```
GET  /api/v1/assets/{id}      → 200   (read-after-write OK)
GET  /api/v1/assets           → 200   (list)
GET  /api/v1/tokens           → 200   (list)
GET  /api/v1/parties          → 200   (list)
GET  /api/v1/tokens/{id}      → 200
GET  /api/v1/nonexistent      → 404
GET  /api/v1/assets (no auth) → 401   (auth enforced when present)
```

## Working / broken endpoints summary

- **Working:** `/health`, `/api/docs`, `/api/openapi.json`, `POST+GET /api/v1/assets`, `POST+GET /api/v1/tokens`, `GET /api/v1/parties`. Full matrix in `api_endpoint_matrix.md`.
- **Broken for the documented flow:** the README Quick Start (curl + SDK token snippet) — see F1/F18.
- No server crashes or 500s observed.

## Documented routes vs actual routes

- **Live runtime spec** (`GET /api/openapi.json`, generated from JSDoc via swagger-jsdoc): **311 paths** — comprehensive, includes `/assets`, `/tokens`, `/parties`, lifecycle ops, etc.
- **Committed static spec files** `server/openapi.json` and `server/openapi.yaml`: **only 6 paths** (all `/investors/*`). **Stale** — a developer generating a client from the checked-in spec gets a near-empty API. Regenerate via `pnpm openapi:generate` and commit (F19).
- Actual mounted routers: **48** under `/api/v1` (see matrix).
- Canonical REST doc `docs/api/REST_API.md` **correctly** shows `Idempotency-Key` + `totalSupply` for tokens — so the bug is README ↔ canonical-doc inconsistency, not a missing-doc.

## Missing / incorrect docs found

1. **F1** (already tracked): README curl 401s by default — `AUTH_DEV_MODE`/seed not documented. **Confirmed at runtime.**
2. **F18 (new):** Root README token example is incomplete/wrong — omits the required `Idempotency-Key` header and `totalSupply` field. (Canonical `docs/api/REST_API.md` is correct; align the README to it.)
3. **F19 (new):** Committed `server/openapi.json` + `openapi.yaml` are stale (6 paths vs 311 live). Regenerate & commit.
4. **F20 (new, code) — FIXED 2026-06-24:** `POST /api/v1/tokens` ignored the supplied `assetId` (persisted `null`) because `createToken()` omitted `assetId` from the DB insert. Fixed in `server/src/services/token.service.ts` (+ regression test); end-to-end `token.assetId === asset.id` now holds. (The `POST /api/v1/assets` `orgId: null` under dev-header remains a separate minor note, not addressed.)

## Bottom line

The backend is solid and the core RWA flow (asset → token) works on SQLite with zero infra. The friction is **documentation**: following the root README literally fails (401, then missing token fields). With `AUTH_DEV_MODE=true` and the complete token payload, a developer reaches a created asset + token in minutes. Advancing to `sdk_consumer_test`.
