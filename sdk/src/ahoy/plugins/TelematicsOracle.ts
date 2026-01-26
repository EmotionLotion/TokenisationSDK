/**
 * Telematics Oracle Plugin
 *
 * Provides driver telematics data for reputation scoring.
 * Integrates with COMET vehicle tracking systems.
 *
 * Can optionally use Chainlink Functions for oracle-verified scoring
 * instead of hardcoded penalty values.
 */

// Standalone plugin - does not implement core IOraclePlugin interface

import type { ChainlinkFunctionsPlugin, SafetyScoreResult } from '../../plugins/chainlink/FunctionsPlugin.js';
import { ValidationError } from '../../errors/index.js';

/**
 * Telematics event types
 */
export enum TelematicsEventType {
  HARD_BRAKE = 'HARD_BRAKE',
  RAPID_ACCELERATION = 'RAPID_ACCELERATION',
  SPEEDING = 'SPEEDING',
  HARSH_CORNERING = 'HARSH_CORNERING',
  IDLE_TIME = 'IDLE_TIME',
  ROUTE_DEVIATION = 'ROUTE_DEVIATION',
}

/**
 * Telematics reading from vehicle
 */
export interface TelematicsReading {
  vehicleId: string;
  driverId: string;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
  };
  speed: number; // km/h
  heading: number; // degrees
  events: TelematicsEventType[];
  fuelLevel?: number;
  engineStatus: 'ON' | 'OFF' | 'IDLE';
}

/**
 * Delivery tracking data
 */
export interface DeliveryTracking {
  deliveryId: string;
  driverId: string;
  status: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  pickupTime?: string;
  deliveryTime?: string;
  estimatedDeliveryTime: string;
  actualRoute: Array<{ lat: number; lng: number; timestamp: string }>;
  distanceKm: number;
}

/**
 * Telematics Oracle Plugin
 *
 * Provides real-time vehicle and driver data for COMET operations.
 */
export class TelematicsOraclePlugin {
  readonly id = 'telematics-oracle';
  readonly name = 'COMET Telematics Oracle';
  readonly version = '1.0.0';

  private readings: Map<string, TelematicsReading[]> = new Map();
  private deliveries: Map<string, DeliveryTracking> = new Map();

  // Optional Chainlink Functions plugin for oracle-verified scoring
  private functionsPlugin?: ChainlinkFunctionsPlugin;

  /**
   * Set Chainlink Functions plugin for oracle-verified calculations
   * When set, safety scores will use Chainlink Functions instead of hardcoded values
   */
  setFunctionsPlugin(plugin: ChainlinkFunctionsPlugin): void {
    this.functionsPlugin = plugin;
  }

  /**
   * Check if oracle-verified scoring is available
   */
  isOracleVerified(): boolean {
    return this.functionsPlugin !== undefined;
  }

  /**
   * Get latest data from the oracle
   */
  async getData(dataType: string, params: Record<string, unknown>): Promise<unknown> {
    switch (dataType) {
      case 'DRIVER_TELEMATICS':
        return this.getDriverTelematics(params.driverId as string);
      case 'DELIVERY_STATUS':
        return this.getDeliveryStatus(params.deliveryId as string);
      case 'DRIVER_SAFETY_SCORE':
        return this.calculateSafetyScore(params.driverId as string);
      case 'ROUTE_EFFICIENCY':
        return this.calculateRouteEfficiency(params.deliveryId as string);
      default:
        throw new ValidationError(`Unknown data type: ${dataType}`, {
          field: 'dataType',
          constraints: { allowedValues: 'DRIVER_TELEMATICS, DELIVERY_STATUS, DRIVER_SAFETY_SCORE, ROUTE_EFFICIENCY' },
        });
    }
  }

  /**
   * Verify data from external source
   */
  async verifyData(dataType: string, data: unknown): Promise<boolean> {
    // In production, this would verify signatures from telematics devices
    return true;
  }

