
import { v4 as uuidv4 } from 'uuid';
import { IEventStore, EventQueryOptions } from '../core/interfaces.js';
import { BaseEvent, EventType } from '../core/types.js';
import type { BrowserStorage } from '../types/common.types.js';

declare const localStorage: BrowserStorage | undefined;

/**
 * BrowserEventStore
 * 
 * Persistent EventStore using localStorage.
 * Critical for the LifecycleEngine to rebuild state after page reload.
 */
export class BrowserEventStore implements IEventStore {
    private events: Map<string, BaseEvent> = new Map();
    private eventsByAsset: Map<string, string[]> = new Map();
    private storageKey: string;

    constructor(storageKey: string = 'ahoy_events_ledger') {
        this.storageKey = storageKey;
        this.loadFromStorage();
    }

    private loadFromStorage() {
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (raw) {
                const events = JSON.parse(raw) as BaseEvent[];
                // Re-hydrate maps
                events.forEach(e => {
                    this.events.set(e.id, e);
                    const assetEvents = this.eventsByAsset.get(e.assetId) || [];
                    assetEvents.push(e.id);
                    this.eventsByAsset.set(e.assetId, assetEvents);
                });
                console.log(`[BrowserEventStore] Hydrated ${events.length} events from storage.`);
            }
        } catch (e) {
            console.error('[BrowserEventStore] Failed to load events', e);
        }
    }

    private saveToStorage() {
        if (typeof localStorage === 'undefined') return;
        try {
            const allEvents = Array.from(this.events.values()).sort(
                (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
            localStorage.setItem(this.storageKey, JSON.stringify(allEvents));
        } catch (e) {
            console.error('[BrowserEventStore] Failed to save events (quota exceeded?)', e);
        }
    }

    async append(event: BaseEvent): Promise<void> {
        const eventWithId: BaseEvent = {
            ...event,
            id: event.id || uuidv4(),
        };

        this.events.set(eventWithId.id, eventWithId);

        const assetEvents = this.eventsByAsset.get(eventWithId.assetId) || [];
        assetEvents.push(eventWithId.id);
        this.eventsByAsset.set(eventWithId.assetId, assetEvents);

        // Persist
        this.saveToStorage();
    }

    async query(options: EventQueryOptions): Promise<BaseEvent[]> {
        let results: BaseEvent[] = [];

        if (options.assetId) {
            const assetEventIds = this.eventsByAsset.get(options.assetId) || [];
            results = assetEventIds
                .map((id) => this.events.get(id))
                .filter((e): e is BaseEvent => e !== undefined);
        } else {
            results = Array.from(this.events.values());
        }

        // Filter by types
        if (options.types && options.types.length > 0) {
            results = results.filter((e) => options.types!.includes(e.type));
        }

        // Sort
        results.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        return results;
    }

    async getByAssetId(assetId: string): Promise<BaseEvent[]> {
        return this.query({ assetId });
    }

    async getById(eventId: string): Promise<BaseEvent | null> {
        return this.events.get(eventId) || null;
    }

    async getAll(): Promise<BaseEvent[]> {
        return Array.from(this.events.values()).sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    }

    async count(): Promise<number> {
        return this.events.size;
    }
}
