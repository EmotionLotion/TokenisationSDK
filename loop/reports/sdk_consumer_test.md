# SDK Consumer Test Report

Stage: `sdk_consumer_test`
Date: 2026-06-24
Verdict: **BLOCKED** — the SDK *can* create assets and tokens from an external app, but **a fresh developer following the README cannot succeed**. The documented `import { createApiClient } from '@tokenisation/core'` fails in a clean Node/TS app at three points (npm ERESOLVE, then `react`/`drizzle-orm` module-not-found at import), and once running, `client.assets.create()` returns the wrong shape so `asset.id` is `undefined`. Core functionality works only after non-obvious workarounds.

Scope: tested the SDK as an external consumer. Did not touch F10/F15/F17. F18/F19/F20 were not "fixed"; F20 re-confirmed as it affects consumer usage.

---

## Test setup (as an external developer)

- App created **outside** the monorepo: `/home/amk/Desktop/tokenisation-sdk-consumer-test` (ESM, TypeScript).
- SDK delivered as a packed tarball (simulating publish): `pnpm pack` on `@tokenisation/core` → `tokenisation-core-1.0.0.tgz`.
- Install method: `npm install ./tokenisation-core-1.0.0.tgz`.
- Server: local API on `:3001` (run as `pnpm exec tsx src/index.ts` — see env note), authenticated with a **real seeded key** (`pnpm db:seed --org-only` → `sk_test_…`), exactly the documented "use a real key" path.
- Import path tested: `@tokenisation/core` (README's primary SDK example). Entry resolves to `dist/index.js` (only `.` export exists).

## What happened, step by step

| # | Action | Result |
|---|--------|--------|
| 1 | `npm install ./tokenisation-core-1.0.0.tgz` | ❌ **ERESOLVE** (see F22a) |
| 2 | retry `--legacy-peer-deps` | ✅ installs; core + runtime deps (ethers/zod/viem) present |
| 3 | `import { createApiClient } from '@tokenisation/core'`; run | ❌ `ERR_MODULE_NOT_FOUND: Cannot find package 'react'` (see F22b) |
| 4 | `npm install react react-dom` | ✅ |
| 5 | run again | ❌ `ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm'` (see F22b) |
| 6 | `npm install drizzle-orm pg` | ✅ |
| 7 | run again | ✅ **runs**: asset created, token created |

So to use the API client at all, a non-React, non-Postgres backend app was forced to install `react`, `react-dom`, `drizzle-orm`, and `pg`, plus `--legacy-peer-deps`.

## Functional result (after workarounds) — core flow works

```
CREATE ASSET raw return: {"asset":{"id":"b910852c-...","state":"DRAFT","orgId":null,...}}
asset.id (top-level): undefined          ← BUG (F21)
resolved assetId (asset.asset.id): b910852c-...
LIST assets count: unknown               ← list envelope not {data:[]} (minor, F21b)
CREATE TOKEN raw return: {"id":"913231b4-...","symbol":"MHT","assetId":null,...}
token.id: 913231b4-...                    ← works (token returns unwrapped)
SDK CONSUMER SMOKE TEST: OK
```

The SDK successfully talked to the server with the real `sk_test_` key (IAM auth), validated inputs with zod, and created both resources.

## Findings

### F22 — `@tokenisation/core` is not consumable as published (PACKAGING, P0 for SDK product)

- **F22a — install ERESOLVE:** `npm install @tokenisation/core` fails. core declares `peerOptional react@^18`, but its optional `drizzle-orm` peer transitively pulls `@op-engineering/op-sqlite`/`react-native`/`expo-sqlite` which require `react@^19`. Plain npm can't resolve react@18 vs react@19. Workaround: `--legacy-peer-deps` (or `--force`). Undocumented.
- **F22b — barrel eagerly imports optional/peer-only modules:** `packages/core/src/index.ts` does `export * from './components/index.js'` (line 342 → `TokenizeButton` statically `import 'react'`) and `export * from './storage/index.js'` (line 358 → `PostgresAdapter` statically `import 'drizzle-orm/node-postgres'` and `import pg`). Because these are **static** top-level imports re-exported from the main entry, merely doing `import { createApiClient } from '@tokenisation/core'` loads them and crashes with `Cannot find package 'react' / 'drizzle-orm'` in any app that hasn't installed those optional peers. (S3StoragePlugin uses dynamic `import()`, so it's fine — the problem is the static ones.)
- **Impact:** the README's primary SDK example cannot run in a clean backend/Node app. A consumer is forced to install React + Drizzle + pg they don't use.
- **Fix direction:** move React components and node-only storage adapters out of the root barrel into **subpath exports** (e.g. `@tokenisation/core/components`, `@tokenisation/core/storage`), so the root entry stays framework/DB-agnostic; add an `./client` subpath like `@tokenisation/sdk` already advertises. Then document the install.

