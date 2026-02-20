/**
 * Identity Bridge Service
 *
 * Bridges off-chain KYC approval to on-chain IdentityRegistry.
 * When an investor is KYC-approved, registers their wallet address
 * with the token's IdentityRegistry contract.
 *
 * All relayer calls are wrapped in try/catch so the service degrades
 * gracefully in dev/test environments where no chain config exists.
 */

import { logger } from '../middleware/logger.js';
import * as relayerService from './relayer.service.js';

// ============================================================================
// Types
// ============================================================================

export interface IdentityRegistration {
  investorId: string;
  walletAddress: string;
  chainId: number;
  identityRegistryAddress: string;
  txHash?: string;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  error?: string;
  createdAt: string;
}

// ============================================================================
// ABI Encoding Helpers
// ============================================================================

// Function selectors (first 4 bytes of keccak256 of the function signature)
// registerIdentity(address,address,uint16) => 0x3cf1f7e4
const REGISTER_IDENTITY_SELECTOR = '0x3cf1f7e4';
// isVerified(address) => 0x8e8d65d2
const IS_VERIFIED_SELECTOR = '0x8e8d65d2';
// deleteIdentity(address) => 0x5765a1d0
const DELETE_IDENTITY_SELECTOR = '0x5765a1d0';

/**
 * ABI-encode an address parameter as a 32-byte hex word (no 0x prefix).
 */
function encodeAddress(address: string): string {
  return address.toLowerCase().slice(2).padStart(64, '0');
}

/**
 * ABI-encode a uint16 parameter as a 32-byte hex word (no 0x prefix).
 */
function encodeUint16(value: number): string {
  return value.toString(16).padStart(64, '0');
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Register an investor's identity on-chain via the IdentityRegistry contract.
 * Called when KYC is approved.
 *
 * Encodes `registerIdentity(address investorWallet, address identityContract, uint16 country)`
 * and submits it through the relayer service.
 *
 * In dev/test environments where the relayer is not configured, returns a
 * mock pending registration so callers are not blocked.
 */
export async function registerIdentityOnChain(params: {
  investorId: string;
  walletAddress: string;
  chainId: number;
  identityRegistryAddress: string;
  orgId: string;
  country: number; // ISO 3166-1 numeric country code
}): Promise<IdentityRegistration> {
  const { investorId, walletAddress, chainId, identityRegistryAddress, orgId, country } = params;
  const now = new Date().toISOString();

  logger.info('Registering identity on-chain', {
    investorId,
    walletAddress,
    chainId,
    identityRegistryAddress,
    country,
  });

  try {
    // Encode registerIdentity(address, address, uint16) calldata
    // For MVP, the identity contract address is the investor's wallet address itself
    // (in production this would be a deployed ONCHAINID / ClaimIssuer identity contract)
    const data =
      REGISTER_IDENTITY_SELECTOR +
      encodeAddress(walletAddress) +
      encodeAddress(walletAddress) +
      encodeUint16(country);

    // Get the relayer signer address from chain config
    const chainConfig = relayerService.getChainConfig(chainId);

    // Determine the relayer signer address from env
    const signerKeys = process.env.SIGNER_KEYS;
    if (!signerKeys) {
      throw new Error('No SIGNER_KEYS configured for relayer');
    }
    const keys: { address: string }[] = JSON.parse(signerKeys);
    if (keys.length === 0) {
      throw new Error('SIGNER_KEYS array is empty');
    }
    const signerAddress = keys[0].address;

    // Build, sign, and submit the transaction
    const tx: relayerService.TransactionRequest = {
      to: identityRegistryAddress,
      from: signerAddress,
      data,
      value: '0',
      chainId,
    };

    const { signedTx, hash } = await relayerService.signTransaction(tx, orgId);
    const { txHash } = await relayerService.submitTransaction(chainId, signedTx, orgId);

    logger.info('Identity registration submitted on-chain', {
      investorId,
      walletAddress,
      txHash,
      chainId,
    });

    return {
      investorId,
      walletAddress,
      chainId,
      identityRegistryAddress,
      txHash,
      status: 'submitted',
      createdAt: now,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Graceful degradation: in dev/test the relayer may not be configured
    logger.warn('Identity on-chain registration failed, returning pending status', {
      investorId,
      walletAddress,
      chainId,
      error: errorMessage,
    });

    return {
      investorId,
      walletAddress,
      chainId,
      identityRegistryAddress,
      status: 'pending',
      error: errorMessage,
      createdAt: now,
    };
  }
}

/**
 * Check if an investor is registered on-chain by calling the
 * IdentityRegistry's `isVerified(address)` view function.
 *
 * Returns false with a warning if the relayer / RPC is not available.
 */
export async function isRegisteredOnChain(params: {
  walletAddress: string;
  chainId: number;
  identityRegistryAddress: string;
}): Promise<boolean> {
  const { walletAddress, chainId, identityRegistryAddress } = params;

  try {
    // Encode isVerified(address) calldata
    const data = IS_VERIFIED_SELECTOR + encodeAddress(walletAddress);

    // Use the relayer's generic eth_call helper
    const result = await relayerService.call(chainId, identityRegistryAddress, data);

    // bool is ABI-encoded as a 32-byte word; 1 = true
    return BigInt(result) === 1n;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn('isRegisteredOnChain check failed, returning false', {
      walletAddress,
      chainId,
      identityRegistryAddress,
      error: errorMessage,
    });

    return false;
  }
}

/**
 * Remove an investor's identity from the on-chain registry.
 * Called when KYC is revoked.
 *
 * Encodes `deleteIdentity(address)` and submits via the relayer.
 * Returns `{ success: true, txHash }` on success, or
 * `{ success: false }` with a logged warning on failure.
 */
export async function removeIdentityOnChain(params: {
  walletAddress: string;
  chainId: number;
  identityRegistryAddress: string;
  orgId: string;
}): Promise<{ success: boolean; txHash?: string }> {
  const { walletAddress, chainId, identityRegistryAddress, orgId } = params;

  logger.info('Removing identity from on-chain registry', {
    walletAddress,
    chainId,
    identityRegistryAddress,
  });

  try {
    // Encode deleteIdentity(address) calldata
    const data = DELETE_IDENTITY_SELECTOR + encodeAddress(walletAddress);

    // Determine the relayer signer address from env
    const signerKeys = process.env.SIGNER_KEYS;
    if (!signerKeys) {
      throw new Error('No SIGNER_KEYS configured for relayer');
    }
    const keys: { address: string }[] = JSON.parse(signerKeys);
    if (keys.length === 0) {
      throw new Error('SIGNER_KEYS array is empty');
    }
    const signerAddress = keys[0].address;

    // Build, sign, and submit the transaction
    const tx: relayerService.TransactionRequest = {
      to: identityRegistryAddress,
      from: signerAddress,
      data,
      value: '0',
      chainId,
    };

    const { signedTx } = await relayerService.signTransaction(tx, orgId);
    const { txHash } = await relayerService.submitTransaction(chainId, signedTx, orgId);

    logger.info('Identity removal submitted on-chain', {
      walletAddress,
      txHash,
      chainId,
    });

    return { success: true, txHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.warn('Identity on-chain removal failed', {
      walletAddress,
      chainId,
      identityRegistryAddress,
      error: errorMessage,
    });

    return { success: false };
  }
}
