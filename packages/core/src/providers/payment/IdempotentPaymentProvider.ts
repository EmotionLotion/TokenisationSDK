/**
 * Idempotent Payment Provider
 *
 * Decorator that wraps any IPaymentProvider with idempotency guarantees.
 * Ensures safe retries for payment operations without double-charging.
 *
 * @example
 * ```typescript
 * const stripe = new StripeProvider(config);
 * const idempotent = createIdempotentStripeProvider(stripe);
 *
 * // Safe to retry - same idempotency key returns cached result
 * const result1 = await idempotent.createIntent({ ... }, 'order-123');
 * const result2 = await idempotent.createIntent({ ... }, 'order-123');
 * // result1 === result2
 * ```
 */

import { ok, err, type Result } from '../../core/types.js';
import {
  IdempotencyManager,
  MemoryIdempotencyStorage,
  IdempotencyKeys,
  type IIdempotencyStorage,
} from '../../core/Idempotency.js';
import type {
  IPaymentProvider,
  PaymentIntent,
  PaymentConfirmation,
  Refund,
  RefundRequest,
  Payout,
  PayoutRequest,
  Balance,
  PaymentWebhookEvent,
  PaymentMethodType,
  Currency,
} from './PaymentProvider.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for idempotent payment provider
 */
export interface IdempotentPaymentProviderConfig {
  /** Idempotency storage backend */
  storage?: IIdempotencyStorage;
  /** TTL for idempotency keys in milliseconds (default: 24 hours) */
  ttlMs?: number;
  /** Lock timeout for pending operations (default: 30 seconds) */
  lockTimeoutMs?: number;
  /** Prefix for idempotency keys */
  keyPrefix?: string;
}

/**
 * Extended create intent params with idempotency key
 */
export interface IdempotentCreateIntentParams {
  amount: string;
  currency: string;
  payerId: string;
  payerEmail?: string;
  referenceId: string;
  referenceType: 'subscription' | 'purchase' | 'deposit';
  allowedMethods?: PaymentMethodType[];
  returnUrl?: string;
  metadata?: Record<string, unknown>;
  /** Explicit idempotency key (auto-generated if not provided) */
  idempotencyKey?: string;
}

// ============================================================================
// IDEMPOTENT PAYMENT PROVIDER
// ============================================================================

/**
 * Idempotent payment provider wrapper
 *
 * Wraps mutation operations (create, confirm, cancel) with idempotency.
 * Read operations (get) pass through without idempotency.
 */
export class IdempotentPaymentProvider implements IPaymentProvider {
  private provider: IPaymentProvider;
  private idempotency: IdempotencyManager;
  private keyPrefix: string;

  constructor(
    provider: IPaymentProvider,
    config: IdempotentPaymentProviderConfig = {}
  ) {
    this.provider = provider;
    this.keyPrefix = config.keyPrefix ?? `payment:${provider.providerId}:`;

    this.idempotency = new IdempotencyManager({
      storage: config.storage ?? new MemoryIdempotencyStorage(),
      ttlMs: config.ttlMs ?? 24 * 60 * 60 * 1000, // 24 hours
      lockTimeoutMs: config.lockTimeoutMs ?? 30000, // 30 seconds
    });
  }

  // ============================================================================
  // IPaymentProvider Implementation
  // ============================================================================

  get providerId(): string {
    return this.provider.providerId;
  }

  get providerName(): string {
    return this.provider.providerName;
  }

  get supportedMethods(): PaymentMethodType[] {
    return this.provider.supportedMethods;
  }

  get supportedCurrencies(): Currency[] {
    return this.provider.supportedCurrencies;
  }

  /**
   * Create a payment intent (idempotent)
   */
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
    // Generate idempotency key from payment params
    const idempotencyKey = this.generateCreateIntentKey(params);

