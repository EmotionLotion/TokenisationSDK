# @tokenisation/sdk

> The Stripe of Real-World Asset Tokenization

A TypeScript SDK for building tokenized asset applications with built-in compliance, multi-chain support, and lifecycle management.

## Features

- **27 API Modules** — Assets, tokens, transfers, investors, compliance, governance, escrow, and more
- **Compliance Engine** — KYC, accreditation, jurisdiction rules, sanctions screening, signed DecisionReceipts
- **Lifecycle Management** — State machine for asset lifecycle (Draft → Active → Redeemed)
- **Multi-Chain** — Deploy to Ethereum, Polygon, Base, Arbitrum, Optimism + testnets
- **13 Asset Packs** — Pre-built templates for real estate, airlines, hotels, car rental, concerts, securities
- **Plugin Architecture** — Swap compliance, storage, oracle, wallet, and chain plugins
- **Pre-built Components** — Drop-in React components for tokenization apps
- **Audit Trail** — Complete event history with cryptographic integrity

## Installation

```bash
pnpm add @tokenisation/sdk
```

## Quick Start

### API Client (Server-side)

```typescript
import { createApiClient } from '@tokenisation/sdk';

const client = createApiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'sk_live_xxx',
});

// Create asset
const asset = await client.assets.create({
  name: 'Marina Heights',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
});

// Onboard investor
const investor = await client.investors.create({
  email: 'investor@example.com',
  jurisdiction: 'US',
});

// Create and deploy token
const token = await client.tokens.create({
  name: 'MHT', symbol: 'MHT', chainId: 8453, assetId: asset.id,
});
await client.tokens.deploy(token.id);

// Issue tokens
await client.tokens.issue(token.id, {
  investorId: investor.id,
  amount: '1000',
  idempotencyKey: 'issue-001',
});
```

### SDK Core (Client-side)

```typescript
import { TokenisationSDK, RightType, PartyType, PartyRole } from '@tokenisation/sdk';

const sdk = new TokenisationSDK({ useMockPlugins: true });

const issuer = sdk.parties_.create({
  name: 'Property Corp',
  type: PartyType.ORGANIZATION,
  roles: [PartyRole.ISSUER],
  jurisdiction: 'US',
});
sdk.parties_.setKyc(issuer.id, true);

const asset = await sdk.assets.create({
  name: 'Manhattan Office Building',
  rightType: RightType.OWNERSHIP,
  issuerId: issuer.id,
  jurisdiction: { countryCode: 'US' },
});

await sdk.assets.verify(asset.id, issuer.id);
await sdk.assets.activate(asset.id, issuer.id);
await sdk.tokens.mint(asset.id, investor.id, '1000');
```

## API Client Modules

```typescript
const client = createApiClient({ apiKey: 'sk_live_xxx' });

client.assets         // Asset CRUD, transitions
client.tokens         // Create, deploy, issue, mint, burn, pause, freeze
client.investors      // Onboarding, KYC, wallets
client.transfers      // Compliant transfers (idempotent)
client.compliance     // Policy engine, receipts
client.projects       // Project management
client.webhooks       // Event delivery
client.governance     // Proposals, voting
client.escrow         // Multi-party escrow
client.cashFlow       // Distribution scheduling
client.audit          // Audit trail
client.events         // Event bus
client.tickets        // Airline/concert tickets
client.dld            // Dubai Land Department
client.offerings      // Token offerings
client.redemption     // Token redemption
client.vesting        // Vesting schedules
client.resale         // Secondary market
client.legal          // Legal document management
client.regulatory     // Regulatory reports
```

## Asset Packs

Pre-built templates with lifecycle state machines and compliance rules:

| Pack | File | Description |
|------|------|-------------|
| UAE Real Estate | `UAERealEstate.ts` | Dubai property tokenization with DLD integration |
| Dubai Real Estate | `dubai-real-estate.pack.ts` | Full VARA compliance pack |
| US Securities | `us-securities.pack.ts` | SEC/FINRA compliant securities |
| Airline Tickets | `AirlineTicket.ts` | Ticket lifecycle with boarding pass |
| Hotel Reservations | `HotelReservation.ts` | Reservation management |
| Car Rental | `CarRental.ts` | Rental lifecycle |
| Concert Tickets | `ConcertTicket.ts` | Event ticket management |
| Event Tickets | `EventTicket.ts` | Generic event tickets |
| Loyalty Points | `LoyaltyPoints.ts` | Points program |
| Carbon Credits | `VerificationCredential.ts` | Carbon credit verification |
| Physical Assets | `PhysicalAsset.ts` | Physical asset tracking |
| Warehouse Receipts | `WarehouseReceipt.ts` | Commodity warehousing |
| Behavior Scores | `BehaviorScore.ts` | Reputation scoring |

