/**
 * Chain Registry
 *
 * Centralized registry of supported blockchain networks with their configurations.
 * Provides chain-agnostic access to network parameters.
 */

import { SDKError, ErrorCode } from '../../errors/index.js';

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  ccipRouter?: string;
  ccipChainSelector?: string;
  isDefault?: boolean;
  isTestnet?: boolean;
}

// Mainnet configurations
const BASE_MAINNET: ChainConfig = {
  chainId: 8453,
  name: 'Base',
  rpcUrl: 'https://mainnet.base.org',
  explorerUrl: 'https://basescan.org',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  ccipRouter: '0x881e3A65B4d4a04dD529061dd0071cf975F58bCD',
  ccipChainSelector: '15971525489660198786',
  isDefault: true,
};

const POLYGON_MAINNET: ChainConfig = {
  chainId: 137,
  name: 'Polygon',
  rpcUrl: 'https://polygon-rpc.com',
  explorerUrl: 'https://polygonscan.com',
  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  ccipRouter: '0x849c5ED5a80F5B408Dd4969b78c2C8fdf0565Bfe',
  ccipChainSelector: '4051577828743386545',
};

const ETHEREUM_MAINNET: ChainConfig = {
  chainId: 1,
  name: 'Ethereum',
  rpcUrl: 'https://eth.llamarpc.com',
  explorerUrl: 'https://etherscan.io',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  ccipRouter: '0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D',
  ccipChainSelector: '5009297550715157269',
};

// Testnet configurations
const BASE_SEPOLIA: ChainConfig = {
  chainId: 84532,
  name: 'Base Sepolia',
  rpcUrl: 'https://sepolia.base.org',
  explorerUrl: 'https://sepolia.basescan.org',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  ccipRouter: '0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93',
  ccipChainSelector: '10344971235874465080',
  isTestnet: true,
};

const POLYGON_AMOY: ChainConfig = {
  chainId: 80002,
  name: 'Polygon Amoy',
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  explorerUrl: 'https://amoy.polygonscan.com',
  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  ccipRouter: '0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2',
  ccipChainSelector: '16281711391670634445',
  isTestnet: true,
};

const SEPOLIA: ChainConfig = {
  chainId: 11155111,
  name: 'Sepolia',
  rpcUrl: 'https://sepolia.infura.io/v3/public',
  explorerUrl: 'https://sepolia.etherscan.io',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  ccipRouter: '0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59',
  ccipChainSelector: '16015286601757825753',
  isTestnet: true,
};

// Default chains
const DEFAULT_CHAINS: ChainConfig[] = [
  BASE_MAINNET,
  POLYGON_MAINNET,
  ETHEREUM_MAINNET,
  BASE_SEPOLIA,
  POLYGON_AMOY,
  SEPOLIA,
];

export class ChainRegistry {
  private chains: Map<number, ChainConfig> = new Map();
  private defaultChainId: number;

  constructor(chains: ChainConfig[] = DEFAULT_CHAINS) {
    for (const chain of chains) {
      this.chains.set(chain.chainId, chain);
    }

    // Find default chain
    const defaultChain = chains.find(c => c.isDefault) || chains[0];
    this.defaultChainId = defaultChain?.chainId || 8453; // Base as fallback
  }

  get(chainId: number): ChainConfig | undefined {
    return this.chains.get(chainId);
  }

  getDefault(): ChainConfig {
    return this.chains.get(this.defaultChainId)!;
  }

  getAll(): ChainConfig[] {
    return Array.from(this.chains.values());
  }

  getMainnets(): ChainConfig[] {
    return this.getAll().filter(c => !c.isTestnet);
  }

  getTestnets(): ChainConfig[] {
    return this.getAll().filter(c => c.isTestnet);
  }

  add(chain: ChainConfig): void {
    this.chains.set(chain.chainId, chain);
  }

  remove(chainId: number): boolean {
    return this.chains.delete(chainId);
  }

  setDefault(chainId: number): void {
    if (!this.chains.has(chainId)) {
      throw new SDKError(`Chain ${chainId} not found in registry`, ErrorCode.NOT_FOUND, {
        details: { chainId, availableChains: Array.from(this.chains.keys()) },
      });
    }

    // Update default flags
    for (const [id, chain] of this.chains) {
      this.chains.set(id, { ...chain, isDefault: id === chainId });
    }
    this.defaultChainId = chainId;
  }

  getByName(name: string): ChainConfig | undefined {
    for (const chain of this.chains.values()) {
      if (chain.name.toLowerCase() === name.toLowerCase()) {
        return chain;
      }
    }
    return undefined;
  }

  // Get CCIP chain selector for a chain ID
  getCCIPSelector(chainId: number): string | undefined {
    return this.chains.get(chainId)?.ccipChainSelector;
  }

  // Get CCIP router address for a chain ID
  getCCIPRouter(chainId: number): string | undefined {
    return this.chains.get(chainId)?.ccipRouter;
  }

  // Check if cross-chain transfer is supported between two chains
  isCCIPSupported(sourceChainId: number, destChainId: number): boolean {
    const source = this.chains.get(sourceChainId);
    const dest = this.chains.get(destChainId);

    return !!(
      source?.ccipRouter &&
      source?.ccipChainSelector &&
      dest?.ccipRouter &&
      dest?.ccipChainSelector
    );
  }
}

// Singleton instance
export const chainRegistry = new ChainRegistry();

// Export default chains
export {
  BASE_MAINNET,
  POLYGON_MAINNET,
  ETHEREUM_MAINNET,
  BASE_SEPOLIA,
  POLYGON_AMOY,
  SEPOLIA,
  DEFAULT_CHAINS,
};
