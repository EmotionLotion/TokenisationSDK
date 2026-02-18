---
sidebar_position: 3
title: Webhooks Guide
---

# Webhooks Guide

Webhooks deliver real-time event notifications to your application over HTTPS. Instead of polling the API, register an endpoint and the platform pushes events as they happen -- token deployments, transfer completions, KYC status changes, compliance decisions, and more.

---

## Creating a Webhook Endpoint

Register a URL to receive events. You subscribe to specific event patterns using dot-notation with wildcard support.

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: process.env.TOKENISATION_API_KEY!,
});

const endpoint = await client.webhooks.createEndpoint({
  url: 'https://your-app.com/webhooks/ahoy',
  description: 'Production webhook receiver',
  events: [
    'transfer.*',
    'investor.kyc.*',
    'token.deployed',
    'compliance.decision.*',
    'distribution.completed',
  ],
});

// IMPORTANT: Save this secret securely -- it is shown only once
console.log('Webhook secret:', endpoint.secret);
console.log('Endpoint ID:', endpoint.id);
```

The response includes a `secret` that you must store securely. This secret is used to verify that incoming requests genuinely originate from the AHOY platform.

---

## Event Types

Events follow the pattern `<resource>.<action>`. Use `*` as a wildcard to subscribe to all actions within a resource.

### Asset Events

| Event | Fired When |
|-------|-----------|
| `asset.created` | A new asset is created |
| `asset.updated` | Asset metadata is updated |
| `asset.state_changed` | Asset transitions lifecycle state (DRAFT, ACTIVE, FROZEN, etc.) |
| `asset.deleted` | A DRAFT asset is deleted |

### Token Events

| Event | Fired When |
|-------|-----------|
| `token.created` | A token definition is created |
| `token.deployed` | Token contract is deployed on-chain |
| `token.paused` | Token transfers are paused |
| `token.unpaused` | Token transfers are resumed |
| `token.frozen` | Token is frozen (regulatory hold) |
| `token.issued` | New tokens are minted to an investor |
| `token.redeemed` | Tokens are burned for redemption |
| `token.burned` | Tokens are permanently burned |

### Transfer Events

| Event | Fired When |
|-------|-----------|
| `transfer.created` | A transfer request is created |
| `transfer.prechecked` | Compliance precheck completed |
| `transfer.approved` | Transfer is approved |
| `transfer.signed` | Transaction is signed |
| `transfer.submitted` | Transaction is submitted to chain |
| `transfer.confirmed` | Transaction is mined on-chain |
| `transfer.reconciled` | On-chain state is reconciled |
| `transfer.settled` | Transfer is fully settled |
| `transfer.failed` | Transfer failed at any stage |
| `transfer.cancelled` | Transfer was cancelled |

### Investor Events

| Event | Fired When |
|-------|-----------|
| `investor.created` | A new investor is registered |
| `investor.updated` | Investor profile is updated |
| `investor.status_changed` | Investor status changes (active, suspended, blocked) |
| `investor.kyc.started` | KYC session is initiated |
| `investor.kyc.approved` | KYC verification is approved |
| `investor.kyc.rejected` | KYC verification is rejected |
| `investor.kyc.expired` | KYC verification has expired |
| `investor.wallet.added` | A wallet is linked to the investor |
| `investor.wallet.verified` | Wallet ownership is verified |
| `investor.wallet.blocked` | A wallet is blocked |
| `investor.frozen` | Investor account is frozen |
| `investor.unfrozen` | Investor account is unfrozen |

### Compliance Events

| Event | Fired When |
|-------|-----------|
| `compliance.decision.allow` | A compliance decision allows the action |
| `compliance.decision.deny` | A compliance decision denies the action |
| `compliance.policy.created` | A new policy is created |
| `compliance.policy.versioned` | A new policy version is published |

### Distribution Events

| Event | Fired When |
|-------|-----------|
| `distribution.created` | A distribution is scheduled |
| `distribution.processing` | Distribution calculation is in progress |
| `distribution.completed` | Distribution payments are complete |
| `distribution.failed` | Distribution failed |

### DLD Events

| Event | Fired When |
|-------|-----------|
| `dld.title.registered` | A DLD title is registered |
| `dld.title.verified` | A DLD title is verified |
| `dld.title.disputed` | A dispute is filed against a title |
| `dld.event.ingested` | A DLD event is ingested |

---

## Webhook Payload Format

Every webhook delivery sends a POST request with a JSON body:

```json
{
  "id": "evt_abc123def456",
  "type": "transfer.settled",
  "timestamp": "2026-02-18T14:30:00.000Z",
  "data": {
    "id": "txfr_789xyz",
    "tokenId": "tok_abc123",
    "fromWallet": "0xSender...",
    "toWallet": "0xReceiver...",
    "amount": "10000",
    "status": "settled",
    "txHash": "0xTransactionHash...",
    "blockNumber": 12345678
  },
  "metadata": {
    "orgId": "org_xxx",
    "environment": "live"
  }
}
```

---

## Signature Verification

Every webhook request includes a signature header that you must verify to confirm authenticity. The signature is an HMAC-SHA256 digest of the raw request body using your endpoint's secret.

### Headers

| Header | Description |
|--------|-------------|
| `X-Webhook-Signature` | HMAC-SHA256 signature of the request body |
| `X-Webhook-Id` | Unique delivery ID (for deduplication) |
| `X-Webhook-Timestamp` | ISO 8601 timestamp of the delivery attempt |

### Node.js Verification Example

```typescript
import crypto from 'crypto';
import express from 'express';

