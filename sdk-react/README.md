# @tokenisation/sdk-react

React SDK for tokenizing real-world assets with compliance-first architecture.

## Installation

```bash
pnpm add @tokenisation/sdk-react
```

### Peer Dependencies

```bash
pnpm add react react-dom @tokenisation/sdk
```

## Quick Start

```tsx
import {
  TokenisationProvider,
  WalletConnect,
  KYCFlow,
  useAsset,
} from '@tokenisation/sdk-react';

function App() {
  return (
    <TokenisationProvider
      config={{
        apiUrl: 'https://api.your-tokenisation-server.com',
        networks: [
          {
            chainId: 1,
            name: 'Ethereum Mainnet',
            rpcUrl: 'https://eth.llamarpc.com',
            isDefault: true,
          },
        ],
      }}
    >
      <Header />
      <MainContent />
    </TokenisationProvider>
  );
}

function Header() {
  return (
    <nav>
      <WalletConnect
        onConnect={(wallet) => console.log('Connected:', wallet.address)}
        showBalance
      />
    </nav>
  );
}

function MainContent() {
  return (
    <main>
      <KYCFlow
        requiredLevel="standard"
        onComplete={(verification) => console.log('KYC completed:', verification)}
      />
      <AssetCreator />
    </main>
  );
}

function AssetCreator() {
  const { createAsset, loading } = useAsset();

  const handleCreate = async () => {
    const result = await createAsset({
      name: 'My Property Token',
      symbol: 'MPT',
      rightType: 'OWNERSHIP',
      jurisdiction: 'AE',
      totalShares: 1000000,
      pricePerShare: 10,
      documents: [],
    });
    if (result.success) console.log('Asset created:', result.asset);
  };

  return (
    <button onClick={handleCreate} disabled={loading}>Create Asset</button>
  );
}
```

## Provider Configuration

```tsx
<TokenisationProvider
  config={{
    apiUrl: 'https://api.example.com',       // Required
    orgId: 'org-123',                         // Optional: multi-tenant
    defaultJurisdiction: 'AE',               // Optional
    networks: [                               // Optional: supported chains
      { chainId: 1, name: 'Ethereum', rpcUrl: '...', isDefault: true },
      { chainId: 137, name: 'Polygon', rpcUrl: '...' },
      { chainId: 8453, name: 'Base', rpcUrl: '...' },
    ],
    storage: { type: 'ipfs', endpoint: '...' },  // Optional
    kyc: { provider: 'sumsub', apiKey: '...' },   // Optional
    debug: true,                                   // Optional
  }}
  callbacks={{
    onWalletConnect: (wallet) => analytics.track('wallet_connected', wallet),
    onComplianceDecision: (decision) => analytics.track('compliance_check', decision),
  }}
>
  {children}
</TokenisationProvider>
```

## Hooks

### useTokenisation

Access the SDK context.

```tsx
const {
  config,
  isInitialized,
  wallet,
  currentParty,
  connectWallet,
  disconnectWallet,
  switchNetwork,
} = useTokenisation();
```

### useWallet

Extended wallet utilities.

```tsx
const {
  address, chainId, balance, ensName,
  isConnected, isCorrectNetwork,
  connect, disconnect, switchNetwork,
  signMessage, signTypedData, sendTransaction,
} = useWallet();
```

### useKYC

KYC verification flow.

```tsx
const {
  initiateKYC, status, level, verification,
  isAccredited, meetsLevel, screenSanctions,
} = useKYC();

if (meetsLevel('standard')) { /* Allow action */ }

await initiateKYC('enhanced', {
  firstName: 'John', lastName: 'Doe', email: 'john@example.com',
});
```

### useAsset

Asset creation and management.

```tsx
const {
  createAsset, getAsset, listAssets, transitionAsset,
  uploadDocument, getDocuments, currentAsset, loading, error,
} = useAsset();
```

### useTokens

Token operations.

```tsx
const {
  mint, transfer, burn, getBalance,
  getHolders, tokenInfo, totalSupply,
} = useTokens(assetId);
```

### useCompliance

Compliance checking with signed DecisionReceipts.

```tsx
const {
  checkTransfer, checkMint, checkAction,
  getReceipts, verifyReceipt, verifyReceiptChain,
} = useCompliance();

const { decision, receipt } = await checkTransfer({
  assetId: 'asset-123',
  fromAddress: '0x123...', toAddress: '0x456...', amount: '100',
});

if (decision.result === 'ALLOW') {
  // Proceed with transfer
} else {
  decision.violations.forEach((v) => console.log(v.message));
}
```

## Components

### WalletConnect

```tsx
<WalletConnect
  connectText="Connect Wallet"
  showAddress showBalance
  onConnect={(wallet) => console.log(wallet)}
  renderConnected={({ address, balance, disconnect }) => (
    <div><span>{address}</span><button onClick={disconnect}>Logout</button></div>
  )}
/>
```

### KYCFlow

```tsx
<KYCFlow
  requiredLevel="standard"
  autoStart={false}
  onComplete={(verification) => { /* User passed KYC */ }}
  labels={{ startButton: 'Verify Identity', approved: 'Identity Verified' }}
/>
```

### DocumentUpload

```tsx
<DocumentUpload
  assetId={asset.id}
  documentType="proof_of_ownership"
  multiple
  maxSize={10 * 1024 * 1024}
  onUpload={(doc) => console.log('Uploaded:', doc)}
/>
```

## TypeScript Support

```tsx
import type {
  TokenisationConfig, WalletConnection, Asset, TokenInfo,
  PolicyDecision, DecisionReceipt, KYCLevel, KYCStatus,
} from '@tokenisation/sdk-react';
```

## License

MIT
