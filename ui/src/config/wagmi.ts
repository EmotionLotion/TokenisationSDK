/**
 * Wagmi Configuration
 *
 * Configures wallet connections for the AHOY Platform.
 * Supports Base, Polygon, and Ethereum networks.
 */

import { createConfig, http } from 'wagmi';
import { base, polygon, mainnet, baseSepolia, polygonAmoy, sepolia } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

// WalletConnect project ID (get yours at https://cloud.walletconnect.com)
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id';

// API server URL
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Supported chains
export const supportedChains = [
  base,
  polygon,
  mainnet,
  baseSepolia,
  polygonAmoy,
  sepolia,
] as const;

// Wagmi config
export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    walletConnect({
      projectId: WALLETCONNECT_PROJECT_ID,
      showQrModal: true,
      metadata: {
        name: 'AHOY Platform',
        description: 'Unified Tokenisation Platform',
        url: 'https://ahoy.io',
        icons: ['https://ahoy.io/icon.png'],
      },
    }),
    coinbaseWallet({
      appName: 'AHOY Platform',
      appLogoUrl: 'https://ahoy.io/icon.png',
    }),
  ],
  transports: {
    [base.id]: http(),
    [polygon.id]: http(),
    [mainnet.id]: http(),
    [baseSepolia.id]: http(),
    [polygonAmoy.id]: http(),
    [sepolia.id]: http(),
  },
});

// Chain metadata for UI
export const chainMetadata = {
  [base.id]: {
    name: 'Base',
    icon: '🔵',
    isDefault: true,
    isTestnet: false,
  },
  [polygon.id]: {
    name: 'Polygon',
    icon: '💜',
    isDefault: false,
    isTestnet: false,
  },
  [mainnet.id]: {
    name: 'Ethereum',
    icon: '⟠',
    isDefault: false,
    isTestnet: false,
  },
  [baseSepolia.id]: {
    name: 'Base Sepolia',
    icon: '🔵',
    isDefault: false,
    isTestnet: true,
  },
  [polygonAmoy.id]: {
    name: 'Polygon Amoy',
    icon: '💜',
    isDefault: false,
    isTestnet: true,
  },
  [sepolia.id]: {
    name: 'Sepolia',
    icon: '⟠',
    isDefault: false,
    isTestnet: true,
  },
};

// Get default chain
export function getDefaultChain() {
  return base;
}

// Check if chain is supported
export function isChainSupported(chainId: number): boolean {
  return supportedChains.some(chain => chain.id === chainId);
}

// Get chain by ID
export function getChain(chainId: number) {
  return supportedChains.find(chain => chain.id === chainId);
}

export type SupportedChainId = (typeof supportedChains)[number]['id'];
