/**
 * MockJurisdictionPlugin
 *
 * A mock implementation of IJurisdictionPlugin for testing and MVP.
 * Supports configurable allow/deny rules per jurisdiction.
 */

import type {
  IJurisdictionPlugin,
  JurisdictionCheckResult,
} from '../../core/interfaces.js';
import type { RightModel, TransferContext, Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';

/**
 * Configuration for jurisdiction rules
 */
export interface MockJurisdictionRule {
  /** Allowed asset types */
  allowedAssetTypes?: string[];

  /** Blocked asset types */
  blockedAssetTypes?: string[];

  /** Required documents for asset creation */
  requiredDocuments?: string[];

  /** Whether accredited investor status is required */
  requireAccreditation?: boolean;

  /** Minimum investment amount (as string for BigNumber) */
  minimumInvestment?: string;

  /** Maximum investor count */
  maxInvestorCount?: number;
}

/**
 * Mock jurisdiction plugin configuration
 */
export interface MockJurisdictionConfig {
  /** Map of jurisdiction code to rules */
  rules?: Record<string, MockJurisdictionRule>;

  /** Default behavior when jurisdiction not found */
  defaultAllow?: boolean;

  /** Globally blocked jurisdictions */
  blockedJurisdictions?: string[];
}

/**
 * MockJurisdictionPlugin implementation
 */
export class MockJurisdictionPlugin implements IJurisdictionPlugin {
  readonly pluginId = 'mock-jurisdiction';
  readonly supportedJurisdictions: string[];

  private rules: Record<string, MockJurisdictionRule>;
  private defaultAllow: boolean;
  private blockedJurisdictions: Set<string>;

  constructor(config: MockJurisdictionConfig = {}) {
    this.rules = config.rules || {};
    this.defaultAllow = config.defaultAllow ?? true;
    this.blockedJurisdictions = new Set(config.blockedJurisdictions || []);
    this.supportedJurisdictions = Object.keys(this.rules);
  }

  /**
   * Check if an asset can be created in a jurisdiction
   */
  async canCreateAsset(asset: RightModel): Promise<JurisdictionCheckResult> {
    const jurisdictionCode = asset.jurisdiction.countryCode;

    // Check if jurisdiction is globally blocked
    if (this.blockedJurisdictions.has(jurisdictionCode)) {
      return {
        allowed: false,
        reason: `Jurisdiction ${jurisdictionCode} is blocked`,
        restrictions: [`Blocked jurisdiction: ${jurisdictionCode}`],
      };
    }

    // Get rules for this jurisdiction
    const rule = this.rules[jurisdictionCode];

    // If no rules defined, use default behavior
    if (!rule) {
      return {
        allowed: this.defaultAllow,
        reason: this.defaultAllow
          ? undefined
          : `No rules defined for jurisdiction ${jurisdictionCode}`,
      };
    }

    // Check blocked asset types
    if (rule.blockedAssetTypes?.includes(asset.rightType)) {
      return {
        allowed: false,
        reason: `Asset type ${asset.rightType} is not allowed in ${jurisdictionCode}`,
        restrictions: [`Blocked asset type: ${asset.rightType}`],
      };
    }

    // Check allowed asset types (if specified)
    if (
      rule.allowedAssetTypes &&
      !rule.allowedAssetTypes.includes(asset.rightType)
    ) {
      return {
        allowed: false,
        reason: `Asset type ${asset.rightType} is not in allowed list for ${jurisdictionCode}`,
        restrictions: [
          `Allowed types: ${rule.allowedAssetTypes.join(', ')}`,
        ],
      };
    }

    return {
      allowed: true,
      requiredDocuments: rule.requiredDocuments,
    };
  }

  /**
   * Check if a transfer is allowed between jurisdictions
   */
  async canTransfer(
    context: TransferContext,
    fromJurisdiction: string,
    toJurisdiction: string
  ): Promise<JurisdictionCheckResult> {
    // Check if either jurisdiction is blocked
    if (this.blockedJurisdictions.has(fromJurisdiction)) {
      return {
        allowed: false,
        reason: `Source jurisdiction ${fromJurisdiction} is blocked`,
      };
    }

    if (this.blockedJurisdictions.has(toJurisdiction)) {
      return {
        allowed: false,
        reason: `Target jurisdiction ${toJurisdiction} is blocked`,
      };
    }

    // Check minimum investment for target jurisdiction
    const targetRule = this.rules[toJurisdiction];
    if (targetRule?.minimumInvestment) {
      const minAmount = BigInt(targetRule.minimumInvestment);
      const transferAmount = BigInt(context.amount);

      if (transferAmount < minAmount) {
        return {
          allowed: false,
          reason: `Transfer amount below minimum for ${toJurisdiction}`,
          restrictions: [
            `Minimum investment: ${targetRule.minimumInvestment}`,
          ],
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Get required documents for a jurisdiction
   */
  getRequiredDocuments(jurisdictionCode: string, _assetType: string): string[] {
    const rule = this.rules[jurisdictionCode];
    return rule?.requiredDocuments || [];
  }

  /**
   * Validate jurisdiction-specific metadata
   */
  async validateMetadata(asset: RightModel): Promise<Result<void, string>> {
    const jurisdictionCode = asset.jurisdiction.countryCode;
    const rule = this.rules[jurisdictionCode];

    // For MVP, just check if accreditation is required
    if (rule?.requireAccreditation && !asset.jurisdiction.accreditedOnly) {
      return err(
        `Jurisdiction ${jurisdictionCode} requires accredited investors only`
      );
    }

    return ok(undefined);
  }

  /**
   * Add a jurisdiction rule
   */
  addRule(jurisdictionCode: string, rule: MockJurisdictionRule): void {
    this.rules[jurisdictionCode] = rule;
    if (!this.supportedJurisdictions.includes(jurisdictionCode)) {
      (this.supportedJurisdictions as string[]).push(jurisdictionCode);
    }
  }

  /**
   * Block a jurisdiction
   */
  blockJurisdiction(jurisdictionCode: string): void {
    this.blockedJurisdictions.add(jurisdictionCode);
  }

  /**
   * Unblock a jurisdiction
   */
  unblockJurisdiction(jurisdictionCode: string): void {
    this.blockedJurisdictions.delete(jurisdictionCode);
  }
}

/**
 * Create a default mock jurisdiction plugin with common rules
 */
export function createMockJurisdictionPlugin(): MockJurisdictionPlugin {
  return new MockJurisdictionPlugin({
    rules: {
      // UAE - permissive, supports all types
      AE: {
        allowedAssetTypes: ['OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION'],
        requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
      },
      // US - more restrictive
      US: {
        allowedAssetTypes: ['OWNERSHIP', 'ACCESS'],
        requiredDocuments: ['SSN', 'PROOF_OF_ADDRESS', 'ACCREDITATION_CERT'],
        requireAccreditation: true,
      },
      // EU - standard
      EU: {
        allowedAssetTypes: ['OWNERSHIP', 'ACCESS', 'VERIFICATION'],
        requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
      },
      // Singapore
      SG: {
        allowedAssetTypes: ['OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION'],
        requiredDocuments: ['NRIC', 'PROOF_OF_ADDRESS'],
      },
    },
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'], // Sanctioned countries
    defaultAllow: false,
  });
}
