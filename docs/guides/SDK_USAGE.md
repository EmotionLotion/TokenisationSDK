# SDK Usage Guide

## Overview

The TokenisationSDK provides a complete toolkit for tokenizing real-world assets. This guide covers common usage patterns.

## Initialization

### Development Mode (Mock Plugins)

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({ useMockPlugins: true });
```

### Production Mode (Real Plugins)

```typescript
import { TokenisationSDK } from '@tokenisation/sdk';
import { ApiStoragePlugin } from '@tokenisation/sdk/plugins';

const sdk = new TokenisationSDK({ useMockPlugins: false });

// Register storage plugin
const apiClient = new ApiClient({
  baseUrl: 'https://api.example.com',
  getToken: () => localStorage.getItem('authToken'),
});
sdk.plugins.register('storage', new ApiStoragePlugin(apiClient));
```

## Working with Parties

### Create Parties

```typescript
import { PartyType, PartyRole } from '@tokenisation/sdk';

// Create an issuer (company)
const issuer = sdk.parties_.create({
  name: 'Acme Real Estate',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'US',
  metadata: {
    registrationNumber: '12345',
    website: 'https://acme.com',
  },
});

// Create an investor (individual)
const investor = sdk.parties_.create({
  name: 'John Doe',
  type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR],
  jurisdiction: 'US',
});

// Create a verifier
const verifier = sdk.parties_.create({
  name: 'Verification Agency',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.VERIFIER],
  jurisdiction: 'US',
});
```

### KYC Verification

```typescript
// Set KYC status
sdk.parties_.setKyc(investor.id, true);

// Set KYC with expiry
sdk.parties_.setKyc(investor.id, true, new Date('2025-12-31'));

// Check KYC status
const party = sdk.parties_.get(investor.id);
console.log('KYC verified:', party.kycVerified);
```

### Freeze/Unfreeze Parties

```typescript
// Freeze a party (blocks all operations)
sdk.parties_.freeze(investor.id);

// Unfreeze
sdk.parties_.unfreeze(investor.id);
```

## Working with Assets

### Create Assets

```typescript
import { RightType, TransferMode } from '@tokenisation/sdk';

// Real estate token
const realEstate = await sdk.assets.create({
  name: 'Downtown Office Building',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
  transferMode: TransferMode.COMPLIANCE_GATED,
  metadata: {
    address: '123 Main St',
    sqft: 50000,
    valuation: 10000000,
  },
});

// Event ticket
const ticket = await sdk.assets.create({
  name: 'VIP Concert Pass',
  rightType: RightType.ACCESS,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
  transferMode: TransferMode.WHITELIST_ONLY,
  metadata: {
    eventDate: '2024-06-15',
    venue: 'Madison Square Garden',
  },
});

// Loyalty points (non-transferable)
const loyalty = await sdk.assets.create({
  name: 'Reward Points',
  rightType: RightType.BEHAVIOR,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
  transferMode: TransferMode.NON_TRANSFERABLE,
});
```

### Asset Lifecycle

```typescript
import { LifecycleState } from '@tokenisation/sdk';

// 1. Submit for verification
await sdk.assets.transition(
  realEstate.id,
  LifecycleState.PENDING_VERIFICATION,
  issuer.id
);

// 2. Verify the asset
await sdk.assets.verify(realEstate.id, verifier.id);

// 3. Activate for trading
await sdk.assets.activate(realEstate.id, issuer.id);

// Check state
const asset = await sdk.assets.get(realEstate.id);
console.log('State:', asset.state); // 'ACTIVE'
```

### Suspend and Resume

```typescript
// Suspend trading
await sdk.assets.suspend(realEstate.id, issuer.id);

// Resume trading
await sdk.assets.transition(
  realEstate.id,
  LifecycleState.ACTIVE,
  issuer.id
);
```

## Working with Tokens

### Minting

```typescript
// Mint tokens to investor
await sdk.tokens.mint(realEstate.id, investor.id, '1000');

