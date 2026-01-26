/**
 * MockExchangeProvider - Reference Implementation
 *
 * A mock exchange/ATS provider for testing and demonstration.
 * Partners can use this as a template for building their own
 * integrations with tZERO, INX, Securitize Markets, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IExchangeProvider,
  Order,
  OrderSide,
  OrderType,
  OrderStatus,
  Trade,
  OrderBookEntry,
} from '../../core/interfaces.providers.js';

/**
 * In-memory storage for mock data
 */
interface MockStorage {
  orders: Map<string, Order>;
  trades: Map<string, Trade>;
  orderBooks: Map<string, { bids: OrderBookEntry[]; asks: OrderBookEntry[] }>;
  lastPrices: Map<string, string>;
  tradingEnabled: Set<string>;
}

/**
 * MockExchangeProvider Configuration
 */
export interface MockExchangeProviderConfig {
  /** Simulated order execution delay in ms (default: 200) */
  executionDelay?: number;
  /** Fill rate for market orders (0-1, default: 1) */
  marketOrderFillRate?: number;
  /** Fill rate for limit orders (0-1, default: 0.8) */
  limitOrderFillRate?: number;
  /** Base fee percentage (default: 0.001 = 0.1%) */
  feeRate?: number;
  /** Fee currency (default: 'USDC') */
  feeCurrency?: string;
  /** Simulate failures for testing (default: false) */
  simulateFailures?: boolean;
  /** Failure rate when simulateFailures is true (0-1, default: 0.1) */
  failureRate?: number;
}

/**
 * MockExchangeProvider - For testing and development
 *
 * @example
 * ```typescript
 * import { MockExchangeProvider } from '@tokenisation/sdk';
 *
 * const exchange = new MockExchangeProvider({
 *   executionDelay: 500,
 *   feeRate: 0.001,
 * });
 *
 * // Register with provider registry
 * providerRegistry.registerExchange(exchange, { isDefault: true });
 *
 * // Place an order
 * const result = await exchange.placeOrder({
 *   assetId: 'asset-123',
 *   traderId: 'trader-456',
 *   side: 'buy',
 *   type: 'limit',
 *   quantity: '100',
 *   price: '10.50',
 * });
 * ```
 */
export class MockExchangeProvider implements IExchangeProvider {
  readonly providerId = 'mock-exchange';
  readonly providerName = 'Mock Exchange Provider';
  readonly supportedPairs: string[] = [];

  private storage: MockStorage = {
    orders: new Map(),
    trades: new Map(),
    orderBooks: new Map(),
    lastPrices: new Map(),
    tradingEnabled: new Set(),
  };

  private config: Required<MockExchangeProviderConfig>;

  constructor(config: MockExchangeProviderConfig = {}) {
    this.config = {
      executionDelay: config.executionDelay ?? 200,
      marketOrderFillRate: config.marketOrderFillRate ?? 1,
      limitOrderFillRate: config.limitOrderFillRate ?? 0.8,
      feeRate: config.feeRate ?? 0.001,
      feeCurrency: config.feeCurrency ?? 'USDC',
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
    };
  }

