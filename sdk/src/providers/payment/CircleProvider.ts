/**
 * Circle Payment Provider
 *
 * Handles USDC and stablecoin payments via Circle API.
 * Supports both crypto-native and fiat on-ramp flows.
 *
 * @example
 * ```typescript
 * import { CircleProvider, createCircleProvider } from '@tokenisation/sdk';
 *
 * const circle = createCircleProvider({
 *   apiKey: process.env.CIRCLE_API_KEY!,
 *   entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
 * });
 *
 * // Create payment intent for USDC
 * const intent = await circle.createIntent({
 *   amount: '500000000', // $500.00 in USDC smallest unit (6 decimals)
 *   currency: 'USDC',
 *   payerId: 'investor-123',
 *   referenceId: 'subscription-456',
 *   referenceType: 'subscription',
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import {
  ResilientClient,
  createPaymentResilientClient,
} from '../../core/Resilience.js';
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

export interface CircleProviderConfig {
  /** Circle API key */
  apiKey: string;

  /** Entity secret for signing */
  entitySecret: string;

  /** Environment (sandbox or production) */
  environment?: 'sandbox' | 'production';

  /** Wallet ID for receiving payments */
  walletId?: string;

  /** Supported chains for USDC */
  supportedChains?: CircleChain[];

  /** Default chain for payments */
  defaultChain?: CircleChain;
}

/**
 * Supported blockchain networks for Circle USDC
 */
export type CircleChain =
  | 'ETH'      // Ethereum mainnet
  | 'MATIC'    // Polygon
  | 'ARB'      // Arbitrum
  | 'AVAX'     // Avalanche
  | 'SOL'      // Solana
  | 'BASE'     // Base
  | 'OP';      // Optimism

// ============================================================================
// CIRCLE API TYPES (simplified)
// ============================================================================

interface CirclePaymentIntent {
  id: string;
  amount: {
    amount: string;
    currency: string;
  };
  settlementCurrency: string;
  paymentMethods: Array<{
    type: string;
    chain?: string;
    address?: string;
  }>;
  status: 'pending' | 'complete' | 'expired' | 'failed';
  timeline: Array<{
    status: string;
    time: string;
  }>;
  createDate: string;
  updateDate: string;
  expirationDate: string;
  metadata?: Record<string, string>;
}

interface CircleTransfer {
  id: string;
  source: {
    type: string;
    id?: string;
    address?: string;
    chain?: string;
  };
  destination: {
    type: string;
    id?: string;
    address?: string;
    chain?: string;
  };
  amount: {
    amount: string;
    currency: string;
  };
  status: 'pending' | 'complete' | 'failed';
  transactionHash?: string;
  createDate: string;
}

interface CirclePayout {
  id: string;
  sourceWalletId: string;
  destination: {
    type: string;
    id?: string;
    address?: string;
    chain?: string;
  };
  amount: {
    amount: string;
    currency: string;
  };
  status: 'pending' | 'complete' | 'failed';
  fees?: {
    amount: string;
    currency: string;
  };
  transactionHash?: string;
  createDate: string;
}

interface CircleWallet {
  walletId: string;
  entityId: string;
  type: string;
  description?: string;
  balances: Array<{
    amount: string;
    currency: string;
  }>;
}

interface CircleDepositAddress {
  id: string;
  address: string;
  chain: string;
  currency: string;
}

interface CircleNotification {
  subscriptionId: string;
  notificationType: string;
  version: number;
  transfer?: CircleTransfer;
  paymentIntent?: CirclePaymentIntent;
  payout?: CirclePayout;
}

// ============================================================================
// CIRCLE PROVIDER
// ============================================================================

export class CircleProvider implements IPaymentProvider {
  readonly providerId = 'circle';
  readonly providerName = 'Circle';

  readonly supportedMethods: PaymentMethodType[] = ['stablecoin', 'crypto'];

  readonly supportedCurrencies: Currency[] = [
    CURRENCIES.USDC,
    CURRENCIES.ETH, // For gas fees
  ];

  private readonly apiKey: string;
  private readonly entitySecret: string;
  private readonly baseUrl: string;
  private readonly walletId?: string;
  private readonly supportedChains: CircleChain[];
  private readonly defaultChain: CircleChain;
  private readonly resilient: ResilientClient;

  // In-memory storage for demo (production would use database)
  private intents = new Map<string, PaymentIntent>();
  private deposits = new Map<string, CircleDepositAddress>();

