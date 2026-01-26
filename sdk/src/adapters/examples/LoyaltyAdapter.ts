/**
 * @fileoverview Loyalty Points & Rewards Adapter
 *
 * Reference implementation for tokenizing loyalty/rewards programs.
 * Supports points, miles, and branded reward currencies.
 */

import type {
  IAssetAdapter,
  ValidationResult,
  AssetSchema,
  AssetContext,
  IssueContext,
  TransferContext,
  RedeemContext,
  PayoutContext,
  OperationResult,
  ExternalConnector,
  TokenStandard,
} from '../types.js';

// ============================================================================
// TYPES
// ============================================================================

export type LoyaltyProgramType = 'points' | 'miles' | 'cashback' | 'branded_currency';
export type ExpirationPolicy = 'never' | 'rolling_12m' | 'rolling_24m' | 'fixed_date' | 'activity_based';
export type EarnMethod = 'purchase' | 'referral' | 'engagement' | 'staking' | 'promotion';

export interface LoyaltyInput {
  programName: string;
  programType: LoyaltyProgramType;
  brandName: string;
  pointName: string; // e.g., "Stars", "Miles", "Points"
  pointSymbol?: string; // e.g., "$", "★", "✈"
  valuePerPoint?: number; // Value in base currency (e.g., 0.01 = 1 cent per point)
  baseCurrency: string;
  expirationPolicy: ExpirationPolicy;
  expirationDate?: string; // For fixed_date policy
  minimumRedemption?: number;
  maximumBalance?: number;
  earnMethods: EarnMethod[];
  earnRates?: Record<EarnMethod, number>; // Points earned per unit
  redemptionOptions?: RedemptionOption[];
  partnerPrograms?: string[];
  termsUrl?: string;
}

export interface RedemptionOption {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: 'merchandise' | 'travel' | 'cashback' | 'experience' | 'donation';
  available: boolean;
}

export interface LoyaltyMetadata extends LoyaltyInput {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsExpired: number;
  activeMembers: number;
  lastActivityDate?: string;
}

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

export class LoyaltyAdapter implements IAssetAdapter<LoyaltyInput, LoyaltyMetadata> {
  readonly assetType = 'loyalty';
  readonly displayName = 'Loyalty & Rewards';
  readonly supportedTokenStandards: TokenStandard[] = ['ERC-20']; // Simple fungible token
  readonly defaultTokenStandard: TokenStandard = 'ERC-20';

  // -------------------------------------------------------------------------
  // SCHEMA & VALIDATION
  // -------------------------------------------------------------------------

  validateAsset(input: LoyaltyInput): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // Required fields
    if (!input.programName) {
      errors.push({
        field: 'programName',
        code: 'REQUIRED',
        message: 'Program name is required',
      });
    }

    if (!input.brandName) {
      errors.push({
        field: 'brandName',
        code: 'REQUIRED',
        message: 'Brand name is required',
      });
    }

    if (!input.pointName) {
      errors.push({
        field: 'pointName',
        code: 'REQUIRED',
        message: 'Point/currency name is required (e.g., "Stars", "Miles")',
      });
    }

    if (!input.programType) {
      errors.push({
        field: 'programType',
        code: 'REQUIRED',
        message: 'Program type is required',
      });
    }

    if (!input.baseCurrency) {
      errors.push({
        field: 'baseCurrency',
        code: 'REQUIRED',
        message: 'Base currency for valuation is required',
      });
    }

    if (!input.expirationPolicy) {
      errors.push({
        field: 'expirationPolicy',
        code: 'REQUIRED',
        message: 'Expiration policy is required',
      });
    }

    if (input.expirationPolicy === 'fixed_date' && !input.expirationDate) {
      errors.push({
        field: 'expirationDate',
        code: 'REQUIRED_FOR_FIXED',
        message: 'Expiration date is required when using fixed_date policy',
      });
    }

