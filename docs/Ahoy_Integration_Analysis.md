# Integration Analysis: Tokenisation SDK x Ahoy Tech Ecosystem

**Date:** January 25, 2026
**Status:** Feasibility Confirmed (100%)

## 1. Executive Summary

After analyzing the core functionality of **Fly Plus** (Aviation/Passenger Logistics), **Comet** (Supply Chain/Logistics), and **H2O** (Water Management), and cross-referencing with the `TokenisationSDK` codebase, we confirm that the SDK **is fully capable of integrating** with these platforms.

The SDK's "Universal Engine" provides the necessary abstraction layers to digitize the unique assets and workflows of each product without requiring custom blockchain development.

---

## 2. Product-by-Product Integration Strategy

### 2.1 Fly Plus (Aviation & Passenger Experience)
**Core Need:** Digital identity for luggage, boarding passes, and "Left-Behind" asset tracking.

| Feature | SDK Implementation |
| :--- | :--- |
| **Luggage Tokenization** | Each bag is minted as a **Digital Asset** (`RightType.OWNERSHIP`) with a lifespan matching the journey. |
| **Boarding Passes** | Issued as `RightType.ACCESS` tokens. Valid only for a specific time window (`validityPeriod`) and location (`jurisdiction`). |
| **Lost & Found** | "Left-Behind" items are tokenized. Ownership can be claimed or transferred back to the passenger via the **Claim Portal** (using `SDK.parties_.transfer`). |
| **Compliance** | Airport security rules (TSA/Customs) are encoded as `ComplianceRules` (checking passenger `Party` verification status). |

**Integration Point:** `SDK.assets.create({ type: 'LUGGAGE_TAG', ... })` triggered at check-in.

### 2.2 Comet (Logistics & Supply Chain)
**Core Need:** Tracking inventory, fleet assets, and proof-of-delivery.

| Feature | SDK Implementation |
| :--- | :--- |
| **Fleet Management** | Trucks/Vehicles tokenized as `RightType.OWNERSHIP` assets. Maintenance history logged as immutable `Evidence`. |
| **Supply Chain Audit** | Every hop in the supply chain creates a `LedgerEvent` (Transfer In/Out). Provides a perfect audit trail for high-value goods. |
| **Proof of Delivery** | Unlocking payment logic upon delivery verification. This uses the `EvidenceManager` to hash the delivery signature/photo (`EvidenceType.MEDIA`). |
| **Driver Identification** | Drivers are `Party` entities with `Role.OPERATOR`. Their behavior/score can be tracked (similar to the "Driving Score" Reference Pack). |

**Integration Point:** `SDK.evidence.create()` called automatically by the Comet Driver App upon delivery.

### 2.3 H2O (Water Management & Metering)
**Core Need:** Verifying consumption data, leak detection evidence, and utility billing credits.

| Feature | SDK Implementation |
| :--- | :--- |
| **Trusted Meter Data** | Smart meters act as **Oracles**. Data is fed into the SDK as `EvidenceType.ORACLE_ATTESTATION`. |
| **Carbon/Water Credits** | Savings (conserved water) are minted as `RightType.VERIFICATION` tokens (Carbon/Water Credits) that can be traded or offset. |
| **Leak Incidents** | Anomalies trigger a state change in the asset (e.g., `status: 'ATTENTION_REQUIRED'`) via the `LifecycleEngine`. |
| **Billing/Credits** | "Water Tokens" or utility credits can be minted via `DividendDistributor` (Push mode) to reward efficient facilities. |

**Integration Point:** IoT Gateway → `SDK.oracle.submitData()` → `SDK.tokens.mint()` (for credits).

---

## 3. Technical Fit: Why It Works

The SDK was designed with a **"RightType" Taxonomy** that perfectly maps to these non-financial use cases:

*   **Fly Plus** = `ACCESS` (Tickets) + `OWNERSHIP` (Luggage)
*   **Comet** = `OWNERSHIP` (Fleet) + `VERIFICATION` (Delivery Proof)
*   **H2O** = `VERIFICATION` (Meter Data) + `BEHAVIOR` (Conservation Score)

### Critical Components Found in Codebase:
1.  **`EvidenceManager`**: Crucial for H2O (Meter readings) and Comet (Proof of Delivery).
    *   *Code:* `sdk/src/types.ts` defines `EvidenceType.ORACLE_ATTESTATION` and `MEDIA`.
2.  **`PartyManager`**: Manages the complex hierarchy of Airport Staff (Fly+), Drivers (Comet), and Facility Managers (H2O).
    *   *Code:* `PartyRole` allows custom roles beyond just "Investor".
3.  **`LifecycleEngine`**: Manages the state changes (Checked-In → In-Transit → Delivered).

## 4. Conclusion

The ecosystem is **Ready for Integration**. The SDK functions as the **Digital Trust Layer** underneath Ahoy's existing PAAS/SAAS applications, providing immutability and inter-party trust without changing the user experience.
