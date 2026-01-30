/**
 * Stripe Payment Rail Adapter (Gap 20)
 *
 * Wraps the Stripe API for server-side payment processing.
 * Implements the IPaymentRailProvider interface for uniform payment rail access.
 *
 * Since we cannot import the actual Stripe SDK in this context, API calls
 * are mocked but use the correct Stripe API request/response shapes.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../middleware/logger.js';

// ============================================================================
// Shared Interface
// ============================================================================

export type PaymentRailStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type PayoutStatus =
  | 'pending'
  | 'in_transit'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface PaymentResult {
  id: string;
  provider: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentRailStatus;
  clientSecret?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutResult {
  id: string;
  provider: string;
  providerPayoutId: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  destinationType: string;
  destinationId: string;
  arrivalDate?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface RefundResult {
  id: string;
  provider: string;
  providerRefundId: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed';
  reason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  description?: string;
  customerId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
  captureMethod?: 'automatic' | 'manual';
  confirm?: boolean;
}

export interface CreatePayoutInput {
  amount: number;
  currency: string;
  destinationType: 'bank_account' | 'card';
  destinationId: string;
  description?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export interface RefundPaymentInput {
  paymentId: string;
  amount?: number; // partial refund if < original
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

/**
 * Unified payment rail provider interface.
 * Implemented by Stripe, Circle, and any future adapters.
 */
export interface IPaymentRailProvider {
  readonly providerName: string;

  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  getPayment(providerPaymentId: string): Promise<PaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundResult>;
  createPayout(input: CreatePayoutInput): Promise<PayoutResult>;
}

// ============================================================================
// Stripe Types (matching Stripe API shapes)
// ============================================================================

interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  amount_received: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  client_secret: string;
  capture_method: 'automatic' | 'manual';
  confirmation_method: 'automatic' | 'manual';
  description: string | null;
  customer: string | null;
  payment_method: string | null;
  metadata: Record<string, string>;
  created: number;
  livemode: boolean;
}

interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  payment_intent: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason: string | null;
  metadata: Record<string, string>;
  created: number;
}

interface StripePayout {
  id: string;
  object: 'payout';
  amount: number;
  currency: string;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
  destination: string;
  type: 'bank_account' | 'card';
  description: string | null;
  arrival_date: number;
  metadata: Record<string, string>;
  created: number;
}

// ============================================================================
// Stripe Adapter
// ============================================================================

export class StripeAdapter implements IPaymentRailProvider {
  readonly providerName = 'stripe';

  private secretKey: string;
  private apiVersion: string;
  private baseUrl: string;

  // In-memory store for mock mode
  private paymentIntents = new Map<string, StripePaymentIntent>();
  private refunds = new Map<string, StripeRefund>();
  private payouts = new Map<string, StripePayout>();

  constructor(config?: { secretKey?: string; apiVersion?: string }) {
    this.secretKey = config?.secretKey || process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
    this.apiVersion = config?.apiVersion || '2024-04-10';
    this.baseUrl = 'https://api.stripe.com/v1';
  }

  /**
   * Create a Stripe PaymentIntent.
   *
   * Maps to: POST /v1/payment_intents
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    // Build the Stripe PaymentIntent shape
    const piId = `pi_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const now = Math.floor(Date.now() / 1000);

    const paymentIntent: StripePaymentIntent = {
      id: piId,
      object: 'payment_intent',
      amount: input.amount,
      amount_received: input.confirm ? input.amount : 0,
      currency: input.currency.toLowerCase(),
      status: input.confirm ? 'succeeded' : 'requires_payment_method',
      client_secret: `${piId}_secret_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      capture_method: input.captureMethod || 'automatic',
      confirmation_method: 'automatic',
      description: input.description || null,
      customer: input.customerId || null,
      payment_method: input.paymentMethodId || null,
      metadata: input.metadata || {},
      created: now,
      livemode: !this.secretKey.startsWith('sk_test'),
    };

    this.paymentIntents.set(piId, paymentIntent);

    logger.info('Stripe PaymentIntent created', {
      paymentIntentId: piId,
      amount: input.amount,
      currency: input.currency,
    });

    return this.mapPaymentIntent(paymentIntent);
  }

  /**
   * Retrieve a Stripe PaymentIntent.
   *
   * Maps to: GET /v1/payment_intents/:id
   */
  async getPayment(providerPaymentId: string): Promise<PaymentResult> {
    const pi = this.paymentIntents.get(providerPaymentId);
    if (!pi) {
      throw new Error(`PaymentIntent not found: ${providerPaymentId}`);
    }
    return this.mapPaymentIntent(pi);
  }

