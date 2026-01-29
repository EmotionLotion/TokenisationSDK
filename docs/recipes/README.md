# Chainlink Recipes

Task-oriented guides for 5 real-world use cases powered by Chainlink + Tokenisation SDK. Each recipe is self-contained — copy the code, adjust the config, and run.

| # | Use Case | Chainlink Feature | Guide |
|---|----------|-------------------|-------|
| 1 | [Real Estate](./01-real-estate.md) | Price Feeds → NAV | Live property valuations from Chainlink oracles |
| 2 | [Airline Tickets](./02-airline-tickets.md) | Automation (Keepers) | Decentralized flight-event processing |
| 3 | [Car Rental](./03-car-rental.md) | CCIP Cross-Chain | Cross-chain deposit settlement |
| 4 | [Hotel Tickets](./04-hotel-tickets.md) | Compliance-Gated Mint | Oracle-backed compliance checks |
| 5 | [Concert Tickets](./05-concert-tickets.md) | Proof of Reserve | Venue capacity verification |

## Getting Started

All recipes assume you have the SDK installed:

```bash
npm install @tokenisation/sdk
```

For live on-chain data, set an RPC URL:

```bash
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

## See Also

- [Chainlink Starter Kit](../../examples/chainlink-starter/) — runnable demos for all 5 use cases
- [SDK Architecture Guide](../SDK_ARCHITECTURE_GUIDE.md) — internal design patterns
- [API Reference](../API_REFERENCE.md) — full SDK method documentation
