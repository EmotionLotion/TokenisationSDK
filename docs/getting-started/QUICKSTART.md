# Tokenisation SDK - Quick Start Guide

Get your first asset tokenized and transfer tokens in minutes.

---

## Prerequisites

- Node.js 18+
- npm 9+
- Running API server (see below)

---

## 1. Start the API Server

```bash
cd server
cp .env.example .env  # Copy environment template
npm run dev           # Starts on http://localhost:3001
```

The server uses SQLite by default for development - no database setup required.

---

## 2. Install the SDK

```bash
npm install @tokenisation/sdk
```

---

## 3. Initialize the API Client

```typescript
import { ApiClient, RightType } from '@tokenisation/sdk';

// For development with AUTH_DEV_MODE=true
const client = new ApiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'sk_dev_test', // Any key works in dev mode
});

// For production
const prodClient = new ApiClient({
  apiKey: 'sk_live_your-actual-api-key',
  baseUrl: 'https://api.your-platform.com',
});
```

---

## 4. Create a Project

Projects organize your tokenization work:

```typescript
const project = await client.projects.create({
  name: 'Dubai Marina Real Estate Fund',
  description: 'Tokenized luxury real estate portfolio',
  jurisdiction: 'AE',
  assetType: 'real_estate',
});

console.log('Project created:', project.id);
```

---

## 5. Create an Asset

Assets represent the underlying tokenizable item:

```typescript
const asset = await client.assets.create({
  name: 'Marina Heights - Unit 1501',
  description: 'Luxury waterfront apartment',
  rightType: RightType.OWNERSHIP,
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'DIFC',
  },
  projectId: project.id,
  metadata: {
    propertyType: 'RESIDENTIAL',
    bedrooms: 3,
    sqft: 2500,
    valuation: 5000000,
  },
});

// Activate the asset
await client.assets.activate(asset.id);
console.log('Asset active:', asset.id);
```

---

## 6. Onboard Investors

Create investors and complete KYC:

```typescript
// Create an investor
const investor = await client.investors.create({
  email: 'investor@example.com',
  name: 'John Doe',
  jurisdiction: 'US',
  type: 'individual',
  accredited: true,
});

// Add their wallet
const wallet = await client.investors.addWallet(investor.id, {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chainId: 8453, // Base
  walletType: 'eoa',
});

// Complete KYC (in production, integrate with a KYC provider)
await client.investors.approveKyc(investor.id, 'Manual verification');

// Activate the investor
await client.investors.activate(investor.id);
console.log('Investor active:', investor.id);
```

---

## 7. Create and Deploy a Token

```typescript
// Create token definition
const token = await client.tokens.create({
  name: 'Marina Heights Token',
  symbol: 'MHT',
  decimals: 18,
  maxSupply: '1000000000000000000000000', // 1M tokens
  chainId: 8453, // Base
  assetId: asset.id,
  projectId: project.id,
});

// Deploy to blockchain (uses UUPS upgradeable proxy)
const deployed = await client.tokens.deploy(token.id);
console.log('Token deployed:', deployed.contractAddress);
```

---

## 8. Issue Tokens to Investors

```typescript
// IMPORTANT: idempotencyKey is REQUIRED to prevent duplicate issuances
const issuance = await client.tokens.issue(token.id, {
  investorId: investor.id,
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '100000000000000000000', // 100 tokens
  idempotencyKey: 'issue-investor1-batch1', // Must be unique
});

console.log('Issuance status:', issuance.status);
// Status: pending → submitted → confirmed
```

---

## 9. Transfer Tokens

```typescript
// Compliance checks happen automatically
// IMPORTANT: idempotencyKey is REQUIRED
const transfer = await client.transfers.create({
  tokenId: token.id,
  fromWallet: '0x1234567890abcdef1234567890abcdef12345678',
  toWallet: '0xabcdef1234567890abcdef1234567890abcdef12',
  amount: '10000000000000000000', // 10 tokens
  idempotencyKey: 'transfer-abc-123', // Must be unique
});

// Check transfer status
const status = await client.transfers.getStatus(transfer.id);
console.log('Transfer status:', status.status);
console.log('Current step:', status.currentStep);
```

---

## 10. View Cap Table

```typescript
const capTable = await client.tokens.getCapTable(token.id);

console.log('Total Supply:', capTable.totalSupply);
console.log('Holders:');
for (const holder of capTable.holders) {
  console.log(`  ${holder.walletAddress}: ${holder.balance} (${holder.percentage}%)`);
}
```

---

## Complete Example

```typescript
import { ApiClient, RightType } from '@tokenisation/sdk';

async function main() {
  const client = new ApiClient({
    baseUrl: 'http://localhost:3001',
    apiKey: 'sk_dev_test',
  });

  // Create project
  const project = await client.projects.create({
    name: 'My First Tokenization',
    jurisdiction: 'US',
  });

  // Create asset
  const asset = await client.assets.create({
    name: 'Test Asset',
    rightType: RightType.OWNERSHIP,
    jurisdiction: { countryCode: 'US' },
    projectId: project.id,
  });
  await client.assets.activate(asset.id);

  // Create investor
  const investor = await client.investors.create({
    email: 'test@example.com',
    jurisdiction: 'US',
  });
  await client.investors.addWallet(investor.id, {
    address: '0x1234567890abcdef1234567890abcdef12345678',
    chainId: 8453,
  });
  await client.investors.approveKyc(investor.id);
  await client.investors.activate(investor.id);

  // Create and deploy token
  const token = await client.tokens.create({
    name: 'Test Token',
    symbol: 'TST',
    chainId: 8453,
    assetId: asset.id,
  });
  await client.tokens.deploy(token.id);

  // Issue tokens
  await client.tokens.issue(token.id, {
    investorId: investor.id,
    walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '1000000000000000000000',
    idempotencyKey: `issue-${Date.now()}`,
  });

  // Check cap table
  const capTable = await client.tokens.getCapTable(token.id);
  console.log('Cap table:', capTable);
}

main().catch(console.error);
```

---

## Asset Types (RightType)

| Type | Use Case | Example |
|------|----------|---------|
| `OWNERSHIP` | Property, assets | Real estate, vehicles, art |
| `ACCESS` | Permissions | Memberships, tickets, licenses |
| `DEBT` | Loans, bonds | Corporate bonds, loan participations |
| `EQUITY` | Shares, ownership stakes | Company shares, fund units |
| `REVENUE` | Revenue sharing | Royalties, profit participations |
| `COMMODITY` | Physical goods | Gold, oil, agricultural products |

---

## Transfer Lifecycle

```
created → prechecked → approved → signing → submitted → confirmed → reconciled → settled
```

Compliance checks happen at the `prechecked` stage. If any check fails, the transfer is rejected.

---

## Production Checklist

Before going to production:

- [ ] Set `AUTH_DEV_MODE=false` in server environment
- [ ] Set `JWT_SECRET` to a cryptographically random 32+ character string
- [ ] Configure `REDIS_URL` for distributed rate limiting
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper RPC URLs for your target chains
- [ ] Deploy contracts using multi-sig governance
- [ ] Test compliance policies thoroughly

---

## Next Steps

- Explore the [SDK modules](../../sdk/src/modules/) for full API details
- Review [server configuration](../../server/.env.example) for all options
- Check [contract deployment](../../contracts/script/DeployUpgradeable.s.sol) for blockchain setup
- Set up [compliance policies](../../sdk/src/modules/compliance.ts) for your jurisdiction
