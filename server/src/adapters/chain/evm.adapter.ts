/**
 * EVMChainAdapter - EVM-compatible blockchain adapter
 *
 * Provides blockchain interaction capabilities for:
 * - Contract deployment
 * - Transaction submission
 * - Contract reads
 * - Event monitoring
 *
 * Supports: Ethereum, Polygon, Arbitrum, Base, etc.
 */

import { ethers } from 'ethers';

// ============================================================================
// Types
// ============================================================================

/**
 * EVM chain adapter configuration
 */
export interface EVMChainConfig {
  /** Chain ID */
  chainId: number;
  /** Chain name */
  chainName: string;
  /** RPC URL */
  rpcUrl: string;
  /** Private key for signing (optional - use custody provider instead) */
  privateKey?: string;
  /** Block explorer URL */
  explorerUrl?: string;
  /** Gas price multiplier (for priority) */
  gasPriceMultiplier?: number;
  /** Max gas price (wei) */
  maxGasPrice?: string;
  /** Request timeout (ms) */
  timeout?: number;
}

/**
 * Contract deployment parameters
 */
export interface DeployParams {
  /** Contract bytecode */
  bytecode: string;
  /** Contract ABI */
  abi: ethers.InterfaceAbi;
  /** Constructor arguments */
  constructorArgs?: unknown[];
  /** Gas limit override */
  gasLimit?: string;
  /** Value to send (wei) */
  value?: string;
}

/**
 * Contract deployment result
 */
export interface DeployResult {
  /** Deployed contract address */
  contractAddress: string;
  /** Deployment transaction hash */
  transactionHash: string;
  /** Block number */
  blockNumber: number;
  /** Gas used */
  gasUsed: string;
  /** Deployment timestamp */
  deployedAt: string;
}

/**
 * Transaction parameters
 */
export interface TxParams {
  /** Destination address */
  to: string;
  /** Encoded function data */
  data: string;
  /** Value to send (wei) */
  value?: string;
  /** Gas limit */
  gasLimit?: string;
  /** Nonce override */
  nonce?: number;
}

/**
 * Transaction result
 */
export interface TxResult {
  /** Transaction hash */
  transactionHash: string;
  /** Block number */
  blockNumber: number;
  /** Block hash */
  blockHash: string;
  /** Status */
  status: 'success' | 'reverted';
  /** Gas used */
  gasUsed: string;
  /** Effective gas price */
  effectiveGasPrice: string;
  /** Events emitted */
  events: Array<{
    address: string;
    topics: string[];
    data: string;
    logIndex: number;
  }>;
}

/**
 * Contract read parameters
 */
export interface ReadParams {
  /** Contract address */
  contractAddress: string;
  /** Contract ABI */
  abi: ethers.InterfaceAbi;
  /** Function name */
  functionName: string;
  /** Function arguments */
  args?: unknown[];
}

/**
 * Chain adapter interface
 */
export interface IChainAdapter {
  readonly chainId: number;
  readonly chainName: string;

  deployContract(params: DeployParams): Promise<DeployResult>;
  sendTransaction(params: TxParams): Promise<TxResult>;
  readContract(params: ReadParams): Promise<unknown>;
  getBalance(address: string): Promise<string>;
  getBlockNumber(): Promise<number>;
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// EVM Chain Adapter Implementation
// ============================================================================

/**
 * EVMChainAdapter - EVM blockchain adapter
 */
export class EVMChainAdapter implements IChainAdapter {
  readonly chainId: number;
  readonly chainName: string;

  private config: Required<EVMChainConfig>;
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet | null = null;

  constructor(config: EVMChainConfig) {
    this.chainId = config.chainId;
    this.chainName = config.chainName;

    this.config = {
      gasPriceMultiplier: 1.1,
      maxGasPrice: ethers.parseUnits('500', 'gwei').toString(),
      timeout: 30000,
      explorerUrl: '',
      privateKey: '',
      ...config,
    };

    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, {
      chainId: config.chainId,
      name: config.chainName,
    });