    if (!input.earnMethods || input.earnMethods.length === 0) {
      errors.push({
        field: 'earnMethods',
        code: 'REQUIRED',
        message: 'At least one earn method is required',
      });
    }

    // Warnings
    if (input.valuePerPoint === undefined) {
      warnings.push({
        field: 'valuePerPoint',
        code: 'RECOMMENDED',
        message: 'Defining point value helps with accounting and member transparency',
      });
    }

    if (!input.redemptionOptions || input.redemptionOptions.length === 0) {
      warnings.push({
        field: 'redemptionOptions',
        code: 'RECOMMENDED',
        message: 'Defining redemption options improves program utility',
      });
    }

    if (!input.termsUrl) {
      warnings.push({
        field: 'termsUrl',
        code: 'RECOMMENDED',
        message: 'Terms and conditions URL should be provided',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  normalizeMetadata(raw: LoyaltyInput): LoyaltyMetadata {
    return {
      ...raw,
      totalPointsIssued: 0,
      totalPointsRedeemed: 0,
      totalPointsExpired: 0,
      activeMembers: 0,
    };
  }

  getSchema(): AssetSchema {
    return {
      type: 'object',
      required: ['programName', 'programType', 'brandName', 'pointName', 'baseCurrency', 'expirationPolicy', 'earnMethods'],
      properties: {
        programName: {
          type: 'string',
          description: 'Name of the loyalty program',
        },
        programType: {
          type: 'string',
          enum: ['points', 'miles', 'cashback', 'branded_currency'],
          description: 'Type of loyalty program',
        },
        brandName: {
          type: 'string',
          description: 'Brand operating the program',
        },
        pointName: {
          type: 'string',
          description: 'Name for the points/currency (e.g., "Stars", "Miles")',
        },
        pointSymbol: {
          type: 'string',
          description: 'Symbol for the points (e.g., "★", "✈")',
        },
        valuePerPoint: {
          type: 'number',
          minimum: 0,
          description: 'Value per point in base currency',
        },
        baseCurrency: {
          type: 'string',
          description: 'Currency for valuation (e.g., "USD", "AED")',
        },
        expirationPolicy: {
          type: 'string',
          enum: ['never', 'rolling_12m', 'rolling_24m', 'fixed_date', 'activity_based'],
          description: 'How points expire',
        },
        expirationDate: {
          type: 'string',
          format: 'date',
          description: 'Expiration date for fixed_date policy',
        },
        minimumRedemption: {
          type: 'number',
          minimum: 0,
          description: 'Minimum points required for redemption',
        },
        maximumBalance: {
          type: 'number',
          minimum: 0,
          description: 'Maximum points a member can hold',
        },
        earnMethods: {
          type: 'array',
          items: { type: 'string', enum: ['purchase', 'referral', 'engagement', 'staking', 'promotion'] },
          description: 'Ways to earn points',
        },
        earnRates: {
          type: 'object',
          description: 'Points earned per action type',
        },
        redemptionOptions: {
          type: 'array',
          items: { type: 'object' },
          description: 'Available redemption options',
        },
        partnerPrograms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Partner programs for earning/redemption',
        },
        termsUrl: {
          type: 'string',
          format: 'uri',
          description: 'URL to program terms and conditions',
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // LIFECYCLE HOOKS
  // -------------------------------------------------------------------------

  async onBeforeCreate(context: AssetContext): Promise<OperationResult> {
    console.log(`Creating loyalty program: ${context.assetId}`);
    return { success: true };
  }

  async onAfterCreate(context: AssetContext): Promise<void> {
    console.log(`Loyalty program created: ${context.assetId}`);
    // Initialize program, set up earn/burn rules
  }

  async onBeforeIssue(context: IssueContext): Promise<OperationResult> {
    const metadata = context.metadata as unknown as LoyaltyMetadata;

    // Check maximum balance if set
    if (metadata.maximumBalance && metadata.maximumBalance > 0) {
      // In real implementation, check recipient's current balance
      console.log(`Checking maximum balance limit of ${metadata.maximumBalance}`);
    }

    return { success: true };
  }

  async onAfterIssue(context: IssueContext): Promise<void> {
    console.log(`Points issued: ${context.amount} ${(context.metadata as unknown as LoyaltyMetadata).pointName} to ${context.recipientAddress}`);
    // Update member stats, trigger notifications
  }

  async onBeforeTransfer(context: TransferContext): Promise<OperationResult> {
    const metadata = context.metadata as unknown as LoyaltyMetadata;

    // Check if program allows peer-to-peer transfers
    // Many loyalty programs restrict this
    console.log(`Checking transfer eligibility for ${metadata.programName}`);

    return { success: true };
  }

  async onAfterTransfer(context: TransferContext): Promise<void> {
    console.log(`Points transferred: ${context.amount} from ${context.fromAddress} to ${context.toAddress}`);
    // Log transfer, update member profiles
  }

  async onBeforeRedeem(context: RedeemContext): Promise<OperationResult> {
    const metadata = context.metadata as unknown as LoyaltyMetadata;

    // Check minimum redemption
    if (metadata.minimumRedemption && Number(context.amount) < metadata.minimumRedemption) {
      return {
        success: false,
        error: {
          code: 'BELOW_MINIMUM',
          message: `Minimum redemption is ${metadata.minimumRedemption} ${metadata.pointName}`,
        },
      };
    }

    return { success: true };
  }

  async onAfterRedeem(context: RedeemContext): Promise<void> {
    console.log(`Points redeemed: ${context.amount} points`);
    // Process reward, update stats, send confirmation
  }

  async onBeforePayout(context: PayoutContext): Promise<OperationResult> {
    // Payouts might be cashback conversion
    return { success: true };
  }

  async onAfterPayout(context: PayoutContext): Promise<void> {
    console.log(`Cashback paid: ${context.totalAmount} ${context.currency}`);
  }

  // -------------------------------------------------------------------------
  // EXTERNAL CONNECTORS
  // -------------------------------------------------------------------------

  getConnectors(): ExternalConnector[] {
    return [
      {
        id: 'crm',
        name: 'CRM Integration',
        type: 'registry',
        baseUrl: 'https://crm.internal/api',

        async healthCheck(): Promise<boolean> {
          return true;
        },

        async execute<T>(operation: string, params: Record<string, unknown>): Promise<T> {
          switch (operation) {
            case 'getMemberProfile':
              return { memberId: params.address, tier: 'gold', totalEarned: 50000 } as T;
            case 'updateActivity':
              return { success: true } as T;
            case 'sendNotification':
              return { sent: true, channel: 'email' } as T;
            default:
              throw new Error(`Unknown CRM operation: ${operation}`);
          }
        },
      },
      {
        id: 'rewards_catalog',
        name: 'Rewards Catalog',
        type: 'registry',
        baseUrl: 'https://rewards.internal/api',

        async healthCheck(): Promise<boolean> {
          return true;
        },

        async execute<T>(operation: string, params: Record<string, unknown>): Promise<T> {
          switch (operation) {
            case 'getAvailableRewards':
              return {
                rewards: [
                  { id: 'gift_card', name: 'Gift Card', cost: 1000 },
                  { id: 'free_product', name: 'Free Product', cost: 500 },
                ],
              } as T;
            case 'reserveReward':
              return { reservationId: 'RES-' + Date.now(), expiresAt: new Date(Date.now() + 3600000).toISOString() } as T;
            case 'fulfillReward':
              return { fulfillmentId: 'FUL-' + Date.now(), status: 'processing' } as T;
            default:
              throw new Error(`Unknown Rewards operation: ${operation}`);
          }
        },
      },
    ];
  }
}

// Export singleton instance
export const loyaltyAdapter = new LoyaltyAdapter();
