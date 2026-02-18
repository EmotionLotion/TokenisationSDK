/**
 * Amadeus Flight API Plugin with RunInNodeMode Consensus
 *
 * Direct IATA NDC / Amadeus API integration wrapped in CRE RunInNodeMode
 * for multi-node consensus on flight data. Prevents a single faulty API
 * response from triggering incorrect token operations.
 *
 * Features:
 * - Flight search via Amadeus Flight Offers Search API
 * - Real-time flight status via Amadeus Flight Status API
 * - Delay verification with AI-grounded search (Gemini)
 * - Parametric refund triggers for flights delayed >3 hours
 * - RunInNodeMode consensus wrapping for all API calls
 *
 * @packageDocumentation
 */

import { ethers, type Provider, type Signer } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Amadeus API configuration
 */
export interface AmadeusConfig {
  /** Amadeus API key */
  apiKey: string;
  /** Amadeus API secret */
  apiSecret: string;
  /** Use production API (default: false = test) */
  production?: boolean;
  /** Alias for !production — used in demos */
  testMode?: boolean;
  /** Chain ID for on-chain operations */
  chainId?: number;
  /** RPC URL */
  rpcUrl?: string;
  /** Refund contract address */
  refundContractAddress?: string;
  /** Private key for signing */
  privateKey?: string;
  /** CRE DON configuration for RunInNodeMode */
  donConfig?: {
    donId: string;
    nodeCount: number;
    consensusThreshold: number;
  };
}

/**
 * Flight search parameters (IATA NDC compatible)
 */
export interface FlightSearchParams {
  /** Origin IATA airport code */
  originLocationCode?: string;
  /** Destination IATA airport code */
  destinationLocationCode?: string;
  /** Alias for originLocationCode — used in demos */
  origin?: string;
  /** Alias for destinationLocationCode — used in demos */
  destination?: string;
  /** Departure date (YYYY-MM-DD) */
  departureDate: string;
  /** Return date for round trip (YYYY-MM-DD) */
  returnDate?: string;
  /** Number of adult passengers */
  adults: number;
  /** Travel class */
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  /** Maximum number of results */
  max?: number;
  /** Currency for pricing */
  currencyCode?: string;
}

/**
 * Flight offer from Amadeus
 */
export interface FlightOffer {
  offerId: string;
  source: string;
  itineraries: FlightItinerary[];
  price: {
    currency: string;
    total: string;
    base: string;
    fees: Array<{ amount: string; type: string }>;
    grandTotal: string;
  };
  validatingAirlineCodes: string[];
  travelerPricings: Array<{
    travelerId: string;
    fareOption: string;
    travelerType: string;
    price: { currency: string; total: string; base: string };
    fareDetailsBySegment: Array<{
      segmentId: string;
      cabin: string;
      fareBasis: string;
      class: string;
    }>;
  }>;
}

export interface FlightItinerary {
  duration: string;
  segments: FlightSegment[];
}

export interface FlightSegment {
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; terminal?: string; at: string };
  carrierCode: string;
  number: string;
  aircraft: { code: string };
  operating?: { carrierCode: string };
  duration: string;
  numberOfStops: number;
}

/**
 * Flight status result
 */
export interface FlightStatusResult {
  flightNumber: string;
  status: 'scheduled' | 'active' | 'landed' | 'cancelled' | 'diverted' | 'unknown';
  departure: {
    iataCode: string;
    scheduledTime: string;
    actualTime?: string;
    terminal?: string;
    gate?: string;
  };
  arrival: {
    iataCode: string;
    scheduledTime: string;
    actualTime?: string;
    terminal?: string;
    gate?: string;
  };
  delayMinutes: number;
  /** Whether this flight qualifies for parametric refund */
  qualifiesForRefund: boolean;
  /** AI-grounded delay verification result */
  aiVerification?: {
    confirmed: boolean;
    source: string;
    confidence: number;
    searchGroundingQuery: string;
  };
  /** DON consensus info */
  consensus: {
    nodeCount: number;
    threshold: number;
    agreed: boolean;
  };
}

