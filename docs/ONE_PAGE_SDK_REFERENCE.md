# Tokenisation SDK — One-Page Reference

> Complete TypeScript API surface for `@tokenisation/sdk` v1.0.0
>
> **Last updated:** 2026-01-29 | **License:** MIT | **Node.js:** >=18

---

## Installation

```bash
npm install @tokenisation/sdk
# or
yarn add @tokenisation/sdk
# or
pnpm add @tokenisation/sdk
```

## Quick Setup

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: 'sk_test_xxx',
  baseUrl: 'https://api.tokenisation.io/v1', // optional
  timeout: 30_000,                             // optional, default 30s
  retries: 3,                                  // optional, default 3
});
```

---

## Table of Contents

- [ApiClient Configuration](#apiclient-configuration)
- [client.projects](#clientprojects)
- [client.assets](#clientassets)
- [client.investors](#clientinvestors)
- [client.tokens](#clienttokens)
- [client.transfers](#clienttransfers)
- [client.compliance](#clientcompliance)
- [client.webhooks](#clientwebhooks)
- [client.events](#clientevents)
- [client.audit](#clientaudit)
- [client.governance](#clientgovernance)
- [client.escrow](#clientescrow)
- [client.cashFlow](#clientcashflow)
- [Core Types](#core-types)
- [Plugin System](#plugin-system)
- [Asset Packs](#asset-packs)

---

## ApiClient Configuration

### Constructor

```typescript
new ApiClient(config: ApiClientConfig)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `apiKey` | `string` | — **(required)** | API key (`sk_test_*` for sandbox, `sk_live_*` for production) |
| `baseUrl` | `string` | `https://api.tokenisation.io/v1` | API base URL |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `retries` | `number` | `3` | Maximum number of retry attempts for transient failures |
| `headers` | `Record<string, string>` | `{}` | Additional headers sent with every request |
| `logger` | `Logger` | `console` | Custom logger implementation |
| `plugins` | `Plugin[]` | `[]` | Array of plugins to register |

### Factory

```typescript
createApiClient(config: ApiClientConfig): ApiClient
```

Returns a fully configured `ApiClient` instance. This is the recommended entry point.

---

## client.projects

Manage top-level project containers that group assets, tokens, investors, and policies.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { name: string, description?: string, jurisdiction?: Jurisdiction, assetType?: AssetType, settings?: ProjectSettings }` | `Promise<Project>` | Create a new project |
| `get` | `id: string` | `Promise<Project>` | Retrieve a project by its ID |
| `list` | `params?: { limit?: number, offset?: number, status?: ProjectStatus, search?: string }` | `Promise<PaginatedResponse<Project>>` | List projects with optional filters |
| `update` | `id: string, input: Partial<ProjectInput>` | `Promise<Project>` | Update an existing project |
| `delete` | `id: string` | `Promise<void>` | Permanently delete a project |
| `getStats` | `id: string` | `Promise<ProjectStats>` | Get project-level statistics (asset count, investor count, total value) |

---

## client.assets

Create and manage tokenisable assets representing real-world rights.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { name: string, rightType: RightType, jurisdiction: Jurisdiction, metadata?: Record<string, unknown>, projectId?: string }` | `Promise<Asset>` | Create a new asset |
| `get` | `id: string` | `Promise<Asset>` | Retrieve an asset by its ID |
| `list` | `params?: { limit?: number, offset?: number, status?: AssetState, rightType?: RightType, jurisdiction?: Jurisdiction, projectId?: string, search?: string }` | `Promise<PaginatedResponse<Asset>>` | List assets with optional filters |
| `update` | `id: string, input: Partial<AssetInput>` | `Promise<Asset>` | Update asset details |
| `activate` | `id: string` | `Promise<Asset>` | Transition asset from draft to active state |
| `freeze` | `id: string, reason: string` | `Promise<Asset>` | Freeze an active asset (halts all operations) |
| `unfreeze` | `id: string` | `Promise<Asset>` | Unfreeze a previously frozen asset |
| `close` | `id: string` | `Promise<Asset>` | Permanently close an asset |

---

## client.investors

Manage investor identities, wallets, and KYC workflows.

