/**
 * DataFeedBridge
 *
 * Polls DataFeedPlugin.getLatestPrice() and pushes results into
 * OracleService.setPriceFeed() / OracleService.setNAV().
 *
 * This bridge actively pushes Chainlink on-chain price data into
 * the in-memory OracleService so that downstream pack engines
 * and compliance checks can query prices without knowing about Chainlink.
 */

import type { DataFeedPlugin } from '../plugins/chainlink/DataFeedPlugin.js';
import type { OracleService } from '../services/OracleService.js';

export interface DataFeedBridgeConfig {
  /** Polling interval in milliseconds */
  pollIntervalMs: number;
  /** Price feed pairs to poll (e.g., ['ETH/USD', 'BTC/USD']) */
  pairs: string[];
  /** Map asset IDs to { pair, currency } for NAV updates */
  navMappings?: Record<string, { pair: string; currency: string }>;
}

/**
 * DataFeedBridge
 *
 * Polls a DataFeedPlugin and pushes price data into an OracleService.
 */
export class DataFeedBridge {
  private intervalId?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly dataFeedPlugin: DataFeedPlugin,
    private readonly oracleService: OracleService,
    private readonly config: DataFeedBridgeConfig
  ) {}

  /**
   * Start the polling loop
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Do an initial sync immediately
    await this.syncOnce();

    // Then set up recurring poll
    this.intervalId = setInterval(async () => {
      try {
        await this.syncOnce();
      } catch {
        // Swallow errors to keep polling alive
      }
    }, this.config.pollIntervalMs);
  }

  /**
   * Stop the polling loop
   */
  stop(): void {
    this.running = false;
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Whether the bridge is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Single poll cycle: fetch prices and push into OracleService
   */
  async syncOnce(): Promise<void> {
    for (const pair of this.config.pairs) {
      try {
        const priceData = await this.dataFeedPlugin.getLatestPrice(pair);
        this.oracleService.setPriceFeed(
          pair,
          priceData.formattedPrice,
          priceData.decimals
        );
      } catch {
        // Individual pair failures don't stop other pairs
      }
    }

    // Sync NAV mappings if configured
    if (this.config.navMappings) {
      for (const [assetId, mapping] of Object.entries(this.config.navMappings)) {
        try {
          await this.syncNAV(assetId, mapping.pair, mapping.currency);
        } catch {
          // Individual NAV failures don't stop other assets
        }
      }
    }
  }

  /**
   * Sync a single NAV entry by reading a price feed and writing it as NAV
   */
  async syncNAV(assetId: string, pair: string, currency: string): Promise<void> {
    const priceData = await this.dataFeedPlugin.getLatestPrice(pair);
    this.oracleService.setNAV(
      assetId,
      priceData.formattedPrice,
      currency,
      `chainlink:${pair}`
    );
  }
}
