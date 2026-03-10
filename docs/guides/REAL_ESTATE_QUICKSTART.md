# Build a Real Estate Tokenisation Platform

Zero to working platform in 10 minutes. No external services needed.

## 1. Start the server

```bash
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
pnpm quickstart
```

This installs dependencies, builds all packages, seeds the database with sample real estate data (DLD title, property units, NAV history, investor tiers, exit windows), and starts the server on `http://localhost:3001`.

The seed script prints your API key. Save it:

```
API Key (save this - shown only once):
sk_test_sandbox_abc123...
```

## 2. Verify it works

```bash
# List the seeded asset
curl -s http://localhost:3001/api/v1/assets \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .

# Check the DLD title
curl -s http://localhost:3001/api/v1/dld/titles \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .

# View property units
curl -s http://localhost:3001/api/v1/properties \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .

# Check NAV
curl -s http://localhost:3001/api/v1/reports/nav \
  -H "Authorization: Bearer YOUR_API_KEY" | jq .
```

## 3. Use the TypeScript SDK

```bash
npm install @tokenisation/sdk @tokenisation/realestate
```

```typescript
import { createApiClient } from '@tokenisation/sdk';
import { DLDClient, PropertyModule, NAVModule, ExitWindowModule } from '@tokenisation/realestate';

const client = createApiClient({
  apiKey: process.env.AHOY_API_KEY!,
  baseUrl: 'http://localhost:3001',
});

// Create a new property asset
const asset = await client.assets.create({
  name: 'Palm Tower Residences',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE', regulatoryFramework: 'UAE_VARA' },
  metadata: { propertyType: 'RESIDENTIAL', location: 'Palm Jumeirah', totalUnits: 120 },
});

// Register with Dubai Land Department (mock in dev)
const dld = new DLDClient(client.getHttpClient());
await dld.registerTitle({
  assetId: asset.id,
  deedNumber: 'DLD-2026-PT-67890',
});
const title = await dld.verifyTitleDeed({ assetId: asset.id });
console.log('DLD Status:', title.status); // 'verified' (mock auto-approves)

// Add property units
const property = new PropertyModule(client.getHttpClient());
await property.createUnit(asset.id, {
  unitNumber: '3201',
  unitType: 'penthouse',
  areaSqm: 320,
  bedrooms: 5,
  monthlyRent: 55000,
  currency: 'AED',
});

// Create and deploy token
const token = await client.tokens.create({
  name: 'Palm Tower Token',
  symbol: 'PTT',
  chainId: 8453, // Base
  assetId: asset.id,
  totalSupply: '1000000',
});

// Onboard an investor
const investor = await client.investors.create({
  email: 'investor@example.com',
  firstName: 'Ahmed',
  lastName: 'Al-Rashid',
  jurisdiction: 'AE',
  classification: 'ACCREDITED',
});
await client.investors.startKYC(investor.id); // auto-approved in dev

// Issue tokens
await client.tokens.issue(token.id, {
  investorId: investor.id,
  amount: '5000',
});

// Track NAV
const nav = new NAVModule(client.getHttpClient());
await nav.submitValuation(asset.id, {
  totalAssetValue: '15000000',
  currency: 'AED',
  sources: [{ name: 'CBRE Appraisal', value: '15000000', weight: 1.0 }],
});
const currentNAV = await nav.getCurrent(asset.id);
console.log('NAV per token:', currentNAV.navPerToken, 'AED');

// Set up exit windows (quarterly redemption)
const exitWindows = new ExitWindowModule(client.getHttpClient());
await exitWindows.setSchedule(asset.id, {
  frequency: 'quarterly',
  windowDurationDays: 14,
  noticePeriodDays: 30,
});
```

## 4. Deploy smart contracts (optional)

Requires [Foundry](https://book.getfoundry.sh/getting-started/installation):

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Deploy to local Anvil chain
cd contracts
anvil &                              # starts local chain on :8545
forge script script/DeployRealToken.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy to Base Sepolia testnet
export DEPLOYER_PRIVATE_KEY=0x...    # your testnet wallet
export TOKEN_NAME="Palm Tower Token"
export TOKEN_SYMBOL="PTT"
forge script script/DeployRealToken.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast --verify
```

The deploy script creates: RealToken (ERC-3643), IdentityRegistry, and ModularCompliance contracts.

## 5. Run the example app (optional)

```bash
cd _infrastructure/apps/real-estate
pnpm dev
# Opens at http://localhost:5173
```

Features: marketplace, investor portal, admin dashboard.

## What's mocked in development

| Service | Dev behavior | Production |
|---------|-------------|------------|
| DLD (Dubai Land Department) | Auto-approves titles | Calls real DLD API (`DLD_BASE_URL`) |
| KYC (Onfido/Jumio) | Auto-passes all checks | Real provider (`KYC_PROVIDER`) |
| Custody (Fireblocks/BitGo) | Mock vaults + wallets | Real provider keys required |
| Blockchain | Works with Anvil or testnets | Mainnet RPC + funded wallet |

To switch from mock to real, set the corresponding env vars in `server/.env`.

## Architecture

```
Your App
  └── @tokenisation/sdk            (umbrella, or install packages individually)
        ├── @tokenisation/core       (assets, tokens, investors, transfers, compliance)
        ├── @tokenisation/realestate (DLD, property units, NAV, tiers, exit windows)
        ├── @tokenisation/compliance (KYC/AML policies, identity claims)
        └── @tokenisation/chains     (EVM deployment, Chainlink oracles, custody)
              └── server API (localhost:3001)
                    └── SQLite (dev) / PostgreSQL (prod)
```

## Next steps

- [API Reference](../api/SDK_REFERENCE.md) — full endpoint documentation
- [Compliance Guide](COMPLIANCE.md) — KYC/AML policy setup
- [Architecture Overview](../architecture/OVERVIEW.md) — system design
- [Full Real Estate Guide](BUILDING_REAL_ESTATE_APP.md) — building a production app
