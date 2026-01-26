/**
 * useVerticals - Vertical Service Integration Hooks
 *
 * Provides React hooks for interacting with Ahoy's vertical services:
 * - COMET: Driver Reputation (Soulbound tokens)
 * - Fly+: Ticket/Pass NFTs
 * - H2O: Water Credits (IoT Oracle-backed)
 */

import { useState, useCallback, useEffect } from 'react';
import { useSDK, useAhoyState } from '../contexts/SDKContext';
import { useWallet } from './useWallet';
import { LifecycleState, RightType, TransferabilityMode } from '@tokenisation/sdk';

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

const DRIVER_REPUTATION_KEY = 'ahoy_driver_reputation_';
const COMET_DRIVERS_KEY = 'ahoy_comet_drivers';
const COMET_EVENTS_KEY = 'ahoy_comet_events_';

// Load driver reputation from localStorage
function loadDriverReputationFromStorage(driverId: string): DriverReputation | null {
  try {
    const json = localStorage.getItem(DRIVER_REPUTATION_KEY + driverId);
    if (json) {
      const data = JSON.parse(json);
      return {
        ...data,
        lastUpdated: new Date(data.lastUpdated),
        badges: data.badges?.map((b: any) => ({
          ...b,
          earnedAt: new Date(b.earnedAt),
        })) || [],
      };
    }
  } catch (error) {
    console.error('[COMET] Error loading driver reputation:', error);
  }
  return null;
}

// Save driver reputation to localStorage
function saveDriverReputationToStorage(reputation: DriverReputation): void {
  try {
    localStorage.setItem(
      DRIVER_REPUTATION_KEY + reputation.driverId,
      JSON.stringify(reputation)
    );
    // Also update leaderboard
    updateDriverLeaderboard(reputation);
    console.log('[COMET] Saved driver reputation:', reputation.driverId);
  } catch (error) {
    console.error('[COMET] Error saving driver reputation:', error);
  }
}

// Update the drivers leaderboard
function updateDriverLeaderboard(rep: DriverReputation): void {
  try {
    const json = localStorage.getItem(COMET_DRIVERS_KEY);
    const drivers: DriverReputation[] = json ? JSON.parse(json) : [];
    const idx = drivers.findIndex((d) => d.driverId === rep.driverId);
    if (idx >= 0) {
      drivers[idx] = rep;
    } else {
      drivers.push(rep);
    }
    localStorage.setItem(COMET_DRIVERS_KEY, JSON.stringify(drivers));
  } catch (error) {
    console.error('[COMET] Error updating leaderboard:', error);
  }
}

// Load events from localStorage
function loadEventsFromStorage(driverId: string): TelematicsEvent[] {
  try {
    const json = localStorage.getItem(COMET_EVENTS_KEY + driverId);
    if (json) {
      const data = JSON.parse(json);
      return data.map((e: any) => ({
        ...e,
        timestamp: new Date(e.timestamp),
      }));
    }
  } catch (error) {
    console.error('[COMET] Error loading events:', error);
  }
  return [];
}

// Save events to localStorage
function saveEventsToStorage(driverId: string, events: TelematicsEvent[]): void {
  try {
    localStorage.setItem(COMET_EVENTS_KEY + driverId, JSON.stringify(events.slice(0, 50)));
  } catch (error) {
    console.error('[COMET] Error saving events:', error);
  }
}

// Get all drivers for leaderboard
export function getDriverLeaderboard(): DriverReputation[] {
  try {
    const json = localStorage.getItem(COMET_DRIVERS_KEY);
    if (json) {
      const drivers = JSON.parse(json);
      // Sort by overall score descending
      return drivers
        .map((d: any) => ({
          ...d,
          lastUpdated: new Date(d.lastUpdated),
          badges: d.badges?.map((b: any) => ({
            ...b,
            earnedAt: new Date(b.earnedAt),
          })) || [],
        }))
        .sort((a: DriverReputation, b: DriverReputation) => b.overallScore - a.overallScore);
    }
  } catch (error) {
    console.error('[COMET] Error loading leaderboard:', error);
  }
  return [];
}

// ============================================================================
// TYPES
// ============================================================================

// COMET Types
export interface DriverReputation {
  driverId: string;
  walletAddress: string;
  overallScore: number;
  safetyScore: number;
  efficiencyScore: number;
  reliabilityScore: number;
  totalDeliveries: number;
  perfectDeliveries: number;
  onTimeRate: number;
  incidentCount: number;
  sbtTokenId?: string;
  lastUpdated: Date;
  badges: ReputationBadge[];
}

export interface ReputationBadge {
  id: string;
  name: string;
  icon: string;
  earnedAt: Date;
  requirement: string;
}

export interface TelematicsEvent {
  id: string;
  driverId: string;
  type: 'HARSH_BRAKE' | 'SPEEDING' | 'IDLE_TIME' | 'PERFECT_DELIVERY' | 'ON_TIME' | 'FUEL_EFFICIENT';
  timestamp: Date;
  data: Record<string, unknown>;
  scoreImpact: number;
}

// Fly+ Types
export interface FlightPass {
  id: string;
  tokenId?: string;
  type: 'BASIC' | 'PREMIUM' | 'ELITE';
  ownerAddress: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureDate?: Date;
  benefits: string[];
  isActive: boolean;
  transferable: boolean;
  purchasePrice: string;
  currentValue: string;
}

export interface FlightStatus {
  flightNumber: string;
  status: 'ON_TIME' | 'DELAYED' | 'CANCELLED' | 'BOARDING' | 'DEPARTED' | 'ARRIVED';
  delay: number; // minutes
  gate?: string;
  lastUpdate: Date;
}

// H2O Types
export interface WaterCredit {
  id: string;
  tokenId?: string;
  meterId: string;
  creditsEarned: number;
  waterSaved: number; // liters
  co2Offset: number; // kg
  periodStart: Date;
  periodEnd: Date;
  verified: boolean;
  oracleSource: string;
}

export interface IoTReading {
  meterId: string;
  timestamp: Date;
  flowRate: number; // L/min
  totalVolume: number; // L
  pressure: number; // bar
  temperature: number; // C
  leakDetected: boolean;
  anomalyScore: number;
}

export interface WaterThreshold {
  id: string;
  meterId: string;
  type: 'FLOW_RATE' | 'PRESSURE' | 'LEAK' | 'VOLUME';
  operator: 'GT' | 'LT' | 'EQ' | 'BETWEEN';
  value: number;
  action: 'ALERT' | 'CREDIT' | 'PENALTY';
  isActive: boolean;
}

// ============================================================================
// COMET HOOKS
// ============================================================================

/**
 * Hook for COMET Driver Reputation management
 */
