# One-Page SDK Reference

Complete TypeScript SDK API surface — every module, method, parameter, and return type.

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: 'sk_live_xxx',
  baseUrl: 'https://api.your-platform.com', // optional
  timeout: 30_000,                           // optional, ms
});
```

---

## client.projects

Manage isolated project workspaces.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { name: string, description?: string, jurisdiction?: Jurisdiction, assetType?: AssetType, settings?: ProjectSettings }` | `Promise<Project>` | Create a new project |
| `get` | `id: string` | `Promise<Project>` | Get project by ID |
| `list` | `params?: { limit?: number, offset?: number }` | `Promise<PaginatedResponse<Project>>` | List projects |
| `update` | `id: string, input: Partial<ProjectInput>` | `Promise<Project>` | Update a project |
| `delete` | `id: string` | `Promise<void>` | Delete a project |
| `getStats` | `id: string` | `Promise<ProjectStats>` | Get project statistics |

### Example

```typescript
const project = await client.projects.create({
  name: 'Marina Heights Fund',
  jurisdiction: { countryCode: 'AE' },
  assetType: 'real_estate',
});
```

---

## client.assets

Create and manage tokenizable assets.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { name: string, rightType: RightType, jurisdiction: Jurisdiction, metadata?: Record<string, unknown>, projectId?: string }` | `Promise<Asset>` | Create asset |
| `get` | `id: string` | `Promise<Asset>` | Get asset by ID |
| `list` | `params?: { limit?: number, offset?: number, state?: AssetState, rightType?: RightType }` | `Promise<PaginatedResponse<Asset>>` | List assets |
| `update` | `id: string, input: Partial<AssetInput>` | `Promise<Asset>` | Update asset |
| `delete` | `id: string` | `Promise<void>` | Delete asset |
| `freeze` | `id: string` | `Promise<Asset>` | Freeze asset (halt operations) |
| `unfreeze` | `id: string` | `Promise<Asset>` | Unfreeze asset |
| `close` | `id: string` | `Promise<Asset>` | Close asset (terminal state) |
| `getValuation` | `id: string` | `Promise<Valuation>` | Get current valuation |
| `updateValuation` | `id: string, input: { value: string, currency: string, method: string }` | `Promise<Valuation>` | Update valuation |

### Example

```typescript
const asset = await client.assets.create({
  name: 'Marina Heights Tower',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
  metadata: { propertyType: 'commercial', sqft: 50000 },
});
```

---

## client.investors

Onboard investors, manage KYC, and link wallets.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { email: string, name?: string, jurisdiction: string, type?: InvestorType, accredited?: boolean }` | `Promise<Investor>` | Create investor |
| `get` | `id: string` | `Promise<Investor>` | Get investor by ID |
| `list` | `params?: { limit?: number, offset?: number, status?: InvestorStatus, jurisdiction?: string, kycStatus?: string }` | `Promise<PaginatedResponse<Investor>>` | List investors |
| `update` | `id: string, input: Partial<InvestorInput>` | `Promise<Investor>` | Update investor |
| `delete` | `id: string` | `Promise<void>` | Delete investor |
| `addWallet` | `id: string, input: { address: string, chainId: number, walletType?: WalletType }` | `Promise<Wallet>` | Link wallet |
| `removeWallet` | `id: string, walletId: string` | `Promise<void>` | Remove wallet |
| `getWallets` | `id: string` | `Promise<Wallet[]>` | List wallets |
| `getKycStatus` | `id: string` | `Promise<KycStatus>` | Get KYC verification status |
| `initiateKyc` | `id: string, input: { provider?: string, level?: KycLevel }` | `Promise<KycSession>` | Start KYC flow |
| `approveKyc` | `id: string` | `Promise<Investor>` | Manually approve KYC (admin) |
| `rejectKyc` | `id: string, input: { reason: string }` | `Promise<Investor>` | Reject KYC (admin) |
| `getPortfolio` | `id: string` | `Promise<Portfolio>` | Get token holdings |

### Example

```typescript
const investor = await client.investors.create({
  email: 'alice@example.com',
  name: 'Alice Smith',
  jurisdiction: 'US',
  type: 'individual',
  accredited: true,
});

await client.investors.addWallet(investor.id, {
  address: '0x1234...abcd',
  chainId: 8453,
});

await client.investors.initiateKyc(investor.id, { level: 'enhanced' });
```

---

## client.tokens

