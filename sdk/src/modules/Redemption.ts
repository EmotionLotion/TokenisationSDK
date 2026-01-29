/**
 * Redemption Module
 *
 * Handles token redemption workflows for real estate and other assets.
 * Supports partial and full redemptions with approval workflows.
 *
 * State Machine: REQUESTED -> PENDING_APPROVAL -> APPROVED -> SETTLED (or CANCELLED)
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BaseEvent, EventType, LifecycleState } from '../core/types.js';
import { SDKError, ErrorCode } from '../errors/index.js';

// ============================================================================
// TYPES AND SCHEMAS
// ============================================================================

/**
 * Redemption request status
 */
export enum RedemptionStatus {
  /** Request submitted, awaiting review */
  REQUESTED = 'REQUESTED',

  /** Request under review by admin */
  PENDING_APPROVAL = 'PENDING_APPROVAL',

  /** Request approved, pending settlement */
  APPROVED = 'APPROVED',

  /** Tokens burned, funds disbursed */
  SETTLED = 'SETTLED',

  /** Request cancelled or rejected */
  CANCELLED = 'CANCELLED',

  /** Request rejected by admin */
  REJECTED = 'REJECTED',
}

/**
 * Redemption type
 */
export enum RedemptionType {
  /** Full redemption of all holdings */
  FULL = 'FULL',

  /** Partial redemption */
  PARTIAL = 'PARTIAL',

  /** Mandatory redemption (issuer-initiated) */
  MANDATORY = 'MANDATORY',

  /** Asset maturity redemption */
  MATURITY = 'MATURITY',
}

/**
 * Redemption request schema
 */
export const RedemptionRequestSchema = z.object({
  /** Unique request ID */
  id: z.string().uuid(),

  /** Asset being redeemed */
  assetId: z.string().uuid(),

  /** Investor requesting redemption */
  investorId: z.string().uuid(),

  /** Investor wallet address */
  investorAddress: z.string().optional(),

  /** Amount of tokens to redeem */
  amount: z.string(),

  /** Redemption type */
  type: z.nativeEnum(RedemptionType),

  /** Current status */
  status: z.nativeEnum(RedemptionStatus),

  /** Redemption value (calculated based on NAV or other pricing) */
  redemptionValue: z.string().optional(),

  /** Currency for redemption value */
  currency: z.string().default('USD'),

  /** Reason for redemption */
  reason: z.string().optional(),

  /** Admin who approved/rejected */
  processedBy: z.string().optional(),

  /** Processing notes */
  processingNotes: z.string().optional(),

  /** When request was submitted */
  requestedAt: z.string().datetime(),

  /** When request was approved */
  approvedAt: z.string().datetime().optional(),

  /** When tokens were burned and funds disbursed */
  settledAt: z.string().datetime().optional(),

  /** Transaction hash for on-chain burn */
  burnTxHash: z.string().optional(),

  /** Transaction hash for fund disbursement */
  disbursementTxHash: z.string().optional(),

  /** Rejection reason if rejected */
  rejectionReason: z.string().optional(),

  /** Metadata */
  metadata: z.record(z.unknown()).optional(),

  /** Created at */
  createdAt: z.string().datetime(),

  /** Updated at */
  updatedAt: z.string().datetime(),
});

export type RedemptionRequest = z.infer<typeof RedemptionRequestSchema>;

/**
 * Asset redemption state
 */
export interface AssetRedemptionState {
  assetId: string;
  totalSupply: string;
  redeemedAmount: string;
  outstandingAmount: string;
  redemptionCount: number;
  lastRedemptionAt?: string;
  isClosed: boolean;
  closedAt?: string;
}

/**
 * Investor balance for redemption calculations
 */
export interface InvestorBalance {
  investorId: string;
  balance: string;
  frozenAmount?: string;
  availableForRedemption: string;
}

// ============================================================================
// REDEMPTION ENGINE
// ============================================================================

/**
 * Redemption Engine for managing token redemptions
 */
export class RedemptionEngine {
  private requests: Map<string, RedemptionRequest> = new Map();
  private assetStates: Map<string, AssetRedemptionState> = new Map();
  private investorBalances: Map<string, Map<string, InvestorBalance>> = new Map(); // assetId -> investorId -> balance
  private eventStore?: { append: (event: BaseEvent) => Promise<void> };
  private frozenInvestors: Set<string> = new Set();

  constructor(eventStore?: { append: (event: BaseEvent) => Promise<void> }) {
    this.eventStore = eventStore;
  }

