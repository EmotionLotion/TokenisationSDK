/**
 * NAVModule - SDK module for Net Asset Value operations.
 *
 * Provides current NAV retrieval, NAV history, manual valuation submission,
 * and CRE callback processing.
 *
 * Server routes are mounted at /api/v1/assets/:assetId/nav.
 */

import type { HttpClient } from '../utils/http.js';
import { parseOrThrow, navValuationInputSchema } from '../validation/real-estate.js';

// ============================================================================
// Types
// ============================================================================

export interface NAVRecord {
  id: string;
  assetId: string;
  navPerToken: string;
  totalAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  totalSupply: string;
  currency: string;
  decimals: number;
  source: 'cre_workflow' | 'manual' | 'api';
  computedAt: string;
  txHash?: string;
}

export interface ValuationSource {
  name: string;
  value: string;
  weight: number;
  timestamp?: number;
}

export interface NAVWithSources {
  nav: NAVRecord;
  valuationSources: ValuationSource[];
}

export interface NAVHistoryResponse {
  records: NAVRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ManualValuationInput {
  totalAssetValue: string;
  liabilities?: string;
  currency?: string;
  decimals?: number;
  reason?: string;
  sources?: Array<{
    name: string;
    value: string;
    weight: number;
  }>;
}

// ============================================================================
// Module
// ============================================================================

export class NAVModule {
  constructor(private http: HttpClient) {}

  /**
   * Get the current (most recent) NAV for an asset.
   */
  async getCurrent(assetId: string): Promise<NAVWithSources> {
    const response = await this.http.get<NAVWithSources>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/nav`,
    );
    return response.data;
  }

  /**
   * Get paginated NAV history for an asset.
   */
  async getHistory(assetId: string, params?: {
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    source?: 'cre_workflow' | 'manual' | 'api';
  }): Promise<NAVHistoryResponse> {
    const response = await this.http.get<NAVHistoryResponse>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/nav/history`,
      params as Record<string, string | number | boolean | undefined>,
    );
    return response.data;
  }

  /**
   * Submit a manual valuation and compute NAV.
   */
  async submitValuation(assetId: string, input: ManualValuationInput): Promise<{ nav: NAVRecord }> {
    const validated = parseOrThrow(navValuationInputSchema, input, 'SubmitValuation');
    const response = await this.http.post<{ nav: NAVRecord }>(
      `/api/v1/assets/${encodeURIComponent(assetId)}/nav/valuations`,
      validated,
    );
    return response.data;
  }
}
