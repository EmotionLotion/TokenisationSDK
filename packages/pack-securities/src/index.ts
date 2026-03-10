/**
 * @tokenisation/pack-securities
 *
 * US Securities vertical pack for the Tokenisation SDK.
 * Pre-configured asset packs for tokenizing US securities
 * under SEC Regulation D (Rule 506b and 506c).
 *
 * @example
 * ```typescript
 * import { PackRegistry } from '@tokenisation/core';
 * import { securitiesPack } from '@tokenisation/pack-securities';
 *
 * const registry = new PackRegistry();
 * await registry.load(securitiesPack);
 * ```
 */

import type { LoadedPack } from '@tokenisation/core';
import { manifest } from './manifest.js';

// ============================================================================
// Pack Loader
// ============================================================================

export const securitiesPack: LoadedPack = {
  manifest,
  activate: (context) => {
    // Register securities-specific workflows when the pack is loaded
  },
};

// ============================================================================
// Re-export manifest
// ============================================================================

export { manifest } from './manifest.js';

// ============================================================================
// US Securities Packs
// ============================================================================

export {
  usSecurities506cPack,
  usSecurities506bPack,
  type AssetPackConfig,
} from './packs/us-securities.pack.js';
