/**
 * VARAConditionEvaluator - UAE VARA compliance condition evaluator
 *
 * This evaluator handles custom conditions for VARA (Virtual Assets Regulatory Authority)
 * compliance requirements for Dubai tokenized assets:
 *
 * - VARA_COMPLIANCE_VERIFIED: Verifies VASP license and compliance framework
 * - VARA_REPORTING_ACTIVE: Confirms regulatory reporting is set up
 *
 * VARA Requirements Reference:
 * - Virtual Assets and Related Activities Regulations 2023
 * - VARA Rulebook for Virtual Asset Service Providers
 */

import type {
  ICustomConditionEvaluator,
  CustomConditionContext,
  CustomConditionResult,
} from '@tokenisation/core';

/**
 * VARA Compliance Status
 */
export type VARAComplianceStatus = 'COMPLIANT' | 'PENDING' | 'REMEDIATION' | 'SUSPENDED' | 'REVOKED';

/**
 * VARA Risk Category
 */
export type VARARiskCategory = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * VARA compliance check result
 */
export interface VARAComplianceCheckResult {
  varaLicenseNumber: string;
  varaLicenseValid: boolean;
  varaLicenseExpiry: string;
  complianceStatus: VARAComplianceStatus;
  riskCategory: VARARiskCategory;
  amlComplianceScore: number; // 0-100
  lastAuditDate?: string;
  findings: string[];
  warnings: string[];
  verifiedAt: string;
}

/**
 * VARA Service Provider interface (for dependency injection)
 */
export interface IVARAServiceProvider {
  /**
   * Verify VASP license status
   */
  verifyLicense(licenseNumber: string): Promise<{
    valid: boolean;
    expiryDate: string;
    status: VARAComplianceStatus;
    holder: string;
  }>;

  /**
   * Check compliance framework status
   */
  checkComplianceStatus(licenseNumber: string): Promise<{
    status: VARAComplianceStatus;
    riskCategory: VARARiskCategory;
    amlScore: number;
    lastAuditDate?: string;
    findings: string[];
  }>;

  /**
   * Verify reporting setup
   */
  verifyReportingSetup(licenseNumber: string, assetId: string): Promise<{
    configured: boolean;
    reportingTypes: string[];
    nextReportDue?: string;
    lastReportSubmitted?: string;
  }>;
}

/**
 * Configuration for VARA Condition Evaluator
 */
export interface VARAConditionEvaluatorConfig {
  /** VARA Service Provider (optional - uses mock in dev mode if not provided) */
  varaServiceProvider?: IVARAServiceProvider;
  /** Minimum required AML compliance score (0-100) */
  minimumAmlScore?: number;
  /** Whether to allow PENDING compliance status */
  allowPendingStatus?: boolean;
  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;
}

/**
 * Mock VARA Service Provider for development/testing
 */
class MockVARAServiceProvider implements IVARAServiceProvider {
  async verifyLicense(licenseNumber: string): Promise<{
    valid: boolean;
    expiryDate: string;
    status: VARAComplianceStatus;
    holder: string;
  }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Mock validation - license starting with 'VARA-' is valid
    const valid = licenseNumber.startsWith('VARA-');
    const now = new Date();
    const expiryDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    return {
      valid,
      expiryDate: expiryDate.toISOString(),
      status: valid ? 'COMPLIANT' : 'SUSPENDED',
      holder: 'Mock Token Issuer Ltd',
    };
  }

  async checkComplianceStatus(licenseNumber: string): Promise<{
    status: VARAComplianceStatus;
    riskCategory: VARARiskCategory;
    amlScore: number;
    lastAuditDate?: string;
    findings: string[];
  }> {
    await new Promise(resolve => setTimeout(resolve, 100));

    const valid = licenseNumber.startsWith('VARA-');

    return {
      status: valid ? 'COMPLIANT' : 'PENDING',
      riskCategory: 'MEDIUM',
      amlScore: valid ? 85 : 50,
      lastAuditDate: valid ? new Date().toISOString() : undefined,
      findings: valid ? [] : ['AML framework incomplete', 'Source of funds documentation pending'],
    };
  }

  async verifyReportingSetup(licenseNumber: string, assetId: string): Promise<{
    configured: boolean;
    reportingTypes: string[];
    nextReportDue?: string;
    lastReportSubmitted?: string;
  }> {
    await new Promise(resolve => setTimeout(resolve, 100));

    const valid = licenseNumber.startsWith('VARA-');
    const now = new Date();
    const nextQuarter = new Date(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3) * 3, 1);

    return {
      configured: valid,
      reportingTypes: valid
        ? ['investor_summary', 'transaction_summary', 'aml_sar', 'complaints_register']
        : [],
      nextReportDue: valid ? nextQuarter.toISOString() : undefined,
      lastReportSubmitted: valid ? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString() : undefined,
    };
  }
}

