/**
 * $AHOY Loyalty Token Pack
 *
 * Phase 3: Unified ERC-20 loyalty token across all Ahoy services.
 * Earn across COMET, Fly+, H2O, AMS, Nexus, Connect.
 * Burn for discounts, priority, data access, agent hire.
 *
 * Flow: Mint(Total Supply) -> Distribute(Reward Engine)
 */

import { v4 as uuidv4 } from 'uuid';
import { TokenisationSDK, RightType, LifecycleState, PartyRole, PartyType, TransferabilityMode } from '@tokenisation/core';
import { EvidenceType } from '@tokenisation/core';
import { AhoyActionType, AhoyEcosystemConfig, type AhoyTransaction } from '../types.js';
import { SDKError, ValidationError, ErrorCode } from '@tokenisation/core';

/**
 * Token economics configuration
 */
export interface AhoyTokenConfig {
  /** Total supply (in base units) */
  totalSupply: string;

  /** Initial distribution percentages */
  distribution: {
    rewardsPool: number; // % for user rewards
    operations: number; // % for operations
    team: number; // % for team (vested)
    treasury: number; // % for treasury
  };

  /** Vesting period in days for team tokens */
  teamVestingDays: number;
}

/**
 * Reward distribution to a user
 */
export interface RewardDistribution {
  userId: string;
  action: AhoyActionType;
  source: 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'NEXUS' | 'CONNECT';
  referenceId?: string;
}

/**
 * $AHOY Token Pack
 *
 * Implements the unified loyalty token for the Ahoy ecosystem.
 */
export class AhoyTokenPack {
  private sdk: TokenisationSDK;
  private config: AhoyTokenConfig;
  private tokenAssetId: string | null = null;
  private rewardsPoolId: string | null = null;
  private transactionLog: AhoyTransaction[] = [];

  constructor(sdk: TokenisationSDK, config: AhoyTokenConfig) {
    this.sdk = sdk;
    this.config = config;
  }

