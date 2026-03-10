# @tokenisation/compliance

> KYC/AML, identity claims, and jurisdiction enforcement

The compliance package provides everything needed to verify investor identities, evaluate transfer policies against jurisdiction rules, and manage on-chain identity claims. It builds on `@tokenisation/core` interfaces and is consumed by `@tokenisation/realestate` for UAE-specific compliance.

## Installation

```bash
pnpm add @tokenisation/compliance
```

Peer dependency: `@tokenisation/core`

## Quick Start

```typescript
import { createComplianceService } from '@tokenisation/compliance';

const compliance = createComplianceService({
  policyRegistryId: 'uae-real-estate',
});

const result = await compliance.evaluate({
  tokenId: 'tok_123',
  fromWallet: '0xSender...',
  toWallet: '0xReceiver...',
  amount: '1000',
});

if (result.decision === 'DENY') {
  console.log('Transfer blocked:', result.reasons);
}
```

## Modules

### ComplianceService

Central evaluation engine for transfer compliance. Accepts a transfer context and returns an `ALLOW`, `DENY`, or `REVIEW` decision after running all registered policy rules.

```typescript
import { ComplianceService, createComplianceService } from '@tokenisation/compliance';
```

Key types: `RuleConditionType`, `Ruleset`, `TransferEvaluationContext`, `ComplianceEvaluationResult`

### JurisdictionPlugin

Multi-jurisdiction compliance plugin. Evaluates transfers against country-level rules, sanctions lists, and regulatory framework requirements (VARA, SEC, MiFID, etc.).

```typescript
import { JurisdictionPlugin, createJurisdictionPlugin } from '@tokenisation/compliance';
import type { JurisdictionPluginConfig, JurisdictionRule, RegulatoryFramework } from '@tokenisation/compliance';
```

### KYCCompliancePlugin

Verifies that both parties in a transfer have valid, non-expired KYC at the required level. Supports multiple verification tiers.

```typescript
import { KYCCompliancePlugin, createKYCCompliancePlugin } from '@tokenisation/compliance';
import type { KYCCompliancePluginConfig, KYCLevel, KYCVerificationResult } from '@tokenisation/compliance';
```

### KycPlugin

Full KYC workflow orchestration — session creation, status polling, webhook handling, and provider abstraction.

```typescript
import { KycPlugin, createKycPlugin, VerificationLevel, VerificationStatus } from '@tokenisation/compliance';
import type { KycPluginConfig, KycSession, VerificationResult } from '@tokenisation/compliance';
```

### ClaimsService

Manages identity claims (ERC-734/735 compatible) — issuance, revocation, expiry tracking, and on-chain registry sync.

```typescript
import { ClaimsService } from '@tokenisation/compliance';
import type { ClaimsServiceConfig, Claim, ClaimSet } from '@tokenisation/compliance';
```

### PolicyRegistry

Composable policy rules with `ALLOW` / `DENY` / `REVIEW` outcomes. Includes pre-built policy presets.

```typescript
import { PolicyRegistry, evaluatePolicy, createDefaultPolicyRegistry } from '@tokenisation/compliance';
import type { Policy, PolicyRule, PolicyDecision, DenyReason } from '@tokenisation/compliance';
```

## KYC Providers

| Provider | Class | Description |
|----------|-------|-------------|
| **Sumsub** | `SumsubProvider` | Production KYC — document verification, liveness, AML screening |
| **Mock** | `MockKYCProvider` | Auto-approves all sessions (for development and testing) |

```typescript
import { SumsubProvider, createSumsubProvider, MockKYCProvider } from '@tokenisation/compliance';
```

## Identity Claims System

The claims module provides bit-mask-based claim management for on-chain identity:

```typescript
import {
  ClaimType,
  ClaimBitmask,
  computeClaimBitmask,
  satisfiesMask,
  buildClaimSet,
  kycResultToClaims,
  RequirementMasks,
} from '@tokenisation/compliance';
```

**Claim types**: KYC_BASIC, KYC_ENHANCED, ACCREDITED, JURISDICTION, SANCTIONS_CLEAR, and more. Claims can be combined into bitmasks and verified against requirement masks in a single bitwise operation.

## Policy Presets

```typescript
import { UAE_REAL_ESTATE_POLICY } from '@tokenisation/compliance';
```

`UAE_REAL_ESTATE_POLICY` — Pre-configured policy for Dubai real estate tokenization covering VARA requirements, DLD verification, jurisdiction restrictions, KYC levels, and investor limits.

## Related Packages

| Package | Description |
|---------|-------------|
| [`@tokenisation/core`](../core/README.md) | Foundation — engines, error classes, plugin interfaces |
| [`@tokenisation/chains`](../chains/README.md) | Blockchain interaction and on-chain compliance contracts |
| [`@tokenisation/realestate`](../realestate/README.md) | UAE real estate with DLD/VARA condition evaluators |
| [`@tokenisation/sdk`](../../sdk/README.md) | Umbrella package — re-exports everything |
