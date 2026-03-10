/**
 * Validation Schemas for Governance, Escrow, CashFlow, and DLD Modules
 *
 * Comprehensive Zod schemas for validating thin module inputs.
 */

import { z } from 'zod';
import { UUIDSchema, MetadataSchema, PaginationSchema, EthereumAddressSchema } from './validation.js';

// ============================================================================
// GOVERNANCE MODULE SCHEMAS
// ============================================================================

export const ProposalTypeSchema = z.enum([
  'GENERAL',
  'PARAMETER_CHANGE',
  'TREASURY',
  'UPGRADE',
  'EMERGENCY',
  'MEMBERSHIP',
  'CUSTOM',
]);

export const ProposalStateSchema = z.enum([
  'PENDING',
  'ACTIVE_VOTING',
  'PASSED',
  'REJECTED',
  'QUEUED',
  'EXECUTED',
  'CANCELLED',
  'EXPIRED',
]);

export const VoteTypeSchema = z.enum(['FOR', 'AGAINST', 'ABSTAIN']);

export const VotingStrategySchema = z.enum([
  'TOKEN_WEIGHTED',
  'ONE_PERSON_ONE_VOTE',
  'QUADRATIC',
  'CONVICTION',
  'RANKED_CHOICE',
  'APPROVAL',
]);

export const QuorumTypeSchema = z.enum(['PERCENTAGE', 'FIXED', 'PARTICIPATION']);

export const ProposalActionSchema = z.object({
  target: z.string().min(1, 'Target is required'),
  calldata: z.string().default('0x'),
  value: z.string().default('0'),
  description: z.string().max(1000).optional(),
});

export const CreateProposalInputSchema = z.object({
  assetId: UUIDSchema,
  type: ProposalTypeSchema,
  title: z.string().min(1, 'Title is required').max(256, 'Title must be 256 characters or less'),
  description: z.string().max(10000, 'Description must be 10000 characters or less'),
  actions: z.array(ProposalActionSchema).optional(),
  ipfsHash: z.string().optional(),
  metadata: MetadataSchema,
});

export type CreateProposalInput = z.infer<typeof CreateProposalInputSchema>;

export const UpdateProposalInputSchema = z.object({
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(10000).optional(),
  actions: z.array(ProposalActionSchema).optional(),
  ipfsHash: z.string().optional(),
  metadata: MetadataSchema,
});

export type UpdateProposalInput = z.infer<typeof UpdateProposalInputSchema>;

export const CastVoteInputSchema = z.object({
  voteType: VoteTypeSchema,
  reason: z.string().max(2000).optional(),
});

export type CastVoteInput = z.infer<typeof CastVoteInputSchema>;

