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
  // Production plugins (uncomment when API server is running)
  // ApiClient,
  // ApiStoragePlugin,
  // ApiEventStore,
} from '@tokenisation/sdk';
import { config } from './config';

// Ahoy ecosystem types
interface AhoyTransaction {
  id: string;
  userId: string;
  userName: string;
  action: string;
  points: number;
  source: string;
  timestamp: string;
}

interface AhoyState {
  balance: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  transactions: AhoyTransaction[];
  lifetimeEarned: number;
  streak: number;
  lastActivityDate: string | null;
}

// localStorage keys for AHOY persistence
const AHOY_STATE_KEY = 'ahoy_user_state';
const AHOY_TRANSACTIONS_KEY = 'ahoy_transactions';
const COMET_DELIVERIES_KEY = 'ahoy_comet_deliveries';
const COMET_DRIVERS_KEY = 'ahoy_comet_drivers';

// COMET Delivery types
export interface CometDelivery {
  id: string;
  driverId: string;
  driverName: string;
  status: 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED';
  pickupAddress: string;
  deliveryAddress: string;
  customerName: string;
  amount: string;
  carbonEmission: number; // kg CO2
  distance: number; // km
  estimatedTime: number; // minutes
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

// FLY+ Types
const FLYPLUS_BOOKINGS_KEY = 'ahoy_flyplus_bookings';
const FLYPLUS_FLIGHTS_KEY = 'ahoy_flyplus_flights';

export interface FlyPlusFlight {
  id: string;
  flightNumber: string;
  airline: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departureTime: string;
  arrivalTime: string;
  date: string;
  aircraft: string;
  status: 'SCHEDULED' | 'BOARDING' | 'DEPARTED' | 'DELAYED' | 'CANCELLED' | 'ARRIVED';
  delayMinutes: number;
  gate?: string;
  availableSeats: {
    economy: number;
    business: number;
    first: number;
  };
  prices: {
    economy: number;
    business: number;
    first: number;
  };
}

export interface FlyPlusBooking {
  id: string;
  orderId: string;
  passengerName: string;
  passengerEmail: string;
  flightId: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  seatClass: 'ECONOMY' | 'BUSINESS' | 'FIRST';
  seatNumber: string;
  status: 'CONFIRMED' | 'CHECKED_IN' | 'BOARDED' | 'COMPLETED' | 'CANCELLED' | 'TRANSFERRED';
  tokenId: string;
  price: number;
  ahoyEarned: number;
  hasInsurance: boolean;
  insuranceClaimed: boolean;
  loungeAccess: boolean;
  priorityBoarding: boolean;
  createdAt: string;
  updatedAt: string;
  transferable: boolean;
  transferredTo?: string;
}

// FLY+ Service Credits - Tokenized prepaid services
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
  tokenCost: number; // Cost in AHOY tokens
  name: string;
  description: string;
  validityDays: number;
}

