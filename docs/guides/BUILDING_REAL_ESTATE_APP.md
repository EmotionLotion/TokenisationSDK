---
sidebar_position: 5
title: Building a Real Estate App
---

# Building a Real Estate Tokenisation App

This tutorial walks you through building a complete real estate tokenisation platform using the AHOY SDK. You will create a React application with property browsing, investor onboarding, investment flows, portfolio management, secondary market trading, and an admin dashboard — following the same architecture as the reference app at `apps/real-estate/`.

---

## What You Will Build

| Section | Features |
|---------|----------|
| **Public Marketplace** | Browse tokenised properties, view property details with financials, documents, cap table |
| **Investor Portal** | KYC onboarding, invest in properties, portfolio dashboard, statements, investment cart |
| **Admin Dashboard** | Onboard properties, manage compliance, dividends, listings, exit windows, investor tiers |

---

## Prerequisites

- Node.js 18+, pnpm 8+
- AHOY API server running on `http://localhost:3001` (see [Installation](../getting-started/INSTALLATION.md))
- Familiarity with React, TypeScript, and Tailwind CSS

---

## Step 1: Scaffold the Project

```bash
# Create a new Vite + React + TypeScript project
pnpm create vite my-real-estate-app --template react-ts
cd my-real-estate-app

# Install SDK packages
pnpm add @tokenisation/sdk @tokenisation/sdk-react @tokenisation/ui-kit

# Install additional dependencies
pnpm add react-router-dom @tanstack/react-query zustand
pnpm add lucide-react clsx tailwind-merge framer-motion

# Install Tailwind CSS
pnpm add -D tailwindcss @tailwindcss/vite
```

---

## Step 2: Configure Vite

The SDK includes server-side modules (AWS, MongoDB, Node built-ins) that must be stubbed out for browser builds.

```ts
// vite.config.ts
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'path'

// Stub server-only packages that the SDK references
// but the browser never calls at runtime
const serverOnlyDeps = [
  '@aws-sdk/client-secrets-manager',
  'mongodb',
  'node:module',
  'node:fs',
  'node:path',
  'node:crypto',
]

function stubServerDeps(): Plugin {
  return {
    name: 'stub-server-deps',
    enforce: 'pre',
    resolveId(id) {
      if (serverOnlyDeps.includes(id)) return '\0stub:' + id
    },
    load(id) {
      if (id.startsWith('\0stub:')) {
        return 'export default {}; export const createRequire = () => () => ({});'
      }
    },
  }
}

export default defineConfig({
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    stubServerDeps(),
    react(),
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'util', 'process', 'events'],
    }),
  ],
  build: {
    rollupOptions: {
      external: serverOnlyDeps,
    },
  },
})
```

If you are working within the monorepo, also add resolve aliases:

```ts
resolve: {
  alias: {
    '@tokenisation/ui-kit': path.resolve(__dirname, '../../ui-kit/dist/index.js'),
    '@tokenisation/sdk-react': path.resolve(__dirname, '../../sdk-react/dist/index.js'),
    '@tokenisation/sdk': path.resolve(__dirname, '../../sdk/dist/index.js'),
  },
},
```

Install the node polyfills plugin:

```bash
pnpm add -D vite-plugin-node-polyfills
```

---

## Step 3: Configure Tailwind

```js
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0E14',
        surface: 'rgba(30,41,59,0.4)',
        primary: '#F8B032',
        'primary-dark': '#D69A31',
        secondary: '#6366f1',
        accent: '#22c55e',
        'glass-border': 'rgba(255,255,255,0.08)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Lexend Deca', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

Add fonts to `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Lexend+Deca:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## Step 4: Set Up the Provider and Router

