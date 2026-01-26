# Architecture & Design Decisions

This document explains the technical architecture and the reasoning behind key design decisions.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [SDK Architecture](#sdk-architecture)
3. [Server Architecture](#server-architecture)
4. [Smart Contract Architecture](#smart-contract-architecture)
5. [Security Architecture](#security-architecture)
6. [Production Features](#production-features)

---

## System Overview

The Tokenisation SDK is a monorepo containing four main components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATIONS                                   │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐   │
│   │   Your App  │    │  React UI   │    │  Admin Dashboard / CLI      │   │
│   └──────┬──────┘    └──────┬──────┘    └─────────────┬───────────────┘   │
└──────────┼──────────────────┼────────────────────────┼───────────────────┘
           │                  │                        │
           ▼                  ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SDK (@tokenisation/sdk)                           │
│                                                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐ │
│   │                           ApiClient                                   │ │
│   │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ ┌───────────┐   │ │
│   │  │ Projects │ │  Assets  │ │ Investors │ │ Tokens │ │ Transfers │   │ │
│   │  └──────────┘ └──────────┘ └───────────┘ └────────┘ └───────────┘   │ │
│   │  ┌────────────────────────────────────────────────────────────────┐ │ │
│   │  │                      Compliance                                 │ │ │
│   │  └────────────────────────────────────────────────────────────────┘ │ │
│   └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                      Validation (Zod)                               │   │
│   └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API SERVER                                     │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                         Middleware                                  │   │
│   │  Auth │ Rate Limit │ Idempotency │ Validation │ Error Handling     │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                       Routes (25 files)                             │   │
│   │  /projects │ /assets │ /investors │ /tokens │ /transfers │ ...     │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                      Services (Business Logic)                      │   │
│   └────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐   │
│   │                    Database (Drizzle ORM)                           │   │
│   │              PostgreSQL (prod) │ SQLite (dev)                       │   │
│   └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BLOCKCHAIN                                       │
│                                                                             │
│   ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  │
│   │    ERC1967Proxy    │  │  TokenGovernor     │  │  IdentityRegistry  │  │
│   │   (Token Proxy)    │  │  (Multi-sig Gov)   │  │                    │  │
│   └─────────┬──────────┘  └────────────────────┘  └────────────────────┘  │
│             │                                                              │
│             ▼                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐  │
│   │              ComplianceTokenUpgradeable (Implementation)            │  │
│   │                         ERC-3643 + UUPS                             │  │
│   └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## SDK Architecture

### Design Principle: Stripe-like API

The SDK is modeled after Stripe's developer experience:

```typescript
// Stripe
const customer = await stripe.customers.create({ email: 'x@y.com' });
const charge = await stripe.charges.create({ customer: customer.id, amount: 1000 });

// Tokenisation SDK
const investor = await client.investors.create({ email: 'x@y.com' });
const issuance = await client.tokens.issue(tokenId, { investorId: investor.id, ... });
```

**Why this pattern?**
- Familiar to millions of developers
- Discoverable via autocomplete
- Consistent naming conventions
- Clear resource hierarchy

### Module Structure

Each module (`projects`, `assets`, `investors`, `tokens`, `transfers`, `compliance`) follows the same pattern:

```
sdk/src/modules/
├── projects.ts      # ProjectsModule class
├── assets.ts        # AssetsModule class
├── investors.ts     # InvestorsModule class
├── tokens.ts        # TokensModule class
├── transfers.ts     # TransfersModule class
├── compliance.ts    # ComplianceModule class
└── validation.ts    # Zod schemas for all modules
```

Each module:
1. Defines input/output TypeScript interfaces
2. Validates all inputs with Zod schemas
3. Makes HTTP calls via shared HttpClient
4. Returns typed responses

### Input Validation

All SDK inputs are validated using Zod before sending to the server:

```typescript
// validation.ts
export const CreateTokenInputSchema = z.object({
  name: z.string().min(1).max(100),
  symbol: z.string().min(1).max(10),
  decimals: z.number().int().min(0).max(18).optional(),
  maxSupply: z.string().regex(/^\d+$/),
  chainId: z.number().int().positive(),
  // ...
});

// tokens.ts
async create(input: CreateTokenInput): Promise<Token> {
  const validated = validate(CreateTokenInputSchema, input);  // Throws if invalid
  const response = await this.http.post('/api/v1/tokens', validated);
  return response.data;
}
```

**Why Zod?**
- TypeScript-first validation
- Detailed error messages
- Type inference from schemas
- Composable schemas

---

## Server Architecture

### Layered Architecture

```
Request → Middleware → Route → Service → Database
                                  ↓
                              Blockchain (if needed)
```

### Middleware Stack

```typescript
app.use(helmet());              // Security headers
app.use(cors());                // CORS handling
app.use(rateLimiter);           // Rate limiting (Redis-backed)
app.use(authenticate);          // JWT/API key auth
app.use(idempotency);           // Idempotency handling
app.use(validateRequest);       // Request validation
```

**Middleware order matters:**
1. Security headers first
2. Rate limiting before auth (prevent auth endpoint abuse)
3. Auth before business logic
4. Idempotency after auth (needs user context)

### Database Layer

Using **Drizzle ORM** for type-safe database access:

```typescript
// Schema definition
export const tokens = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  chainId: integer('chain_id').notNull(),
  // ...
});

// Type-safe queries
const token = await db.query.tokens.findFirst({
  where: eq(tokens.id, tokenId),
  with: { asset: true, tranches: true }
});
```

**Why Drizzle?**
- Full TypeScript inference
- SQL-like syntax (not magic strings)
- Supports PostgreSQL and SQLite
- Fast and lightweight

### Transaction Support

Critical operations use database transactions:

```typescript
async issueTokens(input: IssueInput): Promise<Issuance> {
  return await db.transaction(async (tx) => {
    // 1. Check investor exists and is active
    const investor = await tx.query.investors.findFirst({...});
    if (!investor || investor.status !== 'active') {
      throw new Error('Investor not eligible');
    }

    // 2. Create issuance record
    const issuance = await tx.insert(issuances).values({...}).returning();

    // 3. Update token supply
    await tx.update(tokens).set({
      currentSupply: sql`${tokens.currentSupply} + ${input.amount}`
    });

    return issuance;
  });
  // If any step fails, entire transaction rolls back
}
```

---

## Smart Contract Architecture

### UUPS Proxy Pattern

All tokens are deployed as upgradeable proxies:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROXY ARCHITECTURE                                │
│                                                                             │
│   User calls:  proxy.transfer(to, amount)                                  │
│                         │                                                   │
│                         ▼                                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      ERC1967Proxy                                    │  │
│   │                                                                      │  │
│   │   • Stores all state (balances, allowances)                         │  │
│   │   • Fixed address (never changes)                                   │  │
│   │   • Delegates all calls to implementation                           │  │
│   │                                                                      │  │
│   │   implementation = 0xIMPL_V1                                        │  │
│   └──────────────────────────┬──────────────────────────────────────────┘  │
│                              │ delegatecall                                │
│                              ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              ComplianceTokenUpgradeable (V1)                         │  │
│   │                                                                      │  │
│   │   • Contains all logic (transfer, mint, burn)                       │  │
│   │   • Stateless (uses proxy's storage)                                │  │
│   │   • Can be upgraded via UUPS                                        │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   After upgrade:                                                           │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      ERC1967Proxy                                    │  │
│   │   implementation = 0xIMPL_V2  (updated!)                            │  │
│   └──────────────────────────┬──────────────────────────────────────────┘  │
│                              │ delegatecall                                │
│                              ▼                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │              ComplianceTokenUpgradeable (V2)                         │  │
│   │                                                                      │  │
│   │   • New logic with bug fixes / features                             │  │
│   │   • Same storage layout (critical!)                                 │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why UUPS over Transparent Proxy?**
- Smaller proxy contract (cheaper deployment)
- Upgrade logic in implementation (more flexible)
- EIP-1967 storage slots (standardized)

### Multi-Sig Governance

`TokenGovernor` prevents single-key compromise:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GOVERNANCE FLOW                                   │
│                                                                             │
│   1. PROPOSE                                                               │
│      ┌─────────┐                                                           │
│      │Signer A │ ──────► propose(upgrade to V2) ──────► Proposal Created   │
│      └─────────┘                                                           │
│                                                                             │
│   2. APPROVE (need 2 of 3)                                                 │
│      ┌─────────┐                                                           │
│      │Signer B │ ──────► approve(proposalId) ──────► Threshold reached!    │
│      └─────────┘                                           │               │
│                                                            ▼               │
│   3. TIMELOCK (2 days minimum)                      Proposal Queued        │
│                                                            │               │
│      ⏰ Wait 2 days...                                     │               │
│                                                            ▼               │
│   4. EXECUTE (anyone can call)                      Proposal Ready         │
│      ┌─────────┐                                           │               │
│      │ Anyone  │ ──────► execute(proposalId) ──────────────┘               │
│      └─────────┘                  │                                        │
│                                   ▼                                        │
│                            Upgrade Executed!                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Governance Parameters:**

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `REQUIRED_SIGS` | 2 | Minimum approvals needed |
| `MIN_DELAY` | 2 days | Time to review proposals |
| `GRACE_PERIOD` | 7 days | Window to execute after ready |

**Why these values?**
- 2 sigs: Prevents single compromised key from upgrading
- 2 day delay: Time for stakeholders to review and veto if needed
- 7 day grace: Reasonable window to execute without rushing

---

## Security Architecture

### Authentication

Two authentication modes:

**1. Production (JWT)**
```
Client                          Server
  │                               │
  │ POST /auth/login              │
  │ {email, password}             │
  │ ─────────────────────────────►│
  │                               │ Verify credentials
  │◄───────────────────────────── │
  │ {token: "eyJ...", refresh}    │
  │                               │
  │ GET /api/v1/tokens            │
  │ Authorization: Bearer eyJ...  │
  │ ─────────────────────────────►│
  │                               │ Verify JWT
  │◄───────────────────────────── │
  │ {data: [...]}                 │
```

**JWT Security Requirements:**
- `JWT_SECRET`: Must be 32+ characters, cryptographically random
- `JWT_EXPIRES_IN`: Short-lived (1 hour default)
- Refresh tokens for long sessions

**2. Development Bypass**
```
# Only when AUTH_DEV_MODE=true (server refuses to start in production)
curl -H "X-Dev-Org-Id: test-org" \
     -H "X-Dev-Party-Id: test-party" \
     http://localhost:3001/api/v1/tokens
```

### Rate Limiting

Prevents abuse and ensures fair access:

```
┌─────────────────────────────────────────────────────────────────┐
│                      RATE LIMITING                              │
│                                                                 │
│   Development (In-Memory)                                       │
│   ┌─────────────┐                                              │
│   │   Server    │ ─── 100 req/min per IP ───                   │
│   └─────────────┘                                              │
│                                                                 │
│   Production (Redis)                                            │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     │
│   │  Server 1   │────►│             │◄────│  Server 2   │     │
│   └─────────────┘     │    Redis    │     └─────────────┘     │
│   ┌─────────────┐     │   Cluster   │     ┌─────────────┐     │
│   │  Server 3   │────►│             │◄────│  Server N   │     │
│   └─────────────┘     └─────────────┘     └─────────────┘     │
│                                                                 │
│   Shared state = consistent limits across all servers          │
└─────────────────────────────────────────────────────────────────┘
```

**Why Redis for production?**
- Distributed rate limiting across multiple servers
- Persistent across server restarts
- Atomic operations prevent race conditions

### Idempotency

Prevents duplicate operations from network issues:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IDEMPOTENCY FLOW                                    │
│                                                                             │
│   Request 1: POST /tokens/issue                                            │
│   Idempotency-Key: "issue-123"                                             │
│                                                                             │
│   ┌─────────┐                    ┌─────────┐                               │
│   │ Client  │ ─────────────────► │ Server  │                               │
│   └─────────┘                    └────┬────┘                               │
│                                       │ Check: key "issue-123" exists?     │
│                                       │ No → Execute operation             │
│                                       │ Store: key → result                │
│                                       │ Return result                      │
│                                       ▼                                    │
│   ┌─────────┐     Result        ┌─────────┐                               │
│   │ Client  │ ◄──────────────── │ Server  │                               │
│   └─────────┘                    └─────────┘                               │
│                                                                             │
│   Request 2: POST /tokens/issue (retry due to timeout)                     │
│   Idempotency-Key: "issue-123" (same key)                                  │
│                                                                             │
│   ┌─────────┐                    ┌─────────┐                               │
│   │ Client  │ ─────────────────► │ Server  │                               │
│   └─────────┘                    └────┬────┘                               │
│                                       │ Check: key "issue-123" exists?     │
│                                       │ Yes → Return stored result         │
│                                       │ (NO duplicate operation!)          │
│                                       ▼                                    │
│   ┌─────────┐   Same Result     ┌─────────┐                               │
│   │ Client  │ ◄──────────────── │ Server  │                               │
│   └─────────┘                    └─────────┘                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Operations requiring idempotency keys:**
- Token issuance (prevents double-minting)
- Token redemption (prevents double-redemption)
- Transfers (prevents double-spending)

---

## Production Features

### Summary Table

| Feature | Development | Production |
|---------|-------------|------------|
| **Database** | SQLite | PostgreSQL |
| **Auth** | Dev bypass headers | JWT with 32+ char secret |
| **Rate Limiting** | In-memory | Redis-backed |
| **Idempotency** | In-memory | Redis-backed |
| **Contracts** | Local Anvil | Multi-sig governed |
| **Upgrades** | Direct | Timelock + multi-sig |

### Environment Configuration

```bash
# Production .env
NODE_ENV=production

# Database
DB_MODE=postgresql
DATABASE_URL=postgres://user:pass@host:5432/db

# Auth (CRITICAL)
JWT_SECRET=your-32+-character-cryptographically-random-secret
AUTH_DEV_MODE=false  # Server refuses to start if true in production

# Rate Limiting
REDIS_URL=redis://localhost:6379

# Blockchain
BASE_RPC_URL=https://mainnet.base.org
POLYGON_RPC_URL=https://polygon-rpc.com
```

### Deployment Checklist

- [ ] `NODE_ENV=production`
- [ ] `AUTH_DEV_MODE=false`
- [ ] `JWT_SECRET` is 32+ characters, randomly generated
- [ ] `REDIS_URL` configured for rate limiting
- [ ] PostgreSQL database configured
- [ ] Contracts deployed with multi-sig governance
- [ ] RPC URLs pointing to mainnet/production networks
- [ ] HTTPS enabled on API endpoints
- [ ] Monitoring and alerting configured
