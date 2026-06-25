# Right-Type Taxonomy (T5 — ratified)

**Status:** ratified design. Resolves RA-3 (the `MEMBERSHIP` inconsistency) and fixes the right-type model the future modules need. **Boundary:** T5 ratifies the taxonomy and lands only the smallest safe code alignment; new enum values that only deferred modules need are scheduled for **T5a** (implementation task), gated to the first consuming module. T6 (redemption/consumption) keys off the **attributes** defined here, not off new enum values.

---

## 1. Audit — how right-types are actually used today

- Canonical enum `RightType` (`packages/core/src/core/types.ts:76`): **OWNERSHIP, ACCESS, BEHAVIOR, VERIFICATION**. Referenced via `RightType.X` ~44× across packs/modules.
- `PackManifest.rightTypes` is `z.array(z.string())` — **free strings, not validated** against the enum (`packages/core/src/packs/PackManifest.ts`).
- `MEMBERSHIP` appears as: `AssetType.MEMBERSHIP` (legitimate asset type — "Club, organization access"), `Governance...MEMBERSHIP` (a governance proposal type — unrelated), and **`pack-loyalty/manifest.ts:20` `rightTypes:['BEHAVIOR','MEMBERSHIP']`** — the single right-type misuse (a string that maps to no canonical `RightType`).
- `LICENSE` (31 string hits) and `USAGE` (1) are **not** right-types anywhere today (incidental matches / a comment).
- No exhaustive `switch (rightType)` anywhere → adding enum values later is additive and low-risk.

## 2. Two-level model (the design)

A single flat enum cannot serve both "broad semantic category" and "module-specific right with attributes." T5 ratifies **two levels**:

### Level 1 — canonical `RightType` (primitive category, small & stable)
The semantic family that drives compliance, lifecycle, and (T6) redemption/consumption behavior. **Ratified set (6):**

| RightType | Meaning | Drives | Status |
|-----------|---------|--------|--------|
| `OWNERSHIP` | title/equity in an asset | transfer, distributions, exit | live |
| `ACCESS` | right to enter/use a service/space/membership; may be delegated | grant, expiry, revoke, delegate | live |
| `BEHAVIOR` | accrued reputation/score state | accrue, decay, (rarely) redeem | live |
| `VERIFICATION` | proof/certification of a fact | issue, verify, expire | live |
| `USAGE` | **consumable/metered** right that depletes on use | meter/consume, balance, top-up | **ratified — enum-landing deferred to T5a** |
| `LICENSE` | **terms-bound, revocable** right to use an intangible (data/model/IP) under a contract | grant, meter, **revoke**, expire | **ratified — enum-landing deferred to T5a** |

Why `USAGE` and `LICENSE` are distinct primitives (not folded into `ACCESS`): T6 and audit need the primitive to express **consumability** (USAGE depletes) and **revocability-under-terms** (LICENSE has a terms document + revocation), which `ACCESS` (a binary grant) does not. *Alternative considered & rejected:* fold both into `ACCESS` with attributes only — rejected because the consumption/revocation semantics are first-class to the product thesis (compute credits, dataset/model licenses) and verticals must not each re-derive them.

### Level 2 — `RightProfile` (module-specific refinement)
A module declares one or more **RightProfiles** binding a canonical `RightType` to a concrete right + attributes + metadata schema. (Design type — implemented in T5a/T8, not now.)

```
RightProfile {
  id: string                 // e.g. 'loyalty-points', 'compute-credit', 'dataset-license', 'agent-access'
  rightType: RightType       // canonical Level-1 category
  attributes: {
    transferable: boolean | TransferabilityMode
    divisible: boolean       // fungible/quantity-bearing vs singular
    expires: boolean         // + basis: time | usage
    revocable: boolean       // issuer/admin can invalidate
    delegable: boolean       // can be delegated to another principal (AI agents)
    consumable: boolean      // depletes on use (USAGE); T6 meters this
  }
  metadataSchemaRef: string  // versioned zod schema (T8 registry)
}
```

