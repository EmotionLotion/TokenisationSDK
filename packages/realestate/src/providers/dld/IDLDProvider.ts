/**
 * DLD Provider Interface
 *
 * Interface for Dubai Land Department integration providers.
 * Implement this interface to integrate with DLD or mock for development.
 */

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

export type ValuationType = 'MARKET' | 'BOOK' | 'ASSESSED';

export interface Owner {
  id: string;
  name: string;
  emiratesId?: string;
  passportNumber?: string;
  nationality: string;
  sharePercentage: number;
}

export interface PropertyLocation {
  emirate: string;
  community: string;
  building?: string;
  unit?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface TitleDeedResult {
  deedNumber: string;
  propertyId: string;
  status: TitleDeedStatus;
  propertyType: PropertyType;
  ownershipType: OwnershipType;
  owners: Owner[];
  area: number;
  areaUnit: string;
  location: PropertyLocation;
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
  propertyId: string;
  deedNumber: string;
  tokenContractAddress: string;
  totalSupply: string;
  issuerDetails: {
    name: string;
    registrationNumber: string;
    jurisdiction: string;
  };
  metadata?: Record<string, unknown>;
}

export interface TokenizationNotificationResult {
  referenceNumber: string;
  status: 'SUBMITTED' | 'ACKNOWLEDGED' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  acknowledgedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface ValuationResult {
  propertyId: string;
  valuationType: ValuationType;
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

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Interface for DLD (Dubai Land Department) providers.
 *
 * Implementations should handle:
 * - Title deed verification and status checks
 * - Tokenization eligibility checks
 * - Tokenization notifications to DLD
 * - Property valuations
 *
 * @example
 * ```typescript
 * // Using the mock provider for development
 * import { MockDLDProvider } from './MockDLDProvider';
 *
 * const dldProvider = new MockDLDProvider();
 * const titleDeed = await dldProvider.verifyTitleDeed('deed-123');
 *
 * if (titleDeed.status === 'VALID') {
 *   const eligibility = await dldProvider.canTokenize(titleDeed.propertyId);
 *   if (eligibility.eligible) {
 *     const notification = await dldProvider.notifyTokenization({
 *       propertyId: titleDeed.propertyId,
 *       deedNumber: titleDeed.deedNumber,
 *       tokenContractAddress: '0x...',
 *       totalSupply: '1000000',
 *       issuerDetails: { ... }
 *     });
 *   }
 * }
 * ```
 */
export interface IDLDProvider {
  /**
   * Provider name for identification
   */
  readonly name: string;

  /**
   * Verify a title deed with DLD.
   *
   * @param deedNumber - The title deed number to verify
   * @returns Title deed information including status, owners, and restrictions
   * @throws Error if the deed cannot be verified
   */
  verifyTitleDeed(deedNumber: string): Promise<TitleDeedResult>;

  /**
   * Check if a property is eligible for tokenization.
   *
   * @param propertyId - The property ID to check
   * @param ownerIds - Optional list of owner IDs for consent verification
   * @returns Eligibility status with reasons and requirements
   */
  canTokenize(propertyId: string, ownerIds?: string[]): Promise<TokenizationEligibility>;

  /**
   * Notify DLD of a tokenization event.
   *
   * @param params - Tokenization notification parameters
   * @returns Notification result with reference number
   */
  notifyTokenization(params: TokenizationNotification): Promise<TokenizationNotificationResult>;

  /**
   * Get property valuation from DLD.
   *
   * @param propertyId - The property ID
   * @param valuationType - Type of valuation (MARKET, BOOK, ASSESSED)
   * @returns Valuation result
   */
  getValuation(propertyId: string, valuationType?: ValuationType): Promise<ValuationResult>;

  /**
   * Get property by deed number.
   *
   * @param deedNumber - The title deed number
   * @returns Title deed information
   */
  getPropertyByDeed(deedNumber: string): Promise<TitleDeedResult>;

  /**
   * Get property by ID.
   *
   * @param propertyId - The property ID
   * @returns Title deed information
   */
  getPropertyById(propertyId: string): Promise<TitleDeedResult>;

  /**
   * Check notification status.
   *
   * @param referenceNumber - The notification reference number
   * @returns Current notification status
   */
  getNotificationStatus(referenceNumber: string): Promise<TokenizationNotificationResult>;

  /**
   * Health check for the DLD connection.
   *
   * @returns true if the provider is operational
   */
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Configuration for DLD provider
 */
export interface DLDProviderConfig {
  /** Provider type: 'mock' for development, 'production' for real DLD integration */
  type: 'mock' | 'production';
  /** API base URL for production */
  baseUrl?: string;
  /** API key for production */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Additional configuration options */
  options?: Record<string, unknown>;
}

/**
 * Factory function type for creating DLD providers
 */
export type DLDProviderFactory = (config: DLDProviderConfig) => IDLDProvider;
