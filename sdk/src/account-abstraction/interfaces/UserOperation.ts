/**
 * UserOperation Types (ERC-4337 v0.7)
 *
 * Defines the UserOperation structure and related types for ERC-4337
 * account abstraction. This follows the v0.7 specification with packed
 * gas fields and improved efficiency.
 *
 * @see https://eips.ethereum.org/EIPS/eip-4337
 */

/**
 * Packed UserOperation (v0.7)
 *
 * The v0.7 format packs gas limits into a single bytes32 field for efficiency.
 */
export interface PackedUserOperation {
  /** The account making the operation */
  sender: string;
  /** Anti-replay parameter; also used as salt for account creation */
  nonce: bigint;
  /** Account creation code (for deploying new accounts) */
  initCode: string;
  /** The call data to execute */
  callData: string;
  /** Packed gas limits: callGasLimit (16 bytes) + verificationGasLimit (16 bytes) */
  accountGasLimits: string;
  /** Amount of gas to allocate for the preVerification step */
  preVerificationGas: bigint;
  /** Packed gas fees: maxPriorityFeePerGas (16 bytes) + maxFeePerGas (16 bytes) */
  gasFees: string;
  /** Address of paymaster contract, or empty for self-sponsored */
  paymasterAndData: string;
  /** Signature over the userOp hash (validates the operation) */
  signature: string;
}

/**
 * Unpacked UserOperation (easier to work with)
 *
 * This is the developer-friendly format that gets packed before sending.
 */
export interface UserOperation {
  /** The account making the operation */
  sender: string;
  /** Anti-replay nonce */
  nonce: bigint;
  /** Factory address for account creation (optional) */
  factory?: string;
  /** Factory call data for account creation (optional) */
  factoryData?: string;
  /** The call data to execute */
  callData: string;
  /** Gas limit for the main execution call */
  callGasLimit: bigint;
  /** Gas limit for the verification step */
  verificationGasLimit: bigint;
  /** Gas to allocate for preVerification (covers bundler costs) */
  preVerificationGas: bigint;
  /** Maximum priority fee per gas (for miners) */
  maxPriorityFeePerGas: bigint;
  /** Maximum total fee per gas */
  maxFeePerGas: bigint;
  /** Paymaster address (optional, for sponsored transactions) */
  paymaster?: string;
  /** Gas limit for paymaster verification */
  paymasterVerificationGasLimit?: bigint;
  /** Gas limit for paymaster post-operation */
  paymasterPostOpGasLimit?: bigint;
  /** Additional data for paymaster */
  paymasterData?: string;
  /** Signature over the userOp hash */
  signature: string;
}

/**
 * UserOperation without signature (for building)
 */
export type UnsignedUserOperation = Omit<UserOperation, 'signature'>;

/**
 * Partial UserOperation for building
 */
export type PartialUserOperation = Partial<UnsignedUserOperation> & {
  sender: string;
  callData: string;
};

/**
 * UserOperation receipt returned by bundler
 */
export interface UserOperationReceipt {
  /** The hash of the UserOperation */
  userOpHash: string;
  /** Transaction hash on chain */
  transactionHash: string;
  /** Block hash containing the transaction */
  blockHash: string;
  /** Block number containing the transaction */
  blockNumber: bigint;
  /** Sender of the UserOperation */
  sender: string;
  /** Nonce used */
  nonce: bigint;
  /** Paymaster used (if any) */
  paymaster?: string;
  /** Actual gas cost */
  actualGasCost: bigint;
  /** Actual gas used */
  actualGasUsed: bigint;
  /** Whether the operation succeeded */
  success: boolean;
  /** Revert reason if failed */
  reason?: string;
  /** Logs emitted */
  logs: UserOperationLog[];
}

/**
 * Log entry from UserOperation execution
 */
export interface UserOperationLog {
  /** Log index in the transaction */
  logIndex: number;
  /** Transaction index in the block */
  transactionIndex: number;
  /** Transaction hash */
  transactionHash: string;
  /** Block hash */
  blockHash: string;
  /** Block number */
  blockNumber: bigint;
  /** Contract that emitted the log */
  address: string;
  /** Indexed log topics */
  topics: string[];
  /** Non-indexed log data */
  data: string;
}

/**
 * UserOperation by hash response
 */
export interface UserOperationByHash {
  /** The UserOperation */
  userOperation: UserOperation;
  /** Entry point address used */
  entryPoint: string;
  /** Block number (if mined) */
  blockNumber?: bigint;
  /** Block hash (if mined) */
  blockHash?: string;
  /** Transaction hash (if mined) */
  transactionHash?: string;
}

/**
 * Gas estimation for UserOperation
 */
export interface UserOperationGasEstimate {
  /** Estimated preVerificationGas */
  preVerificationGas: bigint;
  /** Estimated verificationGasLimit */
  verificationGasLimit: bigint;
  /** Estimated callGasLimit */
  callGasLimit: bigint;
  /** Estimated paymasterVerificationGasLimit */
  paymasterVerificationGasLimit?: bigint;
  /** Estimated paymasterPostOpGasLimit */
  paymasterPostOpGasLimit?: bigint;
}

/**
 * Call to execute in a UserOperation
 */
export interface UserOperationCall {
  /** Target contract address */
  to: string;
  /** Value to send (wei) */
  value: bigint;
  /** Call data */
  data: string;
}

/**
 * Batch of calls for UserOperation
 */
export type UserOperationCalls = UserOperationCall[];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Pack gas limits into bytes32 (v0.7 format)
 */
