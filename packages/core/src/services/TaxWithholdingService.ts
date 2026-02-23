/**
 * Tax Withholding Service
 *
 * Calculates and applies tax withholding on distributions based on:
 * - Investor jurisdiction
 * - Distribution type (dividend, interest, royalty, rent)
 * - Tax treaty benefits
 * - Investor exemptions
 *
 * Integrates with the CashFlow module to automatically calculate net payouts.
 */

import { v4 as uuidv4 } from 'uuid';

export enum DistributionTaxType {
  DIVIDEND = 'DIVIDEND',
  INTEREST = 'INTEREST',
  ROYALTY = 'ROYALTY',
  RENT = 'RENT',
  CAPITAL_GAIN = 'CAPITAL_GAIN',
  REVENUE_SHARE = 'REVENUE_SHARE',
  YIELD = 'YIELD',
}

export interface WithholdingRate {
  type: DistributionTaxType;
  rate: number; // Percentage (e.g., 30 for 30%)
}

export interface TaxJurisdictionRule {
  id: string;
  jurisdictions: string[]; // ISO country codes or '*' for default
  description: string;
  rates: Record<DistributionTaxType | string, number>;
  conditions?: WithholdingCondition[];
  exemptions?: WithholdingExemption[];
  forms?: string[];
}

export interface WithholdingCondition {
  field: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: unknown;
  rateOverride?: Partial<Record<DistributionTaxType | string, number>>;
}

export interface WithholdingExemption {
  field: string;
  op: 'eq' | 'neq' | 'in';
  value: unknown;
  reason: string;
  rateOverride?: Partial<Record<DistributionTaxType | string, number>>;
}

export interface InvestorTaxProfile {
  investorId: string;
  countryCode: string;
  taxTreatyCountry?: boolean;
  type?: 'individual' | 'institutional' | 'qualified_intermediary';
  w8BenValid?: boolean;
  ukResident?: boolean;
  exemptions?: string[];
  taxId?: string;
  certifications?: string[];
}

export interface WithholdingCalculation {
  id: string;
  investorId: string;
  distributionId: string;
  grossAmount: string;
  withholdingAmount: string;
  netAmount: string;
  withholdingRate: number;
  taxType: DistributionTaxType;
  jurisdiction: string;
  ruleApplied: string;
  exemptionApplied?: string;
  conditionApplied?: string;
  timestamp: string;
  currency: string;
}

export interface TaxReport {
  investorId: string;
  year: number;
  jurisdiction: string;
  distributions: Array<{
    distributionId: string;
    date: string;
    grossAmount: string;
    withholdingAmount: string;
    netAmount: string;
    taxType: DistributionTaxType;
    rate: number;
  }>;
  totalGross: string;
  totalWithholding: string;
  totalNet: string;
  currency: string;
  generatedAt: string;
}

export interface TaxWithholdingConfig {
  jurisdictionRules: TaxJurisdictionRule[];
  defaultRate: number;
  roundingMode: 'HALF_UP' | 'HALF_DOWN' | 'FLOOR' | 'CEILING';
  decimalPlaces: number;
  minimumWithholding: string;
}

/**
 * Tax Withholding Service
 */
export class TaxWithholdingService {
  private rules: Map<string, TaxJurisdictionRule> = new Map();
  private calculations: Map<string, WithholdingCalculation> = new Map();
  private investorProfiles: Map<string, InvestorTaxProfile> = new Map();
  private defaultRate: number;
  private roundingMode: 'HALF_UP' | 'HALF_DOWN' | 'FLOOR' | 'CEILING';
  private decimalPlaces: number;
  private minimumWithholding: bigint;

  constructor(config?: Partial<TaxWithholdingConfig>) {
    this.defaultRate = config?.defaultRate || 30;
    this.roundingMode = config?.roundingMode || 'HALF_UP';
    this.decimalPlaces = config?.decimalPlaces || 2;
    this.minimumWithholding = this.parseAmount(config?.minimumWithholding || '0.01');

    if (config?.jurisdictionRules) {
      for (const rule of config.jurisdictionRules) {
        this.rules.set(rule.id, rule);
      }
    } else {
      this.loadDefaultRules();
    }
  }