Full token lifecycle: create, deploy, issue, redeem, pause, freeze.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { name: string, symbol: string, decimals?: number, maxSupply?: string, chainId: number, assetId?: string, standard?: TokenStandard, policyId?: string }` | `Promise<Token>` | Create token |
| `get` | `id: string` | `Promise<Token>` | Get token by ID |
| `list` | `params?: { limit?: number, offset?: number, status?: TokenStatus, chainId?: number }` | `Promise<PaginatedResponse<Token>>` | List tokens |
| `update` | `id: string, input: Partial<TokenInput>` | `Promise<Token>` | Update token |
| `delete` | `id: string` | `Promise<void>` | Delete token (draft only) |
| `deploy` | `id: string, options?: { gasLimit?: string }` | `Promise<DeployResult>` | Deploy to blockchain |
| `issue` | `id: string, input: { investorId: string, walletAddress?: string, amount: string, idempotencyKey: string }` | `Promise<IssuanceResult>` | Issue tokens to investor |
| `redeem` | `id: string, input: { investorId: string, amount: string, idempotencyKey: string }` | `Promise<RedemptionResult>` | Redeem (burn) tokens |
| `pause` | `id: string` | `Promise<Token>` | Pause all transfers |
| `unpause` | `id: string` | `Promise<Token>` | Resume transfers |
| `freeze` | `id: string` | `Promise<Token>` | Freeze token completely |
| `getCapTable` | `id: string` | `Promise<CapTableEntry[]>` | Get current cap table |
| `getHolders` | `id: string, params?: { limit?: number, offset?: number }` | `Promise<PaginatedResponse<Holder>>` | List holders |
| `getBalance` | `id: string, investorId: string` | `Promise<{ balance: string }>` | Get investor balance |
| `clawback` | `id: string, input: { fromWallet: string, amount: string, reason: string, idempotencyKey: string }` | `Promise<ClawbackResult>` | Force transfer from holder |

### Example

```typescript
const token = await client.tokens.create({
  name: 'Marina Heights Token',
  symbol: 'MHT',
  chainId: 8453,
  assetId: asset.id,
  standard: 'ERC3643',
  maxSupply: '1000000',
});

await client.tokens.deploy(token.id);

await client.tokens.issue(token.id, {
  investorId: investor.id,
  amount: '1000',
  idempotencyKey: 'issue-alice-001',
});
```

---

## client.transfers

Execute compliant transfers with automatic validation.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { tokenId: string, fromInvestorId: string, toInvestorId: string, amount: string, idempotencyKey: string }` | `Promise<Transfer>` | Create transfer |
| `get` | `id: string` | `Promise<Transfer>` | Get transfer by ID |
| `list` | `params?: { limit?: number, offset?: number, tokenId?: string, status?: TransferStatus }` | `Promise<PaginatedResponse<Transfer>>` | List transfers |
| `cancel` | `id: string` | `Promise<Transfer>` | Cancel pending transfer |
| `simulate` | `input: TransferInput` | `Promise<SimulationResult>` | Dry-run without executing |
| `retry` | `id: string` | `Promise<Transfer>` | Retry a failed transfer |

### Example

```typescript
// Simulate first
const sim = await client.transfers.simulate({
  tokenId: token.id,
  fromInvestorId: alice.id,
  toInvestorId: bob.id,
  amount: '500',
  idempotencyKey: 'sim-001',
});

if (sim.wouldSucceed) {
  await client.transfers.create({
    tokenId: token.id,
    fromInvestorId: alice.id,
    toInvestorId: bob.id,
    amount: '500',
    idempotencyKey: 'xfer-alice-bob-001',
  });
}
```

---

## client.compliance

