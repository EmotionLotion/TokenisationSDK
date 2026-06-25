# Module Spec: loyalty

> Authored per `harness/programmable_right_module_contract.md` (17 sections). T9a = spec + plan (no source). Implementation lands in T9b–T9e and must pass `harness/module_acceptance_checklist.md`.

## 1. Module identity
- id: `loyalty`
- version: `1.0.0` (existing manifest)
- name: Loyalty & Behavior Scoring · tags: loyalty, behavior, points, reference-module
- requires: `[]` · chains: `[1, 137, 8453]` (off-chain authoritative; chains optional for tokenized variants)
- **maturity tier: `reference`** (achieved in T9; was `experimental`/in-memory). T9 is the proof that the contract works on the least-mature module. Acceptance evidence: [`docs/modules/loyalty.acceptance.md`](./loyalty.acceptance.md).

## 2. Asset model
| assetType | definition | core rightType | singular/fungible | default state | validityPeriod |
|-----------|-----------|----------------|-------------------|---------------|----------------|
| `LOYALTY_POINTS` | earned, spendable points | BEHAVIOR | fungible (quantity) | ACTIVE | time-bound (expiryDays) |
| `FLY_PLUS_PASS` (membership) | tier/membership pass | ACCESS | singular | ACTIVE | time-bound |
Primary showcase = `LOYALTY_POINTS`. (`BEHAVIOR_SCORE`/`DRIVER_REPUTATION` remain demo packs, out of T9 scope.)

