---
sidebar_position: 2
title: TypeScript SDK Reference
---

# TypeScript SDK Reference

The AHOY Tokenisation SDK provides a Stripe-like TypeScript client for the tokenisation platform. Install the umbrella package or individual packages:

```bash
# Umbrella (re-exports everything)
pnpm add @tokenisation/sdk

# Or individual packages
pnpm add @tokenisation/core                          # Foundation only
pnpm add @tokenisation/core @tokenisation/compliance  # + KYC/AML
pnpm add @tokenisation/core @tokenisation/chains      # + Blockchain
pnpm add @tokenisation/realestate                      # UAE real estate (pulls in all three)
```

> **Package imports:** All examples below use `@tokenisation/sdk` for simplicity. You can replace it with the specific package (e.g., `@tokenisation/core` for `ApiClient`, `@tokenisation/realestate` for `DLDClient`).

---

## Initialisation

### createApiClient()

Factory function that creates a configured `ApiClient` instance.

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: process.env.TOKENISATION_API_KEY!, // sk_test_... or sk_live_...
  baseUrl: 'https://api.test.tokenisation.io', // optional, inferred from key prefix
});
```

The environment is automatically detected from the API key prefix: `sk_test_` routes to the sandbox API, and `sk_live_` routes to production.

### ApiClient

The main class instantiated by `createApiClient()`. All platform capabilities are exposed as module properties.

```typescript
const client = new ApiClient({ apiKey: 'sk_test_xxxxx' });

// Modules available:
client.projects      // Project management
client.assets        // Asset lifecycle
client.tokens        // Token creation, deployment, issuance
client.investors     // Investor onboarding, KYC
client.transfers     // Transfer orchestration
client.compliance    // Compliance policies and decisions
client.events        // Event bus queries
client.webhooks      // Webhook endpoint management
client.audit         // Audit trail
client.governance    // Proposals, voting, delegation
client.escrow        // Conditional transfers, milestones
client.cashflow      // Distributions, dividends, payouts
client.dld           // Dubai Land Department integration
client.legal         // KYC/AML compliance, freeze/unfreeze
```

---

## Assets Module

Manage tokenisable real-world assets through their lifecycle.

```typescript
// Create an asset
const asset = await client.assets.create({
  name: 'Dubai Marina Apartment',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE', regulatoryFramework: 'VARA' },
  transferabilityRules: { mode: 'COMPLIANCE_GATED', requireKyc: true },
});

// List assets with filters
const { assets, total } = await client.assets.list({
  state: 'ACTIVE',
  rightType: 'OWNERSHIP',
  limit: 20,
});

// Retrieve a single asset
const fetched = await client.assets.get(asset.id);

// Update (DRAFT only)
await client.assets.update(asset.id, { description: 'Updated description' });

// Transition lifecycle state
await client.assets.transition(asset.id, {
  toState: 'PENDING_VERIFICATION',
  reason: 'Submitted for DLD verification',
});
```

---

## Tokens Module

Create, deploy, and manage security tokens on supported chains.

```typescript
// Create token definition
const token = await client.tokens.create({
  name: 'Marina Tower Token',
  symbol: 'MTT',
  totalSupply: '1000000',
  chainId: 137, // Polygon
  standard: 'ERC3643',
  projectId: project.id,
});

// Deploy to chain
const deployment = await client.tokens.deploy(token.id, {
  deployerAddress: '0xYourDeployer...',
});

// Confirm deployment
await client.tokens.confirmDeployment(token.id, {
  contractAddress: '0xContractAddr...',
  txHash: '0xTxHash...',
  blockNumber: 12345678,
});

// Issue tokens to investor
const issuance = await client.tokens.issue(token.id, {
  investorId: investor.id,
  walletAddress: '0xInvestorWallet...',
  amount: '5000',
});

// Get cap table
const capTable = await client.tokens.getCapTable(token.id);

// Create tranche
const tranche = await client.tokens.createTranche(token.id, {
  name: 'Series A',
  supply: '500000',
  restrictions: { lockupMonths: 12 },
});

// Pause/unpause
await client.tokens.pause(token.id, { reason: 'Regulatory hold' });
await client.tokens.unpause(token.id);
```

---

## Investors Module

Onboard investors with KYC verification and wallet management.

```typescript
// Register investor
const investor = await client.investors.create({
  email: 'alice@example.com',
  type: 'individual',
  countryCode: 'AE',
  taxResidency: 'AE',
});

// Initiate KYC
const kyc = await client.investors.createKycSession(investor.id, {
  provider: 'sumsub',
  levelRequested: 'enhanced',
});

// Manually approve KYC (for authorised approvers)
await client.investors.approveKyc(investor.id, {
  approverId: adminId,
  kycLevel: 'enhanced',
  notes: 'Documents verified manually',
});

