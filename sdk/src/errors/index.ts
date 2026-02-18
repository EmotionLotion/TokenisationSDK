/**
 * Tokenisation SDK Error Classes
 *
 * Comprehensive error hierarchy for consistent error handling across the SDK.
 * All errors include error codes, types, and contextual details for debugging.
 *
 * @packageDocumentation
 */

// ============================================================================
// ERROR CODES
// ============================================================================

/**
 * Standard error codes used throughout the SDK.
 * Partners should handle these codes consistently.
 */
export const ErrorCode = {
  // General
  UNKNOWN: 'UNKNOWN_ERROR',
  INTERNAL: 'INTERNAL_ERROR',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  TIMEOUT: 'TIMEOUT',
  NOT_INITIALIZED: 'NOT_INITIALIZED',

  // Authentication & Authorization
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
  AUTH_FAILED: 'AUTH_FAILED',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SCHEMA_VALIDATION_FAILED: 'SCHEMA_VALIDATION_FAILED',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_STATE: 'INVALID_STATE',

  // Compliance
  COMPLIANCE_FAILED: 'COMPLIANCE_FAILED',
  KYC_REQUIRED: 'KYC_REQUIRED',
  KYC_EXPIRED: 'KYC_EXPIRED',
  JURISDICTION_BLOCKED: 'JURISDICTION_BLOCKED',
  TRANSFER_RESTRICTED: 'TRANSFER_RESTRICTED',
  INVESTOR_LIMIT_EXCEEDED: 'INVESTOR_LIMIT_EXCEEDED',
  ACCREDITATION_REQUIRED: 'ACCREDITATION_REQUIRED',

  // Contract & Blockchain
  CONTRACT_ERROR: 'CONTRACT_ERROR',
  CONTRACT_NOT_DEPLOYED: 'CONTRACT_NOT_DEPLOYED',
  CONTRACT_CALL_FAILED: 'CONTRACT_CALL_FAILED',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  TRANSACTION_REVERTED: 'TRANSACTION_REVERTED',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INSUFFICIENT_ALLOWANCE: 'INSUFFICIENT_ALLOWANCE',
  GAS_ESTIMATION_FAILED: 'GAS_ESTIMATION_FAILED',
  NONCE_TOO_LOW: 'NONCE_TOO_LOW',

  // Network
  NETWORK_ERROR: 'NETWORK_ERROR',
  RPC_ERROR: 'RPC_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',

  // Asset & Token
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  TOKEN_NOT_FOUND: 'TOKEN_NOT_FOUND',
  INVALID_TOKEN_STANDARD: 'INVALID_TOKEN_STANDARD',
  MINTING_PAUSED: 'MINTING_PAUSED',
  TRANSFER_PAUSED: 'TRANSFER_PAUSED',
  ACCOUNT_FROZEN: 'ACCOUNT_FROZEN',

  // Oracle
  ORACLE_ERROR: 'ORACLE_ERROR',
  ORACLE_STALE_DATA: 'ORACLE_STALE_DATA',
  ORACLE_UNAVAILABLE: 'ORACLE_UNAVAILABLE',

  // Storage
  STORAGE_ERROR: 'STORAGE_ERROR',
  UPLOAD_FAILED: 'UPLOAD_FAILED',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

// ============================================================================
// BASE ERROR CLASS
// ============================================================================

/**
 * Base error class for all SDK errors.
 * Provides consistent error structure with code, details, and cause tracking.
 */
export class SDKError extends Error {
  /** Machine-readable error code */
  readonly code: ErrorCodeType;

  /** Additional contextual details about the error */
  readonly details?: Record<string, unknown>;

  /** Original error that caused this error */
  readonly cause?: Error;

  /** Timestamp when the error occurred */
  readonly timestamp: string;

  /** Request ID for tracing (if available) */
  readonly requestId?: string;

  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.UNKNOWN,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
      requestId?: string;
    }
  ) {
    super(message);
    this.name = 'SDKError';
    this.code = code;
    this.details = options?.details;
    this.cause = options?.cause;
    this.requestId = options?.requestId;
    this.timestamp = new Date().toISOString();

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      requestId: this.requestId,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }

  /**
   * Check if this error matches a specific code
   */
  hasCode(code: ErrorCodeType): boolean {
    return this.code === code;
  }
}

