---
sidebar_position: 1
title: Architecture Overview
---

# Architecture Overview

The AHOY Tokenisation Platform is a monorepo that provides end-to-end infrastructure for tokenising real-world assets. This document describes the high-level architecture, package structure, server internals, and multi-chain deployment model.

## Monorepo Structure

The platform is organised as a pnpm workspace with the following top-level packages:

```
tokenisation-sdk/
  server/           @tokenisation/server     Express API server
  sdk/              @tokenisation/sdk        TypeScript SDK (Stripe-like client)
  sdk-react/        @tokenisation/sdk-react  React hooks and context providers
  sdk-react-native/ @tokenisation/sdk-react-native  React Native bindings
  ui-kit/           @tokenisation/ui-kit     Drop-in React components
  ui/               Dashboard application
  contracts/        Solidity smart contracts (Foundry)
  packages/
    conformance-suite/   Protocol conformance tests
    create-tokenised-asset/  CLI scaffolding tool
    sdk-playground/      Interactive SDK explorer
  website/          Documentation site (Docusaurus)
  e2e/              End-to-end Playwright tests
  docker/           Docker configuration
  policies/         YAML/JSON compliance policy definitions
  scripts/          Build and deployment scripts
```

## Server Architecture

The API server (`@tokenisation/server`) is an Express.js application with the following layers:

### Entry Point

The server boots from `src/index.ts`, initialises middleware, mounts route modules, connects to PostgreSQL and Redis, and starts listening on the configured port (default: 3001).

### Database Layer

- **ORM**: Drizzle ORM with PostgreSQL driver (pg)
- **Database**: PostgreSQL 16 for production, SQLite (better-sqlite3) for lightweight testing
- **Migrations**: Managed via Drizzle Kit (`drizzle-kit generate` / `drizzle-kit migrate`)
- **Connection**: Configured via `DATABASE_URL` environment variable

### Route Modules (60 modules)

The server exposes 60 route modules, each handling a specific domain. Routes are organised by resource type:

| Category | Routes |
|----------|--------|
| **Core** | `asset`, `token`, `transfer`, `investor`, `project`, `auth`, `chain` |
| **Compliance** | `compliance`, `kyc`, `kyc-webhook`, `accreditation`, `investor-tier` |
| **Financial** | `distribution`, `issuance`, `redemption`, `settlement`, `nav`, `ledger` |
| **Travel** | `boarding-pass`, `hotel`, `car-rental`, `concert`, `ticket`, `flight-oracle`, `travel-shield` |
| **DePIN** | `gpu-compute`, `depin` |
| **Markets** | `secondary-market`, `prediction-market` |
| **Infrastructure** | `eventbus`, `sse`, `webhook`, `scheduler`, `gas`, `relayer`, `indexer` |
| **Governance** | `iam`, `oauth`, `custody`, `vesting`, `exit-window` |
| **Reporting** | `audit`, `reports`, `export`, `reconciliation`, `metrics` |
| **Misc** | `dld`, `proof-of-funds`, `property-management`, `walletpass`, `theme`, `datasources` |

### Services Layer

Each route delegates business logic to a dedicated service. Services contain:

- Input validation (Zod schemas)
- Business rules and state machine enforcement
- Database operations (via Drizzle ORM repositories)
- Blockchain interactions (via ethers.js / viem)
- Event publishing (Redis event bus)

Key services include:

- `token.service.ts` -- Token creation, deployment, and lifecycle management
- `transfer.service.ts` -- Transfer saga orchestration with compliance checks
- `compliance.service.ts` -- Policy evaluation engine
- `settlement.service.ts` -- On-chain settlement and finality tracking
- `distribution.service.ts` -- Dividend and yield distribution calculations
- `gpu-compute.service.ts` -- GPU compute resource allocation and billing
- `hotel.service.ts` / `car-rental.service.ts` / `concert.service.ts` -- Travel and event tokenisation

### Middleware Stack

Requests pass through a layered middleware pipeline:

| Middleware | File | Purpose |
|-----------|------|---------|
| Helmet | (express) | Security headers |
| CORS | `cors` | Cross-origin configuration |
| Compression | `compression` | Response compression |
| Morgan | `logger.ts` | HTTP request logging |
| Auth | `auth.ts` | JWT and API key authentication |
| Rate Limiting | `rateLimit.ts` | Per-route rate limits |
| Context | `context.ts` | Request context (org, user, permissions) |
| RLS | `rls.ts` | Row-level security enforcement |
| Audit Trail | `auditTrail.ts` | Automatic action logging |
| Idempotency | `idempotency.ts` | Idempotent request handling |
| Usage Tracking | `usage.ts` | API usage metering |
| Tracing | `traceMiddleware.ts` | OpenTelemetry distributed tracing |
| Error Handler | `errorHandler.ts` | Structured error responses |

### Observability

The server integrates with OpenTelemetry for:

- **Distributed tracing** -- Trace requests across API, database, and blockchain calls
- **Metrics** -- Request latency, error rates, active connections, gas usage
- **Exporters** -- OTLP HTTP exporters for traces and metrics (compatible with Jaeger, Grafana, Datadog)

## SDK Architecture

The TypeScript SDK (`@tokenisation/sdk`) provides two interfaces:

### ApiClient (Stripe-like)

A module-based HTTP client for interacting with the API server:

