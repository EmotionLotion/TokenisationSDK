/**
 * NAV Calculation CRE Workflow
 *
 * A Chainlink Runtime Environment workflow that:
 *   1. Triggers on a configurable cron schedule (hourly or daily).
 *   2. Fetches property valuations from external API endpoints via HTTP.
 *   3. Reads current token supply from the on-chain token contract via EVM.
 *   4. Computes NAV = (total_asset_value - liabilities) / total_supply.
 *   5. Reports the result on-chain to the OracleRegistry contract.
 *   6. POSTs the result to the server callback endpoint.
 *
 * @packageDocumentation
 */

import {
  Workflow,
  CronTrigger,
  HTTPClient,
  EVMClient,
} from '@chainlink/cre-sdk';

// ============================================================================
// TYPES
// ============================================================================

/** Configuration for the NAV calculation workflow */
export interface NAVWorkflowConfig {
  /** Cron schedule expression (e.g. "0 * * * *" for hourly) */
  cronSchedule: string;
  /** Schedule mode label */
  scheduleMode: 'hourly' | 'daily' | 'custom';
  /** Asset ID in the tokenisation platform */
  assetId: string;
  /** API endpoints to fetch property valuations */
  valuationEndpoints: ValuationEndpointConfig[];
  /** Known liabilities to subtract from gross asset value (in base currency units) */
  liabilities: string;
  /** On-chain token contract address */
  tokenContractAddress: string;
  /** Chain ID for the token contract */
  chainId: number;
  /** RPC URL for the target chain */
  rpcUrl: string;
  /** OracleRegistry contract address where NAV is reported */
  oracleRegistryAddress: string;
  /** Server callback URL for posting results */
  callbackUrl: string;
  /** API key for authenticating with the callback endpoint */
  callbackApiKey: string;
  /** Currency denomination for the NAV (e.g. "USD", "AED") */
  currency: string;
  /** Number of decimals for NAV precision */
  decimals: number;
}

/** Configuration for a single valuation data source */
export interface ValuationEndpointConfig {
  /** Human-readable name of the data source */
  name: string;
  /** URL to fetch valuations from */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Optional headers (e.g. API keys) */
  headers?: Record<string, string>;
  /** Optional request body for POST endpoints */
  body?: Record<string, unknown>;
  /** JSONPath expression to extract the valuation from the response */
  valuePath: string;
  /** Weight for weighted-average aggregation (0-1) */
  weight: number;
}

/** Response from a valuation endpoint */
export interface ValuationResponse {
  sourceName: string;
  value: bigint;
  weight: number;
  timestamp: number;
  raw: unknown;
}

