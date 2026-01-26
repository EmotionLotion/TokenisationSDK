/**
 * Contract Adapter Validation Schemas
 *
 * Zod schemas for validating inputs to token adapter methods.
 * Ensures all parameters are valid before blockchain interactions.
 */

import { z } from 'zod';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Ethereum address validation (0x + 40 hex characters)
 */
export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
  .transform((addr) => addr.toLowerCase());

/**
 * Token amount validation (positive integer string for wei/base units)
 */
export const TokenAmountSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Amount must be a positive integer string')
  .refine((val) => {
    try {
      return BigInt(val) > 0n;
    } catch {
      return false;
    }
  }, 'Amount must be greater than zero');

/**
 * Token amount that can be zero (for approvals)
 */
export const TokenAmountOrZeroSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Amount must be a non-negative integer string');

/**
 * Token ID validation (for ERC721/1155)
 */
export const TokenIdSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Token ID must be a non-negative integer string');

/**
 * Chain ID validation
 */
export const ChainIdSchema = z
  .number()
  .int()
  .positive('Chain ID must be a positive integer');

/**
 * RPC URL validation
 */
export const RpcUrlSchema = z
  .string()
  .url('Invalid RPC URL format')
  .refine(
    (url) => url.startsWith('http://') || url.startsWith('https://') || url.startsWith('wss://'),
    'RPC URL must use http, https, or wss protocol'
  );

/**
 * Private key validation (optional, 64 hex chars without 0x, or 66 with)
 */
export const PrivateKeySchema = z
  .string()
  .regex(
    /^(0x)?[a-fA-F0-9]{64}$/,
    'Private key must be 64 hex characters (with optional 0x prefix)'
  )
  .optional();

/**
 * Bytes32 validation (for partition keys, etc.)
 */
export const Bytes32Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Must be a valid bytes32 hex string');

/**
 * URI/URL validation for token metadata
 */
export const TokenUriSchema = z
  .string()
  .min(1, 'URI cannot be empty')
  .refine(
    (uri) =>
      uri.startsWith('http://') ||
      uri.startsWith('https://') ||
      uri.startsWith('ipfs://') ||
      uri.startsWith('ar://'),
    'URI must use http, https, ipfs, or ar protocol'
  );

// ============================================================================
// ADAPTER CONFIG SCHEMAS
// ============================================================================

/**
 * Base adapter configuration
 */
export const BaseAdapterConfigSchema = z.object({
  contractAddress: EthereumAddressSchema,
  providerUrl: RpcUrlSchema,
  privateKey: PrivateKeySchema,
  chainId: ChainIdSchema,
});

/**
 * ERC20 Adapter configuration
 */
export const ERC20AdapterConfigSchema = BaseAdapterConfigSchema.extend({
  abi: z.array(z.string()).optional(),
});

/**
 * ERC721 Adapter configuration
 */
export const ERC721AdapterConfigSchema = BaseAdapterConfigSchema.extend({
  abi: z.array(z.string()).optional(),
});

/**
 * ERC1155 Adapter configuration
 */
export const ERC1155AdapterConfigSchema = BaseAdapterConfigSchema.extend({
  abi: z.array(z.string()).optional(),
});

/**
 * ERC1410 Adapter configuration
 */
export const ERC1410AdapterConfigSchema = BaseAdapterConfigSchema.extend({
  abi: z.array(z.string()).optional(),
});

/**
 * ERC4626 Adapter configuration
 */
export const ERC4626AdapterConfigSchema = BaseAdapterConfigSchema.extend({
  abi: z.array(z.string()).optional(),
});

/**
 * Soulbound Adapter configuration
 */
export const SoulboundAdapterConfigSchema = BaseAdapterConfigSchema.extend({
  abi: z.array(z.string()).optional(),
});

// ============================================================================
// METHOD PARAMETER SCHEMAS
// ============================================================================

/**
 * Mint parameters
 */
export const MintParamsSchema = z.object({
  to: EthereumAddressSchema,
  amount: TokenAmountSchema,
});

/**
 * Mint with token ID parameters (ERC721/1155)
 */
export const MintWithIdParamsSchema = z.object({
  to: EthereumAddressSchema,
  tokenId: TokenIdSchema,
  amount: TokenAmountSchema.optional(),
  uri: TokenUriSchema.optional(),
});

/**
 * Transfer parameters
 */
export const TransferParamsSchema = z.object({
  from: EthereumAddressSchema,
  to: EthereumAddressSchema,
  amount: TokenAmountSchema,
});

/**
 * Transfer with token ID parameters (ERC721/1155)
 */
export const TransferWithIdParamsSchema = z.object({
  from: EthereumAddressSchema,
  to: EthereumAddressSchema,
  tokenId: TokenIdSchema,
  amount: TokenAmountSchema.optional(),
});

/**
 * Burn parameters
 */
