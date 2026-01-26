/**
 * Offerings Module
 *
 * Manages token offerings with subscription tracking, investor caps,
 * and compliance-gated participation.
 *
 * @example
 * ```typescript
 * const engine = new OfferingsEngine(sdk);
 *
 * // Create an offering
 * const offering = await engine.createOffering({
 *   assetId: 'asset-123',
 *   name: 'Series A Token Offering',
 *   minInvestment: '10000',
 *   maxInvestment: '1000000',
 *   targetRaise: '50000000',
 *   hardCap: '75000000',
 *   subscriptionPeriod: {
 *     start: '2024-01-15T00:00:00Z',
 *     end: '2024-03-15T00:00:00Z',
 *   },
 * });
 *
 * // Subscribe investor
 * const subscription = await engine.subscribe(offering.id, {
 *   investorId: 'investor-123',
 *   amount: '50000',
 *   paymentMethod: 'WIRE',
 * });
 *
 * // Close offering and mint tokens
 * await engine.closeOffering(offering.id);
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../core/types.js';
import { ok, err } from '../core/types.js';
import { ValidationError, SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Offering status
 */
export enum OfferingStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  PAUSED = 'PAUSED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  SETTLED = 'SETTLED',
}

/**
 * Offering type
 */
export enum OfferingType {
  PUBLIC = 'PUBLIC',
  PRIVATE_PLACEMENT = 'PRIVATE_PLACEMENT',
  REG_D_506B = 'REG_D_506B',
  REG_D_506C = 'REG_D_506C',
  REG_S = 'REG_S',
  REG_A_PLUS = 'REG_A_PLUS',
  REG_CF = 'REG_CF',
}

/**
 * Subscription status
 */
export enum SubscriptionStatus {
  PENDING = 'PENDING',
  KYC_REQUIRED = 'KYC_REQUIRED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  CONFIRMED = 'CONFIRMED',
  ALLOCATED = 'ALLOCATED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * Payment method
 */
export enum PaymentMethod {
  WIRE = 'WIRE',
  ACH = 'ACH',
  CRYPTO = 'CRYPTO',
  STABLECOIN = 'STABLECOIN',
  CREDIT_CARD = 'CREDIT_CARD',
}

/**
 * Investor tier for allocation priority
 */
export enum InvestorTier {
  RETAIL = 'RETAIL',
  ACCREDITED = 'ACCREDITED',
  QUALIFIED_PURCHASER = 'QUALIFIED_PURCHASER',
  INSTITUTIONAL = 'INSTITUTIONAL',
  STRATEGIC = 'STRATEGIC',
}

/**
 * Offering configuration
 */
export interface OfferingConfig {
  /** Associated asset ID */
  assetId: string;

  /** Offering name */
  name: string;

  /** Offering description */
  description?: string;

  /** Offering type (regulatory framework) */
  type?: OfferingType;

  /** Minimum investment amount */
  minInvestment: string;

  /** Maximum investment per investor */
  maxInvestment: string;

  /** Target raise amount (soft cap) */
  targetRaise: string;

  /** Hard cap - maximum total raise */
  hardCap: string;

  /** Price per token */
  tokenPrice: string;

  /** Subscription period */
  subscriptionPeriod: {
    start: string;
    end: string;
  };

  /** Allowed investor tiers */
  allowedTiers?: InvestorTier[];

  /** Allowed jurisdictions (ISO country codes) */
  allowedJurisdictions?: string[];

  /** Blocked jurisdictions */
  blockedJurisdictions?: string[];

  /** Require accreditation */
  requireAccreditation?: boolean;

  /** Lock-up period after settlement (days) */
  lockupDays?: number;

  /** Vesting schedule ID (if applicable) */
  vestingScheduleId?: string;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Offering entity
 */
export interface Offering {
  id: string;
  assetId: string;
  name: string;
  description: string;
  type: OfferingType;
  status: OfferingStatus;

  /** Investment limits */
  minInvestment: string;
  maxInvestment: string;
  targetRaise: string;
  hardCap: string;
  tokenPrice: string;

  /** Timeline */
  subscriptionPeriod: {
    start: string;
    end: string;
  };

