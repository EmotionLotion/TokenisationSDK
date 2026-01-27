/**
 * DLD Module (Thin API Client)
 *
 * A Stripe-like thin REST wrapper for Dubai Land Department integration.
 * This module delegates all business logic to the backend server
 * and does not maintain local state.
 *
 * For the provider interface, see providers/dld/IDLDProvider.ts
 */

import type { HttpClient } from '../utils/http.js';
import type { PaginatedResponse } from '../types.js';
import {
  validate,
  UUIDSchema,
} from './validation.js';
import {
  VerifyTitleDeedInputSchema,
  CheckTokenizationEligibilityInputSchema,
  NotifyTokenizationInputSchema,
  GetValuationInputSchema,
  ListDldEventsParamsSchema,
  type VerifyTitleDeedInput,
  type CheckTokenizationEligibilityInput,
  type NotifyTokenizationInput,
  type GetValuationInput,
  type ListDldEventsParams,
} from './validation-governance.js';

// ============================================================================
// Types
// ============================================================================

export type TitleDeedStatus = 'VALID' | 'EXPIRED' | 'PENDING' | 'REVOKED' | 'NOT_FOUND';

export type PropertyType =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'INDUSTRIAL'
  | 'LAND'
  | 'MIXED_USE';

export type OwnershipType = 'FREEHOLD' | 'LEASEHOLD' | 'USUFRUCT' | 'MUSATAHA';

export interface Owner {
  id: string;
  name: string;
  emiratesId?: string;
  passportNumber?: string;
  nationality: string;
  sharePercentage: number;
}

export interface TitleDeed {
  deedNumber: string;
  propertyId: string;
  status: TitleDeedStatus;
  propertyType: PropertyType;
  ownershipType: OwnershipType;
  owners: Owner[];
  area: number;
  areaUnit: string;
  location: {
    emirate: string;
    community: string;
    building?: string;
    unit?: string;
  };
  registrationDate: string;
  expiryDate?: string;
  encumbrances: string[];
  restrictions: string[];
  verifiedAt: string;
}

export interface TokenizationEligibility {
  propertyId: string;
  eligible: boolean;
  reasons: string[];
  requirements: string[];
  warnings: string[];
  maxTokenizationPercentage: number;
  checkedAt: string;
}

export interface TokenizationNotification {
  referenceNumber: string;
  propertyId: string;
  deedNumber: string;
  tokenContractAddress: string;
  totalSupply: string;
  status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  acknowledgedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface Valuation {
  propertyId: string;
  valuationType: 'MARKET' | 'BOOK' | 'ASSESSED';
  value: string;
  currency: string;
  valuationDate: string;
  source: string;
  validUntil: string;
  methodology?: string;
  comparables?: Array<{
    propertyId: string;
    value: string;
    date: string;
  }>;
}

export interface DldEvent {
  id: string;
  propertyId: string;
  eventType: string;
  eventDate: string;
  description: string;
  parties: Array<{
    role: string;
    name: string;
    id?: string;
  }>;
  value?: string;
  currency?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PropertySummary {
  propertyId: string;
  deedNumber: string;
  status: TitleDeedStatus;
  propertyType: PropertyType;
  location: string;
  area: number;
  currentValuation?: string;
  lastUpdated: string;
}

// ============================================================================
// DLD Module
// ============================================================================

export class DLDModule {
  constructor(private http: HttpClient) {}

  // ============================================
  // Title Deed Verification
  // ============================================

  /**
   * Verify a title deed with Dubai Land Department.
   */
  async verify(input: VerifyTitleDeedInput): Promise<TitleDeed> {
    const validated = validate(VerifyTitleDeedInputSchema, input);
    const response = await this.http.post<TitleDeed>(
      '/api/v1/dld/verify',
      validated
    );
    return response.data;
  }

  /**
   * Get title deed by deed number.
   */
  async getTitleDeed(deedNumber: string): Promise<TitleDeed> {
    const response = await this.http.get<TitleDeed>(
      `/api/v1/dld/deeds/${encodeURIComponent(deedNumber)}`
    );
    return response.data;
  }

  /**
   * Get property by ID.
   */
  async getProperty(propertyId: string): Promise<TitleDeed> {
    const response = await this.http.get<TitleDeed>(
      `/api/v1/dld/properties/${encodeURIComponent(propertyId)}`
    );
    return response.data;
  }

