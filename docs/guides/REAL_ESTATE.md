---
sidebar_position: 1
title: Real Estate Tokenisation Guide
---

# Real Estate Tokenisation Guide

This guide walks through the complete workflow for tokenising a real estate property on the AHOY platform, with a focus on UAE/Dubai properties using the Dubai Land Department (DLD) integration and VARA compliance.

---

## Overview

Real estate tokenisation converts a physical property into fractional digital tokens, each representing a proportional ownership right. The AHOY platform handles the full lifecycle:

1. **Asset creation** -- register the property as a tokenisable asset
2. **DLD verification** -- link and verify the title deed with Dubai Land Department
3. **Compliance setup** -- configure policies for VARA regulatory requirements
4. **Token deployment** -- deploy an ERC-3643 (T-REX) security token
5. **Investor onboarding** -- KYC/AML verification and wallet linking
6. **Issuance** -- issue fractional tokens to investors
7. **Secondary transfers** -- compliant peer-to-peer trading
8. **Distributions** -- pay rental income or dividends to token holders

---

## Step 1: Create the Asset

Register the property as a DRAFT asset with the `OWNERSHIP` right type.

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  apiKey: process.env.TOKENISATION_API_KEY!,
});

const asset = await client.assets.create({
  name: 'Marina Tower Unit 1204',
  rightType: 'OWNERSHIP',
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'VARA',
    accreditedOnly: false,
    blockedJurisdictions: ['US', 'KP', 'IR'],
  },
  transferabilityRules: {
    mode: 'COMPLIANCE_GATED',
    lockupPeriodSeconds: 365 * 24 * 60 * 60, // 1 year lockup
    requireKyc: true,
    maxHolders: 200,
  },
  metadata: {
    propertyType: 'residential',
    area: 'Dubai Marina',
    totalAreaSqft: 1850,
    bedrooms: 2,
    completionYear: 2022,
    annualRentalYield: '7.2%',
  },
});

console.log(`Asset created: ${asset.id} [${asset.state}]`);
```

---

## Step 2: Register and Verify DLD Title

Link the property to its official DLD title deed and verify it.

```typescript
// Register the DLD title deed
const title = await client.dld.registerTitle({
  projectId: asset.id,
  dldTitleNumber: 'DLD-2024-001234',
  propertyType: 'unit',
  emirate: 'dubai',
  area: 'Dubai Marina',
  buildingName: 'Marina Tower',
  unitNumber: '1204',
  propertyDetails: {
    plotNumber: 'JBR-045',
    totalAreaSqft: 1850,
    ownershipType: 'freehold',
  },
});

// Verify the title against DLD records
const verification = await client.dld.verifyTitle(title.id);
console.log(`Title verified: ${verification.status}`);
// verification.status: 'verified' | 'pending' | 'disputed'

// Check the title is clear of encumbrances
const clearCheck = await client.dld.checkTitleClear(title.id);
console.log(`Title clear: ${clearCheck.isClear}`);
// clearCheck.isClear: boolean
// clearCheck.flags: ['no_liens', 'no_disputes', 'no_encumbrances']
```

For enhanced verification, use the on-chain verification endpoint which uses Chainlink Functions to cryptographically verify the title against the DLD registry:

```typescript
const onChainVerification = await client.dld.verifyTitleOnChain(title.id);
```

---

## Step 3: Configure Compliance Policy

Create a VARA-compliant transfer policy with rules for KYC, jurisdiction blocking, and investor limits.

```typescript
const policy = await client.compliance.createPolicy({
  name: 'Marina Tower Transfer Policy',
  type: 'transfer',
  ruleset: {
    version: 1,
    rules: [
      {
        id: 'kyc-required',
        type: 'require',
        field: 'investor.kycStatus',
        op: 'eq',
        value: 'approved',
        message: 'KYC verification is required',
      },
      {
        id: 'sanctions-clear',
        type: 'require',
        field: 'investor.sanctions',
        op: 'eq',
        value: 'clear',
        message: 'Investor must pass sanctions screening',
      },
      {
        id: 'blocked-jurisdictions',
        type: 'block',
        field: 'investor.jurisdiction',
        op: 'in',
        value: ['US', 'KP', 'IR', 'SY', 'CU'],
        message: 'Transfers to blocked jurisdictions are not permitted',
      },
      {
        id: 'dld-title-verified',
        type: 'require',
        field: 'asset.dld.status',
        op: 'eq',
        value: 'verified',
        message: 'DLD title must be verified before transfers',
      },
      {
        id: 'dld-no-disputes',
        type: 'block',
        field: 'asset.dld.flags',
        op: 'contains',
        value: 'disputed',
        message: 'Transfers blocked during active dispute',
      },
    ],
  },
});
```

---

## Step 4: Transition Asset and Deploy Token

Move the asset through its lifecycle, then deploy the security token.

```typescript
// Submit for verification
await client.assets.transition(asset.id, {
  toState: 'PENDING_VERIFICATION',
  reason: 'DLD title verified, submitting for platform review',
});

// After platform review, mark as verified then active
await client.assets.transition(asset.id, { toState: 'VERIFIED' });
await client.assets.transition(asset.id, { toState: 'ACTIVE' });

