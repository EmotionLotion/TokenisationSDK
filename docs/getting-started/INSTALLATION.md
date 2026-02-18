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

## Installing SDK Packages

### Core SDK

The core TypeScript SDK provides a Stripe-like client for all tokenisation operations.

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
git clone https://github.com/your-org/tokenisation-sdk.git
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

## Environment Variables

Create a `.env` file in the `server/` directory using this template:

```bash
# Server
NODE_ENV=development
PORT=3001

# Database (PostgreSQL)
DATABASE_URL=postgresql://ahoy:ahoy_dev_password@localhost:5432/ahoy_tokenisation
DB_MODE=postgres

# Redis (Event Bus + Caching)
REDIS_URL=redis://localhost:6379

# Blockchain
RPC_URL=http://localhost:8545
CHAIN_ID=31337

# Authentication
JWT_SECRET=dev-jwt-secret-change-in-production
API_KEY_PREFIX=ak_test_

# Features
ENABLE_MOCK_KYC=true
ENABLE_SANDBOX=true
LOG_LEVEL=debug
LOG_REQUEST_BODY=true

# CORS
CORS_ORIGIN=http://localhost:5173
```

:::warning
Never commit `.env` files to version control. The values above are only safe for local development. In production, use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) and rotate your `JWT_SECRET` regularly.
:::

## Monorepo Development

If you are contributing to the platform itself, clone the repository and install all workspace dependencies:

```bash
git clone https://github.com/your-org/tokenisation-sdk.git
cd tokenisation-sdk
pnpm install
```

Build all packages:

```bash
pnpm -r build
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
