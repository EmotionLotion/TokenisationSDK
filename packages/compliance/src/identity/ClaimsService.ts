/**
 * Claims Service
 *
 * Orchestrates the full KYC -> Claims -> On-chain flow:
 * 1. Receive KYC results from providers (via webhook)
 * 2. Normalize to canonical format
 * 3. Issue claims to identity
 * 4. Evaluate policies
 * 5. Push flags to on-chain ClaimsRegistry
 * 6. Emit events for audit
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type Claim,
  type ClaimSet,
  type KYCResult,
  type IssueClaimParams,
  ClaimType,
  ClaimBitmask,
  kycResultToClaims,
  buildClaimSet,
  computeClaimBitmask,
  createClaim,
} from './Claims.js';
import {
  type Policy,
  type PolicyDecision,
  type PolicyRegistry,
  evaluatePolicy,
  createDefaultPolicyRegistry,
} from './PolicyRules.js';
import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Storage adapter interface for claims persistence
 */
export interface IClaimsStorage {
  /** Store a claim */
  saveClaim(claim: Claim): Promise<Result<void, string>>;

  /** Get claims for an identity */
  getClaimsByIdentity(identityId: string): Promise<Result<Claim[], string>>;

  /** Get claim by ID */
  getClaimById(claimId: string): Promise<Result<Claim | null, string>>;

  /** Update claim */
  updateClaim(claimId: string, updates: Partial<Claim>): Promise<Result<void, string>>;

  /** Deactivate claims by type for an identity */
  deactivateClaimsByType(identityId: string, type: ClaimType): Promise<Result<void, string>>;
}

/**
 * On-chain registry adapter interface
 */
export interface IOnChainClaimsRegistry {
  /** Set claims for a wallet */
  setClaims(
    wallet: string,
    claimsMask: bigint,
    jurisdiction: string,
    expiry: number
  ): Promise<Result<{ transactionHash: string }, string>>;

  /** Add claims to existing mask */
  addClaims(wallet: string, claimsToAdd: bigint): Promise<Result<{ transactionHash: string }, string>>;

  /** Remove claims from mask */
  removeClaims(wallet: string, claimsToRemove: bigint): Promise<Result<{ transactionHash: string }, string>>;

  /** Freeze a wallet */
  freezeWallet(wallet: string, reason: string): Promise<Result<{ transactionHash: string }, string>>;

  /** Unfreeze a wallet */
  unfreezeWallet(wallet: string): Promise<Result<{ transactionHash: string }, string>>;

  /** Check if wallet is allowed for token */
  isAllowed(token: string, wallet: string): Promise<boolean>;

  /** Set token policy */
  setTokenPolicy(
    token: string,
    requiredMask: bigint,
    jurisdiction: string,
    allowForeignAccredited: boolean
  ): Promise<Result<{ transactionHash: string }, string>>;
}

/**
 * Event emitter interface
 */
export interface IClaimsEventEmitter {
  emit(event: ClaimsEvent): void;
}

/**
 * Claims service events
 */
export type ClaimsEvent =
  | { type: 'kyc.received'; identityId: string; provider: string; status: string }
  | { type: 'claims.issued'; identityId: string; claims: ClaimType[]; provider: string }
  | { type: 'claims.updated'; identityId: string; oldMask: bigint; newMask: bigint }
  | { type: 'claims.expired'; identityId: string; claimTypes: ClaimType[] }
  | { type: 'claims.revoked'; identityId: string; reason: string }
  | { type: 'onchain.synced'; wallet: string; transactionHash: string }
  | { type: 'policy.evaluated'; identityId: string; policyId: string; outcome: string }
  | { type: 'wallet.frozen'; wallet: string; reason: string }
  | { type: 'wallet.unfrozen'; wallet: string };

/**
 * Wallet link (identity to wallet mapping)
 */
export interface WalletLink {
  identityId: string;
  walletAddress: string;
  isPrimary: boolean;
  linkedAt: string;
}

/**
 * Claims service configuration
 */
export interface ClaimsServiceConfig {
  /** Storage adapter for claims */
  storage: IClaimsStorage;

  /** On-chain registry adapter (optional - for on-chain sync) */
  onChainRegistry?: IOnChainClaimsRegistry;

  /** Policy registry */
  policyRegistry?: PolicyRegistry;

  /** Event emitter */
  eventEmitter?: IClaimsEventEmitter;