### Core CRUD

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { email: string, name?: string, jurisdiction: Jurisdiction, type?: InvestorType, accredited?: boolean }` | `Promise<Investor>` | Create a new investor record |
| `get` | `id: string` | `Promise<Investor>` | Retrieve an investor by ID |
| `list` | `params?: { limit?: number, offset?: number, status?: InvestorStatus, jurisdiction?: Jurisdiction, accredited?: boolean, search?: string }` | `Promise<PaginatedResponse<Investor>>` | List investors with optional filters |
| `update` | `id: string, input: Partial<InvestorInput>` | `Promise<Investor>` | Update investor details |
| `activate` | `id: string` | `Promise<Investor>` | Activate an investor (requires passing KYC) |
| `suspend` | `id: string, reason: string` | `Promise<Investor>` | Suspend an investor |

### Wallet Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `addWallet` | `investorId: string, input: { address: string, chainId: number, walletType?: WalletType, isPrimary?: boolean }` | `Promise<Wallet>` | Link a blockchain wallet to the investor |
| `removeWallet` | `investorId: string, walletId: string` | `Promise<void>` | Remove a linked wallet |
| `listWallets` | `investorId: string` | `Promise<Wallet[]>` | List all wallets for the investor |

### KYC / KYB

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `startKyc` | `investorId: string, input: { provider?: KycProvider, level?: KycLevel, redirectUrl?: string }` | `Promise<KycSession>` | Initiate a KYC verification flow |
| `approveKyc` | `investorId: string, reason?: string` | `Promise<Investor>` | Manually approve KYC (admin override) |
| `rejectKyc` | `investorId: string, reason: string` | `Promise<Investor>` | Manually reject KYC |
| `getKycStatus` | `investorId: string` | `Promise<KycStatus>` | Get the current KYC/KYB status |

---

## client.tokens

Create, deploy, and manage ERC-3643 security tokens on-chain.

### Token Lifecycle

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { name: string, symbol: string, decimals?: number, maxSupply?: string, chainId: number, assetId?: string, policyId?: string }` | `Promise<Token>` | Create a token definition |
| `get` | `id: string` | `Promise<Token>` | Retrieve a token by ID |
| `list` | `params?: { limit?: number, offset?: number, status?: TokenStatus, chainId?: number, assetId?: string, search?: string }` | `Promise<PaginatedResponse<Token>>` | List tokens with optional filters |
| `deploy` | `id: string, input?: { identityRegistryAddress?: string, complianceAddress?: string }` | `Promise<Token>` | Deploy token contracts to chain |
| `pause` | `id: string` | `Promise<Token>` | Pause all token operations |
| `unpause` | `id: string` | `Promise<Token>` | Resume token operations |
| `freeze` | `id: string` | `Promise<Token>` | Freeze the token entirely |

### Issuance & Redemption

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `issue` | `tokenId: string, input: { investorId: string, walletAddress: string, amount: string, idempotencyKey: string }` | `Promise<Issuance>` | Mint and issue tokens to an investor |
| `redeem` | `tokenId: string, input: { walletAddress: string, amount: string, idempotencyKey: string }` | `Promise<Redemption>` | Redeem (burn) tokens from circulation |

### Cap Table & Supply

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getCapTable` | `id: string` | `Promise<CapTable>` | Get the full cap table for a token |
| `getSupply` | `id: string` | `Promise<TokenSupply>` | Get current supply breakdown (total, circulating, reserved) |

### Clawback

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `initiateClawback` | `tokenId: string, input: { fromWallet: string, toWallet: string, amount: string, reason: string, idempotencyKey: string }` | `Promise<Clawback>` | Initiate a clawback (requires dual approval) |
| `approveClawback` | `tokenId: string, clawbackId: string` | `Promise<Clawback>` | Approve a pending clawback |
| `executeClawback` | `tokenId: string, clawbackId: string` | `Promise<Clawback>` | Execute an approved clawback on-chain |

---

## client.transfers

Create, validate, and execute compliant peer-to-peer token transfers.

### Core Transfer Operations

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { tokenId: string, fromWallet: string, toWallet: string, amount: string, idempotencyKey: string }` | `Promise<Transfer>` | Create a new transfer request |
| `get` | `id: string` | `Promise<Transfer>` | Retrieve a transfer by ID |
| `list` | `params?: { limit?: number, offset?: number, status?: TransferStatus, tokenId?: string, walletAddress?: string }` | `Promise<PaginatedResponse<Transfer>>` | List transfers with optional filters |
| `cancel` | `id: string, reason?: string` | `Promise<Transfer>` | Cancel a pending transfer |
| `retry` | `id: string` | `Promise<Transfer>` | Retry a failed transfer |
| `getStatus` | `id: string` | `Promise<TransferStatus>` | Get the real-time status of a transfer |

