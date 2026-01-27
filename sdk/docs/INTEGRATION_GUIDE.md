# Tokenisation SDK Integration Guide

This guide walks you through integrating the Tokenisation SDK into your application, from initial setup to production deployment.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#authentication)
3. [Common Patterns](#common-patterns)
4. [Error Handling](#error-handling)
5. [Webhooks](#webhooks)
6. [Best Practices](#best-practices)
7. [API Reference](#api-reference)

---

## Quick Start

### 1. Install the SDK

```bash
npm install @tokenisation/sdk
# or
yarn add @tokenisation/sdk
# or
pnpm add @tokenisation/sdk
```

### 2. Get API Credentials

1. Sign up at [https://dashboard.tokenisation.io](https://dashboard.tokenisation.io)
2. Create an organization
3. Generate API keys in the Settings > API Keys section
4. Store your secret key securely (it starts with `sk_test_` or `sk_live_`)

### 3. Initialize the Client

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: process.env.TOKENISATION_API_KEY,
  environment: 'test', // or 'live' for production
});
```

### 4. Make Your First API Call

```typescript
// List all assets in your organization
const assets = await client.assets.list({ limit: 10 });
console.log(`Found ${assets.pagination.total} assets`);

for (const asset of assets.data) {
  console.log(`- ${asset.name} (${asset.state})`);
}
```

---

## Authentication

The SDK supports multiple authentication methods to suit different use cases.

### API Key Authentication (Server-Side)

Best for server-to-server integrations. API keys provide full access to your organization's resources.

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: 'sk_test_your_secret_key',
});
```

**Security Note:** Never expose API keys in client-side code. Use environment variables.

### OAuth2 Client Credentials (Partner Integrations)

For partner applications that need programmatic access with specific scopes.

```typescript
import { OAuthTokenManager, createOAuthFetch } from '@tokenisation/sdk';

// Create token manager
const tokenManager = new OAuthTokenManager({
  clientId: 'cli_your_client_id',
  clientSecret: 'sec_your_client_secret',
  tokenEndpoint: 'https://api.tokenisation.io/oauth/token',
  scopes: ['read:assets', 'write:transfers'],
});

// Auto-refreshing fetch
const authFetch = createOAuthFetch(tokenManager);

// Use with API client
const client = createApiClient({
  fetch: authFetch,
});

// Token refresh events
tokenManager.onTokenRefresh((token) => {
  console.log('Token refreshed');
});

tokenManager.onTokenError((error) => {
  console.error('Token error:', error);
});
```

### SIWE Authentication (User-Facing Apps)

For web applications where users authenticate with their Ethereum wallets.

```typescript
import { createSIWEAuthPlugin } from '@tokenisation/sdk';

const siwePlugin = createSIWEAuthPlugin({
  domain: 'your-app.com',
  statement: 'Sign in to Your App',
});

// Generate nonce
const nonce = await siwePlugin.generateNonce(userAddress);

// After user signs the message
const session = await siwePlugin.verify(message, signature);
console.log('Authenticated as:', session.address);
```

---

## Common Patterns

### Creating Assets

```typescript
// Create a real estate asset
const asset = await client.assets.create({
  name: 'Downtown Office Building',
  description: 'Class A office space in the financial district',
  projectId: 'proj_abc123',
  rightType: 'OWNERSHIP',
  jurisdiction: {
    country: 'AE',
    subdivision: 'DUBAI',
  },
  attributes: {
    propertyType: 'office',
    sqft: 50000,
    location: {
      address: '123 Sheikh Zayed Road',
      city: 'Dubai',
    },
  },
});

console.log('Created asset:', asset.id);
```

### Managing Investors

```typescript
// Onboard a new investor
const investor = await client.investors.create({
  type: 'individual',
  email: 'investor@example.com',
  jurisdiction: 'US',
  classification: 'accredited',
});

// Start KYC verification
const kycSession = await client.kyc.createSession({
  investorId: investor.id,
  provider: 'sumsub',
  level: 'enhanced',
});

console.log('KYC URL:', kycSession.redirectUrl);

// Add investor wallet
await client.investors.addWallet({
  investorId: investor.id,
  address: '0x1234...',
  chainId: 1,
  label: 'Primary Wallet',
});
```

### Processing Transfers

```typescript
// Create a transfer
const transfer = await client.transfers.create({
  tokenId: 'tok_abc123',
  fromWallet: '0xSeller...',
  toWallet: '0xBuyer...',
  amount: '1000000000000000000', // 1 token (18 decimals)
  idempotencyKey: 'unique-transfer-id-123',
});

// Check transfer status
const status = await client.transfers.get(transfer.id);
console.log('Transfer status:', status.status);

// Listen for transfer updates via webhook
// See Webhooks section below
```

### Pagination

```typescript
import { paginate, Paginator, collectAll } from '@tokenisation/sdk';

// Cursor-based iteration (memory efficient)
for await (const investor of paginate(
  (cursor) => client.investors.list({ cursor, limit: 100 })
)) {
  console.log(investor.name);
}

// Page-based pagination
const paginator = new Paginator(
  (page, limit) => client.tokens.list({ page, limit })
);

// Get specific page
const page1 = await paginator.getPage(1);

// Find first matching item
const token = await paginator.find(t => t.symbol === 'REALTY');

// Collect all items (use with caution for large datasets)
const allTokens = await collectAll(
  (cursor) => client.tokens.list({ cursor, limit: 100 }),
  { maxItems: 1000 }
);
```

---

## Error Handling

### Error Codes Reference

| Code | Description | Resolution |
|------|-------------|------------|
| `authentication_failed` | Invalid or expired credentials | Check API key or refresh token |
| `insufficient_permissions` | Missing required scope | Request additional scopes |
| `validation_error` | Invalid request parameters | Check request body |
| `compliance_violation` | Transfer blocked by compliance | Review compliance rules |
| `quota_exceeded` | API rate limit reached | Upgrade plan or retry later |
| `resource_not_found` | Entity doesn't exist | Verify ID and organization |

### Handling Errors

```typescript
import { TokenizationError, isSDKError, ErrorCode } from '@tokenisation/sdk';

try {
  const transfer = await client.transfers.create({
    tokenId: 'tok_invalid',
    fromWallet: '0x...',
    toWallet: '0x...',
    amount: '1000',
  });
} catch (error) {
  if (isSDKError(error)) {
    switch (error.code) {
      case ErrorCode.VALIDATION_ERROR:
        console.error('Invalid request:', error.details);
        break;
      case ErrorCode.COMPLIANCE_ERROR:
        console.error('Compliance violation:', error.violations);
        // Show user-friendly message
        break;
      case ErrorCode.AUTHENTICATION_ERROR:
        // Refresh token or re-authenticate
        break;
      default:
        console.error('API error:', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Retry Strategies

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      // Don't retry client errors (4xx)
      if (isSDKError(error) && error.status < 500) {
        throw error;
      }

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// Usage
const transfer = await withRetry(() =>
  client.transfers.create({ ... })
);
```

### Idempotency Keys

Use idempotency keys to safely retry operations:

```typescript
import { randomUUID } from 'crypto';

const idempotencyKey = randomUUID();

// Safe to retry - will return same result
const transfer = await client.transfers.create({
  tokenId: 'tok_abc123',
  fromWallet: '0x...',
  toWallet: '0x...',
  amount: '1000',
  idempotencyKey,
});
```

---

## Webhooks

### Setting Up Endpoints

```typescript
// Register a webhook endpoint
const endpoint = await client.webhooks.create({
  url: 'https://your-app.com/webhooks/tokenisation',
  events: ['transfer.*', 'token.deployed', 'investor.kyc.passed'],
});

console.log('Webhook secret:', endpoint.secret);
// Store this securely - used for signature verification
```

### Verifying Signatures

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expected}`)
  );
}

// Express middleware
app.post('/webhooks/tokenisation', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;

  if (!verifyWebhookSignature(req.body.toString(), signature, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body.toString());
  handleWebhookEvent(event);

  res.status(200).send('OK');
});
```

### Handling Events

```typescript
async function handleWebhookEvent(event: WebhookEvent) {
  console.log('Received event:', event.type);

  switch (event.type) {
    case 'transfer.confirmed':
      await handleTransferConfirmed(event.data);
      break;

    case 'investor.kyc.passed':
      await handleKycPassed(event.data);
      break;

    case 'token.deployed':
      await handleTokenDeployed(event.data);
      break;

    default:
      console.log('Unhandled event type:', event.type);
  }
}

async function handleTransferConfirmed(data: TransferData) {
  // Update your database
  await db.transfers.update({
    where: { externalId: data.id },
    data: { status: 'confirmed', txHash: data.txHash },
  });

  // Notify user
  await sendNotification(data.toInvestorId, 'Transfer received!');
}
```

---

## Best Practices

### 1. Environment Configuration

```typescript
// config.ts
export const config = {
  tokenisation: {
    apiKey: process.env.TOKENISATION_API_KEY!,
    environment: (process.env.NODE_ENV === 'production' ? 'live' : 'test') as 'live' | 'test',
    webhookSecret: process.env.TOKENISATION_WEBHOOK_SECRET!,
  },
};

// Validate at startup
if (!config.tokenisation.apiKey) {
  throw new Error('TOKENISATION_API_KEY is required');
}
```

### 2. Connection Pooling

```typescript
// Create a single client instance
const client = createApiClient({
  apiKey: config.tokenisation.apiKey,
  environment: config.tokenisation.environment,
  // Optional: increase timeout for slow operations
  timeout: 30000,
});

// Export for use across your app
export { client };
```

### 3. Logging and Monitoring

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: process.env.TOKENISATION_API_KEY,
  // Add request/response logging
  onRequest: (config) => {
    console.log(`[API] ${config.method} ${config.url}`);
  },
  onResponse: (response) => {
    console.log(`[API] Response: ${response.status}`);
  },
  onError: (error) => {
    console.error(`[API] Error: ${error.message}`);
    // Send to monitoring service
    monitoring.captureException(error);
  },
});
```

### 4. Testing

```typescript
import { createApiClient } from '@tokenisation/sdk';
import { vi } from 'vitest';

// Mock the client in tests
const mockClient = {
  assets: {
    list: vi.fn().mockResolvedValue({
      data: [{ id: 'asset_1', name: 'Test Asset' }],
      pagination: { total: 1, hasMore: false },
    }),
    create: vi.fn().mockImplementation(async (data) => ({
      id: 'asset_new',
      ...data,
      state: 'DRAFT',
    })),
  },
};

// Test your service
describe('AssetService', () => {
  it('should create asset', async () => {
    const result = await assetService.createAsset(mockClient, {
      name: 'New Asset',
    });

    expect(mockClient.assets.create).toHaveBeenCalled();
    expect(result.state).toBe('DRAFT');
  });
});
```

---

## API Reference

For complete API documentation, see:

- [REST API Reference](https://docs.tokenisation.io/api)
- [SDK TypeScript Reference](https://docs.tokenisation.io/sdk)
- [OpenAPI Spec](https://api.tokenisation.io/api/openapi.json)

### Common Endpoints

| Endpoint | Description |
|----------|-------------|
| `client.assets.*` | Asset management |
| `client.tokens.*` | Token operations |
| `client.investors.*` | Investor management |
| `client.transfers.*` | Transfer processing |
| `client.compliance.*` | Compliance policies |
| `client.webhooks.*` | Webhook management |
| `client.audit.*` | Audit logs |

---

## Getting Help

- **Documentation:** [https://docs.tokenisation.io](https://docs.tokenisation.io)
- **API Status:** [https://status.tokenisation.io](https://status.tokenisation.io)
- **Support:** support@tokenisation.io
- **GitHub Issues:** [https://github.com/tokenisation/sdk/issues](https://github.com/tokenisation/sdk/issues)