  /**
   * Place an order
   */
  async placeOrder(params: {
    assetId: string;
    traderId: string;
    side: OrderSide;
    type: OrderType;
    quantity: string;
    price?: string;
    timeInForce?: 'GTC' | 'IOC' | 'FOK' | 'DAY';
    clientOrderId?: string;
  }): Promise<Result<Order, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Unable to place order');
    }

    // Check if trading is enabled
    if (!this.storage.tradingEnabled.has(params.assetId)) {
      return err(`Trading not enabled for asset: ${params.assetId}`);
    }

    // Validate limit order has price
    if ((params.type === 'limit' || params.type === 'stop_limit') && !params.price) {
      return err('Limit orders require a price');
    }

    const orderId = params.clientOrderId || `ord_${uuidv4().slice(0, 12)}`;
    const pair = `${params.assetId}/USDC`;

    const order: Order = {
      orderId,
      assetId: params.assetId,
      side: params.side,
      type: params.type,
      status: 'pending',
      quantity: params.quantity,
      filledQuantity: '0',
      price: params.price,
      pair,
      traderId: params.traderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      trades: [],
    };

    this.storage.orders.set(orderId, order);

    // Add to supported pairs if not exists
    if (!this.supportedPairs.includes(pair)) {
      (this.supportedPairs as string[]).push(pair);
    }

    // Process order asynchronously
    this.processOrder(orderId);

    return ok(order);
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string, traderId: string): Promise<Result<Order, string>> {
    const order = this.storage.orders.get(orderId);

    if (!order) {
      return err(`Order not found: ${orderId}`);
    }

    if (order.traderId !== traderId) {
      return err('Not authorized to cancel this order');
    }

    if (order.status === 'filled' || order.status === 'cancelled') {
      return err(`Cannot cancel order in status: ${order.status}`);
    }

    order.status = 'cancelled';
    order.updatedAt = new Date().toISOString();

    return ok(order);
  }

  /**
   * Get order details
   */
  async getOrder(orderId: string): Promise<Result<Order, string>> {
    const order = this.storage.orders.get(orderId);

    if (!order) {
      return err(`Order not found: ${orderId}`);
    }

    return ok(order);
  }

  /**
   * List orders for a trader
   */
  async listOrders(params: {
    traderId: string;
    assetId?: string;
    status?: OrderStatus[];
    limit?: number;
    offset?: number;
  }): Promise<Result<Order[], string>> {
    let orders = Array.from(this.storage.orders.values())
      .filter((o) => o.traderId === params.traderId);

    if (params.assetId) {
      orders = orders.filter((o) => o.assetId === params.assetId);
    }

    if (params.status && params.status.length > 0) {
      orders = orders.filter((o) => params.status!.includes(o.status));
    }

    // Sort by created date descending
    orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Apply pagination
    const offset = params.offset ?? 0;
    const limit = params.limit ?? 100;
    orders = orders.slice(offset, offset + limit);

    return ok(orders);
  }

  /**
   * Get order book for an asset
   */
  async getOrderBook(assetId: string, depth?: number): Promise<Result<{
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
    lastPrice?: string;
    timestamp: string;
  }, string>> {
    // Generate mock order book if not exists
    if (!this.storage.orderBooks.has(assetId)) {
      this.generateMockOrderBook(assetId);
    }

    const orderBook = this.storage.orderBooks.get(assetId)!;
    const lastPrice = this.storage.lastPrices.get(assetId);

    const maxDepth = depth ?? 10;

    return ok({
      bids: orderBook.bids.slice(0, maxDepth),
      asks: orderBook.asks.slice(0, maxDepth),
      lastPrice,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get trade history
   */
  async getTradeHistory(params: {
    traderId?: string;
    assetId?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
  }): Promise<Result<Trade[], string>> {
    let trades = Array.from(this.storage.trades.values());

    if (params.assetId) {
      trades = trades.filter((t) => {
        const order = this.storage.orders.get(t.orderId);
        return order?.assetId === params.assetId;
      });
    }

    if (params.fromDate) {
      const fromDate = new Date(params.fromDate);
      trades = trades.filter((t) => new Date(t.executedAt) >= fromDate);
    }

    if (params.toDate) {
      const toDate = new Date(params.toDate);
      trades = trades.filter((t) => new Date(t.executedAt) <= toDate);
    }

    // Sort by execution date descending
    trades.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

    // Apply limit
    const limit = params.limit ?? 100;
    trades = trades.slice(0, limit);

    return ok(trades);
  }

  /**
   * Check if trading is enabled for an asset
   */
  async isTradingEnabled(assetId: string): Promise<boolean> {
    return this.storage.tradingEnabled.has(assetId);
  }

  /**
   * Check if provider is available
   */
  async healthCheck(): Promise<boolean> {
    return !this.shouldFail();
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Process an order (simulate matching)
   */
  private async processOrder(orderId: string): Promise<void> {
    await this.delay(this.config.executionDelay);

    const order = this.storage.orders.get(orderId);
    if (!order || order.status === 'cancelled') return;

    order.status = 'open';
    order.updatedAt = new Date().toISOString();

    // Determine if order should fill
    const fillRate = order.type === 'market'
      ? this.config.marketOrderFillRate
      : this.config.limitOrderFillRate;

    if (Math.random() > fillRate) {
      // Partial fill or no fill
      if (Math.random() > 0.5) {
        order.status = 'partially_filled';
        await this.executeTrade(order, parseFloat(order.quantity) * 0.5);
      }
      return;
    }

    // Full fill
    await this.executeTrade(order, parseFloat(order.quantity));
    order.status = 'filled';
    order.updatedAt = new Date().toISOString();
  }

  /**
   * Execute a trade
   */
  private async executeTrade(order: Order, quantity: number): Promise<void> {
    // Determine execution price
    let price: number;
    if (order.type === 'market') {
      // Use last price or generate one
      const lastPrice = this.storage.lastPrices.get(order.assetId);
      price = lastPrice ? parseFloat(lastPrice) : 10 + Math.random() * 5;
    } else {
      price = parseFloat(order.price!);
    }

    // Calculate fee
    const tradeValue = quantity * price;
    const fee = tradeValue * this.config.feeRate;

    const tradeId = `trd_${uuidv4().slice(0, 12)}`;
    const trade: Trade = {
      tradeId,
      orderId: order.orderId,
      side: order.side,
      quantity: quantity.toString(),
      price: price.toString(),
      fee: fee.toString(),
      feeCurrency: this.config.feeCurrency,
      executedAt: new Date().toISOString(),
    };

    this.storage.trades.set(tradeId, trade);

    // Update order
    order.filledQuantity = (parseFloat(order.filledQuantity) + quantity).toString();
    order.avgFillPrice = price.toString();
    order.trades = order.trades || [];
    order.trades.push(trade);
    order.updatedAt = new Date().toISOString();

    // Update last price
    this.storage.lastPrices.set(order.assetId, price.toString());
  }

  /**
   * Generate mock order book
   */
  private generateMockOrderBook(assetId: string): void {
    const basePrice = 10 + Math.random() * 5;
    const spread = 0.02; // 2% spread

    const bids: OrderBookEntry[] = [];
    const asks: OrderBookEntry[] = [];

    for (let i = 0; i < 10; i++) {
      bids.push({
        price: (basePrice * (1 - spread) - i * 0.05).toFixed(4),
        quantity: (100 + Math.random() * 500).toFixed(2),
        orderCount: Math.floor(1 + Math.random() * 5),
      });

      asks.push({
        price: (basePrice * (1 + spread) + i * 0.05).toFixed(4),
        quantity: (100 + Math.random() * 500).toFixed(2),
        orderCount: Math.floor(1 + Math.random() * 5),
      });
    }

    this.storage.orderBooks.set(assetId, { bids, asks });
    this.storage.lastPrices.set(assetId, basePrice.toFixed(4));
  }

  /**
   * Check if we should simulate a failure
   */
  private shouldFail(): boolean {
    return this.config.simulateFailures && Math.random() < this.config.failureRate;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Reset all storage (for testing)
   */
  reset(): void {
    this.storage.orders.clear();
    this.storage.trades.clear();
    this.storage.orderBooks.clear();
    this.storage.lastPrices.clear();
    this.storage.tradingEnabled.clear();
    (this.supportedPairs as string[]).length = 0;
  }

  /**
   * Enable trading for an asset (for testing)
   */
  enableTrading(assetId: string): void {
    this.storage.tradingEnabled.add(assetId);
  }

  /**
   * Disable trading for an asset (for testing)
   */
  disableTrading(assetId: string): void {
    this.storage.tradingEnabled.delete(assetId);
  }

  /**
   * Set last price for an asset (for testing)
   */
  setLastPrice(assetId: string, price: string): void {
    this.storage.lastPrices.set(assetId, price);
  }
}
