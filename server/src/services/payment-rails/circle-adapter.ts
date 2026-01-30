/**
 * Circle USDC Payment Rail Adapter (Gap 20)
 *
 * Wraps the Circle API for USDC payment processing.
 * Implements the IPaymentRailProvider interface for uniform payment rail access.
 *
 * Since we cannot import the actual Circle SDK in this context, API calls
 * are mocked but use the correct Circle Payments API shapes.
 */

import { randomUUID } from 'crypto';
import { logger } from '../../middleware/logger.js';
import type {
  IPaymentRailProvider,
  PaymentResult,
  PayoutResult,
  RefundResult,
  CreatePaymentInput,
  CreatePayoutInput,
  RefundPaymentInput,
  PaymentRailStatus,
  PayoutStatus,
} from './stripe-adapter.js';

// Re-export the shared interface so consumers can import from either file
export type { IPaymentRailProvider };

// ============================================================================
// Circle API Types (matching Circle Payments API v1 shapes)
// ============================================================================

interface CirclePayment {
  id: string;
  type: 'payment';
  status: 'pending' | 'confirmed' | 'paid' | 'failed' | 'action_required';
  amount: {
    amount: string;
    currency: string; // always 'USD' for USDC
  };
  fees: {
    amount: string;
    currency: string;
  };
  source: {
    id: string;
    type: 'card' | 'ach' | 'wire' | 'blockchain';
  };
  description: string;
  merchantId: string;
  merchantWalletId: string;
  metadata: {
    email?: string;
    sessionId?: string;
    ipAddress?: string;
    [key: string]: unknown;
  };
  trackingRef: string | null;
  errorCode: string | null;
  riskEvaluation: {
    decision: 'approved' | 'denied' | 'review';
    reason: string;
  } | null;
  createDate: string;
  updateDate: string;
}

interface CircleRefund {
  id: string;
  type: 'refund';
  status: 'pending' | 'confirmed' | 'paid' | 'failed';
  amount: {
    amount: string;
    currency: string;
  };
  fees: {
    amount: string;
    currency: string;
  };
  originalPayment: {
    id: string;
    type: 'payment';
  };
  reason: string | null;
  merchantId: string;
  merchantWalletId: string;
  metadata: Record<string, unknown>;
  createDate: string;
  updateDate: string;
}

interface CircleTransfer {
  id: string;
  type: 'transfer';
  status: 'pending' | 'complete' | 'failed';
  amount: {
    amount: string;
    currency: string;
  };
  source: {
    type: 'wallet';
    id: string;
  };
  destination: {
    type: 'wallet' | 'blockchain';
    id?: string;
    address?: string;
    chain?: string;
  };
  transactionHash: string | null;
  metadata: Record<string, unknown>;
  createDate: string;
}

interface CirclePayout {
  id: string;
  type: 'payout';
  status: 'pending' | 'complete' | 'failed';
  amount: {
    amount: string;
    currency: string;
  };
  fees: {
    amount: string;
    currency: string;
  };
  sourceWalletId: string;
  destination: {
    type: 'wire' | 'ach';
    id: string;
    name: string;
  };
  adjustments: {
    fxCredit?: { amount: string; currency: string };
    fxDebit?: { amount: string; currency: string };
  } | null;
  externalRef: string | null;
  trackingRef: string | null;
  metadata: Record<string, unknown>;
  createDate: string;
  updateDate: string;
}

// ============================================================================
// Circle Adapter
// ============================================================================

export class CircleAdapter implements IPaymentRailProvider {
  readonly providerName = 'circle';

  private apiKey: string;
  private baseUrl: string;
  private merchantWalletId: string;

  // In-memory store for mock mode
  private circlePayments = new Map<string, CirclePayment>();
  private circleRefunds = new Map<string, CircleRefund>();
  private circlePayouts = new Map<string, CirclePayout>();

  constructor(config?: {
    apiKey?: string;
    baseUrl?: string;
    merchantWalletId?: string;
  }) {
    this.apiKey = config?.apiKey || process.env.CIRCLE_API_KEY || 'TEST_API_KEY';
    this.baseUrl = config?.baseUrl || process.env.CIRCLE_BASE_URL || 'https://api.circle.com/v1';
    this.merchantWalletId = config?.merchantWalletId || process.env.CIRCLE_MERCHANT_WALLET_ID || 'merchant_wallet_001';
  }

  /**
   * Create a Circle payment (USDC).
   *
   * Maps to: POST /v1/payments
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const paymentId = randomUUID();
    const now = new Date().toISOString();

    // Convert integer cents to string dollars for Circle format
    const amountStr = (input.amount / 100).toFixed(2);

    const circlePayment: CirclePayment = {
      id: paymentId,
      type: 'payment',
      status: input.confirm ? 'paid' : 'pending',
      amount: {
        amount: amountStr,
        currency: 'USD',
      },
      fees: {
        amount: '0.00',
        currency: 'USD',
      },
      source: {
        id: input.paymentMethodId || `src_${randomUUID().slice(0, 8)}`,
        type: 'blockchain',
      },
      description: input.description || '',
      merchantId: `merchant_${randomUUID().slice(0, 8)}`,
      merchantWalletId: this.merchantWalletId,
      metadata: {
        ...(input.metadata || {}),
      },
      trackingRef: `CIR-${randomUUID().slice(0, 12).toUpperCase()}`,
      errorCode: null,
      riskEvaluation: {
        decision: 'approved',
        reason: 'auto_approved',
      },
      createDate: now,
      updateDate: now,
    };

    this.circlePayments.set(paymentId, circlePayment);

    logger.info('Circle payment created', {
      paymentId,
      amount: amountStr,
      currency: 'USDC',
    });

    return this.mapCirclePayment(circlePayment);
  }

  /**
   * Retrieve a Circle payment.
   *
   * Maps to: GET /v1/payments/:id
   */
  async getPayment(providerPaymentId: string): Promise<PaymentResult> {
    const payment = this.circlePayments.get(providerPaymentId);
    if (!payment) {
      throw new Error(`Circle payment not found: ${providerPaymentId}`);
    }
    return this.mapCirclePayment(payment);
  }