// Mint to multiple investors
await sdk.tokens.mint(realEstate.id, investor1.id, '500');
await sdk.tokens.mint(realEstate.id, investor2.id, '300');
await sdk.tokens.mint(realEstate.id, investor3.id, '200');
```

### Transfers

```typescript
// Transfer tokens
const result = await sdk.tokens.transfer(
  realEstate.id,
  investor1.id,
  investor2.id,
  '100'
);

if (result.success) {
  console.log('Transfer complete');
} else {
  console.log('Transfer failed:', result.error);
}
```

### Burning

```typescript
// Burn tokens (e.g., redemption)
await sdk.tokens.burn(realEstate.id, investor.id, '100');
```

### Balance Queries

```typescript
// Get single balance
const balance = await sdk.tokens.getBalance(realEstate.id, investor.id);
console.log('Balance:', balance); // "900"

// Get all balances
const allBalances = await sdk.tokens.getAllBalances(realEstate.id);
// Map<string, string>: partyId -> balance
```

## Working with Events

### Query Events

```typescript
// All events
const events = sdk.events.getAll();

// Events for specific asset
const assetEvents = sdk.events.getByAsset(realEstate.id);

// Events by type
const transfers = sdk.events.getByType('TRANSFER');
const mints = sdk.events.getByType('MINT');
```

### Event Types

| Type | Description |
|------|-------------|
| `PARTY_CREATED` | New party registered |
| `ASSET_CREATED` | New asset created |
| `LIFECYCLE_TRANSITION` | Asset state change |
| `MINT` | Tokens minted |
| `TRANSFER` | Tokens transferred |
| `BURN` | Tokens burned |
| `KYC_UPDATED` | KYC status changed |
| `FREEZE` | Party/asset frozen |

## Complete Example: Real Estate Tokenization

```typescript
import {
  TokenisationSDK,
  RightType,
  TransferMode,
  LifecycleState,
  PartyType,
  PartyRole,
} from '@tokenisation/sdk';

