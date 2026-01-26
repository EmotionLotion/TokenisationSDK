# Tokenisation SDK - Quick Start Guide

Get your first asset tokenized in under 5 minutes.

---

## Installation

```bash
npm install @tokenisation/sdk
```

## Basic Usage

```typescript
import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
} from '@tokenisation/sdk';

// 1. Initialize SDK
const sdk = new TokenisationSDK({ useMockPlugins: true });

// 2. Create an issuer
const issuer = sdk.parties_.create({
  name: 'My Company',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'US',
});
sdk.parties_.setKyc(issuer.id, true);

// 3. Create an investor
const investor = sdk.parties_.create({
  name: 'John Doe',
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  jurisdiction: 'US',
});
sdk.parties_.setKyc(investor.id, true);

// 4. Tokenize an asset
const asset = await sdk.assets.create({
  name: 'My First Asset',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
});

// 5. Activate it
await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
await sdk.assets.verify(asset.id, issuer.id);
await sdk.assets.activate(asset.id, issuer.id);

// 6. Mint tokens
await sdk.tokens.mint(asset.id, investor.id, '1000');

// 7. Check balance
const balance = await sdk.tokens.getBalance(asset.id, investor.id);
console.log(`Balance: ${balance}`); // "1000"
```

## Asset Types

| Type | Use Case | Example |
|------|----------|---------|
| `OWNERSHIP` | Property, assets | Real estate, IP, collectibles |
| `ACCESS` | Permissions | Tickets, memberships |
| `BEHAVIOR` | Reputation | Loyalty points, scores |
| `VERIFICATION` | Proofs | Carbon credits, certificates |

## Transfer Modes

| Mode | Description |
|------|-------------|
| `UNRESTRICTED` | Anyone can receive |
| `WHITELIST_ONLY` | Pre-approved only |
| `NON_TRANSFERABLE` | Cannot transfer (soulbound) |
| `COMPLIANCE_GATED` | Requires KYC checks |

## Lifecycle

```
DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE → REDEEMED/EXPIRED → BURNED
```

## Run the Demos

```bash
cd examples/real-estate-demo
npm install
npm run demo           # Real estate
npm run demo:carbon    # Carbon credits
npm run demo:loyalty   # Loyalty points
```

## Next Steps

- [First Project Tutorial](./FIRST_PROJECT.md) - Step-by-step walkthrough
- [MVP Showcase](../guides/MVP_SHOWCASE.md) - Complete feature demonstration
- [SDK Usage Guide](../guides/SDK_USAGE.md) - Complete API guide
- [Architecture Overview](../architecture/OVERVIEW.md) - System design
