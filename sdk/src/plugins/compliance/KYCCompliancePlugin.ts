/**
 * KYC Compliance Plugin
 *
 * Production compliance plugin that integrates with real KYC providers
 * and maintains compliance state for parties.
 */

import type {
  ICompliancePlugin,
  ComplianceCheckResult,
  ComplianceViolation,
  PartyComplianceStatus,
} from '../../core/interfaces.js';
import type { RightModel, TransferContext, Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';

/**
 * KYC Provider types
 */
export type KYCProvider = 'sumsub' | 'onfido' | 'jumio' | 'persona' | 'manual';

/**
 * KYC verification level
 */
export type KYCLevel = 1 | 2 | 3;

/**
 * KYC verification status from provider
 */
export interface KYCVerificationResult {
  applicantId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  level: KYCLevel;
  provider: KYCProvider;
  verifiedAt?: string;
  expiresAt?: string;
  rejectionReason?: string;
  documents?: {
    type: string;
    status: 'verified' | 'rejected' | 'pending';
  }[];
  riskScore?: number;
  sanctionsMatch?: boolean;
  pepMatch?: boolean;
}

/**
 * Plugin configuration
 */
export interface KYCCompliancePluginConfig {
  /** Backend API endpoint for KYC operations */
  apiEndpoint: string;

  /** API key for authentication */
  apiKey: string;

  /** Default required KYC level */
  defaultRequiredLevel?: KYCLevel;

  /** Whether to require KYC for all transfers */
  requireKycForTransfers?: boolean;

  /** Maximum investor count per asset */
  maxInvestorCount?: number;

  /** Whether accredited status is required globally */
  requireAccreditation?: boolean;

  /** Blocked regions (ISO country codes) */
  blockedRegions?: string[];

  /** KYC expiry warning days */
  expiryWarningDays?: number;

  /** Whether to auto-refresh KYC status from provider */
  autoRefresh?: boolean;

  /** Cache TTL in seconds */
  cacheTtlSeconds?: number;
}

/**
 * Cached party status
 */
interface CachedStatus {
  status: PartyComplianceStatus;
  expiresAt: number;
}

/**
 * KYC Compliance Plugin
 */
export class KYCCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'kyc-compliance';

  private config: Required<KYCCompliancePluginConfig>;
  private statusCache: Map<string, CachedStatus> = new Map();
  private frozenParties: Set<string> = new Set();

  constructor(config: KYCCompliancePluginConfig) {
    this.config = {
      defaultRequiredLevel: 1,
      requireKycForTransfers: true,
      maxInvestorCount: 2000,
      requireAccreditation: false,
      blockedRegions: ['KP', 'IR', 'CU', 'SY', 'RU', 'BY'],
      expiryWarningDays: 30,
      autoRefresh: true,
      cacheTtlSeconds: 300,
      ...config,
    };
  }

  /**
   * Fetch party status from backend API
   */
  private async fetchPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/compliance/parties/${partyId}`, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        partyId,
        kycVerified: data.kycVerified || false,
        kycExpiryDate: data.kycExpiryDate,
        accreditedInvestor: data.accreditedInvestor || false,
        restrictedJurisdictions: data.restrictedJurisdictions || [],
        frozenUntil: data.frozenUntil,
      };
    } catch (error) {
      console.error(`Failed to fetch party status for ${partyId}:`, error);
      return null;
    }
  }

  /**
   * Get party status (with caching)
   */
  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    // Check cache
    const cached = this.statusCache.get(partyId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.status;
    }

    // Fetch from API
    const status = await this.fetchPartyStatus(partyId);

    if (status) {
      // Cache the result
      this.statusCache.set(partyId, {
        status,
        expiresAt: Date.now() + this.config.cacheTtlSeconds * 1000,
      });
    }

    return status;
  }

  /**
   * Evaluate if a transfer is compliant
   */
  async evaluateTransfer(
    context: TransferContext,
    fromStatus: PartyComplianceStatus,
    toStatus: PartyComplianceStatus
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Check if sender is frozen
    if (this.frozenParties.has(context.from) || fromStatus.frozenUntil) {
      const frozenUntil = fromStatus.frozenUntil;
      if (!frozenUntil || new Date(frozenUntil) > new Date()) {
        violations.push({
          ruleId: 'FROZEN_SENDER',
          ruleName: 'Frozen Account Check',
          severity: 'ERROR',
          message: 'Sender account is frozen',
        });
      }
    }

    // Check if receiver is frozen
    if (this.frozenParties.has(context.to) || toStatus.frozenUntil) {
      const frozenUntil = toStatus.frozenUntil;
      if (!frozenUntil || new Date(frozenUntil) > new Date()) {
        violations.push({
          ruleId: 'FROZEN_RECEIVER',
          ruleName: 'Frozen Account Check',
          severity: 'ERROR',
          message: 'Receiver account is frozen',
        });
      }
    }

    // Check sender KYC
    if (this.config.requireKycForTransfers) {
      if (!fromStatus.kycVerified) {
        violations.push({
          ruleId: 'SENDER_KYC_REQUIRED',
          ruleName: 'KYC Verification',
          severity: 'ERROR',
          message: 'Sender has not completed KYC verification',
          metadata: { remediation: 'Complete KYC verification at the verification portal' },
        });
      }

      if (!toStatus.kycVerified) {
        violations.push({
          ruleId: 'RECEIVER_KYC_REQUIRED',
          ruleName: 'KYC Verification',
          severity: 'ERROR',
          message: 'Receiver has not completed KYC verification',
        });
      }
    }

    // Check KYC expiry
    if (fromStatus.kycExpiryDate) {
      const expiry = new Date(fromStatus.kycExpiryDate);
      const now = new Date();

      if (expiry < now) {
        violations.push({
          ruleId: 'SENDER_KYC_EXPIRED',
          ruleName: 'KYC Expiry Check',
          severity: 'ERROR',
          message: 'Sender KYC has expired',
          metadata: { remediation: 'Renew KYC verification' },
        });
      } else {
        const daysUntilExpiry = Math.floor(
          (expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        );
        if (daysUntilExpiry <= this.config.expiryWarningDays) {
          warnings.push(`Sender KYC will expire in ${daysUntilExpiry} days`);
        }
      }
    }

    // Check accreditation if required
    if (this.config.requireAccreditation) {
      if (!fromStatus.accreditedInvestor) {
        violations.push({
          ruleId: 'SENDER_ACCREDITATION',
          ruleName: 'Accreditation Check',
          severity: 'ERROR',
          message: 'Sender is not an accredited investor',
        });
      }
      if (!toStatus.accreditedInvestor) {
        violations.push({
          ruleId: 'RECEIVER_ACCREDITATION',
          ruleName: 'Accreditation Check',
          severity: 'ERROR',
          message: 'Receiver is not an accredited investor',
        });
      }
    }

    // Check blocked regions
    for (const region of toStatus.restrictedJurisdictions || []) {
      if (this.config.blockedRegions.includes(region)) {
        violations.push({
          ruleId: 'BLOCKED_REGION',
          ruleName: 'Regional Restriction',
          severity: 'ERROR',
          message: `Transfer to blocked region: ${region}`,
        });
      }
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Check if a party can hold an asset
   */
  async canHoldAsset(
    partyId: string,
    asset: RightModel,
    status: PartyComplianceStatus
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Check if party is frozen
    if (this.frozenParties.has(partyId) || status.frozenUntil) {
      violations.push({
        ruleId: 'FROZEN_PARTY',
        ruleName: 'Frozen Account Check',
        severity: 'ERROR',
        message: 'Party account is frozen',
      });
    }

    // Check KYC if required by asset
    if (asset.transferabilityRules.requireKyc && !status.kycVerified) {
      violations.push({
        ruleId: 'KYC_REQUIRED',
        ruleName: 'KYC Verification',
        severity: 'ERROR',
        message: 'Asset requires KYC verification',
      });
    }

    // Check accreditation for ownership assets
    if (
      asset.rightType === 'OWNERSHIP' &&
      asset.jurisdiction.accreditedOnly &&
      !status.accreditedInvestor
    ) {
      violations.push({
        ruleId: 'ACCREDITATION_REQUIRED',
        ruleName: 'Accreditation Check',
        severity: 'ERROR',
        message: 'Asset requires accredited investor status',
      });
    }

    // Check jurisdiction restrictions
    const assetJurisdiction = asset.jurisdiction.countryCode;
    if (status.restrictedJurisdictions?.includes(assetJurisdiction)) {
      violations.push({
        ruleId: 'JURISDICTION_RESTRICTED',
        ruleName: 'Jurisdiction Check',
        severity: 'ERROR',
        message: `Party is restricted from jurisdiction ${assetJurisdiction}`,
      });
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Check a specific policy rule
   */
  async checkPolicy(
    ruleId: string,
    context: Record<string, unknown>
  ): Promise<ComplianceCheckResult> {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    switch (ruleId) {
      case 'MAX_INVESTORS': {
        const currentCount = context['investorCount'] as number;
        if (currentCount >= this.config.maxInvestorCount) {
          violations.push({
            ruleId: 'MAX_INVESTORS',
            ruleName: 'Maximum Investor Count',
            severity: 'ERROR',
            message: `Maximum investor count (${this.config.maxInvestorCount}) reached`,
          });
        } else if (currentCount >= this.config.maxInvestorCount * 0.9) {
          warnings.push(
            `Approaching investor limit: ${currentCount}/${this.config.maxInvestorCount}`
          );
        }
        break;
      }

      case 'LOCKUP_PERIOD': {
        const lockupEnd = context['lockupEnd'] as Date | string;
        if (lockupEnd) {
          const endDate = typeof lockupEnd === 'string' ? new Date(lockupEnd) : lockupEnd;
          if (endDate > new Date()) {
            violations.push({
              ruleId: 'LOCKUP_PERIOD',
              ruleName: 'Lockup Period',
              severity: 'ERROR',
              message: `Asset is in lockup until ${endDate.toISOString()}`,
            });
          }
        }
        break;
      }

      case 'DAILY_TRANSFER_LIMIT': {
        const dailyAmount = context['dailyTransferAmount'] as number;
        const limit = context['dailyLimit'] as number;
        if (dailyAmount > limit) {
          violations.push({
            ruleId: 'DAILY_TRANSFER_LIMIT',
            ruleName: 'Daily Transfer Limit',
            severity: 'ERROR',
            message: `Daily transfer limit exceeded: ${dailyAmount} > ${limit}`,
          });
        }
        break;
      }

      default:
        // Unknown rule - log warning but pass
        warnings.push(`Unknown policy rule: ${ruleId}`);
        break;
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Update party status via API
   */
  async updatePartyStatus(
    partyId: string,
    status: Partial<PartyComplianceStatus>
  ): Promise<Result<void, string>> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/compliance/parties/${partyId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(status),
      });

      if (!response.ok) {
        return err(`Failed to update party status: ${response.status}`);
      }

      // Invalidate cache
      this.statusCache.delete(partyId);

      return ok(undefined);
    } catch (error) {
      return err(`API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Freeze a party
   */
  async freezeParty(
    partyId: string,
    until?: string,
    reason?: string
  ): Promise<Result<void, string>> {
    this.frozenParties.add(partyId);

    // Update via API
    return this.updatePartyStatus(partyId, {
      frozenUntil: until,
    });
  }

  /**
   * Unfreeze a party
   */
  async unfreezeParty(partyId: string): Promise<Result<void, string>> {
    this.frozenParties.delete(partyId);

    return this.updatePartyStatus(partyId, {
      frozenUntil: undefined,
    });
  }

  /**
   * Initiate KYC verification for a party
   */
  async initiateKYC(
    partyId: string,
    level: KYCLevel,
    provider: KYCProvider = 'sumsub'
  ): Promise<Result<{ sessionUrl: string; sessionId: string }, string>> {
    try {
      const response = await fetch(`${this.config.apiEndpoint}/kyc/session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partyId,
          level,
          provider,
        }),
      });

      if (!response.ok) {
        return err(`Failed to initiate KYC: ${response.status}`);
      }

      const data = await response.json();
      return ok({
        sessionUrl: data.sessionUrl,
        sessionId: data.sessionId,
      });
    } catch (error) {
      return err(`API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check KYC verification result
   */
  async checkKYCResult(applicantId: string): Promise<Result<KYCVerificationResult, string>> {
    try {
      const response = await fetch(
        `${this.config.apiEndpoint}/kyc/verification/${applicantId}`,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        return err(`Failed to check KYC result: ${response.status}`);
      }

      const data = await response.json();
      return ok(data as KYCVerificationResult);
    } catch (error) {
      return err(`API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear status cache
   */
  clearCache(): void {
    this.statusCache.clear();
  }

  /**
   * Get cached status count
   */
  getCacheStats(): { size: number; hits: number } {
    return {
      size: this.statusCache.size,
      hits: 0, // Would need to track this
    };
  }
}

/**
 * Create a KYC compliance plugin
 */
export function createKYCCompliancePlugin(
  apiEndpoint: string,
  apiKey: string,
  options?: Partial<KYCCompliancePluginConfig>
): KYCCompliancePlugin {
  return new KYCCompliancePlugin({
    apiEndpoint,
    apiKey,
    ...options,
  });
}