async function tokenizeRealEstate() {
  const sdk = new TokenisationSDK({ useMockPlugins: true });

  // 1. Setup parties
  const issuer = sdk.parties_.create({
    name: 'Prime Properties LLC',
    type: PartyType.ORGANIZATION,
    roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(issuer.id, true);

  const investor1 = sdk.parties_.create({
    name: 'Alice Smith',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(investor1.id, true);

  const investor2 = sdk.parties_.create({
    name: 'Bob Jones',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: 'US',
  });
  sdk.parties_.setKyc(investor2.id, true);

  // 2. Create asset
  const property = await sdk.assets.create({
    name: 'Sunset Tower Apartments',
    rightType: RightType.OWNERSHIP,
    issuerId: issuer.id,
    jurisdiction: { countryCode: 'US' },
    transferMode: TransferMode.COMPLIANCE_GATED,
    metadata: {
      address: '456 Sunset Blvd',
      units: 50,
      valuation: 25000000,
    },
  });

  // 3. Progress through lifecycle
  await sdk.assets.transition(
    property.id,
    LifecycleState.PENDING_VERIFICATION,
    issuer.id
  );
  await sdk.assets.verify(property.id, issuer.id);
  await sdk.assets.activate(property.id, issuer.id);

  // 4. Mint tokens (1 token = 0.01% ownership)
  await sdk.tokens.mint(property.id, investor1.id, '6000'); // 60%
  await sdk.tokens.mint(property.id, investor2.id, '4000'); // 40%

  // 5. Transfer tokens
  await sdk.tokens.transfer(property.id, investor1.id, investor2.id, '1000');

  // 6. Check final balances
  const balance1 = await sdk.tokens.getBalance(property.id, investor1.id);
  const balance2 = await sdk.tokens.getBalance(property.id, investor2.id);

  console.log('Alice balance:', balance1); // "5000"
  console.log('Bob balance:', balance2);   // "5000"

  // 7. View audit trail
  const events = sdk.events.getByAsset(property.id);
  console.log('Events:', events.length);
}

tokenizeRealEstate();
```

## Error Handling

```typescript
try {
  await sdk.tokens.transfer(assetId, from, to, amount);
} catch (error) {
  switch (error.code) {
    case 'INSUFFICIENT_BALANCE':
      console.error('Not enough tokens');
      break;
    case 'TRANSFER_DENIED':
      console.error('Compliance check failed:', error.message);
      break;
    case 'ASSET_NOT_ACTIVE':
      console.error('Asset is not in ACTIVE state');
      break;
    default:
      console.error('Unknown error:', error);
  }
}
```

## React Integration (Platform UI)

The platform UI provides React hooks for easy SDK integration.

### SDK Context Hooks

```tsx
import { useSDK, useAssets, useParties, useAssetMetrics } from './contexts/SDKContext';

function Dashboard() {
  const { sdk, isInitialized } = useSDK();
  const { assets, createAsset, transitionAsset } = useAssets();
  const { parties, createParty } = useParties();
  const metrics = useAssetMetrics();

  if (!isInitialized) return <div>Loading...</div>;

  return (
    <div>
      <p>Total Assets: {metrics.totalAssets}</p>
      <p>Active: {metrics.activeAssets}</p>
    </div>
  );
}
```

### Blockchain Hooks

```tsx
import {
  useWalletConnection,
  useTokenBalance,
  useTokenTransfer,
  useNFT
} from './hooks/useBlockchain';

function TokenOperations() {
  const { address, isConnected, connect } = useWalletConnection();
  const { balance } = useTokenBalance(tokenAddress);
  const { transfer, isLoading } = useTokenTransfer(tokenAddress);
  const { mint, tokenURI } = useNFT(nftAddress);

  return (
    <button onClick={() => transfer(recipient, amount)}>
      Transfer {balance} tokens
    </button>
  );
}
```

### Vertical Service Hooks

```tsx
import {
  useDriverReputation,
  useFlyPlusPasses,
  useWaterCredits
} from './hooks/useVerticals';

// COMET Driver Reputation (Soulbound)
function DriverProfile() {
  const { score, tier, achievements, updateScore } = useDriverReputation();
  return <p>Safety Score: {score}/100 ({tier})</p>;
}

// Fly+ Aviation Tickets (NFT)
function MyPasses() {
  const { passes, purchasePass, usePass } = useFlyPlusPasses();
  return passes.map(p => <PassCard key={p.id} pass={p} />);
}

// H2O Utility Credits
function WaterDashboard() {
  const { credits, usage, earnCredits } = useWaterCredits();
  return <p>Credits: {credits} | Saved: {usage.saved}L</p>;
}
```

### AHOY Token Economy Hooks

```tsx
import {
  useAhoyBalance,
  useAhoyStaking,
  useGovernance,
  useRewardHistory
} from './hooks/useAhoyToken';

function StakingInterface() {
  const { balance } = useAhoyBalance();
  const {
    stakedAmount,
    tier,
    rewards,
    stake,
    unstake,
    claimRewards
  } = useAhoyStaking();
  const { proposals, vote } = useGovernance();
  const { history, totalEarned } = useRewardHistory();

  return (
    <div>
      <p>Balance: {balance} AHOY</p>
      <p>Staked: {stakedAmount} ({tier.name} - {tier.apy}% APY)</p>
      <button onClick={() => stake(amount, lockPeriod)}>Stake</button>
      <button onClick={claimRewards}>Claim {rewards}</button>
    </div>
  );
}
```

### Ahoy Ecosystem State

```tsx
import { useAhoyState } from './contexts/SDKContext';

function RewardTracker() {
  const { ahoyState, simulateAhoyAction } = useAhoyState();

  const earnPoints = () => {
    const result = simulateAhoyAction('PERFECT_DELIVERY_WEEK', 'COMET');
    console.log(`Earned ${result.points} points!`);
  };

  return (
    <div>
      <p>Balance: {ahoyState.balance} points</p>
      <p>Tier: {ahoyState.tier}</p>
      <p>Streak: {ahoyState.streak} days</p>
      <button onClick={earnPoints}>Complete Delivery</button>
    </div>
  );
}
```

## Related Documents

- [SDK API Reference](../reference/SDK_API.md) - Full API documentation
- [Plugin System](../architecture/PLUGINS.md) - Custom plugins
- [Lifecycle Engine](../architecture/LIFECYCLE.md) - State machine details
- [UI Kit Guide](./UI_KIT.md) - React component library
