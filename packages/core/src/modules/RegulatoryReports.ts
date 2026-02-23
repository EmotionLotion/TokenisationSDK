/**
 * Regulatory Reports Module
 *
 * Generates jurisdiction-specific regulatory reports and compliance packs.
 *
 * Supported frameworks:
 * - US: SEC Form D, Blue Sky, AML/BSA
 * - EU: MiFID II, GDPR, AMLD
 * - UK: FCA, CASS
 * - Singapore: MAS CIS, PSA
 * - UAE: DFSA, ADGM, SCA
 * - Switzerland: FINMA
 *
 * @example
 * ```typescript
 * const reporter = new RegulatoryReporter(sdk);
 *
 * // Generate SEC Form D data
 * const formD = await reporter.regulatoryPack('SEC_FORM_D', {
 *   assetId: 'asset-123',
 *   period: { from: '2024-01-01', to: '2024-12-31' },
 * });
 *
 * // Generate DFSA compliance report
 * const dfsa = await reporter.regulatoryPack('DFSA_REPORT', {
 *   assetId: 'asset-123',
 *   includeTransactions: true,
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported regulatory frameworks
 */
export enum ReportFramework {
  // United States
  SEC_FORM_D = 'SEC_FORM_D',
  SEC_FORM_D_506B = 'SEC_FORM_D_506B',
  SEC_FORM_D_506C = 'SEC_FORM_D_506C',
  SEC_REG_A = 'SEC_REG_A',
  SEC_REG_CF = 'SEC_REG_CF',
  SEC_REG_S = 'SEC_REG_S',
  BLUE_SKY = 'BLUE_SKY',
  FINRA_5123 = 'FINRA_5123',
  AML_BSA = 'AML_BSA',

  // European Union
  MIFID_II = 'MIFID_II',
  MIFIR = 'MIFIR',
  EMIR = 'EMIR',
  CSDR = 'CSDR',
  AMLD_6 = 'AMLD_6',
  GDPR_FINANCIAL = 'GDPR_FINANCIAL',
  EU_PROSPECTUS = 'EU_PROSPECTUS',
  MICA = 'MICA',

  // United Kingdom
  FCA_COBS = 'FCA_COBS',
  FCA_CASS = 'FCA_CASS',
  FCA_MAR = 'FCA_MAR',
  UK_MLRS = 'UK_MLRS',

  // Singapore
  MAS_CIS = 'MAS_CIS',
  MAS_SFA = 'MAS_SFA',
  MAS_PSA = 'MAS_PSA',
  MAS_AML = 'MAS_AML',

  // UAE
  DFSA_REPORT = 'DFSA_REPORT',
  ADGM_FSMR = 'ADGM_FSMR',
  SCA_REPORT = 'SCA_REPORT',
  UAE_AML = 'UAE_AML',

  // Switzerland
  FINMA_REPORT = 'FINMA_REPORT',
  SWISS_AML = 'SWISS_AML',

  // General
  FATF_TRAVEL_RULE = 'FATF_TRAVEL_RULE',
  INVESTOR_REGISTER = 'INVESTOR_REGISTER',
  TRANSACTION_REPORT = 'TRANSACTION_REPORT',
  AML_SAR = 'AML_SAR',
  TAX_WITHHOLDING = 'TAX_WITHHOLDING',
}

/**
 * Report generation options
 */
export interface ReportOptions {
  /** Asset ID to report on */
  assetId?: string;

  /** Offering ID to report on */
  offeringId?: string;

  /** Report period */
  period?: {
    from: string;
    to: string;
  };

  /** Include transaction details */
  includeTransactions?: boolean;

  /** Include investor details */
  includeInvestors?: boolean;

  /** Include KYC/AML details */
  includeKycAml?: boolean;

  /** Output format */
  format?: 'JSON' | 'XML' | 'PDF' | 'CSV' | 'EXCEL';

  /** Custom filters */
  filters?: Record<string, unknown>;
}

/**
 * Generated report
 */
export interface RegulatoryReport {
  id: string;
  framework: ReportFramework;
  name: string;
  description: string;

  /** Report metadata */
  metadata: {
    generatedAt: string;
    generatedBy: string;
    version: string;
    period?: { from: string; to: string };
    assetId?: string;
    offeringId?: string;
  };

