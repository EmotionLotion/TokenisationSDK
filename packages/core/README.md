# @tokenisation/core

> Asset-class-agnostic foundation for compliant tokenization

The core package provides the engines, modules, plugins, and error hierarchy that every other `@tokenisation/*` package builds on. Partners building non-real-estate applications (airline tickets, loyalty points, GPU compute, etc.) can import **only** this package.

## Installation

```bash
pnpm add @tokenisation/core
```

## Quick Start

### API Client (Stripe-like)

```typescript
import { createApiClient } from '@tokenisation/core';

const client = createApiClient({
  apiKey: 'sk_test_xxxxx',
  baseUrl: 'http://localhost:3001',
});

const asset = await client.assets.create({
  name: 'Marina Heights',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
});

const token = await client.tokens.create({
  name: 'MHT', symbol: 'MHT', chainId: 137, projectId: project.id,
});
await client.tokens.deploy(token.id);
```

### TokenisationSDK (Local / Offline)

```typescript
import { TokenisationSDK, RightType, PartyType, PartyRole } from '@tokenisation/core';

const sdk = new TokenisationSDK({ useMockPlugins: true });

const asset = await sdk.assets.create({
  name: 'Test Property',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'AE' },
});

await sdk.assets.verify(asset.id, issuer.id);
await sdk.assets.activate(asset.id, issuer.id);
await sdk.tokens.mint(asset.id, investor.id, '1000');
```

### Event-Driven Factory

```typescript
import { createTokenisationSDK } from '@tokenisation/core';

const { sdk, subscribe } = createTokenisationSDK({
  onStatusUpdate: (assetId, from, to) => console.log(`${assetId}: ${from} -> ${to}`),
  onComplianceFailure: (assetId, reason) => console.warn(`Blocked: ${reason}`),
});
```

## What's Inside

| Category | Components |
|----------|-----------|
| **Engines** | `LifecycleEngine`, `ComplianceEngine`, `PolicyEvaluator`, `CashFlowEngine`, `GovernanceEngine`, `EscrowEngine`, `IndexingEngine` |
| **State Machines** | `StateMachine`, `StateMachineRegistry`, `STANDARD_LIFECYCLE`, `SIMPLE_LIFECYCLE`, `GOVERNANCE_LIFECYCLE`, `FINANCIAL_LIFECYCLE` |
| **Orchestration** | `SagaOrchestrator`, `CrossPackEventBus`, `PortableComplianceRegistry`, `SharedIdentityRegistry`, `UnifiedAuditLog` |
| **Custody** | `CustodyManager` (self, managed, institutional, MPC), recovery workflows, delegation |
| **Resilience** | `ResilientClient`, circuit breakers, retry with exponential backoff |
| **Disaster Recovery** | `DisasterRecoveryService`, health checks, stuck-state recovery, safe-fail modes |
| **Asset Abstraction** | `AssetType`, `InvestorClass`, `LiquidityProfile`, `FractionalizationType` — maps business terms to token standards |
| **Decision Receipts** | `createReceipt`, `receiptChain`, `verifyReceipt` — cryptographic compliance proofs |
| **Offline** | `NetworkDetector`, `SyncManager`, `OfflineQueue` — offline-first operation queuing |
| **API Client** | `ApiClient`, `createApiClient`, `HttpClient`, `BrowserHttpClient` |
| **OAuth** | `OAuthTokenManager`, `createOAuthFetch` |
| **Pagination** | `paginate`, `collectAll`, `collectBatches`, `Paginator` |
| **Validation** | `isValidAddress`, `isValidUUID`, `isValidTokenAmount`, `sanitizeString`, `withValidation` |
| **Providers** | Mock implementations for KYC, custody, payment, settlement, exchange, DLD |
| **Production Infra** | Middleware, storage, secrets, queue, audit, API route helpers |
| **Components** | Pre-built React components (TokenizeButton, AssetWizard, AssetCard) |
| **Connectors** | Travel PSS (Amadeus, Sabre, Travelport), Vast.ai |

## Key Exports

### Classes

```typescript
import {
  TokenisationSDK,
  ApiClient,
  LifecycleEngine,
  ComplianceEngine,
  PolicyEvaluator,
  StateMachine,
  CustodyManager,
  IndexingEngine,
  SagaOrchestrator,
  CrossPackEventBus,
  DisasterRecoveryService,
  AssetIssuanceService,
  ResilientClient,
  OAuthTokenManager,
  HookManager,
  CashFlowEngine,
  GovernanceEngine,
  EscrowEngine,
} from '@tokenisation/core';
```

### Factories

```typescript
import {
  createApiClient,
  createTokenisationSDK,
  createOAuthTokenManager,
  createOAuthFetch,
  createKYCResilientClient,
  createPaymentResilientClient,
  createBlockchainResilientClient,
  createDisasterRecoveryService,
  createReceipt,
} from '@tokenisation/core';
```

### Error Classes

```typescript
import {
  SDKError,             // Base class — all errors extend this
  AuthenticationError,  // 401/403 (default: UNAUTHENTICATED)
  ValidationError,      // Bad input (default: VALIDATION_FAILED)
  ComplianceError,      // Compliance check failure (default: COMPLIANCE_FAILED)
  ContractError,        // Smart contract failure (default: CONTRACT_ERROR)
  NetworkError,         // HTTP/RPC failure (default: NETWORK_ERROR)
  OracleError,          // Price feed issues (default: ORACLE_ERROR)
  AssetError,           // Asset/token not found (default: ASSET_NOT_FOUND)
  StorageError,         // S3/IPFS failure (default: STORAGE_ERROR)
  ErrorCode,            // 42 error code constants
  isSDKError,           // Type guard
  hasErrorCode,         // Code matcher
  wrapError,            // Wrap unknown errors
  formatErrorForUser,   // User-friendly messages
} from '@tokenisation/core';
```

### Types

```typescript
import type {
  SDKConfig,
  RightModel,
  Jurisdiction,
  TransferContext,
  ILifecycleEngine,
  IPluginRegistry,
  IJurisdictionPlugin,
  ICompliancePlugin,
  IOraclePlugin,
  IStoragePlugin,
  IChainPlugin,
  ITokenAdapter,
  IKYCProvider,
  ICustodyProvider,
  StateMachineConfig,
  StateContext,
  DecisionReceipt,
  AssetDescriptor,
  ComplianceResult,
} from '@tokenisation/core';
```

## Related Packages

| Package | Description |
|---------|-------------|
| [`@tokenisation/compliance`](../compliance/README.md) | KYC/AML, identity claims, jurisdiction enforcement |
| [`@tokenisation/chains`](../chains/README.md) | Blockchain interaction, smart contracts, oracles |
| [`@tokenisation/realestate`](../realestate/README.md) | UAE real estate tokenization with DLD and VARA |
| [`@tokenisation/sdk`](../../sdk/README.md) | Umbrella package — re-exports all of the above |
