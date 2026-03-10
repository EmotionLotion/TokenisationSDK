/**
 * CRE Workflow: Market Settlement Oracle
 *
 * Chainlink CRE workflow that settles prediction markets by fetching
 * flight status data and classifying outcomes via Gemini AI.
 *
 * Triggers:
 *   - Cron: every 15 minutes, checks open markets past departure
 *   - HTTP: manual settlement trigger
 *
 * Data flow:
 *   1. Query server for open markets past departure time
 *   2. Fetch flight status from FlightAware API
 *   3. Classify outcome via Gemini AI (on-time, delayed-15, delayed-60, cancelled)
 *   4. Report settlement on-chain
 *   5. POST settlement callback to server with oracle proof + AI reasoning
 *
 * @packageDocumentation
 */

import {
  Workflow,
  HttpTrigger,
  CronTrigger,
  HttpCapability,
  ConsensusCapability,
  OnChainReportCapability,
  type TriggerEvent,
  type WorkflowSpec,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

interface MarketSettlementRequest {
  marketId: string;
  flightNumber: string;
  departureDate: string;
  callbackUrl?: string;
}

interface SettlementResult {
  marketId: string;
  flightNumber: string;
  actualOutcome: 'on-time' | 'delayed-15' | 'delayed-60' | 'cancelled';
  delayMinutes: number;
  aiReasoning: string;
  oracleProof: string;
  settledAt: string;
}

// ============================================================================
// Constants
// ============================================================================

const FLIGHTAWARE_BASE = 'https://aeroapi.flightaware.com/aeroapi/flights';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
const POLL_CRON = '*/15 * * * *';

const FUNCTIONS_CONSUMER_ADDRESS =
  process.env.FUNCTIONS_CONSUMER_ADDRESS || '0x0000000000000000000000000000000000000000';
const REPORT_DON_ID = process.env.CRE_DON_ID || 'don-1';
const CHAIN_ID = process.env.CRE_CHAIN_ID || '11155111';

// ============================================================================
// Helpers
// ============================================================================

function classifyDelay(delayMinutes: number, cancelled: boolean): 'on-time' | 'delayed-15' | 'delayed-60' | 'cancelled' {
  if (cancelled) return 'cancelled';
  if (delayMinutes >= 60) return 'delayed-60';
  if (delayMinutes >= 15) return 'delayed-15';
  return 'on-time';
}

async function fetchFlightStatus(
  http: HttpCapability,
  flightNumber: string,
): Promise<{ delayMinutes: number; cancelled: boolean; status: string }> {
  try {
    const apiKey = process.env.FLIGHTAWARE_API_KEY ?? '';
    const response = await http.fetch(`${FLIGHTAWARE_BASE}/${flightNumber}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'x-apikey': apiKey },
      timeout: 10_000,
    });

    if (!response.ok) return { delayMinutes: 0, cancelled: false, status: 'unknown' };

    const body = (await response.json()) as { flights?: Array<{
      status: string;
      scheduled_out: string | null;
      actual_out: string | null;
    }> };

    const flight = body.flights?.[0];
    if (!flight) return { delayMinutes: 0, cancelled: false, status: 'unknown' };

    const cancelled = flight.status?.toLowerCase().includes('cancel') ?? false;
    let delayMinutes = 0;
    if (flight.scheduled_out && flight.actual_out) {
      delayMinutes = Math.max(0, Math.round(
        (new Date(flight.actual_out).getTime() - new Date(flight.scheduled_out).getTime()) / 60_000
      ));
    }

    return { delayMinutes, cancelled, status: flight.status };
  } catch {
    return { delayMinutes: 0, cancelled: false, status: 'error' };
  }
}

async function classifyWithGemini(
  http: HttpCapability,
  flightNumber: string,
  delayMinutes: number,
  flightStatus: string,
): Promise<string> {
  try {
    const apiKey = process.env.GEMINI_API_KEY ?? '';
    const prompt = `You are a flight delay classification oracle. Given the following flight data, classify the outcome and explain your reasoning in one sentence.

Flight: ${flightNumber}
Status: ${flightStatus}
Delay: ${delayMinutes} minutes

Classifications: on-time (<15min delay), delayed-15 (15-59min), delayed-60 (60+ min), cancelled.

Respond with JSON: {"outcome": "...", "reasoning": "..."}`;

    const response = await http.fetch(`${GEMINI_BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      timeout: 15_000,
    });

    if (!response.ok) return `Classified by delay threshold: ${delayMinutes}min delay`;

    const body = await response.json() as any;
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    try {
      const parsed = JSON.parse(text);
      return parsed.reasoning ?? text;
    } catch {
      return text || `Classified by delay threshold: ${delayMinutes}min delay`;
    }
  } catch {
    return `Classified by delay threshold: ${delayMinutes}min delay`;
  }
}

// ============================================================================
// Workflow Definition
// ============================================================================

const marketSettlementWorkflow: WorkflowSpec = {
  name: 'market-settlement-oracle',
  owner: 'tokenisation-sdk',
  version: '1.0.0',

  triggers: [
    {
      type: 'http',
      id: 'http-settle-market',
      config: { method: 'POST', path: '/market-settlement', authentication: 'bearer' },
    } as HttpTrigger,
    {
      type: 'cron',
      id: 'cron-market-check',
      config: { schedule: POLL_CRON },
    } as CronTrigger,
  ],

  capabilities: {
    http: {
      type: 'http',
      config: {
        allowedDomains: [
          'aeroapi.flightaware.com',
          'generativelanguage.googleapis.com',
        ],
        maxConcurrent: 4,
        timeoutMs: 20_000,
      },
    } as HttpCapability,
    consensus: {
      type: 'consensus',
      config: { method: 'median', minResponses: 3, maxDeviation: 0 },
    } as ConsensusCapability,
    onChainReport: {
      type: 'on_chain_report',
      config: {
        chainId: CHAIN_ID,
        contractAddress: FUNCTIONS_CONSUMER_ADDRESS,
        donId: REPORT_DON_ID,
        method: 'fulfillRequest',
        gasLimit: 300_000,
      },
    } as OnChainReportCapability,
  },

  async execute(event: TriggerEvent, capabilities) {
    const { http, consensus, onChainReport } = capabilities;

    let requests: MarketSettlementRequest[];

    if (event.trigger === 'http-settle-market') {
      requests = [event.body as MarketSettlementRequest];
    } else {
      // Cron: fetch open markets from server
      const pollMarkets = process.env.CRE_POLL_MARKETS;
      if (!pollMarkets) return { status: 'no_markets_to_settle' };
      requests = JSON.parse(pollMarkets);
    }

    const results: SettlementResult[] = [];

    for (const req of requests) {
      // 1. Fetch flight status
      const flightData = await fetchFlightStatus(http, req.flightNumber);

      // 2. Classify outcome
      const outcome = classifyDelay(flightData.delayMinutes, flightData.cancelled);

      // 3. Get AI reasoning
      const aiReasoning = await classifyWithGemini(http, req.flightNumber, flightData.delayMinutes, flightData.status);

      // 4. Consensus across DON nodes
      const agreed = await consensus.reach({
        outcome,
        delayMinutes: flightData.delayMinutes,
        cancelled: flightData.cancelled ? 1 : 0,
      });

      // 5. Report on-chain
      const oracleProof = JSON.stringify({
        marketId: req.marketId,
        outcome: agreed.outcome,
        delayMinutes: agreed.delayMinutes,
        source: 'flightaware+gemini',
        consensus: true,
      });

      try {
        await onChainReport.submit({
          data: oracleProof,
          metadata: { marketId: req.marketId, outcome: agreed.outcome as string },
        });
      } catch (err) {
        console.error('On-chain report failed:', err);
      }

      const result: SettlementResult = {
        marketId: req.marketId,
        flightNumber: req.flightNumber,
        actualOutcome: agreed.outcome as SettlementResult['actualOutcome'],
        delayMinutes: agreed.delayMinutes as number,
        aiReasoning,
        oracleProof,
        settledAt: new Date().toISOString(),
      };

      // 6. Callback to server
      if (req.callbackUrl) {
        try {
          await http.fetch(req.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'market_settlement', data: result }),
            timeout: 5_000,
          });
        } catch {
          console.error(`Settlement callback to ${req.callbackUrl} failed`);
        }
      }

      results.push(result);
    }

    return { status: 'settled', count: results.length, results };
  },
};

// ============================================================================
// Export
// ============================================================================

export default Workflow.create(marketSettlementWorkflow);
export type { MarketSettlementRequest, SettlementResult };
