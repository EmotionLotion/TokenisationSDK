/**
 * Rate Limited Payment Provider
 *
 * Decorator that wraps any IPaymentProvider with rate limiting.
 * Uses token bucket algorithm to prevent API throttling.
 *
 * @example
 * ```typescript
 * const stripe = new StripeProvider(config);
 * const rateLimited = createRateLimitedStripeProvider(stripe);
 *
 * // All calls are now rate limited
 * await rateLimited.createIntent({ ... });
 * ```
 */

import { ok, err, type Result } from '../../core/types.js';
import {
  RateLimiter,
  type RateLimiterConfig,
  type RateLimitEventCallback,
  createStripeRateLimiter,
  createCircleRateLimiter,
} from '../../core/RateLimiter.js';
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
 * Rate limited provider configuration
 */
export interface RateLimitedProviderConfig {
  /** Rate limiter configuration (uses provider defaults if not specified) */
  rateLimiter?: RateLimiterConfig;
  /** Callback for rate limit events */
  onRateLimitEvent?: RateLimitEventCallback;
  /** Whether to apply rate limiting to read operations (default: false) */
  limitReads?: boolean;
  /** Whether to apply rate limiting to webhooks (default: false) */
  limitWebhooks?: boolean;
}

// ============================================================================
// RATE LIMITED PROVIDER
// ============================================================================

/**
 * Rate limited payment provider wrapper
 *
 * Applies token bucket rate limiting to all payment provider operations.
 * Write operations (create, confirm, cancel) are always rate limited.
 * Read operations can optionally be rate limited.
 */
export class RateLimitedPaymentProvider implements IPaymentProvider {
  private provider: IPaymentProvider;
  private limiter: RateLimiter;
  private limitReads: boolean;
  private limitWebhooks: boolean;

  constructor(
    provider: IPaymentProvider,
    limiter: RateLimiter,
    options: { limitReads?: boolean; limitWebhooks?: boolean } = {}
  ) {
    this.provider = provider;
    this.limiter = limiter;
    this.limitReads = options.limitReads ?? false;
    this.limitWebhooks = options.limitWebhooks ?? false;
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
   * Create a payment intent (rate limited)
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
    const acquired = await this.limiter.acquire();
    if (!acquired) {
      return err(`Rate limit exceeded for ${this.providerId}.createIntent`);
    }
    return this.provider.createIntent(params);
  }

  /**
   * Get payment intent (optionally rate limited)
   */
  async getIntent(intentId: string): Promise<Result<PaymentIntent, string>> {
    if (this.limitReads) {
      const acquired = await this.limiter.acquire();
      if (!acquired) {
        return err(`Rate limit exceeded for ${this.providerId}.getIntent`);
      }
    }
    return this.provider.getIntent(intentId);
  }

  /**
   * Confirm a payment intent (rate limited)
   */
  async confirmIntent(
    intentId: string,
    params?: {
      paymentMethodId?: string;
      returnUrl?: string;
    }
  ): Promise<Result<PaymentConfirmation, string>> {
    const acquired = await this.limiter.acquire();
    if (!acquired) {
      return err(`Rate limit exceeded for ${this.providerId}.confirmIntent`);
    }
    return this.provider.confirmIntent(intentId, params);
  }

  /**
   * Cancel a payment intent (rate limited)
   */
  async cancelIntent(intentId: string, reason?: string): Promise<Result<void, string>> {
    const acquired = await this.limiter.acquire();
    if (!acquired) {
      return err(`Rate limit exceeded for ${this.providerId}.cancelIntent`);
    }
    return this.provider.cancelIntent(intentId, reason);
  }

  /**
   * Create a refund (rate limited)
   */
  async createRefund(request: RefundRequest): Promise<Result<Refund, string>> {
    const acquired = await this.limiter.acquire();
    if (!acquired) {
      return err(`Rate limit exceeded for ${this.providerId}.createRefund`);
    }
    return this.provider.createRefund(request);
  }