  /** Compliance */
  allowedTiers: InvestorTier[];
  allowedJurisdictions: string[];
  blockedJurisdictions: string[];
  requireAccreditation: boolean;
  lockupDays: number;
  vestingScheduleId?: string;

  /** Tracking */
  totalSubscribed: string;
  totalConfirmed: string;
  totalAllocated: string;
  subscriberCount: number;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  openedAt?: string;
  closedAt?: string;
  settledAt?: string;

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Subscription request
 */
export interface SubscriptionRequest {
  /** Investor party ID */
  investorId: string;

  /** Subscription amount */
  amount: string;

  /** Payment method */
  paymentMethod: PaymentMethod;

  /** Payment reference (wire ref, tx hash, etc.) */
  paymentReference?: string;

  /** Investor's wallet address for token delivery */
  walletAddress?: string;

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Subscription entity
 */
export interface Subscription {
  id: string;
  offeringId: string;
  investorId: string;
  status: SubscriptionStatus;

  /** Investment details */
  amount: string;
  tokenAmount: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  walletAddress?: string;

  /** Compliance */
  kycVerified: boolean;
  accreditationVerified: boolean;
  jurisdictionApproved: boolean;

  /** Allocation */
  allocatedAmount?: string;
  allocationReason?: string;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  allocatedAt?: string;

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

/**
 * Offering summary for reporting
 */
export interface OfferingSummary {
  offering: Offering;
  subscriptions: {
    total: number;
    pending: number;
    confirmed: number;
    allocated: number;
    rejected: number;
  };
  amounts: {
    subscribed: string;
    confirmed: string;
    allocated: string;
    percentOfTarget: number;
    percentOfHardCap: number;
  };
  investors: {
    byTier: Record<InvestorTier, number>;
    byJurisdiction: Record<string, number>;
  };
}

// ============================================================================
// OFFERINGS ENGINE
// ============================================================================

/**
 * Interface for SDK integration
 */
interface SDKInterface {
  parties_: {
    get(id: string): { kycVerified?: boolean; jurisdiction?: string } | undefined;
  };
  tokens: {
    mint(assetId: string, to: string, amount: string): Promise<Result<void, string>>;
  };
  assets: {
    get(id: string): Promise<{ id: string; issuerId: string } | null>;
  };
}

/**
 * Offerings Engine
 *
 * Manages the full lifecycle of token offerings.
 */
export class OfferingsEngine {
  private offerings: Map<string, Offering> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private offeringSubscriptions: Map<string, Set<string>> = new Map();

  constructor(private sdk: SDKInterface) {}

  /**
   * Create a new offering
   */
  async createOffering(config: OfferingConfig): Promise<Result<Offering, string>> {
    // Validate asset exists
    const asset = await this.sdk.assets.get(config.assetId);
    if (!asset) {
      return err(`Asset not found: ${config.assetId}`);
    }

    // Validate dates
    const start = new Date(config.subscriptionPeriod.start);
    const end = new Date(config.subscriptionPeriod.end);
    if (end <= start) {
      return err('Subscription end date must be after start date');
    }

    // Validate amounts
    const min = BigInt(config.minInvestment);
    const max = BigInt(config.maxInvestment);
    const target = BigInt(config.targetRaise);
    const hard = BigInt(config.hardCap);

    if (min > max) {
      return err('Minimum investment cannot exceed maximum');
    }
    if (target > hard) {
      return err('Target raise cannot exceed hard cap');
    }

    const offering: Offering = {
      id: uuidv4(),
      assetId: config.assetId,
      name: config.name,
      description: config.description || '',
      type: config.type || OfferingType.PRIVATE_PLACEMENT,
      status: OfferingStatus.DRAFT,

      minInvestment: config.minInvestment,
      maxInvestment: config.maxInvestment,
      targetRaise: config.targetRaise,
      hardCap: config.hardCap,
      tokenPrice: config.tokenPrice,

      subscriptionPeriod: config.subscriptionPeriod,

      allowedTiers: config.allowedTiers || [InvestorTier.ACCREDITED, InvestorTier.INSTITUTIONAL],
      allowedJurisdictions: config.allowedJurisdictions || [],
      blockedJurisdictions: config.blockedJurisdictions || ['US', 'KP', 'IR', 'CU'],
      requireAccreditation: config.requireAccreditation ?? true,
      lockupDays: config.lockupDays || 0,
      vestingScheduleId: config.vestingScheduleId,

      totalSubscribed: '0',
      totalConfirmed: '0',
      totalAllocated: '0',
      subscriberCount: 0,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      metadata: config.metadata || {},
    };

    this.offerings.set(offering.id, offering);
    this.offeringSubscriptions.set(offering.id, new Set());

    return ok(offering);
  }