  // ============================================
  // ASSET STATE MANAGEMENT
  // ============================================

  /**
   * Initialize asset for redemption tracking
   */
  initializeAsset(assetId: string, totalSupply: string): AssetRedemptionState {
    const state: AssetRedemptionState = {
      assetId,
      totalSupply,
      redeemedAmount: '0',
      outstandingAmount: totalSupply,
      redemptionCount: 0,
      isClosed: false,
    };

    this.assetStates.set(assetId, state);
    this.investorBalances.set(assetId, new Map());

    return state;
  }

  /**
   * Get asset redemption state
   */
  getAssetState(assetId: string): AssetRedemptionState | undefined {
    return this.assetStates.get(assetId);
  }

  /**
   * Set investor balance
   */
  setInvestorBalance(assetId: string, investorId: string, balance: string, frozenAmount?: string): void {
    let assetBalances = this.investorBalances.get(assetId);
    if (!assetBalances) {
      assetBalances = new Map();
      this.investorBalances.set(assetId, assetBalances);
    }

    const available = BigInt(balance) - BigInt(frozenAmount || '0');

    assetBalances.set(investorId, {
      investorId,
      balance,
      frozenAmount,
      availableForRedemption: available.toString(),
    });
  }

  /**
   * Get investor balance
   */
  getInvestorBalance(assetId: string, investorId: string): InvestorBalance | undefined {
    return this.investorBalances.get(assetId)?.get(investorId);
  }

  /**
   * Freeze an investor (blocks redemption)
   */
  freezeInvestor(investorId: string): void {
    this.frozenInvestors.add(investorId);
  }

  /**
   * Unfreeze an investor
   */
  unfreezeInvestor(investorId: string): void {
    this.frozenInvestors.delete(investorId);
  }

  /**
   * Check if investor is frozen
   */
  isInvestorFrozen(investorId: string): boolean {
    return this.frozenInvestors.has(investorId);
  }

  // ============================================
  // REDEMPTION REQUEST WORKFLOW
  // ============================================

