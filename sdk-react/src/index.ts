/**
 * @tokenisation/sdk-react
 *
 * React SDK for tokenizing real-world assets with compliance-first architecture.
 *
 * @example
 * ```tsx
 * import {
 *   TokenisationProvider,
 *   useAsset,
 *   useTokens,
 *   useCompliance,
 *   useKYC,
 *   useWallet,
 *   WalletConnect,
 *   KYCFlow,
 *   DocumentUpload,
 * } from '@tokenisation/sdk-react';
 *
 * function App() {
 *   return (
 *     <TokenisationProvider config={{ apiUrl: 'https://api.example.com' }}>
 *       <WalletConnect />
 *       <KYCFlow requiredLevel="standard" />
 *       <DocumentUpload documentType="proof_of_ownership" />
 *     </TokenisationProvider>
 *   );
 * }
 * ```
 */

// Context & Provider
export {
  TokenisationProvider,
  useTokenisation,
  TokenisationContext,
  type TokenisationProviderProps,
} from './context/index.js';

// Hooks
export {
  useAsset,
  useTokens,
  useCompliance,
  useKYC,
  useWallet,
  type UseAssetReturn,
  type UseTokensReturn,
  type UseComplianceReturn,
  type UseKYCReturn,
  type UseWalletReturn,
  type AssetFilter,
  type Evidence,
  type CreateAssetResult,
  type TransitionResult,
  type TokenOperationResult,
  type TokenBalance,
  type TokenHolder,
  type ComplianceCheckResult,
  type TransferCheckParams,
  type MintCheckParams,
  type ReceiptVerification,
  type KYCVerification,
  type KYCInitiateResult,
  type TransactionRequest,
  type TransactionResponse,
} from './hooks/index.js';

// Components
export {
  WalletConnect,
  KYCFlow,
  DocumentUpload,
  type WalletConnectProps,
  type KYCFlowProps,
  type DocumentUploadProps,
} from './components/index.js';

// Types
export type {
  // SDK Configuration
  TokenisationConfig,
  TokenisationContextValue,
  TokenisationCallbacks,
  NetworkConfig,
  StorageConfig,
  KYCProviderConfig,
  CustodyProviderConfig,

  // Wallet
  WalletConnection,
  WalletProvider,
  WalletConnectOptions,

  // Documents
  DocumentMetadata,
  DocumentType,
  UploadedDocument,

  // UI State
  AsyncState,
  AssetFormData,
  KYCFormData,
  TransferFormData,

  // Core types (locally defined)
  Asset,
  TokenInfo,
  Party,
  LifecycleState,
  PolicyDecision,
  PolicyViolation,
  PolicyWarning,
  DecisionReceipt,
  ComplianceAction,
  KYCLevel,
  KYCStatus,
} from './types/index.js';
