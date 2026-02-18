/**
 * useAuthExpiring Hook - Session Expiry Watcher
 *
 * Monitors authentication session expiry with configurable warning buffer,
 * silent refresh capability, and expiry callbacks.
 *
 * @example
 * ```tsx
 * function SessionGuard({ children }: { children: React.ReactNode }) {
 *   const { isExpiring, isExpired, timeRemaining, refresh } = useAuthExpiring({
 *     warningBufferMs: 300000, // 5 min warning
 *     onExpiring: () => showToast('Session expiring soon'),
 *     onExpired: () => redirectToLogin(),
 *     onRefreshed: () => showToast('Session refreshed'),
 *   });
 *
 *   if (isExpired) return <LoginPage />;
 *
 *   return (
 *     <div>
 *       {isExpiring && (
 *         <banner>
 *           Session expiring in {Math.round((timeRemaining ?? 0) / 1000)}s
 *           <button onClick={refresh}>Extend Session</button>
 *         </banner>
 *       )}
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAuthExpiringOptions {
  /** Milliseconds before expiry to trigger warning. Default: 300000 (5 min) */
  warningBufferMs?: number;
  /** Check interval in milliseconds. Default: 30000 */
  checkIntervalMs?: number;
  /** Called once when session enters expiring state */
  onExpiring?: () => void;
  /** Called once when session has expired */
  onExpired?: () => void;
  /** Called after a successful silent refresh */
  onRefreshed?: () => void;
}

export interface UseAuthExpiringReturn {
  /** True when session is within warning buffer of expiry */
  isExpiring: boolean;
  /** True when session has expired */
  isExpired: boolean;
  /** Absolute expiry time */
  expiresAt: Date | null;
  /** Milliseconds remaining until expiry */
  timeRemaining: number | null;
  /** Manually trigger a session refresh */
  refresh: () => Promise<void>;
}

// ============================================================================
// HOOK
// ============================================================================

export function useAuthExpiring(
  options?: UseAuthExpiringOptions
): UseAuthExpiringReturn {
  const { config, wallet } = useTokenisation();

  const warningBufferMs = options?.warningBufferMs ?? 300000;
  const checkIntervalMs = options?.checkIntervalMs ?? 30000;

  const [isExpiring, setIsExpiring] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiringFiredRef = useRef(false);
  const expiredFiredRef = useRef(false);

  // Helper for API calls
  const apiCall = useCallback(
    async <T>(endpoint: string, opts?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(config.orgId ? { 'X-Org-Id': config.orgId } : {}),
        ...(wallet?.address ? { 'X-Wallet-Address': wallet.address } : {}),
      };

      const response = await fetch(`${config.apiUrl}${endpoint}`, {
        ...opts,
        headers: { ...headers, ...opts?.headers },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return response.json();
    },
    [config, wallet]
  );

  // Check session status
  const checkSession = useCallback(async () => {
    try {
      const result = await apiCall<{ expiresAt: string }>(
        '/api/v1/auth/session'
      );

      const expiry = new Date(result.expiresAt);
      setExpiresAt(expiry);

      const remaining = expiry.getTime() - Date.now();
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setIsExpired(true);
        setIsExpiring(false);
        if (!expiredFiredRef.current) {
          expiredFiredRef.current = true;
          options?.onExpired?.();
        }
      } else if (remaining <= warningBufferMs) {
        setIsExpiring(true);
        setIsExpired(false);
        if (!expiringFiredRef.current) {
          expiringFiredRef.current = true;
          options?.onExpiring?.();
        }
      } else {
        setIsExpiring(false);
        setIsExpired(false);
      }
    } catch {
      // If session check fails, treat as expired
      setIsExpired(true);
      setTimeRemaining(0);
      if (!expiredFiredRef.current) {
        expiredFiredRef.current = true;
        options?.onExpired?.();
      }
    }
  }, [apiCall, warningBufferMs, options]);

  // Refresh session
  const refresh = useCallback(async () => {
    try {
      const result = await apiCall<{ expiresAt: string }>(
        '/api/v1/auth/refresh',
        { method: 'POST' }
      );

      const expiry = new Date(result.expiresAt);
      setExpiresAt(expiry);
      setTimeRemaining(expiry.getTime() - Date.now());
      setIsExpiring(false);
      setIsExpired(false);

      // Reset callback guards so they can fire again for next cycle
      expiringFiredRef.current = false;
      expiredFiredRef.current = false;

      options?.onRefreshed?.();
    } catch {
      // Refresh failed — session check will handle state
    }
  }, [apiCall, options]);

  // Polling setup
  useEffect(() => {
    // Initial check
    checkSession();

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      checkSession();
    }, checkIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkIntervalMs, checkSession]);

  return {
    isExpiring,
    isExpired,
    expiresAt,
    timeRemaining,
    refresh,
  };
}