// Create token
const token = await client.tokens.create({
  name: 'Marina Tower 1204',
  symbol: 'MT1204',
  totalSupply: '1000000',  // 1M tokens = 1M fractional shares
  chainId: 137,            // Polygon mainnet
  standard: 'ERC3643',
  projectId: asset.id,
  complianceModules: ['KYC', 'CountryRestriction', 'MaxBalance'],
});

// Deploy to Polygon
const deployment = await client.tokens.deploy(token.id, {
  deployerAddress: '0xYourDeployerWallet...',
});

// After on-chain confirmation
await client.tokens.confirmDeployment(token.id, {
  contractAddress: deployment.contractAddress,
  txHash: deployment.txHash,
  blockNumber: deployment.blockNumber,
});

// Attach compliance policy to token
await client.tokens.attachPolicy(token.id, { policyId: policy.id });
```

---

## Step 5: Onboard Investors

Register investors, run KYC, and link their wallets.

```typescript
// Register an investor
const investor = await client.investors.create({
  email: 'ahmed@example.ae',
  type: 'individual',
  countryCode: 'AE',
  taxResidency: 'AE',
  profile: {
    firstName: 'Ahmed',
    lastName: 'Al Maktoum',
    emiratesId: 'XXX-XXXX-XXXXXXX-X',
  },
});

// Start KYC verification with Sumsub
const kyc = await client.investors.createKycSession(investor.id, {
  provider: 'sumsub',
  levelRequested: 'enhanced',
});
// kyc.redirectUrl -- send this to the investor to complete KYC

// After KYC approval (via webhook or polling), link wallet
const wallet = await client.investors.addWallet(investor.id, {
  address: '0xInvestorWallet...',
  chainId: 137,
  label: 'Primary Polygon wallet',
});

// Verify wallet ownership via signature
await client.investors.verifyWallet(investor.id, wallet.id, {
  signature: '0xSignedChallenge...',
});
```

---

## Step 6: Issue Tokens

Issue fractional ownership tokens to verified investors.

```typescript
// Issue 50,000 tokens (5% ownership) to Ahmed
const issuance = await client.tokens.issue(token.id, {
  investorId: investor.id,
  walletAddress: '0xInvestorWallet...',
  amount: '50000',
  reason: 'Primary offering allocation',
});

// Check updated cap table
const capTable = await client.tokens.getCapTable(token.id);
console.log(capTable.positions);
// [{ investorId, walletAddress, balance: '50000', percentage: '5.00' }]
```

---

## Step 7: Secondary Market Transfers

Enable compliant peer-to-peer transfers between verified investors.

```typescript
// Execute a compliant transfer
const transfer = await client.transfers.execute({
  tokenId: token.id,
  fromWallet: '0xSellerWallet...',
  toWallet: '0xBuyerWallet...',
  amount: '10000',
  autoApprove: true,         // auto-approve if compliance passes
  mode: 'non_custodial',     // return unsigned tx for seller to sign
});

if (transfer.decision.result === 'allow') {
  // Transfer approved -- seller signs the unsigned transaction
  console.log('Unsigned tx:', transfer.unsignedTx);
} else {
  // Transfer denied
  console.log('Denied reasons:', transfer.decision.reasons);
}
```

---

## Step 8: Distribute Rental Income

Pay rental income proportionally to all token holders.

```typescript
const distribution = await client.cashflow.createSchedule({
  assetId: asset.id,
  type: 'RENT',
  frequency: 'MONTHLY',
  allocationStrategy: 'PRO_RATA',
  paymentCurrency: 'AED',
  amount: '25000',           // 25,000 AED monthly rent
  startDate: '2026-03-01T00:00:00Z',
  minimumBalance: '100',     // minimum token balance to qualify
});

// Each month, the platform automatically:
// 1. Snapshots the cap table at the record date
// 2. Calculates pro-rata allocation per holder
// 3. Distributes via on-chain or bank transfer
```

---

## DLD Event Monitoring

The platform continuously monitors DLD events (title transfers, liens, disputes) and can pause token operations if a title is compromised.

```typescript
// Ingest a DLD event manually (or via DLD webhook)
await client.dld.ingestEvent({
  dldTitleId: title.id,
  eventType: 'lien_added',
  eventData: {
    lienHolder: 'Bank ABC',
    amount: 500000,
    currency: 'AED',
  },
});

// The compliance engine automatically blocks transfers when flags appear.
// You can also create sync jobs for periodic reconciliation:
await client.dld.createSyncJob({
  jobType: 'reconcile',
  config: { dldTitleId: title.id },
});
```

---

## VARA Compliance Considerations

When tokenising real estate under the UAE Virtual Assets Regulatory Authority (VARA):

- **KYC/AML**: All investors must complete enhanced KYC before receiving tokens
- **Jurisdiction restrictions**: Certain jurisdictions (sanctioned countries) must be blocked
- **Maximum holders**: Consider the 200-holder limit for exempted offerings
- **Lockup periods**: Primary offering tokens are typically locked for 12 months
- **DLD verification**: Title deed must be verified before any token issuance
- **Ongoing monitoring**: DLD events (liens, disputes) trigger automatic compliance reviews
- **Audit trail**: Every state change, transfer, and compliance decision is immutably logged

The platform handles all of these through the compliance engine, DLD integration, and event-sourced audit trail.
