# TokenisationSDK v0.001 — Quick Start Guide

> Goal: go from `git clone` to working prototype in under 60 minutes.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20+ | `node -v` |
| pnpm | 9+ | `pnpm -v` |

---

## Quick Start (5 minutes)

```bash
git clone <repo-url>
cd TokenisationSDK
pnpm install
pnpm build

cd server
cp .env.example .env   # adjust if needed
npm run dev
```

The server starts on **http://localhost:3001**.

Authentication is bypassed in dev mode — just pass the `X-Dev-Org-Id` header with every request.

### Troubleshooting

- **`better-sqlite3` or `argon2` build fails**: These are native modules. Run `cd server && npx node-gyp rebuild` or install build tools (`apt install build-essential python3` on Ubuntu, `xcode-select --install` on macOS).
- **"no such column" errors**: Delete the stale database and restart: `rm -f server/data/ahoy.db*` then restart the server. The schema auto-recreates.
- **Idempotency-Key errors on token/transfer routes**: In dev mode (`AUTH_DEV_MODE=true`), this header is optional. In production it's required for all mutating token operations to prevent double-processing.

---

## Real Estate E2E (15 minutes)

Walk through the full lifecycle: create an investor, register an asset, tokenize it, issue shares, transfer, distribute revenue, and audit.

Every `curl` command below uses these common headers:

```
-H "Content-Type: application/json" -H "X-Dev-Org-Id: dev-org-1"
```

### 1. Create an investor

```bash
curl -s http://localhost:3001/api/v1/investors \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "type": "individual",
    "email": "alice@test.com",
    "countryCode": "AE"
  }'
```

Save the returned `id` as `INVESTOR_ID`.

### 2. Create an asset

```bash
curl -s http://localhost:3001/api/v1/assets \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "name": "Marina Tower",
    "rightType": "OWNERSHIP",
    "jurisdiction": {
      "countryCode": "AE",
      "regulatoryFramework": "UAE_VARA",
      "accreditedOnly": false,
      "blockedJurisdictions": []
    }
  }'
```

Save the returned `id` as `ASSET_ID`.

### 3. Transition the asset through verification

```bash
# Move to PENDING_VERIFICATION
curl -s http://localhost:3001/api/v1/assets/$ASSET_ID/transition \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{"toState": "PENDING_VERIFICATION"}'

# Move to VERIFIED
curl -s http://localhost:3001/api/v1/assets/$ASSET_ID/transition \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{"toState": "VERIFIED"}'
```

### 4. Create a token

```bash
curl -s http://localhost:3001/api/v1/tokens \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -H "Idempotency-Key: create-token-1" \
  -d '{
    "name": "Marina Token",
    "symbol": "MHT",
    "standard": "ERC3643",
    "chainId": 8453,
    "totalSupply": "1000000",
    "assetId": "'"$ASSET_ID"'"
  }'
```

Save the returned `id` as `TOKEN_ID`.

### 5. Deploy the token

```bash
curl -s http://localhost:3001/api/v1/tokens/$TOKEN_ID/deploy \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -H "Idempotency-Key: deploy-token-1" \
  -d '{
    "deployerAddress": "0x1111111111111111111111111111111111111111"
  }'
```

### 6. Confirm deployment

```bash
curl -s http://localhost:3001/api/v1/tokens/$TOKEN_ID/confirm-deployment \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "contractAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "txHash": "0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    "blockNumber": 12345
  }'
```

### 7. Issue tokens to the investor

```bash
curl -s http://localhost:3001/api/v1/tokens/$TOKEN_ID/issue \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -H "Idempotency-Key: issue-1" \
  -d '{
    "investorId": "'"$INVESTOR_ID"'",
    "walletAddress": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "amount": "500000",
    "reason": "Initial allocation"
  }'
```

### 8. Check positions

```bash
curl -s http://localhost:3001/api/v1/tokens/$TOKEN_ID/positions \
  -H "X-Dev-Org-Id: dev-org-1"
```

### 9. Transfer tokens

```bash
curl -s http://localhost:3001/api/v1/transfers \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -H "Idempotency-Key: transfer-1" \
  -d '{
    "tokenId": "'"$TOKEN_ID"'",
    "fromWallet": "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "toWallet": "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    "amount": "100000"
  }'
```

### 10. Create a distribution

```bash
curl -s http://localhost:3001/api/v1/distributions \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "tokenId": "'"$TOKEN_ID"'",
    "name": "Q1 Rent",
    "type": "rent",
    "totalAmount": "50000",
    "recordDate": "2026-05-15T00:00:00.000Z",
    "paymentDate": "2026-06-01T00:00:00.000Z",
    "paymentMethod": "bank_transfer",
    "currency": "USD"
  }'
```