// ============================================================================
// SPECIALIZED ERROR CLASSES
// ============================================================================

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends SDKError {
  constructor(
    message: string,
    code: ErrorCodeType = ErrorCode.UNAUTHENTICATED,
    options?: {
      details?: Record<string, unknown>;
      cause?: Error;
      requestId?: string;
    }
  ) {
    super(message, code, options);
    this.name = 'AuthenticationError';
  }
}

/**
 * Input validation errors
 */
export class ValidationError extends SDKError {
  /** Field that failed validation */
  readonly field?: string;

  /** Validation constraints that were violated */
  readonly constraints?: Record<string, string>;

  constructor(
    message: string,
    options?: {
      field?: string;
      constraints?: Record<string, string>;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, ErrorCode.VALIDATION_FAILED, {
      details: {
        ...options?.details,
        field: options?.field,
        constraints: options?.constraints,
      },
      cause: options?.cause,
    });
    this.name = 'ValidationError';
    this.field = options?.field;
    this.constraints = options?.constraints;
  }
}

// Import the existing ComplianceViolation type from core
import type { ComplianceViolation } from '../core/interfaces.js';

/**
 * Compliance check failures
 */
export class ComplianceError extends SDKError {
  /** Compliance violations that occurred */
  readonly violations: ComplianceViolation[];

  constructor(
    message: string,
    violations: ComplianceViolation[],
    options?: {
      code?: ErrorCodeType;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, options?.code || ErrorCode.COMPLIANCE_FAILED, {
      details: { ...options?.details, violations },
      cause: options?.cause,
    });
    this.name = 'ComplianceError';
    this.violations = violations;
  }
}

/**
 * Smart contract interaction errors
 */
export class ContractError extends SDKError {
  /** Contract address that was called */
  readonly contractAddress?: string;

  /** Method that was called */
  readonly method?: string;

  /** Transaction hash (if transaction was submitted) */
  readonly transactionHash?: string;

  constructor(
    message: string,
    options?: {
      code?: ErrorCodeType;
      contractAddress?: string;
      method?: string;
      transactionHash?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, options?.code || ErrorCode.CONTRACT_ERROR, {
      details: {
        ...options?.details,
        contractAddress: options?.contractAddress,
        method: options?.method,
        transactionHash: options?.transactionHash,
      },
      cause: options?.cause,
    });
    this.name = 'ContractError';
    this.contractAddress = options?.contractAddress;
    this.method = options?.method;
    this.transactionHash = options?.transactionHash;
  }
}

/**
 * Network and API communication errors
 */
export class NetworkError extends SDKError {
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;

  /** URL that was requested */
  readonly url?: string;

  constructor(
    message: string,
    options?: {
      code?: ErrorCodeType;
      statusCode?: number;
      url?: string;
      details?: Record<string, unknown>;
      cause?: Error;
      requestId?: string;
    }
  ) {
    super(message, options?.code || ErrorCode.NETWORK_ERROR, {
      details: {
        ...options?.details,
        statusCode: options?.statusCode,
        url: options?.url,
      },
      cause: options?.cause,
      requestId: options?.requestId,
    });
    this.name = 'NetworkError';
    this.statusCode = options?.statusCode;
    this.url = options?.url;
  }
}

/**
 * Oracle data errors
 */
export class OracleError extends SDKError {
  /** Oracle data feed identifier */
  readonly feedId?: string;

  /** Last known timestamp of data */
  readonly dataTimestamp?: string;

  constructor(
    message: string,
    options?: {
      code?: ErrorCodeType;
      feedId?: string;
      dataTimestamp?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, options?.code || ErrorCode.ORACLE_ERROR, {
      details: {
        ...options?.details,
        feedId: options?.feedId,
        dataTimestamp: options?.dataTimestamp,
      },
      cause: options?.cause,
    });
    this.name = 'OracleError';
    this.feedId = options?.feedId;
    this.dataTimestamp = options?.dataTimestamp;
  }
}

