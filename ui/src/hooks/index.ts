/**
 * Hooks Index
 *
 * Re-exports all custom hooks.
 */

export { useWallet } from './useWallet';
export { useChain } from './useChain';

// Note: New hooks (useBlockchain, useVerticals, useAhoyToken) are imported directly
// where needed to avoid initialization issues
