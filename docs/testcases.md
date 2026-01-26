Here are **production-feasibility test cases** to validate your SDK across **contracts + backend + SDK + ops**.

I’ll write each as: **Goal → Setup → Steps → Pass criteria**.

---

## 1) Policy determinism and replay

**Goal:** Same inputs must always yield same decision (and be replayable months later).
**Setup:** Policy v1 with clear rules (jurisdiction + investor class + caps).
**Steps:**

1. Evaluate `transfer(A→B, amount)` 100 times across services (SDK + backend + contract pre-check).
2. Store decision receipts (policy_hash, policy_version, decision_hash).
3. Re-run the exact evaluation after changing unrelated configs.
   **Pass criteria:**

* 100/100 identical results (allow/deny + reason code).
* Replay reproduces identical decision hash.

---

## 2) Policy versioning without breaking existing assets

**Goal:** Policy v2 must not silently change behavior for assets pinned to v1.
**Setup:** Deploy Token1 pinned to policy v1. Create policy v2 that changes jurisdiction rules.
**Steps:**

1. Transfer on Token1 (v1) that would be denied under v2.
2. Mint Token2 pinned to policy v2 and attempt same transfer.
   **Pass criteria:**

* Token1 transfer behaves per v1.
* Token2 transfer behaves per v2.
* Events/logs show policy_version used.

---

## 3) Bypass resistance (no “side door” transfers)

**Goal:** Transfers cannot bypass compliance via alternative methods.
**Setup:** A token with compliance enforced.
**Steps:**

1. Try normal transfer → must route through compliance.
2. Try `approve + transferFrom` path.
3. Try batch transfer / safeTransfer variations (if ERC721/1155).
4. Try direct calls to internal transfer hooks (if accessible).
   **Pass criteria:**

* All transfer paths enforce compliance identically.
* No method succeeds if policy says deny.

---

## 4) Identity claim expiry and revocation

**Goal:** Expired/revoked claims immediately deny actions.
**Setup:** User B has valid KYC claim expiring soon.
**Steps:**

1. Transfer to B while valid → should allow.
2. Advance time past expiry → attempt transfer → should deny with correct reason.
3. Re-issue claim, then revoke it → attempt transfer → deny.
   **Pass criteria:**

* Deny reasons are correct (`CLAIM_EXPIRED`, `CLAIM_REVOKED`).
* No stale cache in backend allows transfer.

---

## 5) Jurisdiction matrix correctness

**Goal:** Residency/citizenship mapping produces correct allow/deny.
**Setup:** Policy with jurisdictional restrictions (e.g., US persons disallowed).
**Steps:**

1. Create identities with combos: resident=UAE, citizen=US; resident=US, citizen=UAE; etc.
2. Attempt transfers for each combo.
   **Pass criteria:**

* Outcomes match policy matrix exactly.
* Logs show which jurisdiction attribute triggered.

---

## 6) Caps and limits (per-investor and global)

**Goal:** Supply/investor caps enforce correctly under load.
**Setup:** Global cap 1,000,000 tokens; per-investor cap 50,000.
**Steps:**

1. Mint/transfer to reach cap exactly → allow.
2. Attempt +1 token beyond cap → deny.
3. Run 50 parallel attempts that would exceed cap (race).
   **Pass criteria:**

* No cap breach (even under concurrency).
* At most one succeeds when near boundary; others revert/deny cleanly.

---

## 7) Oracle dependency failure mode

**Goal:** If oracle is stale/down, system fails safely (deny or degrade predictably).
**Setup:** Compliance uses an oracle (e.g., price feed, sanction list status, FX).
**Steps:**

1. Simulate stale oracle (old timestamp).
2. Simulate oracle revert.
3. Simulate manipulated value (if mock).
   **Pass criteria:**

* Decisions follow documented policy: “deny on stale” (recommended) or “fallback rule.”
* No silent allows when oracle is unavailable.

