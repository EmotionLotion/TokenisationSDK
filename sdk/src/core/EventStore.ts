/**
 * EventStore - In-memory append-only ledger
 *
 * Records all state changes for auditability and state reconstruction.
 * MVP implementation uses in-memory storage; production would use PostgreSQL.
 */

import { v4 as uuidv4 } from 'uuid';
import type { BaseEvent, EventType } from './types.js';
import type { IEventStore, EventQueryOptions } from './interfaces.js';

/**
 * In-memory implementation of the Event Store
 */
export class EventStore implements IEventStore {
  private events: Map<string, BaseEvent> = new Map();
  private eventsByAsset: Map<string, string[]> = new Map();

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
}
