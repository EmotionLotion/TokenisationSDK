/**
 * Payment Rails Service
 *
 * Manages payment rails for fiat-to-token and token-to-fiat flows:
 * - USDC on-chain payments
 * - Bank ACH/Wire/SEPA transfers
 * - Payment processing and tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { logger } from '../middleware/logger.js';

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
  investorId?: string;
  walletAddress?: string;
  bankDetails?: Record<string, unknown>;
  txHash?: string;
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
  fees?: {
    fixed?: string;
    percentage?: number;
  };
  limits?: {
    minAmount?: string;
    maxAmount?: string;
    dailyLimit?: string;
  };
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
// In-memory storage (replace with DB tables)
// ============================================================================

const railConfigs: Map<string, RailConfig> = new Map();
const payments: Map<string, Payment> = new Map();

// ============================================================================
// Rail Configuration Functions
// ============================================================================

export async function createRailConfig(input: CreateRailConfigInput): Promise<RailConfig> {
  const id = uuidv4();
  const now = new Date();

  const config: RailConfig = {
    id,
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
    createdAt: now,
    updatedAt: now,
  };

  railConfigs.set(id, config);

  await auditService.log({
    orgId: input.orgId,
    actorType: 'system',
    action: 'payment_rail.created',
    resourceType: 'payment_rail',
    resourceId: id,
    metadata: { railType: input.railType, name: input.name },
  });

  logger.info('Payment rail created', { metadata: { railId: id, railType: input.railType } });
  return config;
}

export async function listRailConfigs(
  orgId: string,
  filters?: { railType?: PaymentRailType; status?: 'active' | 'disabled' }
): Promise<RailConfig[]> {
  const configs: RailConfig[] = [];
  for (const config of railConfigs.values()) {
    if (config.orgId !== orgId) continue;
    if (filters?.railType && config.railType !== filters.railType) continue;
    if (filters?.status && config.status !== filters.status) continue;
    configs.push(config);
  }
  return configs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getRailConfig(id: string, orgId: string): Promise<RailConfig> {
  const config = railConfigs.get(id);
  if (!config || config.orgId !== orgId) {
    throw new NotFoundError('Payment rail configuration not found');
  }
  return config;
}

export async function updateRailConfig(
  id: string,
  orgId: string,
  updates: Partial<Omit<RailConfig, 'id' | 'orgId' | 'railType' | 'createdAt'>>
): Promise<RailConfig> {
  const config = await getRailConfig(id, orgId);

  const updated: RailConfig = {
    ...config,
    ...updates,
    updatedAt: new Date(),
  };

  railConfigs.set(id, updated);

  await auditService.log({
    orgId,
    actorType: 'system',
    action: 'payment_rail.updated',
    resourceType: 'payment_rail',
    resourceId: id,
    metadata: { updates: Object.keys(updates) },
  });

  return updated;
}

export async function deleteRailConfig(id: string, orgId: string): Promise<boolean> {
  const config = await getRailConfig(id, orgId);
  railConfigs.delete(id);

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
// Payment Functions
// ============================================================================

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const railConfig = await getRailConfig(input.railConfigId, input.orgId);

  const id = uuidv4();
  const now = new Date();

  const payment: Payment = {
    id,
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
    bankDetails: input.bankDetails,
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  };

  payments.set(id, payment);

  await auditService.log({
    orgId: input.orgId,
    actorType: 'system',
    action: 'payment.created',
    resourceType: 'payment',
    resourceId: id,
    metadata: {
      direction: input.direction,
      amount: input.amount,
      currency: input.currency,
      railType: railConfig.railType,
    },
  });

  logger.info('Payment created', { metadata: { paymentId: id, direction: input.direction, amount: input.amount } });
  return payment;
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
  const result: Payment[] = [];
  for (const payment of payments.values()) {
    if (payment.orgId !== orgId) continue;
    if (filters?.status && payment.status !== filters.status) continue;
    if (filters?.railType && payment.railType !== filters.railType) continue;
    if (filters?.direction && payment.direction !== filters.direction) continue;
    if (filters?.investorId && payment.investorId !== filters.investorId) continue;
    if (filters?.startDate && payment.createdAt < new Date(filters.startDate)) continue;
    if (filters?.endDate && payment.createdAt > new Date(filters.endDate)) continue;
    result.push(payment);
  }
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getPayment(id: string, orgId: string): Promise<Payment> {
  const payment = payments.get(id);
  if (!payment || payment.orgId !== orgId) {
    throw new NotFoundError('Payment not found');
  }
  return payment;
}

export async function processPayment(id: string, orgId: string): Promise<Payment> {
  const payment = await getPayment(id, orgId);

  if (payment.status !== 'pending') {
    throw new ValidationError(`Cannot process payment in status: ${payment.status}`);
  }

  const updated: Payment = {
    ...payment,
    status: 'processing',
    updatedAt: new Date(),
  };

  payments.set(id, updated);

  // In a real implementation, this would trigger the actual payment processing
  // For now, we just update the status

  await auditService.log({
    orgId,
    actorType: 'system',
    action: 'payment.processing',
    resourceType: 'payment',
    resourceId: id,
    metadata: { previousStatus: payment.status },
  });

  return updated;
}

export async function cancelPayment(id: string, orgId: string): Promise<Payment> {
  const payment = await getPayment(id, orgId);

  if (!['pending', 'processing'].includes(payment.status)) {
    throw new ValidationError(`Cannot cancel payment in status: ${payment.status}`);
  }

  const updated: Payment = {
    ...payment,
    status: 'cancelled',
    updatedAt: new Date(),
  };

  payments.set(id, updated);

  await auditService.log({
    orgId,
    actorType: 'system',
    action: 'payment.cancelled',
    resourceType: 'payment',
    resourceId: id,
    metadata: { previousStatus: payment.status },
  });

  return updated;
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
    byStatus: {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
    byRailType: {
      usdc: 0,
      bank_ach: 0,
      bank_wire: 0,
      bank_sepa: 0,
    },
    byDirection: {
      inbound: { count: 0, volume: '0' },
      outbound: { count: 0, volume: '0' },
    },
  };

  let totalVolume = BigInt(0);
  let inboundVolume = BigInt(0);
  let outboundVolume = BigInt(0);

  for (const payment of paymentList) {
    const amount = BigInt(payment.amount);
    totalVolume += amount;

    analytics.byStatus[payment.status]++;
    analytics.byRailType[payment.railType]++;

    if (payment.direction === 'inbound') {
      analytics.byDirection.inbound.count++;
      inboundVolume += amount;
    } else {
      analytics.byDirection.outbound.count++;
      outboundVolume += amount;
    }
  }

  analytics.totalVolume = totalVolume.toString();
  analytics.byDirection.inbound.volume = inboundVolume.toString();
  analytics.byDirection.outbound.volume = outboundVolume.toString();

  return analytics;
}