export interface FlyPlusUserCredits {
  userId: string;
  balance: number; // Fly+ service tokens
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

const FLYPLUS_CREDITS_KEY = 'ahoy_flyplus_credits';
const FLYPLUS_REDEMPTIONS_KEY = 'ahoy_flyplus_redemptions';

// Service catalog with AHOY token costs
export const FLYPLUS_SERVICE_CATALOG: FlyPlusServiceCredit[] = [
  {
    id: 'SVC-001',
    serviceType: 'LUGGAGE_PICKUP',
    tokenCost: 25,
    name: 'Luggage Pickup',
    description: 'Door-to-door luggage collection from your home or hotel',
    validityDays: 30,
  },
  {
    id: 'SVC-002',
    serviceType: 'HOME_CHECKIN',
    tokenCost: 40,
    name: 'Home Check-in',
    description: 'Complete check-in and boarding pass delivery to your location',
    validityDays: 30,
  },
  {
    id: 'SVC-003',
    serviceType: 'PRIORITY_SERVICE',
    tokenCost: 15,
    name: 'Priority Service',
    description: 'Skip the queue at check-in and baggage drop',
    validityDays: 30,
  },
  {
    id: 'SVC-004',
    serviceType: 'PREMIUM_TRACKING',
    tokenCost: 10,
    name: 'Premium Luggage Tracking',
    description: 'Real-time GPS tracking of your luggage throughout journey',
    validityDays: 30,
  },
  {
    id: 'SVC-005',
    serviceType: 'FAST_TRACK_SECURITY',
    tokenCost: 35,
    name: 'Fast Track Security',
    description: 'Express lane through airport security checkpoints',
    validityDays: 30,
  },
  {
    id: 'SVC-006',
    serviceType: 'MEET_GREET',
    tokenCost: 50,
    name: 'Meet & Greet',
    description: 'Personal assistant from arrival to gate or baggage claim',
    validityDays: 30,
  },
];

// Points configuration - Comprehensive AHOY token value accrual for all verticals
const AHOY_POINTS: Record<string, { points: number; isEarn: boolean; description: string }> = {
  // ============================================================================
  // COMET - Logistics & Fleet Management
  // ============================================================================
  // EARN actions
  PERFECT_DELIVERY_WEEK: { points: 100, isEarn: true, description: 'Perfect delivery week bonus' },
  SAFETY_SCORE_95_PLUS: { points: 50, isEarn: true, description: 'High safety score reward' },
  ZERO_INCIDENT_MONTH: { points: 200, isEarn: true, description: 'Zero incident month bonus' },
  REPUTATION_SBT_MINTED: { points: 150, isEarn: true, description: 'Driver reputation SBT minted' },
  DELIVERY_COMPLETED: { points: 10, isEarn: true, description: 'Delivery completed' },
  FUEL_EFFICIENCY_BONUS: { points: 25, isEarn: true, description: 'Fuel efficiency bonus' },
  CARBON_CREDIT_EARNED: { points: 75, isEarn: true, description: 'Carbon credit earned for eco driving' },
  // BURN actions
  PRIORITY_DISPATCH: { points: -50, isEarn: false, description: 'Priority dispatch request' },
  EXPRESS_DELIVERY: { points: -100, isEarn: false, description: 'Express delivery premium' },

  // ============================================================================
  // FLY+ - Travel & Luggage Services
  // ============================================================================
  // EARN actions
  FLIGHT_BOOKING: { points: 50, isEarn: true, description: 'Flight booking reward' },
  LOUNGE_CHECK_IN: { points: 25, isEarn: true, description: 'Lounge check-in reward' },
  PASS_PURCHASED: { points: 100, isEarn: true, description: 'Fly+ pass purchased' },
  PASS_TRANSFERRED: { points: 20, isEarn: true, description: 'Pass transfer fee rebate' },
  REFERRAL: { points: 200, isEarn: true, description: 'Referral bonus' },
  FLIGHT_DELAY_CLAIM: { points: 50, isEarn: true, description: 'Flight delay insurance claim' },
  // BURN actions
  PRIORITY_BOARDING: { points: -75, isEarn: false, description: 'Priority boarding upgrade' },
  SEAT_UPGRADE: { points: -150, isEarn: false, description: 'Seat class upgrade' },
  LOUNGE_ACCESS_PURCHASE: { points: -50, isEarn: false, description: 'Lounge access purchase' },

  // ============================================================================
  // H2OTO - Water Technology & Conservation
  // ============================================================================
  // EARN actions
  WATER_SAVINGS_BONUS: { points: 75, isEarn: true, description: 'Water conservation bonus' },
  UTILITY_PAYMENT: { points: 25, isEarn: true, description: 'On-time utility payment' },
  CREDITS_MINTED: { points: 50, isEarn: true, description: 'Water credits minted' },
  THRESHOLD_TRIGGERED: { points: 10, isEarn: true, description: 'Conservation threshold met' },
  LEAK_REPORTED: { points: 30, isEarn: true, description: 'Leak detection report' },
  // BURN actions
  PREMIUM_ANALYTICS: { points: -100, isEarn: false, description: 'Premium water analytics' },
  IOT_DEVICE_UPGRADE: { points: -200, isEarn: false, description: 'IoT device upgrade' },

  // ============================================================================
  // IITS - Smart City Infrastructure
  // ============================================================================
  // EARN actions
  CITY_DAO_VOTE: { points: 25, isEarn: true, description: 'City DAO governance vote' },
  EMERGENCY_AUTH_SIGNED: { points: 50, isEarn: true, description: 'Emergency authorization co-signed' },
  INFRASTRUCTURE_REGISTERED: { points: 100, isEarn: true, description: 'Infrastructure node registered' },
  TRAFFIC_DATA_SHARED: { points: 15, isEarn: true, description: 'Traffic data contribution' },
  // BURN actions
  EMERGENCY_AUTH_REQUESTED: { points: -25, isEarn: false, description: 'Emergency access request' },
  EMERGENCY_COMMAND_EXECUTED: { points: -100, isEarn: false, description: 'Emergency command execution' },
  PRIORITY_TRAFFIC_ACCESS: { points: -75, isEarn: false, description: 'Priority traffic signal access' },

  // ============================================================================
  // GTS - Geospatial Tracking System
  // ============================================================================
  // EARN actions (free tier rewards)
  GTS_ISOCHRONE_CALCULATED: { points: 5, isEarn: true, description: 'Isochrone API call' },
  GTS_ROUTE_CALCULATED: { points: 5, isEarn: true, description: 'Route calculation reward' },
  GTS_TRAFFIC_FETCHED: { points: 3, isEarn: true, description: 'Traffic data fetch' },
  GTS_DATA_CONTRIBUTION: { points: 20, isEarn: true, description: 'GTS data contribution' },
  // BURN actions
  GTS_LICENSE_PURCHASED: { points: -250, isEarn: false, description: 'GTS API license purchase' },
  GTS_ANALYTICS_GENERATED: { points: -50, isEarn: false, description: 'Analytics report generation' },
  GTS_PREMIUM_ROUTING: { points: -25, isEarn: false, description: 'Premium routing with live traffic' },

  // ============================================================================
  // AMS - AHOY Movement Studio (Developer SDK)
  // ============================================================================
  // EARN actions
  DATA_CONTRIBUTION: { points: 30, isEarn: true, description: 'Data contribution reward' },
  DATA_CONTRIBUTION_SUBMITTED: { points: 15, isEarn: true, description: 'Data contribution submitted' },
  DATA_CONTRIBUTION_REWARDED: { points: 35, isEarn: true, description: 'Data contribution verified & rewarded' },
  ALGORITHM_PUBLISHED: { points: 500, isEarn: true, description: 'Algorithm NFT published' },
  ALGORITHM_NFT_MINTED: { points: 300, isEarn: true, description: 'Algorithm NFT minted' },
  ALGORITHM_ROYALTY: { points: 50, isEarn: true, description: 'Algorithm usage royalty' },
  REWARDS_CLAIMED: { points: 0, isEarn: true, description: 'Pending rewards claimed' },
  // BURN actions
  DATA_LICENSE_PURCHASED: { points: -150, isEarn: false, description: 'Data license purchase' },
  DATA_ACCESS_UNLOCK: { points: -1000, isEarn: false, description: 'Premium data access unlock' },
  API_SUBSCRIPTION: { points: -200, isEarn: false, description: 'API subscription tier' },

  // ============================================================================
  // TROUVE LABS - Federated ML & AI
  // ============================================================================
  // EARN actions
  ML_TRAINING_CONTRIBUTION: { points: 75, isEarn: true, description: 'ML training contribution' },
  COMPUTE_CONTRIBUTION_REWARDED: { points: 100, isEarn: true, description: 'Compute contribution rewarded' },
  MODEL_NFT_MINTED: { points: 500, isEarn: true, description: 'Model IP NFT minted' },
  MODEL_USAGE_ROYALTY: { points: 25, isEarn: true, description: 'Model usage royalty earned' },
  // BURN actions
  RAG_QUERY_EXECUTED: { points: -10, isEarn: false, description: 'RAG query executed' },
  MODEL_INFERENCE: { points: -15, isEarn: false, description: 'Model inference cost' },
  AGENT_HIRE: { points: -300, isEarn: false, description: 'AI agent hire' },

  // ============================================================================
  // CONNECT - Cross-Platform Integration
  // ============================================================================
  // EARN actions
  AGENT_TASK_COMPLETION: { points: 40, isEarn: true, description: 'Agent task completed' },
  CROSS_PLATFORM_SYNC: { points: 20, isEarn: true, description: 'Cross-platform data sync' },
  // BURN actions
  PRIORITY_QUEUE: { points: -200, isEarn: false, description: 'Priority queue access' },
  DISCOUNT_REDEMPTION: { points: -500, isEarn: false, description: 'Discount redemption' },
};

class SDKStore {
  public sdk: TokenisationSDK;
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  // SDK Logging for Demo (Legacy support for UI components)
  private sdkLogs: { id: string; method: string; params: any; timestamp: string }[] = [];

  logSdkCall(method: string, params: any) {
    const log = {
      id: uuidv4(),
      method,
      params,
      timestamp: new Date().toISOString(),
    };
    this.sdkLogs.unshift(log);
    if (this.sdkLogs.length > 20) this.sdkLogs.pop();
    this.notify();
  }

  getSdkLogs() {
    return [...this.sdkLogs];
  }

  // Ahoy ecosystem state - persisted to localStorage
  private ahoyState: AhoyState = {
    balance: '0',
    tier: 'BRONZE',
    transactions: [],
    lifetimeEarned: 0,
    streak: 0,
    lastActivityDate: null,
  };
  private currentUserId: string = 'demo-user-1';
  private currentUserName: string = 'Demo User';

