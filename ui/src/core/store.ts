/**
 * Zustand Store — Central state management for the SDK Showcase UI.
 *
 * Migrated from the hand-rolled SDKStore singleton in `ui/src/store.ts`.
 * Uses `subscribeWithSelector` + `devtools` middleware.
 *
 * The legacy `sdkStore` singleton is preserved as a backward-compatible
 * re-export shim in `ui/src/store.ts`.
 */

import { create } from 'zustand';
import { subscribeWithSelector, devtools } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import {
  TokenisationSDK,
  LifecycleState,
  type Asset,
  type Party,
  type BaseEvent,
  PartyType,
  PartyRole,
  BrowserStoragePlugin,
  BrowserEventStore,
  RightType,
} from '@tokenisation/sdk';
// Import the plugin-layer API classes (the plugin ApiClient is distinct from the top-level Stripe-like ApiClient)
import { ApiClient as PluginApiClient, ApiStoragePlugin, ApiEventStore } from '@tokenisation/sdk/plugins';
import { config } from '../config';
import type { Persona, ComplianceRules } from './types';

// ============================================================================
// TYPES
// ============================================================================

export interface StateSnapshot {
  index: number;
  actionName: string;
  payload?: any;
  timestamp: string;
  state: Record<string, any>;
}

export interface CometDelivery {
  id: string;
  driverId: string;
  driverName: string;
  status: 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  pickupAddress: string;
  deliveryAddress: string;
  customerName: string;
  amount: string;
  carbonEmission: number;
  distance: number;
  estimatedTime: number;
  actualTime?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  isOnTime: boolean;
  isPerfect: boolean;
}

export interface CometDriver {
  id: string;
  name: string;
  walletAddress: string;
  vehicleType: 'BIKE' | 'CAR' | 'VAN' | 'TRUCK';
  vehiclePlate: string;
  status: 'AVAILABLE' | 'ON_DELIVERY' | 'OFFLINE';
  currentDeliveryId?: string;
  overallScore: number;
  safetyScore: number;
  efficiencyScore: number;
  reliabilityScore: number;
  totalDeliveries: number;
  perfectDeliveries: number;
  totalEarnings: string;
  ahoyBalance: number;
  joinedAt: string;
}

export type FlyPlusServiceType =
  | 'LUGGAGE_PICKUP'
  | 'HOME_CHECKIN'
  | 'PRIORITY_SERVICE'
  | 'PREMIUM_TRACKING'
  | 'FAST_TRACK_SECURITY'
  | 'MEET_GREET';

export interface FlyPlusServiceCredit {
  id: string;
  serviceType: FlyPlusServiceType;
  tokenCost: number;
  name: string;
  description: string;
  validityDays: number;
}

export interface FlyPlusUserCredits {
  userId: string;
  balance: number;
  purchasedAt: string;
  creditsUsed: FlyPlusServiceRedemption[];
}

export interface FlyPlusServiceRedemption {
  id: string;
  serviceType: FlyPlusServiceType;
  bookingId?: string;
  creditsUsed: number;
  redeemedAt: string;
  status: 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
}

interface AhoyState {
  balance: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  transactions: AhoyTransaction[];
  lifetimeEarned: number;
  streak: number;
  lastActivityDate: string | null;
}

interface AhoyTransaction {
  id: string;
  userId: string;
  userName: string;
  action: string;
  points: number;
  source: string;
  timestamp: string;
}

interface WalletEntry {
  address: string;
  partyId: string;
  chain: string;
  type: string;
  threshold?: number;
  signers?: number;
  balance: string;
}

interface OfferingEntry {
  id: string;
  assetId: string;
  totalSupply: number;
  pricePerToken: number;
  minInvestment: number;
  maxInvestment: number;
  currency: string;
  soldAmount: number;
  startDate?: string;
  endDate?: string;
}

interface SettlementEntry {
  id: string;
  assetId: string;
  partyId: string;
  amount: number;
  type: string;
  status: 'FILED' | 'PROCESSING' | 'SETTLED';
  filedAt: string;
  processedAt?: string;
  settledAt?: string;
}

// ============================================================================
// STORE STATE
// ============================================================================

export interface SDKStoreState {
  // SDK instance
  sdk: TokenisationSDK;
  initialized: boolean;
  version: number;

  // Time-Travel Debugger
  snapshots: StateSnapshot[];
  maxSnapshots: number;
  currentSnapshotIndex: number;
  isTimeTraveling: boolean;

  // SDK Logs
  sdkLogs: { id: string; method: string; params: any; timestamp: string }[];

  // Ahoy ecosystem
  ahoyState: AhoyState;
  currentUserId: string;
  currentUserName: string;

  // COMET
  deliveries: CometDelivery[];
  drivers: CometDriver[];

  // FLY+
  serviceCredits: FlyPlusUserCredits;
  serviceRedemptions: FlyPlusServiceRedemption[];

  // Showcase data
  wallets: Map<string, WalletEntry>;
  offerings: Map<string, OfferingEntry>;
  valuationHistory: Map<string, { date: string; value: number }[]>;
  assetMeta: Map<string, Record<string, unknown>>;
  settlements: Map<string, SettlementEntry>;

  // Whitelist (new)
  whitelistedAddresses: Set<string>;

  // Actions
  init: () => Promise<void>;
  logSdkCall: (method: string, params: any) => void;
  getSdkLogs: () => { id: string; method: string; params: any; timestamp: string }[];

  // Asset actions
  getAssets: () => Asset[];
  getAsset: (id: string) => Asset | null;
  createAsset: (data: any) => Promise<Asset>;

  // Party actions
  getParties: () => Party[];
  getParty: (id: string) => Party | undefined;
  createParty: (data: any) => Promise<Party>;
  verifyKyc: (partyId: string) => void;

  // Token actions
  mint: (assetId: string, toPartyId: string, amount: string) => Promise<{ success: boolean; error?: string }>;
  transfer: (assetId: string, fromPartyId: string, toPartyId: string, amount: string) => Promise<{ success: boolean; error?: string }>;
  transition: (assetId: string, state: LifecycleState, actorId: string) => Promise<{ success: boolean; error?: string }>;
  getBalances: (assetId: string) => Promise<Record<string, string>>;
  getEvents: (assetId?: string) => BaseEvent[];

  // Wallet actions
  createWallet: (partyId: string, config?: { chain?: string; type?: string; threshold?: number; signers?: number }) => WalletEntry;
  getWallet: (partyId: string) => WalletEntry | null;

  // Offering actions
  createOffering: (assetId: string, config: { totalSupply: number; pricePerToken: number; minInvestment: number; maxInvestment: number; currency: string; startDate?: string; endDate?: string }) => OfferingEntry;
  getOffering: (assetId: string) => OfferingEntry | null;
  updateOfferingSold: (assetId: string, amount: number) => void;

