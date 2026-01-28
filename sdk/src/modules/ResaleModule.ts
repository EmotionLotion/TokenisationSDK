/**
 * ResaleModule - Unified facade for ticket resale operations.
 *
 * Replaces the 4-step manual flow (requestTransfer → approveTransfer →
 * completeTransferKyc → payResaleFee) with a single `purchase()` call
 * that orchestrates the entire sequence server-side.
 *
 * Usage:
 *   const sdk = new ApiClient({ apiKey: 'sk_live_...' });
 *   const available = await sdk.resale.listAvailable();
 *   const result = await sdk.resale.purchase(ticketId, { buyerWallet, kycData, paymentDetails });
 */

import type { HttpClient } from '../utils/http.js';

// ============================================================================
// Types
// ============================================================================

export interface ResaleListParams {
  flightNumber?: string;
  departureAfter?: string;
  departureBefore?: string;
  maxPrice?: string;
  currency?: string;
  limit?: number;
  offset?: number;
}

export interface ResaleOffer {
  ticketId: string;
  flightNumber: string;
  airline: string;
  departureTime: string;
  arrivalTime: string;
  departureAirport: string;
  arrivalAirport: string;
  seat?: string;
  ticketClass?: string;
  price: string;
  currency: string;
  sellerWallet: string;
  offeredAt: string;
}

export interface ResalePurchaseInput {
  buyerWallet: string;
  buyerPassengerId?: string;
  kycData?: Record<string, unknown>;
  paymentDetails?: {
    txHash?: string;
    method?: string;
  };
  idempotencyKey?: string;
}

export interface ResalePurchaseResult {
  transferId: string;
  ticketId: string;
  status: string;
  fromWallet: string;
  toWallet: string;
  price: string;
  currency: string;
  txHash?: string;
}

export interface ResaleOfferInput {
  price: string;
  currency?: string;
}

// ============================================================================
// Module
// ============================================================================

export class ResaleModule {
  constructor(private http: HttpClient) {}

  /**
   * List tickets available for resale.
   */
  async listAvailable(params?: ResaleListParams): Promise<{ data: ResaleOffer[]; limit: number; offset: number }> {
    const queryString = params
      ? '?' + Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    const response = await this.http.get<{ data: ResaleOffer[]; limit: number; offset: number }>(
      `/api/v1/tickets/resale/available${queryString}`,
    );
    return response.data;
  }

  /**
   * Put a ticket up for resale.
   */
  async offerForResale(ticketId: string, input: ResaleOfferInput): Promise<{ data: ResaleOffer }> {
    const response = await this.http.post<{ data: ResaleOffer }>(
      `/api/v1/tickets/${ticketId}/resale/offer`,
      input,
    );
    return response.data;
  }

  /**
   * Single-call purchase: orchestrates transfer request + approval + KYC + fee payment.
   *
   * The server endpoint handles the 4-step flow atomically so the SDK
   * consumer only needs one call.
   */
  async purchase(ticketId: string, input: ResalePurchaseInput): Promise<{ data: ResalePurchaseResult }> {
    const response = await this.http.post<{ data: ResalePurchaseResult }>(
      `/api/v1/tickets/${ticketId}/resale/purchase`,
      input,
    );
    return response.data;
  }

  /**
   * Cancel an active resale offer.
   */
  async cancelOffer(ticketId: string): Promise<{ data: { success: boolean } }> {
    const response = await this.http.post<{ data: { success: boolean } }>(
      `/api/v1/tickets/${ticketId}/resale/cancel`,
      {},
    );
    return response.data;
  }
}