  /**
   * Subscribe to real-time updates
   */
  async subscribe(
    dataType: string,
    callback: (data: unknown) => void
  ): Promise<() => void> {
    // Simulate real-time updates
    const interval = setInterval(() => {
      if (dataType === 'DRIVER_TELEMATICS') {
        callback(this.generateMockReading());
      }
    }, 5000);

    return () => clearInterval(interval);
  }

  /**
   * Record a telematics reading
   */
  recordReading(reading: TelematicsReading): void {
    const driverReadings = this.readings.get(reading.driverId) || [];
    driverReadings.push(reading);
    // Keep only last 1000 readings per driver
    if (driverReadings.length > 1000) {
      driverReadings.shift();
    }
    this.readings.set(reading.driverId, driverReadings);
  }

  /**
   * Start delivery tracking
   */
  startDelivery(delivery: DeliveryTracking): void {
    this.deliveries.set(delivery.deliveryId, delivery);
  }

  /**
   * Update delivery status
   */
  updateDeliveryStatus(
    deliveryId: string,
    status: DeliveryTracking['status'],
    location?: { lat: number; lng: number }
  ): void {
    const delivery = this.deliveries.get(deliveryId);
    if (delivery) {
      delivery.status = status;
      if (location) {
        delivery.actualRoute.push({
          ...location,
          timestamp: new Date().toISOString(),
        });
      }
      if (status === 'DELIVERED') {
        delivery.deliveryTime = new Date().toISOString();
      }
    }
  }

  /**
   * Get driver telematics history
   */
  private getDriverTelematics(driverId: string): TelematicsReading[] {
    return this.readings.get(driverId) || [];
  }

  /**
   * Get delivery status
   */
  private getDeliveryStatus(deliveryId: string): DeliveryTracking | null {
    return this.deliveries.get(deliveryId) || null;
  }

  /**
   * Calculate safety score from telematics data
   * Uses Chainlink Functions when available, otherwise falls back to local calculation
   */
  private calculateSafetyScore(driverId: string): {
    score: number;
    eventBreakdown: Record<TelematicsEventType, number>;
  } {
    const eventCounts = this.aggregateEventCounts(driverId);

    // Use local calculation (Chainlink Functions version is async - see calculateSafetyScoreVerified)
    const score = this.calculateLocalSafetyScore(eventCounts);

    return {
      score: Math.round(score * 10) / 10,
      eventBreakdown: eventCounts,
    };
  }