Policy engine for transfer validation rules.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createPolicy` | `input: { name: string, jurisdiction: Jurisdiction, rules: RuleDefinition[], description?: string }` | `Promise<Policy>` | Create compliance policy |
| `getPolicy` | `id: string` | `Promise<Policy>` | Get policy by ID |
| `listPolicies` | `params?: { limit?: number, offset?: number, status?: PolicyStatus }` | `Promise<PaginatedResponse<Policy>>` | List policies |
| `updatePolicy` | `id: string, input: Partial<PolicyInput>` | `Promise<Policy>` | Update policy |
| `deletePolicy` | `id: string` | `Promise<void>` | Delete policy |
| `activatePolicy` | `id: string` | `Promise<Policy>` | Activate a draft policy |
| `archivePolicy` | `id: string` | `Promise<Policy>` | Archive a policy |
| `addRule` | `policyId: string, rule: RuleDefinition` | `Promise<Policy>` | Add rule to policy |
| `removeRule` | `policyId: string, ruleId: string` | `Promise<Policy>` | Remove rule from policy |
| `checkTransfer` | `input: { policyId: string, fromWallet: string, toWallet: string, amount: string, tokenId: string }` | `Promise<ComplianceResult>` | Run compliance check |
| `listChecks` | `params?: { tokenId?: string, outcome?: string }` | `Promise<PaginatedResponse<ComplianceResult>>` | List compliance check history |

### Built-in Rule Types

| Rule | Description |
|------|-------------|
| `IDENTITY_REQUIRED` | Recipient must be in identity registry |
| `COUNTRY_WHITELIST` | Recipient jurisdiction must be in allowed list |
| `COUNTRY_BLACKLIST` | Recipient jurisdiction must not be in blocked list |
| `ACCREDITED_ONLY` | Only accredited investors can receive |
| `MAX_HOLDERS` | Maximum number of token holders |
| `MAX_BALANCE` | Maximum balance per holder |
| `TIME_LOCK` | Minimum hold period before transfers |

### Example

```typescript
const policy = await client.compliance.createPolicy({
  name: 'US Real Estate',
  jurisdiction: { countryCode: 'US' },
  rules: [
    { type: 'IDENTITY_REQUIRED' },
    { type: 'COUNTRY_WHITELIST', params: { countries: ['US', 'CA', 'GB'] } },
    { type: 'ACCREDITED_ONLY' },
    { type: 'MAX_HOLDERS', params: { max: 500 } },
    { type: 'TIME_LOCK', params: { days: 365 } },
  ],
});
```

---

## client.webhooks

Register and manage webhook endpoints for event delivery.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { url: string, events: string[], description?: string }` | `Promise<WebhookEndpoint>` | Create webhook endpoint |
| `get` | `id: string` | `Promise<WebhookEndpoint>` | Get webhook by ID |
| `list` | `params?: { limit?: number, offset?: number }` | `Promise<PaginatedResponse<WebhookEndpoint>>` | List webhooks |
| `update` | `id: string, input: Partial<WebhookInput>` | `Promise<WebhookEndpoint>` | Update webhook |
| `delete` | `id: string` | `Promise<void>` | Delete webhook |
| `enable` | `id: string` | `Promise<WebhookEndpoint>` | Enable a disabled webhook |
| `disable` | `id: string` | `Promise<WebhookEndpoint>` | Disable a webhook |
| `getSecret` | `id: string` | `Promise<{ secret: string }>` | Get signing secret |
| `rotateSecret` | `id: string` | `Promise<{ secret: string }>` | Rotate signing secret |
| `getDeliveries` | `id: string, params?: { limit?: number }` | `Promise<PaginatedResponse<WebhookDelivery>>` | List delivery attempts |
| `retry` | `deliveryId: string` | `Promise<WebhookDelivery>` | Retry a delivery |
| `test` | `id: string, input: { eventType: string }` | `Promise<WebhookDelivery>` | Send test event |

### Event Types

| Event | Fired When |
|-------|------------|
| `asset.created` | New asset created |
| `asset.updated` | Asset modified |
| `asset.state_changed` | Asset state transition |
| `token.created` | New token created |
| `token.deployed` | Token deployed to chain |
| `token.issued` | Tokens issued to investor |
| `token.redeemed` | Tokens redeemed (burned) |
| `token.paused` | Token transfers paused |
| `transfer.created` | Transfer initiated |
| `transfer.completed` | Transfer confirmed on-chain |
| `transfer.failed` | Transfer failed |
| `investor.created` | New investor created |
| `investor.kyc_approved` | KYC verification approved |
| `compliance.check_failed` | Compliance check denied |
| `governance.proposal_created` | New proposal created |
| `governance.vote_cast` | Vote cast on proposal |
| `escrow.funded` | Escrow account funded |
| `escrow.released` | Escrow funds released |
| `cashflow.distribution_executed` | Distribution completed |

### Example

```typescript
const webhook = await client.webhooks.create({
  url: 'https://your-app.com/webhooks/tokenisation',
  events: ['token.deployed', 'transfer.completed', 'compliance.check_failed'],
});
```

---

## client.events

