/**
 * Plugins module exports
 *
 * This module contains the plugin system including the registry, mock implementations,
 * and production plugins for API, blockchain, and Chainlink integrations.
 */

// Core registry
export * from './PluginRegistry.js';

// Browser plugins (MVP)
export * from './BrowserStoragePlugin.js';
export * from './BrowserEventStore.js';

// Mock plugins (testing/development)
export {
  MockJurisdictionPlugin,
  createMockJurisdictionPlugin,
  type MockJurisdictionConfig,
  type MockJurisdictionRule,
  MockCompliancePlugin,
  createMockCompliancePlugin,
  type MockComplianceConfig,
  MockStoragePlugin,
  createMockStoragePlugin,
  type MockStorageConfig,
} from './mocks/index.js';

// API plugins (production persistence)
export * from './api/index.js';

// Chain plugins (multi-chain support)
export * from './chain/index.js';

// Chainlink plugins (oracles and cross-chain)
export * from './chainlink/index.js';

// Auth plugins (SIWE)
export * from './auth/index.js';

// Carbon Oracle plugins (emission factors)
export * from './carbon/index.js';

// Storage plugins (S3, IPFS)
export * from './storage/index.js';

// Compliance plugins (Jurisdiction, KYC)
export {
  JurisdictionPlugin,
  createJurisdictionPlugin,
  type JurisdictionPluginConfig,
  type JurisdictionRule,
  type RegulatoryFramework,
  type SanctionsEntry,
  KYCCompliancePlugin,
  createKYCCompliancePlugin,
  type KYCCompliancePluginConfig,
  type KYCProvider,
  type KYCLevel,
  type KYCVerificationResult,
} from './compliance/index.js';

// KYC plugins (Provider integration)
export {
  KycPlugin,
  createKycPlugin,
  VerificationLevel as KycVerificationLevel,
  VerificationStatus as KycVerificationStatus,
  type KycPluginConfig,
  type KycSession,
  type VerificationResult as KycVerificationResult,
  type StartVerificationRequest,
  type KycWebhookEvent,
  type KycProvider as KycProviderType,
} from './kyc/index.js';
