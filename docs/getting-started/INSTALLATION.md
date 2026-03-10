---
sidebar_position: 1
title: Installation
---

# Installation

This guide walks you through installing the AHOY Tokenisation SDK packages and setting up your development environment.

## Prerequisites

Before you begin, ensure you have the following installed:

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 18+ | Runtime |
| pnpm | 8+ | Package manager (monorepo workspaces) |
| Docker | 24+ | Local development stack |
| Docker Compose | 2.20+ | Multi-container orchestration |

Verify your environment:

```bash
node -v    # v18.0.0 or higher
pnpm -v    # 8.0.0 or higher
docker -v  # 24.0.0 or higher
```

## Choosing Your Packages

The SDK follows a Stripe/Google Cloud pattern: a thin generic core with opt-in vertical packages.

### Core Layers (generic, always needed)

| Package | Install | What You Get |
|---------|---------|-------------|
| **Core** | `pnpm add @tokenisation/core` | Engines, API client, errors, plugins, state machines, pack registry |
| **Core + compliance** | `pnpm add @tokenisation/core @tokenisation/compliance` | Above + ComplianceService, KYC providers, identity claims, policy registry |
| **Core + blockchain** | `pnpm add @tokenisation/core @tokenisation/chains` | Above + chain plugins, contract adapters, Chainlink, deployment, MPC custody |

### Vertical Packages (opt-in, install what you need)

| Vertical | Install | What You Get |
|----------|---------|-------------|
| **Real Estate** | `pnpm add @tokenisation/realestate` | DLD, VARA, NAV, property management, 11-state lifecycle |
| **GPU Compute** | `pnpm add @tokenisation/compute` | GPU nodes, clusters, benchmarks, utilization, revenue |
| **Travel** | `pnpm add @tokenisation/pack-travel` | Airline tickets, hotel reservations, car rentals, concert tickets, PSS connectors |
| **Loyalty** | `pnpm add @tokenisation/pack-loyalty` | Ahoy ecosystem, loyalty points, behavior scores, IoT oracles |
| **Securities** | `pnpm add @tokenisation/pack-securities` | US Reg D securities packs |
| **Supply Chain** | `pnpm add @tokenisation/pack-supply-chain` | Warehouse receipts, physical assets, verification credentials |
| **Everything** | `pnpm add @tokenisation/sdk` | Umbrella re-export of all packages (backward-compatible) |

### Decision Tree: Which Packages Do I Need?

```
What are you building?
  ├── Real estate platform → pnpm add @tokenisation/realestate
  ├── GPU compute marketplace → pnpm add @tokenisation/compute
  ├── Travel/ticketing platform → pnpm add @tokenisation/pack-travel
  ├── Loyalty program → pnpm add @tokenisation/pack-loyalty
  ├── Custom vertical → pnpm add @tokenisation/core
  └── Not sure? → pnpm add @tokenisation/sdk (includes everything)
```

> **Not sure?** Install `@tokenisation/sdk` — it includes everything and your imports work identically.

### Umbrella SDK

```bash
pnpm add @tokenisation/sdk
```

The SDK has the following peer dependencies (installed only if you need wallet connectivity):

```bash
# Optional: wallet connectivity
pnpm add @walletconnect/universal-provider @walletconnect/modal @metamask/onboarding
```

### React SDK

For React applications, install the React SDK alongside the core SDK:

```bash
pnpm add @tokenisation/sdk @tokenisation/sdk-react
```

The React SDK requires React 18 or later as a peer dependency:

```bash
pnpm add react@^18.0.0 react-dom@^18.0.0
```

### UI Kit

The UI Kit provides drop-in React components (Stripe Elements-style) for common tokenisation flows such as KYC modals, cap tables, investor onboarding, and transaction flows.

```bash
pnpm add @tokenisation/sdk @tokenisation/sdk-react @tokenisation/ui-kit
```

Import the base styles in your application entry point:

```typescript
import '@tokenisation/ui-kit/styles';
```

