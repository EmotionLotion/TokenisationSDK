/**
 * Mock Payment Provider
 *
 * Reference implementation for testing and development.
 * Simulates payment processing without real transactions.
 *
 * @example
 * ```typescript
 * import { MockPaymentProvider } from '@tokenisation/sdk';
 *
 * const payments = new MockPaymentProvider({
 *   autoConfirm: true, // Auto-confirm payments
 *   confirmDelay: 2000, // 2 second delay
 * });
 *
 * // Create and auto-confirm payment
 * const intent = await payments.createIntent({
 *   amount: '50000',
 *   currency: 'USD',
 *   payerId: 'investor-123',
 *   referenceId: 'subscription-456',
 *   referenceType: 'subscription',
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IPaymentProvider,
  PaymentMethodType,
  Currency,
  PaymentIntent,
  PaymentConfirmation,
  PaymentStatus,
  RefundRequest,
  Refund,
  PayoutRequest,
  Payout,
  Balance,
  PaymentWebhookEvent,
} from './PaymentProvider.js';
import { CURRENCIES, calculateFee } from './PaymentProvider.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface MockPaymentProviderConfig {
  /** Auto-confirm payments (default: true) */
  autoConfirm?: boolean;

  /** Delay before auto-confirmation in ms (default: 1000) */
  confirmDelay?: number;

  /** Simulate failures (default: false) */
  simulateFailures?: boolean;

  /** Failure rate when simulateFailures is true (0-1, default: 0.1) */
  failureRate?: number;

  /** Processing fee in basis points (default: 290 = 2.9%) */
  processingFeeBps?: number;

  /** Fixed fee per transaction in cents (default: 30 = $0.30) */
  fixedFee?: number;

  /** Initial balance for testing */
  initialBalance?: Record<string, string>;
}

// ============================================================================
// MOCK PROVIDER
// ============================================================================

export class MockPaymentProvider implements IPaymentProvider {
  readonly providerId = 'mock-payment';
  readonly providerName = 'Mock Payment Provider';

  readonly supportedMethods: PaymentMethodType[] = [
    'card',
    'bank_transfer',
    'stablecoin',
    'crypto',
  ];

  readonly supportedCurrencies: Currency[] = [
    CURRENCIES.USD,
    CURRENCIES.EUR,
    CURRENCIES.GBP,
    CURRENCIES.AED,
    CURRENCIES.USDC,
  ];

  private config: Required<MockPaymentProviderConfig>;
  private intents = new Map<string, PaymentIntent>();
  private refunds = new Map<string, Refund>();
  private payouts = new Map<string, Payout>();
  private balances: Map<string, Balance>;

  constructor(config: MockPaymentProviderConfig = {}) {
    this.config = {
      autoConfirm: config.autoConfirm ?? true,
      confirmDelay: config.confirmDelay ?? 1000,
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
      processingFeeBps: config.processingFeeBps ?? 290, // 2.9%
      fixedFee: config.fixedFee ?? 30, // $0.30
      initialBalance: config.initialBalance ?? {
        USD: '10000000', // $100,000.00
        EUR: '10000000',
        USDC: '100000000000', // 100,000 USDC
      },
    };

    // Initialize balances
    this.balances = new Map();
    for (const [code, amount] of Object.entries(this.config.initialBalance)) {
      const currency = CURRENCIES[code] || CURRENCIES.USD;
      this.balances.set(code, {
        available: amount,
        pending: '0',
        currency,
      });
    }
  }

  // ============================================================================
  // PAYMENT INTENT
  // ============================================================================

