# SDK Architecture Guide for Blockchain Engineers

> A comprehensive guide to understanding the TokenisationSDK codebase - why every component was written, what responsibility it holds, the design trade-offs behind it, and how it collectively enables production-level requirements.

---

## Table of Contents

1. [The Core Problem Being Solved](#part-1-the-core-problem-being-solved)
2. [Core Architecture Principles](#part-2-core-architecture-principles)
3. [Deep Dive into Each Component](#part-3-deep-dive-into-each-component)
4. [Production-Level Patterns](#part-4-production-level-patterns)
5. [The Two Modes of Operation](#part-5-the-two-modes-of-operation)
6. [The Smart Contract Layer](#part-6-the-smart-contract-layer)
7. [Chainlink ACE Integration](#part-7-chainlink-ace-integration)
8. [How It All Fits Together](#part-8-how-it-all-fits-together)
9. [Key Design Decisions Summary](#part-9-key-design-decisions-summary)
10. [SDK Directory Structure](#part-10-sdk-directory-structure)
11. [Questions for Self-Assessment](#part-11-questions-for-self-assessment)

---

## Part 1: The Core Problem Being Solved

The SDK tokenizes **Real-World Assets (RWA)** - things like real estate, securities, and commodities. Unlike simple ERC-20 tokens, RWAs have **legal requirements**:

| Requirement | Description |
|-------------|-------------|
| **KYC/AML** | Know who's buying/selling |
| **Accreditation** | Some assets are only for accredited investors |
| **Jurisdiction Rules** | UAE laws differ from US SEC rules |
| **Audit Trails** | Regulators need to see every decision |
| **Recovery** | Lost keys must be recoverable (unlike crypto) |

---

## Part 2: Core Architecture Principles

### Principle 1: Compliance-First (Not Blockchain-First)

```
❌ Traditional: User → Blockchain → Done
✅ This SDK:   User → ComplianceEngine → Blockchain → Done
```

**Why?** Regulators require **pre-approval** before transfers. The blockchain only records what compliance already approved.

### Principle 2: Event Sourcing

Every state change is recorded as an **immutable event**. This enables:
- Full audit trail (regulators love this)
- State reconstruction (replay events to rebuild state)
- Time-travel debugging

### Principle 3: Plugin Architecture

The SDK doesn't hardcode any specific:
- KYC provider (Onfido, Sumsub, etc.)
- Custody solution (Fireblocks, BitGo, etc.)
- Blockchain (Ethereum, Polygon, etc.)
- Jurisdiction rules

Everything is a **swappable plugin**.

### Architecture Overview Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Entry Points                              │
│   SDK.ts (in-memory) │ ApiClient.ts (server-backed)            │
├─────────────────────────────────────────────────────────────────┤
│                        Modules Layer                             │
│   Governance │ Escrow │ CashFlow │ Offerings │ Vesting          │
├─────────────────────────────────────────────────────────────────┤
│                        Services Layer                            │
│   ComplianceService │ VerificationService │ IndexingService     │
├─────────────────────────────────────────────────────────────────┤
│                        Core Engines                              │
│   LifecycleEngine │ ComplianceEngine │ EventStore │ StateMachine│
├─────────────────────────────────────────────────────────────────┤
│                   Chainlink ACE Integration                      │
│   ACEPlugin │ ProofOfReservePlugin │ PolicyDecisionRecord       │
├─────────────────────────────────────────────────────────────────┤
│                        Plugin System                             │
│   Storage │ Chain │ KYC │ Custody │ Chainlink │ ACE             │
├─────────────────────────────────────────────────────────────────┤
│                        Providers                                 │
│   Custody │ KYC │ Payment │ Settlement │ Exchange               │
└─────────────────────────────────────────────────────────────────┘

                              │
                              ▼

┌─────────────────────────────────────────────────────────────────┐
│                    Smart Contract Layer                          │
├─────────────────────────────────────────────────────────────────┤
│ ACERouter.sol           │ Request/verify DON attestations       │
│ PolicyModuleRegistry.sol │ On-chain policy coordination         │
│ AllowPolicy.sol         │ Allowlist/blocklist enforcement       │
│ VolumePolicy.sol        │ Transfer limits and volume caps       │
│ TimePolicy.sol          │ Lockups, trading windows, blackouts   │
│ ProofOfReserveChecker.sol│ RWA collateral verification          │
│ ACEComplianceModule.sol │ IComplianceModule for ACE             │
└─────────────────────────────────────────────────────────────────┘

                              │
                              ▼

┌─────────────────────────────────────────────────────────────────┐
│                    Chainlink DON (External)                      │
├─────────────────────────────────────────────────────────────────┤
│ Chainlink Functions     │ Custom compliance logic execution     │
│ Proof of Reserve Feeds  │ Real-time collateral data             │
│ CCIP                    │ Cross-chain message passing           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3: Deep Dive into Each Component

### 3.1 LifecycleEngine

**File:** `sdk/src/core/LifecycleEngine.ts`

**What it does:** Manages asset state transitions

```
DRAFT → VERIFIED → ACTIVE → [FROZEN|REDEEMED|BURNED]
```

**Why it exists:**
- Assets can't be traded until verified
- Frozen assets must stop trading immediately
- State transitions must be **atomic** and **audited**

**Design Trade-off:**

| Option | Description | Chosen? |
|--------|-------------|---------|
| Option A | State on blockchain | ❌ Expensive, slow |
| Option B | State off-chain with blockchain finality | ✅ Yes |

The SDK chose Option B because:
- Compliance checks are complex (can't do in Solidity)
- State changes need to happen in milliseconds
- Blockchain is used for **finality**, not logic

**Key Code Pattern:**

```typescript
// Guards prevent invalid transitions
private guards: Map<string, TransitionGuard[]> = new Map();

// Every transition goes through compliance first
if (this.complianceEngine) {
  const decision = await this.complianceEngine.evaluate(action, context);
  if (decision.result === 'DENY') {
    return { success: false, reason: decision.reason };
  }
}
```

**Responsibilities:**
1. Enforce valid state transitions
2. Integrate with ComplianceEngine for pre-approval
3. Emit events for all state changes
4. Support custom transition guards
5. Rebuild state from events (hydration)

---

### 3.2 ComplianceEngine

**File:** `sdk/src/core/ComplianceEngine.ts`

**What it does:** The **gatekeeper** for ALL operations

**Why it exists:** Every action needs a **decision receipt** - cryptographic proof of why something was allowed/denied. Regulators can audit these.

**The Flow:**

```
1. User wants to transfer tokens
2. ComplianceEngine.evaluate() called
3. Check jurisdiction rules (IJurisdictionPlugin)
4. Check KYC/AML status (ICompliancePlugin)
5. Evaluate policy rules (PolicyEvaluator)
6. Create DecisionReceipt (signed, hashed, chained)
7. If ALLOW → proceed; if DENY → explain why
```

**Design Trade-off:**

| Option | Description | Chosen? |
|--------|-------------|---------|
| Option A | Compliance on-chain | ❌ Transparent but rigid |
| Option B | Compliance off-chain with receipts | ✅ Yes |

Chosen because:
- Compliance rules change frequently (regulators update them)
- On-chain gas costs would be prohibitive
- Privacy: KYC data can't be on public blockchain

**Key Code Pattern:**

```typescript
// Default policy ensures basic KYC even if no custom policy
private defaultPolicy = {
  rules: [
    {
      id: 'basic_kyc',
      type: 'require',
      field: 'actor.kycVerified',
      op: 'eq',
      value: true
    },
  ],
};
```

**Responsibilities:**
1. Orchestrate all compliance decisions
2. Coordinate jurisdiction and compliance plugins
3. Generate signed DecisionReceipts
4. Maintain policy version history
5. Support conditional approvals

---

### 3.3 EventStore

**File:** `sdk/src/core/EventStore.ts`

**What it does:** Append-only ledger of all events

**Why it exists:**
- **Auditability**: "Show me every transfer in 2024"
- **State reconstruction**: Rebuild state by replaying events
- **Compliance receipts**: Store decision proofs

**Design Trade-off:**

| Option | Description | Chosen? |
|--------|-------------|---------|
| Option A | Just store current state | ❌ Simple but no history |
| Option B | Event sourcing | ✅ Complex but full audit trail |

Event sourcing was chosen because:
- Regulators need complete history
- Can prove what happened at any point in time
- Enables time-travel debugging

**Key Code Pattern:**

```typescript
// Events are indexed multiple ways for fast queries
private events: Map<string, BaseEvent> = new Map();
private eventsByAsset: Map<string, string[]> = new Map();

// Receipts too
private receipts: Map<string, StoredReceipt> = new Map();
private receiptsByAsset: Map<string, string[]> = new Map();
private receiptsByActor: Map<string, string[]> = new Map();
```

**Responsibilities:**
1. Append events immutably
2. Query events by asset, type, time range
3. Store and query DecisionReceipts
4. Support pagination for large result sets
5. Enable state reconstruction

---

### 3.4 Plugin Interfaces

**File:** `sdk/src/core/interfaces.ts`

**What it does:** Defines contracts that plugins must implement

**Why it exists:** Different clients need different:
- Jurisdictions (UAE VARA vs US SEC vs EU MiFID)
- KYC providers (Onfido vs Sumsub vs Jumio)
- Custody (Fireblocks vs BitGo vs self-custody)

**Key Interfaces:**

#### IJurisdictionPlugin
```typescript
// "Can this asset exist in Dubai?"
interface IJurisdictionPlugin {
  readonly pluginId: string;
  readonly supportedJurisdictions: string[];

  canCreateAsset(asset: RightModel): Promise<JurisdictionCheckResult>;
  canTransfer(context, fromJurisdiction, toJurisdiction): Promise<JurisdictionCheckResult>;
  getRequiredDocuments(jurisdictionCode, assetType): string[];
  validateMetadata(asset: RightModel): Promise<Result<void, string>>;
}
```

#### ICompliancePlugin
```typescript
// "Is this investor allowed to buy?"
interface ICompliancePlugin {
  readonly pluginId: string;

  evaluateTransfer(context, fromStatus, toStatus): Promise<ComplianceCheckResult>;
  canHoldAsset(partyId, asset, status): Promise<ComplianceCheckResult>;
  checkPolicy(ruleId, context): Promise<ComplianceCheckResult>;
  getPartyStatus(partyId): Promise<PartyComplianceStatus | null>;
  updatePartyStatus(partyId, status): Promise<void>;
}
```

**Design Trade-off:**

| Option | Description | Chosen? |
|--------|-------------|---------|
| Option A | Hardcode one KYC provider | ❌ Simple but inflexible |
| Option B | Plugin architecture | ✅ Complex but universal |

Plugin architecture enables:
- Clients choose their providers
- Easy testing with mocks
- Future providers without SDK changes

---

### 3.5 DisasterRecovery

**File:** `sdk/src/core/DisasterRecovery.ts`

**What it does:** Handles system failures gracefully

**Why it exists:** Production systems **will** fail. The question is **how**.

**Safe-Fail Modes:**

```typescript
enum SafeFailMode {
  DENY_ALL = 'DENY_ALL',           // ✅ Safest for production
  READ_ONLY = 'READ_ONLY',         // Allow reads, deny writes
  USE_CACHE = 'USE_CACHE',         // Use cached decisions
  ALLOW_WITH_WARNING = 'ALLOW_WITH_WARNING', // ❌ Never in production
}
```

**Design Trade-off:**

| Option | Description | Chosen? |
|--------|-------------|---------|
| Option A | Just fail if backend down | ❌ Simple but terrible UX |
| Option B | Graceful degradation | ✅ Complex but professional |

**The Key Insight:** When in doubt, **DENY**. It's better to temporarily block a transfer than to allow an illegal one.

**Default Configuration:**

```typescript
const DEFAULT_CONFIG: DisasterRecoveryConfig = {
  healthCheckIntervalMs: 30 * 1000,      // 30 seconds
  failureThreshold: 3,                    // 3 failures before offline
  stuckStateThresholdMs: 5 * 60 * 1000,  // 5 minutes
  safeFailMode: SafeFailMode.DENY_ALL,   // Safest option
  decisionCacheMaxAgeMs: 60 * 1000,      // 1 minute cache
  autoRecoveryEnabled: true,
  recoveryIntervalMs: 60 * 1000,         // 1 minute recovery check
};
```

---

### 3.6 DecisionReceipt

**File:** `sdk/src/core/DecisionReceipt.ts`

**What it does:** Cryptographic proof of compliance decisions

**Why it exists:** When regulators ask "why did you allow this transfer?", you need **proof**.

**Receipt Structure:**

```typescript
interface DecisionReceipt {
  decisionId: string;           // Unique ID
  action: string;               // What was requested
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  issuedAt: string;             // Timestamp
  subject: { type, id };        // What was evaluated
  actor: { id, type };          // Who requested
  summary: string;              // Human-readable explanation
  reasons: PolicyReason[];      // Detailed reasons
  decisionHash: string;         // Hash of decision data
  policyHash: string;           // Hash of policy used
  signature: string;            // Cryptographic signature
  previousReceiptHash?: string; // Chain to previous receipt
}
```

**Design Trade-off:**

| Option | Description | Chosen? |
|--------|-------------|---------|
| Option A | Just log decisions | ❌ Simple but tamperable |
| Option B | Hash-chained receipts | ✅ Tamper-evident |

The chain of hashes means **no one can modify history** without breaking the chain.

---

### 3.7 Additional Core Components

| Component | File | Purpose |
|-----------|------|---------|
| **StateMachine** | `core/StateMachine.ts` | Generic configurable state machine with guards and actions |
| **HookSystem** | `core/HookSystem.ts` | Pre/post lifecycle hooks for custom logic injection |
| **PolicyEvaluator** | `core/PolicyEvaluator.ts` | Evaluates compliance rules against context |
| **CustodyManager** | `core/CustodyManager.ts` | Multi-sig, key recovery, regulatory overrides |
| **IndexingEngine** | `core/IndexingEngine.ts` | Real-time balance and transfer indexing |
| **AssetAbstraction** | `core/AssetAbstraction.ts` | Hides ERC standards behind institutional API |
| **Observability** | `core/Observability.ts` | Structured logging, metrics, tracing |
| **RateLimiter** | `core/RateLimiter.ts` | Request rate limiting |
| **Saga** | `core/Saga.ts` | Distributed transaction coordination |

---

## Part 4: Production-Level Patterns

### Pattern 1: Idempotency

**File:** `sdk/src/core/Idempotency.ts`

**Problem:** Network failures can cause duplicate requests

**Solution:** Every operation has an idempotency key

```typescript
// Client retries same request 3 times due to timeout
// Without idempotency: 3 transfers happen
// With idempotency: 1 transfer happens, 2 return cached result

interface IdempotencyRecord {
  key: string;
  requestHash: string;
  response: unknown;
  createdAt: Date;
  expiresAt: Date;
}
```

---

### Pattern 2: Circuit Breaker

**File:** `sdk/src/core/Resilience.ts`

**Problem:** One failing service takes down everything

**Solution:**

```
If backend fails 3 times in 30 seconds:
1. "Open" the circuit (stop calling it)
2. Return cached/degraded response
3. Periodically test if backend recovered
4. "Close" circuit when healthy
```

**States:**

```typescript
enum CircuitState {
  CLOSED,      // Normal operation
  OPEN,        // Failing, don't call
  HALF_OPEN    // Testing recovery
}
```

---

### Pattern 3: Saga Pattern

**File:** `sdk/src/core/Saga.ts`

**Problem:** Multi-step operations can fail halfway

**Solution:**

```typescript
// Transfer saga:
// 1. Freeze sender tokens      → Compensation: Unfreeze
// 2. Compliance check          → Compensation: Void decision
// 3. Execute transfer          → Compensation: Reverse transfer
// 4. Unfreeze                   → (no compensation needed)

// If step 3 fails:
// - Compensate step 2 (void compliance decision)
// - Compensate step 1 (unfreeze sender)
```

---

### Pattern 4: Retry with Exponential Backoff

**File:** `sdk/src/core/Retry.ts`

**Problem:** Transient failures should be retried intelligently

**Solution:**

```typescript
interface RetryConfig {
  maxRetries: number;           // e.g., 3
  initialDelayMs: number;       // e.g., 100ms
  maxDelayMs: number;           // e.g., 10000ms
  backoffMultiplier: number;    // e.g., 2
  retryableErrors: string[];    // Which errors to retry
}

// Attempt 1: immediate
// Attempt 2: wait 100ms
// Attempt 3: wait 200ms
// Attempt 4: wait 400ms (capped at maxDelayMs)
```

---

## Part 5: The Two Modes of Operation

### Mode 1: In-Memory SDK

**File:** `sdk/src/SDK.ts`

**For:** Development, testing, demos

| Characteristic | Value |
|----------------|-------|
| State storage | In-memory |
| Plugins | Mock implementations |
| Blockchain calls | Simulated |
| Speed | Instant |
| Persistence | None (lost on restart) |

**Usage:**

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({
  // Uses mock plugins by default
});
```

**Warning:**

```typescript
constructor(config) {
  console.warn(
    'DEPRECATION WARNING: In-memory SDK is for development only. ' +
    'Use ApiClient.ts for production with server-backed storage.'
  );
}
```

---

### Mode 2: API Client (Production)

**File:** `sdk/src/ApiClient.ts`

**For:** Production applications

| Characteristic | Value |
|----------------|-------|
| State storage | Backend server (PostgreSQL) |
| Plugins | Real implementations |
| Blockchain calls | Real transactions |
| Speed | Network latency |
| Persistence | Full durability |

**Usage:**

```typescript
import { ApiClient } from '@tokenisation/sdk/client';

const client = new ApiClient({
  baseUrl: 'https://api.ahoy.fund',
  apiKey: process.env.AHOY_API_KEY,
});
```

---

## Part 6: The Smart Contract Layer

**Location:** `sdk/src/contracts/`

### Contract Overview

| Contract | Purpose |
|----------|---------|
| **ComplianceToken.sol** | ERC-20 with transfer restrictions |
| **ComplianceTokenUpgradeable.sol** | UUPS upgradeable version |
| **TokenFactory.sol** | Deploy new tokens |
| **IdentityRegistry.sol** | On-chain identity claims |
| **ModularCompliance.sol** | On-chain compliance modules |
| **DividendDistributor.sol** | Pay dividends to holders |
| **TokenGovernor.sol** | Multi-sig + timelock governance |

### Design Philosophy

The contracts are **thin**. Most logic is off-chain. Contracts just:

1. **Enforce the final decision** - After off-chain compliance approval
2. **Provide blockchain finality** - Immutable record
3. **Enable on-chain composability** - DeFi integration

### Why Not More On-Chain Logic?

| Concern | On-Chain | Off-Chain |
|---------|----------|-----------|
| Cost | High gas fees | Minimal |
| Speed | Block time (12s+) | Milliseconds |
| Flexibility | Requires upgrade | Instant update |
| Privacy | Public | Private |
| Complexity | Limited (Solidity) | Unlimited |

---

## Part 7: Chainlink ACE Integration

The SDK integrates with **Chainlink ACE (Automated Compliance Engine)** to provide decentralized, DON-verified compliance decisions. This eliminates single-point-of-failure in compliance infrastructure.

### 7.1 Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ ComplianceEngine│────▶│ ACERouter.sol│────▶│ Chainlink ACE DON   │
│ (SDK)           │     │              │     │ (Decentralized      │
│                 │◀────│              │◀────│  Compliance Engine) │
└─────────────────┘     └──────────────┘     └─────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐
                    │ PolicyModuleRegistry │
                    │ (On-chain policies) │
                    └─────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌───────────┐  ┌─────────────┐  ┌───────────┐
        │AllowPolicy│  │VolumePolicy │  │TimePolicy │
        └───────────┘  └─────────────┘  └───────────┘
```

### 7.2 ACERouter Contract

**File:** `contracts/src/oracles/ACERouter.sol`

**What it does:** Interface between SDK and Chainlink DON for attestations

**Key Features:**
- Request attestations from Chainlink Functions
- Cache attestations with configurable TTL
- Multi-sig DON verification
- Fallback mechanism for DON unavailability
- CCID compatibility for DeFi composability

**Attestation Types:**

| Type | Description | Cache TTL |
|------|-------------|-----------|
| `IDENTITY_VERIFICATION` | KYC/AML verification | 1 hour |
| `ACCREDITATION` | Investor accreditation status | 24 hours |
| `SANCTIONS_SCREENING` | OFAC/sanctions check | 1 hour |
| `JURISDICTION_CHECK` | Geographic eligibility | 24 hours |
| `TRANSFER_COMPLIANCE` | Per-transfer compliance | 5 minutes |

**High-Value Transfer Handling:**

```solidity
// Transfers above $100k require fresh attestation
if (value >= highValueThreshold) {
    // Always request new DON attestation
}
```

### 7.3 Policy Modules (DON-Enforced)

**Location:** `contracts/src/compliance/policy/`

Policy modules provide **authoritative on-chain rules** that the Chainlink DON enforces directly. The SDK's PolicyEvaluator acts as a pre-validator to catch obvious errors off-chain before incurring gas costs.

#### AllowPolicy

**File:** `AllowPolicy.sol`

**Purpose:** Allowlist/blocklist enforcement

| Feature | Description |
|---------|-------------|
| Global allowlist | Addresses allowed for all tokens |
| Global blocklist | Addresses blocked for all tokens |
| Per-token lists | Token-specific overrides |
| Jurisdiction blocking | Block by ISO country code |
| KYC verification | Require valid KYC with expiry |
| Accreditation | Require accredited investor status |

#### VolumePolicy

**File:** `VolumePolicy.sol`

**Purpose:** Transfer limits and volume caps

| Limit Type | Description |
|------------|-------------|
| Min transfer | Minimum transfer amount |
| Max transfer | Maximum single transfer |
| Max holding | Maximum per-address balance |
| Daily volume | Per-address daily limit |
| Weekly volume | Per-address weekly limit |
| Global daily | Total daily market volume |
| Cooldown period | Time between transfers |

#### TimePolicy

**File:** `TimePolicy.sol`

**Purpose:** Time-based restrictions

| Feature | Description |
|---------|-------------|
| Lockup schedules | Vesting with cliff and linear unlock |
| Trading windows | Market hours (UTC) |
| Allowed days | Weekday bitmask |
| Blackout periods | Named embargo periods |
| Expiration | Token expiration date |

### 7.4 Policy Decision Records (PDR)

**File:** `sdk/src/core/DecisionReceipt.ts`

PDRs extend DecisionReceipts with DON consensus proofs for DeFi composability.

**PDR Structure:**

```typescript
interface PolicyDecisionRecord {
  pdrId: string;

  // Core Decision
  action: ComplianceAction;
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  policyVersion: string;
  policyHash: string;

  // DON Consensus Proof
  donProof: DONConsensusProof | null;
  aceAttestationId?: string;

  // Policy Module Results
  policyModuleResults: PolicyModuleResult[];
  aggregatePolicyHash?: string;

  // CCID Compatibility
  ccidSchema: CCIDSchemaRef;
  ccidCompliant: boolean;

  // Blockchain Reference
  chainId: number;
  blockNumber?: number;

  // Cryptographic Integrity
  contentHash: string;
  signature: string;
  previousPdrHash?: string;
}
```

**DON Consensus Proof:**

```typescript
interface DONConsensusProof {
  requestId: string;
  nodeCount: number;
  threshold: number;
  signatures: DONSignature[];
  aggregatedSignature?: string;
  blockNumber: number;
  blockHash: string;
  transactionHash?: string;
}
```

**CCID Schema IDs:**

| Action | Schema ID |
|--------|-----------|
| `token:transfer` | `ccid:schema:transfer-compliance:v1` |
| `token:mint` | `ccid:schema:token-mint:v1` |
| `token:burn` | `ccid:schema:token-burn:v1` |
| `asset:create` | `ccid:schema:asset-creation:v1` |
| `party:register` | `ccid:schema:party-registration:v1` |

### 7.5 Proof of Reserve (PoR)

**Files:**
- `contracts/src/oracles/ProofOfReserveChecker.sol`
- `sdk/src/plugins/chainlink/ProofOfReservePlugin.ts`

**Purpose:** Verify RWA tokens are adequately backed by reserves

**Reserve Status Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│            Reserve Ratio Check                               │
├─────────────────────────────────────────────────────────────┤
│  ratio >= 105%  │  FULLY_BACKED      │ Mint ✓  Transfer ✓  │
│  ratio >= 100%  │  UNDERCOLLATERALIZED│ Mint ✗  Transfer ✓  │
│  ratio < 100%   │  CIRCUIT_BREAKER   │ Mint ✗  Transfer ✗  │
└─────────────────────────────────────────────────────────────┘
```

**Key Configuration:**

```solidity
// Default ratios (basis points)
uint256 DEFAULT_REQUIRED_RATIO = 10500;       // 105%
uint256 DEFAULT_CIRCUIT_BREAKER_RATIO = 10000; // 100%

// Staleness protection
uint256 MAX_STALENESS = 3600; // 1 hour
```

**SDK Integration:**

```typescript
// Check mint compliance
const result = await porPlugin.checkMintCompliance(tokenAddress, amount);
if (!result.compliant) {
  // Block mint - reserves insufficient
}

// Get max mintable
const maxMint = await porPlugin.getMaxMintable(tokenAddress);
```

### 7.6 ACE Plugin (SDK)

**File:** `sdk/src/plugins/chainlink/ChainlinkAcePlugin.ts`

**Features:**
- Request attestations from DON
- Local 5-minute cache
- Policy module evaluation
- Pre-validation for gas optimization
- Event subscription

**Usage:**

```typescript
import { ChainlinkAcePlugin } from '@tokenisation/sdk/plugins/chainlink';

const acePlugin = new ChainlinkAcePlugin({
  chainId: 84532,
  rpcUrl: 'https://sepolia.base.org',
  routerAddress: '0x...',
  privateKey: process.env.PRIVATE_KEY,
});

// Full compliance check (attestations + policies)
const result = await acePlugin.checkFullCompliance(
  from,
  to,
  amount,
  tokenAddress
);

if (result.success && result.data.compliant) {
  // Transfer is compliant
  // result.data.policyResults contains individual module decisions
  // result.data.attestationId contains DON attestation
}
```

**Pre-validation:**

```typescript
// Catch obvious errors before on-chain calls
const preCheck = await acePlugin.preValidateTransfer(from, to, amount, token);
if (!preCheck.valid) {
  // Don't waste gas - local validation failed
  console.log(preCheck.issues);
}
```

---

## Part 8: How It All Fits Together

### Complete Transfer Flow (with ACE Integration)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User calls: sdk.transfer(from, to, amount)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Idempotency check: Have we seen this request before?         │
│    - If yes: return cached result                               │
│    - If no: continue                                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. ACE Pre-validation (if ACE enabled)                          │
│    a. Check local cache for valid attestations                  │
│    b. Validate addresses and amount format                      │
│    c. If issues found, fail fast without gas cost               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ComplianceEngine.evaluate()                                  │
│    IF ACE-first mode:                                           │
│      a. ACEPlugin.checkFullCompliance() - DON attestations      │
│      b. PolicyModuleRegistry.evaluateAll() - On-chain policies  │
│      c. Fallback to local plugins on timeout                    │
│    ELSE (local mode):                                           │
│      a. JurisdictionPlugin.canTransfer() - Legal check          │
│      b. CompliancePlugin.evaluateTransfer() - KYC/AML check     │
│      c. PolicyEvaluator.evaluate() - Business rules             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Create PDR (Policy Decision Record) or DecisionReceipt       │
│    - Include DON consensus proof (if ACE)                       │
│    - Include policy module results                              │
│    - Sign and hash-chain                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
            ┌───────────┐       ┌───────────────┐
            │ 6a. DENY  │       │ 6b. ALLOW     │
            │ Return    │       │ Continue      │
            │ PDR       │       │               │
            └───────────┘       └───────┬───────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. LifecycleEngine validates state                              │
│    - Check asset is ACTIVE                                      │
│    - Check sender has balance                                   │
│    - Run transition guards                                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. Proof of Reserve check (if RWA token)                        │
│    - Verify collateral ratio >= 100%                            │
│    - If circuit breaker triggered, block transfer               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 9. EventStore records the event                                 │
│    - TRANSFER event with all details                            │
│    - Link to PDR/DecisionReceipt                                │
│    - Store DON attestation reference                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 10. ChainService submits to blockchain                          │
│     - Call ComplianceToken.transfer()                           │
│     - ACEComplianceModule validates cached attestation          │
│     - Wait for confirmation                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 11. IndexingEngine updates balances                             │
│     - Decrement sender balance                                  │
│     - Increment receiver balance                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 12. Return success with PDR                                     │
│     - Includes DON attestation ID                               │
│     - CCID-compliant for DeFi integration                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 9: Key Design Decisions Summary

| Decision | Choice | Why |
|----------|--------|-----|
| Compliance location | Off-chain + DON | Speed, flexibility, decentralization |
| State management | Event sourcing | Audit trail, reconstruction |
| Provider integration | Plugin architecture | Flexibility, testability |
| Failure handling | Safe-deny | Regulatory safety |
| Blockchain role | Finality only | Cost, speed, complexity |
| Decision proofs | Hash-chained PDRs | Tamper evidence, CCID compatibility |
| Multi-step operations | Saga pattern | Reliable rollback |
| Network failures | Idempotency keys | At-most-once semantics |
| Service failures | Circuit breaker | Graceful degradation |
| Transient failures | Exponential backoff | Intelligent retry |
| Compliance authority | Chainlink DON | Decentralized, no single point of failure |
| Policy enforcement | On-chain modules | DON-verifiable, composable |
| RWA backing | Proof of Reserve | Real-time collateral verification |
| Decision format | CCID-compatible PDR | DeFi composability (Aave, Uniswap) |

---

## Part 10: SDK Directory Structure

```
sdk/src/
├── index.ts                 # Main barrel export
├── SDK.ts                   # In-memory SDK (development)
├── ApiClient.ts             # Production API client
├── client.ts                # Browser-safe exports
├── server.ts                # Server-only exports
│
├── core/                    # Core engines
│   ├── LifecycleEngine.ts   # Asset state machine
│   ├── ComplianceEngine.ts  # Compliance gatekeeper
│   ├── EventStore.ts        # Event sourcing
│   ├── StateMachine.ts      # Generic state machine
│   ├── PolicyEvaluator.ts   # Rule evaluation
│   ├── DecisionReceipt.ts   # Compliance proofs
│   ├── DisasterRecovery.ts  # Failure handling
│   ├── CustodyManager.ts    # Key management
│   ├── IndexingEngine.ts    # Balance indexing
│   ├── HookSystem.ts        # Lifecycle hooks
│   ├── Idempotency.ts       # Duplicate prevention
│   ├── Resilience.ts        # Circuit breaker
│   ├── Retry.ts             # Retry logic
│   ├── Saga.ts              # Distributed transactions
│   ├── RateLimiter.ts       # Rate limiting
│   ├── interfaces.ts        # Plugin contracts
│   └── types.ts             # Core types
│
├── models/                  # Data models
│   ├── Asset.ts             # Asset representation
│   ├── Party.ts             # Party (investor/issuer)
│   └── Evidence.ts          # Supporting documents
│
├── services/                # Business services
│   ├── ComplianceService.ts
│   ├── VerificationService.ts
│   ├── IndexingService.ts
│   └── ...
│
├── plugins/                 # Plugin implementations
│   ├── PluginRegistry.ts    # Plugin management
│   ├── api/                 # Backend API plugins
│   ├── auth/                # Authentication (SIWE, MetaMask)
│   ├── chain/               # Blockchain plugins
│   ├── chainlink/           # Chainlink integration
│   │   ├── ChainlinkAcePlugin.ts    # ACE DON integration
│   │   ├── ProofOfReservePlugin.ts  # PoR verification
│   │   ├── DataFeedPlugin.ts        # Price feeds
│   │   ├── CCIPBridgePlugin.ts      # Cross-chain transfers
│   │   └── ...
│   ├── compliance/          # Compliance plugins
│   ├── kyc/                 # KYC plugins
│   ├── storage/             # Storage plugins (S3, IPFS)
│   └── mocks/               # Mock plugins for testing
│
├── providers/               # External provider integrations
│   ├── custody/             # Fireblocks, BitGo
│   ├── kyc/                 # Sumsub, Onfido
│   ├── payment/             # Stripe, Circle
│   ├── settlement/          # Settlement providers
│   └── exchange/            # Exchange providers
│
├── modules/                 # Feature modules
│   ├── Governance.ts        # Voting, proposals
│   ├── Escrow.ts            # Conditional transfers
│   ├── CashFlow.ts          # Dividends
│   ├── Vesting.ts           # Token vesting
│   └── Offerings.ts         # Token offerings
│
├── contracts/               # Smart contract interaction
│   ├── abis/                # Contract ABIs
│   └── solidity/            # Solidity source
│
├── packs/                   # Pre-configured asset templates
│   ├── dubai-real-estate.pack.ts
│   ├── us-securities.pack.ts
│   └── ...
│
├── validation/              # Input validation
│   ├── schemas.ts           # Zod schemas
│   └── index.ts             # Validation utilities
│
└── errors/                  # Error handling
    └── index.ts             # Error classes
```

---

## Part 11: Questions for Self-Assessment

Test your understanding with these questions:

### Conceptual Questions

1. **Why does compliance happen off-chain, not in smart contracts?**

   *Hint: Think about speed, cost, privacy, and flexibility.*

2. **What's the difference between `LifecycleEngine` and `ComplianceEngine`?**

   *Hint: One manages state, one makes decisions.*

3. **Why does the SDK use event sourcing instead of just storing current state?**

   *Hint: Think about auditors and regulators.*

4. **What happens when the backend is down? Why is DENY_ALL the safest mode?**

   *Hint: What's worse - blocking a legitimate transfer or allowing an illegal one?*

5. **Why are DecisionReceipts hash-chained to each other?**

   *Hint: What happens if someone tries to delete or modify a past decision?*

### Technical Questions

6. **How does the Saga pattern handle a failure in step 3 of a 5-step operation?**

7. **What's the difference between a circuit breaker in OPEN vs HALF_OPEN state?**

8. **Why does the SDK have both `SDK.ts` (in-memory) and `ApiClient.ts` (server-backed)?**

9. **How does idempotency prevent duplicate transfers during network retries?**

10. **What role do smart contracts play if most logic is off-chain?**

### Chainlink ACE Questions

11. **Why use Chainlink DON for compliance instead of a centralized backend?**

    *Hint: Think about single points of failure and DeFi composability.*

12. **What's the difference between a DecisionReceipt and a PolicyDecisionRecord (PDR)?**

    *Hint: One has DON consensus proof and CCID compatibility.*

13. **Why does the SDK pre-validate transfers before calling on-chain policy modules?**

    *Hint: Think about gas costs and user experience.*

14. **What happens when the PoR circuit breaker triggers? Why is it necessary?**

    *Hint: What if reserve backing falls below 100%?*

15. **How do CCID-compatible PDRs enable DeFi integration (e.g., Aave, Uniswap)?**

    *Hint: External protocols can verify compliance without trusting a centralized service.*

---

## Appendix: Further Reading

### Internal Documentation
- `docs/API.md` - API reference
- `docs/DEPLOYMENT.md` - Deployment guide
- `contracts/README.md` - Smart contract documentation

### External References
- [ERC-3643 (T-REX)](https://eips.ethereum.org/EIPS/eip-3643) - Security token standard
- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)
- [Chainlink Functions](https://docs.chain.link/chainlink-functions) - Decentralized compute
- [Chainlink Proof of Reserve](https://docs.chain.link/data-feeds/proof-of-reserve) - Collateral verification
- [Chainlink CCIP](https://docs.chain.link/ccip) - Cross-chain interoperability

---

*Document generated for the TokenisationSDK project. Last updated: January 2026.*
