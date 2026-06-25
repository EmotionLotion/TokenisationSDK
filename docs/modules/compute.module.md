# Module Spec: compute-credits

> Authored per `harness/programmable_right_module_contract.md` (17 sections). **M1a = spec + plan only — NO source modified.** Implementation (M1b…) and full acceptance are **gated until T5a** lands the `USAGE` enum value (see §3, §17). Companion plan: `harness/compute_credits_module_plan.md`. Acceptance gate: `harness/module_acceptance_checklist.md`.

## 0. Scope framing — what this module is, and is NOT

The repo already tokenizes the **supply/ownership side** of GPU compute: `packages/compute` + `server/src/{services,routes,db}/gpu-compute.*` + `contracts/src/{tokens/ComputeToken.sol, oracles/GPUComputeOracle.sol, distribution/ComputeRevenueDistributor.sol}` model **fractional OWNERSHIP of physical GPU nodes** (assetType `GPU_COMPUTE` → `AssetType.INFRASTRUCTURE`, ERC-3643 `ComputeToken`, revenue/yield distribution). That is *not* this module.

**This module is the demand/consumption side:** a **prepaid, divisible, consumable `USAGE` right** denominated in **GPU-hours** ("compute credits") that **depletes on use** via the unified T6 **Right Action** `CONSUME` kind. It is the compute-economy analogue of loyalty points (the certified reference module, D-14): an account-balance ledger that issues, meters, and expires units — but typed `USAGE` (metered/consumable), not `BEHAVIOR`.

**Integration, not fork (D-4/D-13):** credits draw down against capacity supplied by the existing GPU-node stack; the existing **`GPUComputeOracle`** (spot price / GPU-hour, utilization, by `gpuModel`) prices credits and may feed metered consumption. The demo `ComputeCreditPack` (`packages/{pack-loyalty,core/src/ahoy}/src/packs/ComputeCredit.ts` — federated-ML "earn credit for training", `VERIFICATION` assets, `Math.random()` simulation) is **experimental and non-authoritative** for this module (the loyalty-engine precedent: kept as a demo, never the authoritative path).

## 1. Module identity
- id: `compute-credits`
- version: `0.1.0`
- name: Compute Credits · description: Prepaid, metered GPU-hour credits — a consumable USAGE right that depletes via the unified Right Action primitive · tags: `usage, compute, gpu-hours, metered, consumable`
- requires: `[]` (soft integration with the existing `gpu-compute` node stack + `GPUComputeOracle`; no hard module dependency)
- chains: `[1, 137, 8453]` (off-chain ledger authoritative; optional tokenized ERC-20/1155 credit variant — see §13)
- **maturity tier target: `reference`** (new modules MUST target reference). Current state: **spec-only** (no module code yet).

## 2. Asset model
| assetType | definition | core rightType | singular/fungible | default state | validityPeriod |
|-----------|-----------|----------------|-------------------|---------------|----------------|
| `COMPUTE_CREDIT` | prepaid unit of GPU compute; 1 unit = 1 normalized GPU-hour of a reference SKU | **USAGE** *(pending-T5a)* | fungible (quantity, **divisible** — fractional GPU-hours) | ACTIVE | time-bound (`expiresAt`) |

- **Not introduced here:** `GPU_COMPUTE` (the existing OWNERSHIP node asset) — referenced as the capacity source only.
- Quantity-bearing: supply = credits issued; `decimals` permit fractional GPU-hours. A credit lot is **SKU-scoped** (`gpuModel`, e.g. `H100`) with a `normalizationFactor` converting SKU-hours → normalized units, so a balance can be denominated consistently or per-SKU.
- Maps to the core `Asset` with `rightType: USAGE` (lands in T5a), `state: ACTIVE`, `transferabilityRules` = compliance-gated (§7), `validityPeriod` time-bound.

