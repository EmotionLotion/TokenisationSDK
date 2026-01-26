/**
 * Payment Provider Interface
 *
 * Abstraction for payment processing in token offerings.
 * Handles fiat (Stripe) and stablecoin (Circle) payments.
 *
 * Providers normalize payment intents, confirmations, and refunds
 * into a canonical format for the Offerings engine.
 */

import type { Result } from '../../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Payment method categories
 */
export type PaymentMethodType =
  | 'card'           // Credit/debit card (Stripe)
  | 'bank_transfer'  // ACH, wire, SEPA
  | 'crypto'         // Native crypto (ETH, BTC)
  | 'stablecoin';    // USDC, USDT, etc.

/**
 * Payment status
 */
export type PaymentStatus =
  | 'pending'        // Created, awaiting action
  | 'processing'     // Being processed
  | 'requires_action' // Needs user action (3DS, etc.)
  | 'succeeded'      // Payment confirmed
  | 'failed'         // Payment failed
  | 'cancelled'      // Cancelled by user/system
  | 'refunded'       // Fully refunded
  | 'partially_refunded'; // Partially refunded

/**
 * Currency type
 */
export interface Currency {
  code: string;      // USD, EUR, USDC, ETH
  type: 'fiat' | 'crypto';
  decimals: number;
}

/**
 * Payment intent - request for payment
 */
export interface PaymentIntent {
  id: string;
  providerId: string;

  /** Amount in smallest unit (cents, wei, etc.) */
  amount: string;
  currency: Currency;

  /** Payment method constraints */
  allowedMethods: PaymentMethodType[];

  /** Associated offering/subscription */
  referenceId: string;
  referenceType: 'subscription' | 'purchase' | 'deposit';

  /** Investor/payer info */
  payerId: string;
  payerEmail?: string;

  /** Status */
  status: PaymentStatus;

  /** Client secret for frontend SDK */
  clientSecret?: string;

  /** Redirect URL after payment */
  returnUrl?: string;

  /** Timestamps */
  createdAt: string;
  expiresAt?: string;
  confirmedAt?: string;

  /** Provider-specific data */
  providerData?: Record<string, unknown>;

  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Payment confirmation
 */
export interface PaymentConfirmation {
  intentId: string;
  status: PaymentStatus;

  /** Actual amount charged (may differ due to fees) */
  amountCharged: string;

  /** Net amount after fees */
  netAmount: string;

  /** Fees breakdown */
  fees: {
    processingFee: string;
    platformFee: string;
    networkFee?: string; // For crypto
  };

  /** Payment method used */
  methodType: PaymentMethodType;
  methodDetails?: {
    last4?: string;      // Card last 4
    brand?: string;      // Card brand
    bankName?: string;   // Bank name
    walletAddress?: string; // Crypto address
    txHash?: string;     // Blockchain tx hash
  };

  /** Receipt/reference */
  receiptId?: string;
  receiptUrl?: string;

  /** Timestamps */
  confirmedAt: string;

  /** Provider-specific data */
  providerData?: Record<string, unknown>;
}

/**
 * Refund request
 */
export interface RefundRequest {
  intentId: string;

  /** Amount to refund (full if not specified) */
  amount?: string;

  /** Reason for refund */
  reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'other';

  /** Additional notes */
  notes?: string;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Refund result
 */
export interface Refund {
  id: string;
  intentId: string;

  /** Amount refunded */
  amount: string;
  currency: Currency;

  /** Status */
  status: 'pending' | 'succeeded' | 'failed';

  /** Reason */
  reason: string;

  /** Timestamps */
  createdAt: string;
  completedAt?: string;

  /** Provider-specific data */
  providerData?: Record<string, unknown>;
}

/**
 * Payout/withdrawal to external account
 */
export interface PayoutRequest {
  /** Amount to payout */
  amount: string;
  currency: Currency;

  /** Destination */
  destination: {
    type: 'bank_account' | 'wallet';
    /** Bank account ID or wallet address */
    accountId: string;
  };

  /** Reference */
  referenceId?: string;
  description?: string;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Payout result
 */
export interface Payout {
  id: string;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'cancelled';

  amount: string;
  currency: Currency;

  /** Arrival estimate */
  arrivalDate?: string;

  /** Failure details */
  failureCode?: string;
  failureMessage?: string;

  /** Timestamps */
  createdAt: string;
  paidAt?: string;

