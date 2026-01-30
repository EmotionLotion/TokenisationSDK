/**
 * useResale - Hook for ticket resale operations via ResaleModule.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';

// ============================================================================
// Types
// ============================================================================

export interface ResaleListing {
  id: string;
  ticketId: string;
  seller: string;
  price: string;
  currency: string;
  status: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface UseResaleReturn {
  listForSale: (params: { ticketId: string; price: string; currency?: string }) => Promise<ResaleListing>;
  getListings: (params?: { ticketId?: string; status?: string; limit?: number }) => Promise<ResaleListing[]>;
  buyTicket: (listingId: string) => Promise<{ success: boolean; ticketId?: string; txHash?: string }>;
  cancelListing: (listingId: string) => Promise<void>;
  getResaleHistory: (ticketId: string) => Promise<ResaleListing[]>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useResale(): UseResaleReturn {
  const { modules } = useTokenisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const listForSale = useCallback(
    (params: { ticketId: string; price: string; currency?: string }) =>
      wrapAsync(async () => {
        const result = await modules.resale.offerForResale(params.ticketId, { price: params.price, currency: params.currency });
        return (result as any).data;
      }),
    [modules.resale, wrapAsync],
  );

  const getListings = useCallback(
    (params?: { ticketId?: string; status?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.resale.listAvailable(params as any);
        return (result as any).data ?? [];
      }),
    [modules.resale, wrapAsync],
  );

  const buyTicket = useCallback(
    (listingId: string) =>
      wrapAsync(async () => {
        const result = await modules.resale.purchase(listingId, {} as any);
        return (result as any).data;
      }),
    [modules.resale, wrapAsync],
  );

  const cancelListing = useCallback(
    (listingId: string) =>
      wrapAsync(async () => {
        await modules.resale.cancelOffer(listingId);
      }),
    [modules.resale, wrapAsync],
  );

  const getResaleHistory = useCallback(
    (ticketId: string) =>
      wrapAsync(async () => {
        const result = await modules.resale.listAvailable({ flightNumber: ticketId } as any);
        return (result as any).data ?? [];
      }),
    [modules.resale, wrapAsync],
  );

  return {
    listForSale, getListings, buyTicket, cancelListing, getResaleHistory,
    loading, error,
  };
}
