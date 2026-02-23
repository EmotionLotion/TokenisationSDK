/**
 * Pack: Loyalty Points
 *
 * Reference implementation for fungible loyalty/reward points with:
 * - Daily mint limits per partner
 * - Point expiry
 * - Fraud flags (freeze)
 * - Partner-specific issuance
 * - Redemption tracking
 */

import { v4 as uuidv4 } from 'uuid';
import type { RightModel } from '../core/types.js';
import { LifecycleState, RightType, TransferabilityMode } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

export interface LoyaltyProgramConfig {
  /** Program name */
  programName: string;
  /** Program currency symbol */
  symbol: string;
  /** Points per unit of currency (e.g., 1 point per $1 spent) */
  pointsPerCurrencyUnit: number;
  /** Point expiry in days (0 = no expiry) */
  expiryDays: number;
  /** Daily mint limit per partner */
  dailyMintLimitPerPartner: string;
  /** Global daily mint limit */
  globalDailyMintLimit: string;
  /** Minimum redemption amount */
  minRedemptionAmount: string;
  /** Redemption rate (points per $1 value) */
  redemptionRate: number;
  /** Allowed partner IDs */
  allowedPartners: string[];
  /** Program operator */
  operatorId: string;
}

export interface LoyaltyPointsMetadata {
  assetType: 'LOYALTY_POINTS';
  programName: string;
  symbol: string;
  pointsPerCurrencyUnit: number;
  expiryDays: number;
  dailyMintLimitPerPartner: string;
  globalDailyMintLimit: string;
  minRedemptionAmount: string;
  redemptionRate: number;
  allowedPartners: string[];
}

export interface PointBalance {
  /** User ID */
  userId: string;
  /** Total points */
  totalPoints: string;
  /** Available points (not expired, not frozen) */
  availablePoints: string;
  /** Pending points (not yet confirmed) */
  pendingPoints: string;
  /** Expired points */
  expiredPoints: string;
  /** Frozen points */
  frozenPoints: string;
  /** Point batches with expiry */
  batches: PointBatch[];
}

export interface PointBatch {
  id: string;
  /** Amount of points */
  amount: string;
  /** Remaining amount */
  remaining: string;
  /** Earned date */
  earnedAt: string;
  /** Expiry date */
  expiresAt: string;
  /** Source (partner ID or action) */
  source: string;
  /** Whether batch is frozen */
  frozen: boolean;
}

export interface MintRecord {
  partnerId: string;
  date: string;
  amount: string;
}

export interface FraudFlag {
  userId: string;
  flaggedAt: string;
  reason: string;
  flaggedBy: string;
  resolved: boolean;
  resolvedAt?: string;
}

// ============================================================================
// LOYALTY POINTS ENGINE
// ============================================================================

export class LoyaltyPointsEngine {
  private config: LoyaltyProgramConfig;
  private balances: Map<string, PointBalance> = new Map();
  private dailyMints: Map<string, MintRecord[]> = new Map();
  private fraudFlags: Map<string, FraudFlag> = new Map();
  private globalDailyMint: Map<string, string> = new Map();

  constructor(config: LoyaltyProgramConfig) {
    this.config = config;
  }

