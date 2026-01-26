/**
 * Contract Deployment Service
 *
 * Provides utilities for deploying tokenization contracts to EVM chains.
 * Uses viem for type-safe contract interactions.
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
} from 'viem';
import { z } from 'zod';
import { ValidationError, ContractError, ErrorCode } from '../errors/index.js';
import {
  mainnet,
  polygon,
  base,
  arbitrum,
  optimism,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
} from 'viem/chains';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import { abis } from '../contracts/abis/index.js';

// Import bytecodes (using createRequire for Node 18 compatibility)
const ComplianceTokenBytecode = require('../contracts/abis/ComplianceToken.bytecode.json');
const IdentityRegistryBytecode = require('../contracts/abis/IdentityRegistry.bytecode.json');
const DividendDistributorBytecode = require('../contracts/abis/DividendDistributor.bytecode.json');
const ModularComplianceBytecode = require('../contracts/abis/ModularCompliance.bytecode.json');
const ClaimTopicsRegistryBytecode = require('../contracts/abis/ClaimTopicsRegistry.bytecode.json');
const TrustedIssuersRegistryBytecode = require('../contracts/abis/TrustedIssuersRegistry.bytecode.json');
const OracleRegistryBytecode = require('../contracts/abis/OracleRegistry.bytecode.json');
const ChainlinkPriceFeedBytecode = require('../contracts/abis/ChainlinkPriceFeed.bytecode.json');
const TokenFactoryBytecode = require('../contracts/abis/TokenFactory.bytecode.json');

const bytecodes = {
  ComplianceToken: ComplianceTokenBytecode as Hex,
  IdentityRegistry: IdentityRegistryBytecode as Hex,
  DividendDistributor: DividendDistributorBytecode as Hex,
  ModularCompliance: ModularComplianceBytecode as Hex,
  ClaimTopicsRegistry: ClaimTopicsRegistryBytecode as Hex,
  TrustedIssuersRegistry: TrustedIssuersRegistryBytecode as Hex,
  OracleRegistry: OracleRegistryBytecode as Hex,
  ChainlinkPriceFeed: ChainlinkPriceFeedBytecode as Hex,
  TokenFactory: TokenFactoryBytecode as Hex,
} as const;

/**
 * Supported chains for deployment
 */
export const SUPPORTED_CHAINS = {
  mainnet,
  polygon,
  base,
  arbitrum,
  optimism,
  sepolia,
  baseSepolia,
  arbitrumSepolia,
} as const;

export type SupportedChainName = keyof typeof SUPPORTED_CHAINS;

/**
 * Deployment configuration
 */
export interface DeploymentConfig {
  /** Chain to deploy to */
  chain: SupportedChainName | Chain;
  /** RPC URL (optional, uses default if not provided) */
  rpcUrl?: string;
  /** Account/private key for deployment */
  account: Account;
}

/**
 * Deployed contracts addresses
 */
export interface DeployedContracts {
  identityRegistry?: Address;
  claimTopicsRegistry?: Address;
  trustedIssuersRegistry?: Address;
  modularCompliance?: Address;
  oracleRegistry?: Address;
  priceFeed?: Address;
  dividendDistributor?: Address;
  complianceToken?: Address;
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  contractName: string;
  address: Address;
  transactionHash: Hex;
  blockNumber: bigint;
  gasUsed: bigint;
}

/**
 * Token deployment parameters
 */
export interface TokenDeploymentParams {
  name: string;
  symbol: string;
  identityRegistryAddress: Address;
}

// Validation schemas
const AddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address');
const TokenDeploymentParamsSchema = z.object({
  name: z.string().min(1, 'Token name is required').max(64, 'Token name too long'),
  symbol: z.string().min(1, 'Token symbol is required').max(11, 'Token symbol too long'),
  identityRegistryAddress: AddressSchema,
});

/**
 * Contract Deployment Service
 */
export class DeploymentService {
  private publicClient: PublicClient;
  private walletClient: WalletClient<Transport, Chain, Account>;
  private chain: Chain;
  private deployedContracts: DeployedContracts = {};

