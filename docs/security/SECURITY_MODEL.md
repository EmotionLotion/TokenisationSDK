---
sidebar_position: 1
title: Security Model
---

# Security Model

This document describes the security architecture of the AHOY Tokenisation SDK, covering authentication, authorization, smart contract security controls, audit logging, and infrastructure hardening.

## Authentication

The platform supports three authentication methods, used depending on context.

### API Keys

API keys are the primary authentication mechanism for server-to-server integrations. Keys follow the format `sk_live_...` (production) or `sk_test_...` (sandbox).

```bash
# API key via X-API-Key header (recommended)
curl -H "X-API-Key: sk_live_abc123..." https://api.ahoy.fund/v1/tokens

# API key via Bearer token
curl -H "Authorization: Bearer sk_live_abc123..." https://api.ahoy.fund/v1/tokens
```

Key properties:
- Scoped to an organization (`orgId`)
- Carry permission scopes (e.g., `admin`, `read`, `write`, `transfer`)
- Validated against the IAM service on every request
- Keys are hashed at rest; only the prefix is stored in plaintext for identification

### JWT Tokens

JWT tokens are used for user-facing authentication (dashboards, SDK clients). The server validates tokens with the following parameters:

| Parameter | Value |
|---|---|
| Algorithms | HS256, HS384, HS512 |
| Issuer | `tokenisation-api` (configurable via `JWT_ISSUER`) |
| Audience | `tokenisation-sdk` (configurable via `JWT_AUDIENCE`) |
| Expiry | 1 hour (configurable via `JWT_EXPIRES_IN`) |
| Refresh | 7 days (configurable via `JWT_REFRESH_EXPIRES_IN`) |

```typescript
// JWT payload structure
interface JwtPayload {
  partyId: string;   // user identifier
  address: string;   // wallet address
  orgId?: string;    // organization scope
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}
```

**Production enforcement**: In production and staging, the server exits at startup if `JWT_SECRET` is missing or shorter than 32 characters.

### Sign-In with Ethereum (SIWE)

For wallet-based authentication, the platform supports SIWE through the OAuth routes. Users sign a message with their Ethereum wallet, and the server verifies the signature and issues a JWT.

## Authorization

### Role-Based Access Control (RBAC)

The IAM service manages organizations, users, and API keys with role-based permissions:

| Role | Scope | Description |
|---|---|---|
| `admin` | Organization | Full access to all resources within the org |
| `issuer` | Organization | Create and manage tokens, issue/burn |
| `agent` | Organization | Process transfers, manage investors |
| `viewer` | Organization | Read-only access to all resources |
| `compliance` | Organization | Manage compliance rules, KYC approvals |

### Organization-Scoped Isolation

Every API request is scoped to an organization. The platform enforces isolation at two levels:

**Application level**: The `apiKeyMiddleware` extracts `orgId` from the authenticated key and attaches it to the request context. All service-layer queries include the `orgId` filter.

**Database level**: PostgreSQL Row Level Security (RLS) provides a second layer of isolation. The `rlsMiddleware` sets the current organization context in the database session:

```sql
-- RLS policy ensures queries only return rows belonging to the current org
SELECT app.set_current_org_id($1::uuid);

-- All subsequent queries are automatically filtered
SELECT * FROM tokens; -- only returns tokens for the current org
```

This defense-in-depth approach means that even if application-level filtering has a bug, the database will not leak data across organizations.

## Smart Contract Security

### ERC-3643 (T-REX) Compliance

The platform implements the ERC-3643 standard for security tokens, which provides built-in regulatory compliance mechanisms:

**Identity Registry**: Every token holder must be registered in the Identity Registry with verified claims before they can receive tokens. Transfers to unverified addresses revert.

**Modular Compliance**: Compliance rules are enforced by pluggable modules:

| Module | Purpose |
|---|---|
| `CountryRestrictionsModule` | Block transfers to/from restricted jurisdictions |
| `MaxBalanceModule` | Enforce maximum holding limits per investor |
| `MaxHoldersModule` | Cap the total number of token holders |
| `HoldTimeModule` | Enforce minimum hold periods |
| `TransferFeesModule` | Collect fees on transfers |
| `WhitelistModule` | Restrict transfers to whitelisted addresses |

### Pause

Token agents can pause all transfers in an emergency. When paused, `transfer`, `transferFrom`, `mint`, and `burn` all revert.

```solidity
// Pause all activity
token.pause();

// Resume operations
token.unpause();
```

### Freeze

Individual addresses can be frozen, making all their tokens non-transferable. Partial freezing is also supported to lock a specific amount.

```solidity
// Freeze an entire address
token.setAddressFrozen(userAddress, true);

// Freeze a specific amount
token.freezePartialTokens(userAddress, 1000 * 10**18);

// Check frozen status
bool frozen = token.isFrozen(userAddress);
uint256 frozenAmount = token.getFrozenTokens(userAddress);
```

### Clawback (Forced Transfer)

