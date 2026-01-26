/**
 * Token adapters exports
 *
 * Standard Token Adapters:
 * - ERC20Adapter: Fungible tokens (standard, permissioned)
 * - ERC721Adapter: Non-fungible tokens
 * - ERC1155Adapter: Multi-tokens (multiple asset classes in one contract)
 * - SoulboundAdapter: Non-transferable tokens
 *
 * Advanced Token Adapters:
 * - ERC1410Adapter: Partitioned securities (share classes, lock-ups)
 * - ERC4626Adapter: Tokenized vaults (yield-bearing, auto-compound)
 */

export * from './ERC20Adapter.js';
export * from './ERC721Adapter.js';
export * from './ERC1155Adapter.js';
export * from './SoulboundAdapter.js';
export * from './ERC1410Adapter.js';
export * from './ERC4626Adapter.js';
