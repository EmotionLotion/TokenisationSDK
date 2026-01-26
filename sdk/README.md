# Tokenisation SDK

> The Stripe of Real-World Asset Tokenization

A TypeScript SDK for building tokenized asset applications with built-in compliance, multi-chain support, and lifecycle management.

## Features

- **Multi-Asset Support** - Tokenize ownership, access, behavior, and verification rights
- **Compliance Engine** - KYC, accreditation, jurisdiction rules built-in
- **Lifecycle Management** - State machine for asset lifecycle (Draft → Active → Redeemed)
- **Multi-Chain** - Deploy to Base, Polygon, Ethereum
- **Plugin Architecture** - Swap compliance, storage, oracle, and chain plugins
- **Audit Trail** - Complete event history for compliance

## Installation

```bash
npm install @tokenisation/sdk
```

## Quick Start

```typescript
import { TokenisationSDK, RightType, PartyType, PartyRole } from '@tokenisation/sdk';

// Initialize
const sdk = new TokenisationSDK({ useMockPlugins: true });

// Create parties
const issuer = sdk.parties_.create({
  name: 'Property Corp',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'US',
});
sdk.parties_.setKyc(issuer.id, true);

// Tokenize an asset
const asset = await sdk.assets.create({
  name: 'Manhattan Office Building',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
});

// Activate and mint
await sdk.assets.verify(asset.id, issuer.id);
await sdk.assets.activate(asset.id, issuer.id);
await sdk.tokens.mint(asset.id, investor.id, '1000');
```

## Documentation

| Document | Description |
|----------|-------------|
| [Quick Start](../docs/QUICKSTART.md) | 5-minute getting started |
| [MVP Showcase](../docs/MVP_SHOWCASE.md) | Complete feature documentation |
| [Technical Review](../docs/SDK_REVIEW_AND_ROADMAP.md) | Architecture and roadmap |
| [Executive Summary](../docs/EXECUTIVE_SUMMARY.md) | Business overview |

## Examples

```bash
cd examples/real-estate-demo
npm install
npm run demo           # Real estate tokenization
npm run demo:carbon    # Carbon credits
npm run demo:loyalty   # Loyalty points
```

## Asset Types

| Type | Description | Examples |
|------|-------------|----------|
| `OWNERSHIP` | Title to property | Real estate, IP, art |
| `ACCESS` | Permission to use | Tickets, memberships |
| `BEHAVIOR` | Reputation/scores | Loyalty points, ratings |
| `VERIFICATION` | Proof of action | Carbon credits, certificates |

## API Reference

### Party Management
```typescript
sdk.parties_.create(params)      // Create party
sdk.parties_.setKyc(id, true)    // Verify KYC
sdk.parties_.freeze(id, reason)  // Freeze party
```

### Asset Management
```typescript
sdk.assets.create(params)                    // Create asset
sdk.assets.transition(id, state, actorId)    // Change state
sdk.assets.verify(id, verifierId)            // Verify
sdk.assets.activate(id, actorId)             // Activate
```

### Token Operations
```typescript
sdk.tokens.mint(assetId, to, amount)              // Mint
sdk.tokens.transfer(assetId, from, to, amount)    // Transfer
sdk.tokens.burn(assetId, from, amount)            // Burn
sdk.tokens.getBalance(assetId, address)           // Balance
```

## Pre-built React Components

Drop-in React components for tokenization apps. Similar to Stripe Elements.

```bash
npm install @tokenisation/sdk react
```

### TokenizeButton
One-click button to open the tokenization wizard.

```tsx
import { TokenizeButton } from '@tokenisation/sdk';

<TokenizeButton
  sdk={sdk}
  issuerId={issuer.id}
  onSuccess={(asset) => console.log('Created:', asset)}
  buttonText="Create Token"
  variant="primary"
  size="lg"
/>
```

### AssetWizard
Multi-step wizard for creating tokenized assets (similar to Stripe Checkout).

```tsx
import { AssetWizard } from '@tokenisation/sdk';

<AssetWizard
  sdk={sdk}
  issuerId={issuer.id}
  onSuccess={(asset) => console.log('Created:', asset)}
  onClose={() => setShowWizard(false)}
/>
```