### F21 — `client.assets.create()` returns the wrong shape (CONTRACT BUG, P1)

- The HTTP layer (`utils/http.ts`) sets `data = await response.json()` (the whole body); `AssetsModule.create` returns `response.data` typed as `Asset`. But the server responds `{"asset": { ... }}`, so the SDK returns `{asset:{...}}` while the **type claims `Asset`**. Result: `asset.id` is `undefined` at runtime (real id at `asset.asset.id`).
- **The README breaks here:** `const token = await client.tokens.create({ ..., assetId: asset.id })` passes `undefined`. (Compounds with F20, where the server drops `assetId` anyway.)
- This is a type-safe-looking lie (no TS error; wrong at runtime). Either unwrap `{asset}`/`{token}` envelopes in the modules, or make the server return a consistent envelope and have the SDK unwrap `.data`/`.asset` uniformly. **Token create happens to work** because the server returns the token unwrapped — so assets and tokens are inconsistent.
- **F21b (minor):** `client.assets.list()` return shape didn't expose `.data` or `.length` as the `PaginatedResponse<Asset>` type implies — list envelope likely differs too. Verify and align.

### F20 — re-confirmed via SDK

Token created through the SDK persisted `assetId: null` despite a valid `assetId` being sent; asset `orgId: null`. (Already tracked.)

### Cosmetic

- Importing core prints 6 deprecation warnings ("Offline engines are deprecated…"). Noisy for a fresh consumer; consider gating behind a flag.

## Package export / build observations

- `@tokenisation/core` exposes only the `.` export → no way to import just the API client without dragging in the whole barrel (root of F22b).
- `@tokenisation/sdk` (umbrella) advertises rich subpaths (`./client`, `./server`, `./components`, …) but depends on sibling packages via `workspace:*`; installing it standalone from a tarball would not resolve those without publishing all packages — **not tested here** (defer to `packaging_review`); `@tokenisation/core` is sufficient for the README's primary example and is the right unit to fix first.
- Tarball build output is correct: `dist/index.js` + `dist/index.d.ts` present; ESM resolves.

## Can a fresh developer succeed?

**No, not by following the README.** They hit: (1) `npm install` ERESOLVE, (2) `react` not found on import, (3) `drizzle-orm` not found on import, (4) `asset.id` undefined. Each is individually surmountable by an expert, but the documented path does not work as written. Hence **BLOCKED**.

The good news: the underlying client + server flow is sound — once the barrel is fixed (F22) and the asset envelope is corrected (F21), the documented example would work. A clean, working minimal consumer is provided at `examples/minimal-sdk-consumer/` with the current caveats spelled out.

## Recommended fix order to unblock

1. **F22b** — stop re-exporting React/Postgres from the core root barrel; add subpath exports. (Unblocks `import { createApiClient }`.)
2. **F21** — unwrap the `{asset}` envelope so `assets.create()` returns a real `Asset`.
3. **F22a** — document `--legacy-peer-deps` (or fix the react peer range) ; **F20** — persist `assetId`.

---

## UPDATE 2026-06-24 — F22 FIXED (clean external import now works)

**Changes (packaging only; no functionality removed — moved to subpaths):**
- `packages/core/src/index.ts`: removed `export * from './components/index.js'` (React) and changed `export * from './storage/index.js'` → `export * from './storage/DatabaseAdapter.js'` (drops the drizzle/pg `PostgresAdapter` from the root). Kept the framework-agnostic theme helpers (`defaultTheme`, `createStyles`, `TokenisationTheme` from `./components/theme.js`, which has no React import) on the root for backwards compatibility (used by `@tokenisation/realestate` components).
- `packages/core/package.json`: added subpath `exports` `./components`, `./storage`, `./storage/postgres`; widened optional peer `react` to `^18.0.0 || ^19.0.0` (clears F22a ERESOLVE).

**Verification (fresh app `../tokenisation-sdk-consumer-test`, packed core tarball):**
```
npm install tokenisation-core-1.0.0.tgz        # no --legacy-peer-deps, no react/drizzle/pg
→ added 40 packages (core + ethers/zod/viem/...); react/drizzle/pg ABSENT
node_modules/.bin/tsx src/index.ts
→ Imported createApiClient OK (no react/drizzle/pg needed).
→ Created asset: 471ce049-...
→ Created token: 8fd3f5e7-...
→ F22 VERIFY: OK
```
Also: `pnpm --filter @tokenisation/core` typecheck+build PASS; `pnpm --filter @tokenisation/sdk` typecheck+build PASS (sdk inherits the cleaner root via `export * from '@tokenisation/core'`).