export function useDriverReputation(driverId?: string) {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { ahoyState, simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [reputation, setReputation] = useState<DriverReputation | null>(null);
  const [events, setEvents] = useState<TelematicsEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Generate new driver reputation with reasonable defaults
  const generateNewReputation = useCallback((): DriverReputation => {
    const id = driverId || `DRV-${Date.now()}`;
    const newRep: DriverReputation = {
      driverId: id,
      walletAddress: address || '0x0000000000000000000000000000000000000000',
      overallScore: 50, // Start neutral
      safetyScore: 50,
      efficiencyScore: 50,
      reliabilityScore: 50,
      totalDeliveries: 0,
      perfectDeliveries: 0,
      onTimeRate: 0,
      incidentCount: 0,
      lastUpdated: new Date(),
      badges: [],
    };
    // Save immediately
    saveDriverReputationToStorage(newRep);
    return newRep;
  }, [driverId, address]);

  // Fetch or create driver reputation
  useEffect(() => {
    if (!driverId && !address) return;

    setIsLoading(true);
    const id = driverId || `DRV-${address}`;

    // First, try to load from localStorage
    const storedReputation = loadDriverReputationFromStorage(id);
    if (storedReputation) {
      console.log('[COMET] Loaded driver from localStorage:', id);
      setReputation(storedReputation);
      setEvents(loadEventsFromStorage(id));
      setIsLoading(false);
      return;
    }

    // Second, check if there's an existing reputation asset in SDK
    const reputationAsset = assets.find(
      (a) => a.metadata?.driverId === driverId || a.metadata?.walletAddress === address
    );

    if (reputationAsset) {
      const rep: DriverReputation = {
        driverId: reputationAsset.metadata?.driverId as string,
        walletAddress: reputationAsset.metadata?.walletAddress as string,
        overallScore: reputationAsset.metadata?.overallScore as number || 50,
        safetyScore: reputationAsset.metadata?.safetyScore as number || 50,
        efficiencyScore: reputationAsset.metadata?.efficiencyScore as number || 50,
        reliabilityScore: reputationAsset.metadata?.reliabilityScore as number || 50,
        totalDeliveries: reputationAsset.metadata?.totalDeliveries as number || 0,
        perfectDeliveries: reputationAsset.metadata?.perfectDeliveries as number || 0,
        onTimeRate: reputationAsset.metadata?.onTimeRate as number || 0,
        incidentCount: reputationAsset.metadata?.incidentCount as number || 0,
        sbtTokenId: reputationAsset.id,
        lastUpdated: new Date(reputationAsset.updatedAt),
        badges: [],
      };
      setReputation(rep);
      saveDriverReputationToStorage(rep);
    } else {
      // Create new driver
      setReputation(generateNewReputation());
    }

    setIsLoading(false);
  }, [driverId, address, assets, generateNewReputation]);

  // Mint Driver Reputation SBT
  const mintReputationSBT = useCallback(async () => {
    if (!reputation) return { success: false, error: 'No reputation data' };

    try {
      const asset = await createAsset({
        name: `Driver Reputation - ${reputation.driverId}`,
        rightType: RightType.VERIFICATION,
        description: 'Soulbound Driver Reputation Token',
        jurisdiction: 'AE',
        transferabilityRules: {
          mode: TransferabilityMode.NON_TRANSFERABLE,
          requireKyc: true,
        },
        metadata: {
          vertical: 'COMET',
          type: 'DRIVER_REPUTATION_SBT',
          driverId: reputation.driverId,
          walletAddress: reputation.walletAddress,
          overallScore: reputation.overallScore,
          safetyScore: reputation.safetyScore,
          efficiencyScore: reputation.efficiencyScore,
          reliabilityScore: reputation.reliabilityScore,
          totalDeliveries: reputation.totalDeliveries,
          perfectDeliveries: reputation.perfectDeliveries,
          onTimeRate: reputation.onTimeRate,
          incidentCount: reputation.incidentCount,
        },
      });

      // Transition to verified (auto-verified for SBT)
      await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
      await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

      const updatedRep = { ...reputation, sbtTokenId: asset.id };
      setReputation(updatedRep);
      saveDriverReputationToStorage(updatedRep);

      // Simulate Ahoy action
      simulateAhoyAction('REPUTATION_SBT_MINTED', 'COMET');

      return { success: true, assetId: asset.id };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Mint failed' };
    }
  }, [reputation, createAsset, transitionAsset, simulateAhoyAction]);

  // Record telematics event
  const recordEvent = useCallback(
    (eventType: TelematicsEvent['type'], data: Record<string, unknown>) => {
      const event: TelematicsEvent = {
        id: `EVT-${Date.now()}`,
        driverId: reputation?.driverId || '',
        type: eventType,
        timestamp: new Date(),
        data,
        scoreImpact: eventType === 'PERFECT_DELIVERY' ? 0.5 : eventType === 'HARSH_BRAKE' ? -0.2 : 0,
      };

      const newEvents = [event, ...events].slice(0, 50);
      setEvents(newEvents);

      // Update reputation score and stats
      if (reputation) {
        const newScore = Math.max(0, Math.min(100, reputation.overallScore + event.scoreImpact));
        const isDelivery = eventType === 'PERFECT_DELIVERY' || eventType === 'ON_TIME';
        const isPerfect = eventType === 'PERFECT_DELIVERY';

        const updatedRep: DriverReputation = {
          ...reputation,
          overallScore: newScore,
          totalDeliveries: isDelivery ? reputation.totalDeliveries + 1 : reputation.totalDeliveries,
          perfectDeliveries: isPerfect ? reputation.perfectDeliveries + 1 : reputation.perfectDeliveries,
          onTimeRate: isDelivery && reputation.totalDeliveries > 0
            ? ((reputation.perfectDeliveries + (isPerfect ? 1 : 0)) / (reputation.totalDeliveries + 1)) * 100
            : reputation.onTimeRate,
          lastUpdated: new Date(),
        };

        setReputation(updatedRep);
        saveDriverReputationToStorage(updatedRep);
        saveEventsToStorage(reputation.driverId, newEvents);
      }

      return event;
    },
    [reputation, events]
  );

  return {
    reputation,
    events,
    isLoading,
    mintReputationSBT,
    recordEvent,
  };
}

// ============================================================================
// FLY+ HOOKS
// ============================================================================

/**
 * Hook for Fly+ Pass management
 */
export function useFlyPlusPasses() {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [passes, setPasses] = useState<FlightPass[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load passes from assets
  useEffect(() => {
    const flyPlusAssets = assets.filter((a) => a.metadata?.vertical === 'FLYPLUS');

    const loadedPasses: FlightPass[] = flyPlusAssets.map((asset) => ({
      id: asset.id,
      tokenId: asset.metadata?.tokenId as string,
      type: (asset.metadata?.passType as FlightPass['type']) || 'BASIC',
      ownerAddress: asset.metadata?.ownerAddress as string || '',
      flightNumber: asset.metadata?.flightNumber as string,
      origin: asset.metadata?.origin as string,
      destination: asset.metadata?.destination as string,
      departureDate: asset.metadata?.departureDate ? new Date(asset.metadata.departureDate as string) : undefined,
      benefits: (asset.metadata?.benefits as string[]) || [],
      isActive: asset.state === LifecycleState.ACTIVE,
      transferable: asset.transferabilityRules?.mode !== TransferabilityMode.NON_TRANSFERABLE,
      purchasePrice: (asset.metadata?.purchasePrice as string) || '0',
      currentValue: (asset.metadata?.currentValue as string) || '0',
    }));

    setPasses(loadedPasses);
  }, [assets]);

  // Purchase a new pass
  const purchasePass = useCallback(
    async (passType: FlightPass['type'], flightDetails?: Partial<FlightPass>) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        const benefits: Record<FlightPass['type'], string[]> = {
          BASIC: ['Priority Boarding', 'Free Checked Bag'],
          PREMIUM: ['Lounge Access', 'Priority Boarding', 'Free Upgrades', 'Free Checked Bags'],
          ELITE: ['First Class Lounge', 'Guaranteed Upgrades', 'Concierge Service', 'Unlimited Bags'],
        };

        const prices: Record<FlightPass['type'], string> = {
          BASIC: '99',
          PREMIUM: '299',
          ELITE: '999',
        };

        const asset = await createAsset({
          name: `Fly+ ${passType} Pass`,
          rightType: RightType.ACCESS,
          description: `Fly+ ${passType} Access Pass NFT`,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.COMPLIANCE_GATED,
            requireKyc: true,
          },
          metadata: {
            vertical: 'FLYPLUS',
            type: 'ACCESS_PASS_NFT',
            passType,
            ownerAddress: address,
            flightNumber: flightDetails?.flightNumber,
            origin: flightDetails?.origin,
            destination: flightDetails?.destination,
            departureDate: flightDetails?.departureDate?.toISOString(),
            benefits: benefits[passType],
            purchasePrice: prices[passType],
            currentValue: prices[passType],
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        simulateAhoyAction('PASS_PURCHASED', 'FLYPLUS');

        setIsLoading(false);
        return { success: true, assetId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Purchase failed' };
      }
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Transfer pass to another user
  const transferPass = useCallback(
    async (passId: string, toAddress: string) => {
      const pass = passes.find((p) => p.id === passId);
      if (!pass || !pass.transferable) {
        return { success: false, error: 'Pass not transferable' };
      }

      try {
        // In production, this would call the NFT transfer function
        simulateAhoyAction('PASS_TRANSFERRED', 'FLYPLUS');

        return { success: true };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Transfer failed' };
      }
    },
    [passes, address, simulateAhoyAction]
  );

  // Check flight status (simulated oracle)
  const checkFlightStatus = useCallback(async (flightNumber: string): Promise<FlightStatus> => {
    // Simulated flight status from oracle
    const statuses: FlightStatus['status'][] = ['ON_TIME', 'DELAYED', 'BOARDING'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      flightNumber,
      status: randomStatus,
      delay: randomStatus === 'DELAYED' ? Math.floor(Math.random() * 120) + 15 : 0,
      gate: `A${Math.floor(Math.random() * 20) + 1}`,
      lastUpdate: new Date(),
    };
  }, []);

  return {
    passes,
    isLoading,
    purchasePass,
    transferPass,
    checkFlightStatus,
  };
}

// ============================================================================
// H2O HOOKS
// ============================================================================

/**
 * Hook for H2O Water Credits and IoT Oracle management
 */
export function useWaterCredits(meterId?: string) {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [credits, setCredits] = useState<WaterCredit[]>([]);
  const [readings, setReadings] = useState<IoTReading[]>([]);
  const [thresholds, setThresholds] = useState<WaterThreshold[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load credits from assets
  useEffect(() => {
    const h2oAssets = assets.filter(
      (a) => a.metadata?.vertical === 'H2O' && (!meterId || a.metadata?.meterId === meterId)
    );

    const loadedCredits: WaterCredit[] = h2oAssets.map((asset) => ({
      id: asset.id,
      tokenId: asset.metadata?.tokenId as string,
      meterId: asset.metadata?.meterId as string || '',
      creditsEarned: (asset.metadata?.creditsEarned as number) || 0,
      waterSaved: (asset.metadata?.waterSaved as number) || 0,
      co2Offset: (asset.metadata?.co2Offset as number) || 0,
      periodStart: new Date(asset.metadata?.periodStart as string || Date.now()),
      periodEnd: new Date(asset.metadata?.periodEnd as string || Date.now()),
      verified: asset.state === LifecycleState.ACTIVE,
      oracleSource: (asset.metadata?.oracleSource as string) || 'IoT_ORACLE',
    }));

    setCredits(loadedCredits);
  }, [assets, meterId]);

  // Simulate IoT reading from oracle
  const simulateIoTReading = useCallback((): IoTReading => {
    const reading: IoTReading = {
      meterId: meterId || `METER-${Date.now()}`,
      timestamp: new Date(),
      flowRate: Math.random() * 10 + 2, // 2-12 L/min
      totalVolume: Math.random() * 10000 + 5000, // 5000-15000 L
      pressure: Math.random() * 2 + 3, // 3-5 bar
      temperature: Math.random() * 10 + 15, // 15-25 C
      leakDetected: Math.random() < 0.05, // 5% chance of leak
      anomalyScore: Math.random() * 0.3, // 0-0.3 anomaly score
    };

    setReadings((prev) => [reading, ...prev].slice(0, 100));

    // Check thresholds
    thresholds.forEach((threshold) => {
      if (!threshold.isActive) return;

      let triggered = false;
      switch (threshold.type) {
        case 'FLOW_RATE':
          triggered =
            threshold.operator === 'GT'
              ? reading.flowRate > threshold.value
              : reading.flowRate < threshold.value;
          break;
        case 'LEAK':
          triggered = reading.leakDetected;
          break;
      }

      if (triggered) {
        simulateAhoyAction('THRESHOLD_TRIGGERED', 'H2O');
      }
    });

    return reading;
  }, [meterId, thresholds, simulateAhoyAction]);

  // Mint water credits based on savings
  const mintWaterCredits = useCallback(
    async (waterSaved: number, periodDays: number = 30) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        // Calculate credits: 1 credit per 100L saved, with CO2 offset
        const creditsEarned = Math.floor(waterSaved / 100);
        const co2Offset = waterSaved * 0.0003; // ~0.3g CO2 per liter

        const periodStart = new Date();
        const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);

        const asset = await createAsset({
          name: `Water Credit - ${creditsEarned} Credits`,
          rightType: RightType.VERIFICATION,
          description: 'Oracle-verified Water Savings Credit',
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.COMPLIANCE_GATED,
            requireKyc: false,
          },
          metadata: {
            vertical: 'H2O',
            type: 'WATER_CREDIT',
            meterId: meterId || `METER-${Date.now()}`,
            creditsEarned,
            waterSaved,
            co2Offset,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            oracleSource: 'IoT_ORACLE',
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'oracle');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'oracle');

        simulateAhoyAction('CREDITS_MINTED', 'H2O');

        setIsLoading(false);
        return { success: true, assetId: asset.id, creditsEarned };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Mint failed' };
      }
    },
    [address, meterId, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Add threshold rule
  const addThreshold = useCallback((threshold: Omit<WaterThreshold, 'id'>) => {
    const newThreshold: WaterThreshold = {
      ...threshold,
      id: `TH-${Date.now()}`,
    };
    setThresholds((prev) => [...prev, newThreshold]);
    return newThreshold;
  }, []);

  // Remove threshold
  const removeThreshold = useCallback((thresholdId: string) => {
    setThresholds((prev) => prev.filter((t) => t.id !== thresholdId));
  }, []);

  // Start IoT simulation
  const startIoTSimulation = useCallback(
    (intervalMs: number = 5000) => {
      const intervalId = setInterval(simulateIoTReading, intervalMs);
      return () => clearInterval(intervalId);
    },
    [simulateIoTReading]
  );

  return {
    credits,
    readings,
    thresholds,
    isLoading,
    simulateIoTReading,
    mintWaterCredits,
    addThreshold,
    removeThreshold,
    startIoTSimulation,
  };
}

// ============================================================================
// IITS TYPES & HOOKS
// ============================================================================

export interface CityProposal {
  id: string;
  title: string;
  description: string;
  type: 'INFRASTRUCTURE' | 'TRAFFIC' | 'EMERGENCY' | 'BUDGET';
  votes: number;
  votesFor: number;
  votesAgainst: number;
  status: 'ACTIVE' | 'PASSED' | 'FAILED' | 'EXECUTED';
  endsAt: Date;
  createdAt: Date;
  hasVoted?: boolean;
}

export interface EmergencyAuthorization {
  id: string;
  type: 'TRAFFIC_OVERRIDE' | 'SIGNAL_CONTROL' | 'LANE_CLOSURE' | 'EVACUATION';
  resourceId: string;
  requestedBy: string;
  status: 'PENDING' | 'APPROVED' | 'EXECUTED' | 'DENIED';
  signatures: string[];
  requiredSignatures: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface TrafficInfrastructureToken {
  id: string;
  tokenId?: string;
  type: 'SIGNAL_CONTROLLER' | 'SENSOR_NODE' | 'CAMERA' | 'CHARGING_STATION';
  location: { lat: number; lng: number };
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  lastReading?: Date;
  owner: string;
}

/**
 * Hook for IITS Smart City management
 */
export function useSmartCity() {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [proposals, setProposals] = useState<CityProposal[]>([]);
  const [authorizations, setAuthorizations] = useState<EmergencyAuthorization[]>([]);
  const [infrastructureTokens, setInfrastructureTokens] = useState<TrafficInfrastructureToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [votingPower, setVotingPower] = useState('1500');

  // Load infrastructure tokens from assets
  useEffect(() => {
    const iitsAssets = assets.filter((a) => a.metadata?.vertical === 'IITS');

    const tokens: TrafficInfrastructureToken[] = iitsAssets.map((asset) => ({
      id: asset.id,
      tokenId: asset.metadata?.tokenId as string,
      type: (asset.metadata?.infrastructureType as TrafficInfrastructureToken['type']) || 'SENSOR_NODE',
      location: {
        lat: (asset.metadata?.lat as number) || 25.2048,
        lng: (asset.metadata?.lng as number) || 55.2708,
      },
      status: 'ONLINE',
      lastReading: new Date(),
      owner: (asset.metadata?.owner as string) || '',
    }));

    setInfrastructureTokens(tokens);
  }, [assets]);

  // Initialize demo proposals
  useEffect(() => {
    const demoProposals: CityProposal[] = [
      {
        id: 'city-prop-1',
        title: 'Expand EV Lanes on Highway 5',
        description: 'Allocate budget for dedicated EV charging lanes on the northern highway corridor.',
        type: 'INFRASTRUCTURE',
        votes: 1250,
        votesFor: 890,
        votesAgainst: 360,
        status: 'ACTIVE',
        endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        hasVoted: false,
      },
      {
        id: 'city-prop-2',
        title: 'Dynamic Toll Adjustment Algorithm',
        description: 'Implement AI-driven toll pricing based on real-time congestion levels.',
        type: 'TRAFFIC',
        votes: 850,
        votesFor: 620,
        votesAgainst: 230,
        status: 'ACTIVE',
        endsAt: new Date(Date.now() + 5 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        hasVoted: false,
      },
    ];
    setProposals(demoProposals);

    const demoAuths: EmergencyAuthorization[] = [
      {
        id: 'auth-1',
        type: 'TRAFFIC_OVERRIDE',
        resourceId: 'TRAFFIC_CONTROLLER_GRID_4',
        requestedBy: 'Emergency Services',
        status: 'PENDING',
        signatures: ['0x1234...5678'],
        requiredSignatures: 3,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    ];
    setAuthorizations(demoAuths);
  }, []);

  // Vote on city proposal
  const voteOnProposal = useCallback(
    async (proposalId: string, vote: 'FOR' | 'AGAINST') => {
      setIsLoading(true);

      setProposals((prev) =>
        prev.map((p) => {
          if (p.id !== proposalId) return p;
          const voteAmount = parseInt(votingPower);
          return {
            ...p,
            votes: p.votes + voteAmount,
            votesFor: vote === 'FOR' ? p.votesFor + voteAmount : p.votesFor,
            votesAgainst: vote === 'AGAINST' ? p.votesAgainst + voteAmount : p.votesAgainst,
            hasVoted: true,
          };
        })
      );

      simulateAhoyAction('CITY_DAO_VOTE', 'IITS');
      setIsLoading(false);
      return { success: true };
    },
    [votingPower, simulateAhoyAction]
  );

  // Request emergency authorization
  const requestEmergencyAuth = useCallback(
    async (type: EmergencyAuthorization['type'], resourceId: string) => {
      setIsLoading(true);

      const auth: EmergencyAuthorization = {
        id: `auth-${Date.now()}`,
        type,
        resourceId,
        requestedBy: address || 'Emergency Services',
        status: 'PENDING',
        signatures: [address || '0x0000...0000'],
        requiredSignatures: 3,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      setAuthorizations((prev) => [auth, ...prev]);
      simulateAhoyAction('EMERGENCY_AUTH_REQUESTED', 'IITS');
      setIsLoading(false);
      return { success: true, authId: auth.id };
    },
    [address, simulateAhoyAction]
  );

  // Sign emergency authorization (multi-sig)
  const signAuthorization = useCallback(
    async (authId: string) => {
      setIsLoading(true);

      setAuthorizations((prev) =>
        prev.map((a) => {
          if (a.id !== authId) return a;
          const newSignatures = [...a.signatures, address || '0xSigner'];
          const isApproved = newSignatures.length >= a.requiredSignatures;
          return {
            ...a,
            signatures: newSignatures,
            status: isApproved ? 'APPROVED' : a.status,
          };
        })
      );

      simulateAhoyAction('EMERGENCY_AUTH_SIGNED', 'IITS');
      setIsLoading(false);
      return { success: true };
    },
    [address, simulateAhoyAction]
  );

  // Execute authorized command
  const executeAuthorizedCommand = useCallback(
    async (authId: string) => {
      const auth = authorizations.find((a) => a.id === authId);
      if (!auth || auth.status !== 'APPROVED') {
        return { success: false, error: 'Authorization not approved' };
      }

      setIsLoading(true);

      // Create audit log as NFT
      try {
        const asset = await createAsset({
          name: `Emergency Command Audit - ${auth.type}`,
          rightType: RightType.VERIFICATION,
          description: 'Immutable audit log for emergency infrastructure command',
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.NON_TRANSFERABLE,
            requireKyc: false,
          },
          metadata: {
            vertical: 'IITS',
            type: 'EMERGENCY_AUDIT_LOG',
            authorizationId: authId,
            commandType: auth.type,
            resourceId: auth.resourceId,
            signatures: auth.signatures,
            executedAt: new Date().toISOString(),
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        setAuthorizations((prev) =>
          prev.map((a) => (a.id === authId ? { ...a, status: 'EXECUTED' } : a))
        );

        simulateAhoyAction('EMERGENCY_COMMAND_EXECUTED', 'IITS');
        setIsLoading(false);
        return { success: true, auditAssetId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Execution failed' };
      }
    },
    [authorizations, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Mint infrastructure token
  const mintInfrastructureToken = useCallback(
    async (type: TrafficInfrastructureToken['type'], location: { lat: number; lng: number }) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        const asset = await createAsset({
          name: `IITS ${type} - ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
          rightType: RightType.ACCESS,
          description: `Smart city infrastructure token for ${type}`,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.COMPLIANCE_GATED,
            requireKyc: true,
          },
          metadata: {
            vertical: 'IITS',
            type: 'INFRASTRUCTURE_TOKEN',
            infrastructureType: type,
            lat: location.lat,
            lng: location.lng,
            owner: address,
            registeredAt: new Date().toISOString(),
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        simulateAhoyAction('INFRASTRUCTURE_REGISTERED', 'IITS');
        setIsLoading(false);
        return { success: true, assetId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Mint failed' };
      }
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  return {
    proposals,
    authorizations,
    infrastructureTokens,
    votingPower,
    isLoading,
    voteOnProposal,
    requestEmergencyAuth,
    signAuthorization,
    executeAuthorizedCommand,
    mintInfrastructureToken,
    activeProposals: proposals.filter((p) => p.status === 'ACTIVE'),
    pendingAuthorizations: authorizations.filter((a) => a.status === 'PENDING' || a.status === 'APPROVED'),
  };
}

// ============================================================================
// AMS TYPES & HOOKS (Developer SDK Platform)
// ============================================================================

export interface DataAsset {
  id: string;
  tokenId?: string;
  name: string;
  type: 'REAL_TIME' | 'STATIC' | 'PREDICTIVE' | 'ALGORITHM';
  category: 'TRAFFIC' | 'PEDESTRIAN' | 'WEATHER' | 'PARKING' | 'TRANSIT';
  price: string;
  currency: string;
  rating: number;
  purchases: number;
  owner: string;
  isLicensed?: boolean;
  licenseExpiry?: Date;
}

export interface DataContribution {
  id: string;
  type: 'LOCATION' | 'TRAFFIC' | 'ROAD_CLOSURE' | 'INCIDENT';
  coordinates: { lat: number; lng: number };
  metadata: Record<string, unknown>;
  reward: string;
  status: 'PENDING' | 'VERIFIED' | 'REWARDED' | 'REJECTED';
  submittedAt: Date;
  verifiedAt?: Date;
}

export interface AlgorithmNFT {
  id: string;
  tokenId?: string;
  name: string;
  description: string;
  accuracy: string;
  usagePrice: string;
  royaltyRate: number;
  totalRoyalties: string;
  owner: string;
}

/**
 * Hook for AMS/GTS Data Marketplace
 */
export function useDataMarketplace() {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [dataAssets, setDataAssets] = useState<DataAsset[]>([]);
  const [contributions, setContributions] = useState<DataContribution[]>([]);
  const [algorithms, setAlgorithms] = useState<AlgorithmNFT[]>([]);
  const [licensedAssets, setLicensedAssets] = useState<string[]>([]);
  const [pendingRewards, setPendingRewards] = useState('12.5');
  const [isLoading, setIsLoading] = useState(false);

  // Load licensed assets from SDK
  useEffect(() => {
    const amsAssets = assets.filter((a) => a.metadata?.vertical === 'AMS');
    const licensed = amsAssets
      .filter((a) => a.metadata?.type === 'DATA_LICENSE')
      .map((a) => a.metadata?.dataAssetId as string);
    setLicensedAssets(licensed);
  }, [assets]);

  // Initialize demo data
  useEffect(() => {
    const demoAssets: DataAsset[] = [
      { id: 'ds_dxb_01', name: 'Dubai Marina Traffic Flow', type: 'REAL_TIME', category: 'TRAFFIC', price: '500', currency: 'AHOY', rating: 4.9, purchases: 234, owner: '0xAMS...001' },
      { id: 'ds_ldn_04', name: 'London Congestion Zones', type: 'STATIC', category: 'TRAFFIC', price: '250', currency: 'AHOY', rating: 4.7, purchases: 512, owner: '0xAMS...002' },
      { id: 'ds_nyc_09', name: 'NYC Pedestrian Density', type: 'PREDICTIVE', category: 'PEDESTRIAN', price: '800', currency: 'AHOY', rating: 4.8, purchases: 189, owner: '0xAMS...003' },
    ];
    setDataAssets(demoAssets);

    const demoAlgorithms: AlgorithmNFT[] = [
      { id: 'alg-1', name: 'TrafficPredictor v3', description: 'ML model for traffic prediction', accuracy: '94.2%', usagePrice: '0.05', royaltyRate: 10, totalRoyalties: '1,250', owner: '0xDev...001' },
      { id: 'alg-2', name: 'RouteOptimizer Pro', description: 'Multi-modal route optimization', accuracy: '97.1%', usagePrice: '0.08', royaltyRate: 15, totalRoyalties: '3,420', owner: '0xDev...002' },
    ];
    setAlgorithms(demoAlgorithms);
  }, []);

  // Purchase data license
  const purchaseDataLicense = useCallback(
    async (dataAssetId: string) => {
      const asset = dataAssets.find((a) => a.id === dataAssetId);
      if (!asset) return { success: false, error: 'Asset not found' };
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        const licenseAsset = await createAsset({
          name: `Data License - ${asset.name}`,
          rightType: RightType.ACCESS,
          description: `Perpetual license for ${asset.name} dataset`,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.NON_TRANSFERABLE,
            requireKyc: true,
          },
          metadata: {
            vertical: 'AMS',
            type: 'DATA_LICENSE',
            dataAssetId,
            dataAssetName: asset.name,
            licensee: address,
            price: asset.price,
            currency: asset.currency,
            accessType: 'PERPETUAL',
            purchasedAt: new Date().toISOString(),
          },
        });

        await transitionAsset(licenseAsset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(licenseAsset.id, LifecycleState.ACTIVE, 'system');

        setLicensedAssets((prev) => [...prev, dataAssetId]);
        setDataAssets((prev) =>
          prev.map((a) => (a.id === dataAssetId ? { ...a, purchases: a.purchases + 1 } : a))
        );

        simulateAhoyAction('DATA_LICENSE_PURCHASED', 'AMS');
        setIsLoading(false);
        return { success: true, licenseId: licenseAsset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Purchase failed' };
      }
    },
    [dataAssets, address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Submit data contribution
  const submitContribution = useCallback(
    async (type: DataContribution['type'], coordinates: { lat: number; lng: number }, metadata: Record<string, unknown>) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      const contribution: DataContribution = {
        id: `contrib-${Date.now()}`,
        type,
        coordinates,
        metadata,
        reward: '2.5',
        status: 'PENDING',
        submittedAt: new Date(),
      };

      setContributions((prev) => [contribution, ...prev]);

      // Simulate verification delay
      setTimeout(async () => {
        setContributions((prev) =>
          prev.map((c) => (c.id === contribution.id ? { ...c, status: 'VERIFIED', verifiedAt: new Date() } : c))
        );

        // Create contribution receipt as NFT
        try {
          const receiptAsset = await createAsset({
            name: `Data Contribution Receipt - ${type}`,
            rightType: RightType.VERIFICATION,
            description: 'Verified data contribution to the AMS network',
            jurisdiction: 'AE',
            transferabilityRules: {
              mode: TransferabilityMode.NON_TRANSFERABLE,
              requireKyc: false,
            },
            metadata: {
              vertical: 'AMS',
              type: 'CONTRIBUTION_RECEIPT',
              contributionId: contribution.id,
              contributionType: type,
              coordinates,
              reward: contribution.reward,
              contributor: address,
              verifiedAt: new Date().toISOString(),
            },
          });

          await transitionAsset(receiptAsset.id, LifecycleState.VERIFIED, 'oracle');
          await transitionAsset(receiptAsset.id, LifecycleState.ACTIVE, 'oracle');

          setContributions((prev) =>
            prev.map((c) => (c.id === contribution.id ? { ...c, status: 'REWARDED' } : c))
          );

          setPendingRewards((prev) => (parseFloat(prev) + parseFloat(contribution.reward)).toFixed(1));
          simulateAhoyAction('DATA_CONTRIBUTION_REWARDED', 'AMS');
        } catch (error) {
          console.error('Failed to create contribution receipt:', error);
        }
      }, 2000);

      simulateAhoyAction('DATA_CONTRIBUTION_SUBMITTED', 'AMS');
      setIsLoading(false);
      return { success: true, contributionId: contribution.id };
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Mint algorithm NFT
  const mintAlgorithmNFT = useCallback(
    async (name: string, description: string, accuracy: string, usagePrice: string, royaltyRate: number) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        const asset = await createAsset({
          name: `Algorithm IP - ${name}`,
          rightType: RightType.OWNERSHIP,
          description,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.COMPLIANCE_GATED,
            requireKyc: true,
          },
          metadata: {
            vertical: 'AMS',
            type: 'ALGORITHM_NFT',
            algorithmName: name,
            accuracy,
            usagePrice,
            royaltyRate,
            owner: address,
            createdAt: new Date().toISOString(),
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        const newAlgorithm: AlgorithmNFT = {
          id: asset.id,
          tokenId: asset.id,
          name,
          description,
          accuracy,
          usagePrice,
          royaltyRate,
          totalRoyalties: '0',
          owner: address,
        };

        setAlgorithms((prev) => [newAlgorithm, ...prev]);
        simulateAhoyAction('ALGORITHM_NFT_MINTED', 'AMS');
        setIsLoading(false);
        return { success: true, assetId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Mint failed' };
      }
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Claim pending rewards
  const claimRewards = useCallback(async () => {
    if (parseFloat(pendingRewards) <= 0) return { success: false, error: 'No rewards to claim' };

    setIsLoading(true);
    simulateAhoyAction('REWARDS_CLAIMED', 'AMS');
    const claimed = pendingRewards;
    setPendingRewards('0');
    setIsLoading(false);
    return { success: true, amount: claimed };
  }, [pendingRewards, simulateAhoyAction]);

  return {
    dataAssets,
    contributions,
    algorithms,
    licensedAssets,
    pendingRewards,
    isLoading,
    purchaseDataLicense,
    submitContribution,
    mintAlgorithmNFT,
    claimRewards,
    isLicensed: (assetId: string) => licensedAssets.includes(assetId),
  };
}

// ============================================================================
// GTS TYPES & HOOKS (Geospatial Tracking System)
// ============================================================================

export interface IsochroneResult {
  id: string;
  origin: { lat: number; lng: number };
  travelTime: number; // minutes
  mode: 'DRIVING' | 'WALKING' | 'CYCLING' | 'TRANSIT';
  polygon: { lat: number; lng: number }[];
  area: number; // sq km
  calculatedAt: Date;
}

export interface RouteResult {
  id: string;
  origin: { lat: number; lng: number; name?: string };
  destination: { lat: number; lng: number; name?: string };
  distance: number; // km
  duration: number; // minutes
  trafficDelay: number; // minutes
  polyline: string;
  optimizedFor: 'TIME' | 'DISTANCE' | 'FUEL';
  calculatedAt: Date;
}

export interface TrafficData {
  id: string;
  segment: string;
  congestionLevel: 'FREE_FLOW' | 'LIGHT' | 'MODERATE' | 'HEAVY' | 'SEVERE';
  averageSpeed: number; // km/h
  freeFlowSpeed: number; // km/h
  delay: number; // minutes
  incidents: number;
  updatedAt: Date;
}

export interface TrafficAnalytics {
  id: string;
  region: string;
  period: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';
  avgCongestion: number; // 0-100
  peakHours: string[];
  totalIncidents: number;
  avgTravelTime: number;
  dataPoints: number;
  generatedAt: Date;
}

export interface GTSDataLicense {
  id: string;
  tokenId?: string;
  dataType: 'ISOCHRONE' | 'ROUTING' | 'TRAFFIC' | 'ANALYTICS';
  tier: 'BASIC' | 'PRO' | 'ENTERPRISE';
  callsPerMonth: number;
  usedCalls: number;
  price: string;
  expiresAt: Date;
}

/**
 * Hook for GTS Geospatial Tracking System
 */
export function useGTS() {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [isochroneResults, setIsochroneResults] = useState<IsochroneResult[]>([]);
  const [routeResults, setRouteResults] = useState<RouteResult[]>([]);
  const [trafficData, setTrafficData] = useState<TrafficData[]>([]);
  const [analyticsReports, setAnalyticsReports] = useState<TrafficAnalytics[]>([]);
  const [licenses, setLicenses] = useState<GTSDataLicense[]>([]);
  const [apiCalls, setApiCalls] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Load licenses from SDK assets
  useEffect(() => {
    const gtsAssets = assets.filter((a) => a.metadata?.vertical === 'GTS');
    const licensesFromAssets: GTSDataLicense[] = gtsAssets
      .filter((a) => a.metadata?.type === 'API_LICENSE')
      .map((a) => ({
        id: a.id,
        tokenId: a.id,
        dataType: (a.metadata?.dataType as GTSDataLicense['dataType']) || 'ROUTING',
        tier: (a.metadata?.tier as GTSDataLicense['tier']) || 'BASIC',
        callsPerMonth: (a.metadata?.callsPerMonth as number) || 1000,
        usedCalls: (a.metadata?.usedCalls as number) || 0,
        price: (a.metadata?.price as string) || '100',
        expiresAt: new Date((a.metadata?.expiresAt as string) || Date.now() + 30 * 24 * 60 * 60 * 1000),
      }));
    if (licensesFromAssets.length > 0) {
      setLicenses(licensesFromAssets);
    }
  }, [assets]);

  // Initialize demo traffic data
  useEffect(() => {
    const demoTraffic: TrafficData[] = [
      { id: 'seg-1', segment: 'Sheikh Zayed Rd (Downtown)', congestionLevel: 'MODERATE', averageSpeed: 45, freeFlowSpeed: 80, delay: 8, incidents: 1, updatedAt: new Date() },
      { id: 'seg-2', segment: 'Al Khail Rd (Business Bay)', congestionLevel: 'LIGHT', averageSpeed: 65, freeFlowSpeed: 80, delay: 3, incidents: 0, updatedAt: new Date() },
      { id: 'seg-3', segment: 'Emirates Rd (Silicon Oasis)', congestionLevel: 'FREE_FLOW', averageSpeed: 78, freeFlowSpeed: 80, delay: 0, incidents: 0, updatedAt: new Date() },
      { id: 'seg-4', segment: 'Jumeirah Beach Rd', congestionLevel: 'HEAVY', averageSpeed: 25, freeFlowSpeed: 60, delay: 15, incidents: 2, updatedAt: new Date() },
    ];
    setTrafficData(demoTraffic);

    const demoLicenses: GTSDataLicense[] = [
      { id: 'lic-basic', dataType: 'ROUTING', tier: 'BASIC', callsPerMonth: 1000, usedCalls: 234, price: '50', expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000) },
    ];
    setLicenses(demoLicenses);
  }, []);

  // Calculate Isochrone
  const calculateIsochrone = useCallback(
    async (origin: { lat: number; lng: number }, travelTime: number, mode: IsochroneResult['mode']) => {
      setIsLoading(true);

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Generate mock polygon (simplified circle approximation)
      const radiusKm = (travelTime / 60) * (mode === 'DRIVING' ? 50 : mode === 'CYCLING' ? 15 : 5);
      const polygon: { lat: number; lng: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * 2 * Math.PI;
        const jitter = 0.8 + Math.random() * 0.4;
        polygon.push({
          lat: origin.lat + (radiusKm / 111) * Math.cos(angle) * jitter,
          lng: origin.lng + (radiusKm / (111 * Math.cos(origin.lat * Math.PI / 180))) * Math.sin(angle) * jitter,
        });
      }

      const result: IsochroneResult = {
        id: `iso-${Date.now()}`,
        origin,
        travelTime,
        mode,
        polygon,
        area: Math.PI * radiusKm * radiusKm * 0.85,
        calculatedAt: new Date(),
      };

      setIsochroneResults((prev) => [result, ...prev.slice(0, 9)]);
      setApiCalls((prev) => prev + 1);
      simulateAhoyAction('GTS_ISOCHRONE_CALCULATED', 'GTS');
      setIsLoading(false);
      return { success: true, result };
    },
    [simulateAhoyAction]
  );

  // Calculate Route
  const calculateRoute = useCallback(
    async (
      origin: { lat: number; lng: number; name?: string },
      destination: { lat: number; lng: number; name?: string },
      optimizeFor: RouteResult['optimizedFor'] = 'TIME'
    ) => {
      setIsLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 600));

      const latDiff = Math.abs(destination.lat - origin.lat);
      const lngDiff = Math.abs(destination.lng - origin.lng);
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111;
      const baseTime = distance / 45 * 60;
      const trafficDelay = Math.random() * 10;

      const result: RouteResult = {
        id: `route-${Date.now()}`,
        origin,
        destination,
        distance: Math.round(distance * 10) / 10,
        duration: Math.round(baseTime + trafficDelay),
        trafficDelay: Math.round(trafficDelay),
        polyline: 'encoded_polyline_string',
        optimizedFor: optimizeFor,
        calculatedAt: new Date(),
      };

      setRouteResults((prev) => [result, ...prev.slice(0, 9)]);
      setApiCalls((prev) => prev + 1);
      simulateAhoyAction('GTS_ROUTE_CALCULATED', 'GTS');
      setIsLoading(false);
      return { success: true, result };
    },
    [simulateAhoyAction]
  );

  // Get Live Traffic
  const getLiveTraffic = useCallback(
    async (region?: string) => {
      setIsLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 400));

      // Update traffic data with slight variations
      setTrafficData((prev) =>
        prev.map((seg) => ({
          ...seg,
          averageSpeed: Math.max(10, seg.averageSpeed + (Math.random() - 0.5) * 10),
          delay: Math.max(0, seg.delay + (Math.random() - 0.5) * 3),
          updatedAt: new Date(),
        }))
      );

      setApiCalls((prev) => prev + 1);
      simulateAhoyAction('GTS_TRAFFIC_FETCHED', 'GTS');
      setIsLoading(false);
      return { success: true, segments: trafficData.length };
    },
    [trafficData, simulateAhoyAction]
  );

  // Generate Analytics Report
  const generateAnalyticsReport = useCallback(
    async (region: string, period: TrafficAnalytics['period']) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      await new Promise((resolve) => setTimeout(resolve, 1200));

      const report: TrafficAnalytics = {
        id: `analytics-${Date.now()}`,
        region,
        period,
        avgCongestion: Math.round(30 + Math.random() * 40),
        peakHours: ['07:00-09:00', '17:00-19:00'],
        totalIncidents: Math.floor(Math.random() * 50) + 10,
        avgTravelTime: Math.round(15 + Math.random() * 20),
        dataPoints: Math.floor(Math.random() * 10000) + 5000,
        generatedAt: new Date(),
      };

      // Create analytics report as NFT
      try {
        const asset = await createAsset({
          name: `GTS Analytics Report - ${region} (${period})`,
          rightType: RightType.VERIFICATION,
          description: `Traffic analytics report for ${region}`,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.COMPLIANCE_GATED,
            requireKyc: false,
          },
          metadata: {
            vertical: 'GTS',
            type: 'ANALYTICS_REPORT',
            region,
            period,
            avgCongestion: report.avgCongestion,
            totalIncidents: report.totalIncidents,
            dataPoints: report.dataPoints,
            generatedAt: report.generatedAt.toISOString(),
            owner: address,
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        setAnalyticsReports((prev) => [report, ...prev.slice(0, 4)]);
        setApiCalls((prev) => prev + 5);
        simulateAhoyAction('GTS_ANALYTICS_GENERATED', 'GTS');
        setIsLoading(false);
        return { success: true, report, assetId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Report generation failed' };
      }
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Purchase API License
  const purchaseApiLicense = useCallback(
    async (dataType: GTSDataLicense['dataType'], tier: GTSDataLicense['tier']) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      const callLimits = { BASIC: 1000, PRO: 10000, ENTERPRISE: 100000 };
      const prices = { BASIC: '50', PRO: '250', ENTERPRISE: '1000' };

      try {
        const asset = await createAsset({
          name: `GTS API License - ${dataType} (${tier})`,
          rightType: RightType.ACCESS,
          description: `API access license for GTS ${dataType} endpoints`,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.NON_TRANSFERABLE,
            requireKyc: true,
          },
          metadata: {
            vertical: 'GTS',
            type: 'API_LICENSE',
            dataType,
            tier,
            callsPerMonth: callLimits[tier],
            usedCalls: 0,
            price: prices[tier],
            purchasedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            owner: address,
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        const newLicense: GTSDataLicense = {
          id: asset.id,
          tokenId: asset.id,
          dataType,
          tier,
          callsPerMonth: callLimits[tier],
          usedCalls: 0,
          price: prices[tier],
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        };

        setLicenses((prev) => [newLicense, ...prev]);
        simulateAhoyAction('GTS_LICENSE_PURCHASED', 'GTS');
        setIsLoading(false);
        return { success: true, licenseId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Purchase failed' };
      }
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  return {
    isochroneResults,
    routeResults,
    trafficData,
    analyticsReports,
    licenses,
    apiCalls,
    isLoading,
    calculateIsochrone,
    calculateRoute,
    getLiveTraffic,
    generateAnalyticsReport,
    purchaseApiLicense,
    hasLicense: (dataType: GTSDataLicense['dataType']) => licenses.some((l) => l.dataType === dataType),
  };
}

// ============================================================================
// TROUVE LABS TYPES & HOOKS
// ============================================================================

export interface FederatedModel {
  id: string;
  tokenId?: string;
  name: string;
  type: 'FINBERT' | 'MEDIGRAPH' | 'TRAFFIC_PREDICTOR' | 'CUSTOM';
  accuracy: string;
  participants: number;
  totalRounds: number;
  currentRound: number;
  usageCost: string;
  owner: string;
}

export interface ComputeContribution {
  id: string;
  modelId: string;
  roundId: string;
  deviceCapacity: string;
  dataPoints: number;
  gradientsHash: string;
  reward: string;
  status: 'COMPUTING' | 'SUBMITTED' | 'VERIFIED' | 'REWARDED';
  startedAt: Date;
  completedAt?: Date;
}

export interface RAGQuery {
  id: string;
  query: string;
  model: string;
  cost: string;
  sourceCount: number;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  result?: string;
  queriedAt: Date;
}

/**
 * Hook for Trouve Labs Federated ML
 */
export function useFederatedML() {
  const { createAsset, transitionAsset, assets } = useSDK();
  const { simulateAhoyAction } = useAhoyState();
  const { address } = useWallet();
  const [models, setModels] = useState<FederatedModel[]>([]);
  const [contributions, setContributions] = useState<ComputeContribution[]>([]);
  const [queries, setQueries] = useState<RAGQuery[]>([]);
  const [earnedTokens, setEarnedTokens] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'training' | 'completed'>('idle');

  // Load model NFTs from assets
  useEffect(() => {
    const trouveAssets = assets.filter((a) => a.metadata?.vertical === 'TROUVE');
    // Could map assets to models here
  }, [assets]);

  // Initialize demo models
  useEffect(() => {
    const demoModels: FederatedModel[] = [
      { id: 'mdl_fin_01', name: 'FinBERT Federated v2', type: 'FINBERT', accuracy: '98.2%', participants: 45, totalRounds: 1042, currentRound: 1042, usageCost: '0.05', owner: '0xTrouve...001' },
      { id: 'mdl_med_03', name: 'MediGraph RAG', type: 'MEDIGRAPH', accuracy: '96.5%', participants: 28, totalRounds: 523, currentRound: 523, usageCost: '0.12', owner: '0xTrouve...002' },
      { id: 'mdl_traffic_02', name: 'TrafficFlow Neural', type: 'TRAFFIC_PREDICTOR', accuracy: '94.8%', participants: 67, totalRounds: 2104, currentRound: 2104, usageCost: '0.03', owner: '0xTrouve...003' },
    ];
    setModels(demoModels);
  }, []);

  // Join federated training round
  const joinTrainingRound = useCallback(
    async (modelId: string, deviceCapacity: string, dataPoints: number) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);
      setTrainingStatus('training');

      const model = models.find((m) => m.id === modelId);
      if (!model) {
        setIsLoading(false);
        setTrainingStatus('idle');
        return { success: false, error: 'Model not found' };
      }

      const contribution: ComputeContribution = {
        id: `compute-${Date.now()}`,
        modelId,
        roundId: `round_${model.currentRound + 1}`,
        deviceCapacity,
        dataPoints,
        gradientsHash: '',
        reward: '0',
        status: 'COMPUTING',
        startedAt: new Date(),
      };

      setContributions((prev) => [contribution, ...prev]);

      // Simulate training time
      return new Promise<{ success: boolean; assetId?: string; reward?: string; error?: string }>((resolve) => {
        setTimeout(async () => {
          const gradientsHash = `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`;
          const reward = Math.floor(dataPoints / 10).toString();

          setContributions((prev) =>
            prev.map((c) =>
              c.id === contribution.id
                ? { ...c, status: 'SUBMITTED', gradientsHash, reward }
                : c
            )
          );

          // Create compute contribution NFT
          try {
            const asset = await createAsset({
              name: `Compute Contribution - ${model.name} Round ${model.currentRound + 1}`,
              rightType: RightType.VERIFICATION,
              description: 'Proof of compute contribution to federated learning',
              jurisdiction: 'AE',
              transferabilityRules: {
                mode: TransferabilityMode.NON_TRANSFERABLE,
                requireKyc: false,
              },
              metadata: {
                vertical: 'TROUVE',
                type: 'COMPUTE_CONTRIBUTION',
                contributionId: contribution.id,
                modelId,
                modelName: model.name,
                roundId: contribution.roundId,
                dataPoints,
                gradientsHash,
                reward,
                contributor: address,
                completedAt: new Date().toISOString(),
              },
            });

            await transitionAsset(asset.id, LifecycleState.VERIFIED, 'zkproof');
            await transitionAsset(asset.id, LifecycleState.ACTIVE, 'zkproof');

            setContributions((prev) =>
              prev.map((c) =>
                c.id === contribution.id
                  ? { ...c, status: 'REWARDED', completedAt: new Date() }
                  : c
              )
            );

            setEarnedTokens((prev) => prev + parseInt(reward));
            setModels((prev) =>
              prev.map((m) =>
                m.id === modelId ? { ...m, currentRound: m.currentRound + 1 } : m
              )
            );

            simulateAhoyAction('COMPUTE_CONTRIBUTION_REWARDED', 'TROUVE');
            setTrainingStatus('completed');
            setIsLoading(false);
            resolve({ success: true, assetId: asset.id, reward });
          } catch (error) {
            setTrainingStatus('idle');
            setIsLoading(false);
            resolve({ success: false, error: error instanceof Error ? error.message : 'Training failed' });
          }
        }, 3000);
      });
    },
    [models, address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Execute RAG query
  const executeRAGQuery = useCallback(
    async (query: string, modelId: string) => {
      const model = models.find((m) => m.id === modelId);
      if (!model) return { success: false, error: 'Model not found' };

      setIsLoading(true);

      const ragQuery: RAGQuery = {
        id: `query-${Date.now()}`,
        query,
        model: model.name,
        cost: model.usageCost,
        sourceCount: 0,
        status: 'PROCESSING',
        queriedAt: new Date(),
      };

      setQueries((prev) => [ragQuery, ...prev]);

      // Simulate query processing
      return new Promise<{ success: boolean; result?: string; sourceCount?: number; cost?: string; error?: string }>((resolve) => {
        setTimeout(() => {
          const sourceCount = Math.floor(Math.random() * 10) + 5;
          const result = `Based on analysis of ${sourceCount} verified sources, the query "${query.substring(0, 50)}..." indicates positive correlation with historical patterns.`;

          setQueries((prev) =>
            prev.map((q) =>
              q.id === ragQuery.id
                ? { ...q, status: 'COMPLETED', sourceCount, result }
                : q
            )
          );

          simulateAhoyAction('RAG_QUERY_EXECUTED', 'TROUVE');
          setIsLoading(false);
          resolve({ success: true, result, sourceCount, cost: model.usageCost });
        }, 1500);
      });
    },
    [models, simulateAhoyAction]
  );

  // Mint model IP NFT
  const mintModelNFT = useCallback(
    async (name: string, type: FederatedModel['type'], accuracy: string, usageCost: string) => {
      if (!address) return { success: false, error: 'Wallet not connected' };

      setIsLoading(true);

      try {
        const asset = await createAsset({
          name: `Federated Model IP - ${name}`,
          rightType: RightType.OWNERSHIP,
          description: `Intellectual property rights for federated ML model ${name}`,
          jurisdiction: 'AE',
          transferabilityRules: {
            mode: TransferabilityMode.COMPLIANCE_GATED,
            requireKyc: true,
          },
          metadata: {
            vertical: 'TROUVE',
            type: 'MODEL_IP_NFT',
            modelName: name,
            modelType: type,
            accuracy,
            usageCost,
            owner: address,
            createdAt: new Date().toISOString(),
          },
        });

        await transitionAsset(asset.id, LifecycleState.VERIFIED, 'system');
        await transitionAsset(asset.id, LifecycleState.ACTIVE, 'system');

        const newModel: FederatedModel = {
          id: asset.id,
          tokenId: asset.id,
          name,
          type,
          accuracy,
          participants: 0,
          totalRounds: 0,
          currentRound: 0,
          usageCost,
          owner: address,
        };

        setModels((prev) => [newModel, ...prev]);
        simulateAhoyAction('MODEL_NFT_MINTED', 'TROUVE');
        setIsLoading(false);
        return { success: true, assetId: asset.id };
      } catch (error) {
        setIsLoading(false);
        return { success: false, error: error instanceof Error ? error.message : 'Mint failed' };
      }
    },
    [address, createAsset, transitionAsset, simulateAhoyAction]
  );

  // Reset training status
  const resetTrainingStatus = useCallback(() => {
    setTrainingStatus('idle');
  }, []);

  return {
    models,
    contributions,
    queries,
    earnedTokens,
    trainingStatus,
    isLoading,
    joinTrainingRound,
    executeRAGQuery,
    mintModelNFT,
    resetTrainingStatus,
  };
}

// ============================================================================
// UNIFIED VERTICAL HOOK
// ============================================================================

/**
 * Unified hook for all vertical services
 */
export function useVerticalServices() {
  const driver = useDriverReputation();
  const flyPlus = useFlyPlusPasses();
  const water = useWaterCredits();
  const smartCity = useSmartCity();
  const dataMarketplace = useDataMarketplace();
  const federatedML = useFederatedML();

  return {
    comet: driver,
    flyplus: flyPlus,
    h2o: water,
    iits: smartCity,
    ams: dataMarketplace,
    trouve: federatedML,
  };
}
