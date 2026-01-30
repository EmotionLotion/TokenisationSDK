/**
 * CRE (Chainlink Runtime Environment) Project Configuration
 *
 * Defines the DON (Decentralised Oracle Network) configuration,
 * available capabilities, and workflow registry for the tokenisation platform.
 *
 * @packageDocumentation
 */

// ============================================================================
// DON Configuration
// ============================================================================

export interface DONConfig {
  /** Unique identifier for this DON */
  donId: string;
  /** Human-readable name */
  name: string;
  /** Target blockchain network */
  network: string;
  /** Chain ID for EVM target */
  chainId: number;
  /** RPC endpoint for the target chain */
  rpcUrl: string;
  /** Number of oracle nodes in the DON */
  nodeCount: number;
  /** Minimum consensus threshold (f+1) */
  consensusThreshold: number;
}

export const donConfig: DONConfig = {
  donId: process.env.CRE_DON_ID || 'tokenisation-don-01',
  name: 'Tokenisation NAV Oracle DON',
  network: process.env.CRE_NETWORK || 'ethereum-sepolia',
  chainId: parseInt(process.env.CRE_CHAIN_ID || '11155111', 10),
  rpcUrl: process.env.CRE_RPC_URL || 'https://rpc.sepolia.org',
  nodeCount: 5,
  consensusThreshold: 3,
};

// ============================================================================
// Capabilities
// ============================================================================

export interface HTTPCapability {
  type: 'http';
  /** Maximum request timeout in milliseconds */
  timeoutMs: number;
  /** Allowed HTTP methods */
  allowedMethods: ('GET' | 'POST' | 'PUT' | 'DELETE')[];
  /** Maximum response size in bytes */
  maxResponseBytes: number;
}

export interface EVMCapability {
  type: 'evm';
  /** Target chain ID */
  chainId: number;
  /** RPC endpoint */
  rpcUrl: string;
  /** Supported actions */
  actions: ('read' | 'write' | 'encode' | 'decode')[];
}

export interface CronCapability {
  type: 'cron';
  /** Minimum interval in seconds */
  minIntervalSeconds: number;
  /** Maximum concurrent executions */
  maxConcurrent: number;
}

export type Capability = HTTPCapability | EVMCapability | CronCapability;

export const capabilities: Record<string, Capability> = {
  http: {
    type: 'http',
    timeoutMs: 30_000,
    allowedMethods: ['GET', 'POST'],
    maxResponseBytes: 1_048_576, // 1 MB
  },
  evm: {
    type: 'evm',
    chainId: donConfig.chainId,
    rpcUrl: donConfig.rpcUrl,
    actions: ['read', 'write', 'encode', 'decode'],
  },
  cron: {
    type: 'cron',
    minIntervalSeconds: 60,
    maxConcurrent: 1,
  },
};

// ============================================================================
// Workflow Registry
// ============================================================================

export interface WorkflowRegistryEntry {
  /** Unique workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Path to the workflow module relative to src/ */
  module: string;
  /** Whether the workflow is enabled */
  enabled: boolean;
  /** Required capabilities */
  requiredCapabilities: string[];
  /** Optional description */
  description?: string;
}

export const workflowRegistry: WorkflowRegistryEntry[] = [
  {
    id: 'nav-calculation',
    name: 'NAV Calculation Workflow',
    module: './workflows/nav-calculation.js',
    enabled: true,
    requiredCapabilities: ['http', 'evm', 'cron'],
    description:
      'Periodically fetches property valuations, computes NAV per token, ' +
      'reports the result on-chain to the OracleRegistry contract, and ' +
      'posts to the server callback endpoint.',
  },
];

// ============================================================================
// Project-level export
// ============================================================================

export default {
  don: donConfig,
  capabilities,
  workflows: workflowRegistry,
};