### Validation & Pre-flight

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `validate` | `input: { tokenId: string, fromWallet: string, toWallet: string, amount: string }` | `Promise<ValidationResult>` | Validate transfer against compliance rules without executing |
| `preflight` | `input: { tokenId: string, fromWallet: string, toWallet: string, amount: string }` | `Promise<PreflightResult>` | Full pre-flight check (compliance, balance, gas estimate) |

### Batch & History

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createBatch` | `transfers: TransferInput[]` | `Promise<BatchResult>` | Submit a batch of transfers atomically |
| `getWalletHistory` | `walletAddress: string, params?: { limit?: number, offset?: number, tokenId?: string }` | `Promise<PaginatedResponse<Transfer>>` | Get transfer history for a specific wallet |
| `getTokenHistory` | `tokenId: string, params?: { limit?: number, offset?: number }` | `Promise<PaginatedResponse<Transfer>>` | Get transfer history for a specific token |

---

## client.compliance

Define, manage, and evaluate compliance policies with configurable rule engines.

### Policy Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createPolicy` | `input: { name: string, jurisdiction: Jurisdiction, rules: RuleDefinition[], description?: string }` | `Promise<Policy>` | Create a new compliance policy |
| `getPolicy` | `id: string` | `Promise<Policy>` | Retrieve a policy by ID |
| `listPolicies` | `params?: { limit?: number, offset?: number, status?: PolicyStatus, jurisdiction?: Jurisdiction }` | `Promise<PaginatedResponse<Policy>>` | List compliance policies |
| `updatePolicy` | `id: string, input: Partial<PolicyInput>` | `Promise<Policy>` | Update a policy (creates new version if active) |
| `activatePolicy` | `id: string` | `Promise<Policy>` | Activate a draft policy |
| `archivePolicy` | `id: string` | `Promise<Policy>` | Archive an active policy |

### Compliance Checks

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `check` | `policyId: string, input: { entityType: EntityType, entityId: string, context?: Record<string, unknown> }` | `Promise<ComplianceResult>` | Run a compliance check against a policy |
| `simulate` | `policyId: string, input: { entityType: EntityType, entityId: string, context?: Record<string, unknown> }` | `Promise<ComplianceResult>` | Simulate a compliance check (no side effects) |

### Decisions

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getDecision` | `id: string` | `Promise<ComplianceDecision>` | Get a specific compliance decision |
| `listDecisions` | `params?: { limit?: number, offset?: number, policyId?: string, entityId?: string, outcome?: DecisionOutcome }` | `Promise<PaginatedResponse<ComplianceDecision>>` | List compliance decisions |
| `overrideDecision` | `id: string, input: { outcome: DecisionOutcome, reason: string, approvedBy: string }` | `Promise<ComplianceDecision>` | Override a compliance decision (admin) |

### Utilities

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `getRuleTypes` | — | `Promise<RuleType[]>` | List all available rule types and their schemas |

---

## client.webhooks

Register HTTP endpoints to receive real-time event notifications.

### Endpoint Management

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { url: string, events: string[], description?: string }` | `Promise<WebhookEndpoint>` | Create a new webhook endpoint |
| `get` | `id: string` | `Promise<WebhookEndpoint>` | Retrieve an endpoint by ID |
| `list` | `params?: { limit?: number, offset?: number }` | `Promise<PaginatedResponse<WebhookEndpoint>>` | List all webhook endpoints |
| `update` | `id: string, input: Partial<WebhookInput>` | `Promise<WebhookEndpoint>` | Update an endpoint URL or events |
| `delete` | `id: string` | `Promise<void>` | Delete a webhook endpoint |
| `rotateSecret` | `id: string` | `Promise<{ secret: string }>` | Rotate the signing secret (invalidates previous) |