  /**
   * Submit a redemption request (RE-E2E Step 7: Investor A requests redemption)
   */
  requestRedemption(params: {
    assetId: string;
    investorId: string;
    investorAddress?: string;
    amount: string;
    type?: RedemptionType;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): { success: boolean; request?: RedemptionRequest; error?: string; errorCode?: string } {
    const assetState = this.assetStates.get(params.assetId);
    if (!assetState) {
      return { success: false, error: 'Asset not initialized for redemption', errorCode: 'ASSET_NOT_FOUND' };
    }

    if (assetState.isClosed) {
      return { success: false, error: 'Asset is closed, no redemptions allowed', errorCode: 'ASSET_CLOSED' };
    }

    // Check if investor is frozen
    if (this.frozenInvestors.has(params.investorId)) {
      return { success: false, error: 'Investor account is frozen', errorCode: 'INVESTOR_FROZEN' };
    }

    // Check investor balance
    const balance = this.getInvestorBalance(params.assetId, params.investorId);
    if (!balance) {
      return { success: false, error: 'Investor has no balance in this asset', errorCode: 'NO_BALANCE' };
    }

    const requestAmount = BigInt(params.amount);
    const availableAmount = BigInt(balance.availableForRedemption);

    if (requestAmount > availableAmount) {
      return {
        success: false,
        error: `Insufficient balance. Available: ${balance.availableForRedemption}, Requested: ${params.amount}`,
        errorCode: 'INSUFFICIENT_BALANCE',
      };
    }

    // Determine redemption type
    const type = params.type || (requestAmount === BigInt(balance.balance)
      ? RedemptionType.FULL
      : RedemptionType.PARTIAL);

    const now = new Date().toISOString();

    const request: RedemptionRequest = {
      id: uuidv4(),
      assetId: params.assetId,
      investorId: params.investorId,
      investorAddress: params.investorAddress,
      amount: params.amount,
      type,
      status: RedemptionStatus.REQUESTED,
      currency: 'USD',
      reason: params.reason,
      requestedAt: now,
      metadata: params.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(request.id, request);

    // Emit event
    this.emitEvent('REDEMPTION_REQUESTED', params.assetId, {
      requestId: request.id,
      investorId: params.investorId,
      amount: params.amount,
      type,
    });

    return { success: true, request };
  }

  /**
   * Approve a redemption request (RE-E2E Step 7: Admin approves)
   */
  approveRedemption(params: {
    requestId: string;
    approvedBy: string;
    redemptionValue?: string;
    notes?: string;
  }): { success: boolean; request?: RedemptionRequest; error?: string; errorCode?: string } {
    const request = this.requests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Redemption request not found', errorCode: 'REQUEST_NOT_FOUND' };
    }

    if (request.status !== RedemptionStatus.REQUESTED && request.status !== RedemptionStatus.PENDING_APPROVAL) {
      return { success: false, error: `Cannot approve request in status ${request.status}`, errorCode: 'INVALID_STATE' };
    }

    // Check if investor is now frozen
    if (this.frozenInvestors.has(request.investorId)) {
      return { success: false, error: 'Investor account is frozen', errorCode: 'INVESTOR_FROZEN' };
    }

    const now = new Date().toISOString();

    request.status = RedemptionStatus.APPROVED;
    request.approvedAt = now;
    request.processedBy = params.approvedBy;
    request.processingNotes = params.notes;
    request.redemptionValue = params.redemptionValue;
    request.updatedAt = now;

    // Emit event
    this.emitEvent('REDEMPTION_APPROVED', request.assetId, {
      requestId: request.id,
      investorId: request.investorId,
      amount: request.amount,
      redemptionValue: params.redemptionValue,
      approvedBy: params.approvedBy,
    });

    return { success: true, request };
  }

  /**
   * Settle a redemption (burn tokens, disburse funds) (RE-E2E Step 7: Tokens burned)
   */
  settleRedemption(params: {
    requestId: string;
    settledBy: string;
    burnTxHash?: string;
    disbursementTxHash?: string;
  }): { success: boolean; request?: RedemptionRequest; assetState?: AssetRedemptionState; error?: string; errorCode?: string } {
    const request = this.requests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Redemption request not found', errorCode: 'REQUEST_NOT_FOUND' };
    }

    if (request.status !== RedemptionStatus.APPROVED) {
      return { success: false, error: `Cannot settle request in status ${request.status}`, errorCode: 'INVALID_STATE' };
    }

    const assetState = this.assetStates.get(request.assetId);
    if (!assetState) {
      return { success: false, error: 'Asset state not found', errorCode: 'ASSET_NOT_FOUND' };
    }

    const now = new Date().toISOString();

    // Update request
    request.status = RedemptionStatus.SETTLED;
    request.settledAt = now;
    request.burnTxHash = params.burnTxHash;
    request.disbursementTxHash = params.disbursementTxHash;
    request.updatedAt = now;

    // Update asset state
    const redeemAmount = BigInt(request.amount);
    assetState.redeemedAmount = (BigInt(assetState.redeemedAmount) + redeemAmount).toString();
    assetState.outstandingAmount = (BigInt(assetState.outstandingAmount) - redeemAmount).toString();
    assetState.redemptionCount++;
    assetState.lastRedemptionAt = now;

    // Update investor balance
    const balance = this.getInvestorBalance(request.assetId, request.investorId);
    if (balance) {
      const newBalance = (BigInt(balance.balance) - redeemAmount).toString();
      const newAvailable = (BigInt(balance.availableForRedemption) - redeemAmount).toString();
      this.setInvestorBalance(request.assetId, request.investorId, newBalance, balance.frozenAmount);
    }

    // Emit event
    this.emitEvent('REDEMPTION_SETTLED', request.assetId, {
      requestId: request.id,
      investorId: request.investorId,
      amount: request.amount,
      burnTxHash: params.burnTxHash,
      newOutstandingSupply: assetState.outstandingAmount,
    });

    return { success: true, request, assetState };
  }

  /**
   * Reject a redemption request
   */
  rejectRedemption(params: {
    requestId: string;
    rejectedBy: string;
    reason: string;
  }): { success: boolean; request?: RedemptionRequest; error?: string } {
    const request = this.requests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Redemption request not found' };
    }

    if (request.status !== RedemptionStatus.REQUESTED && request.status !== RedemptionStatus.PENDING_APPROVAL) {
      return { success: false, error: `Cannot reject request in status ${request.status}` };
    }

    const now = new Date().toISOString();

    request.status = RedemptionStatus.REJECTED;
    request.processedBy = params.rejectedBy;
    request.rejectionReason = params.reason;
    request.updatedAt = now;

    // Emit event
    this.emitEvent('REDEMPTION_REJECTED', request.assetId, {
      requestId: request.id,
      investorId: request.investorId,
      reason: params.reason,
    });

