/**
 * CustodyManager - Custody, Recovery, and Override Paths
 *
 * Provides institutional-grade custody management including:
 * - Multi-sig custody arrangements
 * - Recovery mechanisms for lost keys
 * - Emergency override paths for compliance
 * - Delegation and sub-custody
 *
 * @example
 * ```typescript
 * const custody = new CustodyManager();
 *
 * // Set up 2-of-3 multi-sig custody
 * custody.createCustodyArrangement({
 *   assetId: 'asset-123',
 *   type: CustodyType.MULTI_SIG,
 *   threshold: 2,
 *   custodians: ['custodian-1', 'custodian-2', 'custodian-3'],
 * });
 *
 * // Initiate recovery
 * custody.initiateRecovery({
 *   assetId: 'asset-123',
 *   reason: RecoveryReason.LOST_KEY,
 *   newOwner: 'new-address',
 * });
 * ```
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Custody arrangement types
 */
export enum CustodyType {
  /** Single key custody */
  SINGLE = 'SINGLE',
  /** Multi-signature custody */
  MULTI_SIG = 'MULTI_SIG',
  /** Time-locked custody */
  TIME_LOCKED = 'TIME_LOCKED',
  /** Delegated custody (sub-custodian) */
  DELEGATED = 'DELEGATED',
  /** Hardware security module */
  HSM = 'HSM',
  /** MPC (Multi-Party Computation) */
  MPC = 'MPC',
}

/**
 * Recovery reasons
 */
export enum RecoveryReason {
  /** Private key lost */
  LOST_KEY = 'LOST_KEY',
  /** Key holder deceased */
  DEATH = 'DEATH',
  /** Court order */
  COURT_ORDER = 'COURT_ORDER',
  /** Regulatory requirement */
  REGULATORY = 'REGULATORY',
  /** Fraud detected */
  FRAUD = 'FRAUD',
  /** Key compromised */
  COMPROMISED = 'COMPROMISED',
}

/**
 * Override types
 */
export enum OverrideType {
  /** Regulatory freeze */
  REGULATORY_FREEZE = 'REGULATORY_FREEZE',
  /** Court-ordered transfer */
  COURT_ORDER = 'COURT_ORDER',
  /** AML/Sanctions compliance */
  AML_COMPLIANCE = 'AML_COMPLIANCE',
  /** Emergency clawback */
  EMERGENCY_CLAWBACK = 'EMERGENCY_CLAWBACK',
  /** Dispute resolution */
  DISPUTE_RESOLUTION = 'DISPUTE_RESOLUTION',
}

/**
 * Approval status
 */
export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  EXECUTED = 'EXECUTED',
}

/**
 * Custody arrangement configuration
 */
export interface CustodyArrangement {
  id: string;
  assetId: string;
  type: CustodyType;
  /** Approval threshold (for multi-sig) */
  threshold: number;
  /** List of custodian identifiers */
  custodians: string[];
  /** Primary custodian (for delegated custody) */
  primaryCustodian?: string;
  /** Time lock duration in seconds (for time-locked) */
  timeLockSeconds?: number;
  /** Whether arrangement is active */
  active: boolean;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Metadata */
  metadata: Record<string, unknown>;
}

/**
 * Recovery request
 */