  /**
   * Refund a Stripe PaymentIntent.
   *
   * Maps to: POST /v1/refunds
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const pi = this.paymentIntents.get(input.paymentId);
    if (!pi) {
      throw new Error(`PaymentIntent not found: ${input.paymentId}`);
    }

    if (pi.status !== 'succeeded') {
      throw new Error(`Cannot refund payment in status: ${pi.status}`);
    }

    const refundAmount = input.amount ?? pi.amount;
    if (refundAmount > pi.amount_received) {
      throw new Error('Refund amount exceeds amount received');
    }

    const refundId = `re_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const now = Math.floor(Date.now() / 1000);

    const stripeRefund: StripeRefund = {
      id: refundId,
      object: 'refund',
      amount: refundAmount,
      currency: pi.currency,
      payment_intent: pi.id,
      status: 'succeeded',
      reason: input.reason || null,
      metadata: input.metadata || {},
      created: now,
    };

    this.refunds.set(refundId, stripeRefund);

    // Update PI status
    if (refundAmount === pi.amount) {
      pi.status = 'canceled';
    }

    logger.info('Stripe refund created', {
      refundId,
      paymentIntentId: pi.id,
      amount: refundAmount,
    });

    return {
      id: randomUUID(),
      provider: this.providerName,
      providerRefundId: stripeRefund.id,
      paymentId: input.paymentId,
      amount: stripeRefund.amount,
      currency: stripeRefund.currency.toUpperCase(),
      status: stripeRefund.status === 'succeeded' ? 'succeeded' : stripeRefund.status === 'pending' ? 'pending' : 'failed',
      reason: stripeRefund.reason ?? undefined,
      metadata: stripeRefund.metadata,
      createdAt: new Date(stripeRefund.created * 1000).toISOString(),
    };
  }

  /**
   * Create a Stripe Payout.
   *
   * Maps to: POST /v1/payouts
   */
  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    const payoutId = `po_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const now = Math.floor(Date.now() / 1000);
    const arrivalTs = now + 2 * 24 * 60 * 60; // +2 days

    const stripePayout: StripePayout = {
      id: payoutId,
      object: 'payout',
      amount: input.amount,
      currency: input.currency.toLowerCase(),
      status: 'pending',
      destination: input.destinationId,
      type: input.destinationType,
      description: input.description || null,
      arrival_date: arrivalTs,
      metadata: input.metadata || {},
      created: now,
    };

    this.payouts.set(payoutId, stripePayout);

    logger.info('Stripe payout created', {
      payoutId,
      amount: input.amount,
      currency: input.currency,
      destination: input.destinationId,
    });

    return {
      id: randomUUID(),
      provider: this.providerName,
      providerPayoutId: stripePayout.id,
      amount: stripePayout.amount,
      currency: stripePayout.currency.toUpperCase(),
      status: stripePayout.status as PayoutStatus,
      destinationType: stripePayout.type,
      destinationId: stripePayout.destination,
      arrivalDate: new Date(stripePayout.arrival_date * 1000).toISOString(),
      metadata: stripePayout.metadata,
      createdAt: new Date(stripePayout.created * 1000).toISOString(),
    };
  }

  // ============================================================================
  // Mapping Helpers
  // ============================================================================

  private mapPaymentIntent(pi: StripePaymentIntent): PaymentResult {
    const statusMap: Record<string, PaymentRailStatus> = {
      requires_payment_method: 'pending',
      requires_confirmation: 'pending',
      requires_action: 'pending',
      processing: 'processing',
      requires_capture: 'processing',
      canceled: 'cancelled',
      succeeded: 'succeeded',
    };

    return {
      id: randomUUID(),
      provider: this.providerName,
      providerPaymentId: pi.id,
      amount: pi.amount,
      currency: pi.currency.toUpperCase(),
      status: statusMap[pi.status] || 'pending',
      clientSecret: pi.client_secret,
      metadata: pi.metadata,
      createdAt: new Date(pi.created * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
