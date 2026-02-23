/**
 * API Event Store
 *
 * Implements IEventStore interface by delegating to the backend API.
 * Events are persisted to PostgreSQL via the server.
 */

import type { IEventStore, EventQueryOptions } from '../../core/interfaces.js';
import type { BaseEvent } from '../../core/types.js';
import type { ApiClient } from './ApiClient.js';

export interface ApiEventStoreConfig {
  apiClient: ApiClient;
  cacheEnabled?: boolean;
}

export class ApiEventStore implements IEventStore {
  private client: ApiClient;
  private cache: Map<string, BaseEvent> = new Map();
  private assetEventCache: Map<string, BaseEvent[]> = new Map();
  private cacheEnabled: boolean;

  constructor(config: ApiEventStoreConfig) {
    this.client = config.apiClient;
    this.cacheEnabled = config.cacheEnabled ?? true;
  }

  async append(event: BaseEvent): Promise<void> {
    // Send to API
    const savedEvent = await this.client.createEvent({
      type: event.type,
      assetId: event.assetId,
      payload: event.payload,
    });

    // Update cache
    if (this.cacheEnabled) {
      this.cache.set(savedEvent.id, savedEvent);

      // Update asset event cache
      const assetEvents = this.assetEventCache.get(event.assetId) || [];
      assetEvents.push(savedEvent);
      this.assetEventCache.set(event.assetId, assetEvents);
    }
  }

  async query(options?: EventQueryOptions): Promise<BaseEvent[]> {
    const response = await this.client.getEvents({
      assetId: options?.assetId,
      types: options?.types?.join(','),
      from: options?.fromTimestamp,
      to: options?.toTimestamp,
      limit: options?.limit,
      page: options?.offset ? Math.floor(options.offset / (options.limit || 50)) + 1 : 1,
    });

    // Update cache
    if (this.cacheEnabled) {
      for (const event of response.events) {
        this.cache.set(event.id, event);
      }
    }

    return response.events;
  }

  async getByAssetId(assetId: string): Promise<BaseEvent[]> {
    // Check cache first
    if (this.cacheEnabled && this.assetEventCache.has(assetId)) {
      return this.assetEventCache.get(assetId) || [];
    }

    const response = await this.client.getAssetEvents(assetId, { limit: 1000 });

    // Update cache
    if (this.cacheEnabled) {
      this.assetEventCache.set(assetId, response.events);
      for (const event of response.events) {
        this.cache.set(event.id, event);
      }
    }

    return response.events;
  }

  async getById(id: string): Promise<BaseEvent | null> {
    // Check cache first
    if (this.cacheEnabled && this.cache.has(id)) {
      return this.cache.get(id) ?? null;
    }

    try {
      const event = await this.client.getEvent(id);

      // Update cache
      if (this.cacheEnabled) {
        this.cache.set(id, event);
      }

      return event;
    } catch {
      return null;
    }
  }

  async getAll(): Promise<BaseEvent[]> {
    const response = await this.client.getEvents({ limit: 10000 });

    // Update cache
    if (this.cacheEnabled) {
      for (const event of response.events) {
        this.cache.set(event.id, event);
      }
    }

    return response.events;
  }

  async count(assetId?: string): Promise<number> {
    const response = await this.client.getEvents({
      assetId,
      limit: 1, // We only need the count
    });
    return response.total;
  }

  // Cache management
  clearCache(): void {
    this.cache.clear();
    this.assetEventCache.clear();
  }

  getCacheStats(): { eventCount: number; assetCount: number } {
    return {
      eventCount: this.cache.size,
      assetCount: this.assetEventCache.size,
    };
  }

  // Prefetch events for an asset (useful for UI)
  async prefetch(assetId: string): Promise<void> {
    await this.getByAssetId(assetId);
  }

  // Sync cache with server
  async sync(): Promise<void> {
    // Get latest events and update cache
    const response = await this.client.getEvents({
      limit: 100, // Get latest 100 events
    });

    for (const event of response.events) {
      this.cache.set(event.id, event);

      const assetEvents = this.assetEventCache.get(event.assetId) || [];
      if (!assetEvents.find(e => e.id === event.id)) {
        assetEvents.push(event);
        this.assetEventCache.set(event.assetId, assetEvents);
      }
    }
  }
}

export default ApiEventStore;
