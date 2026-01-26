# Tokenisation SDK - Complete User Guide

> **A programmable factory that turns real-world rights, assets, or actions into verifiable, rule-based digital tokens — without rewriting everything each time.**

**Version:** 1.0.0
**Package:** `@tokenisation/sdk`

---

## Table of Contents

1. [What Problem Does This SDK Solve?](#1-what-problem-does-this-sdk-solve)
2. [Why Is This SDK Needed?](#2-why-is-this-sdk-needed)
3. [Core Concepts](#3-core-concepts)
4. [Architecture Overview](#4-architecture-overview)
5. [Installation & Setup](#5-installation--setup)
6. [Quick Start Guide](#6-quick-start-guide)
7. [API Reference](#7-api-reference)
8. [Reference Packs (Real-World Examples)](#8-reference-packs-real-world-examples)
9. [Plugin System](#9-plugin-system)
10. [Compliance & KYC](#10-compliance--kyc)
11. [Best Practices](#11-best-practices)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. What Problem Does This SDK Solve?

### The Challenge of Real-World Asset Tokenization

Tokenizing real-world assets (RWA) is complex. Every asset type—real estate, loyalty points, tickets, credentials, carbon credits—seems to need its own custom solution:

| Asset Type | Unique Requirements |
|------------|---------------------|
| Real Estate | Title deeds, valuations, jurisdiction rules, investor limits |
| Loyalty Points | Soulbound (non-transferable), oracle updates, decay rates |
| Event Tickets | Time-bound validity, resale caps, secondary market royalties |
| Certifications | Issuing authority verification, expiry dates, revocation |
| Carbon Credits | Third-party attestations, retirement tracking, audit trails |

**Without a unified framework:**
- You rebuild compliance logic for every asset type
- You rewrite state management and lifecycle rules repeatedly
- You can't easily adapt when regulations change
- Every project becomes a custom integration nightmare

### The Solution: One Engine, Many Assets

The Tokenisation SDK provides a **universal engine** where:

```
Same Lifecycle Flow → Different Rules → Different Asset Types
```

Instead of writing custom code for each asset, you configure **rules and plugins** while the core engine handles:

- State machine (asset lifecycle)
- Compliance checking (KYC, jurisdiction, investor limits)
- Evidence management (deeds, certificates, attestations)
- Event sourcing (immutable audit trail)
- Token operations (mint, transfer, burn)

---

## 2. Why Is This SDK Needed?

### 2.1 Business Problems Solved

| Problem | How SDK Solves It |
|---------|------------------|
| **Compliance is hard** | Built-in compliance engine with configurable rulesets per jurisdiction |
| **Each asset needs custom code** | Universal data model with type-specific metadata |
| **Audit trails are fragmented** | Event sourcing captures every state change immutably |
| **Blockchain lock-in** | Plugin architecture allows swapping chains without rewriting logic |
| **Regulations change** | Just update the jurisdiction plugin, not your entire codebase |

### 2.2 Technical Problems Solved

| Problem | How SDK Solves It |
|---------|------------------|
| **State management across systems** | Single source of truth in the Lifecycle Engine |
| **Complex transfer restrictions** | Declarative transferability rules (whitelist, soulbound, compliance-gated) |
| **Off-chain evidence linking** | Evidence model with cryptographic hashes and verification |
| **Oracle integration** | Oracle service abstraction for external data feeds |
| **Multi-party workflows** | Party management with roles (issuer, verifier, investor) |

### 2.3 The Core Philosophy

> **"The engine owns truth — blockchain is for settlement only."**

The SDK maintains the canonical state of all assets. The blockchain is used only for:
- Final settlement
- Public verifiability
- Token transfers

This design allows:
- Fast off-chain operations
- Compliance checks before on-chain commits
- Ability to freeze/modify before finality
- Full event history reconstruction

---

## 3. Core Concepts

### 3.1 Right Types

Every tokenizable asset falls into one of four fundamental categories:

```typescript
enum RightType {
  OWNERSHIP      // Real Estate, IP, Game Items, Physical Assets
  ACCESS         // Tickets, Memberships, Education Credentials
  BEHAVIOR       // Loyalty Points, Driving Scores, Reputation
  VERIFICATION   // Carbon Credits, Supply Chain Proofs, Certifications
}
```

### 3.2 Lifecycle States

Assets progress through a canonical state machine:

```
┌─────────┐     ┌────────────────────┐     ┌──────────┐     ┌────────┐
│  DRAFT  │ ──► │ PENDING_VERIFICATION│ ──► │ VERIFIED │ ──► │ ACTIVE │
└─────────┘     └────────────────────┘     └──────────┘     └────────┘
                         │                       │               │
                         ▼                       ▼               ▼
                    (back to DRAFT)        (back to DRAFT)  ┌─────────┐
                                                            │ FROZEN  │
                                                            └────┬────┘
                                                                 │
                                           ┌─────────────────────┼─────────────────────┐
                                           ▼                     ▼                     ▼
                                      ┌──────────┐         ┌─────────┐          ┌────────┐
                                      │ REDEEMED │         │ EXPIRED │          │ BURNED │
                                      └──────────┘         └─────────┘          └────────┘
```

| State | Description |
|-------|-------------|
| `DRAFT` | Asset definition created, not submitted |
| `PENDING_VERIFICATION` | Awaiting verifier review |
| `VERIFIED` | Approved by authorized verifier |
| `ACTIVE` | Token minted, tradeable on-chain |
| `FROZEN` | Temporarily locked (compliance/legal) |
| `REDEEMED` | Used/claimed (ticket used, loan repaid) |
| `EXPIRED` | Validity period ended |
| `BURNED` | Permanently retired (terminal state) |

### 3.3 Transferability Modes

Control how tokens can be transferred:

```typescript
enum TransferabilityMode {
  UNRESTRICTED       // Anyone can receive
  WHITELIST_ONLY     // Only approved addresses
  NON_TRANSFERABLE   // Soulbound - cannot be transferred
  COMPLIANCE_GATED   // Requires KYC/compliance check
}
```

### 3.4 Key Entities

| Entity | Purpose |
|--------|---------|
| **Asset** | The tokenized right with all metadata |
| **Party** | Issuer, verifier, investor, or custodian |
| **Evidence** | Off-chain proof (deed, certificate, oracle data) |
| **Event** | Immutable record of every state change |

---

## 4. Architecture Overview

### 4.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TokenisationSDK                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │    Assets    │  │   Parties    │  │   Evidence   │  │   Tokens    │ │
│  │   Manager    │  │   Manager    │  │   Manager    │  │   Manager   │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬──────┘ │
│         │                 │                 │                  │        │
│  ═══════╪═════════════════╪═════════════════╪══════════════════╪══════  │
│         │                 │                 │                  │        │
│  ┌──────▼─────────────────▼─────────────────▼──────────────────▼──────┐ │
│  │                      CORE SERVICES                                 │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │ │
│  │  │   Lifecycle    │  │   Compliance   │  │  Verification  │       │ │
│  │  │    Engine      │  │    Service     │  │    Service     │       │ │
│  │  └────────────────┘  └────────────────┘  └────────────────┘       │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐       │ │
│  │  │    Oracle      │  │   Attestation  │  │   Indexing     │       │ │
│  │  │   Service      │  │    Service     │  │   Service      │       │ │
│  │  └────────────────┘  └────────────────┘  └────────────────┘       │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                     │
│  ═════════════════════════════════╪═════════════════════════════════    │
│                                   │                                     │
│  ┌────────────────────────────────▼───────────────────────────────────┐ │
│  │                       PLUGIN REGISTRY                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │ │
│  │  │ Jurisdiction │  │  Compliance  │  │   Storage    │             │ │
│  │  │   Plugin     │  │   Plugin     │  │   Plugin     │             │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │ │
│  │  ┌──────────────┐  ┌──────────────┐                               │ │
│  │  │    Chain     │  │    Oracle    │                               │ │
│  │  │   Plugin     │  │   Plugin     │                               │ │
│  │  └──────────────┘  └──────────────┘                               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                   │                                     │
│  ═════════════════════════════════╪═════════════════════════════════    │
│                                   ▼                                     │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                         EVENT STORE                                │ │
│  │              (Append-only, Immutable Audit Trail)                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Flow

```
1. CREATE ASSET
   User → SDK.assets.create() → LifecycleEngine → EventStore
                                     ↓
                              Asset in DRAFT state

2. SUBMIT FOR VERIFICATION
   User → SDK.assets.transition(PENDING_VERIFICATION) → PolicyEvaluator
                                                              ↓
                                                     Check guard conditions
                                                              ↓
                                                     EventStore records transition

3. VERIFY ASSET
   Verifier → SDK.assets.verify() → ComplianceService → LifecycleEngine
                                           ↓
                                    Evaluate compliance rules
                                           ↓
                                    Asset → VERIFIED state

4. MINT TOKENS
   User → SDK.tokens.mint() → ComplianceService → Blockchain (via adapter)
                                     ↓
                              Check asset is ACTIVE
                              Check compliance rules
                                     ↓
                              IndexingService tracks balances
```

---

## 5. Installation & Setup

### 5.1 Prerequisites

- Node.js 18+
- npm or yarn
- TypeScript 5.0+ (for TypeScript projects)

### 5.2 Installation

```bash
# Install the SDK
npm install @tokenisation/sdk

# Or with yarn
yarn add @tokenisation/sdk
```

### 5.3 Project Setup

```bash
# Create a new project
mkdir my-tokenization-project
cd my-tokenization-project
npm init -y

# Install SDK and TypeScript
npm install @tokenisation/sdk
npm install -D typescript @types/node

# Initialize TypeScript
npx tsc --init
```

### 5.4 TypeScript Configuration

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true
  }
}
```

---

## 6. Quick Start Guide

### 6.1 Initialize the SDK

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

// Create SDK instance with mock plugins (for development)
const sdk = new TokenisationSDK({
  useMockPlugins: true,
});

// For production, configure chain connection
const productionSDK = new TokenisationSDK({
  useMockPlugins: false,
  chain: {
    chainId: 137,  // Polygon
    rpcUrl: 'https://polygon-rpc.com',
    privateKey: process.env.PRIVATE_KEY,
  },
});
```

### 6.2 Create Your First Asset

```typescript
import {
  TokenisationSDK,
  RightType,
  TransferabilityMode,
  PartyRole,
  PartyType,
} from '@tokenisation/sdk';

const sdk = new TokenisationSDK();

// Step 1: Create an issuer
const issuer = sdk.parties_.create({
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  name: 'Acme Properties LLC',
  jurisdiction: 'AE',
});

// Step 2: Create an asset
const asset = await sdk.assets.create({
  name: 'Dubai Marina Tower - Unit 1501',
  description: 'Luxury 2BR apartment with marina view',
  rightType: RightType.OWNERSHIP,
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'UAE_VARA',
    accreditedOnly: false,
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
  },
  validityPeriod: {
    isPerpetual: true,
  },
  transferabilityRules: {
    mode: TransferabilityMode.COMPLIANCE_GATED,
    requireKyc: true,
    maxHolders: 500,
  },
  issuerId: issuer.id,
  typedMetadata: {
    assetType: 'REAL_ESTATE',
    propertyType: 'RESIDENTIAL',
    address: {
      street: 'Dubai Marina Walk',
      city: 'Dubai',
      postalCode: '00000',
      country: 'AE',
    },
    area: { value: 150, unit: 'SQM' },
    valuationAmount: '2500000',
    valuationCurrency: 'AED',
  },
});

console.log('Asset created:', asset.id);
console.log('Current state:', asset.state); // 'DRAFT'
```

### 6.3 Add Evidence and Verify

```typescript
import { EvidenceType } from '@tokenisation/sdk';

// Create a verifier (e.g., government land registry)
const verifier = sdk.parties_.create({
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.VERIFIER],
  name: 'Dubai Land Department',
  jurisdiction: 'AE',
});

// Add evidence (title deed)
const evidence = sdk.evidence.create({
  assetId: asset.id,
  type: EvidenceType.LEGAL_DOCUMENT,
  title: 'Title Deed Certificate',
  description: 'Official property title from Dubai Land Department',
  contentHash: 'sha256:abc123...', // Hash of the actual document
  source: {
    type: 'GOVERNMENT_REGISTRY',
    identifier: 'dubai-land-dept',
    name: 'Dubai Land Department',
    trusted: true,
    reputationScore: 100,
  },
});

// Verify the evidence
await sdk.evidence.verify(evidence.id, verifier.id, 'DOCUMENT_REVIEW');

// Submit asset for verification
await sdk.assets.transition(asset.id, 'PENDING_VERIFICATION', issuer.id);

// Verifier approves the asset
await sdk.assets.verify(asset.id, verifier.id);

console.log('Asset verified!');
```

### 6.4 Activate and Mint Tokens

```typescript
// Activate the asset (makes it tradeable)
await sdk.assets.activate(asset.id, issuer.id);

// Create an investor
const investor = sdk.parties_.create({
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  name: 'John Doe',
  jurisdiction: 'AE',
  wallets: [{ address: '0x1234...', chainId: 137 }],
});

// Set KYC verified
sdk.parties_.setKyc(investor.id, true, '2025-12-31');

// Mint tokens to the investor
await sdk.tokens.mint(
  asset.id,
  '0x1234...', // investor wallet
  '100000'     // token amount (e.g., 100,000 shares)
);

// Check balance
const balance = await sdk.tokens.getBalance(asset.id, '0x1234...');
console.log('Investor balance:', balance); // '100000'
```

### 6.5 Transfer Tokens (with Compliance)

```typescript
// Create another investor
const investor2 = sdk.parties_.create({
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  name: 'Jane Smith',
  jurisdiction: 'US',
  wallets: [{ address: '0x5678...', chainId: 137 }],
});

// Must be KYC verified for compliant assets
sdk.parties_.setKyc(investor2.id, true, '2025-12-31');

// Transfer tokens
const result = await sdk.tokens.transfer(
  asset.id,
  '0x1234...', // from
  '0x5678...', // to
  '25000'      // amount
);

if (result.success) {
  console.log('Transfer successful!');
} else {
  console.log('Transfer failed:', result.error);
  // e.g., "Transfer not compliant: Recipient KYC not verified"
}
```

---

## 7. API Reference

### 7.1 SDK Initialization

```typescript
interface SDKConfig {
  useMockPlugins?: boolean;  // Default: true
  chain?: {
    chainId: number;
    rpcUrl: string;
    privateKey?: string;
  };
}

const sdk = new TokenisationSDK(config?: SDKConfig);
```

### 7.2 Asset Manager (`sdk.assets`)

| Method | Description |
|--------|-------------|
| `create(params)` | Create a new asset in DRAFT state |
| `get(assetId)` | Retrieve asset by ID |
| `getAll()` | Get all assets |
| `update(assetId, updates)` | Update asset properties |
| `transition(assetId, toState, actorId)` | Change asset state |
| `verify(assetId, verifierId)` | Shortcut: transition to VERIFIED |
| `activate(assetId, actorId)` | Shortcut: transition to ACTIVE |
| `retire(assetId, actorId)` | Shortcut: transition to BURNED |
| `getByState(state)` | Get assets in a specific state |

#### Create Asset Parameters

```typescript
interface CreateAssetParams {
  name: string;
  description?: string;
  rightType: RightType;
  jurisdiction: {
    countryCode: string;           // ISO 2-letter code
    regulatoryFramework?: string;  // e.g., 'UAE_VARA', 'US_SEC'
    accreditedOnly?: boolean;
    blockedJurisdictions?: string[];
  };
  validityPeriod?: {
    startTime?: string;            // ISO 8601
    endTime?: string;
    durationSeconds?: number;
    isPerpetual?: boolean;
  };
  transferabilityRules?: {
    mode: TransferabilityMode;
    lockupPeriodSeconds?: number;
    maxHolders?: number;
    minimumHoldingAmount?: string;
    requireKyc?: boolean;
  };
  issuerId: string;
  typedMetadata?: object;          // Asset-specific data
}
```

### 7.3 Party Manager (`sdk.parties_`)

| Method | Description |
|--------|-------------|
| `create(params)` | Create a new party |
| `get(partyId)` | Retrieve party by ID |
| `getAll()` | Get all parties |
| `update(partyId, updates)` | Update party properties |
| `setKyc(partyId, verified, expiryDate?)` | Set KYC verification status |
| `freeze(partyId, reason)` | Freeze a party (block transactions) |
| `unfreeze(partyId)` | Unfreeze a party |

#### Party Types and Roles

```typescript
enum PartyType {
  INDIVIDUAL     // Natural person
  ORGANIZATION   // Company, DAO, etc.
}

enum PartyRole {
  ISSUER           // Creates and issues assets
  VERIFIER         // Verifies assets/evidence
  INVESTOR         // Holds tokens
  CUSTODIAN        // Holds assets on behalf of others
  ORACLE_PROVIDER  // Provides external data
  REGULATOR        // Regulatory oversight
}
```

### 7.4 Evidence Manager (`sdk.evidence`)

| Method | Description |
|--------|-------------|
| `create(params)` | Create evidence record |
| `get(evidenceId)` | Retrieve evidence by ID |
| `getForAsset(assetId)` | Get all evidence for an asset |
| `verify(evidenceId, verifierId, method)` | Mark evidence as verified |
| `reject(evidenceId, verifierId, reason)` | Reject evidence |

#### Evidence Types

```typescript
enum EvidenceType {
  LEGAL_DOCUMENT       // Deeds, contracts, legal filings
  ORACLE_ATTESTATION   // Data from oracles (prices, scores)
  PAYMENT_RECEIPT      // Proof of payment
  AUDIT_REPORT         // Third-party audit
  CERTIFICATION        // Professional certifications
  MEDIA                // Photos, videos (condition proof)
}
```

### 7.5 Token Manager (`sdk.tokens`)

| Method | Description |
|--------|-------------|
| `mint(assetId, to, amount)` | Mint new tokens |
| `transfer(assetId, from, to, amount)` | Transfer tokens (with compliance) |
| `burn(assetId, from, amount)` | Burn tokens |
| `getBalance(assetId, address)` | Get token balance |

### 7.6 Direct Service Access

```typescript
// Lifecycle Engine
sdk.engine.getState(assetId);
sdk.engine.getHistory(assetId);

// Compliance Service
sdk.compliance.evaluateTransfer({ from, to, asset, amount });
sdk.compliance.registerRuleset(ruleset);

// Oracle Service
sdk.oracle.fetchPrice(assetId);

// Event Store
sdk.events.getByAssetId(assetId);
sdk.events.subscribe(callback);
```

---

## 8. Reference Packs (Real-World Examples)

The SDK includes pre-built "packs" demonstrating complete tokenization flows:

### 8.1 UAE Real Estate (Pack A)

**Use Case:** Fractional ownership of Dubai property

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';
import { UAERealEstatePack } from '@tokenisation/sdk/packs';

const sdk = new TokenisationSDK();

const pack = new UAERealEstatePack(sdk, {
  name: 'Palm Jumeirah Villa',
  description: 'Beachfront villa with private pool',
  property: {
    type: 'RESIDENTIAL',
    address: {
      street: 'Frond N, Palm Jumeirah',
      city: 'Dubai',
      postalCode: '00000',
    },
    areaSqm: 500,
    deedNumber: 'DLD-2024-12345',
  },
  valuation: {
    amount: '15000000', // 15M AED
    date: '2024-01-15',
  },
  token: {
    totalSupply: '1000000',
    decimals: 18,
    symbol: 'PALM-001',
  },
  issuer: {
    name: 'Palm Properties Ltd',
    email: 'contact@palmproperties.ae',
  },
});

const result = await pack.execute();
console.log('Asset ID:', result.assetId);
// Asset goes through: DRAFT → PENDING → VERIFIED → ACTIVE
```

**Compliance Rules Applied:**
- KYC required for all transfers
- Max 500 investors
- Blocked jurisdictions: North Korea, Iran, Cuba, Syria
- UAE VARA regulatory framework

### 8.2 Behavior Score / Loyalty Points (Pack C)

**Use Case:** Soulbound driving score for insurance discounts

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';
import { BehaviorScorePack, createDrivingScore } from '@tokenisation/sdk/packs';

const sdk = new TokenisationSDK();

// Quick method
const assetId = await createDrivingScore(sdk, 'Ahmed Hassan', 750);

// Or detailed configuration
const pack = new BehaviorScorePack(sdk, {
  scoreType: 'DRIVING_SCORE',
  name: 'SafeDrive Score - Ahmed Hassan',
  description: 'Telematics-based driving behavior score',
  initialScore: 750,
  maxScore: 1000,
  decayRate: 0.01, // 1% decay per period
  dataSource: {
    name: 'Telematics Provider',
    type: 'IOT_DEVICE',
    identifier: 'telematics-v1',
  },
  issuer: {
    name: 'SafeDrive Insurance',
    jurisdiction: 'AE',
  },
  subject: {
    name: 'Ahmed Hassan',
    jurisdiction: 'AE',
  },
});

const result = await pack.execute();

// Update score based on new driving data
await pack.updateScore(820, result.issuerId, 'Good driving record this month');

// Calculate rewards
const reward = pack.calculateReward(820, [
  { minScore: 900, reward: '25% discount' },
  { minScore: 800, reward: '15% discount' },
  { minScore: 700, reward: '10% discount' },
]);
console.log('Reward:', reward); // '15% discount'
```

**Key Characteristics:**
- **Soulbound:** `TransferabilityMode.NON_TRANSFERABLE`
- **Perpetual:** No expiry date
- **Oracle-updated:** Score changes via oracle attestations

### 8.3 Event Tickets (Pack B)

**Use Case:** Concert tickets with resale restrictions

```typescript
const ticketAsset = await sdk.assets.create({
  name: 'Global Music Festival 2024 - VIP Pass',
  rightType: RightType.ACCESS,
  jurisdiction: {
    countryCode: 'AE',
  },
  validityPeriod: {
    startTime: '2024-12-01T18:00:00Z',
    endTime: '2024-12-01T23:59:59Z',
  },
  transferabilityRules: {
    mode: TransferabilityMode.COMPLIANCE_GATED,
    maxHolders: 5000, // Venue capacity
  },
  issuerId: issuer.id,
  typedMetadata: {
    assetType: 'TICKET',
    eventName: 'Global Music Festival 2024',
    venue: 'Dubai Arena',
    seatCategory: 'VIP',
    resaleCapPercent: 110, // Max 10% markup on resale
  },
});
```

### 8.4 Verification Credentials (Pack D)

**Use Case:** University degree certificates

```typescript
const degree = await sdk.assets.create({
  name: 'Bachelor of Computer Science - MIT',
  rightType: RightType.VERIFICATION,
  transferabilityRules: {
    mode: TransferabilityMode.NON_TRANSFERABLE, // Soulbound
  },
  issuerId: universityId,
  typedMetadata: {
    assetType: 'VERIFICATION',
    credentialType: 'EDUCATIONAL',
    issuingAuthority: 'Massachusetts Institute of Technology',
    graduationDate: '2024-05-15',
    fieldOfStudy: 'Computer Science',
    honors: 'Magna Cum Laude',
  },
});
```

### 8.5 Physical Assets (Pack E)

**Use Case:** Vehicle tokenization with IoT tracking

```typescript
const vehicle = await sdk.assets.create({
  name: 'Tesla Model S - VIN ABC123',
  rightType: RightType.OWNERSHIP,
  issuerId: dealerId,
  typedMetadata: {
    assetType: 'PHYSICAL',
    physicalAssetType: 'VEHICLE',
    manufacturer: 'Tesla',
    model: 'Model S',
    manufactureDate: '2024-01-10',
    serialNumber: 'VIN-ABC123',
    condition: 'NEW',
    currentLocation: {
      latitude: 25.2048,
      longitude: 55.2708,
    },
  },
});
```

---

## 9. Plugin System

The SDK uses a modular plugin architecture for extensibility.

### 9.1 Available Plugin Types

| Plugin Type | Purpose |
|-------------|---------|
| `IJurisdictionPlugin` | Legal rules per jurisdiction |
| `ICompliancePlugin` | KYC, transfer restrictions |
| `IOraclePlugin` | External data (prices, scores) |
| `IStoragePlugin` | Off-chain storage (IPFS) |
| `IChainPlugin` | Blockchain integration |

### 9.2 Registering Custom Plugins

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({ useMockPlugins: false });

// Register a custom jurisdiction plugin
sdk.plugins.register('jurisdiction', {
  id: 'us-sec',
  name: 'US SEC Compliance',
  getJurisdictionRules: (countryCode: string) => {
    if (countryCode === 'US') {
      return {
        countryCode: 'US',
        requiresAccreditedInvestor: true,
        maxRetailInvestors: 35,
        lockupPeriodDays: 365,
      };
    }
    return null;
  },
  isCountryBlocked: (countryCode: string) => {
    return ['KP', 'IR', 'CU', 'SY', 'RU'].includes(countryCode);
  },
});
```

### 9.3 Mock Plugins (Development)

The SDK includes mock implementations for rapid development:

```typescript
// Automatically registered when useMockPlugins: true
const sdk = new TokenisationSDK({ useMockPlugins: true });

// Mock plugins provide:
// - Simulated KYC verification
// - In-memory token balances
// - Simulated oracle data
// - Basic compliance rules
```

---

## 10. Compliance & KYC

### 10.1 Built-in Compliance Rules

```typescript
import { RuleConditionType } from '@tokenisation/sdk';

// Register a custom ruleset
sdk.compliance.registerRuleset({
  id: 'high-value-real-estate',
  name: 'High Value Real Estate Rules',
  appliesToAssetTypes: [RightType.OWNERSHIP],
  appliesToJurisdictions: ['AE', 'US', 'UK'],
  conditions: [
    {
      type: RuleConditionType.KYC_REQUIRED,
      enabled: true,
      severity: 'ERROR',
    },
    {
      type: RuleConditionType.ACCREDITED_INVESTOR,
      enabled: true,
      params: { minInvestmentUSD: 100000 },
      severity: 'ERROR',
    },
    {
      type: RuleConditionType.MAX_INVESTOR_COUNT,
      enabled: true,
      params: { maxCount: 100 },
      severity: 'ERROR',
    },
    {
      type: RuleConditionType.JURISDICTION_BLACKLIST,
      enabled: true,
      params: { jurisdictions: ['KP', 'IR', 'CU', 'SY'] },
      severity: 'ERROR',
    },
    {
      type: RuleConditionType.HOLDING_PERIOD,
      enabled: true,
      params: { minDays: 180 },
      severity: 'WARNING',
    },
  ],
  priority: 10,
  active: true,
});
```

### 10.2 KYC Management

```typescript
// Set KYC status for a party
sdk.parties_.setKyc(
  investorId,
  true,                    // verified
  '2025-12-31T23:59:59Z'   // expiry date
);

// Check KYC status
const party = sdk.parties_.get(investorId);
console.log('KYC Level:', party.verificationLevel);

// Freeze a party (blocks all transactions)
sdk.parties_.freeze(investorId, 'Suspicious activity detected');

// Unfreeze
sdk.parties_.unfreeze(investorId);
```

### 10.3 Transfer Compliance Checking

```typescript
// Compliance is automatically checked on transfers
const result = await sdk.tokens.transfer(assetId, from, to, amount);

if (!result.success) {
  console.log('Compliance violation:', result.error);
  // Possible errors:
  // - "Sender KYC not verified"
  // - "Recipient KYC expired"
  // - "Recipient jurisdiction blocked"
  // - "Maximum holder count exceeded"
  // - "Account frozen"
}
```

---

## 11. Best Practices

### 11.1 Asset Creation

```typescript
// DO: Use specific metadata schemas
const asset = await sdk.assets.create({
  name: 'Clear, descriptive name',
  rightType: RightType.OWNERSHIP,
  typedMetadata: {
    assetType: 'REAL_ESTATE',  // Use predefined types
    // ... specific fields
  },
});

// DON'T: Use generic metadata
const badAsset = await sdk.assets.create({
  name: 'Property',
  metadata: { stuff: 'random data' },  // Avoid this
});
```

### 11.2 Evidence Management

```typescript
// DO: Always add evidence before verification
const evidence = sdk.evidence.create({
  assetId: asset.id,
  type: EvidenceType.LEGAL_DOCUMENT,
  contentHash: computeHash(documentBuffer),  // Real hash
  source: {
    type: 'GOVERNMENT_REGISTRY',
    trusted: true,
    reputationScore: 100,
  },
});

// Verify evidence BEFORE submitting asset
await sdk.evidence.verify(evidence.id, verifierId, 'DOCUMENT_REVIEW');
await sdk.assets.transition(asset.id, 'PENDING_VERIFICATION', issuerId);
```

### 11.3 State Transitions

```typescript
// DO: Follow the correct flow
// DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE

// DON'T: Skip states
// DRAFT → ACTIVE (will fail)

// Handle errors
const result = await sdk.assets.transition(assetId, targetState, actorId);
if (!result.success) {
  console.error('Transition failed:', result.error);
}
```

### 11.4 Production Deployment

```typescript
// DO: Configure real chain connections
const sdk = new TokenisationSDK({
  useMockPlugins: false,
  chain: {
    chainId: 137,  // Polygon mainnet
    rpcUrl: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
  },
});

// DO: Register production plugins
sdk.plugins.register('storage', ipfsStoragePlugin);
sdk.plugins.register('oracle', chainlinkOraclePlugin);
```

---

## 12. Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Asset must be ACTIVE to mint tokens` | Minting before activation | Complete verification flow first |
| `Invalid state transition` | Skipping lifecycle states | Follow DRAFT → PENDING → VERIFIED → ACTIVE |
| `Party not found` | Invalid party ID | Ensure party was created before use |
| `Transfer not compliant` | KYC/compliance violation | Verify parties meet all requirements |
| `Evidence verification failed` | Invalid evidence data | Check content hash and source |

### Debugging

```typescript
// Enable event logging
sdk.events.subscribe((event) => {
  console.log('Event:', event.type, event.assetId, event.payload);
});

// Check asset history
const history = sdk.engine.getHistory(assetId);
console.log('State history:', history);

// Inspect compliance evaluation
const complianceResult = await sdk.compliance.evaluateTransfer({
  from: sender,
  to: receiver,
  asset: asset,
  amount: '1000',
});
console.log('Violations:', complianceResult.violations);
```

### Getting Help

- **Issues:** Report bugs at the project repository
- **Documentation:** Check inline TypeScript types for detailed parameter info
- **Examples:** Review reference packs in `sdk/src/packs/`

---

## Summary

The Tokenisation SDK provides a unified framework for tokenizing any real-world asset. Key takeaways:

1. **One Engine, Many Assets** - The same lifecycle flow works for real estate, loyalty points, tickets, and credentials
2. **Compliance Built-In** - KYC, jurisdiction rules, and transfer restrictions are configurable, not hardcoded
3. **Event Sourcing** - Every state change is recorded immutably for complete audit trails
4. **Plugin Architecture** - Swap jurisdictions, oracles, or blockchains without touching core logic
5. **Engine Owns Truth** - Blockchain is for settlement; business logic runs off-chain

Start with mock plugins for development, then configure real plugins for production deployment.