Publish and consume domain events through the internal event bus.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `publish` | `input: { topic: string, payload: Record<string, unknown>, delayMs?: number, deduplicationKey?: string }` | `Promise<EventMessage>` | Publish event |
| `publishBatch` | `events: EventInput[]` | `Promise<BatchResult>` | Publish multiple events atomically |
| `list` | `params?: { limit?: number, offset?: number, topic?: string, status?: EventStatus }` | `Promise<PaginatedResponse<EventMessage>>` | List events |
| `get` | `id: string` | `Promise<EventMessage>` | Get event by ID |
| `delete` | `id: string` | `Promise<void>` | Delete event |
| `getDeadLetterQueue` | `limit?: number` | `Promise<PaginatedResponse<EventMessage>>` | Get DLQ messages |
| `retry` | `id: string` | `Promise<EventMessage>` | Retry a DLQ event |
| `retryAllDlq` | — | `Promise<{ retried: number }>` | Retry all DLQ events |
| `getStats` | — | `Promise<EventStats>` | Get processing statistics |
| `getTopics` | — | `Promise<{ topics: string[] }>` | List registered topics |

### Example

```typescript
await client.events.publish({
  topic: 'portfolio.rebalanced',
  payload: { portfolioId: 'p_123', delta: 0.05 },
  deduplicationKey: 'rebalance-p_123-2026-01-29',
});
```

---

## client.audit

Immutable, hash-chained audit log for all platform operations.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `list` | `params?: { limit?: number, offset?: number, actor?: string, action?: string, entityType?: string, entityId?: string, startDate?: string, endDate?: string }` | `Promise<PaginatedResponse<AuditLogEntry>>` | List audit entries |
| `getStats` | — | `Promise<AuditStats>` | Get audit statistics |
| `verify` | `startId?: string, endId?: string` | `Promise<ChainVerificationResult>` | Verify hash chain integrity |
| `verifyEntry` | `entryId: string` | `Promise<EntryVerificationResult>` | Verify a single entry |
| `generateEvidencePack` | `subject: { entityType: string, entityId: string }, options?: { format?: 'pdf' \| 'json', includeRelated?: boolean }` | `Promise<EvidencePack>` | Generate regulatory evidence pack |
| `exportLogs` | `params?: { startDate?: string, endDate?: string, format?: 'csv' \| 'json' }` | `Promise<Buffer>` | Export audit logs |

### Example

```typescript
const verification = await client.audit.verify();
console.log(`Chain valid: ${verification.valid}`);

const evidence = await client.audit.generateEvidencePack(
  { entityType: 'asset', entityId: asset.id },
  { format: 'pdf', includeRelated: true },
);
```

---

## client.governance

On-chain and off-chain governance: proposals, voting, delegation.

### Proposals

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { assetId: string, type: ProposalType, title: string, description: string, options?: string[], quorum?: number, duration?: number }` | `Promise<Proposal>` | Create proposal |
| `get` | `id: string` | `Promise<Proposal>` | Get proposal |
| `list` | `params?: { limit?: number, offset?: number, assetId?: string, status?: ProposalStatus }` | `Promise<PaginatedResponse<Proposal>>` | List proposals |
| `execute` | `id: string` | `Promise<ExecutionResult>` | Execute passed proposal |
| `cancel` | `id: string` | `Promise<Proposal>` | Cancel proposal |

### Voting

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `castVote` | `proposalId: string, input: { vote: VoteChoice, weight?: string, reason?: string }` | `Promise<VoteRecord>` | Cast vote |
| `listVotes` | `proposalId: string, params?: PaginationParams` | `Promise<PaginatedResponse<VoteRecord>>` | List votes |
| `getTally` | `proposalId: string` | `Promise<VoteTally>` | Get vote tally |

### Delegation

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `delegate` | `input: { fromVoterId: string, toVoterId: string, assetId: string }` | `Promise<Delegation>` | Delegate voting power |
| `configure` | `input: GovernanceConfigInput` | `Promise<GovernanceConfig>` | Configure governance params |
| `getConfig` | — | `Promise<GovernanceConfig>` | Get governance config |

### Example

```typescript
const proposal = await client.governance.create({
  assetId: asset.id,
  type: 'ordinary_resolution',
  title: 'Approve Q1 dividend distribution',
  description: 'Distribute $0.50 per token.',
  quorum: 0.5,
  duration: 604800,
});

