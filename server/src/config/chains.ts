/**
 * Multi-Chain Configuration
 *
 * Defines supported chains and their configurations for the tokenization platform.
 */

export interface ChainConfig {
  chainId: number;
  name: string;
  shortName: string;
  rpcUrls: string[];
  blockExplorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  contracts?: {
    identityRegistry?: string;
    tokenFactory?: string;
    compliance?: string;
    dividendDistributor?: string;
    priceFeed?: string;
    functionsRouter?: string;
    automationRegistry?: string;
    ccipRouter?: string;
  };
  chainlinkConfig?: {
    donId?: string;
    linkToken?: string;
    vrfCoordinator?: string;
  };
  gasConfig: {
    maxPriorityFeePerGas?: bigint;
    maxFeePerGas?: bigint;
    gasLimit?: number;
  };
  isTestnet: boolean;
  isActive: boolean;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // ==================== MAINNETS ====================

  // Ethereum Mainnet
  1: {
    chainId: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    rpcUrls: [
      process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
      'https://ethereum.publicnode.com',
    ],
    blockExplorerUrl: 'https://etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contracts: {
      priceFeed: '', // To be deployed
    },
    chainlinkConfig: {
      linkToken: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    },
    gasConfig: {
      maxPriorityFeePerGas: 1500000000n, // 1.5 gwei
    },
    isTestnet: false,
    isActive: true,
  },

  // Polygon Mainnet
  137: {
    chainId: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    rpcUrls: [
      process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
      'https://polygon.llamarpc.com',
    ],
    blockExplorerUrl: 'https://polygonscan.com',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      linkToken: '0xb0897686c545045aFc77CF20eC7A532E3120E0F1',
    },
    gasConfig: {
      maxPriorityFeePerGas: 30000000000n, // 30 gwei
    },
    isTestnet: false,
    isActive: true,
  },

  // Base Mainnet
  8453: {
    chainId: 8453,
    name: 'Base',
    shortName: 'BASE',
    rpcUrls: [
      process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      'https://base.llamarpc.com',
    ],
    blockExplorerUrl: 'https://basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      linkToken: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    },
    gasConfig: {
      maxPriorityFeePerGas: 1000000n, // 0.001 gwei
    },
    isTestnet: false,
    isActive: true,
  },

  // Arbitrum One
  42161: {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    rpcUrls: [
      process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
    ],
    blockExplorerUrl: 'https://arbiscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      linkToken: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4',
    },
    gasConfig: {
      maxPriorityFeePerGas: 10000000n, // 0.01 gwei
    },
    isTestnet: false,
    isActive: true,
  },

  // Optimism
  10: {
    chainId: 10,
    name: 'Optimism',
    shortName: 'OP',
    rpcUrls: [
      process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
      'https://optimism.llamarpc.com',
    ],
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      linkToken: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
    },
    gasConfig: {
      maxPriorityFeePerGas: 1000000n,
    },
    isTestnet: false,
    isActive: true,
  },

  // ==================== TESTNETS ====================

  // Sepolia
  11155111: {
    chainId: 11155111,
    name: 'Sepolia',
    shortName: 'SEP',
    rpcUrls: [
      process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia.publicnode.com',
      'https://rpc.sepolia.org',
    ],
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      donId: 'fun-ethereum-sepolia-1',
      linkToken: '0x779877A7B0D9E8603169DdbD7836e478b4624789',
    },
    gasConfig: {},
    isTestnet: true,
    isActive: true,
  },

  // Base Sepolia
  84532: {
    chainId: 84532,
    name: 'Base Sepolia',
    shortName: 'BASE-SEP',
    rpcUrls: [
      process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
    ],
    blockExplorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      donId: 'fun-base-sepolia-1',
      linkToken: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
    },
    gasConfig: {},
    isTestnet: true,
    isActive: true,
  },

  // Arbitrum Sepolia
  421614: {
    chainId: 421614,
    name: 'Arbitrum Sepolia',
    shortName: 'ARB-SEP',
    rpcUrls: [
      'https://sepolia-rollup.arbitrum.io/rpc',
    ],
    blockExplorerUrl: 'https://sepolia.arbiscan.io',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    contracts: {},
    chainlinkConfig: {
      linkToken: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E',
    },
    gasConfig: {},
    isTestnet: true,
    isActive: true,
  },
};

/**
 * Get chain configuration
 */
export function getChainConfig(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS[chainId];
}

/**
 * Get all active chains
 */
export function getActiveChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS).filter(chain => chain.isActive);
}

/**
 * Get mainnet chains only
 */
export function getMainnetChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS).filter(chain => chain.isActive && !chain.isTestnet);
}

/**
 * Get testnet chains only
 */
export function getTestnetChains(): ChainConfig[] {
  return Object.values(SUPPORTED_CHAINS).filter(chain => chain.isActive && chain.isTestnet);
}

/**
 * Check if chain is supported
 */
export function isChainSupported(chainId: number): boolean {
  return chainId in SUPPORTED_CHAINS && SUPPORTED_CHAINS[chainId].isActive;
}

/**
 * Get RPC URL for chain
 */
export function getRpcUrl(chainId: number): string | undefined {
  const chain = SUPPORTED_CHAINS[chainId];
  return chain?.rpcUrls[0];
}

/**
 * Get block explorer URL for transaction
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | undefined {
  const chain = SUPPORTED_CHAINS[chainId];
  return chain ? `${chain.blockExplorerUrl}/tx/${txHash}` : undefined;
}

/**
 * Get block explorer URL for address
 */
export function getExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = SUPPORTED_CHAINS[chainId];
  return chain ? `${chain.blockExplorerUrl}/address/${address}` : undefined;
}

// ============================================================================
// RPC Configuration Validation
// ============================================================================

const PUBLIC_RPC_PATTERNS = [
  'publicnode.com',
  'llamarpc.com',
  'rpc.sepolia.org',
  'polygon-rpc.com',
  'mainnet.base.org',
  'sepolia.base.org',
  'arb1.arbitrum.io',
  'mainnet.optimism.io',
  'eth.llamarpc.com',
  'sepolia-rollup.arbitrum.io',
];

function isPublicRpc(url: string): boolean {
  return PUBLIC_RPC_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Validate chain RPC configuration and log warnings for public RPCs.
 * Call from server startup to surface misconfiguration early.
 */
export function validateChainConfig(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const chainsUsingPublicRpc: string[] = [];

  for (const chain of Object.values(SUPPORTED_CHAINS)) {
    if (!chain.isActive) continue;

    const primaryRpc = chain.rpcUrls[0];
    if (primaryRpc && isPublicRpc(primaryRpc)) {
      chainsUsingPublicRpc.push(`${chain.name} (${chain.chainId}): ${primaryRpc}`);
    }
  }

  if (chainsUsingPublicRpc.length > 0) {
    const message = `Chains using public RPCs (rate-limited):\n  ${chainsUsingPublicRpc.join('\n  ')}`;
    if (isProd) {
      console.warn(`[chains] WARNING: ${message}\nSet dedicated RPC URLs via environment variables for production use.`);
    } else {
      console.info(`[chains] INFO: ${message}`);
    }
  }
}

export default SUPPORTED_CHAINS;
