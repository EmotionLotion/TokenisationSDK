# Unified Redemption / Consumption / Revocation Primitive (T6)

**Status:** ratified design (no source modified in T6 — implementation is broad; landed via T6a/T6b/T6c, first consumed by T9 loyalty). **Closes:** G8. **Builds on:** T4 module contract §8, T5 taxonomy (RightProfile attributes), T2 RBAC (D-8), the existing audit + idempotency substrates.

The primitive — the **Right Action** — is the single server-persisted, audited operation every module uses when a tokenized right is **redeemed, consumed, revoked, expired, or access-verified**. It generalizes the existing (securities-only) redemption state machine to all RightProfiles.

---

## 1. Existing redemption/consumption audit (what we subsume, not replace)

| Flow | Where | Shape | Verdict |
|------|-------|-------|---------|
| Securities/token redemption | `server/.../redemption.routes.ts` + `redemptionService` + `redemptions` table | rich state machine `requested→validated→priced→approved→burning→burned→disbursing→completed`(+rejected/failed); fields investorId/wallet/amount/txHash | **Reference REDEEM pipeline** — keep; becomes a specialization on the primitive |
| Token redeem endpoint | `POST /api/v1/tokens/:id/redeem` | burn + payout | a REDEEM entrypoint → route through primitive |
| Loyalty redeem | `pack-loyalty .../LoyaltyPoints.ts redeem()` | in-memory `{userId,amount,redemptionType}→{success,...}`; no persistence/audit | **anti-pattern (G8)** — retire onto the primitive in T9 |
| Audit | `audit.service.log` + `verifyEntry`/`verifyChain` | hash-chained, tamper-evident | **reuse** as the receipt substrate |
| Idempotency | `middleware/idempotency.ts` | header + SHA-256 body hash + 409 + 24h TTL, org-scoped | **reuse** for all mutating actions |
| RBAC | `requireScope(action,resource)` + permission matcher (T2/D-8) | resource-level | **reuse** for action authorization |

Conclusion: the **state machine, audit, idempotency, and RBAC already exist** — T6 unifies them behind one generic action model rather than building new infrastructure.

## 2. Operation kinds (required)

Each kind is gated by a RightProfile attribute (T5) — a module cannot invoke a kind its right does not support.

| Kind | Meaning | Requires attribute | Mutating | Permission (default) |
|------|---------|--------------------|----------|----------------------|
| `REDEEM` | exchange the right for value/settlement (burn + payout, exit, distribution claim) | `redeemable` (≈ ownership/behavior/license w/ terms) | yes | `write:<resource>` |
| `CONSUME` | decrement a metered/divisible balance by `quantity` | `consumable` (+ `divisible`) | yes | `write:<resource>` |
| `REVOKE` | issuer/admin invalidates the right | `revocable` | yes | `write:<resource>:revoke` (admin-gated) |
| `EXPIRE` | lifecycle end by time/usage basis | `expires` | yes (system) | system / `write:<resource>` |
| `VERIFY_ACCESS` | check (and record) whether a principal currently holds a valid right | any (esp. `ACCESS`/`LICENSE`) | no (read; may log) | `read:<resource>` |

## 3. Request / receipt / status model

### Request (`RightActionRequest`)
```
{
  kind: 'REDEEM'|'CONSUME'|'REVOKE'|'EXPIRE'|'VERIFY_ACCESS',
  right: { tokenId?: string, assetId?: string, rightProfileId: string },  // what right
  subject: { type: 'party'|'investor'|'user'|'agent', id: string },        // who/what holds it
  quantity?: string,           // required for CONSUME (and divisible REDEEM); integer string + unit
  unit?: string,               // e.g. 'points', 'gpu-hour'
  reason?: string,
  context?: Record<string,unknown>,  // module-specific (e.g. payout rail, agent scope)
  // Idempotency-Key supplied via header (mutating kinds)
}
```

