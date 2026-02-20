/**
 * SecondaryMarketModule - Asset-agnostic P2P secondary market.
 *
 * Replaces the airline-ticket-scoped ResaleModule with a generic
 * listing/purchase flow for any tokenized asset.
 */

import type { HttpClient } from '../utils/http.js';

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

export interface CreateListingInput {
  tokenAmount: number;
  pricePerToken: number;
  currency?: string;
  expiresAt?: string;
}

export interface PurchaseResult {
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

export class SecondaryMarketModule {
  constructor(private http: HttpClient) {}

  async listListings(assetId: string, params?: { status?: string; limit?: number; offset?: number }): Promise<SecondaryListing[]> {
    const response = await this.http.get<{ data: SecondaryListing[] }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/listings`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data.data;
  }

  async createListing(assetId: string, input: CreateListingInput): Promise<SecondaryListing> {
    const response = await this.http.post<{ data: SecondaryListing }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/listings`,
      input,
    );
    return response.data.data;
  }

  async purchase(listingId: string, input: { buyerWallet: string; maxPrice?: number }): Promise<PurchaseResult> {
    const response = await this.http.post<{ data: PurchaseResult }>(
      `/api/v1/listings/${encodeURIComponent(listingId)}/purchase`,
      input,
    );
    return response.data.data;
  }

  async cancelListing(listingId: string): Promise<{ success: boolean }> {
    const response = await this.http.post<{ data: { success: boolean } }>(
      `/api/v1/listings/${encodeURIComponent(listingId)}/cancel`,
      {},
    );
    return response.data.data;
  }
}
