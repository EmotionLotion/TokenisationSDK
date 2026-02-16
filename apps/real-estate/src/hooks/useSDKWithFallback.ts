import { useState, useEffect, useCallback, useRef } from 'react';

export interface SDKWithFallbackResult<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** true when data comes from the live SDK, false when using mock fallback */
  isLive: boolean;
  /** Re-fetch from the SDK */
  refresh: () => void;
}

/**
 * Generic hook that tries an async SDK call and falls back to mock data on failure.
 *
 * @param sdkCall - Async function that fetches from the SDK. Return `null` for "no data".
 * @param fallback - Static mock data to use when the SDK call fails or returns null/undefined.
 * @param deps - Dependency array that triggers re-fetch (like useEffect deps).
 */
export function useSDKWithFallback<T>(
  sdkCall: () => Promise<T | null | undefined>,
  fallback: T,
  deps: unknown[] = [],
): SDKWithFallbackResult<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isLive, setIsLive] = useState(false);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sdkCall();
      if (!mountedRef.current) return;
      if (result != null) {
        setData(result);
        setIsLive(true);
      } else {
        setData(fallback);
        setIsLive(false);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setData(fallback);
      setIsLive(false);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  return { data, loading, error, isLive, refresh: fetchData };
}

/**
 * Simpler variant for mutations — wraps an async SDK call with fallback simulation.
 *
 * @param sdkMutation - The real SDK mutation function.
 * @param mockSimulation - Fallback that simulates the mutation (e.g. setTimeout).
 * @returns A wrapped function that tries SDK first, then falls back.
 */
export function useSDKMutationWithFallback<TArgs extends unknown[], TResult>(
  sdkMutation: (...args: TArgs) => Promise<TResult>,
  mockSimulation: (...args: TArgs) => Promise<TResult>,
): {
  execute: (...args: TArgs) => Promise<{ result: TResult; isLive: boolean }>;
  loading: boolean;
  error: Error | null;
} {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(
    async (...args: TArgs) => {
      setLoading(true);
      setError(null);
      try {
        const result = await sdkMutation(...args);
        setLoading(false);
        return { result, isLive: true };
      } catch (sdkErr) {
        try {
          const result = await mockSimulation(...args);
          setLoading(false);
          return { result, isLive: false };
        } catch (mockErr) {
          const err = mockErr instanceof Error ? mockErr : new Error(String(mockErr));
          setError(err);
          setLoading(false);
          throw err;
        }
      }
    },
    [sdkMutation, mockSimulation],
  );

  return { execute, loading, error };
}