/**
 * Asset or token operation errors
 */
export class AssetError extends SDKError {
  /** Asset ID that was operated on */
  readonly assetId?: string;

  /** Token ID (for ERC-721/1155) */
  readonly tokenId?: string;

  constructor(
    message: string,
    options?: {
      code?: ErrorCodeType;
      assetId?: string;
      tokenId?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, options?.code || ErrorCode.ASSET_NOT_FOUND, {
      details: {
        ...options?.details,
        assetId: options?.assetId,
        tokenId: options?.tokenId,
      },
      cause: options?.cause,
    });
    this.name = 'AssetError';
    this.assetId = options?.assetId;
    this.tokenId = options?.tokenId;
  }
}

/**
 * Storage operation errors (S3, IPFS, etc.)
 */
export class StorageError extends SDKError {
  /** Storage provider identifier */
  readonly provider?: string;

  /** Key/path that was accessed */
  readonly key?: string;

  constructor(
    message: string,
    options?: {
      code?: ErrorCodeType;
      provider?: string;
      key?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, options?.code || ErrorCode.STORAGE_ERROR, {
      details: {
        ...options?.details,
        provider: options?.provider,
        key: options?.key,
      },
      cause: options?.cause,
    });
    this.name = 'StorageError';
    this.provider = options?.provider;
    this.key = options?.key;
  }
}

// ============================================================================
// ERROR UTILITIES
// ============================================================================

/**
 * Check if an error is an SDKError
 */
export function isSDKError(error: unknown): error is SDKError {
  return error instanceof SDKError;
}

/**
 * Check if an error has a specific code
 */
export function hasErrorCode(error: unknown, code: ErrorCodeType): boolean {
  return isSDKError(error) && error.code === code;
}

/**
 * Wrap any error into an SDKError
 */
export function wrapError(
  error: unknown,
  message?: string,
  code?: ErrorCodeType
): SDKError {
  if (error instanceof SDKError) {
    return error;
  }

  const cause = error instanceof Error ? error : new Error(String(error));
  return new SDKError(
    message || cause.message,
    code || ErrorCode.UNKNOWN,
    { cause }
  );
}

/**
 * Extract error message safely from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Create a user-friendly error message from an SDKError
 */