  /**
   * Open an offering for subscriptions
   */
  async openOffering(offeringId: string): Promise<Result<Offering, string>> {
    const offering = this.offerings.get(offeringId);
    if (!offering) {
      return err(`Offering not found: ${offeringId}`);
    }

    if (offering.status !== OfferingStatus.DRAFT && offering.status !== OfferingStatus.PAUSED) {
      return err(`Cannot open offering in status: ${offering.status}`);
    }

    offering.status = OfferingStatus.OPEN;
    offering.openedAt = new Date().toISOString();
    offering.updatedAt = new Date().toISOString();

    return ok(offering);
  }

  /**
   * Subscribe to an offering
   */
  async subscribe(
    offeringId: string,
    request: SubscriptionRequest
  ): Promise<Result<Subscription, string>> {
    const offering = this.offerings.get(offeringId);
    if (!offering) {
      return err(`Offering not found: ${offeringId}`);
    }

    if (offering.status !== OfferingStatus.OPEN) {
      return err(`Offering is not open for subscriptions: ${offering.status}`);
    }

    // Check subscription period
    const now = new Date();
    const start = new Date(offering.subscriptionPeriod.start);
    const end = new Date(offering.subscriptionPeriod.end);

    if (now < start) {
      return err('Subscription period has not started');
    }
    if (now > end) {
      return err('Subscription period has ended');
    }

    // Validate amount
    const amount = BigInt(request.amount);
    const min = BigInt(offering.minInvestment);
    const max = BigInt(offering.maxInvestment);

    if (amount < min) {
      return err(`Amount below minimum investment: ${offering.minInvestment}`);
    }
    if (amount > max) {
      return err(`Amount exceeds maximum investment: ${offering.maxInvestment}`);
    }

    // Check hard cap
    const totalAfter = BigInt(offering.totalSubscribed) + amount;
    if (totalAfter > BigInt(offering.hardCap)) {
      return err('Subscription would exceed hard cap');
    }

    // Check investor compliance
    const investor = this.sdk.parties_.get(request.investorId);
    const kycVerified = investor?.kycVerified || false;
    const jurisdiction = investor?.jurisdiction || 'UNKNOWN';

    // Check jurisdiction
    const jurisdictionApproved =
      !offering.blockedJurisdictions.includes(jurisdiction) &&
      (offering.allowedJurisdictions.length === 0 ||
        offering.allowedJurisdictions.includes(jurisdiction));

    // Calculate token amount
    const tokenPrice = BigInt(offering.tokenPrice);
    const tokenAmount = tokenPrice > 0n ? (amount * BigInt(1e18)) / tokenPrice : 0n;

    // Determine initial status
    let status = SubscriptionStatus.PENDING;
    if (!kycVerified) {
      status = SubscriptionStatus.KYC_REQUIRED;
    } else if (!jurisdictionApproved) {
      status = SubscriptionStatus.REJECTED;
    }

    const subscription: Subscription = {
      id: uuidv4(),
      offeringId,
      investorId: request.investorId,
      status,

      amount: request.amount,
      tokenAmount: tokenAmount.toString(),
      paymentMethod: request.paymentMethod,
      paymentReference: request.paymentReference,
      walletAddress: request.walletAddress,

      kycVerified,
      accreditationVerified: false, // Would check accreditation registry
      jurisdictionApproved,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      metadata: request.metadata || {},
    };

    this.subscriptions.set(subscription.id, subscription);
    this.offeringSubscriptions.get(offeringId)?.add(subscription.id);

    // Update offering totals
    if (status !== SubscriptionStatus.REJECTED) {
      offering.totalSubscribed = (BigInt(offering.totalSubscribed) + amount).toString();
      offering.subscriberCount++;
      offering.updatedAt = new Date().toISOString();
    }

    return ok(subscription);
  }

