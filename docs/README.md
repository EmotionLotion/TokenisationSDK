# Documentation

Welcome to the Tokenisation SDK documentation.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/your-org/TokenisationSDK.git
cd TokenisationSDK

# Install dependencies (monorepo)
npm install

# Start the API server (uses SQLite by default)
cd server
cp .env.example .env
npm run dev

# In another terminal, run the UI
cd ui
npm run dev
```

---

## Getting Started

| Guide | Description |
|-------|-------------|
| [Quick Start](getting-started/QUICKSTART.md) | Get your first asset tokenized |
| [Server Configuration](../server/.env.example) | Environment variables reference |
| [Contract Deployment](../contracts/script/DeployUpgradeable.s.sol) | Deploy upgradeable tokens |

---

## SDK Reference

The SDK provides a Stripe-like API client with these modules:

| Module | Description | Key Methods |
|--------|-------------|-------------|
| `client.projects` | Project management | `create`, `get`, `list`, `update`, `delete` |
| `client.assets` | Asset tokenization | `create`, `get`, `list`, `activate`, `freeze` |
| `client.investors` | Investor onboarding | `create`, `addWallet`, `startKyc`, `activate` |
| `client.tokens` | Token lifecycle | `create`, `deploy`, `issue`, `redeem`, `pause` |
| `client.transfers` | Compliant transfers | `create`, `cancel`, `retry`, `getStatus` |
| `client.compliance` | Policy management | `createPolicy`, `check`, `simulate` |

### SDK Source Files

- [ApiClient](../sdk/src/ApiClient.ts) - Main API client entry point
- [Projects Module](../sdk/src/modules/projects.ts) - Project management
- [Assets Module](../sdk/src/modules/assets.ts) - Asset tokenization
- [Investors Module](../sdk/src/modules/investors.ts) - Investor onboarding & KYC
- [Tokens Module](../sdk/src/modules/tokens.ts) - Token lifecycle & issuance
- [Transfers Module](../sdk/src/modules/transfers.ts) - Compliant transfers
- [Compliance Module](../sdk/src/modules/compliance.ts) - Policy management
- [Validation Schemas](../sdk/src/modules/validation.ts) - Zod input validation

---

## Smart Contracts

### Architecture

The contracts use **UUPS (Universal Upgradeable Proxy Standard)** for upgradeability:

| Contract | Description |
|----------|-------------|
| `ComplianceTokenUpgradeable` | ERC-3643 compliant token with UUPS proxy |
| `TokenGovernor` | Multi-sig + timelock governance |
| `IdentityRegistry` | Investor identity management |
| `ModularCompliance` | Pluggable compliance rules |

### Contract Source Files

- [ComplianceTokenUpgradeable](../contracts/src/tokens/ComplianceTokenUpgradeable.sol) - Main token implementation
- [TokenGovernor](../contracts/src/governance/TokenGovernor.sol) - Governance contract
- [IdentityRegistry](../contracts/src/identity/IdentityRegistry.sol) - Identity management
- [DeployUpgradeable](../contracts/script/DeployUpgradeable.s.sol) - Deployment script

### Governance Parameters

```solidity
MIN_DELAY = 2 days       // Timelock delay
GRACE_PERIOD = 7 days    // Execution window
REQUIRED_SIGS = 2        // Multi-sig threshold
UPGRADE_DELAY = 2 days   // Token upgrade delay
```

---

## Server API

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/projects` | Create project |
| POST | `/api/v1/assets` | Create asset |
| POST | `/api/v1/investors` | Create investor |
| POST | `/api/v1/tokens` | Create token |
| POST | `/api/v1/tokens/:id/deploy` | Deploy token |
| POST | `/api/v1/tokens/:id/issue` | Issue tokens (idempotency required) |
| POST | `/api/v1/transfers` | Create transfer (idempotency required) |
| POST | `/api/v1/compliance/policies` | Create compliance policy |
| GET | `/api/v1/tokens/:id/cap-table` | Get cap table |

### Server Source Files

- [Routes](../server/src/routes/) - REST API endpoints
- [Services](../server/src/services/) - Business logic
- [Middleware](../server/src/middleware/) - Auth, rate limiting, idempotency
- [Database Schema](../server/src/db/schema/) - Drizzle ORM schemas

---

## Production Requirements

| Requirement | Development | Production |
|-------------|-------------|------------|
| `JWT_SECRET` | Any value | 32+ chars, cryptographically random |
| `AUTH_DEV_MODE` | `true` | **Must be `false`** |
| `REDIS_URL` | Optional | Required (rate limiting) |
| `NODE_ENV` | `development` | `production` |
| Database | SQLite | PostgreSQL recommended |

---

## Project Structure

```
TokenisationSDK/
├── sdk/                 # TypeScript SDK
│   └── src/
│       ├── ApiClient.ts           # Main entry point
│       ├── modules/               # API modules
│       ├── contracts/adapters/    # Token adapters
│       └── plugins/               # Wallet, storage plugins
│
├── server/              # Express API server
│   └── src/
│       ├── routes/                # REST endpoints
│       ├── services/              # Business logic
│       ├── middleware/            # Auth, rate limiting
│       └── db/                    # Database schemas
│
├── contracts/           # Solidity smart contracts (Foundry)
│   └── src/
│       ├── tokens/                # Token implementations
│       ├── governance/            # Multi-sig governance
│       ├── identity/              # Identity registry
│       └── compliance/            # Compliance modules
│
├── ui/                  # React dashboard (Vite)
│
├── packages/
│   └── conformance-suite/         # Integration tests
│
└── docs/                # This documentation
```

---

## Quick Links

- [Main README](../README.md) - Project overview
- [SDK Source](../sdk/src/) - TypeScript SDK
- [Server Source](../server/src/) - API server
- [Contracts Source](../contracts/src/) - Smart contracts
- [Environment Template](../server/.env.example) - Server configuration
