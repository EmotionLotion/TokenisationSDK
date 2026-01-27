# Sandbox Seeding Tools

CLI tools for populating the TokenisationSDK sandbox environment with test data.

## Overview

The seed tools help you quickly populate a development or sandbox environment with realistic test data for:

- **Airline Demo**: Flights, passengers, and tokenized tickets
- **Real Estate Demo**: Properties, investors, and fractional ownership tokens
- **Common Data**: Investors, jurisdictions, and compliance policies

## Installation

```bash
cd sdk/tools/seed
npm install
```

## Usage

### Quick Start

```bash
# Preview what will be seeded (no API key needed)
npx ts-node index.ts --all --dry-run

# Seed everything
TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --all

# Seed specific demo data
TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --airline
TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --realestate
```

### Options

| Option | Description |
|--------|-------------|
| `--all` | Seed all fixtures |
| `--airline` | Seed airline demo data only |
| `--realestate` | Seed real estate demo data only |
| `--investors` | Seed common investor data only |
| `--clean` | Remove existing seed data before seeding |
| `--dry-run` | Preview what would be seeded without making changes |
| `--help` | Show help message |

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TOKENISATION_API_KEY` | Yes* | - | API key for authentication |
| `TOKENISATION_API_URL` | No | `http://localhost:3001` | API base URL |
| `PROJECT_ID` | No | `proj_seed_demo` | Project ID for assets |

*Not required when using `--dry-run`

## Fixtures

### Common (`fixtures/common.ts`)

Shared test data used across demos:

```typescript
import { INVESTORS, JURISDICTIONS, COMPLIANCE_POLICIES } from './fixtures/common.js';
```

**INVESTORS** - 4 sample investors:
- Individual accredited (US)
- Individual professional (AE)
- Institutional (GB)
- Retail (US)

**JURISDICTIONS** - Supported regions:
- Dubai (AE)
- United States (US)
- United Kingdom (GB)
- Singapore (SG)

**COMPLIANCE_POLICIES** - Sample compliance rules

### Airline (`fixtures/airline.ts`)

Test data for airline ticket tokenization:

```typescript
import { AIRLINES, AIRPORTS, FLIGHTS, PASSENGERS, SAMPLE_TICKETS } from './fixtures/airline.js';
```

**AIRLINES** - 2 sample carriers
**AIRPORTS** - 5 major airports (DXB, LHR, JFK, SIN, HKG)
**FLIGHTS** - 3 sample flights with multi-class pricing
**PASSENGERS** - 3 sample passengers with wallets
**SAMPLE_TICKETS** - Pre-configured ticket assignments

### Real Estate (`fixtures/realestate.ts`)

Test data for property tokenization:

```typescript
import {
  PROPERTIES,
  PROPERTY_INVESTORS,
  DISTRIBUTIONS,
  TOKEN_CONFIGS,
  LOCATIONS,
} from './fixtures/realestate.js';
```

**PROPERTIES** - 4 sample properties:
- Marina Heights Tower (Dubai, residential)
- Boulevard Business Center (Dubai, commercial)
- Thames Riverside Apartments (London, residential)
- Raffles Commerce Hub (Singapore, commercial)

**TOKEN_CONFIGS** - ERC-3643 token configurations for each property
**DISTRIBUTIONS** - Sample rental income distributions

## Examples

### Seed for Development

```bash
# Start fresh with all demo data
TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --clean --all
```

### Seed for Testing

```bash
# Just seed investors for integration tests
TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --investors
```

### Preview Changes

```bash
# See what airline seeding would create
npx ts-node index.ts --airline --dry-run
```

## Extending

### Adding New Fixtures

1. Create a new file in `fixtures/`:

```typescript
// fixtures/custom.ts
export const CUSTOM_DATA = [
  { id: 'custom_001', name: 'Example' },
];
```

2. Import and use in `index.ts`:

```typescript
import { CUSTOM_DATA } from './fixtures/custom.js';

async function seedCustomData(client: SeedClient): Promise<void> {
  console.log('\n🔧 Seeding Custom Data...');
  for (const item of CUSTOM_DATA) {
    await client.createAsset(item);
  }
}
```

3. Add CLI flag:

```typescript
if (seedAll || args.includes('--custom')) {
  await seedCustomData(client);
}
```

## Troubleshooting

### Authentication Errors

Make sure your API key is valid:
```bash
curl -H "Authorization: Bearer $TOKENISATION_API_KEY" http://localhost:3001/health
```

### Connection Refused

Ensure the API server is running:
```bash
cd server && npm run dev
```

### Duplicate Data

Use `--clean` to remove existing seed data:
```bash
TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --clean --all
```
