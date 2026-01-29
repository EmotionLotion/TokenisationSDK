# Chainlink Starter Kit

Five use-case demos that wire real Chainlink services through the full Tokenisation SDK pipeline. Each demo tokenizes a different asset type and showcases a different Chainlink capability.

| Demo | Asset | Chainlink Feature |
|------|-------|-------------------|
| Real Estate | Dubai Marina property | Price Feeds → NAV |
| Airline Tickets | JFK→LHR business class | Automation (Keepers) |
| Car Rental | Tesla Model Y reservation | CCIP Cross-Chain Settlement |
| Hotel Tickets | Grand Suite reservation | Compliance-Gated Mint |
| Concert Tickets | VIP festival pass | Proof of Reserve |

## Prerequisites

- Node.js 18+
- (Optional) A Base Sepolia RPC URL for live Chainlink data

## Run

```bash
# From the repo root
cd examples/chainlink-starter
npm install

# Run all 5 demos
npm start

# Or run individual demos
npm run demo:real-estate   # Price Feeds
npm run demo:airline       # Automation
npm run demo:car-rental    # CCIP
npm run demo:hotel         # Compliance-Gated Mint
npm run demo:concert       # Proof of Reserve

# With your own RPC endpoint
BASE_SEPOLIA_RPC_URL=https://your-rpc.example.com npm start
```

## What Each Demo Shows

### 1. Real Estate — Price Feeds

Tokenizes a Dubai Marina property, wires `DataFeedPlugin` → `DataFeedBridge` → `OracleService` for live ETH/USD and BTC/USD prices, then mints equity tokens with NAV calculated from Chainlink feeds.

### 2. Airline Tickets — Automation

Tokenizes a business-class flight ticket, then configures `ChainlinkAutomationPlugin` to register decentralized upkeeps for compliance re-checks and flight-event processing — no cron server needed.

### 3. Car Rental — CCIP Cross-Chain

Tokenizes a car rental reservation and uses `CCIPBridgePlugin` to bridge the security deposit cross-chain (Base Sepolia → Sepolia). Demonstrates fee estimation, token bridging, and DvP settlement via `CCIPSettlementProvider`.

### 4. Hotel Tickets — Compliance-Gated Mint

Tokenizes a hotel reservation and gates minting on real-time compliance. Wires Chainlink price feeds → `OracleService` → `ComplianceEngine.evaluate()`. Every mint produces a signed `DecisionReceipt` for audit.

### 5. Concert Tickets — Proof of Reserve

Tokenizes VIP concert tickets and uses `ProofOfReservePlugin` to verify on-chain that minted tickets never exceed venue capacity. Wires PoR into `ComplianceEngine` for automatic mint blocking.

## Graceful Degradation

If the public RPC (`https://sepolia.base.org`) is unreachable, each demo falls back gracefully — logs a warning, seeds mock data, and continues. The "5-minute first run" promise holds regardless of network conditions.

## Next Steps

Dive deeper with the use-case recipes:

| Recipe | Guide |
|--------|-------|
| [Real Estate](../../docs/recipes/01-real-estate.md) | Price feeds, NAV mapping, oracle health |
| [Airline Tickets](../../docs/recipes/02-airline-tickets.md) | Automation, trigger types, upkeep management |
| [Car Rental](../../docs/recipes/03-car-rental.md) | CCIP bridging, fee estimation, DvP settlement |
| [Hotel Tickets](../../docs/recipes/04-hotel-tickets.md) | Compliance pipeline, receipts, fail-safe modes |
| [Concert Tickets](../../docs/recipes/05-concert-tickets.md) | Proof of Reserve, circuit breaker, mint gating |