// Link wallet
const wallet = await client.investors.addWallet(investor.id, {
  address: '0xInvestorWallet...',
  chainId: 137,
  label: 'Primary Polygon wallet',
});

// Verify wallet ownership
await client.investors.verifyWallet(investor.id, wallet.id, {
  signature: '0xSignature...',
});

// Reverse lookup by wallet
const found = await client.investors.findByWallet('0xInvestorWallet...');
```

---

## Transfers Module

Orchestrate compliant token transfers through the 8-step saga.

```typescript
// One-shot execution (recommended for most use cases)
const result = await client.transfers.execute({
  tokenId: token.id,
  fromWallet: '0xSender...',
  toWallet: '0xReceiver...',
  amount: '1000',
  autoApprove: true,
  mode: 'non_custodial',
});

// Step-by-step flow
const transfer = await client.transfers.create({ tokenId, fromWallet, toWallet, amount });
await client.transfers.precheck(transfer.id);
await client.transfers.approve(transfer.id);
const signed = await client.transfers.sign(transfer.id, { mode: 'non_custodial' });
await client.transfers.submit(transfer.id, { txHash: '0x...' });
await client.transfers.confirm(transfer.id, { blockNumber: 123456 });
await client.transfers.reconcile(transfer.id);
await client.transfers.settle(transfer.id);

// Batch transfers (up to 100)
const batch = await client.transfers.batch({
  transfers: [
    { tokenId, fromWallet, toWallet: '0xA...', amount: '100' },
    { tokenId, fromWallet, toWallet: '0xB...', amount: '200' },
  ],
});

// Gas estimation
const gas = await client.transfers.estimateGas({ tokenId, fromWallet, toWallet, amount });
```

---

## Compliance Module

Create policies, evaluate transfers, and query compliance decisions.

```typescript
// Create policy
const policy = await client.compliance.createPolicy({
  name: 'UAE Transfer Policy',
  type: 'transfer',
  ruleset: {
    version: 1,
    rules: [
      { id: 'kyc', type: 'require', field: 'investor.kycStatus', op: 'eq', value: 'approved' },
      { id: 'geo', type: 'block', field: 'investor.jurisdiction', op: 'in', value: ['US', 'KP'] },
    ],
  },
});

// Evaluate transfer
const decision = await client.compliance.evaluateTransfer({
  tokenId: token.id,
  fromWallet: '0xSender...',
  toWallet: '0xReceiver...',
  amount: '1000',
  policyId: policy.id,
});

// Simulate without persisting
const simulation = await client.compliance.simulate({
  tokenId: token.id,
  fromWallet: '0xA...',
  toWallet: '0xB...',
  amount: '500',
});
```

---

## DLD Module

Integration with the Dubai Land Department for real estate tokenisation.

```typescript
// Register a title deed
const title = await client.dld.registerTitle({
  projectId: project.id,
  dldTitleNumber: 'DLD-2024-001234',
  propertyType: 'unit',
  emirate: 'dubai',
  area: 'Dubai Marina',
  buildingName: 'Marina Tower',
  unitNumber: '1204',
});

// Verify title against DLD
const verification = await client.dld.verifyTitle(title.id);

// Check title is clear (no liens/disputes)
const clearCheck = await client.dld.checkTitleClear(title.id);
```

---

## Webhooks Module

```typescript
// Create endpoint
const endpoint = await client.webhooks.createEndpoint({
  url: 'https://your-app.com/webhooks',
  events: ['transfer.*', 'investor.kyc.*', 'token.deployed'],
});
// Save endpoint.secret securely - shown only once

// List deliveries
const deliveries = await client.webhooks.listDeliveries({ endpointId: endpoint.id });