  constructor(config: CircleProviderConfig) {
    this.apiKey = config.apiKey;
    this.entitySecret = config.entitySecret;
    this.baseUrl = config.environment === 'production'
      ? 'https://api.circle.com/v1'
      : 'https://api-sandbox.circle.com/v1';
    this.walletId = config.walletId;
    this.supportedChains = config.supportedChains || ['ETH', 'MATIC', 'ARB', 'BASE'];
    this.defaultChain = config.defaultChain || 'ETH';
    this.resilient = createPaymentResilientClient('circle');
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
    chain?: CircleChain;
  }): Promise<Result<PaymentIntent, string>> {
    try {
      const currency = CURRENCIES[params.currency.toUpperCase()];
      if (!currency || currency.type !== 'crypto') {
        return err(`Unsupported currency: ${params.currency}. Circle supports USDC.`);
      }

      const chain = params.chain || this.defaultChain;

      // Get or create deposit address for this payer
      const addressResult = await this.getOrCreateDepositAddress(params.payerId, chain);
      if (!addressResult.success) {
        return err(addressResult.error);
      }

      const depositAddress = addressResult.data;

      // Create internal payment intent
      const intentId = `cpi_${uuidv4().slice(0, 12)}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

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
        returnUrl: params.returnUrl,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        providerData: {
          depositAddress: depositAddress.address,
          chain,
          expectedAmount: params.amount,
        },
        metadata: {
          ...params.metadata,
          depositAddress: depositAddress.address,
          chain,
        },
      };

      this.intents.set(intentId, intent);

      return ok(intent);
    } catch (error) {
      return err(`Failed to create payment intent: ${error}`);
    }
  }

  async getIntent(intentId: string): Promise<Result<PaymentIntent, string>> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      return err(`Payment intent not found: ${intentId}`);
    }

    // Check for incoming transfers to the deposit address
    const depositAddress = intent.providerData?.depositAddress as string;
    if (depositAddress && intent.status === 'pending') {
      const transferResult = await this.checkForDeposit(
        depositAddress,
        intent.amount,
        intent.currency.code
      );

      if (transferResult.success && transferResult.data) {
        intent.status = 'succeeded';
        intent.confirmedAt = new Date().toISOString();
        intent.providerData = {
          ...intent.providerData,
          transferId: transferResult.data.id,
          txHash: transferResult.data.transactionHash,
        };
      }
    }

    // Check expiration
    if (intent.status === 'pending' && intent.expiresAt) {
      if (new Date(intent.expiresAt) < new Date()) {
        intent.status = 'cancelled';
      }
    }

    return ok(intent);
  }

  async confirmIntent(
    intentId: string,
    params?: { paymentMethodId?: string; returnUrl?: string }
  ): Promise<Result<PaymentConfirmation, string>> {
    const intentResult = await this.getIntent(intentId);
    if (!intentResult.success) {
      return err(intentResult.error);
    }

    const intent = intentResult.data;

    if (intent.status !== 'succeeded') {
      return err(`Payment not confirmed, status: ${intent.status}`);
    }

    // For crypto payments, network fee is paid by sender
    const amount = BigInt(intent.amount);
    const networkFee = 0n; // Already paid by sender
    const platformFee = 0n; // Optional platform fee
    const netAmount = amount - platformFee;

    const confirmation: PaymentConfirmation = {
      intentId: intent.id,
      status: 'succeeded',
      amountCharged: intent.amount,
      netAmount: netAmount.toString(),
      fees: {
        processingFee: '0',
        platformFee: platformFee.toString(),
        networkFee: networkFee.toString(),
      },
      methodType: 'stablecoin',
      methodDetails: {
        walletAddress: intent.providerData?.depositAddress as string,
        txHash: intent.providerData?.txHash as string,
      },
      confirmedAt: intent.confirmedAt || new Date().toISOString(),
      providerData: intent.providerData,
    };

    return ok(confirmation);
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
  // REFUNDS (TRANSFERS)
  // ============================================================================

  async createRefund(request: RefundRequest): Promise<Result<Refund, string>> {
    try {
      const intent = this.intents.get(request.intentId);
      if (!intent) {
        return err(`Payment intent not found: ${request.intentId}`);
      }

      if (intent.status !== 'succeeded') {
        return err('Can only refund succeeded payments');
      }

      // For crypto, refund is a transfer back to the original sender
      // This requires the sender's wallet address from the original transaction
      const senderAddress = intent.metadata?.senderAddress as string;
      if (!senderAddress) {
        return err('Cannot refund: sender address not recorded');
      }

      const refundAmount = request.amount || intent.amount;
      const chain = intent.providerData?.chain as string || this.defaultChain;

      const transferResult = await this.createTransfer({
        amount: refundAmount,
        currency: intent.currency.code,
        destinationAddress: senderAddress,
        chain: chain as CircleChain,
        metadata: {
          refundFor: request.intentId,
          reason: request.reason,
        },
      });

      if (!transferResult.success) {
        return err(transferResult.error);
      }

      const refund: Refund = {
        id: `ref_${uuidv4().slice(0, 12)}`,
        intentId: request.intentId,
        amount: refundAmount,
        currency: intent.currency,
        status: 'pending',
        reason: request.reason,
        createdAt: new Date().toISOString(),
        providerData: {
          transferId: transferResult.data.id,
          txHash: transferResult.data.transactionHash,
        },
      };

      return ok(refund);
    } catch (error) {
      return err(`Failed to create refund: ${error}`);
    }
  }

  async getRefund(refundId: string): Promise<Result<Refund, string>> {
    // Would look up from storage
    return err(`Refund lookup not implemented: ${refundId}`);
  }

  // ============================================================================
  // PAYOUTS (CRYPTO TRANSFERS)
  // ============================================================================

  async createPayout(request: PayoutRequest): Promise<Result<Payout, string>> {
    try {
      if (request.destination.type !== 'wallet') {
        return err('Circle only supports wallet payouts');
      }

      if (!this.walletId) {
        return err('No source wallet configured');
      }

      const body = {
        source: {
          type: 'wallet',
          id: this.walletId,
        },
        destination: {
          type: 'blockchain',
          address: request.destination.accountId,
          chain: this.defaultChain,
        },
        amount: {
          amount: request.amount,
          currency: request.currency.code,
        },
        idempotencyKey: uuidv4(),
      };

      const response = await this.request<{ data: CirclePayout }>(
        'POST',
        '/transfers',
        body
      );

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toPayout(response.data.data));
    } catch (error) {
      return err(`Failed to create payout: ${error}`);
    }
  }

  async getPayout(payoutId: string): Promise<Result<Payout, string>> {
    try {
      const response = await this.request<{ data: CirclePayout }>(
        'GET',
        `/transfers/${payoutId}`
      );

      if (!response.success) {
        return err(response.error);
      }

      return ok(this.toPayout(response.data.data));
    } catch (error) {
      return err(`Failed to get payout: ${error}`);
    }
  }

  // ============================================================================
  // BALANCE
  // ============================================================================

  async getBalance(): Promise<Result<Balance[], string>> {
    try {
      if (!this.walletId) {
        return ok([]); // No wallet configured
      }

      const response = await this.request<{ data: CircleWallet }>(
        'GET',
        `/wallets/${this.walletId}`
      );

      if (!response.success) {
        return err(response.error);
      }

      const balances: Balance[] = response.data.data.balances.map((b: { amount: string; currency: string }) => ({
        available: b.amount,
        pending: '0',
        currency: CURRENCIES[b.currency.toUpperCase()] || CURRENCIES.USDC,
      }));

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
    _signature: string
  ): Promise<Result<PaymentWebhookEvent, string>> {
    try {
      // Circle uses SNS for notifications
      // Verify signature would use AWS SNS signature verification
      const notification = payload as CircleNotification;

      let eventType: PaymentWebhookEvent['type'];
      let data: PaymentWebhookEvent['data'];

      if (notification.transfer) {
        const transfer = notification.transfer;
        eventType = transfer.status === 'complete'
          ? 'payment_intent.succeeded'
          : transfer.status === 'failed'
            ? 'payment_intent.failed'
            : 'payment_intent.processing';

        // Find matching payment intent
        const intent = Array.from(this.intents.values()).find(
          i => i.providerData?.depositAddress === transfer.destination.address
        );

        data = {
          intentId: intent?.id,
          status: this.mapCircleStatus(transfer.status),
          amount: transfer.amount.amount,
          currency: transfer.amount.currency,
        };

        // Update intent status if found
        if (intent && transfer.status === 'complete') {
          intent.status = 'succeeded';
          intent.confirmedAt = new Date().toISOString();
          intent.providerData = {
            ...intent.providerData,
            transferId: transfer.id,
            txHash: transfer.transactionHash,
          };
        }
      } else if (notification.payout) {
        const payout = notification.payout;
        eventType = payout.status === 'complete'
          ? 'payout.paid'
          : 'payout.failed';

        data = {
          payoutId: payout.id,
          status: payout.status,
          amount: payout.amount.amount,
          currency: payout.amount.currency,
        };
      } else {
        return err('Unknown notification type');
      }

      return ok({
        id: notification.subscriptionId,
        type: eventType,
        data,
        providerData: notification as unknown as Record<string, unknown>,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      return err(`Failed to process webhook: ${error}`);
    }
  }

  // ============================================================================
  // HEALTH CHECK
  // ============================================================================

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ data: { ready: boolean } }>(
        'GET',
        '/ping'
      );
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
    body?: unknown
  ): Promise<Result<T, string>> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    // Use resilient client with retry, circuit breaker, and timeout
    const fetchResult = await this.resilient.fetch(
      url,
      {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      },
      { operationName: `circle:${method}:${path}` }
    );

    if (!fetchResult.success) {
      return err(fetchResult.error);
    }

    const response = fetchResult.data;
    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.message || `Circle API error: ${response.status}`;
      return err(errorMessage);
    }

    return ok(data as T);
  }

  private async getOrCreateDepositAddress(
    payerId: string,
    chain: CircleChain
  ): Promise<Result<CircleDepositAddress, string>> {
    const key = `${payerId}:${chain}`;

    // Check cache
    const cached = this.deposits.get(key);
    if (cached) {
      return ok(cached);
    }

    // Create new deposit address via Circle API
    if (this.walletId) {
      const response = await this.request<{ data: CircleDepositAddress }>(
        'POST',
        `/wallets/${this.walletId}/addresses`,
        {
          chain,
          currency: 'USD',
          idempotencyKey: uuidv4(),
        }
      );

      if (response.success) {
        this.deposits.set(key, response.data.data);
        return ok(response.data.data);
      }
    }

    // Generate a placeholder address for demo
    const address: CircleDepositAddress = {
      id: uuidv4(),
      address: `0x${Array.from({ length: 40 }, () =>
        '0123456789abcdef'[Math.floor(Math.random() * 16)]
      ).join('')}`,
      chain,
      currency: 'USDC',
    };

    this.deposits.set(key, address);
    return ok(address);
  }

  private async checkForDeposit(
    address: string,
    expectedAmount: string,
    currency: string
  ): Promise<Result<CircleTransfer | null, string>> {
    try {
      // In production, this would query Circle for incoming transfers
      // to the deposit address

      const response = await this.request<{ data: CircleTransfer[] }>(
        'GET',
        `/transfers?destinationAddress=${address}`
      );

      if (!response.success) {
        return ok(null);
      }

      // Find matching transfer
      const transfer = response.data.data.find(
        (t: CircleTransfer) =>
          t.destination.address === address &&
          t.amount.currency === currency &&
          t.status === 'complete' &&
          BigInt(t.amount.amount.replace('.', '')) >= BigInt(expectedAmount)
      );

      return ok(transfer || null);
    } catch {
      return ok(null);
    }
  }

  private async createTransfer(params: {
    amount: string;
    currency: string;
    destinationAddress: string;
    chain: CircleChain;
    metadata?: Record<string, unknown>;
  }): Promise<Result<CircleTransfer, string>> {
    if (!this.walletId) {
      return err('No source wallet configured');
    }

    const response = await this.request<{ data: CircleTransfer }>(
      'POST',
      '/transfers',
      {
        source: {
          type: 'wallet',
          id: this.walletId,
        },
        destination: {
          type: 'blockchain',
          address: params.destinationAddress,
          chain: params.chain,
        },
        amount: {
          amount: params.amount,
          currency: params.currency,
        },
        idempotencyKey: uuidv4(),
      }
    );

    if (!response.success) {
      return err(response.error);
    }

    return ok(response.data.data);
  }

  private mapCircleStatus(status: string): PaymentStatus {
    switch (status) {
      case 'pending':
        return 'processing';
      case 'complete':
        return 'succeeded';
      case 'failed':
        return 'failed';
      case 'expired':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  private toPayout(circlePayout: CirclePayout): Payout {
    const currency = CURRENCIES[circlePayout.amount.currency.toUpperCase()] || CURRENCIES.USDC;

    return {
      id: circlePayout.id,
      status: circlePayout.status === 'complete' ? 'paid' : circlePayout.status,
      amount: circlePayout.amount.amount,
      currency,
      createdAt: circlePayout.createDate,
      paidAt: circlePayout.status === 'complete' ? new Date().toISOString() : undefined,
      providerData: {
        txHash: circlePayout.transactionHash,
      },
    };
  }

  // ============================================================================
  // PUBLIC HELPERS
  // ============================================================================

  /**
   * Get supported chains
   */
  getSupportedChains(): CircleChain[] {
    return this.supportedChains;
  }

  /**
   * Get deposit address for a payer
   */
  async getDepositAddress(
    payerId: string,
    chain?: CircleChain
  ): Promise<Result<{ address: string; chain: string }, string>> {
    const result = await this.getOrCreateDepositAddress(
      payerId,
      chain || this.defaultChain
    );

    if (!result.success) {
      return err(result.error);
    }

    return ok({
      address: result.data.address,
      chain: result.data.chain,
    });
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create a Circle payment provider
 */
export function createCircleProvider(config: CircleProviderConfig): CircleProvider {
  return new CircleProvider(config);
}