  constructor() {
    // Load AHOY state from localStorage first
    this.loadAhoyState();
    // Load COMET data
    this.loadDeliveries();
    this.loadDrivers();
    // Load FLY+ data
    this.loadFlights();
    this.loadBookings();
    this.loadServiceCredits();
    // Initialize SDK with appropriate storage backend
    // Browser storage for MVP, API storage for production

    if (config.useApiBackend) {
      // Production mode: Use API backend for persistence
      // Requires the server to be running and user to be authenticated
      console.log('[SDK Store] Using API backend at:', config.apiUrl);

      // Note: API client requires auth token from SIWE authentication
      // The token is injected via setAuthToken() after user signs in
      // For now, initialize with browser storage and upgrade later
      const eventStore = new BrowserEventStore();
      const storagePlugin = new BrowserStoragePlugin();

      this.sdk = new TokenisationSDK({
        useMockPlugins: true,
        eventStore: eventStore,
      });
      this.sdk.plugins.register('storage', storagePlugin);

      // TODO: After SIWE auth, call upgradeToApiStorage() with token
    } else {
      // MVP mode: Use browser local storage for persistence
      console.log('[SDK Store] Using browser local storage (MVP mode)');

      const eventStore = new BrowserEventStore();
      const storagePlugin = new BrowserStoragePlugin();

      this.sdk = new TokenisationSDK({
        useMockPlugins: true, // Mock Compliance/Jurisdiction for MVP
        eventStore: eventStore,
      });

      this.sdk.plugins.register('storage', storagePlugin);
    }

    this.init();
  }

  /**
   * Upgrade to API storage after SIWE authentication
   * Called by AuthContext after successful sign-in
   */
  setAuthToken(token: string): void {
    if (!config.useApiBackend) {
      console.log('[SDK Store] API backend disabled, ignoring auth token');
      return;
    }

    console.log('[SDK Store] Auth token received, upgrading to API storage...');
    // In production, this would:
    // 1. Create ApiClient with the token
    // 2. Create ApiStoragePlugin and ApiEventStore
    // 3. Register them with the SDK
    // 4. Re-hydrate state from the API

    // For now, just log that we received the token
    // Full implementation requires the server to be running
  }

  async init() {
    if (this.initialized) return;

    console.log('Hydrating SDK state...');
    await this.sdk.engine.hydrate();

    this.initialized = true;
    this.notify();
    console.log('SDK State Hydrated. Assets:', this.sdk.assets.getAll().length);

    if (this.sdk.assets.getAll().length === 0) {
      console.log('No assets found. Loading Demo Data...');
      await this.loadDemoData();
    }
  }

  // --- Wrapper Methods matching previous store interface ---

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private version = 0;

  private notify() {
    this.version++;
    this.listeners.forEach(l => l());
  }

  getVersion(): number {
    return this.version;
  }

  getAssets(): Asset[] {
    return this.sdk.assets.getAll();
  }

  getAsset(id: string): Asset | null {
    // SDK returns Asset | null, store returned Asset | undefined.
    // We can Promise await or use synchronous getAll() find
    // The SDK generic `get` is async in AssetManager.
    // But we can use `getByState` or just filter `getAll`.
    // `getAll` is synchronous in LifecycleEngine derived view.
    return this.sdk.assets.getAll().find(a => a.id === id) || null;
  }

  getParties(): Party[] {
    return this.sdk.parties_.getAll();
  }

  getParty(id: string): Party | undefined {
    return this.sdk.parties_.get(id);
  }

  getEvents(assetId?: string): BaseEvent[] {
    // SDK events getter is async usually via store, or we can use internal synchronous access if we exposed it?
    // `getAll` on GenericEventStore is async.
    // BUT, we want UI to be synchronous mostly for React.
    // Use internal event store synchronously? wrapper doesn't expose sync array.
    // We will fix this by caching events or accepting async.
    // For now, return empty array or promise?
    // The previous store returned `Event[]`.
    // Let's implement a rudimentary cached event list or just async load.
    // Hack for MVP: expose `mock` event array if not possible?
    // No, we want real events.
    // We can use the fact that `BrowserEventStore` is based on localStorage which is sync!
    // But interface is async.
    // We'll return [] and trigger async fetch update?
    // Or changed `init` to load events into a local cache.
    return [];
    // TODO: Implement Sync Event View or SWR hook.
    // For the demo, we'll rely on the fact that `events` are less critical for immediate display than `assets`.
    // Actually `AssetDetail` likely needs it.
  }

  // Wrappers for async mutations
  async createAsset(data: any): Promise<Asset> {
    const asset = await this.sdk.assets.create(data);
    this.notify();
    return asset;
  }

  async createParty(data: any): Promise<Party> {
    const party = this.sdk.parties_.create(data);
    this.notify();
    return party;
  }

  verifyKyc(partyId: string): void {
    this.sdk.parties_.setKyc(partyId, true);
    this.notify();
  }

  async mint(assetId: string, toPartyId: string, amount: string) {
    // Find party wallet? 
    // MVP: The SDK mint expects an address in `to`.
    // `store.ts` passed `partyId`.
    // We need to resolve Party ID to Wallet Address.
    // For MVP, using PartyID as address if mock.
    const result = await this.sdk.tokens.mint(assetId, toPartyId, amount);
    if (result.success) {
      this.notify();
      return { success: true };
    }
    return { success: false, error: result.error };
  }

  async transfer(assetId: string, fromPartyId: string, toPartyId: string, amount: string) {
    const result = await this.sdk.tokens.transfer(assetId, fromPartyId, toPartyId, amount);
    if (result.success) {
      this.notify();
      return { success: true };
    }
    return { success: false, error: result.error };
  }
  async transition(assetId: string, state: LifecycleState, actorId: string) {
    const result = await this.sdk.assets.transition(assetId, state, actorId);
    if (result.success) {
      this.notify();
      return { success: true };
    }
    return { success: false, error: result.error };
  }

  async getBalances(assetId: string): Promise<Record<string, string>> {
    const parties = this.getParties();
    const balances: Record<string, string> = {};

    // In a real implementation this would be optimized. 
    // For now we iterate parties to find holders.
    // We assume the SDK TokenManager exposes getBalance which is synchronous in the Mock/MVP or async.
    // Checking SDK source (not visible but assumed standard):
    // Actually relying on internal ledger state is better if exposed.
    // For MVP integration, we'll try to get it from the internal ledger if possible,
    // or just return mock data if the SDK doesn't expose a bulk getter yet.

    // We will use the async getBalance for each party.
    for (const party of parties) {
      try {
        const bal = await this.sdk.tokens.getBalance(assetId, party.id);
        if (bal && BigInt(bal) > 0n) {
          balances[party.id] = bal;
        }
      } catch (e) {
        // ignore errors for parties with no balance/account
      }
    }
    return balances;
  }

  // Ahoy Ecosystem Methods
  getAhoyState(): AhoyState {
    return { ...this.ahoyState };
  }

  // Load AHOY state from localStorage
  private loadAhoyState(): void {
    try {
      const stateJson = localStorage.getItem(AHOY_STATE_KEY);
      const txnsJson = localStorage.getItem(AHOY_TRANSACTIONS_KEY);

      if (stateJson) {
        const saved = JSON.parse(stateJson);
        this.ahoyState = {
          ...this.ahoyState,
          balance: saved.balance ?? '0',
          tier: saved.tier ?? 'BRONZE',
          lifetimeEarned: saved.lifetimeEarned ?? 0,
          streak: saved.streak ?? 0,
          lastActivityDate: saved.lastActivityDate ?? null,
        };
        console.log('[AHOY] Loaded state from localStorage:', this.ahoyState.balance, 'AHOY');
      }

      if (txnsJson) {
        this.ahoyState.transactions = JSON.parse(txnsJson);
        console.log('[AHOY] Loaded', this.ahoyState.transactions.length, 'transactions');
      }
    } catch (error) {
      console.error('[AHOY] Error loading state from localStorage:', error);
    }
  }

