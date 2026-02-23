/**
 * TicketsClient - Stripe-like API client for airline ticket lifecycle management.
 *
 * Provides high-level methods that call the server ticket API endpoints.
 * Handles validation, idempotency, and response formatting.
 *
 * Usage:
 *   const sdk = new ApiClient({ apiKey: 'sk_live_...' });
 *   const ticket = await sdk.tickets.issue({ flightNumber: 'EK123', ... });
 *   await sdk.tickets.checkIn(ticket.id);
 *   await sdk.tickets.board(ticket.id);
 *   await sdk.tickets.completeAndBurn(ticket.id);
 */

import type { HttpClient } from '../utils/http.js';

// ============================================================================
// Types
// ============================================================================

export type TicketStatus =
  | 'ISSUED' | 'CONFIRMED' | 'CHECKED_IN' | 'BOARDED'
  | 'COMPLETED' | 'CANCELLED' | 'REFUNDED' | 'EXPIRED'
  | 'BURNED' | 'VOID';

export type TicketClass = 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';

export interface Ticket {
  id: string;
  orgId: string;
  tokenId?: string;
  chainTokenId?: string;
  contractAddress?: string;
  chainId?: number;
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  departureAirport: string;
  arrivalAirport: string;
  gate?: string;
  seat?: string;
  ticketClass: TicketClass;
  passengerId?: string;
  passengerWallet?: string;
  passengerName?: string;
  eTicketNumber: string;
  bookingReference: string;
  status: TicketStatus;
  issuedAt: string;
  checkedInAt?: string;
  boardedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  burnedAt?: string;
  transferable: boolean;
  maxTransfers: number;
  transferCount: number;
  pricePaid?: string;
  currency?: string;
  metadataVersion: number;
  metadataUri?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface IssueTicketInput {
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  departureAirport: string;
  arrivalAirport: string;
  gate?: string;
  seat?: string;
  ticketClass?: TicketClass;
  passengerId?: string;
  passengerWallet?: string;
  passengerName?: string;
  eTicketNumber?: string;
  bookingReference?: string;
  transferable?: boolean;
  maxTransfers?: number;
  pricePaid?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferTicketInput {
  toWallet: string;
  toPassengerId?: string;
  idempotencyKey: string;
  kycRequired?: boolean;
  resaleFee?: string;
  resaleFeeCurrency?: string;
  metadata?: Record<string, unknown>;
}

export interface TicketTransferRequest {
  id: string;
  orgId: string;
  ticketId: string;
  fromWallet: string;
  toWallet: string;
  status: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  kycRequired: boolean;
  kycCompleted: boolean;
  resaleFee?: string;
  resaleFeePaid: boolean;
  idempotencyKey: string;
  txHash?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: string;
  orgId: string;
  ticketId: string;
  eventType: string;
  actor: string;
  actorRole: string;
  previousState?: string;
  newState?: string;
  details: Record<string, unknown>;
  correlationId: string;
  txHash?: string;
  createdAt: string;
}

export interface MetadataVersion {
  id: string;
  ticketId: string;
  version: number;
  field: string;
  oldValue?: string;
  newValue: string;
  changedBy: string;
  changeReason?: string;
  createdAt: string;
}

export interface UpdateMetadataInput {
  field: 'gate' | 'seat' | 'ticketClass' | 'departureTime' | 'arrivalTime' | 'metadataUri';
  newValue: string;
  changeReason?: string;
  changedBy?: string;
}

export interface ReconciliationReport {
  flightNumber: string;
  departureDate: string;
  totalTickets: number;
  statusBreakdown: Record<string, number>;
  totalRevenue: number;
  currency: string;
  totalTransfers: number;
  boarded: number;
  completed: number;
  noShow: number;
  cancelled: number;
  refunded: number;
}

export interface ListTicketsParams {
  flightNumber?: string;
  status?: TicketStatus;
  passengerId?: string;
  limit?: number;
  offset?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  limit: number;
  offset: number;
}

// ============================================================================
// TicketsClient Module
// ============================================================================

export class TicketsClient {
  constructor(private http: HttpClient) {}

  // ============================================================================
  // CRUD
  // ============================================================================

  /** Issue a new airline ticket */
  async issue(input: IssueTicketInput): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>('/api/v1/tickets', input);
    return response.data.data;
  }

  /** Get a ticket by ID */
  async get(id: string): Promise<Ticket> {
    const response = await this.http.get<{ data: Ticket }>(`/api/v1/tickets/${id}`);
    return response.data.data;
  }

  /** List tickets with optional filters */
  async list(params?: ListTicketsParams): Promise<PaginatedResponse<Ticket>> {
    const response = await this.http.get<PaginatedResponse<Ticket>>(
      '/api/v1/tickets',
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /** Check in passenger */
  async checkIn(ticketId: string, actor?: string): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/check-in`, { actor });
    return response.data.data;
  }

  /** Board passenger */
  async board(ticketId: string, actor?: string): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/board`, { actor });
    return response.data.data;
  }

  /** Complete flight (and optionally burn ticket) */
  async complete(ticketId: string, options?: { burn?: boolean; actor?: string }): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/complete`, {
      burn: options?.burn !== false,
      actor: options?.actor,
    });
    return response.data.data;
  }

  /** Cancel ticket */
  async cancel(ticketId: string, reason?: string, actor?: string): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/cancel`, { reason, actor });
    return response.data.data;
  }

  /** Refund cancelled ticket */
  async refund(ticketId: string, actor?: string): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/refund`, { actor });
    return response.data.data;
  }

  /** Freeze ticket for fraud investigation */
  async freeze(ticketId: string, reason: string, actor?: string): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/freeze`, { reason, actor });
    return response.data.data;
  }

  /** Unfreeze ticket */
  async unfreeze(ticketId: string, actor?: string): Promise<Ticket> {
    const response = await this.http.post<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/unfreeze`, { actor });
    return response.data.data;
  }

  // ============================================================================
  // Transfers
  // ============================================================================

  /** Request a ticket transfer (resale) */
  async requestTransfer(ticketId: string, input: TransferTicketInput): Promise<TicketTransferRequest> {
    const response = await this.http.post<{ data: TicketTransferRequest }>(`/api/v1/tickets/${ticketId}/transfer`, input);
    return response.data.data;
  }

  /** Approve a transfer request */
  async approveTransfer(transferId: string, approvedBy?: string): Promise<TicketTransferRequest> {
    const response = await this.http.post<{ data: TicketTransferRequest }>(`/api/v1/tickets/transfers/${transferId}/approve`, { approvedBy });
    return response.data.data;
  }

  /** Reject a transfer request */
  async rejectTransfer(transferId: string, reason: string, rejectedBy?: string): Promise<TicketTransferRequest> {
    const response = await this.http.post<{ data: TicketTransferRequest }>(`/api/v1/tickets/transfers/${transferId}/reject`, { reason, rejectedBy });
    return response.data.data;
  }

  /** Complete KYC for a transfer */
  async completeTransferKyc(transferId: string): Promise<TicketTransferRequest> {
    const response = await this.http.post<{ data: TicketTransferRequest }>(`/api/v1/tickets/transfers/${transferId}/complete-kyc`);
    return response.data.data;
  }

  /** Pay resale fee for a transfer */
  async payResaleFee(transferId: string, txHash?: string): Promise<{ success: boolean }> {
    const response = await this.http.post<{ success: boolean }>(`/api/v1/tickets/transfers/${transferId}/pay-fee`, { txHash });
    return response.data;
  }

  /** Get transfer history for a ticket */
  async getTransferHistory(ticketId: string): Promise<TicketTransferRequest[]> {
    const response = await this.http.get<{ data: TicketTransferRequest[] }>(`/api/v1/tickets/${ticketId}/transfers`);
    return response.data.data;
  }

  // ============================================================================
  // Metadata Updates
  // ============================================================================

  /** Update ticket metadata (gate change, seat upgrade, flight delay) */
  async updateMetadata(ticketId: string, input: UpdateMetadataInput): Promise<Ticket> {
    const response = await this.http.patch<{ data: Ticket }>(`/api/v1/tickets/${ticketId}/metadata`, input);
    return response.data.data;
  }

  /** Get metadata change history */
  async getMetadataHistory(ticketId: string): Promise<MetadataVersion[]> {
    const response = await this.http.get<{ data: MetadataVersion[] }>(`/api/v1/tickets/${ticketId}/metadata-history`);
    return response.data.data;
  }

  // ============================================================================
  // Audit & Events
  // ============================================================================

  /** Get all events for a ticket */
  async getEvents(ticketId: string): Promise<TicketEvent[]> {
    const response = await this.http.get<{ data: TicketEvent[] }>(`/api/v1/tickets/${ticketId}/events`);
    return response.data.data;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /** Bulk update ticket statuses */
  async bulkUpdateStatus(input: {
    ticketIds: string[];
    newStatus: 'CANCELLED' | 'EXPIRED' | 'VOID';
    reason?: string;
    actor?: string;
  }): Promise<Array<{ ticketId: string; success: boolean; error?: string }>> {
    const response = await this.http.post<{
      data: Array<{ ticketId: string; success: boolean; error?: string }>;
    }>('/api/v1/tickets/bulk/update-status', input);
    return response.data.data;
  }

  /** Cancel all tickets for a flight */
  async cancelFlight(flightNumber: string, reason: string, departureDate?: string, actor?: string): Promise<{
    cancelled: number;
    results: Array<{ ticketId: string; success: boolean; error?: string }>;
  }> {
    const response = await this.http.post<{
      data: { cancelled: number; results: Array<{ ticketId: string; success: boolean; error?: string }> };
    }>(`/api/v1/tickets/flights/${flightNumber}/cancel`, { reason, departureDate, actor });
    return response.data.data;
  }

  // ============================================================================
  // Reconciliation
  // ============================================================================

  /** Get reconciliation report for a flight */
  async getReconciliation(flightNumber: string, departureDate?: string): Promise<ReconciliationReport> {
    const params = departureDate ? `?departureDate=${departureDate}` : '';
    const response = await this.http.get<{ data: ReconciliationReport }>(`/api/v1/tickets/flights/${flightNumber}/reconciliation${params}`);
    return response.data.data;
  }

  // ============================================================================
  // Automation
  // ============================================================================

  /** Trigger auto-expiry of stale tickets */
  async expireStaleTickets(): Promise<Array<{ ticketId: string; success: boolean; error?: string }>> {
    const response = await this.http.post<{
      data: Array<{ ticketId: string; success: boolean; error?: string }>;
    }>('/api/v1/tickets/automation/expire-stale');
    return response.data.data;
  }

  // ============================================================================
  // Real-time Subscriptions
  // ============================================================================

  /**
   * Subscribe to real-time ticket events via Server-Sent Events.
   *
   * Returns an object with an `on()` method for event handling and
   * a `close()` method to terminate the connection.
   *
   * Usage:
   * ```ts
   * const stream = sdk.tickets.subscribe('ticket-id');
   * stream.on('ticket.expired', (data) => console.log('Expired!', data));
   * stream.on('status', (data) => console.log('Initial status', data));
   * stream.on('error', (err) => console.error(err));
   * // Later:
   * stream.close();
   * ```
   */
  subscribe(ticketId: string): TicketEventStream {
    const baseUrl = (this.http as any).config?.baseUrl || '';
    const apiKey = (this.http as any).config?.apiKey || '';
    const url = `${baseUrl}/api/v1/tickets/${ticketId}/stream`;

    const listeners = new Map<string, Array<(data: unknown) => void>>();
    let closed = false;
    let eventSource: EventSource | null = null;

    // Use native EventSource (browser) or polyfill (Node)
    try {
      const ES = typeof EventSource !== 'undefined'
        ? EventSource
        : (globalThis as any).EventSource;

      if (!ES) {
        throw new Error(
          'EventSource not available. In Node.js, install the "eventsource" package and assign it to globalThis.EventSource.'
        );
      }

      eventSource = new ES(url, {
        // Note: Authorization via query param or cookie may be needed for
        // native EventSource since it doesn't support custom headers.
        // The SSE endpoint accepts the same API key auth via query param.
      } as EventSourceInit);

      const handleEvent = (type: string) => (e: MessageEvent) => {
        if (closed) return;
        try {
          const data = JSON.parse(e.data);
          const handlers = listeners.get(type) || [];
          for (const handler of handlers) {
            handler(data);
          }
          // Also fire wildcard handlers
          const wildcardHandlers = listeners.get('*') || [];
          for (const handler of wildcardHandlers) {
            handler({ type, data });
          }
        } catch {
          // Ignore parse errors
        }
      };

      // Listen for named event types from the SSE stream
      const eventTypes = [
        'status',
        'ticket.expired',
        'ticket.burned',
        'ticket.checked_in',
        'ticket.boarded',
        'ticket.completed',
        'ticket.cancelled',
        'ticket.gate_changed',
        'ticket.issued',
      ];

      for (const type of eventTypes) {
        eventSource!.addEventListener(type, handleEvent(type));
      }

      eventSource!.onerror = () => {
        const errorHandlers = listeners.get('error') || [];
        for (const handler of errorHandlers) {
          handler(new Error('SSE connection error'));
        }
      };
    } catch (err) {
      // Defer error to listeners
      setTimeout(() => {
        const errorHandlers = listeners.get('error') || [];
        for (const handler of errorHandlers) {
          handler(err);
        }
      }, 0);
    }

    return {
      on(event: string, handler: (data: any) => void) {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event)!.push(handler);
        return this;
      },
      close() {
        closed = true;
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      },
    };
  }

  /**
   * Polling fallback: periodically fetches the ticket and fires a callback
   * when the status changes. Returns a `stop()` function.
   *
   * Usage:
   * ```ts
   * const stop = sdk.tickets.watchStatus('ticket-id', {
   *   interval: 5000,
   *   onChange: (ticket, previousStatus) => {
   *     console.log(`Status changed: ${previousStatus} -> ${ticket.status}`);
   *   },
   * });
   * // Later:
   * stop();
   * ```
   */
  watchStatus(
    ticketId: string,
    options: WatchStatusOptions,
  ): () => void {
    const { interval = 5000, onChange, onError } = options;
    let lastStatus: TicketStatus | null = null;
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const ticket = await this.get(ticketId);
        if (lastStatus !== null && ticket.status !== lastStatus) {
          onChange(ticket, lastStatus);
        }
        lastStatus = ticket.status;
      } catch (error) {
        if (onError) {
          onError(error as Error);
        }
      }

      if (!stopped) {
        setTimeout(poll, interval);
      }
    };

    poll();

    return () => {
      stopped = true;
    };
  }
}

// ============================================================================
// Real-time subscription types
// ============================================================================

export interface TicketEventStream {
  /** Register a handler for a specific event type, or '*' for all events */
  on(event: string, handler: (data: any) => void): TicketEventStream;
  /** Close the SSE connection */
  close(): void;
}

export interface WatchStatusOptions {
  /** Polling interval in ms (default: 5000) */
  interval?: number;
  /** Called when the ticket status changes */
  onChange: (ticket: Ticket, previousStatus: TicketStatus) => void;
  /** Called on fetch error */
  onError?: (error: Error) => void;
}
