/**
 * Stripe Payment Provider
 *
 * Handles fiat payment processing via Stripe API.
 * Supports card payments, ACH transfers, and wire transfers.
 *
 * @example
 * ```typescript
 * import { StripeProvider, createStripeProvider } from '@tokenisation/sdk';
 *
 * const stripe = createStripeProvider({
 *   secretKey: process.env.STRIPE_SECRET_KEY!,
 *   webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
 * });
 *
 * // Create payment intent for subscription
 * const intent = await stripe.createIntent({
 *   amount: '50000', // $500.00 in cents
 *   currency: 'USD',
 *   payerId: 'investor-123',
 *   payerEmail: 'investor@example.com',
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

export interface StripeProviderConfig {
  /** Stripe secret key (sk_...) */
  secretKey: string;

  /** Webhook endpoint secret (whsec_...) */
  webhookSecret: string;

  /** API version (default: 2024-12-18.acacia) */
  apiVersion?: string;

  /** Base URL override for testing */
  baseUrl?: string;

  /** Platform fee in basis points (default: 0) */
  platformFeeBps?: number;

  /** Connected account ID (for Connect platforms) */
  connectedAccountId?: string;
}

// ============================================================================
// STRIPE API TYPES (simplified)
// ============================================================================

interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' |
    'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  client_secret: string;
  payment_method?: string;
  payment_method_types: string[];
  metadata: Record<string, string>;
  created: number;
  canceled_at?: number;
  charges?: {
    data: Array<{
      id: string;
      amount: number;
      amount_refunded: number;
      balance_transaction?: string;
      payment_method_details?: {
        type: string;
        card?: { last4: string; brand: string };
        us_bank_account?: { bank_name: string; last4: string };
      };
      receipt_url?: string;
    }>;
  };
  latest_charge?: string;
}

interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  payment_intent: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason?: string;
  metadata: Record<string, string>;
  created: number;
}

interface StripePayout {
  id: string;
  object: 'payout';
  amount: number;
  currency: string;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
  arrival_date: number;
  failure_code?: string;
  failure_message?: string;
  metadata: Record<string, string>;
  created: number;
}

interface StripeBalance {
  available: Array<{ amount: number; currency: string }>;
  pending: Array<{ amount: number; currency: string }>;
}

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: StripePaymentIntent | StripeRefund | StripePayout;
  };
  created: number;
}

// ============================================================================
// STRIPE PROVIDER
// ============================================================================

export class StripeProvider implements IPaymentProvider {
  readonly providerId = 'stripe';
  readonly providerName = 'Stripe';

  readonly supportedMethods: PaymentMethodType[] = ['card', 'bank_transfer'];

  readonly supportedCurrencies: Currency[] = [
    CURRENCIES.USD,
    CURRENCIES.EUR,
    CURRENCIES.GBP,
    CURRENCIES.AED,
  ];

  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly platformFeeBps: number;
  private readonly connectedAccountId?: string;