  // Save AHOY state to localStorage
  private saveAhoyState(): void {
    try {
      const { transactions, ...state } = this.ahoyState;
      localStorage.setItem(AHOY_STATE_KEY, JSON.stringify(state));
      localStorage.setItem(AHOY_TRANSACTIONS_KEY, JSON.stringify(transactions));
    } catch (error) {
      console.error('[AHOY] Error saving state to localStorage:', error);
    }
  }

  // Update streak based on activity date
  private updateStreak(): void {
    const today = new Date().toDateString();
    const lastDate = this.ahoyState.lastActivityDate;

    if (!lastDate) {
      // First activity ever
      this.ahoyState.streak = 1;
    } else if (lastDate === today) {
      // Same day, no change to streak
    } else {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (lastDate === yesterday) {
        // Consecutive day - increment streak
        this.ahoyState.streak += 1;
      } else {
        // Gap in activity - reset streak
        this.ahoyState.streak = 1;
      }
    }
    this.ahoyState.lastActivityDate = today;
  }

  // Get point info for a specific action
  getPointInfo(action: string): { points: number; isEarn: boolean; description: string } | null {
    return AHOY_POINTS[action] || null;
  }

  // Get all available actions for a vertical
  getVerticalActions(vertical: 'COMET' | 'FLYPLUS' | 'H2O' | 'IITS' | 'GTS' | 'AMS' | 'TROUVE' | 'CONNECT'): {
    earn: { action: string; points: number; description: string }[];
    burn: { action: string; points: number; description: string }[];
  } {
    const verticalPrefixes: Record<string, string[]> = {
      COMET: ['PERFECT_DELIVERY', 'SAFETY_SCORE', 'ZERO_INCIDENT', 'REPUTATION_SBT', 'DELIVERY_COMPLETED', 'FUEL_EFFICIENCY', 'CARBON_CREDIT', 'PRIORITY_DISPATCH', 'EXPRESS_DELIVERY'],
      FLYPLUS: ['FLIGHT_BOOKING', 'LOUNGE_CHECK_IN', 'PASS_PURCHASED', 'PASS_TRANSFERRED', 'REFERRAL', 'FLIGHT_DELAY', 'PRIORITY_BOARDING', 'SEAT_UPGRADE', 'LOUNGE_ACCESS'],
      H2O: ['WATER_SAVINGS', 'UTILITY_PAYMENT', 'CREDITS_MINTED', 'THRESHOLD_TRIGGERED', 'LEAK_REPORTED', 'PREMIUM_ANALYTICS', 'IOT_DEVICE'],
      IITS: ['CITY_DAO', 'EMERGENCY_AUTH', 'INFRASTRUCTURE_REGISTERED', 'TRAFFIC_DATA', 'PRIORITY_TRAFFIC'],
      GTS: ['GTS_'],
      AMS: ['DATA_CONTRIBUTION', 'DATA_LICENSE', 'ALGORITHM', 'REWARDS_CLAIMED', 'DATA_ACCESS', 'API_SUBSCRIPTION'],
      TROUVE: ['ML_TRAINING', 'COMPUTE_CONTRIBUTION', 'MODEL_NFT', 'MODEL_USAGE', 'RAG_QUERY', 'MODEL_INFERENCE', 'AGENT_HIRE'],
      CONNECT: ['AGENT_TASK', 'CROSS_PLATFORM', 'PRIORITY_QUEUE', 'DISCOUNT_REDEMPTION'],
    };

    const earn: { action: string; points: number; description: string }[] = [];
    const burn: { action: string; points: number; description: string }[] = [];

    const prefixes = verticalPrefixes[vertical] || [];
    Object.entries(AHOY_POINTS).forEach(([action, config]) => {
      if (prefixes.some(prefix => action.startsWith(prefix))) {
        if (config.isEarn) {
          earn.push({ action, points: config.points, description: config.description });
        } else {
          burn.push({ action, points: Math.abs(config.points), description: config.description });
        }
      }
    });

    return { earn, burn };
  }

  simulateAhoyAction(
    action: string,
    source: 'COMET' | 'FLYPLUS' | 'H2O' | 'AMS' | 'GTS' | 'TROUVE' | 'CONNECT' | 'IITS'
  ): { success: boolean; points: number; newBalance: string } {
    const pointsConfig = AHOY_POINTS[action];
    if (!pointsConfig) {
      return { success: false, points: 0, newBalance: this.ahoyState.balance };
    }

    const currentBalance = parseInt(this.ahoyState.balance);
    const points = pointsConfig.points;

    // Check if user can afford burn action
    if (!pointsConfig.isEarn && currentBalance < Math.abs(points)) {
      return { success: false, points: 0, newBalance: this.ahoyState.balance };
    }

    // Update balance
    const newBalance = currentBalance + points;
    this.ahoyState.balance = newBalance.toString();

    // Update lifetime earned if earning
    if (pointsConfig.isEarn) {
      this.ahoyState.lifetimeEarned += points;
    }

    // Update tier based on life time earned
    this.ahoyState.tier = this.calculateTier(this.ahoyState.lifetimeEarned);

    // Update streak
    this.updateStreak();

    // Add transaction
    const transaction: AhoyTransaction = {
      id: uuidv4(),
      userId: this.currentUserId,
      userName: this.currentUserName,
      action,
      points,
      source,
      timestamp: new Date().toISOString(),
    };
    this.ahoyState.transactions.unshift(transaction);

    // Keep only last 50 transactions
    if (this.ahoyState.transactions.length > 50) {
      this.ahoyState.transactions = this.ahoyState.transactions.slice(0, 50);
    }

    // Persist to localStorage
    this.saveAhoyState();

    this.notify();
    return { success: true, points, newBalance: this.ahoyState.balance };
  }

  private calculateTier(lifetimeEarned: number): AhoyState['tier'] {
    if (lifetimeEarned >= 100000) return 'DIAMOND';
    if (lifetimeEarned >= 50000) return 'PLATINUM';
    if (lifetimeEarned >= 15000) return 'GOLD';
    if (lifetimeEarned >= 5000) return 'SILVER';
    return 'BRONZE';
  }

  // ============================================================================
  // COMET - Fleet & Delivery Management
  // ============================================================================

  private deliveries: CometDelivery[] = [];
  private drivers: CometDriver[] = [];

  // Load deliveries from localStorage
  private loadDeliveries(): void {
    try {
      const json = localStorage.getItem(COMET_DELIVERIES_KEY);
      if (json) {
        this.deliveries = JSON.parse(json);
        console.log('[COMET] Loaded', this.deliveries.length, 'deliveries');
      }
    } catch (error) {
      console.error('[COMET] Error loading deliveries:', error);
    }
  }

  // Save deliveries to localStorage
  private saveDeliveries(): void {
    try {
      localStorage.setItem(COMET_DELIVERIES_KEY, JSON.stringify(this.deliveries));
    } catch (error) {
      console.error('[COMET] Error saving deliveries:', error);
    }
  }

