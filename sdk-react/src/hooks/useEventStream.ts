/**
 * useEventStream - React hook for real-time event streaming via SSE.
 *
 * Automatically connects to the server's SSE endpoint when the SDK is
 * initialized and disconnects on unmount. Provides live events, connection
 * status, and error state.
 *
 * @example
 * ```tsx
 * function TransferFeed() {
 *   const { events, isConnected } = useEventStream({
 *     eventTypes: ['transfer.created', 'transfer.settled'],
 *   });
 *
 *   return (
 *     <ul>
 *       {events.map(e => <li key={e.eventId}>{e.eventType}</li>)}
 *     </ul>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTokenisation } from '../context/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EventStreamFilters {
  /** Filter to events for a specific asset / aggregate ID */
  assetId?: string;
  /** Filter to a specific aggregate type (e.g. 'transfer', 'token') */
  aggregateType?: string;
  /** Filter to specific event type strings (e.g. ['transfer.created']) */
  eventTypes?: string[];
  /** Topic patterns for SSE subscription (e.g. ['transfer.*', 'token.*']) */
  topics?: string[];
}

export interface StreamEvent {
  id: string;
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sequence: number;
  createdAt: string | null;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface UseEventStreamReturn {
  /** All received events (newest last). Capped at `maxEvents`. */
  events: StreamEvent[];
  /** Most recently received event */
  lastEvent: StreamEvent | null;
  /** Whether the SSE connection is open */
  isConnected: boolean;
  /** Alias: whether the SSE connection is open */
  connected: boolean;
  /** Current connection status */
  status: ConnectionStatus;
  /** Last connection error, if any */
  error: Error | null;
  /** Manually clear the events buffer */
  clearEvents: () => void;
  /** Manually trigger a reconnect */
  reconnect: () => void;
}

export interface UseEventStreamOptions extends EventStreamFilters {
  /** Maximum number of events to keep in the buffer (default: 100) */
  maxEvents?: number;
  /** Disable auto-connect (default: false) */
  disabled?: boolean;
  /** Override API URL (otherwise taken from SDK context) */
  apiUrl?: string;
  /** Override API key (otherwise taken from SDK context) */
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_EVENTS = 100;
const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 45_000; // If no heartbeat/event for 45s, reconnect

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEventStream(options?: UseEventStreamOptions): UseEventStreamReturn {
  const { config, isInitialized } = useTokenisation();

  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastEventIdRef = useRef<string | null>(null);
  const manualReconnectRef = useRef(false);

  const maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
  const disabled = options?.disabled ?? false;
  const apiUrl = options?.apiUrl ?? config.apiUrl;
  const apiKey = options?.apiKey;

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastEvent(null);
  }, []);

  // Stable reference to options for the effect
  const filtersRef = useRef(options);
  filtersRef.current = options;

  // Reconnect function exposed to consumers
  const reconnect = useCallback(() => {
    manualReconnectRef.current = true;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    // Reset attempts for manual reconnect
    reconnectAttemptsRef.current = 0;
    setError(null);

    // Trigger re-connect by toggling status; the effect will pick it up
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    if (!isInitialized || disabled || !apiUrl) {
      return;
    }

    // Handle manual reconnect trigger
    if (status === 'disconnected' && !manualReconnectRef.current) {
      // Initial mount - proceed to connect
    } else if (status === 'disconnected' && manualReconnectRef.current) {
      manualReconnectRef.current = false;
      // Fall through to connect
    }

    let mounted = true;

    function buildUrl(): string {
      const base = `${apiUrl}/api/v1/events/stream`;
      const params = new URLSearchParams();

      const f = filtersRef.current;
      if (f?.assetId) params.set('assetId', f.assetId);
      if (f?.aggregateType) params.set('aggregateType', f.aggregateType);
      if (f?.eventTypes?.length) params.set('types', f.eventTypes.join(','));
      if (f?.topics?.length) params.set('topics', f.topics.join(','));
      if (config.orgId) params.set('orgId', config.orgId);

      // Pass API key as query param for EventSource (no custom headers support)
      const key = filtersRef.current?.apiKey ?? apiKey;
      if (key) params.set('apiKey', key);

      const qs = params.toString();
      return qs ? `${base}?${qs}` : base;
    }

    function resetHeartbeatTimer() {
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setTimeout(() => {
        // No activity for too long - force reconnect
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        scheduleReconnect();
      }, HEARTBEAT_TIMEOUT_MS);
    }

    function connect() {
      if (!mounted) return;

      const url = buildUrl();
      setStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
      setError(null);

      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!mounted) return;
        reconnectAttemptsRef.current = 0;
        setStatus('connected');
        resetHeartbeatTimer();
      };

      es.onmessage = (messageEvent) => {
        if (!mounted) return;
        resetHeartbeatTimer();

        try {
          const data = JSON.parse(messageEvent.data) as StreamEvent;

          if (messageEvent.lastEventId) {
            lastEventIdRef.current = messageEvent.lastEventId;
          } else if (data.eventId) {
            lastEventIdRef.current = data.eventId;
          }

          // Client-side topic filtering for extra specificity
          const f = filtersRef.current;
          if (f?.eventTypes?.length) {
            const matches = f.eventTypes.some((pattern) => {
              if (pattern === '*') return true;
              if (pattern.includes('*')) {
                const prefix = pattern.split('*')[0];
                return data.eventType.startsWith(prefix);
              }
              return data.eventType === pattern;
            });
            if (!matches) return;
          }

          setLastEvent(data);
          setEvents((prev) => {
            const next = [...prev, data];
            return next.length > maxEvents ? next.slice(-maxEvents) : next;
          });
        } catch {
          // Ignore non-JSON (heartbeat comments)
        }
      };

      es.onerror = () => {
        if (!mounted) return;
        es.close();
        eventSourceRef.current = null;
        setError(new Error('SSE connection lost'));
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (!mounted) return;

      reconnectAttemptsRef.current++;
      setStatus('reconnecting');

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
      const delay = Math.min(
        RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current - 1),
        MAX_RECONNECT_DELAY_MS,
      );

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    }

    connect();

    return () => {
      mounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      setStatus('disconnected');
    };
  }, [isInitialized, disabled, apiUrl, apiKey, config.orgId, maxEvents, status]);

  return {
    events,
    lastEvent,
    isConnected: status === 'connected',
    connected: status === 'connected',
    status,
    error,
    clearEvents,
    reconnect,
  };
}
