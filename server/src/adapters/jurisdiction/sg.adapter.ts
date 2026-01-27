/**
 * SGJurisdictionAdapter - Singapore MAS Integration Stub
 *
 * Placeholder implementation for Singapore Monetary Authority compliance.
 * To be implemented with actual MAS API integrations.
 *
 * Regulatory Framework:
 * - Securities and Futures Act (SFA)
 * - Payment Services Act (PSA)
 * - MAS Guidelines on Digital Token Offerings
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
 * Singapore MAS adapter configuration
 */
export interface SGJurisdictionConfig {
  /** MAS API credentials */
  masApiKey?: string;
  /** ACRA (company registry) credentials */
  acraCredentials?: {
    apiKey: string;
    secret: string;
  };
  /** Environment */
  environment: 'sandbox' | 'production';
}

/**
 * MAS license types
 */
export type MASLicenseType =
  | 'CMS_LICENSE'      // Capital Markets Services License
  | 'RMO_LICENSE'      // Recognized Market Operator
  | 'PSA_LICENSE'      // Payment Services License
  | 'VCC_LICENSE';     // Variable Capital Companies

/**
 * Token classification under MAS guidelines
 */
export type TokenClassification =
  | 'SECURITIES_TOKEN'    // Subject to SFA
  | 'PAYMENT_TOKEN'       // Subject to PSA
  | 'UTILITY_TOKEN'       // May not be regulated
  | 'ASSET_BACKED_TOKEN'; // Subject to specific regulations

// ============================================================================
// Singapore Jurisdiction Adapter Implementation
// ============================================================================

/**
 * SGJurisdictionAdapter - Singapore MAS jurisdiction provider (stub)
 */
export class SGJurisdictionAdapter implements IJurisdictionProvider {
  readonly jurisdiction = 'SG';
  readonly providerName = 'Singapore MAS';

  private config: SGJurisdictionConfig;

  constructor(config: SGJurisdictionConfig) {
    this.config = config;
  }

  /**
   * Create adapter instance
   */
  static create(config: SGJurisdictionConfig): SGJurisdictionAdapter {
    return new SGJurisdictionAdapter(config);
  }

  /**
   * Verify ownership (stub)
   *
   * Singapore ownership verification would involve:
   * - ACRA (company registry) checks
   * - CDP (Central Depository) records for securities
   * - Land registry for property
   */
  async verifyOwnership(params: OwnershipParams): Promise<OwnershipResult> {
    // Stub implementation
    console.warn('Singapore jurisdiction ownership verification not implemented - using stub');

    return {
      verified: false,
      verifiedAt: new Date().toISOString(),
      message: 'Singapore ownership verification requires integration with ACRA/CDP. This is a stub implementation.',
      rawResponse: {
        stub: true,
        assetId: params.assetId,
        note: 'Implement with ACRA API for companies, CDP for securities, SLA for property',
      },
    };
  }

  /**
   * Notify tokenization (stub)
   *
   * For Singapore tokens, this would involve:
   * - Token classification determination
   * - MAS notification/approval
   * - Prospectus requirements (if securities)
   */
  async notifyTokenization(params: NotificationParams): Promise<NotificationResult> {
    // Stub implementation
    console.warn('Singapore jurisdiction tokenization notification not implemented - using stub');

    const tokenClass = this.classifyToken(params.assetType);

    return {
      accepted: false,
      status: 'requires_action',
      notifiedAt: new Date().toISOString(),
      requiredActions: this.getRequiredActionsForTokenClass(tokenClass),
      instructions: `Token classified as ${tokenClass}. ${this.getInstructionsForTokenClass(tokenClass)}`,
      message: 'This is a stub implementation. Manual MAS compliance required.',
    };
  }

  /**
   * Get valuation (stub)
   *
   * Singapore valuations typically come from:
   * - Licensed valuers for property
   * - Independent auditors for companies
   * - Market prices for listed securities
   */
  async getValuation(assetId: string): Promise<ValuationResult> {
    // Stub implementation
    console.warn('Singapore jurisdiction valuation not implemented - using stub');

    return {
      assetId,
      valuationAmount: '0',
      currency: 'SGD',
      valuationDate: new Date().toISOString(),
      valuationType: 'estimated',
      source: 'Stub - Manual valuation required',
      isOfficial: false,
    };
  }

