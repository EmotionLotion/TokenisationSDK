# AHOY Real Estate Platform

A reference implementation of a real estate tokenisation platform built on the AHOY Tokenisation SDK. This app demonstrates how to build a full-featured property investment platform with tokenised assets, compliance-gated transfers, secondary market trading, and dividend distributions.

## Features

### Public Marketplace
- **Browse Properties** — Grid view of tokenised Dubai properties with filtering by type and status
- **Property Detail** — 8-tab detail view: Overview, Financials, Documents, Cap Table, Secondary Market, SPV Structure, Audit Trail, Location

### Investor Portal
- **KYC Onboarding** — 4-step wizard: Personal Info → Identity Verification → Accreditation → Approval
- **Investment Flow** — Compliance pre-check → Tier validation → Amount selection → Payment → Confirmation
- **Portfolio Dashboard** — Holdings table with P&L, summary stats, monthly performance
- **Statements** — Distribution history and audit log export
- **Investment Cart** — Multi-property cart with batch checkout

### Admin Dashboard
- **Dashboard** — KPI cards and portfolio overview
- **Onboard Property** — 4-phase, 16-step property onboarding wizard (compliance → DLD → tokenisation → distribution)
- **Compliance Panel** — KYC queue, whitelist/denylist, jurisdiction management
- **Dividend Manager** — Distribution scheduling and execution
- **Listing Manager** — Property listing lifecycle management
- **Approvals** — Transfer and investment approval queue
- **Exit Windows** — Periodic redemption window scheduling
- **Investor Tiers** — Tier plan configuration
- **Secondary Market** — Admin view of P2P trading activity

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Routing | React Router v7 |
| Styling | Tailwind CSS (dark glassmorphism theme) |
| State | Zustand (auth, cart), React Query (cache) |
| Animation | Framer Motion |
| Icons | Lucide React |
| SDK | `@tokenisation/sdk`, `@tokenisation/sdk-react`, `@tokenisation/ui-kit` |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- AHOY API server running on port 3001

### 1. Start the API Server

From the monorepo root:

```bash
cd server
cp .env.example .env   # Configure environment variables
pnpm dev               # Starts on http://localhost:3001
```

### 2. Build SDK Packages

The app depends on compiled dist files from the SDK packages:

```bash
# From the monorepo root
cd sdk && npx tsc && cd ..
cd sdk-react && npx tsc && cd ..
cd ui-kit && npx tsc && cd ..
```

### 3. Start the App

```bash
cd apps/real-estate
pnpm dev
```

Open http://localhost:5174

### Environment Variables

Create a `.env` file in `apps/real-estate/`:

```bash
# API connection (proxied through Vite — no CORS issues)
VITE_API_URL=/api

# SDK authentication
VITE_PUBLISHABLE_KEY=pk_test_your_key
VITE_API_KEY=ak_test_your_key

# Debug mode (enables console logging)
VITE_DEBUG=true
```

The Vite dev server proxies `/api` requests to `http://localhost:3001`, so you don't need to configure CORS for local development.

## Project Structure