### Deliveries & Testing

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `listDeliveries` | `params?: { limit?: number, offset?: number, endpointId?: string, status?: DeliveryStatus }` | `Promise<PaginatedResponse<WebhookDelivery>>` | List delivery attempts |
| `retryDelivery` | `deliveryId: string` | `Promise<{ success: boolean }>` | Retry a failed delivery |
| `sendTestEvent` | `eventType: string, data?: Record<string, unknown>` | `Promise<TestResult>` | Send a test event to subscribed endpoints |

### Signature Verification (Static)

```typescript
import { WebhookVerifier } from '@tokenisation/sdk';

const isValid = WebhookVerifier.verifySignature(
  payload,    // string | Buffer — Raw request body
  signature,  // string — x-webhook-signature header
  secret,     // string — Signing secret from rotateSecret
  timestamp   // string — x-webhook-timestamp header
): boolean;
```

### Available Webhook Events

| Event | Description |
|-------|-------------|
| `asset.created` | New asset created |
| `asset.activated` | Asset transitioned to active |
| `asset.frozen` | Asset was frozen |
| `asset.closed` | Asset was closed |
| `token.deployed` | Token contracts deployed on-chain |
| `token.issued` | Tokens minted and issued |
| `token.redeemed` | Tokens redeemed (burned) |
| `token.paused` | Token operations paused |
| `transfer.created` | Transfer request created |
| `transfer.completed` | Transfer settled on-chain |
| `transfer.failed` | Transfer failed |
| `investor.created` | New investor registered |
| `investor.activated` | Investor activated |
| `investor.kyc.completed` | KYC verification completed |
| `compliance.decision` | Compliance decision made |
| `escrow.funded` | Escrow account funded |
| `escrow.released` | Escrow funds released |
| `governance.proposal.created` | New governance proposal |
| `governance.vote.cast` | Vote cast on proposal |
| `cashflow.distribution.executed` | Distribution executed |

---

## client.events

Publish and consume domain events through the internal event bus.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `publish` | `input: { topic: string, payload: Record<string, unknown>, delayMs?: number, deduplicationKey?: string }` | `Promise<EventMessage>` | Publish a single event |
| `publishBatch` | `events: EventInput[]` | `Promise<BatchResult>` | Publish multiple events atomically |
| `list` | `params?: { limit?: number, offset?: number, topic?: string, status?: EventStatus }` | `Promise<PaginatedResponse<EventMessage>>` | List events with optional filters |
| `get` | `id: string` | `Promise<EventMessage>` | Retrieve an event by ID |
| `delete` | `id: string` | `Promise<void>` | Delete an event |
| `getDeadLetterQueue` | `limit?: number` | `Promise<PaginatedResponse<EventMessage>>` | Retrieve messages from the dead-letter queue |
| `retry` | `id: string` | `Promise<EventMessage>` | Retry a single dead-letter event |
| `retryAllDlq` | — | `Promise<{ retried: number }>` | Retry all events in the dead-letter queue |
| `getStats` | — | `Promise<EventStats>` | Get event processing statistics |
| `getTopics` | — | `Promise<{ topics: string[] }>` | List all registered topics |

---

## client.audit

Immutable, hash-chained audit log for all platform operations.

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `list` | `params?: { limit?: number, offset?: number, actor?: string, action?: string, entityType?: string, entityId?: string, startDate?: string, endDate?: string }` | `Promise<PaginatedResponse<AuditLogEntry>>` | List audit log entries with comprehensive filters |
| `getStats` | — | `Promise<AuditStats>` | Get aggregate audit statistics |
| `verify` | `startId?: string, endId?: string` | `Promise<ChainVerificationResult>` | Verify the integrity of the hash chain over a range |
| `verifyEntry` | `entryId: string` | `Promise<EntryVerificationResult>` | Verify the integrity of a single audit entry |
| `generateEvidencePack` | `subject: { entityType: string, entityId: string }, options?: { format?: 'pdf' | 'json', includeRelated?: boolean }` | `Promise<EvidencePack>` | Generate a regulatory evidence pack for an entity |
| `exportLogs` | `params?: { startDate?: string, endDate?: string, format?: 'csv' | 'json' }` | `Promise<Buffer>` | Export audit logs as a downloadable file |

