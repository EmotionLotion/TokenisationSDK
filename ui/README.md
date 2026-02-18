# Tokenisation Admin Dashboard

React-based admin dashboard for managing tokenized assets, compliance policies, investor identities, and platform operations.

## Quick Start

```bash
pnpm install
pnpm dev
# Dashboard runs at http://localhost:5173
```

Requires the API server running at `http://localhost:3001`. See [`server/README.md`](../server/README.md).

## Tech Stack

- **React 18** + TypeScript
- **Vite** for bundling and HMR
- **Tailwind CSS** for styling
- **Zustand** for state management

## Pages

| Page | Description |
|------|-------------|
| **Ahoy Dashboard** | Main overview with platform metrics and activity |
| **Dashboard** | Asset listing with detail views and cap tables |
| **Policy Studio** | Create and manage compliance policies |
| **Identities** | Investor identity management and KYC status |
| **Transactions** | Transaction history and transfer monitoring |
| **Oracles** | Chainlink oracle feed status and configuration |
| **Payouts** | Distribution scheduling and dividend management |
| **Developers** | API keys, webhooks, and integration tools |
| **Parties** | Party management with KYC verification |
| **Demo Wizard** | Guided tokenization flow for demonstrations |
| **Institutional Demo** | Institutional-grade compliance workflow |
| **UI Kit Demo** | Component library showcase |

## Vertical Demo Apps

The dashboard includes 18 vertical-specific demo applications:

- **RealEstateApp** — Property tokenization with DLD integration
- **FlyPlusApp** / **AirlineApp** — Airline ticket NFT management
- **HotelApp** — Hotel reservation tokenization
- **CarRentalApp** — Car rental NFT lifecycle
- **ConcertApp** — Concert ticket management
- **EquityApp** — Securities tokenization
- **DePINPage** — Decentralized physical infrastructure
- **PredictionMarketsPage** — Prediction market tokens
- **ProofOfFundsPage** — Reserve verification
- And more (Comet, GTS, H2O, IITS, Nexus, Trouve, TravelShield, AMS, Showcase)

## Project Structure

```
ui/
├── src/
│   ├── App.tsx              # Main app with tab routing
│   ├── components/          # Page components
│   │   ├── AhoyDashboard.tsx
│   │   ├── Dashboard.tsx
│   │   ├── PolicyStudio.tsx
│   │   ├── IdentitiesPage.tsx
│   │   ├── TransactionsPage.tsx
│   │   ├── OraclesPage.tsx
│   │   ├── PayoutsPage.tsx
│   │   ├── DevelopersPage.tsx
│   │   ├── DemoWizard.tsx
│   │   └── ...
│   ├── pages/               # Vertical demo apps
│   ├── store.ts             # Legacy Zustand store
│   └── core/store.ts        # Canonical Zustand store
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | API server URL |

## Build

```bash
pnpm build    # Production build to dist/
pnpm preview  # Preview production build
```

## License

MIT
