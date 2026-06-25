# Rejected Assumptions

Assumptions that look plausible but are **false** or **not yet earned**, recorded so future iterations don't act on them. Append-only; dated. Evidence is from `sdk_audit.md`, `gap_analysis.md`, and the earlier `loop/` reports.

## RA-1 — "We should start by adding the new modules (compute/dataset/model/agent)." ❌
Rejected. The module contract (T4), right-type taxonomy (T5), and unified redemption (T6) don't exist yet; building modules now repeats real estate's bespoke effort and bakes in current gaps. New modules are gated until T4+T5+T6 done and T9 proven.

## RA-2 — "The SDK core is tested." ❌
Rejected. `@tokenisation/core` has **no test runner and no `test` script** (0 package-level tests). Vertical packages `realestate` and `pack-loyalty` have **0 tests**. (T1/T9/T10 address this.)

## RA-3 — "`RightType` includes MEMBERSHIP." ❌ (RESOLVED in T5)
Rejected, and now RESOLVED. The core enum is OWNERSHIP/ACCESS/BEHAVIOR/VERIFICATION; loyalty's manifest wrongly listed `MEMBERSHIP`. T5/D-10 ratified MEMBERSHIP as an ACCESS *profile* (not a canonical RightType) and fixed the manifest to `['BEHAVIOR','ACCESS']`. `USAGE`/`LICENSE` are ratified canonical types landing in T5a.

## RA-4 — "Loyalty is a mature, server-backed module like real estate." ❌
Rejected. Loyalty is in-memory pack classes only — no server routes, no persistence, no tests, no docs/recipe. Real estate is the mature reference (DLD/NAV/tiers/exit/legal, server-backed, tested).

## RA-5 — "The README quick-start works as written." ❌
Rejected (from loop/api_server_test). The root README curl 401s by default (auth bypass off; F1) and the token example omits the required `Idempotency-Key` + `totalSupply` (F18). Canonical `docs/api/REST_API.md` is correct; README is not.

## RA-6 — "The committed OpenAPI spec describes the API." ❌
Rejected. `server/openapi.{json,yaml}` contain **6 paths** (investors only); the live runtime spec has **311**. Committed spec is stale (F19).

## RA-7 — "RBAC is enforced per the defined roles." ❌
Rejected. Middleware grants coarse `['admin']` on dev/x-api-key paths and checks `read`/`write`, while roles define `read:*`/`write:compliance`/`write:tokens`. Scopes and role-permissions are not reconciled; per-resource authz is not enforced/tested (T2).

## RA-8 — "API error responses are safe to return as-is." ❌
Rejected. Observed 400/401 bodies include **stack traces / internal paths**. Must be removed before institutional use (T3).

## RA-9 — "Off-chain and on-chain policy are one model." ❌
Rejected. Two separate policy languages exist: off-chain `PolicyEvaluator`/`TransferabilityRules` and on-chain `IPolicyModule` + ERC-3643 compliance modules. Unification is T7.

## RA-10 — "Redemption is a single, persisted, audited primitive." ❌
Rejected. Redemption is fragmented: server `redemption` routes/table, `tokens.redeem`, and loyalty's in-memory `redeem()` are not unified; loyalty redemption isn't persisted. Unify in T6.

## RA-11 — "The whole monorepo builds/tests cleanly." ❌
Rejected. The SDK/server path is green, but the docs website (F10), `ui`/console + infra app (F17), and `sdk-react-native` typecheck (F15) fail, and a React 18/19 split makes 11 SDK test files fail to load (F11/F12). Tracked, deferred (T15/T16).

## RA-12 — "`harness/` already contained a mission/quality/architecture scaffold." ❌
Rejected. At audit time `harness/` did not exist; only `loop/` was present. The scaffold was created in T0.