  /** Report sections */
  sections: ReportSection[];

  /** Summary statistics */
  summary: ReportSummary;

  /** Compliance status */
  compliance: {
    status: 'COMPLIANT' | 'NON_COMPLIANT' | 'REVIEW_REQUIRED';
    issues: ComplianceIssue[];
    recommendations: string[];
  };

  /** Raw data for filing */
  filingData: Record<string, unknown>;
}

/**
 * Report section
 */
export interface ReportSection {
  id: string;
  title: string;
  description?: string;
  data: Record<string, unknown>;
  tables?: ReportTable[];
}

/**
 * Report table
 */
export interface ReportTable {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
}

/**
 * Report summary
 */
export interface ReportSummary {
  totalAssets: number;
  totalInvestors: number;
  totalTransactions: number;
  totalVolume: string;
  periodStart: string;
  periodEnd: string;
  jurisdictionBreakdown: Record<string, number>;
  investorTypeBreakdown: Record<string, number>;
}

/**
 * Compliance issue
 */
export interface ComplianceIssue {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  affectedEntities: string[];
  remediation: string;
}

// ============================================================================
// SDK INTERFACE
// ============================================================================

interface SDKInterface {
  assets: {
    get(id: string): Promise<{
      id: string;
      name: string;
      issuerId: string;
      jurisdiction?: { countryCode: string };
      typedMetadata?: Record<string, unknown>;
    } | null>;
    getAll(): { id: string; name: string; issuerId: string }[];
  };
  parties_: {
    get(id: string): {
      id: string;
      name: string;
      type: string;
      jurisdiction?: string;
      kycVerified?: boolean;
    } | undefined;
    getAll(): { id: string; name: string; type: string; jurisdiction?: string }[];
  };
  tokens: {
    getBalance(assetId: string, address: string): Promise<string>;
  };
}

// ============================================================================
// REGULATORY REPORTER
// ============================================================================

/**
 * Regulatory Reporter
 *
 * Generates jurisdiction-specific compliance reports.
 */
export class RegulatoryReporter {
  private reportHistory: Map<string, RegulatoryReport> = new Map();

  constructor(private sdk: SDKInterface) {}

  /**
   * Generate a regulatory report pack
   */
  async regulatoryPack(
    framework: ReportFramework,
    options: ReportOptions = {}
  ): Promise<Result<RegulatoryReport, string>> {
    const period = options.period || {
      from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date().toISOString(),
    };

    // Generate framework-specific report
    let report: RegulatoryReport;

    switch (framework) {
      // US SEC Reports
      case ReportFramework.SEC_FORM_D:
      case ReportFramework.SEC_FORM_D_506B:
      case ReportFramework.SEC_FORM_D_506C:
        report = await this.generateSECFormD(framework, options, period);
        break;

      case ReportFramework.SEC_REG_A:
        report = await this.generateSECRegA(options, period);
        break;

      case ReportFramework.SEC_REG_S:
        report = await this.generateSECRegS(options, period);
        break;

      // EU Reports
      case ReportFramework.MIFID_II:
        report = await this.generateMiFIDII(options, period);
        break;

      case ReportFramework.MICA:
        report = await this.generateMiCA(options, period);
        break;

      case ReportFramework.AMLD_6:
        report = await this.generateAMLD6(options, period);
        break;

      // UK Reports
      case ReportFramework.FCA_COBS:
        report = await this.generateFCACobs(options, period);
        break;

      case ReportFramework.FCA_CASS:
        report = await this.generateFCACass(options, period);
        break;

      // Singapore Reports
      case ReportFramework.MAS_CIS:
        report = await this.generateMASCIS(options, period);
        break;

      case ReportFramework.MAS_SFA:
        report = await this.generateMASSFA(options, period);
        break;

      // UAE Reports
      case ReportFramework.DFSA_REPORT:
        report = await this.generateDFSA(options, period);
        break;

      case ReportFramework.ADGM_FSMR:
        report = await this.generateADGM(options, period);
        break;

      case ReportFramework.SCA_REPORT:
        report = await this.generateSCA(options, period);
        break;

      // Switzerland
      case ReportFramework.FINMA_REPORT:
        report = await this.generateFINMA(options, period);
        break;

      // General Reports
      case ReportFramework.FATF_TRAVEL_RULE:
        report = await this.generateTravelRule(options, period);
        break;

      case ReportFramework.INVESTOR_REGISTER:
        report = await this.generateInvestorRegister(options, period);
        break;

      case ReportFramework.TRANSACTION_REPORT:
        report = await this.generateTransactionReport(options, period);
        break;

      case ReportFramework.AML_SAR:
        report = await this.generateSAR(options, period);
        break;

      case ReportFramework.TAX_WITHHOLDING:
        report = await this.generateTaxWithholding(options, period);
        break;

      default:
        return err(`Unsupported regulatory framework: ${framework}`);
    }

    this.reportHistory.set(report.id, report);
    return ok(report);
  }

