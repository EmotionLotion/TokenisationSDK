---
sidebar_position: 2
title: Compliance Engine Guide
---

# Compliance Engine Guide

The AHOY compliance engine enforces regulatory rules for every token operation -- transfers, issuances, redemptions, and more. It uses a policy-based architecture with versioned rulesets, deterministic evaluation, and cryptographically signed decision receipts.

---

## Architecture

```
Transfer Request
       |
       v
  +-----------+      +-----------+      +-----------+
  |  Policy   | ---> |  Ruleset  | ---> | Decision  |
  |  Resolver |      | Evaluator |      |  Signer   |
  +-----------+      +-----------+      +-----------+
       |                   |                  |
       v                   v                  v
  Token's policy      Rule-by-rule        Signed receipt
  or default          evaluation          with inputs hash
```

Every compliance decision follows this pipeline:

1. **Policy resolution** -- determine which policy applies (token-specific or organisation default)
2. **Data enrichment** -- gather investor KYC status, sanctions screening, DLD title flags
3. **Ruleset evaluation** -- evaluate each rule in the policy's ruleset against the enriched context
4. **Decision signing** -- produce a signed, immutable receipt with a deterministic inputs hash

---

## Creating Policies

A policy contains a name, type, and a versioned ruleset. Policies are scoped to an organisation.

```typescript
const policy = await client.compliance.createPolicy({
  name: 'Standard Transfer Policy',
  description: 'Default compliance rules for all token transfers',
  type: 'transfer', // 'transfer' | 'issuance' | 'redemption' | 'freeze' | 'force_transfer'
  ruleset: {
    version: 1,
    rules: [
      {
        id: 'kyc-check',
        type: 'require',
        field: 'investor.kycStatus',
        op: 'eq',
        value: 'approved',
        message: 'Investor must have approved KYC',
        code: 'KYC_REQUIRED',
      },
    ],
  },
});
```

### Policy Types

| Type | Applied To | Description |
|------|-----------|-------------|
| `transfer` | Token transfers | Evaluated before any peer-to-peer transfer |
| `issuance` | Token issuance | Evaluated before minting new tokens to an investor |
| `redemption` | Token redemption | Evaluated before burning tokens for exit |
| `freeze` | Account freeze | Evaluated before freezing an investor's tokens |
| `force_transfer` | Clawback | Evaluated before regulatory forced transfers |

---

## Rule Types

Each rule has a `type` that determines how it affects the final decision.

### require

The condition **must** be true. If it fails, the decision is `deny`.

```json
{
  "id": "kyc-approved",
  "type": "require",
  "field": "investor.kycStatus",
  "op": "eq",
  "value": "approved",
  "message": "KYC verification is required"
}
```

### block

If the condition is true, the decision is `deny`. Inverse of `require`.

```json
{
  "id": "sanctioned-countries",
  "type": "block",
  "field": "investor.jurisdiction",
  "op": "in",
  "value": ["US", "KP", "IR", "SY", "CU"],
  "message": "Transfers to sanctioned jurisdictions are blocked"
}
```

### limit

Enforces a numeric threshold. The decision is `deny` if the limit is exceeded.

```json
{
  "id": "max-transfer-amount",
  "type": "limit",
  "field": "amount",
  "op": "lte",
  "value": "1000000",
  "message": "Single transfer cannot exceed 1,000,000 tokens"
}
```

### allow

Explicitly allows the operation if the condition matches. Useful for whitelist overrides.

```json
{
  "id": "institutional-bypass",
  "type": "allow",
  "field": "investor.classification",
  "op": "eq",
  "value": "institutional",
  "message": "Institutional investors are pre-approved"
}
```

---

## Operators

Rules support the following comparison operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal to | `field == value` |
| `neq` | Not equal to | `field != value` |
| `gt` | Greater than | `field > value` |
| `gte` | Greater than or equal | `field >= value` |
| `lt` | Less than | `field < value` |
| `lte` | Less than or equal | `field <= value` |
| `in` | Value is in array | `field in [a, b, c]` |
| `not_in` | Value is not in array | `field not in [a, b]` |
| `contains` | Array contains value | `arrayField contains value` |
| `not_contains` | Array does not contain | `arrayField not contains value` |
| `regex` | Matches regular expression | `field matches /pattern/` |

---

## Decision Input Fields

The compliance engine enriches the decision context with data from multiple sources. These fields are available in rules:

### Transfer Fields

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `tokenId` | `string` | Request | Token being transferred |
| `fromWallet` | `string` | Request | Sender wallet address |
| `toWallet` | `string` | Request | Recipient wallet address |
| `amount` | `string` | Request | Transfer amount |
| `token.status` | `string` | Database | Token status (active, paused, frozen) |
| `token.chainId` | `number` | Database | Token chain ID |

### Investor Fields

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `investor.kycStatus` | `string` | Database | `approved`, `pending`, `rejected`, `expired` |
| `investor.classification` | `string` | Database | `individual`, `institutional`, `qualified` |
| `investor.jurisdiction` | `string` | Database | ISO country code |
| `investor.accreditedStatus` | `string` | Database | Accredited investor status |
| `investor.sanctions` | `string` | Screening | `clear` or `flagged` |

### Asset/DLD Fields

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `asset.dld.status` | `string` | DLD Service | `pending`, `verified`, `disputed`, `expired` |
| `asset.dld.flags` | `string[]` | DLD Service | Active flags (liens, disputes, encumbrances) |

---

## Policy Versioning

