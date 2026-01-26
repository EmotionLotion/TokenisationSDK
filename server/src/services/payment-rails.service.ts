/**
 * Payment Rails Service
 *
 * Handles settlement of distribution payouts via multiple payment rails:
 * - USDC (on-chain stablecoin)
 * - Bank transfers (ACH, Wire, SEPA)
 * - Future: Other stablecoins, crypto
 */

import { v4 as uuidv4 } from 'uuid';
import * as eventbusService from './eventbus.service.js';
import * as auditService from './audit.service.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type PaymentRailType = 'usdc' | 'bank_ach' | 'bank_wire' | 'bank_sepa';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type PaymentDirection = 'inbound' | 'outbound';

export interface PaymentRailConfig {
  id: string;
  orgId: string;
  railType: PaymentRailType;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  config: RailSpecificConfig;
  supportedCurrencies: string[];
  fees: PaymentFees;
  limits: PaymentLimits;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RailSpecificConfig {
  // USDC config
  usdcContractAddress?: string;
  usdcChainId?: number;
  treasuryWallet?: string;

  // Bank config
  bankName?: string;
  accountNumber?: string;
  routingNumber?: string;  // ACH
  swiftCode?: string;      // Wire
  iban?: string;           // SEPA
  bankAddress?: string;
  accountHolderName?: string;

  // Provider config
  provider?: 'circle' | 'stripe' | 'bridge' | 'custom';
  providerApiKey?: string;
  providerWebhookSecret?: string;
}

export interface PaymentFees {
  fixedFee: string;         // Fixed fee per transaction
  percentageFee: number;    // Percentage (0.01 = 1%)
  minimumFee: string;       // Minimum fee
  maximumFee?: string;      // Maximum fee cap
}

export interface PaymentLimits {
  minAmount: string;
  maxAmount: string;
  dailyLimit?: string;
  monthlyLimit?: string;
}

export interface Payment {
  id: string;
  orgId: string;
  railConfigId: string;
  railType: PaymentRailType;
  direction: PaymentDirection;
  status: PaymentStatus;

  // Amount info
  amount: string;
  currency: string;
  feeAmount: string;
  netAmount: string;

  // References
  payoutId?: string;
  distributionId?: string;
  externalId?: string;

  // Recipient info
  recipientId: string;
  recipientType: 'investor' | 'issuer' | 'treasury';
  recipientAddress?: string;    // Wallet address for crypto
  recipientBankInfo?: RecipientBankInfo;

  // Transaction details
  txHash?: string;
  blockNumber?: number;
  bankReference?: string;

  // Timing
  initiatedAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;

