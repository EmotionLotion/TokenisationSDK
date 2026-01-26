# AHOY Unified Tokenisation Platform
## MVP Showcase Documentation

**Version:** 1.0 MVP
**Date:** January 2026

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Architecture](#2-product-architecture)
3. [Tokenisation SDK - Complete Feature Guide](#3-tokenisation-sdk---complete-feature-guide)
4. [AHOY Platform - Unified Ecosystem](#4-ahoy-platform---unified-ecosystem)
5. [Technical Implementation](#5-technical-implementation)
6. [Use Cases & Examples](#6-use-cases--examples)
7. [API Reference](#7-api-reference)
8. [Demo Guide](#8-demo-guide)
9. [Roadmap to Production](#9-roadmap-to-production)

---

# 1. Executive Summary

## What We Built

**Two integrated products:**

| Product | Purpose | Target User |
|---------|---------|-------------|
| **Tokenisation SDK** | Developer toolkit for building tokenized asset apps | Developers, Enterprises |
| **AHOY Platform** | Unified ecosystem with cross-service loyalty token | End Users, Partners |

## The Problem We Solve

Traditional asset tokenization requires:
- 6-12 months development time
- $500k+ in compliance infrastructure
- Multiple vendor integrations (KYC, custody, blockchain)
- Legal expertise in securities law

**Our Solution:** A plug-and-play SDK that handles compliance, multi-chain deployment, and lifecycle management out of the box.

## Key Metrics

| Metric | Value |
|--------|-------|
| Time to first token | < 1 day |
| Lines of code to tokenize | ~50 |
| Supported chains | 6 (3 mainnet, 3 testnet) |
| Asset types supported | 4 (Ownership, Access, Behavior, Verification) |
| Compliance rules | Configurable per jurisdiction |

## One-Liner

> "The Stripe of Real-World Asset Tokenization"

---

# 2. Product Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              END USERS                                      │
│                    (Investors, Token Holders, Partners)                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AHOY PLATFORM (UI)                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │   Wallet    │ │    Chain    │ │    Asset    │ │   Token     │           │
│  │   Connect   │ │   Selector  │ │   Wizard    │ │   Manager   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  React + TypeScript + Tailwind + wagmi/viem                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TOKENISATION SDK                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         CORE ENGINE                                   │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐        │  │
│  │  │ Lifecycle  │ │  Policy    │ │   Event    │ │  Indexing  │        │  │
│  │  │  Engine    │ │ Evaluator  │ │   Store    │ │  Service   │        │  │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         PLUGIN SYSTEM                                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │  │
│  │  │Compliance│ │Jurisdict.│ │  Oracle  │ │ Storage  │ │  Chain   │   │  │
│  │  │  Plugin  │ │  Plugin  │ │  Plugin  │ │  Plugin  │ │  Plugin  │   │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        TOKEN ADAPTERS                                 │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │  │
│  │  │  ERC20   │ │  ERC721  │ │ ERC1155  │ │   SBT    │                │  │
│  │  │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │                │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BLOCKCHAIN LAYER                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │    Base     │ │   Polygon   │ │  Ethereum   │ │  Chainlink  │           │
│  │     L2      │ │     PoS     │ │   Mainnet   │ │   Oracles   │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Tailwind CSS, Framer Motion |
| Wallet | wagmi v2, viem, WalletConnect, MetaMask |
| SDK | TypeScript, Zod validation, ethers.js |
| Blockchain | EVM (Base, Polygon, Ethereum) |
| Oracles | Chainlink Data Feeds, CCIP |
| Auth | SIWE (Sign-In With Ethereum) |
| Storage | Browser (MVP), PostgreSQL (Production) |

---

# 3. Tokenisation SDK - Complete Feature Guide

## 3.1 Installation & Setup

```bash
npm install @tokenisation/sdk
```

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({
  useMockPlugins: true, // Use mock plugins for development
});
```

## 3.2 Core Concepts

### Right Types

The SDK supports four fundamental types of tokenizable rights:

| Right Type | Description | Token Standard | Examples |
|------------|-------------|----------------|----------|
| **OWNERSHIP** | Title to property or assets | ERC20/ERC721 | Real estate, IP, art, collectibles |
| **ACCESS** | Permission to use services | ERC721/ERC1155 | Event tickets, memberships, credentials |
| **BEHAVIOR** | Reputation and performance | ERC20 (fungible) | Loyalty points, credit scores, driver ratings |
| **VERIFICATION** | Proof of attributes | ERC721 (unique) | Carbon credits, certificates, degrees |

### Lifecycle States

Every asset follows a strict state machine:

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
┌─────────┐    ┌─────────────────┐    ┌──────────┐    ┌───────┴──┐
│  DRAFT  │───▶│PENDING_VERIFY   │───▶│ VERIFIED │───▶│  ACTIVE  │
└─────────┘    └─────────────────┘    └──────────┘    └──────────┘
                                                           │
                    ┌──────────────────────────────────────┼──────────────────┐
                    │                                      │                  │
                    ▼                                      ▼                  ▼
              ┌───────────┐                          ┌──────────┐      ┌──────────┐
              │ SUSPENDED │◀─────────────────────────│ REDEEMED │      │  EXPIRED │
              └───────────┘                          └──────────┘      └──────────┘
                    │                                      │                  │
                    │                                      ▼                  ▼
                    │                                ┌──────────┐      ┌──────────┐
                    └───────────────────────────────▶│  BURNED  │◀─────│  BURNED  │
                                                     └──────────┘      └──────────┘
```

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| DRAFT | Initial creation | Edit, Submit for verification |
| PENDING_VERIFICATION | Awaiting review | Approve, Reject |
| VERIFIED | Approved by verifier | Activate |
| ACTIVE | Live and tradeable | Mint, Transfer, Suspend, Redeem |
| SUSPENDED | Temporarily frozen | Reactivate, Burn |
| REDEEMED | Exercised by holder | Burn |
| EXPIRED | Past validity date | Burn |
| BURNED | Permanently destroyed | None (terminal) |

### Transfer Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `UNRESTRICTED` | Anyone can receive | Public tokens, carbon credits |
| `WHITELIST_ONLY` | Pre-approved addresses only | Private placements, loyalty points |
| `NON_TRANSFERABLE` | Cannot be transferred (soulbound) | Credentials, certifications |
| `COMPLIANCE_GATED` | Requires KYC/compliance checks | Securities, real estate |

## 3.3 Party Management

### Creating Parties

```typescript
import { PartyType, PartyRole } from '@tokenisation/sdk';

// Create an organization (issuer)
const issuer = sdk.parties_.create({
  name: 'Dubai Properties LLC',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
  jurisdiction: 'AE', // ISO country code
  email: 'admin@dubaiproperties.ae',
  legalEntityId: 'LEI-123456',
  metadata: {
    companyRegistration: 'DED-123456',
    vatNumber: 'VAT-AE-789',
  },
});

// Create an individual (investor)
const investor = sdk.parties_.create({
  name: 'Ahmed Al Maktoum',
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  jurisdiction: 'AE',
  email: 'ahmed@example.com',
});
```

### Party Types

| Type | Description |
|------|-------------|
| `INDIVIDUAL` | Natural person |
| `ORGANIZATION` | Company, LLC, Corp |
| `DAO` | Decentralized autonomous organization |
| `TRUST` | Legal trust structure |
| `FUND` | Investment fund |

### Party Roles

| Role | Permissions |
|------|-------------|
| `ISSUER` | Create assets, mint tokens |
| `INVESTOR` | Hold and transfer tokens |
| `VERIFIER` | Approve assets and evidence |
| `CUSTODIAN` | Hold assets on behalf of others |
| `REGULATOR` | Freeze/unfreeze, compliance oversight |
| `TRANSFER_AGENT` | Manage cap table, corporate actions |
| `ORACLE_PROVIDER` | Submit external data |
| `OPERATOR` | Platform administration |

### KYC Verification

```typescript
// Mark party as KYC verified
sdk.parties_.setKyc(investor.id, true, '2025-12-31'); // Optional expiry date

// Check verification status
const party = sdk.parties_.get(investor.id);
console.log(party.verificationLevel); // 'STANDARD'
```

### Freeze/Unfreeze

```typescript
// Freeze a party (blocks all transfers)
sdk.parties_.freeze(partyId, 'Suspicious activity detected');

// Unfreeze
sdk.parties_.unfreeze(partyId);
```

## 3.4 Asset Management

### Creating Assets

```typescript
import { RightType, TransferabilityMode } from '@tokenisation/sdk';

const asset = await sdk.assets.create({
  // Basic info
  name: 'Dubai Marina Tower - Unit 1501',
  description: 'Luxury 2-bedroom apartment with marina view',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,

  // Jurisdiction & compliance
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'UAE_VARA',
    accreditedOnly: false,
    blockedJurisdictions: ['KP', 'IR', 'SY'], // Sanctioned countries
  },

  // Validity period
  validityPeriod: {
    isPerpetual: true,
    startTime: new Date().toISOString(),
    // endTime: '2030-12-31T23:59:59Z', // For expiring assets
  },

  // Transfer rules
  transferabilityRules: {
    mode: TransferabilityMode.COMPLIANCE_GATED,
    lockupPeriodSeconds: 0,
    maxHolders: 100,
    requireKyc: true,
  },

  // Custom metadata
  metadata: {
    propertyType: 'RESIDENTIAL',
    address: {
      building: 'Marina Tower',
      unit: '1501',
      city: 'Dubai',
      country: 'AE',
    },
    area: { value: 1850, unit: 'SQFT' },
    valuationUSD: '2500000',
  },
});
```

### Asset Lifecycle Operations

```typescript
// Submit for verification
await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);

// Verify (by authorized verifier)
await sdk.assets.verify(asset.id, verifier.id);

// Activate for trading
await sdk.assets.activate(asset.id, issuer.id);

// Suspend (emergency freeze)
await sdk.assets.transition(asset.id, LifecycleState.SUSPENDED, admin.id);

// Retire/redeem
await sdk.assets.retire(asset.id, issuer.id);
```

### Query Assets

```typescript
// Get single asset
const asset = await sdk.assets.get(assetId);

// Get all assets
const allAssets = sdk.assets.getAll();

// Get by state
const activeAssets = sdk.assets.getByState(LifecycleState.ACTIVE);
```

## 3.5 Token Operations

### Minting

```typescript
// Mint tokens to an investor
const result = await sdk.tokens.mint(
  asset.id,      // Asset ID
  investor.id,   // Recipient party ID
  '1000'         // Amount (as string for precision)
);

if (result.success) {
  console.log('Minted successfully');
} else {
  console.error('Mint failed:', result.error);
}
```

### Transfers

```typescript
// Transfer between parties
const result = await sdk.tokens.transfer(
  asset.id,      // Asset ID
  from.id,       // Sender party ID
  to.id,         // Recipient party ID
  '100'          // Amount
);

// Transfer includes automatic compliance checks:
// - KYC verification for both parties
// - Jurisdiction restrictions
// - Lockup period enforcement
// - Max holder limits
```

### Burning

```typescript
// Burn tokens (redemption, retirement)
await sdk.tokens.burn(asset.id, holder.id, '500');
```

### Balance Queries

```typescript
// Get balance for a party
const balance = await sdk.tokens.getBalance(asset.id, investor.id);
console.log(`Balance: ${balance} tokens`);
```

## 3.6 Evidence Management

Evidence provides off-chain proof for tokenized assets.

```typescript
import { EvidenceType } from '@tokenisation/sdk';

// Create evidence
const evidence = sdk.evidence.create({
  assetId: asset.id,
  type: EvidenceType.TITLE_DEED,
  name: 'Property Title Deed',
  description: 'Official title deed from Dubai Land Department',
  contentHash: 'QmX...', // IPFS hash
  issuer: 'Dubai Land Department',
  issuedAt: '2024-01-15T00:00:00Z',
  metadata: {
    deedNumber: 'DEED-DM-2024-1501',
    registryId: 'DLD-REG-12345',
  },
});

// Verify evidence
await sdk.evidence.verify(evidence.id, verifier.id, 'MANUAL_REVIEW');

// Get evidence for asset
const assetEvidence = sdk.evidence.getForAsset(asset.id);
```

### Evidence Types

| Type | Description |
|------|-------------|
| `TITLE_DEED` | Property ownership document |
| `VALUATION_REPORT` | Professional appraisal |
| `LEGAL_OPINION` | Attorney certification |
| `AUDIT_REPORT` | Financial audit |
| `CERTIFICATE` | General certification |
| `IDENTITY_DOCUMENT` | KYC documentation |
| `CONTRACT` | Legal agreement |
| `OTHER` | Custom evidence type |

## 3.7 Compliance Service

### Evaluating Transfers

```typescript
const result = await sdk.compliance.evaluateTransfer({
  from: fromParty,
  to: toParty,
  asset: asset,
  amount: '100',
});

if (result.allowed) {
  // Proceed with transfer
} else {
  console.log('Transfer blocked:', result.violations);
  // [{ ruleId: 'KYC_REQUIRED', message: 'Recipient not KYC verified' }]
}
```

### Compliance Rules

| Rule | Description |
|------|-------------|
| KYC Verification | Parties must be KYC verified |
| Accredited Investor | Some assets require accreditation |
| Jurisdiction Check | Block sanctioned countries |
| Lockup Period | Enforce holding periods |
| Max Holders | Limit number of token holders |
| Transfer Whitelist | Restrict to approved addresses |

## 3.8 Plugin System

### Available Plugins

| Plugin | Purpose | Interface |
|--------|---------|-----------|
| Compliance | KYC, accreditation, transfer rules | `ICompliancePlugin` |
| Jurisdiction | Legal wrapper, regulatory compliance | `IJurisdictionPlugin` |
| Oracle | External data (prices, NAV) | `IOraclePlugin` |
| Storage | Off-chain data storage | `IStoragePlugin` |
| Chain | Blockchain adapter | `IChainPlugin` |
| Token | Token standard adapter | `ITokenAdapter` |

### Registering Plugins

```typescript
import { EVMChainPlugin, DataFeedPlugin } from '@tokenisation/sdk';

// Register a chain plugin
const chainPlugin = new EVMChainPlugin({
  chainId: 8453, // Base
  rpcUrl: 'https://mainnet.base.org',
});
sdk.plugins.register('chain', chainPlugin);

// Register an oracle plugin
const oraclePlugin = new DataFeedPlugin({
  chainId: 8453,
  provider: chainPlugin.provider,
});
sdk.plugins.register('oracle', oraclePlugin);
```

## 3.9 Event Store & Audit Trail

```typescript
// Get all events
const events = await sdk.events.getAll();

// Get events for specific asset
const assetEvents = await sdk.events.getByAssetId(asset.id);

// Query events
const recentEvents = await sdk.events.query({
  types: ['STATE_CHANGED', 'TOKEN_MINTED'],
  fromTimestamp: '2024-01-01T00:00:00Z',
  limit: 100,
});
```

### Event Types

| Event | Trigger |
|-------|---------|
| `ASSET_CREATED` | New asset created |
| `STATE_CHANGED` | Lifecycle transition |
| `TOKEN_MINTED` | Tokens minted |
| `TOKEN_TRANSFERRED` | Tokens transferred |
| `TOKEN_BURNED` | Tokens burned |
| `EVIDENCE_ADDED` | Evidence attached |
| `EVIDENCE_VERIFIED` | Evidence verified |
| `PARTY_CREATED` | New party registered |
| `KYC_UPDATED` | KYC status changed |

---

# 4. AHOY Platform - Unified Ecosystem

## 4.1 Overview

AHOY is a unified tokenisation platform that connects multiple ecosystem services through a single loyalty token. Users earn points across different services and can spend them anywhere in the ecosystem.

## 4.2 Ecosystem Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AHOY ECOSYSTEM                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐│
│   │  COMET   │   │ FLYPLUS  │   │   H2O    │   │   AMS    │   │  NEXUS   ││
│   │ Logistics│   │ Aviation │   │ Utilities│   │   Data   │   │  Agents  ││
│   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘│
│        │              │              │              │              │       │
│        └──────────────┴──────────────┼──────────────┴──────────────┘       │
│                                      │                                      │
│                                      ▼                                      │
│                          ┌──────────────────────┐                          │
│                          │     AHOY TOKEN       │                          │
│                          │  Unified Loyalty     │                          │
│                          └──────────────────────┘                          │
│                                      │                                      │
│                          ┌──────────────────────┐                          │
│                          │      CONNECT         │                          │
│                          │   Social Layer       │                          │
│                          └──────────────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Service Details

| Service | Description | Earn Actions | Burn Actions |
|---------|-------------|--------------|--------------|
| **COMET** | Last-mile logistics & delivery | Deliveries completed, safety scores, perfect weeks | Priority routing, equipment upgrades |
| **FlyPlus** | Aviation rewards & travel | Flight bookings, lounge visits, referrals | Flight upgrades, lounge access, priority boarding |
| **H2O** | Water & utility management | Water savings, carbon offsets, smart meter data | Utility discounts, green credits |
| **AMS** | Data marketplace | Data contributions, algorithm publishing, ML training | Data access, premium datasets |
| **Nexus** | AI agent network | Agent task completion, compute provision | Agent hiring, premium agents |
| **Connect** | Social & referral layer | Referrals, engagement, reputation building | Premium features, verified badges |

## 4.3 AHOY Token Economics

### Token Characteristics

| Property | Value |
|----------|-------|
| Type | BEHAVIOR (Loyalty/Reputation) |
| Transferability | WHITELIST_ONLY |
| Token Standard | ERC20 (fungible) |
| Decimals | 0 (whole points) |

### Tier System

| Tier | Points Required | Benefits |
|------|-----------------|----------|
| BRONZE | 0 | Basic earn rates |
| SILVER | 5,000 | 1.1x earn multiplier |
| GOLD | 15,000 | 1.25x earn multiplier, priority support |
| PLATINUM | 50,000 | 1.5x earn multiplier, exclusive access |
| DIAMOND | 100,000 | 2x earn multiplier, concierge service |

### Earn Rates (Base)

| Action | Points |
|--------|--------|
| Delivery completed (COMET) | 10 |
| Perfect delivery week | 100 |
| Safety score 95%+ | 50 |
| Flight booking (FlyPlus) | 50 |
| Lounge check-in | 25 |
| Referral signup | 200 |
| Data contribution (AMS) | 30 |
| Agent task (Nexus) | 40 |

### Burn Rates

| Redemption | Cost |
|------------|------|
| Priority queue | 200 |
| Flight discount | 500 |
| Lounge access | 1,000 |
| Data unlock | 1,000 |
| Agent hire | 300 |

## 4.4 Platform UI Features

### Wallet Integration

- **Supported Wallets:** MetaMask, WalletConnect, Coinbase Wallet
- **Networks:** Base, Polygon, Ethereum (+ testnets)
- **Authentication:** SIWE (Sign-In With Ethereum)

### Dashboard Features

| Feature | Description |
|---------|-------------|
| Asset Overview | View all tokenized assets |
| Token Balances | See holdings across assets |
| Transaction History | Audit trail of all actions |
| Identity Management | KYC status, wallet linking |
| Compliance Status | Verification levels, accreditation |

### Asset Wizard

Step-by-step asset creation:

1. **Basic Info** - Name, description, type
2. **Jurisdiction** - Country, regulatory framework
3. **Validity** - Perpetual or time-bound
4. **Transfer Rules** - Mode, restrictions, limits
5. **Metadata** - Custom fields
6. **Evidence** - Supporting documents
7. **Review & Create**

## 4.5 Pre-built React Components (Stripe Elements Style)

The SDK includes drop-in React components for rapid UI development, similar to Stripe Elements.

### Available Components

| Component | Description | Use Case |
|-----------|-------------|----------|
| `TokenizeButton` | One-click button to open tokenization wizard | Landing pages, dashboards |
| `AssetWizard` | Multi-step asset creation flow | Create new tokenized assets |
| `AssetCard` | Display asset information | Asset listings, portfolios |
| `TransferForm` | Pre-built transfer form | Send tokens between parties |
| `BalanceDisplay` | Token balance with USD value | Wallets, portfolios |
| `LifecycleStatus` | Asset state indicator | Asset cards, lists |
| `KYCBadge` | KYC verification status | User profiles, compliance |
| `PartyBadge` | Party info with avatar | User lists, transactions |

### Quick Example

```tsx
import {
  TokenizeButton,
  AssetCard,
  BalanceDisplay,
  TransferForm,
  defaultTheme,
} from '@tokenisation/sdk';

function Dashboard({ sdk, issuer, assets }) {
  return (
    <div>
      {/* One-click tokenization */}
      <TokenizeButton
        sdk={sdk}
        issuerId={issuer.id}
        onSuccess={(asset) => console.log('Created:', asset)}
        buttonText="Tokenize New Asset"
        variant="primary"
        size="lg"
      />

      {/* Asset grid */}
      <div className="grid">
        {assets.map(asset => (
          <AssetCard
            key={asset.id}
            asset={asset}
            showMetadata
            onAction={(action) => handleAction(asset.id, action)}
          />
        ))}
      </div>

      {/* Balance display */}
      <BalanceDisplay
        balance="1000000"
        symbol="PROP"
        decimals={18}
        usdValue="250000"
        showChange
        changePercent={2.5}
      />
    </div>
  );
}
```

### Theming Support

All components support custom theming:

```tsx
const darkTheme = {
  colors: {
    primary: '#00D4FF',
    secondary: '#7B61FF',
    background: '#0A0A0A',
    surface: '#1A1A1A',
    text: '#FFFFFF',
    // ... more
  },
  fonts: {
    family: 'Inter, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  borderRadius: { sm: '4px', md: '8px', lg: '12px' },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px' },
};

<TokenizeButton theme={darkTheme} ... />
```

### Component Details

#### TokenizeButton
```tsx
<TokenizeButton
  sdk={sdk}                           // SDK instance
  issuerId={string}                   // Issuer party ID
  onSuccess={(asset) => void}         // Success callback
  onError={(error) => void}           // Error callback
  buttonText="Tokenize Asset"         // Button text
  variant="primary"|"secondary"|"outline"
  size="sm"|"md"|"lg"
  disabled={boolean}
  theme={TokenisationTheme}
/>
```

#### AssetWizard
```tsx
<AssetWizard
  sdk={sdk}
  issuerId={string}
  onSuccess={(asset) => void}
  onError={(error) => void}
  onClose={() => void}
  defaultRightType={RightType}        // Pre-select asset type
  theme={TokenisationTheme}
/>
```

Steps: Type → Details → Jurisdiction → Rules → Review → Create

#### TransferForm
```tsx
<TransferForm
  assetId={string}
  assetName="Dubai Marina Unit"
  fromPartyId={string}
  parties={Party[]}                   // Available recipients
  balance="1000"                      // Sender balance
  symbol="PROP"
  onTransfer={async (to, amount) => {
    // Execute transfer
    return { success: boolean, error?: string };
  }}
  theme={TokenisationTheme}
/>
```

---

# 5. Technical Implementation

## 5.1 SDK Architecture

### Core Components

```typescript
class TokenisationSDK {
  // Core engine
  private lifecycleEngine: LifecycleEngine;    // State machine
  private policyEvaluator: PolicyEvaluator;    // Compliance rules
  private eventStore: EventStore;              // Audit trail
  private pluginRegistry: PluginRegistry;      // Plugin management

  // Services
  private complianceService: ComplianceService;
  private verificationService: VerificationService;
  private oracleService: OracleService;
  private indexingService: IndexingService;

  // Public interfaces
  public readonly assets: AssetManager;
  public readonly parties_: PartyManager;
  public readonly evidence: EvidenceManager;
  public readonly tokens: TokenManager;
}
```

### Lifecycle Engine

The lifecycle engine is a **finite state machine** that:
- Validates state transitions
- Executes transition guards (plugin hooks)
- Records events for audit trail
- Rebuilds state from event history

```typescript
// Valid transitions
const VALID_TRANSITIONS = {
  DRAFT: ['PENDING_VERIFICATION'],
  PENDING_VERIFICATION: ['VERIFIED', 'DRAFT'],
  VERIFIED: ['ACTIVE', 'DRAFT'],
  ACTIVE: ['SUSPENDED', 'REDEEMED', 'EXPIRED'],
  SUSPENDED: ['ACTIVE', 'BURNED'],
  REDEEMED: ['BURNED'],
  EXPIRED: ['BURNED'],
  BURNED: [], // Terminal state
};
```

### Plugin Interface Pattern

All plugins follow a consistent interface pattern:

```typescript
interface ICompliancePlugin {
  readonly pluginId: string;

  evaluateTransfer(context, fromStatus, toStatus): Promise<ComplianceCheckResult>;
  canHoldAsset(partyId, asset, status): Promise<ComplianceCheckResult>;
  checkPolicy(ruleId, context): Promise<ComplianceCheckResult>;
  getPartyStatus(partyId): Promise<PartyComplianceStatus | null>;
  freezeParty(partyId, until?, reason?): Promise<Result<void, string>>;
}
```

## 5.2 Multi-Chain Support

### Supported Networks

| Network | Chain ID | Type | Use Case |
|---------|----------|------|----------|
| Base | 8453 | Mainnet | Primary L2, low fees |
| Polygon | 137 | Mainnet | High throughput |
| Ethereum | 1 | Mainnet | High-value settlements |
| Base Sepolia | 84532 | Testnet | Development |
| Polygon Amoy | 80002 | Testnet | Development |
| Sepolia | 11155111 | Testnet | Development |

### Chain Plugin

```typescript
const chainPlugin = new EVMChainPlugin({
  chainId: 8453,
  rpcUrl: 'https://mainnet.base.org',
  privateKey: process.env.PRIVATE_KEY, // For server-side signing
});

// Connect
await chainPlugin.connect();

// Send transaction
const receipt = await chainPlugin.sendTransaction({
  to: contractAddress,
  data: encodedFunctionCall,
  value: '0',
});

// Wait for confirmation
await chainPlugin.waitForTransaction(receipt.transactionHash, 2);
```

## 5.3 Chainlink Integration

### Data Feeds (Price Oracles)

```typescript
const oraclePlugin = new DataFeedPlugin({
  chainId: 8453,
  provider: provider,
});

// Get ETH/USD price
const ethPrice = await oraclePlugin.getPrice('ETH', 'USD');
// { price: '2500.00', decimals: 8, timestamp: '2024-...' }

// Get asset NAV
const nav = await oraclePlugin.getNAV(assetId);
```

### CCIP (Cross-Chain)

```typescript
const bridgePlugin = new CCIPBridgePlugin({
  sourceChainId: 8453,    // Base
  provider: provider,
});

// Bridge tokens to Polygon
await bridgePlugin.bridgeTokens({
  tokenAddress: '0x...',
  amount: '1000',
  destinationChainId: 137,  // Polygon
  recipient: '0x...',
});
```

## 5.4 Authentication (SIWE)

### Flow

```
1. User connects wallet (wagmi)
2. Frontend requests nonce from server
3. User signs SIWE message with wallet
4. Server verifies signature
5. Server issues JWT token
6. JWT used for all API calls
```

### SIWE Message Format

```
ahoy.io wants you to sign in with your Ethereum account:
0x1234567890123456789012345678901234567890

Sign in to AHOY Platform

URI: https://ahoy.io
Version: 1
Chain ID: 8453
Nonce: abc123xyz
Issued At: 2024-01-15T12:00:00.000Z
Expiration Time: 2024-01-15T13:00:00.000Z
```

---

# 6. Use Cases & Examples

## 6.1 Real Estate Tokenization

**Scenario:** Tokenize a $2.5M Dubai property into 1000 tradeable shares.

```typescript
// 1. Create issuer
const issuer = sdk.parties_.create({
  name: 'Dubai Properties LLC',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'AE',
});
sdk.parties_.setKyc(issuer.id, true);

// 2. Create property asset
const property = await sdk.assets.create({
  name: 'Dubai Marina Tower - Unit 1501',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'AE', regulatoryFramework: 'UAE_VARA' },
  transferabilityRules: {
    mode: TransferabilityMode.COMPLIANCE_GATED,
    maxHolders: 100,
    requireKyc: true,
  },
  metadata: {
    valuationUSD: '2500000',
    propertyType: 'RESIDENTIAL',
  },
});

// 3. Verify and activate
await sdk.assets.verify(property.id, issuer.id);
await sdk.assets.activate(property.id, issuer.id);

// 4. Mint tokens to investors
await sdk.tokens.mint(property.id, investor1.id, '600'); // 60%
await sdk.tokens.mint(property.id, investor2.id, '400'); // 40%

// 5. Secondary market transfer
await sdk.tokens.transfer(property.id, investor1.id, investor2.id, '100');
```

## 6.2 Carbon Credits

**Scenario:** Tokenize 10,000 tonnes of verified carbon offset.

```typescript
const carbonCredits = await sdk.assets.create({
  name: 'Amazon Reforestation Credits 2024',
  rightType: RightType.VERIFICATION,
  issuerId: greenOrg.id,
  jurisdiction: { countryCode: 'BR', regulatoryFramework: 'VERRA_VCS' },
  validityPeriod: {
    isPerpetual: false,
    startTime: new Date().toISOString(),
    endTime: '2025-12-31T23:59:59Z',
  },
  transferabilityRules: {
    mode: TransferabilityMode.UNRESTRICTED,
  },
  metadata: {
    certificateType: 'CARBON_CREDIT',
    carbonTonnes: 10000,
    vintageYear: 2024,
    verificationBody: 'VERRA',
  },
});

// Mint to corporate buyer
await sdk.tokens.mint(carbonCredits.id, techCorp.id, '5000');

// Retire credits (burn for offset claim)
await sdk.tokens.burn(carbonCredits.id, techCorp.id, '1000');
```

## 6.3 Event Tickets (NFT)

**Scenario:** Tokenize 10,000 concert tickets with anti-scalping rules.

```typescript
const concert = await sdk.assets.create({
  name: 'Taylor Swift Eras Tour - Dubai 2024',
  rightType: RightType.ACCESS,
  issuerId: eventOrg.id,
  jurisdiction: { countryCode: 'AE' },
  validityPeriod: {
    isPerpetual: false,
    startTime: '2024-06-01T00:00:00Z',
    endTime: '2024-06-02T23:59:59Z', // Event date
  },
  transferabilityRules: {
    mode: TransferabilityMode.COMPLIANCE_GATED,
    maxResalePrice: '500', // Anti-scalping: max $500 resale
    transferWindowEnd: '2024-06-01T12:00:00Z', // No transfers after this
  },
  metadata: {
    assetType: 'TICKET',
    venue: 'Dubai Arena',
    eventDate: '2024-06-01T20:00:00Z',
  },
});
```

## 6.4 Loyalty Points (AHOY)

**Scenario:** Unified loyalty program across multiple services.

```typescript
const ahoyToken = await sdk.assets.create({
  name: 'AHOY Points',
  rightType: RightType.BEHAVIOR,
  issuerId: platform.id,
  jurisdiction: { countryCode: 'AE' },
  validityPeriod: { isPerpetual: true },
  transferabilityRules: {
    mode: TransferabilityMode.WHITELIST_ONLY, // Prevent black market
    requireKyc: true,
  },
  metadata: {
    scoreType: 'LOYALTY_POINTS',
    tokenSymbol: 'AHOY',
    tierThresholds: {
      BRONZE: 0,
      SILVER: 5000,
      GOLD: 15000,
    },
  },
});

// User earns points from COMET delivery
await sdk.tokens.mint(ahoyToken.id, user.id, '100');

// User redeems for FlyPlus lounge access
await sdk.tokens.burn(ahoyToken.id, user.id, '1000');
```

---

# 7. API Reference

## 7.1 SDK Initialization

```typescript
const sdk = new TokenisationSDK(config?: SDKConfig);

interface SDKConfig {
  useMockPlugins?: boolean;  // Default: true
  eventStore?: IEventStore;  // Custom event store
  chain?: {
    chainId: number;
    rpcUrl: string;
    privateKey?: string;
  };
}
```

## 7.2 Party Manager

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create` | `CreatePartyParams` | `Party` | Create new party |
| `get` | `partyId: string` | `Party \| undefined` | Get party by ID |
| `getAll` | - | `Party[]` | Get all parties |
| `update` | `partyId, updates` | `Result<Party>` | Update party |
| `setKyc` | `partyId, verified, expiry?` | `Result<Party>` | Set KYC status |
| `freeze` | `partyId, reason` | `Result<Party>` | Freeze party |
| `unfreeze` | `partyId` | `Result<Party>` | Unfreeze party |

## 7.3 Asset Manager

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create` | `CreateAssetParams` | `Promise<Asset>` | Create new asset |
| `get` | `assetId: string` | `Promise<Asset \| null>` | Get asset by ID |
| `getAll` | - | `Asset[]` | Get all assets |
| `update` | `assetId, updates` | `Promise<Result<Asset>>` | Update asset |
| `transition` | `assetId, toState, actorId` | `Promise<Result<Asset>>` | Change state |
| `verify` | `assetId, verifierId` | `Promise<Result<Asset>>` | Verify asset |
| `activate` | `assetId, actorId` | `Promise<Result<Asset>>` | Activate asset |
| `retire` | `assetId, actorId` | `Promise<Result<Asset>>` | Retire asset |
| `getByState` | `state: LifecycleState` | `Asset[]` | Get by state |

## 7.4 Token Manager

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `mint` | `assetId, to, amount` | `Promise<Result<void>>` | Mint tokens |
| `transfer` | `assetId, from, to, amount` | `Promise<Result<void>>` | Transfer tokens |
| `burn` | `assetId, from, amount` | `Promise<Result<void>>` | Burn tokens |
| `getBalance` | `assetId, address` | `Promise<string>` | Get balance |

## 7.5 Evidence Manager

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `create` | `CreateEvidenceParams` | `Evidence` | Create evidence |
| `get` | `evidenceId` | `Evidence \| undefined` | Get by ID |
| `getForAsset` | `assetId` | `Evidence[]` | Get for asset |
| `verify` | `evidenceId, verifierId, method` | `Promise<Result<Evidence>>` | Verify |
| `reject` | `evidenceId, verifierId, reason` | `Result<Evidence>` | Reject |

## 7.6 Event Store

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `getAll` | - | `Promise<BaseEvent[]>` | Get all events |
| `getByAssetId` | `assetId` | `Promise<BaseEvent[]>` | Get by asset |
| `query` | `EventQueryOptions` | `Promise<BaseEvent[]>` | Query events |
| `count` | - | `Promise<number>` | Count events |

---

# 8. Demo Guide

## 8.1 Running the Demos

```bash
# Navigate to demo directory
cd examples/real-estate-demo

# Install dependencies
npm install

# Run demos
npm run demo           # Real estate tokenization
npm run demo:carbon    # Carbon credits
npm run demo:loyalty   # AHOY loyalty points
```

## 8.2 Running the Platform UI

```bash
# Navigate to UI directory
cd ui

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

## 8.3 Demo Script: Real Estate

**Duration:** 5 minutes

1. **Initialize SDK** (30s)
   - Show SDK import
   - Explain mock plugins

2. **Create Parties** (1m)
   - Create issuer (organization)
   - Create 2 investors
   - KYC verification

3. **Tokenize Property** (1m)
   - Show asset creation with metadata
   - Explain jurisdiction and compliance rules
   - Show transfer restrictions

4. **Lifecycle Management** (1m)
   - Draft → Pending → Verified → Active
   - Explain state machine

5. **Token Operations** (1m)
   - Mint to investors
   - Transfer between investors
   - Show balance updates

6. **Audit Trail** (30s)
   - Show event history
   - Explain compliance logging

## 8.4 Demo Script: AHOY Platform

**Duration:** 5 minutes

1. **Connect Wallet** (30s)
   - Click "Connect Wallet"
   - Select MetaMask
   - Approve connection

2. **Sign In** (30s)
   - Click connected address
   - Click "Sign In with Ethereum"
   - Sign SIWE message

3. **Switch Networks** (30s)
   - Open chain selector
   - Switch to Polygon
   - Show network change

4. **View Dashboard** (1m)
   - Show asset overview
   - Show token balances
   - Explain AHOY ecosystem

5. **Create Asset** (2m)
   - Open asset wizard
   - Walk through steps
   - Submit for verification

---

# 9. Roadmap to Production

## 9.1 Current State (MVP)

| Component | Status |
|-----------|--------|
| SDK Core Engine | ✅ Production-ready |
| Party Management | ✅ Production-ready |
| Asset Lifecycle | ✅ Production-ready |
| Token Operations | ✅ Production-ready |
| Compliance Engine | ⚠️ Logic works, needs hardening |
| Persistence | ⚠️ In-memory only |
| KYC Integration | ❌ Mock only |
| Smart Contract Audit | ❌ Not done |

## 9.2 Production Roadmap

| Phase | Duration | Investment |
|-------|----------|------------|
| Security Hardening | 2 weeks | $10k |
| PostgreSQL Persistence | 2 weeks | $20k |
| KYC Provider Integration | 2 weeks | $30k |
| Smart Contract Audit | 4 weeks | $80k |
| Legal Opinion | 2 weeks | $30k |
| Production Infrastructure | 4 weeks | $40k |
| **Total** | **16 weeks** | **$210k** |

## 9.3 Critical Fixes Required

1. **Fail-Closed Compliance** - Currently fails open if no plugins configured
2. **Persistent Storage** - Data lost on restart
3. **Real KYC Provider** - Need Jumio/Onfido integration
4. **Smart Contract Audit** - Required for any real deployment

---

# Appendix A: Type Definitions

```typescript
// Right Types
enum RightType {
  OWNERSHIP = 'OWNERSHIP',
  ACCESS = 'ACCESS',
  BEHAVIOR = 'BEHAVIOR',
  VERIFICATION = 'VERIFICATION',
}

// Lifecycle States
enum LifecycleState {
  DRAFT = 'DRAFT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  VERIFIED = 'VERIFIED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REDEEMED = 'REDEEMED',
  EXPIRED = 'EXPIRED',
  BURNED = 'BURNED',
}

// Transfer Modes
enum TransferabilityMode {
  UNRESTRICTED = 'UNRESTRICTED',
  WHITELIST_ONLY = 'WHITELIST_ONLY',
  NON_TRANSFERABLE = 'NON_TRANSFERABLE',
  COMPLIANCE_GATED = 'COMPLIANCE_GATED',
}

// Party Types
enum PartyType {
  INDIVIDUAL = 'INDIVIDUAL',
  ORGANIZATION = 'ORGANIZATION',
  DAO = 'DAO',
  TRUST = 'TRUST',
  FUND = 'FUND',
}

// Party Roles
enum PartyRole {
  ISSUER = 'ISSUER',
  INVESTOR = 'INVESTOR',
  VERIFIER = 'VERIFIER',
  CUSTODIAN = 'CUSTODIAN',
  REGULATOR = 'REGULATOR',
  TRANSFER_AGENT = 'TRANSFER_AGENT',
  ORACLE_PROVIDER = 'ORACLE_PROVIDER',
  OPERATOR = 'OPERATOR',
}
```

---

# Appendix B: Error Codes

| Code | Message | Resolution |
|------|---------|------------|
| `ASSET_NOT_FOUND` | Asset does not exist | Check asset ID |
| `PARTY_NOT_FOUND` | Party does not exist | Check party ID |
| `INVALID_TRANSITION` | State transition not allowed | Check valid transitions |
| `KYC_REQUIRED` | Party not KYC verified | Complete KYC verification |
| `INSUFFICIENT_BALANCE` | Not enough tokens | Check balance |
| `TRANSFER_BLOCKED` | Compliance check failed | Review violations |
| `ASSET_NOT_ACTIVE` | Asset must be ACTIVE | Activate asset first |
| `PARTY_FROZEN` | Party is frozen | Unfreeze party |

---

**Document Version:** 1.0
**Last Updated:** January 2026
**Maintainer:** AHOY Platform Team
