---
sidebar_position: 2
title: TypeScript SDK Reference
---

# TypeScript SDK Reference

The AHOY Tokenisation SDK provides a Stripe-like TypeScript client for the tokenisation platform. Install it from npm:

```bash
npm install @tokenisation/sdk
```

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

All SDK methods throw `TokenizationError` on failure.

```typescript
import { TokenizationError } from '@tokenisation/sdk';

try {
  await client.tokens.deploy(tokenId, { deployerAddress });
} catch (error) {
  if (error instanceof TokenizationError) {
    console.error(`[${error.code}] ${error.message}`);
    console.error(`Status: ${error.statusCode}`);
    console.error(`Request ID: ${error.requestId}`);
  }
}
```

Common error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMIT_EXCEEDED`, `CONFLICT`, `INTERNAL_ERROR`.

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
