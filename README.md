# Tokenisation SDK

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636.svg)
![ERC-3643](https://img.shields.io/badge/ERC--3643-Compliant-green.svg)

**Enterprise-grade SDK for tokenizing real-world assets with built-in regulatory compliance.**

[Quick Start](#-quick-start) •
[Features](#-features) •
[SDK Usage](#-sdk-usage) •
[API Server](#-api-server) •
[Architecture](#-architecture) •
[Documentation](#-documentation)

</div>

---

## What is This?

The Tokenisation SDK is a complete toolkit for building compliant tokenized asset platforms. It implements the **ERC-3643 (T-REX)** standard for security tokens, providing institutional-grade compliance out of the box.

### Key Capabilities

- **ERC-3643 Compliant** - Full T-REX implementation with identity registry, compliance modules, and claim-based verification
- **Multi-Standard Support** - ERC-20, ERC-721, ERC-1155, ERC-1410, ERC-4626, Soulbound Tokens
- **Regulatory Ready** - KYC/AML verification, jurisdiction rules, investor accreditation, transfer restrictions
- **Full-Stack Solution** - TypeScript SDK + REST API Server + React UI + Smart Contracts
- **Multi-Chain** - Ethereum, Polygon, Base, and testnets

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/TokenisationSDK.git
cd TokenisationSDK

# Install all dependencies (monorepo)
npm install

# Build the SDK
npm run build --workspace=sdk
```

### Start the API Server

```bash
# Development mode (SQLite - no external DB needed)
cd server
npm run dev

# Server runs at http://localhost:3001
```

### Run Conformance Tests

```bash
# Start local blockchain (requires Foundry)
anvil &

# Run tests
npm test --workspace=@tokenisation/conformance-suite
```

### Run the Platform UI

```bash
cd ui
npm run dev
# Open http://localhost:5173
```

---

## SDK Usage

### Installation (as a package)

```bash
npm install @tokenisation/sdk
```

### Initialize the API Client

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.your-platform.com',
});
```

### Create an Asset

```typescript
const asset = await client.assets.create({
  name: 'Marina Heights Tower - Unit 1501',
  rightType: 'OWNERSHIP',
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'DIFC',
  },
  metadata: {
    propertyType: 'Residential',
    location: 'Dubai Marina',
    valuation: 5000000,
    currency: 'AED',
  },
});

console.log('Asset created:', asset.id);
```

### Create and Deploy a Token

```typescript
// Create token definition
const token = await client.tokens.create({
  name: 'Marina Heights Token',
  symbol: 'MHT',
  totalSupply: '1000000000000000000000000', // 1M tokens (18 decimals)
  chainId: 8453, // Base
  standard: 'ERC3643',
  complianceModules: ['identity', 'country', 'investor_type'],
});

// Deploy to blockchain
const deployment = await client.tokens.deploy(token.id, {
  deployerAddress: '0xYourDeployerAddress',
});

console.log('Deployment TX:', deployment.transaction);
```

### Transfer with Compliance Check

```typescript
// Transfers automatically validate against compliance rules
const transfer = await client.transfers.create({
  tokenId: token.id,
  from: '0xSenderAddress',
  to: '0xRecipientAddress',
  amount: '1000000000000000000', // 1 token
});

// Transfer will fail if:
// - Recipient is not KYC verified
// - Recipient is in blocked jurisdiction
// - Transfer exceeds holder limits
// - Token is frozen or paused
```

---

## Token Standards

| Standard | Use Case | Compliance |
|----------|----------|------------|
| **ERC-3643** | Security tokens, RWA | Full T-REX compliance |
| **ERC-20** | Fungible tokens | Basic transfer rules |
| **ERC-721** | NFTs, unique assets | Per-token compliance |
| **ERC-1155** | Multi-tokens, mixed assets | Per-tokenId rules |
| **ERC-1410** | Partitioned securities | Share class restrictions |
| **ERC-4626** | Tokenized vaults | Yield + compliance |
| **Soulbound** | Credentials, badges | Non-transferable |

---

## API Server

The server provides a REST API for managing tokenized assets, with support for both PostgreSQL (production) and SQLite (development).

### Environment Variables

```bash
# .env
NODE_ENV=development
PORT=3001

# Database (PostgreSQL for production)
DATABASE_URL=postgres://user:pass@localhost:5432/tokenisation

# Or use SQLite for development
DB_MODE=sqlite

# JWT Secret
JWT_SECRET=your-secret-key

# Blockchain RPC
RPC_URL=https://mainnet.base.org
```

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/assets` | Create asset |
| `GET /api/v1/assets/:id` | Get asset details |
| `POST /api/v1/assets/:id/transition` | Change asset state |
| `POST /api/v1/tokens` | Create token |
| `POST /api/v1/tokens/:id/deploy` | Deploy to chain |
| `POST /api/v1/tokens/:id/issue` | Issue tokens to investor |
| `GET /api/v1/tokens/:id/cap-table` | Get cap table |
| `GET /api/v1/health` | Health check |

### Authentication

```bash
# API Key authentication
curl -H "Authorization: Bearer sk_live_xxx" \
  https://api.your-platform.com/api/v1/assets

# Development mode bypass (local only)
curl -H "X-Dev-Org-Id: test-org" \
     -H "X-Dev-Party-Id: test-party" \
  http://localhost:3001/api/v1/assets
```

---

## ERC-3643 Compliance

The SDK implements the full ERC-3643 (T-REX) standard for compliant security tokens:

### Identity Registry

```typescript
// Register investor identity
await client.identities.register({
  investorAddress: '0x...',
  countryCode: 'US',
  claims: [
    { topic: 'KYC', issuer: '0xKYCProvider', data: '...' },
    { topic: 'ACCREDITED', issuer: '0xAccreditationProvider', data: '...' },
  ],
});
```

### Compliance Modules

| Module | Description |
|--------|-------------|
| `identity` | Requires registered identity |
| `country` | Jurisdiction whitelist/blacklist |
| `investor_type` | Accredited investor requirements |
| `max_holders` | Limit total token holders |
| `time_lock` | Transfer lockup periods |
| `max_balance` | Per-holder balance limits |

### Transfer Validation

All transfers are validated against:
1. **Identity Check** - Is recipient in identity registry?
2. **Country Check** - Is recipient's jurisdiction allowed?
3. **Investor Type** - Does recipient meet investor requirements?
4. **Balance Limits** - Would transfer exceed holder limits?
5. **Time Locks** - Is the lockup period complete?

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Applications                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐│
│  │    UI    │  │   CLI    │  │  Server  │  │     Examples     ││
│  │ (React)  │  │          │  │ (Express)│  │                  ││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘│
└───────┼─────────────┼─────────────┼──────────────────┼──────────┘
        │             │             │                  │
┌───────▼─────────────▼─────────────▼──────────────────▼──────────┐
│                         SDK Core                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      ApiClient                            │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────────┐│  │
│  │  │  Assets    │ │  Tokens    │ │      Transfers         ││  │
│  │  │  Module    │ │  Module    │ │       Module           ││  │
│  │  └────────────┘ └────────────┘ └────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Token Adapters                          │   │
│  │  ┌───────┐ ┌───────┐ ┌────────┐ ┌────────┐ ┌─────────┐  │   │
│  │  │ERC3643│ │ERC-20 │ │ERC-721 │ │ERC-1155│ │ERC-4626 │  │   │
│  │  └───────┘ └───────┘ └────────┘ └────────┘ └─────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Plugins                               │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐  │   │
│  │  │MetaMask │ │  SIWE   │ │Chainlink│ │   Storage     │  │   │
│  │  │   WC    │ │  Auth   │ │ Oracles │ │  (IPFS/S3)    │  │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └───────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────┐
│                      Smart Contracts                            │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐│
│  │ T-REX Token    │ │  Identity      │ │  Modular             ││
│  │ (ERC-3643)     │ │  Registry      │ │  Compliance          ││
│  └────────────────┘ └────────────────┘ └──────────────────────┘│
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐│
│  │  Token Factory │ │ Claim Issuers  │ │  Trusted Issuers     ││
│  │  (CREATE2)     │ │                │ │  Registry            ││
│  └────────────────┘ └────────────────┘ └──────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
TokenisationSDK/
├── sdk/                          # TypeScript SDK
│   ├── src/
│   │   ├── modules/              # API modules (assets, tokens, transfers)
│   │   ├── contracts/adapters/   # Token adapters (ERC-20, 721, 1155, 3643)
│   │   ├── plugins/              # Wallet, oracle, storage plugins
│   │   └── utils/                # HTTP client, helpers
│   └── tests/
│
├── server/                       # Express API Server
│   ├── src/
│   │   ├── routes/               # REST endpoints
│   │   ├── services/             # Business logic
│   │   ├── middleware/           # Auth, validation
│   │   └── db/                   # Database schemas
│
├── contracts/                    # Solidity Contracts
│   ├── src/
│   │   ├── tokens/               # Token implementations
│   │   ├── identity/             # Identity registry
│   │   ├── compliance/           # Compliance modules
│   │   └── factory/              # Token factory
│
├── ui/                           # React Platform UI
│
├── packages/
│   └── conformance-suite/        # Integration tests
│
└── docs/                         # Documentation
```

---

## Testing

### SDK Unit Tests

```bash
cd sdk
npm test              # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage
```

### Conformance Tests

```bash
# Requires running server + local blockchain
npm test --workspace=@tokenisation/conformance-suite
```

### Contract Tests

```bash
cd contracts
forge test            # Run all
forge test -vvv       # Verbose
forge coverage        # Coverage report
```

---

## Multi-Chain Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Ethereum Mainnet | 1 | Supported |
| Polygon | 137 | Supported |
| Base | 8453 | Primary L2 |
| Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |

---

## Documentation

| Document | Description |
|----------|-------------|
| [Quick Start](docs/guides/QUICKSTART.md) | Get running in 5 minutes |
| [SDK Guide](docs/guides/SDK_USAGE.md) | Complete SDK usage |
| [API Reference](docs/reference/REST_API.md) | REST API endpoints |
| [ERC-3643 Guide](docs/guides/ERC3643.md) | Compliance implementation |
| [Deployment](docs/operations/DEPLOYMENT_RUNBOOK.md) | Production deployment |

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built for the RWA ecosystem**

[Documentation](docs/) • [Issues](https://github.com/your-org/TokenisationSDK/issues) • [Discussions](https://github.com/your-org/TokenisationSDK/discussions)

</div>
