# SDK Implementation Plan

> [!IMPORTANT]
> **Code Claude will read this plan, write the code, and execute it.**
> This document serves as the master blueprint. **Do not write the code yet**; this phase is strictly for creating the tasks and implementation plan.

## Overview
This plan outlines the step-by-step build order for a generic, RWA-ready Tokenisation SDK. The goal is to create an engine that can tokenize *any* asset type (real estate, invoices, funds, etc.) by swapping plugins for jurisdiction, compliance, and settlement.

## SDK Promise
> **"A Tokenisation SDK is a programmable factory that turns real-world rights, assets, or actions into verifiable, rule-based digital tokens — without rewriting everything each time."**

## The Unifying Pattern
Every asset follows the same core flow, which the SDK standardizes:
```
DEFINE asset → VERIFY off-chain truth → MINT on-chain representation → ENFORCE rules → TRANSFER/USE → PAY/REWARD → RETIRE/BURN
```
Only the **rules, plugins, and oracles** change.

## Key Insight: Rights & States
The SDK tokenizes **rights** (ownership, access, governance) and **states** (verified behavior, compliance status).
*   **Real Estate** = Ownership / Cashflow Rights (Ref: **Centrifuge, RealT**)
*   **Ticket** = Access Right (Ref: **Erasure/Ticketing**)
*   **Driving/Loyalty** = Verified Behavior / Reputation Score (Ref: **Soulbound**)
*   **Carbon** = Verified Action (Ref: **Toucan**)