`MEMBERSHIP`, `compute-credit`, `dataset-license`, etc. are **profiles**, not Level-1 types.

## 3. Right attributes / behaviors
The six attributes above are the contract's §3 right fields plus `consumable`. They — not the enum — are what T6 (redemption/consumption/revocation) and policy (T7) branch on. Every module declares them per RightProfile.

## 4. MEMBERSHIP resolution (RA-3)
**Decision:** `MEMBERSHIP` is **NOT** promoted to a canonical `RightType`. It is an **`ACCESS` profile** (`access:membership`). The core enum already documents ACCESS as "Tickets, **Memberships**, Education Credentials." `AssetType.MEMBERSHIP` stays as-is (it is an asset type, a separate axis). `Governance...MEMBERSHIP` is unrelated and unchanged.
- **Code fix (smallest safe, landed in T5):** `pack-loyalty/manifest.ts` `rightTypes: ['BEHAVIOR','MEMBERSHIP']` → `['BEHAVIOR','ACCESS']` (points = BEHAVIOR; passes/memberships = ACCESS). `PackManifest.rightTypes` is metadata (`string[]`), so this is non-breaking.
- **Backward-compat:** no runtime path validated `'MEMBERSHIP'` as a `RightType` (asset `rightType` validation uses the enum and never received `'MEMBERSHIP'`), so nothing breaks. Anyone reading the manifest for discovery now sees the correct canonical categories.

## 5. Future-module mapping (planning — NOT authorizations to build)

| Module | Canonical RightType | RightProfile | Key attributes |
|--------|---------------------|--------------|----------------|
| loyalty (points) | `BEHAVIOR` | `loyalty-points` | divisible, expires(time), non-transferable |
| loyalty (pass/membership) | `ACCESS` | `access:membership` | expires, non-transferable |
| real estate | `OWNERSHIP` | `real-estate` | divisible (fractional), transfer-restricted |
| compute credits | `USAGE` | `compute-credit` | divisible, **consumable** (GPU-hr), transferable |
| dataset licenses | `LICENSE` | `dataset-license` | **revocable**, expires, metered, non-transferable |
| model/weight licenses | `LICENSE` | `model-license` | **revocable**, expires, weights-hash anchor, non-transferable |
| AI-agent access | `ACCESS` | `agent-access` | **delegable**, **revocable**, expires(TTL), non-transferable |

This confirms the four future modules need exactly: the two new primitives (`USAGE`, `LICENSE`) + the `delegable`/`consumable` attributes — all ratified here. They remain **deferred** (gated by the module contract + T6 + T9).

## 6. What T5 lands now vs defers
- **Lands now (smallest safe):** RA-3 fix (loyalty manifest → `ACCESS`); a core taxonomy-stability test pinning the current enum and documenting the ratified-but-not-yet-added `USAGE`/`LICENSE`; this doc; contract/architecture updates.
- **Deferred to T5a (implementation task):** add `USAGE` and `LICENSE` to the `RightType` enum + introduce the `RightProfile` type, **when the first consuming module's spec is accepted** (or as T8 metadata-registry plumbing) — not before, to honor "do not implement future modules." Additive + low-risk (no exhaustive switches).
- **Deferred to T6:** the consumption/redemption/revocation primitive that branches on `consumable`/`revocable`.
- **Deferred to T8:** the per-RightProfile versioned metadata schema registry.

## 7. Migration / compatibility notes
- Enum unchanged in T5 → zero breaking change. `USAGE`/`LICENSE` land additively in T5a.
- `PackManifest.rightTypes` remains `string[]`; T5a may tighten it to validate against the enum once `USAGE`/`LICENSE` exist (tracked under T5a).
- Existing assets/tokens unaffected (no data migration).
- Loyalty manifest change is metadata-only.