  /**
   * Get refund (optionally rate limited)
   */
  async getRefund(refundId: string): Promise<Result<Refund, string>> {
    if (this.limitReads) {
      const acquired = await this.limiter.acquire();
      if (!acquired) {
        return err(`Rate limit exceeded for ${this.providerId}.getRefund`);
      }
    }
    return this.provider.getRefund(refundId);
  }

  /**
   * Create a payout (rate limited)
   */
  async createPayout(request: PayoutRequest): Promise<Result<Payout, string>> {
    const acquired = await this.limiter.acquire();
    if (!acquired) {
      return err(`Rate limit exceeded for ${this.providerId}.createPayout`);
    }
    return this.provider.createPayout(request);
  }

  /**
   * Get payout (optionally rate limited)
   */
  async getPayout(payoutId: string): Promise<Result<Payout, string>> {
    if (this.limitReads) {
      const acquired = await this.limiter.acquire();
      if (!acquired) {
        return err(`Rate limit exceeded for ${this.providerId}.getPayout`);
      }
    }
    return this.provider.getPayout(payoutId);
  }

  /**
   * Get balance (optionally rate limited)
   */
  async getBalance(): Promise<Result<Balance[], string>> {
    if (this.limitReads) {
      const acquired = await this.limiter.acquire();
      if (!acquired) {
        return err(`Rate limit exceeded for ${this.providerId}.getBalance`);
      }
    }
    return this.provider.getBalance();
  }

  /**
   * Process webhook (optionally rate limited)
   */
  async processWebhook(
    payload: unknown,
    signature: string
  ): Promise<Result<PaymentWebhookEvent, string>> {
    if (this.limitWebhooks) {
      const acquired = await this.limiter.acquire();
      if (!acquired) {
        return err(`Rate limit exceeded for ${this.providerId}.processWebhook`);
      }
    }
    return this.provider.processWebhook(payload, signature);
  }

  /**
   * Health check (never rate limited)
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
   * Get rate limiter statistics
   */
  getRateLimiterStats() {
    return this.limiter.getStats();
  }

  /**
   * Reset rate limiter (use with caution)
   */
  resetRateLimiter(): void {
    this.limiter.reset();
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a rate limited Stripe provider
 */
export function createRateLimitedStripeProvider(
  provider: IPaymentProvider,
  config?: RateLimitedProviderConfig
): RateLimitedPaymentProvider {
  const limiter = createStripeRateLimiter(
    config?.onRateLimitEvent,
    config?.rateLimiter
  );

  return new RateLimitedPaymentProvider(provider, limiter, {
    limitReads: config?.limitReads,
    limitWebhooks: config?.limitWebhooks,
  });
}

/**
 * Create a rate limited Circle provider
 */
export function createRateLimitedCircleProvider(
  provider: IPaymentProvider,
  config?: RateLimitedProviderConfig
): RateLimitedPaymentProvider {
  const limiter = createCircleRateLimiter(
    config?.onRateLimitEvent,
    config?.rateLimiter
  );

  return new RateLimitedPaymentProvider(provider, limiter, {
    limitReads: config?.limitReads,
    limitWebhooks: config?.limitWebhooks,
  });
}

/**
 * Create a rate limited provider with custom configuration
 */
export function createRateLimitedPaymentProvider(
  provider: IPaymentProvider,
  rateLimiterConfig: RateLimiterConfig,
  options?: {
    onRateLimitEvent?: RateLimitEventCallback;
    limitReads?: boolean;
    limitWebhooks?: boolean;
  }
): RateLimitedPaymentProvider {
  const limiter = new RateLimiter(rateLimiterConfig, options?.onRateLimitEvent);

  return new RateLimitedPaymentProvider(provider, limiter, {
    limitReads: options?.limitReads,
    limitWebhooks: options?.limitWebhooks,
  });
}

export default RateLimitedPaymentProvider;
