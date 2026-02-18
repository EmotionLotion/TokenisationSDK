# @tokenisation/sdk-react-native

React Native SDK for building mobile applications with tokenized assets. Provides wallet connectivity, token management, KYC verification, and pre-built UI components.

## Installation

```bash
pnpm add @tokenisation/sdk-react-native
```

### Peer Dependencies

```bash
pnpm add react react-native @tokenisation/sdk
```

### Optional Dependencies

For wallet connectivity:
```bash
pnpm add @walletconnect/modal-react-native
```

For document capture:
```bash
pnpm add react-native-vision-camera
```

## Quick Start

### 1. Wrap your app with the provider

```tsx
import { TokenisationProvider } from '@tokenisation/sdk-react-native';

function App() {
  return (
    <TokenisationProvider
      config={{
        apiKey: 'your-api-key',
        walletConnectProjectId: 'your-wc-project-id',
        supportedChains: [1, 137, 8453], // Ethereum, Polygon, Base
        appMetadata: { name: 'My App', description: 'My tokenized asset app' },
      }}
    >
      <MainNavigator />
    </TokenisationProvider>
  );
}
```

### 2. Connect a wallet

```tsx
import { useWallet, WalletConnectButton } from '@tokenisation/sdk-react-native';

function WalletScreen() {
  const { isConnected, address, connect, disconnect } = useWallet();

  return (
    <View>
      <WalletConnectButton
        variant="primary"
        showAddress
        onConnect={() => console.log('Connected!')}
      />
    </View>
  );
}
```

### 3. Display token holdings

```tsx
import { useTokens } from '@tokenisation/sdk-react-native';

function PortfolioScreen() {
  const { holdings, isLoading, refresh } = useTokens();

  return (
    <FlatList
      data={holdings}
      renderItem={({ item }) => (
        <View>
          <Text>{item.token.name}</Text>
          <Text>{item.balanceFormatted} {item.token.symbol}</Text>
        </View>
      )}
      onRefresh={refresh}
      refreshing={isLoading}
    />
  );
}
```

### 4. KYC Verification

```tsx
import { useKYC, DocumentCapture } from '@tokenisation/sdk-react-native';

function KycScreen() {
  const [showCapture, setShowCapture] = useState(false);
  const { status, startVerification, submitDocuments, completeVerification } = useKYC();

  const handleStartKyc = async () => {
    await startVerification('standard');
    setShowCapture(true);
  };

  return (
    <View>
      <Text>KYC Status: {status}</Text>
      <Button title="Start KYC" onPress={handleStartKyc} />
      <DocumentCapture
        asModal visible={showCapture}
        documentType="drivers_license"
        onCapture={async (doc) => { setShowCapture(false); await submitDocuments([doc]); }}
        onCancel={() => setShowCapture(false)}
      />
    </View>
  );
}
```

### 5. Asset Investment

```tsx
import { useAsset } from '@tokenisation/sdk-react-native';

function AssetDetailScreen({ assetId }) {
  const { asset, canInvest, invest, isLoading } = useAsset(assetId);

  const handleInvest = async () => {
    const result = await invest({ amount: '1000' });
    if (result.status === 'completed') Alert.alert('Success', 'Investment completed!');
  };

  if (isLoading) return <ActivityIndicator />;

  return (
    <View>
      <Text>{asset.name}</Text>
      <Text>Price: {asset.tokenPrice} {asset.currency}</Text>
      {canInvest && <Button title="Invest Now" onPress={handleInvest} />}
    </View>
  );
}
```

## Provider Configuration

```tsx
<TokenisationProvider config={config}>
  {children}
</TokenisationProvider>
```

**Config options:**
- `apiKey` (required) — Your API key
- `baseUrl` — API base URL (defaults to production)
- `walletConnectProjectId` — WalletConnect project ID for mobile wallet connectivity
- `supportedChains` — Array of supported chain IDs (default: Ethereum, Polygon)
- `autoConnect` — Auto-connect wallet on mount
- `debug` — Enable debug logging
- `appMetadata` — App metadata for WalletConnect

## Hooks

### useWallet()

Wallet connection and management. Balances and message signing are routed through the API client with local fallbacks.

```tsx
const {
  isConnected, isConnecting, address, shortAddress,
  chainId, chainName, error,
  connect, disconnect, switchChain, signMessage,
  getBalance, isChainSupported,
} = useWallet();
```

Supported chains: Ethereum, Polygon, Base, Arbitrum, Optimism, BNB Chain, Avalanche + testnets.

### useTokens(options?)

```tsx
const {
  tokens, holdings, isLoading, error, refresh,
  getToken, getHolding, transfer, totalValue, hasTokens,
} = useTokens({ refreshInterval: 30000, chainId: 1, activeOnly: true });
```

### useKYC()

```tsx
const {
  status, level, verification, isLoading, error,
  startVerification, submitDocuments, submitSelfie,
  completeVerification, refresh, checkStatus,
  isVerified, needsVerification, canInvest,
} = useKYC();
```

### useAsset(assetId, options?)

```tsx
const {
  asset, investment, isLoading, error, refresh,
  invest, canInvest, isInvested, remainingSupply, percentFunded,
} = useAsset('ast_123', { refreshInterval: 30000, includeInvestment: true });
```

## Components

### WalletConnectButton

```tsx
<WalletConnectButton
  variant="primary"  // 'primary' | 'secondary' | 'outline'
  size="medium"      // 'small' | 'medium' | 'large'
  showAddress showChain
  onConnect={() => {}} onDisconnect={() => {}} onError={(e) => {}}
/>
```

### DocumentCapture

Camera-based document scanning for KYC.

```tsx
<DocumentCapture
  documentType="drivers_license"
  asModal visible={show}
  hasBackSide
  onCapture={(doc) => {}} onCancel={() => {}}
/>
```

## TypeScript Support

```tsx
import type {
  Token, TokenHolding, Asset, KycStatus, WalletState,
} from '@tokenisation/sdk-react-native';
```

## Platform Support

- iOS 13+
- Android API 21+
- React Native 0.72+

## License

MIT