// Retry a failed delivery
await client.webhooks.retryDelivery(deliveryId);
```

---

## Audit Module

```typescript
// Query audit trail
const events = await client.audit.listEvents({
  assetId: asset.id,
  type: 'ASSET_CREATED',
  limit: 50,
});
```

---

## Error Handling

The SDK provides a structured error hierarchy with 9 error classes and 42 machine-readable error codes. All errors extend `SDKError` and include a `.code`, `.details`, `.timestamp`, and optional `.requestId`.

### Error Hierarchy

| Class | Default Code | Extra Fields | When Thrown |
|-------|-------------|--------------|------------|
| `SDKError` | `UNKNOWN_ERROR` | — | Base class for all SDK errors |
| `AuthenticationError` | `UNAUTHENTICATED` | — | Invalid API key, expired JWT, bad signature |
| `ValidationError` | `VALIDATION_FAILED` | `field`, `constraints` | Bad input, schema mismatch |
| `ComplianceError` | `COMPLIANCE_FAILED` | `violations[]` | KYC, jurisdiction, accreditation failures |
| `ContractError` | `CONTRACT_ERROR` | `contractAddress`, `method`, `transactionHash` | Smart contract call/deploy failures |
| `NetworkError` | `NETWORK_ERROR` | `statusCode`, `url` | HTTP, RPC, rate-limit errors |
| `OracleError` | `ORACLE_ERROR` | `feedId`, `dataTimestamp` | Price feed stale/unavailable |
| `AssetError` | `ASSET_NOT_FOUND` | `assetId`, `tokenId` | Asset/token lookup failures |
| `StorageError` | `STORAGE_ERROR` | `provider`, `key` | S3/IPFS upload/download failures |

### Error Code Reference (51 codes)

#### General

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.UNKNOWN` | `UNKNOWN_ERROR` | Log and retry; escalate if persistent |
| `ErrorCode.INTERNAL` | `INTERNAL_ERROR` | Log and contact support |
| `ErrorCode.INVALID_ARGUMENT` | `INVALID_ARGUMENT` | Fix input and retry |
| `ErrorCode.NOT_FOUND` | `NOT_FOUND` | Check resource ID |
| `ErrorCode.ALREADY_EXISTS` | `ALREADY_EXISTS` | Use idempotency key or skip |
| `ErrorCode.TIMEOUT` | `TIMEOUT` | Retry with backoff |
| `ErrorCode.NOT_INITIALIZED` | `NOT_INITIALIZED` | Call `initialize()` first |

#### Authentication & Authorization

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.UNAUTHENTICATED` | `UNAUTHENTICATED` | Prompt sign-in |
| `ErrorCode.UNAUTHORIZED` | `UNAUTHORIZED` | Check user permissions/role |
| `ErrorCode.SESSION_EXPIRED` | `SESSION_EXPIRED` | Refresh token or re-authenticate |
| `ErrorCode.INVALID_TOKEN` | `INVALID_TOKEN` | Re-authenticate |
| `ErrorCode.SIGNATURE_INVALID` | `SIGNATURE_INVALID` | Re-sign the message |
| `ErrorCode.AUTH_FAILED` | `AUTH_FAILED` | Check credentials |

#### Validation

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.VALIDATION_FAILED` | `VALIDATION_FAILED` | Check `error.field` and `error.constraints` |
| `ErrorCode.SCHEMA_VALIDATION_FAILED` | `SCHEMA_VALIDATION_FAILED` | Fix data format (see Zod schema) |
| `ErrorCode.INVALID_ADDRESS` | `INVALID_ADDRESS` | Verify wallet address format |
| `ErrorCode.INVALID_AMOUNT` | `INVALID_AMOUNT` | Check amount is positive and within bounds |
| `ErrorCode.INVALID_STATE` | `INVALID_STATE` | Check asset lifecycle state before operating |

#### Compliance

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.COMPLIANCE_FAILED` | `COMPLIANCE_FAILED` | Check `error.violations[]` for specific issues |
| `ErrorCode.KYC_REQUIRED` | `KYC_REQUIRED` | Initiate KYC flow for the investor |
| `ErrorCode.KYC_EXPIRED` | `KYC_EXPIRED` | Prompt re-verification |
| `ErrorCode.JURISDICTION_BLOCKED` | `JURISDICTION_BLOCKED` | Investor's region is restricted |
| `ErrorCode.TRANSFER_RESTRICTED` | `TRANSFER_RESTRICTED` | Check lockup, freeze, or compliance hold |
| `ErrorCode.INVESTOR_LIMIT_EXCEEDED` | `INVESTOR_LIMIT_EXCEEDED` | Max holder cap reached |
| `ErrorCode.ACCREDITATION_REQUIRED` | `ACCREDITATION_REQUIRED` | Investor needs accredited status |

#### Contract & Blockchain

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.CONTRACT_ERROR` | `CONTRACT_ERROR` | Check `error.contractAddress` and `error.method` |
| `ErrorCode.CONTRACT_NOT_DEPLOYED` | `CONTRACT_NOT_DEPLOYED` | Deploy contract to target chain first |
| `ErrorCode.CONTRACT_CALL_FAILED` | `CONTRACT_CALL_FAILED` | Check args, gas, and contract state |
| `ErrorCode.TRANSACTION_FAILED` | `TRANSACTION_FAILED` | Check wallet balance and network status |
| `ErrorCode.TRANSACTION_REVERTED` | `TRANSACTION_REVERTED` | Inspect revert reason in `error.details` |
| `ErrorCode.INSUFFICIENT_BALANCE` | `INSUFFICIENT_BALANCE` | Fund the wallet |
| `ErrorCode.INSUFFICIENT_ALLOWANCE` | `INSUFFICIENT_ALLOWANCE` | Call `approve()` first |
| `ErrorCode.GAS_ESTIMATION_FAILED` | `GAS_ESTIMATION_FAILED` | Transaction would likely revert — check inputs |
| `ErrorCode.NONCE_TOO_LOW` | `NONCE_TOO_LOW` | Retry (nonce conflict from concurrent txs) |

