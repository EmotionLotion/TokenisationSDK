/**
 * SponsorPaymaster - Gasless Transaction Paymaster
 *
 * Fully sponsors transactions based on configurable policies.
 * Integrates with bundler-specific sponsorship APIs.
 */

import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IPaymaster,
  PaymasterType,
  PaymasterData,
  SponsorshipResult,
  SponsorPaymasterConfig,
  SponsorshipPolicy,
} from '../interfaces/IPaymaster.js';
import type { UnsignedUserOperation, UserOperation } from '../interfaces/UserOperation.js';

/**
 * SponsorPaymaster - Gasless Transaction Sponsorship
 *
 * @example
 * ```typescript
 * const paymaster = new SponsorPaymaster({
 *   chainId: 8453,
 *   paymasterAddress: '0x...',
 *   apiKey: 'YOUR_API_KEY',
 *   policies: [
 *     {
 *       id: 'whitelist',
 *       name: 'Whitelisted Users',
 *       type: 'whitelist',
 *       whitelist: ['0x...', '0x...'],
 *       isActive: true,
 *       priority: 1,
 *     },
 *   ],
 * });
 *
 * // Sponsor a transaction
 * const sponsored = await paymaster.sponsorUserOperation(userOp);
 * ```
 */
export class SponsorPaymaster implements IPaymaster {
  readonly type: PaymasterType = 'sponsor';
  readonly address: string;
  readonly chainId: number;

  private config: SponsorPaymasterConfig;
  private policies: SponsorshipPolicy[];
  private usageTracker: Map<string, { count: number; value: bigint; lastReset: number }> = new Map();

  constructor(config: SponsorPaymasterConfig) {
    this.config = config;
    this.address = config.paymasterAddress;
    this.chainId = config.chainId;
    this.policies = [...(config.policies || [])].sort((a, b) => a.priority - b.priority);
  }

  async getSupportedTokens(): Promise<string[]> {
    return [];
  }

