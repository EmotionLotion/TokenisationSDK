/**
 * ERC1410Adapter - Partially Fungible Token Adapter
 *
 * Implements ERC-1410 standard for partitioned securities.
 * Supports share tranches, lock-up periods, and regulatory partitions.
 *
 * Use Cases:
 * - Securities with different share classes (Class A, Class B)
 * - Lock-up periods for early investors
 * - Regulatory partitions (US vs non-US holders)
 * - Vesting schedules
 */

import { ethers } from 'ethers';
import type {
  ITokenAdapter,
  TokenInfo,
  TransactionReceipt,
} from '../../core/interfaces.js';
import type { Result } from '../../core/types.js';
import { ok, err } from '../../core/types.js';
import { ContractError, ValidationError, ErrorCode } from '../../errors/index.js';
import {
  ERC1410AdapterConfigSchema,
  EthereumAddressSchema,
  TokenAmountSchema,
  Bytes32Schema,
  validateOrThrow,
} from '../validation.js';

/**
 * ERC-1410 Partially Fungible Token ABI
 */
const ERC1410_ABI = [
  // ERC-1410 Core
  'function balanceOf(address tokenHolder) view returns (uint256)',
  'function balanceOfByPartition(bytes32 partition, address tokenHolder) view returns (uint256)',
  'function partitionsOf(address tokenHolder) view returns (bytes32[])',
  'function totalSupply() view returns (uint256)',
  'function totalSupplyByPartition(bytes32 partition) view returns (uint256)',

  // Transfers
  'function transferByPartition(bytes32 partition, address to, uint256 value, bytes data) returns (bytes32)',
  'function operatorTransferByPartition(bytes32 partition, address from, address to, uint256 value, bytes data, bytes operatorData) returns (bytes32)',
  'function canTransferByPartition(address from, address to, bytes32 partition, uint256 value, bytes data) view returns (bytes1, bytes32, bytes32)',

  // Operators
  'function authorizeOperator(address operator)',
  'function revokeOperator(address operator)',
  'function authorizeOperatorByPartition(bytes32 partition, address operator)',
  'function revokeOperatorByPartition(bytes32 partition, address operator)',
  'function isOperator(address operator, address tokenHolder) view returns (bool)',
  'function isOperatorForPartition(bytes32 partition, address operator, address tokenHolder) view returns (bool)',

  // Issuance
  'function issueByPartition(bytes32 partition, address tokenHolder, uint256 value, bytes data)',
  'function redeemByPartition(bytes32 partition, uint256 value, bytes data)',
  'function operatorRedeemByPartition(bytes32 partition, address tokenHolder, uint256 value, bytes operatorData)',

  // Token Info
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function granularity() view returns (uint256)',

  // Controller (issuer capabilities)
  'function isControllable() view returns (bool)',
  'function controllerTransfer(address from, address to, uint256 value, bytes data, bytes operatorData)',
  'function controllerRedeem(address tokenHolder, uint256 value, bytes data, bytes operatorData)',

  // Events
  'event TransferByPartition(bytes32 indexed fromPartition, address operator, address indexed from, address indexed to, uint256 value, bytes data, bytes operatorData)',
  'event IssuedByPartition(bytes32 indexed partition, address indexed operator, address indexed to, uint256 value, bytes data, bytes operatorData)',
  'event RedeemedByPartition(bytes32 indexed partition, address indexed operator, address indexed from, uint256 value, bytes operatorData)',
  'event AuthorizedOperatorByPartition(bytes32 indexed partition, address indexed operator, address indexed tokenHolder)',
  'event RevokedOperatorByPartition(bytes32 indexed partition, address indexed operator, address indexed tokenHolder)',
];

/**
 * Partition status
 */
export interface PartitionInfo {
  /** Partition identifier (bytes32 hash) */
  partition: string;

  /** Human-readable name */
  name: string;

  /** Total supply in partition */
  totalSupply: string;

  /** Is partition locked */
  isLocked: boolean;

  /** Lock end time (if applicable) */
  lockEndTime?: string;

  /** Partition metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Transfer result with partition info
 */
export interface PartitionTransferResult {
  /** Transaction receipt */
  receipt: TransactionReceipt;

  /** Source partition */
  fromPartition: string;

  /** Destination partition (may differ due to rules) */
  toPartition: string;
}

/**
 * Transfer check result
 */
export interface TransferCheckResult {
  /** Can transfer proceed */
  canTransfer: boolean;