---

## client.governance

On-chain and off-chain governance for tokenised assets: proposals, voting, delegation.

### Proposals

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { assetId: string, type: ProposalType, title: string, description: string, options?: string[], quorum?: number, duration?: number, startTime?: string }` | `Promise<Proposal>` | Create a new governance proposal |
| `get` | `id: string` | `Promise<Proposal>` | Retrieve a proposal by ID |
| `list` | `params?: { limit?: number, offset?: number, assetId?: string, status?: ProposalStatus, type?: ProposalType }` | `Promise<PaginatedResponse<Proposal>>` | List proposals with optional filters |
| `execute` | `id: string` | `Promise<ExecutionResult>` | Execute a passed proposal |
| `cancel` | `id: string` | `Promise<Proposal>` | Cancel a proposal before it ends |

### Voting

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `castVote` | `proposalId: string, input: { vote: VoteChoice, weight?: string, reason?: string }` | `Promise<VoteRecord>` | Cast a vote on a proposal |
| `listVotes` | `proposalId: string, params?: { limit?: number, offset?: number }` | `Promise<PaginatedResponse<VoteRecord>>` | List all votes on a proposal |
| `getTally` | `proposalId: string` | `Promise<VoteTally>` | Get the current vote tally |

### Delegation & Configuration

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `delegate` | `input: { fromVoterId: string, toVoterId: string, assetId: string }` | `Promise<Delegation>` | Delegate voting power to another investor |
| `configure` | `input: GovernanceConfigInput` | `Promise<GovernanceConfig>` | Configure governance parameters (quorum thresholds, durations, etc.) |
| `getConfig` | — | `Promise<GovernanceConfig>` | Get current governance configuration |

---

## client.escrow

Manage escrow accounts with milestone-based releases, disputes, and multi-party workflows.

### Escrow Lifecycle

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `create` | `input: { type: EscrowType, parties: EscrowParty[], conditions: EscrowCondition[], amount: string, token: string }` | `Promise<Escrow>` | Create a new escrow arrangement |
| `get` | `id: string` | `Promise<Escrow>` | Retrieve an escrow by ID |
| `list` | `params?: { limit?: number, offset?: number, status?: EscrowStatus, type?: EscrowType }` | `Promise<PaginatedResponse<Escrow>>` | List escrows with optional filters |
| `fund` | `escrowId: string, input: { amount: string, fromWallet: string, idempotencyKey: string }` | `Promise<Escrow>` | Fund the escrow account |
| `release` | `escrowId: string, input: { toWallet: string, amount: string, reason?: string }` | `Promise<Escrow>` | Release funds from escrow |
| `refund` | `escrowId: string` | `Promise<Escrow>` | Refund all escrowed funds to the original depositor |
| `cancel` | `escrowId: string` | `Promise<Escrow>` | Cancel the escrow arrangement |

### Milestones

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createMilestone` | `escrowId: string, input: { name: string, amount: string, conditions?: MilestoneCondition[], dueDate?: string }` | `Promise<Milestone>` | Add a milestone to the escrow |
| `approveMilestone` | `escrowId: string, milestoneId: string, input: { approvedBy: string, evidence?: string }` | `Promise<Milestone>` | Approve a milestone for release |

### Disputes

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `raiseDispute` | `escrowId: string, input: { raisedBy: string, reason: string, evidence?: string }` | `Promise<DisputeResolution>` | Raise a dispute on the escrow |
| `resolveDispute` | `escrowId: string, disputeId: string, input: { resolution: DisputeOutcome, resolvedBy: string, reason: string }` | `Promise<DisputeResolution>` | Resolve a dispute |

---

## client.cashFlow

Automate dividend distributions, yield payments, and payout schedules.

