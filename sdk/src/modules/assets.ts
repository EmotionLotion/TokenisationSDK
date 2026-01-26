/**
 * Assets Module
 *
 * Manages tokenizable assets (real estate, securities, commodities, etc.)
 * An asset represents the underlying real-world or digital asset being tokenized.
 */

import type { HttpClient } from '../utils/http.js';
import type { Asset, AssetState, PaginatedResponse } from '../types.js';
import type { RightType, Jurisdiction } from '../core/index.js';
import {
  validate,
  CreateAssetInputSchema,
  UpdateAssetInputSchema,
  ListAssetsParamsSchema,
  UpdateValuationInputSchema,
  UUIDSchema,
} from './validation.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateAssetInput {
  /** Asset name */
  name: string;
  /** Asset description */
  description?: string;
  /** Type of right being tokenized */
  rightType: RightType;
  /** Jurisdiction information */
  jurisdiction: {
    countryCode: string;
    regulatoryFramework?: string;
    restrictions?: string[];
  };
  /** Asset-specific metadata */
  metadata?: Record<string, unknown>;
  /** Project ID to associate with */
  projectId?: string;
}

export interface UpdateAssetInput {
  name?: string;
  description?: string;
  state?: AssetState;
  metadata?: Record<string, unknown>;
}

export interface ListAssetsParams {
  state?: AssetState;
  rightType?: RightType;
  jurisdiction?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// Assets Module
// ============================================================================

export class AssetsModule {
  constructor(private http: HttpClient) {}

  /**
   * Creates a new asset.
   *
   * @example
   * ```typescript
   * const asset = await client.assets.create({
   *   name: 'Marina Heights SPV',
   *   description: 'Luxury waterfront apartment complex',
   *   rightType: RightType.OWNERSHIP,
   *   jurisdiction: {
   *     countryCode: 'AE',
   *     regulatoryFramework: 'UAE_VARA',
   *   },
   *   metadata: {
   *     propertyType: 'RESIDENTIAL',
   *     totalUnits: 100,
   *   },
   * });
   * ```
   */
  async create(input: CreateAssetInput, idempotencyKey?: string): Promise<Asset> {
    const validated = validate(CreateAssetInputSchema, input);
    const response = await this.http.post<Asset>('/api/v1/assets', validated, { idempotencyKey });
    return response.data;
  }

  /**
   * Retrieves an asset by ID.
   */
  async get(id: string): Promise<Asset> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<Asset>(`/api/v1/assets/${validatedId}`);
    return response.data;
  }

  /**
   * Lists assets with optional filters.
   */
  async list(params?: ListAssetsParams): Promise<PaginatedResponse<Asset>> {
    const validated = params ? validate(ListAssetsParamsSchema, params) : undefined;
    return this.http.list<Asset>('/api/v1/assets', validated as Record<string, string | number | boolean | undefined>);
  }

  /**
   * Updates an asset.
   */
  async update(id: string, input: UpdateAssetInput): Promise<Asset> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdateAssetInputSchema, input);
    const response = await this.http.patch<Asset>(`/api/v1/assets/${validatedId}`, validated);
    return response.data;
  }

  /**
   * Deletes an asset (only draft assets).
   */
  async delete(id: string): Promise<void> {
    const validatedId = validate(UUIDSchema, id);
    await this.http.delete(`/api/v1/assets/${validatedId}`);
  }

  /**
   * Activates an asset, making it ready for tokenization.
   */
  async activate(id: string): Promise<Asset> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Asset>(`/api/v1/assets/${validatedId}/activate`);
    return response.data;
  }

  /**
   * Freezes an asset, preventing new token operations.
   */
  async freeze(id: string, reason?: string): Promise<Asset> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Asset>(`/api/v1/assets/${validatedId}/freeze`, { reason });
    return response.data;
  }

  /**
   * Unfreezes a frozen asset.
   */
  async unfreeze(id: string): Promise<Asset> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.post<Asset>(`/api/v1/assets/${validatedId}/unfreeze`);
    return response.data;
  }

  /**
   * Gets the valuation history for an asset.
   */
  async getValuations(id: string): Promise<{
    current: { value: string; currency: string; date: string };
    history: Array<{ value: string; currency: string; date: string; source: string }>;
  }> {
    const validatedId = validate(UUIDSchema, id);
    const response = await this.http.get<{
      current: { value: string; currency: string; date: string };
      history: Array<{ value: string; currency: string; date: string; source: string }>;
    }>(`/api/v1/assets/${validatedId}/valuations`);
    return response.data;
  }

  /**
   * Updates the valuation for an asset.
   */
  async updateValuation(id: string, valuation: {
    value: string;
    currency: string;
    source: string;
    attestation?: string;
  }): Promise<void> {
    const validatedId = validate(UUIDSchema, id);
    const validated = validate(UpdateValuationInputSchema, valuation);
    await this.http.post(`/api/v1/assets/${validatedId}/valuations`, validated);
  }
}
