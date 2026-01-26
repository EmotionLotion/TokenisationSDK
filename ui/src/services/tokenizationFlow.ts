/**
 * Tokenization Flow Service
 *
 * Connects ALL pieces of the COMET tokenization demo:
 * 1. Fleet Operations (deliveries) → triggers events
 * 2. COMET Server → records telematics & events
 * 3. Chainlink Oracle → verifies safety score
 * 4. ReputationSBT → on-chain update
 * 5. AHOY Token → loyalty rewards
 *
 * This is the ORCHESTRATION layer that makes the demo coherent.
 */

import { cometApi } from './cometApi';
import { sdkStore } from '../store';

// Simulated blockchain state (would be real contract calls in production)
interface OnChainState {
  sbtTokenId: number | null;
  sbtScore: number;
  sbtTier: string;
  sbtLastUpdate: string | null;
  ahoyBalance: number;
  pendingTxHash: string | null;
}

interface FlowEvent {
  id: string;
  type: 'DELIVERY_COMPLETE' | 'SAFETY_EVENT' | 'SCORE_UPDATE' | 'SBT_UPDATE' | 'AHOY_MINT';
  timestamp: string;
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'success' | 'failed';
}

type FlowEventCallback = (event: FlowEvent) => void;

class TokenizationFlowService {
  private onChainState: Map<string, OnChainState> = new Map();
  private flowEvents: FlowEvent[] = [];
  private listeners: FlowEventCallback[] = [];
  private isConnectedToComet: boolean = false;

  constructor() {
    this.initializeDriverStates();
  }

  private initializeDriverStates() {
    // Initialize on-chain state for demo drivers
    const demoDrivers = ['DRV-001', 'DRV-002', 'DRV-003'];
    demoDrivers.forEach((driverId, index) => {
      this.onChainState.set(driverId, {
        sbtTokenId: index + 1,
        sbtScore: 85 + index * 5,
        sbtTier: index === 2 ? 'PLATINUM' : index === 1 ? 'GOLD' : 'SILVER',
        sbtLastUpdate: new Date().toISOString(),
        ahoyBalance: 500 + index * 300,
        pendingTxHash: null,
      });
    });
  }

  /**
   * Check connection to COMET server
   */
  async checkConnection(): Promise<boolean> {
    try {
      this.isConnectedToComet = await cometApi.checkHealth();
      return this.isConnectedToComet;
    } catch {
      this.isConnectedToComet = false;
      return false;
    }
  }

