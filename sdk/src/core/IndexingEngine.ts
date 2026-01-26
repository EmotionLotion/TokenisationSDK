/**
 * IndexingEngine - Indexing and Reporting for Tokenized Assets
 *
 * Provides:
 * - Real-time indexing of on-chain and off-chain events
 * - Queryable views for balances, transfers, compliance
 * - Report generation for regulatory and audit purposes
 * - Analytics and aggregations
 *
 * @example
 * ```typescript
 * const indexer = new IndexingEngine();
 *
 * // Index an event
 * indexer.indexEvent({
 *   type: IndexedEventType.TRANSFER,
 *   assetId: 'asset-123',
 *   data: { from, to, amount },
 * });
 *
 * // Query transfers
 * const transfers = indexer.queryTransfers({
 *   assetId: 'asset-123',
 *   fromDate: '2024-01-01',
 * });
 *
 * // Generate compliance report
 * const report = indexer.generateComplianceReport('asset-123');
 * ```
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Indexed event types
 */
export enum IndexedEventType {
  // Asset events
  ASSET_CREATED = 'ASSET_CREATED',
  ASSET_UPDATED = 'ASSET_UPDATED',
  ASSET_ACTIVATED = 'ASSET_ACTIVATED',
  ASSET_FROZEN = 'ASSET_FROZEN',
  ASSET_UNFROZEN = 'ASSET_UNFROZEN',
  ASSET_RETIRED = 'ASSET_RETIRED',

  // Token events
  MINT = 'MINT',
  BURN = 'BURN',
  TRANSFER = 'TRANSFER',
  FORCE_TRANSFER = 'FORCE_TRANSFER',

  // Compliance events
  KYC_VERIFIED = 'KYC_VERIFIED',
  KYC_REVOKED = 'KYC_REVOKED',
  COMPLIANCE_CHECK = 'COMPLIANCE_CHECK',
  COMPLIANCE_VIOLATION = 'COMPLIANCE_VIOLATION',
  FREEZE_ACCOUNT = 'FREEZE_ACCOUNT',
  UNFREEZE_ACCOUNT = 'UNFREEZE_ACCOUNT',

  // Custody events
  CUSTODY_CREATED = 'CUSTODY_CREATED',
  CUSTODY_UPDATED = 'CUSTODY_UPDATED',
  RECOVERY_INITIATED = 'RECOVERY_INITIATED',
  RECOVERY_EXECUTED = 'RECOVERY_EXECUTED',
  OVERRIDE_REQUESTED = 'OVERRIDE_REQUESTED',
  OVERRIDE_EXECUTED = 'OVERRIDE_EXECUTED',

  // Distribution events
  DIVIDEND_DECLARED = 'DIVIDEND_DECLARED',
  DIVIDEND_DISTRIBUTED = 'DIVIDEND_DISTRIBUTED',
  DIVIDEND_CLAIMED = 'DIVIDEND_CLAIMED',

  // Governance events
  PROPOSAL_CREATED = 'PROPOSAL_CREATED',
  VOTE_CAST = 'VOTE_CAST',
  PROPOSAL_EXECUTED = 'PROPOSAL_EXECUTED',
}

/**
 * Indexed event
 */
export interface IndexedEvent {
  id: string;
  type: IndexedEventType;
  assetId: string;
  timestamp: string;
  blockNumber?: number;
  transactionHash?: string;
  /** Actor who triggered the event */
  actor: string;
  /** Event-specific data */
  data: Record<string, unknown>;
  /** Indexed at timestamp */
  indexedAt: string;
}

/**
 * Balance record
 */
export interface BalanceRecord {
  assetId: string;
  holder: string;
  balance: string;
  frozenBalance: string;
  lastUpdated: string;
}

/**
 * Transfer record
 */
export interface TransferRecord {
  id: string;
  assetId: string;
  from: string;
  to: string;
  amount: string;
  type: 'TRANSFER' | 'MINT' | 'BURN' | 'FORCE_TRANSFER';
  timestamp: string;
  transactionHash?: string;
  blockNumber?: number;
  reason?: string;
}

/**
 * Holder statistics
 */
export interface HolderStats {
  address: string;
  balance: string;
  percentOfSupply: number;
  firstAcquired: string;
  lastActivity: string;
  transferCount: number;
}

/**
 * Asset statistics
 */