  /**
   * Initialize the $AHOY token ecosystem
   */
  async initialize(): Promise<{
    tokenAssetId: string;
    rewardsPoolId: string;
    operationsId: string;
    teamId: string;
    treasuryId: string;
  }> {
    // Step 1: Create Ahoy Foundation (Issuer)
    const issuer = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.CUSTODIAN],
      name: 'Ahoy Foundation',
      jurisdiction: 'AE',
    });

    // Step 2: Create distribution wallets
    const rewardsPool = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.CUSTODIAN],
      name: 'Ahoy Rewards Pool',
      jurisdiction: 'AE',
    });

    const operations = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.CUSTODIAN],
      name: 'Ahoy Operations',
      jurisdiction: 'AE',
    });

    const team = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.CUSTODIAN],
      name: 'Ahoy Team (Vested)',
      jurisdiction: 'AE',
    });

    const treasury = this.sdk.parties_.create({
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.CUSTODIAN],
      name: 'Ahoy Treasury',
      jurisdiction: 'AE',
    });

    // Step 3: Create $AHOY Token Asset
    const tokenAsset = await this.sdk.assets.create({
      name: '$AHOY Token',
      description: 'Unified loyalty token for the Ahoy ecosystem. Earn across COMET, Fly+, H2O, AMS, and Nexus.',
      rightType: RightType.OWNERSHIP, // Fungible token
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
      validityPeriod: {
        isPerpetual: true,
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: false, // Loyalty points don't require KYC
      },
      issuerId: issuer.id,
      typedMetadata: {
        assetType: 'AHOY_TOKEN',
        symbol: 'AHOY',
        decimals: 18,
        totalSupply: this.config.totalSupply,
        distribution: this.config.distribution,
        teamVestingDays: this.config.teamVestingDays,
      },
    });

    this.tokenAssetId = tokenAsset.id;
    this.rewardsPoolId = rewardsPool.id;

    // Step 4: Add tokenomics evidence
    this.sdk.evidence.create({
      assetId: tokenAsset.id,
      type: EvidenceType.LEGAL_DOCUMENT,
      title: '$AHOY Tokenomics',
      description: 'Token distribution and vesting schedule',
      contentHash: 'sha256:' + Buffer.from(tokenAsset.id + 'tokenomics').toString('hex').slice(0, 64),
      source: {
        type: 'ISSUER',
        identifier: issuer.id,
        name: 'Ahoy Foundation',
        trusted: true,
        reputationScore: 100,
      },
    });

    // Step 5: Activate token
    await this.sdk.assets.transition(tokenAsset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await this.sdk.assets.verify(tokenAsset.id, issuer.id);
    await this.sdk.assets.activate(tokenAsset.id, issuer.id);

    // Step 6: Mint and distribute initial supply
    const totalSupplyBigInt = BigInt(this.config.totalSupply);

    const rewardsAmount = (totalSupplyBigInt * BigInt(this.config.distribution.rewardsPool)) / BigInt(100);
    const operationsAmount = (totalSupplyBigInt * BigInt(this.config.distribution.operations)) / BigInt(100);
    const teamAmount = (totalSupplyBigInt * BigInt(this.config.distribution.team)) / BigInt(100);
    const treasuryAmount = (totalSupplyBigInt * BigInt(this.config.distribution.treasury)) / BigInt(100);

    await this.sdk.tokens.mint(tokenAsset.id, rewardsPool.id, rewardsAmount.toString());
    await this.sdk.tokens.mint(tokenAsset.id, operations.id, operationsAmount.toString());
    await this.sdk.tokens.mint(tokenAsset.id, team.id, teamAmount.toString());
    await this.sdk.tokens.mint(tokenAsset.id, treasury.id, treasuryAmount.toString());

    return {
      tokenAssetId: tokenAsset.id,
      rewardsPoolId: rewardsPool.id,
      operationsId: operations.id,
      teamId: team.id,
      treasuryId: treasury.id,
    };
  }

  /**
   * Reward a user with $AHOY tokens
   */
  async rewardUser(distribution: RewardDistribution): Promise<{
    success: boolean;
    amount: number;
    transaction: AhoyTransaction;
  }> {
    if (!this.tokenAssetId || !this.rewardsPoolId) {
      throw new SDKError('Token not initialized. Call initialize() first.', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call initialize() before rewardUser()' },
      });
    }

    // Get points configuration for this action
    const pointsConfig = AhoyEcosystemConfig.POINTS_CONFIG[distribution.action];
    if (!pointsConfig || !pointsConfig.isEarn) {
      throw new ValidationError(`Invalid earn action: ${distribution.action}`, {
        field: 'action',
        constraints: { isEarn: 'true' },
      });
    }

    const amount = pointsConfig.points;

    // Get current balance
    const balanceBefore = await this.sdk.tokens.getBalance(this.tokenAssetId, distribution.userId);

    // Transfer from rewards pool to user
    const result = await this.sdk.tokens.transfer(
      this.tokenAssetId,
      this.rewardsPoolId,
      distribution.userId,
      amount.toString()
    );

    if (!result.success) {
      throw new SDKError(`Failed to reward user: ${result.error}`, ErrorCode.INTERNAL, {
        details: { userId: distribution.userId, action: distribution.action },
      });
    }

    // Get new balance
    const balanceAfter = await this.sdk.tokens.getBalance(this.tokenAssetId, distribution.userId);

    // Create transaction record
    const transaction: AhoyTransaction = {
      txId: uuidv4(),
      userId: distribution.userId,
      action: distribution.action,
      points: amount,
      balanceBefore,
      balanceAfter,
      source: distribution.source,
      referenceId: distribution.referenceId,
      timestamp: new Date().toISOString(),
    };

    this.transactionLog.push(transaction);

    return {
      success: true,
      amount,
      transaction,
    };
  }

  /**
   * Burn/redeem $AHOY tokens for a benefit
   */
  async redeemTokens(
    userId: string,
    action: AhoyActionType,
    source: 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'NEXUS' | 'CONNECT'
  ): Promise<{
    success: boolean;
    error?: string;
    pointsBurned: number;
    transaction?: AhoyTransaction;
  }> {
    if (!this.tokenAssetId || !this.rewardsPoolId) {
      throw new SDKError('Token not initialized. Call initialize() first.', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call initialize() before redeemTokens()' },
      });
    }

    // Get points configuration for this action
    const pointsConfig = AhoyEcosystemConfig.POINTS_CONFIG[action];
    if (!pointsConfig || pointsConfig.isEarn) {
      return { success: false, error: `Invalid redemption action: ${action}`, pointsBurned: 0 };
    }

    const pointsRequired = Math.abs(pointsConfig.points);

    // Check user balance
    const currentBalanceStr = await this.sdk.tokens.getBalance(this.tokenAssetId, userId);
    const currentBalance = BigInt(currentBalanceStr);
    if (currentBalance < BigInt(pointsRequired)) {
      return {
        success: false,
        error: `Insufficient balance. Required: ${pointsRequired}, Available: ${currentBalance}`,
        pointsBurned: 0,
      };
    }

    const balanceBefore = currentBalance.toString();

    // Transfer from user back to rewards pool (effectively a burn for redemption)
    const result = await this.sdk.tokens.transfer(
      this.tokenAssetId,
      userId,
      this.rewardsPoolId,
      pointsRequired.toString()
    );

    if (!result.success) {
      return { success: false, error: result.error, pointsBurned: 0 };
    }

    const balanceAfter = await this.sdk.tokens.getBalance(this.tokenAssetId, userId);

    // Create transaction record
    const transaction: AhoyTransaction = {
      txId: uuidv4(),
      userId,
      action,
      points: -pointsRequired,
      balanceBefore,
      balanceAfter,
      source,
      timestamp: new Date().toISOString(),
    };

    this.transactionLog.push(transaction);

    return {
      success: true,
      pointsBurned: pointsRequired,
      transaction,
    };
  }

  /**
   * Get user's $AHOY balance
   */
  async getBalance(userId: string): Promise<string> {
    if (!this.tokenAssetId) {
      throw new SDKError('Token not initialized', ErrorCode.NOT_INITIALIZED, {
        details: { hint: 'Call initialize() before getBalance()' },
      });
    }
    return await this.sdk.tokens.getBalance(this.tokenAssetId, userId);
  }

  /**
   * Get user's transaction history
   */
  getTransactionHistory(userId: string): AhoyTransaction[] {
    return this.transactionLog.filter(tx => tx.userId === userId);
  }

  /**
   * Get all transactions
   */
  getAllTransactions(): AhoyTransaction[] {
    return [...this.transactionLog];
  }

  /**
   * Get token asset ID
   */
  getTokenAssetId(): string | null {
    return this.tokenAssetId;
  }
}