```
apps/real-estate/
├── index.html                    # Entry HTML with Google Fonts
├── vite.config.ts                # Vite config with SDK aliases and server-dep stubs
├── tailwind.config.js            # Dark theme with gold/indigo/green palette
├── package.json
│
└── src/
    ├── main.tsx                  # App entry — TokenisationProvider + QueryClient + Router
    ├── App.tsx                   # Minimal shell (just <Outlet />)
    ├── routes.tsx                # Three route groups with nested layouts
    ├── index.css                 # Tailwind imports + global styles
    │
    ├── layouts/
    │   ├── MarketplaceLayout.tsx  # Public header + footer
    │   ├── InvestorLayout.tsx     # Left sidebar + AuthGate
    │   └── AdminLayout.tsx        # Left sidebar + AuthGate
    │
    ├── pages/
    │   ├── marketplace/
    │   │   ├── BrowseProperties.tsx   # Property grid with filters
    │   │   └── PropertyDetail.tsx     # 8-tab property detail view
    │   ├── investor/
    │   │   ├── Onboarding.tsx         # 4-step KYC wizard
    │   │   ├── InvestFlow.tsx         # Investment flow with compliance
    │   │   ├── Portfolio.tsx          # Holdings dashboard
    │   │   ├── Statements.tsx         # Distribution history
    │   │   └── CartCheckout.tsx       # Multi-property checkout
    │   └── admin/
    │       ├── Dashboard.tsx          # KPI overview
    │       ├── OnboardProperty.tsx    # 16-step onboarding wizard
    │       ├── CompliancePanel.tsx    # KYC + whitelist management
    │       ├── DividendManager.tsx    # Distribution management
    │       ├── ListingManager.tsx     # Property listing management
    │       ├── Approvals.tsx          # Transfer approval queue
    │       ├── ExitWindowManager.tsx  # Exit window scheduling
    │       ├── InvestorTierManager.tsx # Tier configuration
    │       └── SecondaryMarketOverview.tsx # P2P trading admin
    │
    ├── components/
    │   ├── AddToCartButton.tsx    # Cart popover with amount input
    │   ├── AnimatedTabContent.tsx # Framer Motion tab transitions
    │   ├── AuditTimeline.tsx      # Chronological event trail
    │   ├── AuthGate.tsx           # Wallet connection gate
    │   ├── CapTableView.tsx       # Token holder table + chart
    │   ├── ConnectWalletButton.tsx # Demo wallet connect/disconnect
    │   ├── DocumentViewer.tsx     # Document vault with IPFS/S3 badges
    │   ├── NAVHistory.tsx         # Quarterly NAV chart
    │   ├── PropertyMap.tsx        # Location map with pin
    │   ├── RentalYieldChart.tsx   # Yield visualization
    │   ├── SecondaryMarket.tsx    # P2P listings + exit windows
    │   └── SPVDetails.tsx         # SPV structure visualization
    │
    ├── hooks/
    │   ├── useSDKWithFallback.ts  # Graceful SDK degradation pattern
    │   └── useInvestmentCart.ts   # Zustand cart store
    │
    ├── stores/
    │   └── authStore.ts           # Zustand auth state (demo wallet)
    │
    ├── data/
    │   └── dubai-properties.ts    # Mock data + TypeScript types
    │
    └── utils/
        └── mappers.ts             # SDK Asset ↔ DubaiProperty mapping
```

## SDK Integration

### Provider Configuration

The app wraps the entire component tree with `TokenisationProvider` from `@tokenisation/sdk-react`:

```tsx
<TokenisationProvider
  config={{
    apiUrl: '/api',
    publishableKey: 'pk_test_xxx',
    apiKey: 'ak_test_xxx',
    defaultJurisdiction: 'AE',
    debug: true,
  }}
>
```

### SDK Hooks Used

| Hook | Used In | Purpose |
|------|---------|---------|
| `useAsset` | BrowseProperties, PropertyDetail, Dashboard, OnboardProperty, ListingManager | List/get/create/transition assets |
| `useInvestor` | Portfolio, Onboarding, Dashboard, CompliancePanel | Create/list/approve/suspend investors |
| `useKYC` | Onboarding, CompliancePanel | Initiate KYC verification |
| `useCompliance` | InvestFlow, OnboardProperty, CompliancePanel, Approvals | Pre-flight compliance checks, receipts |
| `useTransfer` | InvestFlow, Approvals | Create/approve transfers |
| `useTokens` | OnboardProperty | Mint tokens to investors |
| `useDLD` | OnboardProperty | Register DLD title deeds |
| `useInvestorTier` | InvestFlow | Tier eligibility and limits |
| `useCashFlow` | Portfolio, Statements, RentalYieldChart, NAVHistory, DividendManager | Distribution history |
| `useSecondaryMarket` | SecondaryMarket | P2P listings and purchases |
| `useExitWindow` | SecondaryMarket | Redemption window status |
| `useCapTable` | CapTableView | Token holder breakdown |
| `useAuditLog` | AuditTimeline, Statements | Event history |

### UI-Kit Components Used

| Component | Used In |
|-----------|---------|
| `StatusBadge` | BrowseProperties, PropertyDetail, Dashboard |
| `ComplianceStepper` | Onboarding |
| `ExportButton` | Statements |

### Graceful Fallback Pattern

Every data fetch uses `useSDKWithFallback` — the app works with or without a live API:

```tsx
const { data: properties, isLive } = useSDKWithFallback(
  async () => listAssets().then(assets => assets.map(assetToDubaiProperty)),
  DUBAI_PROPERTIES,  // Rich mock data shown when API is unavailable
);

// isLive === true  → data from SDK/API (green "Live" badge shown)
// isLive === false → mock data (app still fully functional)
```

