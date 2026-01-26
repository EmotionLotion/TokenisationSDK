/**
 * EventStore - In-memory append-only ledger
 *
 * Records all state changes for auditability and state reconstruction.
 * MVP implementation uses in-memory storage; production would use PostgreSQL.
 *
 * Also stores DecisionReceipts for compliance audit trail.
 */

import { v4 as uuidv4 } from 'uuid';
import type { BaseEvent, EventType } from './types.js';
import type { IEventStore, EventQueryOptions } from './interfaces.js';

/**
 * DecisionReceipt storage interface
 */
export interface StoredReceipt {
  id: string;
  decisionId: string;
  action: string;
  result: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  issuedAt: string;
  subjectType: 'asset' | 'party' | 'transfer';
  subjectId: string;
  actorId: string;
  summary: string;
  reasons: string[];
  decisionHash: string;
  policyHash: string;
  policyVersion: string;
  signature: string;
  previousReceiptHash?: string;
}

/**
 * Receipt query options
 */
export interface ReceiptQueryOptions {
  assetId?: string;
  actorId?: string;
  result?: 'ALLOW' | 'DENY' | 'CONDITIONAL';
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
  offset?: number;
}

/**
 * In-memory implementation of the Event Store
 */
export class EventStore implements IEventStore {
  private events: Map<string, BaseEvent> = new Map();
  private eventsByAsset: Map<string, string[]> = new Map();

  // Receipt storage
  private receipts: Map<string, StoredReceipt> = new Map();
  private receiptsByAsset: Map<string, string[]> = new Map();
  private receiptsByActor: Map<string, string[]> = new Map();

  /**
   * Append an event to the store
   */
  async append(event: BaseEvent): Promise<void> {
    // Ensure event has an ID
    const eventWithId: BaseEvent = {
      ...event,
      id: event.id || uuidv4(),
    };

    // Store the event
    this.events.set(eventWithId.id, eventWithId);

    // Index by asset ID
    const assetEvents = this.eventsByAsset.get(eventWithId.assetId) || [];
    assetEvents.push(eventWithId.id);
    this.eventsByAsset.set(eventWithId.assetId, assetEvents);
  }

  /**
   * Query events with filters
   */
  async query(options: EventQueryOptions): Promise<BaseEvent[]> {
    let results: BaseEvent[] = [];

    // If filtering by asset ID, start with that index
    if (options.assetId) {
      const assetEventIds = this.eventsByAsset.get(options.assetId) || [];
      results = assetEventIds
        .map((id) => this.events.get(id))
        .filter((e): e is BaseEvent => e !== undefined);
    } else {
      results = Array.from(this.events.values());
    }

    // Filter by event types
    if (options.types && options.types.length > 0) {
      results = results.filter((e) => options.types!.includes(e.type));
    }

    // Filter by timestamp range
    if (options.fromTimestamp) {
      const fromDate = new Date(options.fromTimestamp).getTime();
      results = results.filter(
        (e) => new Date(e.timestamp).getTime() >= fromDate
      );
    }

    if (options.toTimestamp) {
      const toDate = new Date(options.toTimestamp).getTime();
      results = results.filter(
        (e) => new Date(e.timestamp).getTime() <= toDate
      );
    }

    // Sort by timestamp
    results.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Apply offset
    if (options.offset && options.offset > 0) {
      results = results.slice(options.offset);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get all events for an asset
   */
  async getByAssetId(assetId: string): Promise<BaseEvent[]> {
    return this.query({ assetId });
  }

  /**
   * Get event by ID
   */
  async getById(eventId: string): Promise<BaseEvent | null> {
    return this.events.get(eventId) || null;
  }

  /**
   * Get all events
   */
  async getAll(): Promise<BaseEvent[]> {
    return Array.from(this.events.values()).sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  /**
   * Get total event count
   */
  async count(): Promise<number> {
    return this.events.size;
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events.clear();
    this.eventsByAsset.clear();
    this.receipts.clear();
    this.receiptsByAsset.clear();
    this.receiptsByActor.clear();
  }

  /**
   * Create a state change event helper
   */
  static createStateChangeEvent(params: {
    assetId: string;
    actorId: string;
    type: EventType;
    payload: Record<string, unknown>;
  }): BaseEvent {
    return {
      id: uuidv4(),
      type: params.type,
      assetId: params.assetId,
      timestamp: new Date().toISOString(),
      actorId: params.actorId,
      payload: params.payload,
      eventVersion: 1,
    };
  }

  // ============================================================================
  // RECEIPT STORAGE METHODS
  // ============================================================================

  /**
   * Store a decision receipt
   */
  async storeReceipt(receipt: StoredReceipt): Promise<void> {
    this.receipts.set(receipt.id, receipt);

    // Index by asset
    if (receipt.subjectType === 'asset' || receipt.subjectType === 'transfer') {
      const assetReceipts = this.receiptsByAsset.get(receipt.subjectId) || [];
      assetReceipts.push(receipt.id);
      this.receiptsByAsset.set(receipt.subjectId, assetReceipts);
    }

    // Index by actor
    const actorReceipts = this.receiptsByActor.get(receipt.actorId) || [];
    actorReceipts.push(receipt.id);
    this.receiptsByActor.set(receipt.actorId, actorReceipts);
  }

  /**
   * Get a receipt by ID
   */
  async getReceipt(receiptId: string): Promise<StoredReceipt | null> {
    return this.receipts.get(receiptId) || null;
  }

  /**
   * Query receipts with filters
   */
  async queryReceipts(options: ReceiptQueryOptions): Promise<StoredReceipt[]> {
    let results: StoredReceipt[] = [];

    // Start with asset or actor index if available
    if (options.assetId) {
      const receiptIds = this.receiptsByAsset.get(options.assetId) || [];
      results = receiptIds
        .map((id) => this.receipts.get(id))
        .filter((r): r is StoredReceipt => r !== undefined);
    } else if (options.actorId) {
      const receiptIds = this.receiptsByActor.get(options.actorId) || [];
      results = receiptIds
        .map((id) => this.receipts.get(id))
        .filter((r): r is StoredReceipt => r !== undefined);
    } else {
      results = Array.from(this.receipts.values());
    }

    // Filter by result
    if (options.result) {
      results = results.filter((r) => r.result === options.result);
    }

    // Filter by timestamp range
    if (options.fromTimestamp) {
      const fromDate = new Date(options.fromTimestamp).getTime();
      results = results.filter(
        (r) => new Date(r.issuedAt).getTime() >= fromDate
      );
    }

    if (options.toTimestamp) {
      const toDate = new Date(options.toTimestamp).getTime();
      results = results.filter(
        (r) => new Date(r.issuedAt).getTime() <= toDate
      );
    }

    // Sort by timestamp (newest first)
    results.sort(
      (a, b) =>
        new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
    );

    // Apply offset
    if (options.offset && options.offset > 0) {
      results = results.slice(options.offset);
    }

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get receipts for an asset
   */
  async getReceiptsByAsset(assetId: string): Promise<StoredReceipt[]> {
    return this.queryReceipts({ assetId });
  }

  /**
   * Get receipts for an actor
   */
  async getReceiptsByActor(actorId: string): Promise<StoredReceipt[]> {
    return this.queryReceipts({ actorId });
  }

  /**
   * Get all receipts
   */
  async getAllReceipts(): Promise<StoredReceipt[]> {
    return Array.from(this.receipts.values()).sort(
      (a, b) =>
        new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
    );
  }

  /**
   * Get receipt count
   */
  async receiptCount(): Promise<number> {
    return this.receipts.size;
  }
}
