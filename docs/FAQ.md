# Frequently Asked Questions

## General

### What is the Tokenisation SDK?
A comprehensive TypeScript SDK for building compliant tokenized asset platforms. It provides Stripe-like APIs for asset tokenization, investor onboarding, KYC, token deployment, compliant transfers, and governance — all with built-in ERC-3643 compliance.

### What token standards are supported?
ERC-3643 (T-REX security tokens), ERC-20, ERC-721, ERC-1155, ERC-1410 (partitioned securities), ERC-4626 (tokenized vaults), and Soulbound tokens.

### Which blockchains are supported?
Ethereum Mainnet (Chain ID 1), Polygon (137), Base (8453), Arbitrum (42161), and testnets: Sepolia (11155111), Base Sepolia (84532), Arbitrum Sepolia (421614).

### Is this production-ready?
The SDK is ready for developer integration and POC deployments. Production mainnet deployment requires a professional smart contract security audit. See [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md) for details.

### What's the licensing?
MIT License — free for commercial and non-commercial use.

## Setup & Installation

### What are the prerequisites?
- Node.js 18+
- npm 9+
- Foundry (for smart contract development only)

### How do I set up the development environment?
```bash
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
npm install
npm run build --workspace=sdk
cp server/.env.example server/.env
cd server && npm run dev
```

### SQLite vs PostgreSQL — which should I use?
SQLite is the default for development (zero setup required). PostgreSQL is required for production — it supports concurrent access, distributed systems, and row-level security for tenant isolation.

### How do I switch to PostgreSQL?
1. Set `DB_MODE=postgresql` in your `.env` file
2. Set `DATABASE_URL=postgres://user:pass@localhost:5432/tokenisation`
3. Run `docker-compose up db` to start a local PostgreSQL instance
4. Restart the server

## Authentication

### What authentication methods are supported?
- **JWT tokens** — Primary auth for user sessions (1h expiry, refresh tokens)
- **API Keys** — For server-to-server integration (`sk_test_*` / `sk_live_*`)
- **OAuth2** — Client credentials flow for automated systems
- **SIWE** — Sign-In With Ethereum for wallet-based auth
- **Dev Mode** — Bypass auth in development (automatically disabled in production)

### How do I create an API key?
```typescript
// Via the IAM API
const apiKey = await client.iam.createApiKey(orgId, {
  name: 'Production Key',
  scopes: ['admin'],
  environment: 'live',
});
console.log('Key:', apiKey.key); // sk_live_xxx (shown only once)
```

### How does dev mode authentication work?
When `AUTH_DEV_MODE=true` (development only), you can bypass auth with headers:
```bash
curl -H "X-Dev-Org-Id: dev-org-1" \
     -H "X-Dev-Party-Id: dev-user-1" \
     http://localhost:3001/api/v1/assets
```
This is IP-restricted (localhost only) and org-prefix restricted (dev-*, test-*, demo-* only). The server refuses to start with dev mode in production.

## API Usage

### How does idempotency work?
Critical operations (issue, redeem, transfer) require an `idempotencyKey` to prevent duplicates:
```typescript
await client.tokens.issue(tokenId, {
  investorId: '...',
  amount: '1000',
  idempotencyKey: 'issue-batch1-inv123', // unique per operation
});
```
If you retry with the same key, you get the original response instead of a duplicate operation. Keys expire after 7 days.

### How do I handle pagination?
```typescript
// Option 1: Simple list
const page = await client.assets.list({ limit: 50, offset: 0 });

// Option 2: Async iterator
import { paginate } from '@tokenisation/sdk';
for await (const asset of paginate(cursor => client.assets.list({ cursor }))) {
  console.log(asset.name);
}

// Option 3: Collect all
import { collectAll } from '@tokenisation/sdk';
const allAssets = await collectAll(cursor => client.assets.list({ cursor }));
```

### What error format does the API use?
```json
{
  "error": {
    "message": "Transfer validation failed: recipient not KYC verified",
    "code": "COMPLIANCE_DENIED",
    "traceId": "abc123",
    "correlation_id": "req_abc123def456",
    "explanation": {
      "summary": "The recipient has not completed identity verification",
      "suggestedActions": ["Complete KYC for recipient investor"],
      "links": { "kyc_docs": "/docs/guides/COMPLIANCE_SETUP.md" }
    }
  }
}
```