---

## 8) Admin controls and governance safety

**Goal:** Admin actions are gated, logged, and cannot be abused casually.
**Setup:** Roles: issuerAdmin, complianceAdmin, platformAdmin.
**Steps:**

1. Non-admin tries freeze/unfreeze → denied.
2. Admin freezes asset → transfers must deny.
3. Multi-sig / threshold path: require 2-of-3 signatures (if implemented).
   **Pass criteria:**

* Strict RBAC.
* All admin actions emit events + audit log entries.
* Freeze is effective immediately.

---

## 9) Recovery / forced transfer workflow (court-order scenario)

**Goal:** Institutional legal override works and is auditable.
**Setup:** Account A “lost keys” scenario, KYC verified, regulator order simulated.
**Steps:**

1. Initiate recovery request (backend).
2. Approve via governance path.
3. Execute forced transfer A→newWallet.
   **Pass criteria:**

* Only governance path can execute.
* Full audit trail (who approved, why, when).
* Forced transfer cannot be triggered by regular users.

---

## 10) Full lifecycle state machine enforcement

**Goal:** Asset states block/allow actions properly.
**Setup:** States: draft → issued → active → restricted → redeemed/retired.
**Steps:**

1. Try transfer in draft → deny.
2. Issue → active, transfer → allow.
3. Restricted state → only whitelisted transfers allow.
4. Redeemed/retired → no transfers/mints.
   **Pass criteria:**

* Every state has explicit allowed actions.
* No “undefined state” behavior.

---

## 11) Indexer and reporting integrity

**Goal:** Off-chain index matches on-chain truth.
**Setup:** Run indexer from genesis for an asset with many transfers.
**Steps:**

1. Compare holder balances from indexer vs on-chain at N random blocks.
2. Reorg simulation (local chain) / event duplication simulation.
3. Export cap table CSV and verify totals.
   **Pass criteria:**

* 100% match with on-chain.
* Reorg-safe: indexer self-heals.
* Reports reconcile to supply exactly.

---

## 12) Latency and throughput under realistic load

**Goal:** Backend + SDK can handle partner scale.
**Setup:** Simulate 1k–10k transfers/hour, 100 concurrent KYC checks, 50 concurrent issuances.
**Steps:**

1. Load test compliance decision endpoint.
2. Load test issuance + transfer flows end-to-end.
3. Observe p95/p99 latency.
   **Pass criteria (example targets):**

* Compliance decision p95 < 200ms (cached) / < 800ms (uncached)
* No decision mismatches under load
* No deadlocks or inconsistent cap results

---

## 13) Backward compatibility (SDK version upgrades)

**Goal:** Partners can upgrade SDK without breaking integrations.
**Setup:** Build sample partner app on SDK v0.x.
**Steps:**

1. Upgrade to v0.x+1.
2. Run contract interactions, issuance, transfer, reporting.
   **Pass criteria:**

* No breaking changes without explicit major bump.
* Deprecations documented + warnings emitted.

---

## 14) Secrets, signing, and replay protection

**Goal:** No signature replay / auth bypass.
**Setup:** SIWE / signed requests (if used).
**Steps:**

1. Attempt replay of a signed action request.
2. Attempt nonce reuse.
3. Attempt request tampering (change amount/recipient).
   **Pass criteria:**

* All replays rejected.
* Nonces are single-use and time-bounded.
* Tampering breaks signature validation.

---

## 15) Disaster recovery and “safe fail”

**Goal:** System behavior is defined when backend is down.
**Setup:** Kill backend services; contracts still live.
**Steps:**

1. Attempt transfer requiring off-chain decision → should fail safe (deny).
2. Restore backend, retry.
3. Ensure no partial states or stuck lifecycle transitions.
   **Pass criteria:**

* Predictable failure mode (recommended: deny with explicit error).
* Recovery is clean; no corrupted policy state.

