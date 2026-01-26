# Plugin System

## Overview

The SDK uses a **plugin architecture** to enable customization without modifying core logic. Plugins handle external integrations and jurisdiction-specific rules.

## Plugin Types

### 1. Compliance Plugin (`ICompliancePlugin`)

Enforces transfer restrictions and regulatory compliance.

```typescript
interface ICompliancePlugin {
  evaluateTransfer(
    from: Party,
    to: Party,
    asset: Asset,
    amount: bigint
  ): Promise<TransferResult>;

  checkPolicy(context: PolicyContext): Promise<boolean>;
}

interface TransferResult {
  approved: boolean;
  reason?: string;
  requiredActions?: string[];
}
```

**Implementation: MockCompliancePlugin**
```typescript
class MockCompliancePlugin implements ICompliancePlugin {
  async evaluateTransfer(from, to, asset, amount) {
    // Check KYC status
    if (!from.kycVerified || !to.kycVerified) {
      return { approved: false, reason: 'KYC required' };
    }

    // Check transfer mode
    if (asset.transferMode === 'NON_TRANSFERABLE') {
      return { approved: false, reason: 'Asset is non-transferable' };
    }

    return { approved: true };
  }
}
```

### 2. Storage Plugin (`IStoragePlugin`)

Handles data persistence (in-memory, database, or API).

```typescript
interface IStoragePlugin {
  // Parties
  saveParty(party: Party): Promise<void>;
  getParty(id: string): Promise<Party | null>;
  getAllParties(): Promise<Party[]>;

  // Assets
  saveAsset(asset: Asset): Promise<void>;
  getAsset(id: string): Promise<Asset | null>;
  getAllAssets(): Promise<Asset[]>;

  // Balances
  saveBalance(assetId: string, partyId: string, amount: string): Promise<void>;
  getBalance(assetId: string, partyId: string): Promise<string>;
}
```

**Implementations:**
- `InMemoryStoragePlugin` - For testing/development
- `ApiStoragePlugin` - For production (connects to server)

### 3. Oracle Plugin (`IOraclePlugin`)

Provides external data (prices, NAV, real-world state).

```typescript
interface IOraclePlugin {
  getPrice(assetId: string): Promise<bigint>;
  getNAV(assetId: string): Promise<bigint>;
  verifyCondition(conditionId: string): Promise<boolean>;
}
```

**Future integrations:**
- Chainlink Price Feeds
- Chainlink Functions for custom APIs
- Chainlink Proof of Reserve

### 4. Chain Plugin (`IChainPlugin`)

Handles blockchain interactions.

```typescript
interface IChainPlugin {
  // Token operations
  mint(to: string, amount: bigint): Promise<string>;
  burn(from: string, amount: bigint): Promise<string>;
  transfer(from: string, to: string, amount: bigint): Promise<string>;

  // Queries
  getBalance(address: string): Promise<bigint>;
  getTotalSupply(): Promise<bigint>;

  // Admin
  freeze(address: string): Promise<string>;
  unfreeze(address: string): Promise<string>;
}
```

## Plugin Registry

Plugins are registered at SDK initialization:

```typescript
const sdk = new TokenisationSDK({
  useMockPlugins: false  // Use real plugins
});

// Register custom plugins
sdk.plugins.register('compliance', new CustomCompliancePlugin());
sdk.plugins.register('storage', new ApiStoragePlugin(apiClient));
sdk.plugins.register('oracle', new ChainlinkOraclePlugin());
sdk.plugins.register('chain', new EVMChainPlugin(config));
```

## Creating Custom Plugins

### Step 1: Implement the Interface

```typescript
import { ICompliancePlugin, TransferResult } from '@tokenisation/sdk';

export class UAECompliancePlugin implements ICompliancePlugin {
  async evaluateTransfer(from, to, asset, amount): Promise<TransferResult> {
    // UAE-specific rules
    if (asset.jurisdiction.countryCode !== 'AE') {
      return { approved: true }; // Not applicable
    }

    // Check accredited investor status
    if (asset.rightType === 'OWNERSHIP' && !to.isAccredited) {
      return {
        approved: false,
        reason: 'UAE real estate requires accredited investor status'
      };
    }

    return { approved: true };
  }
}
```

### Step 2: Register the Plugin

```typescript
const sdk = new TokenisationSDK({ useMockPlugins: false });
sdk.plugins.register('compliance', new UAECompliancePlugin());
```

### Step 3: Chain Multiple Plugins

For complex scenarios, chain plugins:

```typescript
class ChainedCompliancePlugin implements ICompliancePlugin {
  private plugins: ICompliancePlugin[];

  constructor(plugins: ICompliancePlugin[]) {
    this.plugins = plugins;
  }

  async evaluateTransfer(from, to, asset, amount) {
    for (const plugin of this.plugins) {
      const result = await plugin.evaluateTransfer(from, to, asset, amount);
      if (!result.approved) {
        return result; // Fail fast
      }
    }
    return { approved: true };
  }
}
```

## Plugin Configuration

Plugins can accept configuration:

```typescript
interface ChainPluginConfig {
  chainId: number;
  rpcUrl: string;
  contractAddress: string;
  privateKey?: string;
}

const chainPlugin = new EVMChainPlugin({
  chainId: 8453,  // Base
  rpcUrl: 'https://mainnet.base.org',
  contractAddress: '0x...',
});
```

## Testing Plugins

Use mock plugins for unit tests:

```typescript
describe('Transfer', () => {
  it('should reject non-KYC transfers', async () => {
    const mockCompliance = new MockCompliancePlugin();
    mockCompliance.setKycRequired(true);

    const sdk = new TokenisationSDK({ useMockPlugins: false });
    sdk.plugins.register('compliance', mockCompliance);

    const result = await sdk.tokens.transfer(asset.id, from, to, '100');
    expect(result.success).toBe(false);
    expect(result.error).toContain('KYC');
  });
});
```

## Related Documents

- [Architecture Overview](./OVERVIEW.md) - System design
- [SDK API Reference](../reference/SDK_API.md) - Full API docs
