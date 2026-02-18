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
  useTokenBalance,
  useAuthExpiring,
  type UseAssetReturn,
  type UseTokensReturn,
  type UseComplianceReturn,
  type UseKYCReturn,
  type UseWalletReturn,
  type UseTokenBalanceReturn,
  type UseTokenBalanceOptions,
  type UseAuthExpiringReturn,
  type UseAuthExpiringOptions,
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
  useEventStream,
  type UseEventStreamReturn,
  type UseEventStreamOptions,
  type EventStreamFilters,
  type StreamEvent,
  type ConnectionStatus,
  useGasEstimate,
  type UseGasEstimateReturn,
  type UseGasEstimateOptions,
  type GasEstimateResult,
  type GasOperation,
  // New hooks (Gaps 1, 3, 10, 11)
  useTransaction,
  useCapTable,
  useAuditLog,
  useOfflineStatus,
  // Phase 3: Domain hooks
  useTransfer,
  useGovernance,
  useCashFlow,
  useEscrow,
  useInvestor,
  useDLD,
  useLegal,
  useWebhooks,
  useProject,
  type UseTransferReturn,
  type TransferData,
  type CreateTransferParams,
  type TransferPreflightResult,
  type UseGovernanceReturn,
  type ProposalData,
  type VotingPowerData,
  type UseCashFlowReturn,
  type DistributionData,
  type DistributionScheduleData,
  type UseEscrowReturn,
  type EscrowData,
  type UseInvestorReturn,
  type InvestorData,
  type UseDLDReturn,
  type TitleDeedData,
  type UseLegalReturn,
  type SanctionsResult,
  type KYCStatusResult,
  type UseWebhooksReturn,
  type WebhookData,
  type WebhookDeliveryData,
  type UseProjectReturn,
  type ProjectData,
  // Phase 2: Real Estate Hardening
  useInvestorTier,
  type UseInvestorTierReturn,
  type InvestorPlan,
  type TierEligibilityResult,
  useExitWindow,
  type UseExitWindowReturn,
  useSecondaryMarket,
  type UseSecondaryMarketReturn,
  useResale,
  type UseResaleReturn,
} from './hooks/index.js';

// Components
export {
  WalletConnect,
  KYCFlow,
  DocumentUpload,
  NetworkStatusIndicator,
  IdentityOnboarding,
  WalletRegistry,
  type WalletConnectProps,
  type KYCFlowProps,
  type DocumentUploadProps,
  type NetworkStatusIndicatorProps,
  type IdentityOnboardingProps,
  type WalletRegistryProps,
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
