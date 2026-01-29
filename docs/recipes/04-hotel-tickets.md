# Recipe 4: Hotel Tickets — Compliance-Gated Mint

Tokenize hotel reservations and gate minting on real-time compliance checks. Chainlink price feeds power the oracle layer, and every decision produces a signed, hash-chained receipt for audit.

## When to Use

You are issuing tokenized reservations and need to enforce compliance rules (KYC, jurisdiction, oracle health) before any mint — with an immutable audit trail of every decision.

## Before & After

**Before — manual compliance + oracle wiring (30+ lines):**

```typescript
import { ethers } from 'ethers';

const feedABI = ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'];
const provider = new ethers.JsonRpcProvider(rpcUrl);
const feed = new ethers.Contract(feedAddress, feedABI, provider);
const [, answer] = await feed.latestRoundData();
const price = Number(answer) / 1e8;

if (!guest.kycVerified) throw new Error('KYC required');
if (blockedJurisdictions.includes(guest.jurisdiction)) throw new Error('Blocked');
// No audit trail, no receipt, no circuit breaker, no policy versioning
await mintReservation(assetId, guestId, amount);
```

**After — SDK (12 lines):**

```typescript
import { createChainlinkWiredSDK, ComplianceEngine, ComplianceAction, OracleService } from '@tokenisation/sdk';

const chainlink = createChainlinkWiredSDK({
  chainId: 84532, rpcUrl: RPC_URL,
  dataFeeds: { pairs: ['ETH/USD'], pollIntervalMs: 30_000 },
});
await chainlink.dataFeedBridge!.syncOnce();

const result = await chainlink.complianceEngine.evaluate(
  ComplianceAction.TOKEN_MINT,
  { assetId: 'asset-001', actorId: 'hotel-001', recipientId: 'guest-001', amount: '1', metadata: {} }
);
console.log(result.decision.result);  // ALLOW | DENY | CONDITIONAL
console.log(result.receipt.id);       // Signed audit receipt
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
  ComplianceAction,
  OracleService,
  OracleFailSafeMode,
  ComplianceEngine,
  createChainlinkWiredSDK,
} from '@tokenisation/sdk';

// 1. Set up hotel and guest
const sdk = new TokenisationSDK({ useMockPlugins: true });

const hotel = sdk.parties_.create({
  name: 'Grand Token Hotel', type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER, PartyRole.VERIFIER], jurisdiction: 'AE',
  email: 'reservations@grandtoken.com',
});
sdk.parties_.setKyc(hotel.id, true);

const guest = sdk.parties_.create({
  name: 'Maria Garcia', type: PartyType.INDIVIDUAL,
  roles: [PartyRole.INVESTOR], jurisdiction: 'ES', email: 'maria@example.com',
});
sdk.parties_.setKyc(guest.id, true);

// 2. Create and activate reservation
const reservation = await sdk.assets.create({
  name: 'Grand Suite — 3 Nights',
  description: 'Luxury suite with Burj Khalifa view',
  rightType: RightType.ACCESS,
  issuerId: hotel.id,
  jurisdiction: { countryCode: 'AE', regulatoryFramework: 'UAE_VARA', accreditedOnly: false, blockedJurisdictions: ['KP', 'IR'] },
  validityPeriod: { isPerpetual: false, startTime: new Date().toISOString(), endTime: new Date(Date.now() + 3 * 86400000).toISOString() },
  transferabilityRules: { mode: TransferabilityMode.COMPLIANCE_GATED, lockupPeriodSeconds: 0, maxHolders: 1, requireKyc: true },
  metadata: { roomType: 'GRAND_SUITE', nights: 3, ratePerNight: '1200' },
});

await sdk.assets.transition(reservation.id, LifecycleState.PENDING_VERIFICATION, hotel.id);
await sdk.assets.verify(reservation.id, hotel.id);
await sdk.assets.activate(reservation.id, hotel.id);

// 3. Wire Chainlink → OracleService → ComplianceEngine
const oracleService = new OracleService({
  strictMode: false,
  failSafeMode: OracleFailSafeMode.USE_CACHED,
});

const complianceEngine = new ComplianceEngine({});

const chainlink = createChainlinkWiredSDK({
  chainId: 84532,
  rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
  dataFeeds: { pairs: ['ETH/USD'], pollIntervalMs: 30_000 },
  oracleService,
  complianceEngine,
});

// 4. Sync prices
try {
  await chainlink.dataFeedBridge!.syncOnce();
} catch {
  oracleService.setPriceFeed('ETH/USD', '182345000000', 8);
}

// 5. Evaluate compliance before mint
const result = await complianceEngine.evaluate(
  ComplianceAction.TOKEN_MINT,
  {
    assetId: reservation.id,
    actorId: hotel.id,
    recipientId: guest.id,
    amount: '1',
    metadata: { roomType: 'GRAND_SUITE', totalPrice: '3600' },
  }
);

console.log('Decision:', result.decision.result);     // ALLOW | DENY | CONDITIONAL
console.log('Receipt:', result.receipt.id);            // UUID
console.log('Policy:', result.decision.policyVersion); // Versioned
console.log('Violations:', result.decision.violations.length);

// 6. Mint if allowed
if (result.decision.result === 'ALLOW') {
  await sdk.tokens.mint(reservation.id, guest.id, '1');
  console.log('Reservation issued — receipt:', result.receipt.id);
}

chainlink.stop();
```

## Key APIs

| Method | Description |
|--------|-------------|
| `ComplianceEngine.evaluate(action, context)` | Evaluate a compliance action — returns decision + receipt |
| `ComplianceAction.TOKEN_MINT` | Action type for minting tokens |
| `ComplianceAction.TOKEN_TRANSFER` | Action type for transfers |
| `PolicyDecision.result` | `'ALLOW'`, `'DENY'`, or `'CONDITIONAL'` |
| `DecisionReceipt.id` | Unique receipt ID for audit |
| `DecisionReceipt.policyHash` | SHA-256 hash of the policy used |
| `OracleService.setPriceFeed()` | Manually set a price (fallback/testing) |
| `createChainlinkWiredSDK()` | Wire Chainlink plugins into compliance + oracle |

## Gotchas

- **Strict mode**: When `OracleService.strictMode` is `true`, operations fail if oracle data is stale. Set to `false` for development.
- **Fail-safe modes**: `DENY_ON_FAILURE` (production default) blocks on oracle failure. `USE_CACHED` uses last known prices. `ALLOW_WITH_WARNING` permits with logged warnings.
- **Circuit breaker**: After `circuitBreakerThreshold` consecutive failures (default 5), the circuit opens for `circuitBreakerResetMs` (default 60s).
- **Receipt chaining**: Each `DecisionReceipt` contains the hash of the previous receipt, forming an immutable audit chain. Automatic — no extra code.
- **Policy versioning**: `policyVersion` tracks which compliance rules were used. Useful for regulatory audits.
