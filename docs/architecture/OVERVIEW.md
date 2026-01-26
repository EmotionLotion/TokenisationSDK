# Architecture Overview

## System Design

The TokenisationSDK follows a **layered architecture** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER                           │
│         React UI  |  CLI  |  Third-party Applications              │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            SDK LAYER                                │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │  Assets   │  │  Tokens   │  │  Parties  │  │  Events   │       │
│  │  Module   │  │  Module   │  │  Module   │  │  Module   │       │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    LIFECYCLE ENGINE                          │   │
│  │            State Machine  |  Policy Evaluator               │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          PLUGIN LAYER                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │Compliance│  │ Storage  │  │  Oracle  │  │  Chain   │           │
│  │  Plugin  │  │  Plugin  │  │  Plugin  │  │  Plugin  │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       INFRASTRUCTURE LAYER                          │
│      Database  |  Blockchain  |  IPFS  |  External APIs            │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Concepts

### 1. Rights Model

Everything is a **Right** with a specific type:

| Right Type | Description | Examples |
|------------|-------------|----------|
| `OWNERSHIP` | Property rights | Real estate, equity, IP |
| `ACCESS` | Permission rights | Tickets, memberships |
| `BEHAVIOR` | Reputation/scores | Loyalty points, ratings |
| `VERIFICATION` | Proof/certification | Carbon credits, degrees |

### 2. Lifecycle States

Every asset follows a deterministic state machine:

```
DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE → REDEEMED/EXPIRED → BURNED
         ↓                       ↓          ↓
      REJECTED                SUSPENDED  FROZEN
```

### 3. Party Model

All participants are **Parties** with roles:

| Role | Capabilities |
|------|--------------|
| `ISSUER` | Create assets, mint tokens |
| `INVESTOR` | Hold and transfer tokens |
| `VERIFIER` | Verify assets and evidence |
| `CUSTODIAN` | Hold assets on behalf |
| `OPERATOR` | Administrative actions |

### 4. Compliance Model

Transfer rules are enforced through:

- **Transfer Mode**: `UNRESTRICTED`, `WHITELIST_ONLY`, `NON_TRANSFERABLE`, `COMPLIANCE_GATED`
- **KYC Verification**: Required for compliance-gated transfers
- **Jurisdiction Rules**: Country-based restrictions
- **Investor Limits**: Maximum holder counts

## Data Flow

### Asset Creation Flow

```
1. Party (Issuer) → sdk.assets.create()
2. SDK validates → Creates DRAFT asset
3. Evidence uploaded → State: PENDING_VERIFICATION
4. Verifier checks → State: VERIFIED
5. Issuer activates → State: ACTIVE
6. Events logged → EventStore
```

### Token Transfer Flow

```
1. sdk.tokens.transfer(from, to, amount)
2. ComplianceService.evaluateTransfer()
   ├─ Check sender KYC
   ├─ Check recipient KYC
   ├─ Check transfer mode
   ├─ Check jurisdiction
   └─ Check whitelist
3. If APPROVED → Execute transfer
4. If DENIED → Return error with reason
5. Log TransferEvent
```

## Module Responsibilities

### AssetModule
- Asset CRUD operations
- Lifecycle state transitions
- Evidence management
- Metadata storage

### TokenModule
- Minting tokens
- Burning tokens
- Transferring tokens
- Balance queries

### PartyModule
- Party registration
- KYC status management
- Role assignment
- Wallet linking

### EventStore
- Immutable event log
- Event sourcing capability
- Audit trail
- State reconstruction

## Plugin Architecture

Plugins implement standard interfaces:

```typescript
interface ICompliancePlugin {
  evaluateTransfer(from, to, asset, amount): Promise<TransferResult>;
  checkPolicy(context): Promise<boolean>;
}

interface IStoragePlugin {
  saveParty(party): Promise<void>;
  getParty(id): Promise<Party>;
  saveAsset(asset): Promise<void>;
  getAsset(id): Promise<Asset>;
}

interface IOraclePlugin {
  getPrice(assetId): Promise<bigint>;
  getNAV(assetId): Promise<bigint>;
}

interface IChainPlugin {
  mint(to, amount): Promise<string>;
  transfer(from, to, amount): Promise<string>;
  getBalance(address): Promise<bigint>;
}
```

## Security Boundaries

```
┌──────────────────────────────────────────┐
│           TRUSTED BOUNDARY               │
│  ┌────────────────────────────────────┐  │
│  │         SDK Core Logic             │  │
│  │    Lifecycle | Compliance          │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
              │
              ▼ (Validation Required)
┌──────────────────────────────────────────┐
│          EXTERNAL BOUNDARY               │
│   User Input | API Calls | Blockchain    │
└──────────────────────────────────────────┘
```

## Related Documents

- [Plugin System](./PLUGINS.md) - How to extend the SDK
- [Lifecycle Engine](./LIFECYCLE.md) - State machine details
- [Security Model](./SECURITY.md) - Security considerations