## Reference Architecture (Benchmarks)
We will use these real-world repos as "Gold Standard" references for specific modules:
*   **Core SDK Design**: [Enjin](https://github.com/enjin) (Best-in-class SDK patterns).
*   **Compliance/Regulated Token**: [ERC-3643 T-REX](https://github.com/TokenySolutions/T-REX) (Identity Registry, Forced Transfers).
*   **Real Estate Logic**: [Centrifuge](https://github.com/centrifuge) (Asset Pools, Cashflow) & [RealT](https://github.com/real-token) (Rent Payouts).
*   **Carbon/Verification**: [Toucan](https://github.com/ToucanProtocol) (Verify -> Mint -> Retire flow).
*   **Identity/DID**: [Veramo](https://github.com/decentralized-identity/veramo) (Plugin-based Identity).
*   **Supply Chain**: [OriginTrail](https://github.com/origintrail) (Off-chain graph + On-chain proof).

---

## Phase 1: Foundation (Core Engine & Data)

### Step 0: Define the SDK Promise & Interfaces
**Goal:** Establish interfaces for "Rights" and "State" transitions.
- [ ] Define `LifecycleState` enum (DRAFT, VERIFIED, ACTIVE, REDEEMED, BURNED, etc.)
- [ ] Define `RightModel` schema (Universal wrapper for all 10 types).
    - **Types**: `OWNERSHIP` (Real Estate, IP, Game Item), `ACCESS` (Ticket, Education), `BEHAVIOR` (Loyalty, Driving), `VERIFICATION` (Carbon, Supply Chain).
    - **Fields**: `rightType`, `jurisdiction`, `validityPeriod`, `transferabilityRules`.
- [ ] Define `Plugin` interfaces:
    - `IJurisdictionPlugin` (Defines legal wrapper for the Right)
    - `ICompliancePlugin` (Ref: **ERC-3643 Compliance**)
    - `IOraclePlugin`
    - `IStoragePlugin`
    - `IChainPlugin` (Ref: **Centrifuge Adapter**)

### Step 1: Canonical Lifecycle Engine
**Goal:** The state machine that owns the truth. Transitions are enforced here, not on-chain.
- [ ] Implement `LifecycleEngine` class (State machine + transition guards).
- [ ] Implement `EventStore` (In-memory or local append-only ledger for MVP).
- [ ] Implement `PolicyEvaluator` stub (connects engine to plugins).
- [ ] **Verification:** Run a lifecycle flow in tests with mock data (no plugins yet).

### Step 2: Universal Data Model
**Goal:** robust typing for Assets, Evidence, and Parties.
- [ ] Create Typescript/Go models for:
    - `Asset` (with validation)
    - `Evidence` (type, source, hash, signature)
    - `Party` (Issuer, Investor, Verifier)
- [ ] Implement JSON Schema generation/validation for these models.
- [ ] Implement serialization/deserialization logic.

---

## Phase 2: Plugin Architecture & Compliance

### Step 3: Plugin System
**Goal:** Swappable logic.
- [ ] Implement `PluginRegistry` to load plugins via config.
- [ ] Create `DefaultMockPlugins` for:
    - Jurisdiction (Mock allow/deny)
    - Identity (Mock KYC pass)
    - Storage (Mock IPFS hash return)
- [ ] **Verification:** Swap two mock jurisdiction plugins and ensure lifecycle persists.

### Step 4: Compliance Engine
**Goal:** The "Brain" of RWA permissions.
- [ ] Implement `ComplianceService`.
- [ ] Define "Ruleset" JSON structure (whitelistRequired, maxInvestorCount, etc.).
- [ ] Implement logic for:
    - `evaluateTransfer(from, to, amount)`
    - `checkPolicy(rule, context)`
- [ ] Handle edge cases: Frozen wallets, KYC expiry, Region blocks.
- [ ] **Verification:** Test 20+ transfer scenarios (Allow/Deny) using the engine.

---

## Phase 3: Blockchain Integration

### Step 5: MVP Settlement Token Standard
**Goal:** Abstract the token layer.
- [ ] Define `ITokenAdapter` interface:
    - `mint(to, amount)`
    - `transfer(from, to, amount)`
    - `freeze(target)`
    - `burn(amount)`
- [ ] Implement `ERC20Adapter` (Permissioned).
- [ ] Implement `ERC721Adapter` (NFT/Unique).

### Step 6: On-Chain Contracts (MVP)
**Goal:** Minimal reliable smart contracts.
- [ ] Develop `IdentityRegistry` contract (Wallet -> KYC hash).
- [ ] Develop `ComplianceToken` contract (ERC20 + check `IdentityRegistry`).
- [ ] (Optional) Develop `AssetRegistry` contract.
- [ ] **Verification:** Deploy to local Hardhat/Anvil node, mint, and test transfer restrictions on-chain.

---

## Phase 4: Real World Services & DX

### Step 7: Off-Chain Services
**Goal:** The glue between the "Real World" and the Chain.
- [ ] Implement `VerificationService` (checks evidence signatures).
- [ ] Implement `AttestationService` (signs valid evidence hashes).
- [ ] Implement `OracleService` stub (simulates NAV updates).
    - **Integration Point**: Chainlink Functions for custom API data (e.g., Ahoy FlyPlus luggage status).
    - **Integration Point**: Chainlink PoR for asset backing verification.
- [ ] Implement `IndexingService` (simulates listening to chain events).

### Step 8: Developer Experience (SDK & CLI)
**Goal:** Make it usable in < 10 mins.
- [ ] Wrap core logic into a clean `SDK` class export.
    - `sdk.assets.create()`
    - `sdk.tokens.transfer()`
- [ ] Build CLI tool `tokenise`:
    - `tokenise create --type real_estate`
    - `tokenise mint --asset <id>`
- [ ] **Verification:** Run a full end-to-end demo via CLI.

---

## Phase 5: Validation

### Step 9: Reference Packs
**Goal:** Prove generic capability across rights and states.

#### Pack A: UAE Real Estate (MVP) - *Ownership Right*
*   **Type**: `OWNERSHIP`
*   **Flow**: Define (Apartment) -> Verify (Deed) -> Mint (ERC-20 Share) -> Enforce (Whitelist) -> Distribute (Rent).

#### Pack B: Event Ticket - *Access Right*
*   **Type**: `ACCESS`
*   **Flow**: Define (VIP Pass) -> Verify (Payment) -> Mint (ERC-721) -> Enforce (Time-bound) -> Burn (Entry Scan).

#### Pack C: Driving/Loyalty Score - *Behavior State*
*   **Type**: `BEHAVIOR`
*   **Flow**: Define (Safe Driver) -> Verify (Telematics Oracle) -> Mint/Update (Soulbound Score) -> Reward (Discount).

#### Pack D: Ahoy Comet Bike - *Physical Ownership*
*   **Type**: `OWNERSHIP`
*   **Flow**: Define (Bike) -> Verify (Manuf. Cert) -> Mint (NFT) -> Enforce (Warranty).
    
#### Pack E: Education/IP - *Verification Right*
*   **Type**: `VERIFICATION`
*   **Flow**: Define (Degree/Copyright) -> Verify (University/Patent Office) -> Mint (Soulbound).

- [ ] **Verification:** Ensure the `LifecycleEngine` handles all 5 flows using the exact same code, only swapping config.

### Step 10: Security & Testing
**Goal:** Production readiness.
- [ ] Implement State Machine tests (fuzzing illegal transitions).
- [ ] Implement Replay tests (rebuild state from event log).
- [ ] Document Security Checklist (Multisig, Upgradeability).

---

## Tech Stack Recommendation
### 1. Core SDK & API (The Engine)
*   **Language:** **TypeScript**.
    *   *Why*: Best-in-class generic updates (Generics), massive ecosystem (Ethers.js, Viem), and easily distributable as an NPM package.
*   **Framework (Backend)**: **NestJS** or **Fastify**.
    *   *Why*: Modular architecture (NestJS) fits the "Plugin" pattern perfectly.
*   **Validation**: **Zod**.
    *   *Why*: Runtime schema validation for the universal "RightModel".

### 2. Data & Storage (The Truth)
*   **Event Store**: **PostgreSQL**.
    *   *Why*: Reliable, relational (Events -> Assets). JSONB columns for dynamic asset schemas.
*   **Decentralized Storage**: **IPFS** (e.g., Filebase/Pinata).
    *   *Why*: Standard for off-chain evidence (Deeds, Specs).

### 3. Blockchain (The Settlement)
*   **Smart Contracts**: **Solidity**.
    *   *Why*: Industry standard, compatible with most RWA chains (Ethereum, Polygon, Avalanche).
*   **Framework**: **Foundry**.
    *   *Why*: Fastest testing, Solidity-native scripts, best for security checks.
*   **Libraries**: **OpenZeppelin** (Core) + **ERC-3643 Reference** (Compliance).

### 4. Infrastructure (The Glue)
*   **Oracles**: **Chainlink Functions**.
    *   *Why*: Fetch off-chain API data (e.g., Ahoy API for bikes) trustlessly.
*   **Indexing**: **The Graph** or **Goldsky**.
    *   *Why*: Need to query on-chain state (who owns what) instantly for the dashboard.

## External Resources & Cheat Sheet
- **Noda**: [noda.ae](https://noda.ae/) (Tokenization Infra Reference)
- **Ahoy Comet**: [ahoycomet.com](https://ahoycomet.com/) (Physical Asset Reference)
- **ERC-3643**: [erc3643.org](https://erc3643.org/) (Compliance Standard)
- **Centrifuge**: [github.com/centrifuge](https://github.com/centrifuge) (RWA Architecture)
- **Enjin**: [github.com/enjin](https://github.com/enjin) (SDK DX)
- **Toucan**: [github.com/ToucanProtocol](https://github.com/ToucanProtocol) (Retirement/Burn Logic)

> [!NOTE]
> This plan is ready for Code Claude to execute.
