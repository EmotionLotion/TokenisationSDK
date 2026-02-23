/**
 * @fileoverview Adapters Module
 *
 * This module provides the pluggable adapter system that enables the SDK
 * to support any asset type without core code changes.
 *
 * Usage:
 * ```typescript
 * import { adapterRegistry, RealEstateAdapter } from '@tokenisation/sdk/adapters';
 *
 * // Register built-in adapter
 * adapterRegistry.registerAssetAdapter(new RealEstateAdapter());
 *
 * // Or create your own
 * class MyAssetAdapter implements IAssetAdapter {
 *   // ... implementation
 * }
 * adapterRegistry.registerAssetAdapter(new MyAssetAdapter());
 * ```
 */

// Types
export * from './types.js';

// Registry
export { AdapterRegistry, adapterRegistry } from './AdapterRegistry.js';

// Example Adapters
export { RealEstateAdapter, realEstateAdapter } from './examples/RealEstateAdapter.js';
export { CarbonCreditAdapter, carbonCreditAdapter } from './examples/CarbonCreditAdapter.js';
export { LoyaltyAdapter, loyaltyAdapter } from './examples/LoyaltyAdapter.js';
