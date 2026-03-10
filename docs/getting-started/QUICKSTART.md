---
sidebar_position: 2
title: Quickstart
---

# 5-Minute Quickstart

This guide takes you from zero to a working tokenised asset in under five minutes. You will install the SDK, create an organisation, onboard an investor, create an asset, deploy a token, and execute a transfer.

## Step 1: Install the SDK

```bash
pnpm add @tokenisation/sdk
```

## Step 2: Create a Client

The `ApiClient` provides a Stripe-like interface for all platform operations. Initialise it with your API key:

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({
  apiKey: 'sk_test_xxxxx',        // Your API key
  baseUrl: 'http://localhost:3001', // API server URL
});
```

:::tip
In sandbox mode, use API keys prefixed with `sk_test_`. For production, use keys prefixed with `sk_live_`.
:::

:::note Individual Package Imports
If you prefer lighter dependencies, you can import from individual packages instead of the umbrella:

```typescript
// These are equivalent:
import { ApiClient } from '@tokenisation/sdk';
import { ApiClient } from '@tokenisation/core';
```

See [Installation — Choosing Your Packages](./INSTALLATION.md#choosing-your-packages) for the full decision tree.
:::

## Step 3: Create an Organisation and Project

Every tokenised asset belongs to a project, which belongs to an organisation.

```typescript
// Create a project
const project = await client.projects.create({
  name: 'Marina Tower Fund',
  jurisdiction: 'DUBAI',
  assetType: 'REAL_ESTATE',
});

console.log('Project created:', project.id);
```

## Step 4: Onboard an Investor

Before an investor can hold tokens, they must be registered and pass compliance checks.

```typescript
const investor = await client.investors.create({
  email: 'alice@example.com',
  jurisdiction: 'AE',
  type: 'INDIVIDUAL',
});

console.log('Investor created:', investor.id);

// In sandbox mode with ENABLE_MOCK_KYC=true, KYC is auto-approved.
// In production, the investor completes KYC via the KYC flow.
```

## Step 5: Create an Asset

Assets represent the real-world item being tokenised -- a property, a ticket, a compute resource, and so on.

```typescript
const asset = await client.assets.create({
  name: 'Dubai Marina Apartment 42B',
  rightType: 'OWNERSHIP',
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'VARA',
    accreditedOnly: false,
    blockedJurisdictions: ['US', 'KP'],
  },
  transferabilityRules: {
    mode: 'COMPLIANCE_GATED',
    requireKyc: true,
    lockupPeriodSeconds: 0,
  },
  metadata: {
    propertyType: 'residential',
    area: 1200,
    areaUnit: 'sqft',
  },
});

console.log('Asset created:', asset.id, 'State:', asset.state);
// State: DRAFT
```

## Step 6: Deploy a Token

Create a security token backed by your asset and deploy it on-chain.

```typescript
// Create the token record
const token = await client.tokens.create({
  name: 'Marina Apartment Token',
  symbol: 'MAT',
  chainId: 137,          // Polygon mainnet (use 31337 for local Hardhat)
  projectId: project.id,
  standard: 'ERC3643',   // T-REX compliant security token
  maxSupply: '1000000',
});

// Deploy to the blockchain
const deployed = await client.tokens.deploy(token.id);

console.log('Token deployed at:', deployed.contractAddress);
```

## Step 7: Issue Tokens to the Investor

Once the token is deployed and the investor has passed KYC, you can issue tokens.

```typescript
const issuance = await client.transfers.create({
  tokenId: token.id,
  from: 'TREASURY',
  to: investor.id,
  amount: '5000',
  type: 'ISSUANCE',
});

console.log('Issuance:', issuance.id, 'Status:', issuance.status);
```

## Step 8: Execute a Transfer

Transfer tokens between two verified investors. The compliance engine automatically validates KYC status, jurisdiction restrictions, lockup periods, and holder limits.

```typescript
// Create a second investor
const bob = await client.investors.create({
  email: 'bob@example.com',
  jurisdiction: 'GB',
  type: 'INDIVIDUAL',
});

// Transfer tokens from Alice to Bob
const transfer = await client.transfers.create({
  tokenId: token.id,
  from: investor.id,
  to: bob.id,
  amount: '1000',
  type: 'TRANSFER',
});

console.log('Transfer:', transfer.id, 'Status:', transfer.status);
// The transfer goes through the compliance saga:
// INITIATED -> COMPLIANCE_CHECK -> APPROVED -> SUBMITTED -> CONFIRMED -> SETTLED
```

## Full Example

Here is the complete script:

```typescript
import { ApiClient } from '@tokenisation/sdk';

async function main() {
  const client = new ApiClient({
    apiKey: 'sk_test_xxxxx',
    baseUrl: 'http://localhost:3001',
  });

  // 1. Create project
  const project = await client.projects.create({
    name: 'Marina Tower Fund',
    jurisdiction: 'DUBAI',
    assetType: 'REAL_ESTATE',
  });

  // 2. Onboard investors
  const alice = await client.investors.create({
    email: 'alice@example.com', jurisdiction: 'AE', type: 'INDIVIDUAL',
  });
  const bob = await client.investors.create({
    email: 'bob@example.com', jurisdiction: 'GB', type: 'INDIVIDUAL',
  });

  // 3. Create asset
  const asset = await client.assets.create({
    name: 'Dubai Marina Apartment 42B',
    rightType: 'OWNERSHIP',
    jurisdiction: { countryCode: 'AE', blockedJurisdictions: ['US', 'KP'] },
    transferabilityRules: { mode: 'COMPLIANCE_GATED', requireKyc: true },
  });

  // 4. Deploy token
  const token = await client.tokens.create({
    name: 'Marina Apartment Token', symbol: 'MAT',
    chainId: 31337, projectId: project.id, standard: 'ERC3643',
  });
  await client.tokens.deploy(token.id);

  // 5. Issue to Alice and transfer to Bob
  await client.transfers.create({
    tokenId: token.id, from: 'TREASURY', to: alice.id,
    amount: '5000', type: 'ISSUANCE',
  });
  await client.transfers.create({
    tokenId: token.id, from: alice.id, to: bob.id,
    amount: '1000', type: 'TRANSFER',
  });

  console.log('Done! Alice holds 4000, Bob holds 1000.');
}

main().catch(console.error);
```

## Next Steps

- [First Project Tutorial](./FIRST_PROJECT.md) -- A comprehensive walkthrough with documents, KYC, and dividends
- [Core Concepts](../CONCEPTS.md) -- Understand the asset lifecycle, compliance engine, and transfer saga
- [Architecture Overview](../architecture/OVERVIEW.md) -- How the platform is structured