  // Load drivers from localStorage
  private loadDrivers(): void {
    try {
      const json = localStorage.getItem(COMET_DRIVERS_KEY);
      if (json) {
        this.drivers = JSON.parse(json);
        console.log('[COMET] Loaded', this.drivers.length, 'drivers');
      } else {
        // Initialize with demo drivers if none exist
        this.initializeDemoDrivers();
      }
    } catch (error) {
      console.error('[COMET] Error loading drivers:', error);
    }
  }

  // Save drivers to localStorage
  private saveDrivers(): void {
    try {
      localStorage.setItem(COMET_DRIVERS_KEY, JSON.stringify(this.drivers));
    } catch (error) {
      console.error('[COMET] Error saving drivers:', error);
    }
  }

  // Initialize demo drivers
  private initializeDemoDrivers(): void {
    this.drivers = [
      {
        id: 'DRV-001',
        name: 'Ahmed K.',
        walletAddress: '0x1234...5678',
        vehicleType: 'VAN',
        vehiclePlate: 'DXB-1234',
        status: 'AVAILABLE',
        overallScore: 50,
        safetyScore: 50,
        efficiencyScore: 50,
        reliabilityScore: 50,
        totalDeliveries: 0,
        perfectDeliveries: 0,
        totalEarnings: '0',
        ahoyBalance: 0,
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'DRV-002',
        name: 'Sarah J.',
        walletAddress: '0x2345...6789',
        vehicleType: 'CAR',
        vehiclePlate: 'DXB-5678',
        status: 'AVAILABLE',
        overallScore: 50,
        safetyScore: 50,
        efficiencyScore: 50,
        reliabilityScore: 50,
        totalDeliveries: 0,
        perfectDeliveries: 0,
        totalEarnings: '0',
        ahoyBalance: 0,
        joinedAt: new Date().toISOString(),
      },
      {
        id: 'DRV-003',
        name: 'Mike R.',
        walletAddress: '0x3456...7890',
        vehicleType: 'BIKE',
        vehiclePlate: 'DXB-9012',
        status: 'AVAILABLE',
        overallScore: 50,
        safetyScore: 50,
        efficiencyScore: 50,
        reliabilityScore: 50,
        totalDeliveries: 0,
        perfectDeliveries: 0,
        totalEarnings: '0',
        ahoyBalance: 0,
        joinedAt: new Date().toISOString(),
      },
    ];
    this.saveDrivers();
    console.log('[COMET] Initialized demo drivers');
  }

  // Get all deliveries
  getDeliveries(): CometDelivery[] {
    return [...this.deliveries];
  }

  // Get deliveries by status
  getDeliveriesByStatus(status: CometDelivery['status']): CometDelivery[] {
    return this.deliveries.filter(d => d.status === status);
  }

  // Get all drivers
  getDrivers(): CometDriver[] {
    return [...this.drivers];
  }

  // Get driver by ID
  getDriver(driverId: string): CometDriver | undefined {
    return this.drivers.find(d => d.id === driverId);
  }

  // Create a new delivery
  createDelivery(data: {
    pickupAddress: string;
    deliveryAddress: string;
    customerName: string;
    amount: string;
    distance?: number;
  }): CometDelivery {
    const delivery: CometDelivery = {
      id: `DLV-${Date.now()}`,
      driverId: '',
      driverName: '',
      status: 'PENDING',
      pickupAddress: data.pickupAddress,
      deliveryAddress: data.deliveryAddress,
      customerName: data.customerName,
      amount: data.amount,
      carbonEmission: (data.distance || 5) * 0.12, // ~120g CO2 per km
      distance: data.distance || 5,
      estimatedTime: Math.round((data.distance || 5) * 3), // ~3 min per km
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isOnTime: true,
      isPerfect: true,
    };

    this.deliveries.unshift(delivery);
    this.saveDeliveries();
    this.notify();
    console.log('[COMET] Created delivery:', delivery.id);
    return delivery;
  }

  // Assign delivery to driver
  assignDelivery(deliveryId: string, driverId: string): { success: boolean; error?: string } {
    const delivery = this.deliveries.find(d => d.id === deliveryId);
    const driver = this.drivers.find(d => d.id === driverId);

    if (!delivery) return { success: false, error: 'Delivery not found' };
    if (!driver) return { success: false, error: 'Driver not found' };
    if (driver.status !== 'AVAILABLE') return { success: false, error: 'Driver not available' };

    delivery.driverId = driverId;
    delivery.driverName = driver.name;
    delivery.status = 'ASSIGNED';
    delivery.updatedAt = new Date().toISOString();

    driver.status = 'ON_DELIVERY';
    driver.currentDeliveryId = deliveryId;

    this.saveDeliveries();
    this.saveDrivers();
    this.notify();
    console.log('[COMET] Assigned delivery', deliveryId, 'to driver', driverId);
    return { success: true };
  }

  // Start delivery (driver picked up)
  startDelivery(deliveryId: string): { success: boolean; error?: string } {
    const delivery = this.deliveries.find(d => d.id === deliveryId);
    if (!delivery) return { success: false, error: 'Delivery not found' };
    if (delivery.status !== 'ASSIGNED') return { success: false, error: 'Delivery not assigned' };

    delivery.status = 'IN_TRANSIT';
    delivery.updatedAt = new Date().toISOString();

    this.saveDeliveries();
    this.notify();
    console.log('[COMET] Started delivery:', deliveryId);
    return { success: true };
  }

  // Complete delivery
  completeDelivery(deliveryId: string, isPerfect: boolean = true): {
    success: boolean;
    error?: string;
    ahoyEarned?: number;
  } {
    const delivery = this.deliveries.find(d => d.id === deliveryId);
    if (!delivery) return { success: false, error: 'Delivery not found' };
    if (delivery.status === 'DELIVERED') return { success: false, error: 'Already delivered' };

    const driver = this.drivers.find(d => d.id === delivery.driverId);

    // Calculate time taken
    const startTime = new Date(delivery.updatedAt).getTime();
    const endTime = Date.now();
    const actualMinutes = Math.round((endTime - startTime) / 60000);
    const isOnTime = actualMinutes <= delivery.estimatedTime + 5; // 5 min grace

    // Update delivery
    delivery.status = 'DELIVERED';
    delivery.actualTime = actualMinutes;
    delivery.completedAt = new Date().toISOString();
    delivery.updatedAt = new Date().toISOString();
    delivery.isOnTime = isOnTime;
    delivery.isPerfect = isPerfect && isOnTime;

    // Update driver stats
    let ahoyEarned = 0;
    if (driver) {
      driver.status = 'AVAILABLE';
      driver.currentDeliveryId = undefined;
      driver.totalDeliveries += 1;
      if (delivery.isPerfect) {
        driver.perfectDeliveries += 1;
      }
      driver.totalEarnings = (parseFloat(driver.totalEarnings) + parseFloat(delivery.amount)).toFixed(2);

      // Update scores
      const scoreChange = delivery.isPerfect ? 0.5 : (delivery.isOnTime ? 0.2 : -0.1);
      driver.overallScore = Math.max(0, Math.min(100, driver.overallScore + scoreChange));
      driver.reliabilityScore = Math.max(0, Math.min(100, driver.reliabilityScore + (isOnTime ? 0.3 : -0.2)));
      driver.efficiencyScore = Math.max(0, Math.min(100, driver.efficiencyScore + (delivery.isPerfect ? 0.3 : 0)));

      // Award AHOY
      const ahoyAction = delivery.isPerfect ? 'PERFECT_DELIVERY_WEEK' : 'DELIVERY_COMPLETED';
      const result = this.simulateAhoyAction(ahoyAction, 'COMET');
      ahoyEarned = result.points;
      driver.ahoyBalance += ahoyEarned;
    }

    this.saveDeliveries();
    this.saveDrivers();
    this.notify();
    console.log('[COMET] Completed delivery:', deliveryId, 'Perfect:', delivery.isPerfect, 'AHOY:', ahoyEarned);
    return { success: true, ahoyEarned };
  }