### Receipt (`RightActionReceipt`) — returned for every action
```
{
  id: string,                  // right_actions.id
  kind, status,                // see status model
  right, subject, quantity?, unit?,
  balanceBefore?, balanceAfter?,   // for CONSUME / divisible REDEEM
  reason?,
  auditEntryId: string,        // hash-chained audit.service entry
  decisionReceiptId?: string,  // for compliance-relevant decisions
  idempotencyKey?: string,
  createdAt, updatedAt, completedAt?
}
```

### Status model (generic; module pipelines refine `EXECUTING`)
```
REQUESTED -> AUTHORIZED -> EXECUTING -> COMPLETED
                     \-> REJECTED        \-> FAILED
(EXPIRE path) -> EXPIRED
```
The existing securities states (`validated/priced/approved/burning/burned/disbursing`) are **sub-states of `EXECUTING`** declared by the module's REDEEM pipeline; the primitive stores both the canonical status and the module sub-status. Terminal: `COMPLETED | REJECTED | FAILED | EXPIRED`.

### Persistence (`right_actions` table — proposed, T6a)
`id, orgId(FK), kind, status, subStatus?, rightProfileId, assetId?, tokenId?, subjectType, subjectId, quantity?, unit?, balanceBefore?, balanceAfter?, reason?, requestHash, auditEntryId, decisionReceiptId?, idempotencyKey?, metadata, createdAt, updatedAt, completedAt`. Org-scoped (tenant isolation). The existing `redemptions` table is retained and linked (or folded) under T9/follow-up — not dropped.

## 4. Idempotency behavior
- Mutating kinds (`REDEEM`/`CONSUME`/`REVOKE`/`EXPIRE`) **require** `Idempotency-Key` (reuse existing middleware: SHA-256 body hash, 409 on mismatched replay, 24h TTL, org-scoped). Same key + same body → same `RightActionReceipt` (no double-spend on CONSUME, no double-burn on REDEEM).
- `VERIFY_ACCESS` is a safe read — no key required; results are cacheable.
- `EXPIRE` is additionally idempotent by `(rightProfileId, subjectId, expiryInstant)`.

## 5. Permission & audit model
- **Permissions (T2/D-8):** VERIFY_ACCESS→`read:<resource>`; REDEEM/CONSUME→`write:<resource>`; REVOKE→`write:<resource>:revoke` (admin-gated); EXPIRE→system or `write:<resource>`. All org-scoped via `tenantContextMiddleware`.
- **Audit (G4):** every action emits a hash-chained `audit.service.log` entry with event `right.<kind>.<status>` (e.g. `right.consume.completed`, `right.revoke.completed`, `right.access.denied`). Compliance-relevant decisions (REVOKE, policy-gated REDEEM) also emit a `DecisionReceipt`. The receipt's `auditEntryId` links them. No silent state change.

## 6. Error codes
`RIGHT_NOT_FOUND`, `RIGHT_FROZEN`, `RIGHT_EXPIRED`, `RIGHT_REVOKED`, `NOT_REDEEMABLE`, `NOT_CONSUMABLE`, `NOT_REVOCABLE`, `INSUFFICIENT_BALANCE`, `INVALID_QUANTITY`, `ACCESS_DENIED`, `POLICY_DENIED` (→ T7), `IDEMPOTENCY_CONFLICT` (reuse), `UNAUTHORIZED`/`FORBIDDEN` (RBAC). All via the unified error model (T3) — typed, no stack traces.

## 7. Server / API surface (T6b)
- `POST /api/v1/rights/actions` — body = `RightActionRequest`; guarded by `apiKeyMiddleware` + `tenantContextMiddleware` + `requireScope(<perm>, <resource>)` + idempotency; returns `RightActionReceipt`.
- `GET /api/v1/rights/actions?subjectId&rightProfileId&kind&status` — history (paginated).
- `GET /api/v1/rights/actions/:id` — single receipt.
- **Back-compat:** existing `/tokens/:id/redeem` and `/redemptions/*` remain and are re-expressed as `REDEEM` actions on the primitive (T9/follow-up); no breaking removal.
- OpenAPI JSDoc so the live spec stays complete (cf. F19).