### AssetCard
Display asset information in a card format.

```tsx
import { AssetCard } from '@tokenisation/sdk';

<AssetCard
  asset={myAsset}
  showMetadata
  onAction={(action) => handleAction(action)}
/>
```

### TransferForm
Pre-built form for transferring tokens between parties.

```tsx
import { TransferForm } from '@tokenisation/sdk';

<TransferForm
  assetId={asset.id}
  fromPartyId={sender.id}
  parties={allParties}
  balance="1000"
  symbol="PROP"
  onTransfer={async (to, amount) => {
    await sdk.tokens.transfer(asset.id, sender.id, to, amount);
    return { success: true };
  }}
/>
```

### BalanceDisplay
Show token balance with optional USD value.

```tsx
import { BalanceDisplay } from '@tokenisation/sdk';

<BalanceDisplay
  balance="1000000"
  symbol="PROP"
  decimals={18}
  usdValue="250000"
  showChange
  changePercent={2.5}
  size="lg"
/>
```

### Status Components

```tsx
import { LifecycleStatus, KYCBadge, PartyBadge } from '@tokenisation/sdk';

// Show asset lifecycle state
<LifecycleStatus state={asset.state} size="md" />

// Show KYC verification status
<KYCBadge
  verified={party.kycVerified}
  level="FULL"
  expiryDate="2025-12-31"
/>

// Show party info with avatar
<PartyBadge party={investor} showKyc />
```

### Theming

All components support custom theming:

```tsx
import { TokenizeButton, type TokenisationTheme } from '@tokenisation/sdk';

const customTheme: TokenisationTheme = {
  colors: {
    primary: '#00D4FF',
    secondary: '#7B61FF',
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    background: '#0A0A0A',
    surface: '#1A1A1A',
    border: '#2A2A2A',
    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
  },
  fonts: {
    family: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
  borderRadius: { sm: '4px', md: '8px', lg: '12px' },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px' },
};

<TokenizeButton sdk={sdk} issuerId={id} theme={customTheme} />
```

## Production Mode

Switch from mock plugins to production by providing backend configuration:

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({
  useMockPlugins: false,
  production: {
    apiEndpoint: 'https://api.tokenisation.io',
    apiKey: 'your-api-key',
    jurisdiction: {
      defaultAllow: false,
      failClosed: true,
    },
    kyc: {
      defaultRequiredLevel: 2,
      requireKycForTransfers: true,
    },
  },
  chain: {
    chainId: 137, // Polygon
    rpcUrl: 'https://polygon-rpc.com',
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
  },
});

// Check if in production mode
console.log('Production:', sdk.isProductionMode());
```

## Contract Deployment

Deploy tokenization contracts to any supported EVM chain:

```typescript
import {
  createDeploymentService,
  CHAINLINK_ETH_USD_FEEDS
} from '@tokenisation/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(`0x${process.env.PRIVATE_KEY}`);

const deployer = createDeploymentService({
  chain: 'sepolia', // or 'polygon', 'base', 'arbitrum', etc.
  account,
  rpcUrl: process.env.RPC_URL, // optional
});

// Deploy all infrastructure contracts
const { contracts, deployments } = await deployer.deployInfrastructure();
console.log('Identity Registry:', contracts.identityRegistry);
console.log('Compliance:', contracts.modularCompliance);

// Deploy a compliance token
const token = await deployer.deployToken({
  name: 'Marina Tower Shares',
  symbol: 'MTS',
  identityRegistryAddress: contracts.identityRegistry,
});
console.log('Token at:', token.address);

// Deploy oracle infrastructure
const priceFeed = await deployer.deployPriceFeed(
  CHAINLINK_ETH_USD_FEEDS[11155111] // Sepolia ETH/USD feed
);
const oracleRegistry = await deployer.deployOracleRegistry(priceFeed.address);
```

### Supported Chains

| Chain | ID | Testnet |
|-------|-----|---------|
| Ethereum | 1 | Sepolia (11155111) |
| Polygon | 137 | - |
| Base | 8453 | Base Sepolia (84532) |
| Arbitrum | 42161 | Arbitrum Sepolia (421614) |
| Optimism | 10 | - |

## Contract ABIs

Access compiled ABIs for direct contract interaction:

```typescript
import { abis, ComplianceTokenAbi, IdentityRegistryAbi } from '@tokenisation/sdk';