  constructor(config: DeploymentConfig) {
    this.chain = typeof config.chain === 'string'
      ? SUPPORTED_CHAINS[config.chain]
      : config.chain;

    const rpcUrl = config.rpcUrl || this.chain.rpcUrls.default.http[0];

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(rpcUrl),
    });

    this.walletClient = createWalletClient({
      chain: this.chain,
      transport: http(rpcUrl),
      account: config.account,
    });
  }

  /**
   * Get the deployer address
   */
  getDeployerAddress(): Address {
    return this.walletClient.account.address;
  }

  /**
   * Get chain information
   */
  getChainInfo(): { id: number; name: string } {
    return {
      id: this.chain.id,
      name: this.chain.name,
    };
  }

  /**
   * Deploy a contract
   *
   * @throws ContractError if deployment fails
   */
  private async deployContract(
    contractName: keyof typeof abis,
    args: readonly unknown[] = []
  ): Promise<DeploymentResult> {
    const abi = abis[contractName];
    const bytecode = bytecodes[contractName];

    if (!bytecode || bytecode === '0x') {
      throw new ContractError(
        `Bytecode not available for ${contractName}`,
        { code: ErrorCode.INTERNAL, details: { contractName, reason: 'missing_bytecode' } }
      );
    }

    // Deploy the contract
    const hash = await this.walletClient.deployContract({
      abi: abi as readonly unknown[],
      bytecode,
      args,
    });

    // Wait for transaction receipt
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });

    if (!receipt.contractAddress) {
      throw new ContractError(
        `Contract deployment failed for ${contractName}`,
        { code: ErrorCode.TRANSACTION_FAILED, transactionHash: hash, details: { contractName } }
      );
    }

    return {
      contractName,
      address: receipt.contractAddress,
      transactionHash: hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  }

  /**
   * Deploy the core infrastructure contracts
   */
  async deployInfrastructure(adminAddress?: Address): Promise<{
    contracts: DeployedContracts;
    deployments: DeploymentResult[];
  }> {
    const admin = adminAddress || this.getDeployerAddress();
    const deployments: DeploymentResult[] = [];

    console.log(`Deploying infrastructure to ${this.chain.name}...`);

    // 1. Deploy Identity Registry
    console.log('Deploying IdentityRegistry...');
    const identityRegistry = await this.deployContract('IdentityRegistry', []);
    deployments.push(identityRegistry);
    this.deployedContracts.identityRegistry = identityRegistry.address;

    // 2. Deploy Claim Topics Registry
    console.log('Deploying ClaimTopicsRegistry...');
    const claimTopicsRegistry = await this.deployContract('ClaimTopicsRegistry', [admin]);
    deployments.push(claimTopicsRegistry);
    this.deployedContracts.claimTopicsRegistry = claimTopicsRegistry.address;

    // 3. Deploy Trusted Issuers Registry
    console.log('Deploying TrustedIssuersRegistry...');
    const trustedIssuersRegistry = await this.deployContract('TrustedIssuersRegistry', [admin]);
    deployments.push(trustedIssuersRegistry);
    this.deployedContracts.trustedIssuersRegistry = trustedIssuersRegistry.address;

    // 4. Deploy Modular Compliance
    console.log('Deploying ModularCompliance...');
    const modularCompliance = await this.deployContract('ModularCompliance', [admin]);
    deployments.push(modularCompliance);
    this.deployedContracts.modularCompliance = modularCompliance.address;

    // 5. Deploy Dividend Distributor
    console.log('Deploying DividendDistributor...');
    const dividendDistributor = await this.deployContract('DividendDistributor', [admin]);
    deployments.push(dividendDistributor);
    this.deployedContracts.dividendDistributor = dividendDistributor.address;

    console.log('Infrastructure deployment complete!');
    console.log('Deployed contracts:', this.deployedContracts);

    return {
      contracts: { ...this.deployedContracts },
      deployments,
    };
  }

  /**
   * Deploy a compliance token
   *
   * @throws ValidationError if params are invalid
   * @throws ContractError if deployment fails
   */
  async deployToken(params: TokenDeploymentParams): Promise<DeploymentResult> {
    const validation = TokenDeploymentParamsSchema.safeParse(params);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      throw new ValidationError(
        `Invalid token parameters: ${firstError.message}`,
        { field: firstError.path.join('.'), constraints: { zodError: firstError.code } }
      );
    }

    console.log(`Deploying ComplianceToken: ${params.name} (${params.symbol})...`);

    const result = await this.deployContract('ComplianceToken', [
      params.name,
      params.symbol,
      params.identityRegistryAddress,
    ]);

    this.deployedContracts.complianceToken = result.address;
    return result;
  }

  /**
   * Deploy Oracle Registry with price feed
   *
   * @throws ValidationError if addresses are invalid
   */
  async deployOracleRegistry(
    priceFeedAddress: Address,
    adminAddress?: Address
  ): Promise<DeploymentResult> {
    const feedValidation = AddressSchema.safeParse(priceFeedAddress);
    if (!feedValidation.success) {
      throw new ValidationError('Invalid price feed address', { field: 'priceFeedAddress', constraints: { format: 'address' } });
    }
    if (adminAddress) {
      const adminValidation = AddressSchema.safeParse(adminAddress);
      if (!adminValidation.success) {
        throw new ValidationError('Invalid admin address', { field: 'adminAddress', constraints: { format: 'address' } });
      }
    }

    const admin = adminAddress || this.getDeployerAddress();
    console.log('Deploying OracleRegistry...');

    const result = await this.deployContract('OracleRegistry', [admin, priceFeedAddress]);
    this.deployedContracts.oracleRegistry = result.address;

    return result;
  }

  /**
   * Deploy Chainlink Price Feed
   *
   * @throws ValidationError if address is invalid
   */
  async deployPriceFeed(chainlinkFeedAddress: Address): Promise<DeploymentResult> {
    const validation = AddressSchema.safeParse(chainlinkFeedAddress);
    if (!validation.success) {
      throw new ValidationError('Invalid Chainlink feed address', { field: 'chainlinkFeedAddress', constraints: { format: 'address' } });
    }

    console.log('Deploying ChainlinkPriceFeed...');

    const result = await this.deployContract('ChainlinkPriceFeed', [chainlinkFeedAddress]);
    this.deployedContracts.priceFeed = result.address;

    return result;
  }

  /**
   * Get deployed contracts
   */
  getDeployedContracts(): DeployedContracts {
    return { ...this.deployedContracts };
  }

  /**
   * Get contract instance for interaction
   */
  getContract<T extends keyof typeof abis>(
    contractName: T,
    address: Address
  ) {
    return getContract({
      address,
      abi: abis[contractName] as readonly unknown[],
      client: {
        public: this.publicClient,
        wallet: this.walletClient,
      },
    });
  }

  /**
   * Verify contract balance
   */
  async getBalance(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  /**
   * Get current gas price
   */
  async getGasPrice(): Promise<bigint> {
    return this.publicClient.getGasPrice();
  }

  /**
   * Estimate deployment gas
   */
  async estimateDeploymentGas(
    contractName: keyof typeof abis,
    args: readonly unknown[] = []
  ): Promise<bigint> {
    const abi = abis[contractName];
    const bytecode = bytecodes[contractName];

    return this.publicClient.estimateGas({
      account: this.walletClient.account.address,
      data: bytecode,
    });
  }
}

/**
 * Create a deployment service
 */
export function createDeploymentService(config: DeploymentConfig): DeploymentService {
  return new DeploymentService(config);
}

/**
 * Chainlink ETH/USD price feed addresses by chain ID
 */
export const CHAINLINK_ETH_USD_FEEDS: Record<number, Address> = {
  1: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // Ethereum Mainnet
  137: '0xF9680D99D6C9589e2a93a78A04A279e509205945', // Polygon
  8453: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', // Base
  42161: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', // Arbitrum
  10: '0x13e3Ee699D1909E989722E753853AE30b17e08c5', // Optimism
  11155111: '0x694AA1769357215DE4FAC081bf1f309aDC325306', // Sepolia
  84532: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1', // Base Sepolia
} as const;

export default DeploymentService;
