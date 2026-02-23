/**
 * Plugins module exports
 *
 * Core plugin system. Chain plugins (EVM, Chainlink) live in @tokenisation/chains.
 * Compliance plugins (Jurisdiction, KYC) live in @tokenisation/compliance.
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

// Auth plugins (SIWE)
export * from './auth/index.js';

// Carbon Oracle plugins (emission factors)
export * from './carbon/index.js';

// Storage plugins (S3, IPFS)
export * from './storage/index.js';

// Event streaming plugins (SSE)
export * from './events/index.js';
