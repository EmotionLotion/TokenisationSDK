/**
 * FlightDataFunctionsBridge
 *
 * Wires ChainlinkFunctionsPlugin.executeRequest() into OracleService
 * by registering a FLIGHT_STATUS data provider.
 *
 * When OracleService.fetchData({ dataType: 'FLIGHT_STATUS', ... }) is called,
 * the bridge invokes Chainlink Functions to fetch real flight status data.
 */

import { ethers } from 'ethers';
import type { ChainlinkFunctionsPlugin } from '../plugins/chainlink/FunctionsPlugin.js';
import type { OracleService } from '../services/OracleService.js';

/**
 * JavaScript source executed on the Chainlink DON to fetch flight status.
 * Queries a flight status API and returns landing/delay info.
 */
const FLIGHT_STATUS_JS = `
  const [flightNumber, date] = args;

  const response = await Functions.makeHttpRequest({
    url: \`https://api.aviationstack.com/v1/flights?flight_iata=\${flightNumber}&flight_date=\${date}\`,
    headers: { 'Content-Type': 'application/json' }
  });

  if (response.error || !response.data?.data?.[0]) {
    return Functions.encodeString(JSON.stringify({
      landed: false,
      actualArrival: null,
      delay: 0,
      verified: false,
      error: 'Flight data unavailable'
    }));
  }

  const flight = response.data.data[0];
  const landed = flight.flight_status === 'landed';
  const actualArrival = flight.arrival?.actual || null;
  const scheduledArrival = flight.arrival?.scheduled || null;

  let delay = 0;
  if (actualArrival && scheduledArrival) {
    delay = Math.round((new Date(actualArrival) - new Date(scheduledArrival)) / 60000);
  }

  return Functions.encodeString(JSON.stringify({
    landed,
    actualArrival,
    delay,
    verified: true
  }));
`;

/**
 * FlightDataFunctionsBridge
 *
 * Registers a FLIGHT_STATUS data provider on OracleService that
 * delegates to Chainlink Functions for real flight data.
 */
export class FlightDataFunctionsBridge {
  private wired = false;

  constructor(
    private readonly functionsPlugin: ChainlinkFunctionsPlugin,
    private readonly oracleService: OracleService
  ) {}

  /**
   * Register the FLIGHT_STATUS data provider on OracleService.
   * After calling wire(), OracleService can handle FLIGHT_STATUS queries
   * by delegating to Chainlink Functions.
   */
  wire(): void {
    if (this.wired) return;
    this.wired = true;

    this.oracleService.registerDataProvider(
      'FLIGHT_STATUS',
      async (params: Record<string, unknown>) => {
        const flightNumber = params.flightNumber as string;
        const date = params.date as string;

        if (!flightNumber || !date) {
          return {
            landed: false,
            actualArrival: null,
            delay: 0,
            verified: false,
            error: 'flightNumber and date are required',
          };
        }

        const result = await this.functionsPlugin.executeRequest({
          source: FLIGHT_STATUS_JS,
          args: [flightNumber, date],
        });

        if (!result.success) {
          return {
            landed: false,
            actualArrival: null,
            delay: 0,
            verified: false,
            error: result.error,
          };
        }

        try {
          const decoded = JSON.parse(
            ethers.toUtf8String(result.data.response)
          );
          return decoded;
        } catch {
          return {
            landed: false,
            actualArrival: null,
            delay: 0,
            verified: false,
            error: 'Failed to decode Functions response',
          };
        }
      }
    );
  }

  /**
   * Whether the bridge has been wired
   */
  isWired(): boolean {
    return this.wired;
  }
}
