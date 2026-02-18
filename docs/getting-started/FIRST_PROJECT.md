---
sidebar_position: 3
title: First Project Tutorial
---

# Building a Real Estate Tokenisation Project

This tutorial walks you through a complete real estate tokenisation workflow: creating an organisation and project, uploading legal documents, creating an asset, deploying an ERC-3643 security token, onboarding investors with KYC verification, issuing tokens, and distributing dividends.

## Prerequisites

- AHOY platform running locally (see [Installation](./INSTALLATION.md))
- An API key (`sk_test_xxxxx` for sandbox mode)
- Node.js 18+ with TypeScript

## 1. Initialise the SDK Client

```typescript
import { ApiClient } from '@tokenisation/sdk';

const client = new ApiClient({
  apiKey: process.env.AHOY_API_KEY!,
  baseUrl: process.env.AHOY_API_URL ?? 'http://localhost:3001',
});
```

## 2. Create the Project

A project groups related assets under a single jurisdiction and regulatory framework.

```typescript
const project = await client.projects.create({
  name: 'Palm Jumeirah Residences',
  jurisdiction: 'DUBAI',
  assetType: 'REAL_ESTATE',
  metadata: {
    developer: 'Nakheel',
    targetRaise: 50_000_000,
    currency: 'AED',
    regulatoryFramework: 'VARA',
  },
});
```

## 3. Upload Legal Documents

Every tokenised real estate project requires legal documentation: title deeds, offering memoranda, SPV formation documents, and valuation reports.

```typescript
// Upload the offering memorandum
const offeringDoc = await client.projects.uploadDocument(project.id, {
  file: fs.readFileSync('./docs/offering-memorandum.pdf'),
  fileName: 'offering-memorandum.pdf',
  documentType: 'OFFERING_MEMORANDUM',
  description: 'Private placement memorandum for Palm Jumeirah Residences',
});

// Upload the title deed
const titleDeed = await client.projects.uploadDocument(project.id, {
  file: fs.readFileSync('./docs/title-deed.pdf'),
  fileName: 'title-deed.pdf',
  documentType: 'TITLE_DEED',
  description: 'DLD-registered title deed',
});

// Upload a third-party valuation
const valuation = await client.projects.uploadDocument(project.id, {
  file: fs.readFileSync('./docs/valuation-report.pdf'),
  fileName: 'valuation-report.pdf',
  documentType: 'VALUATION_REPORT',
  description: 'Independent valuation by Knight Frank',
});
```

## 4. Create the Asset

The asset represents the underlying real-world property. It begins in `DRAFT` state and moves through the lifecycle as verification and compliance steps are completed.

```typescript
const asset = await client.assets.create({
  name: 'Palm Jumeirah Villa 17',
  rightType: 'OWNERSHIP',
  jurisdiction: {
    countryCode: 'AE',
    regulatoryFramework: 'VARA',
    accreditedOnly: false,
    blockedJurisdictions: ['US', 'KP', 'IR'],
  },
  validityPeriod: {
    isPerpetual: true,
  },
  transferabilityRules: {
    mode: 'COMPLIANCE_GATED',
    requireKyc: true,
    lockupPeriodSeconds: 365 * 24 * 60 * 60, // 1-year lockup
    maxHolders: 200,
    minimumHoldingAmount: '100',
  },
  metadata: {
    propertyType: 'villa',
    bedrooms: 5,
    area: 8500,
    areaUnit: 'sqft',
    plotNumber: 'PJ-17-0042',
    valuationAed: 25_000_000,
  },
});

console.log('Asset:', asset.id, 'State:', asset.state); // DRAFT
```

## 5. Progress Through the Asset Lifecycle

Move the asset through verification stages before it can accept investors.

```typescript
// Submit for verification
await client.assets.transition(asset.id, {
  toState: 'PENDING_VERIFICATION',
  reason: 'Documents uploaded, ready for review',
});

// After admin review, mark as verified
await client.assets.transition(asset.id, {
  toState: 'VERIFIED',
  reason: 'All documents verified by compliance team',
});

// Activate the asset (ready for token issuance)
await client.assets.transition(asset.id, {
  toState: 'ACTIVE',
  reason: 'Token deployment complete, open for investment',
});
```

