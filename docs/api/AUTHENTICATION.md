---
sidebar_position: 3
title: Authentication
---

# Authentication

The AHOY Tokenisation API supports three authentication methods: **API Keys** for server-to-server communication, **JWT Bearer Tokens** for session-based access, and **SIWE (Sign In With Ethereum)** for wallet-based authentication.

---

## API Key Authentication

API keys are the recommended method for backend integrations. Keys follow the format `sk_<environment>_<random>` and are passed in the `Authorization` header.

### Key Format

| Prefix | Environment | Usage |
|--------|-------------|-------|
| `sk_test_` | Sandbox | Development and testing. No real transactions. |
| `sk_live_` | Production | Live transactions on mainnet chains. |

### Using an API Key

```bash
curl https://api.tokenisation.io/api/v1/tokens \
  -H "Authorization: Bearer sk_live_abc123def456..."
```

Alternatively, use the `X-API-Key` header:

```bash
curl https://api.tokenisation.io/api/v1/tokens \
  -H "X-API-Key: sk_live_abc123def456..."
```

### Creating API Keys

API keys are managed through the IAM (Identity and Access Management) module. Each key belongs to an organisation and carries specific scopes.

```typescript
import { createApiClient } from '@tokenisation/sdk';

// Use an existing admin key to create new keys
const client = createApiClient({ apiKey: 'sk_live_admin_key...' });

const org = await client.getOrganization();
// Organization: { id, name, slug, status, environment }
```

Keys are created at the organisation level through the dashboard or the IAM API:

```
POST /api/v1/iam/api-keys
```

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Human-readable key name |
| `scopes` | `string[]` | Permission scopes |
| `environment` | `enum` | `test` or `live` |
| `expiresAt` | `datetime` | Optional expiration date |

### API Key Scopes

Scopes restrict what an API key can do. Use the principle of least privilege.

| Scope | Description |
|-------|-------------|
| `admin` | Full access to all resources |
| `tokens:read` | Read token data |
| `tokens:write` | Create, deploy, and manage tokens |
| `investors:read` | Read investor data |
| `investors:write` | Create and manage investors |
| `transfers:read` | Read transfer history |
| `transfers:write` | Create and execute transfers |
| `compliance:read` | Read policies and decisions |
| `compliance:write` | Create and evaluate policies |
| `webhooks:manage` | Create and manage webhook endpoints |
| `dld:read` | Read DLD title information |
| `dld:write` | Register and verify DLD titles |

### Key Validation

When you send an API key, the server validates it against the IAM database, extracts the organisation ID and scopes, and attaches them to the request context. Every API call is scoped to the owning organisation -- you can never access another organisation's data.

---

## JWT Bearer Token Authentication

JWT tokens are used for session-based access, typically after a SIWE authentication flow. Tokens are short-lived (1 hour by default) and must be refreshed using a refresh token.

### Token Structure

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

JWT payload fields:

| Field | Type | Description |
|-------|------|-------------|
| `partyId` | `string` | The authenticated party's UUID |
| `address` | `string` | Ethereum address linked to the party |
| `orgId` | `string` | Optional organisation identifier |
| `iat` | `number` | Issued-at timestamp |
| `exp` | `number` | Expiration timestamp |
| `iss` | `string` | Issuer (`tokenisation-api`) |
| `aud` | `string` | Audience (`tokenisation-sdk`) |

### Token Refresh

Access tokens expire after 1 hour. Use the refresh token (valid for 7 days) to obtain new tokens:

```bash
curl -X POST https://api.tokenisation.io/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGci..."}'
```

Response:

```json
{
  "token": "eyJhbGci...",
  "refreshToken": "eyJhbGci..."
}
```

Both the access and refresh tokens are rotated on each refresh. The old refresh token is immediately invalidated (rotation prevents replay attacks).

---

## SIWE (Sign In With Ethereum)