  /** Provider-specific data */
  providerData?: Record<string, unknown>;
}

/**
 * Balance info
 */
export interface Balance {
  available: string;
  pending: string;
  currency: Currency;
}

/**
 * Webhook event
 */
export interface PaymentWebhookEvent {
  id: string;
  type:
    | 'payment_intent.succeeded'
    | 'payment_intent.failed'
    | 'payment_intent.processing'
    | 'payment_intent.cancelled'
    | 'refund.created'
    | 'refund.succeeded'
    | 'refund.failed'
    | 'payout.paid'
    | 'payout.failed';

  /** The affected resource */
  data: {
    intentId?: string;
    refundId?: string;
    payoutId?: string;
    status: PaymentStatus | string;
    amount?: string;
    currency?: string;
  };

  /** Raw provider data */
  providerData: Record<string, unknown>;

  /** Timestamp */
  createdAt: string;
}

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * IPaymentProvider - Payment processing abstraction
 *
 * Implementations:
 * - StripeProvider: Card, ACH, wire transfers
 * - CircleProvider: USDC payments
 * - MockPaymentProvider: Testing
 */
export interface IPaymentProvider {
  /** Provider identifier */
  readonly providerId: string;

  /** Provider name for display */
  readonly providerName: string;

  /** Supported payment methods */
  readonly supportedMethods: PaymentMethodType[];

  /** Supported currencies */
  readonly supportedCurrencies: Currency[];

  /**
   * Create a payment intent
   */
  createIntent(params: {
    amount: string;
    currency: string;
    payerId: string;
    payerEmail?: string;
    referenceId: string;
    referenceType: 'subscription' | 'purchase' | 'deposit';
    allowedMethods?: PaymentMethodType[];
    returnUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<PaymentIntent, string>>;

  /**
   * Get payment intent by ID
   */
  getIntent(intentId: string): Promise<Result<PaymentIntent, string>>;

  /**
   * Confirm a payment intent (server-side confirmation)
   */
  confirmIntent(intentId: string, params?: {
    paymentMethodId?: string;
    returnUrl?: string;
  }): Promise<Result<PaymentConfirmation, string>>;

  /**
   * Cancel a payment intent
   */
  cancelIntent(intentId: string, reason?: string): Promise<Result<void, string>>;

  /**
   * Create a refund
   */
  createRefund(request: RefundRequest): Promise<Result<Refund, string>>;

  /**
   * Get refund by ID
   */
  getRefund(refundId: string): Promise<Result<Refund, string>>;

  /**
   * Create a payout
   */
  createPayout(request: PayoutRequest): Promise<Result<Payout, string>>;

  /**
   * Get payout by ID
   */
  getPayout(payoutId: string): Promise<Result<Payout, string>>;

  /**
   * Get account balance
   */
  getBalance(): Promise<Result<Balance[], string>>;

  /**
   * Process webhook from provider
   */
  processWebhook(
    payload: unknown,
    signature: string
  ): Promise<Result<PaymentWebhookEvent, string>>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Standard currencies
 */
export const CURRENCIES: Record<string, Currency> = {
  USD: { code: 'USD', type: 'fiat', decimals: 2 },
  EUR: { code: 'EUR', type: 'fiat', decimals: 2 },
  GBP: { code: 'GBP', type: 'fiat', decimals: 2 },
  AED: { code: 'AED', type: 'fiat', decimals: 2 },
  USDC: { code: 'USDC', type: 'crypto', decimals: 6 },
  USDT: { code: 'USDT', type: 'crypto', decimals: 6 },
  ETH: { code: 'ETH', type: 'crypto', decimals: 18 },
};

/**
 * Convert amount to smallest unit
 */
export function toSmallestUnit(amount: string | number, currency: Currency): bigint {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return BigInt(Math.round(value * Math.pow(10, currency.decimals)));
}

/**
 * Convert from smallest unit to display amount
 */
export function fromSmallestUnit(amount: string | bigint, currency: Currency): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount;
  const divisor = BigInt(Math.pow(10, currency.decimals));
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(currency.decimals, '0');
  return `${whole}.${fractionStr}`.replace(/\.?0+$/, '');
}

/**
 * Calculate fee (basis points)
 */
export function calculateFee(amount: bigint, basisPoints: number): bigint {
  return (amount * BigInt(basisPoints)) / 10000n;
}