  /** ERC-1066 status code */
  statusCode: string;

  /** Application-specific code */
  appCode: string;

  /** Human-readable reason */
  reason?: string;
}

/**
 * ERC1410 Adapter configuration
 */
export interface ERC1410AdapterConfig {
  /** Contract address */
  contractAddress: string;

  /** JSON-RPC provider URL */
  providerUrl: string;

  /** Private key for signing transactions (optional for read-only) */
  privateKey?: string;

  /** Chain ID */
  chainId: number;

  /** Custom ABI (if different from standard) */
  abi?: string[];

  /** Predefined partitions */
  partitions?: {
    name: string;
    bytes32: string;
  }[];
}

/**
 * Standard partition names (as bytes32)
 */
export const STANDARD_PARTITIONS = {
  DEFAULT: ethers.id('default'),
  LOCKED: ethers.id('locked'),
  VESTING: ethers.id('vesting'),
  CLASS_A: ethers.id('class_a'),
  CLASS_B: ethers.id('class_b'),
  CLASS_C: ethers.id('class_c'),
  FOUNDERS: ethers.id('founders'),
  EMPLOYEES: ethers.id('employees'),
  INVESTORS: ethers.id('investors'),
  ACCREDITED: ethers.id('accredited'),
  RETAIL: ethers.id('retail'),
  US_PERSONS: ethers.id('us_persons'),
  NON_US: ethers.id('non_us'),
  TRANCHE_1: ethers.id('tranche_1'),
  TRANCHE_2: ethers.id('tranche_2'),
  TRANCHE_3: ethers.id('tranche_3'),
};

/**
 * ERC1410Adapter implementation
 */
export class ERC1410Adapter implements ITokenAdapter {
  readonly pluginId: string;
  readonly tokenInfo: TokenInfo;

  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private signer: ethers.Wallet | null = null;
  private partitionNames: Map<string, string> = new Map();

  private constructor(
    pluginId: string,
    tokenInfo: TokenInfo,
    provider: ethers.JsonRpcProvider,
    contract: ethers.Contract,
    signer: ethers.Wallet | null,
    partitionNames: Map<string, string>
  ) {
    this.pluginId = pluginId;
    this.tokenInfo = tokenInfo;
    this.provider = provider;
    this.contract = contract;
    this.signer = signer;
    this.partitionNames = partitionNames;
  }

  /**
   * Create and initialize an ERC1410Adapter
   *
   * @param config - Adapter configuration
   * @returns Initialized ERC1410Adapter
   * @throws ValidationError if config is invalid
   * @throws ContractError if contract initialization fails
   */
  static async create(config: ERC1410AdapterConfig): Promise<ERC1410Adapter> {
    // Validate configuration
    const validatedConfig = validateOrThrow(
      ERC1410AdapterConfigSchema,
      config,
      'ERC1410Adapter config'
    );

    const provider = new ethers.JsonRpcProvider(validatedConfig.providerUrl);
    const abi = validatedConfig.abi || ERC1410_ABI;

    try {
      let signer: ethers.Wallet | null = null;
      let contract: ethers.Contract;

      if (validatedConfig.privateKey) {
        signer = new ethers.Wallet(validatedConfig.privateKey, provider);
        contract = new ethers.Contract(validatedConfig.contractAddress, abi, signer);
      } else {
        contract = new ethers.Contract(validatedConfig.contractAddress, abi, provider);
      }

      // Fetch token info
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        contract.name() as Promise<string>,
        contract.symbol() as Promise<string>,
        contract.decimals() as Promise<number>,
        contract.totalSupply() as Promise<bigint>,
      ]);

      const tokenInfo: TokenInfo = {
        address: validatedConfig.contractAddress,
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: totalSupply.toString(),
        tokenType: 'ERC1410',
      };

      // Build partition name map
      const partitionNames = new Map<string, string>();
      Object.entries(STANDARD_PARTITIONS).forEach(([name, hash]) => {
        partitionNames.set(hash, name);
      });
      config.partitions?.forEach((p) => {
        partitionNames.set(p.bytes32, p.name);
      });

      const pluginId = `erc1410-${validatedConfig.contractAddress.toLowerCase().slice(0, 8)}`;

