/**
 * IoT Oracle Plugin
 *
 * Provides verified IoT sensor data for utility credits.
 * Supports water meters, electricity meters, and other IoT devices.
 */

// Standalone plugin - does not implement core IOraclePlugin interface
import { UtilityType, type IoTReading } from '../types.js';

/**
 * IoT device configuration
 */
export interface IoTDeviceConfig {
  deviceId: string;
  deviceType: 'WATER_METER' | 'ELECTRICITY_METER' | 'GAS_METER' | 'TEMPERATURE_SENSOR' | 'FLOW_SENSOR';
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  calibrationDate: string;
  certificateId?: string;
}

/**
 * Aggregated meter reading
 */
export interface MeterReading {
  deviceId: string;
  readingType: string;
  value: number;
  unit: string;
  timestamp: string;
  verified: boolean;
  qualityScore: number;
}

/**
 * Delivery verification result
 */
export interface DeliveryVerification {
  verified: boolean;
  quantity: number;
  unit: string;
  qualityScore: number;
  readings: IoTReading[];
  anomalies: string[];
}

/**
 * IoT Oracle Plugin
 *
 * Manages IoT devices and provides verified sensor data.
 */
export class IoTOraclePlugin {
  readonly id = 'iot-oracle';
  readonly name = 'H2O IoT Oracle';
  readonly version = '1.0.0';

  private devices: Map<string, IoTDeviceConfig> = new Map();
  private readings: Map<string, IoTReading[]> = new Map();
  private subscribers: Map<string, ((data: unknown) => void)[]> = new Map();

