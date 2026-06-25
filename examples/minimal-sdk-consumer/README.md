# Minimal SDK Consumer

A tiny external app that uses `@tokenisation/core` to create an asset and a token against a local API server. Generated/verified by the loop harness during `sdk_consumer_test` (2026-06-24).

> ⚠️ **Status: works with workarounds.** The SDK functionally creates assets and tokens, but the documented "just import and go" path currently fails in a clean app. The workarounds below are required until the linked issues are fixed. See `loop/reports/sdk_consumer_test.md` for the full investigation.

## Prerequisites

1. **Run the API server** on `http://localhost:3001` (see the repo README).
2. **Get a real API key** (the SDK requires a key starting with `sk_`):
   ```bash
   cd server && pnpm db:seed --org-only      # prints a one-time sk_test_... key
   export AHOY_API_KEY="sk_test_..."
   ```

## Install

```bash
npm install @tokenisation/core
npm install -D tsx typescript @types/node
```

As of the F22 fix, a clean backend/Node app needs **none** of react / react-dom / drizzle-orm / pg, and **no** `--legacy-peer-deps`. The root entry (`createApiClient`, types, domain helpers) is framework/DB-agnostic. Optional extras live on subpaths:
- React components → `@tokenisation/core/components`
- Postgres storage adapter → `@tokenisation/core/storage` (or `/storage/postgres`)

## Run

```bash
npx tsx src/index.ts
```

Expected output:
```
Created asset: <uuid>
Created token: <uuid>
Done.
```

## Known issues this example works around

| Issue | Status | What it is | Workaround used here |
|-------|--------|-----------|----------------------|
| F22a | ✅ fixed | `npm install` ERESOLVE (react 18 vs 19 via optional drizzle peers) | none needed (react peer widened to 18‖19) |
| F22b | ✅ fixed | core root barrel eagerly imported React components + Postgres adapter | none needed (moved to subpaths) |
| F21  | ✅ fixed | `client.assets.create()`/`get()` now return a bare `Asset`, so `asset.id` works directly | none needed |
| F18  | ⚠️ open | token creation needs an `Idempotency-Key` and `totalSupply` (root README omits both) | pass idempotency key (2nd arg) + `totalSupply` |
| F20  | ⚠️ open | server drops the supplied `assetId` on the created token | (none — server-side fix needed) |

This example now matches the README's original asset form (`const asset = await client.assets.create(...)`, then `asset.id`). The remaining open items (F18 docs, F20 server-side link) do not affect importing/using the SDK.

## Files

- `src/index.ts` — the smoke test.
- A separate scratch copy was also run from outside the monorepo (`../tokenisation-sdk-consumer-test`) to validate a true external install via a packed tarball.
