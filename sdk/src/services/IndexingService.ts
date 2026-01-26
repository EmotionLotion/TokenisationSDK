/**
 * IndexingService - Simulates listening to chain events
 *
 * Provides event indexing and querying capabilities.
 * In production, this would integrate with The Graph or Goldsky.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Indexed event
 */
export interface IndexedEvent {
  id: string;
  contractAddress: string;
  eventName: string;
  blockNumber: number;
  blockHash: string;
  transactionHash: string;
  logIndex: number;
  timestamp: string;
  args: Record<string, unknown>;
  chainId: number;
}

/**
 * Token holder record
 */
export interface TokenHolder {
  address: string;
  tokenAddress: string;
  balance: string;
  tokenId?: string; // For NFTs
  lastUpdated: string;
}

/**
 * Token transfer record
 */
export interface TokenTransfer {
  id: string;
  tokenAddress: string;
  from: string;
  to: string;
  amount: string;
  tokenId?: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: string;
}

/**
 * Event query options
 */
export interface EventQueryOptions {
  contractAddress?: string;
  eventName?: string;
  fromBlock?: number;
  toBlock?: number;
  chainId?: number;
  limit?: number;
  offset?: number;
}

/**
 * Event subscription
 */
interface EventSubscription {
  id: string;
  contractAddress: string;
  eventName?: string;
  callback: (event: IndexedEvent) => void;
}

/**
 * IndexingService class
 */
export class IndexingService {
  private events: Map<string, IndexedEvent> = new Map();
  private eventsByContract: Map<string, string[]> = new Map();
  private eventsByName: Map<string, string[]> = new Map();
  private holders: Map<string, TokenHolder> = new Map(); // key: `${tokenAddress}:${holderAddress}`
  private transfers: TokenTransfer[] = [];
  private subscriptions: Map<string, EventSubscription> = new Map();
  private currentBlockNumber: number = 0;

  /**
   * Index a new event
   */
  indexEvent(event: IndexedEvent): void {
    this.events.set(event.id, event);

    // Index by contract
    const contractEvents = this.eventsByContract.get(event.contractAddress) || [];
    contractEvents.push(event.id);
    this.eventsByContract.set(event.contractAddress, contractEvents);

    // Index by name
    const nameEvents = this.eventsByName.get(event.eventName) || [];
    nameEvents.push(event.id);
    this.eventsByName.set(event.eventName, nameEvents);

    // Update block number
    if (event.blockNumber > this.currentBlockNumber) {
      this.currentBlockNumber = event.blockNumber;
    }

    // Notify subscribers
    this.notifySubscribers(event);

    // Handle specific event types
    this.handleSpecificEvents(event);
  }

  /**
   * Handle specific event types (transfers, etc.)
   */
  private handleSpecificEvents(event: IndexedEvent): void {
    // Handle Transfer events
    if (event.eventName === 'Transfer') {
      const transfer: TokenTransfer = {
        id: event.id,
        tokenAddress: event.contractAddress,
        from: event.args['from'] as string,
        to: event.args['to'] as string,
        amount: (event.args['value'] || event.args['amount'] || '0') as string,
        tokenId: event.args['tokenId'] as string | undefined,
        transactionHash: event.transactionHash,
        blockNumber: event.blockNumber,
        timestamp: event.timestamp,
      };

      this.transfers.push(transfer);
      this.updateHolderBalances(transfer);
    }
  }