  /** Default claim expiry in days */
  defaultExpiryDays?: number;

  /** Auto-sync to on-chain */
  autoSyncOnChain?: boolean;
}

// ============================================================================
// CLAIMS SERVICE
// ============================================================================

/**
 * ClaimsService - Central orchestrator for KYC -> Claims -> On-chain
 *
 * @example
 * ```typescript
 * const claimsService = new ClaimsService({
 *   storage: postgresClaimsStorage,
 *   onChainRegistry: claimsRegistryAdapter,
 *   autoSyncOnChain: true,
 * });
 *
 * // Process KYC result from Sumsub webhook
 * await claimsService.processKYCResult(identityId, kycResult);
 *
 * // Evaluate policy for UAE real estate
 * const decision = await claimsService.evaluatePolicy(identityId, 'uae-real-estate-v1');
 *
 * // Sync to on-chain
 * await claimsService.syncToOnChain(identityId, walletAddress);
 * ```
 */
export class ClaimsService {
  private storage: IClaimsStorage;
  private onChainRegistry?: IOnChainClaimsRegistry;
  private policyRegistry: PolicyRegistry;
  private eventEmitter?: IClaimsEventEmitter;
  private defaultExpiryDays: number;
  private autoSyncOnChain: boolean;

  // In-memory wallet links (in production, this would be in storage)
  private walletLinks: Map<string, WalletLink[]> = new Map();

  constructor(config: ClaimsServiceConfig) {
    this.storage = config.storage;
    this.onChainRegistry = config.onChainRegistry;
    this.policyRegistry = config.policyRegistry || createDefaultPolicyRegistry();
    this.eventEmitter = config.eventEmitter;
    this.defaultExpiryDays = config.defaultExpiryDays || 365;
    this.autoSyncOnChain = config.autoSyncOnChain ?? false;
  }

  // ==========================================================================
  // KYC RESULT PROCESSING
  // ==========================================================================

  /**
   * Process a KYC result from a provider.
   * This is the main entry point for KYC webhook handlers.
   */
  async processKYCResult(
    identityId: string,
    result: KYCResult
  ): Promise<Result<{ claims: Claim[]; claimSet: ClaimSet }, string>> {
    // Emit event
    this.emit({
      type: 'kyc.received',
      identityId,
      provider: result.provider,
      status: result.status,
    });

    // Only issue claims for approved KYC
    if (result.status !== 'approved') {
      return ok({ claims: [], claimSet: buildClaimSet(identityId, []) });
    }

    // Convert KYC result to claims
    const claimTemplates = kycResultToClaims(identityId, result);

    // Deactivate existing claims from this provider
    const claimTypes = [...new Set(claimTemplates.map((c) => c.type))];
    for (const type of claimTypes) {
      await this.storage.deactivateClaimsByType(identityId, type);
    }

    // Save new claims
    const savedClaims: Claim[] = [];
    for (const template of claimTemplates) {
      const claim: Claim = {
        id: uuidv4(),
        ...template,
      };

      const saveResult = await this.storage.saveClaim(claim);
      if (!saveResult.success) {
        return err(`Failed to save claim: ${saveResult.error}`);
      }

      savedClaims.push(claim);
    }

    // Build claim set
    const allClaimsResult = await this.storage.getClaimsByIdentity(identityId);
    if (!allClaimsResult.success) {
      return err(allClaimsResult.error);
    }

    const claimSet = buildClaimSet(identityId, allClaimsResult.data);

    // Emit event
    this.emit({
      type: 'claims.issued',
      identityId,
      claims: claimTypes,
      provider: result.provider,
    });

    // Auto-sync to on-chain if enabled
    if (this.autoSyncOnChain && this.onChainRegistry) {
      const wallets = this.walletLinks.get(identityId) || [];
      for (const wallet of wallets) {
        await this.syncToOnChain(identityId, wallet.walletAddress);
      }
    }

    return ok({ claims: savedClaims, claimSet });
  }

  // ==========================================================================
  // CLAIM ISSUANCE
  // ==========================================================================

  /**
   * Issue a single claim manually
   */
  async issueClaim(params: IssueClaimParams): Promise<Result<Claim, string>> {
    const claimData = createClaim({
      ...params,
      expiresInDays: params.expiresInDays || this.defaultExpiryDays,
    });

    const claim: Claim = {
      id: uuidv4(),
      ...claimData,
    };

    const saveResult = await this.storage.saveClaim(claim);
    if (!saveResult.success) {
      return err(saveResult.error);
    }

    this.emit({
      type: 'claims.issued',
      identityId: params.identityId,
      claims: [params.type],
      provider: params.provider,
    });

    return ok(claim);
  }

