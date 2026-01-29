# Recipe 5: Concert Tickets — Proof of Reserve

Tokenize concert tickets and use Chainlink Proof of Reserve to verify that minted tickets never exceed venue capacity. Automatically block minting when the venue is full.

## When to Use

You are issuing asset-backed tokens (concert tickets, event passes, limited-edition collectibles) and need on-chain proof that the number of minted tokens matches or is below the available supply — with automatic mint blocking if capacity is exceeded.

## Before & After

**Before — manual reserve checking (25+ lines):**

```typescript
import { ethers } from 'ethers';

const porABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'];
const provider = new ethers.JsonRpcProvider(rpcUrl);
const porFeed = new ethers.Contract(porFeedAddress, porABI, provider);
const [, reserves] = await porFeed.latestRoundData();

const supply = await tokenContract.totalSupply();
const ratio = Number(reserves) / Number(supply);
if (ratio < 1.0) throw new Error(`Oversold: ${ratio}`);
if (ratio < 0.5) throw new Error('Circuit breaker: critically oversold');
// No automatic gating, no status enum, no compliance integration
await tokenContract.mint(recipient, amount);
```

**After — SDK (8 lines):**

```typescript
import { createChainlinkWiredSDK } from '@tokenisation/sdk';

const chainlink = createChainlinkWiredSDK({
  chainId: 84532, rpcUrl: RPC_URL,
  por: { checkerAddress: '0xPoRChecker' },
});
const canMint = await chainlink.plugins.por!.canMint('0xToken', '1');
console.log(canMint.data.allowed);  // true/false
console.log(canMint.data.reason);   // "Fully backed" / "Venue full"
```

## Full Example

```typescript
import {
  TokenisationSDK,
  RightType,
  LifecycleState,
  PartyType,
  PartyRole,
  TransferabilityMode,
  ProofOfReservePlugin,
  ReserveStatus,
  ComplianceEngine,
  ComplianceAction,
  createChainlinkWiredSDK,
} from '@tokenisation/sdk';

// 1. Tokenize a concert
const sdk = new TokenisationSDK({ useMockPlugins: true });

const venue = sdk.parties_.create({
  name: 'Arena Web3 Events', type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER], jurisdiction: 'US',
  email: 'events@arenaweb3.com',
});
sdk.parties_.setKyc(venue.id, true);

const fan = sdk.parties_.create({
  name: 'Carlos Ruiz', type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR], jurisdiction: 'US', email: 'carlos@example.com',
});
sdk.parties_.setKyc(fan.id, true);

const concert = await sdk.assets.create({
  name: 'Crypto Music Fest 2025 — VIP',
  description: 'VIP access, front-row seating, backstage pass',
  rightType: RightType.ACCESS,
  issuerId: venue.id,
  jurisdiction: { countryCode: 'US', regulatoryFramework: 'SEC_REG_D', accreditedOnly: false, blockedJurisdictions: ['KP'] },
  validityPeriod: { isPerpetual: false, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 90 * 86400000).toISOString() },
  transferabilityRules: { mode: TransferabilityMode.COMPLIANCE_GATED, lockupPeriodSeconds: 0, maxHolders: 50000, requireKyc: true },
  metadata: { eventName: 'Crypto Music Fest 2025', tier: 'VIP', venueCapacity: 50000, antiScalping: true },
});

await sdk.assets.transition(concert.id, LifecycleState.PENDING_VERIFICATION, venue.id);
await sdk.assets.verify(concert.id, venue.id);
await sdk.assets.activate(concert.id, venue.id);

// 2. Check reserves with ProofOfReservePlugin
const por = new ProofOfReservePlugin({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  checkerAddress: '0xPoRCheckerContract',
});

const reserve = await por.checkReserve('0xTicketToken');
if (reserve.success) {
  console.log('Status:', ReserveStatus[reserve.data.status]);
  // FULLY_BACKED — seats available
  // UNDERCOLLATERALIZED — nearing capacity
  // CIRCUIT_BREAKER — sold out, all ops blocked

  console.log('Reserve (seats):', reserve.data.reserveAmount);
  console.log('Circulating (sold):', reserve.data.circulatingSupply);
  console.log('Ratio:', reserve.data.currentRatio);
  console.log('Mint allowed:', reserve.data.mintAllowed);
}

// 3. Check if a specific mint is allowed
const mintCheck = await por.canMint('0xTicketToken', '100');
if (mintCheck.success) {
  console.log('Can mint 100:', mintCheck.data.allowed);
  console.log('Max mintable:', mintCheck.data.maxAmount);
}

// 4. Wire PoR into ComplianceEngine for automatic gating
const complianceEngine = new ComplianceEngine({
  porConfig: { enabled: true, blockOnUndercollateralized: true },
});

const chainlink = createChainlinkWiredSDK({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  por: { checkerAddress: '0xPoRCheckerContract' },
  complianceEngine,
});

// ComplianceEngine now auto-checks reserves before every mint
const result = await complianceEngine.evaluate(
  ComplianceAction.TOKEN_MINT,
  {
    assetId: concert.id,
    actorId: venue.id,
    recipientId: fan.id,
    amount: '1',
    metadata: { tier: 'VIP' },
  }
);

console.log('Decision:', result.decision.result);
// If venue is full → DENY with violation: "Reserve check failed"

if (result.decision.result === 'ALLOW') {
  await sdk.tokens.mint(concert.id, fan.id, '1');
  console.log('Ticket issued!');
}

chainlink.stop();
```

## Key APIs

| Method | Description |
|--------|-------------|
| `ProofOfReservePlugin.checkReserve(token)` | Full reserve status check |
| `ProofOfReservePlugin.canMint(token, amount)` | Check if a specific mint amount is allowed |
| `ProofOfReservePlugin.canTransfer(token)` | Check if transfers are allowed |
| `ReserveStatus.FULLY_BACKED` | Reserves meet or exceed required ratio |
| `ReserveStatus.UNDERCOLLATERALIZED` | Below required ratio, above circuit breaker |
| `ReserveStatus.CIRCUIT_BREAKER` | Critically low — ALL operations blocked |
| `ComplianceEngine({ porConfig })` | Wire PoR into compliance evaluation |
| `createChainlinkWiredSDK({ por })` | Auto-wire PoR into ComplianceEngine |

## Gotchas

- **Circuit breaker**: When reserves drop below `circuitBreakerRatio`, ALL operations (mints and transfers) are blocked. This prevents overselling.
- **Collateralization ratios**: Configured in the on-chain PoR checker contract, not in the SDK. The SDK reads these values.
- **Mint blocking**: When `blockOnUndercollateralized` is `true`, the ComplianceEngine denies mints even if all other checks pass.
- **Feed addresses**: The PoR checker contract must be deployed with the correct Chainlink PoR feed for your reserve asset.
- **Staleness**: PoR feeds update less frequently than price feeds. Check timestamps to ensure data freshness.
- **Reserve types**: PoR works for venue capacity, fiat reserves, crypto collateral, and commodity reserves. The SDK abstracts the feed type.