### Entry Point

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { TokenisationProvider } from '@tokenisation/sdk-react';
import { router } from './routes';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TokenisationProvider
      config={{
        apiUrl: import.meta.env.VITE_API_URL || '/api',
        publishableKey: import.meta.env.VITE_PUBLISHABLE_KEY || '',
        apiKey: import.meta.env.VITE_API_KEY || '',
        defaultJurisdiction: 'AE',
        debug: import.meta.env.VITE_DEBUG === 'true',
      }}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TokenisationProvider>
  </StrictMode>,
);
```

### Routes

```tsx
// src/routes.tsx
import { createBrowserRouter } from 'react-router-dom';
import { MarketplaceLayout } from './layouts/MarketplaceLayout';
import { InvestorLayout } from './layouts/InvestorLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Marketplace pages
import { BrowseProperties } from './pages/marketplace/BrowseProperties';
import { PropertyDetail } from './pages/marketplace/PropertyDetail';

// Investor pages
import { Onboarding } from './pages/investor/Onboarding';
import { InvestFlow } from './pages/investor/InvestFlow';
import { Portfolio } from './pages/investor/Portfolio';
import { Statements } from './pages/investor/Statements';

// Admin pages
import { Dashboard } from './pages/admin/Dashboard';
import { OnboardProperty } from './pages/admin/OnboardProperty';
import { CompliancePanel } from './pages/admin/CompliancePanel';
import { DividendManager } from './pages/admin/DividendManager';

export const router = createBrowserRouter([
  // Public marketplace
  {
    path: '/',
    element: <MarketplaceLayout />,
    children: [
      { index: true, element: <BrowseProperties /> },
      { path: 'property/:id', element: <PropertyDetail /> },
    ],
  },
  // Investor portal (auth required)
  {
    path: '/investor',
    element: <InvestorLayout />,
    children: [
      { index: true, element: <Portfolio /> },
      { path: 'portfolio', element: <Portfolio /> },
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'invest/:propertyId', element: <InvestFlow /> },
      { path: 'statements', element: <Statements /> },
    ],
  },
  // Admin dashboard (auth required)
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'onboard', element: <OnboardProperty /> },
      { path: 'compliance', element: <CompliancePanel /> },
      { path: 'dividends', element: <DividendManager /> },
    ],
  },
]);
```

### Environment Variables

```bash
# .env
VITE_API_URL=/api
VITE_PUBLISHABLE_KEY=pk_test_your_key
VITE_API_KEY=ak_test_your_key
VITE_DEBUG=true
```

---

## Step 5: Create Layouts

### Marketplace Layout (Public)

```tsx
// src/layouts/MarketplaceLayout.tsx
import { Outlet, Link } from 'react-router-dom';

export function MarketplaceLayout() {
  return (
    <div className="min-h-screen bg-background text-white">
      <header className="sticky top-0 z-50 border-b border-glass-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="font-display text-xl font-semibold text-primary">
            AHOY Real Estate
          </Link>
          <nav className="flex items-center gap-6">
            <Link to="/" className="text-sm text-gray-300 hover:text-white">Properties</Link>
            <Link to="/investor/portfolio" className="text-sm text-gray-300 hover:text-white">My Portfolio</Link>
            <Link to="/admin" className="text-sm text-gray-300 hover:text-white">Admin</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-glass-border py-6 text-center text-xs text-gray-500">
        ERC-3643 Compliant | VARA Regulated | Powered by AHOY Tokenisation SDK
      </footer>
    </div>
  );
}
```

### Investor Layout (Auth Required)

```tsx
// src/layouts/InvestorLayout.tsx
import { Outlet, NavLink } from 'react-router-dom';
import { Briefcase, FileText, Shield, ShoppingCart } from 'lucide-react';
import { AuthGate } from '../components/AuthGate';

const navItems = [
  { to: '/investor/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/investor/statements', label: 'Statements', icon: FileText },
  { to: '/investor/onboarding', label: 'KYC / Accreditation', icon: Shield },
  { to: '/investor/cart', label: 'Cart', icon: ShoppingCart },
];

export function InvestorLayout() {
  return (
    <div className="flex min-h-screen bg-background text-white">
      <aside className="w-64 border-r border-glass-border p-6">
        <h2 className="font-display text-lg font-semibold text-primary mb-8">
          Investor Portal
        </h2>
        <nav className="space-y-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? 'bg-white/10 text-primary' : 'text-gray-400 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-8">
        <AuthGate>
          <Outlet />
        </AuthGate>
      </main>
    </div>
  );
}
```

---

## Step 6: Build the Graceful Fallback Hook

This is the key pattern that makes the app work with or without a live API:

```tsx
// src/hooks/useSDKWithFallback.ts
import { useState, useEffect, useCallback } from 'react';

