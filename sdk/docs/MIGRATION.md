# Migration Guide: TokenisationSDK to ApiClient

This guide helps you migrate from the deprecated `TokenisationSDK` class to the production-ready `ApiClient`.

## Why Migrate?

The `TokenisationSDK` class stores all state in memory, which means:
- **Data is lost on restart** - All assets, proposals, escrows, and distributions are lost
- **No multi-instance support** - State is not shared between instances
- **No persistence** - There's no database backing for production use

The `ApiClient` is a thin Stripe-like SDK that:
- **Persists all state on the server** - Data survives restarts
- **Supports multi-instance** - All instances share the same state via the backend
- **Production-ready** - Designed for real-world deployments

## Quick Start

### Before (TokenisationSDK)

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK();

// Create an asset
const asset = await sdk.assets.create({
  name: 'Dubai Marina Apartment',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
});

// Use governance
const proposal = sdk.governance.createProposal({
  assetId: asset.id,
  title: 'Increase rent',
  description: 'Proposal to increase monthly rent by 5%',
});

// Use escrow
const escrow = sdk.escrow.createEscrow({
  type: 'MILESTONE',
  title: 'Property purchase',
  assetId: asset.id,
  amount: '1000000',
  currency: 'AED',
});
```

### After (ApiClient)

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({
  apiKey: 'sk_live_your_api_key',
  baseUrl: 'https://api.tokenisation.io', // Optional, defaults to production
});

// Create an asset
const asset = await client.assets.create({
  name: 'Dubai Marina Apartment',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
});

// Use governance
const proposal = await client.governance.createProposal({
  assetId: asset.id,
  type: 'GENERAL',
  title: 'Increase rent',
  description: 'Proposal to increase monthly rent by 5%',
});

// Use escrow
const escrow = await client.escrow.create({
  type: 'MILESTONE',
  title: 'Property purchase',
  assetId: asset.id,
  amount: '1000000',
  currency: 'AED',
  parties: [{ partyId: 'buyer-1', role: 'DEPOSITOR' }],
});
```

## Module Migration Reference

### Governance

| TokenisationSDK | ApiClient |
|-----------------|-----------|
| `sdk.governance.createProposal()` | `client.governance.createProposal()` |
| `sdk.governance.vote()` | `client.governance.castVote()` |
| `sdk.governance.getProposal()` | `client.governance.getProposal()` |
| `sdk.governance.executeProposal()` | `client.governance.executeProposal()` |
| `sdk.governance.delegate()` | `client.governance.delegate()` |

### Escrow

| TokenisationSDK | ApiClient |
|-----------------|-----------|
| `sdk.escrow.createEscrow()` | `client.escrow.create()` |
| `sdk.escrow.fundEscrow()` | `client.escrow.fund()` |
| `sdk.escrow.releaseEscrow()` | `client.escrow.release()` |
| `sdk.escrow.cancelEscrow()` | `client.escrow.cancel()` |
| `sdk.escrow.dispute()` | `client.escrow.dispute()` |
| `sdk.escrow.addMilestone()` | `client.escrow.addMilestone()` |

### Cash Flow / Distributions

| TokenisationSDK | ApiClient |
|-----------------|-----------|
| `sdk.cashFlow.createSchedule()` | `client.cashflow.scheduleDistribution()` |
| `sdk.cashFlow.executeDistribution()` | `client.cashflow.processDistribution()` |
| `sdk.cashFlow.getSchedulesForAsset()` | `client.cashflow.listSchedules()` |
| `sdk.cashFlow.getDistributionsForAsset()` | `client.cashflow.getDistributionHistory()` |
| `sdk.cashFlow.claimPayout()` | `client.cashflow.claimPayout()` |

### Assets

| TokenisationSDK | ApiClient |
|-----------------|-----------|
| `sdk.assets.create()` | `client.assets.create()` |
| `sdk.assets.get()` | `client.assets.get()` |
| `sdk.assets.update()` | `client.assets.update()` |
| `sdk.assets.list()` | `client.assets.list()` |

### Tokens

| TokenisationSDK | ApiClient |
|-----------------|-----------|
| `sdk.tokens.mint()` | `client.tokens.issue()` |
| `sdk.tokens.burn()` | `client.tokens.redeem()` |
| `sdk.tokens.transfer()` | `client.transfers.create()` |

