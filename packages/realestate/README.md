# @tokenisation/realestate

> UAE real estate tokenization with DLD integration and VARA compliance

The primary vertical package. Provides the full Dubai real estate tokenization lifecycle — from property sourcing through DLD registration, VARA regulatory approval, token issuance, secondary trading, rental distributions, and eventual redemption.

## Installation

```bash
pnpm add @tokenisation/realestate
```

Peer dependencies: `@tokenisation/core`, `@tokenisation/compliance`, `@tokenisation/chains`

## Quick Start

Tokenize a Dubai Marina property in 20 lines:

```typescript
import { UAERealEstatePack } from '@tokenisation/realestate';
import { TokenisationSDK } from '@tokenisation/core';

const sdk = new TokenisationSDK({ useMockPlugins: true });
const pack = new UAERealEstatePack({
  sdk,
  dldProvider: 'mock',
  varaLicenseId: 'VARA-2024-001',
});

// Register the property
const property = await pack.createProperty({
  name: 'Marina Tower Unit 1204',
  emirate: 'dubai',
  area: 'Dubai Marina',
  propertyType: 'residential',
  valuationAED: 2_500_000,
});

// Walk through the lifecycle
await pack.beginDueDiligence(property.id);
await pack.completeDueDiligence(property.id);
await pack.submitForApproval(property.id);
await pack.approveAndIssue(property.id, { varaApproved: true });
await pack.activate(property.id, { dldTokenizationRegistered: true });

// Property is now LIVE — investors can purchase tokens
```

## Real Estate Lifecycle

The 11-state lifecycle models the full Stake.com pipeline with zero information loss:

```
SOURCING ─── BEGIN_DUE_DILIGENCE ──► DUE_DILIGENCE
                                          │
                          BEGIN_LEGAL_STRUCTURING
                                          │
                                   LEGAL_STRUCTURING
                                          │
                           SUBMIT_FOR_APPROVAL
                                          │
                              REGULATORY_APPROVAL ──► TOKEN_ISSUANCE ──► LIVE
                                                                          │
                              ┌────────────────────────────────────────────┤
                              │                                            │
                       ENABLE_SECONDARY                            BEGIN_DISTRIBUTION
                              │                                            │
                     SECONDARY_TRADING ◄──── END_DISTRIBUTION ──── DISTRIBUTING
                              │                                            ▲
                              ├───── BEGIN_DISTRIBUTION ───────────────────┘
                              │
                   ┌──── FREEZE ────┐
                   │                │
                 FROZEN             │
                   │                │
          UNFREEZE_TO_LIVE    UNFREEZE_TO_SECONDARY
                   │                │
                  LIVE    SECONDARY_TRADING
                              │
                  Any non-terminal ──── REDEEM ──► REDEEMED ──── CLOSE ──► CLOSED
```

**States:**

| State | Description |
|-------|-------------|
| `SOURCING` | Property identified and under evaluation |
| `DUE_DILIGENCE` | Comprehensive property and legal due diligence |
| `LEGAL_STRUCTURING` | SPV creation and legal documentation |
| `REGULATORY_APPROVAL` | VARA/SCA/DLD regulatory approvals |
| `TOKEN_ISSUANCE` | Smart contract deployment and token minting |
| `LIVE` | Primary distribution — tokens available for purchase |
| `SECONDARY_TRADING` | P2P secondary market active (lockup expired) |
| `DISTRIBUTING` | Rental income distribution in progress |
| `FROZEN` | Compliance freeze — all transfers halted |
| `REDEEMED` | Property sold, proceeds distributed (terminal) |
| `CLOSED` | All tokens burned, lifecycle complete (terminal) |

**Guards:** Transitions enforce `lockupExpiredGuard`, `varaApprovalGuard`, `dldRegisteredGuard`, and `propertySoldGuard` where appropriate. The `APPROVE_AND_ISSUE` and `ACTIVATE` transitions require `ADMIN` or `COMPLIANCE` roles.

## Pre-Built Packs

| Pack | Variable | Jurisdiction | Features |
|------|----------|-------------|----------|
| **Dubai** | `dubaiRealEstatePack` | DIFC/Dubai | VARA compliance, DLD verification, Dubai-specific metadata |
| **ADGM** | `adgmRealEstatePack` | Abu Dhabi | ADGM FSRA rules, ADGM-specific verifications |
| **Generic** | `genericRealEstatePack` | Any | Base lifecycle and compliance rules without jurisdiction lock-in |

### Pack Factory

Create custom packs by extending the base configuration:

```typescript
import { createRealEstatePack } from '@tokenisation/realestate';

const myPack = createRealEstatePack({
  jurisdiction: 'BAHRAIN',
  complianceRules: customRules,
  lifecycleRules: customLifecycle,
  distributionSchedule: { frequency: 'quarterly', currency: 'BHD' },
});
```

## Condition Evaluators

### DLDConditionEvaluator

Evaluates Dubai Land Department conditions during lifecycle transitions — title deed verification, NOC status, tokenization eligibility, and registration checks.

