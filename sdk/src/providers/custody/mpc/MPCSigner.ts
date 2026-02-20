/**
 * MPCSigner - ethers.js Signer Adapter for MPC Providers
 *
 * Wraps any IMPCProvider as an ethers.js compatible Signer.
 * Handles async MPC signing workflows with polling and timeouts.
 *
 * @example
 * ```typescript
 * const mpc = new FireblocksCustodyProvider(config);
 * const signer = new MPCSigner(mpc, 'account-123', 8453);
 *
 * // Use with EVM chain plugin
 * evmPlugin.connectSigner(signer);
 *
 * // Or use directly with ethers
 * const contract = new ethers.Contract(address, abi, signer);
 * await contract.transfer(to, amount);
 * ```
 */

import {
  AbstractSigner,
  type Provider,
  type TransactionRequest,
  type TransactionResponse,
  type TransactionLike,
  type TypedDataDomain,
  type TypedDataField,
  Transaction,
  resolveAddress,
  hashMessage,
  TypedDataEncoder,
} from 'ethers';
import type { IMPCProvider, MPCSigningSession } from './IMPCProvider.js';

/**
 * MPCSigner configuration
 */
export interface MPCSignerConfig {
  /** Polling interval for checking signing status (ms) */
  pollingInterval?: number;
  /** Maximum time to wait for signing (ms) */
  timeout?: number;
  /** Whether to auto-retry on transient failures */
  autoRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
}

const DEFAULT_CONFIG: Required<MPCSignerConfig> = {
  pollingInterval: 1000,
  timeout: 120000, // 2 minutes
  autoRetry: true,
  maxRetries: 3,
};

/**
 * MPCSigner - ethers.js Signer implementation for MPC providers
 *
 * This class bridges MPC custody providers with the ethers.js ecosystem,
 * allowing MPC-signed transactions to be used anywhere an ethers Signer is expected.
 */
export class MPCSigner extends AbstractSigner {
  private readonly mpcProvider: IMPCProvider;
  private readonly accountId: string;
  private readonly chainId: number;
  private readonly config: Required<MPCSignerConfig>;
  private cachedAddress: string | null = null;

  constructor(
    mpcProvider: IMPCProvider,
    accountId: string,
    chainId: number,
    provider?: Provider | null,
    config: MPCSignerConfig = {}
  ) {
    super(provider);
    this.mpcProvider = mpcProvider;
    this.accountId = accountId;
    this.chainId = chainId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get the address for this signer
   */
  async getAddress(): Promise<string> {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    const accountResult = await this.mpcProvider.getAccount(this.accountId);
    if (!accountResult.success) {
      throw new Error(`Failed to get MPC account: ${accountResult.error}`);
    }

    const address = accountResult.data.addresses[0];
    if (!address) {
      throw new Error('MPC account has no addresses');
    }

    this.cachedAddress = address;
    return address;
  }

  /**
   * Sign a message (EIP-191 personal sign)
   */
  async signMessage(message: string | Uint8Array): Promise<string> {
    const result = await this.mpcProvider.signMessage(this.accountId, message);

    if (!result.success) {
      throw new Error(`MPC signing failed: ${result.error}`);
    }

    // If signing is async (has sessionId), wait for completion
    if (result.data.sessionId) {
      const session = await this.waitForSigningSession(result.data.sessionId);
      if (!session.signature) {
        throw new Error('Signing session completed without signature');
      }
      return session.signature;
    }

    return result.data.signature;
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    // Determine primary type (first type that's not EIP712Domain)
    const primaryType = Object.keys(types).find((t) => t !== 'EIP712Domain') || 'Message';

    const result = await this.mpcProvider.signTypedData(this.accountId, {
      domain: {
        name: domain.name || undefined,
        version: domain.version || undefined,
        chainId: domain.chainId ? Number(domain.chainId) : undefined,
        verifyingContract: domain.verifyingContract || undefined,
        salt: domain.salt ? String(domain.salt) : undefined,
      },
      types: types as Record<string, Array<{ name: string; type: string }>>,
      primaryType,
      message: value,
    });

    if (!result.success) {
      throw new Error(`MPC typed data signing failed: ${result.error}`);
    }

    // If signing is async, wait for completion
    if (result.data.sessionId) {
      const session = await this.waitForSigningSession(result.data.sessionId);
      if (!session.signature) {
        throw new Error('Signing session completed without signature');
      }
      return session.signature;
    }

    return result.data.signature;
  }

  /**
   * Sign a transaction
   */
  async signTransaction(tx: TransactionRequest): Promise<string> {
    // Populate missing fields
    const populatedTx = await this.populateTransaction(tx);

    // Serialize the transaction
    const transaction = Transaction.from({
      type: populatedTx.type,
      to: populatedTx.to as string | null | undefined,
      from: populatedTx.from as string | null | undefined,
      nonce: Number(populatedTx.nonce),
      gasLimit: populatedTx.gasLimit,
      gasPrice: populatedTx.gasPrice,
      maxFeePerGas: populatedTx.maxFeePerGas,
      maxPriorityFeePerGas: populatedTx.maxPriorityFeePerGas,
      data: populatedTx.data,
      value: populatedTx.value,
      chainId: this.chainId,
      accessList: populatedTx.accessList,
    });

    // Get unsigned transaction hash
    const unsignedHash = transaction.unsignedHash;

    // Request MPC signing session
    const sessionResult = await this.mpcProvider.initiateSigningSession({
      accountId: this.accountId,
      messageHash: unsignedHash,
      metadata: {
        transactionType: 'evm_transaction',
        chainId: this.chainId,
        to: populatedTx.to,
        value: populatedTx.value?.toString(),
      },
    });

    if (!sessionResult.success) {
      throw new Error(`Failed to initiate MPC signing: ${sessionResult.error}`);
    }

    // Wait for signing to complete
    const session = await this.waitForSigningSession(sessionResult.data.sessionId);

    if (!session.signature) {
      throw new Error('Signing session completed without signature');
    }

    // Parse signature (65 bytes: r[32] + s[32] + v[1])
    const sig = session.signature.startsWith('0x')
      ? session.signature.slice(2)
      : session.signature;

    const r = '0x' + sig.slice(0, 64);
    const s = '0x' + sig.slice(64, 128);
    const v = parseInt(sig.slice(128, 130), 16);

    // Apply signature to transaction
    transaction.signature = {
      r,
      s,
      v,
    };

    return transaction.serialized;
  }

  /**
   * Send a transaction
   *
   * Signs the transaction and broadcasts it to the network.
   */
  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    const provider = this.provider;
    if (!provider) {
      throw new Error('No provider configured for MPCSigner');
    }

    // Sign the transaction
    const signedTx = await this.signTransaction(tx);

    // Broadcast to network
    return provider.broadcastTransaction(signedTx);
  }