  async isActive(): Promise<boolean> {
    try {
      const url = this.config.apiUrl || 'https://api.sponsor.io';
      const response = await fetch(`${url}/health`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return response.ok;
    } catch {
      return this.policies.length > 0;
    }
  }

  async getDeposit(): Promise<bigint> {
    return 0n;
  }

  async checkSponsorship(
    userOp: UnsignedUserOperation,
    sender?: string
  ): Promise<Result<SponsorshipResult, string>> {
    const address = (sender || userOp.sender).toLowerCase();

    // Evaluate policies in priority order
    for (const policy of this.policies) {
      if (!policy.isActive) continue;

      const result = await this._evaluatePolicy(policy, address, userOp);
      if (result.approved) {
        return ok({
          approved: true,
          matchedPolicy: policy.id,
          remainingQuota: result.remainingQuota,
        });
      }
    }

    return ok({
      approved: false,
      reason: 'No matching sponsorship policy',
    });
  }

  async getPaymasterData(
    userOp: UnsignedUserOperation
  ): Promise<Result<PaymasterData, string>> {
    try {
      const url = this.config.apiUrl || 'https://api.sponsor.io';
      const response = await fetch(`${url}/v1/sponsor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          chainId: this.chainId,
          userOperation: this._formatUserOp(userOp),
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return err(`Sponsor API error: ${error}`);
      }

      const data = await response.json();

      return ok({
        paymaster: data.paymaster || this.address,
        paymasterVerificationGasLimit: BigInt(data.paymasterVerificationGasLimit || 100000),
        paymasterPostOpGasLimit: BigInt(data.paymasterPostOpGasLimit || 50000),
        paymasterData: data.paymasterData,
      });
    } catch (error) {
      return err(`Sponsor request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sponsorUserOperation(
    userOp: UnsignedUserOperation
  ): Promise<Result<UnsignedUserOperation, string>> {
    // Check sponsorship first
    const checkResult = await this.checkSponsorship(userOp);
    if (!checkResult.success) {
      return err(`Sponsorship denied: ${checkResult.error}`);
    }
    if (!checkResult.data.approved) {
      return err(`Sponsorship denied: ${checkResult.data.reason || 'not approved'}`);
    }

    // Get paymaster data
    const pmDataResult = await this.getPaymasterData(userOp);
    if (!pmDataResult.success) {
      return err(pmDataResult.error);
    }

    // Track usage
    this._trackUsage(userOp.sender.toLowerCase(), 1, 0n);

    return ok({
      ...userOp,
      paymaster: pmDataResult.data.paymaster,
      paymasterVerificationGasLimit: pmDataResult.data.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: pmDataResult.data.paymasterPostOpGasLimit,
      paymasterData: pmDataResult.data.paymasterData,
    });
  }

  async estimateGasOverhead(): Promise<{
    verificationGasLimit: bigint;
    postOpGasLimit: bigint;
  }> {
    return {
      verificationGasLimit: 100000n,
      postOpGasLimit: 50000n,
    };
  }

  async validatePaymasterData(userOp: UserOperation): Promise<Result<void, string>> {
    if (!userOp.paymaster) {
      return err('No paymaster in UserOp');
    }
    if (userOp.paymaster.toLowerCase() !== this.address.toLowerCase()) {
      return err('Paymaster address mismatch');
    }
    return ok(undefined);
  }

  // ============================================================================
  // POLICY MANAGEMENT
  // ============================================================================

  /**
   * Add a sponsorship policy
   */
  addPolicy(policy: SponsorshipPolicy): void {
    this.policies.push(policy);
    this.policies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Remove a policy
   */
  removePolicy(policyId: string): boolean {
    const index = this.policies.findIndex((p) => p.id === policyId);
    if (index >= 0) {
      this.policies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all policies
   */
  getPolicies(): SponsorshipPolicy[] {
    return [...this.policies];
  }

  /**
   * Update a policy
   */
  updatePolicy(policyId: string, updates: Partial<SponsorshipPolicy>): boolean {
    const policy = this.policies.find((p) => p.id === policyId);
    if (policy) {
      Object.assign(policy, updates);
      this.policies.sort((a, b) => a.priority - b.priority);
      return true;
    }
    return false;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async _evaluatePolicy(
    policy: SponsorshipPolicy,
    address: string,
    userOp: UnsignedUserOperation
  ): Promise<{ approved: boolean; remainingQuota?: { count?: number; value?: bigint } }> {
    switch (policy.type) {
      case 'all':
        return { approved: true };

      case 'whitelist':
        const isWhitelisted = policy.whitelist?.some(
          (w) => w.toLowerCase() === address
        );
        return { approved: !!isWhitelisted };

      case 'contract':
        // Check if target contract is allowed
        // Would need to decode callData to get target
        return { approved: true }; // Simplified

      case 'quota':
        return this._evaluateQuotaPolicy(policy, address);

      default:
        return { approved: false };
    }
  }

  private _evaluateQuotaPolicy(
    policy: SponsorshipPolicy,
    address: string
  ): { approved: boolean; remainingQuota?: { count?: number; value?: bigint } } {
    const quota = policy.quota;
    if (!quota) {
      return { approved: true };
    }

    // Get usage for this address
    const usage = this._getUsage(address);

    // Check daily limits
    const dayMs = 24 * 60 * 60 * 1000;
    if (Date.now() - usage.lastReset > dayMs) {
      // Reset daily counters
      usage.count = 0;
      usage.value = 0n;
      usage.lastReset = Date.now();
    }

    if (quota.maxTransactionsPerDay && usage.count >= quota.maxTransactionsPerDay) {
      return { approved: false };
    }

    if (quota.maxTransactionsPerUser && usage.count >= quota.maxTransactionsPerUser) {
      return { approved: false };
    }

    const remainingCount = quota.maxTransactionsPerDay
      ? quota.maxTransactionsPerDay - usage.count - 1
      : undefined;

    const remainingValue = quota.maxValuePerDay
      ? quota.maxValuePerDay - usage.value
      : undefined;

    return {
      approved: true,
      remainingQuota: {
        count: remainingCount,
        value: remainingValue,
      },
    };
  }

  private _getUsage(address: string): { count: number; value: bigint; lastReset: number } {
    let usage = this.usageTracker.get(address);
    if (!usage) {
      usage = { count: 0, value: 0n, lastReset: Date.now() };
      this.usageTracker.set(address, usage);
    }
    return usage;
  }

  private _trackUsage(address: string, count: number, value: bigint): void {
    const usage = this._getUsage(address);
    usage.count += count;
    usage.value += value;
  }

  private _formatUserOp(userOp: UnsignedUserOperation): Record<string, string> {
    return {
      sender: userOp.sender,
      nonce: '0x' + userOp.nonce.toString(16),
      factory: userOp.factory || '',
      factoryData: userOp.factoryData || '0x',
      callData: userOp.callData,
      callGasLimit: '0x' + (userOp.callGasLimit || 0n).toString(16),
      verificationGasLimit: '0x' + (userOp.verificationGasLimit || 0n).toString(16),
      preVerificationGas: '0x' + (userOp.preVerificationGas || 0n).toString(16),
      maxFeePerGas: '0x' + (userOp.maxFeePerGas || 0n).toString(16),
      maxPriorityFeePerGas: '0x' + (userOp.maxPriorityFeePerGas || 0n).toString(16),
    };
  }
}

/**
 * Factory function
 */
export function createSponsorPaymaster(config: SponsorPaymasterConfig): SponsorPaymaster {
  return new SponsorPaymaster(config);
}
