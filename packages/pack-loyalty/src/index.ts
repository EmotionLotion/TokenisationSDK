/**
 * @tokenisation/pack-loyalty
 *
 * Loyalty & Behavior Scoring vertical pack for the Tokenisation SDK.
 * Includes loyalty points, behavior scoring, driver reputation,
 * and Ahoy ecosystem tokens.
 *
 * @example
 * ```typescript
 * import { PackRegistry } from '@tokenisation/core';
 * import { loyaltyPack } from '@tokenisation/pack-loyalty';
 *
 * const registry = new PackRegistry();
 * await registry.load(loyaltyPack);
 * ```
 */

import type { LoadedPack } from '@tokenisation/core';
import { manifest } from './manifest.js';

// ============================================================================
// Pack Loader
// ============================================================================

export const loyaltyPack: LoadedPack = {
  manifest,
  activate: (context) => {
    // Register loyalty-specific workflows when the pack is loaded
  },
};

// ============================================================================
// Re-export manifest
// ============================================================================

export { manifest } from './manifest.js';

// ============================================================================
// Loyalty Points
// ============================================================================

export {
  LoyaltyPointsEngine,
  LOYALTY_POINTS_PACK,
  type LoyaltyProgramConfig,
  type LoyaltyPointsMetadata,
  type PointBalance,
  type PointBatch,
  type MintRecord,
  type FraudFlag,
} from './packs/LoyaltyPoints.js';

// ============================================================================
// Behavior Score
// ============================================================================

export {
  BehaviorScorePack,
  createDrivingScore,
  createLoyaltyScore,
  type BehaviorScoreConfig,
} from './packs/BehaviorScore.js';

// ============================================================================
// Ahoy Ecosystem Packs
// ============================================================================

export { DriverReputationPack } from './packs/DriverReputation.js';
export { FlyPlusPassPack } from './packs/FlyPlusPass.js';
export { H2OUtilityCreditPack } from './packs/H2OUtilityCredit.js';
export { ComputeCreditPack } from './packs/ComputeCredit.js';
export { DataStreamAccessPack } from './packs/DataStreamAccess.js';
export { AhoyTokenPack } from './packs/AhoyToken.js';

// ============================================================================
// Adapters
// ============================================================================

export * from './adapters/index.js';

// ============================================================================
// Types
// ============================================================================

export * from './types.js';