export function packAccountGasLimits(
  callGasLimit: bigint,
  verificationGasLimit: bigint
): string {
  const callGasHex = callGasLimit.toString(16).padStart(32, '0');
  const verificationGasHex = verificationGasLimit.toString(16).padStart(32, '0');
  return '0x' + verificationGasHex + callGasHex;
}

/**
 * Unpack gas limits from bytes32
 */
export function unpackAccountGasLimits(packed: string): {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
} {
  const hex = packed.startsWith('0x') ? packed.slice(2) : packed;
  const verificationGasLimit = BigInt('0x' + hex.slice(0, 32));
  const callGasLimit = BigInt('0x' + hex.slice(32, 64));
  return { callGasLimit, verificationGasLimit };
}

/**
 * Pack gas fees into bytes32 (v0.7 format)
 */
export function packGasFees(
  maxPriorityFeePerGas: bigint,
  maxFeePerGas: bigint
): string {
  const priorityFeeHex = maxPriorityFeePerGas.toString(16).padStart(32, '0');
  const maxFeeHex = maxFeePerGas.toString(16).padStart(32, '0');
  return '0x' + maxFeeHex + priorityFeeHex;
}

/**
 * Unpack gas fees from bytes32
 */
export function unpackGasFees(packed: string): {
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
} {
  const hex = packed.startsWith('0x') ? packed.slice(2) : packed;
  const maxFeePerGas = BigInt('0x' + hex.slice(0, 32));
  const maxPriorityFeePerGas = BigInt('0x' + hex.slice(32, 64));
  return { maxPriorityFeePerGas, maxFeePerGas };
}

/**
 * Pack init code from factory and factoryData
 */
export function packInitCode(factory?: string, factoryData?: string): string {
  if (!factory || factory === '0x' || factory === '0x0000000000000000000000000000000000000000') {
    return '0x';
  }
  const data = factoryData || '0x';
  const dataHex = data.startsWith('0x') ? data.slice(2) : data;
  return factory.toLowerCase() + dataHex;
}

/**
 * Unpack init code into factory and factoryData
 */
export function unpackInitCode(initCode: string): {
  factory?: string;
  factoryData?: string;
} {
  if (!initCode || initCode === '0x' || initCode.length < 42) {
    return {};
  }
  const factory = '0x' + initCode.slice(2, 42);
  const factoryData = '0x' + initCode.slice(42);
  return { factory, factoryData: factoryData === '0x' ? undefined : factoryData };
}

/**
 * Pack paymaster and data
 */
export function packPaymasterAndData(
  paymaster?: string,
  paymasterVerificationGasLimit?: bigint,
  paymasterPostOpGasLimit?: bigint,
  paymasterData?: string
): string {
  if (!paymaster || paymaster === '0x' || paymaster === '0x0000000000000000000000000000000000000000') {
    return '0x';
  }

  const verificationGas = (paymasterVerificationGasLimit || 0n).toString(16).padStart(32, '0');
  const postOpGas = (paymasterPostOpGasLimit || 0n).toString(16).padStart(32, '0');
  const data = paymasterData ? (paymasterData.startsWith('0x') ? paymasterData.slice(2) : paymasterData) : '';

  return paymaster.toLowerCase() + verificationGas + postOpGas + data;
}

/**
 * Convert UserOperation to PackedUserOperation
 */
export function packUserOperation(userOp: UserOperation): PackedUserOperation {
  return {
    sender: userOp.sender,
    nonce: userOp.nonce,
    initCode: packInitCode(userOp.factory, userOp.factoryData),
    callData: userOp.callData,
    accountGasLimits: packAccountGasLimits(userOp.callGasLimit, userOp.verificationGasLimit),
    preVerificationGas: userOp.preVerificationGas,
    gasFees: packGasFees(userOp.maxPriorityFeePerGas, userOp.maxFeePerGas),
    paymasterAndData: packPaymasterAndData(
      userOp.paymaster,
      userOp.paymasterVerificationGasLimit,
      userOp.paymasterPostOpGasLimit,
      userOp.paymasterData
    ),
    signature: userOp.signature,
  };
}

/**
 * Convert PackedUserOperation to UserOperation
 */
export function unpackUserOperation(packed: PackedUserOperation): UserOperation {
  const { factory, factoryData } = unpackInitCode(packed.initCode);
  const { callGasLimit, verificationGasLimit } = unpackAccountGasLimits(packed.accountGasLimits);
  const { maxPriorityFeePerGas, maxFeePerGas } = unpackGasFees(packed.gasFees);

  // Unpack paymaster data
  let paymaster: string | undefined;
  let paymasterVerificationGasLimit: bigint | undefined;
  let paymasterPostOpGasLimit: bigint | undefined;
  let paymasterData: string | undefined;

  if (packed.paymasterAndData && packed.paymasterAndData !== '0x' && packed.paymasterAndData.length >= 42) {
    paymaster = '0x' + packed.paymasterAndData.slice(2, 42);
    if (packed.paymasterAndData.length >= 106) {
      paymasterVerificationGasLimit = BigInt('0x' + packed.paymasterAndData.slice(42, 74));
      paymasterPostOpGasLimit = BigInt('0x' + packed.paymasterAndData.slice(74, 106));
      if (packed.paymasterAndData.length > 106) {
        paymasterData = '0x' + packed.paymasterAndData.slice(106);
      }
    }
  }

  return {
    sender: packed.sender,
    nonce: packed.nonce,
    factory,
    factoryData,
    callData: packed.callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas: packed.preVerificationGas,
    maxPriorityFeePerGas,
    maxFeePerGas,
    paymaster,
    paymasterVerificationGasLimit,
    paymasterPostOpGasLimit,
    paymasterData,
    signature: packed.signature,
  };
}