  // Compliance
  checkTransferCompliance: (assetId: string, fromId: string, toId: string, amount: string) => { eligible: boolean; checks: { name: string; passed: boolean; detail: string }[] };

  // Valuation
  updateAssetValuation: (assetId: string, newValue: number) => { previous: number; current: number; changePct: number; history: { date: string; value: number }[] };
  getAssetValuation: (assetId: string) => { value: number; history: { date: string; value: number }[] } | null;

  // Metadata
  setAssetMetadata: (assetId: string, key: string, value: unknown) => void;
  getAssetMetadata: (assetId: string) => Record<string, unknown>;

  // Settlement
  createSettlement: (config: { assetId: string; partyId: string; amount: number; type: string }) => SettlementEntry;
  getSettlement: (id: string) => SettlementEntry | null;

  // Ahoy
  getAhoyState: () => AhoyState;
  simulateAhoyAction: (action: string, source: 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'GTS' | 'TROUVE' | 'CONNECT' | 'IITS') => { success: boolean; points: number; newBalance: string };
  getPointInfo: (action: string) => { points: number; isEarn: boolean; description: string } | null;
  getVerticalActions: (vertical: 'COMET' | 'FLYPLUS' | 'H2O' | 'IITS' | 'GTS' | 'AMS' | 'TROUVE' | 'CONNECT') => { earn: { action: string; points: number; description: string }[]; burn: { action: string; points: number; description: string }[] };

  // COMET
  getDeliveries: () => CometDelivery[];
  getDeliveriesByStatus: (status: CometDelivery['status']) => CometDelivery[];
  getDrivers: () => CometDriver[];
  getDriver: (driverId: string) => CometDriver | undefined;
  createDelivery: (data: { pickupAddress: string; deliveryAddress: string; customerName: string; amount: string; distance?: number }) => CometDelivery;
  assignDelivery: (deliveryId: string, driverId: string) => { success: boolean; error?: string };
  startDelivery: (deliveryId: string) => { success: boolean; error?: string };
  completeDelivery: (deliveryId: string, isPerfect?: boolean) => { success: boolean; error?: string; ahoyEarned?: number };
  priorityDispatch: (deliveryId: string) => { success: boolean; error?: string; ahoyCost?: number };
  getDriverLeaderboard: () => CometDriver[];
  generateRandomDelivery: () => CometDelivery;

  // FLY+
  getServiceCredits: () => FlyPlusUserCredits;
  getServiceCatalog: () => FlyPlusServiceCredit[];
  purchaseServiceCredits: (amount: number) => { success: boolean; error?: string; ahoyCost: number; newBalance: number };
  redeemServiceCredits: (serviceType: FlyPlusServiceType, bookingId?: string) => { success: boolean; error?: string; creditsUsed: number; redemption?: FlyPlusServiceRedemption };
  getServiceRedemptions: () => FlyPlusServiceRedemption[];

  // Time-Travel
  getSnapshots: () => StateSnapshot[];
  getSnapshotCount: () => number;
  getCurrentSnapshotIndex: () => number;
  getIsTimeTraveling: () => boolean;
  jumpToSnapshot: (index: number) => void;
  returnToLive: () => void;
  getVisibleState: () => Record<string, any> | null;
  clearSnapshots: () => void;

  // New actions (document requirements)
  whitelist: (address: string) => void;
  removeFromWhitelist: (address: string) => void;
  isWhitelisted: (address: string) => boolean;
  triggerOracleUpdate: (assetId: string, data: Record<string, unknown>) => void;

  // Auth
  setAuthToken: (token: string) => void;

