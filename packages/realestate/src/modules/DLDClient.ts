/**
 * DLD Module (Thin API Client)
 *
 * A Stripe-like thin REST wrapper for Dubai Land Department integration.
 * This module delegates all business logic to the backend server
 * and does not maintain local state.
 *
 * For the provider interface, see providers/dld/IDLDProvider.ts
 */

import type { HttpClient, PaginatedResponse } from '@tokenisation/core';
import {
  validate,
  UUIDSchema,
} from '@tokenisation/core';
import {
  parseOrThrow,
  dldRegisterTitleInputSchema,
  dldIngestEventInputSchema,
  dldCreateSyncJobInputSchema,
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
} from '../validation/real-estate.js';

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
  // Title Registration & Verification
  // ============================================

  /**
   * Register a new DLD title.
   */
  async registerTitle(input: {
    projectId: string;
    dldTitleNumber: string;
    propertyType: 'land' | 'building' | 'unit';
    emirate?: string;
    area?: string;
    plotNumber?: string;
    buildingName?: string;
    unitNumber?: string;
    propertyDetails?: Record<string, unknown>;
  }): Promise<TitleDeed> {
    const validated = parseOrThrow(dldRegisterTitleInputSchema, input, 'RegisterTitle');
    const response = await this.http.post<TitleDeed>(
      '/api/v1/dld/titles',
      validated
    );
    return response.data;
  }

  /**
   * List DLD titles with optional filters.
   */
  async listTitles(params?: {
    projectId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<TitleDeed>> {
    return this.http.list<TitleDeed>(
      '/api/v1/dld/titles',
      params as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Get a DLD title by ID.
   */
  async getTitle(id: string): Promise<TitleDeed> {
    const response = await this.http.get<TitleDeed>(
      `/api/v1/dld/titles/${encodeURIComponent(id)}`
    );
    return response.data;
  }

  /**
   * Update a DLD title.
   */
  async updateTitle(id: string, input: {
    status?: 'pending' | 'verified' | 'disputed' | 'expired';
    propertyDetails?: Record<string, unknown>;
  }): Promise<TitleDeed> {
    const response = await this.http.patch<TitleDeed>(
      `/api/v1/dld/titles/${encodeURIComponent(id)}`,
      input
    );
    return response.data;
  }

  /**
   * Verify a title deed against Dubai Land Department.
   */
  async verify(input: VerifyTitleDeedInput): Promise<TitleDeed> {
    const validated = validate(VerifyTitleDeedInputSchema, input);
    const response = await this.http.post<TitleDeed>(
      `/api/v1/dld/titles/${encodeURIComponent(validated.deedNumber)}/verify`,
      validated
    );
    return response.data;
  }

  /**
   * Verify a title on-chain via Chainlink Functions.
   */
  async verifyOnChain(id: string): Promise<TitleDeed> {
    const response = await this.http.post<TitleDeed>(
      `/api/v1/dld/titles/${encodeURIComponent(id)}/verify-onchain`
    );
    return response.data;
  }

  /**
   * Get title deed by deed number (alias for getTitle).
   */
  async getTitleDeed(deedNumber: string): Promise<TitleDeed> {
    const response = await this.http.get<TitleDeed>(
      `/api/v1/dld/titles/${encodeURIComponent(deedNumber)}`
    );
    return response.data;
  }

  /**
   * Get property by ID (alias for getTitle).
   */
  async getProperty(propertyId: string): Promise<TitleDeed> {
    const response = await this.http.get<TitleDeed>(
      `/api/v1/dld/titles/${encodeURIComponent(propertyId)}`
    );
    return response.data;
  }

  /**
   * Check if a title is clear (no disputes, liens, etc.).
   */
  async checkTitleClear(id: string): Promise<{ clear: boolean; issues: string[] }> {
    const response = await this.http.get<{ clear: boolean; issues: string[] }>(
      `/api/v1/dld/titles/${encodeURIComponent(id)}/check-clear`
    );
    return response.data;
  }

  // ============================================
  // Tokenization Eligibility
  // ============================================

  /**
   * Check if a property is eligible for tokenization.
   * Note: This is a higher-level SDK abstraction; the server may not expose
   * a dedicated tokenization-check endpoint. The URL is kept under the DLD prefix.
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
      `/api/v1/dld/titles/${encodeURIComponent(propertyId)}/valuations`,
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
   * Ingest a DLD event (webhook from DLD or manual).
   */
  async ingestEvent(input: {
    dldTitleId: string;
    eventType: string;
    eventData: Record<string, unknown>;
    dldEventId?: string;
    occurredAt?: string;
  }): Promise<DldEvent> {
    const validated = parseOrThrow(dldIngestEventInputSchema, input, 'IngestEvent');
    const response = await this.http.post<DldEvent>(
      '/api/v1/dld/events',
      validated
    );
    return response.data;
  }

  /**
   * Process a specific DLD event.
   */
  async processEvent(eventId: string): Promise<DldEvent> {
    const response = await this.http.post<DldEvent>(
      `/api/v1/dld/events/${encodeURIComponent(eventId)}/process`
    );
    return response.data;
  }

  /**
   * Get events for a specific title.
   */
  async getPropertyEvents(
    propertyId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<PaginatedResponse<DldEvent>> {
    return this.http.list<DldEvent>(
      `/api/v1/dld/titles/${encodeURIComponent(propertyId)}/events`,
      params as Record<string, string | number | boolean | undefined>
    );
  }

  // ============================================
  // Sync Jobs
  // ============================================

  /**
   * Create a DLD sync job.
   */
  async createSyncJob(input: {
    jobType: 'poll' | 'reconcile' | 'manual';
    config?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    const validated = parseOrThrow(dldCreateSyncJobInputSchema, input, 'CreateSyncJob');
    const response = await this.http.post<{ id: string; status: string }>(
      '/api/v1/dld/sync-jobs',
      validated
    );
    return response.data;
  }

  /**
   * List DLD sync jobs.
   */
  async listSyncJobs(params?: {
    status?: string;
    jobType?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<{ id: string; status: string; jobType: string }>> {
    return this.http.list<{ id: string; status: string; jobType: string }>(
      '/api/v1/dld/sync-jobs',
      params as Record<string, string | number | boolean | undefined>
    );
  }

  /**
   * Execute a DLD sync job.
   */
  async executeSyncJob(jobId: string): Promise<{ id: string; status: string }> {
    const response = await this.http.post<{ id: string; status: string }>(
      `/api/v1/dld/sync-jobs/${encodeURIComponent(jobId)}/execute`
    );
    return response.data;
  }

  // ============================================
  // Lookup
  // ============================================

  /**
   * Lookup a title by DLD title number.
   */
  async lookupByTitleNumber(dldTitleNumber: string): Promise<TitleDeed> {
    const response = await this.http.get<TitleDeed>(
      `/api/v1/dld/lookup/${encodeURIComponent(dldTitleNumber)}`
    );
    return response.data;
  }

  // ============================================
  // Search & Discovery (higher-level abstractions)
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
      '/api/v1/dld/titles',
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
