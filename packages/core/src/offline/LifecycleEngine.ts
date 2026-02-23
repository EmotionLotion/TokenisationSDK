/**
 * Offline Lifecycle Engine
 *
 * @deprecated This module is for offline/development use only.
 * For production, use ApiClient which persists state on the server.
 *
 * The LifecycleEngine stores state in memory and will lose data on restart.
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
 * await client.assets.create({ ... });
 *
 * // Offline (Development only)
 * import { LifecycleEngine } from '@tokenisation/sdk/offline';
 * const engine = new LifecycleEngine();
 * // WARNING: State is lost on restart!
 * ```
 */

// Re-export from original location with deprecation notice
export {
  LifecycleEngine,
  EventStore,
  PolicyEvaluator,
  VALID_TRANSITIONS,
} from '../core/index.js';

export type {
  ILifecycleEngine,
  IEventStore,
  StateTransitionRequest,
  StateTransitionResult,
} from '../core/index.js';

// Add deprecation warning on import
if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
  console.warn(
    '[TokenisationSDK] LifecycleEngine from /offline is deprecated for production use. ' +
    'Use ApiClient instead for server-side state persistence. ' +
    'See: https://docs.tokenisation.io/migration'
  );
}
