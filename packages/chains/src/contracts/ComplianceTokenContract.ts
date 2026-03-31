/**
 * ComplianceTokenContract - SDK adapter for ComplianceToken (ERC-3643) smart contract
 *
 * Wraps ChainService with typed methods for security token operations
 * including compliant transfers, freeze/unfreeze, and KYC enforcement.
 */

import { ChainService } from '@tokenisation/core';
import { COMPLIANCE_TOKEN_ABI, IDENTITY_REGISTRY_ABI } from './abis/CoreContracts.js';
import type { Address, Hash } from 'viem';
import type { Result } from '@tokenisation/core';

export class ComplianceTokenContract {
  constructor(
    private chain: ChainService,
    private tokenAddress: Address,
    private identityRegistryAddress?: Address,
  ) {}

  // ============================================================================
  // ERC20 Core
  // ============================================================================

  async balanceOf(account: Address): Promise<bigint> {
    return this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'balanceOf', [account]);
  }

  async totalSupply(): Promise<bigint> {
    return this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'totalSupply', []);
  }

  async transfer(to: Address, amount: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'transfer', [to, amount]);
  }

  async transferFrom(from: Address, to: Address, amount: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'transferFrom', [from, to, amount]);
  }

  async approve(spender: Address, amount: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'approve', [spender, amount]);
  }

  async allowance(owner: Address, spender: Address): Promise<bigint> {
    return this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'allowance', [owner, spender]);
  }

  // ============================================================================
  // Compliance Operations
  // ============================================================================

  async mint(to: Address, amount: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'mint', [to, amount]);
  }

  async burn(amount: bigint): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'burn', [amount]);
  }

  async freeze(account: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'freeze', [account]);
  }

  async unfreeze(account: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'unfreeze', [account]);
  }

  async isFrozen(account: Address): Promise<boolean> {
    return this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'isFrozen', [account]);
  }

  async forceTransfer(from: Address, to: Address, amount: bigint, reason: string): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'forceTransfer', [from, to, amount, reason]);
  }

  async recoveryAddress(lostWallet: Address, newWallet: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'recoveryAddress', [lostWallet, newWallet]);
  }

  /**
   * Check if a transfer is compliant before executing.
   * Returns [canTransfer: boolean, reason: string]
   */
  async canTransfer(from: Address, to: Address, amount: bigint): Promise<{ allowed: boolean; reason: string }> {
    const result = await this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'canTransfer', [from, to, amount]);
    return { allowed: result[0], reason: result[1] };
  }

  async investorCount(): Promise<bigint> {
    return this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'investorCount', []);
  }

  async isInvestor(account: Address): Promise<boolean> {
    return this.chain.readContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'isInvestor', [account]);
  }

  // ============================================================================
  // Identity Registry (KYC verification)
  // ============================================================================

  async isUserVerified(user: Address): Promise<boolean> {
    if (!this.identityRegistryAddress) return false;
    // Check KYC claim (claim topic 1 = KYC)
    return this.chain.readContract(this.identityRegistryAddress, [...IDENTITY_REGISTRY_ABI], 'isVerified', [user, [1]]);
  }

  async hasIdentity(user: Address): Promise<boolean> {
    if (!this.identityRegistryAddress) return false;
    return this.chain.readContract(this.identityRegistryAddress, [...IDENTITY_REGISTRY_ABI], 'hasIdentity', [user]);
  }

  async getUserCountry(user: Address): Promise<number> {
    if (!this.identityRegistryAddress) return 0;
    return this.chain.readContract(this.identityRegistryAddress, [...IDENTITY_REGISTRY_ABI], 'getCountry', [user]);
  }

  async registerIdentity(user: Address, identity: Address, country: number): Promise<Result<Hash, string>> {
    if (!this.identityRegistryAddress) {
      return { success: false, error: 'No identity registry configured' } as any;
    }
    return this.chain.writeContract(this.identityRegistryAddress, [...IDENTITY_REGISTRY_ABI], 'registerIdentity', [user, identity, country]);
  }

  // ============================================================================
  // Admin
  // ============================================================================

  async addAgent(agent: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'addAgent', [agent]);
  }

  async removeAgent(agent: Address): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'removeAgent', [agent]);
  }

  async pause(): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'pause', []);
  }

  async unpause(): Promise<Result<Hash, string>> {
    return this.chain.writeContract(this.tokenAddress, [...COMPLIANCE_TOKEN_ABI], 'unpause', []);
  }
}
