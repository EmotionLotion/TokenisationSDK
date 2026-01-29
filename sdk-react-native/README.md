# @tokenisation/sdk-react-native

React Native SDK for building mobile applications with tokenized assets. Provides wallet connectivity, token management, KYC verification, and pre-built UI components.

## Installation

```bash
npm install @tokenisation/sdk-react-native
# or
yarn add @tokenisation/sdk-react-native
```

### Peer Dependencies

```bash
npm install react react-native @tokenisation/sdk
```

### Optional Dependencies

For wallet connectivity:
```bash
npm install @walletconnect/modal-react-native
```

For document capture:
```bash
npm install react-native-vision-camera
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
        supportedChains: [1, 137], // Ethereum, Polygon
        appMetadata: {
          name: 'My App',
          description: 'My tokenized asset app',
        },
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

  if (isLoading) return <ActivityIndicator />;

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

  const handleCapture = async (document) => {
    setShowCapture(false);
    await submitDocuments([document]);
    await completeVerification();
  };

  return (
    <View>
      <Text>KYC Status: {status}</Text>
      <Button title="Start KYC" onPress={handleStartKyc} />

      <DocumentCapture
        asModal
        visible={showCapture}
        documentType="drivers_license"
        onCapture={handleCapture}
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
    if (result.status === 'completed') {
      Alert.alert('Success', 'Investment completed!');
    }
  };

  if (isLoading) return <ActivityIndicator />;

  return (
    <View>
      <Text>{asset.name}</Text>
      <Text>Price: {asset.tokenPrice} {asset.currency}</Text>
      <Text>Min. Investment: {asset.minimumInvestment}</Text>

      {canInvest && (
        <Button title="Invest Now" onPress={handleInvest} />
      )}
    </View>
  );
}
```

## API Reference

### Provider

#### `TokenisationProvider`

Root provider component that must wrap your application.

```tsx
<TokenisationProvider config={config}>
  {children}
</TokenisationProvider>
```

**Config options:**
- `apiKey` (required): Your API key
- `baseUrl`: API base URL (defaults to production)
- `walletConnectProjectId`: WalletConnect project ID for mobile wallet connectivity
- `supportedChains`: Array of supported chain IDs
- `autoConnect`: Auto-connect wallet on mount
- `debug`: Enable debug logging
- `appMetadata`: App metadata for WalletConnect

### Hooks

#### `useWallet()`

Wallet connection and management.

```tsx
const {
  isConnected,
  isConnecting,
  address,
  shortAddress,
  chainId,
  chainName,
  error,
  connect,
  disconnect,
  switchChain,
  signMessage,
  getBalance,
  isChainSupported,
} = useWallet();
```

#### `useTokens(options?)`

Token listing and management.

```tsx
const {
  tokens,
  holdings,
  isLoading,
  error,
  refresh,
  getToken,
  getHolding,
  transfer,
  totalValue,
  hasTokens,
} = useTokens({
  refreshInterval: 30000,
  chainId: 1,
  activeOnly: true,
});
```

#### `useKYC()`

KYC verification management.

```tsx
const {
  status,
  level,
  verification,
  isLoading,
  error,
  startVerification,
  submitDocuments,
  submitSelfie,
  completeVerification,
  refresh,
  checkStatus,
  isVerified,
  needsVerification,
  canInvest,
} = useKYC();
```

#### `useAsset(assetId, options?)`

Individual asset management.

```tsx
const {
  asset,
  investment,
  isLoading,
  error,
  refresh,
  invest,
  canInvest,
  isInvested,
  remainingSupply,
  percentFunded,
} = useAsset('ast_123', {
  refreshInterval: 30000,
  includeInvestment: true,
});
```

### Components

#### `WalletConnectButton`

Pre-built wallet connection button.

```tsx
<WalletConnectButton
  variant="primary" // 'primary' | 'secondary' | 'outline'
  size="medium"     // 'small' | 'medium' | 'large'
  showAddress
  showChain
  onConnect={() => {}}
  onDisconnect={() => {}}
  onError={(error) => {}}
/>
```

#### `DocumentCapture`

Camera-based document scanning for KYC.

```tsx
<DocumentCapture
  documentType="drivers_license"
  asModal
  visible={showCapture}
  hasBackSide
  onCapture={(document) => {}}
  onCancel={() => {}}
/>
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions. All hooks and components are fully typed.

```tsx
import type {
  Token,
  TokenHolding,
  Asset,
  KycStatus,
  WalletState,
} from '@tokenisation/sdk-react-native';
```

## Platform Support

- iOS 13+
- Android API 21+
- React Native 0.72+

## License

MIT