  constructor(config: StripeProviderConfig) {
    this.secretKey = config.secretKey;
    this.webhookSecret = config.webhookSecret;
    this.apiVersion = config.apiVersion || '2024-12-18.acacia';
    this.baseUrl = config.baseUrl || 'https://api.stripe.com/v1';
    this.platformFeeBps = config.platformFeeBps || 0;
    this.connectedAccountId = config.connectedAccountId;
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
    try {
      const currency = CURRENCIES[params.currency.toUpperCase()];
      if (!currency || currency.type !== 'fiat') {
        return err(`Unsupported currency: ${params.currency}`);
      }

      // Map payment methods to Stripe types
      const paymentMethodTypes = this.mapPaymentMethods(
        params.allowedMethods || this.supportedMethods
      );

      const body = new URLSearchParams({
        amount: params.amount,
        currency: params.currency.toLowerCase(),
        'metadata[payerId]': params.payerId,
        'metadata[referenceId]': params.referenceId,
        'metadata[referenceType]': params.referenceType,
        automatic_payment_methods: 'false',
      });

      // Add payment method types
      paymentMethodTypes.forEach((type, i) => {
        body.append(`payment_method_types[${i}]`, type);
      });

      if (params.payerEmail) {
        body.append('receipt_email', params.payerEmail);
      }

      if (params.returnUrl) {
        body.append('return_url', params.returnUrl);
      }

      // Add custom metadata
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, String(value));
        });
      }

      // Platform fee for Connect
      if (this.platformFeeBps > 0) {
        const fee = calculateFee(BigInt(params.amount), this.platformFeeBps);
        body.append('application_fee_amount', fee.toString());
      }

      const response = await this.request<StripePaymentIntent>(
        'POST',
        '/payment_intents',
        body
      );

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toPaymentIntent(response.data, currency, params));
    } catch (error) {
      return err(`Failed to create payment intent: ${error}`);
    }
  }

  async getIntent(intentId: string): Promise<Result<PaymentIntent, string>> {
    try {
      const response = await this.request<StripePaymentIntent>(
        'GET',
        `/payment_intents/${intentId}`,
        null,
        'charges'
      );

      if (!response.success) {
        return err(response.error);
      }

      const stripeIntent = response.data;
      const currency = CURRENCIES[stripeIntent.currency.toUpperCase()] || CURRENCIES.USD;

      return ok(this.toPaymentIntent(stripeIntent, currency, {
        payerId: stripeIntent.metadata.payerId || '',
        referenceId: stripeIntent.metadata.referenceId || '',
        referenceType: (stripeIntent.metadata.referenceType as 'subscription' | 'purchase' | 'deposit') || 'purchase',
      }));
    } catch (error) {
      return err(`Failed to get payment intent: ${error}`);
    }
  }

  async confirmIntent(
    intentId: string,
    params?: { paymentMethodId?: string; returnUrl?: string }
  ): Promise<Result<PaymentConfirmation, string>> {
    try {
      const body = new URLSearchParams();

      if (params?.paymentMethodId) {
        body.append('payment_method', params.paymentMethodId);
      }

      if (params?.returnUrl) {
        body.append('return_url', params.returnUrl);
      }

      const response = await this.request<StripePaymentIntent>(
        'POST',
        `/payment_intents/${intentId}/confirm`,
        body.toString() ? body : null,
        'charges'
      );

      if (!response.success) {
        return err(response.error);
      }

      const stripeIntent = response.data;

      if (stripeIntent.status !== 'succeeded') {
        return err(`Payment not confirmed, status: ${stripeIntent.status}`);
      }

      return ok(this.toPaymentConfirmation(stripeIntent));
    } catch (error) {
      return err(`Failed to confirm payment intent: ${error}`);
    }
  }

  async cancelIntent(intentId: string, reason?: string): Promise<Result<void, string>> {
    try {
      const body = new URLSearchParams();
      if (reason) {
        body.append('cancellation_reason', reason);
      }

      const response = await this.request<StripePaymentIntent>(
        'POST',
        `/payment_intents/${intentId}/cancel`,
        body.toString() ? body : null
      );

      if (!response.success) {
        return err(response.error);
      }

      return ok(undefined);
    } catch (error) {
      return err(`Failed to cancel payment intent: ${error}`);
    }
  }

  // ============================================================================
  // REFUNDS
  // ============================================================================

  async createRefund(request: RefundRequest): Promise<Result<Refund, string>> {
    try {
      const body = new URLSearchParams({
        payment_intent: request.intentId,
        reason: this.mapRefundReason(request.reason),
      });

      if (request.amount) {
        body.append('amount', request.amount);
      }

      if (request.metadata) {
        Object.entries(request.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, String(value));
        });
      }

      const response = await this.request<StripeRefund>('POST', '/refunds', body);

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toRefund(response.data));
    } catch (error) {
      return err(`Failed to create refund: ${error}`);
    }
  }

  async getRefund(refundId: string): Promise<Result<Refund, string>> {
    try {
      const response = await this.request<StripeRefund>('GET', `/refunds/${refundId}`);

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toRefund(response.data));
    } catch (error) {
      return err(`Failed to get refund: ${error}`);
    }
  }

  // ============================================================================
  // PAYOUTS
  // ============================================================================

  async createPayout(request: PayoutRequest): Promise<Result<Payout, string>> {
    try {
      if (request.destination.type !== 'bank_account') {
        return err('Stripe only supports bank account payouts');
      }

      const body = new URLSearchParams({
        amount: request.amount,
        currency: request.currency.code.toLowerCase(),
        destination: request.destination.accountId,
      });

      if (request.description) {
        body.append('description', request.description);
      }

      if (request.metadata) {
        Object.entries(request.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, String(value));
        });
      }

      const response = await this.request<StripePayout>('POST', '/payouts', body);

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toPayout(response.data));
    } catch (error) {
      return err(`Failed to create payout: ${error}`);
    }
  }

  async getPayout(payoutId: string): Promise<Result<Payout, string>> {
    try {
      const response = await this.request<StripePayout>('GET', `/payouts/${payoutId}`);

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toPayout(response.data));
    } catch (error) {
      return err(`Failed to get payout: ${error}`);
    }
  }

  // ============================================================================
  // BALANCE
  // ============================================================================

  async getBalance(): Promise<Result<Balance[], string>> {
    try {
      const response = await this.request<StripeBalance>('GET', '/balance');

      if (!response.success) {
        return err(response.error);
      }

      const balances: Balance[] = [];

      // Combine available and pending by currency
      const byCurrency = new Map<string, { available: bigint; pending: bigint }>();

      for (const avail of response.data.available) {
        const curr = avail.currency.toUpperCase();
        const existing = byCurrency.get(curr) || { available: 0n, pending: 0n };
        existing.available = BigInt(avail.amount);
        byCurrency.set(curr, existing);
      }

      for (const pend of response.data.pending) {
        const curr = pend.currency.toUpperCase();
        const existing = byCurrency.get(curr) || { available: 0n, pending: 0n };
        existing.pending = BigInt(pend.amount);
        byCurrency.set(curr, existing);
      }

      for (const [code, { available, pending }] of byCurrency) {
        const currency = CURRENCIES[code] || { code, type: 'fiat' as const, decimals: 2 };
        balances.push({
          available: available.toString(),
          pending: pending.toString(),
          currency,
        });
      }

      return ok(balances);
    } catch (error) {
      return err(`Failed to get balance: ${error}`);
    }
  }

  // ============================================================================
  // WEBHOOKS
  // ============================================================================

  async processWebhook(
    payload: unknown,
    signature: string
  ): Promise<Result<PaymentWebhookEvent, string>> {
    try {
      // Verify webhook signature
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const isValid = await this.verifyWebhookSignature(payloadString, signature);

      if (!isValid) {
        return err('Invalid webhook signature');
      }

      const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const stripeEvent = event as StripeWebhookEvent;

      return ok(this.toWebhookEvent(stripeEvent));
    } catch (error) {
      return err(`Failed to process webhook: ${error}`);
    }
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<StripeBalance>('GET', '/balance');
      return response.success;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: URLSearchParams | null,
    expand?: string
  ): Promise<Result<T, string>> {
    let url = `${this.baseUrl}${path}`;

    if (expand) {
      url += `?expand[]=${expand}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Stripe-Version': this.apiVersion,
    };

    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    if (this.connectedAccountId) {
      headers['Stripe-Account'] = this.connectedAccountId;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body?.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || `Stripe API error: ${response.status}`;
      return err(errorMessage);
    }

    return ok(data as T);
  }

  private async verifyWebhookSignature(payload: string, signature: string): Promise<boolean> {
    // Stripe webhook signature verification
    // Format: t=timestamp,v1=signature
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
    const sig = parts.find(p => p.startsWith('v1='))?.slice(3);

    if (!timestamp || !sig) {
      return false;
    }

    // Check timestamp is within 5 minutes
    const eventTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - eventTime) > 300) {
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    const expectedSig = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return sig === expectedSig;
  }

  private mapPaymentMethods(methods: PaymentMethodType[]): string[] {
    const stripeTypes: string[] = [];

    for (const method of methods) {
      switch (method) {
        case 'card':
          stripeTypes.push('card');
          break;
        case 'bank_transfer':
          stripeTypes.push('us_bank_account');
          stripeTypes.push('sepa_debit');
          break;
      }
    }

    return stripeTypes.length > 0 ? stripeTypes : ['card'];
  }

  private mapRefundReason(reason: RefundRequest['reason']): string {
    switch (reason) {
      case 'duplicate':
        return 'duplicate';
      case 'fraudulent':
        return 'fraudulent';
      case 'requested_by_customer':
        return 'requested_by_customer';
      default:
        return 'requested_by_customer';
    }
  }

  private mapStripeStatus(status: StripePaymentIntent['status']): PaymentStatus {
    switch (status) {
      case 'requires_payment_method':
      case 'requires_confirmation':
        return 'pending';
      case 'requires_action':
        return 'requires_action';
      case 'processing':
        return 'processing';
      case 'succeeded':
        return 'succeeded';
      case 'canceled':
        return 'cancelled';
      case 'requires_capture':
        return 'processing';
      default:
        return 'pending';
    }
  }

  private toPaymentIntent(
    stripeIntent: StripePaymentIntent,
    currency: Currency,
    params: {
      payerId: string;
      referenceId: string;
      referenceType: 'subscription' | 'purchase' | 'deposit';
      payerEmail?: string;
      allowedMethods?: PaymentMethodType[];
      returnUrl?: string;
    }
  ): PaymentIntent {
    return {
      id: stripeIntent.id,
      providerId: this.providerId,
      amount: stripeIntent.amount.toString(),
      currency,
      allowedMethods: params.allowedMethods || this.supportedMethods,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      payerId: params.payerId,
      payerEmail: params.payerEmail,
      status: this.mapStripeStatus(stripeIntent.status),
      clientSecret: stripeIntent.client_secret,
      returnUrl: params.returnUrl,
      createdAt: new Date(stripeIntent.created * 1000).toISOString(),
      providerData: { stripePaymentIntentId: stripeIntent.id },
      metadata: stripeIntent.metadata as Record<string, unknown>,
    };
  }

  private toPaymentConfirmation(stripeIntent: StripePaymentIntent): PaymentConfirmation {
    const charge = stripeIntent.charges?.data[0];

    let methodType: PaymentMethodType = 'card';
    let methodDetails: PaymentConfirmation['methodDetails'];

    if (charge?.payment_method_details) {
      const details = charge.payment_method_details;
      if (details.card) {
        methodType = 'card';
        methodDetails = {
          last4: details.card.last4,
          brand: details.card.brand,
        };
      } else if (details.us_bank_account) {
        methodType = 'bank_transfer';
        methodDetails = {
          last4: details.us_bank_account.last4,
          bankName: details.us_bank_account.bank_name,
        };
      }
    }

    // Estimate fees (Stripe typically charges 2.9% + $0.30 for cards)
    const amount = BigInt(stripeIntent.amount);
    const processingFee = (amount * 29n) / 1000n + 30n; // ~2.9% + $0.30
    const platformFee = this.platformFeeBps > 0
      ? calculateFee(amount, this.platformFeeBps)
      : 0n;
    const netAmount = amount - processingFee - platformFee;

    return {
      intentId: stripeIntent.id,
      status: 'succeeded',
      amountCharged: stripeIntent.amount.toString(),
      netAmount: netAmount.toString(),
      fees: {
        processingFee: processingFee.toString(),
        platformFee: platformFee.toString(),
      },
      methodType,
      methodDetails,
      receiptId: charge?.id,
      receiptUrl: charge?.receipt_url,
      confirmedAt: new Date().toISOString(),
      providerData: { stripeChargeId: charge?.id },
    };
  }

  private toRefund(stripeRefund: StripeRefund): Refund {
    const currency = CURRENCIES[stripeRefund.currency.toUpperCase()] || CURRENCIES.USD;

    return {
      id: stripeRefund.id,
      intentId: stripeRefund.payment_intent,
      amount: stripeRefund.amount.toString(),
      currency,
      status: stripeRefund.status === 'canceled' ? 'failed' : stripeRefund.status,
      reason: stripeRefund.reason || 'requested_by_customer',
      createdAt: new Date(stripeRefund.created * 1000).toISOString(),
      completedAt: stripeRefund.status === 'succeeded'
        ? new Date().toISOString()
        : undefined,
      providerData: { stripeRefundId: stripeRefund.id },
    };
  }

  private toPayout(stripePayout: StripePayout): Payout {
    const currency = CURRENCIES[stripePayout.currency.toUpperCase()] || CURRENCIES.USD;

    return {
      id: stripePayout.id,
      status: stripePayout.status === 'canceled' ? 'cancelled' : stripePayout.status,
      amount: stripePayout.amount.toString(),
      currency,
      arrivalDate: new Date(stripePayout.arrival_date * 1000).toISOString(),
      failureCode: stripePayout.failure_code,
      failureMessage: stripePayout.failure_message,
      createdAt: new Date(stripePayout.created * 1000).toISOString(),
      paidAt: stripePayout.status === 'paid'
        ? new Date(stripePayout.arrival_date * 1000).toISOString()
        : undefined,
      providerData: { stripePayoutId: stripePayout.id },
    };
  }

  private toWebhookEvent(stripeEvent: StripeWebhookEvent): PaymentWebhookEvent {
    const eventType = this.mapStripeEventType(stripeEvent.type);
    const obj = stripeEvent.data.object;

    let data: PaymentWebhookEvent['data'];

    if ('payment_intent' in obj && typeof obj.payment_intent === 'string') {
      // Refund
      const refund = obj as StripeRefund;
      data = {
        intentId: refund.payment_intent,
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount.toString(),
        currency: refund.currency,
      };
    } else if ('arrival_date' in obj) {
      // Payout
      const payout = obj as StripePayout;
      data = {
        payoutId: payout.id,
        status: payout.status,
        amount: payout.amount.toString(),
        currency: payout.currency,
      };
    } else {
      // Payment intent
      const intent = obj as StripePaymentIntent;
      data = {
        intentId: intent.id,
        status: this.mapStripeStatus(intent.status),
        amount: intent.amount.toString(),
        currency: intent.currency,
      };
    }

    return {
      id: stripeEvent.id,
      type: eventType,
      data,
      providerData: { stripeEventId: stripeEvent.id, stripeEventType: stripeEvent.type },
      createdAt: new Date(stripeEvent.created * 1000).toISOString(),
    };
  }

  private mapStripeEventType(type: string): PaymentWebhookEvent['type'] {
    switch (type) {
      case 'payment_intent.succeeded':
        return 'payment_intent.succeeded';
      case 'payment_intent.payment_failed':
        return 'payment_intent.failed';
      case 'payment_intent.processing':
        return 'payment_intent.processing';
      case 'payment_intent.canceled':
        return 'payment_intent.cancelled';
      case 'charge.refunded':
      case 'refund.created':
        return 'refund.created';
      case 'refund.updated':
        return 'refund.succeeded';
      case 'refund.failed':
        return 'refund.failed';
      case 'payout.paid':
        return 'payout.paid';
      case 'payout.failed':
        return 'payout.failed';
      default:
        return 'payment_intent.processing';
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Stripe payment provider
 */
export function createStripeProvider(config: StripeProviderConfig): StripeProvider {
  return new StripeProvider(config);
}