  // Demo
  loadDemoData: () => Promise<void>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const AHOY_STATE_KEY = 'ahoy_user_state';
const AHOY_TRANSACTIONS_KEY = 'ahoy_transactions';
const COMET_DELIVERIES_KEY = 'ahoy_comet_deliveries';
const COMET_DRIVERS_KEY = 'ahoy_comet_drivers';
const FLYPLUS_CREDITS_KEY = 'ahoy_flyplus_credits';
const FLYPLUS_REDEMPTIONS_KEY = 'ahoy_flyplus_redemptions';

const AHOY_POINTS: Record<string, { points: number; isEarn: boolean; description: string }> = {
  PERFECT_DELIVERY_WEEK: { points: 100, isEarn: true, description: 'Perfect delivery week bonus' },
  SAFETY_SCORE_95_PLUS: { points: 50, isEarn: true, description: 'High safety score reward' },
  ZERO_INCIDENT_MONTH: { points: 200, isEarn: true, description: 'Zero incident month bonus' },
  REPUTATION_SBT_MINTED: { points: 150, isEarn: true, description: 'Driver reputation SBT minted' },
  DELIVERY_COMPLETED: { points: 10, isEarn: true, description: 'Delivery completed' },
  FUEL_EFFICIENCY_BONUS: { points: 25, isEarn: true, description: 'Fuel efficiency bonus' },
  CARBON_CREDIT_EARNED: { points: 75, isEarn: true, description: 'Carbon credit earned for eco driving' },
  PRIORITY_DISPATCH: { points: -50, isEarn: false, description: 'Priority dispatch request' },
  EXPRESS_DELIVERY: { points: -100, isEarn: false, description: 'Express delivery premium' },
  FLIGHT_BOOKING: { points: 50, isEarn: true, description: 'Flight booking reward' },
  LOUNGE_CHECK_IN: { points: 25, isEarn: true, description: 'Lounge check-in reward' },
  PASS_PURCHASED: { points: 100, isEarn: true, description: 'Fly+ pass purchased' },
  PASS_TRANSFERRED: { points: 20, isEarn: true, description: 'Pass transfer fee rebate' },
  REFERRAL: { points: 200, isEarn: true, description: 'Referral bonus' },
  FLIGHT_DELAY_CLAIM: { points: 50, isEarn: true, description: 'Flight delay insurance claim' },
  PRIORITY_BOARDING: { points: -75, isEarn: false, description: 'Priority boarding upgrade' },
  SEAT_UPGRADE: { points: -150, isEarn: false, description: 'Seat class upgrade' },
  LOUNGE_ACCESS_PURCHASE: { points: -50, isEarn: false, description: 'Lounge access purchase' },
  WATER_SAVINGS_BONUS: { points: 75, isEarn: true, description: 'Water conservation bonus' },
  UTILITY_PAYMENT: { points: 25, isEarn: true, description: 'On-time utility payment' },
  CREDITS_MINTED: { points: 50, isEarn: true, description: 'Water credits minted' },
  THRESHOLD_TRIGGERED: { points: 10, isEarn: true, description: 'Conservation threshold met' },
  LEAK_REPORTED: { points: 30, isEarn: true, description: 'Leak detection report' },
  PREMIUM_ANALYTICS: { points: -100, isEarn: false, description: 'Premium water analytics' },
  IOT_DEVICE_UPGRADE: { points: -200, isEarn: false, description: 'IoT device upgrade' },
  CITY_DAO_VOTE: { points: 25, isEarn: true, description: 'City DAO governance vote' },
  EMERGENCY_AUTH_SIGNED: { points: 50, isEarn: true, description: 'Emergency authorization co-signed' },
  INFRASTRUCTURE_REGISTERED: { points: 100, isEarn: true, description: 'Infrastructure node registered' },
  TRAFFIC_DATA_SHARED: { points: 15, isEarn: true, description: 'Traffic data contribution' },
  EMERGENCY_AUTH_REQUESTED: { points: -25, isEarn: false, description: 'Emergency access request' },
  EMERGENCY_COMMAND_EXECUTED: { points: -100, isEarn: false, description: 'Emergency command execution' },
  PRIORITY_TRAFFIC_ACCESS: { points: -75, isEarn: false, description: 'Priority traffic signal access' },
  GTS_ISOCHRONE_CALCULATED: { points: 5, isEarn: true, description: 'Isochrone API call' },
  GTS_ROUTE_CALCULATED: { points: 5, isEarn: true, description: 'Route calculation reward' },
  GTS_TRAFFIC_FETCHED: { points: 3, isEarn: true, description: 'Traffic data fetch' },
  GTS_DATA_CONTRIBUTION: { points: 20, isEarn: true, description: 'GTS data contribution' },
  GTS_LICENSE_PURCHASED: { points: -250, isEarn: false, description: 'GTS API license purchase' },
  GTS_ANALYTICS_GENERATED: { points: -50, isEarn: false, description: 'Analytics report generation' },
  GTS_PREMIUM_ROUTING: { points: -25, isEarn: false, description: 'Premium routing with live traffic' },
  DATA_CONTRIBUTION: { points: 30, isEarn: true, description: 'Data contribution reward' },
  DATA_CONTRIBUTION_SUBMITTED: { points: 15, isEarn: true, description: 'Data contribution submitted' },
  DATA_CONTRIBUTION_REWARDED: { points: 35, isEarn: true, description: 'Data contribution verified & rewarded' },
  ALGORITHM_PUBLISHED: { points: 500, isEarn: true, description: 'Algorithm NFT published' },
  ALGORITHM_NFT_MINTED: { points: 300, isEarn: true, description: 'Algorithm NFT minted' },
  ALGORITHM_ROYALTY: { points: 50, isEarn: true, description: 'Algorithm usage royalty' },
  REWARDS_CLAIMED: { points: 0, isEarn: true, description: 'Pending rewards claimed' },
  DATA_LICENSE_PURCHASED: { points: -150, isEarn: false, description: 'Data license purchase' },
  DATA_ACCESS_UNLOCK: { points: -1000, isEarn: false, description: 'Premium data access unlock' },
  API_SUBSCRIPTION: { points: -200, isEarn: false, description: 'API subscription tier' },
  ML_TRAINING_CONTRIBUTION: { points: 75, isEarn: true, description: 'ML training contribution' },
  COMPUTE_CONTRIBUTION_REWARDED: { points: 100, isEarn: true, description: 'Compute contribution rewarded' },
  MODEL_NFT_MINTED: { points: 500, isEarn: true, description: 'Model IP NFT minted' },
  MODEL_USAGE_ROYALTY: { points: 25, isEarn: true, description: 'Model usage royalty earned' },
  RAG_QUERY_EXECUTED: { points: -10, isEarn: false, description: 'RAG query executed' },
  MODEL_INFERENCE: { points: -15, isEarn: false, description: 'Model inference cost' },
  AGENT_HIRE: { points: -300, isEarn: false, description: 'AI agent hire' },
  AGENT_TASK_COMPLETION: { points: 40, isEarn: true, description: 'Agent task completed' },
  CROSS_PLATFORM_SYNC: { points: 20, isEarn: true, description: 'Cross-platform data sync' },
  PRIORITY_QUEUE: { points: -200, isEarn: false, description: 'Priority queue access' },
  DISCOUNT_REDEMPTION: { points: -500, isEarn: false, description: 'Discount redemption' },
};

const FLYPLUS_SERVICE_CATALOG: FlyPlusServiceCredit[] = [
  { id: 'SVC-001', serviceType: 'LUGGAGE_PICKUP', tokenCost: 25, name: 'Luggage Pickup', description: 'Door-to-door luggage collection from your home or hotel', validityDays: 30 },
  { id: 'SVC-002', serviceType: 'HOME_CHECKIN', tokenCost: 40, name: 'Home Check-in', description: 'Complete check-in and boarding pass delivery to your location', validityDays: 30 },
  { id: 'SVC-003', serviceType: 'PRIORITY_SERVICE', tokenCost: 15, name: 'Priority Service', description: 'Skip the queue at check-in and baggage drop', validityDays: 30 },
  { id: 'SVC-004', serviceType: 'PREMIUM_TRACKING', tokenCost: 10, name: 'Premium Luggage Tracking', description: 'Real-time GPS tracking of your luggage throughout journey', validityDays: 30 },
  { id: 'SVC-005', serviceType: 'FAST_TRACK_SECURITY', tokenCost: 35, name: 'Fast Track Security', description: 'Express lane through airport security checkpoints', validityDays: 30 },
  { id: 'SVC-006', serviceType: 'MEET_GREET', tokenCost: 50, name: 'Meet & Greet', description: 'Personal assistant from arrival to gate or baggage claim', validityDays: 30 },
];

const VERTICAL_PREFIXES: Record<string, string[]> = {
  COMET: ['PERFECT_DELIVERY', 'SAFETY_SCORE', 'ZERO_INCIDENT', 'REPUTATION_SBT', 'DELIVERY_COMPLETED', 'FUEL_EFFICIENCY', 'CARBON_CREDIT', 'PRIORITY_DISPATCH', 'EXPRESS_DELIVERY'],
  FLYPLUS: ['FLIGHT_BOOKING', 'LOUNGE_CHECK_IN', 'PASS_PURCHASED', 'PASS_TRANSFERRED', 'REFERRAL', 'FLIGHT_DELAY', 'PRIORITY_BOARDING', 'SEAT_UPGRADE', 'LOUNGE_ACCESS'],
  H2O: ['WATER_SAVINGS', 'UTILITY_PAYMENT', 'CREDITS_MINTED', 'THRESHOLD_TRIGGERED', 'LEAK_REPORTED', 'PREMIUM_ANALYTICS', 'IOT_DEVICE'],
  IITS: ['CITY_DAO', 'EMERGENCY_AUTH', 'INFRASTRUCTURE_REGISTERED', 'TRAFFIC_DATA', 'PRIORITY_TRAFFIC'],
  GTS: ['GTS_'],
  AMS: ['DATA_CONTRIBUTION', 'DATA_LICENSE', 'ALGORITHM', 'REWARDS_CLAIMED', 'DATA_ACCESS', 'API_SUBSCRIPTION'],
  TROUVE: ['ML_TRAINING', 'COMPUTE_CONTRIBUTION', 'MODEL_NFT', 'MODEL_USAGE', 'RAG_QUERY', 'MODEL_INFERENCE', 'AGENT_HIRE'],
  CONNECT: ['AGENT_TASK', 'CROSS_PLATFORM', 'PRIORITY_QUEUE', 'DISCOUNT_REDEMPTION'],
};

// ============================================================================
// HELPER: Load from localStorage
// ============================================================================

function loadJson<T>(key: string, fallback: T): T {
  try {
    const json = localStorage.getItem(key);
    return json ? JSON.parse(json) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`[Store] Failed to save ${key}:`, e);
  }
}

