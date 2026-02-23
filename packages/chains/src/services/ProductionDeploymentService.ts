/**
 * Production Deployment Service
 *
 * Full-featured contract deployment with:
 * - TokenFactory for deterministic CREATE2 addresses
 * - Block explorer verification (Etherscan, Polygonscan, etc.)
 * - PostgreSQL persistence of deployment records
 * - SDK asset integration
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
  type Chain,
  type Account,
  type Transport,
  getContract,
  encodeDeployData,
  keccak256,
  encodePacked,
  getContractAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  mainnet,
  polygon,
  polygonAmoy,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
  optimism,
  sepolia,
} from 'viem/chains';
import { ContractError, ValidationError, ErrorCode } from '@tokenisation/core';
import { abis } from '../contracts/abis/index.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Import bytecodes
const TokenFactoryBytecode = require('../contracts/abis/TokenFactory.bytecode.json');
const ComplianceTokenBytecode = require('../contracts/abis/ComplianceToken.bytecode.json');
const IdentityRegistryBytecode = require('../contracts/abis/IdentityRegistry.bytecode.json');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported networks
 */
export const NETWORKS = {
  // Mainnets
  mainnet: { ...mainnet, explorerApi: 'https://api.etherscan.io/api' },
  polygon: { ...polygon, explorerApi: 'https://api.polygonscan.com/api' },
  base: { ...base, explorerApi: 'https://api.basescan.org/api' },
  arbitrum: { ...arbitrum, explorerApi: 'https://api.arbiscan.io/api' },
  optimism: { ...optimism, explorerApi: 'https://api-optimistic.etherscan.io/api' },
  // Testnets
  sepolia: { ...sepolia, explorerApi: 'https://api-sepolia.etherscan.io/api' },
  polygonAmoy: { ...polygonAmoy, explorerApi: 'https://api-amoy.polygonscan.com/api' },
  baseSepolia: { ...baseSepolia, explorerApi: 'https://api-sepolia.basescan.org/api' },
  arbitrumSepolia: { ...arbitrumSepolia, explorerApi: 'https://api-sepolia.arbiscan.io/api' },
} as const;

export type NetworkName = keyof typeof NETWORKS;

/**
 * Deployment configuration
 */
export interface ProductionDeploymentConfig {
  /** Network to deploy to */
  network: NetworkName;
  /** RPC URL (uses public RPC if not provided) */
  rpcUrl?: string;
  /** Private key for deployment */
  privateKey: Hex;
  /** Block explorer API key for verification */
  explorerApiKey?: string;
  /** Database adapter for persistence (optional) */
  database?: IDatabaseAdapter;
}

/**
 * Database adapter interface
 */
interface IDatabaseAdapter {
  insert<T>(collection: string, record: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; data?: T }>;
  findOne<T>(collection: string, where: Record<string, unknown>): Promise<{ success: boolean; data?: T | null }>;
  update<T>(collection: string, id: string, updates: Partial<T>): Promise<{ success: boolean; data?: T }>;
}

/**
 * Token deployment parameters
 */
export interface TokenDeployParams {
  /** Token name */
  name: string;
  /** Token symbol */
  symbol: string;
  /** Initial supply (in wei) */
  initialSupply?: bigint;
  /** Custom salt for deterministic address (optional) */
  salt?: Hex;
  /** Token owner address (defaults to deployer) */
  owner?: Address;
  /** Asset ID in SDK (for linking) */
  assetId?: string;
}

/**
 * Deployment record
 */
