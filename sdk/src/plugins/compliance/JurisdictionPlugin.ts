/**
 * Production Jurisdiction Plugin
 *
 * Configurable jurisdiction rules supporting:
 * - Static configuration (for known regulatory frameworks)
 * - API-based rules (for dynamic updates)
 * - OFAC/sanctions integration
 */

import type {
  IJurisdictionPlugin,
  JurisdictionCheckResult,
} from '../../core/interfaces.js';
import type { RightModel, TransferContext, Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';

/**
 * Regulatory framework definitions
 */
export type RegulatoryFramework =
  | 'UAE_VARA'
  | 'UAE_ADGM'
  | 'UAE_DIFC'
  | 'US_SEC'
  | 'US_FINRA'
  | 'EU_MiFID'
  | 'EU_MiCA'
  | 'SG_MAS'
  | 'UK_FCA'
  | 'CUSTOM';

/**
 * Jurisdiction rule definition
 */
export interface JurisdictionRule {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;

  /** Regulatory framework */
  framework?: RegulatoryFramework;

  /** Allowed asset/right types */
  allowedRightTypes?: string[];

  /** Blocked asset/right types */
  blockedRightTypes?: string[];

  /** Required KYC level (1-3) */
  requiredKycLevel?: number;

  /** Whether accredited investor status is required */
  requireAccreditation?: boolean;

  /** Minimum investment amount in USD */
  minimumInvestmentUSD?: number;

  /** Maximum investor count (0 = unlimited) */
  maxInvestorCount?: number;

  /** Required documents for onboarding */
  requiredDocuments?: string[];

  /** Holding period in days before transfer allowed */
  holdingPeriodDays?: number;

  /** Whether this jurisdiction is fully blocked */
  blocked?: boolean;

  /** Block reason if blocked */
  blockReason?: string;
}

/**
 * Sanctions list entry
 */
export interface SanctionsEntry {
  /** Country code */
  countryCode: string;

  /** Source (OFAC, UN, EU, etc.) */
  source: string;

  /** When added */
  addedAt: string;

  /** Reason */
  reason?: string;
}

/**
 * Plugin configuration
 */
export interface JurisdictionPluginConfig {
  /** Static rules by country code */
  rules?: Record<string, JurisdictionRule>;

  /** API endpoint for dynamic rules (optional) */
  rulesApiEndpoint?: string;

  /** API key for rules API */
  rulesApiKey?: string;

  /** Sanctioned countries (auto-blocked) */
  sanctionedCountries?: SanctionsEntry[];

  /** Default behavior for unknown jurisdictions */
  defaultAllow?: boolean;

  /** Cache TTL for API rules in seconds */
  cacheTtlSeconds?: number;

  /** Whether to fail-closed (deny if API unavailable) */
  failClosed?: boolean;
}

/**
 * Default sanctioned countries (OFAC primary list)
 */
const DEFAULT_SANCTIONS: SanctionsEntry[] = [
  { countryCode: 'KP', source: 'OFAC', addedAt: '2008-06-26', reason: 'North Korea' },
  { countryCode: 'IR', source: 'OFAC', addedAt: '1979-11-14', reason: 'Iran' },
  { countryCode: 'CU', source: 'OFAC', addedAt: '1962-02-07', reason: 'Cuba' },
  { countryCode: 'SY', source: 'OFAC', addedAt: '2011-08-18', reason: 'Syria' },
  { countryCode: 'RU', source: 'OFAC', addedAt: '2022-02-24', reason: 'Russia (partial)' },
  { countryCode: 'BY', source: 'OFAC', addedAt: '2022-02-24', reason: 'Belarus' },
];

/**
 * Default regulatory framework rules
 */
const FRAMEWORK_RULES: Record<RegulatoryFramework, Partial<JurisdictionRule>> = {
  UAE_VARA: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION'],
    requiredKycLevel: 2,
    requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS', 'SOURCE_OF_FUNDS'],
  },
  UAE_ADGM: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS'],
    requiredKycLevel: 2,
    requireAccreditation: true,
    minimumInvestmentUSD: 50000,
    requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS', 'ACCREDITATION_CERT'],
  },
  UAE_DIFC: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS', 'VERIFICATION'],
    requiredKycLevel: 2,
    requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
  },
  US_SEC: {
    allowedRightTypes: ['OWNERSHIP'],
    requiredKycLevel: 3,
    requireAccreditation: true,
    maxInvestorCount: 2000,
    holdingPeriodDays: 365,
    requiredDocuments: ['SSN', 'PROOF_OF_ADDRESS', 'ACCREDITATION_CERT', 'W9'],
  },
  US_FINRA: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS'],
    requiredKycLevel: 2,
    requiredDocuments: ['SSN', 'PROOF_OF_ADDRESS'],
  },
  EU_MiFID: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS', 'VERIFICATION'],
    requiredKycLevel: 2,
    requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
  },
  EU_MiCA: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION'],
    requiredKycLevel: 2,
    requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
  },
  SG_MAS: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS'],
    requiredKycLevel: 2,
    requireAccreditation: true,
    minimumInvestmentUSD: 200000,
    requiredDocuments: ['NRIC', 'PROOF_OF_ADDRESS', 'ACCREDITATION_CERT'],
  },
  UK_FCA: {
    allowedRightTypes: ['OWNERSHIP', 'ACCESS', 'VERIFICATION'],
    requiredKycLevel: 2,
    requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
  },
  CUSTOM: {},
};

