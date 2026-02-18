---
sidebar_position: 20
title: FAQ
---

# Frequently Asked Questions

Common questions about the AHOY Tokenisation Platform.

---

## General

### What is the AHOY Tokenisation Platform?

AHOY is a comprehensive infrastructure platform for tokenising real-world assets (RWAs). It provides an API server, TypeScript SDK, React SDK, UI Kit, and Solidity smart contracts that handle the full lifecycle of tokenised assets -- from creation and compliance to on-chain deployment and secondary trading. Supported asset classes include real estate, airline tickets, hotel reservations, car rentals, concert tickets, GPU compute resources, prediction markets, and more.

### What blockchain networks are supported?

The platform supports any EVM-compatible chain. Out of the box, it is configured for Ethereum Mainnet (chain ID 1), Polygon (137), Base (8453), Arbitrum One (42161), and Hardhat/Anvil (31337) for local development. Chain selection is per-token, so a single project can have tokens on different networks.

### What token standards are supported?

The platform supports ERC-3643 (T-REX) for regulated security tokens, ERC-20 for fungible utility tokens, ERC-721 for non-fungible tokens (tickets, reservations), ERC-1155 for multi-token contracts, and ERC-1410 for partitioned security tokens. ERC-3643 is the recommended standard for assets that require regulatory compliance.

### Is the platform suitable for production use?