## 8. SDK surface (T6c)
`client.rights.act(request)` plus typed sugar: `client.rights.redeem(...)`, `.consume(...)`, `.revoke(...)`, `.verifyAccess(...)`, `.expire(...)`. Returns `RightActionReceipt`. Importable from `@tokenisation/core` (framework/DB-agnostic root, cf. F22); bare-object returns (cf. F21); unified errors.

## 9. Conformance tests (acceptance criteria for T6a–c)
Per kind: happy path; **idempotent replay** (same key+body → same receipt; mismatched body → 409); **permission deny** (insufficient scope; REVOKE without admin); **attribute guard** (CONSUME on non-consumable → `NOT_CONSUMABLE`; REVOKE on non-revocable → `NOT_REVOCABLE`); **balance underflow** (CONSUME > balance → `INSUFFICIENT_BALANCE`, no decrement); **revoke→verify** (`VERIFY_ACCESS` returns denied after REVOKE); **expire→verify** (denied after EXPIRE); **audit emission** (every mutating action writes a verifiable hash-chained entry); **tenant isolation** (cannot act on another org's right). Plus the integration path required by the module contract: `asset → token → CONSUME/REDEEM/REVOKE → audit`.

## 10. Mapping to modules (proof the primitive is generic)

| Module | Primary kind(s) | quantity/unit | attribute gate | notes |
|--------|-----------------|---------------|----------------|-------|
| **loyalty points** | CONSUME (spend), REDEEM (→value) | points | consumable, divisible | retires in-memory `redeem()` onto the primitive (T9) |
| **compute credits** | CONSUME (meter), REDEEM | gpu-hour | consumable, divisible | balance decrement per use; GPUComputeOracle may feed usage |
| **dataset licenses** | VERIFY_ACCESS, REVOKE, EXPIRE | seats/usage | revocable, expires | access checks gate data reads; revoke kills entitlement |
| **model/weight licenses** | VERIFY_ACCESS, REVOKE, EXPIRE, CONSUME(metered) | calls/seats | revocable, expires, (consumable) | weights-hash anchored; usage metering optional |
| **AI-agent access** | VERIFY_ACCESS, REVOKE, EXPIRE | n/a | delegable, revocable, expires(TTL) | per-call gating of a delegated, scoped grant |
| **real estate** | REDEEM (exit/claim), distribution claim | shares | redeemable, divisible | reuses the existing securities REDEEM pipeline as the reference |

All six map onto the five kinds + RightProfile attributes — no module needs a bespoke flow. This is the G8 close.

## 11. Boundaries (kept separate)
- **T7 (policy):** REDEEM/CONSUME/REVOKE may be policy-gated; the primitive calls the (future) unified policy and surfaces `POLICY_DENIED`. T6 does not design policy.
- **T8 (metadata registry):** `context`/right metadata validate against the per-RightProfile schema once T8 exists. T6 does not design the registry.
- **T5a:** modules whose right needs `USAGE`/`LICENSE` enum values still wait on T5a; the primitive itself keys off **attributes** (`consumable`/`revocable`/`expires`), so it does not require T5a.

## 12. Implementation plan (created as tasks; not built in T6)
- **T6a** — core primitive: `right_actions` table/migration + `RightActionService` (the 5 kinds, status machine, balance handling) + receipt + audit/idempotency wiring + conformance tests (§9). First consumer is T9 (loyalty).
- **T6b** — server API surface (§7) + OpenAPI + RBAC guards + back-compat shims for `/tokens/:id/redeem` and `/redemptions/*`.
- **T6c** — SDK surface (§8) `client.rights.*` + types + tests.
- T9 applies the primitive to loyalty (retiring in-memory `redeem()`); securities redemption is migrated onto it as a follow-up of T10.
