/**
 * useExitWindow - React hook for exit window management.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

export interface ExitWindow {
  id: string;
  assetId: string;
  opensAt: string;
  closesAt: string;
  status: 'scheduled' | 'open' | 'closed';
  maxRedemptionPercent: number;
  totalRedeemed: number;
  totalRequested: number;
}

export interface ExitWindowSchedule {
  id: string;
  assetId: string;
  frequency: string;
  windowDurationDays: number;
  maxRedemptionPercent: number;
  noticePeriodDays: number;
  nextWindowOpens: string;
  active: boolean;
}

export interface UseExitWindowReturn {
  schedule: ExitWindowSchedule | null;
  currentWindow: ExitWindow | null;
  nextWindow: ExitWindow | null;
  windows: ExitWindow[];
  requestRedemption: (investorId: string, amount: number) => Promise<unknown>;
  loading: boolean;
  error: Error | null;
}

export function useExitWindow(assetId?: string): UseExitWindowReturn {
  const { api: httpClient } = useTokenisation();
  const [schedule, setSchedule] = useState<ExitWindowSchedule | null>(null);
  const [currentWindow, setCurrentWindow] = useState<ExitWindow | null>(null);
  const [nextWindow, setNextWindow] = useState<ExitWindow | null>(null);
  const [windows, setWindows] = useState<ExitWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!assetId || !httpClient) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      httpClient.get(`/api/v1/assets/${assetId}/exit-schedule`).catch(() => ({ data: { data: null } })),
      httpClient.get(`/api/v1/assets/${assetId}/exit-windows`).catch(() => ({ data: { data: [] } })),
      httpClient.get(`/api/v1/assets/${assetId}/exit-windows/current`).catch(() => ({ data: { data: null } })),
      httpClient.get(`/api/v1/assets/${assetId}/exit-windows/next`).catch(() => ({ data: { data: null } })),
    ]).then(([schedRes, winRes, curRes, nextRes]) => {
      if (cancelled) return;
      setSchedule((schedRes as any).data.data);
      setWindows((winRes as any).data.data || []);
      setCurrentWindow((curRes as any).data.data);
      setNextWindow((nextRes as any).data.data);
    }).catch(err => {
      if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [assetId, httpClient]);

  const requestRedemption = useCallback(async (investorId: string, amount: number) => {
    if (!httpClient || !assetId) throw new Error('Not connected');
    const response = await httpClient.post(`/api/v1/assets/${assetId}/exit-windows/redeem`, { investorId, amount });
    return (response as any).data.data;
  }, [httpClient, assetId]);

  return { schedule, currentWindow, nextWindow, windows, requestRedemption, loading, error };
}
