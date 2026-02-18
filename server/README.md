# AHOY Tokenisation API Server

Express.js API server for the AHOY Tokenisation Platform with real database persistence, compliance engine, and multi-chain support.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start with SQLite (default - no setup required!)
pnpm dev

# Server runs at http://localhost:3001
# Swagger UI at http://localhost:3001/api/docs
```

## Database Options

### SQLite (Default - Development)

No configuration needed. Data persists in `./data/ahoy.db`.

```bash
pnpm dev
```

### PostgreSQL (Production)

1. Start PostgreSQL with Docker:
```bash
docker compose up -d
```

2. Set environment variable:
```bash
export DB_MODE=postgresql
pnpm dev
```

3. Run migrations:
```bash
pnpm db:migrate
```

## API Endpoints

### Health & Docs
- `GET /health` — Server health check
- `GET /api/docs` — Swagger UI
- `GET /api/openapi.json` — OpenAPI spec

### Authentication
- `POST /api/v1/auth/siwe/nonce` — Get nonce for SIWE signing
- `POST /api/v1/auth/siwe/verify` — Verify signature, get JWT
- `POST /api/v1/auth/refresh` — Refresh JWT token
- `POST /api/v1/auth/logout` — Logout (requires auth)
- `GET /api/v1/auth/me` — Get current user
- `POST /api/v1/oauth/*` — OAuth provider integration

### Assets & Projects
- `GET/POST /api/v1/assets` — List / create assets
- `GET/PATCH/DELETE /api/v1/assets/:id` — Get / update / delete asset
- `POST /api/v1/assets/:id/transition` — Asset state transition
- `GET/POST /api/v1/projects` — Project management

### Tokens
- `POST /api/v1/tokens` — Create token definition
- `POST /api/v1/tokens/:id/deploy` — Deploy to chain
- `POST /api/v1/tokens/:id/issue` — Issue tokens (idempotent)
- `POST /api/v1/tokens/:assetId/mint` — Mint tokens
- `POST /api/v1/tokens/:assetId/transfer` — Transfer tokens
- `GET /api/v1/tokens/:assetId/balances` — Token balances
- `GET /api/v1/tokens/:id/cap-table` — Cap table

### Investors & Parties
- `GET/POST /api/v1/investors` — Investor onboarding
- `GET/POST /api/v1/parties` — Party management
- `POST /api/v1/parties/:id/kyc` — Update KYC status
- `POST /api/v1/parties/:id/freeze` — Freeze party
- `POST /api/v1/parties/:id/wallets` — Add wallet

### Compliance & Sanctions
- `POST /api/v1/compliance/policies` — Create compliance policy
- `POST /api/v1/compliance/check` — Check transfer compliance
- `GET /api/v1/compliance/receipts` — Decision receipts
- Sanctions screening (OFAC/UN) — called automatically during compliance checks

### Transfers
- `POST /api/v1/transfers` — Create compliant transfer (idempotent)
- `GET /api/v1/transfers` — List transfers

### KYC
- `POST /api/v1/kyc/sessions` — Initiate KYC session
- `GET /api/v1/kyc/status/:investorId` — Get KYC status
- `POST /api/v1/kyc-webhook/*` — Sumsub webhook receiver

### Governance
- `POST /api/v1/governance/proposals` — Create proposal
- `POST /api/v1/governance/vote` — Cast vote
- `POST /api/v1/governance/execute` — Execute proposal

### Distributions & Payouts
- `POST /api/v1/distributions` — Create distribution
- `GET /api/v1/distributions` — List distributions
- Dividend scheduling and payment execution

### Payment Rails
- Stripe integration (card payments, subscriptions)
- Circle USDC integration (stablecoin payments)

### Custody
- BitGo adapter — Multi-sig custody
- Fireblocks adapter — Institutional custody

### Issuance & Settlement
- `POST /api/v1/issuance/*` — Token issuance workflows
- `POST /api/v1/settlement/*` — Settlement operations
- `POST /api/v1/redemption/*` — Token redemption

### Industry Verticals
- `**/api/v1/airline/**` — Airline ticket operations, boarding passes
- `**/api/v1/hotel/**` — Hotel reservation management
- `**/api/v1/car-rental/**` — Car rental lifecycle
- `**/api/v1/concert/**` — Concert ticket operations
- `**/api/v1/dld/**` — Dubai Land Department integration

### Oracles & Data
- `GET /api/v1/chains` — Supported chains
- Flight oracle — Real-time flight data
- NAV feeds — Net asset value updates
- Chainlink data source integration

### Platform Operations
- `GET /api/v1/events` — Audit trail (event sourcing)
- `POST /api/v1/webhooks` — Webhook management
- `GET /api/v1/metrics` — Platform metrics
- `GET /api/v1/reports/*` — Regulatory reports
- SSE endpoint for real-time updates
- Gas estimation service
- Transaction relayer
- Ledger operations
- Reconciliation service

### IAM & Access Control
- Role-based access control
- Accreditation verification
- Identity management (ERC-734/735)

## Development Mode

Enable auth bypass for testing:

```bash
AUTH_DEV_MODE=true pnpm dev
```

Then use headers instead of JWT:

```bash
# Organization context
curl -H "X-Dev-Org-Id: dev-org-1" http://localhost:3001/api/v1/assets

# Party context
curl -H "x-dev-party-id: my-test-party" http://localhost:3001/api/v1/parties
```

## Environment Variables

See `.env.example` for all configuration options.

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_MODE` | `sqlite` | Database: `sqlite` or `postgresql` |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `AUTH_DEV_MODE` | `false` | Enable auth bypass |
| `JWT_SECRET` | — | JWT signing secret |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `SIGNING_PROVIDER` | auto | `ephemeral`, `file`, `kms`, or auto-detect |
| `SIGNING_KEY_PATH` | `./data/signing-key.pem` | Path for file-based signing key |
| `REDIS_URL` | — | Redis for rate limiting (optional) |
| `STRIPE_SECRET_KEY` | — | Stripe payment integration |
| `CIRCLE_API_KEY` | — | Circle USDC integration |
| `BITGO_ACCESS_TOKEN` | — | BitGo custody |
| `FIREBLOCKS_API_KEY` | — | Fireblocks custody |
| `SUMSUB_APP_TOKEN` | — | Sumsub KYC provider |

## Database Schema

60+ tables managed by Drizzle ORM, including:

- `organizations`, `projects` — Multi-tenant structure
- `assets`, `asset_documents` — Asset definitions and documents
- `investors`, `investor_wallets` — Investor management
- `tokens`, `token_balances`, `token_holders` — Token state
- `transfers`, `transfer_approvals` — Transfer tracking
- `compliance_policies`, `compliance_receipts` — Compliance engine
- `parties`, `party_wallets` — Party management
- `events`, `audit_log` — Event sourcing and audit trail
- `sessions` — SIWE auth sessions
- `chain_deployments` — Contract addresses per chain
- `ledger_positions`, `ledger_events` — Double-entry ledger
- `distributions`, `distribution_payments` — Dividend management
- `airline_tickets`, `hotel_reservations`, `car_rentals`, `concert_tickets` — Vertical tables
- `sanctions_screenings` — OFAC/UN screening results

## Signing Service

The server uses RSA signing for compliance DecisionReceipts:

| Mode | When | Description |
|------|------|-------------|
| `ephemeral` | `NODE_ENV=test` | New keys each restart |
| `auto-file` | `NODE_ENV=development` | Auto-generates `./data/signing-key.pem` |
| `file` | Explicit `SIGNING_PROVIDER=file` | Reads existing PEM file |
| `kms` | `SIGNING_PROVIDER=kms` | AWS KMS (production recommended) |

## License

MIT
