/**
 * FlightLandingOracle
 *
 * Wraps OracleService with a flight-landing-specific data provider.
 * The car rental system queries it before allowing pickup.
 */

// [LAYER] Moved to @tokenisation/chains
// import type { OracleService } from '../services/OracleService.js';
import type { ICrossPackEventBus } from '@tokenisation/core';

/** Minimal OracleService interface stub for typing after layer extraction */
interface OracleService {
  registerDataProvider(type: string, provider: (params: Record<string, unknown>) => Promise<unknown>): void;
  fetchData(request: { dataType: string; parameters: Record<string, unknown> }): Promise<{ success: boolean; error?: string; data: { value: unknown } }>;
  isHealthy(): boolean;
  simulateFailure(): void;
}

export type FlightLandingStatus =
  | 'LANDED'
  | 'DIVERTED'
  | 'CANCELLED'
  | 'DELAYED'
  | 'UNKNOWN';

export interface FlightLandingData {
  flightNumber: string;
  landedAt: string;
  airport: string;
  status: FlightLandingStatus;
  source: string;
  confidence: number;
}

export interface LandingVerificationResult {
  verified: boolean;
  flightData?: FlightLandingData;
  oracleHealthy: boolean;
  reason?: string;
}

export class FlightLandingOracle {
  private landings: Map<string, FlightLandingData> = new Map();

  constructor(
    private oracle: OracleService,
    private eventBus?: ICrossPackEventBus,
  ) {
    // Register a custom data provider for FLIGHT_LANDING
    this.oracle.registerDataProvider(
      'FLIGHT_LANDING',
      async (params: Record<string, unknown>) => {
        const flightNumber = params['flightNumber'] as string;
        const data = this.landings.get(flightNumber);
        if (!data) {
          throw new Error(`No landing data for flight ${flightNumber}`);
        }
        return data;
      },
    );
  }

  reportLanding(data: FlightLandingData): void {
    this.landings.set(data.flightNumber, data);

    if (this.eventBus) {
      this.eventBus.publish({
        source: 'AIRLINE',
        type: 'FLIGHT_LANDED',
        resourceId: data.flightNumber,
        data: { ...data },
        correlationId: data.flightNumber,
      });
    }
  }

  async verifyLanding(flightNumber: string): Promise<LandingVerificationResult> {
    const result = await this.oracle.fetchData({
      dataType: 'FLIGHT_LANDING',
      parameters: { flightNumber },
    });

    // Check health after fetch attempt so first successful fetch is reflected
    const oracleHealthy = this.oracle.isHealthy();

    if (!result.success) {
      return {
        verified: false,
        oracleHealthy,
        reason: result.error,
      };
    }

    const flightData = result.data.value as FlightLandingData;
    const verified = flightData.status === 'LANDED';

    return {
      verified,
      flightData,
      oracleHealthy,
      reason: verified ? undefined : `Flight status is ${flightData.status}`,
    };
  }

  isHealthy(): boolean {
    return this.oracle.isHealthy();
  }

  simulateFailure(): void {
    this.oracle.simulateFailure();
  }
}