  /**
   * Create loyalty points asset
   */
  createAsset(): RightModel {
    const now = new Date().toISOString();
    const metadata: LoyaltyPointsMetadata = {
      assetType: 'LOYALTY_POINTS',
      programName: this.config.programName,
      symbol: this.config.symbol,
      pointsPerCurrencyUnit: this.config.pointsPerCurrencyUnit,
      expiryDays: this.config.expiryDays,
      dailyMintLimitPerPartner: this.config.dailyMintLimitPerPartner,
      globalDailyMintLimit: this.config.globalDailyMintLimit,
      minRedemptionAmount: this.config.minRedemptionAmount,
      redemptionRate: this.config.redemptionRate,
      allowedPartners: this.config.allowedPartners,
    };

    return {
      id: uuidv4(),
      name: `${this.config.programName} Points`,
      rightType: RightType.BEHAVIOR,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'GLOBAL',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false,
      },
      metadata: metadata as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
      version: 0,
    };
  }

  /**
   * Mint points to a user
   */
  mint(params: {
    userId: string;
    amount: string;
    partnerId: string;
    source?: string;
  }): { success: boolean; batchId?: string; error?: string } {
    // Check if partner is allowed
    if (!this.config.allowedPartners.includes(params.partnerId)) {
      return { success: false, error: 'Partner not authorized to mint' };
    }

    // Check fraud flag
    if (this.isUserFrozen(params.userId)) {
      return { success: false, error: 'User account is frozen due to fraud flag' };
    }

    // Check daily partner limit
    const partnerDailyTotal = this.getPartnerDailyMintTotal(params.partnerId);
    if (BigInt(partnerDailyTotal) + BigInt(params.amount) > BigInt(this.config.dailyMintLimitPerPartner)) {
      return { success: false, error: 'Partner daily mint limit exceeded' };
    }

    // Check global daily limit
    const globalDailyTotal = this.getGlobalDailyMintTotal();
    if (BigInt(globalDailyTotal) + BigInt(params.amount) > BigInt(this.config.globalDailyMintLimit)) {
      return { success: false, error: 'Global daily mint limit exceeded' };
    }

    const now = new Date();
    const expiresAt = this.config.expiryDays > 0
      ? new Date(now.getTime() + this.config.expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString(); // 100 years = no expiry

    // Create batch
    const batch: PointBatch = {
      id: uuidv4(),
      amount: params.amount,
      remaining: params.amount,
      earnedAt: now.toISOString(),
      expiresAt,
      source: params.source ?? params.partnerId,
      frozen: false,
    };

    // Update user balance
    const balance = this.getOrCreateBalance(params.userId);
    balance.batches.push(batch);
    balance.totalPoints = (BigInt(balance.totalPoints) + BigInt(params.amount)).toString();
    balance.availablePoints = (BigInt(balance.availablePoints) + BigInt(params.amount)).toString();

    // Record mint for limits
    this.recordMint(params.partnerId, params.amount);

    return { success: true, batchId: batch.id };
  }

  /**
   * Redeem points
   */
  redeem(params: {
    userId: string;
    amount: string;
    redemptionType: string;
  }): { success: boolean; redeemedValue?: string; error?: string } {
    // Check fraud flag
    if (this.isUserFrozen(params.userId)) {
      return { success: false, error: 'User account is frozen due to fraud flag' };
    }

    // Check minimum redemption
    if (BigInt(params.amount) < BigInt(this.config.minRedemptionAmount)) {
      return { success: false, error: `Minimum redemption is ${this.config.minRedemptionAmount} points` };
    }

    const balance = this.balances.get(params.userId);
    if (!balance) {
      return { success: false, error: 'User has no points' };
    }

    // Process expiry first
    this.processExpiry(params.userId);

    // Check available balance
    if (BigInt(balance.availablePoints) < BigInt(params.amount)) {
      return { success: false, error: 'Insufficient available points' };
    }

    // Deduct from oldest batches first (FIFO)
    let remaining = BigInt(params.amount);
    const sortedBatches = balance.batches
      .filter(b => !b.frozen && BigInt(b.remaining) > 0n && new Date(b.expiresAt) > new Date())
      .sort((a, b) => new Date(a.earnedAt).getTime() - new Date(b.earnedAt).getTime());

    for (const batch of sortedBatches) {
      if (remaining <= 0n) break;
      const deduct = remaining < BigInt(batch.remaining) ? remaining : BigInt(batch.remaining);
      batch.remaining = (BigInt(batch.remaining) - deduct).toString();
      remaining -= deduct;
    }

    // Update balance
    balance.totalPoints = (BigInt(balance.totalPoints) - BigInt(params.amount)).toString();
    balance.availablePoints = (BigInt(balance.availablePoints) - BigInt(params.amount)).toString();

    // Calculate redemption value
    const redeemedValue = (parseFloat(params.amount) / this.config.redemptionRate).toFixed(2);

    return { success: true, redeemedValue };
  }

  /**
   * Transfer points between users
   */
  transfer(params: {
    fromUserId: string;
    toUserId: string;
    amount: string;
  }): { success: boolean; error?: string } {
    // Check fraud flags
    if (this.isUserFrozen(params.fromUserId)) {
      return { success: false, error: 'Sender account is frozen' };
    }
    if (this.isUserFrozen(params.toUserId)) {
      return { success: false, error: 'Recipient account is frozen' };
    }

    const fromBalance = this.balances.get(params.fromUserId);
    if (!fromBalance || BigInt(fromBalance.availablePoints) < BigInt(params.amount)) {
      return { success: false, error: 'Insufficient available points' };
    }

    // Deduct from sender (FIFO)
    let remaining = BigInt(params.amount);
    const sortedBatches = fromBalance.batches
      .filter(b => !b.frozen && BigInt(b.remaining) > 0n && new Date(b.expiresAt) > new Date())
      .sort((a, b) => new Date(a.earnedAt).getTime() - new Date(b.earnedAt).getTime());

    const transferredBatches: PointBatch[] = [];
    for (const batch of sortedBatches) {
      if (remaining <= 0n) break;
      const deduct = remaining < BigInt(batch.remaining) ? remaining : BigInt(batch.remaining);
      batch.remaining = (BigInt(batch.remaining) - deduct).toString();
      remaining -= deduct;

      // Create new batch for recipient with same expiry
      transferredBatches.push({
        id: uuidv4(),
        amount: deduct.toString(),
        remaining: deduct.toString(),
        earnedAt: new Date().toISOString(),
        expiresAt: batch.expiresAt,
        source: `transfer:${params.fromUserId}`,
        frozen: false,
      });
    }

    // Update sender balance
    fromBalance.totalPoints = (BigInt(fromBalance.totalPoints) - BigInt(params.amount)).toString();
    fromBalance.availablePoints = (BigInt(fromBalance.availablePoints) - BigInt(params.amount)).toString();

    // Add to recipient
    const toBalance = this.getOrCreateBalance(params.toUserId);
    toBalance.batches.push(...transferredBatches);
    toBalance.totalPoints = (BigInt(toBalance.totalPoints) + BigInt(params.amount)).toString();
    toBalance.availablePoints = (BigInt(toBalance.availablePoints) + BigInt(params.amount)).toString();

    return { success: true };
  }

  /**
   * Flag user for fraud
   */
  flagFraud(params: {
    userId: string;
    reason: string;
    flaggedBy: string;
  }): FraudFlag {
    const flag: FraudFlag = {
      userId: params.userId,
      flaggedAt: new Date().toISOString(),
      reason: params.reason,
      flaggedBy: params.flaggedBy,
      resolved: false,
    };

    this.fraudFlags.set(params.userId, flag);

    // Freeze all user batches
    const balance = this.balances.get(params.userId);
    if (balance) {
      for (const batch of balance.batches) {
        batch.frozen = true;
      }
      balance.frozenPoints = balance.availablePoints;
      balance.availablePoints = '0';
    }

    return flag;
  }

  /**
   * Resolve fraud flag
   */
  resolveFraudFlag(userId: string, unfreeze: boolean): void {
    const flag = this.fraudFlags.get(userId);
    if (!flag) return;

    flag.resolved = true;
    flag.resolvedAt = new Date().toISOString();

    if (unfreeze) {
      const balance = this.balances.get(userId);
      if (balance) {
        for (const batch of balance.batches) {
          batch.frozen = false;
        }
        balance.availablePoints = balance.frozenPoints;
        balance.frozenPoints = '0';
      }
    }
  }

  /**
   * Process expired points
   */
  processExpiry(userId: string): void {
    const balance = this.balances.get(userId);
    if (!balance) return;

    const now = new Date();
    let expiredAmount = 0n;

    for (const batch of balance.batches) {
      if (new Date(batch.expiresAt) <= now && BigInt(batch.remaining) > 0n) {
        expiredAmount += BigInt(batch.remaining);
        batch.remaining = '0';
      }
    }

    if (expiredAmount > 0n) {
      balance.availablePoints = (BigInt(balance.availablePoints) - expiredAmount).toString();
      balance.expiredPoints = (BigInt(balance.expiredPoints) + expiredAmount).toString();
    }
  }

  /**
   * Get user balance
   */
  getBalance(userId: string): PointBalance | undefined {
    this.processExpiry(userId);
    return this.balances.get(userId);
  }

  /**
   * Check if user is frozen
   */
  isUserFrozen(userId: string): boolean {
    const flag = this.fraudFlags.get(userId);
    return flag ? !flag.resolved : false;
  }

  /**
   * Get program statistics
   */
  getStats(): {
    totalUsers: number;
    totalPointsCirculating: string;
    totalPointsExpired: string;
    totalPointsFrozen: string;
    activePartners: number;
  } {
    let totalPoints = 0n;
    let expiredPoints = 0n;
    let frozenPoints = 0n;

    for (const balance of this.balances.values()) {
      totalPoints += BigInt(balance.totalPoints);
      expiredPoints += BigInt(balance.expiredPoints);
      frozenPoints += BigInt(balance.frozenPoints);
    }

    return {
      totalUsers: this.balances.size,
      totalPointsCirculating: totalPoints.toString(),
      totalPointsExpired: expiredPoints.toString(),
      totalPointsFrozen: frozenPoints.toString(),
      activePartners: this.config.allowedPartners.length,
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private getOrCreateBalance(userId: string): PointBalance {
    if (!this.balances.has(userId)) {
      this.balances.set(userId, {
        userId,
        totalPoints: '0',
        availablePoints: '0',
        pendingPoints: '0',
        expiredPoints: '0',
        frozenPoints: '0',
        batches: [],
      });
    }
    return this.balances.get(userId)!;
  }

  private getPartnerDailyMintTotal(partnerId: string): string {
    const today = new Date().toISOString().split('T')[0];
    const records = this.dailyMints.get(partnerId) ?? [];
    return records
      .filter(r => r.date === today)
      .reduce((sum, r) => sum + BigInt(r.amount), 0n)
      .toString();
  }

  private getGlobalDailyMintTotal(): string {
    const today = new Date().toISOString().split('T')[0];
    return this.globalDailyMint.get(today) ?? '0';
  }

  private recordMint(partnerId: string, amount: string): void {
    const today = new Date().toISOString().split('T')[0];

    // Record partner mint
    if (!this.dailyMints.has(partnerId)) {
      this.dailyMints.set(partnerId, []);
    }
    this.dailyMints.get(partnerId)!.push({
      partnerId,
      date: today,
      amount,
    });

    // Update global daily total
    const currentGlobal = BigInt(this.globalDailyMint.get(today) ?? '0');
    this.globalDailyMint.set(today, (currentGlobal + BigInt(amount)).toString());
  }
}

// ============================================================================
// ASSET PACK DEFINITION
// ============================================================================

import type { AssetPack } from './AssetPackRegistry.js';
import { AssetType, InvestorClass, LiquidityProfile, FractionalizationType } from '../core/AssetAbstraction.js';

export const LOYALTY_POINTS_PACK: AssetPack = {
  id: 'LOYALTY_POINTS',
  name: 'Loyalty Points Program',
  description: 'Fungible loyalty/reward points with expiry, fraud controls, and partner issuance',
  version: '1.0.0',

  defaults: {
    assetType: AssetType.MEMBERSHIP,
    investorClass: InvestorClass.RETAIL,
    liquidityProfile: LiquidityProfile.LIQUID,
    fractionalization: FractionalizationType.DIVISIBLE,
    lockupDays: 0,
    additionalJurisdictions: [],
    blockedJurisdictions: [],
  },

  lifecycleRules: [
    {
      from: LifecycleState.DRAFT,
      to: LifecycleState.ACTIVE,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'OPERATOR', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'PROGRAM_LAUNCHED' } }],
      description: 'Launch loyalty program',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.FROZEN,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'OPERATOR', count: 1 }] },
      ],
      actions: [{ type: 'FREEZE', params: {} }],
      description: 'Pause program (fraud investigation)',
    },
    {
      from: LifecycleState.FROZEN,
      to: LifecycleState.ACTIVE,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'OPERATOR', count: 1 }] },
      ],
      actions: [{ type: 'UNFREEZE', params: {} }],
      description: 'Resume program',
    },
    {
      from: LifecycleState.ACTIVE,
      to: LifecycleState.REDEEMED,
      conditions: [
        { type: 'APPROVAL', approvals: [{ role: 'OPERATOR', count: 1 }] },
      ],
      actions: [{ type: 'EMIT_EVENT', params: { event: 'PROGRAM_RETIRED' } }],
      description: 'End loyalty program',
    },
  ],

  complianceRules: [
    {
      id: 'FRAUD_CHECK',
      name: 'Fraud Flag Check',
      type: 'CUSTOM',
      params: { checkFraudFlag: true },
      severity: 'BLOCK',
    },
    {
      id: 'DAILY_MINT_LIMIT',
      name: 'Daily Mint Limit',
      type: 'CUSTOM',
      params: { enforceDailyLimits: true },
      severity: 'BLOCK',
    },
  ],

  requiredVerifications: [],

  metadataSchema: {
    programName: { type: 'string', required: true, description: 'Loyalty program name' },
    symbol: { type: 'string', required: true, description: 'Points symbol' },
    pointsPerCurrencyUnit: { type: 'number', required: true, description: 'Points earned per currency unit' },
    expiryDays: { type: 'number', required: true, description: 'Point expiry in days (0 = no expiry)' },
    dailyMintLimitPerPartner: { type: 'string', required: true, description: 'Daily mint limit per partner' },
    globalDailyMintLimit: { type: 'string', required: true, description: 'Global daily mint limit' },
    minRedemptionAmount: { type: 'string', required: true, description: 'Minimum points for redemption' },
    redemptionRate: { type: 'number', required: true, description: 'Points per $1 redemption value' },
  },

  tags: ['loyalty', 'points', 'rewards', 'retail', 'fungible'],
};

export default LoyaltyPointsEngine;
