# API Reference

Complete reference for the Tokenisation SDK.

---

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [ApiClient](#apiclient)
3. [Projects Module](#projects-module)
4. [Assets Module](#assets-module)
5. [Investors Module](#investors-module)
6. [Tokens Module](#tokens-module)
7. [Transfers Module](#transfers-module)
8. [Compliance Module](#compliance-module)
9. [Events Module](#events-module)
10. [Webhooks Module](#webhooks-module)
11. [Audit Module](#audit-module)
12. [Error Handling](#error-handling)
13. [TypeScript Types](#typescript-types)

---

## Installation & Setup

### Install

```bash
npm install @tokenisation/sdk
```

### Initialize

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({
  apiKey: 'sk_live_your-api-key',
  baseUrl: 'https://api.your-platform.com', // optional
});
```

### Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | Yes | API key starting with `sk_` |
| `baseUrl` | string | No | API server URL (auto-detected from key) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |

---

## ApiClient

The main entry point providing access to all modules.

```typescript
const client = new ApiClient({ apiKey: 'sk_live_xxx' });

// Available modules
client.projects    // Project management
client.assets      // Asset tokenization
client.investors   // Investor onboarding
client.tokens      // Token lifecycle
client.transfers   // Token transfers
client.compliance  // Compliance policies
client.events      // Event bus and querying
client.webhooks    // Webhook management
client.audit       // Audit logs and evidence packs
```

---

## Projects Module

Manage tokenization projects.

### create

Create a new project.

```typescript
const project = await client.projects.create({
  name: 'My Real Estate Fund',
  description: 'Tokenized real estate portfolio',
  jurisdiction: 'AE',
  assetType: 'real_estate',
  metadata: { custom: 'data' }
}, idempotencyKey?);
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Project name |
| `description` | string | No | Project description |
| `jurisdiction` | string | No | ISO country code |
| `assetType` | string | No | Type of assets |
| `settings` | object | No | Project settings |
| `metadata` | object | No | Custom metadata |

### get

Retrieve a project by ID.

```typescript
const project = await client.projects.get('proj_abc123');
```

### list

List projects with optional filters.

```typescript
const { data, total, limit, offset } = await client.projects.list({
  status: 'active',
  jurisdiction: 'AE',
  limit: 10,
  offset: 0
});
```

### update

Update a project.

```typescript
const project = await client.projects.update('proj_abc123', {
  name: 'Updated Name',
  status: 'active'
});
```

### delete

Delete a draft project.

```typescript
await client.projects.delete('proj_abc123');
```

### uploadDocument

Upload a document to a project.

```typescript
const doc = await client.projects.uploadDocument('proj_abc123', {
  type: 'legal_agreement',
  name: 'Subscription Agreement',
  uri: 's3://bucket/doc.pdf',
  sha256: 'abc123...',
  mimeType: 'application/pdf',
  size: 102400
});
```

### listDocuments

List project documents.

```typescript
const { data } = await client.projects.listDocuments('proj_abc123', {
  type: 'legal_agreement'
});
```

---

## Assets Module

Manage tokenizable assets.

### create

Create a new asset.

```typescript
import { RightType } from '@tokenisation/sdk';

const asset = await client.assets.create({
  name: 'Marina Heights - Unit 1501',
  description: 'Luxury apartment',
  rightType: RightType.OWNERSHIP,
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'DIFC',
    restrictions: ['US', 'KP']
  },
  projectId: 'proj_abc123',
  metadata: { bedrooms: 3, sqft: 2500 }
}, idempotencyKey?);
```

**Right Types:**

| Value | Description |
|-------|-------------|
| `OWNERSHIP` | Title to property |
| `EQUITY` | Shares in entity |
| `DEBT` | Loan or bond |
| `REVENUE` | Income stream |
| `ACCESS` | Usage permission |
| `COMMODITY` | Physical goods |

### get

Retrieve an asset.

```typescript
const asset = await client.assets.get('asset_xyz789');
```

### list

List assets with filters.

```typescript
const { data } = await client.assets.list({
  state: 'active',
  rightType: RightType.OWNERSHIP,
  projectId: 'proj_abc123',
  limit: 20
});
```

### update

Update an asset.

```typescript
const asset = await client.assets.update('asset_xyz789', {
  name: 'Updated Name',
  metadata: { newField: 'value' }
});
```

### activate

Activate an asset for tokenization.

```typescript
const asset = await client.assets.activate('asset_xyz789');
```

### freeze

Freeze an asset.

```typescript
const asset = await client.assets.freeze('asset_xyz789', 'Legal dispute');
```

### unfreeze

Unfreeze an asset.

```typescript
const asset = await client.assets.unfreeze('asset_xyz789');
```

### getValuations

Get valuation history.

```typescript
const { current, history } = await client.assets.getValuations('asset_xyz789');
// current: { value: "5000000", currency: "USD", date: "2024-01-15" }
// history: [{ value, currency, date, source }, ...]
```

### updateValuation

Update asset valuation.

```typescript
await client.assets.updateValuation('asset_xyz789', {
  value: '5500000',
  currency: 'USD',
  source: 'Independent Appraisal Co.',
  attestation: '0x...'
});
```

---

## Investors Module

Manage investor onboarding and KYC.

### create

Create a new investor.

```typescript
const investor = await client.investors.create({
  email: 'investor@example.com',
  name: 'John Doe',
  type: 'individual',  // or 'entity'
  jurisdiction: 'US',
  classification: 'accredited',
  accredited: true,
  externalId: 'your-system-id',
  metadata: { source: 'website' }
}, idempotencyKey?);
```

**Classifications:**

| Value | Description |
|-------|-------------|
| `retail` | Regular retail investor |
| `accredited` | Accredited/qualified investor |
| `institutional` | Institutional investor |
| `professional` | Professional investor |

### get

Retrieve an investor.

```typescript
const investor = await client.investors.get('inv_def456');
```

### list

List investors with filters.

```typescript
const { data } = await client.investors.list({
  status: 'active',
  kycStatus: 'approved',
  classification: 'accredited',
  jurisdiction: 'US',
  search: 'john',
  limit: 50
});
```

### update

Update an investor.

```typescript
const investor = await client.investors.update('inv_def456', {
  name: 'John M. Doe',
  accredited: true
});
```

### activate

Activate an investor (requires approved KYC).

```typescript
const investor = await client.investors.activate('inv_def456');
```

### suspend

Suspend an investor.

```typescript
const investor = await client.investors.suspend('inv_def456', 'Suspicious activity');
```

### offboard

Permanently offboard an investor.

```typescript
const investor = await client.investors.offboard('inv_def456', 'Account closure request');
```

### startKyc

Start a KYC session.

```typescript
const session = await client.investors.startKyc('inv_def456', {
  provider: 'sumsub',
  redirectUrl: 'https://yourapp.com/kyc-complete'
});
// Returns: { sessionId, provider, url, expiresAt }
```

### approveKyc

Manually approve KYC (admin only).

```typescript
const investor = await client.investors.approveKyc('inv_def456', 'Manual verification');
```

### rejectKyc

Manually reject KYC (admin only).

```typescript
const investor = await client.investors.rejectKyc('inv_def456', 'Document mismatch');
```

### getKycStatus

Get current KYC status.

```typescript
const { status, provider, expiresAt } = await client.investors.getKycStatus('inv_def456');
```

### addWallet

Add a wallet to an investor.

```typescript
const wallet = await client.investors.addWallet('inv_def456', {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  chainId: 8453,
  walletType: 'eoa',  // or 'multisig', 'smart_account'
  custodyType: 'self', // or 'custodian'
  isPrimary: true
});
```

### listWallets

List investor wallets.

```typescript
const wallets = await client.investors.listWallets('inv_def456');
```

### verifyWallet

Verify wallet ownership via signature.

```typescript
const wallet = await client.investors.verifyWallet(
  'inv_def456',
  'wallet_ghi012',
  '0xsignature...',
  'Sign this message to verify ownership: ...'
);
```

### revokeWallet

Revoke a wallet.

```typescript
await client.investors.revokeWallet('inv_def456', 'wallet_ghi012');
```

### setPrimaryWallet

Set a wallet as primary.

```typescript
const wallet = await client.investors.setPrimaryWallet('inv_def456', 'wallet_ghi012');
```

---

## Tokens Module

Manage token lifecycle, issuance, and redemption.

### create

Create a token definition.

```typescript
const token = await client.tokens.create({
  name: 'Marina Heights Token',
  symbol: 'MHT',
  decimals: 18,
  maxSupply: '1000000000000000000000000', // 1M tokens
  chainId: 8453,
  assetId: 'asset_xyz789',
  projectId: 'proj_abc123',
  policyId: 'policy_123',
  metadata: { standard: 'ERC3643' }
}, idempotencyKey?);
```

### get

Retrieve a token.

```typescript
const token = await client.tokens.get('tok_jkl345');
```

### list

List tokens with filters.

```typescript
const { data } = await client.tokens.list({
  status: 'deployed',
  chainId: 8453,
  projectId: 'proj_abc123',
  limit: 20
});
```

### update

Update a token (draft only).

```typescript
const token = await client.tokens.update('tok_jkl345', {
  name: 'Updated Token Name',
  metadata: { version: 2 }
});
```

### deploy

Deploy token to blockchain.

```typescript
const token = await client.tokens.deploy('tok_jkl345', {
  chainId: 8453,
  identityRegistryAddress: '0x...',  // optional
  complianceAddress: '0x...'          // optional
});

console.log('Contract:', token.contractAddress);
console.log('TX Hash:', token.deploymentTxHash);
```

### pause

Pause token transfers.

```typescript
const token = await client.tokens.pause('tok_jkl345', 'Maintenance');
```

### unpause

Resume token transfers.

```typescript
const token = await client.tokens.unpause('tok_jkl345');
```

### freeze

Permanently freeze token.

```typescript
const token = await client.tokens.freeze('tok_jkl345', 'Regulatory order');
```

### issue

Issue tokens to an investor. **Requires idempotencyKey.**

```typescript
const issuance = await client.tokens.issue('tok_jkl345', {
  investorId: 'inv_def456',
  walletAddress: '0x1234...',
  amount: '1000000000000000000000', // 1000 tokens
  trancheId: 'tranche_001',         // optional
  idempotencyKey: 'issue-inv456-batch1',  // REQUIRED
  metadata: { batch: 1 }
});

// Returns: { id, tokenId, investorId, amount, status, txHash }
// Status: pending → submitted → confirmed → failed
```

### redeem

Redeem tokens from an investor. **Requires idempotencyKey.**

```typescript
const redemption = await client.tokens.redeem('tok_jkl345', {
  investorId: 'inv_def456',
  walletAddress: '0x1234...',
  amount: '500000000000000000000', // 500 tokens
  idempotencyKey: 'redeem-inv456-001',  // REQUIRED
  metadata: { reason: 'Exit' }
});
```

### listIssuances

List token issuances.

```typescript
const { data } = await client.tokens.listIssuances('tok_jkl345', {
  limit: 50,
  offset: 0
});
```

### listRedemptions

List token redemptions.

```typescript
const { data } = await client.tokens.listRedemptions('tok_jkl345', {
  limit: 50
});
```

### createTranche

Create a token tranche.

```typescript
const tranche = await client.tokens.createTranche('tok_jkl345', {
  name: 'Series A',
  supply: '100000000000000000000000', // 100K tokens
  lockedUntil: '2025-06-01T00:00:00Z',
  transferRestrictions: { minHoldPeriod: 86400 }
});
```

### listTranches

List token tranches.

```typescript
const tranches = await client.tokens.listTranches('tok_jkl345');
```

### getCapTable

Get token cap table.

```typescript
const capTable = await client.tokens.getCapTable('tok_jkl345');

console.log('Total Supply:', capTable.totalSupply);
for (const holder of capTable.holders) {
  console.log(`${holder.walletAddress}: ${holder.balance} (${holder.percentage}%)`);
}
```

### getBalance

Get balance for a specific wallet.

```typescript
const balance = await client.tokens.getBalance('tok_jkl345', '0x1234...');

console.log('Total:', balance.balance);
console.log('Locked:', balance.lockedBalance);
console.log('Available:', balance.availableBalance);
```

---

## Transfers Module

Manage token transfers between wallets.

### create

Create a transfer. **Requires idempotencyKey.**

```typescript
const transfer = await client.transfers.create({
  tokenId: 'tok_jkl345',
  fromWallet: '0x1111...',
  toWallet: '0x2222...',
  amount: '1000000000000000000', // 1 token
  chainId: 8453,
  idempotencyKey: 'transfer-abc-123',  // REQUIRED
  metadata: { note: 'P2P sale' }
});

// Returns: { id, tokenId, fromWallet, toWallet, amount, status, txHash }
```

**Transfer Status Flow:**

```
created → prechecked → approved → signing → submitted → confirmed → reconciled → settled
                ↓
            rejected (compliance failure)
```

### get

Retrieve a transfer.

```typescript
const transfer = await client.transfers.get('txfr_mno678');
```

### list

List transfers with filters.

```typescript
const { data } = await client.transfers.list({
  tokenId: 'tok_jkl345',
  status: 'confirmed',
  fromWallet: '0x1111...',
  fromDate: '2024-01-01',
  toDate: '2024-12-31',
  limit: 100
});
```

### cancel

Cancel a pending transfer.

```typescript
const transfer = await client.transfers.cancel('txfr_mno678', 'User requested');
```

### retry

Retry a failed transfer.

```typescript
const transfer = await client.transfers.retry('txfr_mno678');
```

### getStatus

Get detailed transfer status.

```typescript
const status = await client.transfers.getStatus('txfr_mno678');

console.log('Status:', status.status);
console.log('Current Step:', status.currentStep);
console.log('Completed Steps:', status.completedSteps);
console.log('Next Step:', status.nextStep);
console.log('TX Hash:', status.txHash);
console.log('Error:', status.error);
```

### createBatch

Create multiple transfers in a batch.

```typescript
const result = await client.transfers.createBatch([
  { tokenId: 'tok_1', fromWallet: '0x...', toWallet: '0x...', amount: '100', idempotencyKey: 'batch-1' },
  { tokenId: 'tok_1', fromWallet: '0x...', toWallet: '0x...', amount: '200', idempotencyKey: 'batch-2' },
]);

console.log('Successful:', result.successful.length);
console.log('Failed:', result.failed.length);
```

### getWalletHistory

Get transfer history for a wallet.

```typescript
const { data } = await client.transfers.getWalletHistory('0x1234...', {
  tokenId: 'tok_jkl345',
  direction: 'both',  // 'in', 'out', or 'both'
  fromDate: '2024-01-01',
  limit: 100
});
```

### getTokenHistory

Get transfer history for a token.

```typescript
const { data } = await client.transfers.getTokenHistory('tok_jkl345', {
  fromDate: '2024-01-01',
  limit: 100
});
```

---

## Compliance Module

Manage compliance policies and decisions.

### createPolicy

Create a compliance policy.

```typescript
const policy = await client.compliance.createPolicy({
  name: 'US Accredited Investors',
  description: 'Policy for US accredited investor offerings',
  jurisdiction: 'US',
  rules: [
    { type: 'IDENTITY_REQUIRED', parameters: {}, enabled: true },
    { type: 'COUNTRY_WHITELIST', parameters: { countries: ['US', 'CA'] } },
    { type: 'ACCREDITED_ONLY', parameters: { accreditedRequired: true } },
    { type: 'MAX_HOLDERS', parameters: { maxHolders: 2000 } }
  ]
});
```

**Available Rule Types:**

| Type | Parameters | Description |
|------|------------|-------------|
| `IDENTITY_REQUIRED` | — | Recipient must be verified |
| `COUNTRY_WHITELIST` | `countries: string[]` | Only allow listed countries |
| `COUNTRY_BLACKLIST` | `countries: string[]` | Block listed countries |
| `ACCREDITED_ONLY` | `accreditedRequired: boolean` | Require accreditation |
| `MAX_HOLDERS` | `maxHolders: number` | Limit total holders |
| `MAX_BALANCE` | `maxBalance: string` | Max tokens per holder |
| `TIME_LOCK` | `lockUntil: string` | No transfers until date |

### getPolicy

Retrieve a policy.

```typescript
const policy = await client.compliance.getPolicy('policy_123');
```

### listPolicies

List policies.

```typescript
const { data } = await client.compliance.listPolicies({
  status: 'active',
  jurisdiction: 'US'
});
```

### updatePolicy

Update a policy.

```typescript
const policy = await client.compliance.updatePolicy('policy_123', {
  name: 'Updated Name',
  rules: [/* new rules */]
});
```

### activatePolicy

Activate a draft policy.

```typescript
const policy = await client.compliance.activatePolicy('policy_123');
```

### archivePolicy

Archive a policy.

```typescript
const policy = await client.compliance.archivePolicy('policy_123');
```

### check

Check compliance for an entity.

```typescript
const result = await client.compliance.check('policy_123', {
  entityType: 'transfer',  // or 'issuance', 'redemption', 'investor'
  entityId: 'txfr_mno678',
  context: { amount: '1000' }
});

// Returns:
// {
//   policyId: 'policy_123',
//   decision: 'approved',  // or 'rejected', 'pending_review'
//   reasons: ['All checks passed'],
//   details: [
//     { ruleName: 'IDENTITY_REQUIRED', passed: true, message: 'Verified' },
//     { ruleName: 'COUNTRY_WHITELIST', passed: true, message: 'US allowed' }
//   ]
// }
```

### simulate

Simulate compliance check without recording.

```typescript
const result = await client.compliance.simulate('policy_123', {
  entityType: 'transfer',
  entityId: 'hypothetical',
  context: { from: '0x...', to: '0x...', amount: '1000' }
});
```

### getDecision

Retrieve a compliance decision.

```typescript
const decision = await client.compliance.getDecision('decision_456');
```

### listDecisions

List compliance decisions.

```typescript
const { data } = await client.compliance.listDecisions({
  policyId: 'policy_123',
  decision: 'rejected',
  fromDate: '2024-01-01'
});
```

### overrideDecision

Override a compliance decision (admin only).

```typescript
const decision = await client.compliance.overrideDecision('decision_456', {
  decision: 'approved',
  reason: 'Manual review completed'
});
```

### getRuleTypes

Get available rule types and parameters.

```typescript
const ruleTypes = await client.compliance.getRuleTypes();

// Returns array of rule definitions with parameter schemas
```

---

## Events Module

Manage the internal event bus for async operations.

### publish

Publish an event to the event bus.

```typescript
const event = await client.events.publish({
  topic: 'custom.notification',
  payload: { userId: 'user_123', message: 'Hello' },
  deduplicationKey: 'notification-123'  // Prevents duplicates
});
```

### publishBatch

Publish multiple events at once (max 100).

```typescript
const result = await client.events.publishBatch([
  { topic: 'notification.sent', payload: { userId: '1' } },
  { topic: 'notification.sent', payload: { userId: '2' } }
]);
```

### list

List events with filters.

```typescript
const events = await client.events.list({
  topic: 'transfer.*',
  status: 'pending',
  startDate: '2024-01-01T00:00:00Z',
  limit: 50
});
```

### get

Get a specific event by ID.

```typescript
const event = await client.events.get('event_123');
```

### getDeadLetterQueue

Get events that failed after max retries.

```typescript
const dlqEvents = await client.events.getDeadLetterQueue(100);
```

### retry

Retry a failed event.

```typescript
const retriedEvent = await client.events.retry('event_123');
```

### retryAllDlq

Retry all events in the dead letter queue.

```typescript
const result = await client.events.retryAllDlq();
console.log(`Retried ${result.retried} events`);
```

### getStats

Get event statistics.

```typescript
const stats = await client.events.getStats();
console.log(`Pending: ${stats.pending}, Failed: ${stats.failed}`);
```

### getTopics

Get available event topics.

```typescript
const { topics } = await client.events.getTopics();
```

### purge

Delete old processed events.

```typescript
const result = await client.events.purge(30); // Older than 30 days
console.log(`Deleted ${result.deleted} events`);
```

---

## Webhooks Module

Manage webhook endpoints for real-time notifications.

### create

Create a webhook endpoint.

```typescript
const endpoint = await client.webhooks.create({
  url: 'https://api.example.com/webhooks',
  events: ['transfer.*', 'token.deployed'],
  description: 'Production webhook'
});

// IMPORTANT: Save the secret securely - it won't be shown again
console.log('Webhook secret:', endpoint.secret);
```

**Event Patterns:**

| Pattern | Matches |
|---------|---------|
| `transfer.*` | All transfer events |
| `token.deployed` | Only token.deployed |
| `investor.kyc.*` | All KYC events |

### get

Get a webhook endpoint by ID.

```typescript
const endpoint = await client.webhooks.get('endpoint_123');
```

### list

List all webhook endpoints.

```typescript
const endpoints = await client.webhooks.list({
  status: 'active',
  limit: 50
});
```

### update

Update a webhook endpoint.

```typescript
// Disable an endpoint
await client.webhooks.update('endpoint_123', { status: 'disabled' });

// Change subscribed events
await client.webhooks.update('endpoint_123', {
  events: ['transfer.confirmed', 'transfer.settled']
});
```

### delete

Delete a webhook endpoint.

```typescript
await client.webhooks.delete('endpoint_123');
```

### rotateSecret

Rotate the signing secret.

```typescript
const result = await client.webhooks.rotateSecret('endpoint_123');
console.log('New secret:', result.secret);
// Update your webhook receiver with the new secret
```

### listDeliveries

List webhook deliveries.

```typescript
const deliveries = await client.webhooks.listDeliveries({
  endpointId: 'endpoint_123',
  status: 'failed'
});
```

### retryDelivery

Retry a failed delivery.

```typescript
const result = await client.webhooks.retryDelivery('delivery_123');
```

### sendTestEvent

Send a test event to verify configuration.

```typescript
const result = await client.webhooks.sendTestEvent('test.event', {
  message: 'This is a test'
});
console.log(`Sent to ${result.deliveryCount} endpoints`);
```

### verifySignature (Static)

Verify a webhook signature in your receiver.

```typescript
import { WebhooksModule } from '@tokenisation/sdk';

app.post('/webhook', (req, res) => {
  const isValid = WebhooksModule.verifySignature(
    JSON.stringify(req.body),
    req.headers['x-webhook-signature'],
    process.env.WEBHOOK_SECRET,
    parseInt(req.headers['x-webhook-timestamp'])
  );

  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }

  // Process webhook...
  res.status(200).send('OK');
});
```

---

## Audit Module

Access tamper-evident audit logs and generate evidence packs.

### list

List audit log entries.

```typescript
const logs = await client.audit.list({
  resourceType: 'investor',
  resourceId: 'investor_123',
  limit: 100
});
```

### get

Get a specific audit entry.

```typescript
const entry = await client.audit.get('audit_123');
```

### getResourceHistory

Get audit history for a specific resource.

```typescript
const history = await client.audit.getResourceHistory('transfer', 'transfer_123');
```

### verifyEntry

Verify integrity of a single entry.

```typescript
const result = await client.audit.verifyEntry('audit_123');
if (!result.valid) {
  console.error('Entry has been tampered with!');
}
```

### verifyChain

Verify integrity of the entire audit chain.

```typescript
const result = await client.audit.verifyChain();
if (result.valid) {
  console.log(`Verified ${result.verifiedEntries} entries`);
} else {
  console.error('Chain broken at:', result.brokenAt?.entryId);
}
```

### getStats

Get audit statistics.

```typescript
const stats = await client.audit.getStats({
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
console.log('Total entries:', stats.totalEntries);
console.log('By action:', stats.byAction);
```

### export

Export audit log entries.

```typescript
const exportData = await client.audit.export({
  startDate: '2024-01-01',
  endDate: '2024-03-31',
  format: 'json'
});
```

### generateInvestorEvidencePack

Generate comprehensive evidence pack for an investor.

```typescript
const pack = await client.audit.generateInvestorEvidencePack('investor_123');

// Contains: investor data, wallets, KYC history, holdings, transfers, audit trail
console.log('Content hash:', pack.attestation.contentHash);
```

### generateTransferEvidencePack

Generate evidence pack for a transfer.

```typescript
const pack = await client.audit.generateTransferEvidencePack('transfer_123');

// Contains: transfer details, compliance decisions, parties, timeline
```

### generateTokenEvidencePack

Generate evidence pack for a token.

```typescript
const pack = await client.audit.generateTokenEvidencePack('token_123');

// Contains: token details, cap table, issuances, redemptions, transfers
```

### generateKycEvidencePack

Generate KYC-focused evidence pack.

```typescript
const pack = await client.audit.generateKycEvidencePack('investor_123');

// Contains: investor status, KYC sessions, verified wallets, timeline
```

---

## Tokens Module - Clawback

Administrative token recovery (in addition to standard token operations).

### initiateClawback

Initiate a clawback of tokens.

```typescript
const clawback = await client.tokens.initiateClawback(tokenId, {
  fromWallet: '0x1234...',
  toWallet: '0x5678...',  // Treasury address
  amount: '1000000000000000000',  // 1 token (18 decimals)
  reason: 'Court order #12345 - asset recovery',
  idempotencyKey: 'clawback-court-12345'
});
```

### approveClawback

Approve a pending clawback.

```typescript
await client.tokens.approveClawback(tokenId, clawbackId);
```

### executeClawback

Execute an approved clawback.

```typescript
await client.tokens.executeClawback(tokenId, clawbackId);
```

### confirmClawback

Confirm after on-chain execution.

```typescript
await client.tokens.confirmClawback(tokenId, clawbackId, txHash, blockNumber);
```

### getClawback

Get a clawback by ID.

```typescript
const clawback = await client.tokens.getClawback(tokenId, clawbackId);
```

### listClawbacks

List clawbacks for a token.

```typescript
const clawbacks = await client.tokens.listClawbacks(tokenId, {
  status: 'pending',
  fromWallet: '0x1234...'
});
```

---

## Error Handling

The SDK throws `TokenizationError` for all errors.

```typescript
import { TokenizationError } from '@tokenisation/sdk';

try {
  await client.tokens.issue(tokenId, { ... });
} catch (error) {
  if (error instanceof TokenizationError) {
    console.log('Code:', error.code);         // 'VALIDATION_ERROR'
    console.log('Message:', error.message);   // 'Invalid input'
    console.log('Status:', error.statusCode); // 400
    console.log('Details:', error.details);   // { field: 'amount', issue: '...' }
  }
}
```

**Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `AUTHENTICATION_ERROR` | 401 | Invalid or missing API key |
| `AUTHORIZATION_ERROR` | 403 | Not allowed to perform action |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## TypeScript Types

The SDK exports all types for TypeScript users.

```typescript
import type {
  // Entities
  Project,
  Asset,
  Investor,
  InvestorWallet,
  Token,
  TokenTranche,
  Transfer,
  Policy,

  // Enums
  RightType,
  AssetState,
  InvestorStatus,
  KycStatus,
  TokenStatus,
  TransferStatus,

  // Inputs
  CreateProjectInput,
  CreateAssetInput,
  CreateInvestorInput,
  CreateTokenInput,
  CreateTransferInput,

  // Responses
  PaginatedResponse,
  ApiResponse,
  ApiError
} from '@tokenisation/sdk';
```