  /**
   * Get previously generated report
   */
  getReport(reportId: string): RegulatoryReport | undefined {
    return this.reportHistory.get(reportId);
  }

  /**
   * List all generated reports
   */
  listReports(): RegulatoryReport[] {
    return Array.from(this.reportHistory.values());
  }

  // ============================================================================
  // US SEC REPORTS
  // ============================================================================

  private async generateSECFormD(
    framework: ReportFramework,
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    const asset = options.assetId ? await this.sdk.assets.get(options.assetId) : null;
    const investors = this.sdk.parties_.getAll().filter((p) => p.type === 'INDIVIDUAL');

    const accreditedCount = investors.filter((i) => {
      const party = this.sdk.parties_.get(i.id);
      return party?.kycVerified;
    }).length;

    const exemptionType =
      framework === ReportFramework.SEC_FORM_D_506B
        ? '506(b)'
        : framework === ReportFramework.SEC_FORM_D_506C
          ? '506(c)'
          : '506(b)';

    return {
      id: uuidv4(),
      framework,
      name: `SEC Form D - ${exemptionType}`,
      description: `Notice of Exempt Offering of Securities under Regulation D, Rule ${exemptionType}`,

      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },

      sections: [
        {
          id: 'issuer-info',
          title: 'Issuer Information',
          data: {
            issuerName: asset?.name || 'N/A',
            issuerType: 'Corporation',
            jurisdictionOfOrganization: asset?.jurisdiction?.countryCode || 'N/A',
            yearOfIncorporation: new Date().getFullYear(),
          },
        },
        {
          id: 'offering-info',
          title: 'Offering Information',
          data: {
            exemptionClaimed: exemptionType,
            federalExemptionsClaimed: ['Rule 506(b)', 'Section 4(a)(2)'],
            typeOfSecuritiesOffered: ['Equity', 'Tokenized Security'],
            businessCombinationTransaction: false,
          },
        },
        {
          id: 'offering-recipients',
          title: 'Recipients of Securities',
          data: {
            totalNumberAlreadyInvested: investors.length,
            totalNumberAccredited: accreditedCount,
            totalNumberNonAccredited: investors.length - accreditedCount,
          },
          tables: [
            {
              title: 'Investor Breakdown',
              headers: ['Category', 'Count', 'Percentage'],
              rows: [
                ['Accredited Investors', accreditedCount, `${Math.round((accreditedCount / Math.max(investors.length, 1)) * 100)}%`],
                ['Non-Accredited Investors', investors.length - accreditedCount, `${Math.round(((investors.length - accreditedCount) / Math.max(investors.length, 1)) * 100)}%`],
              ],
              totals: ['Total', investors.length, '100%'],
            },
          ],
        },
        {
          id: 'sales-compensation',
          title: 'Sales Compensation',
          data: {
            hasRecipients: false,
            brokerDealers: [],
            findersFees: '0',
          },
        },
      ],

      summary: this.generateSummary(options, period),

      compliance: {
        status: accreditedCount === investors.length ? 'COMPLIANT' : 'REVIEW_REQUIRED',
        issues:
          investors.length - accreditedCount > 35
            ? [
                {
                  code: 'SEC_506B_LIMIT',
                  severity: 'HIGH',
                  description: 'Rule 506(b) limits non-accredited investors to 35',
                  affectedEntities: ['offering'],
                  remediation: 'Consider Rule 506(c) which requires all accredited investors',
                },
              ]
            : [],
        recommendations: [
          'File Form D within 15 days of first sale',
          'Retain investor questionnaires for verification',
          'Update Form D if material changes occur',
        ],
      },

      filingData: {
        formType: 'D',
        isAmendment: false,
        dateOfFirstSale: period.from,
        exemptionType,
        totalOfferingAmount: '0', // Would come from offering
        totalAmountSold: '0',
        totalRemaining: '0',
        clarificationOfResponse: '',
      },
    };
  }

  private async generateSECRegA(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.SEC_REG_A,
      name: 'SEC Regulation A+ Report',
      description: 'Regulation A Tier 2 offering report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'offering-statement',
          title: 'Offering Statement',
          data: {
            tier: 'Tier 2',
            maxOfferingAmount: '75000000',
            investorLimits: '10% of greater of annual income or net worth',
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'Annual report required (Form 1-K)',
          'Semiannual report required (Form 1-SA)',
          'Current reports for material events (Form 1-U)',
        ],
      },
      filingData: { formType: '1-A', tier: 2 },
    };
  }

  private async generateSECRegS(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    const investors = this.sdk.parties_.getAll();
    const usInvestors = investors.filter((i) => i.jurisdiction === 'US');

    return {
      id: uuidv4(),
      framework: ReportFramework.SEC_REG_S,
      name: 'SEC Regulation S Report',
      description: 'Offshore offering compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'offshore-verification',
          title: 'Offshore Transaction Verification',
          data: {
            totalInvestors: investors.length,
            usPersons: usInvestors.length,
            nonUsPersons: investors.length - usInvestors.length,
            offerMadeInUS: false,
            directedSellingEffortsInUS: false,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: usInvestors.length === 0 ? 'COMPLIANT' : 'NON_COMPLIANT',
        issues:
          usInvestors.length > 0
            ? [
                {
                  code: 'REG_S_US_PERSON',
                  severity: 'CRITICAL',
                  description: 'Regulation S prohibits sales to U.S. persons',
                  affectedEntities: usInvestors.map((i) => i.id),
                  remediation: 'Rescind sales to U.S. persons or convert to Regulation D',
                },
              ]
            : [],
        recommendations: ['Maintain distribution compliance period records', 'Implement transfer restrictions for 40 days (Category 1) or 1 year (Category 3)'],
      },
      filingData: { category: 1, distributionCompliancePeriodDays: 40 },
    };
  }

  // ============================================================================
  // EU REPORTS
  // ============================================================================

  private async generateMiFIDII(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.MIFID_II,
      name: 'MiFID II Compliance Report',
      description: 'Markets in Financial Instruments Directive II compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'client-categorization',
          title: 'Client Categorization',
          data: {
            retailClients: 0,
            professionalClients: 0,
            eligibleCounterparties: 0,
          },
        },
        {
          id: 'best-execution',
          title: 'Best Execution',
          data: {
            executionVenues: [],
            qualityOfExecution: 'N/A',
          },
        },
        {
          id: 'transaction-reporting',
          title: 'Transaction Reporting',
          data: {
            reportableTransactions: 0,
            reportedOnTime: 0,
            lateReports: 0,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'Ensure T+1 transaction reporting to ARM',
          'Maintain client suitability assessments',
          'Provide costs and charges disclosure',
        ],
      },
      filingData: { armReportingRequired: true, tradingVenue: 'OTF' },
    };
  }

  private async generateMiCA(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.MICA,
      name: 'MiCA Compliance Report',
      description: 'Markets in Crypto-Assets Regulation compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'asset-classification',
          title: 'Crypto-Asset Classification',
          data: {
            assetType: 'Asset-Referenced Token',
            isStablecoin: false,
            isUtilityToken: false,
            isSecurityToken: true,
          },
        },
        {
          id: 'whitepaper',
          title: 'Crypto-Asset Whitepaper',
          data: {
            whitepaperPublished: false,
            ncaNotified: false,
            publicationDate: null,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'Publish crypto-asset whitepaper',
          'Notify National Competent Authority',
          'Implement market abuse prevention measures',
        ],
      },
      filingData: { requiresAuthorization: true, whitepaperRequired: true },
    };
  }

  private async generateAMLD6(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    const parties = this.sdk.parties_.getAll();
    const kycVerified = parties.filter((p) => {
      const party = this.sdk.parties_.get(p.id);
      return party?.kycVerified;
    }).length;

    return {
      id: uuidv4(),
      framework: ReportFramework.AMLD_6,
      name: 'AMLD 6 Compliance Report',
      description: '6th Anti-Money Laundering Directive compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'cdd',
          title: 'Customer Due Diligence',
          data: {
            totalCustomers: parties.length,
            cddCompleted: kycVerified,
            eddRequired: 0,
            pepScreening: kycVerified,
            sanctionsScreening: kycVerified,
          },
        },
        {
          id: 'suspicious-activity',
          title: 'Suspicious Activity',
          data: {
            sarsFiledThisperiod: 0,
            internalReportsGenerated: 0,
            escalatedToMLRO: 0,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: kycVerified === parties.length ? 'COMPLIANT' : 'NON_COMPLIANT',
        issues:
          kycVerified < parties.length
            ? [
                {
                  code: 'AMLD_CDD_INCOMPLETE',
                  severity: 'HIGH',
                  description: 'Customer due diligence not complete for all customers',
                  affectedEntities: parties.filter((p) => !this.sdk.parties_.get(p.id)?.kycVerified).map((p) => p.id),
                  remediation: 'Complete CDD for all customers before onboarding',
                },
              ]
            : [],
        recommendations: [
          'Maintain transaction monitoring',
          'Conduct periodic CDD reviews',
          'Train staff on AML procedures',
        ],
      },
      filingData: { mlroAppointed: true, amlPolicyInPlace: true },
    };
  }

  // ============================================================================
  // UK FCA REPORTS
  // ============================================================================

  private async generateFCACobs(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.FCA_COBS,
      name: 'FCA COBS Compliance Report',
      description: 'Conduct of Business Sourcebook compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'client-classification',
          title: 'Client Classification',
          data: {
            retailClients: 0,
            professionalClients: 0,
            electiveProfessional: 0,
          },
        },
        {
          id: 'appropriateness',
          title: 'Appropriateness Assessment',
          data: {
            assessmentsCompleted: 0,
            appropriateMatches: 0,
            warningsIssued: 0,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'Document client categorization decisions',
          'Maintain appropriateness test records',
          'Ensure fair, clear communications',
        ],
      },
      filingData: { cobsCompliant: true },
    };
  }

  private async generateFCACass(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.FCA_CASS,
      name: 'FCA CASS Report',
      description: 'Client Assets Sourcebook compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'client-money',
          title: 'Client Money',
          data: {
            clientMoneyHeld: '0',
            segregatedAccounts: 0,
            reconciliationFrequency: 'DAILY',
          },
        },
        {
          id: 'custody-assets',
          title: 'Custody Assets',
          data: {
            assetsUnderCustody: 0,
            thirdPartyCustodians: [],
            reconciliationStatus: 'CURRENT',
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: [
          'Maintain daily internal reconciliations',
          'Conduct external reconciliations as required',
          'Keep accurate client money calculation',
        ],
      },
      filingData: { cassAuditRequired: true, cmarSubmitted: false },
    };
  }

  // ============================================================================
  // SINGAPORE MAS REPORTS
  // ============================================================================

  private async generateMASCIS(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.MAS_CIS,
      name: 'MAS CIS Report',
      description: 'Collective Investment Schemes compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'scheme-details',
          title: 'Scheme Details',
          data: {
            schemeType: 'Restricted Scheme',
            authorizedScheme: false,
            restrictedScheme: true,
            minimumInvestment: '200000',
          },
        },
        {
          id: 'investor-qualification',
          title: 'Investor Qualification',
          data: {
            accreditedInvestors: 0,
            institutionalInvestors: 0,
            relevantPersons: 0,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'Maintain records of investor qualification',
          'File annual returns with MAS',
          'Ensure prospectus exemption conditions met',
        ],
      },
      filingData: { masLicenseRequired: false, exemptionUsed: 'Section 305' },
    };
  }

  private async generateMASSFA(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.MAS_SFA,
      name: 'MAS SFA Report',
      description: 'Securities and Futures Act compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'capital-markets-services',
          title: 'Capital Markets Services',
          data: {
            activitiesConducted: ['Dealing in Securities'],
            cmsLicenseHeld: false,
            exemptionReliedUpon: 'Section 272B',
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: ['Review CMS license requirements', 'Maintain transaction records for 5 years'],
      },
      filingData: { sfaCompliant: true },
    };
  }

  // ============================================================================
  // UAE REPORTS
  // ============================================================================

  private async generateDFSA(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    const investors = this.sdk.parties_.getAll();

    return {
      id: uuidv4(),
      framework: ReportFramework.DFSA_REPORT,
      name: 'DFSA Compliance Report',
      description: 'Dubai Financial Services Authority compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'client-classification',
          title: 'Client Classification (COB 2.3)',
          data: {
            retailClients: investors.filter((i) => i.type === 'INDIVIDUAL').length,
            professionalClients: investors.filter((i) => i.type === 'ORGANIZATION').length,
            marketCounterparties: 0,
          },
        },
        {
          id: 'financial-promotions',
          title: 'Financial Promotions (COB 3)',
          data: {
            promotionsMade: 0,
            dfscApproved: true,
            exemptPromotions: 0,
          },
        },
        {
          id: 'aml-compliance',
          title: 'AML Compliance (AML Module)',
          data: {
            customersOnboarded: investors.length,
            cddCompleted: investors.filter((i) => this.sdk.parties_.get(i.id)?.kycVerified).length,
            sarsField: 0,
            riskAssessmentUpdated: true,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: [
          'Submit PIB returns as required',
          'Maintain compliance arrangements (GEN 5.3)',
          'Update business risk assessment annually',
        ],
      },
      filingData: {
        dfsaLicenseCategory: 'Category 3C',
        pibReturnsSubmitted: true,
        complianceOfficerAppointed: true,
        mlroAppointed: true,
      },
    };
  }

  private async generateADGM(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.ADGM_FSMR,
      name: 'ADGM FSMR Report',
      description: 'Abu Dhabi Global Market Financial Services and Markets Regulations report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'regulatory-status',
          title: 'Regulatory Status',
          data: {
            fspLicenseHeld: true,
            activitiesAuthorized: ['Dealing in Investments', 'Arranging Deals in Investments'],
            clientCategories: ['Professional Client'],
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: ['Submit annual returns to FSRA', 'Maintain adequate financial resources'],
      },
      filingData: { fsraAuthorized: true },
    };
  }

  private async generateSCA(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.SCA_REPORT,
      name: 'SCA Compliance Report',
      description: 'Securities and Commodities Authority (UAE) compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'securities-activities',
          title: 'Securities Activities',
          data: {
            licensedActivities: [],
            tradingVolume: '0',
            clientsServed: 0,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: ['Ensure SCA license covers activities', 'Submit periodic reports as required'],
      },
      filingData: { scaLicensed: false },
    };
  }

  // ============================================================================
  // SWITZERLAND REPORTS
  // ============================================================================

  private async generateFINMA(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.FINMA_REPORT,
      name: 'FINMA Compliance Report',
      description: 'Swiss Financial Market Supervisory Authority compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'token-classification',
          title: 'Token Classification (FINMA Guidelines)',
          data: {
            tokenType: 'Asset Token',
            isPaymentToken: false,
            isUtilityToken: false,
            isAssetToken: true,
            securitiesLawApplicable: true,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'Obtain FINMA no-action letter if needed',
          'Comply with prospectus requirements under FinSA',
          'Register with admission office if publicly offered',
        ],
      },
      filingData: { finmaClassification: 'Asset Token', prospectusRequired: true },
    };
  }

  // ============================================================================
  // GENERAL REPORTS
  // ============================================================================

  private async generateTravelRule(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.FATF_TRAVEL_RULE,
      name: 'FATF Travel Rule Compliance Report',
      description: 'Virtual Asset Service Provider travel rule compliance',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'travel-rule-compliance',
          title: 'Travel Rule Compliance',
          data: {
            transactionsAboveThreshold: 0,
            originatorInfoCollected: 0,
            beneficiaryInfoCollected: 0,
            counterpartyVASPsVerified: 0,
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: [
          'Implement TRISA or similar protocol',
          'Collect originator/beneficiary info for transfers > $1000/€1000',
          'Verify counterparty VASP registration',
        ],
      },
      filingData: { travelRuleProtocol: 'TRISA', thresholdUSD: 1000 },
    };
  }

  private async generateInvestorRegister(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    const investors = this.sdk.parties_.getAll();

    const byJurisdiction: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const inv of investors) {
      const jurisdiction = inv.jurisdiction || 'UNKNOWN';
      byJurisdiction[jurisdiction] = (byJurisdiction[jurisdiction] || 0) + 1;
      byType[inv.type] = (byType[inv.type] || 0) + 1;
    }

    return {
      id: uuidv4(),
      framework: ReportFramework.INVESTOR_REGISTER,
      name: 'Investor Register',
      description: 'Complete investor registry report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'investor-summary',
          title: 'Investor Summary',
          data: {
            totalInvestors: investors.length,
            byJurisdiction,
            byType,
          },
          tables: [
            {
              title: 'Investors by Jurisdiction',
              headers: ['Jurisdiction', 'Count'],
              rows: Object.entries(byJurisdiction).map(([j, c]) => [j, c]),
            },
            {
              title: 'Investors by Type',
              headers: ['Type', 'Count'],
              rows: Object.entries(byType).map(([t, c]) => [t, c]),
            },
          ],
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: ['Update register within 14 days of changes', 'Maintain for minimum 7 years'],
      },
      filingData: { registerMaintained: true, lastUpdated: new Date().toISOString() },
    };
  }

  private async generateTransactionReport(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.TRANSACTION_REPORT,
      name: 'Transaction Report',
      description: 'Comprehensive transaction report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'transaction-summary',
          title: 'Transaction Summary',
          data: {
            totalTransactions: 0,
            totalVolume: '0',
            averageSize: '0',
            largestTransaction: '0',
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: ['Archive transaction data for regulatory retention period'],
      },
      filingData: {},
    };
  }

  private async generateSAR(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.AML_SAR,
      name: 'Suspicious Activity Report Template',
      description: 'SAR/STR filing template',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'sar-template',
          title: 'SAR Filing Information',
          data: {
            filingInstitution: '',
            suspiciousActivity: '',
            subjectsInvolved: [],
            amountInvolved: '0',
            dateOfActivity: '',
            narrative: '',
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'REVIEW_REQUIRED',
        issues: [],
        recommendations: [
          'File SAR within 30 days of detection',
          'Do not tip off subject of SAR',
          'Maintain SAR records for 5 years',
        ],
      },
      filingData: { sarRequired: false },
    };
  }

  private async generateTaxWithholding(
    options: ReportOptions,
    period: { from: string; to: string }
  ): Promise<RegulatoryReport> {
    return {
      id: uuidv4(),
      framework: ReportFramework.TAX_WITHHOLDING,
      name: 'Tax Withholding Report',
      description: 'Withholding tax compliance report',
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'TokenisationSDK',
        version: '1.0',
        period,
        assetId: options.assetId,
      },
      sections: [
        {
          id: 'withholding-summary',
          title: 'Withholding Summary',
          data: {
            totalDistributions: '0',
            totalWithheld: '0',
            byJurisdiction: {},
          },
        },
      ],
      summary: this.generateSummary(options, period),
      compliance: {
        status: 'COMPLIANT',
        issues: [],
        recommendations: [
          'Collect W-8/W-9 forms as applicable',
          'Apply correct treaty rates',
          'Remit withholdings to tax authorities',
        ],
      },
      filingData: { w8Collected: 0, w9Collected: 0 },
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private generateSummary(options: ReportOptions, period: { from: string; to: string }): ReportSummary {
    const assets = this.sdk.assets.getAll();
    const parties = this.sdk.parties_.getAll();

    const jurisdictionBreakdown: Record<string, number> = {};
    const investorTypeBreakdown: Record<string, number> = {};

    for (const party of parties) {
      const j = party.jurisdiction || 'UNKNOWN';
      jurisdictionBreakdown[j] = (jurisdictionBreakdown[j] || 0) + 1;
      investorTypeBreakdown[party.type] = (investorTypeBreakdown[party.type] || 0) + 1;
    }

    return {
      totalAssets: assets.length,
      totalInvestors: parties.length,
      totalTransactions: 0,
      totalVolume: '0',
      periodStart: period.from,
      periodEnd: period.to,
      jurisdictionBreakdown,
      investorTypeBreakdown,
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a regulatory reporter
 */
export function createRegulatoryReporter(sdk: SDKInterface): RegulatoryReporter {
  return new RegulatoryReporter(sdk);
}