  /**
   * Get data from IoT oracle
   */
  async getData(dataType: string, params: Record<string, unknown>): Promise<unknown> {
    switch (dataType) {
      case 'METER_READING':
        return this.getMeterReading(params.deviceId as string);
      case 'DELIVERY_VERIFICATION':
        return this.verifyDelivery(
          params.deviceId as string,
          params.expectedQuantity as number,
          params.tolerancePercent as number
        );
      case 'DEVICE_STATUS':
        return this.getDeviceStatus(params.deviceId as string);
      case 'HISTORICAL_READINGS':
        return this.getHistoricalReadings(
          params.deviceId as string,
          params.startTime as string,
          params.endTime as string
        );
      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
  }

  /**
   * Verify data from IoT device
   */
  async verifyData(dataType: string, data: unknown): Promise<boolean> {
    const reading = data as IoTReading;

    // Check device is registered
    if (!this.devices.has(reading.deviceId)) {
      return false;
    }

    // Verify signature if present
    if (reading.signature) {
      return this.verifySignature(reading);
    }

    // Basic validation
    return reading.value >= 0 && reading.timestamp !== undefined;
  }

  /**
   * Subscribe to device updates
   */
  async subscribe(
    dataType: string,
    callback: (data: unknown) => void
  ): Promise<() => void> {
    const subs = this.subscribers.get(dataType) || [];
    subs.push(callback);
    this.subscribers.set(dataType, subs);

    return () => {
      const currentSubs = this.subscribers.get(dataType) || [];
      this.subscribers.set(
        dataType,
        currentSubs.filter(cb => cb !== callback)
      );
    };
  }

  /**
   * Register a new IoT device
   */
  registerDevice(config: IoTDeviceConfig): void {
    this.devices.set(config.deviceId, config);
    this.readings.set(config.deviceId, []);
  }

  /**
   * Record a reading from a device
   */
  recordReading(reading: IoTReading): void {
    const deviceReadings = this.readings.get(reading.deviceId) || [];
    deviceReadings.push(reading);

    // Keep only last 10000 readings per device
    if (deviceReadings.length > 10000) {
      deviceReadings.shift();
    }

    this.readings.set(reading.deviceId, deviceReadings);

    // Notify subscribers
    this.notifySubscribers('METER_READING', reading);
  }

  /**
   * Get latest meter reading
   */
  getMeterReading(deviceId: string): MeterReading | null {
    const deviceReadings = this.readings.get(deviceId);
    if (!deviceReadings || deviceReadings.length === 0) {
      return null;
    }

    const latest = deviceReadings[deviceReadings.length - 1];
    return {
      deviceId: latest.deviceId,
      readingType: latest.readingType,
      value: latest.value,
      unit: latest.unit,
      timestamp: latest.timestamp,
      verified: true,
      qualityScore: this.calculateQualityScore([latest]),
    };
  }

  /**
   * Verify a delivery based on IoT readings
   */
  verifyDelivery(
    deviceId: string,
    expectedQuantity: number,
    tolerancePercent: number = 5
  ): DeliveryVerification {
    const deviceReadings = this.readings.get(deviceId) || [];

    // Get readings from last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentReadings = deviceReadings.filter(r => r.timestamp >= oneHourAgo);

    if (recentReadings.length === 0) {
      return {
        verified: false,
        quantity: 0,
        unit: '',
        qualityScore: 0,
        readings: [],
        anomalies: ['No recent readings found'],
      };
    }

    // Calculate total quantity from readings
    const totalQuantity = recentReadings.reduce((sum, r) => sum + r.value, 0);
    const unit = recentReadings[0].unit;

    // Check tolerance
    const tolerance = expectedQuantity * (tolerancePercent / 100);
    const withinTolerance = Math.abs(totalQuantity - expectedQuantity) <= tolerance;

    // Detect anomalies
    const anomalies: string[] = [];
    const avgValue = totalQuantity / recentReadings.length;
    for (const reading of recentReadings) {
      if (Math.abs(reading.value - avgValue) > avgValue * 0.5) {
        anomalies.push(`Unusual reading: ${reading.value} at ${reading.timestamp}`);
      }
    }

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(recentReadings);

    return {
      verified: withinTolerance && anomalies.length === 0,
      quantity: totalQuantity,
      unit,
      qualityScore,
      readings: recentReadings,
      anomalies,
    };
  }

  /**
   * Get device status
   */
  getDeviceStatus(deviceId: string): {
    online: boolean;
    lastSeen: string | null;
    batteryLevel?: number;
    signalStrength?: number;
  } {
    const deviceReadings = this.readings.get(deviceId);
    if (!deviceReadings || deviceReadings.length === 0) {
      return { online: false, lastSeen: null };
    }

    const latest = deviceReadings[deviceReadings.length - 1];
    const lastSeenTime = new Date(latest.timestamp).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    return {
      online: lastSeenTime > fiveMinutesAgo,
      lastSeen: latest.timestamp,
      batteryLevel: 85 + Math.floor(Math.random() * 15), // Simulated
      signalStrength: 70 + Math.floor(Math.random() * 30), // Simulated
    };
  }

  /**
   * Get historical readings
   */
  getHistoricalReadings(
    deviceId: string,
    startTime: string,
    endTime: string
  ): IoTReading[] {
    const deviceReadings = this.readings.get(deviceId) || [];
    return deviceReadings.filter(
      r => r.timestamp >= startTime && r.timestamp <= endTime
    );
  }

  /**
   * Calculate quality score from readings
   */
  private calculateQualityScore(readings: IoTReading[]): number {
    if (readings.length === 0) return 0;

    // Factors: consistency, recency, completeness
    const avgValue = readings.reduce((sum, r) => sum + r.value, 0) / readings.length;
    const variance = readings.reduce((sum, r) => sum + Math.pow(r.value - avgValue, 2), 0) / readings.length;
    const stdDev = Math.sqrt(variance);
    const consistency = avgValue > 0 ? Math.max(0, 100 - (stdDev / avgValue) * 100) : 100;

    // Check recency
    const latestTime = new Date(readings[readings.length - 1].timestamp).getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const recency = latestTime > fiveMinutesAgo ? 100 : 50;

    // Combined score
    return Math.round((consistency * 0.7 + recency * 0.3) * 10) / 10;
  }

  /**
   * Verify reading signature (simulated)
   */
  private verifySignature(reading: IoTReading): boolean {
    // In production, this would verify cryptographic signatures
    return reading.signature !== undefined && reading.signature.length > 0;
  }

  /**
   * Notify subscribers of new data
   */
  private notifySubscribers(dataType: string, data: unknown): void {
    const subs = this.subscribers.get(dataType) || [];
    for (const callback of subs) {
      try {
        callback(data);
      } catch (e) {
        console.error('Error notifying subscriber:', e);
      }
    }
  }

  /**
   * Simulate IoT readings for demo
   */
  simulateReadings(
    deviceId: string,
    utilityType: UtilityType,
    count: number = 10,
    baseValue: number = 100
  ): IoTReading[] {
    const readings: IoTReading[] = [];
    const units: Record<UtilityType, string> = {
      [UtilityType.WATER]: 'LITERS',
      [UtilityType.ELECTRICITY]: 'KWH',
      [UtilityType.GAS]: 'M3',
      [UtilityType.COLD_CHAIN]: 'CELSIUS',
    };

    for (let i = 0; i < count; i++) {
      const reading: IoTReading = {
        deviceId,
        readingType: utilityType,
        value: baseValue + (Math.random() - 0.5) * baseValue * 0.1,
        unit: units[utilityType],
        timestamp: new Date(Date.now() - (count - i) * 60000).toISOString(),
        signature: 'sim_sig_' + Math.random().toString(36).slice(2, 10),
      };

      readings.push(reading);
      this.recordReading(reading);
    }

    return readings;
  }
}
