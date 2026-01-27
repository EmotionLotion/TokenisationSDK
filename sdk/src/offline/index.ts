/**
 * Offline Engines
 *
 * @deprecated These modules are for offline/development use only.
 * For production, use ApiClient which persists state on the server.
 *
 * All engines in this module store state in memory and will lose data on restart.
 * Use these only for:
 * - Local development without a backend
 * - Unit testing
 * - Offline-first applications with local persistence
 *
 * @example
 * ```typescript
 * // Production (Recommended)
 * import { ApiClient } from '@tokenisation/sdk';
 * const client = new ApiClient({ apiKey: 'sk_...' });
 *
 * // Create and manage assets
 * const asset = await client.assets.create({ ... });
 *
 * // Governance
 * const proposal = await client.governance.createProposal({ ... });
 * await client.governance.castVote(proposal.id, { voteType: 'FOR' });
 *
 * // Escrow
 * const escrow = await client.escrow.create({ ... });
 * await client.escrow.release(escrow.id);
 *
 * // Distributions
 * const schedule = await client.cashflow.scheduleDistribution({ ... });
 * await client.cashflow.processDistribution(schedule.id);
 * ```
 *
 * @example
 * ```typescript
 * // Offline (Development only)
 * import {
 *   LifecycleEngine,
 *   GovernanceEngine,
 *   EscrowEngine,
 *   CashFlowEngine,
 * } from '@tokenisation/sdk/offline';
 *
 * // WARNING: All state is lost on restart!
 * const lifecycle = new LifecycleEngine();
 * const governance = new GovernanceEngine();
 * const escrow = new EscrowEngine();
 * const cashflow = new CashFlowEngine();
 * ```
 */

// Lifecycle & Event Sourcing
export * from './LifecycleEngine.js';

// Compliance
export * from './ComplianceEngine.js';

// Extension Modules
export * from './GovernanceEngine.js';
export * from './EscrowEngine.js';
export * from './CashFlowEngine.js';

// Add deprecation warning on import
if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
  console.warn(
    '[TokenisationSDK] Offline engines are deprecated for production use. ' +
    'Use ApiClient instead for server-side state persistence. ' +
    'See: https://docs.tokenisation.io/migration'
  );
}
