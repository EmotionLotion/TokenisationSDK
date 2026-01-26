/**
 * Auth Plugin Exports
 *
 * Provides SIWE authentication for wallet-based sign-in.
 * Includes wallet connection plugins for MetaMask and WalletConnect.
 */

export {
  SIWEAuthPlugin,
  createSIWEAuthPlugin,
  type SIWEAuthConfig,
  type AuthSession,
  type WalletConnection,
} from './SIWEAuthPlugin.js';

export {
  MetaMaskPlugin,
  createMetaMaskPlugin,
  type MetaMaskPluginConfig,
  type ChainParams,
  type MetaMaskEventType,
} from './MetaMaskPlugin.js';

export {
  WalletConnectPlugin,
  createWalletConnectPlugin,
  type WalletConnectPluginConfig,
  type WalletConnectEventType,
} from './WalletConnectPlugin.js';