export interface RecoveryRequest {
  id: string;
  assetId: string;
  requestedBy: string;
  reason: RecoveryReason;
  /** New owner address after recovery */
  newOwner: string;
  /** Supporting documentation URIs */
  documents: string[];
  /** Required approvals for this recovery */
  requiredApprovals: number;
  /** Current approvals */
  approvals: RecoveryApproval[];
  status: ApprovalStatus;
  /** Time lock before execution (seconds) */
  timeLockSeconds: number;
  /** When recovery can be executed */
  executableAfter?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Recovery approval
 */
export interface RecoveryApproval {
  approverId: string;
  approverRole: string;
  approved: boolean;
  reason?: string;
  timestamp: string;
  signature?: string;
}

/**
 * Override request
 */
export interface OverrideRequest {
  id: string;
  type: OverrideType;
  assetId: string;
  targetAddress: string;
  requestedBy: string;
  /** Authority ordering the override */
  authority: string;
  /** Reference number (court case, regulatory filing) */
  referenceNumber: string;
  /** Action to take */
  action: 'FREEZE' | 'TRANSFER' | 'BURN' | 'UNFREEZE';
  /** Destination for transfers */
  destination?: string;
  /** Amount (for partial actions) */
  amount?: string;
  /** Supporting documents */
  documents: string[];
  approvals: OverrideApproval[];
  status: ApprovalStatus;
  createdAt: string;
  executedAt?: string;
}

/**
 * Override approval
 */
export interface OverrideApproval {
  approverId: string;
  role: 'COMPLIANCE_OFFICER' | 'LEGAL' | 'EXECUTIVE' | 'REGULATOR';
  approved: boolean;
  timestamp: string;
  notes?: string;
}

/**
 * Delegation record
 */
export interface Delegation {
  id: string;
  assetId: string;
  delegator: string;
  delegate: string;
  /** Delegated permissions */
  permissions: DelegatedPermission[];
  /** Delegation constraints */
  constraints: DelegationConstraint[];
  expiresAt?: string;
  active: boolean;
  createdAt: string;
}

export type DelegatedPermission = 'TRANSFER' | 'VOTE' | 'CLAIM_DIVIDENDS' | 'VIEW_ONLY';

export interface DelegationConstraint {
  type: 'MAX_AMOUNT' | 'WHITELIST_ONLY' | 'TIME_WINDOW' | 'APPROVAL_REQUIRED';
  value: unknown;
}

// ============================================================================
// CUSTODY MANAGER
// ============================================================================

/**
 * Manages custody arrangements, recovery, and override paths
 */
export class CustodyManager {
  private arrangements: Map<string, CustodyArrangement> = new Map();
  private recoveryRequests: Map<string, RecoveryRequest> = new Map();
  private overrideRequests: Map<string, OverrideRequest> = new Map();
  private delegations: Map<string, Delegation> = new Map();

  // Default time locks (in seconds)
  private readonly DEFAULT_RECOVERY_TIMELOCK = 7 * 24 * 60 * 60; // 7 days
  private readonly EMERGENCY_OVERRIDE_TIMELOCK = 24 * 60 * 60; // 24 hours

  // ==========================================================================
  // CUSTODY ARRANGEMENTS
  // ==========================================================================

  /**
   * Create a custody arrangement for an asset
   */
  createCustodyArrangement(params: {
    assetId: string;
    type: CustodyType;
    threshold?: number;
    custodians: string[];
    primaryCustodian?: string;
    timeLockSeconds?: number;
    metadata?: Record<string, unknown>;
  }): CustodyArrangement {
    const arrangement: CustodyArrangement = {
      id: uuidv4(),
      assetId: params.assetId,
      type: params.type,
      threshold: params.threshold || 1,
      custodians: params.custodians,
      primaryCustodian: params.primaryCustodian,
      timeLockSeconds: params.timeLockSeconds,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: params.metadata || {},
    };

    // Validate threshold for multi-sig
    if (params.type === CustodyType.MULTI_SIG) {
      if (arrangement.threshold > arrangement.custodians.length) {
        throw new Error('Threshold cannot exceed number of custodians');
      }
      if (arrangement.threshold < 1) {
        throw new Error('Threshold must be at least 1');
      }
    }

    this.arrangements.set(arrangement.id, arrangement);
    return arrangement;
  }

  /**
   * Get custody arrangement for an asset
   */
  getCustodyArrangement(assetId: string): CustodyArrangement | undefined {
    return Array.from(this.arrangements.values()).find(
      a => a.assetId === assetId && a.active
    );
  }