    // Initialize signer if private key provided
    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }
  }

  /**
   * Create adapter instance with validation
   */
  static create(config: EVMChainConfig): EVMChainAdapter {
    if (!config.rpcUrl) {
      throw new Error('RPC URL is required');
    }
    if (!config.chainId) {
      throw new Error('Chain ID is required');
    }
    return new EVMChainAdapter(config);
  }

  /**
   * Set signer (for use with custody provider)
   */
  setSigner(privateKey: string): void {
    this.signer = new ethers.Wallet(privateKey, this.provider);
  }

  /**
   * Deploy a contract
   */
  async deployContract(params: DeployParams): Promise<DeployResult> {
    this.ensureSigner();

    const factory = new ethers.ContractFactory(
      params.abi,
      params.bytecode,
      this.signer!
    );

    // Estimate gas if not provided
    const gasLimit = params.gasLimit
      ? BigInt(params.gasLimit)
      : await this.estimateDeploymentGas(factory, params.constructorArgs || []);

    // Get gas price with multiplier
    const feeData = await this.provider.getFeeData();
    const gasPrice = this.calculateGasPrice(feeData);

    // Deploy contract
    const contract = await factory.deploy(...(params.constructorArgs || []), {
      gasLimit,
      gasPrice,
      value: params.value ? BigInt(params.value) : undefined,
    });

    // Wait for deployment
    const receipt = await contract.deploymentTransaction()?.wait();

    if (!receipt) {
      throw new Error('Deployment failed - no receipt');
    }

    const contractAddress = await contract.getAddress();

    return {
      contractAddress,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      deployedAt: new Date().toISOString(),
    };
  }

  /**
   * Send a transaction
   */
  async sendTransaction(params: TxParams): Promise<TxResult> {
    this.ensureSigner();

    // Get gas price
    const feeData = await this.provider.getFeeData();
    const gasPrice = this.calculateGasPrice(feeData);

    // Estimate gas if not provided
    const gasLimit = params.gasLimit
      ? BigInt(params.gasLimit)
      : await this.provider.estimateGas({
          to: params.to,
          data: params.data,
          value: params.value ? BigInt(params.value) : undefined,
          from: await this.signer!.getAddress(),
        });

    // Build transaction
    const tx: ethers.TransactionRequest = {
      to: params.to,
      data: params.data,
      gasLimit: BigInt(Math.floor(Number(gasLimit) * 1.2)), // 20% buffer
      gasPrice,
      value: params.value ? BigInt(params.value) : undefined,
      nonce: params.nonce,
    };

    // Send transaction
    const response = await this.signer!.sendTransaction(tx);

    // Wait for confirmation
    const receipt = await response.wait();

    if (!receipt) {
      throw new Error('Transaction failed - no receipt');
    }

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status === 1 ? 'success' : 'reverted',
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: (receipt.gasPrice || 0n).toString(),
      events: receipt.logs.map(log => ({
        address: log.address,
        topics: [...log.topics],
        data: log.data,
        logIndex: log.index,
      })),
    };
  }

  /**
   * Read from a contract
   */
  async readContract(params: ReadParams): Promise<unknown> {
    const contract = new ethers.Contract(
      params.contractAddress,
      params.abi,
      this.provider
    );

    const result = await contract[params.functionName](...(params.args || []));

    // Convert BigInt to string for JSON serialization
    return this.serializeResult(result);
  }

  /**
   * Get native token balance
   */
  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return balance.toString();
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const network = await this.provider.getNetwork();
      return Number(network.chainId) === this.chainId;
    } catch {
      return false;
    }
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string): Promise<TxResult | null> {
    const receipt = await this.provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return null;
    }

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status === 1 ? 'success' : 'reverted',
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: (receipt.gasPrice || 0n).toString(),
      events: receipt.logs.map(log => ({
        address: log.address,
        topics: [...log.topics],
        data: log.data,
        logIndex: log.index,
      })),
    };
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(
    txHash: string,
    confirmations: number = 1
  ): Promise<TxResult> {
    const receipt = await this.provider.waitForTransaction(txHash, confirmations);

    if (!receipt) {
      throw new Error('Transaction not found');
    }

    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status === 1 ? 'success' : 'reverted',
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: (receipt.gasPrice || 0n).toString(),
      events: receipt.logs.map(log => ({
        address: log.address,
        topics: [...log.topics],
        data: log.data,
        logIndex: log.index,
      })),
    };
  }

  /**
   * Encode function call data
   */
  encodeFunction(
    abi: ethers.InterfaceAbi,
    functionName: string,
    args: unknown[]
  ): string {
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData(functionName, args);
  }

  /**
   * Decode function result
   */
  decodeResult(
    abi: ethers.InterfaceAbi,
    functionName: string,
    data: string
  ): unknown {
    const iface = new ethers.Interface(abi);
    return iface.decodeFunctionResult(functionName, data);
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txHash: string): string | null {
    if (!this.config.explorerUrl) {
      return null;
    }
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private ensureSigner(): void {
    if (!this.signer) {
      throw new Error('Signer not configured - provide private key or use custody provider');
    }
  }

  private async estimateDeploymentGas(
    factory: ethers.ContractFactory,
    args: unknown[]
  ): Promise<bigint> {
    const deployTx = await factory.getDeployTransaction(...args);
    const estimate = await this.provider.estimateGas(deployTx);
    return BigInt(Math.floor(Number(estimate) * 1.3)); // 30% buffer for deployment
  }

  private calculateGasPrice(feeData: ethers.FeeData): bigint {
    const basePrice = feeData.gasPrice || 0n;
    const multiplied = BigInt(
      Math.floor(Number(basePrice) * this.config.gasPriceMultiplier)
    );
    const maxPrice = BigInt(this.config.maxGasPrice);

    return multiplied > maxPrice ? maxPrice : multiplied;
  }

  private serializeResult(result: unknown): unknown {
    if (typeof result === 'bigint') {
      return result.toString();
    }
    if (Array.isArray(result)) {
      return result.map(item => this.serializeResult(item));
    }
    if (result && typeof result === 'object') {
      const serialized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(result)) {
        serialized[key] = this.serializeResult(value);
      }
      return serialized;
    }
    return result;
  }
}

