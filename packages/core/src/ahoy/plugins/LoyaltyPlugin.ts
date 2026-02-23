/**
 * Loyalty Plugin
 *
 * Manages $AHOY loyalty token rules and rewards distribution.
 * Handles earn/burn actions across all Ahoy services.
 */

// Standalone plugin - does not implement core ICompliancePlugin interface
import { v4 as uuidv4 } from 'uuid';
import { AhoyActionType, AhoyEcosystemConfig, type AhoyTransaction } from '../types.js';

/**
 * Loyalty rule configuration
 */
export interface LoyaltyRule {
  action: AhoyActionType;
  points: number;
  isEarn: boolean;
  minHoldPeriod?: number; // Days
  cooldownPeriod?: number; // Hours
  maxPerDay?: number;
  maxPerWeek?: number;
  requiredTier?: string;
}

/**
 * User loyalty status
 */
export interface UserLoyaltyStatus {
  userId: string;
  totalEarned: number;
  totalSpent: number;
  currentBalance: number;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  lastActionTimestamps: Map<AhoyActionType, string[]>;
  streaks: {
    daily: number;
    weekly: number;
    monthly: number;
  };
}

/**
 * Reward calculation result
 */
export interface RewardCalculation {
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  bonusReasons: string[];
  eligible: boolean;
  ineligibleReason?: string;
}

/**
 * Loyalty Plugin
 *
 * Implements the $AHOY loyalty program logic.
 */
export class LoyaltyPlugin {
  readonly id = 'ahoy-loyalty';
  readonly name = 'Ahoy Loyalty Engine';
  readonly version = '1.0.0';

  private rules: Map<AhoyActionType, LoyaltyRule> = new Map();
  private userStatuses: Map<string, UserLoyaltyStatus> = new Map();
  private transactions: AhoyTransaction[] = [];

  constructor() {
    this.initializeDefaultRules();
  }

  /**
   * Check if a transfer is compliant
   */
  async checkCompliance(context: {
    assetId: string;
    fromPartyId: string;
    toPartyId: string;
    amount: string;
  }): Promise<{ compliant: boolean; reason?: string }> {
    // Loyalty tokens have minimal transfer restrictions
    return { compliant: true };
  }

  /**
   * Validate a party for compliance
   */
  async validateParty(partyId: string): Promise<{ valid: boolean; reason?: string }> {
    // All parties can participate in loyalty program
    return { valid: true };
  }

  /**
   * Initialize default rules from config
   */
  private initializeDefaultRules(): void {
    const config = AhoyEcosystemConfig.POINTS_CONFIG;

    for (const [action, pointsConfig] of Object.entries(config)) {
      this.rules.set(action as AhoyActionType, {
        action: action as AhoyActionType,
        points: Math.abs(pointsConfig.points),
        isEarn: pointsConfig.isEarn,
        maxPerDay: (pointsConfig as any).maxPerDay,
      });
    }
  }

  /**
   * Calculate reward for an action
   */
  calculateReward(
    userId: string,
    action: AhoyActionType,
    context?: {
      source?: string;
      referenceId?: string;
      multiplier?: number;
    }
  ): RewardCalculation {
    const rule = this.rules.get(action);
    if (!rule) {
      return {
        basePoints: 0,
        bonusPoints: 0,
        totalPoints: 0,
        bonusReasons: [],
        eligible: false,
        ineligibleReason: `Unknown action: ${action}`,
      };
    }

    if (!rule.isEarn) {
      return {
        basePoints: 0,
        bonusPoints: 0,
        totalPoints: 0,
        bonusReasons: [],
        eligible: false,
        ineligibleReason: `Action ${action} is a burn action, not earn`,
      };
    }

    // Check daily limits
    const status = this.getUserStatus(userId);
    if (rule.maxPerDay) {
      const todayActions = this.getActionsToday(userId, action);
      if (todayActions >= rule.maxPerDay) {
        return {
          basePoints: rule.points,
          bonusPoints: 0,
          totalPoints: 0,
          bonusReasons: [],
          eligible: false,
          ineligibleReason: `Daily limit reached for ${action}`,
        };
      }
    }

    // Calculate base points
    const basePoints = rule.points;
    let bonusPoints = 0;
    const bonusReasons: string[] = [];

    // Apply multiplier if provided
    if (context?.multiplier && context.multiplier > 1) {
      bonusPoints += Math.ceil(basePoints * (context.multiplier - 1));
      bonusReasons.push(`${context.multiplier}x multiplier`);
    }

    // Streak bonuses
    if (status.streaks.daily >= 7) {
      bonusPoints += Math.ceil(basePoints * 0.1);
      bonusReasons.push('7-day streak (+10%)');
    }
    if (status.streaks.weekly >= 4) {
      bonusPoints += Math.ceil(basePoints * 0.2);
      bonusReasons.push('4-week streak (+20%)');
    }

    // Tier bonuses
    const tierBonuses = {
      BRONZE: 0,
      SILVER: 0.05,
      GOLD: 0.1,
      PLATINUM: 0.2,
    };
    const tierBonus = tierBonuses[status.tier];
    if (tierBonus > 0) {
      bonusPoints += Math.ceil(basePoints * tierBonus);
      bonusReasons.push(`${status.tier} tier (+${tierBonus * 100}%)`);
    }

    return {
      basePoints,
      bonusPoints,
      totalPoints: basePoints + bonusPoints,
      bonusReasons,
      eligible: true,
    };
  }