#### Network

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.NETWORK_ERROR` | `NETWORK_ERROR` | Check connectivity; retry |
| `ErrorCode.RPC_ERROR` | `RPC_ERROR` | RPC node down — try fallback provider |
| `ErrorCode.RATE_LIMITED` | `RATE_LIMITED` | Back off and retry (check `Retry-After` header) |
| `ErrorCode.SERVICE_UNAVAILABLE` | `SERVICE_UNAVAILABLE` | Service down — retry with backoff |
| `ErrorCode.CIRCUIT_OPEN` | `CIRCUIT_OPEN` | Circuit breaker tripped — wait before retrying |

#### Asset & Token

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.ASSET_NOT_FOUND` | `ASSET_NOT_FOUND` | Verify asset ID |
| `ErrorCode.TOKEN_NOT_FOUND` | `TOKEN_NOT_FOUND` | Verify token ID |
| `ErrorCode.INVALID_TOKEN_STANDARD` | `INVALID_TOKEN_STANDARD` | Use a supported standard (ERC-20/721/1155/3643) |
| `ErrorCode.MINTING_PAUSED` | `MINTING_PAUSED` | Wait for admin to unpause |
| `ErrorCode.TRANSFER_PAUSED` | `TRANSFER_PAUSED` | Transfers halted — check compliance status |
| `ErrorCode.ACCOUNT_FROZEN` | `ACCOUNT_FROZEN` | Contact compliance team |

#### Oracle

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.ORACLE_ERROR` | `ORACLE_ERROR` | Check oracle feed health |
| `ErrorCode.ORACLE_STALE_DATA` | `ORACLE_STALE_DATA` | Wait for fresh data update |
| `ErrorCode.ORACLE_UNAVAILABLE` | `ORACLE_UNAVAILABLE` | Fallback to secondary oracle or wait |

#### Storage

| Constant | String Value | Recommended Handling |
|----------|-------------|---------------------|
| `ErrorCode.STORAGE_ERROR` | `STORAGE_ERROR` | Check storage provider status |
| `ErrorCode.UPLOAD_FAILED` | `UPLOAD_FAILED` | Retry upload; check file size limits |
| `ErrorCode.DOWNLOAD_FAILED` | `DOWNLOAD_FAILED` | Verify CID/key exists; retry |

### Error Handling Example

```typescript
import {
  isSDKError,
  hasErrorCode,
  ErrorCode,
  ComplianceError,
  NetworkError,
  ValidationError,
  formatErrorForUser,
} from '@tokenisation/sdk';

try {
  await client.transfers.create({ tokenId, fromWallet, toWallet, amount });
} catch (error) {
  if (error instanceof ComplianceError) {
    // Access violation details
    for (const v of error.violations) {
      console.log(`Rule ${v.ruleId}: ${v.reason}`);
    }
  } else if (error instanceof ValidationError) {
    console.log(`Field "${error.field}" failed:`, error.constraints);
  } else if (error instanceof NetworkError && error.statusCode === 429) {
    // Rate limited — back off
    await sleep(5000);
  } else if (isSDKError(error)) {
    // Generic SDK error handling
    if (hasErrorCode(error, ErrorCode.KYC_REQUIRED)) {
      redirectToKYC();
    } else {
      // Show user-friendly message
      showToast(formatErrorForUser(error));
    }
  }
}
```

### Utility Functions

| Function | Description |
|----------|-------------|
| `isSDKError(error)` | Type guard — returns `true` if error is an `SDKError` instance |
| `hasErrorCode(error, code)` | Check if an error has a specific `ErrorCode` |
| `wrapError(error, message?, code?)` | Wrap any `unknown` error into an `SDKError` |
| `getErrorMessage(error)` | Safely extract error message from `unknown` |
| `formatErrorForUser(error)` | Map error code to a user-friendly string |

---

## TypeScript Types

The SDK exports all request and response types for full type safety:

```typescript
import type {
  TokenizationSDKConfig,
  Asset,
  Token,
  Investor,
  Transfer,
  ComplianceDecision,
  Distribution,
  VestingSchedule,
  WebhookEndpoint,
} from '@tokenisation/sdk';
```

---

## Advanced: TokenisationSDK Class

For local/offline operations (policy evaluation, state machine, lifecycle engine) without API calls:

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK();

// Local asset creation with lifecycle engine
const asset = await sdk.assets.create({
  name: 'Test Property',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
});

// Local policy evaluation
const result = sdk.compliance.evaluate(ruleset, context);
```

This class uses an in-memory event store and is useful for testing, simulations, and offline-first architectures.