## Docker Setup (Full Stack)

The fastest way to run the entire platform locally is with Docker Compose. This spins up:

- **API Server** -- Express.js on port 3001
- **PostgreSQL 16** -- Database on port 5432
- **Redis 7** -- Event bus and caching on port 6379
- **Anvil (Foundry)** -- Local Ethereum node on port 8545
- **Contract Deployer** -- Deploys ERC-3643 contracts on startup

```bash
# Clone the repository
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd tokenisation-sdk

# Start all services
docker-compose up -d

# Verify everything is running
docker-compose ps

# Follow API logs
docker-compose logs -f api
```

To also start the UI dashboard:

```bash
docker-compose --profile ui up -d
```

To run the conformance test suite:

```bash
docker-compose --profile test up tests
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (resets database)
docker-compose down -v
```

## Environment Variables Reference

Create a `.env` file in the `server/` directory. Below is a consolidated reference of all environment variables used across the platform:

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment (`development`, `production`, `test`) |
| `PORT` | `3001` | API server port |
| `LOG_LEVEL` | `debug` | Log verbosity (`debug`, `info`, `warn`, `error`) |
| `LOG_REQUEST_BODY` | `true` | Log request bodies (disable in production) |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed CORS origins |

### Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `DB_MODE` | `postgres` | Database engine (`postgres` or `sqlite`) |

### Cache & Events

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | — | Redis connection string for event bus and caching |

### Blockchain (`@tokenisation/chains`)

| Variable | Default | Description |
|----------|---------|-------------|
| `RPC_URL` | `http://localhost:8545` | Default EVM RPC endpoint |
| `CHAIN_ID` | `31337` | Default chain ID |
| `DEPLOYER_PRIVATE_KEY` | — | Private key for contract deployment |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — | JWT signing secret (**rotate in production**) |
| `API_KEY_PREFIX` | `ak_test_` | API key prefix |

### KYC/Compliance (`@tokenisation/compliance`)

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_MOCK_KYC` | `true` | Auto-approve all KYC sessions (dev only) |
| `SUMSUB_APP_TOKEN` | — | Sumsub application token (production KYC) |
| `SUMSUB_SECRET_KEY` | — | Sumsub secret key |

### Features

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_SANDBOX` | `true` | Enable sandbox mode |

### Development Template

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation
DB_MODE=postgres
REDIS_URL=redis://localhost:6379
RPC_URL=http://localhost:8545
CHAIN_ID=31337
JWT_SECRET=dev-jwt-secret-change-in-production
API_KEY_PREFIX=ak_test_
ENABLE_MOCK_KYC=true
ENABLE_SANDBOX=true
LOG_LEVEL=debug
LOG_REQUEST_BODY=true
CORS_ORIGIN=http://localhost:5173
```

:::warning
Never commit `.env` files to version control. The values above are only safe for local development. In production, use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) and rotate your `JWT_SECRET` regularly.
:::

## Monorepo Development

If you are contributing to the platform itself, clone the repository and install all workspace dependencies:

```bash
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd tokenisation-sdk
pnpm install
```

Build all packages (respects dependency order: core → compliance | chains → realestate → sdk):

```bash
pnpm -r run build
```

Start the server in development mode with hot reload:

```bash
pnpm --filter @tokenisation/server dev
```

Run SDK tests:

```bash
pnpm --filter @tokenisation/sdk test
```

## Verifying Your Installation

After starting the Docker stack, verify the API is healthy:

```bash
curl http://localhost:3001/health
```

You should receive:

```json
{ "status": "ok" }
```

The OpenAPI documentation is available at `http://localhost:3001/api-docs`.

## Next Steps

- [Quickstart](./QUICKSTART.md) -- Build your first tokenisation flow in 5 minutes
- [First Project](./FIRST_PROJECT.md) -- Full tutorial for real estate tokenisation
- [Concepts](../CONCEPTS.md) -- Understand assets, tokens, compliance, and transfers