### How do rate limits work?
| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Standard API | 1000 req | 60s |
| Auth endpoints | 20 req | 60s |
| Transfers | 30 req | 60s |
| Heavy operations | 100 req | 60s |

Rate limit info is returned in response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

## Compliance & KYC

### How does compliance validation work?
Every transfer is automatically validated against the token's compliance policy:
1. Identity check — Is recipient in the identity registry?
2. Country check — Is recipient's jurisdiction allowed?
3. Investor type — Does recipient meet investor requirements?
4. Balance limits — Would transfer exceed holder limits?
5. Time locks — Is the lockup period complete?

### Which KYC providers are supported?
SumSub (default) and Onfido. Configure via `SUMSUB_APP_TOKEN` / `ONFIDO_API_TOKEN` environment variables.

### Can I add custom compliance rules?
Yes, the compliance engine is modular. Built-in rules: IDENTITY_REQUIRED, COUNTRY_WHITELIST, COUNTRY_BLACKLIST, ACCREDITED_ONLY, MAX_HOLDERS, MAX_BALANCE, TIME_LOCK. Custom rules can be added via the plugin system.

## Smart Contracts

### How do contract upgrades work?
All token contracts use UUPS (Universal Upgradeable Proxy Standard). Upgrades require:
1. Multi-sig proposal (2-of-N signers)
2. 2-day timelock delay
3. 7-day execution window

### How do I deploy contracts?
```bash
cd contracts
forge script script/DeployUpgradeable.s.sol \
  --rpc-url $SEPOLIA_RPC_URL \
  --broadcast --verify
```

## Chainlink Integration

### What Chainlink services are supported?
- **Price Feeds** — Live NAV calculation for real estate tokens
- **Automation** — Scheduled compliance rechecks for ticket tokens
- **CCIP** — Cross-chain token transfers and settlement
- **Proof of Reserve** — Overcollateralization verification
- **Functions** — Custom off-chain computation

### How do I enable Chainlink price feeds?
```typescript
import { OracleService } from '@tokenisation/sdk/plugins';
const oracle = new OracleService({
  chainId: 8453,
  rpcUrl: process.env.BASE_RPC_URL,
  stalePriceThreshold: 3600, // 1 hour
});
const price = await oracle.getPrice('ETH/USD');
```

## Troubleshooting

### Server won't start — "JWT_SECRET required"
Set a secure JWT secret in your `.env` file (minimum 32 characters):
```bash
JWT_SECRET=$(openssl rand -base64 48)
```

### Server won't start — "AUTH_DEV_MODE not allowed in production"
Remove `AUTH_DEV_MODE=true` from your `.env` or set `NODE_ENV=development`.

### "Idempotency conflict" error on token issuance
You're reusing an idempotency key that was already used with different parameters. Generate a unique key per operation:
```typescript
import { generateIdempotencyKey } from '@tokenisation/sdk';
const key = generateIdempotencyKey(); // UUID-based
```

### Transfer fails with "COMPLIANCE_DENIED"
The recipient hasn't passed compliance checks. Verify:
1. Recipient investor has KYC status = 'approved'
2. Recipient's jurisdiction is in the token's country whitelist
3. Transfer wouldn't exceed MAX_HOLDERS limit
4. No active TIME_LOCK on the token

### Database migration errors
```bash
cd server
npm run db:migrate   # Apply pending migrations
npm run db:reset     # Reset database (development only)
```

### Redis connection refused
Redis is optional for development (falls back to in-memory). For production:
```bash
docker-compose up redis
# Then set REDIS_URL=redis://localhost:6379 in .env
```

### Contract deployment fails — "insufficient funds"
Ensure your deployer wallet has enough ETH/MATIC for gas. Testnet faucets:
- Sepolia: https://sepoliafaucet.com
- Base Sepolia: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### "Module not found: @tokenisation/sdk"
Build the SDK first:
```bash
npm run build --workspace=sdk
```

## Community & Support

- **GitHub Issues**: [github.com/EmotionLotion/TokenisationSDK/issues](https://github.com/EmotionLotion/TokenisationSDK/issues)
- **Documentation**: [docs/](../docs/) or [online docs](https://emotionlotion.github.io/TokenisationSDK/)
- **Contributing**: See [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Security**: Report vulnerabilities per [SECURITY.md](../SECURITY.md)