// All available ABIs
console.log(Object.keys(abis));
// ['ComplianceToken', 'IdentityRegistry', 'DividendDistributor', ...]

// Use with viem
import { getContract } from 'viem';

const tokenContract = getContract({
  address: '0x...',
  abi: ComplianceTokenAbi,
  client: publicClient,
});

const balance = await tokenContract.read.balanceOf(['0x...']);
```

## Compliance Plugins

### Jurisdiction Plugin

Supports regulatory frameworks: UAE_VARA, UAE_ADGM, UAE_DIFC, US_SEC, US_FINRA, EU_MiFID, EU_MiCA, UK_FCA, SG_MAS

```typescript
import { createJurisdictionPlugin } from '@tokenisation/sdk';

const jurisdictionPlugin = createJurisdictionPlugin({
  rules: {
    AE: {
      framework: 'UAE_VARA',
      allowedRightTypes: ['OWNERSHIP', 'ACCESS'],
      requiredKycLevel: 2,
      requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
    },
    US: {
      framework: 'US_SEC',
      requireAccreditation: true,
      holdingPeriodDays: 365,
      maxInvestorCount: 2000,
    },
  },
});

// Check if asset can be created
const result = await jurisdictionPlugin.canCreateAsset(asset);
if (!result.allowed) {
  console.error('Blocked:', result.reason);
  console.log('Required docs:', result.requiredDocuments);
}

// Check if transfer is allowed
const transferResult = await jurisdictionPlugin.canTransfer(context, 'AE', 'US');
```

### KYC Compliance Plugin

```typescript
import { createKYCCompliancePlugin } from '@tokenisation/sdk';

const kycPlugin = createKYCCompliancePlugin(
  'https://api.tokenisation.io',
  'your-api-key',
  {
    defaultRequiredLevel: 2,
    requireKycForTransfers: true,
    blockedRegions: ['KP', 'IR', 'CU', 'SY'],
    expiryWarningDays: 30,
  }
);

// Get party compliance status
const status = await kycPlugin.getPartyStatus(partyId);

// Initiate KYC verification
const { sessionUrl, sessionId } = await kycPlugin.initiateKYC(
  partyId,
  2, // KYC level (1-3)
  'sumsub' // provider: 'sumsub' | 'onfido' | 'jumio'
);

// Evaluate transfer compliance
const result = await kycPlugin.evaluateTransfer(
  context,
  fromStatus,
  toStatus
);
if (!result.compliant) {
  console.log('Violations:', result.violations);
}
```

## Distribution & Dividends

```typescript
// Create distribution schedule
const schedule = sdk.cashFlow.createSchedule({
  assetId: asset.id,
  type: 'DIVIDEND',
  frequency: 'QUARTERLY',
  paymentCurrency: 'USDC',
  allocationStrategy: 'PRO_RATA',
});

// Execute distribution
const distribution = await sdk.cashFlow.executeDistribution({
  scheduleId: schedule.id,
  totalAmount: '100000',
  snapshotBlock: await provider.getBlockNumber(),
});
```

## Backend Integration

The SDK is designed to work with the Tokenisation Backend API:

```typescript
import { ApiClient, createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  baseUrl: 'https://api.tokenisation.io',
  apiKey: 'your-api-key',
});

// Organizations
const org = await client.organizations.create({ name: 'Acme Corp' });

// Projects
const project = await client.projects.create(org.id, {
  name: 'Real Estate Fund',
  type: 'real_estate',
});

// Investors
const investor = await client.investors.create(project.id, {
  email: 'investor@example.com',
  type: 'individual',
});

// Tokens
const token = await client.tokens.create(project.id, {
  name: 'Fund Shares',
  symbol: 'FND',
  totalSupply: '1000000000000000000000000',
});
```

## License

MIT
