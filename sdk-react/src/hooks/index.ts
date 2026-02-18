/**
 * Hooks exports
 *
 * All hooks for the Tokenisation React SDK.
 */

export { useAsset, type UseAssetReturn, type AssetFilter, type Evidence, type CreateAssetResult, type TransitionResult } from './useAsset.js';
export { useTokens, type UseTokensReturn, type TokenOperationResult, type TokenBalance, type TokenHolder } from './useTokens.js';
export { useCompliance, type UseComplianceReturn, type ComplianceCheckResult, type TransferCheckParams, type MintCheckParams, type ReceiptVerification } from './useCompliance.js';
export { useKYC, type UseKYCReturn, type KYCVerification, type KYCInitiateResult } from './useKYC.js';
export { useWallet, type UseWalletReturn, type TransactionRequest, type TransactionResponse } from './useWallet.js';
export { useTokenBalance, type UseTokenBalanceReturn, type UseTokenBalanceOptions } from './useTokenBalance.js';
export { useAuthExpiring, type UseAuthExpiringReturn, type UseAuthExpiringOptions } from './useAuthExpiring.js';
export { useEventStream, type UseEventStreamReturn, type UseEventStreamOptions, type EventStreamFilters, type StreamEvent, type ConnectionStatus } from './useEventStream.js';
export { useGasEstimate, type UseGasEstimateReturn, type UseGasEstimateOptions, type GasEstimateResult, type GasOperation } from './useGasEstimate.js';
export { useTransaction, type UseTransactionReturn, type TransactionStep, type TransactionAction, type TransactionParams, type TransactionReceipt, type StepData } from './useTransaction.js';
export { useCapTable, type UseCapTableReturn, type UseCapTableOptions, type CapTableData, type CapTableHolder } from './useCapTable.js';
export { useAuditLog, type UseAuditLogReturn, type UseAuditLogOptions, type AuditLogFilters, type AuditEntry } from './useAuditLog.js';
export { useOfflineStatus, type OfflineStatusResult, type UseOfflineStatusOptions } from './useOfflineStatus.js';

// Phase 3: New domain hooks
export { useTransfer, type UseTransferReturn, type TransferData, type CreateTransferParams, type TransferPreflightResult } from './useTransfer.js';
export { useGovernance, type UseGovernanceReturn, type ProposalData, type VotingPowerData } from './useGovernance.js';
export { useCashFlow, type UseCashFlowReturn, type DistributionData, type DistributionScheduleData } from './useCashFlow.js';
export { useEscrow, type UseEscrowReturn, type EscrowData } from './useEscrow.js';
export { useInvestor, type UseInvestorReturn, type InvestorData } from './useInvestor.js';
export {
  useDLD,
  type UseDLDReturn,
  type TitleDeedData,
  type TitleStatus,
  type PropertyType,
  type SyncJobType,
  type SyncJobStatus,
  type DLDEventType,
  type RegisterTitleInput,
  type UpdateTitleInput,
  type DLDEvent,
  type IngestEventInput,
  type SyncJob,
  type CreateSyncJobInput,
  type TitleClearCheck,
  type OnChainVerificationResult,
  type TitleFilters,
  type EventFilters,
  type SyncJobFilters,
} from './useDLD.js';
export {
  usePropertyManagement,
  type UsePropertyManagementReturn,
  type PropertyUnit,
  type AddUnitInput,
  type UpdateUnitInput,
  type MaintenanceRequest,
  type CreateMaintenanceInput,
  type UpdateMaintenanceInput,
  type PropertyExpense,
  type RecordExpenseInput,
  type MaintenanceFilters,
  type ExpenseFilters,
  type PropertySummary,
  type OccupancyData,
  type UnitType,
  type UnitStatus,
  type MaintenancePriority,
  type MaintenanceStatus,
  type ExpenseCategory,
} from './usePropertyManagement.js';
export { useLegal, type UseLegalReturn, type SanctionsResult, type KYCStatusResult } from './useLegal.js';
export { useWebhooks, type UseWebhooksReturn, type WebhookData, type WebhookDeliveryData } from './useWebhooks.js';
export { useProject, type UseProjectReturn, type ProjectData } from './useProject.js';

// Phase 2: Real Estate Hardening hooks
export { useInvestorTier, type UseInvestorTierReturn, type InvestorPlan, type TierEligibilityResult, type InvestorTier } from './useInvestorTier.js';
export { useExitWindow, type UseExitWindowReturn, type ExitWindow, type ExitWindowSchedule } from './useExitWindow.js';
export { useSecondaryMarket, type UseSecondaryMarketReturn, type SecondaryListing } from './useSecondaryMarket.js';

/** @deprecated Use useSecondaryMarket instead */
export { useResale, type UseResaleReturn, type ResaleListing } from './useResale.js';
