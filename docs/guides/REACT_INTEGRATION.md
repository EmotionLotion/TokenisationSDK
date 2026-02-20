---
sidebar_position: 4
title: React Integration Guide
---

# React Integration Guide

This guide covers how to build React applications with the AHOY Tokenisation SDK using `@tokenisation/sdk-react` hooks and `@tokenisation/ui-kit` components. By the end, you will understand the provider setup, hook patterns, component library, and how to wire everything together.

---

## Prerequisites

- Node.js 18+, pnpm 8+
- A running AHOY API server (see [Installation](../getting-started/INSTALLATION.md))
- React 18+ application (Vite recommended)

---

## Installation

```bash
# Core SDK + React bindings
pnpm add @tokenisation/sdk @tokenisation/sdk-react

# UI component library (optional but recommended)
pnpm add @tokenisation/ui-kit

# Peer dependencies
pnpm add react@^18 react-dom@^18
```

---

## 1. Provider Setup

### TokenisationProvider

Every React app must wrap its component tree with `<TokenisationProvider>`. This creates the SDK context that all hooks consume.

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TokenisationProvider } from '@tokenisation/sdk-react';
import { App } from './App';

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
      <App />
    </TokenisationProvider>
  </StrictMode>,
);
```

### Configuration Options

```tsx
interface TokenisationConfig {
  apiUrl: string;                    // Required — API server URL
  publishableKey?: string;           // pk_test_xxx (sandbox) or pk_live_xxx (production)
  apiKey?: string;                   // For dev/server-side usage
  orgId?: string;                    // Organisation ID
  defaultJurisdiction?: string;      // ISO country code (e.g. 'AE', 'US', 'GB')
  debug?: boolean;                   // Enable console logging

  // Optional provider configs
  networks?: NetworkConfig[];        // Custom chain configurations
  storage?: StorageConfig;           // IPFS / S3 / custom upload
  kyc?: KYCProviderConfig;           // Sumsub / Onfido / Jumio
  custody?: CustodyProviderConfig;   // Fireblocks / BitGo / self-custody

  // Callbacks
  onAuthError?: () => void;          // Fired on 401 responses
}
```

### Environment Variables

Create a `.env` file in your app root:

```bash
VITE_API_URL=http://localhost:3001/api
VITE_PUBLISHABLE_KEY=pk_test_your_key_here
VITE_API_KEY=ak_test_your_key_here
VITE_DEBUG=true
```

### With Vite Proxy (Recommended for Development)

Instead of hardcoding the API URL, proxy `/api` through Vite to avoid CORS issues:

```ts
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

Then set `apiUrl: '/api'` in your provider config.

---

## 2. Context Access

### useTokenisation()

Access the full SDK context from any component:

```tsx
import { useTokenisation } from '@tokenisation/sdk-react';

function MyComponent() {
  const {
    config,           // Current configuration
    isInitialized,    // Provider ready state
    wallet,           // Connected wallet info (address, chainId, etc.)
    currentParty,     // Authenticated party/user
    connectWallet,    // Connect wallet function
    disconnectWallet, // Disconnect wallet function
    api,              // BrowserHttpClient for raw API calls
    modules,          // All SDK modules (transfers, tokens, investors, etc.)
    authToken,        // Current JWT
    setAuthToken,     // Set JWT manually
    signMessage,      // Sign with connected wallet
    sendTransaction,  // Send transaction via connected wallet
  } = useTokenisation();

  return <div>API: {config.apiUrl}</div>;
}
```

### Available Modules on Context

The `modules` object provides typed access to all SDK domain modules:

```tsx
const { modules } = useTokenisation();

// modules.transfers   — TransfersModule
// modules.tokens      — TokensModule
// modules.investors   — InvestorsModule
// modules.compliance  — ComplianceModule
// modules.governance  — GovernanceModule
// modules.escrow      — EscrowModule
// modules.cashflow    — CashFlowModule
// modules.dld         — DLDModule
// modules.legal       — LegalModule
// modules.events      — EventsModule
// modules.webhooks    — WebhooksModule
// modules.audit       — AuditModule
// modules.assets      — AssetsModule
// modules.projects    — ProjectsModule
```

