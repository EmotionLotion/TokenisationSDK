/**
 * Offline Governance Engine
 *
 * @deprecated This module is for offline/development use only.
 * For production, use ApiClient.governance which persists state on the server.
 *
 * The GovernanceEngine stores proposals and votes in memory and will lose data on restart.
 * Use this only for:
 * - Local development without a backend
 * - Unit testing
 * - Offline-first applications with local persistence
 *
 * @example
 * ```typescript
 * // Production (Recommended)
 * import { ApiClient } from '@tokenisation/sdk';
 * const client = new ApiClient({ apiKey: 'sk_...' });
 * await client.governance.createProposal({ ... });
 * await client.governance.castVote(proposalId, { voteType: 'FOR' });
 *
 * // Offline (Development only)
 * import { GovernanceEngine } from '@tokenisation/sdk/offline';
 * const engine = new GovernanceEngine();
 * // WARNING: Proposals and votes are not persisted!
 * ```
 */

// Re-export thick governance engine from original location
export {
  GovernanceEngine,
  GovernanceConfigSchema,
  ProposalSchema,
  DelegationSchema,
  ProposalType,
  VoteType,
  VotingStrategy,
  QuorumType,
} from '../modules/Governance.js';

export type {
  GovernanceConfig,
  Proposal,
  Delegation,
  VoteRecord,
} from '../modules/Governance.js';

// Add deprecation warning on import
if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
  console.warn(
    '[TokenisationSDK] GovernanceEngine from /offline is deprecated for production use. ' +
    'Use ApiClient.governance instead for server-side state persistence. ' +
    'See: https://docs.tokenisation.io/migration'
  );
}
