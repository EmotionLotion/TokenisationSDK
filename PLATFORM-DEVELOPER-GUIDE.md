# Platform Developer Guide — Real Estate Reference App

Welcome to the Tokenisation SDK. This guide is for you — the platform developer building the reference real estate app. You don't need to understand the SDK internals. You just need to know how to use it.

---

## What is this project?

A tokenisation platform (think "Stripe for real-world assets"). We're building a reference app that lets:

- **Investors** browse Dubai properties, complete KYC, buy/sell property tokens, receive rent dividends
- **Issuers/Admins** list properties, manage compliance, distribute dividends, approve investors

The SDK handles all the hard parts (blockchain, compliance, KYC, token lifecycle). Your job is to make it look great and work end-to-end.

---

## Architecture — what's already built

```
┌─────────────────────────────────────────────────────┐
│  YOUR WORK: apps/real-estate/                       │
│  React app (Vite + TailwindCSS + TanStack Query)    │
│  13 pages already scaffolded, 8 components built    │
├─────────────────────────────────────────────────────┤
│  SDK LAYER (you consume, don't modify)              │
│  @tokenisation/sdk-react  — React hooks (30 hooks)  │
│  @tokenisation/ui-kit     — Pre-built components    │
├─────────────────────────────────────────────────────┤
│  SERVER: server/                                    │
│  Express API, 60+ routes, runs on localhost:3001    │
├─────────────────────────────────────────────────────┤
│  INFRA: docker-compose.yml                          │
│  PostgreSQL + Redis + Anvil chain + contract deploy │
└─────────────────────────────────────────────────────┘
```

You primarily work in `apps/real-estate/`. The server and SDK are maintained separately.

---

## Quick start — get it running in 5 minutes

### Prerequisites

- Node.js >= 18
- pnpm >= 9.15.0 (`npm install -g pnpm@9.15.0`)
- Docker + Docker Compose

### Step 1: Install everything

```bash
cd TokenisationSDK
pnpm install
```

### Step 2: Start the backend stack

```bash
docker-compose up -d
```

This starts:
- **Anvil** (local blockchain) on `localhost:8545`
- **PostgreSQL** on `localhost:5432`
- **Redis** on `localhost:6379`
- **API server** on `localhost:3001`
- **Contract deployer** (runs once, deploys ERC-3643 contracts to local chain)

Wait for everything to be healthy:

```bash
docker-compose ps          # All should show "healthy"
curl http://localhost:3001/health   # Should return { "status": "ok" }
```

**Alternative — lightweight mode (no Docker):**

```bash
cd server
cp .env.example .env
# .env defaults are fine: DB_MODE=sqlite, AUTH_DEV_MODE=true
pnpm dev
```

This runs the server with SQLite (no PostgreSQL/Redis needed) and auth bypass enabled. Good enough for UI development.

### Step 3: Start the real estate app

```bash
cd apps/real-estate
pnpm dev
```

Opens at `http://localhost:5173`. The app already has mock fallback data so it renders even if the server is down.

### Step 4: Verify

- Browse `http://localhost:5173` — you should see property listings
- Browse `http://localhost:3001/api/docs` — Swagger UI for the full API
- Check `http://localhost:5173/admin` — admin dashboard
- Check `http://localhost:5173/investor` — investor portal

---

## Project structure — where your code lives

