/**
 * COMET Data Adapter
 *
 * Connects to the real COMET logistics app API to fetch:
 * - Driver telematics data
 * - Delivery completion events
 * - Customer ratings
 *
 * Bridges this data to Chainlink Functions for oracle-verified scoring.
 */

import crypto from 'crypto';
import type { ChainlinkFunctionsPlugin, SafetyScoreResult, CarbonOffsetResult } from '../../plugins/chainlink/FunctionsPlugin.js';
import type { TelematicsReading, TelematicsEventType, DeliveryTracking } from '../plugins/TelematicsOracle.js';

export interface CometConfig {
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  environment: 'development' | 'staging' | 'production';
}

export interface CometDriver {
  id: string;
  name: string;
  vehicleId: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_DELIVERY';
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  totalDeliveries: number;
  rating: number;
}

export interface CometDelivery {
  id: string;
  driverId: string;
  status: 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  pickupLocation: { lat: number; lng: number; address: string };
  dropoffLocation: { lat: number; lng: number; address: string };
  estimatedTime: string;
  actualTime?: string;
  distance: number;
  customerRating?: number;
}

export interface CometTelematicsEvent {
  id: string;
  driverId: string;
  vehicleId: string;
  type: TelematicsEventType;
  timestamp: string;
  location: { lat: number; lng: number };
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  metadata?: Record<string, unknown>;
}

export interface CometWebhookPayload {
  event: string;
  timestamp: string;
  signature: string;
  data: Record<string, unknown>;
}

export interface WebhookEvent {
  type: 'delivery.completed' | 'delivery.failed' | 'telematics.event' | 'rating.received' | 'driver.tier_changed';
  payload: Record<string, unknown>;
  processedAt: string;
}

/**
 * COMET Data Adapter
 *
 * Fetches real data from COMET logistics platform and bridges it
 * to Chainlink Functions for on-chain verification.
 */
export class CometDataAdapter {
  private config: CometConfig;
  private functionsPlugin?: ChainlinkFunctionsPlugin;
  private eventHandlers: Map<string, ((event: WebhookEvent) => Promise<void>)[]> = new Map();

  constructor(config: CometConfig) {
    this.config = config;
  }

  /**
   * Set the Chainlink Functions plugin for oracle calls
   */
  setFunctionsPlugin(plugin: ChainlinkFunctionsPlugin): void {
    this.functionsPlugin = plugin;
  }