  // Priority dispatch (costs AHOY)
  priorityDispatch(deliveryId: string): { success: boolean; error?: string; ahoyCost?: number } {
    const delivery = this.deliveries.find(d => d.id === deliveryId);
    if (!delivery) return { success: false, error: 'Delivery not found' };

    // Check and deduct AHOY
    const result = this.simulateAhoyAction('PRIORITY_DISPATCH', 'COMET');
    if (!result.success) {
      return { success: false, error: 'Insufficient AHOY balance' };
    }

    // Reduce estimated time by 30%
    delivery.estimatedTime = Math.round(delivery.estimatedTime * 0.7);
    delivery.updatedAt = new Date().toISOString();

    this.saveDeliveries();
    this.notify();
    console.log('[COMET] Priority dispatch for:', deliveryId);
    return { success: true, ahoyCost: Math.abs(result.points) };
  }

  // Get driver leaderboard
  getDriverLeaderboard(): CometDriver[] {
    return [...this.drivers].sort((a, b) => b.overallScore - a.overallScore);
  }

  // ============================================================================
  // FLY+ - Flight Booking & Pass Management
  // ============================================================================

  private flights: FlyPlusFlight[] = [];
  private bookings: FlyPlusBooking[] = [];

  // Load flights from localStorage
  private loadFlights(): void {
    try {
      const json = localStorage.getItem(FLYPLUS_FLIGHTS_KEY);
      if (json) {
        this.flights = JSON.parse(json);
        console.log('[FLY+] Loaded', this.flights.length, 'flights');
      } else {
        // Initialize with demo flights if none exist
        this.initializeDemoFlights();
      }
    } catch (error) {
      console.error('[FLY+] Error loading flights:', error);
    }
  }

  // Save flights to localStorage
  private saveFlights(): void {
    try {
      localStorage.setItem(FLYPLUS_FLIGHTS_KEY, JSON.stringify(this.flights));
    } catch (error) {
      console.error('[FLY+] Error saving flights:', error);
    }
  }

  // Load bookings from localStorage
  private loadBookings(): void {
    try {
      const json = localStorage.getItem(FLYPLUS_BOOKINGS_KEY);
      if (json) {
        this.bookings = JSON.parse(json);
        console.log('[FLY+] Loaded', this.bookings.length, 'bookings');
      }
    } catch (error) {
      console.error('[FLY+] Error loading bookings:', error);
    }
  }

  // Save bookings to localStorage
  private saveBookings(): void {
    try {
      localStorage.setItem(FLYPLUS_BOOKINGS_KEY, JSON.stringify(this.bookings));
    } catch (error) {
      console.error('[FLY+] Error saving bookings:', error);
    }
  }

  // Initialize demo flights
  private initializeDemoFlights(): void {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    this.flights = [
      {
        id: 'FLT-001',
        flightNumber: 'AH702',
        airline: 'AHOY Airways',
        origin: 'LHR',
        originCity: 'London Heathrow',
        destination: 'DXB',
        destinationCity: 'Dubai International',
        departureTime: '08:45',
        arrivalTime: '16:45',
        date: tomorrow.toISOString().split('T')[0],
        aircraft: 'Boeing 787-9 Dreamliner',
        status: 'SCHEDULED',
        delayMinutes: 0,
        gate: 'A12',
        availableSeats: { economy: 120, business: 24, first: 8 },
        prices: { economy: 450, business: 1200, first: 3500 },
      },
      {
        id: 'FLT-002',
        flightNumber: 'AH104',
        airline: 'AHOY Airways',
        origin: 'DXB',
        originCity: 'Dubai International',
        destination: 'SIN',
        destinationCity: 'Singapore Changi',
        departureTime: '14:20',
        arrivalTime: '02:35',
        date: nextWeek.toISOString().split('T')[0],
        aircraft: 'Airbus A380-800',
        status: 'SCHEDULED',
        delayMinutes: 0,
        gate: 'B8',
        availableSeats: { economy: 340, business: 76, first: 14 },
        prices: { economy: 680, business: 2100, first: 5500 },
      },
      {
        id: 'FLT-003',
        flightNumber: 'AH321',
        airline: 'AHOY Airways',
        origin: 'DXB',
        originCity: 'Dubai International',
        destination: 'JFK',
        destinationCity: 'New York JFK',
        departureTime: '02:15',
        arrivalTime: '09:30',
        date: tomorrow.toISOString().split('T')[0],
        aircraft: 'Boeing 777-300ER',
        status: 'SCHEDULED',
        delayMinutes: 0,
        gate: 'A24',
        availableSeats: { economy: 280, business: 42, first: 8 },
        prices: { economy: 890, business: 3200, first: 8500 },
      },
      {
        id: 'FLT-004',
        flightNumber: 'AH415',
        airline: 'AHOY Airways',
        origin: 'CDG',
        originCity: 'Paris Charles de Gaulle',
        destination: 'DXB',
        destinationCity: 'Dubai International',
        departureTime: '22:00',
        arrivalTime: '06:30',
        date: nextWeek.toISOString().split('T')[0],
        aircraft: 'Airbus A350-900',
        status: 'SCHEDULED',
        delayMinutes: 0,
        gate: 'C15',
        availableSeats: { economy: 210, business: 48, first: 12 },
        prices: { economy: 520, business: 1650, first: 4200 },
      },
    ];
    this.saveFlights();
    console.log('[FLY+] Initialized demo flights');
  }

  // Get all flights
  getFlights(): FlyPlusFlight[] {
    return [...this.flights];
  }

  // Get flight by ID
  getFlight(flightId: string): FlyPlusFlight | undefined {
    return this.flights.find(f => f.id === flightId);
  }

  // Search flights
  searchFlights(params: {
    origin?: string;
    destination?: string;
    date?: string;
  }): FlyPlusFlight[] {
    return this.flights.filter(f => {
      if (params.origin && f.origin !== params.origin) return false;
      if (params.destination && f.destination !== params.destination) return false;
      if (params.date && f.date !== params.date) return false;
      return true;
    });
  }

  // Get all bookings
  getBookings(): FlyPlusBooking[] {
    return [...this.bookings];
  }

  // Get booking by ID
  getBooking(bookingId: string): FlyPlusBooking | undefined {
    return this.bookings.find(b => b.id === bookingId);
  }

