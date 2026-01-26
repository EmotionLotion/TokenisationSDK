# REST API Reference

Base URL: `http://localhost:3001/api/v1`

## Authentication

### Get SIWE Nonce

```http
POST /auth/siwe/nonce
Content-Type: application/json

{
  "address": "0x..."
}
```

**Response:**
```json
{
  "nonce": "abc123xyz"
}
```

### Verify SIWE Signature

```http
POST /auth/siwe/verify
Content-Type: application/json

{
  "message": "...",
  "signature": "0x..."
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "party": {
    "id": "uuid",
    "name": "...",
    "roles": ["INVESTOR"]
  }
}
```

### Using Authentication

Include JWT in all authenticated requests:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## Parties

### List Parties

```http
GET /parties
Authorization: Bearer <token>
```

**Response:**
```json
{
  "parties": [
    {
      "id": "uuid",
      "name": "John Doe",
      "type": "INDIVIDUAL",
      "roles": ["INVESTOR"],
      "jurisdiction": "US",
      "kycVerified": true,
      "isFrozen": false
    }
  ],
  "total": 1
}
```

### Get Party

```http
GET /parties/:id
Authorization: Bearer <token>
```

### Create Party

```http
POST /parties
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe",
  "type": "INDIVIDUAL",
  "roles": ["INVESTOR"],
  "jurisdiction": "US"
}
```

### Update Party

```http
PATCH /parties/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Jane Doe"
}
```

### Set KYC Status

```http
POST /parties/:id/kyc
Authorization: Bearer <token>
Content-Type: application/json

{
  "verified": true,
  "expiry": "2025-12-31T23:59:59Z"
}
```

### Freeze Party

```http
POST /parties/:id/freeze
Authorization: Bearer <token>
```

### Unfreeze Party

```http
POST /parties/:id/unfreeze
Authorization: Bearer <token>
```

---

## Assets

### List Assets

```http
GET /assets
Authorization: Bearer <token>
```

**Query Parameters:**
- `state` - Filter by lifecycle state
- `rightType` - Filter by right type
- `issuerId` - Filter by issuer

**Response:**
```json
{
  "assets": [
    {
      "id": "uuid",
      "name": "Property Token",
      "rightType": "OWNERSHIP",
      "state": "ACTIVE",
      "issuerId": "uuid",
      "jurisdiction": { "countryCode": "US" },
      "transferMode": "COMPLIANCE_GATED"
    }
  ],
  "total": 1
}
```

### Get Asset

```http
GET /assets/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "asset": { ... },
  "balances": {
    "party-uuid-1": "1000",
    "party-uuid-2": "500"
  }
}
```

### Create Asset

```http
POST /assets
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Property Token",
  "rightType": "OWNERSHIP",
  "issuerId": "uuid",
  "jurisdiction": {
    "countryCode": "US"
  },
  "transferMode": "COMPLIANCE_GATED",
  "metadata": {
    "description": "Tokenized real estate"
  }
}
```

### Transition Asset State

```http
POST /assets/:id/transition
Authorization: Bearer <token>
Content-Type: application/json

{
  "toState": "PENDING_VERIFICATION"
}
```

**Response:**
```json
{
  "asset": { ... },
  "event": {
    "id": "uuid",
    "type": "LIFECYCLE_TRANSITION",
    "fromState": "DRAFT",
    "toState": "PENDING_VERIFICATION"
  }
}
```

---

## Tokens

### Mint Tokens

```http
POST /tokens/:assetId/mint
Authorization: Bearer <token>
Content-Type: application/json

{
  "to": "party-uuid",
  "amount": "1000"
}
```

**Response:**
```json
{
  "success": true,
  "balance": "1000",
  "event": { ... }
}
```

### Transfer Tokens

```http
POST /tokens/:assetId/transfer
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "party-uuid-1",
  "to": "party-uuid-2",
  "amount": "500"
}
```

**Response:**
```json
{
  "success": true,
  "fromBalance": "500",
  "toBalance": "500",
  "event": { ... }
}
```

### Burn Tokens

```http
POST /tokens/:assetId/burn
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "party-uuid",
  "amount": "100"
}
```

### Get Balances

```http
GET /tokens/:assetId/balances
Authorization: Bearer <token>
```

**Response:**
```json
{
  "balances": {
    "party-uuid-1": "500",
    "party-uuid-2": "500"
  },
  "totalSupply": "1000"
}
```

### Get Party Balance

```http
GET /tokens/:assetId/balances/:partyId
Authorization: Bearer <token>
```

---

## Events

### List Events

```http
GET /events
Authorization: Bearer <token>
```

**Query Parameters:**
- `assetId` - Filter by asset
- `type` - Filter by event type
- `actorId` - Filter by actor
- `from` - Start date (ISO 8601)
- `to` - End date (ISO 8601)

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "type": "MINT",
      "assetId": "uuid",
      "actorId": "uuid",
      "timestamp": "2024-01-15T10:30:00Z",
      "data": {
        "to": "uuid",
        "amount": "1000"
      }
    }
  ],
  "total": 1
}
```

### Get Event

```http
GET /events/:id
Authorization: Bearer <token>
```

---

## Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "database": "connected",
  "version": "1.0.0"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ASSET_NOT_FOUND",
    "message": "Asset with ID xxx not found",
    "details": { ... }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `INVALID_TRANSITION` | 422 | Invalid state transition |
| `TRANSFER_DENIED` | 422 | Compliance check failed |
| `INSUFFICIENT_BALANCE` | 422 | Not enough tokens |
| `INTERNAL_ERROR` | 500 | Server error |

---

## Rate Limiting

Production deployments should implement rate limiting:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705318200
```