  /**
   * Update custody arrangement
   */
  updateCustodyArrangement(
    arrangementId: string,
    updates: Partial<Pick<CustodyArrangement, 'threshold' | 'custodians' | 'timeLockSeconds' | 'metadata'>>
  ): CustodyArrangement {
    const arrangement = this.arrangements.get(arrangementId);
    if (!arrangement) {
      throw new Error('Custody arrangement not found');
    }

    const updated = {
      ...arrangement,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.arrangements.set(arrangementId, updated);
    return updated;
  }

  /**
   * Deactivate custody arrangement
   */
  deactivateCustodyArrangement(arrangementId: string): void {
    const arrangement = this.arrangements.get(arrangementId);
    if (arrangement) {
      arrangement.active = false;
      arrangement.updatedAt = new Date().toISOString();
      this.arrangements.set(arrangementId, arrangement);
    }
  }

  // ==========================================================================
  // RECOVERY PATHS
  // ==========================================================================

  /**
   * Initiate a recovery request
   */
  initiateRecovery(params: {
    assetId: string;
    requestedBy: string;
    reason: RecoveryReason;
    newOwner: string;
    documents: string[];
  }): RecoveryRequest {
    const arrangement = this.getCustodyArrangement(params.assetId);

    // Determine required approvals based on custody type and reason
    let requiredApprovals = 2; // Default
    let timeLockSeconds = this.DEFAULT_RECOVERY_TIMELOCK;

    if (arrangement?.type === CustodyType.MULTI_SIG) {
      requiredApprovals = arrangement.threshold;
    }

    // Urgent reasons have shorter time locks
    if (params.reason === RecoveryReason.FRAUD || params.reason === RecoveryReason.COMPROMISED) {
      timeLockSeconds = this.EMERGENCY_OVERRIDE_TIMELOCK;
    }

    // Court orders require legal approval
    if (params.reason === RecoveryReason.COURT_ORDER) {
      requiredApprovals = Math.max(requiredApprovals, 3);
    }

    const request: RecoveryRequest = {
      id: uuidv4(),
      assetId: params.assetId,
      requestedBy: params.requestedBy,
      reason: params.reason,
      newOwner: params.newOwner,
      documents: params.documents,
      requiredApprovals,
      approvals: [],
      status: ApprovalStatus.PENDING,
      timeLockSeconds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.recoveryRequests.set(request.id, request);
    return request;
  }

  /**
   * Approve a recovery request
   */
  approveRecovery(params: {
    requestId: string;
    approverId: string;
    approverRole: string;
    approved: boolean;
    reason?: string;
    signature?: string;
  }): RecoveryRequest {
    const request = this.recoveryRequests.get(params.requestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error('Recovery request is not pending');
    }

    // Check for duplicate approval
    if (request.approvals.some(a => a.approverId === params.approverId)) {
      throw new Error('Approver has already responded to this request');
    }

    const approval: RecoveryApproval = {
      approverId: params.approverId,
      approverRole: params.approverRole,
      approved: params.approved,
      reason: params.reason,
      timestamp: new Date().toISOString(),
      signature: params.signature,
    };

    request.approvals.push(approval);
    request.updatedAt = new Date().toISOString();

    // Check if we have enough approvals
    const approvedCount = request.approvals.filter(a => a.approved).length;
    const rejectedCount = request.approvals.filter(a => !a.approved).length;

    // Get total possible approvers from custody arrangement
    const arrangement = this.getCustodyArrangement(request.assetId);
    const totalPossibleApprovers = arrangement?.custodians?.length ?? request.requiredApprovals;
    const remainingVotes = totalPossibleApprovers - request.approvals.length;

    if (approvedCount >= request.requiredApprovals) {
      request.status = ApprovalStatus.APPROVED;
      request.executableAfter = new Date(
        Date.now() + request.timeLockSeconds * 1000
      ).toISOString();
    } else if (approvedCount + remainingVotes < request.requiredApprovals) {
      // Cannot reach threshold anymore - not enough remaining approvers
      request.status = ApprovalStatus.REJECTED;
    }

    this.recoveryRequests.set(request.id, request);
    return request;
  }

  /**
   * Execute an approved recovery
   */
  executeRecovery(requestId: string): RecoveryRequest {
    const request = this.recoveryRequests.get(requestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    if (request.status !== ApprovalStatus.APPROVED) {
      throw new Error('Recovery request is not approved');
    }

    if (request.executableAfter && new Date(request.executableAfter) > new Date()) {
      throw new Error('Time lock has not expired');
    }

    request.status = ApprovalStatus.EXECUTED;
    request.updatedAt = new Date().toISOString();
    this.recoveryRequests.set(request.id, request);

    // In production, this would trigger the actual on-chain recovery
    return request;
  }

  /**
   * Get recovery request by ID
   */
  getRecoveryRequest(requestId: string): RecoveryRequest | undefined {
    return this.recoveryRequests.get(requestId);
  }

  /**
   * List recovery requests for an asset
   */
  listRecoveryRequests(assetId: string): RecoveryRequest[] {
    return Array.from(this.recoveryRequests.values()).filter(
      r => r.assetId === assetId
    );
  }

  // ==========================================================================
  // OVERRIDE PATHS
  // ==========================================================================

  /**
   * Request an override (regulatory, court order, etc.)
   */
  requestOverride(params: {
    type: OverrideType;
    assetId: string;
    targetAddress: string;
    requestedBy: string;
    authority: string;
    referenceNumber: string;
    action: 'FREEZE' | 'TRANSFER' | 'BURN' | 'UNFREEZE';
    destination?: string;
    amount?: string;
    documents: string[];
  }): OverrideRequest {
    const request: OverrideRequest = {
      id: uuidv4(),
      ...params,
      approvals: [],
      status: ApprovalStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    this.overrideRequests.set(request.id, request);
    return request;
  }

  /**
   * Approve an override request
   */
  approveOverride(params: {
    requestId: string;
    approverId: string;
    role: OverrideApproval['role'];
    approved: boolean;
    notes?: string;
  }): OverrideRequest {
    const request = this.overrideRequests.get(params.requestId);
    if (!request) {
      throw new Error('Override request not found');
    }

    if (request.status !== ApprovalStatus.PENDING) {
      throw new Error('Override request is not pending');
    }

    const approval: OverrideApproval = {
      approverId: params.approverId,
      role: params.role,
      approved: params.approved,
      timestamp: new Date().toISOString(),
      notes: params.notes,
    };

    request.approvals.push(approval);

    // Check approval requirements based on override type
    const requiredRoles = this.getRequiredRolesForOverride(request.type);
    const approvedRoles = new Set(
      request.approvals.filter(a => a.approved).map(a => a.role)
    );

    const allRequired = requiredRoles.every(role => approvedRoles.has(role));
    if (allRequired) {
      request.status = ApprovalStatus.APPROVED;
    }

    this.overrideRequests.set(request.id, request);
    return request;
  }

  /**
   * Execute an approved override
   */
  executeOverride(requestId: string): OverrideRequest {
    const request = this.overrideRequests.get(requestId);
    if (!request) {
      throw new Error('Override request not found');
    }

    if (request.status !== ApprovalStatus.APPROVED) {
      throw new Error('Override request is not approved');
    }

    request.status = ApprovalStatus.EXECUTED;
    request.executedAt = new Date().toISOString();
    this.overrideRequests.set(request.id, request);

    // In production, this would trigger the actual on-chain action
    return request;
  }

  /**
   * Get required roles for an override type
   */
  private getRequiredRolesForOverride(type: OverrideType): OverrideApproval['role'][] {
    switch (type) {
      case OverrideType.REGULATORY_FREEZE:
        return ['COMPLIANCE_OFFICER'];
      case OverrideType.COURT_ORDER:
        return ['LEGAL', 'COMPLIANCE_OFFICER'];
      case OverrideType.AML_COMPLIANCE:
        return ['COMPLIANCE_OFFICER'];
      case OverrideType.EMERGENCY_CLAWBACK:
        return ['COMPLIANCE_OFFICER', 'EXECUTIVE'];
      case OverrideType.DISPUTE_RESOLUTION:
        return ['LEGAL'];
      default:
        return ['COMPLIANCE_OFFICER', 'LEGAL'];
    }
  }

  /**
   * Get override request by ID
   */
  getOverrideRequest(requestId: string): OverrideRequest | undefined {
    return this.overrideRequests.get(requestId);
  }

  /**
   * List override requests
   */
  listOverrideRequests(filter?: {
    assetId?: string;
    type?: OverrideType;
    status?: ApprovalStatus;
  }): OverrideRequest[] {
    let requests = Array.from(this.overrideRequests.values());

    if (filter?.assetId) {
      requests = requests.filter(r => r.assetId === filter.assetId);
    }
    if (filter?.type) {
      requests = requests.filter(r => r.type === filter.type);
    }
    if (filter?.status) {
      requests = requests.filter(r => r.status === filter.status);
    }

    return requests;
  }

  // ==========================================================================
  // DELEGATION
  // ==========================================================================

  /**
   * Create a delegation
   */
  createDelegation(params: {
    assetId: string;
    delegator: string;
    delegate: string;
    permissions: DelegatedPermission[];
    constraints?: DelegationConstraint[];
    expiresAt?: string;
  }): Delegation {
    const delegation: Delegation = {
      id: uuidv4(),
      assetId: params.assetId,
      delegator: params.delegator,
      delegate: params.delegate,
      permissions: params.permissions,
      constraints: params.constraints || [],
      expiresAt: params.expiresAt,
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.delegations.set(delegation.id, delegation);
    return delegation;
  }

  /**
   * Revoke a delegation
   */
  revokeDelegation(delegationId: string): void {
    const delegation = this.delegations.get(delegationId);
    if (delegation) {
      delegation.active = false;
      this.delegations.set(delegationId, delegation);
    }
  }

  /**
   * Check if an address has delegated permission
   */
  hasDelegatedPermission(
    assetId: string,
    delegate: string,
    permission: DelegatedPermission
  ): boolean {
    const now = new Date();

    return Array.from(this.delegations.values()).some(d => {
      if (!d.active) return false;
      if (d.assetId !== assetId) return false;
      if (d.delegate !== delegate) return false;
      if (!d.permissions.includes(permission)) return false;
      if (d.expiresAt && new Date(d.expiresAt) < now) return false;
      return true;
    });
  }

  /**
   * List delegations for an asset
   */
  listDelegations(assetId: string): Delegation[] {
    return Array.from(this.delegations.values()).filter(
      d => d.assetId === assetId && d.active
    );
  }

  // ==========================================================================
  // AUDIT & REPORTING
  // ==========================================================================

  /**
   * Generate custody audit report
   */
  generateAuditReport(assetId: string): {
    arrangement: CustodyArrangement | undefined;
    recoveryRequests: RecoveryRequest[];
    overrideRequests: OverrideRequest[];
    delegations: Delegation[];
    summary: {
      totalRecoveries: number;
      executedRecoveries: number;
      totalOverrides: number;
      executedOverrides: number;
      activeDelegations: number;
    };
  } {
    const arrangement = this.getCustodyArrangement(assetId);
    const recoveryRequests = this.listRecoveryRequests(assetId);
    const overrideRequests = this.listOverrideRequests({ assetId });
    const delegations = this.listDelegations(assetId);

    return {
      arrangement,
      recoveryRequests,
      overrideRequests,
      delegations,
      summary: {
        totalRecoveries: recoveryRequests.length,
        executedRecoveries: recoveryRequests.filter(r => r.status === ApprovalStatus.EXECUTED).length,
        totalOverrides: overrideRequests.length,
        executedOverrides: overrideRequests.filter(r => r.status === ApprovalStatus.EXECUTED).length,
        activeDelegations: delegations.length,
      },
    };
  }
}

// Export singleton instance
export const custodyManager = new CustodyManager();