The platform is designed for production use with enterprise-grade security, compliance, and audit capabilities. However, ensure you have completed a security audit, configured proper authentication secrets, and tested your compliance policies before going live. See the [Security Audit Checklist](https://github.com/your-org/tokenisation-sdk/blob/main/SECURITY_AUDIT_CHECKLIST.md) for a comprehensive review guide.

---

## Setup and Installation

### What are the minimum system requirements?

- Node.js 18 or later
- pnpm 8 or later
- Docker 24+ and Docker Compose 2.20+ (for the full stack)
- 4 GB RAM minimum (8 GB recommended for running the full Docker stack)

### How do I run the platform locally?

The fastest path is Docker Compose:

```bash
docker-compose up -d
```

This starts the API server, PostgreSQL, Redis, and a local Anvil (Foundry) blockchain node. Contracts are deployed automatically on startup. The API is available at `http://localhost:3001`. See the [Installation guide](./getting-started/INSTALLATION.md) for details.

### Can I use npm or yarn instead of pnpm?

The monorepo is configured for pnpm workspaces. While you can install individual SDK packages with npm or yarn in your own project (`npm install @tokenisation/sdk`), contributing to the platform itself requires pnpm.

---

## SDK and API

### How do I authenticate API requests?

The platform supports two authentication methods:

1. **API Keys** -- Include your API key in the `Authorization` header: `Bearer sk_test_xxxxx`. Use `sk_test_` prefixed keys for sandbox and `sk_live_` prefixed keys for production.
2. **JWT Tokens** -- Obtained via the `/auth/login` or `/auth/siwe` (Sign-In with Ethereum) endpoints. JWTs are used for user-facing applications.

```typescript
const client = new ApiClient({
  apiKey: 'sk_test_xxxxx',
  baseUrl: 'http://localhost:3001',
});
```

### What is the difference between `ApiClient` and `TokenisationSDK`?

`ApiClient` is a high-level, Stripe-like HTTP client that communicates with the API server. It is the recommended interface for most applications. `TokenisationSDK` is a lower-level SDK that provides direct access to the lifecycle engine, policy evaluator, and chain service. Use `TokenisationSDK` when you need fine-grained control or are building server-side extensions.

### How do I handle errors from the SDK?

The SDK throws typed errors that extend `SDKError`. You can catch specific error types:

```typescript
import { ComplianceError, ValidationError, NetworkError } from '@tokenisation/sdk/errors';

try {
  await client.transfers.create({ ... });
} catch (error) {
  if (error instanceof ComplianceError) {
    console.log('Transfer blocked by compliance:', error.message);
  } else if (error instanceof ValidationError) {
    console.log('Invalid input:', error.details);
  } else if (error instanceof NetworkError) {
    console.log('Blockchain network error:', error.message);
  }
}
```

### Does the SDK support pagination?

Yes. All list endpoints return paginated responses. The SDK provides utility functions for iterating:

```typescript
import { paginate, collectAll } from '@tokenisation/sdk';

// Iterate page by page
for await (const page of paginate((cursor) => client.assets.list({ cursor }))) {
  console.log(page.data);
}

// Or collect everything
const allAssets = await collectAll((cursor) => client.assets.list({ cursor }));
```

---

## Compliance and KYC

### How does the compliance engine work?

Every token transfer passes through the compliance engine, which evaluates a set of composable policies. Policies check KYC status, jurisdiction restrictions, lockup periods, holder limits, accreditation requirements, and sanctions lists. A single policy rejection blocks the entire transfer. Compliance decisions are recorded in the audit trail.

### Can I test without real KYC verification?

Yes. Set `ENABLE_MOCK_KYC=true` in your environment variables. In mock mode, all investors are automatically KYC-approved. This is enabled by default in sandbox environments.

### How do I add custom compliance rules?

You can create custom compliance modules both on-chain (Solidity contracts implementing the `IComplianceModule` interface) and off-chain (server-side policy evaluators). Register your custom module with the compliance service and it will be evaluated alongside built-in modules during every transfer.

---

## Tokens and Assets

### What is the asset lifecycle?

Assets progress through states: `DRAFT` -> `PENDING_VERIFICATION` -> `VERIFIED` -> `ACTIVE` -> `FROZEN` / `REDEEMED` / `EXPIRED` / `BURNED`. Only assets in the `ACTIVE` state can have tokens transferred. See [Core Concepts](./CONCEPTS.md) for a detailed state machine diagram.

### Can I freeze or burn tokens after deployment?

Yes. Assets in the `ACTIVE` state can be transitioned to `FROZEN` to temporarily halt all transfers, or individual tokens can be burned. Force transfers (clawbacks) are supported for regulatory scenarios. All these operations require appropriate permissions and are fully logged.

### How are dividends distributed?

The platform takes a cap table snapshot at a specified date and calculates pro-rata distributions based on each investor's token balance. Distributions can be paid via bank transfer, stablecoin, or other configured payment rails. Use the `client.cashflow.createDistribution()` method to initiate a distribution.

---

## Deployment and Operations

### How do I deploy to production?

1. Set up PostgreSQL and Redis instances (managed services recommended)
2. Deploy the API server (Docker image or Node.js process)
3. Configure production environment variables (especially `JWT_SECRET`, `DATABASE_URL`, `RPC_URL`)
4. Deploy smart contracts to your target chain using Foundry
5. Configure a reverse proxy (nginx, Cloudflare) with TLS termination
6. Set up monitoring with OpenTelemetry-compatible backends

### Does the platform support horizontal scaling?

The API server is stateless and can be horizontally scaled behind a load balancer. Redis handles event bus communication and caching across instances. PostgreSQL should use a connection pooler (PgBouncer) for high-concurrency deployments.

### How do I monitor the platform?

The server exports OpenTelemetry traces and metrics via OTLP HTTP. Connect to any compatible backend: Jaeger, Grafana Tempo, Datadog, or New Relic. The `/metrics` endpoint exposes Prometheus-compatible metrics. The audit trail and event bus provide additional operational visibility.

---

## Further Reading

- [Installation](./getting-started/INSTALLATION.md) -- Setup guide
- [Quickstart](./getting-started/QUICKSTART.md) -- 5-minute tutorial
- [Core Concepts](./CONCEPTS.md) -- Assets, tokens, compliance, transfers
- [Architecture Overview](./architecture/OVERVIEW.md) -- System design and internals
- [Glossary](./GLOSSARY.md) -- Platform terminology