  private loadDefaultRules(): void {
    const defaultRules: TaxJurisdictionRule[] = [
      {
        id: 'uae_no_withholding',
        jurisdictions: ['AE', 'BH', 'QA', 'KW', 'OM'],
        description: 'GCC countries - No withholding tax',
        rates: {
          DIVIDEND: 0,
          INTEREST: 0,
          ROYALTY: 0,
          RENT: 0,
          CAPITAL_GAIN: 0,
          REVENUE_SHARE: 0,
          YIELD: 0,
        },
      },
      {
        id: 'us_withholding',
        jurisdictions: ['US'],
        description: 'United States - Standard withholding',
        rates: {
          DIVIDEND: 30,
          INTEREST: 30,
          ROYALTY: 30,
          RENT: 30,
          CAPITAL_GAIN: 0,
          REVENUE_SHARE: 30,
          YIELD: 30,
        },
        conditions: [
          {
            field: 'taxTreatyCountry',
            op: 'eq',
            value: true,
            rateOverride: { DIVIDEND: 15, INTEREST: 0 },
          },
        ],
        exemptions: [
          {
            field: 'w8BenValid',
            op: 'eq',
            value: true,
            reason: 'Valid W-8BEN on file',
            rateOverride: { DIVIDEND: 15 },
          },
        ],
        forms: ['W-8BEN', 'W-8BEN-E', 'W-9'],
      },
      {
        id: 'hk_no_withholding',
        jurisdictions: ['HK', 'SG'],
        description: 'Hong Kong / Singapore - No withholding',
        rates: {
          DIVIDEND: 0,
          INTEREST: 0,
          ROYALTY: 0,
          RENT: 0,
          CAPITAL_GAIN: 0,
          REVENUE_SHARE: 0,
          YIELD: 0,
        },
      },
      {
        id: 'eu_standard',
        jurisdictions: ['DE', 'FR', 'IT', 'ES', 'NL'],
        description: 'EU Standard withholding',
        rates: {
          DIVIDEND: 25,
          INTEREST: 0,
          ROYALTY: 0,
          RENT: 0,
          CAPITAL_GAIN: 0,
          REVENUE_SHARE: 25,
          YIELD: 0,
        },
      },
      {
        id: 'default',
        jurisdictions: ['*'],
        description: 'Default withholding for unlisted jurisdictions',
        rates: {
          DIVIDEND: 30,
          INTEREST: 30,
          ROYALTY: 30,
          RENT: 30,
          CAPITAL_GAIN: 0,
          REVENUE_SHARE: 30,
          YIELD: 30,
        },
      },
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }
  }

  // ============================================
  // INVESTOR PROFILE MANAGEMENT
  // ============================================

  /**
   * Register or update investor tax profile
   */
  setInvestorProfile(profile: InvestorTaxProfile): void {
    this.investorProfiles.set(profile.investorId, profile);
  }

  /**
   * Get investor tax profile
   */
  getInvestorProfile(investorId: string): InvestorTaxProfile | undefined {
    return this.investorProfiles.get(investorId);
  }

  // ============================================
  // WITHHOLDING CALCULATION
  // ============================================