  async createIntent(params: {
    amount: string;
    currency: string;
    payerId: string;
    payerEmail?: string;
    referenceId: string;
    referenceType: 'subscription' | 'purchase' | 'deposit';
    allowedMethods?: PaymentMethodType[];
    returnUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<PaymentIntent, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Unable to create payment intent');
    }

    const currency = CURRENCIES[params.currency.toUpperCase()];
    if (!currency) {
      return err(`Unsupported currency: ${params.currency}`);
    }

    const intentId = `mock_pi_${uuidv4().slice(0, 12)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const intent: PaymentIntent = {
      id: intentId,
      providerId: this.providerId,
      amount: params.amount,
      currency,
      allowedMethods: params.allowedMethods || this.supportedMethods,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      payerId: params.payerId,
      payerEmail: params.payerEmail,
      status: 'pending',
      clientSecret: `${intentId}_secret_${uuidv4().slice(0, 8)}`,
      returnUrl: params.returnUrl,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      metadata: params.metadata || {},
    };

    this.intents.set(intentId, intent);

    // Auto-confirm if configured
    if (this.config.autoConfirm) {
      setTimeout(() => this.autoConfirmIntent(intentId), this.config.confirmDelay);
    }

    return ok(intent);
  }

  async getIntent(intentId: string): Promise<Result<PaymentIntent, string>> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return err(`Payment intent not found: ${intentId}`);
    }
    return ok(intent);
  }

  async confirmIntent(
    intentId: string,
    params?: { paymentMethodId?: string; returnUrl?: string }
  ): Promise<Result<PaymentConfirmation, string>> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return err(`Payment intent not found: ${intentId}`);
    }

    if (this.shouldFail()) {
      intent.status = 'failed';
      return err('Simulated failure: Payment declined');
    }

    if (intent.status === 'succeeded') {
      // Already confirmed, return existing confirmation
    } else if (intent.status === 'cancelled') {
      return err('Cannot confirm cancelled payment');
    } else {
      intent.status = 'succeeded';
      intent.confirmedAt = new Date().toISOString();
    }

    // Calculate fees
    const amount = BigInt(intent.amount);
    const processingFee = calculateFee(amount, this.config.processingFeeBps) +
      BigInt(this.config.fixedFee);
    const platformFee = 0n;
    const netAmount = amount - processingFee - platformFee;

    // Determine method type based on what was "used"
    const methodType: PaymentMethodType = params?.paymentMethodId?.startsWith('pm_card')
      ? 'card'
      : params?.paymentMethodId?.startsWith('pm_bank')
        ? 'bank_transfer'
        : 'card';

    // Generate fake method details
    const methodDetails = methodType === 'card'
      ? { last4: '4242', brand: 'visa' }
      : { last4: '6789', bankName: 'Test Bank' };

    // Update balance
    const balance = this.balances.get(intent.currency.code);
    if (balance) {
      balance.available = (BigInt(balance.available) + netAmount).toString();
    }

    return ok({
      intentId: intent.id,
      status: 'succeeded',
      amountCharged: intent.amount,
      netAmount: netAmount.toString(),
      fees: {
        processingFee: processingFee.toString(),
        platformFee: platformFee.toString(),
      },
      methodType,
      methodDetails,
      receiptId: `rcpt_${uuidv4().slice(0, 8)}`,
      confirmedAt: intent.confirmedAt || new Date().toISOString(),
    });
  }

  async cancelIntent(intentId: string, _reason?: string): Promise<Result<void, string>> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return err(`Payment intent not found: ${intentId}`);
    }

    if (intent.status === 'succeeded') {
      return err('Cannot cancel succeeded payment');
    }

    intent.status = 'cancelled';
    return ok(undefined);
  }

  // ============================================================================
  // REFUNDS
  // ============================================================================

  async createRefund(request: RefundRequest): Promise<Result<Refund, string>> {
    const intent = this.intents.get(request.intentId);
    if (!intent) {
      return err(`Payment intent not found: ${request.intentId}`);
    }

    if (intent.status !== 'succeeded') {
      return err('Can only refund succeeded payments');
    }

    if (this.shouldFail()) {
      return err('Simulated failure: Refund failed');
    }

    const refundAmount = request.amount || intent.amount;
    const refundId = `mock_ref_${uuidv4().slice(0, 12)}`;

    const refund: Refund = {
      id: refundId,
      intentId: request.intentId,
      amount: refundAmount,
      currency: intent.currency,
      status: 'pending',
      reason: request.reason,
      createdAt: new Date().toISOString(),
    };

    this.refunds.set(refundId, refund);

    // Auto-complete refund
    setTimeout(() => {
      const r = this.refunds.get(refundId);
      if (r && r.status === 'pending') {
        r.status = 'succeeded';
        r.completedAt = new Date().toISOString();

        // Update intent status
        if (refundAmount === intent.amount) {
          intent.status = 'refunded';
        } else {
          intent.status = 'partially_refunded';
        }
      }
    }, 500);

    return ok(refund);
  }

  async getRefund(refundId: string): Promise<Result<Refund, string>> {
    const refund = this.refunds.get(refundId);
    if (!refund) {
      return err(`Refund not found: ${refundId}`);
    }
    return ok(refund);
  }

  // ============================================================================
  // PAYOUTS
  // ============================================================================

  async createPayout(request: PayoutRequest): Promise<Result<Payout, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Payout failed');
    }

    const balance = this.balances.get(request.currency.code);
    if (!balance || BigInt(balance.available) < BigInt(request.amount)) {
      return err('Insufficient balance');
    }

    const payoutId = `mock_po_${uuidv4().slice(0, 12)}`;
    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() + (request.destination.type === 'wallet' ? 0 : 2));

    const payout: Payout = {
      id: payoutId,
      status: 'pending',
      amount: request.amount,
      currency: request.currency,
      arrivalDate: arrivalDate.toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.payouts.set(payoutId, payout);

    // Move to pending
    balance.available = (BigInt(balance.available) - BigInt(request.amount)).toString();
    balance.pending = (BigInt(balance.pending) + BigInt(request.amount)).toString();

    // Auto-complete payout
    setTimeout(() => {
      const p = this.payouts.get(payoutId);
      if (p && p.status === 'pending') {
        p.status = 'paid';
        p.paidAt = new Date().toISOString();

        const b = this.balances.get(request.currency.code);
        if (b) {
          b.pending = (BigInt(b.pending) - BigInt(request.amount)).toString();
        }
      }
    }, 1000);

    return ok(payout);
  }

  async getPayout(payoutId: string): Promise<Result<Payout, string>> {
    const payout = this.payouts.get(payoutId);
    if (!payout) {
      return err(`Payout not found: ${payoutId}`);
    }
    return ok(payout);
  }

  // ============================================================================
  // BALANCE
  // ============================================================================

  async getBalance(): Promise<Result<Balance[], string>> {
    return ok(Array.from(this.balances.values()));
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  async processWebhook(
    payload: unknown,
    _signature: string
  ): Promise<Result<PaymentWebhookEvent, string>> {
    const event = payload as PaymentWebhookEvent;
    return ok(event);
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail();
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Reset all state (for testing)
   */
  reset(): void {
    this.intents.clear();
    this.refunds.clear();
    this.payouts.clear();

    // Reset balances
    for (const [code, amount] of Object.entries(this.config.initialBalance)) {
      const currency = CURRENCIES[code] || CURRENCIES.USD;
      this.balances.set(code, {
        available: amount,
        pending: '0',
        currency,
      });
    }
  }

  /**
   * Manually succeed a payment intent (for testing)
   */
  succeedIntent(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (intent && intent.status === 'pending') {
      intent.status = 'succeeded';
      intent.confirmedAt = new Date().toISOString();
    }
  }

  /**
   * Manually fail a payment intent (for testing)
   */
  failIntent(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (intent && intent.status === 'pending') {
      intent.status = 'failed';
    }
  }

  /**
   * Get all intents (for testing)
   */
  getAllIntents(): PaymentIntent[] {
    return Array.from(this.intents.values());
  }

  /**
   * Simulate receiving a webhook event (for testing)
   */
  simulateWebhook(
    type: PaymentWebhookEvent['type'],
    intentId: string
  ): PaymentWebhookEvent {
    const intent = this.intents.get(intentId);

    return {
      id: `evt_${uuidv4().slice(0, 12)}`,
      type,
      data: {
        intentId,
        status: intent?.status || 'pending',
        amount: intent?.amount,
        currency: intent?.currency.code,
      },
      providerData: {},
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private shouldFail(): boolean {
    return this.config.simulateFailures && Math.random() < this.config.failureRate;
  }

  private autoConfirmIntent(intentId: string): void {
    const intent = this.intents.get(intentId);
    if (intent && intent.status === 'pending') {
      if (this.shouldFail()) {
        intent.status = 'failed';
      } else {
        intent.status = 'succeeded';
        intent.confirmedAt = new Date().toISOString();

        // Update balance
        const amount = BigInt(intent.amount);
        const processingFee = calculateFee(amount, this.config.processingFeeBps) +
          BigInt(this.config.fixedFee);
        const netAmount = amount - processingFee;

        const balance = this.balances.get(intent.currency.code);
        if (balance) {
          balance.available = (BigInt(balance.available) + netAmount).toString();
        }
      }
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a mock payment provider
 */
export function createMockPaymentProvider(
  config?: MockPaymentProviderConfig
): MockPaymentProvider {
  return new MockPaymentProvider(config);
}