  /**
   * Confirm a subscription (after payment verification)
   */
  async confirmSubscription(
    subscriptionId: string,
    paymentReference?: string
  ): Promise<Result<Subscription, string>> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return err(`Subscription not found: ${subscriptionId}`);
    }

    if (subscription.status === SubscriptionStatus.REJECTED) {
      return err('Cannot confirm rejected subscription');
    }

    if (!subscription.kycVerified) {
      return err('KYC verification required before confirmation');
    }

    subscription.status = SubscriptionStatus.CONFIRMED;
    subscription.confirmedAt = new Date().toISOString();
    subscription.updatedAt = new Date().toISOString();
    if (paymentReference) {
      subscription.paymentReference = paymentReference;
    }

    // Update offering confirmed total
    const offering = this.offerings.get(subscription.offeringId);
    if (offering) {
      offering.totalConfirmed = (
        BigInt(offering.totalConfirmed) + BigInt(subscription.amount)
      ).toString();
      offering.updatedAt = new Date().toISOString();
    }

    return ok(subscription);
  }

  /**
   * Close an offering (stop accepting subscriptions)
   */
  async closeOffering(offeringId: string): Promise<Result<Offering, string>> {
    const offering = this.offerings.get(offeringId);
    if (!offering) {
      return err(`Offering not found: ${offeringId}`);
    }

    if (offering.status !== OfferingStatus.OPEN && offering.status !== OfferingStatus.PAUSED) {
      return err(`Cannot close offering in status: ${offering.status}`);
    }

    offering.status = OfferingStatus.CLOSED;
    offering.closedAt = new Date().toISOString();
    offering.updatedAt = new Date().toISOString();

    return ok(offering);
  }

  /**
   * Settle an offering (allocate tokens and mint)
   */
  async settleOffering(offeringId: string): Promise<Result<OfferingSummary, string>> {
    const offering = this.offerings.get(offeringId);
    if (!offering) {
      return err(`Offering not found: ${offeringId}`);
    }

    if (offering.status !== OfferingStatus.CLOSED) {
      return err('Offering must be closed before settlement');
    }

    const subscriptionIds = this.offeringSubscriptions.get(offeringId) || new Set();
    let totalAllocated = 0n;

    // Allocate and mint tokens for confirmed subscriptions
    for (const subId of subscriptionIds) {
      const subscription = this.subscriptions.get(subId);
      if (!subscription || subscription.status !== SubscriptionStatus.CONFIRMED) {
        continue;
      }

      // Allocate full amount (could implement pro-rata if oversubscribed)
      subscription.allocatedAmount = subscription.amount;
      subscription.status = SubscriptionStatus.ALLOCATED;
      subscription.allocatedAt = new Date().toISOString();
      subscription.updatedAt = new Date().toISOString();

      totalAllocated += BigInt(subscription.amount);

      // Mint tokens to investor
      if (subscription.walletAddress) {
        await this.sdk.tokens.mint(
          offering.assetId,
          subscription.walletAddress,
          subscription.tokenAmount
        );
      }
    }

    offering.totalAllocated = totalAllocated.toString();
    offering.status = OfferingStatus.SETTLED;
    offering.settledAt = new Date().toISOString();
    offering.updatedAt = new Date().toISOString();

    return ok(this.getOfferingSummary(offeringId)!);
  }

  /**
   * Get offering by ID
   */
  getOffering(offeringId: string): Offering | undefined {
    return this.offerings.get(offeringId);
  }

  /**
   * Get all offerings for an asset
   */
  getOfferingsForAsset(assetId: string): Offering[] {
    return Array.from(this.offerings.values()).filter((o) => o.assetId === assetId);
  }

  /**
   * Get subscriptions for an offering
   */
  getSubscriptions(offeringId: string): Subscription[] {
    const subscriptionIds = this.offeringSubscriptions.get(offeringId);
    if (!subscriptionIds) return [];

    return Array.from(subscriptionIds)
      .map((id) => this.subscriptions.get(id))
      .filter((s): s is Subscription => s !== undefined);
  }

