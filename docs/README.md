# Tokenisation SDK Documentation

Welcome to the Tokenisation SDK documentation. This guide will help you understand, install, and use the SDK to build compliant tokenized asset platforms.

---

## Start Here

| If you want to... | Read this |
|-------------------|-----------|
| **Understand what this is** | [Core Concepts](CONCEPTS.md) |
| **Get started quickly** | [Quick Start Guide](getting-started/QUICKSTART.md) |
| **See all API methods** | [API Reference](API_REFERENCE.md) |
| **Understand the architecture** | [Architecture & Design](ARCHITECTURE.md) |
| **Look up a term** | [Glossary](GLOSSARY.md) |

---

## Documentation Structure

### Conceptual (Understand)

| Document | Description |
|----------|-------------|
| [Core Concepts](CONCEPTS.md) | What is tokenization? Domain model, end-to-end flow |
| [Glossary](GLOSSARY.md) | Terms and definitions (KYC, UUPS, ERC-3643, etc.) |
| [Architecture](ARCHITECTURE.md) | System design, security, production features |

### Practical (Build)

| Document | Description |
|----------|-------------|
| [Quick Start](getting-started/QUICKSTART.md) | Tokenize your first asset in minutes |
| [API Reference](API_REFERENCE.md) | Complete SDK method documentation |
| [Server Config](../server/.env.example) | Environment variables reference |

### Smart Contracts

| Document | Description |
|----------|-------------|
| [ComplianceTokenUpgradeable](../contracts/src/tokens/ComplianceTokenUpgradeable.sol) | UUPS upgradeable ERC-3643 token |
| [TokenGovernor](../contracts/src/governance/TokenGovernor.sol) | Multi-sig + timelock governance |
| [IdentityRegistry](../contracts/src/identity/IdentityRegistry.sol) | Investor identity management |
| [Deployment Script](../contracts/script/DeployUpgradeable.s.sol) | Production deployment |

---

## Quick Overview

### What is This?

The Tokenisation SDK is a complete toolkit for building **compliant tokenized asset platforms**. It handles:

- **Compliance** — KYC/AML, jurisdiction rules, transfer restrictions
- **Token Lifecycle** — Create, deploy, issue, transfer, redeem
- **Governance** — Multi-sig upgrades with timelock
- **Multi-chain** — Ethereum, Polygon, Base, Arbitrum

### Who is This For?

| User | Use Case |
|------|----------|
| **Developers** | Build tokenization features into your app |
| **Enterprises** | Launch compliant security token offerings |
| **Fund Managers** | Tokenize fund shares with built-in compliance |
| **Real Estate** | Fractionalize property ownership |

### Key Features

```
┌─────────────────────────────────────────────────────────────────┐
│                    TOKENISATION SDK                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✓ ERC-3643 (T-REX) compliant tokens                           │
│  ✓ Investor onboarding with KYC                                │
│  ✓ Configurable compliance policies                            │
│  ✓ UUPS upgradeable smart contracts                            │
│  ✓ Multi-sig governance with timelock                          │
│  ✓ Idempotent operations (no duplicates)                       │
│  ✓ Redis-backed rate limiting                                  │
│  ✓ Database transactions                                       │
│  ✓ Zod input validation                                        │
│  ✓ TypeScript throughout                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## SDK Modules

The SDK provides a Stripe-like API client:

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({ apiKey: 'sk_live_xxx' });
```

| Module | Description | Key Methods |
|--------|-------------|-------------|
| `client.projects` | Project management | `create`, `get`, `list`, `update`, `delete` |
| `client.assets` | Asset tokenization | `create`, `activate`, `freeze`, `getValuations` |
| `client.investors` | Investor onboarding | `create`, `addWallet`, `approveKyc`, `activate` |
| `client.tokens` | Token lifecycle | `create`, `deploy`, `issue`, `redeem`, `getCapTable` |
| `client.transfers` | Compliant transfers | `create`, `cancel`, `getStatus`, `getWalletHistory` |
| `client.compliance` | Policy management | `createPolicy`, `check`, `simulate`, `overrideDecision` |

See [API Reference](API_REFERENCE.md) for complete documentation.

---

## Domain Model

```
Project
   └── Asset (the real-world thing)
          └── Token (on-chain representation)
                 │
   Investor ─────┴───── Transfer
      └── Wallet         (movement between wallets)
```

| Entity | Purpose |
|--------|---------|
| **Project** | Container grouping related work |
| **Asset** | The underlying item being tokenized |
| **Investor** | Person/entity that can hold tokens |
| **Wallet** | Blockchain address linked to investor |
| **Token** | On-chain representation of asset |
| **Transfer** | Movement of tokens between wallets |

See [Core Concepts](CONCEPTS.md) for detailed explanations.

---

## Production Requirements

| Requirement | Development | Production |
|-------------|-------------|------------|
| `JWT_SECRET` | Any value | **32+ chars, random** |
| `AUTH_DEV_MODE` | `true` | **Must be `false`** |
| `REDIS_URL` | Optional | **Required** |
| `NODE_ENV` | `development` | `production` |
| Database | SQLite | PostgreSQL |

See [Architecture](ARCHITECTURE.md) for security details.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-org/TokenisationSDK.git
cd TokenisationSDK && npm install

# 2. Start server
cd server && cp .env.example .env && npm run dev

# 3. Use the SDK
npm install @tokenisation/sdk
```

```typescript
import { ApiClient, RightType } from '@tokenisation/sdk';

const client = new ApiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'sk_dev_test'
});

// Create an asset
const asset = await client.assets.create({
  name: 'My First Asset',
  rightType: RightType.OWNERSHIP,
  jurisdiction: { countryCode: 'US' }
});

// Create a token
const token = await client.tokens.create({
  name: 'My Token',
  symbol: 'MTK',
  chainId: 8453,
  assetId: asset.id
});

// Deploy to blockchain
await client.tokens.deploy(token.id);
```

See [Quick Start Guide](getting-started/QUICKSTART.md) for the full walkthrough.

---

## Source Code

| Component | Location | Description |
|-----------|----------|-------------|
| SDK | [`sdk/src/`](../sdk/src/) | TypeScript SDK |
| ApiClient | [`sdk/src/ApiClient.ts`](../sdk/src/ApiClient.ts) | Main entry point |
| Modules | [`sdk/src/modules/`](../sdk/src/modules/) | API modules |
| Server | [`server/src/`](../server/src/) | Express API server |
| Routes | [`server/src/routes/`](../server/src/routes/) | REST endpoints |
| Contracts | [`contracts/src/`](../contracts/src/) | Solidity contracts |
| Governance | [`contracts/src/governance/`](../contracts/src/governance/) | Multi-sig governor |

---

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/your-org/TokenisationSDK/issues)
- **Glossary**: [Terms & Definitions](GLOSSARY.md)
- **Architecture**: [Design Decisions](ARCHITECTURE.md)