  /**
   * Connect to a provider
   */
  connect(provider: Provider): MPCSigner {
    return new MPCSigner(
      this.mpcProvider,
      this.accountId,
      this.chainId,
      provider,
      this.config
    );
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Wait for a signing session to complete
   */
  private async waitForSigningSession(sessionId: string): Promise<MPCSigningSession> {
    const startTime = Date.now();
    let retries = 0;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > this.config.timeout) {
        // Try to cancel the session
        await this.mpcProvider.cancelSigningSession(sessionId).catch(() => {});
        throw new Error(`MPC signing timed out after ${this.config.timeout}ms`);
      }

      // Get session status
      const result = await this.mpcProvider.getSigningSession(sessionId);

      if (!result.success) {
        if (this.config.autoRetry && retries < this.config.maxRetries) {
          retries++;
          await this.delay(this.config.pollingInterval);
          continue;
        }
        throw new Error(`Failed to get signing session: ${result.error}`);
      }

      const session = result.data;

      switch (session.status) {
        case 'completed':
          return session;

        case 'failed':
          throw new Error(`MPC signing failed: ${session.error || 'Unknown error'}`);

        case 'expired':
          throw new Error('MPC signing session expired');

        case 'cancelled':
          throw new Error('MPC signing session was cancelled');

        case 'initiated':
        case 'collecting':
        case 'signing':
          // Still in progress, wait and poll again
          await this.delay(this.config.pollingInterval);
          break;

        default:
          throw new Error(`Unknown signing session status: ${session.status}`);
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Populate transaction with defaults
   */
  async populateTransaction(tx: TransactionRequest): Promise<TransactionLike<string>> {
    const provider = this.provider;
    if (!provider) {
      return tx as TransactionLike<string>;
    }

    const populated: TransactionRequest = { ...tx };

    // Set from address
    if (!populated.from) {
      populated.from = await this.getAddress();
    }

    // Get nonce if not set
    if (populated.nonce === undefined) {
      populated.nonce = await provider.getTransactionCount(await resolveAddress(populated.from), 'pending');
    }

    // Get gas price / fee data
    if (
      populated.gasPrice === undefined &&
      populated.maxFeePerGas === undefined
    ) {
      const feeData = await provider.getFeeData();

      // Prefer EIP-1559 if supported
      if (feeData.maxFeePerGas !== null && feeData.maxPriorityFeePerGas !== null) {
        populated.maxFeePerGas = feeData.maxFeePerGas;
        populated.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } else if (feeData.gasPrice !== null) {
        populated.gasPrice = feeData.gasPrice;
      }
    }

    // Estimate gas if not set
    if (populated.gasLimit === undefined) {
      try {
        populated.gasLimit = await provider.estimateGas(populated);
      } catch {
        // Default to a reasonable limit
        populated.gasLimit = 21000n;
      }
    }

    // Set chain ID
    if (populated.chainId === undefined) {
      populated.chainId = this.chainId;
    }

    // Resolve AddressLike fields to strings for TransactionLike<string> compatibility
    const resolvedTo = populated.to ? await resolveAddress(populated.to) : (populated.to as null | undefined);
    const resolvedFrom = populated.from ? await resolveAddress(populated.from) : undefined;

    return {
      ...populated,
      to: resolvedTo,
      from: resolvedFrom,
    } as TransactionLike<string>;
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get the MPC account ID
   */
  getAccountId(): string {
    return this.accountId;
  }

  /**
   * Get the chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get the underlying MPC provider
   */
  getMPCProvider(): IMPCProvider {
    return this.mpcProvider;
  }

  /**
   * Clear cached address (useful if account addresses change)
   */
  clearAddressCache(): void {
    this.cachedAddress = null;
  }
}

/**
 * Factory function to create an MPCSigner
 */
export function createMPCSigner(
  mpcProvider: IMPCProvider,
  accountId: string,
  chainId: number,
  provider?: Provider | null,
  config?: MPCSignerConfig
): MPCSigner {
  return new MPCSigner(mpcProvider, accountId, chainId, provider, config);
}
