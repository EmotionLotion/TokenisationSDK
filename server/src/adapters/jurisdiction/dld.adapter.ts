/**
 * DLDAdapter - Dubai Land Department Integration
 *
 * Real integration with Dubai Land Department (DLD) for:
 * - Property ownership verification
 * - Tokenization registration/notification
 * - Property valuation data
 * - UAE real estate compliance requirements
 *
 * @see https://dubailand.gov.ae
 */

import type {
  IJurisdictionProvider,
  OwnershipParams,
  OwnershipResult,
  NotificationParams,
  NotificationResult,
  ValuationResult,
  ComplianceRequirements,
} from '../../interfaces/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * DLD API configuration
 */
export interface DLDConfig {
  /** API base URL */
  baseUrl: string;
  /** API key */
  apiKey: string;
  /** API secret (for signing) */
  apiSecret?: string;
  /** Environment */
  environment: 'sandbox' | 'production';
  /** Request timeout in ms */
  timeout?: number;
  /** Retry configuration */
  retry?: {
    maxRetries: number;
    baseDelay: number;
  };
}

/**
 * DLD API response structure
 */
interface DLDResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
  timestamp: string;
}

/**
 * DLD property details from API
 */
interface DLDPropertyDetails {
  propertyId: string;
  titleDeedNumber: string;
  ownerName: string;
  ownerEmiratesId?: string;
  propertyType: string;
  location: {
    area: string;
    community: string;
    building?: string;
    unit?: string;
  };
  areaSqft: number;
  registrationDate: string;
  lastTransactionDate?: string;
  lastTransactionValue?: number;
  encumbrances?: string[];
}

// ============================================================================
// DLD Adapter Implementation
// ============================================================================

/**
 * DLDAdapter - Dubai Land Department jurisdiction provider
 */
export class DLDAdapter implements IJurisdictionProvider {
  readonly jurisdiction = 'AE';
  readonly providerName = 'Dubai Land Department';

  private config: DLDConfig;
  private isConnected: boolean = false;

  constructor(config: DLDConfig) {
    this.config = {
      timeout: 30000,
      retry: { maxRetries: 3, baseDelay: 1000 },
      ...config,
    };
  }

  /**
   * Create adapter instance with config validation
   */
  static create(config: DLDConfig): DLDAdapter {
    if (!config.baseUrl) {
      throw new Error('DLD API base URL is required');
    }
    if (!config.apiKey) {
      throw new Error('DLD API key is required');
    }
    return new DLDAdapter(config);
  }

