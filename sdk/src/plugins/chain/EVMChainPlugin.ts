/**
 * EVM Chain Plugin
 *
 * Implements IChainPlugin interface for EVM-compatible blockchains.
 * Provides a unified interface for interacting with Base, Polygon, Ethereum, etc.
 */

import { ethers, type Provider, type Signer, type TransactionResponse, type TransactionReceipt as EthersReceipt, type Log } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';
import type { IChainPlugin, ChainConfig, TransactionReceipt, TransactionLog } from '../../core/interfaces.js';
import { ChainRegistry, chainRegistry as defaultRegistry, type ChainConfig as RegistryChainConfig } from './ChainRegistry.js';
import { SDKError, ErrorCode } from '../../errors/index.js';

export interface EVMChainPluginConfig {
  chainId: number;
  rpcUrl?: string;
  privateKey?: string;
  registry?: ChainRegistry;
}

export class EVMChainPlugin implements IChainPlugin {
  readonly pluginId: string;
  readonly chainConfig: ChainConfig;

  private provider: Provider;
  private signer: Signer | null = null;
  private connected: boolean = false;
  private registry: ChainRegistry;
  private eventSubscriptions: Map<string, { unsubscribe: () => void }> = new Map();

  constructor(config: EVMChainPluginConfig) {
    this.registry = config.registry || defaultRegistry;

    const chainConfig = this.registry.get(config.chainId);
    if (!chainConfig) {
      throw new SDKError(`Chain ${config.chainId} not found in registry`, ErrorCode.NOT_FOUND, {
        details: { chainId: config.chainId },
      });
    }

    const rpcUrl = config.rpcUrl || chainConfig.rpcUrl;

    this.pluginId = `evm-${config.chainId}`;
    this.chainConfig = {
      chainId: config.chainId,
      name: chainConfig.name,
      rpcUrl,
      explorerUrl: chainConfig.explorerUrl,
      nativeCurrency: chainConfig.nativeCurrency,
    };

    this.provider = new ethers.JsonRpcProvider(rpcUrl, config.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }
  }

  async connect(): Promise<Result<void, string>> {
    try {
      // Test connection by getting block number
      await this.provider.getBlockNumber();
      this.connected = true;
      return ok(undefined);
    } catch (error) {
      this.connected = false;
      return err(`Failed to connect to ${this.chainConfig.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async disconnect(): Promise<void> {
    // Clean up subscriptions
    for (const sub of this.eventSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.eventSubscriptions.clear();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getBlockNumber(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  async sendTransaction(tx: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  }): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured. Provide a privateKey to send transactions.');
    }

    try {
      const txRequest = {
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gasLimit: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
      };

      const response: TransactionResponse = await this.signer.sendTransaction(txRequest);
      const receipt = await response.wait();

      if (!receipt) {
        return err('Transaction failed: no receipt');
      }

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async call(params: { to: string; data: string }): Promise<Result<string, string>> {
    try {
      const result = await this.provider.call({
        to: params.to,
        data: params.data,
      });
      return ok(result);
    } catch (error) {
      return err(`Call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async waitForTransaction(
    txHash: string,
    confirmations?: number
  ): Promise<Result<TransactionReceipt, string>> {
    try {
      const receipt = await this.provider.waitForTransaction(txHash, confirmations || 1);

      if (!receipt) {
        return err('Transaction not found');
      }

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Wait failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getTransactionReceipt(txHash: string): Promise<TransactionReceipt | null> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      return receipt ? this.formatReceipt(receipt) : null;
    } catch {
      return null;
    }
  }

  async subscribeToEvents(
    contractAddress: string,
    eventSignature: string,
    callback: (log: TransactionLog) => void
  ): Promise<{ unsubscribe: () => void }> {
    const filter = {
      address: contractAddress,
      topics: [ethers.id(eventSignature)],
    };

    const listener = (log: Log) => {
      callback(this.formatLog(log));
    };

    await this.provider.on(filter, listener);

    const subscriptionKey = `${contractAddress}-${eventSignature}`;
    const unsubscribe = () => {
      this.provider.off(filter, listener);
      this.eventSubscriptions.delete(subscriptionKey);
    };

    this.eventSubscriptions.set(subscriptionKey, { unsubscribe });

    return { unsubscribe };
  }

  // Helper methods

  private formatReceipt(receipt: EthersReceipt): TransactionReceipt {
    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(),
      status: receipt.status === 1 ? 'SUCCESS' : 'REVERTED',
      logs: receipt.logs.map(log => this.formatLog(log)),
    };
  }

  private formatLog(log: Log): TransactionLog {
    return {
      address: log.address,
      topics: log.topics as string[],
      data: log.data,
      logIndex: log.index,
    };
  }

  // Additional utility methods

  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return balance.toString();
  }

  async getGasPrice(): Promise<string> {
    const feeData = await this.provider.getFeeData();
    return (feeData.gasPrice || 0n).toString();
  }

  async estimateGas(tx: { to: string; data: string; value?: string }): Promise<string> {
    const estimate = await this.provider.estimateGas({
      to: tx.to,
      data: tx.data,
      value: tx.value ? BigInt(tx.value) : undefined,
    });
    return estimate.toString();
  }

  getProvider(): Provider {
    return this.provider;
  }

  getSigner(): Signer | null {
    return this.signer;
  }

  // Connect with an external signer (e.g., from wallet)
  connectSigner(signer: Signer): void {
    this.signer = signer;
  }

  // Get explorer URL for a transaction
  getExplorerUrl(txHash: string): string {
    return `${this.chainConfig.explorerUrl}/tx/${txHash}`;
  }

  // Get explorer URL for an address
  getAddressExplorerUrl(address: string): string {
    return `${this.chainConfig.explorerUrl}/address/${address}`;
  }
}

// Factory function for creating chain plugins
export function createEVMChainPlugin(config: EVMChainPluginConfig): EVMChainPlugin {
  return new EVMChainPlugin(config);
}

// Pre-configured plugins for common chains
export function createBasePlugin(config?: { rpcUrl?: string; privateKey?: string }): EVMChainPlugin {
  return new EVMChainPlugin({ chainId: 8453, ...config });
}

export function createPolygonPlugin(config?: { rpcUrl?: string; privateKey?: string }): EVMChainPlugin {
  return new EVMChainPlugin({ chainId: 137, ...config });
}

export function createEthereumPlugin(config?: { rpcUrl?: string; privateKey?: string }): EVMChainPlugin {
  return new EVMChainPlugin({ chainId: 1, ...config });
}

export default EVMChainPlugin;