/**
 * Default token configuration
 */
export const DEFAULT_AHOY_TOKEN_CONFIG: AhoyTokenConfig = {
  totalSupply: '1000000000000000000000000000', // 1 billion tokens (with 18 decimals)
  distribution: {
    rewardsPool: 40, // 40% for user rewards
    operations: 20, // 20% for operations
    team: 15, // 15% for team (vested)
    treasury: 25, // 25% for treasury
  },
  teamVestingDays: 730, // 2 years vesting
};

/**
 * Quick start helper for $AHOY token
 */
export async function initializeAhoyToken(sdk: TokenisationSDK): Promise<{
  tokenAssetId: string;
  pack: AhoyTokenPack;
}> {
  const pack = new AhoyTokenPack(sdk, DEFAULT_AHOY_TOKEN_CONFIG);
  const result = await pack.initialize();

  return {
    tokenAssetId: result.tokenAssetId,
    pack,
  };
}

/**
 * Create a demo user and give them starting tokens
 */
export async function createDemoUser(
  sdk: TokenisationSDK,
  pack: AhoyTokenPack,
  userName: string
): Promise<{
  userId: string;
  balance: string;
}> {
  // Create user
  const user = sdk.parties_.create({
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    name: userName,
    jurisdiction: 'AE',
  });

  // Give welcome bonus
  await pack.rewardUser({
    userId: user.id,
    action: AhoyActionType.REFERRAL, // 200 points welcome bonus
    source: 'FLYPLUS',
    referenceId: 'WELCOME_BONUS',
  });

  return {
    userId: user.id,
    balance: await pack.getBalance(user.id),
  };
}
