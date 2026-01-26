/**
 * SDK Module Validation Schemas
 *
 * Comprehensive Zod schemas for validating all SDK module inputs.
 * These schemas ensure data integrity before API calls and provide
 * clear error messages for invalid inputs.
 */

import { z } from 'zod';

// ============================================================================
// BASE SCHEMAS
// ============================================================================

/**
 * Ethereum address validation with EIP-55 checksum support
 */
export const EthereumAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
  .transform((addr) => addr.toLowerCase());

/**
 * UUID validation
 */
export const UUIDSchema = z.string().uuid('Invalid UUID format');

/**
 * Token amount validation (positive integer string for wei/base units)
 */
export const TokenAmountSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Amount must be a positive integer string (no decimals)')
  .refine((val) => BigInt(val) > 0n, 'Amount must be greater than zero');

/**
 * Token amount that can be zero
 */
export const TokenAmountOrZeroSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Amount must be a non-negative integer string');

/**
 * ISO 3166-1 alpha-2 country code
 */
export const CountryCodeSchema = z
  .string()
  .length(2, 'Country code must be 2 characters')
  .regex(/^[A-Z]{2}$/, 'Country code must be uppercase letters (e.g., US, AE, GB)');

/**
 * Chain ID validation
 */
export const ChainIdSchema = z
  .number()
  .int('Chain ID must be an integer')
  .positive('Chain ID must be positive');

/**
 * Email validation
 */
export const EmailSchema = z.string().email('Invalid email format');

/**
 * Pagination parameters
 */
export const PaginationSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

/**
 * Metadata schema (any JSON object)
 */
export const MetadataSchema = z.record(z.unknown()).optional();

// ============================================================================
// ASSETS MODULE SCHEMAS
// ============================================================================

export const RightTypeSchema = z.enum([
  'OWNERSHIP',
  'ACCESS',
  'BEHAVIOR',
  'VERIFICATION',
]);

export const AssetStateSchema = z.enum([
  'DRAFT',
  'PENDING_VERIFICATION',
  'VERIFIED',
  'ACTIVE',
  'FROZEN',
  'REDEEMED',
  'EXPIRED',
  'BURNED',
]);

export const CreateAssetInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Asset name is required')
    .max(256, 'Asset name must be 256 characters or less'),
  description: z.string().max(2000, 'Description must be 2000 characters or less').optional(),
  rightType: RightTypeSchema,
  jurisdiction: z.object({
    countryCode: CountryCodeSchema,
    regulatoryFramework: z.string().max(100).optional(),
    restrictions: z.array(z.string()).optional(),
  }),
  metadata: MetadataSchema,
  projectId: UUIDSchema.optional(),
});

export const UpdateAssetInputSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  description: z.string().max(2000).optional(),
  state: AssetStateSchema.optional(),
  metadata: MetadataSchema,
});

export const ListAssetsParamsSchema = PaginationSchema.extend({
  state: AssetStateSchema.optional(),
  rightType: RightTypeSchema.optional(),
  jurisdiction: CountryCodeSchema.optional(),
  projectId: UUIDSchema.optional(),
});

export const UpdateValuationInputSchema = z.object({
  value: z.string().regex(/^[0-9]+(\.[0-9]+)?$/, 'Value must be a valid number'),
  currency: z.string().length(3, 'Currency must be 3-letter ISO code'),
  source: z.string().min(1, 'Valuation source is required'),
  attestation: z.string().optional(),
});

// ============================================================================
// TOKENS MODULE SCHEMAS
// ============================================================================

export const TokenStatusSchema = z.enum([
  'draft',
  'deploying',
  'deployed',
  'paused',
  'frozen',
  'deprecated',
]);

export const CreateTokenInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Token name is required')
    .max(64, 'Token name must be 64 characters or less'),
  symbol: z
    .string()
    .min(1, 'Token symbol is required')
    .max(11, 'Token symbol must be 11 characters or less')
    .regex(/^[A-Z0-9]+$/, 'Token symbol must be uppercase alphanumeric'),
  decimals: z.number().int().min(0).max(18).optional().default(18),
  maxSupply: TokenAmountOrZeroSchema.optional(),
  projectId: UUIDSchema.optional(),
  assetId: UUIDSchema.optional(),
  chainId: ChainIdSchema,
  policyId: UUIDSchema.optional(),
  metadata: MetadataSchema,
});