const app = express();

// Use raw body for signature verification
app.post('/webhooks/ahoy', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const webhookId = req.headers['x-webhook-id'] as string;
  const timestamp = req.headers['x-webhook-timestamp'] as string;

  // Verify signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(req.body)
    .digest('hex');

  if (!crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Verify timestamp is recent (prevent replay attacks)
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - eventTime) > 5 * 60 * 1000) { // 5 minute tolerance
    console.error('Webhook timestamp too old');
    return res.status(401).json({ error: 'Timestamp too old' });
  }

  // Parse and process the event
  const event = JSON.parse(req.body.toString());
  console.log(`Received event: ${event.type} [${event.id}]`);

  switch (event.type) {
    case 'transfer.settled':
      handleTransferSettled(event.data);
      break;
    case 'investor.kyc.approved':
      handleKycApproved(event.data);
      break;
    case 'compliance.decision.deny':
      handleComplianceDeny(event.data);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Respond with 200 to acknowledge receipt
  res.status(200).json({ received: true });
});
```

Always use `crypto.timingSafeEqual` for signature comparison to prevent timing attacks.

---

## Retry Policy

If your endpoint does not respond with a `2xx` status code within 30 seconds, the delivery is considered failed and will be retried.

### Retry Schedule

| Attempt | Delay After Previous |
|---------|---------------------|
| 1 (initial) | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 12 hours |
| 7 (final) | 24 hours |

After 7 failed attempts, the delivery is marked as `failed` and no further retries are attempted.

### Idempotency

Since retries can cause duplicate deliveries, use the `X-Webhook-Id` header to deduplicate events on your end:

```typescript
const processedIds = new Set<string>(); // Use Redis or database in production

app.post('/webhooks/ahoy', (req, res) => {
  const webhookId = req.headers['x-webhook-id'] as string;

  if (processedIds.has(webhookId)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  processedIds.add(webhookId);
  // Process the event...

  res.status(200).json({ received: true });
});
```

---

## Managing Endpoints

### Update an Endpoint

Change the URL, subscribed events, or disable the endpoint:

```typescript
await client.webhooks.updateEndpoint(endpointId, {
  url: 'https://new-url.example.com/webhooks',
  events: ['transfer.*', 'token.*'], // updated subscriptions
  status: 'active', // or 'disabled'
});
```

### Rotate the Secret

If your secret is compromised, rotate it immediately:

```typescript
const result = await client.webhooks.rotateSecret(endpointId);
console.log('New secret:', result.secret);
// Update your server with the new secret
// Both old and new secrets are valid for 24 hours during rotation
```

### Delete an Endpoint

```typescript
await client.webhooks.deleteEndpoint(endpointId);
```

---

## Delivery Monitoring

Monitor webhook deliveries and troubleshoot failures through the API.

```typescript
// List recent deliveries
const deliveries = await client.webhooks.listDeliveries({
  endpointId: endpoint.id,
  status: 'failed', // 'pending' | 'delivered' | 'failed'
  eventType: 'transfer.*',
  limit: 50,
});

for (const d of deliveries.data) {
  console.log(`${d.id} | ${d.eventType} | ${d.status} | ${d.attempts} attempts`);
  console.log(`  Response: ${d.responseStatus} ${d.responseBody?.substring(0, 100)}`);
}

// Manually retry a specific failed delivery
await client.webhooks.retryDelivery(deliveryId);
```

---

## Testing Webhooks

### Send a Test Event

Dispatch a test event to all matching endpoints for verification:

```typescript
const result = await client.webhooks.test({
  eventType: 'transfer.settled',
  data: {
    id: 'test_transfer_001',
    tokenId: 'test_token_001',
    amount: '1000',
    status: 'settled',
  },
});

console.log(`Test event dispatched to ${result.endpointsNotified} endpoints`);
```

### Local Development with ngrok

For local development, expose your local server using a tunnel:

```bash
# Terminal 1: Start your app
node server.js

# Terminal 2: Expose via ngrok
ngrok http 3000
```

Then register the ngrok URL as your webhook endpoint:

```typescript
await client.webhooks.createEndpoint({
  url: 'https://abc123.ngrok.io/webhooks/ahoy',
  events: ['*'], // subscribe to everything during development
});
```

---

## Best Practices

1. **Verify signatures on every request.** Never process a webhook without verifying the HMAC signature.
2. **Respond quickly.** Return a `200` within 5 seconds. Process events asynchronously using a job queue if needed.
3. **Handle duplicates.** Use the `X-Webhook-Id` header for idempotent processing.
4. **Monitor delivery health.** Set up alerts for repeated failures. Disable unhealthy endpoints to avoid unnecessary retries.
5. **Use specific event patterns.** Subscribe to only the events you need rather than using `*` in production.
6. **Store and replay.** Log raw webhook payloads so you can replay events during incident recovery.
