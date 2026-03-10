/**
 * ComputeSecondaryMarketModule - P2P secondary market for compute tokens.
 *
 * Enables token holders to list and trade fractional ownership
 * of GPU compute infrastructure on a secondary market.
 *
 * Server routes mounted at /api/v1/compute/listings.
 */

import type { HttpClient } from '@tokenisation/core';
import { parseOrThrow, createComputeListingInputSchema } from '../validation/compute.js';

// ============================================================================
// Types
// ============================================================================

export interface ComputeListing {
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

export interface ComputePurchaseResult {
  listingId: string;
  transferId: string;
  buyerWallet: string;
  sellerWallet: string;
  tokenAmount: number;
  totalPrice: number;
  currency: string;
  platformFee: number;
  status: string;
}

// ============================================================================
// Module
// ============================================================================

export class ComputeSecondaryMarketModule {
  constructor(private http: HttpClient) {}

  /**
   * List active listings for an asset.
   */
  async listListings(assetId: string, params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ComputeListing[]> {
    const response = await this.http.get<{ data: ComputeListing[] }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/listings`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.data;
  }

  /**
   * Create a new listing for compute tokens.
   */
  async createListing(assetId: string, input: {
    tokenAmount: number;
    pricePerToken: number;
    sellerWallet: string;
    currency?: string;
    expiresAt?: string;
  }): Promise<ComputeListing> {
    const validated = parseOrThrow(createComputeListingInputSchema, input, 'CreateComputeListing');
    const response = await this.http.post<{ data: ComputeListing }>(
      `/api/v1/compute/${encodeURIComponent(assetId)}/listings`,
      validated,
    );
    return response.data.data;
  }

  /**
   * Purchase tokens from a listing.
   */
  async purchase(listingId: string, input: {
    buyerWallet: string;
    maxPrice?: number;
  }): Promise<ComputePurchaseResult> {
    const response = await this.http.post<{ data: ComputePurchaseResult }>(
      `/api/v1/compute/listings/${encodeURIComponent(listingId)}/purchase`,
      input,
    );
    return response.data.data;
  }

  /**
   * Cancel an active listing.
   */
  async cancelListing(listingId: string): Promise<{ success: boolean }> {
    const response = await this.http.post<{ data: { success: boolean } }>(
      `/api/v1/compute/listings/${encodeURIComponent(listingId)}/cancel`,
      {},
    );
    return response.data.data;
  }
}