```
apps/real-estate/
├── src/
│   ├── main.tsx                    # App entry — TokenisationProvider is already wired
│   ├── routes.tsx                  # All routes defined
│   ├── index.css                   # Tailwind base
│   │
│   ├── pages/
│   │   ├── marketplace/
│   │   │   ├── BrowseProperties.tsx    # Property grid — public landing page
│   │   │   └── PropertyDetail.tsx      # Single property view + invest CTA
│   │   ├── investor/
│   │   │   ├── Onboarding.tsx          # KYC + wallet connect flow
│   │   │   ├── InvestFlow.tsx          # Token purchase wizard
│   │   │   ├── Portfolio.tsx           # Holdings + distributions
│   │   │   └── Statements.tsx          # Transaction history
│   │   └── admin/
│   │       ├── Dashboard.tsx           # Overview metrics
│   │       ├── OnboardProperty.tsx     # Create new property asset
│   │       ├── CompliancePanel.tsx     # Compliance rules + decisions
│   │       ├── DividendManager.tsx     # Schedule rent distributions
│   │       ├── ListingManager.tsx      # Manage property listings
│   │       └── Approvals.tsx           # Approve investors + transfers
│   │
│   ├── components/                 # Reusable domain components
│   │   ├── AuditTimeline.tsx
│   │   ├── CapTableView.tsx
│   │   ├── DocumentViewer.tsx
│   │   ├── NAVHistory.tsx
│   │   ├── PropertyMap.tsx
│   │   ├── RentalYieldChart.tsx
│   │   ├── SecondaryMarket.tsx
│   │   └── SPVDetails.tsx
│   │
│   ├── layouts/                    # Page shells (nav, sidebar, etc.)
│   │   ├── MarketplaceLayout.tsx
│   │   ├── InvestorLayout.tsx
│   │   └── AdminLayout.tsx
│   │
│   ├── hooks/
│   │   └── useSDKWithFallback.ts   # Tries SDK, falls back to mock data
│   │
│   └── data/
│       └── dubai-properties.ts     # Static mock property data for fallback
│
├── .env.development                # Already configured for localhost
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## How to use the SDK — the 2 options

The app already uses **Option A** (`sdk-react` hooks). You can also use **Option B** (`ui-kit` drop-in components) for faster development. Both work, and you can mix them.

### Option A: SDK React hooks (already wired in main.tsx)

The `<TokenisationProvider>` is already set up. In any component, just import hooks:

```tsx
import { useAsset, useKYC, useTokens, useCompliance } from '@tokenisation/sdk-react';

function MyComponent() {
  const { createAsset, listAssets, transitionAsset, loading } = useAsset();
  const { initiateKYC, kycStatus } = useKYC();
  const { data: assets } = useSDKWithFallback(
    () => listAssets({ jurisdiction: 'AE' }),
    mockProperties  // fallback if server is down
  );
  // ...
}
```

**Available hooks for real estate:**

| Hook | What it does |
|------|-------------|
| `useAsset()` | Create, list, update, transition property assets |
| `useTokens()` | Mint, transfer, burn tokens; get balances and cap table |
| `useKYC()` | Start KYC verification, check status, sanctions screening |
| `useWallet()` | Connect/disconnect MetaMask, sign messages, send transactions |
| `useCompliance()` | Check if a transfer/mint is allowed before executing |
| `useDLD()` | Dubai Land Department: register titles, verify deeds, sync events |
| `useTransfer()` | Create compliant token transfers with preflight checks |
| `useCashFlow()` | Create distribution schedules, execute payouts, view history |
| `useGovernance()` | Create proposals, cast votes, check voting power |
| `useEscrow()` | Create/fund/release escrow for property transactions |
| `useCapTable()` | View token holder breakdown by investor |
| `useAuditLog()` | View tamper-evident audit trail |
| `useInvestor()` | Manage investor records, onboarding, accreditation |

### Option B: UI-Kit drop-in components

For pages where you want pre-built UI, import from `@tokenisation/ui-kit`:

```tsx
import {
  PropertyCard,
  KYCModal,
  InvestButton,
  CapTable,
  SPVOverview,
  ComplianceStepper,
  WalletConnectModal,
  RedemptionWindow,
  TransactionHistory,
  PortfolioDashboard,
} from '@tokenisation/ui-kit';

// Example: property listing page
function PropertyGrid({ properties }) {
  return properties.map(p => (
    <PropertyCard
      key={p.id}
      name={p.name}
      location={p.location}
      price={p.price}
      currency="AED"
      yield={p.annualYield}
      area={p.areaSqft}
      occupancy={p.occupancy}
      tokenized={p.isTokenized}
      onClick={() => navigate(`/property/${p.id}`)}
    />
  ));
}

