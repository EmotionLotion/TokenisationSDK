/**
 * COMET API Service
 *
 * Connects the UI dashboard to the COMET mock server (or real COMET API).
 * Provides real-time data for drivers, deliveries, and safety scores.
 */

// API Configuration
const COMET_API_URL = import.meta.env.VITE_COMET_API_URL || 'http://localhost:3001';

export interface CometApiDriver {
  id: string;
  name: string;
  vehicleId: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ON_DELIVERY';
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  totalDeliveries: number;
  rating: number;
  joinedAt: string;
}

export interface CometApiDelivery {
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

export interface CometSafetyScore {
  driverId: string;
  driverName: string;
  score: number;
  eventCounts: Record<string, number>;
  penalties: Record<string, number>;
  calculatedAt: string;
  source: string;
}

export interface CometSafetyPenalties {
  HARD_BRAKE: number;
  RAPID_ACCELERATION: number;
  SPEEDING: number;
  HARSH_CORNERING: number;
  IDLE_TIME: number;
  ROUTE_DEVIATION: number;
}

export interface CometWebhookEvent {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

type EventCallback = (event: CometWebhookEvent) => void;

class CometApiService {
  private baseUrl: string;
  private eventListeners: Map<string, EventCallback[]> = new Map();
  private pollingInterval: number | null = null;
  private lastEventTimestamp: string | null = null;

  constructor(baseUrl: string = COMET_API_URL) {
    this.baseUrl = baseUrl;
  }

  // ============================================================
  // Health & Configuration
  // ============================================================

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getSafetyPenalties(): Promise<CometSafetyPenalties> {
    const res = await fetch(`${this.baseUrl}/v1/config/safety-penalties`);
    if (!res.ok) throw new Error('Failed to fetch safety penalties');
    return res.json();
  }

  async getLoyaltyMultipliers(): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}/v1/config/loyalty-multipliers`);
    if (!res.ok) throw new Error('Failed to fetch loyalty multipliers');
    return res.json();
  }

  // ============================================================
  // Drivers
  // ============================================================

  async getDrivers(status?: string): Promise<CometApiDriver[]> {
    const url = status
      ? `${this.baseUrl}/v1/drivers?status=${status}`
      : `${this.baseUrl}/v1/drivers`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch drivers');
    return res.json();
  }

  async getDriver(driverId: string): Promise<CometApiDriver | null> {
    const res = await fetch(`${this.baseUrl}/v1/drivers/${driverId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch driver');
    return res.json();
  }

  async getDriverEvents(driverId: string): Promise<Array<{ type: string; timestamp: string; severity: string }>> {
    const res = await fetch(`${this.baseUrl}/v1/drivers/${driverId}/events`);
    if (!res.ok) throw new Error('Failed to fetch driver events');
    return res.json();
  }

  async getDriverSafetyScore(driverId: string): Promise<CometSafetyScore> {
    const res = await fetch(`${this.baseUrl}/simulate/safety-score/${driverId}`);
    if (!res.ok) throw new Error('Failed to fetch safety score');
    return res.json();
  }

  // ============================================================
  // Deliveries
  // ============================================================

  async getDelivery(deliveryId: string): Promise<CometApiDelivery | null> {
    const res = await fetch(`${this.baseUrl}/v1/deliveries/${deliveryId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch delivery');
    return res.json();
  }

  // ============================================================
  // Simulation Endpoints (for demo)
  // ============================================================

  async simulateDeliveryComplete(driverId: string, rating: number = 5): Promise<{
    success: boolean;
    delivery: CometApiDelivery;
    webhook: CometWebhookEvent;
  }> {
    const res = await fetch(`${this.baseUrl}/simulate/delivery-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, rating }),
    });
    if (!res.ok) throw new Error('Failed to simulate delivery');
    return res.json();
  }

  async simulateSafetyEvent(
    driverId: string,
    eventType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): Promise<{
    success: boolean;
    event: { type: string; timestamp: string; severity: string };
    webhook: CometWebhookEvent;
  }> {
    const res = await fetch(`${this.baseUrl}/simulate/safety-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, eventType, severity }),
    });
    if (!res.ok) throw new Error('Failed to simulate safety event');
    return res.json();
  }

  // ============================================================
  // Real-time Updates (Polling-based for demo)
  // ============================================================

  startPolling(intervalMs: number = 3000): void {
    if (this.pollingInterval) return;

    this.pollingInterval = window.setInterval(async () => {
      try {
        // Poll for driver updates
        const drivers = await this.getDrivers();
        this.emit('drivers.updated', {
          event: 'drivers.updated',
          timestamp: new Date().toISOString(),
          data: { drivers },
        });

        // Poll for safety score updates
        for (const driver of drivers) {
          const score = await this.getDriverSafetyScore(driver.id);
          this.emit('score.updated', {
            event: 'score.updated',
            timestamp: new Date().toISOString(),
            data: { driverId: driver.id, score },
          });
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      window.clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Event emitter
  on(event: string, callback: EventCallback): () => void {
    const listeners = this.eventListeners.get(event) || [];
    listeners.push(callback);
    this.eventListeners.set(event, listeners);

    return () => {
      const current = this.eventListeners.get(event) || [];
      this.eventListeners.set(event, current.filter(cb => cb !== callback));
    };
  }

  private emit(event: string, data: CometWebhookEvent): void {
    const listeners = this.eventListeners.get(event) || [];
    for (const callback of listeners) {
      try {
        callback(data);
      } catch (e) {
        console.error('Event listener error:', e);
      }
    }
  }

  // ============================================================
  // Transform to UI Store format
  // ============================================================

  transformDriverForStore(apiDriver: CometApiDriver, score?: CometSafetyScore) {
    return {
      id: apiDriver.id,
      name: apiDriver.name,
      walletAddress: `0x${apiDriver.id.replace('DRV-', '').padStart(40, '0')}`,
      vehicleType: 'CAR' as const,
      vehiclePlate: apiDriver.vehicleId,
      status: apiDriver.status === 'ON_DELIVERY' ? 'ON_DELIVERY' as const :
              apiDriver.status === 'ACTIVE' ? 'AVAILABLE' as const : 'OFFLINE' as const,
      overallScore: score?.score || 85,
      safetyScore: score?.score || 85,
      efficiencyScore: 90,
      reliabilityScore: 88,
      totalDeliveries: apiDriver.totalDeliveries,
      perfectDeliveries: Math.floor(apiDriver.totalDeliveries * 0.85),
      totalEarnings: `${(apiDriver.totalDeliveries * 15).toFixed(2)} AED`,
      ahoyBalance: apiDriver.totalDeliveries * 10,
      joinedAt: apiDriver.joinedAt,
    };
  }
}

// Singleton instance
export const cometApi = new CometApiService();

// React hook for using COMET API
export function useCometApi() {
  return cometApi;
}

export default cometApi;