  /**
   * Calculate cost for a redemption action
   */
  calculateRedemptionCost(
    userId: string,
    action: AhoyActionType
  ): {
    cost: number;
    discount: number;
    finalCost: number;
    eligible: boolean;
    ineligibleReason?: string;
  } {
    const rule = this.rules.get(action);
    if (!rule) {
      return {
        cost: 0,
        discount: 0,
        finalCost: 0,
        eligible: false,
        ineligibleReason: `Unknown action: ${action}`,
      };
    }

    if (rule.isEarn) {
      return {
        cost: 0,
        discount: 0,
        finalCost: 0,
        eligible: false,
        ineligibleReason: `Action ${action} is an earn action, not redemption`,
      };
    }

    const status = this.getUserStatus(userId);
    const baseCost = rule.points;

    // Tier discounts
    const tierDiscounts = {
      BRONZE: 0,
      SILVER: 0.05,
      GOLD: 0.1,
      PLATINUM: 0.15,
    };
    const discount = Math.ceil(baseCost * tierDiscounts[status.tier]);
    const finalCost = baseCost - discount;

    // Check balance
    if (status.currentBalance < finalCost) {
      return {
        cost: baseCost,
        discount,
        finalCost,
        eligible: false,
        ineligibleReason: `Insufficient balance. Need ${finalCost}, have ${status.currentBalance}`,
      };
    }

    return {
      cost: baseCost,
      discount,
      finalCost,
      eligible: true,
    };
  }

  /**
   * Process a reward action
   */
  processReward(
    userId: string,
    action: AhoyActionType,
    source: 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'NEXUS' | 'CONNECT',
    referenceId?: string
  ): AhoyTransaction | null {
    const calculation = this.calculateReward(userId, action);
    if (!calculation.eligible) {
      return null;
    }

    const status = this.getUserStatus(userId);
    const balanceBefore = status.currentBalance.toString();
    status.currentBalance += calculation.totalPoints;
    status.totalEarned += calculation.totalPoints;
    const balanceAfter = status.currentBalance.toString();

    // Update streaks
    this.updateStreaks(userId);

    // Record action timestamp
    const timestamps = status.lastActionTimestamps.get(action) || [];
    timestamps.push(new Date().toISOString());
    status.lastActionTimestamps.set(action, timestamps);

    // Update tier
    status.tier = this.calculateTier(status.totalEarned);

    const transaction: AhoyTransaction = {
      txId: uuidv4(),
      userId,
      action,
      points: calculation.totalPoints,
      balanceBefore,
      balanceAfter,
      source,
      referenceId,
      timestamp: new Date().toISOString(),
    };

    this.transactions.push(transaction);
    return transaction;
  }

  /**
   * Process a redemption action
   */
  processRedemption(
    userId: string,
    action: AhoyActionType,
    source: 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'NEXUS' | 'CONNECT'
  ): AhoyTransaction | null {
    const calculation = this.calculateRedemptionCost(userId, action);
    if (!calculation.eligible) {
      return null;
    }

    const status = this.getUserStatus(userId);
    const balanceBefore = status.currentBalance.toString();
    status.currentBalance -= calculation.finalCost;
    status.totalSpent += calculation.finalCost;
    const balanceAfter = status.currentBalance.toString();

    const transaction: AhoyTransaction = {
      txId: uuidv4(),
      userId,
      action,
      points: -calculation.finalCost,
      balanceBefore,
      balanceAfter,
      source,
      timestamp: new Date().toISOString(),
    };

    this.transactions.push(transaction);
    return transaction;
  }

  /**
   * Get user's loyalty status
   */
  getUserStatus(userId: string): UserLoyaltyStatus {
    if (!this.userStatuses.has(userId)) {
      this.userStatuses.set(userId, {
        userId,
        totalEarned: 0,
        totalSpent: 0,
        currentBalance: 0,
        tier: 'BRONZE',
        lastActionTimestamps: new Map(),
        streaks: { daily: 0, weekly: 0, monthly: 0 },
      });
    }
    return this.userStatuses.get(userId)!;
  }

  /**
   * Get user's transaction history
   */
  getUserTransactions(userId: string): AhoyTransaction[] {
    return this.transactions.filter(tx => tx.userId === userId);
  }

  /**
   * Get actions performed today
   */
  private getActionsToday(userId: string, action: AhoyActionType): number {
    const status = this.getUserStatus(userId);
    const timestamps = status.lastActionTimestamps.get(action) || [];
    const today = new Date().toDateString();
    return timestamps.filter(ts => new Date(ts).toDateString() === today).length;
  }

  /**
   * Update user streaks
   */
  private updateStreaks(userId: string): void {
    const status = this.getUserStatus(userId);
    // Simplified streak logic - in production would be more sophisticated
    status.streaks.daily++;
    if (status.streaks.daily >= 7) {
      status.streaks.weekly++;
    }
    if (status.streaks.daily >= 30) {
      status.streaks.monthly++;
    }
  }

  /**
   * Calculate tier based on total earned
   */
  private calculateTier(totalEarned: number): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
    if (totalEarned >= 50000) return 'PLATINUM';
    if (totalEarned >= 15000) return 'GOLD';
    if (totalEarned >= 5000) return 'SILVER';
    return 'BRONZE';
  }

  /**
   * Add custom rule
   */
  addRule(rule: LoyaltyRule): void {
    this.rules.set(rule.action, rule);
  }

  /**
   * Get all rules
   */
  getRules(): LoyaltyRule[] {
    return Array.from(this.rules.values());
  }
}