  /**
   * Calculate withholding for a distribution
   */
  calculateWithholding(params: {
    investorId: string;
    distributionId: string;
    grossAmount: string;
    taxType: DistributionTaxType;
    currency: string;
    overrideJurisdiction?: string;
  }): WithholdingCalculation {
    const profile = this.investorProfiles.get(params.investorId);
    const jurisdiction = params.overrideJurisdiction || profile?.countryCode || 'UNKNOWN';

    // Find applicable rule
    const { rule, rate, exemption, condition } = this.findApplicableRule(
      jurisdiction,
      params.taxType,
      profile
    );

    // Calculate amounts
    const grossAmount = this.parseAmount(params.grossAmount);
    const withholdingAmount = this.calculateAmount(grossAmount, rate);
    const netAmount = grossAmount - withholdingAmount;

    const calculation: WithholdingCalculation = {
      id: uuidv4(),
      investorId: params.investorId,
      distributionId: params.distributionId,
      grossAmount: params.grossAmount,
      withholdingAmount: this.formatAmount(withholdingAmount),
      netAmount: this.formatAmount(netAmount),
      withholdingRate: rate,
      taxType: params.taxType,
      jurisdiction,
      ruleApplied: rule?.id || 'default',
      exemptionApplied: exemption,
      conditionApplied: condition,
      timestamp: new Date().toISOString(),
      currency: params.currency,
    };

    this.calculations.set(calculation.id, calculation);
    return calculation;
  }

  /**
   * Calculate withholding for multiple investors (batch)
   */
  calculateBatchWithholding(params: {
    distributionId: string;
    payouts: Array<{
      investorId: string;
      grossAmount: string;
    }>;
    taxType: DistributionTaxType;
    currency: string;
  }): WithholdingCalculation[] {
    return params.payouts.map(payout =>
      this.calculateWithholding({
        investorId: payout.investorId,
        distributionId: params.distributionId,
        grossAmount: payout.grossAmount,
        taxType: params.taxType,
        currency: params.currency,
      })
    );
  }

  private findApplicableRule(
    jurisdiction: string,
    taxType: DistributionTaxType,
    profile?: InvestorTaxProfile
  ): {
    rule: TaxJurisdictionRule | undefined;
    rate: number;
    exemption?: string;
    condition?: string;
  } {
    // Find specific rule for jurisdiction
    let matchedRule: TaxJurisdictionRule | undefined;

    for (const rule of this.rules.values()) {
      if (
        rule.jurisdictions.includes(jurisdiction) ||
        (rule.jurisdictions.includes('*') && !matchedRule)
      ) {
        if (rule.jurisdictions.includes(jurisdiction)) {
          matchedRule = rule;
          break; // Exact match takes priority
        } else {
          matchedRule = rule; // Default rule
        }
      }
    }

    if (!matchedRule) {
      return { rule: undefined, rate: this.defaultRate };
    }

    // Get base rate
    let rate = matchedRule.rates[taxType] ?? this.defaultRate;
    let exemption: string | undefined;
    let condition: string | undefined;

    // Check exemptions first
    if (matchedRule.exemptions && profile) {
      for (const exempt of matchedRule.exemptions) {
        if (this.evaluateCondition(exempt, profile)) {
          if (exempt.rateOverride && taxType in exempt.rateOverride) {
            rate = exempt.rateOverride[taxType] ?? rate;
            exemption = exempt.reason;
            break;
          }
        }
      }
    }

    // Check conditions if no exemption applied
    if (!exemption && matchedRule.conditions && profile) {
      for (const cond of matchedRule.conditions) {
        if (this.evaluateCondition(cond, profile)) {
          if (cond.rateOverride && taxType in cond.rateOverride) {
            rate = cond.rateOverride[taxType] ?? rate;
            condition = `${cond.field} ${cond.op} ${cond.value}`;
            break;
          }
        }
      }
    }

    return { rule: matchedRule, rate, exemption, condition };
  }

  private evaluateCondition(
    condition: WithholdingCondition | WithholdingExemption,
    profile: InvestorTaxProfile
  ): boolean {
    const fieldValue = (profile as unknown as Record<string, unknown>)[condition.field];

    switch (condition.op) {
      case 'eq':
        return fieldValue === condition.value;
      case 'neq':
        return fieldValue !== condition.value;
      case 'gt':
        return (fieldValue as number) > (condition.value as number);
      case 'gte':
        return (fieldValue as number) >= (condition.value as number);
      case 'lt':
        return (fieldValue as number) < (condition.value as number);
      case 'lte':
        return (fieldValue as number) <= (condition.value as number);
      case 'in':
        return Array.isArray(condition.value) && condition.value.includes(fieldValue);
      default:
        return false;
    }
  }

