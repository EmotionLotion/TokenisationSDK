/**
 * Chain Plugin Exports
 *
 * Provides EVM chain integration for multi-chain support.
 */

export {
  EVMChainPlugin,
  createEVMChainPlugin,
  createBasePlugin,
  createPolygonPlugin,
  createEthereumPlugin,
  type EVMChainPluginConfig,
} from './EVMChainPlugin.js';

export {
  ChainRegistry,
  chainRegistry,
  BASE_MAINNET,
  POLYGON_MAINNET,
  ETHEREUM_MAINNET,
  BASE_SEPOLIA,
  POLYGON_AMOY,
  SEPOLIA,
  DEFAULT_CHAINS,
  type ChainConfig,
} from './ChainRegistry.js';
