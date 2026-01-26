# @tokenisation/sdk-react

React SDK for tokenizing real-world assets with compliance-first architecture.

## Installation

```bash
npm install @tokenisation/sdk-react
# or
yarn add @tokenisation/sdk-react
# or
pnpm add @tokenisation/sdk-react
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
        onComplete={(verification) => {
          console.log('KYC completed:', verification);
        }}
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

    if (result.success) {
      console.log('Asset created:', result.asset);
    }
  };

  return (
    <button onClick={handleCreate} disabled={loading}>
      Create Asset
    </button>
  );
}
```

## Provider Configuration

```tsx
<TokenisationProvider
  config={{
    // Required: API endpoint
    apiUrl: 'https://api.example.com',

    // Optional: Organization ID for multi-tenant
    orgId: 'org-123',

    // Optional: Default jurisdiction
    defaultJurisdiction: 'AE',

    // Optional: Supported networks
    networks: [
      {
        chainId: 1,
        name: 'Ethereum',
        rpcUrl: 'https://eth.llamarpc.com',
        blockExplorerUrl: 'https://etherscan.io',
        isDefault: true,
      },
      {
        chainId: 137,
        name: 'Polygon',
        rpcUrl: 'https://polygon.llamarpc.com',
        blockExplorerUrl: 'https://polygonscan.com',
      },
    ],

    // Optional: Custom storage for documents
    storage: {
      type: 'ipfs',
      endpoint: 'https://ipfs.infura.io:5001',
      apiKey: 'your-api-key',
    },

    // Optional: KYC provider
    kyc: {
      provider: 'onfido',
      apiKey: 'your-api-key',
    },

    // Optional: Debug mode
    debug: true,
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
  address,
  chainId,
  balance,
  ensName,
  isConnected,
  isCorrectNetwork,
  connect,
  disconnect,
  switchNetwork,
  signMessage,
  signTypedData,
  sendTransaction,
} = useWallet();
```

### useKYC

KYC verification flow.

```tsx
const {
  initiateKYC,
  status,
  level,
  verification,
  isAccredited,
  meetsLevel,
  screenSanctions,
} = useKYC();

// Check if user meets required level
if (meetsLevel('standard')) {
  // Allow action
}

// Initiate KYC
await initiateKYC('enhanced', {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
});
```

### useAsset

Asset creation and management.

```tsx
const {
  createAsset,
  getAsset,
  listAssets,
  transitionAsset,
  uploadDocument,
  getDocuments,
  currentAsset,
  loading,
  error,
} = useAsset();

// Create an asset
const result = await createAsset({
  name: 'Property Token',
  symbol: 'PROP',
  rightType: 'OWNERSHIP',
  jurisdiction: 'AE',
  totalShares: 1000000,
  documents: [file1, file2],
});

// List assets
const assets = await listAssets({
  state: 'ACTIVE',
  jurisdiction: 'AE',
});

// Transition state
await transitionAsset(assetId, 'VERIFIED', {
  type: 'legal_review',
  data: { reviewedBy: 'legal@example.com' },
});
```

### useTokens

Token operations.

```tsx
const {
  mint,
  transfer,
  burn,
  getBalance,
  getHolders,
  tokenInfo,
  totalSupply,
} = useTokens(assetId);

// Mint tokens
await mint('0x123...', '1000');

// Transfer tokens
await transfer('0x123...', '0x456...', '100');

// Get balance
const balance = await getBalance('0x123...');
```

### useCompliance

Compliance checking.

```tsx
const {
  checkTransfer,
  checkMint,
  checkAction,
  getReceipts,
  verifyReceipt,
  verifyReceiptChain,
} = useCompliance();

// Check if transfer is allowed
const { decision, receipt } = await checkTransfer({
  assetId: 'asset-123',
  fromAddress: '0x123...',
  toAddress: '0x456...',
  amount: '100',
});

if (decision.result === 'ALLOW') {
  // Proceed with transfer
} else {
  // Show violations
  decision.violations.forEach((v) => console.log(v.message));
}

// Get audit trail
const receipts = await getReceipts(assetId);

// Verify receipt integrity
const verification = await verifyReceipt(receiptId);
```

## Components

### WalletConnect

```tsx
<WalletConnect
  connectText="Connect Wallet"
  disconnectText="Disconnect"
  showAddress
  showBalance
  onConnect={(wallet) => console.log(wallet)}
  onDisconnect={() => console.log('disconnected')}
  onError={(error) => console.error(error)}
  // Custom rendering
  renderConnected={({ address, balance, disconnect }) => (
    <div>
      <span>{address}</span>
      <button onClick={disconnect}>Logout</button>
    </div>
  )}
/>
```

### KYCFlow

```tsx
<KYCFlow
  requiredLevel="standard"
  autoStart={false}
  onComplete={(verification) => {
    // User passed KYC
  }}
  onStatusChange={(status) => {
    // Track status changes
  }}
  labels={{
    startButton: 'Verify Identity',
    approved: 'Identity Verified',
  }}
/>
```

### DocumentUpload

```tsx
<DocumentUpload
  assetId={asset.id}
  documentType="proof_of_ownership"
  acceptedTypes={['proof_of_ownership', 'valuation_report']}
  multiple
  maxSize={10 * 1024 * 1024} // 10MB
  onUpload={(doc) => console.log('Uploaded:', doc)}
  onError={(error, file) => console.error(error)}
/>
```

## TypeScript Support

The SDK is written in TypeScript and exports all types.

```tsx
import type {
  TokenisationConfig,
  WalletConnection,
  Asset,
  TokenInfo,
  PolicyDecision,
  DecisionReceipt,
  KYCLevel,
  KYCStatus,
  DocumentType,
} from '@tokenisation/sdk-react';
```

## License

MIT