  // Error handling
  error?: string;
  retryCount: number;
  maxRetries: number;

  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecipientBankInfo {
  accountHolderName: string;
  accountNumber?: string;
  routingNumber?: string;
  swiftCode?: string;
  iban?: string;
  bankName?: string;
  bankAddress?: string;
  country: string;
}

export interface CreatePaymentInput {
  orgId: string;
  railConfigId: string;
  amount: string;
  currency: string;
  recipientId: string;
  recipientType: 'investor' | 'issuer' | 'treasury';
  recipientAddress?: string;
  recipientBankInfo?: RecipientBankInfo;
  payoutId?: string;
  distributionId?: string;
  metadata?: Record<string, unknown>;
}

export interface BatchPaymentInput {
  orgId: string;
  railConfigId: string;
  currency: string;
  distributionId: string;
  payments: Array<{
    recipientId: string;
    recipientAddress?: string;
    recipientBankInfo?: RecipientBankInfo;
    amount: string;
    payoutId: string;
  }>;
}

// ============================================================================
// In-Memory Storage (replace with database in production)
// ============================================================================

const railConfigs: Map<string, PaymentRailConfig> = new Map();
const payments: Map<string, Payment> = new Map();

// ============================================================================
// Rail Configuration Management
// ============================================================================

/**
 * Creates a payment rail configuration.
 */
export async function createRailConfig(input: {
  orgId: string;
  railType: PaymentRailType;
  name: string;
  config: RailSpecificConfig;
  supportedCurrencies: string[];
  fees?: Partial<PaymentFees>;
  limits?: Partial<PaymentLimits>;
  isDefault?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<PaymentRailConfig> {
  const id = `rail_${uuidv4()}`;

  // Default fees based on rail type
  const defaultFees = getDefaultFees(input.railType);
  const defaultLimits = getDefaultLimits(input.railType);

  const railConfig: PaymentRailConfig = {
    id,
    orgId: input.orgId,
    railType: input.railType,
    name: input.name,
    isActive: true,
    isDefault: input.isDefault ?? false,
    config: input.config,
    supportedCurrencies: input.supportedCurrencies,
    fees: { ...defaultFees, ...input.fees },
    limits: { ...defaultLimits, ...input.limits },
    metadata: input.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // If this is set as default, unset other defaults
  if (railConfig.isDefault) {
    for (const [key, config] of railConfigs) {
      if (config.orgId === input.orgId && config.isDefault) {
        config.isDefault = false;
        railConfigs.set(key, config);
      }
    }
  }

  railConfigs.set(id, railConfig);

  await auditService.logAction({
    orgId: input.orgId,
    action: 'payment_rail.created',
    entityType: 'payment_rail',
    entityId: id,
    changes: {
      railType: input.railType,
      name: input.name,
    },
  });

  return railConfig;
}

/**
 * Gets a rail configuration by ID.
 */
export async function getRailConfig(id: string, orgId: string): Promise<PaymentRailConfig | null> {
  const config = railConfigs.get(id);
  if (!config || config.orgId !== orgId) {
    return null;
  }
  return config;
}

/**
 * Lists rail configurations for an organization.
 */
export async function listRailConfigs(
  orgId: string,
  filters?: { railType?: PaymentRailType; isActive?: boolean }
): Promise<PaymentRailConfig[]> {
  const results: PaymentRailConfig[] = [];

  for (const config of railConfigs.values()) {
    if (config.orgId !== orgId) continue;
    if (filters?.railType && config.railType !== filters.railType) continue;
    if (filters?.isActive !== undefined && config.isActive !== filters.isActive) continue;
    results.push(config);
  }

  return results;
}

/**
 * Updates a rail configuration.
 */
export async function updateRailConfig(
  id: string,
  orgId: string,
  updates: Partial<{
    name: string;
    isActive: boolean;
    isDefault: boolean;
    config: Partial<RailSpecificConfig>;
    fees: Partial<PaymentFees>;
    limits: Partial<PaymentLimits>;
    metadata: Record<string, unknown>;
  }>
): Promise<PaymentRailConfig | null> {
  const existing = railConfigs.get(id);
  if (!existing || existing.orgId !== orgId) {
    return null;
  }

  const updated: PaymentRailConfig = {
    ...existing,
    ...updates,
    config: { ...existing.config, ...updates.config },
    fees: { ...existing.fees, ...updates.fees },
    limits: { ...existing.limits, ...updates.limits },
    updatedAt: new Date(),
  };

  // Handle default toggle
  if (updates.isDefault && !existing.isDefault) {
    for (const [key, config] of railConfigs) {
      if (config.orgId === orgId && config.isDefault && key !== id) {
        config.isDefault = false;
        railConfigs.set(key, config);
      }
    }
  }

  railConfigs.set(id, updated);

  await auditService.logAction({
    orgId,
    action: 'payment_rail.updated',
    entityType: 'payment_rail',
    entityId: id,
    changes: updates,
  });

  return updated;
}

/**
 * Deletes a rail configuration (soft delete via deactivation).
 */
export async function deleteRailConfig(id: string, orgId: string): Promise<boolean> {
  const config = railConfigs.get(id);
  if (!config || config.orgId !== orgId) {
    return false;
  }

  // Check for pending payments
  for (const payment of payments.values()) {
    if (payment.railConfigId === id && payment.status === 'pending') {
      throw new Error('Cannot delete rail with pending payments');
    }
  }

  config.isActive = false;
  config.updatedAt = new Date();
  railConfigs.set(id, config);

  await auditService.logAction({
    orgId,
    action: 'payment_rail.deleted',
    entityType: 'payment_rail',
    entityId: id,
    changes: { isActive: false },
  });

  return true;
}

// ============================================================================
// Payment Processing
// ============================================================================

/**
 * Creates and initiates a payment.
 */
export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  const railConfig = await getRailConfig(input.railConfigId, input.orgId);
  if (!railConfig) {
    throw new Error('Payment rail configuration not found');
  }

  if (!railConfig.isActive) {
    throw new Error('Payment rail is not active');
  }

  // Validate currency
  if (!railConfig.supportedCurrencies.includes(input.currency)) {
    throw new Error(`Currency ${input.currency} not supported by this rail`);
  }

  // Validate amount against limits
  validatePaymentAmount(input.amount, railConfig.limits);

  // Calculate fees
  const { feeAmount, netAmount } = calculateFees(input.amount, railConfig.fees);

  const id = `pay_${uuidv4()}`;

  const payment: Payment = {
    id,
    orgId: input.orgId,
    railConfigId: input.railConfigId,
    railType: railConfig.railType,
    direction: 'outbound',
    status: 'pending',
    amount: input.amount,
    currency: input.currency,
    feeAmount,
    netAmount,
    payoutId: input.payoutId,
    distributionId: input.distributionId,
    recipientId: input.recipientId,
    recipientType: input.recipientType,
    recipientAddress: input.recipientAddress,
    recipientBankInfo: input.recipientBankInfo,
    initiatedAt: new Date(),
    retryCount: 0,
    maxRetries: 3,
    metadata: input.metadata || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  payments.set(id, payment);

  await auditService.logAction({
    orgId: input.orgId,
    action: 'payment.created',
    entityType: 'payment',
    entityId: id,
    changes: {
      railType: railConfig.railType,
      amount: input.amount,
      currency: input.currency,
      recipientId: input.recipientId,
    },
  });

  // Emit event
  await eventbusService.publish({
    orgId: input.orgId,
    topic: 'payment.created',
    payload: {
      paymentId: id,
      railType: railConfig.railType,
      amount: input.amount,
      currency: input.currency,
    },
  });

  return payment;
}

/**
 * Creates a batch of payments for a distribution.
 */
export async function createBatchPayments(input: BatchPaymentInput): Promise<{
  payments: Payment[];
  totalAmount: string;
  totalFees: string;
}> {
  const railConfig = await getRailConfig(input.railConfigId, input.orgId);
  if (!railConfig) {
    throw new Error('Payment rail configuration not found');
  }

  const createdPayments: Payment[] = [];
  let totalAmount = BigInt(0);
  let totalFees = BigInt(0);

  for (const paymentInput of input.payments) {
    const payment = await createPayment({
      orgId: input.orgId,
      railConfigId: input.railConfigId,
      amount: paymentInput.amount,
      currency: input.currency,
      recipientId: paymentInput.recipientId,
      recipientType: 'investor',
      recipientAddress: paymentInput.recipientAddress,
      recipientBankInfo: paymentInput.recipientBankInfo,
      payoutId: paymentInput.payoutId,
      distributionId: input.distributionId,
    });

    createdPayments.push(payment);
    totalAmount += BigInt(payment.amount);
    totalFees += BigInt(payment.feeAmount);
  }

  await auditService.logAction({
    orgId: input.orgId,
    action: 'payment.batch_created',
    entityType: 'distribution',
    entityId: input.distributionId,
    changes: {
      paymentCount: createdPayments.length,
      totalAmount: totalAmount.toString(),
      totalFees: totalFees.toString(),
    },
  });

  return {
    payments: createdPayments,
    totalAmount: totalAmount.toString(),
    totalFees: totalFees.toString(),
  };
}

/**
 * Processes a pending payment through the appropriate rail.
 */
export async function processPayment(paymentId: string, orgId: string): Promise<Payment> {
  const payment = payments.get(paymentId);
  if (!payment || payment.orgId !== orgId) {
    throw new Error('Payment not found');
  }

  if (payment.status !== 'pending') {
    throw new Error(`Payment cannot be processed from status: ${payment.status}`);
  }

  // Update status to processing
  payment.status = 'processing';
  payment.processedAt = new Date();
  payment.updatedAt = new Date();
  payments.set(paymentId, payment);

  try {
    // Route to appropriate rail handler
    switch (payment.railType) {
      case 'usdc':
        await processUsdcPayment(payment);
        break;
      case 'bank_ach':
        await processAchPayment(payment);
        break;
      case 'bank_wire':
        await processWirePayment(payment);
        break;
      case 'bank_sepa':
        await processSepaPayment(payment);
        break;
      default:
        throw new Error(`Unsupported rail type: ${payment.railType}`);
    }

    // Mark as completed
    payment.status = 'completed';
    payment.completedAt = new Date();
    payment.updatedAt = new Date();
    payments.set(paymentId, payment);

    await eventbusService.publish({
      orgId: payment.orgId,
      topic: 'payment.completed',
      payload: {
        paymentId,
        railType: payment.railType,
        amount: payment.amount,
        txHash: payment.txHash,
        bankReference: payment.bankReference,
      },
    });

    await auditService.logAction({
      orgId: payment.orgId,
      action: 'payment.completed',
      entityType: 'payment',
      entityId: paymentId,
      changes: {
        txHash: payment.txHash,
        bankReference: payment.bankReference,
      },
    });

  } catch (error) {
    payment.retryCount++;

    if (payment.retryCount >= payment.maxRetries) {
      payment.status = 'failed';
      payment.failedAt = new Date();
      payment.error = error instanceof Error ? error.message : 'Unknown error';

      await eventbusService.publish({
        orgId: payment.orgId,
        topic: 'payment.failed',
        payload: {
          paymentId,
          error: payment.error,
          retryCount: payment.retryCount,
        },
      });
    } else {
      payment.status = 'pending'; // Reset for retry
    }

    payment.updatedAt = new Date();
    payments.set(paymentId, payment);

    throw error;
  }

  return payment;
}

/**
 * Gets a payment by ID.
 */
export async function getPayment(id: string, orgId: string): Promise<Payment | null> {
  const payment = payments.get(id);
  if (!payment || payment.orgId !== orgId) {
    return null;
  }
  return payment;
}

/**
 * Lists payments with filters.
 */
export async function listPayments(
  orgId: string,
  filters?: {
    status?: PaymentStatus;
    railType?: PaymentRailType;
    distributionId?: string;
    recipientId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ payments: Payment[]; total: number }> {
  const results: Payment[] = [];

  for (const payment of payments.values()) {
    if (payment.orgId !== orgId) continue;
    if (filters?.status && payment.status !== filters.status) continue;
    if (filters?.railType && payment.railType !== filters.railType) continue;
    if (filters?.distributionId && payment.distributionId !== filters.distributionId) continue;
    if (filters?.recipientId && payment.recipientId !== filters.recipientId) continue;
    results.push(payment);
  }

  // Sort by created date descending
  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = results.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 100;

  return {
    payments: results.slice(offset, offset + limit),
    total,
  };
}

/**
 * Cancels a pending payment.
 */
export async function cancelPayment(paymentId: string, orgId: string): Promise<Payment> {
  const payment = payments.get(paymentId);
  if (!payment || payment.orgId !== orgId) {
    throw new Error('Payment not found');
  }

  if (payment.status !== 'pending') {
    throw new Error(`Cannot cancel payment with status: ${payment.status}`);
  }

  payment.status = 'cancelled';
  payment.updatedAt = new Date();
  payments.set(paymentId, payment);

  await eventbusService.publish({
    orgId: payment.orgId,
    topic: 'payment.cancelled',
    payload: { paymentId },
  });

  await auditService.logAction({
    orgId: payment.orgId,
    action: 'payment.cancelled',
    entityType: 'payment',
    entityId: paymentId,
    changes: { status: 'cancelled' },
  });

  return payment;
}

// ============================================================================
// Rail-Specific Payment Processors
// ============================================================================

/**
 * Process USDC payment on-chain.
 */
async function processUsdcPayment(payment: Payment): Promise<void> {
  const railConfig = railConfigs.get(payment.railConfigId);
  if (!railConfig) {
    throw new Error('Rail configuration not found');
  }

  const { usdcContractAddress, usdcChainId, treasuryWallet, provider } = railConfig.config;

  if (!payment.recipientAddress) {
    throw new Error('Recipient wallet address required for USDC payment');
  }

  // In production, integrate with:
  // - Circle APIs for USDC transfers
  // - Direct contract interaction via ethers/viem
  // - Bridge.xyz for cross-chain

  if (provider === 'circle') {
    // Circle Transfer API integration
    const transferResult = await simulateCircleTransfer({
      amount: payment.netAmount,
      currency: payment.currency,
      destinationAddress: payment.recipientAddress,
      chain: usdcChainId,
    });

    payment.txHash = transferResult.txHash;
    payment.externalId = transferResult.transferId;
  } else {
    // Direct on-chain transfer
    const txResult = await simulateOnChainTransfer({
      contractAddress: usdcContractAddress!,
      chainId: usdcChainId!,
      from: treasuryWallet!,
      to: payment.recipientAddress,
      amount: payment.netAmount,
    });

    payment.txHash = txResult.hash;
    payment.txBlock = txResult.txBlock;
  }
}

/**
 * Process ACH bank transfer.
 */
async function processAchPayment(payment: Payment): Promise<void> {
  if (!payment.recipientBankInfo) {
    throw new Error('Recipient bank info required for ACH payment');
  }

  const { accountNumber, routingNumber } = payment.recipientBankInfo;
  if (!accountNumber || !routingNumber) {
    throw new Error('Account number and routing number required for ACH');
  }

  // In production, integrate with:
  // - Stripe Treasury
  // - Modern Treasury
  // - Plaid Transfer

  const achResult = await simulateAchTransfer({
    amount: payment.netAmount,
    currency: payment.currency,
    accountNumber,
    routingNumber,
    accountHolderName: payment.recipientBankInfo.accountHolderName,
  });

  payment.bankReference = achResult.reference;
  payment.externalId = achResult.transferId;
}

/**
 * Process wire transfer.
 */
async function processWirePayment(payment: Payment): Promise<void> {
  if (!payment.recipientBankInfo) {
    throw new Error('Recipient bank info required for wire payment');
  }

  const { accountNumber, swiftCode } = payment.recipientBankInfo;
  if (!accountNumber || !swiftCode) {
    throw new Error('Account number and SWIFT code required for wire');
  }

  const wireResult = await simulateWireTransfer({
    amount: payment.netAmount,
    currency: payment.currency,
    accountNumber,
    swiftCode,
    accountHolderName: payment.recipientBankInfo.accountHolderName,
    bankName: payment.recipientBankInfo.bankName,
    bankAddress: payment.recipientBankInfo.bankAddress,
  });

  payment.bankReference = wireResult.reference;
  payment.externalId = wireResult.transferId;
}

/**
 * Process SEPA transfer.
 */
async function processSepaPayment(payment: Payment): Promise<void> {
  if (!payment.recipientBankInfo) {
    throw new Error('Recipient bank info required for SEPA payment');
  }

  const { iban } = payment.recipientBankInfo;
  if (!iban) {
    throw new Error('IBAN required for SEPA transfer');
  }

  const sepaResult = await simulateSepaTransfer({
    amount: payment.netAmount,
    currency: payment.currency,
    iban,
    accountHolderName: payment.recipientBankInfo.accountHolderName,
  });

  payment.bankReference = sepaResult.reference;
  payment.externalId = sepaResult.transferId;
}

// ============================================================================
// Simulation Functions (Replace with real integrations)
// ============================================================================

async function simulateCircleTransfer(params: {
  amount: string;
  currency: string;
  destinationAddress: string;
  chain?: number;
}): Promise<{ txHash: string; transferId: string }> {
  // Simulate Circle API response
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    txHash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
    transferId: `circle_${uuidv4()}`,
  };
}

async function simulateOnChainTransfer(params: {
  contractAddress: string;
  chainId: number;
  from: string;
  to: string;
  amount: string;
}): Promise<{ hash: string; blockNumber: number }> {
  // Simulate on-chain transaction
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    hash: `0x${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`,
    blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
  };
}

async function simulateAchTransfer(params: {
  amount: string;
  currency: string;
  accountNumber: string;
  routingNumber: string;
  accountHolderName: string;
}): Promise<{ reference: string; transferId: string }> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    reference: `ACH${Date.now()}`,
    transferId: `ach_${uuidv4()}`,
  };
}

async function simulateWireTransfer(params: {
  amount: string;
  currency: string;
  accountNumber: string;
  swiftCode: string;
  accountHolderName: string;
  bankName?: string;
  bankAddress?: string;
}): Promise<{ reference: string; transferId: string }> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    reference: `WIRE${Date.now()}`,
    transferId: `wire_${uuidv4()}`,
  };
}