  /**
   * Update holder balances after transfer
   */
  private updateHolderBalances(transfer: TokenTransfer): void {
    const now = new Date().toISOString();

    // Update sender balance (if not mint)
    if (transfer.from !== '0x0000000000000000000000000000000000000000') {
      const fromKey = `${transfer.tokenAddress}:${transfer.from}`;
      const fromHolder = this.holders.get(fromKey);
      if (fromHolder) {
        const newBalance =
          BigInt(fromHolder.balance) - BigInt(transfer.amount);
        if (newBalance <= 0n) {
          this.holders.delete(fromKey);
        } else {
          fromHolder.balance = newBalance.toString();
          fromHolder.lastUpdated = now;
        }
      }
    }

    // Update receiver balance (if not burn)
    if (transfer.to !== '0x0000000000000000000000000000000000000000') {
      const toKey = `${transfer.tokenAddress}:${transfer.to}`;
      const toHolder = this.holders.get(toKey) || {
        address: transfer.to,
        tokenAddress: transfer.tokenAddress,
        balance: '0',
        tokenId: transfer.tokenId,
        lastUpdated: now,
      };

      toHolder.balance = (
        BigInt(toHolder.balance) + BigInt(transfer.amount)
      ).toString();
      toHolder.lastUpdated = now;
      this.holders.set(toKey, toHolder);
    }
  }

