# Tokenisation SDK

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.22-363636.svg)
![ERC-3643](https://img.shields.io/badge/ERC--3643-Compliant-green.svg)

**The Stripe of Real-World Asset Tokenization**

[5-Minute Quick Start](#5-minute-quick-start) |
[SDK Reference](docs/ONE_PAGE_SDK_REFERENCE.md) |
[API Docs](docs/API_REFERENCE.md) |
[Examples](#demo-applications) |
[FAQ](docs/FAQ.md)

</div>

---

## What is this?

A comprehensive SDK for building **compliant tokenized asset platforms**. Create assets, onboard investors with KYC, deploy tokens to any EVM chain, and execute transfers with automatic compliance validation — all through a Stripe-like TypeScript API.

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({ apiKey: 'sk_live_xxx' });

const asset    = await client.assets.create({ name: 'Marina Heights', rightType: 'OWNERSHIP', jurisdiction: { countryCode: 'AE' } });
const investor = await client.investors.create({ email: 'investor@example.com', jurisdiction: 'US' });
const token    = await client.tokens.create({ name: 'MHT', symbol: 'MHT', chainId: 8453, assetId: asset.id });

await client.tokens.deploy(token.id);
await client.tokens.issue(token.id, { investorId: investor.id, amount: '1000', idempotencyKey: 'issue-001' });
```

**Time to first token: Hours, not months.**

---

## 5-Minute Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Foundry (optional, for smart contracts only)

### Setup

```bash
# Clone and install
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
npm install

# Build the SDK
npm run build --workspace=sdk

# Start the API server (SQLite — zero config)
cp server/.env.example server/.env
cd server && npm run dev
# Server runs at http://localhost:3001
```

### Or scaffold a new project

```bash
npx create-tokenised-asset
```

Interactive prompts will walk you through choosing asset type, blockchain, compliance preset, and token standard.

### Verify it works

```bash
# Health check
curl http://localhost:3001/health

# Create an asset (dev mode — no auth needed)
curl -X POST http://localhost:3001/api/v1/assets \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{"name": "Test Asset", "rightType": "OWNERSHIP", "jurisdiction": {"countryCode": "US"}}'
```

> **Want the full walkthrough?** See [Quick Start Guide](docs/getting-started/QUICKSTART.md) or [First Project Tutorial](docs/getting-started/FIRST_PROJECT.md).

---

## Core Capabilities

### SDK Modules

```
client.projects    — Project management
client.assets      — Asset tokenization (real estate, securities, commodities)
client.investors   — Investor onboarding, KYC, wallet management
client.tokens      — Token lifecycle (create, deploy, issue, redeem, pause, freeze)
client.transfers   — Compliant transfers with automatic validation
client.compliance  — Policy engine (country rules, holder limits, lockups)
client.webhooks    — Event delivery with signature verification
client.governance  — On-chain proposal and voting management
client.escrow      — Multi-party escrow with milestones and disputes
client.cashFlow    — Distribution scheduling and yield management
client.audit       — Tamper-evident audit trail with evidence packs
client.events      — Event bus with dead letter queue
```

> **Full API surface:** See the [One-Page SDK Reference](docs/ONE_PAGE_SDK_REFERENCE.md) — every method, parameter, and return type.

### Token Standards

| Standard | Use Case | Compliance |
|----------|----------|------------|
| **ERC-3643** | Security tokens, RWA | Full T-REX compliance |
| **ERC-20** | Fungible tokens | Basic transfer rules |
| **ERC-721** | NFTs, unique assets | Per-token compliance |
| **ERC-1155** | Multi-tokens, mixed assets | Per-tokenId rules |
| **ERC-1410** | Partitioned securities | Share class restrictions |
| **ERC-4626** | Tokenized vaults | Yield + compliance |
| **Soulbound** | Credentials, badges | Non-transferable |

### Multi-Chain Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Ethereum Mainnet | 1 | Supported |
| Polygon | 137 | Supported |
| Base | 8453 | Primary L2 |
| Arbitrum | 42161 | Supported |
| Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |
| Arbitrum Sepolia | 421614 | Testnet |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Applications                              │
│   UI (React)  │  CLI  │  Server (Express)  │  Examples      │
└───────────────┼───────┼────────────────────┼────────────────┘
                │       │                    │
┌───────────────▼───────▼────────────────────▼────────────────┐
│                      SDK Core                                │
│                                                              │
│  ApiClient ─── Projects │ Assets │ Investors │ Tokens        │
│                Transfers │ Compliance │ Webhooks │ Governance │
│                Escrow │ CashFlow │ Audit │ Events            │
│                                                              │
│  Token Adapters ── ERC-3643 │ ERC-20 │ ERC-721 │ ERC-1155   │
│                                                              │
│  Plugins ── MetaMask │ WalletConnect │ Chainlink │ SIWE      │
│             S3/IPFS │ Oracle Aggregator │ CCIP Bridge        │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    Smart Contracts                            │
│  ComplianceToken (UUPS) │ IdentityRegistry │ TokenGovernor   │
│  ModularCompliance │ TokenFactory (CREATE2) │ ERC1967Proxy    │
└──────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

| Feature | Why It Matters |
|---------|----------------|
| **ERC-3643 (T-REX)** | Industry standard for compliant security tokens |
| **UUPS Proxy** | Upgrade contracts without migrating tokens |
| **Multi-sig + Timelock** | 2-of-N approval + 2-day delay prevents malicious upgrades |
| **Idempotency** | Network retries won't cause duplicate operations |
| **Zod Validation** | Invalid data rejected at SDK level before hitting the server |
| **Database Transactions** | Multi-step operations are atomic |

> **Deep dive:** [Architecture Overview](docs/ARCHITECTURE.md) | [Plugin System](docs/architecture/PLUGINS.md) | [Lifecycle Engine](docs/architecture/LIFECYCLE.md)

---

## Demo Applications

Three production-quality demo applications showcase the SDK's capabilities:

### Real Estate Demo
Tokenize a property and issue tokens to investors with full compliance.
```bash
cd examples/real-estate-demo && npm run dev
```

### Chainlink Starter Kit
Five use-case demos wiring Chainlink Data Feeds, Automation, CCIP, and Proof of Reserve through the full SDK pipeline.
```bash
cd examples/chainlink-starter && npm run demo:real-estate
```
Available demos: `real-estate` (Price Feeds), `airline` (Automation), `car-rental` (CCIP), `hotel` (Compliance Mint), `concert` (Proof of Reserve)

### Feature Showcase
Single runnable script demonstrating all major SDK capabilities.
```bash
cd examples/showcase && npm run demo
```

> **Use case recipes:** [Real Estate](docs/recipes/01-real-estate.md) | [Airline Tickets](docs/recipes/02-airline-tickets.md) | [Car Rental](docs/recipes/03-car-rental.md) | [Hotel](docs/recipes/04-hotel-tickets.md) | [Concert](docs/recipes/05-concert-tickets.md)

---

## Authentication

The API supports multiple auth methods. See the [Authentication Guide](docs/AUTHENTICATION.md) for multi-language examples (TypeScript, Python, Go, Ruby, Java, cURL).

```bash
# API Key (production)
curl -H "Authorization: Bearer sk_live_xxx" https://api.your-platform.com/api/v1/assets

# Dev mode (local only)
curl -H "X-Dev-Org-Id: dev-org-1" http://localhost:3001/api/v1/assets
```

---

## API Server

The server provides a REST API with 200+ endpoints. Browse the interactive API docs at `http://localhost:3001/api/docs` (Swagger UI).

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/assets` | Create asset |
| `POST /api/v1/investors` | Create investor |
| `POST /api/v1/tokens` | Create token |
| `POST /api/v1/tokens/:id/deploy` | Deploy to chain |
| `POST /api/v1/tokens/:id/issue` | Issue tokens (requires idempotencyKey) |
| `POST /api/v1/transfers` | Create transfer (requires idempotencyKey) |
| `GET /api/v1/tokens/:id/cap-table` | Get cap table |
| `POST /api/v1/compliance/policies` | Create compliance policy |
| `GET /api/v1/health` | Health check |
| `GET /api/docs` | Swagger UI |
| `GET /api/openapi.json` | OpenAPI spec |

> **Full endpoint catalog:** [REST API Reference](docs/api/REST_API.md) | [Error Reference](docs/ERROR_REFERENCE.md)

---

## Project Structure

```
TokenisationSDK/
├── sdk/                          # TypeScript SDK (@tokenisation/sdk)
│   ├── src/
│   │   ├── ApiClient.ts          # Stripe-like API client
│   │   ├── modules/              # API modules (assets, tokens, investors, ...)
│   │   ├── plugins/              # Wallet, oracle, storage, Chainlink plugins
│   │   ├── contracts/adapters/   # Token standard adapters
│   │   ├── packs/                # Pre-built asset templates (10 packs)
│   │   └── core/                 # Lifecycle engine, event store
│   └── tests/
├── server/                       # Express API Server
│   ├── src/routes/               # 37 route files, 200+ endpoints
│   ├── src/middleware/           # Auth, rate limiting, idempotency
│   └── src/db/                   # Drizzle ORM schemas
├── contracts/                    # Solidity Smart Contracts (Foundry)
│   └── src/                     # ERC-3643, governance, identity, compliance
├── ui/                           # React Dashboard (Vite + Tailwind)
├── website/                      # Docusaurus documentation site
├── packages/
│   ├── create-tokenised-asset/   # Project scaffolding CLI
│   └── conformance-suite/        # Integration tests
├── examples/                     # Demo applications
├── docs/                         # 50+ documentation files
└── deploy/                       # Kubernetes, Terraform, Helm
```

---

## Documentation

### I want to...

| Goal | Start Here |
|------|------------|
| **Get started fast** | [Quick Start](docs/getting-started/QUICKSTART.md) |
| **See every SDK method** | [One-Page SDK Reference](docs/ONE_PAGE_SDK_REFERENCE.md) |
| **Browse API endpoints** | [REST API Reference](docs/api/REST_API.md) or `http://localhost:3001/api/docs` |
| **Understand authentication** | [Authentication Guide](docs/AUTHENTICATION.md) |
| **Handle errors** | [Error Reference](docs/ERROR_REFERENCE.md) |
| **Understand the architecture** | [Architecture](docs/ARCHITECTURE.md) |
| **Set up compliance** | [Compliance Setup](docs/guides/COMPLIANCE_SETUP.md) |
| **Integrate Chainlink** | [Chainlink Guide](docs/guides/CHAINLINK_INTEGRATION.md) |
| **Deploy to production** | [Deployment Runbook](docs/deployment/DEPLOYMENT_RUNBOOK.md) |
| **Look up a term** | [Glossary](docs/GLOSSARY.md) (80+ definitions) |
| **Troubleshoot an issue** | [FAQ & Troubleshooting](docs/FAQ.md) |
| **Understand tokenization** | [Core Concepts](docs/CONCEPTS.md) |

### Full Documentation Site

Browse all docs at the [documentation site](https://emotionlotion.github.io/TokenisationSDK/) or explore the [docs/](docs/) directory. Machine-readable index available at [llms.txt](llms.txt).

---

## Testing

```bash
# SDK unit tests
npm test --workspace=sdk

# Smart contract tests
cd contracts && forge test

# Conformance tests (requires running server + local blockchain)
npm test --workspace=@tokenisation/conformance-suite

# Server tests
cd server && npm test
```

---

## Who Is This For?

| User | Use Case |
|------|----------|
| **Developers** | Add tokenization to your app with a few API calls |
| **Startups** | Launch a tokenization platform without $1M+ infrastructure |
| **Enterprises** | Tokenize real estate, funds, or securities with built-in compliance |
| **Fund Managers** | Issue fund tokens with automatic investor verification |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit your changes
5. Open a Pull Request

---

## Community & Support

- **Issues:** [GitHub Issues](https://github.com/EmotionLotion/TokenisationSDK/issues)
- **Documentation:** [docs/](docs/) or [online docs](https://emotionlotion.github.io/TokenisationSDK/)
- **Security:** Report vulnerabilities per [SECURITY.md](SECURITY.md)
- **License:** MIT — see [LICENSE](LICENSE)

---

<div align="center">

**Built for the RWA ecosystem**

</div>
