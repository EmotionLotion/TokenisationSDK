/**
 * SDK Modules exports
 *
 * Advanced functionality modules that extend the core SDK capabilities.
 *
 * Financial Modules:
 * - CashFlow: Distribution engine for dividends, royalties, revenue sharing
 *
 * Governance Modules:
 * - Governance: Voting, proposals, delegation, and governance execution
 *
 * Security Modules:
 * - Escrow: Conditional transfers, milestones, multi-sig, and atomic swaps
 *
 * API Client Modules:
 * - Projects: Project and document management
 * - Investors: Investor onboarding and KYC
 * - Tokens: Token creation, deployment, and management
 * - Transfers: Transfer orchestration
 * - Compliance: Compliance policies and checks
 */

export * from './CashFlow.js';
export * from './Governance.js';
export * from './Escrow.js';
export * from './Vesting.js';
export * from './Offerings.js';
export * from './RegulatoryReports.js';
export * from './Redemption.js';

// API Client Modules
export { ProjectsModule } from './projects.js';
export { InvestorsModule } from './investors.js';
export { TokensModule } from './tokens.js';
export { TransfersModule } from './transfers.js';
export { ComplianceModule } from './compliance.js';
export { AssetsModule } from './assets.js';
export { EventsModule } from './events.js';
export { WebhooksModule } from './webhooks.js';
export { AuditModule } from './audit.js';
export { TicketsClient } from './TicketsClient.js';
export type {
  Ticket,
  IssueTicketInput,
  TransferTicketInput,
  TicketTransferRequest,
  TicketEvent as TicketAuditEvent,
  MetadataVersion as ApiMetadataVersion,
  UpdateMetadataInput,
  ReconciliationReport as ApiReconciliationReport,
  ListTicketsParams,
  TicketStatus as ApiTicketStatus,
  TicketClass as ApiTicketClass,
} from './TicketsClient.js';

// Thin API Client Modules (Production-ready, server-backed)
export { GovernanceModule } from './GovernanceClient.js';
export type {
  Proposal as GovernanceProposal,
  VoteRecord as GovernanceVoteRecord,
  Delegation as GovernanceDelegation,
  GovernanceConfig,
  VotingPower,
  ExecutionResult,
  ProposalAction,
  VoteTally,
  ProposalType as GovernanceProposalType,
  ProposalState,
  VoteType as GovernanceVoteType,
  VotingStrategy as GovernanceVotingStrategy,
  QuorumType,
} from './GovernanceClient.js';

export { EscrowModule } from './EscrowClient.js';
export type {
  Escrow as ApiEscrow,
  Milestone as ApiMilestone,
  EscrowParty as ApiEscrowParty,
  ReleaseCondition as ApiReleaseCondition,
  TxRecord,
  MilestoneEvidence,
  MilestoneApproval,
  DisputeResolution,
  EscrowType as ApiEscrowType,
  EscrowStatus as ApiEscrowStatus,
  EscrowPartyRole,
  ReleaseConditionType as ApiReleaseConditionType,
  MilestoneStatus,
} from './EscrowClient.js';

export { CashFlowModule } from './CashFlowClient.js';
export type {
  DistributionSchedule as ApiDistributionSchedule,
  Distribution,
  DistributionPayout,
  ClaimResult,
  UnclaimedPayout,
  YieldSummary,
  DistributionType as ApiDistributionType,
  DistributionFrequency as ApiDistributionFrequency,
  DistributionStatus as ApiDistributionStatus,
  AllocationStrategy as ApiAllocationStrategy,
} from './CashFlowClient.js';

export { DLDModule } from './DLDClient.js';
export type {
  TitleDeed,
  TokenizationEligibility,
  TokenizationNotification as DLDTokenizationNotification,
  Valuation,
  DldEvent,
  PropertySummary,
  Owner as DLDOwner,
  TitleDeedStatus,
  PropertyType,
  OwnershipType,
} from './DLDClient.js';

// Validation utilities
export {
  validate,
  validateSafe,
  ValidationError,
  generateIdempotencyKey,
  generateDeterministicKey,
  schemas,
} from './validation.js';

// Additional validation schemas for new modules
export * from './validation-governance.js';