export function useSDKWithFallback<T>(
  sdkCall: () => Promise<T>,
  fallbackData: T,
  deps: any[] = [],
) {
  const [data, setData] = useState<T>(fallbackData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isLive, setIsLive] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sdkCall();
      if (result != null) {
        setData(result);
        setIsLive(true);
      }
    } catch (err) {
      setError(err as Error);
      // Keep using fallback data — no crash
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, isLive, refresh };
}

export function useSDKMutationWithFallback<TArgs extends any[], TResult>(
  sdkMutation: (...args: TArgs) => Promise<TResult>,
  mockSimulation: (...args: TArgs) => Promise<TResult>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (...args: TArgs): Promise<TResult> => {
    setLoading(true);
    setError(null);
    try {
      return await sdkMutation(...args);
    } catch (err) {
      console.warn('SDK mutation failed, using mock simulation:', err);
      return await mockSimulation(...args);
    } finally {
      setLoading(false);
    }
  }, [sdkMutation, mockSimulation]);

  return { execute, loading, error };
}
```

---

## Step 7: Define Mock Data

Create a data file with realistic Dubai property data to serve as fallback:

```tsx
// src/data/dubai-properties.ts

export interface DubaiProperty {
  id: string;
  name: string;
  location: string;
  type: 'residential' | 'commercial' | 'mixed-use' | 'hospitality';
  status: 'live' | 'distributing' | 'token-issuance' | 'regulatory-approval' | 'frozen';
  valuationAED: number;
  tokenSymbol: string;
  tokenPrice: number;
  totalTokens: number;
  soldTokens: number;
  netYield: number;
  occupancy: number;
  metadata: Record<string, unknown>;
}

export const DUBAI_PROPERTIES: DubaiProperty[] = [
  {
    id: 'prop-001',
    name: 'Marina Gate Tower 1',
    location: 'Dubai Marina',
    type: 'residential',
    status: 'live',
    valuationAED: 385_000_000,
    tokenSymbol: 'MGATE1',
    tokenPrice: 385,
    totalTokens: 1_000_000,
    soldTokens: 723_500,
    netYield: 7.2,
    occupancy: 94,
    metadata: { bedrooms: '1-3', area: 'Dubai Marina', developer: 'Select Group' },
  },
  {
    id: 'prop-002',
    name: 'Downtown Views Tower A',
    location: 'Downtown Dubai',
    type: 'residential',
    status: 'distributing',
    valuationAED: 520_000_000,
    tokenSymbol: 'DVIEW',
    tokenPrice: 520,
    totalTokens: 1_000_000,
    soldTokens: 891_200,
    netYield: 6.8,
    occupancy: 97,
    metadata: { bedrooms: '1-4', area: 'Downtown Dubai', developer: 'Emaar' },
  },
  // Add more properties as needed...
];
```

---

## Step 8: Build the Browse Properties Page

```tsx
// src/pages/marketplace/BrowseProperties.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsset } from '@tokenisation/sdk-react';
import { StatusBadge } from '@tokenisation/ui-kit';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { DUBAI_PROPERTIES, type DubaiProperty } from '../../data/dubai-properties';