async function simulateSepaTransfer(params: {
  amount: string;
  currency: string;
  iban: string;
  accountHolderName: string;
}): Promise<{ reference: string; transferId: string }> {
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    reference: `SEPA${Date.now()}`,
    transferId: `sepa_${uuidv4()}`,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDefaultFees(railType: PaymentRailType): PaymentFees {
  switch (railType) {
    case 'usdc':
      return {
        fixedFee: '0',
        percentageFee: 0.001,  // 0.1%
        minimumFee: '0',
        maximumFee: '100000000', // $100 in 6 decimals
      };
    case 'bank_ach':
      return {
        fixedFee: '25000000',  // $25 in 6 decimals
        percentageFee: 0,
        minimumFee: '25000000',
      };
    case 'bank_wire':
      return {
        fixedFee: '25000000',  // $25
        percentageFee: 0.001,  // 0.1%
        minimumFee: '25000000',
        maximumFee: '500000000', // $500
      };
    case 'bank_sepa':
      return {
        fixedFee: '2000000',  // €2
        percentageFee: 0,
        minimumFee: '2000000',
      };
    default:
      return {
        fixedFee: '0',
        percentageFee: 0,
        minimumFee: '0',
      };
  }
}

function getDefaultLimits(railType: PaymentRailType): PaymentLimits {
  switch (railType) {
    case 'usdc':
      return {
        minAmount: '1000000',      // $1
        maxAmount: '10000000000000', // $10M
      };
    case 'bank_ach':
      return {
        minAmount: '100000000',    // $100
        maxAmount: '1000000000000', // $1M
        dailyLimit: '5000000000000', // $5M
      };
    case 'bank_wire':
      return {
        minAmount: '1000000000',   // $1,000
        maxAmount: '100000000000000', // $100M
      };
    case 'bank_sepa':
      return {
        minAmount: '100000000',    // €100
        maxAmount: '10000000000000', // €10M
      };
    default:
      return {
        minAmount: '0',
        maxAmount: '999999999999999',
      };
  }
}

function validatePaymentAmount(amount: string, limits: PaymentLimits): void {
  const amountBigInt = BigInt(amount);
  const minBigInt = BigInt(limits.minAmount);
  const maxBigInt = BigInt(limits.maxAmount);

  if (amountBigInt < minBigInt) {
    throw new Error(`Amount below minimum: ${limits.minAmount}`);
  }

  if (amountBigInt > maxBigInt) {
    throw new Error(`Amount exceeds maximum: ${limits.maxAmount}`);
  }
}

function calculateFees(amount: string, fees: PaymentFees): { feeAmount: string; netAmount: string } {
  const amountBigInt = BigInt(amount);
  const fixedFeeBigInt = BigInt(fees.fixedFee);

  // Calculate percentage fee (using basis points for precision)
  const percentageFeeRaw = (amountBigInt * BigInt(Math.floor(fees.percentageFee * 10000))) / BigInt(10000);

  let totalFee = fixedFeeBigInt + percentageFeeRaw;

  // Apply minimum
  const minFeeBigInt = BigInt(fees.minimumFee);
  if (totalFee < minFeeBigInt) {
    totalFee = minFeeBigInt;
  }

  // Apply maximum if set
  if (fees.maximumFee) {
    const maxFeeBigInt = BigInt(fees.maximumFee);
    if (totalFee > maxFeeBigInt) {
      totalFee = maxFeeBigInt;
    }
  }

  const netAmount = amountBigInt - totalFee;

  return {
    feeAmount: totalFee.toString(),
    netAmount: netAmount.toString(),
  };
}

// ============================================================================
// Analytics
// ============================================================================

/**
 * Gets payment analytics for an organization.
 */
export async function getPaymentAnalytics(
  orgId: string,
  filters?: { startDate?: Date; endDate?: Date; railType?: PaymentRailType }
): Promise<{
  totalPayments: number;
  totalAmount: string;
  totalFees: string;
  byStatus: Record<PaymentStatus, number>;
  byRailType: Record<PaymentRailType, { count: number; amount: string }>;
}> {
  const results = {
    totalPayments: 0,
    totalAmount: BigInt(0),
    totalFees: BigInt(0),
    byStatus: {} as Record<PaymentStatus, number>,
    byRailType: {} as Record<PaymentRailType, { count: number; amount: bigint }>,
  };

  for (const payment of payments.values()) {
    if (payment.orgId !== orgId) continue;
    if (filters?.railType && payment.railType !== filters.railType) continue;
    if (filters?.startDate && payment.createdAt < filters.startDate) continue;
    if (filters?.endDate && payment.createdAt > filters.endDate) continue;

    results.totalPayments++;
    results.totalAmount += BigInt(payment.amount);
    results.totalFees += BigInt(payment.feeAmount);

    // By status
    results.byStatus[payment.status] = (results.byStatus[payment.status] || 0) + 1;

    // By rail type
    if (!results.byRailType[payment.railType]) {
      results.byRailType[payment.railType] = { count: 0, amount: BigInt(0) };
    }
    results.byRailType[payment.railType].count++;
    results.byRailType[payment.railType].amount += BigInt(payment.amount);
  }

  // Convert BigInts to strings
  const byRailTypeFormatted = {} as Record<PaymentRailType, { count: number; amount: string }>;
  for (const [railType, data] of Object.entries(results.byRailType)) {
    byRailTypeFormatted[railType as PaymentRailType] = {
      count: data.count,
      amount: data.amount.toString(),
    };
  }

  return {
    totalPayments: results.totalPayments,
    totalAmount: results.totalAmount.toString(),
    totalFees: results.totalFees.toString(),
    byStatus: results.byStatus,
    byRailType: byRailTypeFormatted,
  };
}