### Schedules

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `createSchedule` | `input: { assetId: string, type: DistributionType, frequency: Frequency, amount: string, currency: string, startDate?: string, endDate?: string, description?: string }` | `Promise<DistributionSchedule>` | Create a distribution schedule |
| `getSchedule` | `id: string` | `Promise<DistributionSchedule>` | Retrieve a schedule by ID |
| `listSchedules` | `params?: { limit?: number, offset?: number, assetId?: string, status?: ScheduleStatus }` | `Promise<PaginatedResponse<DistributionSchedule>>` | List distribution schedules |
| `pauseSchedule` | `id: string` | `Promise<DistributionSchedule>` | Pause an active schedule |
| `resumeSchedule` | `id: string` | `Promise<DistributionSchedule>` | Resume a paused schedule |

### Execution & Claims

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `execute` | `scheduleId: string, input: { snapshotDate?: string, dryRun?: boolean }` | `Promise<Distribution>` | Execute a distribution (snapshot holders and compute payouts) |
| `claim` | `distributionId: string` | `Promise<ClaimResult>` | Claim an available payout |
| `getYield` | `assetId: string, period?: string` | `Promise<YieldSummary>` | Get yield summary for an asset over a period |
| `getUnclaimedPayouts` | `investorId: string` | `Promise<UnclaimedPayout[]>` | List all unclaimed payouts for an investor |

---

## Core Types

### Key Enums

```typescript
enum RightType {
  Equity = 'equity',
  Debt = 'debt',
  Revenue = 'revenue',
  Usage = 'usage',
  Governance = 'governance',
  Hybrid = 'hybrid',
}

enum AssetState {
  Draft = 'draft',
  Active = 'active',
  Frozen = 'frozen',
  Closed = 'closed',
}

enum TokenStatus {
  Created = 'created',
  Deploying = 'deploying',
  Deployed = 'deployed',
  Paused = 'paused',
  Frozen = 'frozen',
}

enum TransferStatus {
  Pending = 'pending',
  Validating = 'validating',
  Submitting = 'submitting',
  Confirming = 'confirming',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

enum InvestorStatus {
  Pending = 'pending',
  Active = 'active',
  Suspended = 'suspended',
}

enum KycLevel {
  Basic = 'basic',
  Enhanced = 'enhanced',
  Institutional = 'institutional',
}

enum InvestorType {
  Individual = 'individual',
  Institutional = 'institutional',
  Entity = 'entity',
}

enum ProposalStatus {
  Draft = 'draft',
  Active = 'active',
  Passed = 'passed',
  Rejected = 'rejected',
  Executed = 'executed',
  Cancelled = 'cancelled',
}

enum VoteChoice {
  For = 'for',
  Against = 'against',
  Abstain = 'abstain',
}

enum EscrowStatus {
  Created = 'created',
  Funded = 'funded',
  Active = 'active',
  Released = 'released',
  Refunded = 'refunded',
  Disputed = 'disputed',
  Cancelled = 'cancelled',
}

enum Frequency {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Annually = 'annually',
  OneTime = 'one_time',
}

enum PolicyStatus {
  Draft = 'draft',
  Active = 'active',
  Archived = 'archived',
}

enum DecisionOutcome {
  Allow = 'allow',
  Deny = 'deny',
  Review = 'review',
}
```

### Key Interfaces

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  jurisdiction?: Jurisdiction;
  assetType?: AssetType;
  settings?: ProjectSettings;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