  // ============================================
  // REPORTING
  // ============================================

  /**
   * Generate annual tax report for an investor
   */
  generateAnnualReport(investorId: string, year: number): TaxReport {
    const profile = this.investorProfiles.get(investorId);
    const distributions: TaxReport['distributions'] = [];

    let totalGross = 0n;
    let totalWithholding = 0n;
    let totalNet = 0n;
    let currency = 'USD';

    for (const calc of this.calculations.values()) {
      if (calc.investorId !== investorId) continue;

      const calcYear = new Date(calc.timestamp).getFullYear();
      if (calcYear !== year) continue;

      distributions.push({
        distributionId: calc.distributionId,
        date: calc.timestamp,
        grossAmount: calc.grossAmount,
        withholdingAmount: calc.withholdingAmount,
        netAmount: calc.netAmount,
        taxType: calc.taxType,
        rate: calc.withholdingRate,
      });

      totalGross += this.parseAmount(calc.grossAmount);
      totalWithholding += this.parseAmount(calc.withholdingAmount);
      totalNet += this.parseAmount(calc.netAmount);
      currency = calc.currency;
    }

    return {
      investorId,
      year,
      jurisdiction: profile?.countryCode || 'UNKNOWN',
      distributions,
      totalGross: this.formatAmount(totalGross),
      totalWithholding: this.formatAmount(totalWithholding),
      totalNet: this.formatAmount(totalNet),
      currency,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get required tax forms for an investor
   */
  getRequiredForms(investorId: string): string[] {
    const profile = this.investorProfiles.get(investorId);
    if (!profile) return [];

    for (const rule of this.rules.values()) {
      if (rule.jurisdictions.includes(profile.countryCode)) {
        return rule.forms || [];
      }
    }

    return [];
  }

  /**
   * Get calculation by ID
   */
  getCalculation(calculationId: string): WithholdingCalculation | undefined {
    return this.calculations.get(calculationId);
  }

  /**
   * Get all calculations for a distribution
   */
  getCalculationsForDistribution(distributionId: string): WithholdingCalculation[] {
    return Array.from(this.calculations.values()).filter(
      c => c.distributionId === distributionId
    );
  }

  /**
   * Get all calculations for an investor
   */
  getCalculationsForInvestor(investorId: string): WithholdingCalculation[] {
    return Array.from(this.calculations.values()).filter(
      c => c.investorId === investorId
    );
  }

  // ============================================
  // RULE MANAGEMENT
  // ============================================

  /**
   * Add or update a jurisdiction rule
   */
  setRule(rule: TaxJurisdictionRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Get all rules
   */
  getRules(): TaxJurisdictionRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rate for a jurisdiction and tax type
   */
  getRate(jurisdiction: string, taxType: DistributionTaxType): number {
    const { rate } = this.findApplicableRule(jurisdiction, taxType);
    return rate;
  }

  // ============================================
  // UTILITY
  // ============================================

  private parseAmount(amount: string): bigint {
    // Parse as cents/smallest unit (2 decimal places)
    const parts = amount.split('.');
    const whole = parts[0] || '0';
    const decimal = (parts[1] || '00').padEnd(2, '0').slice(0, 2);
    return BigInt(whole + decimal);
  }

  private formatAmount(amount: bigint): string {
    const str = amount.toString().padStart(3, '0');
    const whole = str.slice(0, -2) || '0';
    const decimal = str.slice(-2);
    return `${whole}.${decimal}`;
  }

  private calculateAmount(grossAmount: bigint, rate: number): bigint {
    if (rate === 0) return 0n;

    const withholding = (grossAmount * BigInt(Math.round(rate * 100))) / 10000n;

    // Apply minimum
    if (withholding > 0n && withholding < this.minimumWithholding) {
      return this.minimumWithholding;
    }

    return withholding;
  }
}

// Factory functions
export function createTaxWithholdingService(
  config?: Partial<TaxWithholdingConfig>
): TaxWithholdingService {
  return new TaxWithholdingService(config);
}

export default TaxWithholdingService;