  /**
   * Get subscription by ID
   */
  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }

  /**
   * Get investor's subscriptions
   */
  getInvestorSubscriptions(investorId: string): Subscription[] {
    return Array.from(this.subscriptions.values()).filter((s) => s.investorId === investorId);
  }

  /**
   * Get offering summary
   */
  getOfferingSummary(offeringId: string): OfferingSummary | undefined {
    const offering = this.offerings.get(offeringId);
    if (!offering) return undefined;

    const subscriptions = this.getSubscriptions(offeringId);

    const byStatus = {
      pending: 0,
      confirmed: 0,
      allocated: 0,
      rejected: 0,
    };

    const byTier: Record<InvestorTier, number> = {
      [InvestorTier.RETAIL]: 0,
      [InvestorTier.ACCREDITED]: 0,
      [InvestorTier.QUALIFIED_PURCHASER]: 0,
      [InvestorTier.INSTITUTIONAL]: 0,
      [InvestorTier.STRATEGIC]: 0,
    };

    const byJurisdiction: Record<string, number> = {};

    for (const sub of subscriptions) {
      switch (sub.status) {
        case SubscriptionStatus.PENDING:
        case SubscriptionStatus.KYC_REQUIRED:
        case SubscriptionStatus.PAYMENT_PENDING:
          byStatus.pending++;
          break;
        case SubscriptionStatus.CONFIRMED:
          byStatus.confirmed++;
          break;
        case SubscriptionStatus.ALLOCATED:
          byStatus.allocated++;
          break;
        case SubscriptionStatus.REJECTED:
        case SubscriptionStatus.CANCELLED:
        case SubscriptionStatus.REFUNDED:
          byStatus.rejected++;
          break;
      }

      const investor = this.sdk.parties_.get(sub.investorId);
      if (investor?.jurisdiction) {
        byJurisdiction[investor.jurisdiction] = (byJurisdiction[investor.jurisdiction] || 0) + 1;
      }
    }

    const targetRaise = BigInt(offering.targetRaise);
    const hardCap = BigInt(offering.hardCap);
    const confirmed = BigInt(offering.totalConfirmed);

    return {
      offering,
      subscriptions: {
        total: subscriptions.length,
        ...byStatus,
      },
      amounts: {
        subscribed: offering.totalSubscribed,
        confirmed: offering.totalConfirmed,
        allocated: offering.totalAllocated,
        percentOfTarget: targetRaise > 0n ? Number((confirmed * 100n) / targetRaise) : 0,
        percentOfHardCap: hardCap > 0n ? Number((confirmed * 100n) / hardCap) : 0,
      },
      investors: {
        byTier,
        byJurisdiction,
      },
    };
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    reason: string
  ): Promise<Result<Subscription, string>> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return err(`Subscription not found: ${subscriptionId}`);
    }

    if (subscription.status === SubscriptionStatus.ALLOCATED) {
      return err('Cannot cancel allocated subscription');
    }

    const previousStatus = subscription.status;
    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.metadata.cancellationReason = reason;
    subscription.updatedAt = new Date().toISOString();

    // Update offering totals if was counted
    if (
      previousStatus !== SubscriptionStatus.REJECTED &&
      previousStatus !== SubscriptionStatus.CANCELLED
    ) {
      const offering = this.offerings.get(subscription.offeringId);
      if (offering) {
        offering.totalSubscribed = (
          BigInt(offering.totalSubscribed) - BigInt(subscription.amount)
        ).toString();
        offering.subscriberCount = Math.max(0, offering.subscriberCount - 1);

        if (previousStatus === SubscriptionStatus.CONFIRMED) {
          offering.totalConfirmed = (
            BigInt(offering.totalConfirmed) - BigInt(subscription.amount)
          ).toString();
        }

        offering.updatedAt = new Date().toISOString();
      }
    }

    return ok(subscription);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create an offerings engine
 */
export function createOfferingsEngine(sdk: SDKInterface): OfferingsEngine {
  return new OfferingsEngine(sdk);
}