  /**
   * Fetch driver details from COMET API
   */
  async getDriver(driverId: string): Promise<CometDriver | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/drivers/${driverId}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`COMET API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch driver:', error);
      return null;
    }
  }

  /**
   * Fetch telematics data for a driver
   */
  async getDriverTelematics(
    driverId: string,
    options?: { startTime?: string; endTime?: string; limit?: number }
  ): Promise<TelematicsReading[]> {
    try {
      const params = new URLSearchParams();
      if (options?.startTime) params.set('start', options.startTime);
      if (options?.endTime) params.set('end', options.endTime);
      if (options?.limit) params.set('limit', options.limit.toString());

      const response = await fetch(
        `${this.config.apiUrl}/drivers/${driverId}/telematics?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`COMET API error: ${response.status}`);
      }

      const data = await response.json();
      return this.transformTelematicsData(data);
    } catch (error) {
      console.error('Failed to fetch telematics:', error);
      return [];
    }
  }

  /**
   * Fetch telematics events (safety events) for a driver
   */
  async getDriverTelematicsEvents(
    driverId: string,
    options?: { startTime?: string; endTime?: string }
  ): Promise<CometTelematicsEvent[]> {
    try {
      const params = new URLSearchParams();
      if (options?.startTime) params.set('start', options.startTime);
      if (options?.endTime) params.set('end', options.endTime);

      const response = await fetch(
        `${this.config.apiUrl}/drivers/${driverId}/events?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`COMET API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch telematics events:', error);
      return [];
    }
  }

  /**
   * Fetch delivery details
   */
  async getDelivery(deliveryId: string): Promise<CometDelivery | null> {
    try {
      const response = await fetch(`${this.config.apiUrl}/deliveries/${deliveryId}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`COMET API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch delivery:', error);
      return null;
    }
  }

  /**
   * Fetch active drivers
   */
  async getActiveDrivers(): Promise<CometDriver[]> {
    try {
      const response = await fetch(`${this.config.apiUrl}/drivers?status=ACTIVE`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`COMET API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch active drivers:', error);
      return [];
    }
  }

  /**
   * Handle incoming webhook from COMET
   */
  async handleWebhook(payload: CometWebhookPayload): Promise<WebhookEvent> {
    // Verify signature
    if (!this.verifyWebhookSignature(payload)) {
      throw new Error('Invalid webhook signature');
    }

    const event: WebhookEvent = {
      type: payload.event as WebhookEvent['type'],
      payload: payload.data,
      processedAt: new Date().toISOString(),
    };

    // Process based on event type
    switch (payload.event) {
      case 'delivery.completed':
        await this.processDeliveryCompleted(payload.data);
        break;
      case 'delivery.failed':
        await this.processDeliveryFailed(payload.data);
        break;
      case 'telematics.event':
        await this.processTelematicsEvent(payload.data);
        break;
      case 'rating.received':
        await this.processRatingReceived(payload.data);
        break;
      case 'driver.tier_changed':
        await this.processDriverTierChanged(payload.data);
        break;
    }

    // Notify registered handlers
    await this.notifyHandlers(event);

    return event;
  }

  /**
   * Trigger safety score update via Chainlink Functions
   */
  async triggerSafetyScoreUpdate(driverId: string): Promise<SafetyScoreResult | null> {
    if (!this.functionsPlugin) {
      console.warn('Functions plugin not set, using local calculation');
      return null;
    }

    // Fetch events from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const events = await this.getDriverTelematicsEvents(driverId, { startTime: thirtyDaysAgo });

    // Aggregate events by type
    const eventCounts = this.aggregateEvents(events);

    // Call Chainlink Functions
    const result = await this.functionsPlugin.calculateSafetyScore(eventCounts);

    if (!result.success) {
      console.error('Failed to calculate safety score:', result.error);
      return null;
    }

    return result.data;
  }

  /**
   * Trigger carbon offset calculation via Chainlink Functions
   */
  async triggerCarbonOffsetCalculation(
    utilityType: string,
    quantity: number,
    region: string = 'UAE'
  ): Promise<CarbonOffsetResult | null> {
    if (!this.functionsPlugin) {
      console.warn('Functions plugin not set');
      return null;
    }

    const result = await this.functionsPlugin.calculateCarbonOffset(utilityType, quantity, region);

    if (!result.success) {
      console.error('Failed to calculate carbon offset:', result.error);
      return null;
    }

    return result.data;
  }

  /**
   * Register handler for webhook events
   */
  onEvent(eventType: string, handler: (event: WebhookEvent) => Promise<void>): () => void {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventType, handlers);

    return () => {
      const current = this.eventHandlers.get(eventType) || [];
      this.eventHandlers.set(eventType, current.filter(h => h !== handler));
    };
  }

  // Private methods

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
      'X-API-Version': '2024-01',
    };
  }

  private verifyWebhookSignature(payload: CometWebhookPayload): boolean {
    const { signature, ...data } = payload;

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(JSON.stringify(data))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  private transformTelematicsData(rawData: Record<string, unknown>[]): TelematicsReading[] {
    return rawData.map(item => ({
      vehicleId: item.vehicle_id as string,
      driverId: item.driver_id as string,
      timestamp: item.timestamp as string,
      location: {
        lat: (item.location as Record<string, number>).latitude,
        lng: (item.location as Record<string, number>).longitude,
      },
      speed: item.speed as number,
      heading: item.heading as number,
      events: (item.events as string[]) || [],
      fuelLevel: item.fuel_level as number | undefined,
      engineStatus: item.engine_status as 'ON' | 'OFF' | 'IDLE',
    })) as TelematicsReading[];
  }

  private aggregateEvents(
    events: CometTelematicsEvent[]
  ): Array<{ type: TelematicsEventType; count: number }> {
    const counts = new Map<TelematicsEventType, number>();

    for (const event of events) {
      const current = counts.get(event.type) || 0;
      counts.set(event.type, current + 1);
    }

    return Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
  }

  private async processDeliveryCompleted(data: Record<string, unknown>): Promise<void> {
    const driverId = data.driver_id as string;
    const deliveryId = data.delivery_id as string;

    console.log(`Processing completed delivery: ${deliveryId} by driver ${driverId}`);

    // Trigger safety score update
    await this.triggerSafetyScoreUpdate(driverId);
  }

  private async processDeliveryFailed(data: Record<string, unknown>): Promise<void> {
    const driverId = data.driver_id as string;
    const reason = data.reason as string;

    console.log(`Delivery failed for driver ${driverId}: ${reason}`);
  }

  private async processTelematicsEvent(data: Record<string, unknown>): Promise<void> {
    const eventType = data.event_type as string;
    const driverId = data.driver_id as string;

    console.log(`Telematics event ${eventType} for driver ${driverId}`);
  }

  private async processRatingReceived(data: Record<string, unknown>): Promise<void> {
    const driverId = data.driver_id as string;
    const rating = data.rating as number;

    console.log(`Rating ${rating} received for driver ${driverId}`);
  }

  private async processDriverTierChanged(data: Record<string, unknown>): Promise<void> {
    const driverId = data.driver_id as string;
    const oldTier = data.old_tier as string;
    const newTier = data.new_tier as string;

    console.log(`Driver ${driverId} tier changed: ${oldTier} -> ${newTier}`);
  }

  private async notifyHandlers(event: WebhookEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.type) || [];

    await Promise.all(handlers.map(handler => handler(event).catch(err => {
      console.error(`Handler error for ${event.type}:`, err);
    })));
  }
}

// Factory function
export function createCometAdapter(config: CometConfig): CometDataAdapter {
  return new CometDataAdapter(config);
}

// Development adapter with mock API
export function createDevCometAdapter(): CometDataAdapter {
  return new CometDataAdapter({
    apiUrl: 'https://api.dev.comet.ahoy.dev',
    apiKey: 'dev-api-key',
    webhookSecret: 'dev-webhook-secret',
    environment: 'development',
  });
}

export default CometDataAdapter;
