# Install Test Report

Stage: `install_test`
Date: 2026-06-24
Verdict: **BLOCKED** — `pnpm install` works, but the documented `pnpm -r run build` and `pnpm -r run typecheck` **fail** at `@tokenisation/core`, and `pnpm --filter @tokenisation/sdk test:run` has failing test files. A fresh developer following the README cannot get a clean build.

---

## Environment

| Tool | Version | Notes |
|------|---------|-------|
| node | v20.20.0 | OK |
| pnpm | 9.15.0 | Matches root `packageManager: pnpm@9.15.0` ✓ |
| npm | 10.8.2 | present (not used) |
| corepack | present | available |

## Commands run & results

| # | Command | Result |
|---|---------|--------|
| 1 | `node -v` | ✅ v20.20.0 |
| 2 | `pnpm -v` | ✅ 9.15.0 |
| 3 | `pnpm install` | ⚠️ **Succeeds** (14.6s) with peer-dependency warnings |
| 4 | `pnpm -r run build` | ❌ **FAILS** — `_infrastructure/website` (docusaurus) then `@tokenisation/core` (tsc) |
| 5 | `pnpm -r --filter '!tokenisation-sdk-docs' run build` | ❌ **FAILS** at `@tokenisation/core` (12 tsc errors) |
| 6 | `pnpm -r run typecheck` | ❌ **FAILS** at `@tokenisation/core` (same 12 errors) |
| 7 | `pnpm --filter @tokenisation/sdk test:run` | ❌ **FAILS** — 890 tests pass, but 11 of 40 test files fail to load (React jsx runtime) |

---

## Failure 1 — `@tokenisation/core` does not compile (BLOCKER, P0)

`pnpm -r run build` and `pnpm -r run typecheck` both die here. Because every other `@tokenisation/*` package and the umbrella `@tokenisation/sdk` depend on core, **nothing downstream builds** — no `dist/` is produced for any package.

Exact errors:
```
packages/core: src/plugins/storage/S3StoragePlugin.ts(40,41): error TS2307:
  Cannot find module '@aws-sdk/client-s3' or its corresponding type declarations.
  ... (10 such errors, lines 40-266, also '@aws-sdk/s3-request-presigner')
packages/core: src/storage/postgres/PostgresAdapter.ts(11,16): error TS7016:
  Could not find a declaration file for module 'pg'.
  '.../node_modules/.pnpm/pg@8.17.2/.../pg/esm/index.mjs' implicitly has an 'any' type.
```

**Root cause:** `packages/core/package.json` does **not declare** the modules its own source imports.
- `src/plugins/storage/S3StoragePlugin.ts` dynamically `import('@aws-sdk/client-s3')` and `import('@aws-sdk/s3-request-presigner')`, but neither is in core's `dependencies`, `peerDependencies`, or `optionalDependencies`. (They exist in the workspace — `@aws-sdk+client-s3@3.978.0` is in `node_modules/.pnpm` because `server` depends on them — but pnpm's isolation does not symlink them into `packages/core/node_modules`, so `tsc` can't resolve them.)
- `src/storage/postgres/PostgresAdapter.ts` imports `pg`. core lists `pg` as an **optional peerDependency** but has **no `@types/pg`** in `devDependencies`, so `tsc` reports the implicit-any (TS7016). (`@types/pg` is present in `.pnpm` via sdk/server, again not linked into core.)

This is fragile-by-hoisting: it likely "works" in environments where these happen to be hoisted into reach, but fails in a clean/strict install — exactly what a new developer hits.

**Fix options (apply in a later fix iteration, with the change):**
- Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to core as `optionalDependencies` (matching their dynamic-import, optional-at-runtime usage), and add `@types/pg` to core `devDependencies`; **or**
- Exclude the optional S3/Postgres adapters from core's default `tsconfig` build and ship them as separate optional entrypoints; **or**
- Add ambient module declarations for the optional imports.

→ fix_queue F9.

---

## UPDATE 2026-06-24 — F9 FIXED (core unblocked)

