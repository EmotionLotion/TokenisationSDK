# Compliance Setup Guide

This guide covers setting up the ERC-3643 (T-REX) compliance framework in the Tokenisation SDK, including KYC integration, sanctions screening, and transfer restrictions.

## Table of Contents

1. [Overview](#overview)
2. [ERC-3643 Architecture](#erc-3643-architecture)
3. [Identity Registry Setup](#identity-registry-setup)
4. [Claim Topics Registry](#claim-topics-registry)
5. [Trusted Issuers Registry](#trusted-issuers-registry)
6. [Modular Compliance](#modular-compliance)
7. [Compliance Modules](#compliance-modules)
8. [KYC Provider Integration](#kyc-provider-integration)
9. [Sanctions Screening](#sanctions-screening)
10. [Transfer Restrictions](#transfer-restrictions)
11. [SDK Integration](#sdk-integration)
12. [Testing Compliance](#testing-compliance)

---

## Overview

The Tokenisation SDK implements the ERC-3643 (T-REX) standard for compliant security tokens. This provides:

- **Identity Management**: On-chain identity registry linking wallets to verified identities
- **Claim Verification**: Verifiable claims issued by trusted parties
- **Modular Compliance**: Composable compliance rules
- **Transfer Restrictions**: Automated enforcement of regulatory requirements

### Key Contracts

| Contract | Purpose |
|----------|---------|
| `IdentityRegistry` | Links addresses to verified identities |
| `ClaimTopicsRegistry` | Defines required claim types |
| `TrustedIssuersRegistry` | Manages trusted claim issuers |
| `ModularCompliance` | Enforces composable compliance rules |
| `ComplianceToken` | ERC-20 with transfer restrictions |

---

## ERC-3643 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ComplianceToken                             │
│  (ERC-20 with transfer hooks calling compliance checks)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ModularCompliance                             │
│  (Orchestrates compliance modules)                              │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ CountryModule│ │ MaxBalance   │ │ HoldTime     │  ...       │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    IdentityRegistry                              │
│  (Links addresses to identities and claims)                     │
│                                                                  │
│  ┌─────────────────────┐    ┌──────────────────────────┐       │
│  │ ClaimTopicsRegistry │    │ TrustedIssuersRegistry   │       │
│  │ (Required claims)   │    │ (Who can issue claims)   │       │
│  └─────────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Identity Registry Setup

The Identity Registry is the core component linking wallet addresses to verified identities.

### Deployment

```typescript
import { ethers } from 'ethers';

// Deploy Identity Registry
const IdentityRegistry = await ethers.getContractFactory('IdentityRegistry');
const identityRegistry = await IdentityRegistry.deploy(
  trustedIssuersRegistryAddress,
  claimTopicsRegistryAddress,
  ownerAddress
);
await identityRegistry.waitForDeployment();
```

### Registering Identities

```typescript
// Register a new identity
await identityRegistry.registerIdentity(
  '0xUserAddress...',      // Wallet address
  '0xIdentityContract...', // ONCHAINID address (or zero for off-chain)
  840                      // Country code (ISO 3166-1 numeric: 840 = US)
);

// Batch register identities
await identityRegistry.batchRegisterIdentity(
  ['0xUser1...', '0xUser2...', '0xUser3...'],
  ['0xIdentity1...', '0xIdentity2...', '0xIdentity3...'],
  [840, 826, 784] // US, UK, UAE
);
```

### Updating Identity Status

```typescript
// Update country
await identityRegistry.updateCountry('0xUserAddress...', 826); // Changed to UK

// Update identity contract
await identityRegistry.updateIdentity('0xUserAddress...', '0xNewIdentity...');

// Remove identity (revokes all claims)
await identityRegistry.deleteIdentity('0xUserAddress...');
```

### Querying Identities

```typescript
// Check if address has registered identity
const hasIdentity = await identityRegistry.contains('0xUserAddress...');

// Get identity details
const identity = await identityRegistry.identity('0xUserAddress...');
console.log(`Identity contract: ${identity}`);

// Get country
const country = await identityRegistry.investorCountry('0xUserAddress...');
console.log(`Country code: ${country}`); // e.g., 840 for US

// Check verification status
const isVerified = await identityRegistry.isVerified('0xUserAddress...');
```

---

## Claim Topics Registry

The Claim Topics Registry defines what claims are required for compliance.

### Standard Claim Topics

```solidity
// Standard ERC-3643 claim topics
uint256 constant KYC_CLAIM = 1;           // KYC verification
uint256 constant AML_CLAIM = 2;           // AML clearance
uint256 constant ACCREDITATION = 3;       // Accredited investor status
uint256 constant RESIDENCY = 4;           // Proof of residency
uint256 constant PROFESSIONAL = 5;        // Professional investor
uint256 constant TAX_COMPLIANCE = 6;      // Tax compliance
uint256 constant OWNERSHIP_LIMIT = 7;     // Ownership limit compliance
```

### Configuration

```typescript
// Deploy Claim Topics Registry
const ClaimTopicsRegistry = await ethers.getContractFactory('ClaimTopicsRegistry');
const claimTopics = await ClaimTopicsRegistry.deploy(ownerAddress);

// Add required claim topics
await claimTopics.addClaimTopic(1); // KYC required
await claimTopics.addClaimTopic(3); // Accreditation required

// Remove a claim topic
await claimTopics.removeClaimTopic(3);

// Get all required topics
const topics = await claimTopics.getClaimTopics();
```

---

## Trusted Issuers Registry

The Trusted Issuers Registry maintains the list of entities authorized to issue claims.

### Adding Trusted Issuers

```typescript
// Deploy Trusted Issuers Registry
const TrustedIssuersRegistry = await ethers.getContractFactory('TrustedIssuersRegistry');
const trustedIssuers = await TrustedIssuersRegistry.deploy(ownerAddress);

// Add a trusted issuer (e.g., KYC provider)
await trustedIssuers.addTrustedIssuer(
  '0xKYCProviderAddress...',
  [1, 2] // Can issue KYC (1) and AML (2) claims
);

// Add accreditation issuer
await trustedIssuers.addTrustedIssuer(
  '0xAccreditationProvider...',
  [3] // Can issue accreditation claims only
);
```

### Managing Issuers

```typescript
// Update issuer's allowed claim topics
await trustedIssuers.updateIssuerClaimTopics(
  '0xKYCProviderAddress...',
  [1, 2, 6] // Added tax compliance (6)
);

// Remove trusted issuer
await trustedIssuers.removeTrustedIssuer('0xKYCProviderAddress...');

// Check if issuer is trusted for a claim topic
const isTrusted = await trustedIssuers.isTrustedIssuer(
  '0xKYCProviderAddress...'
);
const canIssueKYC = await trustedIssuers.hasClaimTopic(
  '0xKYCProviderAddress...',
  1 // KYC topic
);
```

---

## Modular Compliance

The Modular Compliance contract orchestrates multiple compliance modules.

### Deployment and Configuration

```typescript
// Deploy Modular Compliance
const ModularCompliance = await ethers.getContractFactory('ModularCompliance');
const compliance = await ModularCompliance.deploy(ownerAddress);

// Bind to token
await compliance.bindToken(tokenAddress);
```

### Adding Modules

```typescript
// Deploy and add Country Restrictions module
const CountryModule = await ethers.getContractFactory('CountryRestrictionsModule');
const countryModule = await CountryModule.deploy(ownerAddress, identityRegistryAddress);
await countryModule.addOFACSanctions(); // Block OFAC-sanctioned countries

await compliance.addModule(await countryModule.getAddress());

// Deploy and add Max Balance module
const MaxBalanceModule = await ethers.getContractFactory('MaxBalanceModule');
const maxBalanceModule = await MaxBalanceModule.deploy(
  ownerAddress,
  ethers.parseEther('100000') // Max 100,000 tokens per holder
);

await compliance.addModule(await maxBalanceModule.getAddress());
```

### Managing Modules

```typescript
// Get all active modules
const modules = await compliance.getModules();

// Check if module is active
const isActive = await compliance.isModuleActive(moduleAddress);

// Remove a module
await compliance.removeModule(moduleAddress);

// Pause all compliance checks (emergency)
await compliance.pause();
await compliance.unpause();
```

---

## Compliance Modules

The SDK provides several pre-built compliance modules:

### CountryRestrictionsModule

Restricts transfers based on investor country.

```typescript
const countryModule = await CountryModule.deploy(owner, identityRegistry);

// Add OFAC sanctions
await countryModule.addOFACSanctions(); // Iran, North Korea, Syria, Cuba, Russia

// Add custom restrictions
await countryModule.addCountryRestriction(156); // China (156)
await countryModule.addCountryRestrictionsBatch([276, 250]); // Germany, France

// Remove restriction
await countryModule.removeCountryRestriction(156);

// Check if country is restricted
const isRestricted = await countryModule.isCountryRestricted(840); // US
```

### MaxBalanceModule

Limits maximum token holding per address.

```typescript
const maxBalanceModule = await MaxBalanceModule.deploy(
  owner,
  ethers.parseEther('100000') // Max 100k tokens
);

// Update max balance
await maxBalanceModule.setMaxBalance(ethers.parseEther('50000'));

// Exempt certain addresses (e.g., treasury)
await maxBalanceModule.setExemption(treasuryAddress, true);
```

### HoldTimeModule

Enforces minimum holding periods.

```typescript
const holdTimeModule = await HoldTimeModule.deploy(
  owner,
  86400 * 365 // 1 year lockup
);

// Update hold time
await holdTimeModule.setMinHoldTime(86400 * 180); // 6 months

// Exempt addresses
await holdTimeModule.setExemption(marketMakerAddress, true);

// Check transferable balance
const transferable = await holdTimeModule.getTransferableBalance(userAddress);
const locked = await holdTimeModule.getLockedBalance(userAddress);
```

### MaxHoldersModule

Limits total number of token holders.

```typescript
const maxHoldersModule = await MaxHoldersModule.deploy(
  owner,
  99 // Max 99 holders (Reg D 506(c))
);

// Update limit
await maxHoldersModule.setMaxHolders(500);

// Check available slots
const slots = await maxHoldersModule.getAvailableSlots();
const canAdd = await maxHoldersModule.canAddHolder();
```

### WhitelistModule

Requires addresses to be whitelisted.

```typescript
const whitelistModule = await WhitelistModule.deploy(
  owner,
  true,  // Check sender
  true   // Check receiver
);

// Add to whitelist
await whitelistModule.addToWhitelist(
  userAddress,
  0,  // Never expires (or timestamp)
  'KYC verified by SumSub'
);

// Batch add
await whitelistModule.addToWhitelistBatch(
  [user1, user2, user3],
  Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
  'Batch KYC verification'
);

// Use identity registry for automatic whitelist
await whitelistModule.setIdentityRegistry(identityRegistryAddress);
await whitelistModule.setUseIdentityRegistry(true);
```

### TransferFeesModule

Collects transfer fees.

```typescript
const feeModule = await TransferFeesModule.deploy(
  owner,
  feeCollectorAddress,
  100 // 1% fee (100 basis points)
);

// Set fee parameters
await feeModule.setFeeParameters(
  150,    // 1.5% fee
  0,      // No flat fee
  1000,   // Minimum fee: 0.001 tokens
  100000  // Maximum fee: 0.1 tokens
);

// Add fee tiers
await feeModule.addFeeTier(
  ethers.parseEther('10000'),  // Threshold
  50                            // 0.5% for transfers > 10k
);
await feeModule.addFeeTier(
  ethers.parseEther('100000'), // Threshold
  25                            // 0.25% for transfers > 100k
);

// Exempt addresses
await feeModule.setExemption(treasuryAddress, true);
```

---

## KYC Provider Integration

The SDK supports integration with major KYC providers.

### SumSub Integration

```typescript
import { SumSubAdapter } from '@tokenisation/sdk/server';

const sumsub = new SumSubAdapter({
  appToken: process.env.SUMSUB_APP_TOKEN,
  secretKey: process.env.SUMSUB_SECRET_KEY,
  baseUrl: 'https://api.sumsub.com',
  webhookSecret: process.env.SUMSUB_WEBHOOK_SECRET,
});

// Create applicant
const applicant = await sumsub.createApplicant({
  externalUserId: 'user-123',
  email: 'user@example.com',
  fixedInfo: {
    firstName: 'John',
    lastName: 'Doe',
    country: 'USA',
  },
});

// Create verification session
const session = await sumsub.createSession({
  userId: 'user-123',
  levelName: 'basic-kyc-level',
  ttlInSecs: 1800, // 30 minutes
});

// Get session URL for user
console.log(`Verification URL: ${session.url}`);

// Handle webhook
app.post('/webhooks/sumsub', async (req, res) => {
  const event = sumsub.parseWebhook(req.body, req.headers['x-signature']);

  if (event.type === 'applicantReviewed') {
    if (event.reviewResult.reviewAnswer === 'GREEN') {
      // KYC approved - update on-chain
      await identityRegistry.registerIdentity(
        userWalletAddress,
        ethers.ZeroAddress,
        userCountryCode
      );
    }
  }
});
```

### Onfido Integration

```typescript
import { OnfidoAdapter } from '@tokenisation/sdk/server';

const onfido = new OnfidoAdapter({
  apiToken: process.env.ONFIDO_API_TOKEN,
  region: 'eu', // or 'us'
  webhookToken: process.env.ONFIDO_WEBHOOK_TOKEN,
});

// Create applicant
const applicant = await onfido.createApplicant({
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
});

// Create check
const check = await onfido.createCheck({
  applicant_id: applicant.id,
  report_names: ['document', 'facial_similarity_photo'],
});

// Generate SDK token for mobile/web SDK
const sdkToken = await onfido.generateSdkToken(applicant.id);
```

### SDK KYC Plugin

```typescript
import { KycPlugin } from '@tokenisation/sdk';

const kyc = new KycPlugin({
  provider: 'sumsub', // or 'onfido'
  config: {
    appToken: process.env.SUMSUB_APP_TOKEN,
    secretKey: process.env.SUMSUB_SECRET_KEY,
  },
});

// Start KYC flow
const session = await kyc.startVerification({
  userId: 'user-123',
  walletAddress: '0x...',
  level: 'STANDARD', // BASIC, STANDARD, ENHANCED
});

// Check status
const status = await kyc.getVerificationStatus('user-123');
if (status.verified) {
  console.log(`Verified at level: ${status.level}`);
}
```

---

## Sanctions Screening

### Sanctions Service

```typescript
import { SanctionsService } from '@tokenisation/sdk/server';

const sanctions = new SanctionsService({
  sources: ['OFAC', 'UN', 'EU', 'UK'],
  cacheTimeMs: 24 * 60 * 60 * 1000, // 24 hour cache
  apiKey: process.env.SANCTIONS_API_KEY,
});

// Screen individual
const result = await sanctions.screenPerson({
  fullName: 'John Doe',
  dateOfBirth: '1990-01-15',
  nationality: 'US',
});

if (result.matches.length > 0) {
  console.log(`Potential matches found: ${result.matches.length}`);
  for (const match of result.matches) {
    console.log(`- ${match.name} (${match.source}): ${match.score}% match`);
  }
}

// Screen entity
const entityResult = await sanctions.screenEntity({
  name: 'Acme Corporation',
  country: 'US',
});

// Integrate with transfers
const transferSafe = await sanctions.isTransferSafe(
  senderAddress,
  recipientAddress
);
```

### On-Chain Sanctions Check

```typescript
// Using Chainlink Functions for on-chain verification
const sanctionsSource = `
  const address = args[0];
  const response = await Functions.makeHttpRequest({
    url: 'https://api.sanctions-checker.com/check',
    params: { address },
    headers: { 'Authorization': secrets.apiKey }
  });
  return Functions.encodeUint256(response.data.isSanctioned ? 1 : 0);
`;

const result = await functions.sendRequest({
  source: sanctionsSource,
  args: [recipientAddress],
});
```

---

## Transfer Restrictions

### Transfer Workflow

```
User initiates transfer
        │
        ▼
┌───────────────────┐
│ ComplianceToken   │
│ _beforeTokenTransfer()
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ ModularCompliance │
│ canTransfer()     │
└───────────────────┘
        │
        ├──► CountryModule.moduleCheck()
        ├──► MaxBalanceModule.moduleCheck()
        ├──► HoldTimeModule.moduleCheck()
        ├──► WhitelistModule.moduleCheck()
        │
        ▼
   All pass? ──No──► Revert with reason
        │
       Yes
        │
        ▼
   Execute transfer
```

### SDK Transfer Evaluation

```typescript
import { ComplianceService } from '@tokenisation/sdk';

const compliance = new ComplianceService({
  identityRegistry: registryAddress,
  modularCompliance: complianceAddress,
});

// Evaluate transfer before execution
const evaluation = await compliance.evaluateTransfer({
  from: senderParty,
  to: recipientParty,
  asset: tokenAsset,
  amount: '10000',
});

if (evaluation.allowed) {
  console.log('Transfer is compliant');
} else {
  console.log('Transfer blocked:');
  for (const violation of evaluation.violations) {
    console.log(`- ${violation.ruleId}: ${violation.message}`);
  }
}
```

### Pre-Trade Compliance Check

```typescript
// Check if user can receive tokens before initiating trade
const canReceive = await compliance.canReceive(recipientAddress, tokenAddress);

if (!canReceive.allowed) {
  console.log(`Cannot receive: ${canReceive.reason}`);
  // Options:
  // 1. Start KYC flow
  // 2. Request whitelist addition
  // 3. Check jurisdiction requirements
}
```

---

## SDK Integration

### Complete Setup Example

```typescript
import {
  ComplianceService,
  IdentityService,
  KycPlugin,
} from '@tokenisation/sdk';

// Initialize services
const identityService = new IdentityService({
  registryAddress: '0x...',
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
});

const complianceService = new ComplianceService({
  identityRegistry: '0x...',
  modularCompliance: '0x...',
  chainId: 1,
  rpcUrl: process.env.RPC_URL,
});

const kycPlugin = new KycPlugin({
  provider: 'sumsub',
  config: { ... },
});

// User onboarding flow
async function onboardUser(user: User) {
  // 1. Start KYC
  const session = await kycPlugin.startVerification({
    userId: user.id,
    walletAddress: user.walletAddress,
    level: 'STANDARD',
  });

  // 2. Wait for verification (handled via webhook)
  // 3. On KYC approval:
  await identityService.registerIdentity({
    walletAddress: user.walletAddress,
    countryCode: user.countryCode,
    claims: [{ topic: 1, issuer: kycIssuerAddress }],
  });

  // 4. Add to whitelist
  await complianceService.addToWhitelist(user.walletAddress, {
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    reason: 'KYC verified',
  });

  return { success: true };
}
```

---

## Testing Compliance

### Unit Tests

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Compliance', () => {
  let compliance, countryModule, identityRegistry;
  let owner, user1, user2;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    // Deploy contracts...
  });

  it('should block transfer from restricted country', async () => {
    // Register user1 from Iran (364)
    await identityRegistry.registerIdentity(user1.address, ethers.ZeroAddress, 364);

    // Add country restriction
    await countryModule.addCountryRestriction(364);

    // Transfer should fail
    const canTransfer = await compliance.canTransfer(
      user1.address,
      user2.address,
      1000
    );
    expect(canTransfer).to.be.false;
  });

  it('should allow transfer between compliant parties', async () => {
    // Register both users from US (840)
    await identityRegistry.registerIdentity(user1.address, ethers.ZeroAddress, 840);
    await identityRegistry.registerIdentity(user2.address, ethers.ZeroAddress, 840);

    const canTransfer = await compliance.canTransfer(
      user1.address,
      user2.address,
      1000
    );
    expect(canTransfer).to.be.true;
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Compliance', () => {
  it('should complete full onboarding and transfer flow', async () => {
    // 1. User submits KYC
    const kycSession = await kycPlugin.startVerification({
      userId: 'test-user',
      walletAddress: user.address,
    });

    // 2. Simulate KYC approval
    await kycPlugin.mockApproval('test-user');

    // 3. Check identity registered
    const hasIdentity = await identityRegistry.contains(user.address);
    expect(hasIdentity).to.be.true;

    // 4. Check can transfer
    const evaluation = await compliance.evaluateTransfer({...});
    expect(evaluation.allowed).to.be.true;
  });
});
```

---

## Additional Resources

- [ERC-3643 Specification](https://erc3643.io/)
- [T-REX Token Standard](https://github.com/TokenySolutions/T-REX)
- [SDK API Reference](../api/SDK_API.md)
- [Contract Reference](../api/CONTRACTS.md)