Authorized agents can force-transfer tokens between addresses without the holder's approval. This is required for regulatory compliance (e.g., court orders, sanctions enforcement).

```solidity
// Force transfer 500 tokens from Alice to Bob
token.forcedTransfer(alice, bob, 500 * 10**18);

// Batch forced transfers
token.batchForcedTransfer(fromList, toList, amounts);
```

### Recovery

If a token holder loses access to their wallet, the issuer can recover their tokens to a new wallet address, provided the holder's on-chain identity is verified.

```solidity
token.recoveryAddress(lostWallet, newWallet, investorOnchainID);
```

### NFT Contract Security

The travel and event NFT contracts (`AirlineTicketNFT`, `HotelReservationNFT`, `CarRentalNFT`, `ConcertTicketNFT`) implement additional security controls:

- **Role-based modifiers**: `onlyOwner`, `onlyAirline`, `onlyAgent`, `onlyVenue`, etc.
- **Status guards**: Operations are only allowed in specific lifecycle states
- **Pausable**: All contracts can be paused by the owner
- **Transfer window enforcement**: Transfers blocked within a configurable time window before the event
- **Anti-scalping**: Concert tickets enforce a `resalePriceCap` on transfers

## Audit Logging

### Automatic Audit Trail

The `auditTrailMiddleware` automatically logs all mutation operations (POST, PUT, PATCH, DELETE) on API v1 routes. Audit entries include:

| Field | Description |
|---|---|
| `orgId` | Organization scope |
| `actorId` | User or API key identifier |
| `actorType` | `user`, `api_key`, `system`, or `webhook` |
| `action` | `create`, `update`, `delete` |
| `resourceType` | Singularized resource name (e.g., `token`, `investor`) |
| `resourceId` | Target resource identifier |
| `description` | Human-readable action summary |
| `ipAddress` | Client IP address |
| `userAgent` | Client user agent string |
| `metadata` | Sanitized request body and response status |

### Sensitive Field Redaction

The audit trail automatically redacts sensitive fields before logging:

```
password, secret, apiKey, token, accessToken, refreshToken,
privateKey, mnemonic, seed, pin, otp, ssn, creditCard, cvv
```

These fields are replaced with `[REDACTED]` in audit metadata.

### Hash Chain Integrity

Audit log entries are chained using SHA-256 hashes. Each entry contains the hash of the previous entry, creating a tamper-evident chain. If any entry is modified or deleted, the chain breaks and integrity verification fails.

```bash
# Verify audit log integrity
curl https://api.ahoy.fund/v1/audit/verify \
  -H "X-API-Key: sk_live_..."
```

## Rate Limiting

The platform implements multi-tier rate limiting with Redis-backed distributed counters. If Redis is unavailable, the system degrades gracefully to in-memory rate limiting.

| Tier | Limit | Window | Use Case |
|---|---|---|---|
| Standard | 1000 req | 1 min | General API endpoints |
| Auth | 20 req | 1 min | Login, token refresh (failed requests only) |
| Heavy | 100 req | 1 min | Token deployment, bulk operations |
| Burst | 50 req | 1 sec | Flood prevention |
| Write | 60 req | 1 min | POST/PUT/DELETE operations |
| Transfer | 30 req | 1 min | Token transfers (sliding window) |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 997
X-RateLimit-Reset: 1735689660
X-RateLimit-Policy: 1000;w=60
```

## Transport Security

### CORS

CORS is configured per environment:
- **Development**: Allows `http://localhost:5173`
- **Sandbox**: Allows all origins (`*`)
- **Production**: Restricted to specific domains

### Content Security Policy

The API returns security headers via Caddy or the application:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

### TLS

- **Development**: Plain HTTP on localhost
- **Sandbox**: Automatic HTTPS via Caddy + Let's Encrypt
- **Production**: TLS termination at the Ingress controller with cert-manager

## Encryption at Rest

| Data | Encryption |
|---|---|
| Database (RDS) | AES-256 encryption at rest enabled |
| Redis | In-transit encryption with `requirepass` |
| Terraform state | S3 server-side encryption + DynamoDB for locking |
| Secrets | AWS Secrets Manager or HashiCorp Vault |
| API keys | Stored as bcrypt/SHA-256 hashes; raw key never persisted |

## Development Mode Security

The `AUTH_DEV_MODE` flag allows bypassing authentication in development. This is protected by multiple safety layers:

1. **Environment check**: Automatically disabled in `production` and `staging`, regardless of the environment variable value
2. **IP restriction**: Only requests from localhost (`127.0.0.1`, `::1`) are accepted
3. **Org prefix filtering**: Only `dev-*`, `test-*`, `demo-*` org IDs are allowed
4. **Usage logging**: Every dev-mode bypass is logged with timestamp, IP, and org ID
5. **Startup guard**: The server exits immediately if dev mode is detected in production

```bash
# Server output if dev mode is attempted in production:
# FATAL: AUTH_DEV_MODE cannot be enabled in production or staging
# Process exits with code 1
```
