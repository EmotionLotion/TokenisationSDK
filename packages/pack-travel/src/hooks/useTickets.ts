/**
 * useTickets - Hook for airline ticket operations via TicketsClient.
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '@tokenisation/sdk-react';

// ============================================================================
// Types
// ============================================================================

export interface TicketData {
  id: string;
  flightNumber: string;
  passenger: string;
  seat?: string;
  class: string;
  status: string;
  departureTime: string;
  arrivalTime: string;
  [key: string]: unknown;
}

export interface BoardingPassData {
  ticketId: string;
  gate?: string;
  boardingGroup?: string;
  qrCode?: string;
  [key: string]: unknown;
}

export interface UseTicketsReturn {
  issueTicket: (params: { flightNumber: string; passenger: string; class?: string; seat?: string; metadata?: Record<string, unknown> }) => Promise<TicketData>;
  getTicket: (ticketId: string) => Promise<TicketData | null>;
  listTickets: (params?: { flightNumber?: string; status?: string; limit?: number }) => Promise<TicketData[]>;
  checkIn: (ticketId: string) => Promise<TicketData>;
  board: (ticketId: string) => Promise<TicketData>;
  getFlightStatus: (flightNumber: string) => Promise<{ status: string; gate?: string; delay?: number }>;
  getBoardingPass: (ticketId: string) => Promise<BoardingPassData>;
  loading: boolean;
  error: Error | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useTickets(): UseTicketsReturn {
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

  const issueTicket = useCallback(
    (params: { flightNumber: string; passenger: string; class?: string; seat?: string; metadata?: Record<string, unknown> }) =>
      wrapAsync(async () => {
        const result = await modules.tickets.issue(params as any);
        return (result as any).data;
      }),
    [modules.tickets, wrapAsync],
  );

  const getTicket = useCallback(
    (ticketId: string) =>
      wrapAsync(async () => {
        const result = await modules.tickets.get(ticketId);
        return (result as any).data ?? null;
      }),
    [modules.tickets, wrapAsync],
  );

  const listTickets = useCallback(
    (params?: { flightNumber?: string; status?: string; limit?: number }) =>
      wrapAsync(async () => {
        const result = await modules.tickets.list(params as any);
        return (result as any).data ?? [];
      }),
    [modules.tickets, wrapAsync],
  );

  const checkIn = useCallback(
    (ticketId: string) =>
      wrapAsync(async () => {
        const result = await modules.tickets.checkIn(ticketId);
        return (result as any).data;
      }),
    [modules.tickets, wrapAsync],
  );

  const board = useCallback(
    (ticketId: string) =>
      wrapAsync(async () => {
        const result = await modules.tickets.board(ticketId);
        return (result as any).data;
      }),
    [modules.tickets, wrapAsync],
  );

  const getFlightStatus = useCallback(
    (flightNumber: string) =>
      wrapAsync(async () => {
        const result = await (modules.tickets as any).getFlightStatus(flightNumber);
        return (result as any).data;
      }),
    [modules.tickets, wrapAsync],
  );

  const getBoardingPass = useCallback(
    (ticketId: string) =>
      wrapAsync(async () => {
        const result = await (modules.tickets as any).getBoardingPass(ticketId);
        return (result as any).data;
      }),
    [modules.tickets, wrapAsync],
  );

  return {
    issueTicket, getTicket, listTickets, checkIn, board,
    getFlightStatus, getBoardingPass,
    loading, error,
  };
}