Each pack includes a state machine (`*StateMachine.ts`) for lifecycle transitions.

## Pre-built React Components

Drop-in React components for tokenization apps. Similar to Stripe Elements.

### TokenizeButton
```tsx
import { TokenizeButton } from '@tokenisation/sdk';

<TokenizeButton
  sdk={sdk}
  issuerId={issuer.id}
  onSuccess={(asset) => console.log('Created:', asset)}
  variant="primary"
  size="lg"
/>
```

### AssetWizard
```tsx
import { AssetWizard } from '@tokenisation/sdk';

<AssetWizard
  sdk={sdk}
  issuerId={issuer.id}
  onSuccess={(asset) => console.log('Created:', asset)}
  onClose={() => setShowWizard(false)}
/>
```

### Vertical Components

Industry-specific components in `components/verticals/`:

- **Airline:** `BoardingPass`, `FlightSelector`, `SeatPicker`
- **Hotel:** `RoomSelector`, `RentalCalendar`, `PropertyMap`
- **Car Rental:** `VehiclePicker`, `RentalCalendar`
- **Concert:** `SeatSelectionMap`, `VenueMap`

### Theming

All components support custom theming:

```tsx
import { TokenizeButton, type TokenisationTheme } from '@tokenisation/sdk';

const theme: TokenisationTheme = {
  colors: { primary: '#00D4FF', background: '#0A0A0A', text: '#FFFFFF' },
  fonts: { family: 'Inter, system-ui, sans-serif' },
  borderRadius: { sm: '4px', md: '8px', lg: '12px' },
};

<TokenizeButton sdk={sdk} issuerId={id} theme={theme} />
```

## Plugins

### Wallet Plugins
- MetaMask, WalletConnect v2, SIWE authentication

### Chainlink Integration
- Price Feeds, Automation (Keepers), Functions, CCIP bridge, Proof of Reserve

### Storage Plugins
- IPFS, S3

### Compliance Plugins
- Jurisdiction rules (UAE_VARA, US_SEC, EU_MiFID, etc.)
- KYC verification (Sumsub, Onfido, Jumio)
- Sanctions screening

### Plugin Registry

```typescript
import { PluginRegistry } from '@tokenisation/sdk';

const registry = new PluginRegistry();
registry.register('wallet', myWalletPlugin);
registry.register('storage', myStoragePlugin);
```

## Contract Deployment

```typescript
import { createDeploymentService } from '@tokenisation/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const deployer = createDeploymentService({
  chain: 'sepolia',
  account: privateKeyToAccount(`0x${process.env.PRIVATE_KEY}`),
});

const { contracts } = await deployer.deployInfrastructure();
const token = await deployer.deployToken({
  name: 'Marina Tower Shares',
  symbol: 'MTS',
  identityRegistryAddress: contracts.identityRegistry,
});
```

### Supported Chains

| Chain | ID | Testnet |
|-------|-----|---------|
| Ethereum | 1 | Sepolia (11155111) |
| Polygon | 137 | — |
| Base | 8453 | Base Sepolia (84532) |
| Arbitrum | 42161 | Arbitrum Sepolia (421614) |
| Optimism | 10 | — |

## Contract ABIs

```typescript
import { abis, ComplianceTokenAbi, IdentityRegistryAbi } from '@tokenisation/sdk';
import { getContract } from 'viem';

const token = getContract({
  address: '0x...',
  abi: ComplianceTokenAbi,
  client: publicClient,
});
```

## Production Mode

```typescript
const sdk = new TokenisationSDK({
  useMockPlugins: false,
  production: {
    apiEndpoint: 'https://api.tokenisation.io',
    apiKey: 'your-api-key',
    jurisdiction: { defaultAllow: false, failClosed: true },
    kyc: { defaultRequiredLevel: 2, requireKycForTransfers: true },
  },
  chain: {
    chainId: 137,
    rpcUrl: 'https://polygon-rpc.com',
    privateKey: process.env.DEPLOYER_PRIVATE_KEY,
  },
});
```

## License

MIT
