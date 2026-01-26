# Installation Guide

## Prerequisites

- Node.js 18+
- npm or pnpm
- Git

## Quick Install

### SDK Only

```bash
npm install @tokenisation/sdk
```

### Full Development Setup

```bash
# Clone repository
git clone <repository-url>
cd TokenisationSDK

# Install all dependencies
npm install

# Build SDK
cd sdk && npm run build && cd ..

# Build UI Kit
cd ui-kit && npm run build && cd ..
```

## Project Structure

```
TokenisationSDK/
├── sdk/                 # Core TypeScript SDK
│   ├── src/
│   │   ├── core/        # Interfaces, types, lifecycle
│   │   ├── modules/     # Asset, Token, Party modules
│   │   ├── plugins/     # Plugin implementations
│   │   └── SDK.ts       # Main SDK class
│   └── package.json
│
├── contracts/           # Solidity smart contracts
│   ├── src/
│   │   ├── token/       # ComplianceToken
│   │   └── compliance/  # IdentityRegistry, ComplianceModule
│   └── foundry.toml
│
├── server/              # Express API server
│   ├── src/
│   │   ├── routes/      # API endpoints
│   │   ├── db/          # Database schema, migrations
│   │   └── index.ts     # Server entry
│   └── package.json
│
├── ui/                  # React dashboard
│   ├── src/
│   │   ├── components/  # UI components
│   │   └── store.ts     # State management
│   └── package.json
│
├── ui-kit/              # Reusable React components
│   ├── src/
│   │   └── components/  # KYCModal, WalletConnect, etc.
│   └── package.json
│
└── docs/                # Documentation
```

## Running the Development Environment

### Option 1: UI Only (Mock Data)

```bash
cd ui
npm install
npm run dev
# Open http://localhost:5173
```

### Option 2: Full Stack (API + Database)

**Terminal 1 - Database:**
```bash
cd server
docker-compose up -d  # Starts PostgreSQL
# Or use SQLite (no Docker needed)
```

**Terminal 2 - API Server:**
```bash
cd server
npm install
npm run dev
# API running on http://localhost:3001
```

**Terminal 3 - UI:**
```bash
cd ui
npm install
npm run dev
# UI running on http://localhost:5173
```

### Option 3: Smart Contracts

```bash
cd contracts

# Install Foundry (if not installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Build contracts
forge build

# Run tests
forge test

# Start local blockchain
anvil

# Deploy (in another terminal)
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

## Environment Variables

### UI (.env)

```bash
# ui/.env
VITE_USE_API_BACKEND=false   # true for API mode, false for mock
VITE_API_URL=http://localhost:3001/api/v1
```

### Server (.env)

```bash
# server/.env
PORT=3001
DATABASE_URL=file:./dev.db   # SQLite
# DATABASE_URL=postgres://user:pass@localhost:5432/tokenisation  # PostgreSQL
JWT_SECRET=your-secret-key
CORS_ORIGIN=http://localhost:5173
```

## Verifying Installation

### SDK

```typescript
import { TokenisationSDK, RightType, PartyType, PartyRole } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({ useMockPlugins: true });

// Create a party
const issuer = sdk.parties_.create({
  name: 'Test Issuer',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'US',
});

console.log('SDK working:', issuer.id);
```

### API Server

```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","database":"connected"}
```

### UI

Open http://localhost:5173 and verify the dashboard loads.

## Troubleshooting

### "Module not found" errors

```bash
# Rebuild SDK
cd sdk && npm run build

# Rebuild UI Kit
cd ui-kit && npm run build
```

### Port already in use

```bash
# Find and kill process on port
lsof -i :5173
kill -9 <PID>
```

### Database connection failed

```bash
# Check Docker is running
docker ps

# Or ensure SQLite file exists
ls server/dev.db
```

## Next Steps

- [Quick Start](./QUICKSTART.md) - Tokenize your first asset
- [SDK Usage](../guides/SDK_USAGE.md) - Complete API guide
- [Server Setup](../guides/SERVER_SETUP.md) - Configure the API server
