# Recipe 1: Real Estate — Chainlink Price Feeds

Tokenize real estate and calculate live NAV from Chainlink price feeds. The SDK handles caching, staleness detection, circuit breakers, and NAV mapping automatically.

## When to Use

You are tokenizing property and need real-time valuations sourced from Chainlink oracles — for portfolio display, compliance thresholds, or automated NAV updates.

## Before & After

**Before — raw ethers.js (20+ lines):**

```typescript
import { ethers } from 'ethers';

const ABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'];
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const feed = new ethers.Contract('0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1', ABI, provider);
const [, answer, , updatedAt] = await feed.latestRoundData();
const price = Number(answer) / 1e8;
const stale = Date.now() / 1000 - Number(updatedAt) > 3600;
if (stale) throw new Error('Stale price');
// No caching, no circuit breaker, no NAV mapping, no health monitoring
```

**After — SDK (4 lines):**

```typescript
import { createDataFeedPlugin } from '@tokenisation/sdk';

const plugin = createDataFeedPlugin({ chainId: 84532, rpcUrl: 'https://sepolia.base.org' });
const ethPrice = await plugin.getLatestPrice('ETH/USD');
console.log(`ETH/USD: $${ethPrice.formattedPrice}`);
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
  OracleService,
  OracleFailSafeMode,
  createChainlinkWiredSDK,
} from '@tokenisation/sdk';

// 1. Initialize SDK and create property
const sdk = new TokenisationSDK({ useMockPlugins: true });

const issuer = sdk.parties_.create({
  name: 'Dubai Properties LLC',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
  jurisdiction: 'AE',
  email: 'admin@dubaiproperties.ae',
});
sdk.parties_.setKyc(issuer.id, true);

const property = await sdk.assets.create({
  name: 'Dubai Marina Tower - Unit 1501',
  description: 'Luxury apartment, 1,850 sq ft',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'AE', regulatoryFramework: 'UAE_VARA', accreditedOnly: false, blockedJurisdictions: ['KP'] },
  validityPeriod: { isPerpetual: true, startTime: new Date().toISOString() },
  transferabilityRules: { mode: TransferabilityMode.COMPLIANCE_GATED, lockupPeriodSeconds: 0, maxHolders: 100, requireKyc: true },
  metadata: { valuationUSD: '2500000' },
});

await sdk.assets.transition(property.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
await sdk.assets.verify(property.id, issuer.id);
await sdk.assets.activate(property.id, issuer.id);

// 2. Wire Chainlink price feeds with NAV mapping
const oracleService = new OracleService({
  strictMode: false,
  failSafeMode: OracleFailSafeMode.USE_CACHED,
});

const chainlink = createChainlinkWiredSDK({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  dataFeeds: {
    pairs: ['ETH/USD', 'BTC/USD'],
    pollIntervalMs: 30_000,
    navMappings: {
      [property.id]: { pair: 'ETH/USD', currency: 'USD' },
    },
  },
  oracleService,
});

// 3. Sync prices from Chainlink
try {
  await chainlink.dataFeedBridge!.syncOnce();
} catch {
  oracleService.setPriceFeed('ETH/USD', '182345000000', 8);
}

// 4. Query prices and NAV
const ethPrice = await oracleService.getPrice('ETH/USD');
if (ethPrice.success) console.log(`ETH/USD: ${ethPrice.data.value}`);

const nav = await oracleService.getNAV(property.id);
if (nav.success) console.log(`Property NAV: ${nav.data.value}`);

console.log('Health:', oracleService.getHealthStatus());

// 5. Start continuous polling
await chainlink.start();
// ... prices auto-update every 30 seconds ...
chainlink.stop();
```

## Key APIs

| Method | Description |
|--------|-------------|
| `DataFeedPlugin.getLatestPrice(pair)` | Fetch a single price from Chainlink on-chain |
| `DataFeedPlugin.getPrices(pairs)` | Fetch multiple prices in one call |
| `DataFeedPlugin.getAvailablePairs()` | List supported pairs for the configured chain |
| `DataFeedPlugin.addFeed(pair, address)` | Register a custom price feed address |
| `DataFeedBridge.syncOnce()` | One-shot sync: plugin → OracleService |
| `DataFeedBridge.start()` / `stop()` | Start/stop polling loop |
| `OracleService.getPrice(pair)` | Read cached price (with staleness checks) |
| `OracleService.getNAV(assetId)` | Read NAV (mapped from price feeds) |
| `OracleService.getHealthStatus()` | Oracle health: HEALTHY, DEGRADED, STALE, etc. |

## Gotchas

- **Caching**: `DataFeedPlugin` caches prices for `cacheTimeMs` (default 30s). Call `clearCache()` for immediate refresh.
- **Staleness**: `OracleService` rejects data older than `maxDataAgeMs` (default 5 min). In strict mode, stale data causes operations to fail.
- **Public RPCs**: `https://sepolia.base.org` is rate-limited. For production, use Alchemy, Infura, or QuickNode.
- **Supported chains**: Built-in feed addresses for Ethereum (1), Base (8453), Polygon (137), Sepolia (11155111), and Base Sepolia (84532). For other chains, use `addFeed()`.
- **NAV mappings**: The `navMappings` config ties asset IDs to price pairs. When the bridge syncs, it auto-updates NAV data in OracleService.
