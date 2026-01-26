/**
 * MockCompliancePlugin
 *
 * A mock implementation of ICompliancePlugin for testing and MVP.
 * Simulates KYC verification and compliance checks.
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
 * Mock compliance plugin configuration
 */
export interface MockComplianceConfig {
  /** Default KYC status for unknown parties */
  defaultKycPassed?: boolean;

  /** Whether to require KYC for all transfers */
  requireKycForTransfers?: boolean;

  /** Maximum investor count per asset */
  maxInvestorCount?: number;

  /** Whether accredited investor status is required */
  requireAccreditation?: boolean;

  /** Blocked regions (ISO country codes) */
  blockedRegions?: string[];
}

/**
 * MockCompliancePlugin implementation
 */
export class MockCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'mock-compliance';

  private partyStatuses: Map<string, PartyComplianceStatus> = new Map();
  private frozenParties: Set<string> = new Set();
  private config: Required<MockComplianceConfig>;

  constructor(config: MockComplianceConfig = {}) {
    this.config = {
      defaultKycPassed: true,
      requireKycForTransfers: true,
      maxInvestorCount: 500,
      requireAccreditation: false,
      blockedRegions: [],
      ...config,
    };
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
    if (this.frozenParties.has(context.from)) {
      violations.push({
        ruleId: 'FROZEN_SENDER',
        ruleName: 'Frozen Account Check',
        severity: 'ERROR',
        message: 'Sender account is frozen',
      });
    }

    // Check if receiver is frozen
    if (this.frozenParties.has(context.to)) {
      violations.push({
        ruleId: 'FROZEN_RECEIVER',
        ruleName: 'Frozen Account Check',
        severity: 'ERROR',
        message: 'Receiver account is frozen',
      });
    }

    // Check sender KYC
    if (this.config.requireKycForTransfers && !fromStatus.kycVerified) {
      violations.push({
        ruleId: 'SENDER_KYC',
        ruleName: 'KYC Verification',
        severity: 'ERROR',
        message: 'Sender has not completed KYC verification',
      });
    }

    // Check receiver KYC
    if (this.config.requireKycForTransfers && !toStatus.kycVerified) {
      violations.push({
        ruleId: 'RECEIVER_KYC',
        ruleName: 'KYC Verification',
        severity: 'ERROR',
        message: 'Receiver has not completed KYC verification',
      });
    }

    // Check KYC expiry for sender
    if (fromStatus.kycExpiryDate) {
      const expiry = new Date(fromStatus.kycExpiryDate);
      if (expiry < new Date()) {
        violations.push({
          ruleId: 'SENDER_KYC_EXPIRED',
          ruleName: 'KYC Expiry Check',
          severity: 'ERROR',
          message: 'Sender KYC has expired',
        });
      } else if (expiry.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000) {
        warnings.push('Sender KYC will expire within 30 days');
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
    for (const region of toStatus.restrictedJurisdictions) {
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
    if (this.frozenParties.has(partyId)) {
      violations.push({
        ruleId: 'FROZEN_PARTY',
        ruleName: 'Frozen Account Check',
        severity: 'ERROR',
        message: 'Party account is frozen',
      });
    }

    // Check KYC if required
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
    if (status.restrictedJurisdictions.includes(assetJurisdiction)) {
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
      case 'MAX_INVESTORS':
        const currentCount = context['investorCount'] as number;
        if (currentCount >= this.config.maxInvestorCount) {
          violations.push({
            ruleId: 'MAX_INVESTORS',
            ruleName: 'Maximum Investor Count',
            severity: 'ERROR',
            message: `Maximum investor count (${this.config.maxInvestorCount}) reached`,
          });
        }
        break;

      case 'LOCKUP_PERIOD':
        const lockupEnd = context['lockupEnd'] as Date;
        if (lockupEnd && lockupEnd > new Date()) {
          violations.push({
            ruleId: 'LOCKUP_PERIOD',
            ruleName: 'Lockup Period',
            severity: 'ERROR',
            message: `Asset is in lockup until ${lockupEnd.toISOString()}`,
          });
        }
        break;

      default:
        // Unknown rule - pass by default in mock
        break;
    }

    return {
      compliant: violations.length === 0,
      violations,
      warnings,
    };
  }

  /**
   * Get compliance status for a party
   */
  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    // Check if we have stored status
    const stored = this.partyStatuses.get(partyId);
    if (stored) {
      return stored;
    }

    // Return default status
    return {
      partyId,
      kycVerified: this.config.defaultKycPassed,
      accreditedInvestor: false,
      restrictedJurisdictions: this.config.blockedRegions,
    };
  }

  /**
   * Update compliance status for a party
   */
  async updatePartyStatus(
    partyId: string,
    status: Partial<PartyComplianceStatus>
  ): Promise<Result<void, string>> {
    const existing = this.partyStatuses.get(partyId) || {
      partyId,
      kycVerified: false,
      accreditedInvestor: false,
      restrictedJurisdictions: [],
    };

    this.partyStatuses.set(partyId, {
      ...existing,
      ...status,
    });

    return ok(undefined);
  }

  /**
   * Freeze a party's assets
   */
  async freezeParty(
    partyId: string,
    until?: string,
    reason?: string
  ): Promise<Result<void, string>> {
    this.frozenParties.add(partyId);

    // Update status
    const existing = await this.getPartyStatus(partyId);
    if (existing) {
      await this.updatePartyStatus(partyId, {
        frozenUntil: until,
      });
    }

    return ok(undefined);
  }

  /**
   * Unfreeze a party
   */
  async unfreezeParty(partyId: string): Promise<Result<void, string>> {
    this.frozenParties.delete(partyId);

    // Update status
    const existing = await this.getPartyStatus(partyId);
    if (existing) {
      await this.updatePartyStatus(partyId, {
        frozenUntil: undefined,
      });
    }

    return ok(undefined);
  }

  /**
   * Set KYC verified for a party (convenience method for testing)
   */
  setKycVerified(
    partyId: string,
    verified: boolean,
    expiryDate?: string
  ): void {
    const existing = this.partyStatuses.get(partyId) || {
      partyId,
      kycVerified: false,
      accreditedInvestor: false,
      restrictedJurisdictions: [],
    };

    this.partyStatuses.set(partyId, {
      ...existing,
      kycVerified: verified,
      kycExpiryDate: expiryDate,
    });
  }

  /**
   * Set accredited investor status
   */
  setAccreditedInvestor(partyId: string, accredited: boolean): void {
    const existing = this.partyStatuses.get(partyId) || {
      partyId,
      kycVerified: false,
      accreditedInvestor: false,
      restrictedJurisdictions: [],
    };

    this.partyStatuses.set(partyId, {
      ...existing,
      accreditedInvestor: accredited,
    });
  }

  /**
   * Check if party is frozen
   */
  isPartyFrozen(partyId: string): boolean {
    return this.frozenParties.has(partyId);
  }

  /**
   * Clear all party statuses (for testing)
   */
  clear(): void {
    this.partyStatuses.clear();
    this.frozenParties.clear();
  }
}

/**
 * Create a default mock compliance plugin
 */
export function createMockCompliancePlugin(): MockCompliancePlugin {
  return new MockCompliancePlugin({
    defaultKycPassed: true,
    requireKycForTransfers: true,
    maxInvestorCount: 500,
    requireAccreditation: false,
    blockedRegions: ['KP', 'IR', 'CU', 'SY'],
  });
}