await client.governance.castVote(proposal.id, {
  vote: 'for',
  weight: '1000',
});
```

---

## client.escrow

Multi-party escrow with milestone-based releases and disputes.

### Lifecycle

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { type: EscrowType, parties: EscrowParty[], conditions: EscrowCondition[], amount: string, token: string }` | `Promise<Escrow>` | Create escrow |
| `get` | `id: string` | `Promise<Escrow>` | Get escrow |
| `list` | `params?: { limit?: number, offset?: number, status?: EscrowStatus }` | `Promise<PaginatedResponse<Escrow>>` | List escrows |
| `fund` | `escrowId: string, input: { amount: string, fromWallet: string, idempotencyKey: string }` | `Promise<Escrow>` | Fund escrow |
| `release` | `escrowId: string, input: { toWallet: string, amount: string }` | `Promise<Escrow>` | Release funds |
| `refund` | `escrowId: string` | `Promise<Escrow>` | Refund to depositor |
| `cancel` | `escrowId: string` | `Promise<Escrow>` | Cancel escrow |

### Milestones

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createMilestone` | `escrowId: string, input: { name: string, amount: string, dueDate?: string }` | `Promise<Milestone>` | Add milestone |
| `approveMilestone` | `escrowId: string, milestoneId: string, input: { approvedBy: string }` | `Promise<Milestone>` | Approve milestone |

### Disputes

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `raiseDispute` | `escrowId: string, input: { raisedBy: string, reason: string }` | `Promise<DisputeResolution>` | Raise dispute |
| `resolveDispute` | `escrowId: string, disputeId: string, input: { resolution: DisputeOutcome, resolvedBy: string }` | `Promise<DisputeResolution>` | Resolve dispute |

### Example

```typescript
const escrow = await client.escrow.create({
  type: 'milestone',
  parties: [
    { role: 'buyer', investorId: buyer.id },
    { role: 'seller', investorId: seller.id },
  ],
  conditions: [{ type: 'milestone_approval', params: { requiredApprovals: 1 } }],
  amount: '50000',
  token: token.id,
});

await client.escrow.fund(escrow.id, {
  amount: '50000',
  fromWallet: '0xBuyer...',
  idempotencyKey: 'fund-escrow-001',
});
```

---

## client.cashFlow

Automate dividend distributions, yield payments, and payout schedules.

### Schedules

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createSchedule` | `input: { assetId: string, type: DistributionType, frequency: Frequency, amount: string, currency: string, startDate?: string }` | `Promise<DistributionSchedule>` | Create schedule |
| `getSchedule` | `id: string` | `Promise<DistributionSchedule>` | Get schedule |
| `listSchedules` | `params?: { limit?: number, offset?: number, assetId?: string }` | `Promise<PaginatedResponse<DistributionSchedule>>` | List schedules |
| `pauseSchedule` | `id: string` | `Promise<DistributionSchedule>` | Pause schedule |
| `resumeSchedule` | `id: string` | `Promise<DistributionSchedule>` | Resume schedule |

### Execution

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `execute` | `scheduleId: string, input: { snapshotDate?: string, dryRun?: boolean }` | `Promise<Distribution>` | Execute distribution |
| `claim` | `distributionId: string` | `Promise<ClaimResult>` | Claim payout |
| `getYield` | `assetId: string, period?: string` | `Promise<YieldSummary>` | Get yield summary |
| `getUnclaimedPayouts` | `investorId: string` | `Promise<UnclaimedPayout[]>` | List unclaimed payouts |

### Example

```typescript
const schedule = await client.cashFlow.createSchedule({
  assetId: asset.id,
  type: 'dividend',
  frequency: 'quarterly',
  amount: '0.50',
  currency: 'USDC',
  startDate: '2026-04-01',
});

// Dry run first
const preview = await client.cashFlow.execute(schedule.id, { dryRun: true });
console.log(`Payout: ${preview.totalAmount} to ${preview.recipientCount} holders`);

// Execute for real
await client.cashFlow.execute(schedule.id, {});
```

---

## Core Types

### Key Enums

```typescript
type RightType = 'OWNERSHIP' | 'DEBT' | 'REVENUE' | 'USAGE' | 'GOVERNANCE' | 'HYBRID';
type AssetState = 'draft' | 'active' | 'frozen' | 'closed';
type TokenStatus = 'created' | 'deploying' | 'deployed' | 'paused' | 'frozen';
type TransferStatus = 'pending' | 'validating' | 'submitting' | 'confirming' | 'completed' | 'failed' | 'cancelled';
type InvestorStatus = 'pending' | 'active' | 'suspended';
type InvestorType = 'individual' | 'institutional' | 'entity';
type KycLevel = 'basic' | 'enhanced' | 'institutional';
type ProposalStatus = 'draft' | 'active' | 'passed' | 'rejected' | 'executed' | 'cancelled';
type VoteChoice = 'for' | 'against' | 'abstain';
type EscrowStatus = 'created' | 'funded' | 'active' | 'released' | 'refunded' | 'disputed' | 'cancelled';
type Frequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually' | 'one_time';
type PolicyStatus = 'draft' | 'active' | 'archived';
type DecisionOutcome = 'allow' | 'deny' | 'review';
```