Policies support immutable versioning. Each new ruleset is published as a numbered version. Decisions reference the exact version that was used, enabling full auditability.

```typescript
// Publish a new version with updated rules
const v2 = await client.compliance.publishPolicyVersion(policy.id, {
  ruleset: {
    version: 2,
    rules: [
      // ...updated rules
      {
        id: 'max-holders',
        type: 'limit',
        field: 'token.holderCount',
        op: 'lte',
        value: 200,
        message: 'Maximum holder limit reached',
      },
    ],
  },
});

// List all versions
const versions = await client.compliance.listPolicyVersions(policy.id);
// [{ version: 1, createdAt: ... }, { version: 2, createdAt: ... }]

// Get a specific version
const v1 = await client.compliance.getPolicyVersion(policy.id, 1);
```

The latest version is always the active one. Previous versions are preserved for audit purposes but are not used for new evaluations.

---

## Evaluating Compliance

### Transfer Evaluation

Evaluate a transfer against the compliance engine. This creates a persisted decision record.

```typescript
const decision = await client.compliance.evaluateTransfer({
  tokenId: token.id,
  fromWallet: '0xSender...',
  toWallet: '0xReceiver...',
  amount: '5000',
  policyId: policy.id, // optional, uses token's default policy if omitted
  fromInvestorId: senderId,
  toInvestorId: receiverId,
});

console.log(decision.result);  // 'allow' or 'deny'
console.log(decision.reasons); // [{ code: 'KYC_REQUIRED', message: '...' }]
console.log(decision.policyVersionId); // UUID of the policy version used
console.log(decision.inputsHash);      // SHA-256 hash of all inputs
console.log(decision.signature);       // HMAC signature of the decision
```

### Simulation (Dry Run)

Test a transfer against compliance without creating a decision record. Useful for pre-flight checks in the UI.

```typescript
const sim = await client.compliance.simulate({
  tokenId: token.id,
  fromWallet: '0xSender...',
  toWallet: '0xReceiver...',
  amount: '5000',
});

console.log(sim.simulation); // true
console.log(sim.persisted);  // false
console.log(sim.result);     // 'allow' or 'deny'
```

### Issuance Evaluation

```typescript
const decision = await client.compliance.evaluateIssuance({
  tokenId: token.id,
  toWallet: '0xInvestor...',
  amount: '10000',
  toInvestorId: investorId,
});
```

---

## Decision Receipts

Every compliance decision produces a signed, immutable receipt. Receipts can be verified at any time to prove a decision was made correctly.

```typescript
// Get a receipt
const receipt = await client.compliance.getReceipt(decisionId);
// {
//   id, decisionId, action, result, issuedAt,
//   policyVersionId, inputsHash, signature,
//   reasons, requiredActions
// }

// Verify the receipt's signature and hash integrity
const verification = await client.compliance.verifyReceipt(decisionId);
// {
//   receiptId, valid: true,
//   signatureValid: true,
//   hashValid: true,
//   chainValid: true,
//   issues: []
// }
```

The `inputsHash` is a SHA-256 digest of all decision inputs (sorted deterministically). The `signature` is an HMAC over the decision payload. Together they provide tamper-evident proof of the decision.

---

## On-Chain Compliance (ERC-3643)

The platform deploys ERC-3643 (T-REX) compliant tokens with modular on-chain compliance. Compliance modules are smart contracts that the token checks before every transfer.

### Supported Compliance Modules

| Module | Description |
|--------|-------------|
| `KYC` | Requires on-chain identity registry entry |
| `CountryRestriction` | Blocks transfers to/from specific countries |
| `MaxBalance` | Limits maximum token balance per holder |
| `MaxHolders` | Limits total number of token holders |
| `TimeRestriction` | Enforces lockup periods and transfer windows |
| `ConditionalTransfer` | Requires multi-sig approval for large transfers |

### Attaching Modules to a Token

```typescript
const token = await client.tokens.create({
  name: 'Property Token',
  symbol: 'PROP',
  totalSupply: '1000000',
  chainId: 137,
  standard: 'ERC3643',
  complianceModules: ['KYC', 'CountryRestriction', 'MaxBalance'],
});
```

### Dual-Layer Compliance

The platform enforces compliance at two layers:

1. **Off-chain (API layer)**: The compliance engine evaluates policies before any transaction is constructed. This provides instant feedback and prevents invalid transactions from reaching the blockchain.

2. **On-chain (smart contract layer)**: The ERC-3643 compliance modules enforce rules at the contract level, providing a final safety net even if the API layer is bypassed.

Both layers must approve a transfer for it to succeed. This defence-in-depth approach ensures regulatory compliance regardless of how tokens are interacted with.

---

## KYC and Sanctions Integration

The compliance engine integrates with external KYC and sanctions providers.

### Configuring a KYC Provider

```typescript
await client.compliance.configureKYC({
  provider: 'sumsub',
  region: 'AE',
  level: 'enhanced',
  webhookUrl: 'https://your-app.com/kyc-webhook',
});
```

### Sanctions Screening

Sanctions screening is automatically performed during compliance evaluation. The investor's `sanctions` field is populated with `clear` or `flagged` before rules are evaluated. If screening fails, the default is `flagged` (fail-closed).

### Freezing an Investor

If an investor is flagged by sanctions screening or a compliance review:

```typescript
await client.compliance.freezeInvestor(investorId, {
  reason: 'Sanctions screening flagged - pending manual review',
});

// After review, unfreeze
await client.compliance.unfreezeInvestor(investorId);
```

Frozen investors cannot make or receive transfers until unfrozen.
