# UI Kit Guide

## Overview

The `@tokenisation/ui-kit` provides drop-in React components for building tokenization interfaces. Think "Stripe Elements" for RWA tokenization.

## Installation

```bash
npm install @tokenisation/ui-kit
```

## Components

### TokenisationProvider

Context provider that wraps your app and manages SDK state.

```tsx
import { TokenisationProvider } from '@tokenisation/ui-kit';

function App() {
  return (
    <TokenisationProvider
      config={{
        useMockPlugins: true,
        apiUrl: 'http://localhost:3001/api/v1',
      }}
    >
      <YourApp />
    </TokenisationProvider>
  );
}
```

### useTokenisation Hook

Access SDK and state from any component.

```tsx
import { useTokenisation } from '@tokenisation/ui-kit';

function Dashboard() {
  const { sdk, assets, parties, loading, error } = useTokenisation();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <p>Assets: {assets.length}</p>
      <p>Parties: {parties.length}</p>
    </div>
  );
}
```

### KYCModal

KYC verification modal with form inputs.

```tsx
import { KYCModal } from '@tokenisation/ui-kit';

function VerifyButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Verify Identity
      </button>

      <KYCModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onComplete={(result) => {
          console.log('KYC result:', result);
          setShowModal(false);
        }}
        partyId="party-uuid"
      />
    </>
  );
}
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `isOpen` | `boolean` | Modal visibility |
| `onClose` | `() => void` | Close callback |
| `onComplete` | `(result) => void` | Completion callback |
| `partyId` | `string` | Party to verify |

### WalletConnectModal

Wallet connection modal supporting multiple providers.

```tsx
import { WalletConnectModal } from '@tokenisation/ui-kit';

function ConnectWallet() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>
        Connect Wallet
      </button>

      <WalletConnectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onConnect={(address, provider) => {
          console.log('Connected:', address);
          setShowModal(false);
        }}
        supportedWallets={['metamask', 'walletconnect', 'coinbase']}
      />
    </>
  );
}
```

### AssetCard

Display card for a tokenized asset.

```tsx
import { AssetCard } from '@tokenisation/ui-kit';

function AssetList({ assets }) {
  return (
    <div className="asset-grid">
      {assets.map((asset) => (
        <AssetCard
          key={asset.id}
          asset={asset}
          onInvest={() => handleInvest(asset.id)}
          onDetails={() => handleDetails(asset.id)}
          showMetrics
        />
      ))}
    </div>
  );
}
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `asset` | `Asset` | Asset to display |
| `onInvest` | `() => void` | Invest button callback |
| `onDetails` | `() => void` | Details button callback |
| `showMetrics` | `boolean` | Show balance/supply |

### InvestButton

Smart invest button with compliance checks.

```tsx
import { InvestButton } from '@tokenisation/ui-kit';

function InvestForm({ assetId }) {
  return (
    <InvestButton
      assetId={assetId}
      amount="1000"
      onSuccess={(txHash) => {
        console.log('Investment successful:', txHash);
      }}
      onError={(error) => {
        console.error('Investment failed:', error);
      }}
      requireKyc
    />
  );
}
```

### CapTable

Cap table showing all token holders.

```tsx
import { CapTable } from '@tokenisation/ui-kit';

function AssetDetails({ assetId }) {
  return (
    <div>
      <h2>Ownership Distribution</h2>
      <CapTable
        assetId={assetId}
        showPercentages
        onRowClick={(partyId) => handlePartyClick(partyId)}
      />
    </div>
  );
}
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `assetId` | `string` | Asset to display |
| `showPercentages` | `boolean` | Show % ownership |
| `onRowClick` | `(partyId) => void` | Row click handler |
| `limit` | `number` | Max rows to show |

### TransactionHistory

Transaction history table.

```tsx
import { TransactionHistory } from '@tokenisation/ui-kit';

function History({ assetId }) {
  return (
    <TransactionHistory
      assetId={assetId}
      types={['MINT', 'TRANSFER', 'BURN']}
      limit={50}
    />
  );
}
```

## Styling

### CSS Variables

Customize the look with CSS variables:

```css
:root {
  --tk-primary: #3b82f6;
  --tk-secondary: #64748b;
  --tk-success: #22c55e;
  --tk-error: #ef4444;
  --tk-warning: #f59e0b;
  --tk-background: #ffffff;
  --tk-surface: #f8fafc;
  --tk-text: #1e293b;
  --tk-text-secondary: #64748b;
  --tk-border: #e2e8f0;
  --tk-border-radius: 8px;
  --tk-font-family: 'Inter', system-ui, sans-serif;
}
```

### Tailwind Integration

Components are Tailwind-compatible:

```tsx
<AssetCard
  asset={asset}
  className="shadow-lg hover:shadow-xl"
/>
```

## Complete Example

```tsx
import {
  TokenisationProvider,
  useTokenisation,
  KYCModal,
  WalletConnectModal,
  AssetCard,
  InvestButton,
  CapTable,
  TransactionHistory,
} from '@tokenisation/ui-kit';

function App() {
  return (
    <TokenisationProvider config={{ useMockPlugins: true }}>
      <Dashboard />
    </TokenisationProvider>
  );
}

function Dashboard() {
  const { assets, parties, loading } = useTokenisation();
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [showKyc, setShowKyc] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="dashboard">
      <header>
        <button onClick={() => setShowWallet(true)}>Connect Wallet</button>
        <button onClick={() => setShowKyc(true)}>Complete KYC</button>
      </header>

      <section className="assets">
        <h2>Available Assets</h2>
        <div className="grid">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onDetails={() => setSelectedAsset(asset)}
            />
          ))}
        </div>
      </section>

      {selectedAsset && (
        <section className="asset-detail">
          <h2>{selectedAsset.name}</h2>
          <InvestButton assetId={selectedAsset.id} amount="100" />
          <CapTable assetId={selectedAsset.id} showPercentages />
          <TransactionHistory assetId={selectedAsset.id} />
        </section>
      )}

      <KYCModal
        isOpen={showKyc}
        onClose={() => setShowKyc(false)}
        onComplete={() => setShowKyc(false)}
      />

      <WalletConnectModal
        isOpen={showWallet}
        onClose={() => setShowWallet(false)}
        onConnect={(address) => {
          console.log('Connected:', address);
          setShowWallet(false);
        }}
      />
    </div>
  );
}
```

## TypeScript Support

Full TypeScript definitions included:

```tsx
import type { Asset, Party, SDKEvent } from '@tokenisation/ui-kit';

interface MyComponentProps {
  asset: Asset;
  onSelect: (asset: Asset) => void;
}
```

## Related Documents

- [SDK Usage](./SDK_USAGE.md) - SDK API guide
- [Installation](./INSTALLATION.md) - Setup instructions