### 11. View the audit trail

```bash
curl -s http://localhost:3001/api/v1/audit \
  -H "X-Dev-Org-Id: dev-org-1"
```

---

## GPU Compute E2E (10 minutes)

Walk through the GPU compute vertical: register a node, verify it, tokenize, record revenue, distribute, and browse the marketplace.

### 1. Register a GPU node

```bash
curl -s http://localhost:3001/api/v1/gpu-nodes \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "gpuModel": "A100",
    "gpuCount": 8,
    "vramPerGpuGB": 80,
    "interconnect": "NVLink",
    "datacenterName": "Dubai DC-1",
    "datacenterLocation": "Dubai, UAE",
    "datacenterTier": 3,
    "acquisitionCostUsd": "250000",
    "acquisitionDate": "2025-06-15",
    "estimatedUsefulLifeMonths": 48
  }'
```

Save the returned `id` as `NODE_ID`.

### 2. Verify the node

```bash
# Start verification
curl -s http://localhost:3001/api/v1/gpu-nodes/$NODE_ID/verify \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1"

# Complete verification
curl -s http://localhost:3001/api/v1/gpu-nodes/$NODE_ID/verify/complete \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{"passed": true}'
```

### 3. Tokenize the node

```bash
curl -s http://localhost:3001/api/v1/gpu-nodes/$NODE_ID/tokenize \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "tokenSymbol": "GPU8A",
    "tokenName": "A100 Cluster",
    "totalSupply": "1000000",
    "pricePerToken": "0.25"
  }'
```

### 4. Record revenue

```bash
curl -s http://localhost:3001/api/v1/gpu-nodes/$NODE_ID/revenue \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "grossRevenueUsd": "12000",
    "electricityCostUsd": "3000",
    "periodStart": "2026-01-01T00:00:00.000Z",
    "periodEnd": "2026-01-31T23:59:59.000Z"
  }'
```

Save the returned `id` as `REVENUE_ID`.

### 5. Distribute revenue to token holders

```bash
curl -s http://localhost:3001/api/v1/gpu-nodes/$NODE_ID/distribute \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{
    "revenuePeriodId": "'"$REVENUE_ID"'"
  }'
```

### 6. Browse the compute marketplace

```bash
curl -s http://localhost:3001/api/v1/compute-market \
  -H "X-Dev-Org-Id: dev-org-1"
```

---

## Using the SDK Client

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({
  apiKey: 'sk_test_demo',
  baseUrl: 'http://localhost:3001/api/v1',
  defaultHeaders: { 'X-Dev-Org-Id': 'dev-org-1' },
});

// Create an investor
const investor = await client.investors.create({
  email: 'test@example.com',
  jurisdiction: 'AE',
});

// Create an asset
const asset = await client.assets.create({
  name: 'Marina Tower',
  rightType: 'OWNERSHIP',
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'UAE_VARA',
    accreditedOnly: false,
    blockedJurisdictions: [],
  },
});

console.log('Investor:', investor.id);
console.log('Asset:', asset.id);
```

---

## Running Tests

```bash
# Unit tests (275 tests)
cd server && pnpm test

# Integration tests (27 tests — requires the server to be running)
cd server && pnpm test:integration

# SDK tests (1141 tests)
cd sdk && pnpm test
```

---

## Demo Apps

```bash
# Real estate end-to-end demo
cd examples/real-estate-demo && npm run demo:api

# GPU compute demo
cd examples/compute-demo && npm run demo

# SDK client demo
cd examples/sdk-client-demo && npm run demo
```

---

## Architecture

```
TokenisationSDK/
  packages/
    core/           — generic primitives (types, state machines, registries)
    compliance/     — KYC/AML policy engine
    chains/         — blockchain abstraction layer
    realestate/     — real estate vertical (DLD, VARA, NAV, UAE policy)
    compute/        — GPU compute vertical
  sdk/              — umbrella package, re-exports all packages
  server/           — Express API server (SQLite in dev, Postgres in prod)
  examples/         — runnable demo apps
```

Key design decisions:

- **Vertical packs** — each asset class (real estate, compute, travel, loyalty) lives in its own package with its own types, policies, and workflows.
- **WorkflowRegistry** — generic workflow engine in core; verticals register their own state machines.
- **PackManifest** — every vertical declares its capabilities via a manifest in the pack registry.
- **Dev mode** — SQLite + auth bypass (`X-Dev-Org-Id` header) so you can prototype without infrastructure.
- **Idempotency** — mutating financial operations require an `Idempotency-Key` header to prevent double-processing.
