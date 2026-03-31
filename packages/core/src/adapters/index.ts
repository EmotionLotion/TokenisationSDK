/**
 * @fileoverview Adapters Module
 *
 * Generic pluggable adapter system that enables the SDK
 * to support any asset type without core code changes.
 *
 * Vertical-specific adapters live in their own packages:
 * - RealEstateAdapter → @tokenisation/realestate
 * - ComputeAdapter → @tokenisation/compute
 *
 * Usage:
 * ```typescript
 * import { adapterRegistry } from '@tokenisation/core';
 * import { RealEstateAdapter } from '@tokenisation/realestate';
 *
 * adapterRegistry.registerAssetAdapter(new RealEstateAdapter());
 * ```
 */

// Types
export * from './types.js';

// Registry
export { AdapterRegistry, adapterRegistry } from './AdapterRegistry.js';