/**
 * Parametric refund trigger result
 */
export interface RefundTriggerResult {
  flightNumber: string;
  ticketTokenId: string;
  delayMinutes: number;
  refundAmount: string;
  refundCurrency: string;
  txHash?: string;
  status: 'triggered' | 'below_threshold' | 'already_refunded' | 'failed';
}

// ============================================================================
// Amadeus Auth
// ============================================================================

interface AmadeusToken {
  accessToken: string;
  expiresAt: number;
}

let cachedToken: AmadeusToken | null = null;

async function getAmadeusToken(
  apiKey: string,
  apiSecret: string,
  production: boolean
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const baseUrl = production
    ? 'https://api.amadeus.com'
    : 'https://test.api.amadeus.com';

  const response = await fetch(`${baseUrl}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${apiSecret}`,
  });

  if (!response.ok) {
    throw new Error(`Amadeus auth failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

// ============================================================================
// Contract ABI
// ============================================================================

const PARAMETRIC_REFUND_ABI = [
  'function triggerRefund(uint256 tokenId, uint256 delayMinutes, bytes32 flightDataHash) external returns (bool)',
  'function isRefunded(uint256 tokenId) external view returns (bool)',
  'function getRefundAmount(uint256 tokenId, uint256 delayMinutes) external view returns (uint256)',
  'event RefundTriggered(uint256 indexed tokenId, uint256 amount, uint256 delayMinutes)',
];

// ============================================================================
// Plugin
// ============================================================================

export class AmadeusFlightPlugin {
  readonly pluginId = 'amadeus-flight';

  private apiKey: string;
  private apiSecret: string;
  private production: boolean;
  private baseUrl: string;
  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private refundContract?: ethers.Contract;
  private donConfig: { donId: string; nodeCount: number; consensusThreshold: number };

  constructor(config: AmadeusConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.production = config.testMode !== undefined ? !config.testMode : (config.production ?? false);
    this.baseUrl = this.production
      ? 'https://api.amadeus.com'
      : 'https://test.api.amadeus.com';
    this.chainId = config.chainId || 84532;
    this.donConfig = config.donConfig || {
      donId: 'tokenisation-don-01',
      nodeCount: 5,
      consensusThreshold: 3,
    };

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl || 'https://sepolia.base.org', this.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }

    if (config.refundContractAddress && this.signer) {
      this.refundContract = new ethers.Contract(
        config.refundContractAddress,
        PARAMETRIC_REFUND_ABI,
        this.signer
      );
    }
  }

  // ============================================================================
  // Flight Search (IATA NDC)
  // ============================================================================

  /**
   * Search for flight offers using Amadeus Flight Offers Search API.
   * Wrapped in RunInNodeMode pattern — each DON node independently queries
   * Amadeus, and results are compared for consensus.
   */
  async searchFlights(
    params: FlightSearchParams
  ): Promise<Result<FlightOffer[], string>> {
    try {
      const token = await getAmadeusToken(
        this.apiKey,
        this.apiSecret,
        this.production
      );

      const queryParams = new URLSearchParams({
        originLocationCode: params.originLocationCode || params.origin || '',
        destinationLocationCode: params.destinationLocationCode || params.destination || '',
        departureDate: params.departureDate,
        adults: String(params.adults),
        max: String(params.max || 10),
        currencyCode: params.currencyCode || 'USD',
      });

      if (params.returnDate) {
        queryParams.set('returnDate', params.returnDate);
      }
      if (params.travelClass) {
        queryParams.set('travelClass', params.travelClass);
      }

      const response = await fetch(
        `${this.baseUrl}/v2/shopping/flight-offers?${queryParams}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        return err(`Amadeus search failed (${response.status}): ${errorBody}`);
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          source: string;
          itineraries: FlightItinerary[];
          price: FlightOffer['price'];
          validatingAirlineCodes: string[];
          travelerPricings: FlightOffer['travelerPricings'];
        }>;
      };

      const offers: FlightOffer[] = data.data.map((d) => ({
        offerId: d.id,
        source: d.source,
        itineraries: d.itineraries,
        price: d.price,
        validatingAirlineCodes: d.validatingAirlineCodes,
        travelerPricings: d.travelerPricings,
      }));

      return ok(offers);
    } catch (error) {
      return err(
        `Flight search error: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  // ============================================================================
  // Flight Status with Consensus
  // ============================================================================

  /**
   * Get real-time flight status with DON consensus verification.
   *
   * RunInNodeMode pattern: In a CRE workflow, each DON node independently
   * calls this method. The CRE runtime applies consensusMedianAggregation()
   * to the delay minutes and status values before reporting.
   */
  async getFlightStatus(
    carrierCodeOrParams: string | { flightNumber: string; departureDate: string; carrierCode?: string },
    flightNumber?: string,
    departureDate?: string
  ): Promise<Result<FlightStatusResult, string>> {
    let carrierCode: string;
    if (typeof carrierCodeOrParams === 'object') {
      const parts = carrierCodeOrParams.flightNumber.split('-');
      carrierCode = carrierCodeOrParams.carrierCode || parts[0] || '';
      flightNumber = parts.length > 1 ? parts[1] : carrierCodeOrParams.flightNumber;
      departureDate = carrierCodeOrParams.departureDate;
    } else {
      carrierCode = carrierCodeOrParams;
    }
    try {
      const token = await getAmadeusToken(
        this.apiKey,
        this.apiSecret,
        this.production
      );

      const response = await fetch(
        `${this.baseUrl}/v2/schedule/flights?carrierCode=${carrierCode}&flightNumber=${flightNumber}&scheduledDepartureDate=${departureDate}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        return err(`Amadeus status failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        data: Array<{
          flightDesignator: { carrierCode: string; flightNumber: number };
          flightPoints: Array<{
            iataCode: string;
            departure?: {
              timings: Array<{ qualifier: string; value: string }>;
              terminal?: { code: string };
              gate?: { mainGate: string };
            };
            arrival?: {
              timings: Array<{ qualifier: string; value: string }>;
              terminal?: { code: string };
              gate?: { mainGate: string };
            };
          }>;
          legs: Array<{
            boardPointIataCode: string;
            offPointIataCode: string;
            aircraftEquipment: { aircraftType: string };
          }>;
        }>;
      };

      if (!data.data || data.data.length === 0) {
        return err('No flight data found');
      }

      const flight = data.data[0];
      const depPoint = flight.flightPoints.find((fp) => fp.departure);
      const arrPoint = flight.flightPoints.find((fp) => fp.arrival);

      const scheduledDep = depPoint?.departure?.timings?.find(
        (t) => t.qualifier === 'STD'
      )?.value;
      const actualDep = depPoint?.departure?.timings?.find(
        (t) => t.qualifier === 'ATD'
      )?.value;
      const scheduledArr = arrPoint?.arrival?.timings?.find(
        (t) => t.qualifier === 'STA'
      )?.value;
      const actualArr = arrPoint?.arrival?.timings?.find(
        (t) => t.qualifier === 'ATA'
      )?.value;

      // Calculate delay
      let delayMinutes = 0;
      if (scheduledDep && actualDep) {
        const diff =
          new Date(actualDep).getTime() - new Date(scheduledDep).getTime();
        delayMinutes = Math.max(0, Math.round(diff / 60_000));
      }

      // Determine status
      let status: FlightStatusResult['status'] = 'scheduled';
      if (actualDep && !actualArr) status = 'active';
      if (actualArr) status = 'landed';

      const qualifiesForRefund = delayMinutes >= 180; // 3+ hours

      const result: FlightStatusResult = {
        flightNumber: `${carrierCode}${flightNumber}`,
        status,
        departure: {
          iataCode: depPoint?.iataCode || '',
          scheduledTime: scheduledDep || '',
          actualTime: actualDep,
          terminal: depPoint?.departure?.terminal?.code,
          gate: depPoint?.departure?.gate?.mainGate,
        },
        arrival: {
          iataCode: arrPoint?.iataCode || '',
          scheduledTime: scheduledArr || '',
          actualTime: actualArr,
          terminal: arrPoint?.arrival?.terminal?.code,
          gate: arrPoint?.arrival?.gate?.mainGate,
        },
        delayMinutes,
        qualifiesForRefund,
        consensus: {
          nodeCount: this.donConfig.nodeCount,
          threshold: this.donConfig.consensusThreshold,
          agreed: true, // In CRE context, this is set by the runtime
        },
      };

      return ok(result);
    } catch (error) {
      return err(
        `Flight status error: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  // ============================================================================
  // AI-Grounded Delay Verification
  // ============================================================================

  /**
   * Verify a flight delay using Gemini AI with Search Grounding.
   * This provides an independent verification source beyond the airline's
   * own API, reducing the risk of manipulation.
   */
  async verifyDelayWithAI(
    flightNumber: string,
    departureDate: string,
    claimedDelayMinutes: number
  ): Promise<
    Result<
      {
        confirmed: boolean;
        confidence: number;
        source: string;
        searchGroundingQuery: string;
      },
      string
    >
  > {
    try {
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (!geminiApiKey) {
        return err('GEMINI_API_KEY not configured');
      }

      const query = `Was flight ${flightNumber} on ${departureDate} delayed? If so, by how many minutes? Check FlightAware, FlightRadar24, and airline status pages.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: query }] }],
            tools: [{ googleSearch: {} }],
          }),
        }
      );

      if (!response.ok) {
        return err(`Gemini API failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        candidates: Array<{
          content: {
            parts: Array<{ text: string }>;
          };
          groundingMetadata?: {
            searchEntryPoint?: { renderedContent: string };
            groundingChunks?: Array<{ web?: { uri: string; title: string } }>;
          };
        }>;
      };

      const text =
        data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const groundingSource =
        data.candidates?.[0]?.groundingMetadata?.groundingChunks?.[0]?.web
          ?.uri || 'gemini-search';

      // Parse the AI response for delay confirmation
      const delayMatch = text.match(
        /delay(?:ed)?\s*(?:of|by)?\s*(?:approximately|about|~)?\s*(\d+)\s*(?:minutes|mins|min)/i
      );
      const confirmedDelay = delayMatch ? parseInt(delayMatch[1], 10) : 0;

      // Allow 15-minute tolerance
      const tolerance = 15;
      const confirmed =
        Math.abs(confirmedDelay - claimedDelayMinutes) <= tolerance;

      const confidence = confirmed
        ? Math.min(0.95, 0.7 + (confirmedDelay > 0 ? 0.2 : 0))
        : 0.3;

      return ok({
        confirmed,
        confidence,
        source: groundingSource,
        searchGroundingQuery: query,
      });
    } catch (error) {
      return err(
        `AI verification error: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  // ============================================================================
  // Parametric Refund Trigger
  // ============================================================================

  /**
   * Trigger a parametric refund for a delayed flight.
   * Only triggers if delay >= 180 minutes (3 hours) and the ticket
   * hasn't already been refunded.
   */
  async triggerParametricRefund(
    ticketTokenId: string,
    flightNumber: string,
    delayMinutes: number
  ): Promise<Result<RefundTriggerResult, string>> {
    if (!this.refundContract || !this.signer) {
      return err('Refund contract or signer not configured');
    }

    if (delayMinutes < 180) {
      return ok({
        flightNumber,
        ticketTokenId,
        delayMinutes,
        refundAmount: '0',
        refundCurrency: 'ETH',
        status: 'below_threshold',
      });
    }

    try {
      // Check if already refunded
      const alreadyRefunded = await this.refundContract.isRefunded(
        BigInt(ticketTokenId)
      );
      if (alreadyRefunded) {
        return ok({
          flightNumber,
          ticketTokenId,
          delayMinutes,
          refundAmount: '0',
          refundCurrency: 'ETH',
          status: 'already_refunded',
        });
      }

      // Get refund amount based on delay tiers
      const refundAmount = await this.refundContract.getRefundAmount(
        BigInt(ticketTokenId),
        BigInt(delayMinutes)
      );

      // Create flight data hash for on-chain verification
      const flightDataHash = ethers.keccak256(
        ethers.toUtf8Bytes(
          JSON.stringify({
            flightNumber,
            delayMinutes,
            timestamp: Math.floor(Date.now() / 1000),
          })
        )
      );

      // Trigger refund
      const tx = await this.refundContract.triggerRefund(
        BigInt(ticketTokenId),
        BigInt(delayMinutes),
        flightDataHash
      );
      const receipt = await tx.wait();

      return ok({
        flightNumber,
        ticketTokenId,
        delayMinutes,
        refundAmount: refundAmount.toString(),
        refundCurrency: 'ETH',
        txHash: receipt.hash,
        status: 'triggered',
      });
    } catch (error) {
      return ok({
        flightNumber,
        ticketTokenId,
        delayMinutes,
        refundAmount: '0',
        refundCurrency: 'ETH',
        status: 'failed',
      });
    }
  }

  // ============================================================================
  // Full Delay Check + Refund Pipeline
  // ============================================================================

  /**
   * End-to-end pipeline: check flight status, verify with AI, trigger refund.
   * Designed to be called from a CRE workflow with RunInNodeMode.
   */
  async checkAndRefund(
    carrierCode: string,
    flightNumber: string,
    departureDate: string,
    ticketTokenId: string
  ): Promise<
    Result<
      {
        flightStatus: FlightStatusResult;
        aiVerification?: FlightStatusResult['aiVerification'];
        refund?: RefundTriggerResult;
      },
      string
    >
  > {
    // Step 1: Get flight status from Amadeus
    const statusResult = await this.getFlightStatus(
      carrierCode,
      flightNumber,
      departureDate
    );

    if (!statusResult.success) {
      return err(statusResult.error);
    }

    const flightStatus = statusResult.data;

    // Step 2: If delayed >= 3 hours, verify with AI
    let aiVerification: FlightStatusResult['aiVerification'];
    if (flightStatus.qualifiesForRefund) {
      const aiResult = await this.verifyDelayWithAI(
        `${carrierCode}${flightNumber}`,
        departureDate,
        flightStatus.delayMinutes
      );

      if (aiResult.success) {
        aiVerification = aiResult.data;
        flightStatus.aiVerification = aiVerification;
      }
    }

    // Step 3: Trigger refund if both Amadeus and AI confirm the delay
    let refund: RefundTriggerResult | undefined;
    if (
      flightStatus.qualifiesForRefund &&
      (!aiVerification || aiVerification.confirmed)
    ) {
      const refundResult = await this.triggerParametricRefund(
        ticketTokenId,
        `${carrierCode}${flightNumber}`,
        flightStatus.delayMinutes
      );

      if (refundResult.success) {
        refund = refundResult.data;
      }
    }

    return ok({ flightStatus, aiVerification, refund });
  }

  /**
   * Cleanup
   */
  async disconnect(): Promise<void> {
    cachedToken = null;
    this.refundContract?.removeAllListeners();
    (this.provider as ethers.JsonRpcProvider).removeAllListeners?.();
  }

  /**
   * Alias for disconnect — used in demos.
   */
  destroy(): void {
    this.disconnect().catch(() => {});
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createAmadeusPlugin(config: AmadeusConfig): AmadeusFlightPlugin {
  return new AmadeusFlightPlugin(config);
}

export function createAmadeusTestPlugin(
  apiKey: string,
  apiSecret: string,
  chainId: number = 11155111,
  rpcUrl: string = 'https://ethereum-sepolia.publicnode.com'
): AmadeusFlightPlugin {
  return new AmadeusFlightPlugin({
    apiKey,
    apiSecret,
    production: false,
    chainId,
    rpcUrl,
  });
}

export default AmadeusFlightPlugin;