export function BrowseProperties() {
  const { listAssets } = useAsset();
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: properties, isLive, loading } = useSDKWithFallback<DubaiProperty[]>(
    async () => {
      const assets = await listAssets({ state: 'ACTIVE' });
      // Map SDK assets to your app's DubaiProperty type
      return assets.map(asset => ({
        id: asset.id,
        name: asset.name,
        // ... map remaining fields from asset.metadata
      })) as DubaiProperty[];
    },
    DUBAI_PROPERTIES,
  );

  const filtered = typeFilter === 'all'
    ? properties
    : properties.filter(p => p.type === typeFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold">Dubai Properties</h1>
          <p className="text-gray-400 mt-1">Tokenised real estate investment opportunities</p>
        </div>
        {isLive && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">Live</span>}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {['all', 'residential', 'commercial', 'mixed-use', 'hospitality'].map(type => (
          <button
            key={type}
            onClick={() => setTypeFilter(type)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              typeFilter === type
                ? 'bg-primary text-black font-medium'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Property Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(property => (
          <Link
            key={property.id}
            to={`/property/${property.id}`}
            className="group rounded-xl border border-glass-border bg-white/5 p-6 transition-all hover:border-primary/30 hover:bg-white/8"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold text-white group-hover:text-primary transition-colors">
                  {property.name}
                </h3>
                <p className="text-sm text-gray-400">{property.location}</p>
              </div>
              <StatusBadge
                variant={property.status === 'live' ? 'success' : 'info'}
                label={property.status}
              />
            </div>

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Valuation</span>
                <span className="text-white font-mono">
                  AED {(property.valuationAED / 1_000_000).toFixed(0)}M
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Net Yield</span>
                <span className="text-accent">{property.netYield}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Occupancy</span>
                <span className="text-white">{property.occupancy}%</span>
              </div>

              {/* Funding progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{property.tokenSymbol}</span>
                  <span>{((property.soldTokens / property.totalTokens) * 100).toFixed(1)}% funded</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(property.soldTokens / property.totalTokens) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 9: Build the Property Detail Page

```tsx
// src/pages/marketplace/PropertyDetail.tsx
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsset } from '@tokenisation/sdk-react';
import { useCapTable, useAuditLog, useSecondaryMarket, useExitWindow, useCashFlow } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { DUBAI_PROPERTIES } from '../../data/dubai-properties';

const TABS = ['Overview', 'Financials', 'Documents', 'Cap Table', 'Secondary Market', 'Audit Trail'];

export function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const { getAsset } = useAsset();
  const [activeTab, setActiveTab] = useState(0);

  const fallback = DUBAI_PROPERTIES.find(p => p.id === id) || DUBAI_PROPERTIES[0];

  const { data: property, isLive } = useSDKWithFallback(
    async () => {
      const asset = await getAsset(id!);
      return asset ? mapAssetToProperty(asset) : null;
    },
    fallback,
    [id],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-3xl font-bold">{property.name}</h1>
          <p className="text-gray-400">{property.location}</p>
        </div>
        {property.status === 'live' && (
          <Link
            to={`/investor/invest/${property.id}`}
            className="rounded-lg bg-primary px-6 py-3 font-medium text-black hover:bg-primary-dark transition-colors"
          >
            Invest Now
          </Link>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-glass-border mb-6">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-sm transition-colors ${
              activeTab === i
                ? 'text-primary border-b-2 border-primary'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 0 && <OverviewTab property={property} />}
      {activeTab === 1 && <FinancialsTab propertyId={property.id} />}
      {activeTab === 2 && <DocumentsTab propertyId={property.id} />}
      {activeTab === 3 && <CapTableTab propertyId={property.id} />}
      {activeTab === 4 && <SecondaryMarketTab propertyId={property.id} />}
      {activeTab === 5 && <AuditTab propertyId={property.id} />}
    </div>
  );
}

// Example: Cap Table tab using the SDK hook
function CapTableTab({ propertyId }: { propertyId: string }) {
  const { data, loading } = useCapTable(propertyId);

  if (loading) return <div className="text-gray-400">Loading cap table...</div>;
  if (!data) return <div className="text-gray-400">No cap table data</div>;

  return (
    <div className="rounded-xl border border-glass-border bg-white/5 p-6">
      <h3 className="font-display font-semibold mb-4">Cap Table</h3>
      <p className="text-sm text-gray-400 mb-4">Total Supply: {data.totalSupply}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-glass-border">
            <th className="text-left py-2">Investor</th>
            <th className="text-right py-2">Balance</th>
            <th className="text-right py-2">Ownership</th>
          </tr>
        </thead>
        <tbody>
          {data.holders.map(holder => (
            <tr key={holder.address} className="border-b border-glass-border/50">
              <td className="py-2 font-mono text-xs">{holder.name || holder.address}</td>
              <td className="text-right py-2">{holder.balance}</td>
              <td className="text-right py-2 text-primary">{holder.percentage.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Example: Secondary Market tab
function SecondaryMarketTab({ propertyId }: { propertyId: string }) {
  const { listings, createListing, purchase, loading } = useSecondaryMarket(propertyId);
  const { currentWindow, nextWindow, schedule } = useExitWindow(propertyId);

  return (
    <div className="space-y-6">
      {/* Exit Window Status */}
      <div className="rounded-xl border border-glass-border bg-white/5 p-6">
        <h3 className="font-display font-semibold mb-2">Exit Window</h3>
        {currentWindow ? (
          <p className="text-accent">Open until {new Date(currentWindow.closesAt).toLocaleDateString()}</p>
        ) : nextWindow ? (
          <p className="text-gray-400">Next window: {new Date(nextWindow.opensAt).toLocaleDateString()}</p>
        ) : (
          <p className="text-gray-400">No windows scheduled</p>
        )}
      </div>

      {/* Active Listings */}
      <div className="rounded-xl border border-glass-border bg-white/5 p-6">
        <h3 className="font-display font-semibold mb-4">Active Listings</h3>
        {listings.filter(l => l.status === 'active').map(listing => (
          <div key={listing.id} className="flex items-center justify-between py-3 border-b border-glass-border/50">
            <div>
              <span className="text-white">{listing.tokenAmount} tokens</span>
              <span className="text-gray-400 ml-2">@ {listing.pricePerToken} {listing.currency}</span>
            </div>
            <button
              onClick={() => purchase(listing.id, '0xYourWallet...')}
              className="rounded bg-primary px-4 py-1.5 text-sm text-black font-medium"
            >
              Buy
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 10: Build the Investor Onboarding

```tsx
// src/pages/investor/Onboarding.tsx
import { useState } from 'react';
import { useKYC, useInvestor } from '@tokenisation/sdk-react';
import { ComplianceStepper } from '@tokenisation/ui-kit';
import { useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';

const STEPS = [
  { label: 'Personal Info', status: 'pending' as const },
  { label: 'Identity Verification', status: 'pending' as const },
  { label: 'Accreditation', status: 'pending' as const },
  { label: 'Approval', status: 'pending' as const },
];

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', email: '', jurisdiction: 'AE' });
  const investor = useInvestor();
  const kyc = useKYC();

  const { execute: createInvestor } = useSDKMutationWithFallback(
    async () => investor.create({ ...form, type: 'INDIVIDUAL' }),
    async () => ({ id: 'mock_investor', ...form, status: 'active' }),
  );

  const { execute: startKYC } = useSDKMutationWithFallback(
    async () => kyc.initiateKYC('standard'),
    async () => ({ success: true, verificationId: 'mock_kyc' }),
  );

  const steps = STEPS.map((s, i) => ({
    ...s,
    status: i < step ? 'completed' as const : i === step ? 'active' as const : 'pending' as const,
  }));

  const handleNext = async () => {
    if (step === 0) {
      await createInvestor();
    } else if (step === 1) {
      await startKYC();
    }
    setStep(s => s + 1);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display text-2xl font-bold mb-8">Investor Onboarding</h1>

      <ComplianceStepper steps={steps} />

      <div className="mt-8 rounded-xl border border-glass-border bg-white/5 p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-semibold text-lg">Personal Information</h2>
            <input
              placeholder="Full Name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg bg-white/5 border border-glass-border px-4 py-3 text-white"
            />
            <input
              placeholder="Email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg bg-white/5 border border-glass-border px-4 py-3 text-white"
            />
            <select
              value={form.jurisdiction}
              onChange={e => setForm(f => ({ ...f, jurisdiction: e.target.value }))}
              className="w-full rounded-lg bg-white/5 border border-glass-border px-4 py-3 text-white"
            >
              <option value="AE">United Arab Emirates</option>
              <option value="GB">United Kingdom</option>
              <option value="SG">Singapore</option>
              <option value="SA">Saudi Arabia</option>
            </select>
          </div>
        )}

        {step === 1 && (
          <div className="text-center py-8">
            <h2 className="font-semibold text-lg mb-2">Identity Verification</h2>
            <p className="text-gray-400">Upload your ID and complete face verification</p>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-semibold text-lg mb-4">Accreditation</h2>
            <p className="text-gray-400">Select your investor classification</p>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">&#10003;</div>
            <h2 className="font-semibold text-lg text-accent">Approved</h2>
            <p className="text-gray-400 mt-2">Your KYC has been verified</p>
          </div>
        )}

        {step < 3 && (
          <button
            onClick={handleNext}
            className="mt-6 w-full rounded-lg bg-primary py-3 font-medium text-black hover:bg-primary-dark"
          >
            {step === 2 ? 'Submit' : 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## Step 11: Build the Investment Flow

```tsx
// src/pages/investor/InvestFlow.tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAsset, useCompliance, useTransfer, useInvestorTier } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';
import { DUBAI_PROPERTIES } from '../../data/dubai-properties';

export function InvestFlow() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { getAsset } = useAsset();
  const { checkTransfer } = useCompliance();
  const { create: createTransfer } = useTransfer();
  const { plans, currentTier } = useInvestorTier(propertyId);

  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<'input' | 'compliance' | 'confirm' | 'success'>('input');
  const [complianceResult, setComplianceResult] = useState<any>(null);

  const fallback = DUBAI_PROPERTIES.find(p => p.id === propertyId) || DUBAI_PROPERTIES[0];
  const { data: property } = useSDKWithFallback(
    async () => getAsset(propertyId!),
    fallback,
    [propertyId],
  );

  const runComplianceCheck = async () => {
    setStep('compliance');
    try {
      const result = await checkTransfer({
        assetId: propertyId!,
        fromAddress: 'TREASURY',
        toAddress: '0xMyWallet...',
        amount,
      });
      setComplianceResult(result);
      if (result.decision === 'allow') {
        setStep('confirm');
      }
    } catch {
      // Simulate compliance passing for demo
      setComplianceResult({ decision: 'allow' });
      setStep('confirm');
    }
  };

  const executeInvestment = async () => {
    try {
      await createTransfer({
        tokenId: propertyId!,
        fromWallet: 'TREASURY',
        toWallet: '0xMyWallet...',
        amount,
      });
    } catch {
      // Mock success for demo
    }
    setStep('success');
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-display text-2xl font-bold mb-2">Invest in {property.name}</h1>
      <p className="text-gray-400 mb-8">{property.tokenSymbol} @ AED {property.tokenPrice}/token</p>

      {step === 'input' && (
        <div className="rounded-xl border border-glass-border bg-white/5 p-6 space-y-6">
          {/* Tier info */}
          {currentTier && (
            <div className="text-sm text-gray-400">
              Your tier: <span className="text-primary">{currentTier}</span>
            </div>
          )}

          {/* Amount input */}
          <div>
            <label className="text-sm text-gray-400 mb-2 block">Token Amount</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Enter number of tokens"
              className="w-full rounded-lg bg-white/5 border border-glass-border px-4 py-3 text-white text-lg font-mono"
            />
            {amount && (
              <p className="text-sm text-gray-400 mt-2">
                Total: AED {(Number(amount) * property.tokenPrice).toLocaleString()}
              </p>
            )}
          </div>

          {/* Quick select */}
          <div className="flex gap-2">
            {[1000, 5000, 10000, 50000].map(qty => (
              <button
                key={qty}
                onClick={() => setAmount(String(qty))}
                className="rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10"
              >
                {qty.toLocaleString()}
              </button>
            ))}
          </div>

          <button
            onClick={runComplianceCheck}
            disabled={!amount || Number(amount) <= 0}
            className="w-full rounded-lg bg-primary py-3 font-medium text-black hover:bg-primary-dark disabled:opacity-50"
          >
            Continue to Compliance Check
          </button>
        </div>
      )}

      {step === 'compliance' && (
        <div className="rounded-xl border border-glass-border bg-white/5 p-6 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Running compliance checks...</p>
        </div>
      )}

      {step === 'confirm' && (
        <div className="rounded-xl border border-glass-border bg-white/5 p-6 space-y-4">
          <h2 className="font-semibold text-lg">Confirm Investment</h2>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Tokens</span>
            <span>{Number(amount).toLocaleString()} {property.tokenSymbol}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Price per Token</span>
            <span>AED {property.tokenPrice}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold border-t border-glass-border pt-3">
            <span>Total</span>
            <span className="text-primary">AED {(Number(amount) * property.tokenPrice).toLocaleString()}</span>
          </div>
          <button
            onClick={executeInvestment}
            className="w-full rounded-lg bg-primary py-3 font-medium text-black hover:bg-primary-dark"
          >
            Confirm & Invest
          </button>
        </div>
      )}

      {step === 'success' && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="font-semibold text-lg text-accent">Investment Successful</h2>
          <p className="text-gray-400 mt-2">
            {Number(amount).toLocaleString()} {property.tokenSymbol} tokens allocated
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Step 12: Build the Portfolio Dashboard

```tsx
// src/pages/investor/Portfolio.tsx
import { useInvestor, useCashFlow } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';

interface Holding {
  assetId: string;
  name: string;
  symbol: string;
  balance: number;
  currentValue: number;
  costBasis: number;
  yield: number;
}

const MOCK_HOLDINGS: Holding[] = [
  { assetId: 'prop-001', name: 'Marina Gate Tower 1', symbol: 'MGATE1', balance: 50000, currentValue: 625000, costBasis: 500000, yield: 7.2 },
  { assetId: 'prop-002', name: 'Downtown Views Tower A', symbol: 'DVIEW', balance: 25000, currentValue: 390000, costBasis: 350000, yield: 6.8 },
];

export function Portfolio() {
  const investor = useInvestor();
  const cashFlow = useCashFlow();

  const { data: holdings, isLive } = useSDKWithFallback<Holding[]>(
    async () => {
      const investors = await investor.list({ status: 'active', limit: 1 });
      if (!investors.length) return null;
      // Fetch balances and map to Holding[]
      const balances = await investor.getBalances({ assetId: undefined });
      return balances as any;
    },
    MOCK_HOLDINGS,
  );

  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.costBasis, 0);
  const totalPnL = totalValue - totalCost;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-2xl font-bold">My Portfolio</h1>
        {isLive && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">Live</span>}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-glass-border bg-white/5 p-4">
          <p className="text-xs text-gray-400">Total Value</p>
          <p className="text-xl font-semibold font-mono mt-1">AED {totalValue.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-glass-border bg-white/5 p-4">
          <p className="text-xs text-gray-400">Total P&L</p>
          <p className={`text-xl font-semibold font-mono mt-1 ${totalPnL >= 0 ? 'text-accent' : 'text-red-400'}`}>
            {totalPnL >= 0 ? '+' : ''}AED {totalPnL.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-glass-border bg-white/5 p-4">
          <p className="text-xs text-gray-400">Holdings</p>
          <p className="text-xl font-semibold mt-1">{holdings.length}</p>
        </div>
        <div className="rounded-xl border border-glass-border bg-white/5 p-4">
          <p className="text-xs text-gray-400">Avg Yield</p>
          <p className="text-xl font-semibold text-primary mt-1">
            {(holdings.reduce((sum, h) => sum + h.yield, 0) / holdings.length).toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Holdings Table */}
      <div className="rounded-xl border border-glass-border bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-glass-border text-gray-400">
              <th className="text-left px-6 py-3">Property</th>
              <th className="text-right px-6 py-3">Tokens</th>
              <th className="text-right px-6 py-3">Value (AED)</th>
              <th className="text-right px-6 py-3">P&L</th>
              <th className="text-right px-6 py-3">Yield</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => (
              <tr key={h.assetId} className="border-b border-glass-border/50 hover:bg-white/5">
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{h.name}</div>
                  <div className="text-xs text-gray-400">{h.symbol}</div>
                </td>
                <td className="text-right px-6 py-4 font-mono">{h.balance.toLocaleString()}</td>
                <td className="text-right px-6 py-4 font-mono">{h.currentValue.toLocaleString()}</td>
                <td className={`text-right px-6 py-4 font-mono ${h.currentValue - h.costBasis >= 0 ? 'text-accent' : 'text-red-400'}`}>
                  {h.currentValue - h.costBasis >= 0 ? '+' : ''}{(h.currentValue - h.costBasis).toLocaleString()}
                </td>
                <td className="text-right px-6 py-4 text-primary">{h.yield}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Step 13: Build the Admin Dashboard

```tsx
// src/pages/admin/Dashboard.tsx
import { useAsset, useInvestor } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';

export function Dashboard() {
  const { listAssets } = useAsset();
  const investor = useInvestor();

  const { data: stats } = useSDKWithFallback(
    async () => {
      const assets = await listAssets();
      const investors = await investor.list({ limit: 1000 });
      return {
        totalProperties: assets.length,
        totalInvestors: investors.length,
        activeProperties: assets.filter(a => a.state === 'ACTIVE').length,
        pendingKYC: investors.filter(i => i.kycStatus === 'pending').length,
      };
    },
    { totalProperties: 7, totalInvestors: 342, activeProperties: 3, pendingKYC: 12 },
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-bold mb-8">Admin Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Properties" value={stats.totalProperties} />
        <StatCard label="Active Properties" value={stats.activeProperties} color="text-accent" />
        <StatCard label="Total Investors" value={stats.totalInvestors} />
        <StatCard label="Pending KYC" value={stats.pendingKYC} color="text-yellow-400" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-xl border border-glass-border bg-white/5 p-6">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-3xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}
```

---

## Step 14: Run the Application

```bash
# Start the API server (from the server/ directory)
pnpm --filter @tokenisation/server dev

# Start your app
pnpm dev
```

Open `http://localhost:5174` to see your real estate platform.

---

## Architecture Summary

```
src/
├── main.tsx                  # TokenisationProvider + Router + QueryClient
├── routes.tsx                # Three route groups (marketplace, investor, admin)
├── layouts/                  # MarketplaceLayout, InvestorLayout, AdminLayout
├── pages/
│   ├── marketplace/          # BrowseProperties, PropertyDetail
│   ├── investor/             # Portfolio, Onboarding, InvestFlow, Statements
│   └── admin/                # Dashboard, OnboardProperty, CompliancePanel, ...
├── components/               # Shared components (AuthGate, CapTableView, etc.)
├── hooks/
│   ├── useSDKWithFallback.ts # Graceful SDK degradation
│   └── useInvestmentCart.ts  # Zustand cart store
├── data/
│   └── dubai-properties.ts  # Mock data + TypeScript types
├── stores/
│   └── authStore.ts          # Zustand auth state
└── utils/
    └── mappers.ts            # SDK Asset ↔ DubaiProperty mappers
```

### SDK Hooks Used by Section

| Section | Hooks |
|---------|-------|
| **Marketplace** | `useAsset`, `useCapTable`, `useAuditLog`, `useSecondaryMarket`, `useExitWindow`, `useCashFlow` |
| **Investor** | `useInvestor`, `useKYC`, `useCompliance`, `useTransfer`, `useInvestorTier`, `useCashFlow` |
| **Admin** | `useAsset`, `useInvestor`, `useTokens`, `useDLD`, `useCompliance`, `useCashFlow` |

---

## Next Steps

- Add real wallet connectivity with `useWallet()` and `<WalletConnect />`
- Integrate real KYC with Sumsub via the `kyc` provider config
- Add real-time updates with `useEventStream()`
- Deploy with Docker (see [Docker Guide](../deployment/DOCKER.md))
- Add governance voting with `useGovernance()`
- Add property management with `usePropertyManagement()`

---

## Related Guides

- [React Integration Guide](./REACT_INTEGRATION.md) — Full hook and component API reference
- [Real Estate Tokenisation Guide](./REAL_ESTATE.md) — Backend/API workflow
- [Compliance Engine Guide](./COMPLIANCE.md) — Policy configuration
- [Quick Start](../getting-started/QUICKSTART.md) — Running your first tokenisation project
