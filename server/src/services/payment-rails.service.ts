/**
 * Payment Rails Service
 *
 * Manages payment rails for fiat-to-token and token-to-fiat flows.
 * DB-backed with pluggable provider adapters:
 * - USDC on-chain payments (via Circle API)
 * - Bank ACH transfers (via Stripe)
 * - Bank Wire transfers (via Stripe)
 * - Bank SEPA transfers (via Stripe)
 */

import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lte, sql, count, sum } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { logger } from '../middleware/logger.js';

const { paymentRailConfigs, paymentTransactions, investors } = schema;

// ============================================================================
// Types
// ============================================================================

export type PaymentRailType = 'usdc' | 'bank_ach' | 'bank_wire' | 'bank_sepa';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface RailConfig {
  id: string;
  orgId: string;
  railType: PaymentRailType;
  name: string;
  config: Record<string, unknown>;
  supportedCurrencies: string[];
  fees: {
    fixed?: string;
    percentage?: number;
  };
  limits: {
    minAmount?: string;
    maxAmount?: string;
    dailyLimit?: string;
  };
  isDefault: boolean;
  status: 'active' | 'disabled';
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  orgId: string;
  railConfigId: string;
  railType: PaymentRailType;
  direction: 'inbound' | 'outbound';
  amount: string;
  currency: string;
  status: PaymentStatus;
  reference?: string;
  externalId?: string;
  investorId?: string;
  walletAddress?: string;
  bankDetails?: Record<string, unknown>;
  txHash?: string;
  feeAmount?: string;
  feeCurrency?: string;
  error?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CreateRailConfigInput {
  orgId: string;
  railType: PaymentRailType;
  name: string;
  config: Record<string, unknown>;
  supportedCurrencies: string[];
  fees?: { fixed?: string; percentage?: number };
  limits?: { minAmount?: string; maxAmount?: string; dailyLimit?: string };
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreatePaymentInput {
  orgId: string;
  railConfigId: string;
  direction: 'inbound' | 'outbound';
  amount: string;
  currency: string;
  investorId?: string;
  walletAddress?: string;
  bankDetails?: Record<string, unknown>;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentAnalytics {
  totalPayments: number;
  totalVolume: string;
  byStatus: Record<PaymentStatus, number>;
  byRailType: Record<PaymentRailType, number>;
  byDirection: {
    inbound: { count: number; volume: string };
    outbound: { count: number; volume: string };
  };
}

// ============================================================================
// Provider Adapter Interface
// ============================================================================

export interface PaymentProviderAdapter {
  /** Initiate a payment with the external provider */
  initiatePayment(payment: Payment, railConfig: RailConfig): Promise<{
    externalId: string;
    status: PaymentStatus;
    txHash?: string;
    metadata?: Record<string, unknown>;
  }>;
  /** Check status of an existing payment */
  getPaymentStatus(externalId: string, railConfig: RailConfig): Promise<{
    status: PaymentStatus;
    txHash?: string;
    error?: string;
    completedAt?: Date;
  }>;
  /** Cancel a payment if possible */
  cancelPayment(externalId: string, railConfig: RailConfig): Promise<boolean>;
}

// ============================================================================
// Stripe Adapter (ACH / Wire / SEPA)
// ============================================================================

class StripeAdapter implements PaymentProviderAdapter {
  async initiatePayment(payment: Payment, railConfig: RailConfig): Promise<{
    externalId: string;
    status: PaymentStatus;
    metadata?: Record<string, unknown>;
  }> {
    const apiKey = railConfig.config.stripeSecretKey as string;
    if (!apiKey) throw new ValidationError('Stripe API key not configured for this rail');

    const body: Record<string, string> = {
      amount: this.toStripeCents(payment.amount, payment.currency),
      currency: payment.currency.toLowerCase(),
      'payment_method_types[]': this.getStripeMethodType(railConfig.railType),
      description: `Tokenisation ${payment.direction} - ${payment.reference || payment.id}`,
      'metadata[paymentId]': payment.id,
      'metadata[orgId]': payment.orgId,
      'metadata[direction]': payment.direction,
    };

    if (payment.bankDetails?.customerId) {
      body.customer = payment.bankDetails.customerId as string;
    }

    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new AppError(`Stripe error: ${errData.error?.message || response.statusText}`, response.status);
    }

    const pi = await response.json() as { id: string; status: string };

    return {
      externalId: pi.id,
      status: this.mapStripeStatus(pi.status),
      metadata: { stripeStatus: pi.status },
    };
  }

  async getPaymentStatus(externalId: string, railConfig: RailConfig): Promise<{
    status: PaymentStatus;
    error?: string;
    completedAt?: Date;
  }> {
    const apiKey = railConfig.config.stripeSecretKey as string;

    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${externalId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new AppError(`Stripe status check failed: ${response.statusText}`, response.status);
    }

    const pi = await response.json() as {
      status: string;
      last_payment_error?: { message: string };
      charges?: { data?: Array<{ created: number }> };
    };

    const status = this.mapStripeStatus(pi.status);
    return {
      status,
      error: pi.last_payment_error?.message,
      completedAt: status === 'completed' && pi.charges?.data?.[0]
        ? new Date(pi.charges.data[0].created * 1000)
        : undefined,
    };
  }

  async cancelPayment(externalId: string, railConfig: RailConfig): Promise<boolean> {
    const apiKey = railConfig.config.stripeSecretKey as string;

    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${externalId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    return response.ok;
  }

  private toStripeCents(amount: string, currency: string): string {
    // Stripe expects amounts in smallest currency unit (cents for USD/EUR)
    const zeroDecimalCurrencies = ['jpy', 'krw', 'vnd'];
    if (zeroDecimalCurrencies.includes(currency.toLowerCase())) {
      return amount;
    }
    return String(Math.round(parseFloat(amount) * 100));
  }

  private getStripeMethodType(railType: PaymentRailType): string {
    switch (railType) {
      case 'bank_ach': return 'us_bank_account';
      case 'bank_sepa': return 'sepa_debit';
      case 'bank_wire': return 'customer_balance';
      default: return 'card';
    }
  }

  private mapStripeStatus(stripeStatus: string): PaymentStatus {
    switch (stripeStatus) {
      case 'succeeded': return 'completed';
      case 'processing':
      case 'requires_capture': return 'processing';
      case 'canceled': return 'cancelled';
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action': return 'pending';
      default: return 'pending';
    }
  }
}

// ============================================================================
// Circle Adapter (USDC)
// ============================================================================

class CircleAdapter implements PaymentProviderAdapter {
  async initiatePayment(payment: Payment, railConfig: RailConfig): Promise<{
    externalId: string;
    status: PaymentStatus;
    txHash?: string;
    metadata?: Record<string, unknown>;
  }> {
    const apiKey = railConfig.config.circleApiKey as string;
    const baseUrl = (railConfig.config.circleBaseUrl as string) || 'https://api.circle.com';
    if (!apiKey) throw new ValidationError('Circle API key not configured for this rail');

    const idempotencyKey = payment.id;

    if (payment.direction === 'outbound') {
      // Payout: send USDC to a wallet address
      const response = await fetch(`${baseUrl}/v1/transfers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idempotencyKey,
          source: { type: 'wallet', id: railConfig.config.circleWalletId },
          destination: {
            type: 'blockchain',
            address: payment.walletAddress,
            chain: (railConfig.config.chain as string) || 'MATIC',
          },
          amount: { amount: payment.amount, currency: 'USD' },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new AppError(`Circle error: ${(err as Record<string, string>).message || response.statusText}`, response.status);
      }

      const data = await response.json() as { data: { id: string; status: string; transactionHash?: string } };

      return {
        externalId: data.data.id,
        status: this.mapCircleStatus(data.data.status),
        txHash: data.data.transactionHash,
      };
    } else {
      // Inbound: create a payment intent for USDC deposit
      const response = await fetch(`${baseUrl}/v1/payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idempotencyKey,
          amount: { amount: payment.amount, currency: 'USD' },
          source: { type: 'blockchain' },
          settlementCurrency: 'USD',
          metadata: { paymentId: payment.id },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new AppError(`Circle error: ${(err as Record<string, string>).message || response.statusText}`, response.status);
      }

      const data = await response.json() as { data: { id: string; status: string } };

      return {
        externalId: data.data.id,
        status: this.mapCircleStatus(data.data.status),
      };
    }
  }

  async getPaymentStatus(externalId: string, railConfig: RailConfig): Promise<{
    status: PaymentStatus;
    txHash?: string;
    error?: string;
    completedAt?: Date;
  }> {
    const apiKey = railConfig.config.circleApiKey as string;
    const baseUrl = (railConfig.config.circleBaseUrl as string) || 'https://api.circle.com';

    const response = await fetch(`${baseUrl}/v1/transfers/${externalId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      throw new AppError(`Circle status check failed: ${response.statusText}`, response.status);
    }

    const data = await response.json() as {
      data: {
        status: string;
        transactionHash?: string;
        errorCode?: string;
        createDate?: string;
      };
    };

    return {
      status: this.mapCircleStatus(data.data.status),
      txHash: data.data.transactionHash,
      error: data.data.errorCode,
      completedAt: data.data.status === 'complete' && data.data.createDate
        ? new Date(data.data.createDate)
        : undefined,
    };
  }

  async cancelPayment(_externalId: string, _railConfig: RailConfig): Promise<boolean> {
    // Circle transfers cannot be cancelled once initiated
    return false;
  }

  private mapCircleStatus(circleStatus: string): PaymentStatus {
    switch (circleStatus) {
      case 'complete': return 'completed';
      case 'pending': return 'processing';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }
}

// ============================================================================
// Adapter Registry
// ============================================================================

const adapters: Record<PaymentRailType, PaymentProviderAdapter> = {
  usdc: new CircleAdapter(),
  bank_ach: new StripeAdapter(),
  bank_wire: new StripeAdapter(),
  bank_sepa: new StripeAdapter(),
};

// ============================================================================
// Rail Configuration Functions (DB-backed)
// ============================================================================

export async function createRailConfig(input: CreateRailConfigInput): Promise<RailConfig> {
  const [row] = await db.insert(paymentRailConfigs).values({
    orgId: input.orgId,
    railType: input.railType,
    name: input.name,
    config: input.config,
    supportedCurrencies: input.supportedCurrencies,
    fees: input.fees || {},
    limits: input.limits || {},
    isDefault: input.isDefault || false,
    status: 'active',
    metadata: input.metadata || {},
  }).returning();

  await auditService.log({
    orgId: input.orgId,
    actorType: 'system',
    action: 'payment_rail.created',
    resourceType: 'payment_rail',
    resourceId: row.id,
    metadata: { railType: input.railType, name: input.name },
  });

  logger.info('Payment rail created', { metadata: { railId: row.id, railType: input.railType } });
  return mapRailConfig(row);
}

export async function listRailConfigs(
  orgId: string,
  filters?: { railType?: PaymentRailType; status?: 'active' | 'disabled' }
): Promise<RailConfig[]> {
  const conditions = [eq(paymentRailConfigs.orgId, orgId)];
  if (filters?.railType) conditions.push(eq(paymentRailConfigs.railType, filters.railType));
  if (filters?.status) conditions.push(eq(paymentRailConfigs.status, filters.status));

  const rows = await db.query.paymentRailConfigs.findMany({
    where: and(...conditions),
    orderBy: desc(paymentRailConfigs.createdAt),
  });

  return rows.map(mapRailConfig);
}

export async function getRailConfig(id: string, orgId: string): Promise<RailConfig> {
  const row = await db.query.paymentRailConfigs.findFirst({
    where: and(eq(paymentRailConfigs.id, id), eq(paymentRailConfigs.orgId, orgId)),
  });
  if (!row) throw new NotFoundError('Payment rail configuration not found');
  return mapRailConfig(row);
}

export async function updateRailConfig(
  id: string,
  orgId: string,
  updates: Partial<Omit<RailConfig, 'id' | 'orgId' | 'railType' | 'createdAt'>>
): Promise<RailConfig> {
  await getRailConfig(id, orgId); // verify exists

  const [row] = await db.update(paymentRailConfigs)
    .set({
      ...(updates.name && { name: updates.name }),
      ...(updates.config && { config: updates.config }),
      ...(updates.supportedCurrencies && { supportedCurrencies: updates.supportedCurrencies }),
      ...(updates.fees && { fees: updates.fees }),
      ...(updates.limits && { limits: updates.limits }),
      ...(updates.isDefault !== undefined && { isDefault: updates.isDefault }),
      ...(updates.status && { status: updates.status }),
      ...(updates.metadata && { metadata: updates.metadata }),
      updatedAt: new Date(),
    })
    .where(and(eq(paymentRailConfigs.id, id), eq(paymentRailConfigs.orgId, orgId)))
    .returning();

  await auditService.log({
    orgId,
    actorType: 'system',
    action: 'payment_rail.updated',
    resourceType: 'payment_rail',
    resourceId: id,
    metadata: { updates: Object.keys(updates) },
  });

  return mapRailConfig(row);
}

export async function deleteRailConfig(id: string, orgId: string): Promise<boolean> {
  const config = await getRailConfig(id, orgId);

  await db.delete(paymentRailConfigs)
    .where(and(eq(paymentRailConfigs.id, id), eq(paymentRailConfigs.orgId, orgId)));

  await auditService.log({
    orgId,
    actorType: 'system',
    action: 'payment_rail.deleted',
    resourceType: 'payment_rail',
    resourceId: id,
    metadata: { railType: config.railType },
  });

  return true;
}

// ============================================================================
// Payment Functions (DB-backed, provider-integrated)
// ============================================================================

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const railConfig = await getRailConfig(input.railConfigId, input.orgId);

  // Validate currency
  const supportedCurrencies = railConfig.supportedCurrencies as string[];
  if (!supportedCurrencies.includes(input.currency)) {
    throw new ValidationError(`Currency ${input.currency} not supported by rail "${railConfig.name}". Supported: ${supportedCurrencies.join(', ')}`);
  }

  // Validate limits
  const limits = railConfig.limits as { minAmount?: string; maxAmount?: string; dailyLimit?: string };
  const amount = parseFloat(input.amount);
  if (limits.minAmount && amount < parseFloat(limits.minAmount)) {
    throw new ValidationError(`Amount ${input.amount} is below minimum ${limits.minAmount}`);
  }
  if (limits.maxAmount && amount > parseFloat(limits.maxAmount)) {
    throw new ValidationError(`Amount ${input.amount} exceeds maximum ${limits.maxAmount}`);
  }

  // Check daily limit
  if (limits.dailyLimit) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [dailyTotal] = await db.select({ total: sum(paymentTransactions.amount) })
      .from(paymentTransactions)
      .where(and(
        eq(paymentTransactions.orgId, input.orgId),
        eq(paymentTransactions.railConfigId, input.railConfigId),
        eq(paymentTransactions.direction, input.direction),
        gte(paymentTransactions.createdAt, todayStart),
      ));

    const currentDaily = parseFloat(dailyTotal?.total || '0');
    if (currentDaily + amount > parseFloat(limits.dailyLimit)) {
      throw new ValidationError(`Daily limit of ${limits.dailyLimit} would be exceeded (current: ${currentDaily.toFixed(2)})`);
    }
  }

  // Calculate fee
  const fees = railConfig.fees as { fixed?: string; percentage?: number };
  let feeAmount = '0';
  if (fees.fixed) {
    feeAmount = fees.fixed;
  } else if (fees.percentage) {
    feeAmount = (amount * fees.percentage / 100).toFixed(6);
  }

  const [row] = await db.insert(paymentTransactions).values({
    orgId: input.orgId,
    railConfigId: input.railConfigId,
    railType: railConfig.railType,
    direction: input.direction,
    amount: input.amount,
    currency: input.currency,
    status: 'pending',
    reference: input.reference,
    investorId: input.investorId,
    walletAddress: input.walletAddress,
    bankDetails: input.bankDetails || {},
    feeAmount,
    feeCurrency: input.currency,
    metadata: input.metadata || {},
  }).returning();

  await auditService.log({
    orgId: input.orgId,
    actorType: 'system',
    action: 'payment.created',
    resourceType: 'payment',
    resourceId: row.id,
    metadata: { direction: input.direction, amount: input.amount, currency: input.currency, railType: railConfig.railType },
  });

  logger.info('Payment created', { metadata: { paymentId: row.id, direction: input.direction, amount: input.amount } });
  return mapPayment(row);
}

export async function createBatchPayments(
  input: { orgId: string; payments: Omit<CreatePaymentInput, 'orgId'>[] }
): Promise<{ created: Payment[]; failed: { index: number; error: string }[] }> {
  const created: Payment[] = [];
  const failed: { index: number; error: string }[] = [];

  for (let i = 0; i < input.payments.length; i++) {
    try {
      const payment = await createPayment({ ...input.payments[i], orgId: input.orgId });
      created.push(payment);
    } catch (error) {
      failed.push({ index: i, error: (error as Error).message });
    }
  }

  return { created, failed };
}

export async function listPayments(
  orgId: string,
  filters?: {
    status?: PaymentStatus;
    railType?: PaymentRailType;
    direction?: 'inbound' | 'outbound';
    investorId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<Payment[]> {
  const conditions = [eq(paymentTransactions.orgId, orgId)];
  if (filters?.status) conditions.push(eq(paymentTransactions.status, filters.status));
  if (filters?.railType) conditions.push(eq(paymentTransactions.railType, filters.railType));
  if (filters?.direction) conditions.push(eq(paymentTransactions.direction, filters.direction));
  if (filters?.investorId) conditions.push(eq(paymentTransactions.investorId, filters.investorId));
  if (filters?.startDate) conditions.push(gte(paymentTransactions.createdAt, new Date(filters.startDate)));
  if (filters?.endDate) conditions.push(lte(paymentTransactions.createdAt, new Date(filters.endDate)));

  const rows = await db.query.paymentTransactions.findMany({
    where: and(...conditions),
    orderBy: desc(paymentTransactions.createdAt),
  });

  return rows.map(mapPayment);
}

export async function getPayment(id: string, orgId: string): Promise<Payment> {
  const row = await db.query.paymentTransactions.findFirst({
    where: and(eq(paymentTransactions.id, id), eq(paymentTransactions.orgId, orgId)),
  });
  if (!row) throw new NotFoundError('Payment not found');
  return mapPayment(row);
}

export async function processPayment(id: string, orgId: string): Promise<Payment> {
  const payment = await getPayment(id, orgId);
  if (payment.status !== 'pending') {
    throw new ValidationError(`Cannot process payment in status: ${payment.status}`);
  }

  const railConfig = await getRailConfig(payment.railConfigId, orgId);
  const adapter = adapters[payment.railType as PaymentRailType];

  try {
    // Call external provider
    const result = await adapter.initiatePayment(payment, railConfig);

    const [row] = await db.update(paymentTransactions)
      .set({
        status: result.status,
        externalId: result.externalId,
        txHash: result.txHash,
        metadata: { ...payment.metadata, ...result.metadata },
        updatedAt: new Date(),
        ...(result.status === 'completed' && { completedAt: new Date() }),
      })
      .where(eq(paymentTransactions.id, id))
      .returning();

    await auditService.log({
      orgId,
      actorType: 'system',
      action: 'payment.processing',
      resourceType: 'payment',
      resourceId: id,
      metadata: { externalId: result.externalId, providerStatus: result.status },
    });

    logger.info('Payment submitted to provider', { metadata: { paymentId: id, externalId: result.externalId } });
    return mapPayment(row);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    const [row] = await db.update(paymentTransactions)
      .set({
        status: 'failed',
        error: errorMsg,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, id))
      .returning();

    logger.error('Payment processing failed', { error: err });
    return mapPayment(row);
  }
}

export async function refreshPaymentStatus(id: string, orgId: string): Promise<Payment> {
  const payment = await getPayment(id, orgId);
  if (!payment.externalId) {
    throw new ValidationError('Payment has no external ID — not yet submitted to provider');
  }
  if (['completed', 'cancelled'].includes(payment.status)) {
    return payment; // Terminal state, no need to refresh
  }

  const railConfig = await getRailConfig(payment.railConfigId, orgId);
  const adapter = adapters[payment.railType as PaymentRailType];

  const result = await adapter.getPaymentStatus(payment.externalId, railConfig);

  const [row] = await db.update(paymentTransactions)
    .set({
      status: result.status,
      txHash: result.txHash || payment.txHash,
      error: result.error || payment.error,
      updatedAt: new Date(),
      ...(result.completedAt && { completedAt: result.completedAt }),
    })
    .where(eq(paymentTransactions.id, id))
    .returning();

  if (result.status !== payment.status) {
    await auditService.log({
      orgId,
      actorType: 'system',
      action: `payment.${result.status}`,
      resourceType: 'payment',
      resourceId: id,
      metadata: { previousStatus: payment.status, newStatus: result.status },
    });
  }

  return mapPayment(row);
}

export async function cancelPayment(id: string, orgId: string): Promise<Payment> {
  const payment = await getPayment(id, orgId);

  if (!['pending', 'processing'].includes(payment.status)) {
    throw new ValidationError(`Cannot cancel payment in status: ${payment.status}`);
  }

  // Attempt provider cancellation if external ID exists
  if (payment.externalId) {
    const railConfig = await getRailConfig(payment.railConfigId, orgId);
    const adapter = adapters[payment.railType as PaymentRailType];

    const cancelled = await adapter.cancelPayment(payment.externalId, railConfig);
    if (!cancelled && payment.status === 'processing') {
      throw new ValidationError('Provider could not cancel this payment — it may already be processing');
    }
  }

  const [row] = await db.update(paymentTransactions)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(paymentTransactions.id, id))
    .returning();

  await auditService.log({
    orgId,
    actorType: 'system',
    action: 'payment.cancelled',
    resourceType: 'payment',
    resourceId: id,
    metadata: { previousStatus: payment.status },
  });

  return mapPayment(row);
}

export async function getPaymentAnalytics(
  orgId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    railType?: PaymentRailType;
  }
): Promise<PaymentAnalytics> {
  const paymentList = await listPayments(orgId, filters);

  const analytics: PaymentAnalytics = {
    totalPayments: paymentList.length,
    totalVolume: '0',
    byStatus: { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 },
    byRailType: { usdc: 0, bank_ach: 0, bank_wire: 0, bank_sepa: 0 },
    byDirection: {
      inbound: { count: 0, volume: '0' },
      outbound: { count: 0, volume: '0' },
    },
  };

  let totalVolume = BigInt(0);
  let inboundVolume = BigInt(0);
  let outboundVolume = BigInt(0);

  for (const payment of paymentList) {
    // Convert decimal string to BigInt-safe integer (multiply by 1e18 for precision)
    const amountScaled = BigInt(Math.round(parseFloat(payment.amount) * 1e12));
    totalVolume += amountScaled;

    analytics.byStatus[payment.status]++;
    analytics.byRailType[payment.railType as PaymentRailType]++;

    if (payment.direction === 'inbound') {
      analytics.byDirection.inbound.count++;
      inboundVolume += amountScaled;
    } else {
      analytics.byDirection.outbound.count++;
      outboundVolume += amountScaled;
    }
  }

  analytics.totalVolume = (Number(totalVolume) / 1e12).toFixed(6);
  analytics.byDirection.inbound.volume = (Number(inboundVolume) / 1e12).toFixed(6);
  analytics.byDirection.outbound.volume = (Number(outboundVolume) / 1e12).toFixed(6);

  return analytics;
}

// ============================================================================
// Helpers
// ============================================================================

function mapRailConfig(row: any): RailConfig {
  return {
    id: row.id,
    orgId: row.orgId,
    railType: row.railType as PaymentRailType,
    name: row.name,
    config: (row.config || {}) as Record<string, unknown>,
    supportedCurrencies: (row.supportedCurrencies || []) as string[],
    fees: (row.fees || {}) as { fixed?: string; percentage?: number },
    limits: (row.limits || {}) as { minAmount?: string; maxAmount?: string; dailyLimit?: string },
    isDefault: row.isDefault ?? false,
    status: row.status as 'active' | 'disabled',
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function mapPayment(row: any): Payment {
  return {
    id: row.id,
    orgId: row.orgId,
    railConfigId: row.railConfigId,
    railType: row.railType as PaymentRailType,
    direction: row.direction as 'inbound' | 'outbound',
    amount: row.amount,
    currency: row.currency,
    status: row.status as PaymentStatus,
    reference: row.reference ?? undefined,
    externalId: row.externalId ?? undefined,
    investorId: row.investorId ?? undefined,
    walletAddress: row.walletAddress ?? undefined,
    bankDetails: (row.bankDetails || undefined) as Record<string, unknown> | undefined,
    txHash: row.txHash ?? undefined,
    feeAmount: row.feeAmount ?? undefined,
    feeCurrency: row.feeCurrency ?? undefined,
    error: row.error ?? undefined,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
  };
}