/**
 * Production Jurisdiction Plugin
 */
export class JurisdictionPlugin implements IJurisdictionPlugin {
  readonly pluginId = 'jurisdiction';
  readonly supportedJurisdictions: string[];

  private rules: Map<string, JurisdictionRule> = new Map();
  private sanctions: Map<string, SanctionsEntry> = new Map();
  private config: JurisdictionPluginConfig;
  private rulesCache: Map<string, { rule: JurisdictionRule; expiresAt: number }> = new Map();

  constructor(config: JurisdictionPluginConfig = {}) {
    this.config = {
      defaultAllow: false, // Fail-closed by default for security
      cacheTtlSeconds: 300, // 5 minutes
      failClosed: true,
      ...config,
    };

    // Load static rules
    if (config.rules) {
      for (const [code, rule] of Object.entries(config.rules)) {
        this.rules.set(code, { ...rule, countryCode: code });
      }
    }

    // Load sanctions
    const sanctionsList = config.sanctionedCountries || DEFAULT_SANCTIONS;
    for (const entry of sanctionsList) {
      this.sanctions.set(entry.countryCode, entry);
    }

    this.supportedJurisdictions = Array.from(this.rules.keys());
  }

  /**
   * Get rule for a jurisdiction (with caching for API rules)
   */
  private async getRule(countryCode: string): Promise<JurisdictionRule | null> {
    // Check static rules first
    if (this.rules.has(countryCode)) {
      return this.rules.get(countryCode)!;
    }

    // Check cache
    const cached = this.rulesCache.get(countryCode);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rule;
    }

    // Fetch from API if configured
    if (this.config.rulesApiEndpoint) {
      try {
        const response = await fetch(
          `${this.config.rulesApiEndpoint}/jurisdictions/${countryCode}`,
          {
            headers: this.config.rulesApiKey
              ? { Authorization: `Bearer ${this.config.rulesApiKey}` }
              : {},
          }
        );

        if (response.ok) {
          const rule = (await response.json()) as JurisdictionRule;
          this.rulesCache.set(countryCode, {
            rule,
            expiresAt: Date.now() + (this.config.cacheTtlSeconds || 300) * 1000,
          });
          return rule;
        }
      } catch (error) {
        console.error(`Failed to fetch jurisdiction rules for ${countryCode}:`, error);
        if (this.config.failClosed) {
          return { countryCode, blocked: true, blockReason: 'Unable to verify jurisdiction' };
        }
      }
    }