  /**
   * Revoke all claims for an identity
   */
  async revokeClaims(identityId: string, reason: string): Promise<Result<void, string>> {
    const claimsResult = await this.storage.getClaimsByIdentity(identityId);
    if (!claimsResult.success) {
      return err(claimsResult.error);
    }

    for (const claim of claimsResult.data) {
      await this.storage.updateClaim(claim.id, { isActive: false });
    }

    this.emit({ type: 'claims.revoked', identityId, reason });

    // Sync to on-chain (remove all claims)
    if (this.onChainRegistry) {
      const wallets = this.walletLinks.get(identityId) || [];
      for (const wallet of wallets) {
        await this.onChainRegistry.setClaims(wallet.walletAddress, 0n, '', 0);
      }
    }

    return ok(undefined);
  }

  // ==========================================================================
  // CLAIM QUERIES
  // ==========================================================================

  /**
   * Get claim set for an identity
   */
  async getClaimSet(identityId: string): Promise<Result<ClaimSet, string>> {
    const claimsResult = await this.storage.getClaimsByIdentity(identityId);
    if (!claimsResult.success) {
      return err(claimsResult.error);
    }

    return ok(buildClaimSet(identityId, claimsResult.data));
  }

  /**
   * Check if identity has specific claims
   */
  async hasClaims(identityId: string, requiredTypes: ClaimType[]): Promise<boolean> {
    const claimSetResult = await this.getClaimSet(identityId);
    if (!claimSetResult.success) return false;

    const claimSet = claimSetResult.data;
    const now = new Date();

    for (const type of requiredTypes) {
      const hasClaim = claimSet.claims.some(
        (c) => c.type === type && c.isActive && new Date(c.expiresAt) > now
      );
      if (!hasClaim) return false;
    }

    return true;
  }

  // ==========================================================================
  // POLICY EVALUATION
  // ==========================================================================

  /**
   * Evaluate a policy for an identity
   */
  async evaluatePolicy(
    identityId: string,
    policyId: string
  ): Promise<Result<PolicyDecision, string>> {
    const policy = this.policyRegistry.get(policyId);
    if (!policy) {
      return err(`Policy not found: ${policyId}`);
    }

    const claimSetResult = await this.getClaimSet(identityId);
    if (!claimSetResult.success) {
      return err(claimSetResult.error);
    }

    const decision = evaluatePolicy(claimSetResult.data, policy);

    this.emit({
      type: 'policy.evaluated',
      identityId,
      policyId,
      outcome: decision.outcome,
    });

    return ok(decision);
  }

  /**
   * Evaluate best matching policy for asset type and jurisdiction
   */
  async evaluatePolicyForAsset(
    identityId: string,
    assetType: string,
    jurisdiction: string
  ): Promise<Result<PolicyDecision, string>> {
    const policy = this.policyRegistry.findBestMatch(assetType, jurisdiction);
    if (!policy) {
      // No policy = allow by default (unregulated)
      return ok({
        outcome: 'ALLOW',
        explanation: 'No policy applies to this asset type.',
        policyId: 'none',
        policyVersion: 'n/a',
        evaluatedClaims: [],
        decidedAt: new Date().toISOString(),
      });
    }

    return this.evaluatePolicy(identityId, policy.id);
  }

  /**
   * Check if identity can transfer a specific token
   */
  async canTransfer(
    identityId: string,
    tokenAddress: string,
    assetType: string,
    jurisdiction: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const decisionResult = await this.evaluatePolicyForAsset(identityId, assetType, jurisdiction);

    if (!decisionResult.success) {
      return { allowed: false, reason: decisionResult.error };
    }

    const decision = decisionResult.data;
    return {
      allowed: decision.outcome === 'ALLOW',
      reason: decision.outcome !== 'ALLOW' ? decision.explanation : undefined,
    };
  }

  // ==========================================================================
  // WALLET MANAGEMENT
  // ==========================================================================