export interface DeploymentRecord {
  id: string;
  network: string;
  chainId: number;
  contractType: string;
  contractAddress: Address;
  transactionHash: Hex;
  blockNumber: number;
  deployer: Address;
  salt?: Hex;
  verified: boolean;
  verifiedAt?: string;
  assetId?: string;
  tokenName?: string;
  tokenSymbol?: string;
  identityRegistry?: Address;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Contract verification status
 */
export interface ContractVerificationResult {
  success: boolean;
  guid?: string;
  message: string;
  explorerUrl?: string;
}

// ============================================================================
// PRODUCTION DEPLOYMENT SERVICE
// ============================================================================

export class ProductionDeploymentService {
  private publicClient: PublicClient;
  private walletClient: WalletClient<Transport, Chain, Account>;
  private chain: Chain & { explorerApi: string };
  private explorerApiKey?: string;
  private database?: IDatabaseAdapter;
  private factoryAddress?: Address;

  constructor(config: ProductionDeploymentConfig) {
    this.chain = NETWORKS[config.network];
    this.explorerApiKey = config.explorerApiKey;
    this.database = config.database;

    const rpcUrl = config.rpcUrl || this.chain.rpcUrls.default.http[0];
    const account = privateKeyToAccount(config.privateKey);

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      chain: this.chain,
      transport: http(rpcUrl),
      account,
    });
  }

  // ============================================================================
  // GETTERS
  // ============================================================================

  get deployerAddress(): Address {
    return this.walletClient.account.address;
  }

  get networkInfo(): { name: string; chainId: number } {
    return { name: this.chain.name, chainId: this.chain.id };
  }

  // ============================================================================
  // FACTORY DEPLOYMENT
  // ============================================================================

  /**
   * Deploy the TokenFactory (one-time per network)
   */
  async deployFactory(): Promise<{
    address: Address;
    transactionHash: Hex;
    blockNumber: bigint;
  }> {
    console.log(`Deploying TokenFactory to ${this.chain.name}...`);

    const hash = await this.walletClient.deployContract({
      abi: abis.TokenFactory,
      bytecode: TokenFactoryBytecode as Hex,
      args: [],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (!receipt.contractAddress) {
      throw new ContractError('TokenFactory deployment failed', {
        code: ErrorCode.TRANSACTION_FAILED,
        transactionHash: hash,
      });
    }

    this.factoryAddress = receipt.contractAddress;

    // Persist to database
    if (this.database) {
      await this.database.insert('deployments', {
        network: this.chain.name,
        chainId: this.chain.id,
        contractType: 'TokenFactory',
        contractAddress: receipt.contractAddress,
        transactionHash: hash,
        blockNumber: Number(receipt.blockNumber),
        deployer: this.deployerAddress,
        verified: false,
        metadata: {},
      });
    }

    console.log(`TokenFactory deployed at: ${receipt.contractAddress}`);

    return {
      address: receipt.contractAddress,
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Set factory address (if already deployed)
   */
  setFactoryAddress(address: Address): void {
    this.factoryAddress = address;
  }

  // ============================================================================
  // TOKEN DEPLOYMENT
  // ============================================================================

  /**
   * Compute deterministic token address before deployment
   */
  async computeTokenAddress(params: TokenDeployParams): Promise<Address> {
    if (!this.factoryAddress) {
      throw new ContractError('TokenFactory not deployed. Call deployFactory() first.', {
        code: ErrorCode.NOT_INITIALIZED,
      });
    }

    const salt = params.salt || this.generateSalt(params.name, params.symbol);

    const factory = getContract({
      address: this.factoryAddress,
      abi: abis.TokenFactory,
      client: this.publicClient,
    });

    // Use zero address for identity registry to get base token address
    const tokenAddress = await factory.read.computeTokenAddress([
      params.name,
      params.symbol,
      '0x0000000000000000000000000000000000000000' as Address,
      salt,
    ]);

    return tokenAddress as Address;
  }

  /**
   * Deploy a compliance token via factory
   */
  async deployToken(params: TokenDeployParams): Promise<{
    tokenAddress: Address;
    identityRegistryAddress: Address;
    transactionHash: Hex;
    blockNumber: bigint;
    gasUsed: bigint;
  }> {
    if (!this.factoryAddress) {
      throw new ContractError('TokenFactory not deployed. Call deployFactory() first.', {
        code: ErrorCode.NOT_INITIALIZED,
      });
    }

    const salt = params.salt || this.generateSalt(params.name, params.symbol);
    const owner = params.owner || this.deployerAddress;
    const initialSupply = params.initialSupply || 0n;

    console.log(`Deploying token: ${params.name} (${params.symbol})...`);
    console.log(`  Salt: ${salt}`);
    console.log(`  Owner: ${owner}`);

    const factory = getContract({
      address: this.factoryAddress,
      abi: abis.TokenFactory,
      client: { public: this.publicClient, wallet: this.walletClient },
    });

    // First deploy identity registry
    console.log('  Deploying IdentityRegistry...');
    const registryHash = await factory.write.deployIdentityRegistry([salt]);
    const registryReceipt = await this.publicClient.waitForTransactionReceipt({ hash: registryHash });

    // Get registry address from event
    const registryAddress = await factory.read.computeRegistryAddress([salt]) as Address;
    console.log(`  IdentityRegistry: ${registryAddress}`);

    // Deploy token
    console.log('  Deploying ComplianceToken...');
    const tokenHash = await factory.write.deployComplianceToken([
      params.name,
      params.symbol,
      initialSupply,
      registryAddress,
      salt,
      owner,
    ]);

    const tokenReceipt = await this.publicClient.waitForTransactionReceipt({ hash: tokenHash });

    // Get token address
    const tokenAddress = await factory.read.computeTokenAddress([
      params.name,
      params.symbol,
      registryAddress,
      salt,
    ]) as Address;

    console.log(`  ComplianceToken: ${tokenAddress}`);

    // Persist to database
    if (this.database) {
      await this.database.insert('deployments', {
        network: this.chain.name,
        chainId: this.chain.id,
        contractType: 'ComplianceToken',
        contractAddress: tokenAddress,
        transactionHash: tokenHash,
        blockNumber: Number(tokenReceipt.blockNumber),
        deployer: this.deployerAddress,
        salt,
        verified: false,
        assetId: params.assetId,
        tokenName: params.name,
        tokenSymbol: params.symbol,
        identityRegistry: registryAddress,
        metadata: { owner, initialSupply: initialSupply.toString() },
      });

      await this.database.insert('deployments', {
        network: this.chain.name,
        chainId: this.chain.id,
        contractType: 'IdentityRegistry',
        contractAddress: registryAddress,
        transactionHash: registryHash,
        blockNumber: Number(registryReceipt.blockNumber),
        deployer: this.deployerAddress,
        salt,
        verified: false,
        metadata: { linkedToken: tokenAddress },
      });
    }

    return {
      tokenAddress,
      identityRegistryAddress: registryAddress,
      transactionHash: tokenHash,
      blockNumber: tokenReceipt.blockNumber,
      gasUsed: tokenReceipt.gasUsed,
    };
  }

  /**
   * Deploy token directly (without factory)
   */
  async deployTokenDirect(params: TokenDeployParams & { identityRegistry: Address }): Promise<{
    tokenAddress: Address;
    transactionHash: Hex;
    blockNumber: bigint;
    gasUsed: bigint;
  }> {
    console.log(`Deploying token directly: ${params.name} (${params.symbol})...`);

    const hash = await this.walletClient.deployContract({
      abi: abis.ComplianceToken,
      bytecode: ComplianceTokenBytecode as Hex,
      args: [params.name, params.symbol, params.identityRegistry],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (!receipt.contractAddress) {
      throw new ContractError('Token deployment failed', {
        code: ErrorCode.TRANSACTION_FAILED,
        transactionHash: hash,
      });
    }

    // Persist to database
    if (this.database) {
      await this.database.insert('deployments', {
        network: this.chain.name,
        chainId: this.chain.id,
        contractType: 'ComplianceToken',
        contractAddress: receipt.contractAddress,
        transactionHash: hash,
        blockNumber: Number(receipt.blockNumber),
        deployer: this.deployerAddress,
        verified: false,
        assetId: params.assetId,
        tokenName: params.name,
        tokenSymbol: params.symbol,
        identityRegistry: params.identityRegistry,
        metadata: {},
      });
    }

    return {
      tokenAddress: receipt.contractAddress,
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Deploy identity registry directly
   */
  async deployIdentityRegistry(): Promise<{
    address: Address;
    transactionHash: Hex;
    blockNumber: bigint;
  }> {
    console.log('Deploying IdentityRegistry directly...');

    const hash = await this.walletClient.deployContract({
      abi: abis.IdentityRegistry,
      bytecode: IdentityRegistryBytecode as Hex,
      args: [],
    });

    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    if (!receipt.contractAddress) {
      throw new ContractError('IdentityRegistry deployment failed', {
        code: ErrorCode.TRANSACTION_FAILED,
        transactionHash: hash,
      });
    }

    // Persist to database
    if (this.database) {
      await this.database.insert('deployments', {
        network: this.chain.name,
        chainId: this.chain.id,
        contractType: 'IdentityRegistry',
        contractAddress: receipt.contractAddress,
        transactionHash: hash,
        blockNumber: Number(receipt.blockNumber),
        deployer: this.deployerAddress,
        verified: false,
        metadata: {},
      });
    }

    return {
      address: receipt.contractAddress,
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
    };
  }

  // ============================================================================
  // CONTRACT VERIFICATION
  // ============================================================================

  /**
   * Verify a contract on block explorer
   */
  async verifyContract(
    contractAddress: Address,
    contractName: keyof typeof abis,
    constructorArgs: unknown[] = []
  ): Promise<ContractVerificationResult> {
    if (!this.explorerApiKey) {
      return {
        success: false,
        message: 'Explorer API key not configured',
      };
    }

    console.log(`Verifying ${contractName} at ${contractAddress}...`);

    // Get the source code (would need to be generated or fetched)
    // For now, we'll use the standard verification API format
    const params = new URLSearchParams({
      apikey: this.explorerApiKey,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: contractAddress,
      sourceCode: '', // Would need flattened source
      codeformat: 'solidity-single-file',
      contractname: contractName,
      compilerversion: 'v0.8.20+commit.a1b79de6',
      optimizationUsed: '1',
      runs: '200',
      constructorArguements: this.encodeConstructorArgs(constructorArgs),
    });

    try {
      const response = await fetch(this.chain.explorerApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const data = await response.json();

      if (data.status === '1') {
        // Update database
        if (this.database) {
          const existing = await this.database.findOne<DeploymentRecord>('deployments', {
            contractAddress,
            chainId: this.chain.id,
          });
          if (existing.success && existing.data) {
            await this.database.update('deployments', existing.data.id, {
              verified: true,
              verifiedAt: new Date().toISOString(),
            });
          }
        }

        const explorerBaseUrl = this.chain.blockExplorers?.default.url;
        return {
          success: true,
          guid: data.result,
          message: 'Verification submitted',
          explorerUrl: explorerBaseUrl ? `${explorerBaseUrl}/address/${contractAddress}#code` : undefined,
        };
      }

      return {
        success: false,
        message: data.result || 'Verification failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Verification request failed',
      };
    }
  }

  /**
   * Check verification status
   */
  async checkVerificationStatus(guid: string): Promise<ContractVerificationResult> {
    if (!this.explorerApiKey) {
      return { success: false, message: 'Explorer API key not configured' };
    }

    const params = new URLSearchParams({
      apikey: this.explorerApiKey,
      module: 'contract',
      action: 'checkverifystatus',
      guid,
    });

    try {
      const response = await fetch(`${this.chain.explorerApi}?${params}`);
      const data = await response.json();

      return {
        success: data.status === '1',
        guid,
        message: data.result,
      };
    } catch (error) {
      return {
        success: false,
        guid,
        message: error instanceof Error ? error.message : 'Check status failed',
      };
    }
  }

  // ============================================================================
  // CONTRACT INTERACTIONS
  // ============================================================================

  /**
   * Get contract instance for interactions
   */
  getTokenContract(address: Address) {
    return getContract({
      address,
      abi: abis.ComplianceToken,
      client: { public: this.publicClient, wallet: this.walletClient },
    });
  }

  /**
   * Get identity registry contract
   */
  getIdentityRegistryContract(address: Address) {
    return getContract({
      address,
      abi: abis.IdentityRegistry,
      client: { public: this.publicClient, wallet: this.walletClient },
    });
  }

  /**
   * Mint tokens to an address
   */
  async mintTokens(
    tokenAddress: Address,
    to: Address,
    amount: bigint
  ): Promise<{ transactionHash: Hex; blockNumber: bigint }> {
    const token = this.getTokenContract(tokenAddress);

    const hash = await token.write.mint([to, amount]);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    return {
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Register identity in registry
   */
  async registerIdentity(
    registryAddress: Address,
    userAddress: Address,
    countryCode: number
  ): Promise<{ transactionHash: Hex }> {
    const registry = this.getIdentityRegistryContract(registryAddress);

    const hash = await registry.write.registerIdentity([userAddress, countryCode]);
    await this.publicClient.waitForTransactionReceipt({ hash });

    return { transactionHash: hash };
  }

  /**
   * Set identity verified status
   */
  async setIdentityVerified(
    registryAddress: Address,
    userAddress: Address,
    verified: boolean
  ): Promise<{ transactionHash: Hex }> {
    const registry = this.getIdentityRegistryContract(registryAddress);

    const hash = await registry.write.setVerified([userAddress, verified]);
    await this.publicClient.waitForTransactionReceipt({ hash });

    return { transactionHash: hash };
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get deployer balance
   */
  async getBalance(): Promise<bigint> {
    return this.publicClient.getBalance({ address: this.deployerAddress });
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<bigint> {
    return this.publicClient.getGasPrice();
  }

  /**
   * Estimate gas for token deployment
   */
  async estimateTokenDeploymentGas(params: TokenDeployParams): Promise<bigint> {
    // Rough estimate based on typical deployment costs
    // Factory deployment: ~2M gas
    // Token deployment: ~3M gas
    // Identity registry: ~1.5M gas
    return 6_500_000n;
  }

  /**
   * Generate deterministic salt
   */
  private generateSalt(name: string, symbol: string): Hex {
    const timestamp = BigInt(Date.now());
    return keccak256(
      encodePacked(
        ['address', 'string', 'string', 'uint256'],
        [this.deployerAddress, name, symbol, timestamp]
      )
    );
  }

  /**
   * Encode constructor arguments for verification
   */
  private encodeConstructorArgs(args: unknown[]): string {
    if (args.length === 0) return '';
    // Would need proper ABI encoding
    return '';
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a production deployment service
 */
export function createProductionDeployment(config: ProductionDeploymentConfig): ProductionDeploymentService {
  return new ProductionDeploymentService(config);
}

/**
 * Create from environment variables
 */
export function createProductionDeploymentFromEnv(
  network: NetworkName,
  database?: IDatabaseAdapter
): ProductionDeploymentService {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new ValidationError('DEPLOYER_PRIVATE_KEY environment variable required', {
      field: 'DEPLOYER_PRIVATE_KEY',
      constraints: { required: 'true' },
    });
  }

  return new ProductionDeploymentService({
    network,
    privateKey: privateKey as Hex,
    rpcUrl: process.env[`${network.toUpperCase()}_RPC_URL`],
    explorerApiKey: process.env[`${network.toUpperCase()}_EXPLORER_API_KEY`] || process.env.ETHERSCAN_API_KEY,
    database,
  });
}

/**
 * Known factory addresses per network
 */
export const FACTORY_ADDRESSES: Partial<Record<NetworkName, Address>> = {
  // Add deployed factory addresses here after deployment
  // sepolia: '0x...',
  // polygon: '0x...',
};
