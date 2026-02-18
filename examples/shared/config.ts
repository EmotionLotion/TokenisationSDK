/**
 * Shared Configuration for Example Scripts
 *
 * Provides a unified SDK config that can run in mock mode (default)
 * or live mode (with --live flag and env vars).
 *
 * Usage:
 *   import { getSDKConfig } from '../shared/config.js';
 *   const sdk = new TokenisationSDK(getSDKConfig());
 *
 * Live mode:
 *   RPC_URL=https://... API_KEY=sk_... npx tsx src/index.ts --live
 */

export interface SDKConfig {
  apiKey?: string;
  rpcUrl?: string;
  chainId?: number;
  useMockPlugins: boolean;
  environment: 'development' | 'staging' | 'production';
}

export function getSDKConfig(): SDKConfig {
  const isLive = process.argv.includes('--live');
  const isTestnet = process.argv.includes('--testnet');

  if (isLive) {
    const rpcUrl = process.env.RPC_URL;
    const apiKey = process.env.API_KEY;

    if (!rpcUrl) {
      console.error('ERROR: --live mode requires RPC_URL environment variable');
      process.exit(1);
    }
    if (!apiKey) {
      console.error('ERROR: --live mode requires API_KEY environment variable');
      process.exit(1);
    }

    return {
      apiKey,
      rpcUrl,
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : undefined,
      useMockPlugins: false,
      environment: process.env.ENVIRONMENT as SDKConfig['environment'] || 'staging',
    };
  }

  if (isTestnet) {
    // Testnet mode: uses Sepolia defaults, requires RPC_URL
    const rpcUrl = process.env.RPC_URL || 'https://ethereum-sepolia.publicnode.com';
    return {
      apiKey: process.env.API_KEY,
      rpcUrl,
      chainId: parseInt(process.env.CHAIN_ID || '11155111'),
      useMockPlugins: false,
      environment: 'staging',
    };
  }

  // Default: mock mode for local development
  return {
    useMockPlugins: true,
    environment: 'development',
  };
}