This means you can explore the full UI without any backend running.

## Vite Configuration

The app requires special Vite configuration to handle SDK dependencies:

### Server-Only Dependency Stubs

The SDK includes modules that reference server-side packages (AWS SDK, MongoDB, Node built-ins). These are stubbed out at build time:

```ts
const serverOnlyDeps = [
  '@aws-sdk/client-secrets-manager',
  'mongodb',
  'node:module',
  'node:fs',
  'node:path',
  'node:crypto',
]
```

A custom Vite plugin intercepts these imports and returns empty modules.

### Node Polyfills

The SDK uses Node.js APIs (`crypto`, `buffer`, `events`, etc.) that need browser polyfills:

```ts
nodePolyfills({
  include: ['crypto', 'buffer', 'stream', 'util', 'process', 'events'],
})
```

### Workspace Aliases

When running within the monorepo, path aliases resolve SDK packages from their dist folders:

```ts
resolve: {
  alias: {
    '@tokenisation/ui-kit': path.resolve(__dirname, '../../ui-kit/dist/index.js'),
    '@tokenisation/sdk-react': path.resolve(__dirname, '../../sdk-react/dist/index.js'),
    '@tokenisation/sdk': path.resolve(__dirname, '../../sdk/dist/index.js'),
  },
},
```

## Design System

The app uses a dark glassmorphism theme:

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#0B0E14` | Page background |
| `surface` | `rgba(30,41,59,0.4)` | Card backgrounds |
| `primary` | `#F8B032` | Accent gold — CTAs, highlights |
| `secondary` | `#6366f1` | Indigo — secondary actions |
| `accent` | `#22c55e` | Green — positive values, success |
| `glass-border` | `rgba(255,255,255,0.08)` | Subtle borders |

Typography: Inter (body), Lexend Deca (headings), JetBrains Mono (numbers/code).

Glass panel pattern: `bg-white/5 border border-glass-border rounded-xl`.

## Extending the App

### Adding a New Property Page Section

1. Create a component in `src/components/`
2. Import the relevant SDK hook (e.g., `usePropertyManagement`)
3. Use `useSDKWithFallback` for graceful degradation
4. Add as a new tab in `PropertyDetail.tsx`

### Adding a New Admin Page

1. Create a page in `src/pages/admin/`
2. Add the route to `routes.tsx` under the admin group
3. Add the nav item to `AdminLayout.tsx`

### Adding Real Wallet Connectivity

Replace the demo `authStore.ts` with real wallet connection:

```tsx
import { useWallet } from '@tokenisation/sdk-react';

function ConnectButton() {
  const { connect, disconnect, address, isConnected } = useWallet();
  // Real MetaMask / WalletConnect integration
}
```

### Connecting to a Different Chain

Update the provider config:

```tsx
<TokenisationProvider
  config={{
    apiUrl: '/api',
    networks: [
      { chainId: 137, name: 'Polygon', rpcUrl: 'https://polygon-rpc.com', isDefault: true },
      { chainId: 1, name: 'Ethereum', rpcUrl: 'https://eth-mainnet.alchemyapi.io/v2/...' },
    ],
  }}
>
```

## Troubleshooting

### Blank White Page

1. Check browser console for errors
2. Common causes:
   - SDK dist files not built (`cd sdk && npx tsc`)
   - Missing node polyfills (check `vite.config.ts`)
   - Circular dependency in SDK (check for `Cannot access X before initialization`)

### CORS Errors

The Vite proxy should handle CORS. If you see CORS errors:
1. Verify the proxy config in `vite.config.ts`
2. Check `CORS_ORIGIN` in `server/.env` includes your port
3. Restart both the Vite dev server and the API server

### "Module externalized for browser compatibility"

Add the module to the `serverOnlyDeps` array in `vite.config.ts` and to the `nodePolyfills` include list.

## Related Documentation

- [React Integration Guide](../../docs/guides/REACT_INTEGRATION.md) — Full SDK-React hook and component reference
- [Building a Real Estate App](../../docs/guides/BUILDING_REAL_ESTATE_APP.md) — Step-by-step tutorial
- [Real Estate Tokenisation Guide](../../docs/guides/REAL_ESTATE.md) — Backend API workflow
- [Architecture](../../docs/ARCHITECTURE.md) — Full platform architecture
