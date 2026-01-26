/**
 * Provider Implementations
 *
 * Mock/reference implementations of the provider interfaces.
 * Partners can use these for testing or as templates for their own integrations.
 *
 * @example
 * ```typescript
 * import {
 *   MockCustodyProvider,
 *   MockKYCProvider,
 *   MockExchangeProvider,
 *   MockSettlementProvider,
 *   providerRegistry,
 * } from '@tokenisation/sdk';
 *
 * // Register mock providers
 * providerRegistry.registerCustody(new MockCustodyProvider(), { isDefault: true });
 * providerRegistry.registerKYC(new MockKYCProvider(), { isDefault: true });
 * providerRegistry.registerExchange(new MockExchangeProvider(), { isDefault: true });
 * providerRegistry.registerSettlement(new MockSettlementProvider(), { isDefault: true });
 * ```
 */

// Custody Providers
export * from './custody/index.js';

// KYC Providers
export * from './kyc/index.js';

// Exchange Providers
export * from './exchange/index.js';

// Settlement Providers
export * from './settlement/index.js';