---

## 3. Hooks Reference

All hooks are imported from `@tokenisation/sdk-react`. Each hook returns typed state and methods for a specific domain.

### Asset Management

#### useAsset()

```tsx
import { useAsset } from '@tokenisation/sdk-react';

function PropertyList() {
  const { listAssets, getAsset, createAsset, transitionAsset, loading } = useAsset();

  // List all assets
  const assets = await listAssets({ state: 'ACTIVE', jurisdiction: 'AE' });

  // Get a single asset
  const asset = await getAsset('asset_123');

  // Create a new asset
  const result = await createAsset({
    name: 'Marina Tower Unit 1204',
    rightType: 'OWNERSHIP',
    jurisdiction: 'AE',
    metadata: { propertyType: 'residential' },
  });

  // Transition asset state
  await transitionAsset('asset_123', 'ACTIVE', {
    type: 'compliance_approval',
    data: { approvedBy: 'admin_001' },
  });
}
```

#### useTokens(assetId)

```tsx
import { useTokens } from '@tokenisation/sdk-react';

function TokenOperations({ assetId }: { assetId: string }) {
  const { mint, transfer, burn, getBalance, getHolders, totalSupply, loading } = useTokens(assetId);

  // Mint tokens
  await mint('0xInvestorWallet...', '50000');

  // Transfer tokens
  await transfer('0xFrom...', '0xTo...', '10000');

  // Check balance
  const balance = await getBalance('0xInvestorWallet...');
  // { address, balance: '50000', lockedBalance: '0', availableBalance: '50000' }

  // Get all holders
  const holders = await getHolders();
  // [{ address, partyId, balance: '50000', percentage: 5.0 }]
}
```

#### useTokenBalance(assetId, options?)

Auto-polling balance with staleness detection:

```tsx
import { useTokenBalance } from '@tokenisation/sdk-react';

function BalanceDisplay({ assetId }: { assetId: string }) {
  const { balance, rawBalance, loading, isStale, refresh } = useTokenBalance(assetId, {
    pollInterval: 15000,  // Poll every 15s (default)
    decimals: 18,
  });

  return (
    <div>
      <span>{balance} tokens</span>
      {isStale && <span className="text-yellow-500">Stale</span>}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

#### useCapTable(tokenId, options?)

```tsx
import { useCapTable } from '@tokenisation/sdk-react';