  /**
   * MAIN FLOW: Complete a delivery with full tokenization
   *
   * This is the E2E flow that connects everything:
   * 1. Record delivery completion in COMET
   * 2. Get safety score from oracle
   * 3. Update SBT on-chain
   * 4. Mint AHOY rewards
   */
  async completeDeliveryWithTokenization(
    driverId: string,
    deliveryData: {
      deliveryId: string;
      rating: number;
      wasOnTime: boolean;
      distance: number;
    }
  ): Promise<{
    success: boolean;
    steps: {
      cometRecord: boolean;
      oracleScore: number | null;
      sbtUpdate: boolean;
      ahoyMinted: number;
    };
    txHash?: string;
    error?: string;
  }> {
    const steps = {
      cometRecord: false,
      oracleScore: null as number | null,
      sbtUpdate: false,
      ahoyMinted: 0,
    };

    try {
      // Step 1: Record in COMET
      this.emitEvent({
        type: 'DELIVERY_COMPLETE',
        data: { driverId, deliveryId: deliveryData.deliveryId },
        status: 'processing',
      });

      if (this.isConnectedToComet) {
        await cometApi.simulateDeliveryComplete(driverId, deliveryData.rating);
        steps.cometRecord = true;
      } else {
        // Fallback to local store
        steps.cometRecord = true;
      }

      this.updateEventStatus('DELIVERY_COMPLETE', 'success');

      // Step 2: Get safety score from oracle
      this.emitEvent({
        type: 'SCORE_UPDATE',
        data: { driverId },
        status: 'processing',
      });

      await this.simulateDelay(800); // Simulate oracle call

      let score: number;
      if (this.isConnectedToComet) {
        const scoreData = await cometApi.getDriverSafetyScore(driverId);
        score = scoreData.score;
      } else {
        // Calculate locally
        score = this.calculateLocalScore(driverId, deliveryData);
      }
      steps.oracleScore = score;

      this.updateEventStatus('SCORE_UPDATE', 'success');

      // Step 3: Update SBT on-chain
      this.emitEvent({
        type: 'SBT_UPDATE',
        data: { driverId, newScore: score },
        status: 'processing',
      });

      await this.simulateDelay(1500); // Simulate blockchain tx

      const txHash = this.simulateSBTUpdate(driverId, score);
      steps.sbtUpdate = true;

      this.updateEventStatus('SBT_UPDATE', 'success');

      // Step 4: Mint AHOY rewards
      this.emitEvent({
        type: 'AHOY_MINT',
        data: { driverId },
        status: 'processing',
      });

      const ahoyAmount = this.calculateAhoyReward(deliveryData, score);
      this.mintAhoyReward(driverId, ahoyAmount);
      steps.ahoyMinted = ahoyAmount;

      // Also update the local store
      sdkStore.simulateAhoyAction(
        deliveryData.rating === 5 ? 'PERFECT_DELIVERY_WEEK' : 'DELIVERY_COMPLETED',
        'COMET'
      );

      this.updateEventStatus('AHOY_MINT', 'success');

      return {
        success: true,
        steps,
        txHash,
      };

    } catch (error) {
      return {
        success: false,
        steps,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Record a safety event and update scores
   */
  async recordSafetyEvent(
    driverId: string,
    eventType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  ): Promise<{
    success: boolean;
    newScore: number | null;
    penalty: number;
  }> {
    this.emitEvent({
      type: 'SAFETY_EVENT',
      data: { driverId, eventType, severity },
      status: 'processing',
    });

    try {
      // Record in COMET
      if (this.isConnectedToComet) {
        await cometApi.simulateSafetyEvent(driverId, eventType, severity);
      }

      // Get updated score
      await this.simulateDelay(500);

      let newScore: number;
      let penalty: number;

      if (this.isConnectedToComet) {
        const scoreData = await cometApi.getDriverSafetyScore(driverId);
        newScore = scoreData.score;
        penalty = scoreData.penalties[eventType] || 0;
      } else {
        penalty = this.getLocalPenalty(eventType);
        const state = this.onChainState.get(driverId);
        newScore = Math.max(0, (state?.sbtScore || 85) - penalty);
      }

      // Update on-chain state
      this.simulateSBTUpdate(driverId, newScore);

      this.updateEventStatus('SAFETY_EVENT', 'success');

      return { success: true, newScore, penalty };

    } catch (error) {
      this.updateEventStatus('SAFETY_EVENT', 'failed');
      return { success: false, newScore: null, penalty: 0 };
    }
  }

  /**
   * Get current on-chain state for a driver
   */
  getOnChainState(driverId: string): OnChainState | null {
    return this.onChainState.get(driverId) || null;
  }

  /**
   * Get all flow events
   */
  getFlowEvents(): FlowEvent[] {
    return [...this.flowEvents].slice(-20); // Last 20 events
  }

  /**
   * Subscribe to flow events
   */
  onFlowEvent(callback: FlowEventCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Private helpers

  private emitEvent(event: Omit<FlowEvent, 'id' | 'timestamp'>) {
    const fullEvent: FlowEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };

    this.flowEvents.push(fullEvent);
    this.listeners.forEach(l => l(fullEvent));
  }

  private updateEventStatus(type: FlowEvent['type'], status: FlowEvent['status']) {
    const event = [...this.flowEvents].reverse().find(e => e.type === type);
    if (event) {
      event.status = status;
      this.listeners.forEach(l => l(event));
    }
  }

  private simulateSBTUpdate(driverId: string, newScore: number): string {
    const state = this.onChainState.get(driverId);
    if (state) {
      state.sbtScore = newScore;
      state.sbtTier = this.calculateTier(newScore);
      state.sbtLastUpdate = new Date().toISOString();
      state.pendingTxHash = `0x${Math.random().toString(16).slice(2, 66)}`;
    }
    return state?.pendingTxHash || '';
  }

  private mintAhoyReward(driverId: string, amount: number) {
    const state = this.onChainState.get(driverId);
    if (state) {
      state.ahoyBalance += amount;
    }
  }

  private calculateLocalScore(driverId: string, deliveryData: { rating: number; wasOnTime: boolean }): number {
    const state = this.onChainState.get(driverId);
    let score = state?.sbtScore || 85;

    if (deliveryData.rating === 5 && deliveryData.wasOnTime) {
      score = Math.min(100, score + 0.5);
    } else if (deliveryData.rating >= 4) {
      score = Math.min(100, score + 0.2);
    } else {
      score = Math.max(0, score - 0.5);
    }

    return Math.round(score * 10) / 10;
  }

  private calculateAhoyReward(
    deliveryData: { rating: number; wasOnTime: boolean },
    score: number
  ): number {
    let base = 10; // Base reward

    if (deliveryData.rating === 5 && deliveryData.wasOnTime) {
      base = 100; // Perfect delivery
    } else if (deliveryData.wasOnTime) {
      base = 25; // On-time bonus
    }

    // Tier bonus
    if (score >= 95) base *= 1.3;
    else if (score >= 90) base *= 1.2;
    else if (score >= 80) base *= 1.1;

    return Math.round(base);
  }

  private calculateTier(score: number): string {
    if (score >= 95) return 'DIAMOND';
    if (score >= 90) return 'PLATINUM';
    if (score >= 80) return 'GOLD';
    if (score >= 70) return 'SILVER';
    return 'BRONZE';
  }

  private getLocalPenalty(eventType: string): number {
    const penalties: Record<string, number> = {
      HARD_BRAKE: 2,
      RAPID_ACCELERATION: 1,
      SPEEDING: 5,
      HARSH_CORNERING: 2,
      IDLE_TIME: 0.5,
      ROUTE_DEVIATION: 1,
    };
    return penalties[eventType] || 0;
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton
export const tokenizationFlow = new TokenizationFlowService();
export default tokenizationFlow;
