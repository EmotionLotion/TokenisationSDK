/**
 * useErrorInterceptor - React hook wrapping the ErrorInterceptor
 *
 * Provides a convenient React interface for intercepting errors, tracking
 * error history, and managing error dismissals.
 *
 * @example
 * ```tsx
 * import { useErrorInterceptor } from '@tokenisation/sdk-react';
 *
 * function TransferButton() {
 *   const { intercept, lastError, clearErrors } = useErrorInterceptor();
 *
 *   const handleTransfer = async () => {
 *     try {
 *       await sendTransfer();
 *     } catch (err) {
 *       const handled = intercept(err);
 *       if (handled.severity === 'critical') {
 *         // show modal
 *       }
 *     }
 *   };
 *
 *   return (
 *     <>
 *       <button onClick={handleTransfer}>Transfer</button>
 *       {lastError && <p>{lastError.message}</p>}
 *     </>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ErrorInterceptor,
  type InterceptedError,
  type ErrorMapping,
} from '../utils/ErrorInterceptor.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of errors retained in the history buffer. */
const MAX_ERROR_HISTORY = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseErrorInterceptorReturn {
  /** Intercept an error, add it to history, and return the result. */
  intercept: (error: unknown) => InterceptedError;
  /** The most recently intercepted error, or null if none. */
  lastError: InterceptedError | null;
  /** Full error history (newest last), capped at 50 entries. */
  errors: InterceptedError[];
  /** Clear all errors and reset lastError to null. */
  clearErrors: () => void;
  /** Dismiss (remove) a specific error by its index in the errors array. */
  dismissError: (index: number) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * React hook that wraps {@link ErrorInterceptor} to provide stateful error
 * tracking inside React components.
 *
 * @param customMappings - Optional additional error mappings that take
 *   priority over the built-in registry.
 */
export function useErrorInterceptor(
  customMappings?: ErrorMapping[],
): UseErrorInterceptorReturn {
  // Stable interceptor instance across renders
  const interceptorRef = useRef<ErrorInterceptor | null>(null);

  if (interceptorRef.current === null) {
    interceptorRef.current = new ErrorInterceptor(customMappings);
  }

  // Error state
  const [errors, setErrors] = useState<InterceptedError[]>([]);
  const [lastError, setLastError] = useState<InterceptedError | null>(null);

  // ── intercept ────────────────────────────────────────────────────────
  const intercept = useCallback(
    (error: unknown): InterceptedError => {
      const result = interceptorRef.current!.intercept(error);

      setErrors((prev) => {
        const next = [...prev, result];
        // Cap history at MAX_ERROR_HISTORY
        if (next.length > MAX_ERROR_HISTORY) {
          return next.slice(next.length - MAX_ERROR_HISTORY);
        }
        return next;
      });

      setLastError(result);

      return result;
    },
    [],
  );

  // ── clearErrors ──────────────────────────────────────────────────────
  const clearErrors = useCallback(() => {
    setErrors([]);
    setLastError(null);
  }, []);

  // ── dismissError ─────────────────────────────────────────────────────
  const dismissError = useCallback((index: number) => {
    setErrors((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      next.splice(index, 1);
      return next;
    });

    // If the dismissed error was the last one, update lastError
    setLastError((prevLast) => {
      // We need the current errors list to decide, but since state updates
      // are batched we recalculate inside the setter.
      return prevLast; // will be corrected by the effect below
    });
  }, []);

  // Keep lastError in sync when errors change (e.g. after dismiss)
  useEffect(() => {
    if (errors.length === 0) {
      setLastError(null);
    } else {
      setLastError(errors[errors.length - 1]);
    }
  }, [errors]);

  return {
    intercept,
    lastError,
    errors,
    clearErrors,
    dismissError,
  };
}