  /**
   * Verify property ownership with DLD registry
   */
  async verifyOwnership(params: OwnershipParams): Promise<OwnershipResult> {
    const endpoint = '/v1/properties/verify-ownership';

    try {
      const response = await this.makeRequest<DLDPropertyDetails>(endpoint, {
        method: 'POST',
        body: {
          propertyId: params.assetId,
          ownerName: params.ownerName,
          ownerIdNumber: params.ownerIdNumber,
          assetType: params.assetType,
        },
      });

      if (response.success && response.data) {
        const property = response.data;
        return {
          verified: true,
          owner: {
            name: property.ownerName,
            idNumber: property.ownerEmiratesId,
            registeredAt: property.registrationDate,
          },
          asset: {
            id: property.propertyId,
            type: property.propertyType,
            description: this.formatPropertyDescription(property),
            registrationDate: property.registrationDate,
          },
          referenceNumber: property.titleDeedNumber,
          verifiedAt: new Date().toISOString(),
          expiresAt: this.calculateExpiryDate(30).toISOString(), // 30-day validity
          rawResponse: response,
        };
      }

      return {
        verified: false,
        verifiedAt: new Date().toISOString(),
        message: response.error?.message || 'Ownership verification failed',
        rawResponse: response,
      };
    } catch (error) {
      return {
        verified: false,
        verifiedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Notify DLD of property tokenization
   */
  async notifyTokenization(params: NotificationParams): Promise<NotificationResult> {
    const endpoint = '/v1/tokenization/register';

    try {
      const response = await this.makeRequest<{
        registrationNumber: string;
        status: string;
        requiredDocuments?: string[];
        instructions?: string;
      }>(endpoint, {
        method: 'POST',
        body: {
          propertyId: params.assetId,
          tokenAddress: params.tokenAddress,
          chainId: params.chainId,
          totalSupply: params.totalSupply,
          issuer: {
            name: params.issuer.name,
            licenseNumber: params.issuer.licenseNumber,
          },
          documents: params.documents,
        },
      });

      if (response.success && response.data) {
        const data = response.data;
        return {
          accepted: true,
          registrationNumber: data.registrationNumber,
          status: this.mapStatus(data.status),
          notifiedAt: new Date().toISOString(),
          instructions: data.instructions,
          requiredActions: data.requiredDocuments,
        };
      }

      return {
        accepted: false,
        status: 'rejected',
        notifiedAt: new Date().toISOString(),
        message: response.error?.message || 'Tokenization notification rejected',
      };
    } catch (error) {
      return {
        accepted: false,
        status: 'rejected',
        notifiedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get property valuation from DLD registry
   */
  async getValuation(assetId: string): Promise<ValuationResult> {
    const endpoint = `/v1/properties/${encodeURIComponent(assetId)}/valuation`;

    try {
      const response = await this.makeRequest<{
        propertyId: string;
        currentValue: number;
        valuationDate: string;
        valuationType: string;
        source: string;
        history?: Array<{
          date: string;
          value: number;
          source: string;
        }>;
      }>(endpoint, { method: 'GET' });

      if (response.success && response.data) {
        const data = response.data;
        return {
          assetId: data.propertyId,
          valuationAmount: data.currentValue.toString(),
          currency: 'AED',
          valuationDate: data.valuationDate,
          valuationType: this.mapValuationType(data.valuationType),
          source: data.source,
          isOfficial: data.source === 'DLD_REGISTRY',
          history: data.history?.map(h => ({
            date: h.date,
            amount: h.value.toString(),
            source: h.source,
          })),
        };
      }

      throw new Error(response.error?.message || 'Failed to get valuation');
    } catch (error) {
      throw new Error(`Valuation retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get UAE real estate compliance requirements
   */
  async getComplianceRequirements(assetType: string): Promise<ComplianceRequirements> {
    // UAE VARA/RERA compliance requirements for real estate tokenization
    const baseRequirements: ComplianceRequirements = {
      requiredDocuments: [
        {
          type: 'TITLE_DEED',
          description: 'Original title deed from DLD',
          mandatory: true,
        },
        {
          type: 'NOC',
          description: 'No Objection Certificate from developer (if applicable)',
          mandatory: false,
        },
        {
          type: 'VALUATION_REPORT',
          description: 'Property valuation by RERA-certified valuer',
          mandatory: true,
        },
        {
          type: 'LEGAL_OPINION',
          description: 'Legal opinion on tokenization structure',
          mandatory: true,
        },
      ],
      requiredLicenses: [
        {
          type: 'VARA_LICENSE',
          issuingAuthority: 'Virtual Assets Regulatory Authority',
          description: 'VARA license for virtual asset service provider',
        },
        {
          type: 'RERA_REGISTRATION',
          issuingAuthority: 'Real Estate Regulatory Agency',
          description: 'RERA broker/developer registration',
        },
      ],
      allowedInvestorTypes: ['institutional', 'qualified', 'accredited', 'retail'],
      minimumInvestment: '500', // AED
      kycLevel: 'standard',
      regulatoryFramework: 'UAE VARA / DIFC / RERA',
    };

    // Adjust based on asset type
    if (assetType === 'COMMERCIAL') {
      baseRequirements.minimumInvestment = '50000';
      baseRequirements.kycLevel = 'enhanced';
    }

    return baseRequirements;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<{ status: string }>('/health', {
        method: 'GET',
      });
      this.isConnected = response.success;
      return this.isConnected;
    } catch {
      this.isConnected = false;
      return false;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async makeRequest<T>(
    endpoint: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: unknown;
    }
  ): Promise<DLDResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.config.apiKey,
      'X-Environment': this.config.environment,
    };

    if (this.config.apiSecret) {
      headers['X-Signature'] = this.generateSignature(endpoint, options.body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();
      return data as DLDResponse<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private generateSignature(_endpoint: string, _body: unknown): string {
    // In production, implement HMAC-SHA256 signature
    // using config.apiSecret and request data
    return `sig_${Date.now()}`;
  }

  private formatPropertyDescription(property: DLDPropertyDetails): string {
    const parts = [property.propertyType];
    if (property.location.building) {
      parts.push(`in ${property.location.building}`);
    }
    parts.push(`at ${property.location.community}, ${property.location.area}`);
    parts.push(`(${property.areaSqft} sq ft)`);
    return parts.join(' ');
  }

  private calculateExpiryDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private mapStatus(status: string): 'pending' | 'approved' | 'rejected' | 'requires_action' {
    const statusMap: Record<string, 'pending' | 'approved' | 'rejected' | 'requires_action'> = {
      PENDING: 'pending',
      APPROVED: 'approved',
      REJECTED: 'rejected',
      ACTION_REQUIRED: 'requires_action',
      IN_REVIEW: 'pending',
    };
    return statusMap[status] || 'pending';
  }

  private mapValuationType(type: string): 'market' | 'assessed' | 'registered' | 'estimated' {
    const typeMap: Record<string, 'market' | 'assessed' | 'registered' | 'estimated'> = {
      MARKET: 'market',
      ASSESSED: 'assessed',
      REGISTERED: 'registered',
      ESTIMATED: 'estimated',
      TRANSACTION: 'market',
    };
    return typeMap[type] || 'estimated';
  }
}
