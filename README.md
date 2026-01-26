# Tokenisation SDK

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)
![Solidity](https://img.shields.io/badge/Solidity-0.8.22-363636.svg)
![ERC-3643](https://img.shields.io/badge/ERC--3643-Compliant-green.svg)

**The Stripe of Real-World Asset Tokenization**

[Quick Start](#quick-start) |
[SDK Usage](#sdk-usage) |
[API Server](#api-server) |
[Smart Contracts](#smart-contracts) |
[Documentation](#documentation)

</div>

---

## The Problem

Building a compliant tokenized asset platform traditionally requires:

| Component | Cost | Time |
|-----------|------|------|
| Compliance infrastructure (KYC/AML) | $200K - $500K | 3-6 months |
| Smart contract development | $100K - $300K | 2-4 months |
| Multi-sig & governance | $50K - $100K | 1-2 months |
| Backend API & database | $100K - $200K | 2-3 months |
| **Total** | **$450K - $1.1M** | **8-15 months** |

## The Solution

This SDK gives you everything out of the box:

```typescript
import { ApiClient, RightType } from '@tokenisation/sdk';

const client = new ApiClient({ apiKey: 'sk_live_xxx' });

// 1. Create an asset (real estate, securities, commodities, etc.)
const asset = await client.assets.create({
  name: 'Marina Heights Tower',
  rightType: RightType.OWNERSHIP,
  jurisdiction: { countryCode: 'AE' }
});

// 2. Onboard an investor (KYC, wallet linking)
const investor = await client.investors.create({ email: 'investor@example.com', jurisdiction: 'US' });
await client.investors.approveKyc(investor.id);

// 3. Create & deploy a compliant token
const token = await client.tokens.create({ name: 'MHT', symbol: 'MHT', chainId: 8453, assetId: asset.id });
await client.tokens.deploy(token.id);

// 4. Issue tokens (with duplicate prevention)
await client.tokens.issue(token.id, { investorId: investor.id, amount: '1000', idempotencyKey: 'issue-001' });

// 5. Transfer with automatic compliance checks
await client.transfers.create({ tokenId: token.id, fromWallet: '0x...', toWallet: '0x...', amount: '100', idempotencyKey: 'txfr-001' });
```

**Time to first token: Hours, not months.**

---

## What's Included

### TypeScript SDK — Stripe-like Developer Experience

```
client.projects    → Project management
client.assets      → Asset tokenization (real estate, securities, commodities)
client.investors   → Investor onboarding, KYC, wallet management
client.tokens      → Token lifecycle (create, deploy, issue, redeem, pause, freeze)
client.transfers   → Compliant transfers with automatic validation
client.compliance  → Policy engine (country rules, holder limits, lockups)
```

- **Zod validation** on all inputs — catch errors before they hit the server
- **Idempotency keys** on critical operations — no duplicate issuances or transfers
- **Full TypeScript** — autocomplete everything, catch bugs at compile time

### REST API Server — Production-Ready Backend

- **25 route files** covering the complete tokenization lifecycle
- **PostgreSQL + SQLite** — production and development databases
- **Drizzle ORM** — type-safe database queries with transaction support
- **Redis rate limiting** — distributed rate limiting across server instances
- **JWT authentication** — secure API access with refresh tokens
- **Dev mode bypass** — rapid development without auth complexity

### Smart Contracts — Upgradeable & Governed

| Contract | Purpose |
|----------|---------|
| `ComplianceTokenUpgradeable` | ERC-3643 token with UUPS proxy — upgrade without redeploying |
| `TokenGovernor` | Multi-sig + timelock — no single key can upgrade contracts |
| `IdentityRegistry` | On-chain investor identity — required for compliant transfers |
| `ModularCompliance` | Pluggable rules — country whitelist, holder limits, lockups |

**Governance parameters:**
- 2-of-N multi-sig required for upgrades
- 2-day timelock before execution
- 7-day grace period for execution

### React UI — Ready-to-Use Dashboard

- Wallet connection (MetaMask, WalletConnect)
- Asset management interface
- Investor onboarding flows
- Token issuance & transfer UI
- Cap table visualization

---

## Why This Architecture?

| Feature | Why It Matters |
|---------|----------------|
| **ERC-3643 (T-REX)** | The standard for compliant security tokens — transfers validate against identity registry |
| **UUPS Proxy** | Fix bugs and add features without migrating tokens or losing state |
| **Multi-sig Governance** | No single compromised key can upgrade contracts — requires 2+ approvals |
| **Timelock** | 2-day delay gives stakeholders time to review and veto malicious upgrades |
| **Idempotency** | Network retries won't cause duplicate token issuances or transfers |
| **Redis Rate Limiting** | Distributed rate limiting works across multiple server instances |
| **Zod Validation** | Invalid data rejected at SDK level before hitting the server |
| **Database Transactions** | Multi-step operations (issue tokens + update supply) are atomic |

---

## Who Is This For?

| User | Use Case |
|------|----------|
| **Developers** | Add tokenization to your app with a few API calls |
| **Startups** | Launch a tokenization platform without $1M+ infrastructure |
| **Enterprises** | Tokenize real estate, funds, or securities with built-in compliance |
| **Fund Managers** | Issue fund tokens with automatic investor verification |

> **New to tokenization?** Read [Core Concepts](docs/CONCEPTS.md) to understand what asset tokenization is, why it matters, and how the pieces fit together. See the [Glossary](docs/GLOSSARY.md) for term definitions.

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- Foundry (for smart contract development)

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
# Copy environment template
cp server/.env.example server/.env

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

The SDK provides a Stripe-like API client with resource modules:

```typescript
import { ApiClient } from '@tokenisation/sdk';

// API keys start with sk_ for secret keys
const client = new ApiClient({
  apiKey: 'sk_live_your-api-key',
  baseUrl: 'https://api.your-platform.com', // optional, auto-detected from key
});

// Available modules:
// client.projects   - Project management
// client.assets     - Asset tokenization
// client.investors  - Investor onboarding & KYC
// client.tokens     - Token lifecycle & issuance
// client.transfers  - Compliant transfers
// client.compliance - Policy management
```

### Create an Asset

```typescript
import { RightType } from '@tokenisation/sdk';

const asset = await client.assets.create({
  name: 'Marina Heights Tower - Unit 1501',
  rightType: RightType.OWNERSHIP,
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

// Activate the asset for tokenization
await client.assets.activate(asset.id);
```

### Onboard an Investor

```typescript
// Create investor record
const investor = await client.investors.create({
  email: 'investor@example.com',
  name: 'John Doe',
  jurisdiction: 'US',
  type: 'individual',
  accredited: true,
});

// Add a wallet
const wallet = await client.investors.addWallet(investor.id, {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chainId: 8453, // Base
  walletType: 'eoa',
});

// Complete KYC (or integrate with KYC provider)
await client.investors.approveKyc(investor.id, 'Manual verification complete');
await client.investors.activate(investor.id);
```

### Create and Deploy a Token

```typescript
// Create token definition
const token = await client.tokens.create({
  name: 'Marina Heights Token',
  symbol: 'MHT',
  decimals: 18,
  maxSupply: '1000000000000000000000000', // 1M tokens
  chainId: 8453, // Base
  assetId: asset.id,
});

// Deploy to blockchain (uses UUPS upgradeable proxy)
const deployed = await client.tokens.deploy(token.id, {
  identityRegistryAddress: '0x...', // optional
  complianceAddress: '0x...',       // optional
});

console.log('Token deployed at:', deployed.contractAddress);
```

### Issue Tokens to Investors

```typescript
// Issue tokens - idempotencyKey is REQUIRED to prevent duplicates
const issuance = await client.tokens.issue(token.id, {
  investorId: investor.id,
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '1000000000000000000000', // 1000 tokens
  idempotencyKey: 'issue-investor-123-batch-1', // unique key
});

console.log('Issuance status:', issuance.status);
```

### Transfer with Compliance Check

```typescript
// Transfers automatically validate against compliance rules
// idempotencyKey is REQUIRED to prevent duplicate transfers
const transfer = await client.transfers.create({
  tokenId: token.id,
  fromWallet: '0xSenderAddress',
  toWallet: '0xRecipientAddress',
  amount: '1000000000000000000', // 1 token
  idempotencyKey: 'transfer-abc-123', // unique key for this transfer
});

// Transfer will fail if:
// - Recipient is not KYC verified
// - Recipient is in blocked jurisdiction
// - Transfer exceeds holder limits
// - Token is frozen or paused

// Check transfer status
const status = await client.transfers.getStatus(transfer.id);
console.log('Current step:', status.currentStep);
console.log('TX Hash:', status.txHash);
```

### Get Cap Table

```typescript
const capTable = await client.tokens.getCapTable(token.id);

console.log('Total Supply:', capTable.totalSupply);
for (const holder of capTable.holders) {
  console.log(`${holder.walletAddress}: ${holder.balance} (${holder.percentage}%)`);
}
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

### Development Setup

```bash
cd server
cp .env.example .env
npm run dev
```

### Environment Variables

```bash
# .env
NODE_ENV=development
PORT=3001

# Database
DB_MODE=sqlite                    # Use 'postgresql' for production
SQLITE_PATH=./data/ahoy.db
DATABASE_URL=postgres://user:pass@localhost:5432/tokenisation

# Authentication (CRITICAL for production)
JWT_SECRET=your-secret-key-must-be-at-least-32-characters-long
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Development auth bypass (MUST be false in production!)
AUTH_DEV_MODE=true

# Redis (REQUIRED for production - distributed rate limiting)
REDIS_URL=redis://localhost:6379

# Blockchain RPC URLs
BASE_RPC_URL=https://mainnet.base.org
POLYGON_RPC_URL=https://polygon-rpc.com
ETHEREUM_RPC_URL=https://eth.llamarpc.com
```

### Production Security Requirements

| Requirement | Development | Production |
|-------------|-------------|------------|
| `JWT_SECRET` | Any value | **32+ characters, cryptographically random** |
| `AUTH_DEV_MODE` | `true` | **Must be `false`** (server refuses to start otherwise) |
| `REDIS_URL` | Optional | **Required** for distributed rate limiting |
| `NODE_ENV` | `development` | `production` |

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /api/v1/projects` | Create project |
| `POST /api/v1/assets` | Create asset |
| `POST /api/v1/investors` | Create investor |
| `POST /api/v1/tokens` | Create token |
| `POST /api/v1/tokens/:id/deploy` | Deploy to chain |
| `POST /api/v1/tokens/:id/issue` | Issue tokens (requires idempotencyKey) |
| `POST /api/v1/transfers` | Create transfer (requires idempotencyKey) |
| `GET /api/v1/tokens/:id/cap-table` | Get cap table |
| `POST /api/v1/compliance/policies` | Create compliance policy |
| `GET /api/v1/health` | Health check |

### Authentication

```bash
# API Key authentication (production)
curl -H "Authorization: Bearer sk_live_xxx" \
  https://api.your-platform.com/api/v1/assets

# Development mode bypass (local only, when AUTH_DEV_MODE=true)
curl -H "X-Dev-Org-Id: test-org" \
     -H "X-Dev-Party-Id: test-party" \
  http://localhost:3001/api/v1/assets
```

### Idempotency

Critical operations require an `Idempotency-Key` header to prevent duplicates:

```bash
curl -X POST http://localhost:3001/api/v1/transfers \
  -H "Authorization: Bearer sk_live_xxx" \
  -H "Idempotency-Key: transfer-unique-id-12345" \
  -H "Content-Type: application/json" \
  -d '{"tokenId": "...", "fromWallet": "0x...", "toWallet": "0x...", "amount": "1000"}'
```

Operations requiring idempotency keys:
- Token issuance (`POST /api/v1/tokens/:id/issue`)
- Token redemption (`POST /api/v1/tokens/:id/redeem`)
- Transfers (`POST /api/v1/transfers`)

---

## Smart Contracts

### Upgradeable Architecture

All token contracts use the **UUPS (Universal Upgradeable Proxy Standard)** pattern:

```
┌─────────────────┐     ┌─────────────────────────────┐
│   ERC1967Proxy  │────▶│  ComplianceTokenUpgradeable │
│  (User-facing)  │     │      (Implementation)       │
└─────────────────┘     └─────────────────────────────┘
```

Benefits:
- **Upgradeable** - Fix bugs and add features without redeploying
- **Gas efficient** - Logic upgrades don't affect token balances
- **Governance controlled** - Multi-sig approval required for upgrades

### Governance

Token upgrades are controlled by `TokenGovernor`, a multi-sig + timelock contract:

```solidity
// Governance parameters
MIN_DELAY = 2 days      // Timelock delay before execution
GRACE_PERIOD = 7 days   // Window to execute after ready
REQUIRED_SIGS = 2       // Multi-sig threshold
```

Upgrade flow:
1. Signer proposes upgrade via `propose()`
2. Other signers approve via `approve()`
3. Wait for timelock (2 days minimum)
4. Execute upgrade via `execute()`

### Deployment

```bash
cd contracts

# Deploy to testnet
forge script script/DeployUpgradeable.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast \
  --verify

# Required environment variables
export DEPLOYER_PRIVATE_KEY=0x...
export SIGNER_1=0x...  # Multi-sig signer 1
export SIGNER_2=0x...  # Multi-sig signer 2
export SIGNER_3=0x...  # Optional signer 3
```

### Contract Addresses

Deployed contracts are logged after deployment. Save these addresses:
- `IdentityRegistry` - Manages investor identities
- `TokenGovernor` - Multi-sig governance
- `Token Implementation` - Logic contract
- `Token Proxy` - User-facing proxy address

---

## Compliance

The SDK implements the full ERC-3643 (T-REX) standard for compliant security tokens.

### Investor Onboarding

```typescript
// 1. Create investor
const investor = await client.investors.create({
  email: 'investor@example.com',
  jurisdiction: 'US',
  accredited: true,
});

// 2. Add wallet
await client.investors.addWallet(investor.id, {
  address: '0x...',
  chainId: 8453,
});

// 3. Complete KYC
await client.investors.approveKyc(investor.id, 'Verified via provider');

// 4. Activate
await client.investors.activate(investor.id);
```

### Compliance Policies

```typescript
// Create a compliance policy
const policy = await client.compliance.createPolicy({
  name: 'US Accredited Investors',
  jurisdiction: 'US',
  rules: [
    { type: 'IDENTITY_REQUIRED', parameters: {} },
    { type: 'COUNTRY_WHITELIST', parameters: { countries: ['US', 'CA'] } },
    { type: 'ACCREDITED_ONLY', parameters: { accreditedRequired: true } },
    { type: 'MAX_HOLDERS', parameters: { maxHolders: 2000 } },
  ],
});

// Activate policy
await client.compliance.activatePolicy(policy.id);
```

### Compliance Modules

| Module | Description |
|--------|-------------|
| `IDENTITY_REQUIRED` | Requires registered identity |
| `COUNTRY_WHITELIST` | Jurisdiction whitelist |
| `COUNTRY_BLACKLIST` | Jurisdiction blacklist |
| `ACCREDITED_ONLY` | Accredited investor requirements |
| `MAX_HOLDERS` | Limit total token holders |
| `MAX_BALANCE` | Per-holder balance limits |
| `TIME_LOCK` | Transfer lockup periods |

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
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌─────────────┐ │  │
│  │  │ Projects │ │  Assets  │ │ Investors │ │   Tokens    │ │  │
│  │  └──────────┘ └──────────┘ └───────────┘ └─────────────┘ │  │
│  │  ┌──────────┐ ┌────────────────────────────────────────┐ │  │
│  │  │Transfers │ │             Compliance                  │ │  │
│  │  └──────────┘ └────────────────────────────────────────┘ │  │
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
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │ ComplianceToken  │  │  Identity        │  │ Token          ││
│  │ Upgradeable      │  │  Registry        │  │ Governor       ││
│  │ (UUPS Proxy)     │  │                  │  │ (Multi-sig)    ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐│
│  │  Modular         │  │  Token Factory   │  │  ERC1967Proxy  ││
│  │  Compliance      │  │  (CREATE2)       │  │                ││
│  └──────────────────┘  └──────────────────┘  └────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
TokenisationSDK/
├── sdk/                          # TypeScript SDK
│   ├── src/
│   │   ├── ApiClient.ts          # Main API client (Stripe-like interface)
│   │   ├── modules/              # API modules (projects, assets, investors,
│   │   │                         #              tokens, transfers, compliance)
│   │   ├── contracts/adapters/   # Token adapters (ERC-20, 721, 1155, 3643)
│   │   ├── plugins/              # Wallet, oracle, storage plugins
│   │   └── utils/                # HTTP client, validation
│   └── tests/
│
├── server/                       # Express API Server
│   ├── src/
│   │   ├── routes/               # REST endpoints (25 route files)
│   │   ├── services/             # Business logic with transactions
│   │   ├── middleware/           # Auth, rate limiting, idempotency
│   │   └── db/                   # Drizzle ORM schemas
│   └── .env.example              # Environment configuration template
│
├── contracts/                    # Solidity Contracts (Foundry)
│   ├── src/
│   │   ├── tokens/               # ComplianceTokenUpgradeable (UUPS)
│   │   ├── governance/           # TokenGovernor (multi-sig + timelock)
│   │   ├── identity/             # IdentityRegistry
│   │   └── compliance/           # Modular compliance rules
│   ├── script/                   # Deployment scripts
│   └── test/                     # Foundry tests
│
├── ui/                           # React Platform UI (Vite + TailwindCSS)
│
├── packages/
│   └── conformance-suite/        # Integration tests
│
└── docs/                         # Documentation (see Documentation section below)
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

### Server Tests

```bash
cd server
npm test              # Run all tests
```

### Contract Tests

```bash
cd contracts
forge test            # Run all
forge test -vvv       # Verbose
forge coverage        # Coverage report
```

### Conformance Tests

```bash
# Requires running server + local blockchain
npm test --workspace=@tokenisation/conformance-suite
```

---

## Multi-Chain Support

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

## Documentation

### I want to...

| Goal | Start Here |
|------|------------|
| **Understand what this is** | [Core Concepts](docs/CONCEPTS.md) — What is tokenization, why it matters, how it works |
| **Look up a term** | [Glossary](docs/GLOSSARY.md) — KYC, AML, UUPS, ERC-3643, idempotency, and 80+ more |
| **Build something quickly** | [Quick Start](docs/getting-started/QUICKSTART.md) — Tokenize your first asset in minutes |
| **See all SDK methods** | [API Reference](docs/API_REFERENCE.md) — Every method, parameter, and example |
| **Understand the architecture** | [Architecture](docs/ARCHITECTURE.md) — System design, security, production features |
| **Set up compliance rules** | [Compliance Setup](docs/guides/COMPLIANCE_SETUP.md) — KYC, transfer restrictions, policies |
| **Deploy to production** | [Deployment Runbook](docs/deployment/DEPLOYMENT_RUNBOOK.md) — Step-by-step guide |
| **Configure the server** | [Server Config](server/.env.example) — All environment variables explained |

### Learning Path

```
New User                        Developer                       Production
────────                        ─────────                       ──────────
    │                               │                               │
    ▼                               ▼                               ▼
┌─────────────┐              ┌─────────────┐              ┌─────────────────┐
│  CONCEPTS   │─────────────▶│ QUICK START │─────────────▶│ DEPLOYMENT      │
│  What & Why │              │ Build First │              │ RUNBOOK         │
└─────────────┘              │ Asset       │              └─────────────────┘
       │                     └─────────────┘                      │
       ▼                            │                             ▼
┌─────────────┐                     ▼                     ┌─────────────────┐
│  GLOSSARY   │              ┌─────────────┐              │ OPERATIONS      │
│  Terms      │              │ API         │              │ MANUAL          │
└─────────────┘              │ REFERENCE   │              └─────────────────┘
                             └─────────────┘
                                    │
                                    ▼
                             ┌─────────────┐
                             │ COMPLIANCE  │
                             │ SETUP       │
                             └─────────────┘
```

### Full Documentation Index

📚 **[docs/README.md](docs/README.md)** — Complete documentation hub with all guides and references

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

</div>