export interface AssetStats {
  assetId: string;
  totalSupply: string;
  circulatingSupply: string;
  holderCount: number;
  transferCount: number;
  totalVolume: string;
  frozenSupply: string;
  averageHoldingPeriodDays: number;
}

/**
 * Compliance report
 */
export interface ComplianceReport {
  assetId: string;
  generatedAt: string;
  period: {
    from: string;
    to: string;
  };
  summary: {
    totalTransfers: number;
    blockedTransfers: number;
    complianceRate: number;
    kycVerifications: number;
    frozenAccounts: number;
    violations: number;
  };
  jurisdictionBreakdown: {
    jurisdiction: string;
    holderCount: number;
    totalBalance: string;
  }[];
  topHolders: HolderStats[];
  violations: {
    type: string;
    count: number;
    lastOccurrence: string;
  }[];
  auditTrail: IndexedEvent[];
}

/**
 * Query options for transfers
 */
export interface TransferQueryOptions {
  assetId?: string;
  from?: string;
  to?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: string;
  maxAmount?: string;
  type?: TransferRecord['type'];
  limit?: number;
  offset?: number;
}

/**
 * Query options for events
 */
export interface IndexerEventQueryOptions {
  assetId?: string;
  types?: IndexedEventType[];
  actor?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// INDEXING ENGINE
// ============================================================================

/**
 * Indexing and reporting engine
 */
export class IndexingEngine {
  private events: Map<string, IndexedEvent> = new Map();
  private balances: Map<string, BalanceRecord> = new Map();
  private transfers: Map<string, TransferRecord> = new Map();

  // Indexes for fast lookups
  private eventsByAsset: Map<string, Set<string>> = new Map();
  private eventsByType: Map<IndexedEventType, Set<string>> = new Map();
  private transfersByAsset: Map<string, Set<string>> = new Map();
  private balancesByAsset: Map<string, Set<string>> = new Map();

  // ==========================================================================
  // INDEXING
  // ==========================================================================

  /**
   * Index an event
   */
  indexEvent(params: {
    type: IndexedEventType;
    assetId: string;
    actor: string;
    data: Record<string, unknown>;
    blockNumber?: number;
    transactionHash?: string;
    timestamp?: string;
  }): IndexedEvent {
    const event: IndexedEvent = {
      id: uuidv4(),
      type: params.type,
      assetId: params.assetId,
      timestamp: params.timestamp || new Date().toISOString(),
      blockNumber: params.blockNumber,
      transactionHash: params.transactionHash,
      actor: params.actor,
      data: params.data,
      indexedAt: new Date().toISOString(),
    };

    // Store event
    this.events.set(event.id, event);

    // Update indexes
    this.addToIndex(this.eventsByAsset, params.assetId, event.id);
    this.addToIndex(this.eventsByType, params.type, event.id);

    // Process specific event types
    this.processEvent(event);

    return event;
  }

  /**
   * Process event for derived data
   */
  private processEvent(event: IndexedEvent): void {
    switch (event.type) {
      case IndexedEventType.MINT:
        this.processMint(event);
        break;
      case IndexedEventType.BURN:
        this.processBurn(event);
        break;
      case IndexedEventType.TRANSFER:
      case IndexedEventType.FORCE_TRANSFER:
        this.processTransfer(event);
        break;
      case IndexedEventType.FREEZE_ACCOUNT:
        this.processFreezeAccount(event);
        break;
      case IndexedEventType.UNFREEZE_ACCOUNT:
        this.processUnfreezeAccount(event);
        break;
    }
  }

  private processMint(event: IndexedEvent): void {
    const { to, amount } = event.data as { to: string; amount: string };

    // Create transfer record
    const transfer: TransferRecord = {
      id: uuidv4(),
      assetId: event.assetId,
      from: '0x0000000000000000000000000000000000000000',
      to,
      amount,
      type: 'MINT',
      timestamp: event.timestamp,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
    };
    this.transfers.set(transfer.id, transfer);
    this.addToIndex(this.transfersByAsset, event.assetId, transfer.id);

    // Update balance
    this.updateBalance(event.assetId, to, amount, 'add');
  }

  private processBurn(event: IndexedEvent): void {
    const { from, amount } = event.data as { from: string; amount: string };

    const transfer: TransferRecord = {
      id: uuidv4(),
      assetId: event.assetId,
      from,
      to: '0x0000000000000000000000000000000000000000',
      amount,
      type: 'BURN',
      timestamp: event.timestamp,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
    };
    this.transfers.set(transfer.id, transfer);
    this.addToIndex(this.transfersByAsset, event.assetId, transfer.id);

    this.updateBalance(event.assetId, from, amount, 'subtract');
  }