  /**
   * Link a wallet to an identity
   */
  linkWallet(identityId: string, walletAddress: string, isPrimary: boolean = false): void {
    const existing = this.walletLinks.get(identityId) || [];

    // If setting as primary, unset others
    if (isPrimary) {
      for (const link of existing) {
        link.isPrimary = false;
      }
    }

    existing.push({
      identityId,
      walletAddress: walletAddress.toLowerCase(),
      isPrimary,
      linkedAt: new Date().toISOString(),
    });

    this.walletLinks.set(identityId, existing);
  }

  /**
   * Get wallets for an identity
   */
  getWallets(identityId: string): WalletLink[] {
    return this.walletLinks.get(identityId) || [];
  }

  /**
   * Get identity by wallet
   */
  getIdentityByWallet(walletAddress: string): string | null {
    const normalizedWallet = walletAddress.toLowerCase();
    for (const [identityId, links] of this.walletLinks) {
      if (links.some((l) => l.walletAddress === normalizedWallet)) {
        return identityId;
      }
    }
    return null;
  }

  // ==========================================================================
  // ON-CHAIN SYNC
  // ==========================================================================

  /**
   * Sync claims to on-chain registry
   */
  async syncToOnChain(
    identityId: string,
    walletAddress: string
  ): Promise<Result<{ transactionHash: string }, string>> {
    if (!this.onChainRegistry) {
      return err('On-chain registry not configured');
    }

    const claimSetResult = await this.getClaimSet(identityId);
    if (!claimSetResult.success) {
      return err(claimSetResult.error);
    }

    const claimSet = claimSetResult.data;

    // Convert expiry to unix timestamp
    const expiry = claimSet.earliestExpiry
      ? Math.floor(new Date(claimSet.earliestExpiry).getTime() / 1000)
      : 0;

    const result = await this.onChainRegistry.setClaims(
      walletAddress,
      claimSet.bitmask,
      claimSet.jurisdiction || '',
      expiry
    );

    if (result.success) {
      this.emit({
        type: 'onchain.synced',
        wallet: walletAddress,
        transactionHash: result.data.transactionHash,
      });
    }

    return result;
  }

  /**
   * Freeze a wallet on-chain
   */
  async freezeWallet(
    walletAddress: string,
    reason: string
  ): Promise<Result<{ transactionHash: string }, string>> {
    if (!this.onChainRegistry) {
      return err('On-chain registry not configured');
    }

    const result = await this.onChainRegistry.freezeWallet(walletAddress, reason);

    if (result.success) {
      this.emit({ type: 'wallet.frozen', wallet: walletAddress, reason });
    }

    return result;
  }

  /**
   * Unfreeze a wallet on-chain
   */
  async unfreezeWallet(
    walletAddress: string
  ): Promise<Result<{ transactionHash: string }, string>> {
    if (!this.onChainRegistry) {
      return err('On-chain registry not configured');
    }

    const result = await this.onChainRegistry.unfreezeWallet(walletAddress);

    if (result.success) {
      this.emit({ type: 'wallet.unfrozen', wallet: walletAddress });
    }

    return result;
  }

  /**
   * Set token policy on-chain
   */
  async setTokenPolicy(
    tokenAddress: string,
    policy: Policy
  ): Promise<Result<{ transactionHash: string }, string>> {
    if (!this.onChainRegistry) {
      return err('On-chain registry not configured');
    }

    // Determine jurisdiction requirement
    const requiredJurisdiction = policy.jurisdictions.length === 1 ? policy.jurisdictions[0] : '';

    // Check if policy allows foreign accredited
    const allowForeignAccredited = policy.ruleGroups.some((group) =>
      group.some((rule) => rule.jurisdictionMustNotMatch && rule.requiredClaims.includes(ClaimType.ACCREDITED_INVESTOR))
    );

    return this.onChainRegistry.setTokenPolicy(
      tokenAddress,
      policy.onChainBitmask,
      requiredJurisdiction,
      allowForeignAccredited
    );
  }

  // ==========================================================================
  // POLICY MANAGEMENT
  // ==========================================================================

  /**
   * Register a new policy
   */
  registerPolicy(policy: Policy): void {
    this.policyRegistry.register(policy);
  }

  /**
   * Get all registered policies
   */
  getPolicies(): Policy[] {
    return this.policyRegistry.getAll();
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private emit(event: ClaimsEvent): void {
    this.eventEmitter?.emit(event);
  }
}

// ============================================================================
// INDEX EXPORTS
// ============================================================================

export { createDefaultPolicyRegistry };