  /**
   * Calculate safety score using Chainlink Functions (oracle-verified)
   * This method fetches penalty weights from external APIs, not hardcoded values
   */
  async calculateSafetyScoreVerified(driverId: string): Promise<{
    score: number;
    eventBreakdown: Record<TelematicsEventType, number>;
    source: 'chainlink-functions' | 'local';
    calculatedAt: string;
  }> {
    const eventCounts = this.aggregateEventCounts(driverId);

    // If Chainlink Functions plugin is available, use it for oracle-verified scoring
    if (this.functionsPlugin) {
      const events = Object.entries(eventCounts).map(([type, count]) => ({
        type: type as TelematicsEventType,
        count,
      }));

      const result = await this.functionsPlugin.calculateSafetyScore(events);

      if (result.success) {
        return {
          score: result.data.score,
          eventBreakdown: eventCounts,
          source: 'chainlink-functions',
          calculatedAt: result.data.calculatedAt,
        };
      }

      console.warn('Chainlink Functions call failed, falling back to local calculation');
    }

    // Fallback to local calculation
    const score = this.calculateLocalSafetyScore(eventCounts);

    return {
      score: Math.round(score * 10) / 10,
      eventBreakdown: eventCounts,
      source: 'local',
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregate event counts from readings
   */
  private aggregateEventCounts(driverId: string): Record<TelematicsEventType, number> {
    const readings = this.readings.get(driverId) || [];

    const eventCounts: Record<TelematicsEventType, number> = {
      [TelematicsEventType.HARD_BRAKE]: 0,
      [TelematicsEventType.RAPID_ACCELERATION]: 0,
      [TelematicsEventType.SPEEDING]: 0,
      [TelematicsEventType.HARSH_CORNERING]: 0,
      [TelematicsEventType.IDLE_TIME]: 0,
      [TelematicsEventType.ROUTE_DEVIATION]: 0,
    };

    for (const reading of readings) {
      for (const event of reading.events) {
        eventCounts[event]++;
      }
    }

    return eventCounts;
  }

  /**
   * Local safety score calculation (used as fallback)
   * NOTE: These penalties are defaults. In production, use calculateSafetyScoreVerified()
   * to get penalty weights from Chainlink Functions/COMET API
   */
  private calculateLocalSafetyScore(eventCounts: Record<TelematicsEventType, number>): number {
    // Default penalties - in production these should come from oracle
    // See: functions/safetyScore.js for the Chainlink Functions version
    const DEFAULT_PENALTIES = {
      [TelematicsEventType.HARD_BRAKE]: 2,
      [TelematicsEventType.RAPID_ACCELERATION]: 1,
      [TelematicsEventType.SPEEDING]: 5,
      [TelematicsEventType.HARSH_CORNERING]: 2,
      [TelematicsEventType.IDLE_TIME]: 0.5,
      [TelematicsEventType.ROUTE_DEVIATION]: 1,
    };

    let totalPenalty = 0;
    for (const [event, count] of Object.entries(eventCounts)) {
      totalPenalty += count * DEFAULT_PENALTIES[event as TelematicsEventType];
    }

    return Math.max(0, 100 - totalPenalty);
  }

  /**
   * Calculate route efficiency
   */
  private calculateRouteEfficiency(deliveryId: string): {
    efficiency: number;
    onTime: boolean;
    actualDistanceKm: number;
    optimalDistanceKm: number;
  } {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      return { efficiency: 0, onTime: false, actualDistanceKm: 0, optimalDistanceKm: 0 };
    }

    // Calculate actual distance from route
    let actualDistanceKm = 0;
    for (let i = 1; i < delivery.actualRoute.length; i++) {
      const prev = delivery.actualRoute[i - 1];
      const curr = delivery.actualRoute[i];
      actualDistanceKm += this.haversineDistance(prev.lat, prev.lng, curr.lat, curr.lng);
    }

    // Assume optimal distance is 90% of actual (in real system, would use routing API)
    const optimalDistanceKm = actualDistanceKm * 0.9;

    const efficiency = optimalDistanceKm > 0
      ? Math.min(100, (optimalDistanceKm / actualDistanceKm) * 100)
      : 100;

    const onTime = delivery.deliveryTime
      ? new Date(delivery.deliveryTime) <= new Date(delivery.estimatedDeliveryTime)
      : false;

    return {
      efficiency: Math.round(efficiency * 10) / 10,
      onTime,
      actualDistanceKm: Math.round(actualDistanceKm * 10) / 10,
      optimalDistanceKm: Math.round(optimalDistanceKm * 10) / 10,
    };
  }

  /**
   * Calculate distance between two points (Haversine formula)
   */
  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Generate mock telematics reading for demo
   */
  private generateMockReading(): TelematicsReading {
    return {
      vehicleId: 'VEH-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      driverId: 'DRV-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      timestamp: new Date().toISOString(),
      location: {
        lat: 25.2048 + (Math.random() - 0.5) * 0.1,
        lng: 55.2708 + (Math.random() - 0.5) * 0.1,
      },
      speed: Math.floor(Math.random() * 80) + 20,
      heading: Math.floor(Math.random() * 360),
      events: Math.random() > 0.9 ? [TelematicsEventType.HARD_BRAKE] : [],
      fuelLevel: Math.floor(Math.random() * 100),
      engineStatus: 'ON',
    };
  }
}
