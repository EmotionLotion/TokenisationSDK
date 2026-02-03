/**
 * IPaymaster - Paymaster Interface
 *
 * Defines the interface for ERC-4337 paymasters.
 * Paymasters enable:
 * - Gasless transactions (sponsor pays gas)
 * - Gas payment in ERC-20 tokens
 * - Conditional sponsorship (e.g., first N transactions free)
 */

import type { Result } from '../../core/types.js';
import type {
  UserOperation,
  UnsignedUserOperation,
} from './UserOperation.js';

/**
 * Paymaster type
 */
export type PaymasterType =
  | 'verifying'   // Standard verifying paymaster with off-chain signature
  | 'token'       // Accepts ERC-20 tokens for gas payment
  | 'sponsor'     // Fully sponsors transactions
  | 'hybrid';     // Combination of sponsor and token

/**
 * Sponsorship policy result
 */
export interface SponsorshipResult {
  /** Whether sponsorship is approved */
  approved: boolean;
  /** Reason if not approved */
  reason?: string;
  /** Policy that matched */
  matchedPolicy?: string;
  /** Remaining quota (if applicable) */
  remainingQuota?: {
    count?: number;
    value?: bigint;
  };
}

/**
 * Paymaster data for UserOperation
 */
export interface PaymasterData {
  /** Paymaster address */
  paymaster: string;
  /** Paymaster verification gas limit */
  paymasterVerificationGasLimit: bigint;
  /** Paymaster post-op gas limit */
  paymasterPostOpGasLimit: bigint;
  /** Additional paymaster data (signature, etc.) */
  paymasterData: string;
}

/**
 * Token paymaster quote
 */
export interface TokenPaymasterQuote {
  /** Token address */
  token: string;
  /** Token amount required */
  amount: bigint;
  /** Exchange rate used */
  exchangeRate: string;
  /** Quote expiry timestamp */
  expiresAt: number;
  /** Quote signature (if required) */
  signature?: string;
}

/**
 * IPaymaster - Paymaster Interface
 *
 * @example
 * ```typescript
 * const paymaster = new VerifyingPaymaster({
 *   chainId: 8453,
 *   paymasterAddress: '0x...',
 *   sponsorApiKey: 'YOUR_API_KEY',
 * });
 *
 * // Check if operation will be sponsored
 * const sponsorship = await paymaster.checkSponsorship(userOp);
 *
 * if (sponsorship.success && sponsorship.value.approved) {
 *   // Get paymaster data to include in UserOp
 *   const pmData = await paymaster.getPaymasterData(userOp);
 *   userOp.paymaster = pmData.paymaster;
 *   userOp.paymasterData = pmData.paymasterData;
 * }
 * ```
 */
export interface IPaymaster {
  // ============================================================================
  // PAYMASTER INFO
  // ============================================================================

  /** Paymaster type */
  readonly type: PaymasterType;

  /** Paymaster contract address */
  readonly address: string;

  /** Chain ID */
  readonly chainId: number;

  /**
   * Get supported tokens (for token paymasters)
   */
  getSupportedTokens(): Promise<string[]>;

  /**
   * Check if paymaster is active
   */
  isActive(): Promise<boolean>;

  /**
   * Get paymaster deposit balance
   */
  getDeposit(): Promise<bigint>;

  // ============================================================================
  // SPONSORSHIP
  // ============================================================================

  /**
   * Check if a UserOperation will be sponsored
   *
   * @param userOp - The UserOperation to check
   * @param sender - The sender address
   */
  checkSponsorship(
    userOp: UnsignedUserOperation,
    sender?: string
  ): Promise<Result<SponsorshipResult, string>>;

  /**
   * Get paymaster data to include in UserOperation
   *
   * This generates the paymaster signature and gas limits.
   *
   * @param userOp - The unsigned UserOperation
   */
  getPaymasterData(userOp: UnsignedUserOperation): Promise<Result<PaymasterData, string>>;

  /**
   * Sponsor a UserOperation (convenience method)
   *
   * Combines checkSponsorship and getPaymasterData, returning the
   * updated UserOperation with paymaster fields populated.
   */
  sponsorUserOperation(
    userOp: UnsignedUserOperation
  ): Promise<Result<UnsignedUserOperation, string>>;

  // ============================================================================
  // TOKEN PAYMENT (for token paymasters)
  // ============================================================================

  /**
   * Get a quote for paying gas in tokens
   *
   * @param userOp - The UserOperation
   * @param token - The token to pay with
   */
  getTokenQuote?(
    userOp: UnsignedUserOperation,
    token: string
  ): Promise<Result<TokenPaymasterQuote, string>>;

  /**
   * Get paymaster data for token payment
   *
   * @param userOp - The UserOperation
   * @param quote - The token quote to use
   */
  getTokenPaymasterData?(
    userOp: UnsignedUserOperation,
    quote: TokenPaymasterQuote
  ): Promise<Result<PaymasterData, string>>;

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Estimate gas overhead for this paymaster
   */
  estimateGasOverhead(): Promise<{
    verificationGasLimit: bigint;
    postOpGasLimit: bigint;
  }>;

  /**
   * Validate paymaster data locally
   */
  validatePaymasterData(
    userOp: UserOperation
  ): Promise<Result<void, string>>;
}

/**
 * Verifying paymaster configuration
 */
export interface VerifyingPaymasterConfig {
  /** Chain ID */
  chainId: number;
  /** Paymaster contract address */
  paymasterAddress: string;
  /** API key for sponsor service */
  sponsorApiKey?: string;
  /** Sponsor API URL */
  sponsorApiUrl?: string;
  /** Signing key for self-hosted paymasters */
  signingKey?: string;
  /** Valid until offset (seconds from now) */
  validUntilOffset?: number;
  /** Valid after offset (seconds from now) */
  validAfterOffset?: number;
}

/**
 * Token paymaster configuration
 */
export interface TokenPaymasterConfig {
  /** Chain ID */
  chainId: number;
  /** Paymaster contract address */
  paymasterAddress: string;
  /** Oracle address for price feeds */
  oracleAddress?: string;
  /** Supported tokens */
  supportedTokens: string[];
  /** Markup percentage (e.g., 5 for 5%) */
  markupPercent?: number;
}

/**
 * Sponsor paymaster configuration
 */
export interface SponsorPaymasterConfig {
  /** Chain ID */
  chainId: number;
  /** Paymaster contract address */
  paymasterAddress: string;
  /** API key for sponsor service */
  apiKey: string;
  /** API URL for sponsor service */
  apiUrl?: string;
  /** Sponsorship policies */
  policies?: SponsorshipPolicy[];
}

/**
 * Sponsorship policy
 */
export interface SponsorshipPolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Policy type */
  type: 'all' | 'whitelist' | 'contract' | 'quota';
  /** Whitelisted addresses (for whitelist type) */
  whitelist?: string[];
  /** Allowed contracts (for contract type) */
  contracts?: string[];
  /** Quota limits (for quota type) */
  quota?: {
    maxTransactionsPerDay?: number;
    maxValuePerDay?: bigint;
    maxTransactionsPerUser?: number;
    maxValuePerUser?: bigint;
  };
  /** Whether policy is active */
  isActive: boolean;
  /** Policy priority (lower = higher priority) */
  priority: number;
}