// ============================================================================
// Chain Presets
// ============================================================================

/**
 * Common chain configurations
 */
export const ChainPresets = {
  ethereum: (rpcUrl: string, privateKey?: string): EVMChainConfig => ({
    chainId: 1,
    chainName: 'Ethereum Mainnet',
    rpcUrl,
    privateKey,
    explorerUrl: 'https://etherscan.io',
  }),

  sepolia: (rpcUrl: string, privateKey?: string): EVMChainConfig => ({
    chainId: 11155111,
    chainName: 'Sepolia Testnet',
    rpcUrl,
    privateKey,
    explorerUrl: 'https://sepolia.etherscan.io',
  }),

  polygon: (rpcUrl: string, privateKey?: string): EVMChainConfig => ({
    chainId: 137,
    chainName: 'Polygon Mainnet',
    rpcUrl,
    privateKey,
    explorerUrl: 'https://polygonscan.com',
  }),

  arbitrum: (rpcUrl: string, privateKey?: string): EVMChainConfig => ({
    chainId: 42161,
    chainName: 'Arbitrum One',
    rpcUrl,
    privateKey,
    explorerUrl: 'https://arbiscan.io',
  }),

  base: (rpcUrl: string, privateKey?: string): EVMChainConfig => ({
    chainId: 8453,
    chainName: 'Base',
    rpcUrl,
    privateKey,
    explorerUrl: 'https://basescan.org',
  }),

  avalanche: (rpcUrl: string, privateKey?: string): EVMChainConfig => ({
    chainId: 43114,
    chainName: 'Avalanche C-Chain',
    rpcUrl,
    privateKey,
    explorerUrl: 'https://snowtrace.io',
  }),
};
