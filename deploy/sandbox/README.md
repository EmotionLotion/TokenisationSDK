# Hosted Sandbox Deployment

Deploy a publicly accessible sandbox environment that integration partners can use
without running Docker locally.

## Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| API | `https://sandbox.api.ahoy.fund/v1` | REST API |
| Swagger UI | `https://sandbox.api.ahoy.fund/api/docs` | Interactive API documentation |
| OpenAPI Spec | `https://sandbox.api.ahoy.fund/api/openapi.json` | Raw OpenAPI 3.0.3 spec |
| RPC | `https://sandbox.rpc.ahoy.fund` | Ethereum JSON-RPC (Anvil) |
| Dashboard | `https://sandbox.ahoy.fund` | UI Dashboard |

## Quick Start

```bash
# 1. Copy and configure environment variables
cp .env.sandbox .env
# Edit .env with strong passwords

# 2. Deploy
docker-compose -f docker-compose.sandbox.yml up -d

# 3. Verify
curl https://sandbox.api.ahoy.fund/health
```

## Pre-provisioned Sandbox Credentials

Partners receive a sandbox API key for immediate testing:

```bash
# Default sandbox API key
X-API-Key: ak_sandbox_demo_key_12345
```

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const client = new TokenisationSDK({
  apiKey: 'ak_sandbox_demo_key_12345',
  baseUrl: 'https://sandbox.api.ahoy.fund/v1',
});

// Ready to use
const assets = await client.assets.list();
```

## Architecture

```
Internet
  │
  ├── :443 ──▶ Caddy (TLS) ──▶ API Server (:3001)
  │                           ──▶ UI Dashboard (:5173)
  │                           ──▶ Anvil RPC (:8545)
  │
  └── Internal Network
        ├── PostgreSQL (:5432)
        ├── Redis (:6379)
        └── Health Monitor
```

## Sandbox Features

- **Mock KYC**: All KYC verifications auto-approve in sandbox
- **Pre-funded accounts**: 20 Anvil accounts with 100,000 ETH each
- **Pre-deployed contracts**: TokenFactory, compliance modules, identity registry
- **Pre-seeded data**: Demo org, investors, assets, and tokens
- **Auto-reset**: Sandbox state can be reset via API (optional)
- **All verticals enabled**: Real estate, airline, hotel, car rental, concert

## Monitoring

```bash
# View logs
docker-compose -f docker-compose.sandbox.yml logs -f api

# Health check
curl https://sandbox.api.ahoy.fund/health

# View metrics
curl https://sandbox.api.ahoy.fund/api/v1/metrics
```

## Maintenance

```bash
# Restart services
docker-compose -f docker-compose.sandbox.yml restart api

# Reset sandbox state (database + chain)
docker-compose -f docker-compose.sandbox.yml down -v
docker-compose -f docker-compose.sandbox.yml up -d

# Update to latest
docker-compose -f docker-compose.sandbox.yml pull
docker-compose -f docker-compose.sandbox.yml up -d --build
```

## Production Notes

- Replace `CHANGE_ME_*` values in `.env` with strong secrets
- Configure DNS A records for `sandbox.api.ahoy.fund`, `sandbox.rpc.ahoy.fund`, `sandbox.ahoy.fund`
- Caddy automatically obtains and renews Let's Encrypt TLS certificates
- Consider deploying on a VPS with at least 4GB RAM and 2 vCPUs
- For Kubernetes deployment, use the Helm charts in `../helm/` instead