export const UpdateTokenInputSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  metadata: MetadataSchema,
});

export const ListTokensParamsSchema = PaginationSchema.extend({
  status: TokenStatusSchema.optional(),
  chainId: ChainIdSchema.optional(),
  projectId: UUIDSchema.optional(),
  assetId: UUIDSchema.optional(),
});

export const DeployTokenInputSchema = z.object({
  chainId: ChainIdSchema.optional(),
  identityRegistryAddress: EthereumAddressSchema.optional(),
  complianceAddress: EthereumAddressSchema.optional(),
  deployerAddress: EthereumAddressSchema.optional(),
});

export const IssueTokensInputSchema = z.object({
  investorId: UUIDSchema,
  walletAddress: EthereumAddressSchema,
  amount: TokenAmountSchema,
  trancheId: UUIDSchema.optional(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required for token issuance'),
  metadata: MetadataSchema,
});

export const RedeemTokensInputSchema = z.object({
  investorId: UUIDSchema,
  walletAddress: EthereumAddressSchema,
  amount: TokenAmountSchema,
  trancheId: UUIDSchema.optional(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required for token redemption'),
  metadata: MetadataSchema,
});

export const CreateTrancheInputSchema = z.object({
  name: z.string().min(1).max(128),
  supply: TokenAmountSchema,
  lockedUntil: z.string().datetime().optional(),
  transferRestrictions: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});

// ============================================================================
// TRANSFERS MODULE SCHEMAS
// ============================================================================

export const TransferStatusSchema = z.enum([
  'created',
  'prechecked',
  'approved',
  'signing',
  'submitted',
  'confirmed',
  'reconciled',
  'settled',
  'failed',
  'cancelled',
]);

export const CreateTransferInputSchema = z.object({
  tokenId: UUIDSchema,
  fromWallet: EthereumAddressSchema,
  toWallet: EthereumAddressSchema,
  amount: TokenAmountSchema,
  chainId: ChainIdSchema.optional(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required for transfers'),
  metadata: MetadataSchema,
}).refine(
  (data) => data.fromWallet.toLowerCase() !== data.toWallet.toLowerCase(),
  { message: 'Cannot transfer to the same wallet', path: ['toWallet'] }
);

export const ListTransfersParamsSchema = PaginationSchema.extend({
  tokenId: UUIDSchema.optional(),
  status: TransferStatusSchema.optional(),
  fromWallet: EthereumAddressSchema.optional(),
  toWallet: EthereumAddressSchema.optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export const CreateBatchTransferInputSchema = z.object({
  transfers: z.array(CreateTransferInputSchema).min(1).max(100),
});

// ============================================================================
// INVESTORS MODULE SCHEMAS
// ============================================================================

export const InvestorStatusSchema = z.enum([
  'pending',
  'active',
  'suspended',
  'offboarded',
]);

export const KycStatusSchema = z.enum([
  'not_started',
  'pending',
  'approved',
  'rejected',
  'expired',
]);

export const InvestorClassificationSchema = z.enum([
  'retail',
  'professional',
  'institutional',
]);

export const RiskTierSchema = z.enum([
  'low',
  'medium',
  'high',
]);

export const InvestorTypeSchema = z.enum([
  'individual',
  'entity',
]);

export const CreateInvestorInputSchema = z.object({
  email: EmailSchema,
  name: z.string().min(1).max(256).optional(),
  externalId: z.string().max(256).optional(),
  type: InvestorTypeSchema.optional().default('individual'),
  classification: InvestorClassificationSchema.optional(),
  riskTier: RiskTierSchema.optional(),
  jurisdiction: CountryCodeSchema,
  accredited: z.boolean().optional(),
  metadata: MetadataSchema,
});

export const UpdateInvestorInputSchema = z.object({
  email: EmailSchema.optional(),
  name: z.string().min(1).max(256).optional(),
  externalId: z.string().max(256).optional(),
  classification: InvestorClassificationSchema.optional(),
  riskTier: RiskTierSchema.optional(),
  jurisdiction: CountryCodeSchema.optional(),
  accredited: z.boolean().optional(),
  metadata: MetadataSchema,
});

export const ListInvestorsParamsSchema = PaginationSchema.extend({
  status: InvestorStatusSchema.optional(),
  kycStatus: KycStatusSchema.optional(),
  classification: InvestorClassificationSchema.optional(),
  jurisdiction: CountryCodeSchema.optional(),
  search: z.string().max(256).optional(),
});

export const WalletTypeSchema = z.enum([
  'eoa',
  'multisig',
  'smart_account',
]);

export const CustodyTypeSchema = z.enum([
  'self',
  'custodian',
]);

export const AddWalletInputSchema = z.object({
  address: EthereumAddressSchema,
  chainId: ChainIdSchema,
  walletType: WalletTypeSchema.optional().default('eoa'),
  custodyType: CustodyTypeSchema.optional().default('self'),
  isPrimary: z.boolean().optional(),
  metadata: MetadataSchema,
});

export const StartKycInputSchema = z.object({
  provider: z.string().min(1, 'KYC provider is required'),
  redirectUrl: z.string().url().optional(),
  metadata: MetadataSchema,
});

export const VerifyWalletInputSchema = z.object({
  signature: z.string().min(1, 'Signature is required'),
  message: z.string().min(1, 'Message is required'),
});

// ============================================================================
// COMPLIANCE MODULE SCHEMAS
// ============================================================================

export const ComplianceDecisionResultSchema = z.enum([
  'approved',
  'rejected',
  'pending_review',
]);

export const CreatePolicyInputSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  type: z.enum(['transfer', 'issuance', 'redemption', 'general']),
  rules: z.record(z.unknown()),
  metadata: MetadataSchema,
});

export const UpdatePolicyInputSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1000).optional(),
  rules: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});

