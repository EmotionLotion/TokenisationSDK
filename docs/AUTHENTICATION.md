# Authentication Guide

The Tokenisation SDK API supports multiple authentication methods. This guide shows how to authenticate from any language.

## Authentication Methods

| Method | Use Case | Header |
|--------|----------|--------|
| **API Key** | Server-to-server integration | `Authorization: Bearer sk_live_xxx` |
| **JWT Token** | User sessions | `Authorization: Bearer <jwt>` |
| **OAuth2** | Automated systems | `Authorization: Bearer <access_token>` |
| **Dev Mode** | Local development only | `X-Dev-Org-Id` + `X-Dev-Party-Id` |

## API Key Authentication

API keys start with `sk_test_` (sandbox) or `sk_live_` (production). Include them in the `Authorization` header.

### cURL

```bash
curl -X GET https://api.your-platform.com/api/v1/assets \
  -H "Authorization: Bearer sk_live_your-api-key" \
  -H "Content-Type: application/json"
```

### TypeScript / JavaScript

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: 'sk_live_your-api-key',
  baseUrl: 'https://api.your-platform.com',
});

const assets = await client.assets.list();
```

Or without the SDK:

```typescript
const response = await fetch('https://api.your-platform.com/api/v1/assets', {
  headers: {
    'Authorization': 'Bearer sk_live_your-api-key',
    'Content-Type': 'application/json',
  },
});
const data = await response.json();
```

### Python

```python
import requests

API_KEY = "sk_live_your-api-key"
BASE_URL = "https://api.your-platform.com/api/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# List assets
response = requests.get(f"{BASE_URL}/assets", headers=headers)
assets = response.json()

# Create an asset
import json
asset_data = {
    "name": "Marina Heights Tower",
    "rightType": "OWNERSHIP",
    "jurisdiction": {"countryCode": "AE"},
}
response = requests.post(
    f"{BASE_URL}/assets",
    headers=headers,
    data=json.dumps(asset_data),
)
asset = response.json()
```

### Go

```go
package main

import (
    "fmt"
    "io"
    "net/http"
)

func main() {
    apiKey := "sk_live_your-api-key"
    baseURL := "https://api.your-platform.com/api/v1"

    req, _ := http.NewRequest("GET", baseURL+"/assets", nil)
    req.Header.Set("Authorization", "Bearer "+apiKey)
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{}
    resp, err := client.Do(req)
    if err != nil {
        panic(err)
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
}
```

### Ruby

```ruby
require 'net/http'
require 'json'
require 'uri'

api_key = 'sk_live_your-api-key'
base_url = 'https://api.your-platform.com/api/v1'

uri = URI("#{base_url}/assets")
http = Net::HTTP.new(uri.host, uri.port)
http.use_ssl = true

request = Net::HTTP::Get.new(uri)
request['Authorization'] = "Bearer #{api_key}"
request['Content-Type'] = 'application/json'

response = http.request(request)
assets = JSON.parse(response.body)
puts assets
```

### Java

```java
import java.net.http.*;
import java.net.URI;

public class TokenisationClient {
    private static final String API_KEY = "sk_live_your-api-key";
    private static final String BASE_URL = "https://api.your-platform.com/api/v1";

    public static void main(String[] args) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(BASE_URL + "/assets"))
            .header("Authorization", "Bearer " + API_KEY)
            .header("Content-Type", "application/json")
            .GET()
            .build();

        HttpResponse<String> response = client.send(request,
            HttpResponse.BodyHandlers.ofString());
        System.out.println(response.body());
    }
}
```

## JWT Authentication

For user sessions, obtain a JWT token via the auth endpoint and include it in subsequent requests.

### Obtaining a Token

```bash
# Login to get JWT
curl -X POST https://api.your-platform.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secure-password"}'

# Response:
# {
#   "token": "eyJhbGciOiJIUzI1NiIs...",
#   "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
#   "expiresIn": 3600
# }
```

### Using JWT in Requests

```bash
curl -X GET https://api.your-platform.com/api/v1/assets \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

### Refreshing Tokens

```bash
curl -X POST https://api.your-platform.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGciOiJIUzI1NiIs..."}'
```

**JWT Details:**
- Algorithm: HS256 (configurable)
- Expiry: 1 hour (configurable via `JWT_EXPIRES_IN`)
- Refresh token expiry: 7 days
- Issuer: `tokenisation-api`
- Audience: `tokenisation-sdk`

## OAuth2 Client Credentials

For automated systems using OAuth2 client credentials flow.

### TypeScript with OAuthTokenManager

```typescript
import { createOAuthTokenManager, createOAuthFetch } from '@tokenisation/sdk';

const tokenManager = createOAuthTokenManager({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  tokenEndpoint: 'https://api.your-platform.com/api/v1/auth/oauth/token',
  scopes: ['assets:read', 'tokens:write'],
  autoRefresh: true,
});

// Creates a fetch wrapper that auto-injects Bearer token
const authenticatedFetch = createOAuthFetch(tokenManager);

const response = await authenticatedFetch(
  'https://api.your-platform.com/api/v1/assets'
);
const assets = await response.json();

// Listen for token events
tokenManager.on('token:refreshed', () => console.log('Token refreshed'));
tokenManager.on('token:expired', () => console.log('Token expired'));
```

### cURL

```bash
# Step 1: Get access token
curl -X POST https://api.your-platform.com/api/v1/auth/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET&scope=assets:read"

# Step 2: Use the access token
curl -X GET https://api.your-platform.com/api/v1/assets \
  -H "Authorization: Bearer <access_token>"
```

## Idempotency Keys

Critical operations require an `Idempotency-Key` header or `idempotencyKey` field to prevent duplicates.

### Required For
- Token issuance (`POST /api/v1/tokens/:id/issue`)
- Token redemption (`POST /api/v1/tokens/:id/redeem`)
- Transfers (`POST /api/v1/transfers`)
- Clawbacks (`POST /api/v1/tokens/:id/clawback`)

### Usage

```bash
curl -X POST https://api.your-platform.com/api/v1/transfers \
  -H "Authorization: Bearer sk_live_xxx" \
  -H "Idempotency-Key: transfer-unique-id-12345" \
  -H "Content-Type: application/json" \
  -d '{"tokenId": "...", "fromWallet": "0x...", "toWallet": "0x...", "amount": "1000"}'
```

**Behavior:**
- Same key + same params = returns original response (no duplicate)
- Same key + different params = returns 409 Conflict error
- Keys expire after 7 days

## Request Headers Reference

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <api_key_or_jwt>` |
| `Content-Type` | Yes (POST/PUT) | `application/json` |
| `Idempotency-Key` | Conditional | Unique key for critical operations |
| `X-Request-ID` | No | Client-provided request correlation ID |
| `X-Trace-ID` | No | Distributed tracing ID |

## Response Headers

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Server-assigned request ID |
| `X-Org-ID` | Organization context |
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Remaining requests |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait (on 429) |

## Security Best Practices

1. **Never expose API keys in client-side code** — use server-to-server calls
2. **Store secrets in environment variables** — never hardcode in source
3. **Rotate API keys regularly** — revoke compromised keys immediately
4. **Use the minimum required scopes** when creating API keys
5. **Validate webhook signatures** before processing webhook payloads
6. **Use HTTPS** for all API communications
