/**
 * Tokenisation SDK for React Native
 *
 * Mobile-first SDK for building tokenized asset applications with React Native.
 * Provides wallet connectivity, token management, KYC verification, and
 * pre-built UI components.
 *
 * @packageDocumentation
 *
 * @example Basic setup
 * ```tsx
 * import {
 *   TokenisationProvider,
 *   useWallet,
 *   useTokens,
 *   WalletConnectButton,
 * } from '@tokenisation/sdk-react-native';
 *
 * function App() {
 *   return (
 *     <TokenisationProvider
 *       config={{
 *         apiKey: 'your-api-key',
 *         walletConnectProjectId: 'your-wc-project-id',
 *         supportedChains: [1, 137],
 *       }}
 *     >
 *       <MainNavigator />
 *     </TokenisationProvider>
 *   );
 * }
 * ```
 */

// Context & Provider
export {
  TokenisationProvider,
  useTokenisation,
  type TokenisationProviderConfig,
  type TokenisationContextValue,
  type WalletState,
  type UserState,
  type TransactionRequest,
} from './context/TokenisationProvider.js';

// Hooks
export {
  useWallet,
  type UseWalletReturn,
  type WalletBalance,
  type TokenBalance,
} from './hooks/useWallet.js';

export {
  useTokens,
  type UseTokensReturn,
  type UseTokensOptions,
  type Token,
  type TokenHolding,
  type VestingSchedule,
  type TransferRequest,
  type TransferResult,
} from './hooks/useTokens.js';

export {
  useKYC,
  type UseKycReturn,
  type KycStatus,
  type KycLevel,
  type DocumentType,
  type DocumentCapture as DocumentCaptureData,
  type SelfieCapture,
  type KycVerification,
  type KycSubmissionRequest,
} from './hooks/useKYC.js';

export {
  useAsset,
  type UseAssetReturn,
  type UseAssetOptions,
  type Asset,
  type AssetState,
  type AssetType,
  type AssetDocument,
  type UserInvestment,
  type InvestmentRequest,
  type InvestmentResult,
} from './hooks/useAsset.js';

// Components
export {
  WalletConnectButton,
  type WalletConnectButtonProps,
  type ButtonVariant,
  type ButtonSize,
} from './components/WalletConnectButton.js';

export {
  DocumentCapture,
  type DocumentCaptureProps,
} from './components/DocumentCapture.js';