function calculateTier(lifetimeEarned: number): AhoyState['tier'] {
  if (lifetimeEarned >= 100000) return 'DIAMOND';
  if (lifetimeEarned >= 50000) return 'PLATINUM';
  if (lifetimeEarned >= 15000) return 'GOLD';
  if (lifetimeEarned >= 5000) return 'SILVER';
  return 'BRONZE';
}

function initDemoDrivers(): CometDriver[] {
  return [
    { id: 'DRV-001', name: 'Ahmed K.', walletAddress: '0x1234...5678', vehicleType: 'VAN', vehiclePlate: 'DXB-1234', status: 'AVAILABLE', overallScore: 50, safetyScore: 50, efficiencyScore: 50, reliabilityScore: 50, totalDeliveries: 0, perfectDeliveries: 0, totalEarnings: '0', ahoyBalance: 0, joinedAt: new Date().toISOString() },
    { id: 'DRV-002', name: 'Sarah J.', walletAddress: '0x2345...6789', vehicleType: 'CAR', vehiclePlate: 'DXB-5678', status: 'AVAILABLE', overallScore: 50, safetyScore: 50, efficiencyScore: 50, reliabilityScore: 50, totalDeliveries: 0, perfectDeliveries: 0, totalEarnings: '0', ahoyBalance: 0, joinedAt: new Date().toISOString() },
    { id: 'DRV-003', name: 'Mike R.', walletAddress: '0x3456...7890', vehicleType: 'BIKE', vehiclePlate: 'DXB-9012', status: 'AVAILABLE', overallScore: 50, safetyScore: 50, efficiencyScore: 50, reliabilityScore: 50, totalDeliveries: 0, perfectDeliveries: 0, totalEarnings: '0', ahoyBalance: 0, joinedAt: new Date().toISOString() },
  ];
}

// ============================================================================
// CREATE SDK INSTANCE
// ============================================================================

