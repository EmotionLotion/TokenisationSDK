/**
 * CRE Workflow: Car Rental Telematics — Usage-Based Billing
 *
 * Cron-triggered workflow that fetches vehicle telematics data from
 * Smartcar / High Mobility APIs with multi-node consensus, detects
 * overage conditions (mileage, fuel, geofence), and auto-charges
 * the renter's deposit via on-chain settlement.
 *
 * Data flow:
 *   1. Cron trigger fires every 15 minutes for active rentals
 *   2. Fetch telematics (odometer, fuel, location) from Smartcar API
 *   3. DON nodes reach consensus on telematics readings
 *   4. Compare readings against rental contract limits
 *   5. If overage detected: charge deposit on-chain
 *   6. POST callback to server with usage report
 *
 * @packageDocumentation
 */

import {
  Workflow,
  CronTrigger,
  HttpCapability,
  EVMCapability,
  ConsensusCapability,
  type WorkflowSpec,
  type TriggerEvent,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

interface ActiveRental {
  rentalId: string;
  vehicleId: string;
  smartcarVehicleId: string;
  renterAddress: string;
  tokenAddress: string;
  tokenId: string;
  depositContractAddress: string;
  startOdometer: number;  // km
  mileageLimit: number;   // km
  fuelLevelStart: number; // 0-100%
  minFuelReturn: number;  // 0-100%
  perKmOverageRate: string; // wei per km
  fuelPenaltyRate: string;  // wei per 1% below minimum
  geofence?: {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
  };
  geofencePenaltyRate?: string; // wei per violation
}

interface TelematicsReading {
  vehicleId: string;
  odometer: number;          // km
  fuelLevel: number;         // 0-100%
  latitude: number;
  longitude: number;
  engineRunning: boolean;
  timestamp: string;
  source: string;
}

interface OverageCharge {
  type: 'mileage' | 'fuel' | 'geofence';
  amount: string;  // wei
  description: string;
  reading: number;
  limit: number;
  excess: number;
}

interface UsageReport {
  rentalId: string;
  vehicleId: string;
  currentOdometer: number;
  mileageUsed: number;
  mileageRemaining: number;
  fuelLevel: number;
  isWithinGeofence: boolean;
  overages: OverageCharge[];
  totalChargeWei: string;
  chargedTxHash?: string;
  timestamp: string;
}

// ============================================================================
// Constants
// ============================================================================

const SMARTCAR_API_BASE = 'https://api.smartcar.com/v2.0/vehicles';
const HIGH_MOBILITY_BASE = 'https://sandbox.api.high-mobility.com/v1/vehicle-data';

const DEPOSIT_CONTRACT_ABI = [
  {
    name: 'chargeDeposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'rentalId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'getDepositBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'rentalId', type: 'bytes32' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

const RENTAL_STATE_ABI = [
  {
    name: 'reportUsage',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'odometer', type: 'uint256' },
      { name: 'fuelLevel', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const POLL_CRON = '*/15 * * * *'; // every 15 minutes
const CHAIN_ID = process.env.CRE_CHAIN_ID || '11155111';

// ============================================================================
// Telematics Fetch Functions
// ============================================================================

async function fetchSmartcar(
  http: HttpCapability,
  vehicleId: string,
): Promise<TelematicsReading | null> {
  try {
    const token = process.env.SMARTCAR_ACCESS_TOKEN ?? '';

    // Fetch odometer, fuel, and location in parallel
    const [odometerRes, fuelRes, locationRes] = await Promise.all([
      http.fetch(`${SMARTCAR_API_BASE}/${vehicleId}/odometer`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 10_000,
      }),
      http.fetch(`${SMARTCAR_API_BASE}/${vehicleId}/fuel`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 10_000,
      }),
      http.fetch(`${SMARTCAR_API_BASE}/${vehicleId}/location`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 10_000,
      }),
    ]);

    if (!odometerRes.ok || !fuelRes.ok || !locationRes.ok) return null;

    const odometer = (await odometerRes.json()) as { distance: number };
    const fuel = (await fuelRes.json()) as { percentRemaining: number };
    const location = (await locationRes.json()) as { latitude: number; longitude: number };

    return {
      vehicleId,
      odometer: odometer.distance,
      fuelLevel: fuel.percentRemaining,
      latitude: location.latitude,
      longitude: location.longitude,
      engineRunning: true, // Smartcar doesn't expose this directly
      timestamp: new Date().toISOString(),
      source: 'smartcar',
    };
  } catch {
    return null;
  }
}

async function fetchHighMobility(
  http: HttpCapability,
  vehicleId: string,
): Promise<TelematicsReading | null> {
  try {
    const token = process.env.HIGH_MOBILITY_TOKEN ?? '';

    const response = await http.fetch(`${HIGH_MOBILITY_BASE}/${vehicleId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeout: 10_000,
    });

    if (!response.ok) return null;

    const body = (await response.json()) as {
      odometer?: { value: number };
      fuel_level?: { value: number };
      vehicle_location?: { coordinates: { latitude: number; longitude: number } };
      engine?: { status: string };
    };

    return {
      vehicleId,
      odometer: body.odometer?.value ?? 0,
      fuelLevel: body.fuel_level?.value ?? 0,
      latitude: body.vehicle_location?.coordinates?.latitude ?? 0,
      longitude: body.vehicle_location?.coordinates?.longitude ?? 0,
      engineRunning: body.engine?.status === 'on',
      timestamp: new Date().toISOString(),
      source: 'high-mobility',
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Overage Detection
// ============================================================================

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function detectOverages(
  rental: ActiveRental,
  reading: TelematicsReading,
): OverageCharge[] {
  const overages: OverageCharge[] = [];

  // Mileage overage
  const mileageUsed = reading.odometer - rental.startOdometer;
  if (mileageUsed > rental.mileageLimit) {
    const excessKm = mileageUsed - rental.mileageLimit;
    const charge = BigInt(rental.perKmOverageRate) * BigInt(Math.ceil(excessKm));
    overages.push({
      type: 'mileage',
      amount: charge.toString(),
      description: `Mileage overage: ${excessKm.toFixed(1)}km over ${rental.mileageLimit}km limit`,
      reading: mileageUsed,
      limit: rental.mileageLimit,
      excess: excessKm,
    });
  }

  // Fuel penalty
  if (reading.fuelLevel < rental.minFuelReturn) {
    const deficitPct = rental.minFuelReturn - reading.fuelLevel;
    const charge = BigInt(rental.fuelPenaltyRate) * BigInt(Math.ceil(deficitPct));
    overages.push({
      type: 'fuel',
      amount: charge.toString(),
      description: `Fuel below minimum: ${reading.fuelLevel}% < ${rental.minFuelReturn}% required`,
      reading: reading.fuelLevel,
      limit: rental.minFuelReturn,
      excess: deficitPct,
    });
  }

  // Geofence violation
  if (rental.geofence && rental.geofencePenaltyRate) {
    const distance = haversineDistance(
      rental.geofence.centerLat,
      rental.geofence.centerLng,
      reading.latitude,
      reading.longitude,
    );
    if (distance > rental.geofence.radiusKm) {
      const excessKm = distance - rental.geofence.radiusKm;
      overages.push({
        type: 'geofence',
        amount: rental.geofencePenaltyRate,
        description: `Geofence violation: ${excessKm.toFixed(1)}km outside ${rental.geofence.radiusKm}km radius`,
        reading: distance,
        limit: rental.geofence.radiusKm,
        excess: excessKm,
      });
    }
  }

  return overages;
}

// ============================================================================
// Workflow Definition
// ============================================================================

const carRentalTelematicsWorkflow: WorkflowSpec = {
  name: 'car-rental-telematics',
  owner: 'tokenisation-sdk',
  version: '1.0.0',

  triggers: [
    {
      type: 'cron',
      id: 'cron-telematics-poll',
      config: { schedule: POLL_CRON },
    } as CronTrigger,
  ],

  capabilities: {
    http: {
      type: 'http',
      config: {
        allowedDomains: [
          'api.smartcar.com',
          'sandbox.api.high-mobility.com',
        ],
        maxConcurrent: 10,
        timeoutMs: 15_000,
      },
    } as HttpCapability,

    consensus: {
      type: 'consensus',
      config: {
        method: 'median',
        minResponses: 3,
        maxDeviation: 5, // 5% deviation tolerance for odometer/fuel readings
      },
    } as ConsensusCapability,

    evm: {
      type: 'evm',
      config: {
        chainId: CHAIN_ID,
        actions: ['read', 'write'],
      },
    } as EVMCapability,
  },

  async execute(event: TriggerEvent, capabilities) {
    const { http, consensus, evm } = capabilities;

    // Load active rentals from environment/server
    const activeRentalsJson = process.env.CRE_ACTIVE_RENTALS;
    if (!activeRentalsJson) {
      return { status: 'no_active_rentals' };
    }

    const activeRentals: ActiveRental[] = JSON.parse(activeRentalsJson);
    const reports: UsageReport[] = [];

    for (const rental of activeRentals) {
      try {
        // Step 1: Fetch telematics from both sources
        const [smartcarReading, hmReading] = await Promise.all([
          fetchSmartcar(http, rental.smartcarVehicleId),
          fetchHighMobility(http, rental.smartcarVehicleId),
        ]);

        if (!smartcarReading && !hmReading) {
          console.error(`[telematics] No data for vehicle ${rental.vehicleId}`);
          continue;
        }

        // Step 2: DON consensus on telematics readings
        const readings = [smartcarReading, hmReading].filter(Boolean) as TelematicsReading[];
        const avgOdometer = readings.reduce((s, r) => s + r.odometer, 0) / readings.length;
        const avgFuel = readings.reduce((s, r) => s + r.fuelLevel, 0) / readings.length;
        const avgLat = readings.reduce((s, r) => s + r.latitude, 0) / readings.length;
        const avgLng = readings.reduce((s, r) => s + r.longitude, 0) / readings.length;

        const consensusInput = {
          odometer: Math.round(avgOdometer),
          fuelLevel: Math.round(avgFuel),
          latitude: Math.round(avgLat * 10000) / 10000,
          longitude: Math.round(avgLng * 10000) / 10000,
        };

        const agreed = await consensus.reach(consensusInput);

        const consensusReading: TelematicsReading = {
          vehicleId: rental.vehicleId,
          odometer: agreed.odometer as number,
          fuelLevel: agreed.fuelLevel as number,
          latitude: agreed.latitude as number,
          longitude: agreed.longitude as number,
          engineRunning: readings.some((r) => r.engineRunning),
          timestamp: new Date().toISOString(),
          source: 'consensus',
        };

        // Step 3: Detect overages
        const overages = detectOverages(rental, consensusReading);
        const totalCharge = overages.reduce(
          (sum, o) => sum + BigInt(o.amount),
          0n
        );

        // Step 4: Report usage on-chain
        await evm.writeContract({
          address: rental.tokenAddress,
          abi: RENTAL_STATE_ABI,
          functionName: 'reportUsage',
          args: [
            BigInt(rental.tokenId),
            BigInt(consensusReading.odometer),
            BigInt(consensusReading.fuelLevel),
            BigInt(Math.floor(Date.now() / 1000)),
          ],
          chainId: parseInt(CHAIN_ID, 10),
        });

        // Step 5: Charge deposit if overages detected
        let chargedTxHash: string | undefined;
        if (totalCharge > 0n) {
          const rentalIdBytes32 =
            '0x' +
            Buffer.from(rental.rentalId, 'utf-8')
              .toString('hex')
              .padEnd(64, '0');

          const chargeResult = await evm.writeContract({
            address: rental.depositContractAddress,
            abi: DEPOSIT_CONTRACT_ABI,
            functionName: 'chargeDeposit',
            args: [
              rentalIdBytes32,
              totalCharge,
              overages.map((o) => o.description).join('; '),
            ],
            chainId: parseInt(CHAIN_ID, 10),
          });

          chargedTxHash = chargeResult.transactionHash;
          console.log(
            `[telematics] Charged ${totalCharge.toString()} wei from deposit for rental ${rental.rentalId}`
          );
        }

        const mileageUsed = consensusReading.odometer - rental.startOdometer;

        const report: UsageReport = {
          rentalId: rental.rentalId,
          vehicleId: rental.vehicleId,
          currentOdometer: consensusReading.odometer,
          mileageUsed,
          mileageRemaining: Math.max(0, rental.mileageLimit - mileageUsed),
          fuelLevel: consensusReading.fuelLevel,
          isWithinGeofence: !overages.some((o) => o.type === 'geofence'),
          overages,
          totalChargeWei: totalCharge.toString(),
          chargedTxHash,
          timestamp: consensusReading.timestamp,
        };

        reports.push(report);

        // Step 6: POST callback to server
        const callbackUrl =
          process.env.TELEMATICS_CALLBACK_URL ||
          'http://localhost:3000/api/v1/car-rentals/telematics-callback';

        await http.fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'telematics_usage_report',
            report,
          }),
          timeout: 5_000,
        });
      } catch (error) {
        console.error(
          `[telematics] Error processing rental ${rental.rentalId}:`,
          error
        );
      }
    }

    return {
      status: 'complete',
      rentalsProcessed: reports.length,
      totalOveragesDetected: reports.reduce(
        (sum, r) => sum + r.overages.length,
        0
      ),
      reports,
    };
  },
};

export default Workflow.create(carRentalTelematicsWorkflow);
export type { ActiveRental, TelematicsReading, OverageCharge, UsageReport };
