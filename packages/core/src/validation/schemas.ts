/**
 * SDK Input Validation Schemas
 *
 * Provides Zod schemas for validating SDK method inputs before API calls.
 */

import { z } from 'zod';

// ============================================================================
// Common Schemas
// ============================================================================

/** Ethereum address validation */
export const ethereumAddressSchema = z.string().regex(
  /^0x[a-fA-F0-9]{40}$/,
  'Invalid Ethereum address format'
);

/** UUID validation */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/** Positive integer string (for token amounts) */
export const tokenAmountSchema = z.string().regex(
  /^\d+$/,
  'Amount must be a positive integer string'
);

/** Non-empty string with max length */
export const nameSchema = z.string().min(1, 'Name is required').max(256, 'Name too long');

/** Chain ID validation */
export const chainIdSchema = z.number().int().positive('Chain ID must be a positive integer');

// ============================================================================
// Party Schemas
// ============================================================================

export const createPartySchema = z.object({
  name: nameSchema,
  type: z.enum(['individual', 'institution', 'custodian', 'agent', 'issuer']),
  roles: z.array(z.string()).optional(),
  jurisdiction: z.string().min(2).max(3),
  metadata: z.record(z.unknown()).optional(),
});

export const updatePartySchema = z.object({
  name: nameSchema.optional(),
  roles: z.array(z.string()).optional(),
  jurisdiction: z.string().min(2).max(3).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(obj => Object.keys(obj).length > 0, 'At least one field required');

export const updateKycSchema = z.object({
  verified: z.boolean(),
  expiryDate: z.string().datetime().optional(),
  verificationLevel: z.enum(['none', 'basic', 'enhanced', 'accredited']).optional(),
  accreditedInvestor: z.boolean().optional(),
});

// ============================================================================
// Asset Schemas
// ============================================================================

export const createAssetSchema = z.object({
  name: nameSchema,
  rightType: z.enum(['equity', 'debt', 'real_estate', 'commodity', 'utility', 'security', 'other']),
  issuerId: uuidSchema,
  totalSupply: tokenAmountSchema.optional(),
  decimals: z.number().int().min(0).max(18).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateAssetSchema = z.object({
  name: nameSchema.optional(),
  state: z.enum(['draft', 'active', 'frozen', 'retired']).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(obj => Object.keys(obj).length > 0, 'At least one field required');

export const transitionAssetSchema = z.object({
  toState: z.enum(['draft', 'active', 'frozen', 'retired']),
  reason: z.string().max(500).optional(),
});

// ============================================================================
// Token Operation Schemas
// ============================================================================

export const mintSchema = z.object({
  to: uuidSchema,
  amount: tokenAmountSchema,
});

export const burnSchema = z.object({
  from: uuidSchema,
  amount: tokenAmountSchema,
});

export const transferSchema = z.object({
  from: uuidSchema,
  to: uuidSchema,
  amount: tokenAmountSchema,
}).refine(data => data.from !== data.to, 'Cannot transfer to self');

// ============================================================================
// Deployment Schemas
// ============================================================================

export const createDeploymentSchema = z.object({
  assetId: uuidSchema,
  contractType: z.enum(['ERC20', 'ERC721', 'ERC1155', 'ERC3643', 'ERC1400']),
  contractAddress: ethereumAddressSchema,
  deployTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash').optional(),
  deployerAddress: ethereumAddressSchema.optional(),
  abi: z.array(z.record(z.unknown())).optional(),
});

// ============================================================================
// Event Schemas
// ============================================================================

export const createEventSchema = z.object({
  type: z.string().min(1).max(64),
  assetId: uuidSchema,
  payload: z.record(z.unknown()).optional(),
});

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const paginationSchema = z.object({
  page: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const partyQuerySchema = paginationSchema.extend({
  type: z.string().optional(),
  jurisdiction: z.string().optional(),
  search: z.string().max(100).optional(),
});

export const assetQuerySchema = paginationSchema.extend({
  state: z.string().optional(),
  rightType: z.string().optional(),
  issuerId: uuidSchema.optional(),
  search: z.string().max(100).optional(),
});

export const eventQuerySchema = paginationSchema.extend({
  assetId: uuidSchema.optional(),
  types: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  actorId: uuidSchema.optional(),
});

// ============================================================================
// Auth Schemas
// ============================================================================

export const siweNonceSchema = z.object({
  address: ethereumAddressSchema,
});

export const siweVerifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/, 'Invalid signature format'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreatePartyInput = z.infer<typeof createPartySchema>;
export type UpdatePartyInput = z.infer<typeof updatePartySchema>;
export type UpdateKycInput = z.infer<typeof updateKycSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type TransitionAssetInput = z.infer<typeof transitionAssetSchema>;
export type MintInput = z.infer<typeof mintSchema>;
export type BurnInput = z.infer<typeof burnSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
