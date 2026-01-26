# AHOY Tokenisation SDK

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636.svg)

**A programmable factory that turns real-world rights, assets, or actions into verifiable, rule-based digital tokens.**

[Quick Start](#-quick-start) •
[Features](#-features) •
[Architecture](#-architecture) •
[Documentation](#-documentation) •
[Examples](#-examples)

</div>

---

## 🎯 What is This?

The AHOY Tokenisation SDK is a comprehensive toolkit for building compliant tokenized asset applications. It provides:

- **Multi-Standard Token Support** - ERC-20, ERC-721, ERC-1155, ERC-1410, ERC-4626, Soulbound Tokens
- **Regulatory Compliance** - Built-in KYC/AML, jurisdiction rules, transfer restrictions
- **Wallet Integration** - MetaMask, WalletConnect v2, SIWE authentication
- **Oracle Integration** - Chainlink price feeds, automation, and custom functions
- **Multi-Chain Support** - Ethereum, Polygon, Base, and testnets

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/TokenisationSDK.git
cd TokenisationSDK

# Install dependencies
npm install

# Build the SDK
cd sdk && npm run build
```

### Run the Demo

```bash
cd examples/real-estate-demo
npm install
npm run demo           # Real estate tokenization
npm run demo:carbon    # Carbon credits
npm run demo:loyalty   # AHOY loyalty points
```

### Run the Platform UI

```bash
cd ui
npm install
npm run dev
# Open http://localhost:5173
```

---

## ✨ Features

### Token Standards

| Standard | Use Case | Adapter |
|----------|----------|---------|
| **ERC-20** | Fungible tokens, currencies | `ERC20Adapter` |
| **ERC-721** | NFTs, unique assets | `ERC721Adapter` |
| **ERC-1155** | Multi-tokens, gaming, mixed assets | `ERC1155Adapter` |
| **ERC-1410** | Partitioned securities, share classes | `ERC1410Adapter` |
| **ERC-4626** | Tokenized vaults, yield-bearing | `ERC4626Adapter` |
| **Soulbound** | Non-transferable credentials | `SoulboundAdapter` |

### Compliance Features

- **KYC/AML Verification** - Identity registry with claim-based verification
- **Jurisdiction Rules** - Country-based transfer restrictions
- **Investor Limits** - Maximum holder counts, holding amounts
- **Transfer Controls** - Lockup periods, minimum amounts, freeze/unfreeze
- **Force Transfers** - Regulatory compliance with audit trail

### Wallet Plugins

```typescript
import { MetaMaskPlugin, WalletConnectPlugin, SIWEAuthPlugin } from '@tokenisation/sdk';

// MetaMask
const metamask = new MetaMaskPlugin({ chainId: '0x1' });
const wallet = await metamask.connect();

// WalletConnect
const walletconnect = new WalletConnectPlugin({
  projectId: 'your-project-id',
  chains: [1, 137]
});
const wallet = await walletconnect.connect();

// SIWE Authentication
const auth = new SIWEAuthPlugin({ apiClient });
const session = await auth.signIn(wallet);
```

### Oracle Integration

```typescript
import { DataFeedPlugin, AutomationPlugin, FunctionsPlugin } from '@tokenisation/sdk';

// Price Feeds
const priceFeed = new DataFeedPlugin(provider, config);
const ethPrice = await priceFeed.getPrice('ETH/USD');

// Automation (Keepers)
const automation = new AutomationPlugin(provider, config);
await automation.registerUpkeep(contractAddress);

// Custom Functions
const functions = new FunctionsPlugin(provider, config);
const result = await functions.executeRequest(source, args);
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │    UI    │  │   CLI    │  │   API    │  │     Examples     ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘│
└───────┼─────────────┼─────────────┼──────────────────┼──────────┘
        │             │             │                  │
┌───────▼─────────────▼─────────────▼──────────────────▼──────────┐
│                         SDK Core                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    TokenisationSDK                        │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────────┐│  │
│  │  │  Assets    │ │  Parties   │ │   Lifecycle Engine     ││  │
│  │  │  Manager   │ │  Manager   │ │   (State Machine)      ││  │
│  │  └────────────┘ └────────────┘ └────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Plugin System                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐  │   │
│  │  │  Auth   │ │Compliance│ │ Storage │ │    Oracle     │  │   │
│  │  │ Plugins │ │ Plugins │ │ Plugins │ │   Plugins     │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Token Adapters                          │   │
│  │  ┌───────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌─────────┐  │   │
│  │  │ERC-20 │ │ERC-721│ │ERC-1155│ │ERC-1410│ │ERC-4626 │  │   │
│  │  └───────┘ └───────┘ └────────┘ └────────┘ └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Smart Contracts                            │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐│
│  │ComplianceToken │ │ComplianceMulti │ │  IdentityRegistry    ││
│  │   (ERC-20)     │ │ Token (ERC1155)│ │    (KYC/Claims)      ││
│  └────────────────┘ └────────────────┘ └──────────────────────┘│
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐│
│  │  TokenFactory  │ │ModularCompliance│ │   Oracle Registry   ││
│  │   (CREATE2)    │ │   (Modules)    │ │    (Chainlink)       ││
│  └────────────────┘ └────────────────┘ └──────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Project Structure

```
TokenisationSDK/
├── sdk/                          # Core TypeScript SDK
│   ├── src/
│   │   ├── core/                 # Core engine (types, lifecycle, state machine)
│   │   ├── models/               # Data models (Asset, Party, Evidence)
│   │   ├── contracts/adapters/   # Token adapters (ERC-20, 721, 1155, etc.)
│   │   ├── plugins/
│   │   │   ├── auth/             # MetaMask, WalletConnect, SIWE
│   │   │   ├── compliance/       # KYC, jurisdiction rules
│   │   │   ├── chainlink/        # Price feeds, automation, functions
│   │   │   ├── storage/          # IPFS, S3 storage
│   │   │   └── chain/            # Multi-chain support
│   │   ├── services/             # Business logic services
│   │   ├── modules/              # Feature modules (governance, escrow)
│   │   ├── packs/                # Pre-configured asset packs
│   │   └── ahoy/                 # AHOY ecosystem integrations
│   └── tests/                    # Test suite
│
├── contracts/                    # Solidity smart contracts
│   ├── src/
│   │   ├── tokens/               # Token contracts (ComplianceToken, MultiToken)
│   │   ├── factory/              # TokenFactory with CREATE2
│   │   ├── identity/             # IdentityRegistry for KYC
│   │   ├── compliance/           # Modular compliance system
│   │   ├── oracles/              # Chainlink integrations
│   │   ├── automation/           # Keeper contracts
│   │   └── distribution/         # Dividend distributor
│   ├── script/                   # Deployment scripts
│   └── lib/                      # Dependencies (OpenZeppelin, Chainlink)
│
├── ui/                           # React Platform UI
│   ├── src/
│   │   ├── components/           # UI components
│   │   ├── pages/                # Route pages
│   │   ├── hooks/                # React hooks
│   │   └── stores/               # State management
│
├── server/                       # Express API Server
│   ├── src/
│   │   ├── routes/               # API routes
│   │   ├── middleware/           # Auth, validation
│   │   └── services/             # Business logic
│
├── examples/                     # Example applications
│   └── real-estate-demo/         # Property tokenization demo
│
├── docs/                         # Documentation
│   ├── guides/                   # How-to guides
│   ├── architecture/             # Technical architecture
│   ├── reference/                # API reference
│   ├── business/                 # Business documentation
│   └── operations/               # Deployment & operations
│
└── policies/                     # Policy rules (YAML)
```

---

## 📚 Documentation

### Getting Started

| Guide | Description |
|-------|-------------|
| [Quick Start](docs/guides/QUICKSTART.md) | Get running in 5 minutes |
| [Installation](docs/guides/INSTALLATION.md) | Detailed setup instructions |
| [First Project](docs/guides/FIRST_PROJECT.md) | Build your first tokenized asset |
| [SDK Usage](docs/guides/SDK_USAGE.md) | Complete SDK guide |

### Architecture

| Document | Description |
|----------|-------------|
| [Overview](docs/architecture/OVERVIEW.md) | System architecture |
| [Plugins](docs/architecture/PLUGINS.md) | Plugin system design |
| [Lifecycle](docs/architecture/LIFECYCLE.md) | Asset lifecycle states |
| [Security](docs/architecture/SECURITY.md) | Security considerations |

### API Reference

| Reference | Description |
|-----------|-------------|
| [SDK API](docs/reference/SDK_API.md) | TypeScript SDK reference |
| [REST API](docs/reference/REST_API.md) | Server API endpoints |
| [Contracts](docs/reference/CONTRACTS.md) | Smart contract reference |

### Operations

| Guide | Description |
|-------|-------------|
| [Deployment](docs/operations/DEPLOYMENT_RUNBOOK.md) | Deployment procedures |
| [Operations](docs/operations/OPERATIONS_MANUAL.md) | Day-to-day operations |
| [Troubleshooting](docs/operations/TROUBLESHOOTING.md) | Common issues |

---

## 💡 Examples

### Tokenize Real Estate

```typescript
import { TokenisationSDK, RightType, PartyType, PartyRole } from '@tokenisation/sdk';

const sdk = new TokenisationSDK();

// Create issuer
const issuer = sdk.parties_.create({
  name: 'Dubai Properties LLC',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'AE',
});

// Create property asset
const property = await sdk.assets.create({
  name: 'Dubai Marina - Unit 1501',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'AE' },
  totalSupply: '1000000', // 1M tokens = 1 property
  metadata: {
    propertyType: 'Residential',
    location: 'Dubai Marina',
    valuation: 5000000,
    currency: 'AED',
  },
});

// Mint tokens to investor
const investor = sdk.parties_.create({
  name: 'John Investor',
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  jurisdiction: 'US',
  verificationLevel: 'ACCREDITED',
});

await sdk.tokens.mint(property.id, investor.id, '100000'); // 10% ownership
```

### ERC-1155 Multi-Token (Multiple Asset Classes)

```typescript
import { ERC1155Adapter } from '@tokenisation/sdk';

const adapter = await ERC1155Adapter.create({
  contractAddress: '0x...',
  providerUrl: 'https://...',
  privateKey: process.env.PRIVATE_KEY,
  chainId: 1,
});

// Create different asset types in one contract
await adapter.createTokenType('1', 'Gold Tokens', 'GOLD', 'ipfs://...');
await adapter.createTokenType('2', 'Silver Tokens', 'SLVR', 'ipfs://...');
await adapter.createTokenType('3', 'Platinum Tokens', 'PLAT', 'ipfs://...');

// Set different compliance rules per asset
await adapter.setTokenComplianceRules('1', {
  requireKyc: true,
  requireAccreditation: true,
  maxHoldingAmount: '1000000',
});

// Batch mint different assets
await adapter.mintBatch(investor, ['1', '2', '3'], ['100', '500', '50']);
```

### Wallet Connection + SIWE Auth

```typescript
import { MetaMaskPlugin, SIWEAuthPlugin, ApiClient } from '@tokenisation/sdk';

// Connect MetaMask
const metamask = new MetaMaskPlugin({ autoSwitchChain: true, chainId: '0x1' });
const wallet = await metamask.connect();

// SIWE Authentication
const apiClient = new ApiClient({ baseUrl: 'https://api.example.com' });
const auth = new SIWEAuthPlugin({ apiClient });
const session = await auth.signIn(wallet);

console.log('Authenticated:', session.party.name);
console.log('KYC Verified:', session.party.kycVerified);
```

---

## 🔧 Smart Contracts

### Deployment

```bash
cd contracts

# Install dependencies
forge install

# Build
forge build

# Test
forge test

# Deploy (example: Base Sepolia)
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

### Key Contracts

| Contract | Description |
|----------|-------------|
| `ComplianceToken` | ERC-20 with KYC/AML compliance |
| `ComplianceMultiToken` | ERC-1155 with per-tokenId compliance |
| `TokenFactory` | CREATE2 deterministic deployment |
| `IdentityRegistry` | KYC claims and verification |
| `ModularCompliance` | Pluggable compliance modules |
| `OracleRegistry` | Chainlink price feed management |

---

## 🌐 Multi-Chain Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Ethereum Mainnet | 1 | ✅ Supported |
| Polygon | 137 | ✅ Supported |
| Base | 8453 | ✅ Primary L2 |
| Sepolia | 11155111 | ✅ Testnet |
| Base Sepolia | 84532 | ✅ Testnet |
| Polygon Amoy | 80002 | ✅ Testnet |

---

## 🧪 Testing

### SDK Tests

```bash
cd sdk
npm test              # Run all tests
npm run test:run      # Run once
npm run test:coverage # With coverage
```

### Contract Tests

```bash
cd contracts
forge test            # Run all tests
forge test -vvv       # Verbose
forge coverage        # Coverage report
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🔗 Links

- [Documentation](docs/README.md)
- [API Reference](docs/reference/SDK_API.md)
- [Examples](examples/)
- [Issue Tracker](https://github.com/yourusername/TokenisationSDK/issues)

---

<div align="center">

**Built with ❤️ for the RWA ecosystem**

</div>