    return { success: true, request };
  }

  /**
   * Cancel a redemption request (by investor)
   */
  cancelRedemption(params: {
    requestId: string;
    cancelledBy: string;
    reason?: string;
  }): { success: boolean; request?: RedemptionRequest; error?: string } {
    const request = this.requests.get(params.requestId);
    if (!request) {
      return { success: false, error: 'Redemption request not found' };
    }

    if (request.status === RedemptionStatus.SETTLED) {
      return { success: false, error: 'Cannot cancel settled redemption' };
    }

    if (request.investorId !== params.cancelledBy) {
      return { success: false, error: 'Only the investor can cancel their own request' };
    }

    const now = new Date().toISOString();

    request.status = RedemptionStatus.CANCELLED;
    request.processingNotes = params.reason;
    request.updatedAt = now;

    return { success: true, request };
  }

  // ============================================
  // ASSET CLOSURE (RE-E2E Step 8)
  // ============================================

  /**
   * Close an asset (all tokens redeemed, no further operations) (RE-E2E Step 8)
   */
  closeAsset(params: {
    assetId: string;
    closedBy: string;
    force?: boolean;
  }): { success: boolean; assetState?: AssetRedemptionState; error?: string; errorCode?: string } {
    const assetState = this.assetStates.get(params.assetId);
    if (!assetState) {
      return { success: false, error: 'Asset not found', errorCode: 'ASSET_NOT_FOUND' };
    }

    if (assetState.isClosed) {
      return { success: false, error: 'Asset already closed', errorCode: 'ALREADY_CLOSED' };
    }

    // Check if all tokens are redeemed (unless force close)
    if (!params.force && BigInt(assetState.outstandingAmount) > 0n) {
      return {
        success: false,
        error: `Cannot close asset with outstanding tokens: ${assetState.outstandingAmount}`,
        errorCode: 'OUTSTANDING_TOKENS',
      };
    }

    const now = new Date().toISOString();

    assetState.isClosed = true;
    assetState.closedAt = now;

    // Emit event
    this.emitEvent('ASSET_CLOSED', params.assetId, {
      closedBy: params.closedBy,
      totalRedeemed: assetState.redeemedAmount,
      redemptionCount: assetState.redemptionCount,
      forced: params.force || false,
    });

    return { success: true, assetState };
  }

  // ============================================
  // QUERY METHODS
  // ============================================

  /**
   * Get redemption request by ID
   */
  getRequest(requestId: string): RedemptionRequest | undefined {
    return this.requests.get(requestId);
  }

  /**
   * Get all redemption requests for an asset
   */
  getRequestsForAsset(assetId: string): RedemptionRequest[] {
    return Array.from(this.requests.values()).filter(r => r.assetId === assetId);
  }

  /**
   * Get all redemption requests for an investor
   */
  getRequestsForInvestor(investorId: string): RedemptionRequest[] {
    return Array.from(this.requests.values()).filter(r => r.investorId === investorId);
  }

  /**
   * Get pending redemption requests
   */
  getPendingRequests(assetId?: string): RedemptionRequest[] {
    return Array.from(this.requests.values()).filter(r => {
      const isPending = r.status === RedemptionStatus.REQUESTED ||
                       r.status === RedemptionStatus.PENDING_APPROVAL ||
                       r.status === RedemptionStatus.APPROVED;
      return isPending && (!assetId || r.assetId === assetId);
    });
  }

  /**
   * Calculate suggested lifecycle state based on redemption state
   */
  getSuggestedLifecycleState(assetId: string): LifecycleState {
    const assetState = this.assetStates.get(assetId);
    if (!assetState) {
      return LifecycleState.ACTIVE;
    }

    if (assetState.isClosed) {
      return LifecycleState.CLOSED;
    }

    if (BigInt(assetState.outstandingAmount) === 0n) {
      return LifecycleState.REDEEMED;
    }

    if (BigInt(assetState.redeemedAmount) > 0n) {
      return LifecycleState.PARTIALLY_REDEEMED;
    }

    return LifecycleState.ACTIVE;
  }

  // ============================================
  // EVENT EMISSION
  // ============================================

  private async emitEvent(
    action: string,
    assetId: string,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.eventStore) return;

    await this.eventStore.append({
      id: uuidv4(),
      type: EventType.ASSET_UPDATED,
      assetId,
      timestamp: new Date().toISOString(),
      actorId: 'redemption-engine',
      payload: {
        action,
        ...data,
      },
      eventVersion: 1,
    });
  }
}
