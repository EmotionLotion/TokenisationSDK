# Tokenisation SDK Demo

This demo shows how easy it is to build tokenized asset applications using the Tokenisation SDK.

## Quick Start

```bash
# Install dependencies
npm install

# Run the main demo (Real Estate Tokenization)
npm run demo

# Run specific demos
npm run demo:realestate  # Real estate tokenization
npm run demo:carbon      # Carbon credit tokenization
npm run demo:loyalty     # Loyalty points (AHOY-style)
```

## What You'll Learn

### 1. Real Estate Tokenization (`npm run demo`)

Complete workflow showing:
- Creating parties (Issuer, Investors)
- KYC verification
- Asset creation with rich metadata
- Lifecycle management (Draft → Verified → Active)
- Token minting and distribution
- Secondary market transfers
- Audit trail

### 2. Carbon Credits (`npm run demo:carbon`)

Environmental asset tokenization:
- VERIFICATION right type (proof of carbon offset)
- VERRA VCS compliance
- Token retirement for offset claims
- ESG/sustainability use case

### 3. Loyalty Points (`npm run demo:loyalty`)

AHOY-style unified ecosystem:
- BEHAVIOR right type (loyalty/reputation)
- Multi-service earn/burn
- Tier system
- Whitelist transferability

## SDK Features Demonstrated

| Feature | Description |
|---------|-------------|
| `sdk.parties_.create()` | Create ecosystem participants |
| `sdk.parties_.setKyc()` | Verify party identity |
| `sdk.assets.create()` | Tokenize any asset type |
| `sdk.assets.transition()` | Manage asset lifecycle |
| `sdk.tokens.mint()` | Issue tokens |
| `sdk.tokens.transfer()` | Transfer between parties |
| `sdk.tokens.burn()` | Retire/redeem tokens |

## Right Types

| Type | Use Case |
|------|----------|
| `OWNERSHIP` | Real estate, IP, collectibles |
| `ACCESS` | Tickets, memberships, credentials |
| `BEHAVIOR` | Loyalty points, reputation scores |
| `VERIFICATION` | Carbon credits, certifications |

## Transfer Modes

| Mode | Description |
|------|-------------|
| `UNRESTRICTED` | Anyone can receive |
| `WHITELIST_ONLY` | Pre-approved addresses only |
| `NON_TRANSFERABLE` | Soulbound (cannot transfer) |
| `COMPLIANCE_GATED` | Requires KYC/compliance |

## Next Steps

After running these demos, you can:

1. **Modify the examples** - Change asset types, metadata, rules
2. **Build your own app** - Use the SDK in your project
3. **Add real plugins** - Replace mock plugins with real implementations
4. **Deploy to testnet** - Connect to Base Sepolia for real transactions

## Support

- SDK Documentation: `../sdk/README.md`
- Full Roadmap: `../docs/SDK_REVIEW_AND_ROADMAP.md`
