/**
 * Coordinates replaying queued offline operations when connectivity is restored.
 *
 * Works in tandem with `OfflineQueue` (for storage) and `NetworkDetector`
 * (for knowing when to start syncing).
 */

import type { OfflineQueue, QueuedOperation } from './OfflineQueue.js';
import type { NetworkDetector } from './NetworkDetector.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncProgress {
  /** Total operations that were in the queue when sync started. */
  total: number;
  /** Successfully replayed operations. */
  completed: number;
  /** Operations that failed during this sync pass. */
  failed: number;
  /** Remaining operations (total - completed - failed). */
  remaining: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type SyncProgressCallback = (progress: SyncProgress) => void;
export type SyncStatusCallback = (status: SyncStatus) => void;

export interface HttpClient {
  request(options: {
    method: string;
    url: string;
    body?: string;
    headers: Record<string, string>;
  }): Promise<{ status: number; data?: unknown }>;
}

export interface SyncManagerOptions {
  queue: OfflineQueue;
  networkDetector: NetworkDetector;
  httpClient: HttpClient;
  /** Maximum number of retries per operation before skipping. Default: 3. */
  maxRetries?: number;
  /** Delay in ms between individual operation replays. Default: 200. */
  replayDelayMs?: number;
}

// ---------------------------------------------------------------------------
// SyncManager
// ---------------------------------------------------------------------------

export class SyncManager {
  private queue: OfflineQueue;
  private networkDetector: NetworkDetector;
  private httpClient: HttpClient;
  private maxRetries: number;
  private replayDelayMs: number;

  private status: SyncStatus = 'idle';
  private progress: SyncProgress = { total: 0, completed: 0, failed: 0, remaining: 0 };
  private lastSyncAt: Date | null = null;

  private progressListeners: Set<SyncProgressCallback> = new Set();
  private statusListeners: Set<SyncStatusCallback> = new Set();

  private unsubscribeNetwork: (() => void) | null = null;
  private syncing = false;

  constructor(options: SyncManagerOptions) {
    this.queue = options.queue;
    this.networkDetector = options.networkDetector;
    this.httpClient = options.httpClient;
    this.maxRetries = options.maxRetries ?? 3;
    this.replayDelayMs = options.replayDelayMs ?? 200;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Start listening for network changes and auto-sync when online. */
  startSync(): void {
    if (this.unsubscribeNetwork) return; // already started

    this.unsubscribeNetwork = this.networkDetector.onStatusChange(async (status) => {
      if (status === 'online') {
        await this.replay();
      }
    });

    // If already online, trigger an immediate sync.
    if (this.networkDetector.isOnline()) {
      this.replay().catch(() => {
        // Swallow – errors are tracked via progress.
      });
    }
  }

  /** Stop listening for network changes. Does not abort an in-progress sync. */
  stopSync(): void {
    if (this.unsubscribeNetwork) {
      this.unsubscribeNetwork();
      this.unsubscribeNetwork = null;
    }
  }

  /** Get current sync status. */
  getSyncStatus(): { status: SyncStatus; progress: SyncProgress; lastSyncAt: Date | null } {
    return {
      status: this.status,
      progress: { ...this.progress },
      lastSyncAt: this.lastSyncAt,
    };
  }

  /** Register a callback for progress updates. Returns unsubscribe function. */
  onProgress(callback: SyncProgressCallback): () => void {
    this.progressListeners.add(callback);
    return () => {
      this.progressListeners.delete(callback);
    };
  }

  /** Register a callback for status changes. Returns unsubscribe function. */
  onStatusChange(callback: SyncStatusCallback): () => void {
    this.statusListeners.add(callback);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  /** Manually trigger a sync replay. */
  async replay(): Promise<SyncProgress> {
    if (this.syncing) {
      return { ...this.progress };
    }

    this.syncing = true;
    this.setStatus('syncing');

    const operations = await this.queue.getAll();
    this.progress = {
      total: operations.length,
      completed: 0,
      failed: 0,
      remaining: operations.length,
    };
    this.emitProgress();

    for (const op of operations) {
      // Check if still online before each operation.
      if (!this.networkDetector.isOnline()) {
        // Stop replaying – the rest stay queued.
        break;
      }

      const success = await this.replayOperation(op);

      if (success) {
        await this.queue.remove(op.id);
        this.progress.completed += 1;
      } else {
        this.progress.failed += 1;
        // Leave it in the queue for next sync pass but increment retry.
        await this.queue.incrementRetry(op.id);
      }

      this.progress.remaining = this.progress.total - this.progress.completed - this.progress.failed;
      this.emitProgress();

      // Small delay to avoid overwhelming the server.
      if (this.replayDelayMs > 0) {
        await delay(this.replayDelayMs);
      }
    }

    this.lastSyncAt = new Date();
    this.setStatus(this.progress.failed > 0 ? 'error' : 'idle');
    this.syncing = false;

    return { ...this.progress };
  }

  /** Clean up all listeners. */
  destroy(): void {
    this.stopSync();
    this.progressListeners.clear();
    this.statusListeners.clear();
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async replayOperation(op: QueuedOperation): Promise<boolean> {
    if (op.retryCount >= this.maxRetries) {
      // Exceeded max retries – treat as permanent failure, skip.
      return false;
    }

    try {
      const headers: Record<string, string> = {
        ...op.headers,
        'Idempotency-Key': op.idempotencyKey,
      };

      const response = await this.httpClient.request({
        method: op.method,
        url: op.url,
        body: op.body,
        headers,
      });

      // 2xx = success, 409 = idempotency conflict (already applied) = treat as success
      return response.status >= 200 && response.status < 300 || response.status === 409;
    } catch {
      return false;
    }
  }

  private setStatus(newStatus: SyncStatus): void {
    if (newStatus === this.status) return;
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch {
        // Swallow
      }
    }
  }

  private emitProgress(): void {
    const snapshot = { ...this.progress };
    for (const listener of this.progressListeners) {
      try {
        listener(snapshot);
      } catch {
        // Swallow
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default SyncManager;