  // Book a flight
  bookFlight(data: {
    flightId: string;
    passengerName: string;
    passengerEmail: string;
    seatClass: 'ECONOMY' | 'BUSINESS' | 'FIRST';
    hasInsurance?: boolean;
  }): { success: boolean; booking?: FlyPlusBooking; error?: string; ahoyEarned?: number } {
    const flight = this.flights.find(f => f.id === data.flightId);
    if (!flight) return { success: false, error: 'Flight not found' };

    // Check seat availability
    const seatKey = data.seatClass.toLowerCase() as 'economy' | 'business' | 'first';
    if (flight.availableSeats[seatKey] <= 0) {
      return { success: false, error: `No ${data.seatClass} seats available` };
    }

    // Generate seat number
    const row = Math.floor(Math.random() * 30) + 1;
    const seat = ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];
    const seatNumber = `${row}${seat}`;

    // Create booking
    const booking: FlyPlusBooking = {
      id: `BKG-${Date.now()}`,
      orderId: `ORD-${Date.now()}`,
      passengerName: data.passengerName,
      passengerEmail: data.passengerEmail,
      flightId: data.flightId,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      originCity: flight.originCity,
      destination: flight.destination,
      destinationCity: flight.destinationCity,
      date: flight.date,
      departureTime: flight.departureTime,
      arrivalTime: flight.arrivalTime,
      seatClass: data.seatClass,
      seatNumber,
      status: 'CONFIRMED',
      tokenId: `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`,
      price: flight.prices[seatKey],
      ahoyEarned: 0,
      hasInsurance: data.hasInsurance || false,
      insuranceClaimed: false,
      loungeAccess: data.seatClass !== 'ECONOMY',
      priorityBoarding: data.seatClass !== 'ECONOMY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      transferable: true,
    };

    // Update seat availability
    flight.availableSeats[seatKey] -= 1;

    // Award AHOY for booking
    const result = this.simulateAhoyAction('FLIGHT_BOOKING', 'FLYPLUS');
    booking.ahoyEarned = result.points;

    this.bookings.unshift(booking);
    this.saveBookings();
    this.saveFlights();
    this.notify();

    console.log('[FLY+] Created booking:', booking.id, 'for flight', flight.flightNumber);
    return { success: true, booking, ahoyEarned: result.points };
  }

  // Check in for flight
  checkInBooking(bookingId: string): { success: boolean; error?: string } {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };
    if (booking.status !== 'CONFIRMED') return { success: false, error: 'Cannot check in - invalid status' };

    booking.status = 'CHECKED_IN';
    booking.updatedAt = new Date().toISOString();

    // Award AHOY for check-in
    this.simulateAhoyAction('LOUNGE_CHECK_IN', 'FLYPLUS');

    this.saveBookings();
    this.notify();

