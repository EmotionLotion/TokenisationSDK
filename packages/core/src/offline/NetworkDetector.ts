/**
 * Network status detection with heartbeat support.
 *
 * Combines `navigator.onLine` with an active heartbeat ping to reliably
 * determine whether the application can reach the backend.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkStatus = 'online' | 'offline';
export type NetworkStatusCallback = (status: NetworkStatus) => void;

export interface NetworkDetectorOptions {
  /** URL to ping for heartbeat checks. */
  heartbeatUrl?: string;
  /** Interval between heartbeat pings in milliseconds. Default: 30 000. */
  heartbeatIntervalMs?: number;
  /** Number of consecutive heartbeat failures before marking offline. Default: 3. */
  failureThreshold?: number;
}

// ---------------------------------------------------------------------------
// NetworkDetector
// ---------------------------------------------------------------------------

export class NetworkDetector {
  private status: NetworkStatus;
  private listeners: Set<NetworkStatusCallback> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private consecutiveFailures = 0;
  private failureThreshold: number;
  private heartbeatUrl: string | null = null;
  private heartbeatIntervalMs: number;

  // Browser event handler references (needed for cleanup).
  private handleOnline: (() => void) | null = null;
  private handleOffline: (() => void) | null = null;

  constructor(options: NetworkDetectorOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30_000;

    // Initial status from navigator if available.
    this.status = this.detectInitialStatus();

    // Bind to browser online/offline events.
    if (typeof window !== 'undefined') {
      this.handleOnline = () => this.setStatus('online');
      this.handleOffline = () => this.setStatus('offline');
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Auto-start heartbeat if url provided in options.
    if (options.heartbeatUrl) {
      this.startHeartbeat(options.heartbeatUrl, options.heartbeatIntervalMs);
    }
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Current network status. */
  isOnline(): boolean {
    return this.status === 'online';
  }

  /** Register a callback fired whenever the status changes. Returns an unsubscribe function. */
  onStatusChange(callback: NetworkStatusCallback): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Start periodic heartbeat pings to the given URL.
   * Marks the network as offline after `failureThreshold` consecutive failures.
   */
  startHeartbeat(url: string, intervalMs?: number): void {
    this.stopHeartbeat();
    this.heartbeatUrl = url;
    this.heartbeatIntervalMs = intervalMs ?? this.heartbeatIntervalMs;
    this.consecutiveFailures = 0;

    // Perform an immediate check then schedule periodic ones.
    this.performHeartbeat();
    this.heartbeatTimer = setInterval(() => this.performHeartbeat(), this.heartbeatIntervalMs);
  }

  /** Stop heartbeat pinging. */
  stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatUrl = null;
  }

  /** Clean up all listeners and timers. */
  destroy(): void {
    this.stopHeartbeat();
    this.listeners.clear();

    if (typeof window !== 'undefined') {
      if (this.handleOnline) window.removeEventListener('online', this.handleOnline);
      if (this.handleOffline) window.removeEventListener('offline', this.handleOffline);
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private detectInitialStatus(): NetworkStatus {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine ? 'online' : 'offline';
    }
    // Default to online when detection is unavailable (e.g. Node.js).
    return 'online';
  }

  private setStatus(newStatus: NetworkStatus): void {
    if (newStatus === this.status) return;
    this.status = newStatus;

    // Reset failure count when explicitly going online.
    if (newStatus === 'online') {
      this.consecutiveFailures = 0;
    }

    for (const listener of this.listeners) {
      try {
        listener(newStatus);
      } catch {
        // Prevent listener errors from disrupting other listeners.
      }
    }
  }

  private async performHeartbeat(): Promise<void> {
    if (!this.heartbeatUrl) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(this.heartbeatUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.consecutiveFailures = 0;
        this.setStatus('online');
      } else {
        this.recordFailure();
      }
    } catch {
      this.recordFailure();
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.setStatus('offline');
    }
  }
}

export default NetworkDetector;
