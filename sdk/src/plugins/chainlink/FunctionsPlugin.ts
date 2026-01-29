/**
 * Chainlink Functions Plugin
 *
 * Enables custom off-chain computations for COMET tokenization.
 * Replaces hardcoded values with dynamic oracle-verified calculations.
 *
 * Use cases:
 * - Safety score calculation from telematics events
 * - Carbon offset factor lookups
 * - Dynamic loyalty point multipliers
 */

import { ethers, type Provider, type Signer } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';
import type { TelematicsEventType } from '../../ahoy/plugins/TelematicsOracle.js';

// Chainlink Functions Router ABI (minimal)
const FUNCTIONS_ROUTER_ABI = [
  'function sendRequest(uint64 subscriptionId, bytes calldata data, uint16 dataVersion, uint32 callbackGasLimit, bytes32 donId) external returns (bytes32 requestId)',
  'function getSubscription(uint64 subscriptionId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] memory consumers)',
];

// Consumer contract ABI for receiving responses
const FUNCTIONS_CONSUMER_ABI = [
  'function sendRequest(string memory source, bytes memory encryptedSecretsUrls, uint8 donHostedSecretsSlotID, uint64 donHostedSecretsVersion, string[] memory args, bytes[] memory bytesArgs, uint64 subscriptionId, uint32 gasLimit, bytes32 donId) external returns (bytes32 requestId)',
  'function latestResponse() external view returns (bytes memory)',
  'function latestError() external view returns (bytes memory)',
  'function latestRequestId() external view returns (bytes32)',
  'event Response(bytes32 indexed requestId, bytes response, bytes err)',
];

// Chainlink Functions Router addresses by chain
const FUNCTIONS_ROUTERS: Record<number, string> = {
  // Base Sepolia (Testnet)
  84532: '0xf9B8fc078197181C841c296C876945aaa425B278',
  // Sepolia
  11155111: '0xb83E47C2bC239B3bf370bc41e1459A34b41238D0',
  // Polygon Mumbai
  80001: '0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C',
  // Avalanche Fuji
  43113: '0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0',
};

// DON IDs by chain
const DON_IDS: Record<number, string> = {
  84532: 'fun-base-sepolia-1',
  11155111: 'fun-ethereum-sepolia-1',
  80001: 'fun-polygon-mumbai-1',
  43113: 'fun-avalanche-fuji-1',
};

export interface FunctionsPluginConfig {
  chainId: number;
  rpcUrl: string;
  subscriptionId: bigint;
  consumerAddress: string;
  privateKey?: string; // For signing transactions
  gasLimit?: number;
  secretsUrls?: string; // Encrypted secrets URL
}

export interface FunctionsRequest {
  source: string;
  args?: string[];
  bytesArgs?: Uint8Array[];
  secretsSlotId?: number;
  secretsVersion?: bigint;
}

export interface FunctionsResponse {
  requestId: string;
  response: Uint8Array;
  error?: Uint8Array;
  decodedResponse?: unknown;
}

export interface SafetyScoreResult {
  score: number;
  eventBreakdown: Record<string, number>;
  calculatedAt: string;
  source: 'chainlink-functions';
}

export interface CarbonOffsetResult {
  offsetKg: number;
  factor: number;
  region: string;
  utilityType: string;
  calculatedAt: string;
  source: 'chainlink-functions';
}

export interface DLDVerificationResult {
  deedNumber: string;
  status: 'VALID' | 'EXPIRED' | 'DISPUTED' | 'NOT_FOUND';
  ownerName: string;
  propertyType: string;
  encumbrances: string[];
  verifiedAt: string;
  source: 'chainlink-functions';
}

/**
 * Chainlink Functions Plugin
 *
 * Executes custom JavaScript on Chainlink's Decentralized Oracle Network (DON)
 * to compute values that should not be hardcoded.
 */
export class ChainlinkFunctionsPlugin {
  readonly pluginId = 'chainlink-functions';

  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private subscriptionId: bigint;
  private consumerAddress: string;
  private gasLimit: number;
  private secretsUrls: string;
  private donId: string;
  private pendingRequests: Map<string, { resolve: (value: FunctionsResponse) => void; reject: (error: Error) => void }> = new Map();

  constructor(config: FunctionsPluginConfig) {
    this.chainId = config.chainId;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }

    this.subscriptionId = config.subscriptionId;
    this.consumerAddress = config.consumerAddress;
    this.gasLimit = config.gasLimit || 300000;
    this.secretsUrls = config.secretsUrls || '';
    this.donId = DON_IDS[config.chainId] || '';