SIWE enables wallet-based authentication without passwords. The flow uses [EIP-4361](https://eips.ethereum.org/EIPS/eip-4361) to authenticate users by their Ethereum wallet.

### Flow

1. **Request a nonce** -- the client sends the wallet address and receives a unique nonce.
2. **Sign the message** -- the client constructs a SIWE message, presents it for signing in the wallet.
3. **Verify and authenticate** -- the server verifies the signature, creates or links the party, and returns JWT tokens.

### Step 1: Request Nonce

```bash
curl -X POST https://api.tokenisation.io/api/v1/auth/siwe/nonce \
  -H "Content-Type: application/json" \
  -d '{"address": "0x1234567890abcdef1234567890abcdef12345678"}'
```

Response:

```json
{
  "nonce": "a1b2c3d4e5f6...",
  "expiresAt": "2026-02-18T12:10:00.000Z"
}
```

The nonce expires after 10 minutes.

### Step 2: Construct and Sign

In the frontend, construct the SIWE message and sign it with the wallet:

```typescript
import { SiweMessage } from 'siwe';

const message = new SiweMessage({
  domain: 'app.tokenisation.io',
  address: walletAddress,
  statement: 'Sign in to AHOY Tokenisation Platform',
  uri: 'https://app.tokenisation.io',
  version: '1',
  chainId: 1,
  nonce: nonceFromServer,
});

const messageString = message.prepareMessage();
const signature = await signer.signMessage(messageString);
```

### Step 3: Verify

```bash
curl -X POST https://api.tokenisation.io/api/v1/auth/siwe/verify \
  -H "Content-Type: application/json" \
  -d '{"message": "<siwe-message-string>", "signature": "0x..."}'
```

Response:

```json
{
  "token": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "party": {
    "id": "uuid",
    "name": "Wallet 0x1234...5678",
    "type": "INDIVIDUAL",
    "roles": ["INVESTOR"],
    "jurisdiction": "US",
    "kycVerified": false
  }
}
```

If the wallet address is not yet linked to a party, a new party is automatically created with the `INVESTOR` role.

---

## Rate Limits

Rate limits are applied per authentication identity (API key, JWT party, or IP address). Limits are returned in response headers.

### Response Headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds to wait before retrying (only on 429) |

### Rate Limit Tiers

| Tier | Window | Max Requests | Applies To |
|------|--------|-------------|------------|
| **Standard** | 1 minute | 1,000 | Most API endpoints |
| **Auth** | 1 minute | 20 | `/auth/*` endpoints (failed attempts only) |
| **Heavy** | 1 minute | 100 | Token deployment, bulk operations |
| **Burst** | 1 second | 50 | All endpoints (flood protection) |
| **Write** | 1 minute | 60 | POST/PUT/DELETE operations |
| **Transfer** | 1 minute | 30 | Transfer operations (sliding window) |

When a rate limit is exceeded, the API returns `429 Too Many Requests`:

```json
{
  "error": {
    "message": "Too many requests, please try again later",
    "code": "RATE_LIMIT_EXCEEDED",
    "retryAfter": 15,
    "limit": 1000,
    "windowMs": 60000
  }
}
```

### Enterprise Rate Limits

Contact sales for custom rate limit tiers. Enterprise plans support tiered rate limiting based on your subscription level, with configurable limits per endpoint group.

---

## Sandbox vs. Production

| Aspect | Sandbox (`sk_test_`) | Production (`sk_live_`) |
|--------|---------------------|------------------------|
| Base URL | `https://api.test.tokenisation.io` | `https://api.tokenisation.io` |
| Blockchain | Testnets (Polygon Amoy, Sepolia) | Mainnets (Polygon, Ethereum) |
| KYC providers | Mock/manual approval | Sumsub, Onfido, Jumio |
| DLD integration | Simulated responses | Live DLD REST gateway |
| Rate limits | Same as production | Same as sandbox |
| Data retention | Purged every 30 days | Permanent |

---

## Security Best Practices

1. **Never expose API keys in client-side code.** Use keys only in your backend. Frontend apps should use SIWE or proxy through your server.
2. **Use scoped keys.** Create separate keys per service with minimal scopes.
3. **Rotate keys regularly.** Rotate production keys at least quarterly.
4. **Store keys in a secret manager.** Use AWS Secrets Manager, HashiCorp Vault, or your platform's secret store -- never commit keys to version control.
5. **Monitor the audit trail.** All API key usage is logged. Review the audit log periodically for anomalies.
6. **Use HTTPS exclusively.** The API rejects plain HTTP requests in production.