export const BurnParamsSchema = z.object({
  from: EthereumAddressSchema,
  amount: TokenAmountSchema,
});

/**
 * Burn with token ID parameters (ERC721/1155)
 */
export const BurnWithIdParamsSchema = z.object({
  from: EthereumAddressSchema,
  tokenId: TokenIdSchema,
  amount: TokenAmountSchema.optional(),
});

/**
 * Freeze/unfreeze parameters
 */
export const FreezeParamsSchema = z.object({
  target: EthereumAddressSchema,
});

/**
 * Approve parameters
 */
export const ApproveParamsSchema = z.object({
  spender: EthereumAddressSchema,
  amount: TokenAmountOrZeroSchema,
});

/**
 * Balance query parameters
 */
export const BalanceQuerySchema = z.object({
  address: EthereumAddressSchema,
});

/**
 * Balance with token ID query parameters
 */
export const BalanceWithIdQuerySchema = z.object({
  address: EthereumAddressSchema,
  tokenId: TokenIdSchema,
});

/**
 * Allowance query parameters
 */
export const AllowanceQuerySchema = z.object({
  owner: EthereumAddressSchema,
  spender: EthereumAddressSchema,
});

/**
 * Partition transfer parameters (ERC1410)
 */
export const PartitionTransferParamsSchema = z.object({
  partition: Bytes32Schema,
  from: EthereumAddressSchema,
  to: EthereumAddressSchema,
  amount: TokenAmountSchema,
  data: z.string().optional(),
});

/**
 * Vault deposit parameters (ERC4626)
 */
export const VaultDepositParamsSchema = z.object({
  assets: TokenAmountSchema,
  receiver: EthereumAddressSchema,
});

/**
 * Vault withdraw parameters (ERC4626)
 */
export const VaultWithdrawParamsSchema = z.object({
  assets: TokenAmountSchema,
  receiver: EthereumAddressSchema,
  owner: EthereumAddressSchema,
});

/**
 * Vault redeem parameters (ERC4626)
 */
export const VaultRedeemParamsSchema = z.object({
  shares: TokenAmountSchema,
  receiver: EthereumAddressSchema,
  owner: EthereumAddressSchema,
});

// ============================================================================
// BATCH OPERATION SCHEMAS (ERC1155)
// ============================================================================

/**
 * Batch mint parameters
 */
export const BatchMintParamsSchema = z.object({
  to: EthereumAddressSchema,
  tokenIds: z.array(TokenIdSchema).min(1, 'At least one token ID required'),
  amounts: z.array(TokenAmountSchema).min(1, 'At least one amount required'),
}).refine(
  (data) => data.tokenIds.length === data.amounts.length,
  'tokenIds and amounts arrays must have the same length'
);

/**
 * Batch transfer parameters
 */
export const BatchTransferParamsSchema = z.object({
  from: EthereumAddressSchema,
  to: EthereumAddressSchema,
  tokenIds: z.array(TokenIdSchema).min(1, 'At least one token ID required'),
  amounts: z.array(TokenAmountSchema).min(1, 'At least one amount required'),
}).refine(
  (data) => data.tokenIds.length === data.amounts.length,
  'tokenIds and amounts arrays must have the same length'
);

/**
 * Batch balance query parameters
 */
export const BatchBalanceQuerySchema = z.object({
  addresses: z.array(EthereumAddressSchema).min(1, 'At least one address required'),
  tokenIds: z.array(TokenIdSchema).min(1, 'At least one token ID required'),
}).refine(
  (data) => data.addresses.length === data.tokenIds.length,
  'addresses and tokenIds arrays must have the same length'
);

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

import { ValidationError, ErrorCode } from '../errors/index.js';

/**
 * Validate input and throw ValidationError if invalid
 */
export function validateOrThrow<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.errors[0];
    throw new ValidationError(
      `${context ? context + ': ' : ''}${firstError.message}`,
      {
        field: firstError.path.join('.'),
        constraints: Object.fromEntries(
          result.error.errors.map((e) => [e.path.join('.'), e.message])
        ),
        details: { zodErrors: result.error.errors },
      }
    );
  }

  return result.data;
}

/**
 * Validate input and return Result
 */
export function validateToResult<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.errors[0];
    return {
      success: false,
      error: new ValidationError(firstError.message, {
        field: firstError.path.join('.'),
        constraints: Object.fromEntries(
          result.error.errors.map((e) => [e.path.join('.'), e.message])
        ),
      }),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Quick address validation
 */
export function isValidAddress(address: string): boolean {
  return EthereumAddressSchema.safeParse(address).success;
}

/**
 * Quick amount validation
 */
export function isValidAmount(amount: string): boolean {
  return TokenAmountSchema.safeParse(amount).success;
}

/**
 * Quick token ID validation
 */
export function isValidTokenId(tokenId: string): boolean {
  return TokenIdSchema.safeParse(tokenId).success;
}