  /**
   * Get Singapore compliance requirements
   */
  async getComplianceRequirements(assetType: string): Promise<ComplianceRequirements> {
    const tokenClass = this.classifyToken(assetType);
    const isSecurities = tokenClass === 'SECURITIES_TOKEN';

    return {
      requiredDocuments: [
        {
          type: 'TOKEN_CLASSIFICATION',
          description: 'Legal opinion on token classification under MAS guidelines',
          mandatory: true,
        },
        ...(isSecurities
          ? [
              {
                type: 'PROSPECTUS',
                description: 'Prospectus or OIS (Offer Information Statement)',
                mandatory: true,
              },
              {
                type: 'PRODUCT_HIGHLIGHTS_SHEET',
                description: 'Product highlights sheet for retail investors',
                mandatory: true,
              },
            ]
          : []),
        {
          type: 'WHITEPAPER',
          description: 'Technical and business whitepaper',
          mandatory: true,
        },
        {
          type: 'TERMS_CONDITIONS',
          description: 'Terms and conditions for token holders',
          mandatory: true,
        },
        {
          type: 'RISK_DISCLOSURES',
          description: 'Risk disclosure document',
          mandatory: true,
        },
      ],
      requiredLicenses: [
        ...(isSecurities
          ? [
              {
                type: 'CMS_LICENSE',
                issuingAuthority: 'MAS',
                description: 'Capital Markets Services License for dealing in securities',
              },
            ]
          : []),
        {
          type: 'PSA_LICENSE',
          issuingAuthority: 'MAS',
          description: 'Payment Services License (if payment functionality)',
        },
      ],
      allowedInvestorTypes: isSecurities
        ? ['institutional', 'accredited']
        : ['institutional', 'accredited', 'retail'],
      minimumInvestment: isSecurities ? '200000' : undefined, // SG accredited threshold
      kycLevel: 'standard',
      restrictions: [
        'Must comply with MAS Notice on Prevention of Money Laundering',
        'Technology risk management guidelines must be followed',
        'Customer suitability assessment required for securities',
        ...(isSecurities
          ? ['Prospectus exemptions may apply for accredited/institutional only offers']
          : []),
      ],
      regulatoryFramework: isSecurities
        ? 'Securities and Futures Act (SFA)'
        : 'Payment Services Act (PSA)',
    };
  }

  /**
   * Health check (stub)
   */
  async healthCheck(): Promise<boolean> {
    // Stub always returns true
    return true;
  }

  // ============================================================================
  // Singapore-Specific Methods
  // ============================================================================

  /**
   * Classify token under MAS guidelines
   */
  classifyToken(assetType: string): TokenClassification {
    const securityTypes = ['EQUITY', 'DEBT', 'BOND', 'FUND', 'PRIVATE_EQUITY', 'REIT'];
    const paymentTypes = ['STABLECOIN', 'PAYMENT'];

    if (securityTypes.includes(assetType.toUpperCase())) {
      return 'SECURITIES_TOKEN';
    }
    if (paymentTypes.includes(assetType.toUpperCase())) {
      return 'PAYMENT_TOKEN';
    }
    if (assetType.toUpperCase() === 'REAL_ESTATE' || assetType.toUpperCase() === 'COMMODITY') {
      return 'ASSET_BACKED_TOKEN';
    }
    return 'UTILITY_TOKEN';
  }

  /**
   * Get required actions based on token classification
   */
  private getRequiredActionsForTokenClass(tokenClass: TokenClassification): string[] {
    const actions: Record<TokenClassification, string[]> = {
      SECURITIES_TOKEN: [
        'Obtain legal opinion on token classification',
        'Apply for CMS License or use licensed intermediary',
        'Prepare prospectus or apply for exemption',
        'Register with MAS if required',
        'Implement investor suitability assessment',
      ],
      PAYMENT_TOKEN: [
        'Apply for Payment Services License',
        'Implement AML/CFT controls',
        'Maintain required capital reserves',
        'Register with MAS',
      ],
      UTILITY_TOKEN: [
        'Obtain legal opinion confirming utility token status',
        'Ensure no securities characteristics',
        'Maintain whitepaper and disclosures',
      ],
      ASSET_BACKED_TOKEN: [
        'Determine applicable regulatory framework',
        'Implement custody arrangements for underlying assets',
        'Obtain relevant licenses based on asset type',
        'Regular reporting on backing assets',
      ],
    };

    return actions[tokenClass];
  }

  /**
   * Get instructions based on token classification
   */
  private getInstructionsForTokenClass(tokenClass: TokenClassification): string {
    const instructions: Record<TokenClassification, string> = {
      SECURITIES_TOKEN:
        'Contact MAS or licensed capital markets intermediary for guidance on compliance pathway.',
      PAYMENT_TOKEN:
        'Apply for Payment Services Act license before commencing operations.',
      UTILITY_TOKEN:
        'Ensure token does not have securities characteristics to avoid SFA regulation.',
      ASSET_BACKED_TOKEN:
        'Regulatory treatment depends on underlying asset - seek legal advice.',
    };

    return instructions[tokenClass];
  }
}