export function formatErrorForUser(error: SDKError): string {
  const messages: Record<string, string> = {
    // General
    [ErrorCode.UNKNOWN]: 'An unexpected error occurred. Please try again.',
    [ErrorCode.INTERNAL]: 'An internal error occurred. Please contact support if this persists.',
    [ErrorCode.INVALID_ARGUMENT]: 'Invalid input provided. Please check your data and try again.',
    [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
    [ErrorCode.ALREADY_EXISTS]: 'This resource already exists.',
    [ErrorCode.TIMEOUT]: 'The operation timed out. Please try again.',
    [ErrorCode.NOT_INITIALIZED]: 'The SDK has not been initialized. Please call initialize() first.',

    // Authentication & Authorization
    [ErrorCode.UNAUTHENTICATED]: 'Please sign in to continue.',
    [ErrorCode.UNAUTHORIZED]: 'You do not have permission to perform this action.',
    [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please sign in again.',
    [ErrorCode.INVALID_TOKEN]: 'Your authentication token is invalid. Please sign in again.',
    [ErrorCode.SIGNATURE_INVALID]: 'The provided signature is invalid. Please sign the message again.',
    [ErrorCode.AUTH_FAILED]: 'Authentication failed. Please check your credentials and try again.',

    // Validation
    [ErrorCode.VALIDATION_FAILED]: 'Validation failed. Please check your input and try again.',
    [ErrorCode.SCHEMA_VALIDATION_FAILED]: 'The data does not match the expected format.',
    [ErrorCode.INVALID_ADDRESS]: 'The provided wallet address is invalid.',
    [ErrorCode.INVALID_AMOUNT]: 'The provided amount is invalid.',
    [ErrorCode.INVALID_STATE]: 'This operation is not allowed in the current state.',

    // Compliance
    [ErrorCode.COMPLIANCE_FAILED]: 'This operation does not meet compliance requirements.',
    [ErrorCode.KYC_REQUIRED]: 'Identity verification is required to proceed.',
    [ErrorCode.KYC_EXPIRED]: 'Your identity verification has expired. Please re-verify your identity.',
    [ErrorCode.JURISDICTION_BLOCKED]: 'This action is not available in your region.',
    [ErrorCode.TRANSFER_RESTRICTED]: 'This transfer cannot be completed due to restrictions.',
    [ErrorCode.INVESTOR_LIMIT_EXCEEDED]: 'The maximum number of investors for this asset has been reached.',
    [ErrorCode.ACCREDITATION_REQUIRED]: 'Accredited investor status is required for this operation.',

    // Contract & Blockchain
    [ErrorCode.CONTRACT_ERROR]: 'A smart contract error occurred. Please try again.',
    [ErrorCode.CONTRACT_NOT_DEPLOYED]: 'The smart contract has not been deployed to this network.',
    [ErrorCode.CONTRACT_CALL_FAILED]: 'The smart contract call failed. Please try again.',
    [ErrorCode.TRANSACTION_FAILED]: 'The transaction failed. Please check your wallet and try again.',
    [ErrorCode.TRANSACTION_REVERTED]: 'The transaction was reverted by the network.',
    [ErrorCode.INSUFFICIENT_BALANCE]: 'Insufficient balance for this operation.',
    [ErrorCode.INSUFFICIENT_ALLOWANCE]: 'Insufficient token allowance. Please approve the required amount first.',
    [ErrorCode.GAS_ESTIMATION_FAILED]: 'Unable to estimate gas for this transaction. The transaction may fail.',
    [ErrorCode.NONCE_TOO_LOW]: 'Transaction nonce conflict. Please try again.',

    // Network
    [ErrorCode.NETWORK_ERROR]: 'Unable to connect. Please check your internet connection.',
    [ErrorCode.RPC_ERROR]: 'The blockchain network is not responding. Please try again later.',
    [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
    [ErrorCode.CIRCUIT_OPEN]: 'The service is temporarily disabled due to repeated failures. Please try again later.',

    // Asset & Token
    [ErrorCode.ASSET_NOT_FOUND]: 'The requested asset was not found.',
    [ErrorCode.TOKEN_NOT_FOUND]: 'The requested token was not found.',
    [ErrorCode.INVALID_TOKEN_STANDARD]: 'The token standard is not supported.',
    [ErrorCode.MINTING_PAUSED]: 'Token minting is currently paused.',
    [ErrorCode.TRANSFER_PAUSED]: 'Token transfers are currently paused.',
    [ErrorCode.ACCOUNT_FROZEN]: 'This account has been frozen. Please contact support.',

    // Oracle
    [ErrorCode.ORACLE_ERROR]: 'Unable to retrieve price data. Please try again.',
    [ErrorCode.ORACLE_STALE_DATA]: 'Price data is outdated. Please wait for fresh data.',
    [ErrorCode.ORACLE_UNAVAILABLE]: 'The price oracle is currently unavailable.',

    // Storage
    [ErrorCode.STORAGE_ERROR]: 'A storage error occurred. Please try again.',
    [ErrorCode.UPLOAD_FAILED]: 'File upload failed. Please try again.',
    [ErrorCode.DOWNLOAD_FAILED]: 'File download failed. Please try again.',
  };

  return messages[error.code] || error.message;
}

// ============================================================================
// RE-EXPORT EXISTING ERRORS FOR BACKWARDS COMPATIBILITY
// ============================================================================

// Note: These are re-exported from their original locations for backwards compatibility.
// New code should use the error classes defined above.
export { TokenizationError } from '../utils/http.js';
export { CircuitOpenError } from '../core/Retry.js';
export { AssetIssuanceError } from '../services/AssetIssuanceService.js';
