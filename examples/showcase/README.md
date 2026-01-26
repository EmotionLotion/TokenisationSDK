# Tokenisation SDK - Feature Showcase

This demo showcases all major SDK capabilities in a single runnable script.

## Features Demonstrated

| Demo | Feature | Description |
|------|---------|-------------|
| 1 | **Asset Issuance** | Issue tokens without knowing ERC standards |
| 2 | **Full Workflow** | Parties → Asset → Lifecycle → Mint → Transfer |
| 3 | **Custody & Recovery** | Multi-sig, recovery, overrides, delegation |
| 4 | **Indexing & Reporting** | Events, balances, compliance reports |
| 5 | **Asset Packs** | Pre-built configurations with lifecycle rules |

## Quick Start

```bash
# Install dependencies
npm install

# Run full showcase
npm run demo
```

## Individual Demos

```bash
npm run demo:assets    # Asset issuance without ERC knowledge
npm run demo:workflow  # Full SDK workflow
npm run demo:custody   # Custody & recovery
npm run demo:indexing  # Indexing & reporting
npm run demo:packs     # Asset packs
```

## Code Examples

### 1. Issue Assets (No ERC Knowledge)

```typescript
import { AssetIssuanceService, AssetType, InvestorClass, LiquidityProfile } from '@tokenisation/sdk';

const service = new AssetIssuanceService();

// SDK automatically selects ERC-3643, configures compliance
const asset = await service.issueAsset({
  name: 'Dubai Marina Tower Unit 4501',
  assetType: AssetType.REAL_ESTATE,
  jurisdiction: 'AE',
  investorClass: InvestorClass.ACCREDITED,
  liquidityProfile: LiquidityProfile.SEMI_LIQUID,
  lockupDays: 365,
});
```

### 2. Full Workflow

```typescript
import { TokenisationSDK, RightType, LifecycleState } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({ useMockPlugins: true });

// Create parties
const issuer = sdk.parties_.create({ name: 'Issuer', type: 'ORGANIZATION', roles: ['ISSUER'] });
const investor = sdk.parties_.create({ name: 'Investor', type: 'INDIVIDUAL', roles: ['INVESTOR'] });

// Create & activate asset
const asset = await sdk.assets.create({ name: 'Property', rightType: RightType.OWNERSHIP, issuerId: issuer.id });
await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
await sdk.assets.verify(asset.id, issuer.id);
await sdk.assets.activate(asset.id, issuer.id);

// Mint & transfer
await sdk.tokens.mint(asset.id, investor.id, '1000');
```

### 3. Custody & Recovery

```typescript
import { CustodyManager, CustodyType, RecoveryReason } from '@tokenisation/sdk';

const custody = new CustodyManager();

// 2-of-3 multi-sig
custody.createCustodyArrangement({
  assetId: 'asset-123',
  type: CustodyType.MULTI_SIG,
  threshold: 2,
  custodians: ['custodian-1', 'custodian-2', 'custodian-3'],
});

// Initiate recovery
const recovery = custody.initiateRecovery({
  assetId: 'asset-123',
  reason: RecoveryReason.LOST_KEY,
  newOwner: '0xNewAddress',
  documents: ['affidavit.pdf'],
});
```

### 4. Indexing & Reporting

```typescript
import { IndexingEngine, IndexedEventType } from '@tokenisation/sdk';

const indexer = new IndexingEngine();

// Index events
indexer.indexEvent({
  type: IndexedEventType.TRANSFER,
  assetId: 'asset-123',
  actor: 'user-1',
  data: { from: 'a', to: 'b', amount: '1000' },
});

// Generate compliance report
const report = indexer.generateComplianceReport('asset-123');
console.log(report.summary);
```

### 5. Asset Packs

```typescript
import { AssetPackRegistry } from '@tokenisation/sdk';

// Get pre-built pack
const pack = AssetPackRegistry.get('PRIVATE_EQUITY_FUND');
console.log(pack.defaults);        // Asset configuration
console.log(pack.lifecycleRules);  // State transitions
console.log(pack.complianceRules); // Compliance requirements
console.log(pack.governance);      // Voting settings

// Validate metadata
const result = AssetPackRegistry.validateMetadata('PRIVATE_EQUITY_FUND', {
  fundName: 'My Fund',
  vintageYear: 2024,
  // ...
});
```

## Output Preview

```
╔══════════════════════════════════════════════════════════╗
║        TOKENISATION SDK - FEATURE SHOWCASE               ║
╚══════════════════════════════════════════════════════════╝

============================================================
  DEMO 1: Asset Issuance - Institutional API
============================================================

  Issuing Real Estate Token...
  SDK Auto-Resolution:
  {
    "tokenStandard": "ERC3643",
    "rightType": "OWNERSHIP",
    "transferMode": "COMPLIANCE_GATED",
    "rationale": [
      "DIVISIBLE/FIXED_SHARES → ERC-3643 (compliant token)",
      "Real asset → ERC-3643 with ownership rights",
      ...
    ]
  }
```
