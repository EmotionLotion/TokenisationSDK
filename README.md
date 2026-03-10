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

Start the API server (SQLite, zero config):

```bash
cp server/.env.example server/.env
cd server && pnpm dev
```

Create a tokenized asset:

```bash
curl -X POST http://localhost:3001/api/v1/assets \
  -H "Content-Type: application/json" \
  -H "X-Dev-Org-Id: dev-org-1" \
  -d '{"name": "Marina Heights Unit 2501", "rightType": "OWNERSHIP", "jurisdiction": {"countryCode": "AE"}}'
```

Or use the TypeScript SDK:

```typescript
import { createApiClient } from '@tokenisation/core';

const client = createApiClient({ apiKey: 'sk_test_xxx', baseUrl: 'http://localhost:3001' });

const asset = await client.assets.create({
  name: 'Marina Heights Unit 2501',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
});

const token = await client.tokens.create({
  name: 'MHT', symbol: 'MHT', chainId: 8453, assetId: asset.id,
});
```

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

- [Architecture Overview](docs/architecture/OVERVIEW.md)
- [Installation Guide](docs/getting-started/INSTALLATION.md)
- [Quick Start Guide](docs/getting-started/QUICKSTART.md)
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