## 6. Deploy an ERC-3643 Security Token

ERC-3643 (T-REX) tokens have built-in identity and compliance checks at the smart contract level. Every transfer is validated on-chain.

```typescript
const token = await client.tokens.create({
  name: 'Palm Villa 17 Token',
  symbol: 'PV17',
  chainId: 137,            // Polygon mainnet
  projectId: project.id,
  standard: 'ERC3643',
  maxSupply: '250000',     // 250,000 tokens
  decimals: 0,             // Whole tokens only
});

const deployed = await client.tokens.deploy(token.id);
console.log('Contract:', deployed.contractAddress);
console.log('Identity Registry:', deployed.identityRegistryAddress);
console.log('Compliance Module:', deployed.complianceModuleAddress);
```

## 7. Onboard Investors with KYC

Each investor must complete KYC/AML verification before they can hold tokens. The platform supports multiple KYC providers and automatically registers verified investors in the on-chain Identity Registry.

```typescript
// Onboard an individual investor
const investor1 = await client.investors.create({
  email: 'sarah@example.com',
  firstName: 'Sarah',
  lastName: 'Al Maktoum',
  jurisdiction: 'AE',
  type: 'INDIVIDUAL',
});

// Onboard an institutional investor
const investor2 = await client.investors.create({
  email: 'fund@acmecapital.com',
  entityName: 'Acme Capital Partners',
  jurisdiction: 'GB',
  type: 'INSTITUTIONAL',
});

// In production, investors complete KYC via the hosted flow.
// In sandbox with ENABLE_MOCK_KYC=true, status is auto-approved.

// Check KYC status
const kyc1 = await client.investors.getKycStatus(investor1.id);
console.log('KYC Status:', kyc1.status); // APPROVED
```

## 8. Issue Tokens

With the token deployed and investors verified, issue tokens from the treasury.

```typescript
// Issue 100,000 tokens to Sarah
await client.transfers.create({
  tokenId: token.id,
  from: 'TREASURY',
  to: investor1.id,
  amount: '100000',
  type: 'ISSUANCE',
});

// Issue 50,000 tokens to Acme Capital
await client.transfers.create({
  tokenId: token.id,
  from: 'TREASURY',
  to: investor2.id,
  amount: '50000',
  type: 'ISSUANCE',
});
```

## 9. Distribute Dividends

The platform supports automated dividend distributions based on token holdings (cap table snapshots).

```typescript
// Create a distribution for Q4 rental income
const distribution = await client.cashflow.createDistribution({
  tokenId: token.id,
  type: 'DIVIDEND',
  totalAmount: '500000',     // 500,000 AED total
  currency: 'AED',
  snapshotDate: '2025-12-31T23:59:59Z',
  description: 'Q4 2025 rental income distribution',
  paymentMethod: 'BANK_TRANSFER',
});

console.log('Distribution:', distribution.id);
console.log('Recipients:', distribution.recipientCount);
// Dividends are calculated pro-rata based on each investor's holding
// at the snapshot date.

// Sarah holds 100k / 150k = 66.67% -> receives 333,333 AED
// Acme holds 50k / 150k = 33.33% -> receives 166,667 AED
```

## 10. Monitor with Audit Trail

Every operation is recorded in an immutable audit log.

```typescript
const logs = await client.audit.list({
  entityId: asset.id,
  limit: 50,
});

for (const entry of logs.data) {
  console.log(`[${entry.timestamp}] ${entry.action} by ${entry.actorId}`);
}
```

## Summary

In this tutorial you have:

1. Created a project under the VARA regulatory framework
2. Uploaded legal documents (offering memo, title deed, valuation)
3. Created an asset with compliance-gated transferability rules
4. Progressed the asset through the DRAFT to ACTIVE lifecycle
5. Deployed an ERC-3643 security token on Polygon
6. Onboarded individual and institutional investors with KYC
7. Issued tokens from the treasury
8. Distributed dividends pro-rata based on holdings
9. Reviewed the audit trail

## Next Steps

- [Core Concepts](../CONCEPTS.md) -- Deep dive into the asset lifecycle and compliance engine
- [Architecture Overview](../architecture/OVERVIEW.md) -- Understand the platform internals
- [Glossary](../GLOSSARY.md) -- Reference for all platform terminology
