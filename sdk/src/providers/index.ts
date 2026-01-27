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
 *   MockPaymentProvider,
 *   createStripeProvider,
 *   createCircleProvider,
 *   providerRegistry,
 * } from '@tokenisation/sdk';
 *
 * // Register mock providers for testing
 * providerRegistry.registerCustody(new MockCustodyProvider(), { isDefault: true });
 * providerRegistry.registerKYC(new MockKYCProvider(), { isDefault: true });
 * providerRegistry.registerExchange(new MockExchangeProvider(), { isDefault: true });
 * providerRegistry.registerSettlement(new MockSettlementProvider(), { isDefault: true });
 *
 * // Production payment providers
 * const stripe = createStripeProvider({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 * });
 *
 * const circle = createCircleProvider({
 *   apiKey: process.env.CIRCLE_API_KEY!,
 *   entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
 * });
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

// Payment Providers (Stripe, Circle)
export * from './payment/index.js';

// DLD Providers (Dubai Land Department)
export * from './dld/index.js';