## New Features in ApiClient

### DLD Integration (Dubai Land Department)

```typescript
// Verify a title deed
const titleDeed = await client.dld.verify({
  deedNumber: 'DEED-123456',
});

// Check tokenization eligibility
const eligibility = await client.dld.canTokenize({
  propertyId: titleDeed.propertyId,
});

// Notify DLD of tokenization
const notification = await client.dld.notifyTokenization({
  propertyId: titleDeed.propertyId,
  deedNumber: titleDeed.deedNumber,
  tokenContractAddress: '0x...',
  totalSupply: '1000000',
  issuerDetails: {
    name: 'My Company',
    registrationNumber: 'REG-123',
    jurisdiction: 'AE',
  },
});
```

### Enhanced Governance

```typescript
// Configure governance for an asset
await client.governance.configure(assetId, {
  votingStrategy: 'TOKEN_WEIGHTED',
  quorumType: 'PERCENTAGE',
  quorumValue: 50,
  votingPeriodSeconds: 86400 * 7, // 7 days
  allowDelegation: true,
});

// Get voting power
const power = await client.governance.getVotingPower(assetId, voterId);
console.log(`Total voting power: ${power.totalPower}`);
```

### Enhanced Escrow with Milestones

```typescript
// Create milestone-based escrow
const escrow = await client.escrow.create({
  type: 'MILESTONE',
  title: 'Property Development',
  assetId: asset.id,
  amount: '10000000',
  currency: 'AED',
  parties: [
    { partyId: 'developer', role: 'BENEFICIARY' },
    { partyId: 'investor', role: 'DEPOSITOR' },
    { partyId: 'auditor', role: 'ARBITER' },
  ],
});

// Add milestones
await client.escrow.addMilestone(escrow.id, {
  title: 'Foundation Complete',
  amount: '3000000',
  percentage: 30,
  order: 1,
});

// Submit evidence for milestone
await client.escrow.submitMilestoneEvidence(escrow.id, milestoneId, {
  type: 'inspection_report',
  uri: 'https://storage.example.com/report.pdf',
});

// Approve milestone
await client.escrow.approveMilestone(escrow.id, milestoneId, {
  approved: true,
  comments: 'Foundation verified by inspector',
});
```

## Offline Mode (Development Only)

If you need to use the SDK offline for development or testing, you can still use the offline engines:

```typescript
import { offline } from '@tokenisation/sdk';

// WARNING: All state is lost on restart!
const governanceEngine = new offline.GovernanceEngine();
const escrowEngine = new offline.EscrowEngine();
const cashFlowEngine = new offline.CashFlowEngine();
```

These are re-exported from the original modules with deprecation warnings and should only be used for:
- Local development without a backend
- Unit testing
- Offline-first applications with custom persistence

## API Key Management

The ApiClient uses API keys for authentication:

```typescript
// Test mode (sk_test_*)
const testClient = new ApiClient({
  apiKey: 'sk_test_abc123',
});

// Live mode (sk_live_*)
const liveClient = new ApiClient({
  apiKey: 'sk_live_xyz789',
});
```

The SDK automatically detects the environment from the API key prefix.

## Error Handling

The ApiClient throws `TokenizationError` for API errors:

```typescript
import { TokenizationError } from '@tokenisation/sdk';

try {
  const asset = await client.assets.create({ ... });
} catch (error) {
  if (error instanceof TokenizationError) {
    console.error(`Error: ${error.message}`);
    console.error(`Code: ${error.code}`);
    console.error(`Status: ${error.statusCode}`);
    console.error(`Request ID: ${error.requestId}`);
  }
}
```

## Validation

The ApiClient validates all inputs using Zod schemas:

```typescript
import { ValidationError, schemas } from '@tokenisation/sdk';

// Validate before calling API
try {
  const validated = schemas.createAsset.parse({
    name: 'My Asset',
    rightType: 'OWNERSHIP',
    jurisdiction: { countryCode: 'AE' },
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.errors);
  }
}
```

## Getting Help

- Documentation: https://docs.tokenisation.io
- API Reference: https://api.tokenisation.io/docs
- GitHub Issues: https://github.com/tokenisation/sdk/issues
- Support: support@tokenisation.io