## 3. Right model (T5 ratified)
- **RightProfile `loyalty-points`** → rightType **BEHAVIOR**; attributes: `transferable:false` (institutional default; engine's transfer() is gated/optional), `divisible:true`, `expires:true (time)`, `revocable:true` (fraud clawback), `delegable:false`, `consumable:true`.
- **RightProfile `access:membership`** (FlyPlusPass) → rightType **ACCESS**; `transferable:false, divisible:false, expires:true, revocable:true, delegable:false, consumable:false`.
- No `pending-T5` types (BEHAVIOR/ACCESS are live). No T5a dependency.

## 4. Metadata schema (validated on write; versioned registry → T8)
Write validation today is **route-level zod** in `server/src/routes/loyalty.routes.ts`
(`createProgramSchema`, `createAccountSchema`, `earnSchema`, `spendSchema`,
`revokeSchema`) — programs carry `name`/`currency`/`earnRules`/optional `tiers`;
spend ops carry `amount`/`action`/optional `redemptionRate`/`minRedemptionAmount`.
SDK-facing types are exported from `@tokenisation/core` (`packages/core/src/modules/loyalty.ts`:
`LoyaltyProgram`, `LoyaltyAccount`, `LoyaltyTransaction`, `SpendPointsInput`, …).
A formal *versioned* per-right-type metadata schema registry (`schemaVersion`-tagged)
lands in **T8**; until then loyalty uses the inline route schemas above.

## 5. Policy model (declare into T7)
- off-chain (`PolicyEvaluator`/`TransferabilityRules`): non-transferable by default; min-redemption threshold; daily-mint caps; fraud-freeze blocks spend.
- on-chain: N/A for the authoritative off-chain points ledger; tokenized variants (AhoyToken) would bind ERC-3643 modules — out of T9 scope.
- enforcement: in-SDK/server (off-chain).

## 6. Issuance / mint flow
`earn` → server `loyalty.service.earnPoints(orgId, {accountId, action, ...})` credits the
account `balance` (applying the program's earn-rule and tier multipliers) and appends an
`earn` row to `loyalty_transactions` (`balanceBefore`→`balanceAfter`). Program/account are
created via `createProgram`/`getOrCreateAccount`. (Not a token deploy — off-chain points.)

## 7. Transfer / access rules
Points: non-transferable by default (policy); optional `transfer` behind a program flag. Membership pass: non-transferable; access checked via `VERIFY_ACCESS`.

## 8. Redemption / consumption / revocation (on the T6 Right Action primitive)
All lifecycle-ending ops go through `RightActionService` (no in-memory flow):
| Loyalty op | RightAction kind | quantity/unit | ledger effect |
|-----------|------------------|---------------|---------------|
| redeem points for value | `REDEEM` | amount / points | balance debit; returns redeemedValue = amount/redemptionRate; min-redemption enforced |
| spend points (no cash value) | `CONSUME` | amount / points | balance debit |
| points expiry | `EXPIRE` | per account | debit stale earned points (scheduler) |
| fraud clawback | `REVOKE` | all | zero the account balance (admin-gated) |
| membership entitlement check | `VERIFY_ACCESS` | n/a | read-like; pass valid? |
The **balance ledger** is **module-owned** (T6a left balances to the module) and
server-persisted as an **account-balance model** (D-13): `loyalty_accounts.balance`
plus the append-only `loyalty_transactions` ledger (`earn`/`spend`/`expire`/`adjust`,
each recording `balanceBefore`→`balanceAfter`) — **not** a FIFO `loyalty_balances`
batch table. REDEEM/CONSUME debit the account balance and record `balanceBefore/After`
on the receipt; underflow → `INSUFFICIENT_BALANCE` (no debit). The spend and the
audited RightAction receipt are linked by `metadata.transactionId`. The in-memory
`LoyaltyPointsEngine.redeem()` is **retired as authoritative** (kept only as an
offline simulator, clearly marked non-production).

## 9. Audit events
`loyalty.points.issued`, and via RightAction: `right.redeem.completed`, `right.consume.completed`, `right.expire.expired`, `right.revoke.completed` (+ DecisionReceipt for REVOKE). Every state change is hash-chained; no silent mutation.

## 10. Permissions / RBAC (T2/D-8)
- resource: `loyalty`. `read:loyalty` → balance, history, VERIFY_ACCESS. `write:loyalty` → issue, REDEEM, CONSUME. `write:loyalty:revoke` (admin-gated) → REVOKE/clawback.
- Routes guard with `requireScope(action, 'loyalty')`; all reads/writes org-scoped (`tenantContextMiddleware`).

## 11. SDK API surface
`client.loyalty.issue(input)`, `.balance(subjectId)`, `.redeem(input)`, `.consume(input)`, `.verifyAccess(input)` — typed, importable from `@tokenisation/core` (or `@tokenisation/sdk`), bare-object returns, unified errors. redeem/consume return the `RightActionReceipt`.

## 12. Server / API surface
`/api/v1/loyalty/*`: `POST /loyalty/points/issue`, `GET /loyalty/points/balance/:subjectId`, `POST /loyalty/points/redeem`, `POST /loyalty/points/consume`, `GET /loyalty/actions` (history) — each with zod validation, `apiKeyMiddleware`+`tenantContextMiddleware`+`requireScope`, `Idempotency-Key` on mutations, audit, OpenAPI JSDoc, no stack traces. redeem/consume delegate to `RightActionService` + the loyalty ledger.

## 13. Contract / on-chain surface
N/A for authoritative points (off-chain). Tokenized AhoyToken variant (ERC-3643/SBT) is out of T9 scope.

## 14. UI / dashboard
Operator views (minimal): issue points, view balance, redeem; in `sdk-react` / `pack-loyalty/src/ui` (excluded from logic build). Holder view optional.

## 15. Docs / demo
`docs/recipes/LOYALTY_POINTS.md` + runnable `examples/loyalty-minimal/` (issue → balance → redeem via SDK against the local server), mirroring `examples/minimal-sdk-consumer`. Correct auth + idempotency shown.

## 16. Tests
Package/server conformance: ledger issue/balance, REDEEM/CONSUME decrement + underflow, idempotent replay, EXPIRE, REVOKE (admin), VERIFY_ACCESS, audit emission, RBAC allow/deny, tenant isolation. Integration: `issue → balance → redeem (RightAction) → audit`.

## 17. Conformance
Passes `module_acceptance_checklist.md`; core conformance suite passes against loyalty primitives; maturity tier `reference`. Filled checklist + command evidence: [`docs/modules/loyalty.acceptance.md`](./loyalty.acceptance.md) (T9e).