export const CheckComplianceInputSchema = z.object({
  type: z.enum(['transfer', 'issuance', 'redemption']),
  tokenId: UUIDSchema,
  fromWallet: EthereumAddressSchema.optional(),
  toWallet: EthereumAddressSchema,
  amount: TokenAmountSchema,
  metadata: MetadataSchema,
});

export const OverrideDecisionInputSchema = z.object({
  result: ComplianceDecisionResultSchema,
  reason: z.string().min(1, 'Override reason is required').max(1000),
  metadata: MetadataSchema,
});

export const PolicyRuleInputSchema = z.object({
  type: z.string().min(1, 'Rule type is required'),
  parameters: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

export const CreatePolicyWithRulesInputSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1000).optional(),
  jurisdiction: CountryCodeSchema,
  rules: z.array(PolicyRuleInputSchema).min(1, 'At least one rule is required'),
  metadata: MetadataSchema,
});

export const UpdatePolicyWithRulesInputSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(1000).optional(),
  rules: z.array(PolicyRuleInputSchema).optional(),
  metadata: MetadataSchema,
});

export const ListPoliciesParamsSchema = PaginationSchema.extend({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  jurisdiction: CountryCodeSchema.optional(),
});

export const CheckComplianceEntityInputSchema = z.object({
  entityType: z.enum(['transfer', 'issuance', 'redemption', 'investor']),
  entityId: UUIDSchema,
  context: z.record(z.unknown()).optional(),
});

export const CreatePolicyVersionInputSchema = z.object({
  rules: z.array(PolicyRuleInputSchema).min(1),
  changelog: z.string().max(2000).optional(),
});

export const ComplianceOverrideInputSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().min(1, 'Override reason is required').max(1000),
});

// ============================================================================
// DOCUMENT SCHEMAS
// ============================================================================