function createSDK(): TokenisationSDK {
  const eventStore = new BrowserEventStore();
  const storagePlugin = new BrowserStoragePlugin();
  const sdk = new TokenisationSDK({
    useMockPlugins: true,
    eventStore,
  });
  sdk.plugins.register('storage', storagePlugin);
  return sdk;
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

const savedAhoy = loadJson<Partial<AhoyState>>(AHOY_STATE_KEY, {});
const savedTxns = loadJson<AhoyTransaction[]>(AHOY_TRANSACTIONS_KEY, []);
const savedDrivers = loadJson<CometDriver[] | null>(COMET_DRIVERS_KEY, null);
const savedDeliveries = loadJson<CometDelivery[]>(COMET_DELIVERIES_KEY, []);
const savedCredits = loadJson<FlyPlusUserCredits | null>(FLYPLUS_CREDITS_KEY, null);
const savedRedemptions = loadJson<FlyPlusServiceRedemption[]>(FLYPLUS_REDEMPTIONS_KEY, []);

export const useSDKStore = create<SDKStoreState>()(
  devtools(
    subscribeWithSelector((set, get) => {
      const sdk = createSDK();

      // Internal helper to create snapshot and notify
      function notifyWithSnapshot(actionName: string, payload?: any) {
        const state = get();
        const snapshot: StateSnapshot = {
          index: state.snapshots.length,
          actionName,
          payload: payload !== undefined ? JSON.parse(JSON.stringify(payload)) : undefined,
          timestamp: new Date().toISOString(),
          state: captureState(),
        };

        let newSnapshots = [...state.snapshots, snapshot];
        if (newSnapshots.length > state.maxSnapshots) {
          newSnapshots = newSnapshots.slice(1);
          newSnapshots.forEach((s, i) => { s.index = i; });
        }

        set({
          snapshots: newSnapshots,
          currentSnapshotIndex: state.isTimeTraveling ? state.currentSnapshotIndex : newSnapshots.length - 1,
          version: state.version + 1,
        });
      }

      function captureState(): Record<string, any> {
        try {
          const s = get();
          return JSON.parse(JSON.stringify({
            initialized: s.initialized,
            assets: s.sdk.assets.getAll(),
            parties: s.sdk.parties_.getAll(),
            ahoyState: s.ahoyState,
            deliveries: s.deliveries,
            drivers: s.drivers,
            serviceCredits: s.serviceCredits,
            wallets: Object.fromEntries(s.wallets),
            offerings: Object.fromEntries(s.offerings),
          }));
        } catch {
          return { error: 'Failed to capture state' };
        }
      }

      function updateStreak(ahoy: AhoyState): AhoyState {
        const today = new Date().toDateString();
        const lastDate = ahoy.lastActivityDate;
        let streak = ahoy.streak;
        if (!lastDate) {
          streak = 1;
        } else if (lastDate !== today) {
          const yesterday = new Date(Date.now() - 86400000).toDateString();
          streak = lastDate === yesterday ? streak + 1 : 1;
        }
        return { ...ahoy, streak, lastActivityDate: today };
      }

      return {
        sdk,
        initialized: false,
        version: 0,

        // Time-Travel
        snapshots: [],
        maxSnapshots: 200,
        currentSnapshotIndex: -1,
        isTimeTraveling: false,

        // SDK Logs
        sdkLogs: [],

        // Ahoy
        ahoyState: {
          balance: savedAhoy.balance ?? '0',
          tier: savedAhoy.tier ?? 'BRONZE',
          transactions: savedTxns,
          lifetimeEarned: savedAhoy.lifetimeEarned ?? 0,
          streak: savedAhoy.streak ?? 0,
          lastActivityDate: savedAhoy.lastActivityDate ?? null,
        },
        currentUserId: 'demo-user-1',
        currentUserName: 'Demo User',

        // COMET
        deliveries: savedDeliveries,
        drivers: savedDrivers ?? initDemoDrivers(),

        // FLY+
        serviceCredits: savedCredits ?? { userId: 'demo-user-1', balance: 0, purchasedAt: '', creditsUsed: [] },
        serviceRedemptions: savedRedemptions,

        // Showcase data
        wallets: new Map(),
        offerings: new Map(),
        valuationHistory: new Map(),
        assetMeta: new Map(),
        settlements: new Map(),

        // Whitelist
        whitelistedAddresses: new Set(),

        // ================================================================
        // ACTIONS
        // ================================================================

        init: async () => {
          const s = get();
          if (s.initialized) return;
          console.log('Hydrating SDK state...');
          await s.sdk.engine.hydrate();
          set({ initialized: true });
          notifyWithSnapshot('SDK_INITIALIZED');
          console.log('SDK State Hydrated. Assets:', s.sdk.assets.getAll().length);

          // Only seed demo data in dev/mock mode — when using the API backend,
          // data comes from the server and seeding would create duplicates.
          if (!config.useApiBackend && s.sdk.assets.getAll().length === 0) {
            console.log('No assets found. Loading demo data (dev mode)...');
            await get().loadDemoData();
          }
        },

        logSdkCall: (method, params) => {
          const log = { id: uuidv4(), method, params, timestamp: new Date().toISOString() };
          set(s => {
            const logs = [log, ...s.sdkLogs];
            return { sdkLogs: logs.length > 20 ? logs.slice(0, 20) : logs };
          });
          notifyWithSnapshot('SDK_LOG', { method, params });
        },

        getSdkLogs: () => [...get().sdkLogs],

        getAssets: () => get().sdk.assets.getAll() as unknown as Asset[],
        getAsset: (id) => (get().sdk.assets.getAll().find(a => a.id === id) || null) as unknown as Asset | null,

        createAsset: async (data) => {
          const asset = await get().sdk.assets.create(data);
          notifyWithSnapshot('CREATE_ASSET', { name: data?.name });
          return asset as unknown as Asset;
        },

        getParties: () => get().sdk.parties_.getAll(),
        getParty: (id) => get().sdk.parties_.get(id),

        createParty: async (data) => {
          const party = get().sdk.parties_.create(data);
          notifyWithSnapshot('CREATE_PARTY', { name: data?.name });
          return party;
        },

        verifyKyc: (partyId) => {
          get().sdk.parties_.setKyc(partyId, true);
          notifyWithSnapshot('VERIFY_KYC', { partyId });
        },

        mint: async (assetId, toPartyId, amount) => {
          const result = await get().sdk.tokens.mint(assetId, toPartyId, amount);
          if (result.success) {
            notifyWithSnapshot('MINT_TOKENS', { assetId, toPartyId, amount });
            return { success: true };
          }
          return { success: false, error: result.error };
        },

        transfer: async (assetId, fromPartyId, toPartyId, amount) => {
          const result = await get().sdk.tokens.transfer(assetId, fromPartyId, toPartyId, amount);
          if (result.success) {
            notifyWithSnapshot('TRANSFER_TOKENS', { assetId, fromPartyId, toPartyId, amount });
            return { success: true };
          }
          return { success: false, error: result.error };
        },

        transition: async (assetId, state, actorId) => {
          const result = await get().sdk.assets.transition(assetId, state, actorId);
          if (result.success) {
            notifyWithSnapshot('LIFECYCLE_TRANSITION', { assetId, state, actorId });
            return { success: true };
          }
          return { success: false, error: result.error };
        },

        getBalances: async (assetId) => {
          const parties = get().getParties();
          const balances: Record<string, string> = {};
          for (const party of parties) {
            try {
              const bal = await get().sdk.tokens.getBalance(assetId, party.id);
              if (bal && BigInt(bal) > 0n) balances[party.id] = bal;
            } catch { /* ignore */ }
          }
          return balances;
        },

        getEvents: () => [],

        // Wallet
        createWallet: (partyId, cfg = {}) => {
          const addr = `0x${partyId.replace(/-/g, '').slice(0, 40)}`;
          const wallet: WalletEntry = {
            address: addr, partyId,
            chain: cfg.chain || 'BASE', type: cfg.type || 'EOA',
            threshold: cfg.threshold, signers: cfg.signers, balance: '0.05',
          };
          const wallets = new Map(get().wallets);
          wallets.set(partyId, wallet);
          set({ wallets });
          notifyWithSnapshot('CREATE_WALLET', { partyId, chain: wallet.chain });
          return wallet;
        },

        getWallet: (partyId) => get().wallets.get(partyId) || null,

        // Offering
        createOffering: (assetId, cfg) => {
          const id = uuidv4();
          const offering: OfferingEntry = { id, assetId, soldAmount: 0, ...cfg };
          const offerings = new Map(get().offerings);
          offerings.set(assetId, offering);
          set({ offerings });
          notifyWithSnapshot('CREATE_OFFERING', { assetId, totalSupply: cfg.totalSupply });
          return offering;
        },

        getOffering: (assetId) => get().offerings.get(assetId) || null,

        updateOfferingSold: (assetId, amount) => {
          const offerings = new Map(get().offerings);
          const offering = offerings.get(assetId);
          if (offering) {
            offering.soldAmount += amount;
            offerings.set(assetId, offering);
            set({ offerings });
            notifyWithSnapshot('UPDATE_OFFERING_SOLD', { assetId, amount });
          }
        },

        // Compliance
        checkTransferCompliance: (assetId, fromId, toId, amount) => {
          const s = get();
          const asset = s.getAsset(assetId);
          const to = s.getParty(toId);
          const checks: { name: string; passed: boolean; detail: string }[] = [];

          const toKyc = to != null && to.verificationLevel != null && to.verificationLevel !== 'NONE';
          checks.push({ name: 'KYC Verified (Buyer)', passed: toKyc, detail: toKyc ? 'VERIFIED' : 'NOT VERIFIED' });

          const jurisdiction = to?.jurisdiction || 'unknown';
          const allowed = ['AE', 'US', 'GB', 'SG', 'EU', 'JP'].includes(jurisdiction);
          checks.push({ name: `Jurisdiction Allowed (${jurisdiction})`, passed: allowed, detail: allowed ? 'ALLOWED' : 'BLOCKED' });

          const active = String(asset?.state) === String(LifecycleState.ACTIVE);
          checks.push({ name: 'Asset is ACTIVE', passed: active, detail: asset?.state || 'unknown' });
          checks.push({ name: 'Holding Period Satisfied', passed: true, detail: '>365 days' });
          checks.push({ name: 'AML Screening', passed: true, detail: 'CLEAR' });

          return { eligible: checks.every(c => c.passed), checks };
        },

        // Valuation
        updateAssetValuation: (assetId, newValue) => {
          const vh = new Map(get().valuationHistory);
          const history = vh.get(assetId) || [];
          const previous = history.length > 0 ? history[history.length - 1].value : newValue;
          history.push({ date: new Date().toISOString().slice(0, 10), value: newValue });
          vh.set(assetId, history);
          set({ valuationHistory: vh });
          const changePct = previous > 0 ? ((newValue - previous) / previous) * 100 : 0;
          notifyWithSnapshot('UPDATE_VALUATION', { assetId, newValue, changePct });
          return { previous, current: newValue, changePct, history };
        },

        getAssetValuation: (assetId) => {
          const history = get().valuationHistory.get(assetId);
          if (!history || history.length === 0) return null;
          return { value: history[history.length - 1].value, history };
        },

        // Metadata
        setAssetMetadata: (assetId, key, value) => {
          const am = new Map(get().assetMeta);
          const meta = am.get(assetId) || {};
          meta[key] = value;
          am.set(assetId, meta);
          set({ assetMeta: am });
          notifyWithSnapshot('SET_ASSET_METADATA', { assetId, key });
        },

        getAssetMetadata: (assetId) => get().assetMeta.get(assetId) || {},

        // Settlement
        createSettlement: (cfg) => {
          const id = uuidv4();
          const now = new Date().toISOString();
          const settlement: SettlementEntry = { id, ...cfg, status: 'SETTLED', filedAt: now, processedAt: now, settledAt: now };
          const sm = new Map(get().settlements);
          sm.set(id, settlement);
          set({ settlements: sm });
          notifyWithSnapshot('CREATE_SETTLEMENT', { type: cfg.type, amount: cfg.amount });
          return settlement;
        },

        getSettlement: (id) => get().settlements.get(id) || null,

        // Ahoy
        getAhoyState: () => ({ ...get().ahoyState }),

        simulateAhoyAction: (action, source) => {
          const s = get();
          const pointsConfig = AHOY_POINTS[action];
          if (!pointsConfig) return { success: false, points: 0, newBalance: s.ahoyState.balance };

          const points = pointsConfig.points;

          // Production path: delegate to API backend
          if (config.useApiBackend) {
            fetch(`${config.apiUrl}/ahoy/actions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action, source, userId: s.currentUserId }),
            }).catch((err: unknown) => {
              console.error('[AHOY] API action failed:', err);
            });

            // Optimistic local update
            const newBalance = parseInt(s.ahoyState.balance) + points;
            const ahoy = { ...s.ahoyState, balance: newBalance.toString() };
            set({ ahoyState: ahoy });
            saveJson(AHOY_STATE_KEY, ahoy);
            notifyWithSnapshot('AHOY_ACTION', { action, source, points });
            return { success: true, points, newBalance: ahoy.balance };
          }

          // Dev/demo path: simulate locally via localStorage
          const currentBalance = parseInt(s.ahoyState.balance);

          if (!pointsConfig.isEarn && currentBalance < Math.abs(points)) {
            return { success: false, points: 0, newBalance: s.ahoyState.balance };
          }

          const newBalance = currentBalance + points;
          let ahoy = {
            ...s.ahoyState,
            balance: newBalance.toString(),
            lifetimeEarned: pointsConfig.isEarn ? s.ahoyState.lifetimeEarned + points : s.ahoyState.lifetimeEarned,
          };
          ahoy.tier = calculateTier(ahoy.lifetimeEarned);
          ahoy = updateStreak(ahoy);

          const txn: AhoyTransaction = {
            id: uuidv4(), userId: s.currentUserId, userName: s.currentUserName,
            action, points, source, timestamp: new Date().toISOString(),
          };
          ahoy.transactions = [txn, ...ahoy.transactions].slice(0, 50);

          set({ ahoyState: ahoy });

          // Persist
          const { transactions, ...rest } = ahoy;
          saveJson(AHOY_STATE_KEY, rest);
          saveJson(AHOY_TRANSACTIONS_KEY, transactions);

          notifyWithSnapshot('AHOY_ACTION', { action, source, points });
          return { success: true, points, newBalance: ahoy.balance };
        },

        getPointInfo: (action) => AHOY_POINTS[action] || null,

        getVerticalActions: (vertical) => {
          const earn: { action: string; points: number; description: string }[] = [];
          const burn: { action: string; points: number; description: string }[] = [];
          const prefixes = VERTICAL_PREFIXES[vertical] || [];
          Object.entries(AHOY_POINTS).forEach(([action, cfg]) => {
            if (prefixes.some(prefix => action.startsWith(prefix))) {
              if (cfg.isEarn) earn.push({ action, points: cfg.points, description: cfg.description });
              else burn.push({ action, points: Math.abs(cfg.points), description: cfg.description });
            }
          });
          return { earn, burn };
        },

        // COMET
        getDeliveries: () => [...get().deliveries],
        getDeliveriesByStatus: (status) => get().deliveries.filter(d => d.status === status),
        getDrivers: () => [...get().drivers],
        getDriver: (driverId) => get().drivers.find(d => d.id === driverId),

        createDelivery: (data) => {
          const delivery: CometDelivery = {
            id: `DLV-${Date.now()}`, driverId: '', driverName: '',
            status: 'PENDING', pickupAddress: data.pickupAddress,
            deliveryAddress: data.deliveryAddress, customerName: data.customerName,
            amount: data.amount, carbonEmission: (data.distance || 5) * 0.12,
            distance: data.distance || 5, estimatedTime: Math.round((data.distance || 5) * 3),
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            isOnTime: true, isPerfect: true,
          };
          const deliveries = [delivery, ...get().deliveries];
          set({ deliveries });
          saveJson(COMET_DELIVERIES_KEY, deliveries);
          notifyWithSnapshot('CREATE_DELIVERY', { id: delivery.id });
          return delivery;
        },

        assignDelivery: (deliveryId, driverId) => {
          const s = get();
          const delivery = s.deliveries.find(d => d.id === deliveryId);
          const driver = s.drivers.find(d => d.id === driverId);
          if (!delivery) return { success: false, error: 'Delivery not found' };
          if (!driver) return { success: false, error: 'Driver not found' };
          if (driver.status !== 'AVAILABLE') return { success: false, error: 'Driver not available' };

          const deliveries = s.deliveries.map(d =>
            d.id === deliveryId ? { ...d, driverId, driverName: driver.name, status: 'ASSIGNED' as const, updatedAt: new Date().toISOString() } : d
          );
          const drivers = s.drivers.map(d =>
            d.id === driverId ? { ...d, status: 'ON_DELIVERY' as const, currentDeliveryId: deliveryId } : d
          );
          set({ deliveries, drivers });
          saveJson(COMET_DELIVERIES_KEY, deliveries);
          saveJson(COMET_DRIVERS_KEY, drivers);
          notifyWithSnapshot('ASSIGN_DELIVERY', { deliveryId, driverId });
          return { success: true };
        },

        startDelivery: (deliveryId) => {
          const s = get();
          const delivery = s.deliveries.find(d => d.id === deliveryId);
          if (!delivery) return { success: false, error: 'Delivery not found' };
          if (delivery.status !== 'ASSIGNED') return { success: false, error: 'Delivery not assigned' };

          const deliveries = s.deliveries.map(d =>
            d.id === deliveryId ? { ...d, status: 'IN_TRANSIT' as const, updatedAt: new Date().toISOString() } : d
          );
          set({ deliveries });
          saveJson(COMET_DELIVERIES_KEY, deliveries);
          notifyWithSnapshot('START_DELIVERY', { deliveryId });
          return { success: true };
        },

        completeDelivery: (deliveryId, isPerfect = true) => {
          const s = get();
          const delivery = s.deliveries.find(d => d.id === deliveryId);
          if (!delivery) return { success: false, error: 'Delivery not found' };
          if (delivery.status === 'DELIVERED') return { success: false, error: 'Already delivered' };

          const startTime = new Date(delivery.updatedAt).getTime();
          const actualMinutes = Math.round((Date.now() - startTime) / 60000);
          const isOnTime = actualMinutes <= delivery.estimatedTime + 5;
          const perfect = isPerfect && isOnTime;

          const deliveries = s.deliveries.map(d =>
            d.id === deliveryId ? { ...d, status: 'DELIVERED' as const, actualTime: actualMinutes, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), isOnTime, isPerfect: perfect } : d
          );

          let drivers = s.drivers;
          let ahoyEarned = 0;
          const driver = s.drivers.find(d => d.id === delivery.driverId);
          if (driver) {
            const scoreChange = perfect ? 0.5 : (isOnTime ? 0.2 : -0.1);
            drivers = s.drivers.map(d => {
              if (d.id !== delivery.driverId) return d;
              return {
                ...d, status: 'AVAILABLE' as const, currentDeliveryId: undefined,
                totalDeliveries: d.totalDeliveries + 1,
                perfectDeliveries: perfect ? d.perfectDeliveries + 1 : d.perfectDeliveries,
                totalEarnings: (parseFloat(d.totalEarnings) + parseFloat(delivery.amount)).toFixed(2),
                overallScore: Math.max(0, Math.min(100, d.overallScore + scoreChange)),
                reliabilityScore: Math.max(0, Math.min(100, d.reliabilityScore + (isOnTime ? 0.3 : -0.2))),
                efficiencyScore: Math.max(0, Math.min(100, d.efficiencyScore + (perfect ? 0.3 : 0))),
              };
            });
          }

          set({ deliveries, drivers });
          saveJson(COMET_DELIVERIES_KEY, deliveries);
          saveJson(COMET_DRIVERS_KEY, drivers);

          // Award AHOY
          const ahoyAction = perfect ? 'PERFECT_DELIVERY_WEEK' : 'DELIVERY_COMPLETED';
          const result = get().simulateAhoyAction(ahoyAction, 'COMET');
          ahoyEarned = result.points;

          if (driver) {
            const updatedDrivers = get().drivers.map(d =>
              d.id === delivery.driverId ? { ...d, ahoyBalance: d.ahoyBalance + ahoyEarned } : d
            );
            set({ drivers: updatedDrivers });
            saveJson(COMET_DRIVERS_KEY, updatedDrivers);
          }

          notifyWithSnapshot('COMPLETE_DELIVERY', { deliveryId, isPerfect: perfect });
          return { success: true, ahoyEarned };
        },

        priorityDispatch: (deliveryId) => {
          const s = get();
          const delivery = s.deliveries.find(d => d.id === deliveryId);
          if (!delivery) return { success: false, error: 'Delivery not found' };

          const result = get().simulateAhoyAction('PRIORITY_DISPATCH', 'COMET');
          if (!result.success) return { success: false, error: 'Insufficient AHOY balance' };

          const deliveries = s.deliveries.map(d =>
            d.id === deliveryId ? { ...d, estimatedTime: Math.round(d.estimatedTime * 0.7), updatedAt: new Date().toISOString() } : d
          );
          set({ deliveries });
          saveJson(COMET_DELIVERIES_KEY, deliveries);
          notifyWithSnapshot('PRIORITY_DISPATCH', { deliveryId });
          return { success: true, ahoyCost: Math.abs(result.points) };
        },

        getDriverLeaderboard: () => [...get().drivers].sort((a, b) => b.overallScore - a.overallScore),

        generateRandomDelivery: () => {
          const addresses = [
            { pickup: 'Dubai Marina Mall', delivery: 'JBR Beach', distance: 2 },
            { pickup: 'Mall of Emirates', delivery: 'Business Bay', distance: 8 },
            { pickup: 'Dubai Airport T3', delivery: 'Downtown Dubai', distance: 12 },
            { pickup: 'Deira City Centre', delivery: 'Palm Jumeirah', distance: 15 },
            { pickup: 'DIFC', delivery: 'Dubai Hills', distance: 10 },
          ];
          const customers = ['John D.', 'Lisa M.', 'Omar H.', 'Priya S.', 'Alex K.'];
          const random = addresses[Math.floor(Math.random() * addresses.length)];
          const customer = customers[Math.floor(Math.random() * customers.length)];
          const amount = (Math.random() * 100 + 20).toFixed(2);
          return get().createDelivery({
            pickupAddress: random.pickup, deliveryAddress: random.delivery,
            customerName: customer, amount: `${amount} AED`, distance: random.distance,
          });
        },

        // FLY+
        getServiceCredits: () => ({ ...get().serviceCredits }),
        getServiceCatalog: () => FLYPLUS_SERVICE_CATALOG,

        purchaseServiceCredits: (amount) => {
          const s = get();
          if (amount <= 0) return { success: false, error: 'Invalid amount', ahoyCost: 0, newBalance: s.serviceCredits.balance };

          const currentBalance = parseInt(s.ahoyState.balance);
          if (currentBalance < amount) return { success: false, error: 'Insufficient AHOY balance', ahoyCost: 0, newBalance: s.serviceCredits.balance };

          const ahoy = { ...s.ahoyState, balance: (currentBalance - amount).toString() };
          const credits = { ...s.serviceCredits, balance: s.serviceCredits.balance + amount, purchasedAt: new Date().toISOString() };

          set({ ahoyState: ahoy, serviceCredits: credits });
          const { transactions, ...rest } = ahoy;
          saveJson(AHOY_STATE_KEY, rest);
          saveJson(AHOY_TRANSACTIONS_KEY, transactions);
          saveJson(FLYPLUS_CREDITS_KEY, credits);

          notifyWithSnapshot('PURCHASE_SERVICE_CREDITS', { amount, ahoyCost: amount });
          return { success: true, ahoyCost: amount, newBalance: credits.balance };
        },

        redeemServiceCredits: (serviceType, bookingId) => {
          const s = get();
          const service = FLYPLUS_SERVICE_CATALOG.find(sv => sv.serviceType === serviceType);
          if (!service) return { success: false, error: 'Service not found', creditsUsed: 0 };
          if (s.serviceCredits.balance < service.tokenCost) return { success: false, error: 'Insufficient Fly+ credits', creditsUsed: 0 };

          const redemption: FlyPlusServiceRedemption = {
            id: `RDM-${Date.now()}`, serviceType, bookingId,
            creditsUsed: service.tokenCost, redeemedAt: new Date().toISOString(), status: 'CONFIRMED',
          };

          const credits = {
            ...s.serviceCredits,
            balance: s.serviceCredits.balance - service.tokenCost,
            creditsUsed: [...s.serviceCredits.creditsUsed, redemption],
          };
          const redemptions = [redemption, ...s.serviceRedemptions];

          set({ serviceCredits: credits, serviceRedemptions: redemptions });
          saveJson(FLYPLUS_CREDITS_KEY, credits);
          saveJson(FLYPLUS_REDEMPTIONS_KEY, redemptions);
          notifyWithSnapshot('REDEEM_SERVICE_CREDITS', { serviceType, creditsUsed: service.tokenCost });
          return { success: true, creditsUsed: service.tokenCost, redemption };
        },

        getServiceRedemptions: () => [...get().serviceRedemptions],

        // Time-Travel
        getSnapshots: () => get().snapshots,
        getSnapshotCount: () => get().snapshots.length,
        getCurrentSnapshotIndex: () => get().currentSnapshotIndex,
        getIsTimeTraveling: () => get().isTimeTraveling,

        jumpToSnapshot: (index) => {
          const s = get();
          if (index < 0 || index >= s.snapshots.length) return;
          set({ isTimeTraveling: true, currentSnapshotIndex: index, version: s.version + 1 });
        },

        returnToLive: () => {
          const s = get();
          set({ isTimeTraveling: false, currentSnapshotIndex: s.snapshots.length - 1, version: s.version + 1 });
        },

        getVisibleState: () => {
          const s = get();
          if (s.snapshots.length === 0) return null;
          const idx = Math.min(s.currentSnapshotIndex, s.snapshots.length - 1);
          if (idx < 0) return null;
          return s.snapshots[idx].state;
        },

        clearSnapshots: () => {
          set({ snapshots: [], currentSnapshotIndex: -1, isTimeTraveling: false, version: get().version + 1 });
        },

        // New actions
        whitelist: (address) => {
          const wl = new Set(get().whitelistedAddresses);
          wl.add(address);
          set({ whitelistedAddresses: wl });
          notifyWithSnapshot('WHITELIST_ADDRESS', { address });
        },

        removeFromWhitelist: (address) => {
          const wl = new Set(get().whitelistedAddresses);
          wl.delete(address);
          set({ whitelistedAddresses: wl });
          notifyWithSnapshot('REMOVE_WHITELIST', { address });
        },

        isWhitelisted: (address) => get().whitelistedAddresses.has(address),

        triggerOracleUpdate: (assetId, data) => {
          const am = new Map(get().assetMeta);
          const meta = am.get(assetId) || {};
          meta['oracleData'] = { ...((meta['oracleData'] as Record<string, unknown>) || {}), ...data, updatedAt: new Date().toISOString() };
          am.set(assetId, meta);
          set({ assetMeta: am });
          notifyWithSnapshot('ORACLE_UPDATE', { assetId, ...data });
        },

        // Auth
        setAuthToken: (token) => {
          if (!config.useApiBackend) {
            console.log('[SDK Store] API backend disabled, ignoring auth token');
            return;
          }

          console.log('[SDK Store] Auth token received, upgrading to API storage...');
          const s = get();

          // Create API client with the auth token
          const apiClient = new PluginApiClient({
            baseUrl: config.apiUrl,
            getToken: () => token,
          });

          // Create API-backed storage and event store
          const apiStorage = new ApiStoragePlugin({ apiClient });
          const apiEventStore = new ApiEventStore({ apiClient });

          // Register with SDK plugin system (replaces browser storage)
          s.sdk.plugins.register('storage', apiStorage);

          // Re-hydrate state from the API backend
          s.sdk.engine.hydrate().then(() => {
            set({ version: s.version + 1 });
            console.log('[SDK Store] Upgraded to API storage. Assets:', s.sdk.assets.getAll().length);
          }).catch((err: unknown) => {
            console.error('[SDK Store] Failed to hydrate from API:', err);
          });
        },

        // Demo Data
        loadDemoData: async () => {
          const s = get();
          const issuer = s.sdk.parties_.create({
            name: 'Dubai Properties LLC',
            type: PartyType.ORGANIZATION,
            roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
            jurisdiction: 'AE',
          });
          s.sdk.parties_.setKyc(issuer.id, true);

          const investor1 = s.sdk.parties_.create({
            name: 'Ahmed Al Maktoum',
            type: PartyType.INDIVIDUAL,
            roles: [PartyRole.INVESTOR],
            jurisdiction: 'AE',
          });
          s.sdk.parties_.setKyc(investor1.id, true);

          const realEstate = await s.sdk.assets.create({
            name: 'Dubai Marina Tower - Unit 1501',
            rightType: RightType.OWNERSHIP,
            jurisdiction: 'AE' as any,
            issuerId: issuer.id,
          });

          await s.sdk.assets.transition(realEstate.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
          await s.sdk.assets.transition(realEstate.id, LifecycleState.VERIFIED, issuer.id);
          await s.sdk.assets.transition(realEstate.id, LifecycleState.ACTIVE, issuer.id);
          await s.sdk.tokens.mint(realEstate.id, investor1.id, '500');

          notifyWithSnapshot('LOAD_DEMO_DATA');
        },
      };
    }),
    { name: 'SDKStore' }
  )
);

// Initialize on import
useSDKStore.getState().init();