    const result = await this.idempotency.execute(
      idempotencyKey,
      async () => {
        const result = await this.provider.createIntent(params);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        requestHash: this.hashParams(params),
        metadata: { operation: 'createIntent', referenceId: params.referenceId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Create intent with explicit idempotency key
   */
  async createIntentIdempotent(
    params: IdempotentCreateIntentParams
  ): Promise<Result<PaymentIntent, string>> {
    const idempotencyKey = params.idempotencyKey
      ? `${this.keyPrefix}intent:${params.idempotencyKey}`
      : this.generateCreateIntentKey(params);

    const { idempotencyKey: _, ...createParams } = params;

    const result = await this.idempotency.execute(
      idempotencyKey,
      async () => {
        const result = await this.provider.createIntent(createParams);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        requestHash: this.hashParams(createParams),
        metadata: { operation: 'createIntent', referenceId: params.referenceId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Get payment intent (pass-through, no idempotency)
   */
  async getIntent(intentId: string): Promise<Result<PaymentIntent, string>> {
    return this.provider.getIntent(intentId);
  }

  /**
   * Confirm a payment intent (idempotent)
   */
  async confirmIntent(
    intentId: string,
    params?: {
      paymentMethodId?: string;
      returnUrl?: string;
    }
  ): Promise<Result<PaymentConfirmation, string>> {
    const idempotencyKey = `${this.keyPrefix}confirm:${intentId}`;

    const result = await this.idempotency.execute(
      idempotencyKey,
      async () => {
        const result = await this.provider.confirmIntent(intentId, params);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        metadata: { operation: 'confirmIntent', intentId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Cancel a payment intent (idempotent)
   */
  async cancelIntent(intentId: string, reason?: string): Promise<Result<void, string>> {
    const idempotencyKey = `${this.keyPrefix}cancel:${intentId}`;

    const result = await this.idempotency.execute(
      idempotencyKey,
      async () => {
        const result = await this.provider.cancelIntent(intentId, reason);
        if (!result.success) {
          throw new Error(result.error);
        }
        return undefined;
      },
      {
        metadata: { operation: 'cancelIntent', intentId, reason },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(undefined);
  }

  /**
   * Create a refund (idempotent)
   */
  async createRefund(request: RefundRequest): Promise<Result<Refund, string>> {
    const idempotencyKey = `${this.keyPrefix}refund:${request.intentId}:${request.amount ?? 'full'}`;

    const result = await this.idempotency.execute(
      idempotencyKey,
      async () => {
        const result = await this.provider.createRefund(request);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        requestHash: this.hashParams(request),
        metadata: { operation: 'createRefund', intentId: request.intentId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Create refund with explicit idempotency key
   */
  async createRefundIdempotent(
    request: RefundRequest,
    idempotencyKey: string
  ): Promise<Result<Refund, string>> {
    const key = `${this.keyPrefix}refund:${idempotencyKey}`;

    const result = await this.idempotency.execute(
      key,
      async () => {
        const result = await this.provider.createRefund(request);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        requestHash: this.hashParams(request),
        metadata: { operation: 'createRefund', intentId: request.intentId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Get refund (pass-through, no idempotency)
   */
  async getRefund(refundId: string): Promise<Result<Refund, string>> {
    return this.provider.getRefund(refundId);
  }

  /**
   * Create a payout (idempotent)
   */
  async createPayout(request: PayoutRequest): Promise<Result<Payout, string>> {
    const idempotencyKey = `${this.keyPrefix}payout:${request.referenceId ?? Date.now()}:${request.amount}`;

    const result = await this.idempotency.execute(
      idempotencyKey,
      async () => {
        const result = await this.provider.createPayout(request);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        requestHash: this.hashParams(request),
        metadata: { operation: 'createPayout', referenceId: request.referenceId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Create payout with explicit idempotency key
   */
  async createPayoutIdempotent(
    request: PayoutRequest,
    idempotencyKey: string
  ): Promise<Result<Payout, string>> {
    const key = `${this.keyPrefix}payout:${idempotencyKey}`;

    const result = await this.idempotency.execute(
      key,
      async () => {
        const result = await this.provider.createPayout(request);
        if (!result.success) {
          throw new Error(result.error);
        }
        return result.data;
      },
      {
        requestHash: this.hashParams(request),
        metadata: { operation: 'createPayout', referenceId: request.referenceId },
      }
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok(result.data);
  }

  /**
   * Get payout (pass-through, no idempotency)
   */
  async getPayout(payoutId: string): Promise<Result<Payout, string>> {
    return this.provider.getPayout(payoutId);
  }

  /**
   * Get balance (pass-through, no idempotency)
   */
  async getBalance(): Promise<Result<Balance[], string>> {
    return this.provider.getBalance();
  }

  /**
   * Process webhook (idempotent by event ID)
   */
  async processWebhook(
    payload: unknown,
    signature: string
  ): Promise<Result<PaymentWebhookEvent, string>> {
    // Webhooks have their own event IDs for idempotency
    // Let the underlying provider handle idempotency for webhooks
    return this.provider.processWebhook(payload, signature);
  }

  /**
   * Health check (pass-through)
   */
  async healthCheck(): Promise<boolean> {
    return this.provider.healthCheck();
  }

  // ============================================================================
  // Additional Methods
  // ============================================================================

  /**
   * Get the underlying provider
   */
  getUnderlyingProvider(): IPaymentProvider {
    return this.provider;
  }

  /**
   * Check if an operation has been executed
   */
  async hasExecuted(idempotencyKey: string): Promise<boolean> {
    return this.idempotency.hasExecuted(`${this.keyPrefix}${idempotencyKey}`);
  }

  /**
   * Invalidate an idempotency key (use with caution)
   */
  async invalidate(idempotencyKey: string): Promise<void> {
    await this.idempotency.invalidate(`${this.keyPrefix}${idempotencyKey}`);
  }

  /**
   * Clean up expired idempotency records
   */
  async cleanup(): Promise<number> {
    return this.idempotency.cleanup();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private generateCreateIntentKey(params: {
    payerId: string;
    referenceId: string;
    amount: string;
  }): string {
    return IdempotencyKeys.payment(params.payerId, params.referenceId, params.amount);
  }

  private hashParams(params: object): string {
    const str = JSON.stringify(params, Object.keys(params).sort());
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash.toString(16);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an idempotent Stripe provider
 */
export function createIdempotentStripeProvider(
  provider: IPaymentProvider,
  config?: IdempotentPaymentProviderConfig
): IdempotentPaymentProvider {
  return new IdempotentPaymentProvider(provider, {
    ...config,
    keyPrefix: config?.keyPrefix ?? 'payment:stripe:',
  });
}

/**
 * Create an idempotent Circle provider
 */
export function createIdempotentCircleProvider(
  provider: IPaymentProvider,
  config?: IdempotentPaymentProviderConfig
): IdempotentPaymentProvider {
  return new IdempotentPaymentProvider(provider, {
    ...config,
    keyPrefix: config?.keyPrefix ?? 'payment:circle:',
  });
}

/**
 * Create an idempotent provider with custom storage
 */
export function createIdempotentPaymentProvider(
  provider: IPaymentProvider,
  storage: IIdempotencyStorage,
  config?: Omit<IdempotentPaymentProviderConfig, 'storage'>
): IdempotentPaymentProvider {
  return new IdempotentPaymentProvider(provider, {
    ...config,
    storage,
  });
}

export default IdempotentPaymentProvider;
