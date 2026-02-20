/**
 * VerifyingPaymaster - Standard ERC-4337 Paymaster
 *
 * A verifying paymaster that requires off-chain signatures for sponsorship.
 * Uses a sponsor service to approve and sign UserOperations.
 */

import { ethers } from 'ethers';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import type {
  IPaymaster,
  PaymasterType,
  PaymasterData,
  SponsorshipResult,
  VerifyingPaymasterConfig,
} from '../interfaces/IPaymaster.js';
import type { UnsignedUserOperation, UserOperation } from '../interfaces/UserOperation.js';

/**
 * VerifyingPaymaster - Standard Verifying Paymaster
 *
 * @example
 * ```typescript
 * const paymaster = new VerifyingPaymaster({
 *   chainId: 8453,
 *   paymasterAddress: '0x...',
 *   sponsorApiKey: 'YOUR_API_KEY',
 *   sponsorApiUrl: 'https://sponsor.example.com',
 * });
 *
 * // Check and sponsor a UserOp
 * const sponsored = await paymaster.sponsorUserOperation(userOp);
 * ```
 */
export class VerifyingPaymaster implements IPaymaster {
  readonly type: PaymasterType = 'verifying';
  readonly address: string;
  readonly chainId: number;

  private config: VerifyingPaymasterConfig;
  private signer?: ethers.Wallet;

  constructor(config: VerifyingPaymasterConfig) {
    this.config = {
      validUntilOffset: 3600, // 1 hour
      validAfterOffset: 0,
      ...config,
    };
    this.address = config.paymasterAddress;
    this.chainId = config.chainId;

    // Initialize signer if signing key provided
    if (config.signingKey) {
      this.signer = new ethers.Wallet(config.signingKey);
    }
  }

  async getSupportedTokens(): Promise<string[]> {
    // Verifying paymasters don't accept tokens
    return [];
  }

  async isActive(): Promise<boolean> {
    // Check if sponsor API is available
    if (this.config.sponsorApiUrl && this.config.sponsorApiKey) {
      try {
        const response = await fetch(`${this.config.sponsorApiUrl}/health`, {
          headers: { 'x-api-key': this.config.sponsorApiKey },
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    // Self-signed mode is always active
    return !!this.signer;
  }

  async getDeposit(): Promise<bigint> {
    // Would query the EntryPoint contract for deposit
    return 0n;
  }

  async checkSponsorship(
    userOp: UnsignedUserOperation,
    sender?: string
  ): Promise<Result<SponsorshipResult, string>> {
    // Check with sponsor API
    if (this.config.sponsorApiUrl && this.config.sponsorApiKey) {
      try {
        const response = await fetch(`${this.config.sponsorApiUrl}/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.sponsorApiKey,
          },
          body: JSON.stringify({
            chainId: this.chainId,
            sender: sender || userOp.sender,
            userOp,
          }),
        });

        if (!response.ok) {
          return ok({ approved: false, reason: `HTTP ${response.status}` });
        }

        const data = await response.json();
        return ok(data);
      } catch (error) {
        return ok({
          approved: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Self-signed mode always approves
    if (this.signer) {
      return ok({ approved: true, matchedPolicy: 'self-signed' });
    }

    return ok({ approved: false, reason: 'No sponsor configured' });
  }

  async getPaymasterData(
    userOp: UnsignedUserOperation
  ): Promise<Result<PaymasterData, string>> {
    // Try sponsor API first
    if (this.config.sponsorApiUrl && this.config.sponsorApiKey) {
      return this._getPaymasterDataFromApi(userOp);
    }

    // Fall back to self-signing
    if (this.signer) {
      return this._selfSignPaymasterData(userOp);
    }

    return err('No sponsor configured');
  }

  async sponsorUserOperation(
    userOp: UnsignedUserOperation
  ): Promise<Result<UnsignedUserOperation, string>> {
    // Check sponsorship
    const checkResult = await this.checkSponsorship(userOp);
    if (!checkResult.success) {
      return err(checkResult.error);
    }

    if (!checkResult.data.approved) {
      return err(`Sponsorship denied: ${checkResult.data.reason}`);
    }

    // Get paymaster data
    const pmDataResult = await this.getPaymasterData(userOp);
    if (!pmDataResult.success) {
      return err(pmDataResult.error);
    }

    const pmData = pmDataResult.data;

    return ok({
      ...userOp,
      paymaster: pmData.paymaster,
      paymasterVerificationGasLimit: pmData.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: pmData.paymasterPostOpGasLimit,
      paymasterData: pmData.paymasterData,
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
    if (!userOp.paymasterData || userOp.paymasterData === '0x') {
      return err('Missing paymaster data');
    }
    return ok(undefined);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async _getPaymasterDataFromApi(
    userOp: UnsignedUserOperation
  ): Promise<Result<PaymasterData, string>> {
    try {
      const response = await fetch(`${this.config.sponsorApiUrl}/sponsor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.sponsorApiKey!,
        },
        body: JSON.stringify({
          chainId: this.chainId,
          entryPoint: userOp.sender, // Would be actual entry point
          userOp,
        }),
      });

      if (!response.ok) {
        return err(`Sponsor API error: ${response.status}`);
      }

      const data = await response.json();

      return ok({
        paymaster: data.paymaster || this.address,
        paymasterVerificationGasLimit: BigInt(data.paymasterVerificationGasLimit || 100000),
        paymasterPostOpGasLimit: BigInt(data.paymasterPostOpGasLimit || 50000),
        paymasterData: data.paymasterData,
      });
    } catch (error) {
      return err(`Sponsor API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async _selfSignPaymasterData(
    userOp: UnsignedUserOperation
  ): Promise<Result<PaymasterData, string>> {
    if (!this.signer) {
      return err('No signing key configured');
    }

    // Calculate validity window
    const now = Math.floor(Date.now() / 1000);
    const validAfter = now + (this.config.validAfterOffset || 0);
    const validUntil = now + (this.config.validUntilOffset || 3600);

    // Pack validity timestamps (each 6 bytes = 48 bits)
    const validityData = ethers.solidityPacked(
      ['uint48', 'uint48'],
      [validUntil, validAfter]
    );

    // Create hash for signing
    const hash = ethers.keccak256(
      ethers.solidityPacked(
        ['address', 'uint256', 'bytes', 'bytes'],
        [userOp.sender, userOp.nonce, userOp.callData, validityData]
      )
    );

    // Sign the hash
    const signature = await this.signer.signMessage(ethers.getBytes(hash));

    // Pack paymaster data: validUntil (6) + validAfter (6) + signature
    const paymasterData = validityData + signature.slice(2);

    return ok({
      paymaster: this.address,
      paymasterVerificationGasLimit: 100000n,
      paymasterPostOpGasLimit: 50000n,
      paymasterData,
    });
  }
}

/**
 * Factory function
 */
export function createVerifyingPaymaster(
  config: VerifyingPaymasterConfig
): VerifyingPaymaster {
  return new VerifyingPaymaster(config);
}
