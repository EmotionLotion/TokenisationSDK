/**
 * IJurisdictionProvider - Server-side interface for jurisdiction-specific integrations
 *
 * Provides integration points with government/regulatory bodies for:
 * - Asset ownership verification
 * - Tokenization notifications
 * - Valuation data
 * - Compliance requirements
 *
 * Examples: Dubai Land Department (DLD), US SEC, Singapore MAS
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Ownership verification parameters
 */
export interface OwnershipParams {
  /** Asset identifier in the jurisdiction's system */
  assetId: string;
  /** Type of asset (property, security, etc.) */
  assetType: string;
  /** Owner's identity document number */
  ownerIdNumber?: string;
  /** Owner's name */
  ownerName: string;
  /** Additional jurisdiction-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Ownership verification result
 */
export interface OwnershipResult {
  /** Whether ownership is verified */
  verified: boolean;
  /** Owner details from registry */
  owner?: {
    name: string;
    idNumber?: string;
    registeredAt?: string;
  };
  /** Asset details from registry */
  asset?: {
    id: string;
    type: string;
    description?: string;
    registrationDate?: string;
  };
  /** Registration reference number */
  referenceNumber?: string;
  /** Verification timestamp */
  verifiedAt: string;
  /** Expiry of verification (if applicable) */
  expiresAt?: string;
  /** Rejection or warning message */
  message?: string;
  /** Raw response from jurisdiction API */
  rawResponse?: unknown;
}

/**
 * Tokenization notification parameters
 */
export interface NotificationParams {
  /** Asset being tokenized */
  assetId: string;
  /** Asset type */
  assetType: string;
  /** Token contract address */
  tokenAddress: string;
  /** Blockchain network */
  chainId: number;
  /** Total supply of tokens */
  totalSupply: string;
  /** Issuer details */
  issuer: {
    name: string;
    address?: string;
    licenseNumber?: string;
  };
  /** Supporting documents */
  documents?: Array<{
    type: string;
    hash: string;
    uri: string;
  }>;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tokenization notification result
 */
export interface NotificationResult {
  /** Whether notification was accepted */
  accepted: boolean;
  /** Registration/reference number from jurisdiction */
  registrationNumber?: string;
  /** Status of the notification */
  status: 'pending' | 'approved' | 'rejected' | 'requires_action';
  /** Required actions if any */
  requiredActions?: string[];
  /** Notification timestamp */
  notifiedAt: string;
  /** Next steps or instructions */
  instructions?: string;
  /** Message from jurisdiction */
  message?: string;
}

/**
 * Valuation result from jurisdiction registry
 */
export interface ValuationResult {
  /** Asset identifier */
  assetId: string;
  /** Valuation amount in local currency */
  valuationAmount: string;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Valuation date */
  valuationDate: string;
  /** Valuation type */
  valuationType: 'market' | 'assessed' | 'registered' | 'estimated';
  /** Source of valuation */
  source: string;
  /** Whether this is an official/registered valuation */
  isOfficial: boolean;
  /** Historical valuations if available */
  history?: Array<{
    date: string;
    amount: string;
    source: string;
  }>;
}

/**
 * Compliance requirements for an asset type
 */
export interface ComplianceRequirements {
  /** Required documents */
  requiredDocuments: Array<{
    type: string;
    description: string;
    mandatory: boolean;
  }>;
  /** Required licenses or registrations */
  requiredLicenses: Array<{
    type: string;
    issuingAuthority: string;
    description: string;
  }>;
  /** Allowed investor types */
  allowedInvestorTypes: string[];
  /** Minimum investment amount (if any) */
  minimumInvestment?: string;
  /** Maximum investors (if limited) */
  maximumInvestors?: number;
  /** Required KYC level */
  kycLevel: 'none' | 'basic' | 'standard' | 'enhanced' | 'institutional';
  /** Additional restrictions */
  restrictions?: string[];
  /** Regulatory framework reference */
  regulatoryFramework?: string;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * IJurisdictionProvider - Interface for jurisdiction-specific regulatory integrations
 */
export interface IJurisdictionProvider {
  /** ISO country code for this jurisdiction (e.g., 'AE', 'US', 'SG') */
  readonly jurisdiction: string;

  /** Provider name for display */
  readonly providerName: string;

  /**
   * Verify asset ownership with the jurisdiction's registry
   * @param params Ownership verification parameters
   * @returns Ownership verification result
   */
  verifyOwnership(params: OwnershipParams): Promise<OwnershipResult>;

  /**
   * Notify jurisdiction of asset tokenization
   * @param params Notification parameters
   * @returns Notification result
   */
  notifyTokenization(params: NotificationParams): Promise<NotificationResult>;

  /**
   * Get valuation data from jurisdiction registry
   * @param assetId Asset identifier
   * @returns Valuation result
   */
  getValuation(assetId: string): Promise<ValuationResult>;

  /**
   * Get compliance requirements for an asset type
   * @param assetType Type of asset
   * @returns Compliance requirements
   */
  getComplianceRequirements(assetType: string): Promise<ComplianceRequirements>;

  /**
   * Check if provider is available and connected
   * @returns Health status
   */
  healthCheck(): Promise<boolean>;
}
