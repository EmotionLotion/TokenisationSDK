# Developer Path: Clone → Working Product

This is the **actual** minimum path that works, based on code inspection (not yet runtime-verified — that happens in `install_test` / `api_server_test`). Gaps versus what the README currently documents are flagged.

## Corrected happy path

```bash
# 1. Clone & install
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
pnpm install
pnpm -r run build

# 2. Configure the server
cp server/.env.example server/.env

# 3. Get auth — CHOOSE ONE:

# 3a. Dev bypass (fastest for local poking)
#     edit server/.env: set AUTH_DEV_MODE=true
#     then header auth works: X-Dev-Org-Id: dev-org-1  (or x-dev-party-id)

# 3b. Real API key (matches the SDK example)
cd server && pnpm db:seed     # prints a one-time sk_test_... key — COPY IT

# 4. Start the server
cd server && pnpm dev          # http://localhost:3001 ; Swagger at /api/docs

# 5a. Create an asset via curl (dev-bypass form)
curl -X POST http://localhost:3001/api/v1/assets \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{"name":"Marina Heights Unit 2501","rightType":"OWNERSHIP","jurisdiction":{"countryCode":"AE"}}'
#   ^ REQUIRES AUTH_DEV_MODE=true (step 3a). With the default .env this returns 401.

# 5b. Or via the SDK with a real key (step 3b)
#   import { createApiClient } from '@tokenisation/core';
#   const client = createApiClient({ apiKey: 'sk_test_<from seed>', baseUrl: 'http://localhost:3001' });
#   const asset = await client.assets.create({ ... });
#   const token = await client.tokens.create({ ... });
```

## Where the README diverges from reality

| Step | README says | Reality |
|------|-------------|---------|
| Auth for curl | `X-Dev-Org-Id: dev-org-1` works | Only if `AUTH_DEV_MODE=true`; default `.env` has it `false` → 401 |
| SDK key | `apiKey: 'sk_test_xxx'` | Placeholder; must seed a real key (`pnpm db:seed`) or this fails IAM lookup |
| Getting a key | (not mentioned) | `cd server && pnpm db:seed` prints it once (`server/src/db/seed.ts:766`) |
| Build before run | `pnpm install && pnpm -r run build` | Plausible but unverified — confirm in `install_test` |

## Auth model (confirmed from `server/src/middleware/auth.ts`)

`apiKeyMiddleware` accepts, in order:
1. `x-dev-org-id` header — **only when `AUTH_DEV_MODE=true`** and not prod/staging.
2. `X-API-Key` header (standard).
3. `Authorization: Bearer sk_…` (API key as bearer).

Keys are argon2-hashed in the `apiKeys` table (`server/src/services/iam.service.ts`). The seed script creates an org + a `sk_test_` key and prints the plaintext once.

## SDK import path (confirmed)

`createApiClient` is exported by `@tokenisation/core` (`packages/core/src/index.ts:16`) and re-exported by `@tokenisation/sdk` (`sdk/src/index.ts:19` → `export * from '@tokenisation/core'`). Both README import forms are valid. Note the client constructor **requires** `apiKey` to start with `sk_` (`packages/core/src/ApiClient.ts:106`).

## Target product (loyalty) — gap

There is **no loyalty example or guide**. `packages/pack-loyalty/` exists (adapters, packs, plugins, ui, types), and recipes exist for airline/car/concert/hotel — but not loyalty. Building the mission's minimal loyalty-points product will require writing a new example against the loyalty pack and/or the API server (tracked for `loyalty_demo_test`).
