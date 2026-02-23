/**
 * CrossPackEventBus
 *
 * In-memory event bus enabling cross-pack event-driven workflows.
 * Supports publish/subscribe with filtering by source, type, and correlationId.
 */

import { v4 as uuidv4 } from 'uuid';

export interface CrossPackEvent {
  id: string;
  source: string;
  type: string;
  resourceId: string;
  occurredAt: string;
  data: Record<string, unknown>;
  correlationId?: string;
}

export interface CrossPackEventFilter {
  source?: string | string[];
  type?: string | string[];
  correlationId?: string;
}

export type CrossPackEventHandler = (event: CrossPackEvent) => void | Promise<void>;

export interface CrossPackSubscription {
  id: string;
  filter: CrossPackEventFilter;
  handler: CrossPackEventHandler;
}

export interface ICrossPackEventBus {
  publish(event: Omit<CrossPackEvent, 'id' | 'occurredAt'> & { id?: string; occurredAt?: string }): void;
  subscribe(filter: CrossPackEventFilter, handler: CrossPackEventHandler): string;
  unsubscribe(id: string): void;
  getEvents(filter?: CrossPackEventFilter): CrossPackEvent[];
  getCorrelatedEvents(correlationId: string): CrossPackEvent[];
  clear(): void;
}

export class CrossPackEventBus implements ICrossPackEventBus {
  private events: CrossPackEvent[] = [];
  private subscriptions: Map<string, CrossPackSubscription> = new Map();

  publish(event: Omit<CrossPackEvent, 'id' | 'occurredAt'> & { id?: string; occurredAt?: string }): void {
    const fullEvent: CrossPackEvent = {
      id: event.id ?? uuidv4(),
      occurredAt: event.occurredAt ?? new Date().toISOString(),
      source: event.source,
      type: event.type,
      resourceId: event.resourceId,
      data: event.data,
      correlationId: event.correlationId,
    };

    this.events.push(fullEvent);

    for (const sub of this.subscriptions.values()) {
      if (this.matchesFilter(fullEvent, sub.filter)) {
        try {
          sub.handler(fullEvent);
        } catch {
          // Fire-and-forget: swallow handler errors
        }
      }
    }
  }

  subscribe(filter: CrossPackEventFilter, handler: CrossPackEventHandler): string {
    const id = uuidv4();
    this.subscriptions.set(id, { id, filter, handler });
    return id;
  }

  unsubscribe(id: string): void {
    this.subscriptions.delete(id);
  }

  getEvents(filter?: CrossPackEventFilter): CrossPackEvent[] {
    if (!filter) return [...this.events];
    return this.events.filter(e => this.matchesFilter(e, filter));
  }

  getCorrelatedEvents(correlationId: string): CrossPackEvent[] {
    return this.events.filter(e => e.correlationId === correlationId);
  }

  clear(): void {
    this.events = [];
    this.subscriptions.clear();
  }

  private matchesFilter(event: CrossPackEvent, filter: CrossPackEventFilter): boolean {
    if (filter.source !== undefined) {
      if (!this.matchesStringOrArray(event.source, filter.source)) return false;
    }
    if (filter.type !== undefined) {
      if (!this.matchesStringOrArray(event.type, filter.type)) return false;
    }
    if (filter.correlationId !== undefined) {
      if (event.correlationId !== filter.correlationId) return false;
    }
    return true;
  }

  private matchesStringOrArray(value: string, pattern: string | string[]): boolean {
    if (Array.isArray(pattern)) {
      return pattern.includes(value);
    }
    return value === pattern;
  }
}