// Example: investor onboarding
function OnboardingPage() {
  return (
    <>
      <ComplianceStepper steps={['KYC', 'Wallet', 'Accreditation', 'Ready']} current={0} />
      <KYCModal onComplete={() => goToNextStep()} />
      <WalletConnectModal onConnect={(addr) => saveWallet(addr)} />
    </>
  );
}
```

**Note:** ui-kit components require Tailwind CSS in your app (already configured in `apps/real-estate`).

---

## The real estate lifecycle — what the demo should show

This is the end-to-end flow the reference app needs to demonstrate:

### Flow 1: Investor journey (public-facing)

```
Browse Properties → View Property Detail → Connect Wallet → Complete KYC
→ Check Compliance → Buy Tokens → View Portfolio → Receive Dividends
```

| Step | Page | SDK hooks/components to use |
|------|------|---------------------------|
| Browse | `/` | `useAsset().listAssets()` or `<PropertyCard>` |
| Detail | `/property/:id` | `useAsset().getAsset(id)`, `<SPVOverview>`, `<CapTableView>` |
| Wallet | `/investor/onboarding` | `useWallet().connectWallet()` or `<WalletConnectModal>` |
| KYC | `/investor/onboarding` | `useKYC().initiateKYC()` or `<KYCModal>` |
| Buy | `/investor/invest/:id` | `useCompliance().checkMint()` then `useTokens().mint()` or `<InvestButton>` |
| Portfolio | `/investor/portfolio` | `useTokens().getBalance()`, `useCashFlow()` or `<PortfolioDashboard>` |
| Dividends | `/investor/statements` | `useCashFlow().getPayoutHistory()` or `<TransactionHistory>` |

### Flow 2: Admin/Issuer journey

```
Onboard Property → Upload Documents → Submit for Verification → Activate
→ Manage Investors → Distribute Rent → Monitor Compliance
```

| Step | Page | SDK hooks to use |
|------|------|-----------------|
| Create asset | `/admin/onboard` | `useAsset().createAsset({ rightType: 'OWNERSHIP', jurisdiction: 'AE', ... })` |
| Upload docs | `/admin/onboard` | `useAsset().uploadDocument()` |
| Activate | `/admin/onboard` | `useAsset().transitionAsset(id, 'PENDING_VERIFICATION')` then `'VERIFIED'` then `'ACTIVE'` |
| DLD verify | `/admin/onboard` | `useDLD().registerTitle()`, `useDLD().verifyTitle()` |
| Investors | `/admin/approvals` | `useInvestor().listInvestors()`, `useKYC()` |
| Dividends | `/admin/dividends` | `useCashFlow().createSchedule()`, `useCashFlow().executeDistribution()` |
| Compliance | `/admin/compliance` | `useCompliance().checkTransfer()`, `useAuditLog()` |

---

## Auth — how it works (dev mode)

For local development, the server runs with `AUTH_DEV_MODE=true`. This means:

- **No real wallet or JWT needed** — you can bypass auth with a header:
  ```
  x-dev-party-id: party_test_investor_1
  ```
- The SDK hooks handle this automatically when the server is in dev mode

For the real SIWE (Sign-In with Ethereum) flow later:
1. User connects MetaMask via `useWallet().connectWallet()`
2. User signs a message (SIWE standard)
3. SDK sends signature to `POST /api/v1/auth/siwe/verify`
4. Server returns JWT — SDK stores it and attaches to all future requests

You don't need to implement any of this — the SDK handles it. Just call `connectWallet()`.

---

## The mock fallback pattern

The app has a `useSDKWithFallback` hook that tries the real SDK first and falls back to static mock data. Use this pattern so the app always renders, even when the server is down:

```tsx
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';
import { useAsset } from '@tokenisation/sdk-react';
import { dubaiProperties } from '../data/dubai-properties';

