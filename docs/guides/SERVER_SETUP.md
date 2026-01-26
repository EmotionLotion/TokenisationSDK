# Server Setup Guide

## Overview

The TokenisationSDK server provides a REST API for persistent storage and authentication. It supports both SQLite (development) and PostgreSQL (production).

## Quick Start

```bash
cd server
npm install
npm run dev
# Server running on http://localhost:3001
```

## Configuration

### Environment Variables

Create a `.env` file:

```bash
# server/.env

# Server
PORT=3001
NODE_ENV=development

# Database (SQLite - Development)
DATABASE_URL=file:./dev.db

# Database (PostgreSQL - Production)
# DATABASE_URL=postgres://user:password@localhost:5432/tokenisation

# Authentication
JWT_SECRET=your-secure-secret-key-here
JWT_EXPIRES_IN=24h

# CORS
CORS_ORIGIN=http://localhost:5173

# Optional: Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## Database Setup

### SQLite (Development)

No setup required. Database is created automatically at `dev.db`.

```bash
npm run dev
# Database created at server/dev.db
```

### PostgreSQL (Production)

#### Using Docker

```bash
# Start PostgreSQL
docker-compose up -d

# Run migrations
npm run db:migrate
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: tokenisation
      POSTGRES_PASSWORD: tokenisation
      POSTGRES_DB: tokenisation
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

#### Manual Setup

```bash
# Create database
createdb tokenisation

# Update .env
DATABASE_URL=postgres://user:pass@localhost:5432/tokenisation

# Run migrations
npm run db:migrate
```

## Database Schema

### Tables

```sql
-- Parties table
CREATE TABLE parties (
    id UUID PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    type VARCHAR(32) NOT NULL,
    roles TEXT[] NOT NULL,
    jurisdiction VARCHAR(2) NOT NULL,
    kyc_verified BOOLEAN DEFAULT FALSE,
    kyc_expiry TIMESTAMPTZ,
    is_frozen BOOLEAN DEFAULT FALSE,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    right_type VARCHAR(32) NOT NULL,
    state VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    issuer_id UUID REFERENCES parties(id),
    jurisdiction JSONB NOT NULL,
    transfer_mode VARCHAR(32) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Balances table
CREATE TABLE balances (
    id UUID PRIMARY KEY,
    asset_id UUID REFERENCES assets(id),
    party_id UUID REFERENCES parties(id),
    amount VARCHAR(78) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, party_id)
);

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    asset_id UUID REFERENCES assets(id),
    actor_id UUID REFERENCES parties(id),
    data JSONB NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table (for SIWE auth)
CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    party_id UUID REFERENCES parties(id),
    wallet_address VARCHAR(42) NOT NULL,
    siwe_nonce VARCHAR(64) NOT NULL,
    jwt_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migrations

```bash
# Create a new migration
npm run db:migration:create -- --name add_new_column

# Run migrations
npm run db:migrate

# Rollback last migration
npm run db:rollback
```

## API Endpoints

### Health Check

```bash
curl http://localhost:3001/health
# {"status":"ok","database":"connected","version":"1.0.0"}
```

### Authentication

```bash
# Get nonce
curl -X POST http://localhost:3001/api/v1/auth/siwe/nonce \
  -H "Content-Type: application/json" \
  -d '{"address":"0x..."}'

# Verify signature
curl -X POST http://localhost:3001/api/v1/auth/siwe/verify \
  -H "Content-Type: application/json" \
  -d '{"message":"...","signature":"0x..."}'
```

### Protected Routes

```bash
# List parties (requires auth)
curl http://localhost:3001/api/v1/parties \
  -H "Authorization: Bearer <token>"
```

## Connecting UI to Server

Update UI environment:

```bash
# ui/.env
VITE_USE_API_BACKEND=true
VITE_API_URL=http://localhost:3001/api/v1
```

Update store initialization:

```typescript
// ui/src/store.ts
import { ApiStoragePlugin, ApiClient } from '@tokenisation/sdk';

const apiClient = new ApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  getToken: () => localStorage.getItem('authToken'),
});

const sdk = new TokenisationSDK({ useMockPlugins: false });
sdk.plugins.register('storage', new ApiStoragePlugin(apiClient));
```

## Production Deployment

### Environment

```bash
# Production .env
NODE_ENV=production
DATABASE_URL=postgres://user:pass@prod-db:5432/tokenisation
JWT_SECRET=<strong-random-string>
CORS_ORIGIN=https://yourdomain.com
```

### Security Checklist

- [ ] Use strong JWT_SECRET
- [ ] Enable HTTPS
- [ ] Set restrictive CORS
- [ ] Enable rate limiting
- [ ] Use PostgreSQL (not SQLite)
- [ ] Regular database backups
- [ ] Monitor logs

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

```bash
docker build -t tokenisation-server .
docker run -p 3001:3001 --env-file .env tokenisation-server
```

## Monitoring

### Logs

```bash
# Development
npm run dev

# Production (with PM2)
pm2 start dist/index.js --name tokenisation-api
pm2 logs tokenisation-api
```

### Health Monitoring

```bash
# Add to monitoring system
curl http://localhost:3001/health | jq .status
```

## Troubleshooting

### "Database connection failed"

```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Check connection string
echo $DATABASE_URL
```

### "Migration failed"

```bash
# Reset database (development only)
rm server/dev.db
npm run db:migrate
```

### "CORS error"

```bash
# Update CORS_ORIGIN in .env
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

## Related Documents

- [REST API Reference](../reference/REST_API.md) - Full endpoint documentation
- [Installation](./INSTALLATION.md) - Initial setup
- [Architecture](../architecture/OVERVIEW.md) - System design
