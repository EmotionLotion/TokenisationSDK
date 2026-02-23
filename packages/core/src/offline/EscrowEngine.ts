/**
 * Offline Escrow Engine
 *
 * @deprecated This module is for offline/development use only.
 * For production, use ApiClient.escrow which persists state on the server.
 *
 * The EscrowEngine stores escrows and milestones in memory and will lose data on restart.
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
 * await client.escrow.create({ ... });
 * await client.escrow.release(escrowId);
 *
 * // Offline (Development only)
 * import { EscrowEngine } from '@tokenisation/sdk/offline';
 * const engine = new EscrowEngine();
 * // WARNING: Escrows are not persisted!
 * ```
 */

// Re-export from original location
export {
  EscrowEngine,
  EscrowSchema,
  MilestoneSchema,
  ReleaseConditionSchema,
  EscrowPartySchema,
  EscrowType,
  EscrowStatus,
  ReleaseConditionType,
} from '../modules/Escrow.js';

export type {
  Escrow,
  Milestone,
  ReleaseCondition,
  EscrowParty,
} from '../modules/Escrow.js';

// Add deprecation warning on import
if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
  console.warn(
    '[TokenisationSDK] EscrowEngine from /offline is deprecated for production use. ' +
    'Use ApiClient.escrow instead for server-side state persistence. ' +
    'See: https://docs.tokenisation.io/migration'
  );
}
