# Tokenisation SDK

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.22-363636.svg)
![ERC-3643](https://img.shields.io/badge/ERC--3643-Compliant-green.svg)

**The Stripe of Real-World Asset Tokenization**

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

---

## Quick Start

### Prerequisites

- Node.js 18+ and pnpm 9+
- Foundry (optional, for smart contracts only)

### Setup

```bash
# Clone and install
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
pnpm install

# Build the SDK
pnpm --filter @tokenisation/sdk build

# Start the API server (SQLite — zero config)
cp server/.env.example server/.env
cd server && pnpm dev
# Server runs at http://localhost:3001
```

### Or scaffold a new project

```bash
npx create-tokenised-asset
```

Interactive prompts walk you through choosing asset type, blockchain, compliance preset, and token standard.

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
client.tickets     — Airline/concert/event ticket operations
client.dld         — Dubai Land Department integration
```

### Token Standards

| Standard | Use Case | Compliance |
|----------|----------|------------|
| **ERC-3643** | Security tokens, RWA | Full T-REX compliance |
| **ERC-20** | Fungible tokens | Basic transfer rules |
| **ERC-721** | NFTs, unique assets | Per-token compliance |
| **ERC-1155** | Multi-tokens, mixed assets | Per-tokenId rules |
| **ERC-1410** | Partitioned securities | Share class restrictions |
| **ERC-4626** | Tokenized vaults | Yield + compliance |
| **ERC-5192** | Soulbound tokens | Non-transferable credentials |

### Multi-Chain Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Ethereum Mainnet | 1 | Supported |
| Polygon | 137 | Supported |
| Base | 8453 | Primary L2 |
| Arbitrum | 42161 | Supported |
| Optimism | 10 | Supported |
| Sepolia | 11155111 | Testnet |
| Base Sepolia | 84532 | Testnet |
| Arbitrum Sepolia | 421614 | Testnet |

### Industry Verticals

Pre-built asset packs with lifecycle state machines, compliance rules, and UI components:

| Vertical | Asset Pack | Smart Contract |
|----------|-----------|----------------|
| Real Estate | `UAERealEstate`, `dubai-real-estate` | `RealToken.sol` |
| Airlines | `AirlineTicket` | `AirlineTicketNFT.sol` |
| Hotels | `HotelReservation` | `HotelReservationNFT.sol` |
| Car Rental | `CarRental` | `CarRentalNFT.sol` |
| Concerts | `ConcertTicket` | `ConcertTicketNFT.sol` |
| Securities | `us-securities` | `ComplianceToken.sol` |
| Loyalty | `LoyaltyPoints` | — |
| Carbon Credits | `VerificationCredential` | — |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Applications                              │
│   UI Dashboard  │  CLI  │  Server (Express)  │  Examples     │
└───────────────┼───────┼────────────────────┼────────────────┘
                │       │                    │
┌───────────────▼───────▼────────────────────▼────────────────┐
│                      SDK Core                                │
│                                                              │
│  ApiClient ─── Projects │ Assets │ Investors │ Tokens        │
│                Transfers │ Compliance │ Webhooks │ Governance │
│                Escrow │ CashFlow │ Audit │ Events │ Tickets  │
│                                                              │
│  Token Adapters ── ERC-3643 │ ERC-20 │ ERC-721 │ ERC-1155   │
│                                                              │
│  Plugins ── MetaMask │ WalletConnect │ Chainlink │ SIWE      │
│             S3/IPFS │ Oracle Aggregator │ CCIP Bridge        │
│                                                              │
│  Asset Packs ── 13 vertical templates with state machines    │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│                    Smart Contracts (Foundry)                  │
│  ComplianceToken (UUPS) │ IdentityRegistry │ TokenGovernor   │
│  ModularCompliance │ TokenFactory (CREATE2) │ ERC1967Proxy    │
│  Vertical NFTs │ Chainlink Automation │ CCIP Bridge          │
│  DividendDistributor │ OracleRegistry │ ProofOfReserve       │
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
| **Signed DecisionReceipts** | Cryptographic proof of every compliance decision |
| **Database Transactions** | Multi-step operations are atomic |

---

## Demo Applications

### Real Estate Demo
Tokenize a property and issue tokens to investors with full compliance.
```bash
cd examples/real-estate-demo && pnpm dev
```

### Chainlink Starter Kit
Five use-case demos wiring Chainlink Data Feeds, Automation, CCIP, and Proof of Reserve through the full SDK pipeline.
```bash
cd examples/chainlink-starter && pnpm demo:real-estate
```
Available demos: `real-estate` (Price Feeds), `airline` (Automation), `car-rental` (CCIP), `hotel` (Compliance Mint), `concert` (Proof of Reserve)

### Feature Showcase
Single runnable script demonstrating all major SDK capabilities.
```bash
cd examples/showcase && pnpm demo
```

---

## Authentication

```bash
# API Key (production)
curl -H "Authorization: Bearer sk_live_xxx" https://api.your-platform.com/api/v1/assets

# SIWE (Sign-In with Ethereum)
# POST /api/v1/auth/siwe/nonce → sign → POST /api/v1/auth/siwe/verify → JWT

# Dev mode (local only)
curl -H "X-Dev-Org-Id: dev-org-1" http://localhost:3001/api/v1/assets
```

---

## API Server

The server provides a REST API with 50+ route modules. Browse interactive API docs at `http://localhost:3001/api/docs` (Swagger UI).

### Key Endpoints

| Category | Endpoints |
|----------|-----------|
| **Assets** | CRUD, transitions, lifecycle management |
| **Tokens** | Create, deploy, mint, burn, pause, freeze |
| **Investors** | Onboarding, KYC status, wallet management |
| **Transfers** | Compliant transfers with idempotency |
| **Compliance** | Policy engine, sanctions screening, receipts |
| **Governance** | Proposals, voting, execution |
| **Distributions** | Dividend scheduling, payment execution |
| **Verticals** | Airline, hotel, car rental, concert APIs |
| **Payments** | Stripe + Circle USDC payment rails |
| **Custody** | BitGo + Fireblocks integration |
| **DLD** | Dubai Land Department integration |
| **Oracles** | Chainlink feeds, flight data, NAV |

See [`server/README.md`](server/README.md) for the full endpoint catalog.

---

## Project Structure

```
TokenisationSDK/
├── sdk/                          # TypeScript SDK (@tokenisation/sdk)
│   ├── src/
│   │   ├── ApiClient.ts          # Stripe-like API client
│   │   ├── modules/              # 27 API modules
│   │   ├── plugins/              # Wallet, oracle, storage, Chainlink plugins
│   │   ├── contracts/adapters/   # Token standard adapters
│   │   ├── packs/                # 13 pre-built asset templates
│   │   ├── components/           # Pre-built React components + verticals
│   │   └── core/                 # Lifecycle engine, event store
│   └── tests/
├── sdk-react/                   # React SDK (@tokenisation/sdk-react)
├── sdk-react-native/            # React Native SDK (@tokenisation/sdk-react-native)
├── server/                       # Express API Server
│   ├── src/routes/               # 50 route files
│   ├── src/services/             # 30+ service modules
│   ├── src/middleware/           # Auth, rate limiting, idempotency
│   └── src/db/                   # Drizzle ORM (PostgreSQL + SQLite)
├── contracts/                    # Solidity Smart Contracts (Foundry)
│   └── src/                     # 46 contracts: tokens, compliance, governance, oracles
├── ui/                           # Admin Dashboard (Vite + React + Tailwind)
├── ui-kit/                       # Shared UI component library (50+ components)
├── packages/
│   ├── create-tokenised-asset/   # Project scaffolding CLI
│   └── conformance-suite/        # Integration tests
├── examples/                     # Demo applications
│   ├── real-estate-demo/
│   ├── chainlink-starter/
│   └── showcase/
└── deploy/                       # Kubernetes, Terraform, Helm
```

---

## Testing

```bash
# SDK unit tests
pnpm --filter @tokenisation/sdk test

# Smart contract tests (108 tests across 5 suites)
cd contracts && forge test

# Conformance tests (requires running server + local blockchain)
pnpm --filter @tokenisation/conformance-suite test

# Server tests
cd server && pnpm test

# UI tests
cd ui && pnpm test
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
3. Run tests (`pnpm test`)
4. Commit your changes
5. Open a Pull Request

---

## Community & Support

- **Issues:** [GitHub Issues](https://github.com/EmotionLotion/TokenisationSDK/issues)
- **Security:** Report vulnerabilities per [SECURITY.md](SECURITY.md)
- **License:** MIT — see [LICENSE](LICENSE)

---

<div align="center">

**Built for the RWA ecosystem**

</div>
