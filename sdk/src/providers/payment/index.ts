/**
 * Payment Provider Exports
 *
 * Payment providers handle fiat and crypto payment processing.
 *
 * - StripeProvider: Cards, ACH, wire transfers
 * - CircleProvider: USDC and stablecoin payments
 * - MockPaymentProvider: Testing and development
 *
 * @example
 * ```typescript
 * import {
 *   createStripeProvider,
 *   createCircleProvider,
 *   MockPaymentProvider,
 * } from '@tokenisation/sdk';
 *
 * // Production: Use Stripe for fiat
 * const stripe = createStripeProvider({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 * });
 *
 * // Production: Use Circle for USDC
 * const circle = createCircleProvider({
 *   apiKey: process.env.CIRCLE_API_KEY!,
 *   entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
 * });
 *
 * // Testing: Use mock provider
 * const mock = new MockPaymentProvider({ autoConfirm: true });
 * ```
 */

// Interface and types
export {
  type IPaymentProvider,
  type PaymentMethodType,
  type PaymentStatus,
  type Currency,
  type PaymentIntent,
  type PaymentConfirmation,
  type RefundRequest,
  type Refund,
  type PayoutRequest,
  type Payout,
  type Balance,
  type PaymentWebhookEvent,
  CURRENCIES,
  toSmallestUnit,
  fromSmallestUnit,
  calculateFee,
} from './PaymentProvider.js';

// Stripe (fiat payments)
export {
  StripeProvider,
  createStripeProvider,
  type StripeProviderConfig,
} from './StripeProvider.js';

// Circle (USDC/stablecoin payments)
export {
  CircleProvider,
  createCircleProvider,
  type CircleProviderConfig,
  type CircleChain,
} from './CircleProvider.js';

// Mock (testing)
export {
  MockPaymentProvider,
  createMockPaymentProvider,
  type MockPaymentProviderConfig,
} from './MockPaymentProvider.js';