  /**
   * Refund a Circle payment.
   *
   * Maps to: POST /v1/payments/:id/refund
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const payment = this.circlePayments.get(input.paymentId);
    if (!payment) {
      throw new Error(`Circle payment not found: ${input.paymentId}`);
    }

    if (payment.status !== 'paid' && payment.status !== 'confirmed') {
      throw new Error(`Cannot refund payment in status: ${payment.status}`);
    }

    const originalAmountCents = Math.round(parseFloat(payment.amount.amount) * 100);
    const refundAmount = input.amount ?? originalAmountCents;
    if (refundAmount > originalAmountCents) {
      throw new Error('Refund amount exceeds original payment amount');
    }

    const refundId = randomUUID();
    const now = new Date().toISOString();
    const refundAmountStr = (refundAmount / 100).toFixed(2);

    const circleRefund: CircleRefund = {
      id: refundId,
      type: 'refund',
      status: 'paid',
      amount: {
        amount: refundAmountStr,
        currency: 'USD',
      },
      fees: {
        amount: '0.00',
        currency: 'USD',
      },
      originalPayment: {
        id: payment.id,
        type: 'payment',
      },
      reason: input.reason || null,
      merchantId: payment.merchantId,
      merchantWalletId: payment.merchantWalletId,
      metadata: input.metadata || {},
      createDate: now,
      updateDate: now,
    };

    this.circleRefunds.set(refundId, circleRefund);

    logger.info('Circle refund created', {
      refundId,
      paymentId: payment.id,
      amount: refundAmountStr,
    });

    return {
      id: randomUUID(),
      provider: this.providerName,
      providerRefundId: circleRefund.id,
      paymentId: input.paymentId,
      amount: refundAmount,
      currency: 'USDC',
      status: circleRefund.status === 'paid' ? 'succeeded' : circleRefund.status === 'pending' ? 'pending' : 'failed',
      reason: circleRefund.reason ?? undefined,
      metadata: circleRefund.metadata,
      createdAt: circleRefund.createDate,
    };
  }

  /**
   * Create a Circle payout (USDC to bank / wire).
   *
   * Maps to: POST /v1/payouts
   */
  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    const payoutId = randomUUID();
    const now = new Date().toISOString();
    const amountStr = (input.amount / 100).toFixed(2);

    // Map our destination types to Circle types
    const circleDestType = input.destinationType === 'bank_account' ? 'wire' : 'ach';

    const circlePayout: CirclePayout = {
      id: payoutId,
      type: 'payout',
      status: 'pending',
      amount: {
        amount: amountStr,
        currency: 'USD',
      },
      fees: {
        amount: '0.00',
        currency: 'USD',
      },
      sourceWalletId: this.merchantWalletId,
      destination: {
        type: circleDestType,
        id: input.destinationId,
        name: 'Beneficiary',
      },
      adjustments: null,
      externalRef: input.idempotencyKey || null,
      trackingRef: `CIR-PO-${randomUUID().slice(0, 12).toUpperCase()}`,
      metadata: input.metadata || {},
      createDate: now,
      updateDate: now,
    };

    this.circlePayouts.set(payoutId, circlePayout);

    // Estimated arrival: +3 business days
    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() + 3);

    logger.info('Circle payout created', {
      payoutId,
      amount: amountStr,
      destination: input.destinationId,
    });

    return {
      id: randomUUID(),
      provider: this.providerName,
      providerPayoutId: circlePayout.id,
      amount: input.amount,
      currency: 'USDC',
      status: circlePayout.status as PayoutStatus,
      destinationType: circleDestType,
      destinationId: input.destinationId,
      arrivalDate: arrivalDate.toISOString(),
      metadata: circlePayout.metadata,
      createdAt: circlePayout.createDate,
    };
  }

  // ============================================================================
  // Mapping Helpers
  // ============================================================================

  private mapCirclePayment(cp: CirclePayment): PaymentResult {
    const statusMap: Record<string, PaymentRailStatus> = {
      pending: 'pending',
      confirmed: 'processing',
      paid: 'succeeded',
      failed: 'failed',
      action_required: 'pending',
    };

    return {
      id: randomUUID(),
      provider: this.providerName,
      providerPaymentId: cp.id,
      amount: Math.round(parseFloat(cp.amount.amount) * 100),
      currency: 'USDC',
      status: statusMap[cp.status] || 'pending',
      metadata: cp.metadata,
      createdAt: cp.createDate,
      updatedAt: cp.updateDate,
    };
  }
}