      return new ERC1410Adapter(pluginId, tokenInfo, provider, contract, signer, partitionNames);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ContractError(
        `Failed to initialize ERC1410 adapter: ${error instanceof Error ? error.message : String(error)}`,
        {
          code: ErrorCode.CONTRACT_NOT_DEPLOYED,
          contractAddress: validatedConfig.contractAddress,
          method: 'create',
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  // ============================================================================
  // ITokenAdapter Implementation
  // ============================================================================

  /**
   * Mint tokens (issues to default partition)
   */
  async mint(
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    return this.issueByPartition(STANDARD_PARTITIONS.DEFAULT, to, amount);
  }

  /**
   * Transfer tokens (from default partition)
   */
  async transfer(
    from: string,
    to: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    return this.transferByPartition(STANDARD_PARTITIONS.DEFAULT, from, to, amount);
  }

  /**
   * Burn tokens (redeem from default partition)
   */
  async burn(
    from: string,
    amount: string
  ): Promise<Result<TransactionReceipt, string>> {
    return this.redeemByPartition(STANDARD_PARTITIONS.DEFAULT, from, amount);
  }

  /**
   * Freeze not directly supported in ERC-1410
   * Use partition-based restrictions instead
   */
  async freeze(_target: string): Promise<Result<TransactionReceipt, string>> {
    return err('ERC-1410 uses partition-based restrictions instead of account freezing');
  }

  /**
   * Unfreeze not directly supported in ERC-1410
   */
  async unfreeze(_target: string): Promise<Result<TransactionReceipt, string>> {
    return err('ERC-1410 uses partition-based restrictions instead of account freezing');
  }

  /**
   * Get total balance across all partitions
   */
  async balanceOf(address: string): Promise<string> {
    const balance = (await this.contract.balanceOf(address)) as bigint;
    return balance.toString();
  }

  /**
   * Check if address is frozen (ERC-1410 doesn't have native freeze)
   * Returns false as ERC-1410 uses partition-based restrictions
   */
  async isFrozen(_address: string): Promise<boolean> {
    // ERC-1410 uses partitions for access control, not account freezing
    return false;
  }

  // ============================================================================
  // ERC-1410 Specific Methods
  // ============================================================================

  /**
   * Get balance in a specific partition
   */
  async balanceOfByPartition(partition: string, address: string): Promise<string> {
    const balance = (await this.contract.balanceOfByPartition(partition, address)) as bigint;
    return balance.toString();
  }

  /**
   * Get all partitions for a holder
   */
  async partitionsOf(address: string): Promise<string[]> {
    return (await this.contract.partitionsOf(address)) as string[];
  }

  /**
   * Get detailed partition info for a holder
   */
  async getPartitionDetails(address: string): Promise<PartitionInfo[]> {
    const partitions = await this.partitionsOf(address);
    const details: PartitionInfo[] = [];

    for (const partition of partitions) {
      const balance = await this.balanceOfByPartition(partition, address);
      const totalSupply = (await this.contract.totalSupplyByPartition(partition)) as bigint;

      details.push({
        partition,
        name: this.partitionNames.get(partition) || 'Unknown',
        totalSupply: totalSupply.toString(),
        isLocked: partition === STANDARD_PARTITIONS.LOCKED,
      });
    }

    return details;
  }

  /**
   * Issue tokens to a specific partition
   */
  async issueByPartition(
    partition: string,
    to: string,
    amount: string,
    data: string = '0x'
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot issue');
    }

    try {
      const tx = await this.contract.issueByPartition(partition, to, amount, data);
      const receipt = await tx.wait();

      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Issue by partition failed: ${error}`);
    }
  }

  /**
   * Transfer tokens within a partition
   */
  async transferByPartition(
    partition: string,
    from: string,
    to: string,
    amount: string,
    data: string = '0x'
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot transfer');
    }

    try {
      const signerAddress = await this.signer.getAddress();

      let tx;
      if (from.toLowerCase() === signerAddress.toLowerCase()) {
        tx = await this.contract.transferByPartition(partition, to, amount, data);
      } else {
        // Operator transfer
        tx = await this.contract.operatorTransferByPartition(
          partition,
          from,
          to,
          amount,
          data,
          '0x'
        );
      }

      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Transfer by partition failed: ${error}`);
    }
  }

  /**
   * Redeem (burn) tokens from a partition
   */
  async redeemByPartition(
    partition: string,
    holder: string,
    amount: string,
    data: string = '0x'
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot redeem');
    }