  private processTransfer(event: IndexedEvent): void {
    const { from, to, amount, reason } = event.data as {
      from: string;
      to: string;
      amount: string;
      reason?: string;
    };

    const transfer: TransferRecord = {
      id: uuidv4(),
      assetId: event.assetId,
      from,
      to,
      amount,
      type: event.type === IndexedEventType.FORCE_TRANSFER ? 'FORCE_TRANSFER' : 'TRANSFER',
      timestamp: event.timestamp,
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      reason,
    };
    this.transfers.set(transfer.id, transfer);
    this.addToIndex(this.transfersByAsset, event.assetId, transfer.id);

    this.updateBalance(event.assetId, from, amount, 'subtract');
    this.updateBalance(event.assetId, to, amount, 'add');
  }

  private processFreezeAccount(event: IndexedEvent): void {
    const { account, amount } = event.data as { account: string; amount?: string };
    const key = `${event.assetId}:${account}`;
    const balance = this.balances.get(key);

    if (balance && amount) {
      balance.frozenBalance = (BigInt(balance.frozenBalance || '0') + BigInt(amount)).toString();
      balance.lastUpdated = event.timestamp;
      this.balances.set(key, balance);
    }
  }

  private processUnfreezeAccount(event: IndexedEvent): void {
    const { account, amount } = event.data as { account: string; amount?: string };
    const key = `${event.assetId}:${account}`;
    const balance = this.balances.get(key);

    if (balance && amount) {
      const frozen = BigInt(balance.frozenBalance || '0');
      const unfreeze = BigInt(amount);
      balance.frozenBalance = (frozen > unfreeze ? frozen - unfreeze : BigInt(0)).toString();
      balance.lastUpdated = event.timestamp;
      this.balances.set(key, balance);
    }
  }

  private updateBalance(assetId: string, holder: string, amount: string, operation: 'add' | 'subtract'): void {
    const key = `${assetId}:${holder}`;
    let balance = this.balances.get(key);

    if (!balance) {
      balance = {
        assetId,
        holder,
        balance: '0',
        frozenBalance: '0',
        lastUpdated: new Date().toISOString(),
      };
      this.addToIndex(this.balancesByAsset, assetId, key);
    }

    const current = BigInt(balance.balance);
    const change = BigInt(amount);
    balance.balance = (operation === 'add' ? current + change : current - change).toString();
    balance.lastUpdated = new Date().toISOString();

    this.balances.set(key, balance);
  }

