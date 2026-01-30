/**
 * CRE Workflow: Flight Status Oracle
 *
 * Chainlink CRE (Compute, Read, Execute) workflow that fetches real-time
 * flight status data from aviation APIs with consensus across DON nodes.
 *
 * Triggers:
 *   - HTTP: called by the server when an immediate status check is needed
 *   - Cron: polls flights near departure every 5 minutes
 *
 * Data flow:
 *   1. Receive flight number + departure date
 *   2. Query AviationStack and FlightAware APIs via HTTP capability
 *   3. Aggregate results across DON nodes (consensus)
 *   4. Report final status on-chain to FunctionsConsumer contract
 *   5. POST webhook callback to server with structured flight data
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

interface FlightStatusRequest {
  flightNumber: string;
  departureDate: string; // YYYY-MM-DD
  callbackUrl?: string;
  ticketId?: string;
}

interface FlightStatusResponse {
  flightNumber: string;
  status: FlightStatus;
  scheduledDeparture: string | null;
  actualDeparture: string | null;
  scheduledArrival: string | null;
  actualArrival: string | null;
  delay: number; // minutes, 0 if on-time
  gate: string | null;
  terminal: string | null;
  cancelled: boolean;
  source: string;
  fetchedAt: string;
}

type FlightStatus =
  | 'scheduled'
  | 'active'
  | 'landed'
  | 'cancelled'
  | 'incident'
  | 'diverted'
  | 'unknown';

interface AviationStackFlight {
  flight_status: string;
  departure: {
    actual: string | null;
    estimated: string | null;
    scheduled: string;
    gate: string | null;
    terminal: string | null;
    delay: number | null;
  };
  arrival: {
    actual: string | null;
    estimated: string | null;
    scheduled: string;
    gate: string | null;
    terminal: string | null;
    delay: number | null;
  };
  flight: {
    iata: string;
    number: string;
  };
}

interface FlightAwareFlight {
  ident: string;
  status: string;
  gate_origin: string | null;
  gate_destination: string | null;
  terminal_origin: string | null;
  terminal_destination: string | null;
  scheduled_out: string | null;
  actual_out: string | null;
  scheduled_in: string | null;
  actual_in: string | null;
}

// ============================================================================
// Constants
// ============================================================================

const AVIATIONSTACK_BASE = 'http://api.aviationstack.com/v1/flights';
const FLIGHTAWARE_BASE = 'https://aeroapi.flightaware.com/aeroapi/flights';

/** Cron: every 5 minutes */
const POLL_CRON = '*/5 * * * *';

/** On-chain report target */
const FUNCTIONS_CONSUMER_ADDRESS =
  process.env.FUNCTIONS_CONSUMER_ADDRESS || '0x0000000000000000000000000000000000000000';
const REPORT_DON_ID = process.env.CRE_DON_ID || 'don-1';
const CHAIN_ID = process.env.CRE_CHAIN_ID || '11155111'; // Sepolia default

// ============================================================================
// Normalisation Helpers
// ============================================================================

function normaliseAviationStackStatus(raw: string): FlightStatus {
  const map: Record<string, FlightStatus> = {
    scheduled: 'scheduled',
    active: 'active',
    landed: 'landed',
    cancelled: 'cancelled',
    incident: 'incident',
    diverted: 'diverted',
  };
  return map[raw?.toLowerCase()] ?? 'unknown';
}

function normaliseFlightAwareStatus(raw: string): FlightStatus {
  const lower = (raw ?? '').toLowerCase();
  if (lower.includes('schedule')) return 'scheduled';
  if (lower.includes('en route') || lower.includes('active')) return 'active';
  if (lower.includes('landed') || lower.includes('arrived')) return 'landed';
  if (lower.includes('cancel')) return 'cancelled';
  if (lower.includes('divert')) return 'diverted';
  return 'unknown';
}

function computeDelayMinutes(scheduled: string | null, actual: string | null): number {
  if (!scheduled || !actual) return 0;
  const diff = new Date(actual).getTime() - new Date(scheduled).getTime();
  return Math.max(0, Math.round(diff / 60_000));
}

function mergeResults(
  avStack: FlightStatusResponse | null,
  fAware: FlightStatusResponse | null,
): FlightStatusResponse {
  // Prefer FlightAware when both present (generally more accurate for US/EU)
  // but fall back to AviationStack if FlightAware returned nothing useful
  if (fAware && fAware.status !== 'unknown') {
    return {
      ...fAware,
      // Supplement missing fields from AviationStack
      gate: fAware.gate ?? avStack?.gate ?? null,
      terminal: fAware.terminal ?? avStack?.terminal ?? null,
      source: avStack ? 'flightaware+aviationstack' : 'flightaware',
    };
  }
  if (avStack) {
    return { ...avStack, source: 'aviationstack' };
  }
  // Both failed — return unknown
  return {
    flightNumber: '',
    status: 'unknown',
    scheduledDeparture: null,
    actualDeparture: null,
    scheduledArrival: null,
    actualArrival: null,
    delay: 0,
    gate: null,
    terminal: null,
    cancelled: false,
    source: 'none',
    fetchedAt: new Date().toISOString(),
  };
}