/** ABI fragment for ERC-20 totalSupply() */
const ERC20_TOTAL_SUPPLY_ABI = [
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/** ABI fragment for OracleRegistry.reportNAV() */
const ORACLE_REGISTRY_REPORT_ABI = [
  {
    inputs: [
      { name: 'assetId', type: 'bytes32' },
      { name: 'navPerToken', type: 'uint256' },
      { name: 'totalAssetValue', type: 'uint256' },
      { name: 'totalSupply', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    name: 'reportNAV',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/** NAV computation result */
export interface NAVResult {
  assetId: string;
  navPerToken: string;
  totalAssetValue: string;
  liabilities: string;
  netAssetValue: string;
  totalSupply: string;
  currency: string;
  decimals: number;
  valuationSources: Array<{
    name: string;
    value: string;
    weight: number;
    timestamp: number;
  }>;
  computedAt: string;
  txHash?: string;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: NAVWorkflowConfig = {
  cronSchedule: process.env.NAV_CRON_SCHEDULE || '0 * * * *',
  scheduleMode: (process.env.NAV_SCHEDULE_MODE as 'hourly' | 'daily') || 'hourly',
  assetId: process.env.NAV_ASSET_ID || '',
  valuationEndpoints: JSON.parse(
    process.env.NAV_VALUATION_ENDPOINTS || '[]'
  ) as ValuationEndpointConfig[],
  liabilities: process.env.NAV_LIABILITIES || '0',
  tokenContractAddress: process.env.NAV_TOKEN_CONTRACT || '',
  chainId: parseInt(process.env.NAV_CHAIN_ID || '11155111', 10),
  rpcUrl: process.env.NAV_RPC_URL || 'https://rpc.sepolia.org',
  oracleRegistryAddress: process.env.NAV_ORACLE_REGISTRY || '',
  callbackUrl: process.env.NAV_CALLBACK_URL || 'http://localhost:3000/api/v1/assets/__ASSET_ID__/nav/callback',
  callbackApiKey: process.env.NAV_CALLBACK_API_KEY || '',
  currency: process.env.NAV_CURRENCY || 'USD',
  decimals: parseInt(process.env.NAV_DECIMALS || '18', 10),
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract a nested value from an object using a dot-separated path.
 * Supports array indexing with bracket notation, e.g. "data.results[0].value".
 */
function extractByPath(obj: unknown, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Convert a value to bigint with the given number of decimals.
 * Handles string, number, and bigint inputs.
 */
function toBigIntWithDecimals(value: unknown, decimals: number): bigint {
  if (typeof value === 'bigint') return value;

  const numStr = String(value);
  const parts = numStr.split('.');
  const intPart = parts[0] || '0';
  const fracPart = (parts[1] || '').padEnd(decimals, '0').slice(0, decimals);

  return BigInt(intPart + fracPart);
}

/**
 * Encode an asset ID string as bytes32.
 */
function encodeAssetIdBytes32(assetId: string): string {
  // Pad to 32 bytes hex (64 chars)
  const hex = Buffer.from(assetId, 'utf-8').toString('hex');
  return '0x' + hex.padEnd(64, '0');
}

// ============================================================================
// WORKFLOW STEPS
// ============================================================================

/**
 * Step 1: Fetch property valuations from all configured endpoints.
 * Uses the CRE HTTP capability to make requests from the DON.
 */
async function fetchValuations(
  http: HTTPClient,
  endpoints: ValuationEndpointConfig[],
  decimals: number
): Promise<ValuationResponse[]> {
  const results: ValuationResponse[] = [];

  for (const endpoint of endpoints) {
    try {
      const response =
        endpoint.method === 'POST'
          ? await http.post(endpoint.url, {
              headers: {
                'Content-Type': 'application/json',
                ...endpoint.headers,
              },
              body: JSON.stringify(endpoint.body || {}),
            })
          : await http.get(endpoint.url, {
              headers: endpoint.headers || {},
            });

      const data = JSON.parse(response.body);
      const rawValue = extractByPath(data, endpoint.valuePath);

      if (rawValue === undefined || rawValue === null) {
        console.error(
          `[NAV] Failed to extract value from ${endpoint.name} using path "${endpoint.valuePath}"`
        );
        continue;
      }

      results.push({
        sourceName: endpoint.name,
        value: toBigIntWithDecimals(rawValue, decimals),
        weight: endpoint.weight,
        timestamp: Math.floor(Date.now() / 1000),
        raw: data,
      });
    } catch (error) {
      console.error(
        `[NAV] Error fetching valuation from ${endpoint.name}:`,
        error
      );
      // Continue with remaining sources; partial data is acceptable
    }
  }

  return results;
}

/**
 * Step 2: Read the current total token supply from the on-chain contract.
 */
async function readTotalSupply(
  evm: EVMClient,
  tokenContractAddress: string,
  chainId: number
): Promise<bigint> {
  const result = await evm.readContract({
    address: tokenContractAddress,
    abi: ERC20_TOTAL_SUPPLY_ABI,
    functionName: 'totalSupply',
    args: [],
    chainId,
  });

  return BigInt(result.toString());
}

/**
 * Step 3: Compute the NAV per token.
 *
 * Formula: NAV = (total_asset_value - liabilities) / total_supply
 *
 * All arithmetic uses bigint to avoid floating-point precision issues.
 * The result is scaled to the configured number of decimals.
 */
function computeNAV(
  valuations: ValuationResponse[],
  liabilities: bigint,
  totalSupply: bigint,
  decimals: number
): { navPerToken: bigint; totalAssetValue: bigint; netAssetValue: bigint } {
  if (valuations.length === 0) {
    throw new Error('No valuations available to compute NAV');
  }

  if (totalSupply === 0n) {
    throw new Error('Total supply is zero; cannot compute NAV per token');
  }

  // Weighted average of valuations
  const scaleFactor = 10n ** BigInt(decimals);
  let weightedSum = 0n;
  let totalWeight = 0n;

  for (const v of valuations) {
    const weightBig = BigInt(Math.round(v.weight * 10000));
    weightedSum += v.value * weightBig;
    totalWeight += weightBig;
  }

  const totalAssetValue =
    totalWeight > 0n ? weightedSum / totalWeight : 0n;

  // net = gross - liabilities
  const netAssetValue =
    totalAssetValue > liabilities ? totalAssetValue - liabilities : 0n;

  // NAV per token = netAssetValue * scaleFactor / totalSupply
  const navPerToken = (netAssetValue * scaleFactor) / totalSupply;

  return { navPerToken, totalAssetValue, netAssetValue };
}

/**
 * Step 4: Report the NAV result on-chain to the OracleRegistry contract.
 */
async function reportOnChain(
  evm: EVMClient,
  config: NAVWorkflowConfig,
  navPerToken: bigint,
  totalAssetValue: bigint,
  totalSupply: bigint
): Promise<string> {
  const assetIdBytes32 = encodeAssetIdBytes32(config.assetId);
  const timestamp = BigInt(Math.floor(Date.now() / 1000));

  const txResult = await evm.writeContract({
    address: config.oracleRegistryAddress,
    abi: ORACLE_REGISTRY_REPORT_ABI,
    functionName: 'reportNAV',
    args: [assetIdBytes32, navPerToken, totalAssetValue, totalSupply, timestamp],
    chainId: config.chainId,
  });

  return txResult.transactionHash;
}

/**
 * Step 5: POST the NAV result to the server callback endpoint.
 */
async function postCallback(
  http: HTTPClient,
  config: NAVWorkflowConfig,
  result: NAVResult
): Promise<void> {
  const url = config.callbackUrl.replace('__ASSET_ID__', config.assetId);

  await http.post(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.callbackApiKey,
      'x-cre-workflow': 'nav-calculation',
    },
    body: JSON.stringify(result),
  });
}

// ============================================================================
// WORKFLOW DEFINITION
// ============================================================================

/**
 * NAV Calculation Workflow
 *
 * Registered with the CRE runtime and triggered by the cron capability.
 * Orchestrates the full NAV calculation pipeline:
 *   fetch valuations -> read supply -> compute NAV -> report on-chain -> callback
 */
const navCalculationWorkflow = new Workflow({
  id: 'nav-calculation',
  name: 'NAV Calculation',
  description:
    'Periodically calculates Net Asset Value per token and reports on-chain',

  trigger: new CronTrigger({
    schedule: DEFAULT_CONFIG.cronSchedule,
    label: `NAV ${DEFAULT_CONFIG.scheduleMode} calculation`,
  }),

  capabilities: ['http', 'evm', 'cron'],

  async execute(context) {
    const config: NAVWorkflowConfig = {
      ...DEFAULT_CONFIG,
      // Allow runtime overrides from workflow context / secrets
      ...((context.config as Partial<NAVWorkflowConfig>) || {}),
    };

    const http: HTTPClient = context.getCapability('http');
    const evm: EVMClient = context.getCapability('evm');

    console.log(
      `[NAV] Starting NAV calculation for asset ${config.assetId} at ${new Date().toISOString()}`
    );

    // ---- Step 1: Fetch valuations ----
    console.log(
      `[NAV] Fetching valuations from ${config.valuationEndpoints.length} source(s)`
    );
    const valuations = await fetchValuations(
      http,
      config.valuationEndpoints,
      config.decimals
    );

    if (valuations.length === 0) {
      throw new Error(
        `No valuations returned for asset ${config.assetId}. Aborting.`
      );
    }

    console.log(
      `[NAV] Received ${valuations.length} valuation(s): ${valuations.map((v) => `${v.sourceName}=${v.value}`).join(', ')}`
    );

    // ---- Step 2: Read total supply ----
    console.log(
      `[NAV] Reading total supply from ${config.tokenContractAddress} on chain ${config.chainId}`
    );
    const totalSupply = await readTotalSupply(
      evm,
      config.tokenContractAddress,
      config.chainId
    );
    console.log(`[NAV] Total supply: ${totalSupply.toString()}`);

    // ---- Step 3: Compute NAV ----
    const liabilities = BigInt(config.liabilities);
    const { navPerToken, totalAssetValue, netAssetValue } = computeNAV(
      valuations,
      liabilities,
      totalSupply,
      config.decimals
    );

    console.log(
      `[NAV] Computed: totalAssetValue=${totalAssetValue}, liabilities=${liabilities}, netAssetValue=${netAssetValue}, navPerToken=${navPerToken}`
    );

    // ---- Step 4: Report on-chain ----
    let txHash: string | undefined;
    if (config.oracleRegistryAddress) {
      console.log(
        `[NAV] Reporting to OracleRegistry at ${config.oracleRegistryAddress}`
      );
      txHash = await reportOnChain(
        evm,
        config,
        navPerToken,
        totalAssetValue,
        totalSupply
      );
      console.log(`[NAV] On-chain report tx: ${txHash}`);
    } else {
      console.log('[NAV] No OracleRegistry address configured; skipping on-chain report');
    }

    // ---- Build result object ----
    const result: NAVResult = {
      assetId: config.assetId,
      navPerToken: navPerToken.toString(),
      totalAssetValue: totalAssetValue.toString(),
      liabilities: liabilities.toString(),
      netAssetValue: netAssetValue.toString(),
      totalSupply: totalSupply.toString(),
      currency: config.currency,
      decimals: config.decimals,
      valuationSources: valuations.map((v) => ({
        name: v.sourceName,
        value: v.value.toString(),
        weight: v.weight,
        timestamp: v.timestamp,
      })),
      computedAt: new Date().toISOString(),
      txHash,
    };

    // ---- Step 5: POST to server callback ----
    if (config.callbackUrl && config.callbackApiKey) {
      console.log(`[NAV] Posting result to callback: ${config.callbackUrl}`);
      await postCallback(http, config, result);
      console.log('[NAV] Callback delivered successfully');
    } else {
      console.log('[NAV] No callback URL/key configured; skipping callback');
    }

    console.log(
      `[NAV] Workflow complete. NAV per token = ${navPerToken.toString()} (${config.currency})`
    );

    return result;
  },
});

export default navCalculationWorkflow;