```typescript
const client = new ApiClient({ apiKey: 'sk_test_xxx' });
client.projects.create({ ... });
client.investors.create({ ... });
client.tokens.deploy(tokenId);
client.transfers.create({ ... });
```

Modules: `projects`, `assets`, `investors`, `tokens`, `transfers`, `compliance`, `events`, `webhooks`, `audit`, `governance`, `escrow`, `cashflow`, `dld`, `legal`.

### TokenisationSDK (Low-Level)

A direct SDK for applications that need fine-grained control over the lifecycle engine, policy evaluator, and chain service:

```typescript
const sdk = new TokenisationSDK();
const asset = await sdk.assets.create({ ... });
await sdk.tokens.mint(asset.id, recipientAddress, amount);
```

### SDK Sub-packages

The SDK exposes multiple entry points for tree-shaking:

- `@tokenisation/sdk` -- Full SDK (server and client)
- `@tokenisation/sdk/client` -- Browser-safe exports only
- `@tokenisation/sdk/server` -- Server-only exports (secrets, admin API)
- `@tokenisation/sdk/core` -- Lifecycle engine, compliance engine, state machine
- `@tokenisation/sdk/models` -- Domain models and types
- `@tokenisation/sdk/plugins` -- Jurisdiction, KYC, and storage plugins
- `@tokenisation/sdk/contracts` -- Contract ABIs and interaction helpers
- `@tokenisation/sdk/packs` -- Pre-built asset packs (real estate, airline tickets, hotels, etc.)
- `@tokenisation/sdk/errors` -- Typed error classes

## React SDK

The React SDK (`@tokenisation/sdk-react`) wraps the core SDK in React primitives:

- **`TokenisationProvider`** -- Context provider that initialises the SDK client
- **Hooks** -- 30+ hooks including `useAsset`, `useTokens`, `useTransfer`, `useKYC`, `useCompliance`, `useCapTable`, `useWallet`, `useSecondaryMarket`, `useGovernance`, `useEventStream`, and more
- **Components** -- `KYCFlow`, `WalletConnect`, `ComplianceGuard`, `DocumentUpload`, `IdentityOnboarding`, `NetworkStatusIndicator`

## UI Kit

The UI Kit (`@tokenisation/ui-kit`) provides 40+ production-ready React components:

- **Investor flows** -- `KYCModal`, `InvestButton`, `IdentityStatus`, `AccreditationQuestionnaire`
- **Asset views** -- `AssetCard`, `AssetDetailView`, `PropertyCard`, `PortfolioDashboard`
- **Cap table** -- `CapTable`, `InvestorList`, `DistributionHistory`, `DistributionPreview`
- **Transactions** -- `TransactionFlow`, `TransferRequest`, `PendingTransfers`, `TransactionHistory`
- **Compliance** -- `ComplianceStepper`, `PolicySummary`, `RestrictionList`, `JurisdictionGate`
- **Travel** -- `TicketCard`, `TicketStatus`, `CheckInStatus`, `FlightEventTimeline`

## Smart Contracts

The contracts package uses Foundry (Forge) for compilation, testing, and deployment:

```
contracts/src/
  tokens/         Token implementations (ERC-3643, ERC-20, ERC-721, ERC-1155)
  identity/       On-chain identity registry and claims
  compliance/     Modular compliance contracts
  distribution/   Dividend and yield distribution
  governance/     On-chain governance (proposals, voting)
  factory/        Token factory for one-click deployment
  oracles/        Price and flight oracles
  automation/     Keeper-compatible automation
  zkp/            Zero-knowledge proof verifiers
  utils/          Shared utilities and libraries
```

Key token contracts:

- `ComplianceToken.sol` -- ERC-3643 security token with identity and compliance
- `RealToken.sol` -- Real estate-specific token with DLD integration
- `AirlineTicketNFT.sol` -- ERC-721 boarding pass with check-in state machine
- `HotelReservationNFT.sol` -- ERC-721 hotel reservation with cancellation logic
- `GPUNodeNFT.sol` -- ERC-721 GPU compute node with utilisation tracking
- `ComputeToken.sol` -- ERC-1155 GPU compute allocation
- `ConcertTicketNFT.sol` -- ERC-721 event ticket with entry validation

## Multi-Chain Support

The platform supports any EVM-compatible chain. Chain configuration is per-token:

| Chain | Chain ID | Typical Use |
|-------|----------|------------|
| Ethereum | 1 | High-value institutional assets |
| Polygon | 137 | Retail tokenisation, low fees |
| Base | 8453 | Consumer applications |
| Arbitrum One | 42161 | DeFi integrations |
| Hardhat / Anvil | 31337 | Local development |

The server manages RPC connections, gas estimation, and transaction submission per chain. The `relayer.service.ts` handles meta-transactions for gasless user experiences.

## Data Flow

A typical token issuance follows this path:

1. **Client** calls `POST /api/transfers` via the SDK
2. **Auth middleware** validates the API key and attaches org context
3. **Transfer route** validates input with Zod, creates a transfer record
4. **Transfer service** initiates the transfer saga
5. **Compliance service** evaluates all applicable policies
6. **Signing service** prepares and signs the on-chain transaction
7. **Relayer service** broadcasts the transaction to the target chain
8. **Indexer service** listens for the transaction receipt and block confirmation
9. **Settlement service** updates balances and marks the transfer as settled
10. **Event bus** publishes `transfer.settled` to Redis; webhooks fire to subscribers
11. **Audit trail** records every step with actor, timestamp, and state changes
