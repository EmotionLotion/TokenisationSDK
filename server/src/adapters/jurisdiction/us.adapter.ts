/**
 * USJurisdictionAdapter - US SEC/FINRA Integration Stub
 *
 * Placeholder implementation for US securities regulatory compliance.
 * To be implemented with actual SEC/FINRA API integrations.
 *
 * Regulatory Framework:
 * - SEC Regulation D (Private Placements)
 * - SEC Regulation S (Offshore Offerings)
 * - SEC Regulation A+ (Mini-IPO)
 * - SEC Regulation CF (Crowdfunding)
 * - FINRA Rules
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
 * US SEC adapter configuration
 */
export interface USJurisdictionConfig {
  /** EDGAR API key (when available) */
  edgarApiKey?: string;
  /** FINRA API credentials */
  finraCredentials?: {
    username: string;
    password: string;
  };
  /** Environment */
  environment: 'sandbox' | 'production';
}

/**
 * SEC filing types
 */
export type SECFilingType =
  | 'FORM_D'      // Regulation D
  | 'FORM_S'      // Regulation S
  | 'FORM_1A'     // Regulation A+
  | 'FORM_C'      // Regulation CF
  | 'FORM_ATS'    // Alternative Trading System
  | 'FORM_BD';    // Broker-Dealer

// ============================================================================
// US Jurisdiction Adapter Implementation
// ============================================================================

/**
 * USJurisdictionAdapter - US SEC jurisdiction provider (stub)
 */
export class USJurisdictionAdapter implements IJurisdictionProvider {
  readonly jurisdiction = 'US';
  readonly providerName = 'US SEC/FINRA';

  private config: USJurisdictionConfig;

  constructor(config: USJurisdictionConfig) {
    this.config = config;
  }

  /**
   * Create adapter instance
   */
  static create(config: USJurisdictionConfig): USJurisdictionAdapter {
    return new USJurisdictionAdapter(config);
  }

  /**
   * Verify ownership (stub)
   *
   * Note: US doesn't have a centralized ownership registry like DLD.
   * Verification would involve:
   * - Transfer agent records
   * - Cap table verification
   * - DTCC/DRS records
   */
  async verifyOwnership(params: OwnershipParams): Promise<OwnershipResult> {
    // Stub implementation
    console.warn('US jurisdiction ownership verification not implemented - using stub');

    return {
      verified: false,
      verifiedAt: new Date().toISOString(),
      message: 'US ownership verification requires integration with transfer agent or cap table provider. This is a stub implementation.',
      rawResponse: {
        stub: true,
        assetId: params.assetId,
        note: 'Implement with transfer agent API (e.g., Carta, Pulley, Shareworks)',
      },
    };
  }

  /**
   * Notify tokenization (stub)
   *
   * For US securities, this would involve:
   * - Form D filing (Regulation D)
   * - Blue Sky filings (state level)
   * - ATS registration (if operating exchange)
   */
  async notifyTokenization(params: NotificationParams): Promise<NotificationResult> {
    // Stub implementation
    console.warn('US jurisdiction tokenization notification not implemented - using stub');

    return {
      accepted: false,
      status: 'requires_action',
      notifiedAt: new Date().toISOString(),
      requiredActions: [
        'File Form D with SEC EDGAR',
        'Complete Blue Sky filings for target states',
        'Ensure ATS registration if operating secondary market',
        'Verify accredited investor status for all purchasers',
      ],
      instructions: 'US securities tokenization requires SEC compliance. Contact securities counsel for Form D preparation.',
      message: 'This is a stub implementation. Manual SEC filing required.',
    };
  }

  /**
   * Get valuation (stub)
   *
   * US valuations typically come from:
   * - 409A valuations (private companies)
   * - Market prices (public securities)
   * - Third-party appraisals
   */
  async getValuation(assetId: string): Promise<ValuationResult> {
    // Stub implementation
    console.warn('US jurisdiction valuation not implemented - using stub');

    return {
      assetId,
      valuationAmount: '0',
      currency: 'USD',
      valuationDate: new Date().toISOString(),
      valuationType: 'estimated',
      source: 'Stub - Manual valuation required',
      isOfficial: false,
    };
  }

  /**
   * Get US securities compliance requirements
   */
  async getComplianceRequirements(assetType: string): Promise<ComplianceRequirements> {
    const isDebt = assetType === 'DEBT' || assetType === 'BOND';
    const isRealEstate = assetType === 'REAL_ESTATE' || assetType === 'REIT';

    return {
      requiredDocuments: [
        {
          type: 'PPM',
          description: 'Private Placement Memorandum',
          mandatory: true,
        },
        {
          type: 'SUBSCRIPTION_AGREEMENT',
          description: 'Investor subscription agreement',
          mandatory: true,
        },
        {
          type: 'ACCREDITATION_VERIFICATION',
          description: 'Accredited investor verification (Rule 506(c))',
          mandatory: true,
        },
        {
          type: 'FORM_D',
          description: 'SEC Form D filing',
          mandatory: true,
        },
        {
          type: 'BLUE_SKY_FILINGS',
          description: 'State securities filings',
          mandatory: true,
        },
        ...(isDebt
          ? [
              {
                type: 'INDENTURE',
                description: 'Bond indenture agreement',
                mandatory: true,
              },
            ]
          : []),
        ...(isRealEstate
          ? [
              {
                type: 'APPRAISAL',
                description: 'Third-party property appraisal',
                mandatory: true,
              },
            ]
          : []),
      ],
      requiredLicenses: [
        {
          type: 'BROKER_DEALER',
          issuingAuthority: 'FINRA',
          description: 'Broker-dealer registration for offering securities',
        },
        {
          type: 'ATS_REGISTRATION',
          issuingAuthority: 'SEC',
          description: 'Alternative Trading System registration (Form ATS)',
        },
        {
          type: 'TRANSFER_AGENT',
          issuingAuthority: 'SEC',
          description: 'Transfer agent registration',
        },
      ],
      allowedInvestorTypes: ['institutional', 'qualified', 'accredited'],
      minimumInvestment: '25000', // Typical Reg D minimum
      maximumInvestors: 99, // Non-accredited limit under some exemptions
      kycLevel: 'enhanced',
      restrictions: [
        'Accredited investor verification required under Rule 506(c)',
        '12-month resale restriction (Rule 144)',
        'No general solicitation without 506(c) compliance',
        'Anti-money laundering (AML) compliance required',
      ],
      regulatoryFramework: 'SEC Regulation D / Securities Act of 1933',
    };
  }

  /**
   * Health check (stub)
   */
  async healthCheck(): Promise<boolean> {
    // Stub always returns true
    // Real implementation would check EDGAR and FINRA connectivity
    return true;
  }

  // ============================================================================
  // SEC-Specific Methods (Stubs)
  // ============================================================================

  /**
   * Get required SEC filing type based on offering structure
   */
  getRequiredFilingType(params: {
    totalOffering: number;
    investorTypes: string[];
    isPublicSolicitation: boolean;
  }): SECFilingType {
    const { totalOffering, investorTypes, isPublicSolicitation } = params;

    // Simplified logic - real implementation would be more complex
    if (totalOffering <= 5000000) {
      return 'FORM_C'; // Regulation CF
    }
    if (totalOffering <= 75000000) {
      return 'FORM_1A'; // Regulation A+ Tier 2
    }
    if (investorTypes.every(t => t === 'accredited') && isPublicSolicitation) {
      return 'FORM_D'; // Rule 506(c)
    }
    return 'FORM_D'; // Default to Reg D
  }
}
