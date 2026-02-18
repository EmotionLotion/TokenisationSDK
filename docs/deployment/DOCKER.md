---
sidebar_position: 1
title: Docker Compose Deployment
---

# Docker Compose Deployment

Run the full AHOY Tokenisation SDK stack locally or as a hosted sandbox using Docker Compose. The stack includes the API server, PostgreSQL, Redis, and a local Ethereum node (Anvil).

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- 4 GB RAM minimum (8 GB recommended)
- Ports 3001, 5432, 6379, 8545 available

## Local Development Stack

The root `docker-compose.yml` brings up a complete development environment:

```bash
# Start all services
docker compose up -d

# Follow API logs
docker compose logs -f api

# Stop and remove volumes
docker compose down -v
```

### Services

| Service | Image | Port | Purpose |
|---|---|---|---|
| `chain` | `ghcr.io/foundry-rs/foundry` | 8545 | Anvil local Ethereum node (chain ID 31337) |
| `postgres` | `postgres:16-alpine` | 5432 | Primary database |
| `redis` | `redis:7-alpine` | 6379 | Event bus, caching, rate limiting |
| `api` | Built from `./server` | 3001 | AHOY API server |
| `deployer` | Built from `./contracts` | -- | Deploys contracts on startup (runs once) |
| `tests` | Built from `./tests` | -- | Conformance suite (opt-in profile) |
| `ui` | Built from `./ui` | 5173 | Dashboard UI (opt-in profile) |

### Architecture

```
                    +---------+
                    |  Caddy   |  (sandbox only)
                    | :80/:443 |
                    +----+----+
                         |
          +--------------+--------------+
          |              |              |
     +----+----+   +----+----+   +----+----+
     |   API    |   |   UI    |   |   RPC   |
     |  :3001   |   |  :5173  |   |  :8545  |
     +----+----+   +---------+   +----+----+
          |                           |
     +----+----+                +----+----+
     | Postgres |               |  Anvil   |
     |  :5432   |               |  Chain   |
     +----+----+               +---------+
          |
     +----+----+
     |  Redis   |
     |  :6379   |
     +---------+
```

## Environment Configuration

The API container reads configuration from environment variables. Key settings in the compose file:

```yaml
environment:
  NODE_ENV: development
  PORT: 3001

  # Database
  DATABASE_URL: postgresql://ahoy:ahoy_dev_password@postgres:5432/ahoy_tokenisation
  DB_MODE: postgres

  # Redis
  REDIS_URL: redis://redis:6379

  # Chain
  RPC_URL: http://chain:8545
  CHAIN_ID: 31337

  # Auth
  JWT_SECRET: dev-jwt-secret-change-in-production
  API_KEY_PREFIX: ak_test_

  # Features
  ENABLE_MOCK_KYC: "true"
  ENABLE_SANDBOX: "true"
  LOG_LEVEL: debug

  # CORS
  CORS_ORIGIN: http://localhost:5173
```

### Overriding with `.env`

Create a `.env` file at the project root to override defaults without modifying the compose file:

```bash
# .env
POSTGRES_PASSWORD=my_secure_password
JWT_SECRET=my_dev_jwt_secret_at_least_32_chars_long
REDIS_PASSWORD=my_redis_password
```

## Health Checks

Every service includes a health check. The API waits for all dependencies to be healthy before starting.

| Service | Check | Interval |
|---|---|---|
| `chain` | `cast block-number --rpc-url http://localhost:8545` | 5 s |
| `postgres` | `pg_isready -U ahoy -d ahoy_tokenisation` | 5 s |
| `redis` | `redis-cli ping` | 5 s |
| `api` | `curl -f http://localhost:3001/health` | 10 s |

Monitor health status:

```bash
docker compose ps
```

## Running Tests

The conformance test suite runs against the live stack:

```bash
docker compose --profile test up tests
```

Test results are written to the `test_results` volume.

## Running the UI

```bash
docker compose --profile ui up ui
```

The dashboard is available at `http://localhost:5173`.

## Contract Deployment

The `deployer` service runs once at startup. It uses Forge to deploy all contracts to the local Anvil chain:

```bash
forge script script/Deploy.s.sol \
  --rpc-url http://chain:8545 \
  --broadcast \
  --private-key 0xac0974bec...
```

Deployed addresses are written to the `deployments` volume.

## Sandbox Deployment

For a publicly accessible sandbox that integration partners can use, the project provides a separate compose file at `deploy/sandbox/docker-compose.sandbox.yml`.

### Sandbox Endpoints

| Endpoint | URL |
|---|---|
| API | `https://sandbox.api.ahoy.fund/v1` |
| OpenAPI docs | `https://sandbox.api.ahoy.fund/api/docs` |
| RPC (WebSocket) | `wss://sandbox.rpc.ahoy.fund` |
| UI Dashboard | `https://sandbox.ahoy.fund` |

### Deploying the Sandbox

```bash
cd deploy/sandbox

# Set required secrets
export POSTGRES_PASSWORD=<strong-password>
export JWT_SECRET=<min-32-char-secret>
export REDIS_PASSWORD=<redis-password>
export SANDBOX_API_KEY=ak_sandbox_partner_key_xxxxx

# Start the sandbox
docker compose -f docker-compose.sandbox.yml up -d
```

### Caddy for Automatic HTTPS

The sandbox uses [Caddy](https://caddyserver.com/) as a reverse proxy for automatic TLS certificate provisioning via Let's Encrypt. The `Caddyfile` configures three virtual hosts:

```
# API endpoint with rate limiting and security headers
sandbox.api.ahoy.fund {
    reverse_proxy api:3001
    header X-Content-Type-Options nosniff
    header X-Frame-Options DENY
    rate_limit {
        zone sandbox_api {
            key {remote_host}
            events 100
            window 1m
        }
    }
}

# RPC endpoint
sandbox.rpc.ahoy.fund {
    reverse_proxy chain:8545
}

# UI dashboard
sandbox.ahoy.fund {
    reverse_proxy ui:5173
}
```

### Sandbox-Specific Features

- **Persistent Anvil state**: Chain state is dumped to a volume and restored on restart.
- **Pre-provisioned API keys**: Partners receive sandbox keys without self-registration.
- **Sandbox seeder**: The `seeder` service populates demo data (tokens, investors, transactions).
- **Health monitor**: A lightweight `healthcheck` container polls the API every 60 seconds and logs alerts.
- **All verticals enabled**: `ENABLED_VERTICALS: real-estate,airline,hotel,car-rental,concert`.

## Troubleshooting

### API fails to start

Check that all dependencies are healthy:

```bash
docker compose ps
docker compose logs postgres
docker compose logs redis
docker compose logs chain
```

### Database connection refused

Ensure PostgreSQL is ready before the API starts. The health check dependency should handle this, but if you see connection errors, increase the `start_period` in the API health check.

### Chain RPC errors

Verify the Anvil node is running:

```bash
curl -s http://localhost:8545 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```