    try {
      const signerAddress = await this.signer.getAddress();

      let tx;
      if (holder.toLowerCase() === signerAddress.toLowerCase()) {
        tx = await this.contract.redeemByPartition(partition, amount, data);
      } else {
        tx = await this.contract.operatorRedeemByPartition(partition, holder, amount, data);
      }

      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Redeem by partition failed: ${error}`);
    }
  }

  /**
   * Check if a transfer can proceed
   */
  async canTransferByPartition(
    from: string,
    to: string,
    partition: string,
    amount: string,
    data: string = '0x'
  ): Promise<TransferCheckResult> {
    try {
      const [statusCode, appCode, destinationPartition] =
        (await this.contract.canTransferByPartition(from, to, partition, amount, data)) as [
          string,
          string,
          string
        ];

      const canTransfer = statusCode === '0x51' || statusCode === '0x01';

      return {
        canTransfer,
        statusCode,
        appCode,
        reason: this.getStatusReason(statusCode),
      };
    } catch (error) {
      return {
        canTransfer: false,
        statusCode: '0x50',
        appCode: '0x00',
        reason: `Check failed: ${error}`,
      };
    }
  }

  /**
   * Authorize an operator for all partitions
   */
  async authorizeOperator(operator: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot authorize operator');
    }

    try {
      const tx = await this.contract.authorizeOperator(operator);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Authorize operator failed: ${error}`);
    }
  }

  /**
   * Revoke an operator for all partitions
   */
  async revokeOperator(operator: string): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot revoke operator');
    }

    try {
      const tx = await this.contract.revokeOperator(operator);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Revoke operator failed: ${error}`);
    }
  }

  /**
   * Authorize an operator for a specific partition
   */
  async authorizeOperatorByPartition(
    partition: string,
    operator: string
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot authorize operator');
    }

    try {
      const tx = await this.contract.authorizeOperatorByPartition(partition, operator);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Authorize operator by partition failed: ${error}`);
    }
  }

  /**
   * Check if address is an operator for holder
   */
  async isOperator(operator: string, holder: string): Promise<boolean> {
    return (await this.contract.isOperator(operator, holder)) as boolean;
  }

  /**
   * Check if address is an operator for a specific partition
   */
  async isOperatorForPartition(
    partition: string,
    operator: string,
    holder: string
  ): Promise<boolean> {
    return (await this.contract.isOperatorForPartition(partition, operator, holder)) as boolean;
  }

  /**
   * Controller transfer (issuer forced transfer)
   */
  async controllerTransfer(
    from: string,
    to: string,
    amount: string,
    data: string = '0x',
    operatorData: string = '0x'
  ): Promise<Result<TransactionReceipt, string>> {
    if (!this.signer) {
      return err('No signer configured - cannot perform controller transfer');
    }

    try {
      const isControllable = await this.contract.isControllable();
      if (!isControllable) {
        return err('Token is not controllable');
      }

      const tx = await this.contract.controllerTransfer(from, to, amount, data, operatorData);
      const receipt = await tx.wait();
      return ok(this.formatReceipt(receipt));
    } catch (error) {
      return err(`Controller transfer failed: ${error}`);
    }
  }

  /**
   * Get total supply by partition
   */
  async totalSupplyByPartition(partition: string): Promise<string> {
    const supply = (await this.contract.totalSupplyByPartition(partition)) as bigint;
    return supply.toString();
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Create a partition identifier from a name
   */
  static createPartitionId(name: string): string {
    return ethers.id(name);
  }

  /**
   * Get human-readable status reason
   */
  private getStatusReason(statusCode: string): string {
    const reasons: Record<string, string> = {
      '0x50': 'Transfer failed',
      '0x51': 'Transfer successful',
      '0x52': 'Insufficient balance',
      '0x53': 'Insufficient allowance',
      '0x54': 'Transfers halted',
      '0x55': 'Funds locked (lockup period)',
      '0x56': 'Invalid sender',
      '0x57': 'Invalid receiver',
      '0x58': 'Invalid operator',
    };
    return reasons[statusCode] || 'Unknown status';
  }

  /**
   * Format ethers receipt to our format
   */
  private formatReceipt(receipt: ethers.TransactionReceipt): TransactionReceipt {
    return {
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status === 1 ? 'SUCCESS' : 'REVERTED',
      gasUsed: receipt.gasUsed.toString(),
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics as string[],
        data: log.data,
        logIndex: log.index,
      })),
    };
  }

  /**
   * Get the provider
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get the contract
   */
  getContract(): ethers.Contract {
    return this.contract;
  }
}