## 3. Right model *(taxonomy ratified in T5 — `right_type_taxonomy.md`; enum value lands in T5a)*
- **RightProfile `compute-credit`** → rightType **`USAGE`**.
- attributes: `transferable: true` (resellable/assignable, **compliance-gated** by policy — institutional default may restrict) · `divisible: true` · `expires: true (time)` · `revocable: true` (issuer clawback: fraud/chargeback/SLA breach) · `delegable: false` · **`consumable: true`** (the metered attribute T6 `CONSUME` depletes).
- **pending-T5 right type? `yes` — `USAGE`.** Justification: `USAGE` is **ratified** in T5/D-10 (`right_type_taxonomy.md` §2) as the consumable/metered primitive; only the *enum member* is deferred to **T5a** (additive, no exhaustive switches → low risk). **The T6 primitive branches on the `consumable`/`divisible` attributes, not the enum**, so consumption logic is implementable today; only persisting `asset.rightType = USAGE` needs T5a. → **§17 acceptance: spec-gate PASSES now (design-pass); implementation/full acceptance BLOCKED until T5a.**

## 4. Metadata schema *(versioned; registry → T8)*
- schemaVersion: `1`
- zod schema location: `packages/compute/src/models/ComputeCreditMetadata.ts` — **new file, distinct from the existing `packages/compute/src/models/ComputeMetadata.ts`** (which describes *nodes*, assetType `GPU_COMPUTE`). Reuse `GPUModelEnum` from `ComputeMetadata.ts` (no duplication).
- required fields: `assetType: 'COMPUTE_CREDIT'`, `unit: 'gpu-hour'`, `gpuModel` (reuse `GPUModelEnum`), `normalizationFactor` (credits per SKU GPU-hour), `ratePerCreditUsd` (issue price, string-decimal), `expiresAt` (ISO) / `validityDays`; optional: `sourceNodeId` (FK to `gpu_nodes`), `oraclePriceRef` (`GPUComputeOracle` snapshot), `region`.
- validated on write (server route zod); SDK-facing types exported from `@tokenisation/core` (e.g. `ComputeCreditMetadata`, `IssueCreditsInput`, `ConsumeCreditsInput`). Formal versioned per-RightProfile registry lands in **T8**; until then the inline route schema + exported type are authoritative.

## 5. Policy model *(declare into T7)*
- **off-chain** (`PolicyEvaluator` / `TransferabilityRules`): transferable **only when compliance-gated** (KYC on resale; blocked-jurisdiction screen reusing the `COMPUTE_JURISDICTION` rule set); min-consume quantity; optional daily-consume cap; expiry enforced on read+consume; **frozen/revoked credits block CONSUME**. Underflow blocked (no negative balance).
- **on-chain** (only for the optional tokenized credit variant, §13): `ModularCompliance` modules — `Whitelist`, `CountryRestrictions`, `MaxBalance`, `HoldTime`, `Volume`. Authoritative balance stays off-chain.
- **enforcement: both** for a tokenized transferable credit; **off-chain authoritative** for the default (untokenized) credit ledger.

## 6. Issuance / mint flow
- inputs: `{ subjectId, quantity, gpuModel, ratePerCreditUsd, expiresAt, sourceNodeId? }` · **idempotency-key required** (all mutations).
- steps (mapped to `03-issue-flow.svg`): `assets.create` (COMPUTE_CREDIT, validate metadata) → policy check (§5) → `ComputeCreditService.issueCredits` credits the subject's account balance + appends an `issue` row to `compute_credit_transactions` (`balanceBefore`→`balanceAfter`) → audit `compute.credits.issued`. Off-chain, synchronous (no token deploy by default — mirrors loyalty `earn`).
- optional async on-chain path: `tokens.create` → `tokens.deploy` (KMS/custody sign) → confirm → index, for the tokenized variant (§13).
- standard/contract used: off-chain account-balance ledger (default); ERC-20/1155 credit token (optional).

## 7. Transfer / access rules
- allowed transitions: `issue → (consume | redeem | expire | revoke)`; balance decremented per action.
- who may transfer/access: holder may **transfer** credits subject to compliance gating (KYC); issuer/admin may **revoke**. Non-delegable.
- access semantics: `VERIFY_ACCESS` checks the subject currently holds a valid, non-expired, non-frozen balance ≥ requested quota before a compute session is granted (read-like; may log).