// ============================================================================
// API Fetch Functions (executed inside DON via HttpCapability)
// ============================================================================

async function fetchAviationStack(
  http: HttpCapability,
  flightNumber: string,
  _departureDate: string,
): Promise<FlightStatusResponse | null> {
  try {
    const apiKey = process.env.AVIATIONSTACK_API_KEY ?? '';
    const url = `${AVIATIONSTACK_BASE}?access_key=${apiKey}&flight_iata=${flightNumber}`;

    const response = await http.fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      timeout: 10_000,
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { data?: AviationStackFlight[] };
    const flights = body.data;
    if (!flights || flights.length === 0) return null;

    const f = flights[0];
    const status = normaliseAviationStackStatus(f.flight_status);

    return {
      flightNumber: f.flight?.iata ?? flightNumber,
      status,
      scheduledDeparture: f.departure.scheduled ?? null,
      actualDeparture: f.departure.actual ?? f.departure.estimated ?? null,
      scheduledArrival: f.arrival.scheduled ?? null,
      actualArrival: f.arrival.actual ?? f.arrival.estimated ?? null,
      delay: f.departure.delay ?? computeDelayMinutes(f.departure.scheduled, f.departure.actual),
      gate: f.departure.gate ?? null,
      terminal: f.departure.terminal ?? null,
      cancelled: status === 'cancelled',
      source: 'aviationstack',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function fetchFlightAware(
  http: HttpCapability,
  flightNumber: string,
  _departureDate: string,
): Promise<FlightStatusResponse | null> {
  try {
    const apiKey = process.env.FLIGHTAWARE_API_KEY ?? '';
    const url = `${FLIGHTAWARE_BASE}/${flightNumber}`;

    const response = await http.fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-apikey': apiKey,
      },
      timeout: 10_000,
    });

    if (!response.ok) return null;

    const body = (await response.json()) as { flights?: FlightAwareFlight[] };
    const flights = body.flights;
    if (!flights || flights.length === 0) return null;

    const f = flights[0];
    const status = normaliseFlightAwareStatus(f.status);

    return {
      flightNumber: f.ident ?? flightNumber,
      status,
      scheduledDeparture: f.scheduled_out ?? null,
      actualDeparture: f.actual_out ?? null,
      scheduledArrival: f.scheduled_in ?? null,
      actualArrival: f.actual_in ?? null,
      delay: computeDelayMinutes(f.scheduled_out, f.actual_out),
      gate: f.gate_origin ?? null,
      terminal: f.terminal_origin ?? null,
      cancelled: status === 'cancelled',
      source: 'flightaware',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Encode On-Chain Report Payload
// ============================================================================

function encodeReportPayload(result: FlightStatusResponse): string {
  // ABI-encode for FunctionsConsumer.fulfillRequest(bytes32 requestId, bytes response, bytes err)
  // We encode the response as a JSON string in bytes
  const payload = JSON.stringify({
    flightNumber: result.flightNumber,
    status: result.status,
    actualDeparture: result.actualDeparture,
    actualArrival: result.actualArrival,
    delay: result.delay,
    gate: result.gate,
    terminal: result.terminal,
    cancelled: result.cancelled,
  });
  return payload;
}

// ============================================================================
// Workflow Definition
// ============================================================================

const flightStatusWorkflow: WorkflowSpec = {
  name: 'flight-status-oracle',
  owner: 'tokenisation-sdk',
  version: '1.0.0',

  triggers: [
    // HTTP trigger: server calls this endpoint for on-demand checks
    {
      type: 'http',
      id: 'http-flight-check',
      config: {
        method: 'POST',
        path: '/flight-status',
        authentication: 'bearer',
      },
    } as HttpTrigger,

    // Cron trigger: poll every 5 minutes for flights approaching departure
    {
      type: 'cron',
      id: 'cron-flight-poll',
      config: {
        schedule: POLL_CRON,
      },
    } as CronTrigger,
  ],

  capabilities: {
    http: {
      type: 'http',
      config: {
        allowedDomains: [
          'api.aviationstack.com',
          'aeroapi.flightaware.com',
        ],
        maxConcurrent: 4,
        timeoutMs: 15_000,
      },
    } as HttpCapability,

    consensus: {
      type: 'consensus',
      config: {
        method: 'median',
        minResponses: 3,
        maxDeviation: 0,
      },
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

  // ---------------------------------------------------------------------------
  // Main execution: runs on each DON node
  // ---------------------------------------------------------------------------
  async execute(event: TriggerEvent, capabilities) {
    const { http, consensus, onChainReport } = capabilities;

    // ---- 1. Parse input ----
    let request: FlightStatusRequest;

    if (event.trigger === 'http-flight-check') {
      // HTTP trigger payload
      request = event.body as FlightStatusRequest;
    } else {
      // Cron trigger — the server provides a list of flights to poll via env
      // In production, this would query the server's watch list.
      // For now, we expect POLL_FLIGHTS env var as JSON array.
      const pollFlights = process.env.CRE_POLL_FLIGHTS;
      if (!pollFlights) {
        return { status: 'no_flights_to_poll' };
      }
      const flights: FlightStatusRequest[] = JSON.parse(pollFlights);
      // Process each flight sequentially within the same execution window
      const results: FlightStatusResponse[] = [];
      for (const flight of flights) {
        const result = await executeSingleFlight(http, consensus, onChainReport, flight);
        results.push(result);
        // POST callback if configured
        if (flight.callbackUrl) {
          await postCallback(http, flight.callbackUrl, result, flight.ticketId);
        }
      }
      return { status: 'poll_complete', count: results.length, results };
    }

    // ---- 2. Fetch from both sources in parallel ----
    const result = await executeSingleFlight(http, consensus, onChainReport, request);

    // ---- 3. POST callback if provided ----
    if (request.callbackUrl) {
      await postCallback(http, request.callbackUrl, result, request.ticketId);
    }

    return result;
  },
};

// ============================================================================
// Single Flight Execution
// ============================================================================

async function executeSingleFlight(
  http: HttpCapability,
  consensus: ConsensusCapability,
  onChainReport: OnChainReportCapability,
  request: FlightStatusRequest,
): Promise<FlightStatusResponse> {
  const { flightNumber, departureDate } = request;

  // Fetch from both APIs concurrently
  const [avStackResult, fAwareResult] = await Promise.all([
    fetchAviationStack(http, flightNumber, departureDate),
    fetchFlightAware(http, flightNumber, departureDate),
  ]);

  // Merge results locally on each node
  const localResult = mergeResults(avStackResult, fAwareResult);
  localResult.flightNumber = flightNumber;

  // Run consensus across DON nodes for the status and delay values
  const consensusInput = {
    status: localResult.status,
    delay: localResult.delay,
    cancelled: localResult.cancelled ? 1 : 0,
    actualDeparture: localResult.actualDeparture ?? '',
    actualArrival: localResult.actualArrival ?? '',
  };

  const agreed = await consensus.reach(consensusInput);

  // Apply consensus values
  const finalResult: FlightStatusResponse = {
    ...localResult,
    status: agreed.status as FlightStatus,
    delay: agreed.delay as number,
    cancelled: (agreed.cancelled as number) === 1,
    actualDeparture: (agreed.actualDeparture as string) || null,
    actualArrival: (agreed.actualArrival as string) || null,
    fetchedAt: new Date().toISOString(),
  };

  // Report on-chain
  try {
    const payload = encodeReportPayload(finalResult);
    await onChainReport.submit({
      data: payload,
      metadata: {
        flightNumber,
        departureDate,
        status: finalResult.status,
      },
    });
  } catch (err) {
    // On-chain reporting is best-effort; the callback still delivers data
    console.error('On-chain report failed:', err);
  }

  return finalResult;
}

// ============================================================================
// Callback POST
// ============================================================================

async function postCallback(
  http: HttpCapability,
  callbackUrl: string,
  result: FlightStatusResponse,
  ticketId?: string,
): Promise<void> {
  try {
    await http.fetch(callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'flight_status_update',
        ticketId: ticketId ?? null,
        data: {
          flightNumber: result.flightNumber,
          status: result.status,
          actualDeparture: result.actualDeparture,
          actualArrival: result.actualArrival,
          delay: result.delay,
          gate: result.gate,
          terminal: result.terminal,
          cancelled: result.cancelled,
        },
        fetchedAt: result.fetchedAt,
        source: result.source,
      }),
      timeout: 5_000,
    });
  } catch {
    console.error(`Callback POST to ${callbackUrl} failed`);
  }
}

// ============================================================================
// Export
// ============================================================================

export default Workflow.create(flightStatusWorkflow);
export type { FlightStatusRequest, FlightStatusResponse, FlightStatus };
