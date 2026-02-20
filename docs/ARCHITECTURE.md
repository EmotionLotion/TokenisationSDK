# AHOY Tokenisation SDK — Architecture Document

> A compliance-first, plugin-driven tokenisation platform for issuing, managing, and trading regulated digital assets across any vertical.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [SDK Core Engine](#3-sdk-core-engine)
4. [SDK Modules](#4-sdk-modules)
5. [Vertical Packs](#5-vertical-packs)
6. [Plugin System](#6-plugin-system)
7. [Provider Interfaces](#7-provider-interfaces)
8. [Smart Contracts Layer](#8-smart-contracts-layer)
9. [SDK-React Bindings](#9-sdk-react-bindings)
10. [UI Kit](#10-ui-kit)
11. [Server (API Layer)](#11-server-api-layer)
12. [Cross-Cutting Concerns](#12-cross-cutting-concerns)
13. [Data Flow](#13-data-flow)
14. [Extension Guide](#14-extension-guide)
15. [Technology Stack](#15-technology-stack)

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                          │
│  apps/real-estate   •   ui/   •   sdk-playground   •   Your App     │
├──────────────────────────────────────────────────────────────────────┤
│                         SDK-REACT (34 hooks)                        │
│  TokenisationProvider  │  ComplianceGuard  │  WalletConnect  │ ...  │
├──────────────────────────────────────────────────────────────────────┤
│                         UI-KIT (47 components)                      │
│  AssetCard • TransactionFlow • KYCModal • PortfolioDashboard • ...  │
├──────────────────────────────────────────────────────────────────────┤
│                              SDK CORE                               │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │ Compliance   │ │  Lifecycle   │ │   Custody    │ │  Event     │  │
│  │ Engine       │ │  Engine      │ │   Manager    │ │  Store     │  │
│  ├─────────────┤ ├──────────────┤ ├──────────────┤ ├────────────┤  │
│  │ Policy       │ │  State       │ │  Hook        │ │  Indexing  │  │
│  │ Evaluator    │ │  Machine     │ │  System      │ │  Engine    │  │
│  ├─────────────┤ ├──────────────┤ ├──────────────┤ ├────────────┤  │
│  │ Decision     │ │  Saga        │ │  Resilience  │ │  Rate      │  │
│  │ Receipt      │ │  Orchestrator│ │  / Retry     │ │  Limiter   │  │
│  └─────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │
│                                                                      │
│  ┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   28 MODULES      │  │   26 PACKS       │  │   35+ PLUGINS    │  │
│  │  (domain clients) │  │  (verticals)     │  │  (integrations)  │  │
│  └───────────────────┘  └──────────────────┘  └──────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│                        SERVER (Express API)                          │
│  65 Route Files  •  70+ Services  •  13 Middleware  •  10 Verticals │
├──────────────────────────────────────────────────────────────────────┤
│                       SMART CONTRACTS (Solidity)                     │
│  ERC-3643 Compliant Tokens  •  Modular Compliance  •  TokenFactory  │
│  Identity Registry  •  Dividend Distributor  •  Chainlink Oracles   │
└──────────────────────────────────────────────────────────────────────┘
```

The platform follows a layered architecture where each layer has well-defined responsibilities:

- **Applications** consume SDK-React hooks and UI-Kit components
- **SDK-React** bridges React's component model to the SDK core via context and hooks
- **SDK Core** provides the compliance engine, lifecycle management, and plugin orchestration
- **Server** handles persistence, multi-tenancy, blockchain relay, and scheduled operations
- **Smart Contracts** enforce on-chain compliance, token standards, and distribution logic

---

## 2. Monorepo Structure

```
TokenisationSDK/
├── sdk/                    # Core TypeScript SDK
├── sdk-react/              # React hooks & components
├── sdk-react-native/       # React Native bindings
├── ui-kit/                 # Reusable UI component library
├── ui/                     # Main React web application
├── server/                 # Express API server
├── contracts/              # Solidity smart contracts (Foundry)
├── apps/
│   └── real-estate/        # Real estate tokenisation app
├── circuits/               # Zero-knowledge proof circuits
├── packages/
│   ├── conformance-suite/  # SDK conformance tests
│   ├── create-tokenised-asset/  # CLI scaffolding tool
│   └── sdk-playground/     # Interactive SDK demo
├── deploy/                 # Deployment scripts
├── docker/                 # Docker configuration
├── docs/                   # Documentation
├── e2e/                    # Playwright E2E tests
├── examples/               # Code examples
├── functions/              # Serverless entrypoints
├── policies/               # Policy definitions
├── scripts/                # Build/deploy scripts
├── tests/                  # Integration tests
└── website/                # Documentation website
```

**Package manager**: pnpm (workspaces)
**Build**: TypeScript (`tsc`) for SDK packages, Vite for applications, Foundry for contracts

---

## 3. SDK Core Engine

The core engine (`sdk/src/core/`) contains 27 files forming the foundational abstractions.

### 3.1 Compliance Engine

**File**: `core/ComplianceEngine.ts`

The central gatekeeper for all token operations. Every transfer, issuance, or redemption passes through compliance evaluation.

```
Request → ComplianceEngine.evaluate()
           ├── Load active PolicyRules for asset
           ├── Run each ICompliancePlugin.check()
           ├── Run IJurisdictionPlugin.verify() for relevant jurisdictions
           ├── Aggregate results → PolicyDecision (allow/deny/review)
           ├── Generate DecisionReceipt (signed, hashed, chained)
           └── Return Result<PolicyDecision>
```

Key types:
- `ACEConfig` — Automated Compliance Engine configuration
- `PolicyDecision` — allow / deny / manual_review with reasons
- `DecisionReceipt` — cryptographically signed compliance proof

### 3.2 Lifecycle Engine

**File**: `core/LifecycleEngine.ts`

Manages the lifecycle of tokenised assets through defined state transitions:

```
draft → pending_compliance → active → frozen → redeemed
                                    ↘ suspended ↗
```

Each transition is validated against compliance rules and emits events to the EventStore.

### 3.3 State Machine

**File**: `core/StateMachine.ts`

A generic, configurable state machine used by vertical packs to define custom lifecycle flows. Provides:

- `StateDefinition` — states with metadata
- `TransitionDefinition` — transitions with guards and side-effects
- `StateMachineRegistry` — global registry for named state machines
- `stateMachineRegistry` — singleton instance

### 3.4 Custody Manager

**File**: `core/CustodyManager.ts`

Multi-signature custody with regulatory override capabilities:

- `CustodyType` — self, managed, institutional, mpc
- `RecoveryReason` — lost_key, compromised, regulatory, inheritance
- `OverrideType` — freeze, seizure, forced_transfer
- Approval workflows with multi-sig thresholds

### 3.5 Event Store

**File**: `core/EventStore.ts`

Append-only event sourcing with `IEventStore` interface. Supports:

- Domain events (transfer, compliance, lifecycle)
- Event replay for state reconstruction
- Multiple backends (browser, API, database)

### 3.6 Saga Orchestrator

**Files**: `core/Saga.ts`, `core/saga/`

Long-running transaction orchestration with compensating actions:

- `SagaStore` / `PostgresSagaStore` for persistence
- Built-in flows: `PaymentMintFlow`
- Compensation on failure (automatic rollback)

### 3.7 Other Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Asset Abstraction | `AssetAbstraction.ts` | Maps business concepts (AssetType, InvestorClass) to ERC standards |
| Chain Service | `ChainService.ts` | Multi-chain connection management |
| Decision Receipt | `DecisionReceipt.ts` | Cryptographic compliance proofs with receipt chaining |
| Hook System | `HookSystem.ts` | Pre/post lifecycle hooks with priority ordering |
| Indexing Engine | `IndexingEngine.ts` | Real-time on-chain event indexing |
| Policy Evaluator | `PolicyEvaluator.ts` | Rule engine for compliance policies |
| Policy Hash | `PolicyHash.ts` | Content-addressed policy versioning |
| Provider Registry | `ProviderRegistry.ts` | Registry for external service providers |
| Right Type Registry | `RightTypeRegistry.ts` | Custom token right definitions |
| Idempotency | `Idempotency.ts` | Operation deduplication |
| Resilience | `Resilience.ts` | Circuit breaker pattern |
| Retry | `Retry.ts` | Exponential backoff retry |
| Disaster Recovery | `DisasterRecovery.ts` | Key recovery and disaster workflows |
| Observability | `Observability.ts` | OpenTelemetry hooks |

---

## 4. SDK Modules

The module layer (`sdk/src/modules/`) contains 28 domain-specific API clients that consume core services.

### Module Catalogue

| Module | File | Description |
|--------|------|-------------|
| **Assets** | `assets.ts` | Asset CRUD, metadata, lifecycle management |
| **Tokens** | `tokens.ts` | Mint, burn, transfer, balance queries |
| **Transfers** | `transfers.ts` | Transfer initiation, approval, settlement |
| **Investors** | `investors.ts` | Investor onboarding, KYC status, tier management |
| **Compliance** | `compliance.ts` | KYC/AML checks, compliance status queries |
| **Projects** | `projects.ts` | Real estate project management |
| **Audit** | `audit.ts` | Audit log querying and filtering |
| **Events** | `events.ts` | Event stream subscriptions |
| **Webhooks** | `webhooks.ts` | Webhook registration and management |
| **Offerings** | `Offerings.ts` | Token offering creation and management |
| **Vesting** | `Vesting.ts` | Token vesting schedule management |
| **Redemption** | `Redemption.ts` | Token buyback and redemption flows |
| **Cash Flow** | `CashFlowClient.ts` | Dividend/distribution scheduling |
| **Escrow** | `EscrowClient.ts` | Escrow management with milestones |
| **Governance** | `GovernanceClient.ts` | Proposal creation, voting, delegation |
| **Secondary Market** | `SecondaryMarketModule.ts` | P2P listing, matching, settlement |
| **Exit Windows** | `ExitWindowModule.ts` | Periodic redemption window scheduling |
| **Investor Tiers** | `InvestorTierModule.ts` | Tier eligibility, access control |
| **Legal** | `LegalModule.ts` | Legal document and agreement management |
| **Resale** | `ResaleModule.ts` | Resale restriction enforcement |
| **DLD** | `DLDClient.ts` | Dubai Land Department integration |
| **Tickets** | `TicketsClient.ts` | Event ticketing operations |
| **Regulatory Reports** | `RegulatoryReports.ts` | Report generation for regulators |

Each module follows the pattern:

```typescript
export class SecondaryMarketModule {
  constructor(private httpClient: HttpClient) {}

  async createListing(input: CreateListingInput): Promise<SecondaryListing> {
    return this.httpClient.post('/api/v1/secondary-market/listings', input);
  }
  // ...
}
```

---

## 5. Vertical Packs

Packs (`sdk/src/packs/`) are pre-built vertical configurations that combine modules, compliance rules, lifecycle states, and condition evaluators for specific asset classes.

### 5.1 Available Verticals

| Pack | Files | Description |
|------|-------|-------------|
| **Real Estate** | `real-estate.pack.ts`, `real-estate-lifecycle.ts`, `UAERealEstate.ts` | Property tokenisation with SPV structures, DLD integration, VARA compliance |
| **US Securities** | `us-securities.pack.ts` | SEC Reg D/S compliant security tokens |
| **GPU Compute** | `gpu-compute.pack.ts`, `GPUCompute.ts` | Tokenised GPU compute resources |
| **Airline Tickets** | `AirlineTicket.ts`, `AirlineTicketStateMachine.ts` | NFT-based airline tickets with boarding pass lifecycle |
| **Concert Tickets** | `ConcertTicket.ts`, `ConcertTicketStateMachine.ts` | Event ticket NFTs with venue validation |
| **Hotel Reservations** | `HotelReservation.ts`, `HotelReservationStateMachine.ts` | Hotel booking tokens with check-in/out states |
| **Car Rentals** | `CarRental.ts`, `CarRentalStateMachine.ts` | Car rental reservation tokens |
| **Event Tickets** | `EventTicket.ts` | Generic event ticketing |
| **Loyalty Points** | `LoyaltyPoints.ts` | Points-based loyalty programs |
| **Physical Assets** | `PhysicalAsset.ts` | Tokenised physical goods with custody proofs |
| **Warehouse Receipts** | `WarehouseReceipt.ts` | Commodity warehouse receipt tokens |
| **Verification Credentials** | `VerificationCredential.ts` | Verifiable credential tokens |

### 5.2 Real Estate Lifecycle (Example)

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ submit_for_review
                    ┌────▼─────┐
                    │ REVIEW   │
                    └────┬─────┘
                    ┌────▼──────────┐
                    │ DUE_DILIGENCE │
                    └────┬──────────┘
                    ┌────▼─────────────┐
                    │ REGULATORY_FILING │
                    └────┬─────────────┘
                    ┌────▼─────────────┐
                    │ PENDING_APPROVAL  │
                    └────┬─────────────┘
                    ┌────▼─────┐
                    │ APPROVED │
                    └────┬─────┘
                    ┌────▼───────┐
                    │ MINTING    │
                    └────┬───────┘
              ┌──────────▼──────────┐
              │     ACTIVE          │
              │  (tokens trading)   │
              └──┬──────────┬───────┘
                 │          │
          freeze │          │ initiate_exit
        ┌────────▼──┐  ┌───▼────────────┐
        │  FROZEN    │  │ EXIT_PERIOD    │
        └────────────┘  └───┬────────────┘
                            │ complete_exit
                       ┌────▼─────┐
                       │ REDEEMED │
                       └──────────┘
```

### 5.3 Pack Architecture

Each pack provides:

1. **Lifecycle Definition** — custom state machine with states, transitions, and guards
2. **Compliance Rules** — jurisdiction-specific conditions (e.g., DLD NOC, VARA)
3. **Condition Evaluators** — `DLDConditionEvaluator`, `VARAConditionEvaluator`
4. **Module Configuration** — which SDK modules are required

---

## 6. Plugin System

Plugins (`sdk/src/plugins/`) are the primary extension mechanism. They implement well-defined interfaces from `core/interfaces.ts`.

### 6.1 Plugin Interfaces

```typescript
interface ICompliancePlugin {
  check(context: ComplianceContext): Promise<ComplianceResult>;
}

interface IJurisdictionPlugin {
  verify(party: Party, jurisdiction: string): Promise<JurisdictionResult>;
}

interface IStoragePlugin {
  store(data: Buffer, metadata: object): Promise<StorageResult>;
  retrieve(id: string): Promise<Buffer>;
}

interface IChainPlugin {
  deploy(bytecode: string, abi: any[]): Promise<DeployResult>;
  call(address: string, method: string, args: any[]): Promise<any>;
}

interface ITokenAdapter {
  mint(to: string, amount: bigint): Promise<TransactionResult>;
  burn(from: string, amount: bigint): Promise<TransactionResult>;
  transfer(from: string, to: string, amount: bigint): Promise<TransactionResult>;
}

interface IOraclePlugin {
  getPrice(pair: string): Promise<PriceResult>;
}

interface IAcePlugin {
  evaluate(context: ACEContext): Promise<ACEResult>;
}

interface IProofOfReservePlugin {
  verify(asset: string): Promise<ReserveProof>;
}
```

### 6.2 Available Plugins

| Category | Plugin | Description |
|----------|--------|-------------|
| **Auth** | `MetaMaskPlugin` | MetaMask wallet connection |
| | `WalletConnectPlugin` | WalletConnect v2 integration |
| | `SIWEAuthPlugin` | Sign-In With Ethereum |
| **Chain** | `EVMChainPlugin` | EVM chain interaction |
| | `ChainRegistry` | Multi-chain registry |
| **Chainlink** | `DataFeedPlugin` | Price feed oracles |
| | `FunctionsPlugin` | Chainlink Functions (off-chain compute) |
| | `AutomationPlugin` | Chainlink Automation (keepers) |
| | `CCIPBridgePlugin` | Cross-chain interoperability |
| | `ProofOfReservePlugin` | Asset reserve verification |
| | `OracleAggregator` | Multi-oracle price aggregation |
| | `OracleMonitorPlugin` | Oracle health monitoring |
| | `AmadeusFlightPlugin` | Flight data via Chainlink Functions |
| | `DecoPlugin` | DECO-based data attestation |
| **Compliance** | `JurisdictionPlugin` | Multi-jurisdiction compliance |
| | `KYCCompliancePlugin` | KYC status verification |
| **Storage** | `IPFSStoragePlugin` | IPFS (Pinata) document storage |
| | `S3StoragePlugin` | AWS S3 storage |
| **Events** | `SSEPlugin` | Server-Sent Events streaming |
| **KYC** | `KycPlugin` | KYC workflow orchestration |
| **Carbon** | `CarbonOraclePlugin` | Carbon credit oracle |

### 6.3 Plugin Registration

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';
import { MetaMaskPlugin } from '@tokenisation/sdk/plugins';

const sdk = new TokenisationSDK({
  plugins: [
    new MetaMaskPlugin(),
    new EVMChainPlugin({ chainId: 1 }),
    new IPFSStoragePlugin({ gateway: 'https://gateway.pinata.cloud' }),
  ],
});
```

---

## 7. Provider Interfaces

Providers (`sdk/src/providers/`) are swappable implementations of external service integrations.

### 7.1 Provider Types

```typescript
interface ICustodyProvider {
  createWallet(userId: string): Promise<WalletInfo>;
  sign(walletId: string, payload: Buffer): Promise<Signature>;
}

interface IKYCProvider {
  createSession(userId: string): Promise<KYCSession>;
  getStatus(sessionId: string): Promise<KYCStatus>;
}

interface IPaymentProvider {
  createPaymentIntent(amount: Money): Promise<PaymentIntent>;
  processPayment(intentId: string): Promise<PaymentResult>;
}

interface ISettlementProvider {
  settle(transfer: Transfer): Promise<SettlementResult>;
}

interface IExchangeProvider {
  getQuote(pair: string): Promise<Quote>;
}

interface IDLDProvider {
  checkNOC(propertyId: string): Promise<NOCResult>;
  registerTransfer(transfer: Transfer): Promise<DLDResult>;
}
```

### 7.2 Available Implementations

| Provider Type | Implementations |
|--------------|-----------------|
| **Custody** | `MockCustodyProvider`, `FireblocksCustodyProvider`, `LitProtocolCustodyProvider`, `Web3AuthCustodyProvider` |
| **KYC** | `MockKYCProvider`, `SumsubProvider` |
| **Payment** | `MockPaymentProvider`, `StripeProvider`, `CircleProvider` (with `IdempotentPaymentProvider` and `RateLimitedPaymentProvider` wrappers) |
| **Settlement** | `MockSettlementProvider`, `CCIPSettlementProvider` |
| **Exchange** | `MockExchangeProvider` |
| **DLD** | `MockDLDProvider` (+ server-side real DLD adapter) |

---

## 8. Smart Contracts Layer

The contracts layer (`contracts/src/`) implements on-chain logic using Solidity, compiled with Foundry.

### 8.1 Token Standards

| Contract | Standard | Purpose |
|----------|----------|---------|
| `ComplianceToken` | ERC-3643 (T-REX) | Regulated security tokens with identity checks |
| `ComplianceTokenUpgradeable` | ERC-3643 + UUPS | Upgradeable version for production |
| `ComplianceMultiToken` | ERC-1155 | Multi-token compliance (fractionalized assets) |
| `ERC1410Token` | ERC-1410 | Partially fungible tokens with tranches |
| `RealToken` | ERC-20 | Real estate-specific token |
| `AhoyToken` | ERC-20 | Platform utility token |
| `ComputeToken` | ERC-20 | GPU compute resource token |
| `AccessPassNFT` | ERC-721 | Access pass NFTs |
| `ReputationSBT` | Soulbound | Non-transferable reputation token |
| `AirlineTicketNFT` | ERC-721 | Airline ticket with state machine |
| `ConcertTicketNFT` | ERC-721 | Concert ticket NFT |
| `HotelReservationNFT` | ERC-721 | Hotel reservation NFT |
| `CarRentalNFT` | ERC-721 | Car rental reservation NFT |
| `GPUNodeNFT` | ERC-721 | GPU node ownership NFT |

### 8.2 Compliance Infrastructure

```
┌─────────────────────────────┐
│      ModularCompliance      │ ← Policy enforcement hub
├─────────────────────────────┤
│ Modules:                    │
│  • WhitelistModule          │ ← Approved investor list
│  • CountryRestrictionsModule│ ← Geo-blocking
│  • HoldTimeModule           │ ← Lockup enforcement
│  • MaxBalanceModule         │ ← Concentration limits
│  • MaxHoldersModule         │ ← Investor cap
│  • TransferFeesModule       │ ← Fee collection
│  • ACEComplianceModule      │ ← Automated Compliance Engine
│  • HardwareVerificationModule│← Hardware attestation
├─────────────────────────────┤
│ Policy Layer:               │
│  • AllowPolicy              │
│  • TimePolicy               │
│  • VolumePolicy             │
│  • PolicyModuleRegistry     │
└─────────────────────────────┘
```

### 8.3 Supporting Contracts

| Category | Contracts |
|----------|-----------|
| **Factory** | `TokenFactory` — deploys new compliant tokens with registry registration |
| **Identity** | `IdentityRegistry` — on-chain identity and claims verification |
| **Governance** | `TokenGovernor` — on-chain proposal and voting |
| **Oracles** | `ChainlinkPriceFeed`, `OracleRegistry`, `ACERouter`, `FunctionsConsumer`, `GPUComputeOracle`, `ProofOfReserveChecker` |
| **Distribution** | `DividendDistributor`, `ComputeRevenueDistributor` |
| **ZKP** | `ZKPComplianceModule`, `ZKPVerifierRegistry` + custom verifiers |

### 8.4 SDK Contract Adapters

The SDK wraps contract interactions through typed adapters:

| Adapter | Standard | Operations |
|---------|----------|------------|
| `ERC20Adapter` | ERC-20 | transfer, approve, balanceOf |
| `ERC721Adapter` | ERC-721 | mint, burn, transferFrom, ownerOf |
| `ERC1155Adapter` | ERC-1155 | safeTransferFrom, balanceOfBatch |
| `ERC1410Adapter` | ERC-1410 | transferByPartition, balanceOfByPartition |
| `ERC4626Adapter` | ERC-4626 | deposit, withdraw, previewDeposit |
| `SoulboundAdapter` | SBT | mint (non-transferable) |

---

## 9. SDK-React Bindings

`sdk-react/` provides React integration through a context provider and 34 specialised hooks.

### 9.1 Context Architecture

```typescript
// TokenisationProvider wraps your app
<TokenisationProvider config={{ baseUrl, orgId, apiKey }}>
  <App />
</TokenisationProvider>

// Context provides:
interface TokenisationContextValue {
  api: BrowserHttpClient;      // HTTP client for API calls
  modules: SDKModules;          // All SDK modules
  wallet: WalletState;          // Connected wallet info
  config: SDKConfig;            // Configuration
  connect: () => Promise<void>; // Wallet connection
  disconnect: () => void;       // Wallet disconnection
}
```

### 9.2 Hook Catalogue

| Category | Hooks | Description |
|----------|-------|-------------|
| **Asset Management** | `useAsset`, `useTokens`, `useTokenBalance` | Query and manage tokenised assets |
| **Compliance** | `useCompliance`, `useKYC` | Check compliance status, manage KYC |
| **Investor** | `useInvestor`, `useInvestorTier`, `useCapTable` | Investor profiles, tiers, cap table |
| **Trading** | `useTransfer`, `useSecondaryMarket`, `useExitWindow`, `useResale` | Transfers, P2P trading, redemptions |
| **Financial** | `useCashFlow`, `useEscrow`, `useVesting` | Distributions, escrow, vesting |
| **Governance** | `useGovernance` | Proposals, voting, delegation |
| **Wallet** | `useWallet`, `useGasEstimate` | Wallet state, gas estimation |
| **Real Estate** | `useProject`, `usePropertyManagement`, `useDLD` | Property management, DLD integration |
| **Infrastructure** | `useEventStream`, `useWebhooks`, `useAuditLog` | Real-time events, webhooks, audit |
| **Monitoring** | `useConfig`, `useTransactionHistory`, `useTransaction` | Configuration, transaction tracking |
| **UX** | `useAuthExpiring`, `useErrorInterceptor`, `useOfflineStatus`, `usePriceOracle` | Auth expiry warnings, error handling, offline support |

### 9.3 Components

| Component | Purpose |
|-----------|---------|
| `ComplianceGuard` | Conditionally renders children based on compliance status |
| `WalletConnect` | Wallet connection button with provider selection |
| `WalletRegistry` | Multi-wallet management interface |
| `KYCFlow` | Step-by-step KYC onboarding |
| `IdentityOnboarding` | Identity verification flow |
| `DocumentUpload` | Document upload with validation |
| `NetworkStatusIndicator` | Network connectivity indicator |

---

## 10. UI Kit

The UI Kit (`ui-kit/`) provides 47 production-ready React components:

### 10.1 Component Categories

| Category | Components |
|----------|------------|
| **Asset Display** | `AssetCard`, `AssetGrid`, `PropertyCard`, `TicketCard`, `TokenAmount` |
| **Investment** | `InvestButton`, `InvestmentFlow`, `PaymentIntent`, `ActionStation` |
| **Portfolio** | `PortfolioDashboard`, `CapTable`, `SPVOverview`, `RedemptionWindow` |
| **Compliance** | `ComplianceStepper`, `AccreditationQuestionnaire`, `IdentityStatus` |
| **Transaction** | `TransactionFlow`, `TransactionHistory` |
| **KYC** | `KYCModal`, `KYCStatusWidget` |
| **Wallet** | `WalletConnectModal`, `AddressAvatar` |
| **Status** | `StatusBadge`, `NetworkStatusIndicator` |
| **Layout** | `Showcase` (component gallery) |

### 10.2 Theming

```typescript
import { ThemeProvider } from '@tokenisation/ui-kit';

<ThemeProvider theme={{
  colors: { primary: '#0066FF', ... },
  fonts: { heading: 'Lexend Deca', body: 'Inter' },
  borderRadius: '8px',
}}>
  <App />
</ThemeProvider>
```

### 10.3 Web Component Embedding

```html
<!-- Embed as a web component in any HTML page -->
<tokenisation-element
  config='{"baseUrl":"https://api.example.com","orgId":"org_123"}'
  component="invest-button"
  asset-id="asset_456">
</tokenisation-element>
```

---

## 11. Server (API Layer)

The server (`server/src/`) is an Express.js application providing RESTful APIs with 65 route files and 70+ services.

### 11.1 Architecture

```
┌──────────────────────────────────────────────────┐
│                   Express App                     │
├──────────────────────────────────────────────────┤
│  Middleware Stack:                                │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Auth/JWT │ │ Rate     │ │ Audit Trail      │  │
│  │          │ │ Limiter  │ │                  │  │
│  ├─────────┤ ├──────────┤ ├──────────────────┤  │
│  │ API      │ │ Scope    │ │ Idempotency      │  │
│  │ Gateway  │ │ Guard    │ │                  │  │
│  ├─────────┤ ├──────────┤ ├──────────────────┤  │
│  │ Context  │ │ RLS      │ │ Tracing          │  │
│  │ (Tenant) │ │          │ │ (OpenTelemetry)  │  │
│  └─────────┘ └──────────┘ └──────────────────┘  │
├──────────────────────────────────────────────────┤
│  Routes (65) → Services (70+) → DB / Chain       │
├──────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐ │
│  │              Verticals (10)                  │ │
│  │  real-estate • hotel • car-rental • concert  │ │
│  │  airline • gpu-compute • prediction-market   │ │
│  │  depin • proof-of-funds • truthview          │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 11.2 Route Groups

| Group | Routes | Description |
|-------|--------|-------------|
| **Core Asset** | `asset`, `token`, `transfer`, `issuance`, `transition`, `ledger`, `vesting`, `redemption`, `distribution`, `corporateAction` | Token lifecycle operations |
| **Parties & Compliance** | `party`, `investor`, `investor-tier`, `compliance`, `kyc`, `kyc-webhook`, `accreditation`, `dld` | Identity, KYC, investor management |
| **Auth & IAM** | `auth`, `iam`, `oauth` | Authentication (SIWE, email/password, OAuth) |
| **Chain** | `chain`, `relayer`, `gas`, `settlement`, `payment-rails` | Blockchain interaction, gas management |
| **Real Estate** | `project`, `property-management`, `exit-window`, `secondary-market`, `nav` | Property-specific endpoints |
| **Travel** | `hotel`, `car-rental`, `concert`, `ticket`, `flight-oracle`, `boarding-pass`, `travel-shield` | Travel vertical endpoints |
| **Platform** | `audit`, `event`, `eventbus`, `webhook`, `sse`, `storage`, `indexer`, `scheduler`, `custody`, `export`, `reports`, `metrics` | Infrastructure services |

### 11.3 Key Services

| Service | Purpose |
|---------|---------|
| `token.service.ts` | Token deployment, minting, burning with real compiled bytecode |
| `transfer.service.ts` | Transfer lifecycle with custodial/non-custodial modes |
| `relayer.service.ts` | Transaction signing (real ECDSA via ethers.js) and submission |
| `compliance.service.ts` | KYC evaluation, compliance checks |
| `distribution.service.ts` | Dividend/yield distribution execution |
| `vesting.service.ts` | Token vesting schedule management |
| `iam.service.ts` | User creation, password auth (argon2), role management |
| `scheduler.service.ts` | Cron-based job scheduling with pluggable handlers |
| `notification.service.ts` | Multi-channel notifications (email, webhook, SSE) |
| `reports.service.ts` | Report generation (CSV, JSON, PDF) |
| `reconciliation.service.ts` | On-chain/off-chain state reconciliation |
| `gas.service.ts` | Gas estimation and optimisation |
| `audit.service.ts` | Immutable audit logging |

### 11.4 Database

- **ORM**: Drizzle ORM
- **Databases**: PostgreSQL (production) / SQLite (development)
- **Schema**: `db/schema.ts` (Postgres), `db/schema.sqlite.ts` (SQLite)
- **Migrations**: SQL migration files in `db/migrations/`
- **Multi-tenancy**: Row-level security via `orgId` on every table

### 11.5 Middleware

| Middleware | Purpose |
|-----------|---------|
| `auth.ts` | JWT verification, session management |
| `apiGateway.ts` | API key validation, rate limiting per key |
| `scopeGuard.ts` | Route-level permission enforcement (scopes) |
| `rls.ts` | Row-level security (tenant isolation) |
| `auditTrail.ts` | Automatic audit logging of all mutations |
| `idempotency.ts` | Request deduplication via idempotency keys |
| `rateLimit.ts` | Global and per-route rate limiting |
| `context.ts` | Tenant context propagation |
| `traceMiddleware.ts` | OpenTelemetry trace context |
| `x402.ts` | Payment-required middleware (HTTP 402) |

---

## 12. Cross-Cutting Concerns

### 12.1 Account Abstraction (ERC-4337)

```
sdk/src/account-abstraction/
├── bundlers/
│   ├── AlchemyBundler.ts       # Alchemy bundler integration
│   ├── BiconomyBundler.ts      # Biconomy bundler integration
│   ├── PimlicoBundler.ts       # Pimlico bundler integration
│   └── AbstractBundler.ts      # Base bundler abstraction
├── core/
│   ├── SmartAccountFactory.ts  # Smart account deployment
│   └── UserOperationBuilder.ts # UserOp construction
└── paymasters/
    ├── SponsorPaymaster.ts     # Gas sponsorship
    └── VerifyingPaymaster.ts   # Signature-verified sponsorship
```

Enables gasless transactions for end users through smart contract wallets.

### 12.2 Zero-Knowledge Proofs

```
sdk/src/zkp/
├── CircuitManager.ts    # Circuit compilation and proving
└── ZKPPlugin.ts         # Plugin interface for ZKP compliance

circuits/                 # ZKP circuit source files

contracts/src/zkp/
├── ZKPComplianceModule.sol   # On-chain ZKP verification
├── ZKPVerifierRegistry.sol   # Verifier contract registry
└── verifiers/                # Groth16/PLONK verifiers
```

Allows compliance checks (KYC, accreditation) without revealing personal data.

### 12.3 Multi-Party Computation (MPC)

```
sdk/src/providers/custody/mpc/
├── AbstractMPCProvider.ts       # Base MPC abstraction
├── FireblocksCustodyProvider.ts # Fireblocks integration
├── LitProtocolCustodyProvider.ts# Lit Protocol integration
├── Web3AuthCustodyProvider.ts   # Web3Auth integration
├── MPCSigner.ts                 # MPC-based transaction signing
└── IMPCProvider.ts              # MPC provider interface
```

### 12.4 Offline Support

```
sdk/src/offline/
├── LifecycleEngine.ts    # Offline lifecycle management
├── ComplianceEngine.ts   # Offline compliance evaluation
├── CashFlowEngine.ts     # Offline distribution calculation
├── GovernanceEngine.ts   # Offline vote recording
├── EscrowEngine.ts       # Offline escrow tracking
├── NetworkDetector.ts    # Online/offline detection
├── OfflineQueue.ts       # Operation queue for sync
└── SyncManager.ts        # Conflict resolution and sync
```

### 12.5 Cross-Pack Orchestration

```
sdk/src/orchestration/
├── CrossPackEventBus.ts           # Events across verticals
├── SagaOrchestrator.ts            # Multi-pack saga coordination
├── PortableComplianceReceipt.ts   # Cross-vertical compliance proofs
├── SharedIdentityRegistry.ts      # Shared identity across packs
├── UnifiedAuditLog.ts             # Consolidated audit trail
└── ScopedAuditView.ts             # Per-vertical audit views
```

### 12.6 External Connectors

| Category | Connectors |
|----------|-----------|
| **PSS (Travel)** | Amadeus NDC, Amadeus DCS, Sabre PSS, Travelport PSS |
| **Legal** | DocuSign |
| **Wallet Pass** | Apple Wallet, Google Pay |
| **AI/Compute** | Vast.ai |

---

## 13. Data Flow

### 13.1 Token Issuance Flow

```
1. Client → POST /api/v1/tokens (name, symbol, compliance rules)
2. Server → token.service.createToken()
3.        → loadContractArtifact('ComplianceToken')  [real Foundry bytecode]
4.        → ABI-encode constructor args (name, symbol, identityRegistry)
5.        → relayer.signTransaction()  [real ECDSA via ethers.js]
6.        → relayer.submitTransaction() → JSON-RPC eth_sendRawTransaction
7.        → indexer watches for DeployEvent
8.        → token status: deployed
9. Client ← { tokenId, contractAddress, txHash }
```

### 13.2 Compliant Transfer Flow

```
1. Client → POST /api/v1/transfers
2. Server → transfer.service.initiateTransfer()
3.        → complianceEngine.evaluate(sender, receiver, amount)
4.            ├── KYC check (both parties verified?)
5.            ├── Jurisdiction check (allowed jurisdictions?)
6.            ├── Lockup check (hold period elapsed?)
7.            ├── Max holders check (within cap?)
8.            └── Custom conditions (DLD NOC, VARA, etc.)
9.        → Generate DecisionReceipt (signed, hashed)
10.       → If custodial:
              ├── relayer.signTransaction()
              ├── relayer.submitTransaction()
              └── Emit transfer.submitted event
           If non-custodial:
              └── Return unsigned txPayload for client signing
11. Client ← { transfer, txHash | txPayload }
```

### 13.3 Scheduled Operations

```
Scheduler → Job Registry
             ├── distribution.execute  → distributionService.executeDistribution()
             ├── vesting.release       → vestingService.releaseVestedTokens()
             ├── compliance.expiry     → Mark expired KYC sessions
             ├── lockup.check          → Auto-release past-cliff vesting
             └── reconciliation.run    → On-chain/off-chain reconciliation
```

---

## 14. Extension Guide

### 14.1 Adding a New Vertical Pack

```typescript
// 1. Define lifecycle states
const MY_LIFECYCLE: StateDefinition[] = [
  { name: 'draft', metadata: { label: 'Draft' } },
  { name: 'active', metadata: { label: 'Active' } },
  { name: 'expired', metadata: { label: 'Expired' } },
];

// 2. Define transitions
const MY_TRANSITIONS: TransitionDefinition[] = [
  { from: 'draft', to: 'active', action: 'activate' },
  { from: 'active', to: 'expired', action: 'expire' },
];

// 3. Register with state machine
stateMachineRegistry.register({
  name: 'my-vertical',
  states: MY_LIFECYCLE,
  transitions: MY_TRANSITIONS,
});

// 4. Create pack configuration
export const myVerticalPack = {
  name: 'my-vertical',
  lifecycle: 'my-vertical',
  requiredModules: ['assets', 'tokens', 'compliance'],
  complianceRules: [...],
};
```

### 14.2 Adding a New Plugin

```typescript
import { ICompliancePlugin } from '@tokenisation/sdk/core/interfaces';

class MyCompliancePlugin implements ICompliancePlugin {
  async check(context: ComplianceContext): Promise<ComplianceResult> {
    // Custom compliance logic
    return { allowed: true, reasons: [] };
  }
}

// Register
sdk.registerPlugin(new MyCompliancePlugin());
```

### 14.3 Adding a New Provider

```typescript
import { IKYCProvider } from '@tokenisation/sdk/core/interfaces.providers';

class MyKYCProvider implements IKYCProvider {
  async createSession(userId: string): Promise<KYCSession> {
    // Integration with your KYC provider
  }
  async getStatus(sessionId: string): Promise<KYCStatus> {
    // Check verification status
  }
}

// Register
providerRegistry.register('kyc', new MyKYCProvider());
```

### 14.4 Adding a New Server Vertical

```typescript
// server/src/verticals/my-vertical/
// 1. Create routes
export const myVerticalRouter = Router();
myVerticalRouter.get('/items', async (req, res) => { ... });

// 2. Create services
export async function createItem(input: CreateItemInput) { ... }

// 3. Register in server/src/config/verticals.ts
export const VERTICALS = {
  ...existingVerticals,
  'my-vertical': {
    routes: myVerticalRouter,
    services: ['my-vertical.service'],
  },
};
```

---

## 15. Technology Stack

### Languages & Runtimes

| Layer | Technology |
|-------|-----------|
| SDK | TypeScript 5.x |
| Server | Node.js + TypeScript |
| Contracts | Solidity 0.8.x |
| ZKP Circuits | Circom |
| Frontend | React 18+ |

### Key Dependencies

| Category | Package | Purpose |
|----------|---------|---------|
| **Blockchain** | ethers.js v6 | Wallet, signing, ABI encoding |
| **Database** | Drizzle ORM | Type-safe SQL (Postgres/SQLite) |
| **API** | Express.js | HTTP server framework |
| **Auth** | jsonwebtoken, argon2 | JWT tokens, password hashing |
| **KYC** | Sumsub SDK | Identity verification |
| **Payments** | Stripe, Circle | Fiat on-ramp |
| **Storage** | Pinata (IPFS), AWS S3 | Document storage |
| **Email** | SendGrid, AWS SES | Notifications |
| **Oracle** | Chainlink | Price feeds, automation, CCIP |
| **Contracts** | Foundry (forge) | Compilation, testing, deployment |
| **Testing** | Vitest, Playwright | Unit/integration/E2E |
| **Monitoring** | OpenTelemetry | Distributed tracing |
| **Build** | pnpm, Vite, tsc | Package management, bundling |

### Supported Token Standards

| Standard | Use Case |
|----------|----------|
| ERC-20 | Fungible tokens (real estate shares, utility tokens) |
| ERC-721 | Non-fungible tokens (tickets, reservations, unique assets) |
| ERC-1155 | Multi-tokens (fractional NFTs, mixed asset baskets) |
| ERC-1410 | Partially fungible (tranched securities) |
| ERC-3643 | Regulated security tokens with identity compliance |
| ERC-4626 | Tokenised vaults (yield-bearing positions) |
| Soulbound | Non-transferable (reputation, credentials) |
| ERC-4337 | Account abstraction (gasless UX) |

---

## Appendix: File Statistics

| Area | File Count |
|------|-----------|
| SDK Core | 27 |
| SDK Modules | 28 |
| SDK Packs | 26 |
| SDK Plugins | ~35 |
| SDK Providers | ~20 |
| SDK Contract Adapters | 6 |
| SDK-React Hooks | 34 |
| SDK-React Components | 8 |
| Server Routes | 65 |
| Server Services | 70+ |
| Server Middleware | 13 |
| Smart Contracts | 50+ |
| UI-Kit Components | 47 |
| **Total estimated** | **~430+ source files** |