## 8. Redemption / consumption / revocation *(on the T6 Right Action primitive — `redemption_consumption_primitive.md`)*
All lifecycle ops run through **`RightActionService`** (no bespoke/in-memory flow):

| Compute-credit op | RightAction kind | quantity/unit | ledger effect |
|-------------------|------------------|---------------|---------------|
| meter usage (GPU-hours consumed) | **`CONSUME`** | gpu-hours | balance debit; `balanceBefore/After` on receipt; underflow → `INSUFFICIENT_BALANCE` (no debit); usage may be sourced from `GPUComputeOracle`/metering |
| refund unused → value/settlement | `REDEEM` | credits | balance debit; returns `redeemedValue = quantity × ratePerCreditUsd` (refund rail); optional/policy-gated |
| credit expiry | `EXPIRE` | per holding | debit stale credits (scheduler); basis = time (`expiresAt`) |
| issuer clawback (fraud / chargeback / SLA breach) | `REVOKE` | qty or all | debit/zero the balance; **admin-gated**; emits `DecisionReceipt` |
| entitlement / quota check | `VERIFY_ACCESS` | n/a | read-like; pass iff balance ≥ requested ∧ not expired ∧ not frozen |

- **Attribute gates honoured:** `CONSUME ⇒ consumable+divisible`, `REVOKE ⇒ revocable`, `EXPIRE ⇒ expires` (all true in §3). `CONSUME` on a non-consumable right → `NOT_CONSUMABLE`.
- **Balance ledger is module-owned** (T6a left balances to the module) and server-persisted as an **account-balance model** (per D-13, mirroring loyalty — **not** a FIFO batch table): `compute_credit_accounts.balance` (per `orgId`,`subjectId`,`gpuModel`/normalized) + append-only `compute_credit_transactions` (`issue`/`consume`/`redeem`/`expire`/`revoke`, each recording `balanceBefore`→`balanceAfter`). The action and its audited receipt link via `metadata.transactionId`.
- **confirm — implementable on the single T6 primitive (server-persisted + audited + idempotent)? `YES`.** `CONSUME` is the canonical metered kind; this module is the `redemption_consumption_primitive.md` §10 "compute credits" row (CONSUME/REDEEM, gpu-hour, consumable+divisible). No §8 element requires anything T6 does not provide → **not blocked on T6**.

## 9. Audit events
- `compute.credits.issued`; and via `RightActionService`: `right.consume.completed`, `right.redeem.completed`, `right.expire.expired`, `right.revoke.completed` (+ `DecisionReceipt` for `REVOKE` and any policy-gated `REDEEM`).
- Every state-changing op emits a hash-chained `audit.service.log` entry; no silent mutation.

## 10. Permissions / RBAC *(matcher — D-8)*
- resource name: **`compute`**.
- required permissions per op: `read:compute` → balance, history, `VERIFY_ACCESS`; `write:compute` → issue, `CONSUME`, `REDEEM`; `write:compute:revoke` (admin-gated) → `REVOKE`/clawback.
- routes guard with `requireScope(action, 'compute')`; all reads/writes org-scoped (`tenantContextMiddleware`).
- **⚠ Conformance gap to close (G3):** the *existing* `server/src/routes/gpu-compute.routes.ts` mounts only behind `protectedMiddleware` (`apiKeyMiddleware + tenantContextMiddleware`) with **no `requireScope`**. The new credits routes MUST add resource-level `requireScope(action,'compute')`; bringing the legacy node routes to the same bar is a `gpu-compute` follow-up under T2b (recorded, not in M1 scope).

## 11. SDK API surface
- public methods (typed): `client.compute.issue(input)`, `.balance(subjectId)`, `.consume(input)`, `.redeem(input)`, `.verifyAccess(input)`, `.actions(filter)` (history) — mirrors `client.loyalty.*` (`packages/core/src/modules/loyalty.ts`).
- import path: `@tokenisation/core` (framework/DB-agnostic root, F22); bare-object/receipt returns (F21); unified errors (T3). `consume`/`redeem`/`revoke` require `idempotencyKey` (HttpClient sets `Idempotency-Key`). `consume`/`redeem` return the `RightActionReceipt`.