**Result:** the F22a (ERESOLVE) and F22b (eager react/drizzle/pg import) blockers are resolved. A clean backend/Node app can install and use `createApiClient` without UI/DB optional deps. React components remain available at `@tokenisation/core/components`; the Postgres adapter at `@tokenisation/core/storage` (or `/storage/postgres`).

**Still BLOCKED (out of this iteration's scope):** the stage stays `blocked` because **F21** (`client.assets.create()` returns `{asset:{…}}`, so `asset.id` is `undefined` — the README's exact `assetId: asset.id` still breaks) and **F20** (server drops `assetId`) are unresolved. The example/consumer still uses the `created.asset.id` workaround. Next: fix F21, then re-run sdk_consumer_test for a clean pass.

---

## UPDATE 2026-06-24 — F21 FIXED (asset create/get return a bare Asset)

**Change (SDK only; server response behavior unchanged per scope):**
- `packages/core/src/modules/assets.ts`: added a defensive `unwrapAsset(body)` helper (`return body.asset ?? body`) and applied it in `create()` and `get()` — both server endpoints return `{ asset: {...} }`, while `update()` already returns a bare asset (left as-is). The helper unwraps only successful bodies; the HTTP layer still throws on errors first (no error hiding).
- Added regression test `sdk/tests/AssetsResponseContract.test.ts` (mocks `fetch`): asserts `create()`/`get()` unwrap the envelope and that a bare-asset body still works defensively. **3/3 pass.**

**Verification:**
- `core` typecheck+build PASS; `sdk` typecheck+build PASS; new test 3/3.
- Fresh external app (clean install, no react/drizzle/pg, no `--legacy-peer-deps`), README-style code with **no workaround**:
  ```
  asset.id (direct): 62cd2e26-8619-4893-a0f9-8097ca807200
  get(asset.id).id:  62cd2e26-8619-4893-a0f9-8097ca807200
  token.id:          16fedcb3-f330-4f3e-801b-017bbd9df4a6
  ```
  `const asset = await client.assets.create(...)` → `asset.id` is defined; `client.assets.get(asset.id)` round-trips; the token was created passing `asset.id` directly. The in-repo `examples/minimal-sdk-consumer` was simplified to this README form.

**F21 is resolved.** (F21b — `assets.list()` envelope `{assets,…}` vs `PaginatedResponse<{data}>` — split out as a separate P2 item; not the create-flow blocker.)

### sdk_consumer_test verdict after F21

The SDK is now genuinely consumable: clean install + import (F22) and a correct asset create/get contract (F21). The flow creates an asset, fetches it, and creates a token using the returned `asset.id`. **The stage remains `blocked` solely on F20** (server-side): the created token still persists `assetId: null`, so the asset→token relationship a real product needs is not stored. F20 is a server persistence fix explicitly out of scope this iteration. Recommended next: F20 (server-side), then re-run for a clean `completed`.

---

## UPDATE 2026-06-24 — F20 FIXED → sdk_consumer_test COMPLETED

**Change (server-side, one line):** `server/src/services/token.service.ts` `createToken()` — the `db.insert(tokens).values({...})` omitted `assetId` even though the `tokens` table has an `asset_id` FK column. Added `assetId: input.assetId`. Schema and validation unchanged; no architecture change.

**Test:** added `server/src/__tests__/token-assetid.test.ts` (seeds org+asset to satisfy FKs, then asserts the created token persists/returns `assetId` and round-trips via `getToken`; and that `assetId` is null when omitted). Server typecheck PASS; test 2/2.

**End-to-end verification (clean external app + live server):**
```
asset.id:     a64c3a8d-4c2e-496d-adc0-3ecf453b0c0b
token.id:     6fe90443-...  | token.assetId: a64c3a8d-4c2e-496d-adc0-3ecf453b0c0b
F20 VERIFY: OK — token.assetId === asset.id
```

### FINAL VERDICT — sdk_consumer_test PASSES

A fresh external backend app can now, with **no workarounds**:
1. `npm install @tokenisation/core` (no `--legacy-peer-deps`, no react/drizzle/pg) — **F22**
2. `import { createApiClient } from '@tokenisation/core'` — **F22**
3. `const asset = await client.assets.create(...)` → `asset.id` is defined — **F21**
4. `await client.tokens.create({ ..., assetId: asset.id, totalSupply, ... }, idempotencyKey)` → token created and **`token.assetId === asset.id`** — **F20**

All four blockers (F22a, F22b, F21, F20) are resolved. `sdk_consumer_test = completed`; advancing to `loyalty_demo_test`. Remaining non-blocking follow-ups tracked separately: **F18** (README token example docs), **F19** (stale committed OpenAPI), **F21b** (`assets.list()` envelope).
