/**
 * Server Interfaces - External Provider Integration Points
 *
 * These interfaces define contracts for server-side integrations with:
 * - Jurisdiction providers (DLD, SEC, MAS)
 * - Custody providers (Fireblocks, BitGo)
 * - KYC providers (Onfido, Jumio)
 */

// Re-export all interfaces
export * from './IJurisdictionProvider.js';
export * from './ICustodyProvider.js';
export * from './IKYCProvider.js';

// Type aliases for convenience
export type {
  IJurisdictionProvider,
  OwnershipParams,
  OwnershipResult,
  NotificationParams,
  NotificationResult,
  ValuationResult,
  ComplianceRequirements,
} from './IJurisdictionProvider.js';

export type {
  ICustodyProvider,
  WalletType,
  CreateWalletParams,
  Wallet,
  SignTxParams,
  SignedTransaction,
  TransactionStatus,
  WalletBalance,
} from './ICustodyProvider.js';

export type {
  IKYCProvider,
  KYCLevel,
  KYCStatusType,
  DocumentType,
  InitiateParams,
  KYCSession,
  KYCStatus,
  DocumentParams,
  DocumentResult,
  WebhookResult,
  SanctionsResult,
} from './IKYCProvider.js';