## 12. Server / API surface
- routes under `/api/v1/compute/credits`: `POST /compute/credits/issue`, `GET /compute/credits/balance/:subjectId`, `POST /compute/credits/consume`, `POST /compute/credits/redeem`, `GET /compute/credits/actions` (history; paginated).
- per route: zod validation · `apiKeyMiddleware` + `tenantContextMiddleware` + **`requireScope(action,'compute')`** · `Idempotency-Key` on mutations · audit emission · OpenAPI JSDoc (keeps the live spec complete, F19) · **no stack traces** in error responses (T3). `consume`/`redeem` delegate to `RightActionService` + the credit ledger. Mounted in `server/src/index.ts` behind `protectedMiddleware` following the `loyalty.routes`/`asset.routes` convention (auth at mount).

## 13. Contract / on-chain surface *(optional; default off-chain)*
- The default credit is **off-chain** (authoritative ledger), like loyalty — on-chain is **out of M1 scope**.
- A tokenized credit variant would use a **fungible** standard: `ComplianceMultiToken` (ERC-1155, partitioned by `gpuModel`) or a lightweight ERC-20 credit token. **Do NOT reuse `ComputeToken.sol`** — that is the *fractional-ownership* security token (revenue distribution, ERC-3643), a different right. Reuse the existing `contracts/src` stack; bind `Whitelist`/`CountryRestrictions`/`MaxBalance` at deploy; **`GPUComputeOracle`** feeds credit pricing. No parallel token framework.

## 14. UI / dashboard
- operator views (minimal): issue credits, view holder balances, meter/`CONSUME`, `REVOKE`. holder view: balance + consumption history.
- components location: `packages/compute/src/ui/` (excluded from the logic-package build per F13/F22), reusing the existing compute UI scaffolding.

## 15. Docs
- recipe: `docs/recipes/COMPUTE_CREDITS.md` · example: runnable `examples/compute-credits-minimal/` (issue → balance → consume → verify via the SDK against the local server), mirroring `examples/loyalty-minimal` / `examples/minimal-sdk-consumer`. Correct auth + idempotency shown.

## 16. Tests
- conformance (T1 pattern): ledger issue/balance · `CONSUME` decrement + `INSUFFICIENT_BALANCE` underflow · idempotent replay (same key+body → same receipt; no double-spend) · `EXPIRE` · `REVOKE` (admin) · `VERIFY_ACCESS` denied after revoke/expire · `REDEEM` `redeemedValue` math · audit emission · RBAC allow/deny + tenant isolation · `NOT_CONSUMABLE`/attribute guard.
- integration: `issue → balance → consume (RightAction) → verify → audit`.
- suite green + module typecheck/build green; **full server suite no regression**.

## 17. Conformance
- Target: passes `module_acceptance_checklist.md` in full; core conformance suite passes against module primitives; maturity tier `reference`.
- **Spec-gate (design-pass) — status now:**

| Spec-gate `[spec]` box | Status | Evidence |
|------------------------|--------|----------|
| Module Spec at `docs/modules/<id>.module.md`, all 17 sections filled | ✅ PASS | this file |
| Right type (§3) is a T5-ratified value **or** marked pending-T5 w/ justification | ✅ PASS (USAGE ratified in T5/D-10; marked pending **T5a** for enum landing) | §3 |
| Redemption/consumption/revocation (§8) maps onto T6 primitive | ✅ PASS | §8 (CONSUME/REDEEM/EXPIRE/REVOKE/VERIFY_ACCESS = `redemption_consumption_primitive.md` §10 compute row) |
| Policy model (§5) declares off-chain **and** on-chain projections | ✅ PASS | §5 |
| `requires`/`chains` declared; maturity tier target stated | ✅ PASS | §1 |

- **Implementation gate & full acceptance: BLOCKED until T5a** (lands `USAGE` in the `RightType` enum + the `RightProfile` type). Per D-10, T6 keys off attributes, so the *consumption* logic is unblocked; only persisting `asset.rightType = USAGE` requires T5a. Implementation is split in `harness/compute_credits_module_plan.md` (M1b…) and does not start until T5a is `done` and this spec is accepted.