### Pagination

All list methods return `PaginatedResponse<T>`:

```typescript
interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}
```

### Error Handling

```typescript
import { SDKError, ComplianceError, ValidationError } from '@tokenisation/sdk';

try {
  await client.transfers.create(input);
} catch (err) {
  if (err instanceof ComplianceError) {
    console.log('Violations:', err.violations);
  } else if (err instanceof SDKError) {
    console.log(`Error ${err.code}: ${err.message} (request: ${err.requestId})`);
  }
}
```

### Error Class Hierarchy

```
SDKError (base)
├── AuthenticationError    — Auth failures
├── ValidationError        — Input validation (field, constraints)
├── ComplianceError        — Compliance violations (violations[])
├── ContractError          — Smart contract issues (contractAddress, txHash)
├── NetworkError           — API/network failures (statusCode, url)
├── OracleError            — Oracle data issues (feedId)
├── AssetError             — Asset operation errors (assetId)
└── StorageError           — Storage provider errors (provider, key)
```

---

## Plugin System

```typescript
import { createApiClient } from '@tokenisation/sdk';
import { retryPlugin } from '@tokenisation/sdk/plugins/retry';
import { cachePlugin } from '@tokenisation/sdk/plugins/cache';

const client = createApiClient({
  apiKey: 'sk_test_xxx',
  plugins: [
    retryPlugin({ maxRetries: 5, backoff: 'exponential' }),
    cachePlugin({ ttl: 60_000, maxEntries: 1000 }),
  ],
});
```

| Plugin | Import | Description |
|--------|--------|-------------|
| `retryPlugin` | `@tokenisation/sdk/plugins/retry` | Exponential backoff with jitter |
| `cachePlugin` | `@tokenisation/sdk/plugins/cache` | In-memory LRU cache |
| `loggingPlugin` | `@tokenisation/sdk/plugins/logging` | Structured request logging |
| `metricsPlugin` | `@tokenisation/sdk/plugins/metrics` | Prometheus metrics |
| `rateLimitPlugin` | `@tokenisation/sdk/plugins/rate-limit` | Client-side rate limiting |
| `circuitBreakerPlugin` | `@tokenisation/sdk/plugins/circuit-breaker` | Fault tolerance |

---

## Asset Packs

Pre-configured templates for common asset types:

```typescript
import { applyAssetPack } from '@tokenisation/sdk/packs';

const asset = await applyAssetPack(client, 'real-estate', {
  name: 'Manhattan Office Building',
  jurisdiction: 'US',
  projectId: project.id,
});
```

| Pack | Key | Description |
|------|-----|-------------|
| Real Estate | `real-estate` | Property with rental income distribution |
| Private Equity | `private-equity` | Fund shares with LP/GP governance |
| Fixed Income | `fixed-income` | Bonds with coupon schedules |
| Commodities | `commodities` | Physical commodity-backed tokens |
| Revenue Share | `revenue-share` | Automated royalty distribution |
| Carbon Credits | `carbon-credits` | Environmental assets with retirement |
| Art & Collectibles | `art-collectibles` | Fractional ownership with provenance |
| Infrastructure | `infrastructure` | Milestone-based project tokens |
| IP Rights | `intellectual-property` | Licensing fee distribution |
| Trade Finance | `trade-finance` | Letters of credit and receivables |

---

## Rate Limits

| Tier | Requests/min | Burst |
|------|-------------|-------|
| Test (`sk_test_*`) | 60 | 10 |
| Live (`sk_live_*`) | 600 | 50 |
| Enterprise | Custom | Custom |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Idempotency

All write operations accepting `idempotencyKey` are safe to retry. Same key within 24 hours returns the original response.

```typescript
await client.tokens.issue(tokenId, {
  investorId: investor.id,
  amount: '1000',
  idempotencyKey: 'issue-alice-001',
});
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TOKENISATION_API_KEY` | Default API key |
| `TOKENISATION_BASE_URL` | Default base URL |
| `TOKENISATION_TIMEOUT` | Default timeout (ms) |
| `TOKENISATION_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) |