  /**
   * Query events
   */
  queryEvents(options: EventQueryOptions): IndexedEvent[] {
    let events: IndexedEvent[] = [];

    // Start with contract filter if provided
    if (options.contractAddress) {
      const eventIds = this.eventsByContract.get(options.contractAddress) || [];
      events = eventIds
        .map((id) => this.events.get(id))
        .filter((e): e is IndexedEvent => e !== undefined);
    } else if (options.eventName) {
      const eventIds = this.eventsByName.get(options.eventName) || [];
      events = eventIds
        .map((id) => this.events.get(id))
        .filter((e): e is IndexedEvent => e !== undefined);
    } else {
      events = Array.from(this.events.values());
    }

    // Apply filters
    if (options.eventName && options.contractAddress) {
      events = events.filter((e) => e.eventName === options.eventName);
    }

    if (options.fromBlock !== undefined) {
      events = events.filter((e) => e.blockNumber >= options.fromBlock!);
    }

    if (options.toBlock !== undefined) {
      events = events.filter((e) => e.blockNumber <= options.toBlock!);
    }

    if (options.chainId !== undefined) {
      events = events.filter((e) => e.chainId === options.chainId);
    }

    // Sort by block number descending
    events.sort((a, b) => b.blockNumber - a.blockNumber);

    // Apply pagination
    if (options.offset) {
      events = events.slice(options.offset);
    }

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  /**
   * Get token holders
   */
  getTokenHolders(
    tokenAddress: string,
    options?: { minBalance?: string; limit?: number }
  ): TokenHolder[] {
    let holders = Array.from(this.holders.values()).filter(
      (h) => h.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );

    if (options?.minBalance) {
      const minBal = BigInt(options.minBalance);
      holders = holders.filter((h) => BigInt(h.balance) >= minBal);
    }

    // Sort by balance descending
    holders.sort((a, b) => {
      const balA = BigInt(a.balance);
      const balB = BigInt(b.balance);
      return balB > balA ? 1 : balB < balA ? -1 : 0;
    });

    if (options?.limit) {
      holders = holders.slice(0, options.limit);
    }

    return holders;
  }

  /**
   * Get holder balance
   */
  getHolderBalance(tokenAddress: string, holderAddress: string): string {
    const key = `${tokenAddress}:${holderAddress}`;
    const holder = this.holders.get(key);
    return holder?.balance || '0';
  }

  /**
   * Get token transfers
   */
  getTransfers(options?: {
    tokenAddress?: string;
    from?: string;
    to?: string;
    fromBlock?: number;
    toBlock?: number;
    limit?: number;
  }): TokenTransfer[] {
    let transfers = [...this.transfers];

    if (options?.tokenAddress) {
      transfers = transfers.filter(
        (t) =>
          t.tokenAddress.toLowerCase() === options.tokenAddress!.toLowerCase()
      );
    }

    if (options?.from) {
      transfers = transfers.filter(
        (t) => t.from.toLowerCase() === options.from!.toLowerCase()
      );
    }

    if (options?.to) {
      transfers = transfers.filter(
        (t) => t.to.toLowerCase() === options.to!.toLowerCase()
      );
    }

    if (options?.fromBlock !== undefined) {
      transfers = transfers.filter((t) => t.blockNumber >= options.fromBlock!);
    }

    if (options?.toBlock !== undefined) {
      transfers = transfers.filter((t) => t.blockNumber <= options.toBlock!);
    }

    // Sort by block number descending
    transfers.sort((a, b) => b.blockNumber - a.blockNumber);

    if (options?.limit) {
      transfers = transfers.slice(0, options.limit);
    }

    return transfers;
  }

  /**
   * Subscribe to events
   */
  subscribe(
    contractAddress: string,
    eventName: string | undefined,
    callback: (event: IndexedEvent) => void
  ): { unsubscribe: () => void } {
    const subscriptionId = uuidv4();

    const subscription: EventSubscription = {
      id: subscriptionId,
      contractAddress,
      eventName,
      callback,
    };

    this.subscriptions.set(subscriptionId, subscription);

    return {
      unsubscribe: () => {
        this.subscriptions.delete(subscriptionId);
      },
    };
  }

  /**
   * Notify subscribers of new event
   */
  private notifySubscribers(event: IndexedEvent): void {
    for (const sub of this.subscriptions.values()) {
      if (
        sub.contractAddress.toLowerCase() === event.contractAddress.toLowerCase()
      ) {
        if (!sub.eventName || sub.eventName === event.eventName) {
          try {
            sub.callback(event);
          } catch (error) {
            console.error(`Subscription callback error: ${error}`);
          }
        }
      }
    }
  }

  /**
   * Simulate indexing a Transfer event
   */
  simulateTransfer(params: {
    contractAddress: string;
    from: string;
    to: string;
    amount: string;
    tokenId?: string;
    chainId?: number;
  }): IndexedEvent {
    this.currentBlockNumber++;

    const event: IndexedEvent = {
      id: uuidv4(),
      contractAddress: params.contractAddress,
      eventName: 'Transfer',
      blockNumber: this.currentBlockNumber,
      blockHash: `0x${Buffer.from(uuidv4()).toString('hex').slice(0, 64)}`,
      transactionHash: `0x${Buffer.from(uuidv4()).toString('hex').slice(0, 64)}`,
      logIndex: 0,
      timestamp: new Date().toISOString(),
      args: {
        from: params.from,
        to: params.to,
        value: params.amount,
        tokenId: params.tokenId,
      },
      chainId: params.chainId || 1,
    };

    this.indexEvent(event);
    return event;
  }

  /**
   * Get current block number
   */
  getCurrentBlockNumber(): number {
    return this.currentBlockNumber;
  }

  /**
   * Set current block number
   */
  setCurrentBlockNumber(blockNumber: number): void {
    this.currentBlockNumber = blockNumber;
  }

  /**
   * Get holder count for a token
   */
  getHolderCount(tokenAddress: string): number {
    return Array.from(this.holders.values()).filter(
      (h) =>
        h.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() &&
        BigInt(h.balance) > 0n
    ).length;
  }

  /**
   * Get total supply from transfers (sum of mints - burns)
   */
  getTotalSupply(tokenAddress: string): string {
    let supply = 0n;
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    for (const transfer of this.transfers) {
      if (transfer.tokenAddress.toLowerCase() !== tokenAddress.toLowerCase()) {
        continue;
      }

      const amount = BigInt(transfer.amount);

      // Mint
      if (transfer.from === ZERO_ADDRESS) {
        supply += amount;
      }
      // Burn
      if (transfer.to === ZERO_ADDRESS) {
        supply -= amount;
      }
    }

    return supply.toString();
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.events.clear();
    this.eventsByContract.clear();
    this.eventsByName.clear();
    this.holders.clear();
    this.transfers = [];
    this.subscriptions.clear();
    this.currentBlockNumber = 0;
  }
}

/**
 * Create indexing service with default configuration
 */
export function createIndexingService(): IndexingService {
  return new IndexingService();
}