function CapTableView({ tokenId }: { tokenId: string }) {
  const { data, loading, refresh } = useCapTable(tokenId, {
    autoRefresh: true,
    intervalMs: 60000,
  });

  if (!data) return null;

  return (
    <table>
      <thead><tr><th>Investor</th><th>Balance</th><th>%</th></tr></thead>
      <tbody>
        {data.holders.map(h => (
          <tr key={h.address}>
            <td>{h.name || h.address}</td>
            <td>{h.balance}</td>
            <td>{h.percentage.toFixed(2)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Investor & Compliance

#### useInvestor()

```tsx
import { useInvestor } from '@tokenisation/sdk-react';

function InvestorManagement() {
  const investor = useInvestor();

  // Register a new investor
  const newInvestor = await investor.create({
    email: 'ahmed@example.ae',
    name: 'Ahmed Al Maktoum',
    jurisdiction: 'AE',
    type: 'INDIVIDUAL',
  });

  // List investors with filters
  const investors = await investor.list({
    status: 'active',
    kycStatus: 'approved',
    limit: 50,
  });

  // Approve KYC
  await investor.approveKyc('investor_123');

  // Suspend an investor
  await investor.suspend('investor_456', 'Sanctions screening flagged');
}
```

#### useKYC()

```tsx
import { useKYC } from '@tokenisation/sdk-react';

function KYCStatus() {
  const { status, level, isAccredited, initiateKYC, verification, loading } = useKYC();

  const handleStartKYC = async () => {
    const result = await initiateKYC('standard');
    if (result.verificationUrl) {
      window.open(result.verificationUrl); // Redirect to KYC provider
    }
  };

  return (
    <div>
      <p>KYC Status: {status}</p>
      <p>Level: {level}</p>
      <p>Accredited: {isAccredited ? 'Yes' : 'No'}</p>
      {status === 'not_started' && (
        <button onClick={handleStartKYC}>Start KYC</button>
      )}
    </div>
  );
}
```

#### useCompliance()

```tsx
import { useCompliance } from '@tokenisation/sdk-react';

function TransferPrecheck({ assetId }: { assetId: string }) {
  const { checkTransfer, checkAction, getReceipts, loading } = useCompliance();

  // Pre-flight transfer check
  const result = await checkTransfer({
    assetId,
    fromAddress: '0xSeller...',
    toAddress: '0xBuyer...',
    amount: '10000',
  });

  if (result.decision === 'allow') {
    // Proceed with transfer
  } else {
    // Show denial reasons
    console.log(result.reasons);
  }

  // Check any compliance action
  const mintCheck = await checkAction('token:mint', {
    assetId,
    toAddress: '0xInvestor...',
    amount: '50000',
  });
}
```

### Transfers & Trading

#### useTransfer()

```tsx
import { useTransfer } from '@tokenisation/sdk-react';

function ExecuteTransfer() {
  const { create, validate, list, loading } = useTransfer();

  // Validate before executing
  const preflight = await validate({
    tokenId: 'token_123',
    fromWallet: '0xSeller...',
    toWallet: '0xBuyer...',
    amount: '10000',
  });

  if (preflight.allowed) {
    const transfer = await create({
      tokenId: 'token_123',
      fromWallet: '0xSeller...',
      toWallet: '0xBuyer...',
      amount: '10000',
    });
    // transfer.status: 'INITIATED' → 'COMPLIANCE_CHECK' → 'APPROVED' → ...
  }
}
```

#### useSecondaryMarket(assetId?)

```tsx
import { useSecondaryMarket } from '@tokenisation/sdk-react';

function SecondaryMarketPanel({ assetId }: { assetId: string }) {
  const { listings, createListing, purchase, cancelListing, loading, refresh } =
    useSecondaryMarket(assetId);

  // Create a sell listing
  await createListing({
    tokenAmount: 5000,
    pricePerToken: 12.50,
    currency: 'AED',
    sellerWallet: '0xMyWallet...',
  });

  // Buy a listing
  await purchase('listing_123', '0xMyWallet...');

  // Display active listings
  return (
    <ul>
      {listings.filter(l => l.status === 'active').map(listing => (
        <li key={listing.id}>
          {listing.tokenAmount} tokens @ {listing.pricePerToken} {listing.currency}
          <button onClick={() => purchase(listing.id, '0xMyWallet...')}>Buy</button>
        </li>
      ))}
    </ul>
  );
}
```

#### useExitWindow(assetId?)

```tsx
import { useExitWindow } from '@tokenisation/sdk-react';

function ExitWindowStatus({ assetId }: { assetId: string }) {
  const { currentWindow, nextWindow, schedule, requestRedemption, loading } =
    useExitWindow(assetId);

  return (
    <div>
      {currentWindow ? (
        <div>
          <p>Exit window open until {new Date(currentWindow.closesAt).toLocaleDateString()}</p>
          <p>Max redemption: {currentWindow.maxRedemptionPercent}%</p>
          <button onClick={() => requestRedemption('investor_123', 5000)}>
            Redeem 5,000 tokens
          </button>
        </div>
      ) : nextWindow ? (
        <p>Next window opens {new Date(nextWindow.opensAt).toLocaleDateString()}</p>
      ) : (
        <p>No exit windows scheduled</p>
      )}
      {schedule && <p>Frequency: {schedule.frequency}</p>}
    </div>
  );
}
```

### Financial

#### useCashFlow()

```tsx
import { useCashFlow } from '@tokenisation/sdk-react';

function DividendHistory() {
  const { listDistributions, createDistribution, claimDistribution, loading } = useCashFlow();

  // List past distributions
  const distributions = await listDistributions({ limit: 20 });

  // Create a new distribution (admin)
  await createDistribution({
    tokenId: 'token_123',
    amount: '250000',
    type: 'DIVIDEND',
    metadata: { period: 'Q4 2025', currency: 'AED' },
  });

  // Claim a distribution (investor)
  const claim = await claimDistribution('dist_456');
}
```

#### useGovernance()

```tsx
import { useGovernance } from '@tokenisation/sdk-react';

function GovernancePanel() {
  const { listProposals, createProposal, castVote, getVotingPower, loading } = useGovernance();

  // Create a proposal
  await createProposal({
    title: 'Approve renovation budget',
    description: 'Allocate 500,000 AED for lobby renovation',
    tokenId: 'token_123',
  });

  // Vote
  await castVote('proposal_789', 'for', 'Renovation will increase property value');

  // Check voting power
  const power = await getVotingPower('0xMyWallet...', 'token_123');
}
```

### Wallet & Infrastructure

#### useWallet()

```tsx
import { useWallet } from '@tokenisation/sdk-react';

function WalletPanel() {
  const {
    address, chainId, isConnected, balance, ensName,
    connect, disconnect, switchNetwork, signMessage,
    loading, error,
  } = useWallet();

  return (
    <div>
      {isConnected ? (
        <>
          <p>{ensName || address}</p>
          <p>Chain: {chainId} | Balance: {balance} ETH</p>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={connect} disabled={loading}>Connect Wallet</button>
      )}
    </div>
  );
}
```

#### useEventStream(options?)

Real-time SSE event streaming:

```tsx
import { useEventStream } from '@tokenisation/sdk-react';

function LiveFeed({ assetId }: { assetId: string }) {
  const { events, isConnected, status, lastEvent, clearEvents } = useEventStream({
    assetId,
    eventTypes: ['transfer.*', 'token.*'],
    maxEvents: 50,
  });

  return (
    <div>
      <span>Status: {status}</span>
      <ul>
        {events.map(e => (
          <li key={e.id}>[{e.eventType}] {JSON.stringify(e.payload)}</li>
        ))}
      </ul>
    </div>
  );
}
```

#### useAuditLog(options)

```tsx
import { useAuditLog } from '@tokenisation/sdk-react';

function AuditTrail({ assetId }: { assetId: string }) {
  const auditLog = useAuditLog({ resourceId: assetId });

  return (
    <ul>
      {auditLog.entries.map(entry => (
        <li key={entry.id}>
          [{entry.timestamp}] {entry.action} by {entry.actorId}
        </li>
      ))}
    </ul>
  );
}
```

### Real Estate Specific

#### useProject()

```tsx
import { useProject } from '@tokenisation/sdk-react';

function ProjectSetup() {
  const { create, list, update, loading } = useProject();

  const project = await create({
    name: 'Marina Tower Fund',
    jurisdiction: 'DUBAI',
    assetType: 'REAL_ESTATE',
    metadata: { developer: 'Emaar', targetRaise: 50_000_000 },
  });
}
```

#### usePropertyManagement()

```tsx
import { usePropertyManagement } from '@tokenisation/sdk-react';

function PropertyOps() {
  const pm = usePropertyManagement();

  // Manage units
  const units = await pm.listUnits('asset_123');
  await pm.addUnit('asset_123', {
    unitNumber: '1204',
    type: 'apartment',
    areaSqft: 1850,
    monthlyRent: 12000,
  });

  // Maintenance requests
  await pm.createMaintenance('asset_123', {
    title: 'AC repair Unit 1204',
    priority: 'high',
    description: 'AC unit not cooling',
  });

  // Record expenses
  await pm.recordExpense('asset_123', {
    category: 'maintenance',
    amount: 2500,
    currency: 'AED',
    description: 'AC compressor replacement',
  });

  // Analytics
  const summary = await pm.getSummary('asset_123');
  // { totalUnits, occupiedUnits, occupancyRate, totalMonthlyRent, ... }
}
```

#### useDLD()

```tsx
import { useDLD } from '@tokenisation/sdk-react';

function DLDIntegration() {
  const dld = useDLD();

  // Register a title deed
  await dld.registerTitle({
    projectId: 'project_123',
    dldTitleNumber: 'DLD-2024-001234',
    propertyType: 'unit',
    emirate: 'dubai',
    area: 'Dubai Marina',
  });
}
```

#### useInvestorTier(assetId?)

```tsx
import { useInvestorTier } from '@tokenisation/sdk-react';

function TierDisplay({ assetId }: { assetId: string }) {
  const { plans, currentTier, loading } = useInvestorTier(assetId);

  return (
    <div>
      <p>Your tier: {currentTier}</p>
      <ul>
        {plans.map(plan => (
          <li key={plan.name}>
            {plan.name}: max {plan.maxInvestment}, lockup {plan.lockupDays} days
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 4. SDK-React Components

The SDK-React package includes 6 pre-built components for common flows.

### WalletConnect

```tsx
import { WalletConnect } from '@tokenisation/sdk-react';

<WalletConnect
  onConnect={(wallet) => console.log('Connected:', wallet.address)}
  onDisconnect={() => console.log('Disconnected')}
  showAddress={true}
  showBalance={true}
  connectText="Connect Wallet"
/>

{/* Or use render props for custom UI */}
<WalletConnect
  renderConnected={({ address, balance, disconnect }) => (
    <button onClick={disconnect}>{address} ({balance} ETH)</button>
  )}
  renderDisconnected={({ connect, loading }) => (
    <button onClick={connect} disabled={loading}>Connect</button>
  )}
/>
```

### KYCFlow

```tsx
import { KYCFlow } from '@tokenisation/sdk-react';

<KYCFlow
  requiredLevel="standard"
  onComplete={(verification) => {
    console.log('KYC complete:', verification.status);
  }}
  onStatusChange={(status) => {
    console.log('Status:', status);
  }}
/>
```

### DocumentUpload

```tsx
import { DocumentUpload } from '@tokenisation/sdk-react';

<DocumentUpload
  assetId="asset_123"
  documentType="title_deed"
  acceptedMimeTypes={['application/pdf', 'image/jpeg']}
  maxSize={10 * 1024 * 1024}  // 10 MB
  onUpload={(doc) => console.log('Uploaded:', doc.id)}
  onError={(err, file) => console.error('Upload failed:', file.name, err)}
/>
```

### IdentityOnboarding

5-step wizard: Connect Wallet → KYC → On-Chain Identity → Claim Topics → Complete.

```tsx
import { IdentityOnboarding } from '@tokenisation/sdk-react';

<IdentityOnboarding
  requiredLevel="enhanced"
  claimTopics={['COUNTRY', 'ACCREDITATION']}
  onComplete={(result) => {
    console.log('Onboarded:', result.walletAddress, result.kycLevel);
  }}
  onStepChange={(step) => console.log('Step:', step)}
/>
```

### NetworkStatusIndicator

```tsx
import { NetworkStatusIndicator } from '@tokenisation/sdk-react';

<NetworkStatusIndicator
  variant="badge"        // 'dot' | 'badge' | 'detailed'
  pingInterval={30000}   // Check every 30s
  onStatusChange={(s) => console.log('API:', s)}  // 'healthy' | 'degraded' | 'unhealthy'
/>
```

### WalletRegistry

Multi-wallet management:

```tsx
import { WalletRegistry } from '@tokenisation/sdk-react';

<WalletRegistry
  partyId="investor_123"
  maxWallets={5}
  onBind={(binding) => console.log('Wallet bound:', binding.walletAddress)}
>
  {({ bindings, bind, unbind, setPrimary }) => (
    <ul>
      {bindings.map(b => (
        <li key={b.id}>
          {b.walletAddress} {b.isPrimary && '(Primary)'}
          <button onClick={() => setPrimary(b.id)}>Set Primary</button>
          <button onClick={() => unbind(b.walletAddress)}>Remove</button>
        </li>
      ))}
      <button onClick={() => bind()}>Add Wallet</button>
    </ul>
  )}
</WalletRegistry>
```

---

## 5. UI-Kit Components

The `@tokenisation/ui-kit` package provides 50+ production-ready components. It uses its own provider and theme system.

### Setup

```tsx
import { Tokenisation, TokenisationProvider, ThemeProvider } from '@tokenisation/ui-kit';
import '@tokenisation/ui-kit/styles';

// Initialize the client
const client = await Tokenisation.init({
  publishableKey: 'pk_test_xxx',
  theme: 'dark',
});

function App() {
  return (
    <TokenisationProvider client={client}>
      <YourApp />
    </TokenisationProvider>
  );
}
```

### Key Components

#### PropertyCard

```tsx
import { PropertyCard } from '@tokenisation/ui-kit';

<PropertyCard
  name="Marina Gate Tower 1"
  location="Dubai Marina"
  type="residential"
  valuationAED={385_000_000}
  yield={7.2}
  occupancy={94}
  tokenized={true}
  status="Live"
  onClick={() => navigate(`/property/${id}`)}
/>
```

#### PortfolioDashboard

```tsx
import { PortfolioDashboard } from '@tokenisation/ui-kit';

<PortfolioDashboard
  holdings={[
    {
      assetId: 'asset_1',
      assetName: 'Marina Gate Tower',
      tokenBalance: '50000',
      currentValue: 625000,
      costBasis: 500000,
      currency: 'AED',
      change24h: 2.3,
    },
  ]}
  totalValue={625000}
  totalCost={500000}
  currency="AED"
  onAssetClick={(id) => navigate(`/property/${id}`)}
/>
```

#### TransactionFlow

End-to-end transaction component with compliance check, gas estimation, wallet signing, and confirmation tracking:

```tsx
import { TransactionFlow } from '@tokenisation/ui-kit';

<TransactionFlow
  action="transfer"
  params={{
    token: 'token_123',
    from: '0xSeller...',
    to: '0xBuyer...',
    amount: '10000',
  }}
  apiUrl="/api"
  apiKey="ak_test_xxx"
  onComplete={(receipt) => console.log('Confirmed:', receipt.txHash)}
  onError={(err) => console.error('Failed:', err)}
/>
```

#### KYCModal

```tsx
import { KYCModal } from '@tokenisation/ui-kit';

<KYCModal
  isOpen={showKYC}
  onClose={() => setShowKYC(false)}
  onComplete={(result) => {
    console.log('KYC:', result.status, result.tier);
    setShowKYC(false);
  }}
  config={{ requiredTier: 'ENHANCED' }}
/>
```

#### InvestButton

One-click invest button that orchestrates KYC → Wallet → Confirm → Execute:

```tsx
import { InvestButton } from '@tokenisation/ui-kit';

<InvestButton
  assetId="asset_123"
  amount="50000"
  requiresKyc={true}
  label="Invest Now"
  onSuccess={(txHash) => console.log('Invested:', txHash)}
  onError={(err) => console.error(err)}
/>
```

#### ComplianceStepper

Visual step progress for multi-step compliance workflows:

```tsx
import { ComplianceStepper } from '@tokenisation/ui-kit';

<ComplianceStepper
  steps={[
    { label: 'Personal Info', status: 'completed' },
    { label: 'Identity Verification', status: 'active' },
    { label: 'Accreditation', status: 'pending' },
    { label: 'Approval', status: 'pending' },
  ]}
/>
```

#### StatusBadge

```tsx
import { StatusBadge } from '@tokenisation/ui-kit';

<StatusBadge variant="success" label="Live" />
<StatusBadge variant="warning" label="Pending" />
<StatusBadge variant="error" label="Frozen" />
<StatusBadge variant="info" label="Distributing" />
```

---

## 6. Theming

The UI-Kit uses CSS variables for theming:

```tsx
import { createTheme, ThemeProvider } from '@tokenisation/ui-kit';

const theme = createTheme({
  mode: 'dark',
  colors: {
    primary: '#F8B032',
    secondary: '#6366f1',
    accent: '#22c55e',
    background: '#0B0E14',
  },
  fonts: {
    heading: 'Lexend Deca, sans-serif',
    body: 'Inter, system-ui, sans-serif',
    mono: 'JetBrains Mono, monospace',
  },
});

<ThemeProvider theme={theme}>
  <App />
</ThemeProvider>
```

---

## 7. Internationalisation

Built-in i18n with English, Arabic, and French:

```tsx
import { I18nProvider, useTranslation } from '@tokenisation/ui-kit';

<I18nProvider locale="ar" direction="rtl">
  <App />
</I18nProvider>

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('portfolio.title')}</h1>;
}
```

---

## 8. Patterns & Best Practices

### Graceful Fallback Pattern

The real estate reference app uses a pattern for graceful SDK degradation — showing mock data when the API is unavailable:

```tsx
function useSDKWithFallback<T>(
  sdkCall: () => Promise<T>,
  fallbackData: T,
  deps: any[] = []
) {
  const [data, setData] = useState<T>(fallbackData);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    sdkCall()
      .then((result) => {
        if (result != null) {
          setData(result);
          setIsLive(true);
        }
      })
      .catch(() => {
        // Silently fall back to mock data
      })
      .finally(() => setLoading(false));
  }, deps);

  return { data, loading, isLive };
}

// Usage
const { data: properties, isLive } = useSDKWithFallback(
  () => listAssets().then(assets => assets.map(assetToDubaiProperty)),
  MOCK_PROPERTIES,
);

{isLive && <span className="text-green-500">Live</span>}
```

### Data Mapping

When your app uses domain-specific types (e.g., `DubaiProperty`) rather than raw SDK types, create mappers:

```tsx
// src/utils/mappers.ts
import { mapCoreStateToRealEstate } from '@tokenisation/sdk';

export function assetToDubaiProperty(asset: Asset): DubaiProperty {
  return {
    id: asset.id,
    name: asset.name,
    status: mapCoreStateToRealEstate(asset.state),
    valuation: asset.metadata?.valuationAed,
    // ... map all fields
  };
}
```

### Combining Providers

When using both `sdk-react` and `ui-kit`, nest them:

```tsx
<TokenisationProvider config={sdkConfig}>      {/* sdk-react */}
  <UIKitProvider client={uiClient}>             {/* ui-kit */}
    <QueryClientProvider client={queryClient}>   {/* react-query */}
      <RouterProvider router={router} />
    </QueryClientProvider>
  </UIKitProvider>
</TokenisationProvider>
```

---

## 9. Callbacks

Register callbacks for cross-cutting concerns:

```tsx
<TokenisationProvider
  config={config}
  callbacks={{
    onWalletConnect: (wallet) => analytics.track('wallet_connected', wallet),
    onTransactionConfirm: (txHash) => toast.success(`Transaction confirmed: ${txHash}`),
    onComplianceDecision: (decision, receipt) => {
      if (decision.result === 'deny') {
        toast.error(`Compliance denied: ${decision.reasons.join(', ')}`);
      }
    },
    onKYCStatusChange: (status) => {
      if (status === 'approved') router.navigate('/investor/portfolio');
    },
    onAssetStateChange: (assetId, newState) => {
      queryClient.invalidateQueries(['asset', assetId]);
    },
  }}
>
```

---

## Next Steps

- [Building a Real Estate App](./BUILDING_REAL_ESTATE_APP.md) — End-to-end tutorial for building a full React real estate platform
- [Real Estate Tokenisation Guide](./REAL_ESTATE.md) — Backend/API workflow for tokenising properties
- [Compliance Engine Guide](./COMPLIANCE.md) — Policy creation, evaluation, and decision receipts
- [Webhooks Guide](./WEBHOOKS.md) — Real-time event notifications