/**
 * VARA Condition Evaluator
 *
 * Evaluates UAE VARA regulatory compliance conditions for the
 * dubai-real-estate.pack.ts lifecycle rules.
 */
export class VARAConditionEvaluator implements ICustomConditionEvaluator {
  readonly evaluatorId = 'vara-condition-evaluator';
  readonly supportedConditions = [
    'VARA_COMPLIANCE_VERIFIED',
    'VARA_REPORTING_ACTIVE',
  ];

  private varaService: IVARAServiceProvider;
  private minimumAmlScore: number;
  private allowPendingStatus: boolean;
  private cache: Map<string, { result: VARAComplianceCheckResult; cachedAt: number }> = new Map();
  private cacheTtlMs: number;

  constructor(config: VARAConditionEvaluatorConfig = {}) {
    if (!config.varaServiceProvider && typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
      throw new Error('VARAConditionEvaluator: real varaServiceProvider is required in production -- mock is not allowed');
    }
    this.varaService = config.varaServiceProvider ?? new MockVARAServiceProvider();
    this.minimumAmlScore = config.minimumAmlScore ?? 70; // Default 70% AML score required
    this.allowPendingStatus = config.allowPendingStatus ?? false;
    this.cacheTtlMs = config.cacheTtlMs ?? 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check if this evaluator supports a condition
   */
  supports(conditionName: string): boolean {
    return this.supportedConditions.includes(conditionName);
  }

  /**
   * Evaluate a VARA custom condition
   */
  async evaluate(
    conditionName: string,
    context: CustomConditionContext
  ): Promise<CustomConditionResult> {
    if (!this.supports(conditionName)) {
      return {
        satisfied: false,
        reason: `Unsupported condition: ${conditionName}`,
      };
    }

    // Extract VARA-specific metadata
    const varaLicenseNumber = context.asset.metadata?.varaLicenseNumber as string | undefined;

    if (!varaLicenseNumber) {
      return {
        satisfied: false,
        reason: 'Asset metadata must include varaLicenseNumber for VARA compliance verification',
      };
    }

    switch (conditionName) {
      case 'VARA_COMPLIANCE_VERIFIED':
        return this.evaluateComplianceVerified(context, varaLicenseNumber);
      case 'VARA_REPORTING_ACTIVE':
        return this.evaluateReportingActive(context, varaLicenseNumber);
      default:
        return { satisfied: false, reason: `Unknown condition: ${conditionName}` };
    }
  }

  /**
   * Evaluate VARA_COMPLIANCE_VERIFIED condition
   *
   * Verifies that:
   * 1. VASP license is valid and not expired
   * 2. Compliance status is COMPLIANT (or PENDING if allowed)
   * 3. AML score meets minimum threshold
   */
  private async evaluateComplianceVerified(
    context: CustomConditionContext,
    varaLicenseNumber: string
  ): Promise<CustomConditionResult> {
    // Check cache
    const cacheKey = `compliance:${varaLicenseNumber}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return this.buildComplianceResult(cached);
    }

    try {
      // Step 1: Verify license
      const license = await this.varaService.verifyLicense(varaLicenseNumber);

      if (!license.valid) {
        return {
          satisfied: false,
          reason: `VARA license '${varaLicenseNumber}' is not valid. Status: ${license.status}`,
          evidence: { license },
        };
      }

      // Check expiry
      const expiryDate = new Date(license.expiryDate);
      const now = new Date();
      if (expiryDate < now) {
        return {
          satisfied: false,
          reason: `VARA license '${varaLicenseNumber}' expired on ${license.expiryDate}`,
          evidence: { license },
        };
      }

      // Step 2: Check compliance status
      const compliance = await this.varaService.checkComplianceStatus(varaLicenseNumber);

      if (compliance.status !== 'COMPLIANT') {
        if (compliance.status === 'PENDING' && this.allowPendingStatus) {
          // Allow with warning
        } else {
          return {
            satisfied: false,
            reason: `VARA compliance status is '${compliance.status}'. Required: COMPLIANT`,
            evidence: { license, compliance },
            warnings: compliance.findings,
          };
        }
      }

      // Step 3: Check AML score
      if (compliance.amlScore < this.minimumAmlScore) {
        return {
          satisfied: false,
          reason: `AML compliance score ${compliance.amlScore}% is below minimum ${this.minimumAmlScore}%`,
          evidence: { license, compliance },
          warnings: compliance.findings,
        };
      }

      // Build and cache result
      const result: VARAComplianceCheckResult = {
        varaLicenseNumber,
        varaLicenseValid: true,
        varaLicenseExpiry: license.expiryDate,
        complianceStatus: compliance.status,
        riskCategory: compliance.riskCategory,
        amlComplianceScore: compliance.amlScore,
        lastAuditDate: compliance.lastAuditDate,
        findings: compliance.findings,
        warnings: compliance.status === 'PENDING' ? ['PENDING status - requires monitoring'] : [],
        verifiedAt: new Date().toISOString(),
      };

      this.setCache(cacheKey, result);

      return this.buildComplianceResult(result);
    } catch (error) {
      return {
        satisfied: false,
        reason: `VARA compliance verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Evaluate VARA_REPORTING_ACTIVE condition
   *
   * Verifies that:
   * 1. Regulatory reporting is configured
   * 2. Required report types are set up
   */
  private async evaluateReportingActive(
    context: CustomConditionContext,
    varaLicenseNumber: string
  ): Promise<CustomConditionResult> {
    try {
      const reporting = await this.varaService.verifyReportingSetup(varaLicenseNumber, context.assetId);

      if (!reporting.configured) {
        return {
          satisfied: false,
          reason: 'VARA regulatory reporting is not configured for this asset',
          evidence: { reporting },
        };
      }

      // Check required report types
      const requiredTypes = ['investor_summary', 'transaction_summary', 'aml_sar'];
      const missingTypes = requiredTypes.filter(t => !reporting.reportingTypes.includes(t));

      if (missingTypes.length > 0) {
        return {
          satisfied: false,
          reason: `Missing required VARA report types: ${missingTypes.join(', ')}`,
          evidence: { reporting, missingTypes },
        };
      }

      return {
        satisfied: true,
        evidence: {
          reporting,
          verificationSource: 'vara_api',
          verifiedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        satisfied: false,
        reason: `VARA reporting verification failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Build compliance result from check result
   */
  private buildComplianceResult(result: VARAComplianceCheckResult): CustomConditionResult {
    const warnings = [...result.warnings];

    // Add warnings for upcoming expiry (within 30 days)
    const expiryDate = new Date(result.varaLicenseExpiry);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 30) {
      warnings.push(`VARA license expires in ${daysUntilExpiry} days - renewal required`);
    }

    // Add warnings for AML score below 80%
    if (result.amlComplianceScore < 80 && result.amlComplianceScore >= this.minimumAmlScore) {
      warnings.push(`AML score ${result.amlComplianceScore}% is below recommended 80% threshold`);
    }

    return {
      satisfied: true,
      evidence: {
        varaLicenseNumber: result.varaLicenseNumber,
        varaLicenseExpiry: result.varaLicenseExpiry,
        complianceStatus: result.complianceStatus,
        riskCategory: result.riskCategory,
        amlComplianceScore: result.amlComplianceScore,
        verificationSource: 'vara_api',
        verifiedAt: result.verifiedAt,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Get cached result
   */
  private getCached(key: string): VARAComplianceCheckResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.cachedAt > this.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  /**
   * Set cached result
   */
  private setCache(key: string, result: VARAComplianceCheckResult): void {
    this.cache.set(key, { result, cachedAt: Date.now() });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
