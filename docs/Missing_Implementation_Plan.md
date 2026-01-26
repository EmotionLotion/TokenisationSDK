# Missing Implementation Plan

Based on the comparison between the **Final SDK Vision** and the **Current Codebase**, here is the prioritized implementation plan to close the gaps.

## 0. Implementation Fixes (Critical Vision Alignment)

**Problem**: `TokenFactory` currently retains ownership of deployed assets, making the Platform (us) the permanent owner.
**Fix**: Factory must transfer ownership to the Partner immediately upon deployment.

### Step 1: TokenFactory Refactor
- [ ] Modify `deployComplianceToken` to accept `initialOwner` address.
- [ ] Call `ComplianceToken.transferOwnership(initialOwner)` immediately after deployment.
- [ ] Ensure `addAgent` capabilities are transferred or initially set for the Partner.

## 1. Repository Restructuring (The Monorepo Transition)

**Current State**: Flat structure (`sdk/`, `server/`, `contracts/`).
**Target**: Clean monorepo with `packages/*`.

### Step 1: Migration
- [ ] Create `packages/` directory.
- [ ] Move internal logic to shared packages:
    -   `packages/policy-engine` (extract from `server/policies`)
    -   `packages/token-service` (extract from `server/src`)
    -   `packages/indexer` (extract from `server/src`)
- [ ] Move SDKs to `packages/`:
    -   Move `@tokenisation/sdk` (TS) to `packages/sdk-ts`.
    -   Move `ahoy_tokenisation` (Python) to `packages/sdk-python`.

## 2. The "Killer Piece": Test Harness & Conformance Suite

**Current State**: `tests/conformance` directory exists but is **EMPTY**.
**Target**: Single command runner for Golden Flows.

### Step 1: Conformance Runner
- [ ] Create `packages/conformance-suite`.
- [ ] Implement the `make test-all` runner.
- [ ] Support "Mode 1: SDK-only" (Mocked) and "Mode 2: Full Stack" (Docker).

### Step 2: Golden Flows Implementation
- [ ] **Flow A (Asset -> Token)**: Implement End-to-End test for SPV creation and minting.
- [ ] **Flow B (Onboarding)**: Implement Investor KYC & Claim issuance test.
- [ ] **Flow C (Compliance)**: Implement Transfer restrictions test (Lockup, Jurisdiction, Cap).
- [ ] **Flow D (Corp Action)**: Implement Snapshot & Dividend distribution test.
- [ ] **Flow E (Redemption)**: Implement Burn & Exit flow.

### Step 3: Artifact Generation
- [ ] Implement JSON/CSV reporters to output:
    -   `reports/holdings.csv`
    -   `audit/transfer_decisions.json`
    -   `chain/events.json`

## 3. Missing SDKs & Adapters

### Step 1: C# SDK (`Trouve.Tokenization`)
- [ ] **NEW**: Create `packages/sdk-csharp`.
- [ ] Implement core primitives mirroring TS/Python SDKs:
    -   `Assets.Create()`, `Tokens.Issue()`, `Transfers.Request()`.

### Step 2: Reference Adapter Pack
- [ ] **NEW**: Create `packages/adapters/`.
- [ ] Implement `real-estate-adapter`: Pre-configured policies for SPVs.
- [ ] Implement `carbon-adapter`: Pre-configured policies for Credits.
- [ ] Implement `loyalty-adapter`: Simple points/rewards logic.

## 4. Sandbox Platform Enhancements

**Current State**: `docker-compose.yml` is solid (Chain, API, Postgres, Redis).
**Missing**: Admin Console & Report Exports.

- [ ] **UI Console**: Polish `ui/` to be the "Admin Console".
- [ ] **Report Service**: Add dedicated endpoint/script for generating audit logs (Part of Conformance Suite).

---

## Priorities (What to do NOW)

1.  **Refactor TokenFactory** (Fix the ownership bug). *Critical for vision alignment.*
2.  **Implement the Golden Flows (Flows A-C first)** in `tests/conformance`. *This is the biggest value add.*
3.  **Refactor to Monorepo** structure to support the ecosystem.
4.  **Build C# SDK** skeleton.
