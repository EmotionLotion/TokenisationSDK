/**
 * useSecondaryMarket - React hook for P2P secondary market.
 * Replaces the airline-scoped useResale hook.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

export interface SecondaryListing {
  id: string;
  assetId: string;
  sellerId: string;
  sellerWallet: string;
  tokenAmount: number;
  pricePerToken: number;
  currency: string;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt?: string;
}

export interface UseSecondaryMarketReturn {
  listings: SecondaryListing[];
  createListing: (input: { tokenAmount: number; pricePerToken: number; currency?: string; sellerWallet: string }) => Promise<SecondaryListing>;
  purchase: (listingId: string, buyerWallet: string) => Promise<unknown>;
  cancelListing: (listingId: string) => Promise<{ success: boolean }>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useSecondaryMarket(assetId?: string): UseSecondaryMarketReturn {
  const { api: httpClient } = useTokenisation();
  const [listings, setListings] = useState<SecondaryListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!assetId || !httpClient) return;
    let cancelled = false;
    setLoading(true);

    httpClient.get(`/api/v1/assets/${assetId}/listings`)
      .then((response: any) => { if (!cancelled) setListings(response.data.data || []); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err : new Error(String(err))); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [assetId, httpClient, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const createListing = useCallback(async (input: { tokenAmount: number; pricePerToken: number; currency?: string; sellerWallet: string }) => {
    if (!httpClient || !assetId) throw new Error('Not connected');
    const response = await httpClient.post(`/api/v1/assets/${assetId}/listings`, input);
    const listing = (response as any).data.data;
    refresh();
    return listing;
  }, [httpClient, assetId, refresh]);

  const purchase = useCallback(async (listingId: string, buyerWallet: string) => {
    if (!httpClient) throw new Error('Not connected');
    const response = await httpClient.post(`/api/v1/listings/${listingId}/purchase`, { buyerWallet });
    refresh();
    return (response as any).data.data;
  }, [httpClient, refresh]);

  const cancelListing = useCallback(async (listingId: string) => {
    if (!httpClient) throw new Error('Not connected');
    const response = await httpClient.post(`/api/v1/listings/${listingId}/cancel`, {});
    refresh();
    return (response as any).data.data;
  }, [httpClient, refresh]);

  return { listings, createListing, purchase, cancelListing, loading, error, refresh };
}