interface Asset {
  id: string;
  name: string;
  rightType: RightType;
  jurisdiction: Jurisdiction;
  state: AssetState;
  metadata: Record<string, unknown>;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Token {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  maxSupply?: string;
  totalSupply: string;
  chainId: number;
  contractAddress?: string;
  status: TokenStatus;
  assetId?: string;
  policyId?: string;
  createdAt: string;
  updatedAt: string;
}

interface Investor {
  id: string;
  email: string;
  name?: string;
  jurisdiction: Jurisdiction;
  type: InvestorType;
  accredited: boolean;
  status: InvestorStatus;
  kycStatus: KycLevel | null;
  wallets: Wallet[];
  createdAt: string;
  updatedAt: string;
}

interface Wallet {
  id: string;
  address: string;
  chainId: number;
  walletType: WalletType;
  isPrimary: boolean;
  investorId: string;
}

interface Transfer {
  id: string;
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  status: TransferStatus;
  txHash?: string;
  blockNumber?: number;
  error?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

interface Policy {
  id: string;
  name: string;
  description?: string;
  jurisdiction: Jurisdiction;
  rules: RuleDefinition[];
  status: PolicyStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ComplianceResult {
  id: string;
  policyId: string;
  outcome: DecisionOutcome;
  rules: RuleResult[];
  metadata: Record<string, unknown>;
  checkedAt: string;
}

interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  hash: string;
  previousHash: string;
  timestamp: string;
}

interface Proposal {
  id: string;
  assetId: string;
  type: ProposalType;
  title: string;
  description: string;
  status: ProposalStatus;
  quorum: number;
  options?: string[];
  startTime: string;
  endTime: string;
  createdAt: string;
}

interface Escrow {
  id: string;
  type: EscrowType;
  parties: EscrowParty[];
  conditions: EscrowCondition[];
  amount: string;
  funded: string;
  token: string;
  status: EscrowStatus;
  milestones: Milestone[];
  createdAt: string;
}

interface DistributionSchedule {
  id: string;
  assetId: string;
  type: DistributionType;
  frequency: Frequency;
  amount: string;
  currency: string;
  status: ScheduleStatus;
  nextExecutionDate?: string;
  createdAt: string;
}
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

**Async iteration pattern:**

```typescript
// Auto-paginate through all results
for await (const investor of client.investors.listAll({ jurisdiction: 'US' })) {
  console.log(investor.email);
}
```

### Error Handling

All errors extend `SDKError`:

```typescript
import { SDKError, ValidationError, NotFoundError, ComplianceError } from '@tokenisation/sdk';

class SDKError extends Error {
  code: string;           // Machine-readable error code
  statusCode: number;     // HTTP status code
  details?: unknown;      // Additional error context
  requestId?: string;     // Unique request ID for support
}
```

**Error codes:**

| Code | HTTP | Description |
|------|------|-------------|
| `AUTHENTICATION_ERROR` | 401 | Invalid or expired API key |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid input parameters |
| `COMPLIANCE_ERROR` | 451 | Transfer blocked by compliance rules |
| `CONFLICT` | 409 | Duplicate idempotency key or state conflict |
| `RATE_LIMITED` | 429 | Too many requests (retry after `retryAfter` seconds) |
| `CHAIN_ERROR` | 502 | Blockchain RPC or transaction error |
| `TIMEOUT` | 504 | Request timed out |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

**Usage:**

```typescript
try {
  await client.transfers.create(input);
} catch (err) {
  if (err instanceof ComplianceError) {
    console.log('Blocked rules:', err.details.failedRules);
  } else if (err instanceof SDKError) {
    console.log("Error " + err.code + ": " + err.message + " (request: " + err.requestId + ")");
  }
}
```

---

## Plugin System

Extend the SDK with first-party or custom plugins.

```typescript
import { createApiClient } from '@tokenisation/sdk';
import { retryPlugin } from '@tokenisation/sdk/plugins/retry';
import { cachePlugin } from '@tokenisation/sdk/plugins/cache';
import { loggingPlugin } from '@tokenisation/sdk/plugins/logging';

const client = createApiClient({
  apiKey: 'sk_test_xxx',
  plugins: [
    retryPlugin({ maxRetries: 5, backoff: 'exponential' }),
    cachePlugin({ ttl: 60_000, maxEntries: 1000 }),
    loggingPlugin({ level: 'debug' }),
  ],
});
```

### Available Plugins

| Plugin | Import | Description |
|--------|--------|-------------|
| `retryPlugin` | `@tokenisation/sdk/plugins/retry` | Configurable retry with exponential backoff and jitter |
| `cachePlugin` | `@tokenisation/sdk/plugins/cache` | In-memory LRU cache for read operations |
| `loggingPlugin` | `@tokenisation/sdk/plugins/logging` | Structured request/response logging |
| `metricsPlugin` | `@tokenisation/sdk/plugins/metrics` | Prometheus-compatible metrics collection |
| `rateLimitPlugin` | `@tokenisation/sdk/plugins/rate-limit` | Client-side rate limiting to stay under quotas |
| `circuitBreakerPlugin` | `@tokenisation/sdk/plugins/circuit-breaker` | Circuit breaker pattern for fault tolerance |

### Custom Plugin Interface

```typescript
interface Plugin {
  name: string;
  version: string;
  beforeRequest?(context: RequestContext): Promise<RequestContext>;
  afterResponse?(context: ResponseContext): Promise<ResponseContext>;
  onError?(error: SDKError, context: RequestContext): Promise<SDKError>;
}
```

---

## Asset Packs

Pre-configured asset templates for common tokenisation use cases. Each pack includes default compliance rules, metadata schemas, and governance configurations.

```typescript
import { applyAssetPack } from '@tokenisation/sdk/packs';

const asset = await applyAssetPack(client, 'real-estate', {
  name: 'Manhattan Office Building',
  jurisdiction: 'US',
  projectId: project.id,
});
```

### Available Packs

| Pack | Key | Description |
|------|-----|-------------|
| **Real Estate** | `real-estate` | Commercial and residential property tokenisation with rental income distribution and property management governance |
| **Private Equity** | `private-equity` | Fund share tokenisation with capital calls, carried interest, and LP/GP governance structures |
| **Fixed Income** | `fixed-income` | Bond and debt instrument tokenisation with coupon schedules and maturity management |
| **Commodities** | `commodities` | Physical commodity-backed tokens with warehouse receipts and delivery settlement |
| **Revenue Share** | `revenue-share` | Revenue participation tokens with automated royalty distribution and waterfall structures |
| **Carbon Credits** | `carbon-credits` | Environmental asset tokenisation with registry integration and retirement tracking |
| **Art & Collectibles** | `art-collectibles` | Fine art and collectible fractional ownership with provenance tracking and exhibition governance |
| **Infrastructure** | `infrastructure` | Infrastructure project tokens with milestone-based funding and concession management |
| **Intellectual Property** | `intellectual-property` | IP rights tokenisation with licensing fee distribution and usage tracking |
| **Trade Finance** | `trade-finance` | Trade finance instruments (letters of credit, receivables) with document verification and payment flows |

Each pack provides:

- **Default compliance rules** tailored to the asset class and common jurisdictions
- **Metadata schemas** with required and optional fields for the asset type
- **Governance templates** with appropriate proposal types and quorum thresholds
- **Cash flow templates** with standard distribution frequencies and waterfall logic
- **Documentation templates** for offering memorandums and investor disclosures

---

## Jurisdictions

The SDK supports the following jurisdiction codes (ISO 3166-1 alpha-2):

`US` | `GB` | `EU` | `SG` | `HK` | `CH` | `AE` | `BM` | `KY` | `AU` | `CA` | `JP` | `DE` | `FR` | `LU` | `IE` | `LI` | `JE` | `GG` | `BVI`

---

## Rate Limits

| Tier | Requests/min | Burst | Batch size |
|------|-------------|-------|------------|
| **Test** (`sk_test_*`) | 60 | 10 | 25 |
| **Live** (`sk_live_*`) | 600 | 50 | 100 |
| **Enterprise** | Custom | Custom | Custom |

Rate limit headers are returned on every response:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 594
X-RateLimit-Reset: 1738200000
```

---

## Idempotency

All write operations that accept an `idempotencyKey` parameter are idempotent. Providing the same key within 24 hours returns the original response without re-executing the operation.

```typescript
// Safe to retry -- will not double-issue
await client.tokens.issue(tokenId, {
  investorId: investor.id,
  walletAddress: '0x...',
  amount: '1000',
  idempotencyKey: 'issue-alice-001', // unique per operation
});
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TOKENISATION_API_KEY` | Default API key (overridden by constructor) |
| `TOKENISATION_BASE_URL` | Default base URL |
| `TOKENISATION_TIMEOUT` | Default timeout in ms |
| `TOKENISATION_LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) |

---

> **Full API documentation:** [https://docs.tokenisation.io](https://docs.tokenisation.io)
>
> **GitHub:** [https://github.com/tokenisation/sdk](https://github.com/tokenisation/sdk)
>
> **Support:** [support@tokenisation.io](mailto:support@tokenisation.io)
