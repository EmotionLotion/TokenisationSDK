<div align="center">

# Tokenisation SDK

![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)
![CI](https://github.com/EmotionLotion/TokenisationSDK/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)

SDK for building compliant tokenized asset platforms — real estate, compute, and more.

</div>

## Install

```bash
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK
pnpm install && pnpm -r run build
```

## Quick Start

The fastest **verified** path is the **loyalty** vertical — the SDK's
[certified reference module](docs/modules/loyalty.module.md). Full walkthrough:
**[Developer Quickstart (Loyalty)](docs/getting-started/LOYALTY_QUICKSTART.md)**.

```bash
# 1. Build, then run the local API server (SQLite, zero config) on :3001
pnpm -r run build
cp server/.env.example server/.env
cd server && pnpm dev

# 2. In a second terminal: seed a sandbox API key
cd server && pnpm db:seed --org-only      # prints a one-time sk_test_... key
export AHOY_API_KEY="sk_test_..."

# 3. Run the end-to-end loyalty example (program → earn → redeem, idempotent)
cd examples/loyalty-minimal && npm install && npx tsx src/index.ts
```

The TypeScript SDK, inline:

```typescript
import { createApiClient } from '@tokenisation/core';

const client = createApiClient({ apiKey: process.env.AHOY_API_KEY!, baseUrl: 'http://localhost:3001' });

const program = await client.loyalty.programs.create({
  name: 'FlyPlus Rewards',
  earnRules: [{ action: 'flight_booked', points: 500 }],
});
const account = await client.loyalty.accounts.create({ programId: program.id, investorId: 'holder-123' });

await client.loyalty.points.earn(account.id, { action: 'flight_booked' });

// Mutations require a stable Idempotency-Key (3rd arg) → safe to retry, never double-spends.
const result = await client.loyalty.points.redeem(
  account.id,
  { amount: 250, action: 'gift_card', redemptionRate: 100 },
  'redeem-holder-123-001',
);
// result.balanceAfter === 250, result.redeemedValue === '2.50'
```

> Other verticals (real estate, compute, …) ship as packs but are still being
> brought to full conformance — see the
> [aspirational real-estate walkthrough](docs/getting-started/QUICKSTART.md).

## Packages

Generic core + opt-in verticals. Install only what you need:

```
@tokenisation/core              Generic foundation (lifecycle, API client, packs, state machines)
@tokenisation/compliance        KYC/AML, identity claims, jurisdiction enforcement
@tokenisation/chains            EVM chains, Chainlink oracles, smart contracts, custody

@tokenisation/realestate        Real estate (DLD, NAV, property management)
@tokenisation/compute           GPU compute (nodes, clusters, benchmarks)
@tokenisation/pack-travel       Airline tickets, hotel reservations, car rentals, concerts
@tokenisation/pack-loyalty      Loyalty points, behavior scores
@tokenisation/pack-securities   US Reg D securities
@tokenisation/pack-supply-chain Warehouse receipts, physical assets

@tokenisation/sdk               Umbrella — re-exports everything
```

## Documentation

- [Developer Quickstart (Loyalty — certified reference module)](docs/getting-started/LOYALTY_QUICKSTART.md)
- [Loyalty Points Recipe](docs/recipes/LOYALTY_POINTS.md)
- [Architecture Overview](docs/architecture/OVERVIEW.md)
- [Installation Guide](docs/getting-started/INSTALLATION.md)
- [Quick Start Guide (real estate / securities — aspirational)](docs/getting-started/QUICKSTART.md)
- [API Reference](docs/api/SDK_REFERENCE.md)
- [Building a Real Estate App](docs/guides/BUILDING_REAL_ESTATE_APP.md)
- [Compliance Guide](docs/guides/COMPLIANCE.md)

## Testing

```bash
pnpm --filter @tokenisation/sdk test:run    # SDK unit tests
pnpm -r run typecheck                       # Typecheck all packages
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome.

## License

MIT — see [LICENSE](LICENSE).
