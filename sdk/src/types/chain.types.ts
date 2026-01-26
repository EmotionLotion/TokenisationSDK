/**
 * Blockchain/Chain Type Definitions
 *
 * Types for smart contract interactions and blockchain operations.
 * Compatible with viem and ethers.js patterns.
 */

// ============================================================================
// ABI TYPES
// ============================================================================

/**
 * ABI input/output parameter type
 */
export interface ABIParameter {
  name: string;
  type: string;
  indexed?: boolean;
  components?: ABIParameter[];
  internalType?: string;
}

/**
 * ABI function fragment
 */
export interface ABIFunction {
  type: 'function';
  name: string;
  inputs: ABIParameter[];
  outputs: ABIParameter[];
  stateMutability: 'pure' | 'view' | 'nonpayable' | 'payable';
}

/**
 * ABI event fragment
 */
export interface ABIEvent {
  type: 'event';
  name: string;
  inputs: ABIParameter[];
  anonymous?: boolean;
}

/**
 * ABI error fragment
 */
export interface ABIError {
  type: 'error';
  name: string;
  inputs: ABIParameter[];
}

/**
 * ABI constructor fragment
 */
export interface ABIConstructor {
  type: 'constructor';
  inputs: ABIParameter[];
  stateMutability: 'nonpayable' | 'payable';
}

/**
 * ABI fallback fragment
 */
export interface ABIFallback {
  type: 'fallback';
  stateMutability: 'nonpayable' | 'payable';
}

/**
 * ABI receive fragment
 */
export interface ABIReceive {
  type: 'receive';
  stateMutability: 'payable';
}

/**
 * Single ABI fragment (any type)
 */
export type ABIFragment =
  | ABIFunction
  | ABIEvent
  | ABIError
  | ABIConstructor
  | ABIFallback
  | ABIReceive;

/**
 * Complete contract ABI
 */
export type ContractABI = readonly ABIFragment[];

// ============================================================================
// CONTRACT FUNCTION TYPES
// ============================================================================

/**
 * Primitive Solidity types mapped to TypeScript
 */
export type SolidityPrimitive =
  | bigint        // uint*, int*
  | string        // string, bytes*, address
  | boolean       // bool
  | `0x${string}`; // address, bytes*

/**
 * Contract function arguments (typed tuple)
 */
export type ContractFunctionArgs<
  TAbi extends ContractABI = ContractABI,
  TFunctionName extends string = string
> = TAbi extends readonly (infer TFragment)[]
  ? TFragment extends ABIFunction
    ? TFragment['name'] extends TFunctionName
      ? readonly SolidityPrimitive[]
      : never
    : never
  : readonly unknown[];

/**
 * Contract function result type
 */
export type ContractFunctionResult<
  TAbi extends ContractABI = ContractABI,
  TFunctionName extends string = string
> = TAbi extends readonly (infer TFragment)[]
  ? TFragment extends ABIFunction
    ? TFragment['name'] extends TFunctionName
      ? TFragment['outputs'] extends readonly []
        ? void
        : TFragment['outputs'] extends readonly [infer TOutput]
        ? TOutput extends ABIParameter
          ? SolidityPrimitive
          : unknown
        : readonly SolidityPrimitive[]
      : never
    : never
  : unknown;

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Ethereum address type
 */
export type Address = `0x${string}`;

/**
 * Transaction hash type
 */
export type TransactionHash = `0x${string}`;

/**
 * Block number or tag
 */
export type BlockTag = bigint | 'latest' | 'pending' | 'earliest' | 'safe' | 'finalized';

/**
 * Transaction request
 */
export interface TransactionRequest {
  to?: Address;
  from?: Address;
  data?: `0x${string}`;
  value?: bigint;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId?: number;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  transactionHash: TransactionHash;
  blockNumber: bigint;
  blockHash: `0x${string}`;
  from: Address;
  to: Address | null;
  contractAddress: Address | null;
  status: 'success' | 'reverted';
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: readonly TransactionLog[];
}

/**
 * Transaction log entry
 */
export interface TransactionLog {
  address: Address;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
  blockNumber: bigint;
  transactionHash: TransactionHash;
  logIndex: number;
}

// ============================================================================
// CONTRACT INTERACTION TYPES
// ============================================================================

/**
 * Read contract options
 */
export interface ReadContractOptions<
  TAbi extends ContractABI = ContractABI,
  TFunctionName extends string = string
> {
  address: Address;
  abi: TAbi;
  functionName: TFunctionName;
  args?: ContractFunctionArgs<TAbi, TFunctionName>;
  blockTag?: BlockTag;
}

/**
 * Write contract options
 */
export interface WriteContractOptions<
  TAbi extends ContractABI = ContractABI,
  TFunctionName extends string = string
> extends ReadContractOptions<TAbi, TFunctionName> {
  value?: bigint;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
}

/**
 * Contract event filter
 */
export interface EventFilter<
  TAbi extends ContractABI = ContractABI,
  TEventName extends string = string
> {
  address?: Address;
  abi: TAbi;
  eventName: TEventName;
  args?: Record<string, unknown>;
  fromBlock?: BlockTag;
  toBlock?: BlockTag;
}

// ============================================================================
// CHAIN CONFIGURATION
// ============================================================================

/**
 * Chain configuration
 */
export interface ChainConfig {
  id: number;
  name: string;
  rpcUrl: string;
  blockExplorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  contracts?: {
    [name: string]: Address;
  };
}

/**
 * Supported chain IDs
 */
export type SupportedChainId = 1 | 5 | 137 | 80001 | 42161 | 421613 | 8453 | 84532;

/**
 * Chain name type
 */
export type ChainName =
  | 'mainnet'
  | 'goerli'
  | 'polygon'
  | 'mumbai'
  | 'arbitrum'
  | 'arbitrum-goerli'
  | 'base'
  | 'base-goerli';