**Change applied** (`packages/core/package.json`, smallest fix consistent with the package's existing optional-peer pattern):
- Added `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to `peerDependencies` with `peerDependenciesMeta.optional: true` (consumers provide them only when using S3) **and** to `devDependencies` (so core's own `tsc` resolves them; these packages ship their own types).
- Added `@types/pg` to `devDependencies` (`pg` was already an optional peer; only the types were missing).

**Verification:**
```
pnpm --filter @tokenisation/core run build      → BUILD_EXIT=0   (dist/index.js + dist/index.d.ts emitted)
pnpm --filter @tokenisation/core run typecheck  → TYPECHECK_EXIT=0
```
Recursive build now progresses far past core (previously died at the first package):
```
core: Done · compliance: Done · server: Done · pack-securities: Done ·
sdk-playground: Done · create-tokenised-asset: Done
```

**F9 is resolved.** The original P0 (core not compiling, no dist anywhere) is gone.

### Remaining blockers found after F9 (NOT fixed — out of scope this iteration)

Running the full recursive build/typecheck now reveals pre-existing failures further down the chain:

| Pkg | Status | Real? | Detail | Queue |
|-----|--------|-------|--------|-------|
| pack-loyalty | ❌ Fails (~497) | **Real** | `src/ui/AhoyBalanceWidget.tsx`: `--jsx` not enabled, missing react/lucide-react types, node16 extensionless imports (TS2834), implicit anys. First package to bail the recursive build. **Mission target vertical.** | F13 (P1) |
| chains | ❌ Fails (68) | **Real** | `ERC1155Adapter.ts`: `validatedConfig` is `unknown` (TS18046) — untyped zod parse result. | F14 (P1) |
| sdk-react-native | ❌ Fails | likely | uncharacterized; probably react/@types/react split (F12). Off core SDK path. | F15 (P2) |
| realestate | ❌ Fails (2) | **No — build-order** | `Cannot find module '@tokenisation/compliance'` — resolves once compliance `dist` exists (it builds Done in topological order). | — |
| sdk | ❌ Fails (10) | **No — build-order** | `Cannot find module '@tokenisation/{compliance,chains,realestate,compute}'` — same build-order artifact. | — |

### install_test verdict after F9

Still **BLOCKED** — F9 cleared the P0, but the full `pnpm -r run build` / `typecheck` path is not yet green (F13 pack-loyalty is the next hard blocker, then F14 chains). Per harness rule 9, `install_test` remains `blocked` and `current_stage` stays `install_test` until the full path is green. Next focus (separate iteration): F13.

---

## UPDATE 2026-06-24 — F13 FIXED (pack-loyalty unblocked)

**Diagnosis:** the ~497 errors were entirely in `src/ui/*.tsx` React components (`AhoyBalanceWidget.tsx` et al). These are **not re-exported from `src/index.ts`** (the package's public surface is only `.` and `./manifest`) and require `react` + `lucide-react`, which are **not** dependencies of this logic-only package. The sibling `@tokenisation/pack-travel` already establishes the repo convention: its tsconfig excludes `src/ui` (and its `index.ts` documents "excluded: requires lucide-react"). No non-UI source imports `src/ui`.

**Change applied** (`packages/pack-loyalty/tsconfig.json`, smallest safe fix — no product logic touched):
- Added `"src/ui"` to `exclude` (now `["node_modules", "dist", "src/ui"]`) with a comment explaining why, matching the pack-travel convention. Did **not** add react/lucide/jsx config to a framework-agnostic logic package.

**Verification:**
```
pnpm --filter @tokenisation/pack-loyalty run typecheck  → exit 0
pnpm --filter @tokenisation/pack-loyalty run build       → exit 0
```
Clean rebuild (after clearing stale `dist/` + `tsconfig.tsbuildinfo` left by prior failing emits — tsc emits despite errors unless `noEmitOnError`) produces `dist/{index,manifest,types}.{js,d.ts}` + `adapters/ packs/ plugins/` and **no `dist/ui`** (correctly excluded).

Note: F11 (separate, untouched) covers the React 18-vs-19 split that would affect the UI components if/when they are compiled by a UI-capable package — out of scope here.

**F13 is resolved.**

### Full recursive typecheck after F13 (`pnpm -r --no-bail run typecheck`)

| Package | Status |
|---|---|
| core, compliance, compute, pack-securities, pack-supply-chain | ✅ Done |
| **pack-loyalty** | ✅ **Done** (F13) |
| **realestate** | ✅ **Done** (was a build-order artifact — now resolved) |
| chains | ❌ Failed — 68 errs (F14, real: `validatedConfig` is `unknown`) |
| sdk | ❌ Failed — 456 errs, **downstream of F14** (cannot resolve `@tokenisation/chains` types); re-verify after F14 |
| sdk-react-native | ❌ Failed (F15, likely react version split) |

### install_test verdict after F13

Still **BLOCKED** — F13 cleared, but the full path is not green. Next hard blocker is **F14 (`@tokenisation/chains`)**, which also unblocks the bulk of `sdk`'s cascade. Per harness rule, `install_test` stays `blocked` and `current_stage` stays `install_test`. Next focus (separate iteration): F14.

---

## UPDATE 2026-06-24 — F14 FIXED (chains unblocked, sdk cascade cleared)

**Diagnosis:** all 68 chains errors trace to **one missing dependency** — `zod` is not in `packages/chains/package.json`, yet `import { z } from 'zod'` appears in `validation.ts`, `plugins/chainlink/ChainlinkConfig.ts`, and `services/DeploymentService.ts`. The cascade:
- `Cannot find module 'zod'` (3× TS2307) → `z` is untyped →
- schema `.transform`/`.refine` callbacks get implicit-any params (11× TS7006) →
- `validateOrThrow(Schema, data)` can't infer `T`, so `validatedConfig` is `unknown` in all 6 adapters (54× TS18046).

**Change applied** (`packages/chains/package.json`, one line — no `any`, no source edits):
- Added `"zod": "^3.22.4"` to `dependencies` (zod is used at runtime for input validation; version matches `@tokenisation/core` and `@tokenisation/pack-loyalty`).

This restores proper zod type inference everywhere — the smallest type-safe fix, the same dependency-declaration class of bug as F9.

**Verification:**
```
pnpm --filter @tokenisation/chains run typecheck  → exit 0   (all 68 errors gone)
pnpm --filter @tokenisation/chains run build       → exit 0   (dist/index.js + dist/index.d.ts emitted)
pnpm --filter @tokenisation/sdk    run typecheck   → 456 → 0 real errors
```
`sdk`'s remaining 4 standalone-typecheck errors were `Cannot find @tokenisation/{realestate,compute}` — build-order artifacts; in the topological recursive build `sdk` builds **Done**.

**F14 is resolved.** After F14, every core SDK package builds/typechecks clean in dependency order:
`core, compliance, chains, compute, realestate, pack-securities, pack-loyalty, pack-supply-chain, sdk, sdk-react, sdk-react-native, server, ui-kit, create-tokenised-asset, sdk-playground`.

### New blockers surfaced after F14 (NOT fixed — out of scope this iteration)

The bailing recursive build now advances much further and dies at `pack-travel`:

| Item | Status | Detail | Queue |
|------|--------|--------|-------|
| pack-travel | ❌ Fails | `sh: tsc: not found` — **`typescript` missing from devDependencies** (count 0, `tsc` not linked). Also imports `@tokenisation/chains`, `@tokenisation/pack-loyalty`, `@tokenisation/sdk-react` but declares only `core`+`compliance` → broken topological order in `pnpm -r run build`. Builds clean standalone once deps' dist exists. | F16 (P1) |
| ui | ❌ Fails | demo UI app build fails (off the SDK/server developer path). | F17 (P2) |
| _infrastructure/apps/real-estate | ❌ Fails | infra app build fails (off path, like website F10). | F17 (P2) |
| sdk-react-native | ⚠ | builds Done in recursive build; standalone typecheck still flagged (possibly same tsc/dep issue as F16 or react split F12). Re-characterize. | F15 |

### install_test verdict after F14

Still **BLOCKED** — F14 cleared (and the entire core SDK now compiles in order), but the full recursive `pnpm -r run build` is not yet green: next hard blocker is **F16 (`pack-travel` missing `typescript` devDep)**, then **F10 (website)** and **F17 (ui / infra app)**. Per harness rule, `install_test` stays `blocked` and `current_stage` stays `install_test`. Next focus (separate iteration): F16.

---

## UPDATE 2026-06-24 — F16 FIXED (pack-travel unblocked; entire SDK/server path now green)

**Diagnosis:** the sole root cause was `sh: tsc: not found` — **`typescript` was missing from `packages/pack-travel/package.json` devDependencies**, so the `tsc` binary was never linked into the package's `node_modules/.bin`.

**Correction to the earlier F16 hypothesis:** pack-travel does **not** import `@tokenisation/chains`, `@tokenisation/pack-loyalty`, or `@tokenisation/sdk-react` in compiled code. Those were all comments/TODOs:
- `src/orchestration/FlightLandingOracle.ts:8` → `// [LAYER] Moved to @tokenisation/chains`
- `src/index.ts:189` → `// export * from './hooks/index.js'; // excluded: requires @tokenisation/sdk-react`
- `src/demos/flyplus-demo.ts` → `// TODO: migrate to @tokenisation/pack-loyalty once available`

The only real `@tokenisation/*` import across all compiled files is `@tokenisation/core` (9×), already declared. So **no workspace-dep additions were needed** — the topological-order theory was a red herring; the package only ever failed because `tsc` wasn't installed.

**Change applied** (`packages/pack-travel/package.json`, one line — no source/logic changes):
- Added `"typescript": "^5.3.0"` to `devDependencies` (matches every sibling package). `@types/node` was not required (build/typecheck pass without it).

**Verification:**
```
pnpm --filter @tokenisation/pack-travel run typecheck  → exit 0
pnpm --filter @tokenisation/pack-travel run build       → exit 0  (dist/index.js + dist/index.d.ts emitted)
```

### Full recursive status after F16

**BUILD** (`pnpm -r --no-bail run build`):

| Result | Projects |
|--------|----------|
| ✅ Done | core, compliance, chains, compute, realestate, pack-securities, **pack-travel**, pack-loyalty, pack-supply-chain, sdk, sdk-react, sdk-react-native, server, ui-kit, create-tokenised-asset, sdk-playground |
| ❌ Failed (out of scope) | `_infrastructure/website` (F10), `ui` (pkg `@tokenisation/console`, F17), `_infrastructure/apps/real-estate` (F17) |

**TYPECHECK** (`pnpm -r --no-bail run typecheck`): all packages + `sdk` **Done**; only `sdk-react-native` typecheck **Failed** with **no `error TS` output** → same `tsc`-class issue as F16 (F15), not real type errors.

**The entire SDK + server build and typecheck cleanly.** The remaining recursive-build failures are the docs website and two demo/app packages — none on the path "clone → install → start server → import SDK → build a product."

### install_test verdict after F16

Still **BLOCKED** (literal rule 9): the README's `pnpm -r run build` includes `_infrastructure/website`, which still fails (F10), and `pnpm -r run typecheck` still fails on `sdk-react-native` (F15). **However, the SDK/server developer path itself is now fully green** — this is no longer a substantive blocker to building a product, only a "make the whole monorepo command exit 0" gap. Remaining items are all out of scope here: F10 (website), F15 (sdk-react-native typecheck), F17 (ui + infra app), plus the original doc/auth blockers F1/F2 and test/peer items F11/F12. `current_stage` stays `install_test`. Recommended next: F10 (smallest path to a green `pnpm -r run build`).

---

## FINAL VERDICT (2026-06-24) — loop interpretation change

**SDK/server developer path green; advancing to api_server_test. Full recursive monorepo commands still tracked separately.**

Per an explicit decision, the mission is **SDK product readiness**, not full-monorepo perfection. The SDK/server developer path builds and typechecks cleanly after **F9, F13, F14, F16**:
`core, compliance, chains, compute, realestate, pack-securities, pack-travel, pack-loyalty, pack-supply-chain, sdk, sdk-react, sdk-react-native (build), server, ui-kit, create-tokenised-asset, sdk-playground`.

- `install_test_sdk_path` = **completed**
- `install_test_full_monorepo` = **blocked** by F10 (website build), F15 (sdk-react-native typecheck), F17 (ui/console + infra real-estate app) — now tracked under "Full monorepo health / later" in `fix_queue.md`.
- These deferred items **do not block `api_server_test`**.

State: `stages.install_test = completed`; `current_stage = api_server_test`. F10/F15/F17 intentionally not fixed in this iteration; no source code changed.

## Failure 2 — Docs website build fails (P2, off developer path)

```
_infrastructure/website: [ERROR] The docs folder does not exist for version "current".
  A docs folder is expected to be found at ../docs.
  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL tokenisation-sdk-docs@1.0.0 build: `docusaurus build`
```
**Root cause:** the website was moved under `_infrastructure/website/` (recent commit `4ec6f9a`), so its Docusaurus config's relative `../docs` path no longer points at the repo's `docs/`. Not part of the SDK/server developer path, but it breaks the **plain `pnpm -r run build`** that the README tells developers to run (it aborts the whole recursive build).

**Fix:** point the Docusaurus `path`/preset at the repo `docs/`, or exclude the website from the default build. → fix_queue F10.

## Failure 3 — SDK test files fail to load (P1)

`pnpm --filter @tokenisation/sdk test:run`: **890 tests pass**, but **11 of 40 test files fail to load** (not assertion failures):
```
Error: Cannot find module './cjs/react-jsx-dev-runtime.development.js'
Require stack: .../sdk/react/jsx-dev-runtime
Test Files  11 failed | 29 passed (40)
     Tests  890 passed (890)
```
Affected files are the real-estate UI/module tests (PropertyModule, NAVModule, LegalModule, ExitWindowModule, InvestorTierModule, SecondaryMarketModule, DLD/VARA evaluators, etc.).

**Root cause:** React version conflict surfaced by `pnpm install` peer warnings — multiple React majors in the tree (18.3.1 vs 19.x); the JSX **dev** runtime resolved for these test files is missing/incompatible. The README advertises this exact command (`pnpm --filter @tokenisation/sdk test:run`) as "SDK unit tests", so a developer running it sees a red failure even though core logic tests pass.

**Fix:** pin React to a single major across the workspace (peerDeps + resolutions), or configure vitest jsx runtime for the affected suites. → fix_queue F11.

## Peer-dependency warnings (from `pnpm install`, non-fatal but related)

- `react-native@0.83.1` / `react-dom@19.x` / `react-test-renderer@19.x` want **react@^19**, found **18.3.1** (conformance-suite, core, sdk, sdk-react-native).
- `typedoc@0.25.13` wants **typescript ≤5.4.x**, found **5.9.3** (sdk).
- `ui`: `@tokenisation/sdk` wants **react@^18**, found **19.2.4**; `abitype` wants **zod ^3**, found **4.3.6**; assorted walletconnect/valtio react-range mismatches.

These version splits are the upstream cause of Failure 3 and a packaging risk (revisit in `packaging_review`).

---

## Bottom line for a new developer

- `pnpm install` → works (with warnings).
- `pnpm -r run build` (the README's install step) → **fails**. No package emits `dist/`. The SDK cannot be built as documented.
- This makes `install_test` a **hard blocker**; downstream stages (`api_server_test`, `sdk_consumer_test`) depend on built output and cannot fully proceed until F9 (and ideally F10/F11) are fixed.
