/**
 * Identity Module
 *
 * Claims-based identity system for KYC -> Policy -> On-chain enforcement.
 *
 * Architecture:
 * 1. KYC providers -> normalized KYCResult
 * 2. KYCResult -> Claims (canonical internal format)
 * 3. Claims -> ClaimSet (aggregated for evaluation)
 * 4. Policy evaluates ClaimSet -> ALLOW/DENY
 * 5. ClaimSet.bitmask -> On-chain ClaimsRegistry
 *
 * @example
 * ```typescript
 * import {
 *   ClaimsService,
 *   ClaimType,
 *   UAE_REAL_ESTATE_POLICY,
 * } from '@tokenisation/compliance/identity';
 *
 * // Process KYC result
 * await claimsService.processKYCResult(identityId, kycResult);
 *
 * // Evaluate policy
 * const decision = await claimsService.evaluatePolicy(identityId, 'uae-real-estate-v1');
 *
 * // Sync to on-chain
 * await claimsService.syncToOnChain(identityId, walletAddress);
 * ```
 */

// Claims
export {
  ClaimType,
  ClaimBitmask,
  type Claim,
  type ClaimSet,
  type KYCResult,
  type IssueClaimParams,
  computeClaimBitmask,
  satisfiesMask,
  bitmaskToClaimTypes,
  claimTypesToBitmask,
  buildClaimSet,
  createClaim,
  kycResultToClaims,
  getEarliestExpiry,
  RequirementMasks,
} from './Claims.js';

// Policy Rules
export {
  type Policy,
  type PolicyRule,
  type PolicyDecision,
  type PolicyOutcome,
  DenyReason,
  PolicyRegistry,
  evaluatePolicy,
  createDefaultPolicyRegistry,
  UAE_REAL_ESTATE_POLICY,
} from './PolicyRules.js';

// Claims Service
export {
  ClaimsService,
  type ClaimsServiceConfig,
  type IClaimsStorage,
  type IOnChainClaimsRegistry,
  type IClaimsEventEmitter,
  type ClaimsEvent,
  type WalletLink,
} from './ClaimsService.js';