  private addToIndex<K>(index: Map<K, Set<string>>, key: K, value: string): void {
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(value);
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Query events
   */
  queryEvents(options: IndexerEventQueryOptions = {}): IndexedEvent[] {
    let eventIds: Set<string> | undefined;

    // Filter by asset
    if (options.assetId) {
      eventIds = this.eventsByAsset.get(options.assetId);
      if (!eventIds) return [];
    }

    // Filter by types
    if (options.types && options.types.length > 0) {
      const typeEventIds = new Set<string>();
      for (const type of options.types) {
        const ids = this.eventsByType.get(type);
        if (ids) {
          ids.forEach(id => typeEventIds.add(id));
        }
      }
      eventIds = eventIds
        ? new Set([...eventIds].filter(id => typeEventIds.has(id)))
        : typeEventIds;
    }

    // Get events
    let events: IndexedEvent[] = eventIds
      ? [...eventIds].map(id => this.events.get(id)!).filter(Boolean)
      : Array.from(this.events.values());

    // Filter by actor
    if (options.actor) {
      events = events.filter(e => e.actor === options.actor);
    }

    // Filter by date range
    if (options.fromDate) {
      const from = new Date(options.fromDate);
      events = events.filter(e => new Date(e.timestamp) >= from);
    }
    if (options.toDate) {
      const to = new Date(options.toDate);
      events = events.filter(e => new Date(e.timestamp) <= to);
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return events.slice(offset, offset + limit);
  }

  /**
   * Query transfers
   */
  queryTransfers(options: TransferQueryOptions = {}): TransferRecord[] {
    let transferIds: Set<string> | undefined;

    if (options.assetId) {
      transferIds = this.transfersByAsset.get(options.assetId);
      if (!transferIds) return [];
    }

    let transfers: TransferRecord[] = transferIds
      ? [...transferIds].map(id => this.transfers.get(id)!).filter(Boolean)
      : Array.from(this.transfers.values());

    // Apply filters
    if (options.from) {
      transfers = transfers.filter(t => t.from === options.from);
    }
    if (options.to) {
      transfers = transfers.filter(t => t.to === options.to);
    }
    if (options.type) {
      transfers = transfers.filter(t => t.type === options.type);
    }
    if (options.fromDate) {
      const from = new Date(options.fromDate);
      transfers = transfers.filter(t => new Date(t.timestamp) >= from);
    }
    if (options.toDate) {
      const to = new Date(options.toDate);
      transfers = transfers.filter(t => new Date(t.timestamp) <= to);
    }
    if (options.minAmount) {
      const min = BigInt(options.minAmount);
      transfers = transfers.filter(t => BigInt(t.amount) >= min);
    }
    if (options.maxAmount) {
      const max = BigInt(options.maxAmount);
      transfers = transfers.filter(t => BigInt(t.amount) <= max);
    }

    // Sort by timestamp descending
    transfers.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return transfers.slice(offset, offset + limit);
  }

  /**
   * Get balance for a holder
   */
  getBalance(assetId: string, holder: string): BalanceRecord | undefined {
    return this.balances.get(`${assetId}:${holder}`);
  }

  /**
   * Get all balances for an asset
   */
  getAssetBalances(assetId: string): BalanceRecord[] {
    const keys = this.balancesByAsset.get(assetId);
    if (!keys) return [];
    return [...keys].map(k => this.balances.get(k)!).filter(Boolean);
  }

  /**
   * Get holder statistics
   */
  getHolderStats(assetId: string, holder: string): HolderStats | undefined {
    const balance = this.getBalance(assetId, holder);
    if (!balance || balance.balance === '0') return undefined;

    const transfers = this.queryTransfers({ assetId })
      .filter(t => t.from === holder || t.to === holder);

    if (transfers.length === 0) return undefined;

    // Calculate total supply for percentage
    const allBalances = this.getAssetBalances(assetId);
    const totalSupply = allBalances.reduce(
      (sum, b) => sum + BigInt(b.balance),
      BigInt(0)
    );

    const holderBalance = BigInt(balance.balance);
    const percentOfSupply = totalSupply > 0
      ? Number((holderBalance * BigInt(10000)) / totalSupply) / 100
      : 0;

    // Find first acquisition
    const firstAcquired = transfers
      .filter(t => t.to === holder)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0]?.timestamp;

    return {
      address: holder,
      balance: balance.balance,
      percentOfSupply,
      firstAcquired: firstAcquired || balance.lastUpdated,
      lastActivity: balance.lastUpdated,
      transferCount: transfers.length,
    };
  }

  /**
   * Get asset statistics
   */
  getAssetStats(assetId: string): AssetStats {
    const balances = this.getAssetBalances(assetId);
    const transfers = this.queryTransfers({ assetId, limit: 10000 });

    const totalSupply = balances.reduce(
      (sum, b) => sum + BigInt(b.balance),
      BigInt(0)
    );

    const frozenSupply = balances.reduce(
      (sum, b) => sum + BigInt(b.frozenBalance || '0'),
      BigInt(0)
    );

    const totalVolume = transfers.reduce(
      (sum, t) => sum + BigInt(t.amount),
      BigInt(0)
    );

    const holders = balances.filter(b => BigInt(b.balance) > 0);

    return {
      assetId,
      totalSupply: totalSupply.toString(),
      circulatingSupply: (totalSupply - frozenSupply).toString(),
      holderCount: holders.length,
      transferCount: transfers.length,
      totalVolume: totalVolume.toString(),
      frozenSupply: frozenSupply.toString(),
      averageHoldingPeriodDays: 0, // Would need more data to calculate
    };
  }

  // ==========================================================================
  // REPORTING
  // ==========================================================================

  /**
   * Generate compliance report
   */
  generateComplianceReport(
    assetId: string,
    fromDate?: string,
    toDate?: string
  ): ComplianceReport {
    const now = new Date().toISOString();
    const from = fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = toDate || now;

    // Get events in period
    const events = this.queryEvents({
      assetId,
      fromDate: from,
      toDate: to,
      limit: 10000,
    });

    // Calculate metrics
    const transfers = events.filter(e =>
      e.type === IndexedEventType.TRANSFER || e.type === IndexedEventType.FORCE_TRANSFER
    );
    const blockedTransfers = events.filter(e =>
      e.type === IndexedEventType.COMPLIANCE_VIOLATION
    );
    const kycEvents = events.filter(e =>
      e.type === IndexedEventType.KYC_VERIFIED
    );
    const freezeEvents = events.filter(e =>
      e.type === IndexedEventType.FREEZE_ACCOUNT
    );
    const violations = events.filter(e =>
      e.type === IndexedEventType.COMPLIANCE_VIOLATION
    );

    // Get top holders
    const balances = this.getAssetBalances(assetId);
    const topHolders = balances
      .filter(b => BigInt(b.balance) > 0)
      .sort((a, b) => {
        const aVal = BigInt(a.balance);
        const bVal = BigInt(b.balance);
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      })
      .slice(0, 10)
      .map(b => this.getHolderStats(assetId, b.holder)!)
      .filter(Boolean);

    // Violation breakdown
    const violationTypes = new Map<string, { count: number; lastOccurrence: string }>();
    for (const v of violations) {
      const type = (v.data.violationType as string) || 'UNKNOWN';
      const existing = violationTypes.get(type);
      if (!existing || new Date(v.timestamp) > new Date(existing.lastOccurrence)) {
        violationTypes.set(type, {
          count: (existing?.count || 0) + 1,
          lastOccurrence: v.timestamp,
        });
      }
    }

    const complianceRate = transfers.length > 0
      ? ((transfers.length - blockedTransfers.length) / transfers.length) * 100
      : 100;

    return {
      assetId,
      generatedAt: now,
      period: { from, to },
      summary: {
        totalTransfers: transfers.length,
        blockedTransfers: blockedTransfers.length,
        complianceRate,
        kycVerifications: kycEvents.length,
        frozenAccounts: freezeEvents.length,
        violations: violations.length,
      },
      jurisdictionBreakdown: [], // Would need jurisdiction data
      topHolders,
      violations: Array.from(violationTypes.entries()).map(([type, data]) => ({
        type,
        ...data,
      })),
      auditTrail: events.slice(0, 100),
    };
  }

  /**
   * Generate holder report
   */
  generateHolderReport(assetId: string): {
    assetId: string;
    generatedAt: string;
    totalHolders: number;
    holders: HolderStats[];
    distribution: {
      range: string;
      count: number;
      totalBalance: string;
    }[];
  } {
    const balances = this.getAssetBalances(assetId);
    const holders = balances
      .filter(b => BigInt(b.balance) > 0)
      .map(b => this.getHolderStats(assetId, b.holder)!)
      .filter(Boolean)
      .sort((a, b) => {
        const aVal = BigInt(a.balance);
        const bVal = BigInt(b.balance);
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      });

    // Distribution analysis
    const ranges = [
      { range: '0-1%', min: 0, max: 1 },
      { range: '1-5%', min: 1, max: 5 },
      { range: '5-10%', min: 5, max: 10 },
      { range: '10-25%', min: 10, max: 25 },
      { range: '25-50%', min: 25, max: 50 },
      { range: '50%+', min: 50, max: 100 },
    ];

    const distribution = ranges.map(r => {
      const matching = holders.filter(h =>
        h.percentOfSupply >= r.min && h.percentOfSupply < r.max
      );
      return {
        range: r.range,
        count: matching.length,
        totalBalance: matching.reduce(
          (sum, h) => (BigInt(sum) + BigInt(h.balance)).toString(),
          '0'
        ),
      };
    });

    return {
      assetId,
      generatedAt: new Date().toISOString(),
      totalHolders: holders.length,
      holders,
      distribution,
    };
  }

  /**
   * Export audit log
   */
  exportAuditLog(
    assetId: string,
    format: 'json' | 'csv' = 'json'
  ): string {
    const events = this.queryEvents({ assetId, limit: 100000 });

    if (format === 'csv') {
      const header = 'id,type,timestamp,actor,transactionHash,data\n';
      const rows = events.map(e =>
        `"${e.id}","${e.type}","${e.timestamp}","${e.actor}","${e.transactionHash || ''}","${JSON.stringify(e.data).replace(/"/g, '""')}"`
      ).join('\n');
      return header + rows;
    }

    return JSON.stringify(events, null, 2);
  }
}

// Export singleton instance
export const indexingEngine = new IndexingEngine();