    console.log('[FLY+] Checked in booking:', bookingId);
    return { success: true };
  }

  // Transfer/sell booking
  transferBooking(bookingId: string, toAddress: string): {
    success: boolean;
    error?: string;
    ahoyEarned?: number;
  } {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };
    if (!booking.transferable) return { success: false, error: 'Booking not transferable' };
    if (booking.status !== 'CONFIRMED') return { success: false, error: 'Cannot transfer - invalid status' };

    booking.status = 'TRANSFERRED';
    booking.transferredTo = toAddress;
    booking.updatedAt = new Date().toISOString();

    // Award AHOY for transfer
    const result = this.simulateAhoyAction('PASS_TRANSFERRED', 'FLYPLUS');

    this.saveBookings();
    this.notify();

    console.log('[FLY+] Transferred booking:', bookingId, 'to', toAddress);
    return { success: true, ahoyEarned: result.points };
  }

  // Claim flight delay insurance
  claimInsurance(bookingId: string): {
    success: boolean;
    error?: string;
    ahoyEarned?: number;
    payout?: number;
  } {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };
    if (!booking.hasInsurance) return { success: false, error: 'No insurance on this booking' };
    if (booking.insuranceClaimed) return { success: false, error: 'Insurance already claimed' };

    const flight = this.flights.find(f => f.id === booking.flightId);
    if (!flight) return { success: false, error: 'Flight not found' };
    if (flight.status !== 'DELAYED' || flight.delayMinutes < 60) {
      return { success: false, error: 'Flight not delayed enough for claim (>60 min required)' };
    }

    booking.insuranceClaimed = true;
    booking.updatedAt = new Date().toISOString();

    // Calculate payout based on delay
    const payout = Math.min(flight.delayMinutes * 2, 500); // $2 per minute, max $500

    // Award AHOY for claim
    const result = this.simulateAhoyAction('FLIGHT_DELAY_CLAIM', 'FLYPLUS');

    this.saveBookings();
    this.notify();

    console.log('[FLY+] Insurance claimed for booking:', bookingId, 'Payout:', payout);
    return { success: true, ahoyEarned: result.points, payout };
  }

  // Simulate flight delay (for demo)
  simulateFlightDelay(flightId: string, delayMinutes: number): { success: boolean; error?: string } {
    const flight = this.flights.find(f => f.id === flightId);
    if (!flight) return { success: false, error: 'Flight not found' };

    flight.status = 'DELAYED';
    flight.delayMinutes = delayMinutes;

    this.saveFlights();
    this.notify();

    console.log('[FLY+] Flight', flight.flightNumber, 'delayed by', delayMinutes, 'minutes');
    return { success: true };
  }

  // Purchase lounge access (burns AHOY)
  purchaseLoungeAccess(bookingId: string): {
    success: boolean;
    error?: string;
    ahoyCost?: number;
  } {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };
    if (booking.loungeAccess) return { success: false, error: 'Already has lounge access' };

    // Burn AHOY for lounge access
    const result = this.simulateAhoyAction('LOUNGE_ACCESS_PURCHASE', 'FLYPLUS');
    if (!result.success) {
      return { success: false, error: 'Insufficient AHOY balance' };
    }

    booking.loungeAccess = true;
    booking.updatedAt = new Date().toISOString();

    this.saveBookings();
    this.notify();

    console.log('[FLY+] Lounge access purchased for booking:', bookingId);
    return { success: true, ahoyCost: Math.abs(result.points) };
  }

  // Request seat upgrade (burns AHOY)
  requestSeatUpgrade(bookingId: string): {
    success: boolean;
    error?: string;
    ahoyCost?: number;
    newClass?: string;
  } {
    const booking = this.bookings.find(b => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found' };
    if (booking.seatClass === 'FIRST') return { success: false, error: 'Already in first class' };

    const flight = this.flights.find(f => f.id === booking.flightId);
    if (!flight) return { success: false, error: 'Flight not found' };

    // Determine new class
    const newClass = booking.seatClass === 'ECONOMY' ? 'BUSINESS' : 'FIRST';
    const newClassKey = newClass.toLowerCase() as 'business' | 'first';

    // Check availability
    if (flight.availableSeats[newClassKey] <= 0) {
      return { success: false, error: `No ${newClass} seats available for upgrade` };
    }

    // Burn AHOY for upgrade
    const result = this.simulateAhoyAction('SEAT_UPGRADE', 'FLYPLUS');
    if (!result.success) {
      return { success: false, error: 'Insufficient AHOY balance' };
    }

    // Update booking
    const oldClassKey = booking.seatClass.toLowerCase() as 'economy' | 'business';
    flight.availableSeats[oldClassKey] += 1;
    flight.availableSeats[newClassKey] -= 1;

    booking.seatClass = newClass as 'BUSINESS' | 'FIRST';
    booking.loungeAccess = true;
    booking.priorityBoarding = true;
    booking.updatedAt = new Date().toISOString();

    this.saveBookings();
    this.saveFlights();
    this.notify();

    console.log('[FLY+] Seat upgraded for booking:', bookingId, 'to', newClass);
    return { success: true, ahoyCost: Math.abs(result.points), newClass };
  }

  // ============================================================================
  // FLY+ Service Credits - Tokenized Prepaid Services
  // ============================================================================

  private serviceCredits: FlyPlusUserCredits = {
    userId: 'demo-user-1',
    balance: 0,
    purchasedAt: '',
    creditsUsed: [],
  };
  private serviceRedemptions: FlyPlusServiceRedemption[] = [];

  // Load service credits from localStorage
  private loadServiceCredits(): void {
    try {
      const json = localStorage.getItem(FLYPLUS_CREDITS_KEY);
      if (json) {
        this.serviceCredits = JSON.parse(json);
        console.log('[FLY+] Loaded service credits:', this.serviceCredits.balance);
      }
      const redemptionsJson = localStorage.getItem(FLYPLUS_REDEMPTIONS_KEY);
      if (redemptionsJson) {
        this.serviceRedemptions = JSON.parse(redemptionsJson);
        console.log('[FLY+] Loaded', this.serviceRedemptions.length, 'redemptions');
      }
    } catch (error) {
      console.error('[FLY+] Error loading service credits:', error);
    }
  }

  // Save service credits to localStorage
  private saveServiceCredits(): void {
    try {
      localStorage.setItem(FLYPLUS_CREDITS_KEY, JSON.stringify(this.serviceCredits));
      localStorage.setItem(FLYPLUS_REDEMPTIONS_KEY, JSON.stringify(this.serviceRedemptions));
    } catch (error) {
      console.error('[FLY+] Error saving service credits:', error);
    }
  }

  // Get current service credit balance
  getServiceCredits(): FlyPlusUserCredits {
    return { ...this.serviceCredits };
  }

  // Get service catalog
  getServiceCatalog(): FlyPlusServiceCredit[] {
    return FLYPLUS_SERVICE_CATALOG;
  }

  // Purchase service credits (converts AHOY tokens to Fly+ service tokens)
  purchaseServiceCredits(amount: number): {
    success: boolean;
    error?: string;
    ahoyCost: number;
    newBalance: number;
  } {
    if (amount <= 0) {
      return { success: false, error: 'Invalid amount', ahoyCost: 0, newBalance: this.serviceCredits.balance };
    }

    // 1 AHOY = 1 Fly+ service credit (1:1 exchange)
    const ahoyCost = amount;
    const currentBalance = parseInt(this.ahoyState.balance);

    if (currentBalance < ahoyCost) {
      return { success: false, error: 'Insufficient AHOY balance', ahoyCost: 0, newBalance: this.serviceCredits.balance };
    }

    // Deduct AHOY
    this.ahoyState.balance = (currentBalance - ahoyCost).toString();
    this.saveAhoyState();

    // Add Fly+ credits
    this.serviceCredits.balance += amount;
    this.serviceCredits.purchasedAt = new Date().toISOString();
    this.saveServiceCredits();

    this.notify();
    console.log('[FLY+] Purchased', amount, 'service credits for', ahoyCost, 'AHOY');
    return { success: true, ahoyCost, newBalance: this.serviceCredits.balance };
  }

  // Redeem service credits for a service
  redeemServiceCredits(
    serviceType: FlyPlusServiceType,
    bookingId?: string
  ): {
    success: boolean;
    error?: string;
    creditsUsed: number;
    redemption?: FlyPlusServiceRedemption;
  } {
    const service = FLYPLUS_SERVICE_CATALOG.find(s => s.serviceType === serviceType);
    if (!service) {
      return { success: false, error: 'Service not found', creditsUsed: 0 };
    }

    if (this.serviceCredits.balance < service.tokenCost) {
      return { success: false, error: 'Insufficient Fly+ credits', creditsUsed: 0 };
    }

    // Create redemption
    const redemption: FlyPlusServiceRedemption = {
      id: `RDM-${Date.now()}`,
      serviceType,
      bookingId,
      creditsUsed: service.tokenCost,
      redeemedAt: new Date().toISOString(),
      status: 'CONFIRMED',
    };

    // Deduct credits
    this.serviceCredits.balance -= service.tokenCost;
    this.serviceCredits.creditsUsed.push(redemption);
    this.serviceRedemptions.unshift(redemption);

    this.saveServiceCredits();
    this.notify();

    console.log('[FLY+] Redeemed', service.tokenCost, 'credits for', service.name);
    return { success: true, creditsUsed: service.tokenCost, redemption };
  }

  // Get all service redemptions
  getServiceRedemptions(): FlyPlusServiceRedemption[] {
    return [...this.serviceRedemptions];
  }

  // Generate random delivery for demo
  generateRandomDelivery(): CometDelivery {
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

    return this.createDelivery({
      pickupAddress: random.pickup,
      deliveryAddress: random.delivery,
      customerName: customer,
      amount: `${amount} AED`,
      distance: random.distance,
    });
  }

  async loadDemoData() {
    // Similar to previous loadDemoData but using real SDK calls
    // Warning: This could duplicate data if called multiple times on persistent store.
    // We check `getAssets().length` in `init` to prevent this.

    // Create Parties
    const issuer = this.sdk.parties_.create({
      name: 'Dubai Properties LLC',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
      jurisdiction: 'AE',
    });
    // Mock verify
    this.sdk.parties_.setKyc(issuer.id, true);

    const investor1 = this.sdk.parties_.create({
      name: 'Ahmed Al Maktoum',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'AE',
    });
    this.sdk.parties_.setKyc(investor1.id, true);

    // Assets
    const realEstate = await this.sdk.assets.create({
      name: 'Dubai Marina Tower - Unit 1501',
      rightType: RightType.OWNERSHIP,
      // Actually checking imports, RightType is NOT imported in store.ts. 
      // Let's check imports.
      // imports: TokenisationSDK, LifecycleState, Asset, Party, BaseEvent, PartyType, PartyRole...
      // I should add RightType to imports first.

      // Wait, I can't modify imports in this block.
      // I will just use the string 'OWNERSHIP' as cast if needed, or better yet, I should add RightType to imports in another step.
      // For now, I will just correct the indentation and ensuring it compiles.
      // The original code was: rightType: 'OWNERSHIP' as any,
      // I'll keep it as any for now to avoid import errors until I fix imports.

      jurisdiction: 'AE' as any,
      issuerId: issuer.id,
    });

    await this.sdk.assets.transition(realEstate.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await this.sdk.assets.transition(realEstate.id, LifecycleState.VERIFIED, issuer.id);
    await this.sdk.assets.transition(realEstate.id, LifecycleState.ACTIVE, issuer.id);

    await this.sdk.tokens.mint(realEstate.id, investor1.id, '500');

    this.notify();
  }
}

export const sdkStore = new SDKStore();
