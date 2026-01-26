# AHOY Tokenisation API Server

Express.js API server for the AHOY Tokenisation Platform with real database persistence.

## Quick Start

```bash
# Install dependencies
npm install

# Start with SQLite (default - no setup required!)
npm run dev

# Server runs at http://localhost:3001
```

## Database Options

### SQLite (Default - Development)

No configuration needed. Data persists in `./data/ahoy.db`.

```bash
# Just run the server
npm run dev
```

### PostgreSQL (Production)

1. Start PostgreSQL with Docker:
```bash
docker compose up -d
```

2. Set environment variable:
```bash
export DB_MODE=postgresql
npm run dev
```

3. Run migrations:
```bash
npm run db:migrate
```

## API Endpoints

### Health
- `GET /health` - Server health check

### Authentication (SIWE)
- `POST /api/v1/auth/siwe/nonce` - Get nonce for signing
- `POST /api/v1/auth/siwe/verify` - Verify signature, get JWT
- `POST /api/v1/auth/refresh` - Refresh JWT token
- `POST /api/v1/auth/logout` - Logout (requires auth)
- `GET /api/v1/auth/me` - Get current user (requires auth)

### Parties
- `GET /api/v1/parties` - List parties
- `GET /api/v1/parties/:id` - Get party details
- `POST /api/v1/parties` - Create party
- `PATCH /api/v1/parties/:id` - Update party
- `POST /api/v1/parties/:id/kyc` - Update KYC status
- `POST /api/v1/parties/:id/freeze` - Freeze party
- `POST /api/v1/parties/:id/unfreeze` - Unfreeze party
- `POST /api/v1/parties/:id/wallets` - Add wallet to party

### Assets
- `GET /api/v1/assets` - List assets
- `GET /api/v1/assets/:id` - Get asset details
- `POST /api/v1/assets` - Create asset
- `PATCH /api/v1/assets/:id` - Update asset (DRAFT only)
- `POST /api/v1/assets/:id/transition` - Change asset state
- `DELETE /api/v1/assets/:id` - Delete asset (DRAFT only)

### Tokens
- `POST /api/v1/tokens/:assetId/mint` - Mint tokens
- `POST /api/v1/tokens/:assetId/transfer` - Transfer tokens
- `GET /api/v1/tokens/:assetId/balances` - Get token balances

### Events
- `GET /api/v1/events` - List events (audit trail)
- `GET /api/v1/events/:id` - Get event details
- `GET /api/v1/events/asset/:assetId` - Get events for asset
- `GET /api/v1/events/stats/summary` - Event statistics

### Chains
- `GET /api/v1/chains` - List supported chains
- `GET /api/v1/chains/:chainId` - Get chain details
- `POST /api/v1/chains/deployments` - Record contract deployment

## Development Mode

Enable auth bypass for testing:

```bash
AUTH_DEV_MODE=true npm run dev
```

Then use `x-dev-party-id` header instead of JWT:

```bash
curl -X POST http://localhost:3001/api/v1/parties \
  -H "Content-Type: application/json" \
  -H "x-dev-party-id: my-test-party" \
  -d '{"name": "Test User", "type": "INDIVIDUAL", "jurisdiction": "US"}'
```

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `DB_MODE` - Database mode: `sqlite` (default) or `postgresql`
- `AUTH_DEV_MODE` - Enable auth bypass for development
- `JWT_SECRET` - JWT signing secret (change in production!)
- `CORS_ORIGIN` - Allowed CORS origin

## Database Schema

Tables:
- `parties` - Identity/KYC records
- `party_wallets` - Wallet addresses linked to parties
- `assets` - Tokenized asset definitions
- `events` - Audit trail (event sourcing)
- `sessions` - SIWE auth sessions
- `chain_deployments` - Contract addresses per chain
- `token_balances` - Cached token balances