  // ============================================
  // Tokenization Eligibility
  // ============================================

  /**
   * Check if a property is eligible for tokenization.
   */
  async canTokenize(input: CheckTokenizationEligibilityInput): Promise<TokenizationEligibility> {
    const validated = validate(CheckTokenizationEligibilityInputSchema, input);
    const response = await this.http.post<TokenizationEligibility>(
      '/api/v1/dld/tokenization/check',
      validated
    );
    return response.data;
  }

  /**
   * Notify DLD of a tokenization event.
   */
  async notifyTokenization(input: NotifyTokenizationInput): Promise<TokenizationNotification> {
    const validated = validate(NotifyTokenizationInputSchema, input);
    const response = await this.http.post<TokenizationNotification>(
      '/api/v1/dld/tokenization/notify',
      validated
    );
    return response.data;
  }

  /**
   * Get status of a tokenization notification.
   */
  async getTokenizationStatus(referenceNumber: string): Promise<TokenizationNotification> {
    const response = await this.http.get<TokenizationNotification>(
      `/api/v1/dld/tokenization/${encodeURIComponent(referenceNumber)}`
    );
    return response.data;
  }

  // ============================================
  // Valuations
  // ============================================

  /**
   * Get property valuation.
   */
  async getValuation(input: GetValuationInput): Promise<Valuation> {
    const validated = validate(GetValuationInputSchema, input);
    const response = await this.http.post<Valuation>(
      '/api/v1/dld/valuation',
      validated
    );
    return response.data;
  }

  /**
   * Get valuation history for a property.
   */
  async getValuationHistory(
    propertyId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<PaginatedResponse<Valuation>> {
    return this.http.list<Valuation>(
      `/api/v1/dld/properties/${encodeURIComponent(propertyId)}/valuations`,
      params as Record<string, string | number | boolean | undefined>
    );
  }

  // ============================================
  // Events & History
  // ============================================

  /**
   * Get DLD events (ownership changes, transactions, etc.).
   */
  async getEvents(params?: ListDldEventsParams): Promise<PaginatedResponse<DldEvent>> {
    const validated = params ? validate(ListDldEventsParamsSchema, params) : undefined;
    return this.http.list<DldEvent>(
      '/api/v1/dld/events',
      validated as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Get events for a specific property.
   */
  async getPropertyEvents(
    propertyId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<PaginatedResponse<DldEvent>> {
    return this.http.list<DldEvent>(
      `/api/v1/dld/properties/${encodeURIComponent(propertyId)}/events`,
      params as Record<string, string | number | boolean | undefined>
    );
  }

  // ============================================
  // Search & Discovery
  // ============================================

  /**
   * Search properties.
   */
  async searchProperties(query: {
    emirate?: string;
    community?: string;
    propertyType?: PropertyType;
    minArea?: number;
    maxArea?: number;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<PropertySummary>> {
    return this.http.list<PropertySummary>(
      '/api/v1/dld/properties/search',
      query as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Get properties linked to a specific asset.
   */
  async getAssetProperties(assetId: string): Promise<TitleDeed[]> {
    const validatedId = validate(UUIDSchema, assetId);
    const response = await this.http.get<{ data: TitleDeed[] }>(
      `/api/v1/dld/assets/${validatedId}/properties`
    );
    return response.data.data;
  }

  /**
   * Link a property to an asset.
   */
  async linkPropertyToAsset(assetId: string, deedNumber: string): Promise<{ success: boolean }> {
    const validatedId = validate(UUIDSchema, assetId);
    const response = await this.http.post<{ success: boolean }>(
      `/api/v1/dld/assets/${validatedId}/properties`,
      { deedNumber }
    );
    return response.data;
  }

  /**
   * Unlink a property from an asset.
   */
  async unlinkPropertyFromAsset(assetId: string, deedNumber: string): Promise<{ success: boolean }> {
    const validatedId = validate(UUIDSchema, assetId);
    const response = await this.http.delete<{ success: boolean }>(
      `/api/v1/dld/assets/${validatedId}/properties/${encodeURIComponent(deedNumber)}`
    );
    return response.data;
  }
}