export const CreateDocumentInputSchema = z.object({
  type: z.string().min(1, 'Document type is required'),
  name: z.string().min(1).max(256),
  uri: z.string().url('Valid URI is required'),
  sha256: z.string().length(64, 'SHA256 hash must be 64 characters'),
  storageProvider: z.enum(['s3', 'ipfs', 'azure']).optional(),
  mimeType: z.string().max(128).optional(),
  size: z.number().int().positive().optional(),
  metadata: MetadataSchema,
});

// ============================================================================
// IDEMPOTENCY KEY HELPERS
// ============================================================================

/**
 * Generates a unique idempotency key.
 * Use this to create keys for operations that require idempotency (issuance, redemption, transfers).
 *
 * @example
 * ```typescript
 * const key = generateIdempotencyKey();
 * await client.tokens.issue(tokenId, { investorId, walletAddress, amount, idempotencyKey: key });
 * ```
 */
export function generateIdempotencyKey(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  return `idem_${timestamp}_${randomPart}`;
}

/**
 * Generates a deterministic idempotency key based on operation parameters.
 * Use this when you want the same operation with same parameters to have the same key.
 *
 * @example
 * ```typescript
 * // Same parameters will always generate the same key
 * const key = generateDeterministicKey('issue', tokenId, investorId, amount);
 * ```
 */
export function generateDeterministicKey(...parts: string[]): string {
  const hash = parts.join('|');
  let hashCode = 0;
  for (let i = 0; i < hash.length; i++) {
    const char = hash.charCodeAt(i);
    hashCode = ((hashCode << 5) - hashCode) + char;
    hashCode = hashCode & hashCode;
  }
  return `idem_det_${Math.abs(hashCode).toString(36)}`;
}

// ============================================================================
// PROJECTS MODULE SCHEMAS
// ============================================================================

export const ProjectStatusSchema = z.enum([
  'draft',
  'active',
  'paused',
  'completed',
  'archived',
]);

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  jurisdiction: CountryCodeSchema,
  metadata: MetadataSchema,
});

export const UpdateProjectInputSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(2000).optional(),
  jurisdiction: CountryCodeSchema.optional(),
  metadata: MetadataSchema,
});

export const ListProjectsParamsSchema = PaginationSchema.extend({
  status: ProjectStatusSchema.optional(),
  jurisdiction: CountryCodeSchema.optional(),
});

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validation error with details
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: z.ZodIssue[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates input against a schema and throws a ValidationError if invalid.
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new ValidationError(`Validation failed: ${messages.join('; ')}`, result.error.errors);
  }
  return result.data;
}

/**
 * Validates input and returns result without throwing.
 */
export function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: z.ZodIssue[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.errors };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const schemas = {
  // Base
  ethereumAddress: EthereumAddressSchema,
  uuid: UUIDSchema,
  tokenAmount: TokenAmountSchema,
  countryCode: CountryCodeSchema,
  chainId: ChainIdSchema,
  email: EmailSchema,

  // Assets
  createAsset: CreateAssetInputSchema,
  updateAsset: UpdateAssetInputSchema,
  listAssets: ListAssetsParamsSchema,

  // Tokens
  createToken: CreateTokenInputSchema,
  updateToken: UpdateTokenInputSchema,
  listTokens: ListTokensParamsSchema,
  deployToken: DeployTokenInputSchema,
  issueTokens: IssueTokensInputSchema,
  redeemTokens: RedeemTokensInputSchema,
  createTranche: CreateTrancheInputSchema,

  // Transfers
  createTransfer: CreateTransferInputSchema,
  listTransfers: ListTransfersParamsSchema,

  // Investors
  createInvestor: CreateInvestorInputSchema,
  updateInvestor: UpdateInvestorInputSchema,
  listInvestors: ListInvestorsParamsSchema,
  addWallet: AddWalletInputSchema,
  startKyc: StartKycInputSchema,

  // Compliance
  createPolicy: CreatePolicyInputSchema,
  checkCompliance: CheckComplianceInputSchema,
  overrideDecision: OverrideDecisionInputSchema,

  // Projects
  createProject: CreateProjectInputSchema,
  updateProject: UpdateProjectInputSchema,
  listProjects: ListProjectsParamsSchema,
};