export const DelegateInputSchema = z.object({
  assetId: UUIDSchema,
  delegateId: z.string().min(1, 'Delegate ID is required'),
  weight: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

export type DelegateInput = z.infer<typeof DelegateInputSchema>;

export const ListProposalsParamsSchema = PaginationSchema.extend({
  assetId: UUIDSchema.optional(),
  state: ProposalStateSchema.optional(),
  type: ProposalTypeSchema.optional(),
  proposerId: z.string().optional(),
});

export type ListProposalsParams = z.infer<typeof ListProposalsParamsSchema>;

export const ListVotesParamsSchema = PaginationSchema.extend({
  voteType: VoteTypeSchema.optional(),
});

export type ListVotesParams = z.infer<typeof ListVotesParamsSchema>;

export const ConfigureGovernanceInputSchema = z.object({
  votingStrategy: VotingStrategySchema,
  quorumType: QuorumTypeSchema,
  quorumValue: z.number().positive('Quorum value must be positive'),
  votingPeriodSeconds: z.number().positive('Voting period must be positive'),
  executionDelaySeconds: z.number().nonnegative('Execution delay cannot be negative'),
  proposalThreshold: z.string().default('0'),
  allowDelegation: z.boolean().default(true),
  maxActiveProposalsPerUser: z.number().positive().default(5),
  approvalThreshold: z.number().min(0).max(100).default(50),
  requireSecond: z.boolean().default(false),
  gracePeriodSeconds: z.number().nonnegative().default(0),
  parameters: z.record(z.unknown()).optional(),
});

export type ConfigureGovernanceInput = z.infer<typeof ConfigureGovernanceInputSchema>;

// ============================================================================
// ESCROW MODULE SCHEMAS
// ============================================================================

export const EscrowTypeSchema = z.enum([
  'SIMPLE',
  'TIME_LOCKED',
  'MILESTONE',
  'MULTI_SIG',
  'ATOMIC_SWAP',
  'CONDITIONAL',
  'DISPUTE',
]);

export const EscrowStatusSchema = z.enum([
  'DRAFT',
  'FUNDED',
  'ACTIVE',
  'PENDING_RELEASE',
  'PARTIALLY_RELEASED',
  'RELEASED',
  'REFUNDED',
  'DISPUTED',
  'EXPIRED',
  'CANCELLED',
]);

export const EscrowPartyRoleSchema = z.enum([
  'DEPOSITOR',
  'BENEFICIARY',
  'ARBITER',
  'ORACLE',
  'APPROVER',
]);

export const ReleaseConditionTypeSchema = z.enum([
  'TIME',
  'SIGNATURE',
  'ORACLE',
  'MILESTONE',
  'MULTI_SIG',
  'EXTERNAL',
  'CUSTOM',
]);

export const EscrowPartyInputSchema = z.object({
  partyId: z.string().min(1, 'Party ID is required'),
  address: EthereumAddressSchema.optional(),
  role: EscrowPartyRoleSchema,
  depositedAmount: z.string().optional(),
  receiveAmount: z.string().optional(),
});

export const ReleaseConditionInputSchema = z.object({
  type: ReleaseConditionTypeSchema,
  description: z.string().min(1, 'Condition description is required'),
  parameters: z.record(z.unknown()).default({}),
  releasePercentage: z.number().min(0).max(100).default(100),
  order: z.number().nonnegative().default(0),
  required: z.boolean().default(true),
});

export const CreateEscrowInputSchema = z.object({
  type: EscrowTypeSchema,
  title: z.string().min(1, 'Title is required').max(256),
  description: z.string().max(2000).optional(),
  assetId: UUIDSchema,
  amount: z.string().regex(/^[0-9]+$/, 'Amount must be a positive integer string'),
  currency: z.string().min(1, 'Currency is required'),
  parties: z.array(EscrowPartyInputSchema).min(1, 'At least one party is required'),
  conditions: z.array(ReleaseConditionInputSchema).optional(),
  requiredConditions: z.number().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  disputeDeadline: z.string().datetime().optional(),
  feePercentage: z.number().min(0).max(100).optional(),
  feeRecipient: z.string().optional(),
  metadata: MetadataSchema,
});

export type CreateEscrowInput = z.infer<typeof CreateEscrowInputSchema>;

export const FundEscrowInputSchema = z.object({
  amount: z.string().regex(/^[0-9]+$/, 'Amount must be a positive integer string'),
  txHash: z.string().optional(),
});

export type FundEscrowInput = z.infer<typeof FundEscrowInputSchema>;

export const ReleaseEscrowInputSchema = z.object({
  amount: z.string().regex(/^[0-9]+$/).optional(),
  txHash: z.string().optional(),
});

export type ReleaseEscrowInput = z.infer<typeof ReleaseEscrowInputSchema>;

export const RaiseDisputeInputSchema = z.object({
  reason: z.string().min(10, 'Dispute reason must be at least 10 characters').max(2000),
});

export type RaiseDisputeInput = z.infer<typeof RaiseDisputeInputSchema>;

export const ResolveDisputeInputSchema = z.object({
  decision: z.enum(['RELEASE', 'REFUND', 'SPLIT']),
  splitPercentage: z.number().min(0).max(100).optional(),
});

export type ResolveDisputeInput = z.infer<typeof ResolveDisputeInputSchema>;

export const CreateMilestoneInputSchema = z.object({
  title: z.string().min(1, 'Title is required').max(256),
  description: z.string().max(2000).optional(),
  amount: z.string().regex(/^[0-9]+$/),
  percentage: z.number().min(0).max(100),
  order: z.number().nonnegative(),
  dueDate: z.string().datetime().optional(),
});

export type CreateMilestoneInput = z.infer<typeof CreateMilestoneInputSchema>;

export const SubmitMilestoneEvidenceInputSchema = z.object({
  type: z.string().min(1, 'Evidence type is required'),
  uri: z.string().url('Valid URI is required'),
});

export type SubmitMilestoneEvidenceInput = z.infer<typeof SubmitMilestoneEvidenceInputSchema>;

export const ApproveMilestoneInputSchema = z.object({
  approved: z.boolean(),
  comments: z.string().max(2000).optional(),
});

export type ApproveMilestoneInput = z.infer<typeof ApproveMilestoneInputSchema>;

export const ListEscrowsParamsSchema = PaginationSchema.extend({
  assetId: UUIDSchema.optional(),
  status: EscrowStatusSchema.optional(),
  type: EscrowTypeSchema.optional(),
  partyId: z.string().optional(),
});

export type ListEscrowsParams = z.infer<typeof ListEscrowsParamsSchema>;

// ============================================================================
// CASHFLOW / DISTRIBUTION MODULE SCHEMAS
// ============================================================================

export const DistributionTypeSchema = z.enum([
  'DIVIDEND',
  'INTEREST',
  'ROYALTY',
  'REVENUE_SHARE',
  'RENT',
  'PROFIT_SHARE',
  'YIELD',
  'CUSTOM',
]);

export const DistributionFrequencySchema = z.enum([
  'ONE_TIME',
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUAL',
  'ANNUAL',
  'ON_DEMAND',
]);

export const DistributionStatusSchema = z.enum([
  'SCHEDULED',
  'PROCESSING',
  'COMPLETED',
  'PARTIALLY_COMPLETED',
  'FAILED',
  'CANCELLED',
]);

export const AllocationStrategySchema = z.enum([
  'PRO_RATA',
  'EQUAL',
  'TIERED',
  'TIME_WEIGHTED',
  'CUSTOM',
]);

export const CreateScheduleInputSchema = z.object({
  assetId: UUIDSchema,
  type: DistributionTypeSchema,
  frequency: DistributionFrequencySchema,
  allocationStrategy: AllocationStrategySchema.optional(),
  paymentCurrency: z.string().min(1, 'Payment currency is required'),
  amount: z.string().regex(/^[0-9]+$/).optional(),
  rate: z.number().min(0).max(100).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  minimumBalance: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});

export type CreateScheduleInput = z.infer<typeof CreateScheduleInputSchema>;

export const UpdateScheduleInputSchema = z.object({
  amount: z.string().regex(/^[0-9]+$/).optional(),
  rate: z.number().min(0).max(100).optional(),
  endDate: z.string().datetime().optional(),
  minimumBalance: z.string().optional(),
  isActive: z.boolean().optional(),
  parameters: z.record(z.unknown()).optional(),
  metadata: MetadataSchema,
});

export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInputSchema>;

export const ExecuteDistributionInputSchema = z.object({
  amount: z.string().regex(/^[0-9]+$/).optional(),
  snapshotAt: z.string().datetime().optional(),
  metadata: MetadataSchema,
});

export type ExecuteDistributionInput = z.infer<typeof ExecuteDistributionInputSchema>;

export const ClaimPayoutInputSchema = z.object({
  distributionId: UUIDSchema,
});

export type ClaimPayoutInput = z.infer<typeof ClaimPayoutInputSchema>;

export const ListSchedulesParamsSchema = PaginationSchema.extend({
  assetId: UUIDSchema.optional(),
  type: DistributionTypeSchema.optional(),
  frequency: DistributionFrequencySchema.optional(),
  isActive: z.boolean().optional(),
});

export type ListSchedulesParams = z.infer<typeof ListSchedulesParamsSchema>;

export const ListDistributionsParamsSchema = PaginationSchema.extend({
  assetId: UUIDSchema.optional(),
  scheduleId: UUIDSchema.optional(),
  status: DistributionStatusSchema.optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
});

export type ListDistributionsParams = z.infer<typeof ListDistributionsParamsSchema>;

// DLD schemas moved to @tokenisation/realestate
