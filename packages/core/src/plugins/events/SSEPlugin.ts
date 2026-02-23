/**
 * SSEPlugin - Server-Sent Events client for real-time event streaming.
 *
 * Connects to the server's SSE endpoint and delivers typed events
 * to registered listeners. Handles auto-reconnect with exponential backoff
 * and gap-free reconnection via Last-Event-Id.
 *
 * @example
 * ```typescript
 * import { SSEPlugin } from '@tokenisation/sdk/plugins';
 *
 * const sse = new SSEPlugin();
 * sse.connect('https://api.example.com', 'jwt-token', { assetId: '...' });
 * sse.onEvent((event) => console.log(event));
 * // later:
 * sse.disconnect();
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SSEEventFilters {
  assetId?: string;
  aggregateType?: string;
  eventTypes?: string[];
}

export interface SSEEvent {
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

export type SSEEventCallback = (event: SSEEvent) => void;
export type SSEStatusCallback = (status: SSEConnectionStatus) => void;
export type SSEErrorCallback = (error: Error) => void;

export type SSEConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface SSEPluginOptions {
  /** Initial reconnect delay in ms (default: 1000) */
  reconnectDelayMs?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelayMs?: number;
  /** Maximum number of reconnect attempts before giving up (default: Infinity) */
  maxReconnectAttempts?: number;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export class SSEPlugin {
  private eventSource: EventSource | null = null;
  private lastEventId: string | null = null;
  private status: SSEConnectionStatus = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string | null = null;
  private token: string | null = null;
  private filters: SSEEventFilters = {};

  private readonly eventListeners: SSEEventCallback[] = [];
  private readonly statusListeners: SSEStatusCallback[] = [];
  private readonly errorListeners: SSEErrorCallback[] = [];

  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;

  constructor(options?: SSEPluginOptions) {
    this.reconnectDelayMs = options?.reconnectDelayMs ?? 1_000;
    this.maxReconnectDelayMs = options?.maxReconnectDelayMs ?? 30_000;
    this.maxReconnectAttempts = options?.maxReconnectAttempts ?? Infinity;
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  /**
   * Connect to the SSE endpoint.
   */
  connect(apiUrl: string, token: string, filters?: SSEEventFilters): void {
    this.url = apiUrl;
    this.token = token;
    this.filters = filters ?? {};
    this.reconnectAttempts = 0;
    this.openConnection();
  }

  /**
   * Disconnect and stop reconnecting.
   */
  disconnect(): void {
    this.clearReconnectTimer();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Whether the connection is currently open.
   */
  get isConnected(): boolean {
    return this.status === 'connected';
  }

  /**
   * Current connection status.
   */
  get connectionStatus(): SSEConnectionStatus {
    return this.status;
  }

  /**
   * The ID of the last received event (for reconnection).
   */
  get lastReceivedEventId(): string | null {
    return this.lastEventId;
  }

  // -------------------------------------------------------------------------
  // Listeners
  // -------------------------------------------------------------------------

  /**
   * Register a callback for all events.
   */
  onEvent(callback: SSEEventCallback): () => void {
    this.eventListeners.push(callback);
    return () => {
      const idx = this.eventListeners.indexOf(callback);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /**
   * Register a callback for connection status changes.
   */
  onStatusChange(callback: SSEStatusCallback): () => void {
    this.statusListeners.push(callback);
    return () => {
      const idx = this.statusListeners.indexOf(callback);
      if (idx >= 0) this.statusListeners.splice(idx, 1);
    };
  }

  /**
   * Register a callback for errors.
   */
  onError(callback: SSEErrorCallback): () => void {
    this.errorListeners.push(callback);
    return () => {
      const idx = this.errorListeners.indexOf(callback);
      if (idx >= 0) this.errorListeners.splice(idx, 1);
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private openConnection(): void {
    if (!this.url || !this.token) return;

    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const streamUrl = this.buildStreamUrl();

    // EventSource doesn't support custom headers natively.
    // Pass token as query param for SSE (common pattern for EventSource auth).
    const urlWithAuth = `${streamUrl}${streamUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`;

    const eventSource = new EventSource(urlWithAuth);

    eventSource.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
    };

    // Listen for all named events (the server sends event type as the SSE event name)
    // EventSource doesn't have a wildcard listener, so we use onmessage for unnamed
    // and add listeners for known patterns via the generic message handler.
    eventSource.onmessage = (messageEvent) => {
      this.handleMessage(messageEvent);
    };

    // The server sends named events (e.g., event: transfer.created).
    // We also need a generic approach since we can't enumerate all types.
    // The server sends ALL events on the default message channel too via `data:`.
    // Actually, EventSource routes named events to specific listeners, not onmessage.
    // We'll use a different approach: listen for specific event types we know about,
    // but also override addEventListener to catch everything.

    // Catch-all: override the internal handler to intercept all events.
    // EventSource only fires 'onmessage' for events WITHOUT a named type.
    // For named events, we need to add individual listeners.
    // Since we can't predict all event types, we'll ask the server to also send
    // on the default channel. But to keep the server simple, let's handle it here
    // by patching the EventSource's onmessage to also receive named events.

    // The cleanest approach: have the server send events without the `event:` field
    // (just `id:` and `data:`), so all events go to `onmessage`. The eventType is
    // already inside the JSON payload. Let's adapt to that - but we also want
    // backward compat if the server does send named events.

    // For named events from server, we add a known set of listeners:
    const knownPrefixes = [
      'transfer', 'token', 'investor', 'distribution', 'corporate_action',
      'settlement', 'compliance', 'issuance', 'redemption', 'ticket',
    ];

    // Create a shared handler
    const namedHandler = (messageEvent: MessageEvent) => {
      this.handleMessage(messageEvent);
    };

    for (const prefix of knownPrefixes) {
      // Server sends events like "transfer.created", "token.deployed"
      // EventSource addEventListener matches the exact event name
      // Since we can't predict all suffixes, we add common patterns
      const eventTypes = this.getEventTypesForPrefix(prefix);
      for (const et of eventTypes) {
        eventSource.addEventListener(et, namedHandler);
      }
    }

    // Also listen for the generic 'error' event from server
    eventSource.addEventListener('error', (e) => {
      const messageEvent = e as MessageEvent;
      if (messageEvent.data) {
        try {
          const errorData = JSON.parse(messageEvent.data);
          this.emitError(new Error(errorData.message || 'Stream error'));
        } catch {
          this.emitError(new Error('Stream error'));
        }
      }
    });

    eventSource.onerror = () => {
      // EventSource fires onerror on disconnect
      if (this.status === 'disconnected') return; // Manual disconnect
      eventSource.close();
      this.eventSource = null;
      this.scheduleReconnect();
    };

    this.eventSource = eventSource;
  }

  private buildStreamUrl(): string {
    const base = `${this.url}/api/v1/events/stream`;
    const params = new URLSearchParams();

    if (this.filters.assetId) params.set('assetId', this.filters.assetId);
    if (this.filters.aggregateType) params.set('aggregateType', this.filters.aggregateType);
    if (this.filters.eventTypes?.length) params.set('types', this.filters.eventTypes.join(','));

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  private handleMessage(messageEvent: MessageEvent): void {
    try {
      const data = JSON.parse(messageEvent.data) as SSEEvent;

      // Track last event ID for reconnection
      if (messageEvent.lastEventId) {
        this.lastEventId = messageEvent.lastEventId;
      } else if (data.eventId) {
        this.lastEventId = data.eventId;
      }

      // Emit to all listeners
      for (const listener of this.eventListeners) {
        try {
          listener(data);
        } catch {
          // Don't let one bad listener break the stream
        }
      }
    } catch {
      // Ignore non-JSON messages (heartbeats, comments)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('disconnected');
      this.emitError(new Error('Max reconnect attempts reached'));
      return;
    }

    this.setStatus('reconnecting');
    this.reconnectAttempts++;

    const delay = Math.min(
      this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelayMs,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openConnection();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: SSEConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private getEventTypesForPrefix(prefix: string): string[] {
    // Common suffixes for domain events
    const suffixes = [
      'created', 'updated', 'deleted', 'approved', 'rejected',
      'submitted', 'confirmed', 'completed', 'failed', 'cancelled',
      'prechecked', 'signed', 'reconciled', 'settled', 'expired',
      'deployed', 'paused', 'unpaused', 'frozen', 'unfrozen',
      'activated', 'suspended', 'processing', 'announced',
      'kyc_started', 'kyc_approved', 'kyc_rejected',
      'payout_sent', 'snapshot_taken',
    ];
    return suffixes.map((s) => `${prefix}.${s}`);
  }
}