function BrowseProperties() {
  const { listAssets } = useAsset();

  const { data: properties, loading, isLive } = useSDKWithFallback(
    () => listAssets({ jurisdiction: 'AE' }),
    dubaiProperties,  // static mock data
  );

  return (
    <>
      {!isLive && <Banner>Using demo data — server not connected</Banner>}
      {properties.map(p => <PropertyCard key={p.id} {...p} />)}
    </>
  );
}
```

The `isLive` flag tells you whether data is real or mock — useful for showing a banner.

---

## Environment variables

Your app's env is at `apps/real-estate/.env.development` (already configured):

```env
VITE_API_URL=http://localhost:3001
VITE_PUBLISHABLE_KEY=pk_test_real_estate_demo
VITE_DEBUG=true
```

You should not need to change these for local development.

---

## Key data types you'll work with

### Property / Asset

```typescript
{
  id: string;
  name: string;                          // "Dubai Marina Tower A"
  description: string;
  state: 'DRAFT' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'ACTIVE' | 'FROZEN' | 'REDEEMED';
  rightType: 'OWNERSHIP';
  jurisdiction: 'AE';
  metadata: {
    titleDeedNumber: string;             // DLD deed number
    propertyId: string;
    area: string;                        // "Dubai Marina"
    areaSqft: number;
    developer: string;
    valuationAmount: string;             // In AED
    mintPrice: string;                   // Per token, in AED
    annualYield: number;                 // e.g. 7.2
    occupancy: number;                   // e.g. 95
  };
  totalSupply: string;                   // Total tokens
  tokenSymbol: string;
}
```

### Investor / Party

```typescript
{
  id: string;
  type: 'INDIVIDUAL' | 'ORGANIZATION';
  role: 'INVESTOR' | 'ISSUER' | 'VERIFIER';
  jurisdiction: string;                  // ISO country code
  kycStatus: 'NOT_STARTED' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  wallets: Array<{ address: string; isPrimary: boolean }>;
  accreditation: 'RETAIL' | 'QUALIFIED' | 'INSTITUTIONAL';
}
```

### Compliance decision

```typescript
{
  decision: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  reasons: string[];                     // e.g. ["JURISDICTION_BLOCKED", "KYC_EXPIRED"]
  receipt: {
    id: string;
    hash: string;                        // Tamper-evident chain
    timestamp: string;
  };
}
```

---

## Dubai-specific compliance rules (built into the SDK)

The `dubaiRealEstatePack` enforces these automatically — you don't implement them, but you should display them:

| Rule | What it does |
|------|-------------|
| VARA KYC | Enhanced KYC required, 365-day expiry |
| VARA AML/CFT | Source of funds + PEP/sanctions screening |
| VARA Jurisdiction | Allowed: AE, SA, QA, KW, BH, OM, GB, US, SG, HK, CH, DE, FR. Blocked: KP, IR, CU, SY, RU, BY, MM |
| VARA Qualified Investor | Institutional investors exempt from retail caps |
| VARA Min Investment | 1,000 AED minimum |
| VARA Max Retail Investment | 500,000 AED cap for retail investors |
| Max Holding | 10% per investor (institutional/sponsor exempt) |
| Lockup | 90-day lockup period after purchase |
| DLD Title Verification | Property must have verified DLD title deed |
| RERA Valuation | Independent valuation required |

When a compliance check returns `DENY`, display the `reasons` array to the user so they know what's blocking them.

---

## What to work on

### Priority 1 — Make the existing pages work end-to-end
The 13 pages are scaffolded. Make them functional with real SDK calls:
- `BrowseProperties` — grid of `<PropertyCard>` components
- `PropertyDetail` — full property view with invest CTA
- `Onboarding` — wallet connect + KYC wizard
- `InvestFlow` — compliance check + token mint
- `Portfolio` — token balances + distribution history

### Priority 2 — Add auth flow
- Add wallet connect to the navbar
- Gate `/investor/*` routes behind wallet connection
- Gate `/admin/*` routes behind an admin role check

### Priority 3 — Polish the admin flow
- `OnboardProperty` — form to create a new property asset
- `DividendManager` — schedule and execute rent distributions
- `CompliancePanel` — view compliance decisions and audit trail

### Priority 4 — Integration testing
- Verify the full investor journey works against the live server
- Verify compliance blocks (try investing from a blocked jurisdiction)
- Verify dividend distribution shows correct pro-rata amounts

---

## Useful commands

```bash
# Start the full stack
docker-compose up -d

# Start just the server (lightweight, no Docker)
cd server && cp .env.example .env && pnpm dev

# Start the real estate app
cd apps/real-estate && pnpm dev

# Check API health
curl http://localhost:3001/health

# View API docs
open http://localhost:3001/api/docs

# Run SDK tests (verifies the golden path works)
cd sdk && pnpm test

# Run the specific real estate E2E test
cd sdk && npx vitest run tests/re-e2e-golden.test.ts

# View server logs
docker-compose logs -f api

# Reset everything
docker-compose down -v && docker-compose up -d
```

---

## Troubleshooting

**App shows "Using demo data"**
- The server isn't running or isn't healthy. Run `curl http://localhost:3001/health`.

**`pnpm install` fails with workspace errors**
- Make sure you're running pnpm 9.15.0: `pnpm --version`
- Run from the monorepo root (`TokenisationSDK/`), not from `apps/real-estate/`

**Port 3001 already in use**
- `lsof -i :3001` to find the process, then kill it
- Or change `PORT` in `server/.env`

**Docker containers won't start**
- `docker-compose down -v` to clean up, then `docker-compose up -d`
- Check `docker-compose logs` for specific errors

**SDK hooks return errors**
- Check browser console for the actual API error
- Make sure `VITE_API_URL` in `.env.development` matches where the server is running
- In dev mode, auth errors are usually harmless — the SDK falls back to mock data

---

## Questions?

If something in the SDK doesn't work as expected, or you need an endpoint that doesn't exist, raise it with the SDK team. Don't try to work around SDK issues in the platform code — it's better to fix it at the source.
