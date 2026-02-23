/**
 * Offline CashFlow Engine
 *
 * @deprecated This module is for offline/development use only.
 * For production, use ApiClient.cashflow which persists state on the server.
 *
 * The CashFlowEngine stores schedules and distributions in memory and will lose data on restart.
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
 * await client.cashflow.scheduleDistribution({ ... });
 * await client.cashflow.processDistribution(scheduleId);
 *
 * // Offline (Development only)
 * import { CashFlowEngine } from '@tokenisation/sdk/offline';
 * const engine = new CashFlowEngine();
 * // WARNING: Distributions are not persisted!
 * ```
 */

// Re-export from original location
export {
  CashFlowEngine,
  DistributionScheduleSchema,
  DistributionEventSchema,
  DistributionType,
  DistributionFrequency,
  DistributionStatus,
  AllocationStrategy,
} from '../modules/CashFlow.js';

export type {
  DistributionSchedule,
  DistributionEvent,
  AllocationTier,
  HolderSnapshot,
} from '../modules/CashFlow.js';

// Add deprecation warning on import
if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
  console.warn(
    '[TokenisationSDK] CashFlowEngine from /offline is deprecated for production use. ' +
    'Use ApiClient.cashflow instead for server-side state persistence. ' +
    'See: https://docs.tokenisation.io/migration'
  );
}