    return null;
  }

  /**
   * Check if jurisdiction is sanctioned
   */
  private isSanctioned(countryCode: string): SanctionsEntry | null {
    return this.sanctions.get(countryCode) || null;
  }

  /**
   * Check if an asset can be created in a jurisdiction
   */
  async canCreateAsset(asset: RightModel): Promise<JurisdictionCheckResult> {
    const countryCode = asset.jurisdiction.countryCode;

    // Check sanctions first
    const sanction = this.isSanctioned(countryCode);
    if (sanction) {
      return {
        allowed: false,
        reason: `Jurisdiction ${countryCode} is sanctioned (${sanction.source}: ${sanction.reason})`,
        restrictions: [`Sanctioned by ${sanction.source}`],
      };
    }

    // Get jurisdiction rules
    const rule = await this.getRule(countryCode);

    if (!rule) {
      return {
        allowed: this.config.defaultAllow || false,
        reason: this.config.defaultAllow
          ? undefined
          : `No rules defined for jurisdiction ${countryCode}`,
      };
    }

    // Check if blocked
    if (rule.blocked) {
      return {
        allowed: false,
        reason: rule.blockReason || `Jurisdiction ${countryCode} is blocked`,
      };
    }

    // Check blocked right types
    if (rule.blockedRightTypes?.includes(asset.rightType)) {
      return {
        allowed: false,
        reason: `Right type ${asset.rightType} is not allowed in ${countryCode}`,
        restrictions: [`Blocked right type: ${asset.rightType}`],
      };
    }

    // Check allowed right types
    if (rule.allowedRightTypes && !rule.allowedRightTypes.includes(asset.rightType)) {
      return {
        allowed: false,
        reason: `Right type ${asset.rightType} is not in allowed list for ${countryCode}`,
        restrictions: [`Allowed types: ${rule.allowedRightTypes.join(', ')}`],
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
    // Check sanctions for both parties
    const fromSanction = this.isSanctioned(fromJurisdiction);
    if (fromSanction) {
      return {
        allowed: false,
        reason: `Source jurisdiction ${fromJurisdiction} is sanctioned`,
      };
    }

    const toSanction = this.isSanctioned(toJurisdiction);
    if (toSanction) {
      return {
        allowed: false,
        reason: `Target jurisdiction ${toJurisdiction} is sanctioned`,
      };
    }

    // Get target jurisdiction rules
    const targetRule = await this.getRule(toJurisdiction);

    if (targetRule) {
      // Check minimum investment
      if (targetRule.minimumInvestmentUSD) {
        const transferAmount = BigInt(context.amount);
        // Note: In production, convert to USD using oracle
        const minAmount = BigInt(targetRule.minimumInvestmentUSD * 1e18);
        if (transferAmount < minAmount) {
          return {
            allowed: false,
            reason: `Transfer amount below minimum for ${toJurisdiction}`,
            restrictions: [`Minimum investment: $${targetRule.minimumInvestmentUSD}`],
          };
        }
      }

      // Check holding period
      if (targetRule.holdingPeriodDays && targetRule.holdingPeriodDays > 0) {
        // Note: Caller should provide acquisition date in context
        const acquisitionDate = context.metadata?.acquisitionDate as string | undefined;
        if (acquisitionDate) {
          const holdingDays = Math.floor(
            (Date.now() - new Date(acquisitionDate).getTime()) / (24 * 60 * 60 * 1000)
          );
          if (holdingDays < targetRule.holdingPeriodDays) {
            return {
              allowed: false,
              reason: `Holding period not met for ${toJurisdiction}`,
              restrictions: [
                `Required: ${targetRule.holdingPeriodDays} days, Current: ${holdingDays} days`,
              ],
            };
          }
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Get required documents for a jurisdiction
   */
  getRequiredDocuments(jurisdictionCode: string, _assetType: string): string[] {
    const rule = this.rules.get(jurisdictionCode);
    return rule?.requiredDocuments || [];
  }

  /**
   * Validate jurisdiction-specific metadata
   */
  async validateMetadata(asset: RightModel): Promise<Result<void, string>> {
    const countryCode = asset.jurisdiction.countryCode;
    const rule = await this.getRule(countryCode);

    if (!rule) {
      if (!this.config.defaultAllow) {
        return err(`No jurisdiction rules for ${countryCode}`);
      }
      return ok(undefined);
    }

    // Check accreditation requirement
    if (rule.requireAccreditation && !asset.jurisdiction.accreditedOnly) {
      return err(`Jurisdiction ${countryCode} requires accredited investors only`);
    }

    return ok(undefined);
  }

  /**
   * Add a jurisdiction rule
   */
  addRule(rule: JurisdictionRule): void {
    this.rules.set(rule.countryCode, rule);
    if (!this.supportedJurisdictions.includes(rule.countryCode)) {
      (this.supportedJurisdictions as string[]).push(rule.countryCode);
    }
  }

  /**
   * Add rules based on regulatory framework
   */
  addFrameworkRules(countryCode: string, framework: RegulatoryFramework): void {
    const baseRule = FRAMEWORK_RULES[framework];
    this.addRule({
      countryCode,
      framework,
      ...baseRule,
    });
  }

  /**
   * Add a sanctions entry
   */
  addSanction(entry: SanctionsEntry): void {
    this.sanctions.set(entry.countryCode, entry);
  }

  /**
   * Remove a sanctions entry
   */
  removeSanction(countryCode: string): void {
    this.sanctions.delete(countryCode);
  }

  /**
   * Check if a country is sanctioned
   */
  isCountrySanctioned(countryCode: string): boolean {
    return this.sanctions.has(countryCode);
  }

  /**
   * Get all sanctioned countries
   */
  getSanctionedCountries(): SanctionsEntry[] {
    return Array.from(this.sanctions.values());
  }
}

/**
 * Create a jurisdiction plugin with common configurations
 */
export function createJurisdictionPlugin(
  config?: JurisdictionPluginConfig
): JurisdictionPlugin {
  const plugin = new JurisdictionPlugin(config);

  // Add common framework rules
  plugin.addFrameworkRules('AE', 'UAE_VARA');
  plugin.addFrameworkRules('US', 'US_SEC');
  plugin.addFrameworkRules('GB', 'UK_FCA');
  plugin.addFrameworkRules('SG', 'SG_MAS');
  plugin.addFrameworkRules('DE', 'EU_MiFID');
  plugin.addFrameworkRules('FR', 'EU_MiFID');

  return plugin;
}