```typescript
import { DLDConditionEvaluator } from '@tokenisation/realestate';
import type { DLDConditionEvaluatorConfig, DLDVerificationCache } from '@tokenisation/realestate';

const evaluator = new DLDConditionEvaluator({ dldProvider, cacheTtlMs: 300_000 });
```

Implements `ICustomConditionEvaluator` from `@tokenisation/core`. Supports conditions: `dld.title_clear`, `dld.tokenization_eligible`, `dld.noc_obtained`, `dld.registered`.

### VARAConditionEvaluator

Evaluates VARA (Virtual Assets Regulatory Authority) compliance conditions — license validity, risk categorization, and compliance status checks.

```typescript
import { VARAConditionEvaluator, MockVARAServiceProvider } from '@tokenisation/realestate';
import type { VARAComplianceStatus, VARARiskCategory, VARAComplianceCheckResult } from '@tokenisation/realestate';
```

Supports conditions: `vara.license_valid`, `vara.compliance_check`, `vara.risk_assessment`.

## Modules

| Module | Class | Description |
|--------|-------|-------------|
| **DLD** | `DLDClient` | Dubai Land Department API — title registration, verification, event sync |
| **Property** | `PropertyModule` | Property CRUD, unit management, metadata |
| **NAV** | `NAVModule` | Net Asset Value calculations and valuation history |
| **Investor Tier** | `InvestorTierModule` | Tier assignment, eligibility checks |
| **Exit Window** | `ExitWindowModule` | Periodic redemption window scheduling |
| **Secondary Market** | `SecondaryMarketModule` | P2P listing, order matching, settlement |
| **Legal** | `LegalModule` | Legal document management, agreement tracking |

Each module follows the standard `HttpClient`-based pattern:

```typescript
import { PropertyModule, DLDClient, NAVModule } from '@tokenisation/realestate';
```

## Validation Schemas

Zod schemas for all real estate inputs with runtime validation:

| Schema | Type | Description |
|--------|------|-------------|
| `createPropertyInputSchema` | `CreatePropertyInput` | Property creation (name, type, emirate, area, valuation) |
| `updatePropertyInputSchema` | `UpdatePropertyInput` | Partial property update |
| `propertyUnitInputSchema` | `PropertyUnitInput` | Individual unit within a property |
| `maintenanceRequestInputSchema` | `MaintenanceRequestInput` | Maintenance request creation |
| `expenseInputSchema` | `ExpenseInput` | Property expense recording |
| `navValuationInputSchema` | `NAVValuationInput` | NAV valuation submission |
| `createListingInputSchema` | `CreateListingInput` | Secondary market listing |
| `assignTierInputSchema` | `AssignTierInput` | Investor tier assignment |
| `createScheduleInputSchema` | `CreateScheduleInput` | Exit window schedule |
| `redemptionRequestInputSchema` | `RedemptionRequestInput` | Token redemption request |
| `dldRegisterTitleInputSchema` | `DLDRegisterTitleInput` | DLD title registration |
| `dldIngestEventInputSchema` | `DLDIngestEventInput` | DLD event ingestion |
| `dldCreateSyncJobInputSchema` | `DLDCreateSyncJobInput` | DLD data sync job |

```typescript
import { createPropertyInputSchema, parseOrThrow, ValidationError } from '@tokenisation/realestate';

const input = parseOrThrow(createPropertyInputSchema, rawData);
```

## DLD Provider Interface

The `IDLDProvider` interface abstracts DLD integration for testability:

```typescript
import type { IDLDProvider, DLDProviderConfig } from '@tokenisation/realestate';
import { MockDLDProvider, createMockDLDProvider } from '@tokenisation/realestate';

// Use MockDLDProvider for development and testing
const provider = createMockDLDProvider({ defaultApprovalDelay: 1000 });
```

Provider operations: `getTitleDeed`, `checkTokenizationEligibility`, `notifyTokenization`, `getValuation`.

## Lifecycle Bridge Functions

Lossless mapping between the core SDK's `LifecycleState` enum and the 11-state real estate lifecycle:

```typescript
import {
  mapCoreStateToRealEstate,   // LifecycleState -> RealEstateLifecycleState
  mapRealEstateToCoreState,   // RealEstateLifecycleState -> LifecycleState
  mapStakeStageToState,       // Stake.com stage string -> RealEstateLifecycleState
  mapStateToStakeStage,       // RealEstateLifecycleState -> Stake.com stage string
} from '@tokenisation/realestate';
```

## Related Packages

| Package | Description |
|---------|-------------|
| [`@tokenisation/core`](../core/README.md) | Foundation — engines, state machines, error classes |
| [`@tokenisation/compliance`](../compliance/README.md) | KYC/AML, identity claims, policy evaluation |
| [`@tokenisation/chains`](../chains/README.md) | Blockchain interaction, smart contracts, oracles |
| [`@tokenisation/sdk`](../../sdk/README.md) | Umbrella package — re-exports everything |
