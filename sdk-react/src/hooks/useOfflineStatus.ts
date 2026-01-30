/**
 * React hook that exposes offline/online status, pending queue count,
 * sync progress and last sync timestamp.
 *
 * Integrates with `NetworkDetector` and `SyncManager` from the SDK.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { NetworkDetector } from '@tokenisation/sdk/client';
import type { SyncManager, SyncProgress, SyncStatus } from '@tokenisation/sdk/client';
import type { OfflineQueue } from '@tokenisation/sdk/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfflineStatusResult {
  /** Whether the application currently has network connectivity. */
  isOnline: boolean;
  /** Number of operations waiting in the offline queue. */
  pendingCount: number;
  /** Whether a sync replay is currently in progress. */
  isSyncing: boolean;
  /** Granular sync progress (only meaningful while `isSyncing` is true). */
  syncProgress: SyncProgress;
  /** Timestamp of the last completed sync, or null if no sync has occurred. */
  lastSyncAt: Date | null;
}

export interface UseOfflineStatusOptions {
  networkDetector: NetworkDetector;
  syncManager: SyncManager;
  queue: OfflineQueue;
  /** How often (ms) to poll the queue size. Default: 5000. */
  pollIntervalMs?: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const INITIAL_PROGRESS: SyncProgress = {
  total: 0,
  completed: 0,
  failed: 0,
  remaining: 0,
};

export function useOfflineStatus(options: UseOfflineStatusOptions): OfflineStatusResult {
  const { networkDetector, syncManager, queue, pollIntervalMs = 5_000 } = options;

  const [isOnline, setIsOnline] = useState<boolean>(() => networkDetector.isOnline());
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(INITIAL_PROGRESS);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Keep a ref to avoid stale closures in the poll interval.
  const queueRef = useRef(queue);
  queueRef.current = queue;

  // -----------------------------------------------------------------------
  // Network status listener
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = networkDetector.onStatusChange((status) => {
      setIsOnline(status === 'online');
    });
    return unsubscribe;
  }, [networkDetector]);

  // -----------------------------------------------------------------------
  // Sync progress listener
  // -----------------------------------------------------------------------
  useEffect(() => {
    const unsubProgress = syncManager.onProgress((progress) => {
      setSyncProgress(progress);
    });

    const unsubStatus = syncManager.onStatusChange((status: SyncStatus) => {
      const syncing = status === 'syncing';
      setIsSyncing(syncing);

      if (!syncing) {
        // Sync just finished – update lastSyncAt and refresh pending count.
        const { lastSyncAt: syncedAt } = syncManager.getSyncStatus();
        setLastSyncAt(syncedAt);
        refreshPendingCount();
      }
    });

    return () => {
      unsubProgress();
      unsubStatus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncManager]);

  // -----------------------------------------------------------------------
  // Queue size polling
  // -----------------------------------------------------------------------
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await queueRef.current.size();
      setPendingCount(count);
    } catch {
      // Swallow – best effort.
    }
  }, []);

  useEffect(() => {
    // Initial count.
    refreshPendingCount();

    const timer = setInterval(refreshPendingCount, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, refreshPendingCount]);

  // -----------------------------------------------------------------------
  // Return value
  // -----------------------------------------------------------------------
  return {
    isOnline,
    pendingCount,
    isSyncing,
    syncProgress,
    lastSyncAt,
  };
}

export default useOfflineStatus;