    if (!this.donId) {
      console.warn(`No DON ID found for chain ${config.chainId}. Functions may not work.`);
    }
  }

  /**
   * Execute a Chainlink Functions request
   *
   * The response listener is attached BEFORE the transaction is sent to avoid
   * a race condition where the DON responds before the listener is registered.
   */
  async executeRequest(request: FunctionsRequest): Promise<Result<FunctionsResponse, string>> {
    if (!this.signer) {
      return err('Signer required for executing Functions requests');
    }

    try {
      const consumer = new ethers.Contract(
        this.consumerAddress,
        FUNCTIONS_CONSUMER_ABI,
        this.signer
      );

      // Attach the response listener BEFORE sending the transaction.
      // This prevents a race where the DON responds before the listener
      // is up, which would cause the response to be lost and the request
      // to timeout after 120 seconds.
      const responsePromise = this.waitForResponse(consumer, 120000);

      const tx = await consumer.sendRequest(
        request.source,
        this.secretsUrls ? ethers.toUtf8Bytes(this.secretsUrls) : '0x',
        request.secretsSlotId || 0,
        request.secretsVersion || 0n,
        request.args || [],
        request.bytesArgs || [],
        this.subscriptionId,
        this.gasLimit,
        ethers.encodeBytes32String(this.donId)
      );

      const receipt = await tx.wait();

      // Find the requestId from logs
      const requestEvent = receipt.logs.find(
        (log: ethers.Log) => log.topics[0] === ethers.id('RequestSent(bytes32)')
      );

      if (!requestEvent) {
        // Clean up the listener since we can't match a response without a requestId
        consumer.removeAllListeners('Response');
        return err('Request event not found in transaction logs');
      }

      const requestId = requestEvent.topics[1];

      // Now wait for the response that matches our requestId.
      // The listener was already capturing events since before the tx was sent,
      // so even if the DON responded instantly, the event is buffered.
      const response = await responsePromise.then(resolver => resolver(requestId));

      return ok(response);
    } catch (error) {
      return err(`Functions request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate safety score from telematics events using Chainlink Functions
   */
  async calculateSafetyScore(
    events: Array<{ type: TelematicsEventType; count: number }>
  ): Promise<Result<SafetyScoreResult, string>> {
    // JavaScript source for safety score calculation
    // This fetches current penalty weights from COMET API (not hardcoded)
    const source = `
      const events = JSON.parse(args[0]);

      // Fetch current penalty configuration from COMET API
      const penaltyResponse = await Functions.makeHttpRequest({
        url: 'https://api.comet.ahoy.dev/v1/config/safety-penalties',
        headers: { 'Content-Type': 'application/json' }
      });

      // Fallback to default if API unavailable
      const penalties = penaltyResponse.error ? {
        HARD_BRAKE: 2,
        RAPID_ACCELERATION: 1,
        SPEEDING: 5,
        HARSH_CORNERING: 2,
        IDLE_TIME: 0.5,
        ROUTE_DEVIATION: 1
      } : penaltyResponse.data;

      let score = 100;
      const breakdown = {};

      for (const event of events) {
        const penalty = penalties[event.type] || 0;
        const deduction = penalty * event.count;
        score -= deduction;
        breakdown[event.type] = event.count;
      }

      const result = {
        score: Math.max(0, Math.round(score * 100) / 100),
        breakdown: breakdown
      };

      return Functions.encodeString(JSON.stringify(result));
    `;

    const result = await this.executeRequest({
      source,
      args: [JSON.stringify(events)],
    });

    if (!result.success) {
      return err(result.error);
    }

    try {
      const decoded = JSON.parse(ethers.toUtf8String(result.data.response));
      return ok({
        score: decoded.score,
        eventBreakdown: decoded.breakdown,
        calculatedAt: new Date().toISOString(),
        source: 'chainlink-functions',
      });
    } catch (e) {
      return err('Failed to decode safety score response');
    }
  }

  /**
   * Calculate carbon offset using real emission factors from Chainlink Functions
   */
  async calculateCarbonOffset(
    utilityType: string,
    quantity: number,
    region: string = 'UAE'
  ): Promise<Result<CarbonOffsetResult, string>> {
    // JavaScript source for carbon offset calculation
    // Fetches real emission factors from climate APIs
    const source = `
      const [utilityType, quantity, region] = args;

      // Try to fetch from Climatiq API (requires secrets)
      let factor;
      try {
        const response = await Functions.makeHttpRequest({
          url: 'https://api.climatiq.io/data/v1/estimate',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          data: {
            emission_factor: {
              activity_id: utilityType === 'WATER' ? 'water-supply_water' :
                          utilityType === 'ELECTRICITY' ? 'electricity-energy_source_grid_mix' :
                          utilityType === 'GAS' ? 'fuel_type_natural_gas' :
                          'freight_vehicle_hgv_refrigerated',
              source: 'GHG Protocol',
              region: region
            },
            parameters: { energy: 1, energy_unit: 'kWh' }
          }
        });

        factor = response.data?.co2e || null;
      } catch (e) {
        factor = null;
      }

      // Fallback to regional defaults if API fails
      if (!factor) {
        const defaults = {
          UAE: { WATER: 0.0012, ELECTRICITY: 0.45, GAS: 2.0, COLD_CHAIN: 0.12 },
          EU: { WATER: 0.0008, ELECTRICITY: 0.25, GAS: 1.9, COLD_CHAIN: 0.08 },
          US: { WATER: 0.001, ELECTRICITY: 0.42, GAS: 1.95, COLD_CHAIN: 0.1 }
        };
        factor = defaults[region]?.[utilityType] || defaults.UAE[utilityType] || 0.5;
      }

      const offset = parseFloat(quantity) * factor;

      return Functions.encodeString(JSON.stringify({
        offsetKg: Math.round(offset * 1000) / 1000,
        factor: factor,
        utilityType: utilityType,
        region: region
      }));
    `;

    const result = await this.executeRequest({
      source,
      args: [utilityType, quantity.toString(), region],
    });

    if (!result.success) {
      return err(result.error);
    }

    try {
      const decoded = JSON.parse(ethers.toUtf8String(result.data.response));
      return ok({
        ...decoded,
        calculatedAt: new Date().toISOString(),
        source: 'chainlink-functions',
      });
    } catch (e) {
      return err('Failed to decode carbon offset response');
    }
  }

  /**
   * Get dynamic loyalty point multiplier based on current market conditions
   */
  async getLoyaltyMultiplier(
    tier: string,
    actionType: string
  ): Promise<Result<number, string>> {
    const source = `
      const [tier, actionType] = args;

      // Fetch current multiplier configuration
      const response = await Functions.makeHttpRequest({
        url: 'https://api.ahoy.dev/v1/config/loyalty-multipliers',
        headers: { 'Content-Type': 'application/json' }
      });

      const config = response.error ? {
        tierBonuses: { BRONZE: 0, SILVER: 0.05, GOLD: 0.1, PLATINUM: 0.2, DIAMOND: 0.3 },
        actionMultipliers: {
          PERFECT_DELIVERY: 1.0,
          OFF_PEAK_BOOKING: 1.5,
          ECO_FRIENDLY: 2.0,
          REFERRAL: 1.0
        }
      } : response.data;

      const tierBonus = config.tierBonuses[tier] || 0;
      const actionMult = config.actionMultipliers[actionType] || 1.0;

      const finalMultiplier = (1 + tierBonus) * actionMult;

      return Functions.encodeUint256(Math.round(finalMultiplier * 10000)); // 4 decimals
    `;

    const result = await this.executeRequest({
      source,
      args: [tier, actionType],
    });

    if (!result.success) {
      return err(result.error);
    }

    try {
      const value = ethers.toBigInt(result.data.response);
      return ok(Number(value) / 10000);
    } catch (e) {
      return err('Failed to decode loyalty multiplier response');
    }
  }

  /**
   * Verify a DLD title deed on-chain using Chainlink Functions
   */
  async verifyDLDDeed(
    deedNumber: string
  ): Promise<Result<DLDVerificationResult, string>> {
    const source = `
      const [deedNumber] = args;

      // Query DLD API for deed verification
      let deedData;
      try {
        const response = await Functions.makeHttpRequest({
          url: \`https://api.dld.gov.ae/v1/deeds/\${deedNumber}/verify\`,
          headers: { 'Content-Type': 'application/json' }
        });

        deedData = response.error ? null : response.data;
      } catch (e) {
        deedData = null;
      }

      // Fallback to secondary source
      if (!deedData) {
        try {
          const fallback = await Functions.makeHttpRequest({
            url: \`https://api.dubailand.gov.ae/v1/titles/\${deedNumber}\`,
            headers: { 'Content-Type': 'application/json' }
          });

          deedData = fallback.error ? null : fallback.data;
        } catch (e) {
          deedData = null;
        }
      }

      if (!deedData) {
        return Functions.encodeString(JSON.stringify({
          deedNumber: deedNumber,
          status: 'NOT_FOUND',
          ownerName: '',
          propertyType: '',
          encumbrances: [],
        }));
      }

      return Functions.encodeString(JSON.stringify({
        deedNumber: deedData.deedNumber || deedNumber,
        status: deedData.status || 'VALID',
        ownerName: deedData.ownerName || '',
        propertyType: deedData.propertyType || '',
        encumbrances: deedData.encumbrances || [],
      }));
    `;

    const result = await this.executeRequest({
      source,
      args: [deedNumber],
    });

    if (!result.success) {
      return err(result.error);
    }

    try {
      const decoded = JSON.parse(ethers.toUtf8String(result.data.response));
      return ok({
        ...decoded,
        verifiedAt: new Date().toISOString(),
        source: 'chainlink-functions',
      });
    } catch (e) {
      return err('Failed to decode DLD verification response');
    }
  }

  /**
   * Check subscription balance and status
   */
  async checkSubscription(): Promise<Result<{ balance: bigint; requestCount: bigint; owner: string }, string>> {
    try {
      const routerAddress = FUNCTIONS_ROUTERS[this.chainId];
      if (!routerAddress) {
        return err(`No router address for chain ${this.chainId}`);
      }

      const router = new ethers.Contract(routerAddress, FUNCTIONS_ROUTER_ABI, this.provider);
      const [balance, reqCount, owner] = await router.getSubscription(this.subscriptionId);

      return ok({
        balance: BigInt(balance.toString()),
        requestCount: BigInt(reqCount.toString()),
        owner,
      });
    } catch (error) {
      return err(`Failed to check subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set up a Response event listener that buffers all incoming events.
   *
   * Returns a function that, given a requestId, resolves with the matching
   * FunctionsResponse (or rejects on timeout). This two-phase design allows
   * the listener to be attached before the requestId is known (i.e. before
   * the transaction is sent), eliminating the race condition.
   */
  private waitForResponse(
    consumer: ethers.Contract,
    timeoutMs: number
  ): Promise<(requestId: string) => Promise<FunctionsResponse>> {
    // Buffer for events that arrive before we know the requestId
    const buffered: Array<{ requestId: string; response: Uint8Array; err: Uint8Array }> = [];
    let matchResolver: ((resp: FunctionsResponse) => void) | null = null;
    let targetRequestId: string | null = null;
    let settled = false;

    const handler = (respRequestId: string, response: Uint8Array, err: Uint8Array) => {
      if (settled) return;

      if (targetRequestId && respRequestId === targetRequestId) {
        settled = true;
        consumer.off('Response', handler);
        matchResolver!({
          requestId: targetRequestId,
          response,
          error: err.length > 0 ? err : undefined,
        });
      } else {
        // Buffer the event — the requestId might not be known yet
        buffered.push({ requestId: respRequestId, response, err });
      }
    };

    consumer.on('Response', handler);

    // Return a resolver function immediately (listener is already active)
    return Promise.resolve((requestId: string): Promise<FunctionsResponse> => {
      targetRequestId = requestId;

      // Check if the response already arrived while we were waiting for the tx
      const found = buffered.find(e => e.requestId === requestId);
      if (found) {
        settled = true;
        consumer.off('Response', handler);
        return Promise.resolve({
          requestId,
          response: found.response,
          error: found.err.length > 0 ? found.err : undefined,
        });
      }

      return new Promise<FunctionsResponse>((resolve, reject) => {
        matchResolver = resolve;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            consumer.off('Response', handler);
            reject(new Error(`Functions request timed out after ${timeoutMs}ms for requestId ${requestId}`));
          }
        }, timeoutMs);

        // If already settled by the handler between the buffer check and now
        if (settled) {
          clearTimeout(timeout);
        }
      });
    });
  }

  /**
   * Get router address for current chain
   */
  getRouterAddress(): string | undefined {
    return FUNCTIONS_ROUTERS[this.chainId];
  }

  /**
   * Get DON ID for current chain
   */
  getDonId(): string {
    return this.donId;
  }
}

// Factory functions
export function createFunctionsPlugin(config: FunctionsPluginConfig): ChainlinkFunctionsPlugin {
  return new ChainlinkFunctionsPlugin(config);
}

export function createBaseSepoliaFunctionsPlugin(
  subscriptionId: bigint,
  consumerAddress: string,
  privateKey?: string
): ChainlinkFunctionsPlugin {
  return new ChainlinkFunctionsPlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    subscriptionId,
    consumerAddress,
    privateKey,
  });
}

export function createSepoliaFunctionsPlugin(
  subscriptionId: bigint,
  consumerAddress: string,
  privateKey?: string
): ChainlinkFunctionsPlugin {
  return new ChainlinkFunctionsPlugin({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    subscriptionId,
    consumerAddress,
    privateKey,
  });
}

export default ChainlinkFunctionsPlugin;
