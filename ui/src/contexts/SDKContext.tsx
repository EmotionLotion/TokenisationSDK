/**
 * SDK Context - React Provider for TokenisationSDK
 *
 * Wraps the app with SDK instance and provides hooks for accessing SDK functionality.
 * Integrates with the existing sdkStore for backward compatibility.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { sdkStore } from '../store';
import { LifecycleState, type Asset, type Party } from '@tokenisation/sdk';

// ============================================================================
// TYPES
// ============================================================================

interface AssetMetrics {
  totalAssets: number;
  activeAssets: number;
  pendingAssets: number;
  draftAssets: number;
  totalValue: string;
}

interface SDKContextValue {
  // Core SDK access
  sdk: typeof sdkStore.sdk;
  isInitialized: boolean;

  // Asset operations
  assets: Asset[];
  getAsset: (id: string) => Asset | null;
  createAsset: (params: any) => Promise<Asset>;
  transitionAsset: (assetId: string, toState: LifecycleState, actorId: string) => Promise<{ success: boolean; error?: string }>;
  refreshAssets: () => void;

  // Party operations
  parties: Party[];
  getParty: (id: string) => Party | undefined;
  createParty: (params: any) => Promise<Party>;

  // Metrics
  getAssetMetrics: (serviceId?: string) => AssetMetrics;
  getServiceMetrics: (serviceId: string) => ServiceMetrics;

  // Events/History
  recentEvents: any[];
  sdkLogs: any[];

  // Ahoy ecosystem
  ahoyState: ReturnType<typeof sdkStore.getAhoyState>;
  simulateAhoyAction: typeof sdkStore.simulateAhoyAction;
}

interface ServiceMetrics {
  activeUsers: number;
  totalTransactions: number;
  dailyVolume: string;
  growthPercent: number;
}

// ============================================================================
// CONTEXT
// ============================================================================

const SDKContext = createContext<SDKContextValue | null>(null);

// ============================================================================
// PROVIDER
// ============================================================================

interface SDKProviderProps {
  children: ReactNode;
}

// Cache for useSyncExternalStore snapshot
let cachedSnapshot: {
  assets: Asset[];
  parties: Party[];
  ahoyState: ReturnType<typeof sdkStore.getAhoyState>;
  sdkLogs: any[];
} | null = null;

let cachedVersion = 0;
let currentVersion = 0;

function getSnapshot() {
  const newVersion = sdkStore.getVersion?.() ?? Date.now();
  if (cachedSnapshot === null || newVersion !== cachedVersion) {
    cachedVersion = newVersion;
    cachedSnapshot = {
      assets: sdkStore.getAssets(),
      parties: sdkStore.getParties(),
      ahoyState: sdkStore.getAhoyState(),
      sdkLogs: sdkStore.getSdkLogs(),
    };
  }
  return cachedSnapshot;
}

function getServerSnapshot() {
  return {
    assets: [] as Asset[],
    parties: [] as Party[],
    ahoyState: sdkStore.getAhoyState(),
    sdkLogs: [] as any[],
  };
}

export function SDKProvider({ children }: SDKProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);

  // Subscribe to store changes using useSyncExternalStore for proper React 18 support
  const storeState = useSyncExternalStore(
    sdkStore.subscribe.bind(sdkStore),
    getSnapshot,
    getServerSnapshot
  );

  // Initialize SDK
  useEffect(() => {
    const init = async () => {
      try {
        // Store auto-initializes, but we track when it's ready
        await sdkStore.sdk.engine.hydrate();
        setIsInitialized(true);
      } catch (error) {
        console.error('[SDKProvider] Initialization error:', error);
        setIsInitialized(true); // Still mark as initialized to unblock UI
      }
    };

    init();
  }, []);

  // Asset operations
  const getAsset = useCallback((id: string): Asset | null => {
    return sdkStore.getAsset(id);
  }, []);

  const createAsset = useCallback(async (params: any): Promise<Asset> => {
    sdkStore.logSdkCall('assets.create', params);
    return sdkStore.createAsset(params);
  }, []);

  const transitionAsset = useCallback(async (
    assetId: string,
    toState: LifecycleState,
    actorId: string
  ) => {
    sdkStore.logSdkCall('assets.transition', { assetId, toState, actorId });
    return sdkStore.transition(assetId, toState, actorId);
  }, []);

  const refreshAssets = useCallback(() => {
    // Force a re-render by triggering store notification
    // The store already handles this internally
  }, []);

  // Party operations
  const getParty = useCallback((id: string): Party | undefined => {
    return sdkStore.getParty(id);
  }, []);

  const createParty = useCallback(async (params: any): Promise<Party> => {
    sdkStore.logSdkCall('parties.create', params);
    return sdkStore.createParty(params);
  }, []);

  // Metrics calculations
  const getAssetMetrics = useCallback((serviceId?: string): AssetMetrics => {
    let assets = storeState.assets;

    // Filter by service if provided
    if (serviceId) {
      assets = assets.filter(a =>
        a.metadata?.serviceId === serviceId ||
        a.metadata?.vertical === serviceId ||
        a.metadata?.source === serviceId
      );
    }

    const activeAssets = assets.filter(a => a.state === LifecycleState.ACTIVE);
    const pendingAssets = assets.filter(a =>
      a.state === LifecycleState.PENDING_VERIFICATION ||
      a.state === LifecycleState.VERIFIED
    );
    const draftAssets = assets.filter(a => a.state === LifecycleState.DRAFT);

    const totalValue = assets.reduce((sum, a) => {
      const value = parseFloat(a.metadata?.value as string || '0');
      return sum + value;
    }, 0);

    return {
      totalAssets: assets.length,
      activeAssets: activeAssets.length,
      pendingAssets: pendingAssets.length,
      draftAssets: draftAssets.length,
      totalValue: totalValue.toLocaleString(),
    };
  }, [storeState.assets]);

  const getServiceMetrics = useCallback((serviceId: string): ServiceMetrics => {
    // Service-specific metrics (simulated for now, will be replaced with real SDK calls)
    const metricsMap: Record<string, ServiceMetrics> = {
      comet: { activeUsers: 2847, totalTransactions: 15432, dailyVolume: '1.2M', growthPercent: 12 },
      flyplus: { activeUsers: 45230, totalTransactions: 12847, dailyVolume: '890K', growthPercent: 8 },
      h2o: { activeUsers: 8432, totalTransactions: 5621, dailyVolume: '456K', growthPercent: 23 },
      ams: { activeUsers: 234, totalTransactions: 89200, dailyVolume: '2.1M', growthPercent: 15 },
      trouve: { activeUsers: 412, totalTransactions: 3200, dailyVolume: '340K', growthPercent: 18 },
      connect: { activeUsers: 142, totalTransactions: 8900, dailyVolume: '452K', growthPercent: 12 },
      equity: { activeUsers: 28, totalTransactions: 156, dailyVolume: '12M', growthPercent: 5 },
    };

    return metricsMap[serviceId.toLowerCase()] || {
      activeUsers: 0,
      totalTransactions: 0,
      dailyVolume: '0',
      growthPercent: 0,
    };
  }, []);

  // Ahoy ecosystem
  const simulateAhoyAction = useCallback(
    sdkStore.simulateAhoyAction.bind(sdkStore),
    []
  );

  const value: SDKContextValue = {
    sdk: sdkStore.sdk,
    isInitialized,
    assets: storeState.assets,
    getAsset,
    createAsset,
    transitionAsset,
    refreshAssets,
    parties: storeState.parties,
    getParty,
    createParty,
    getAssetMetrics,
    getServiceMetrics,
    recentEvents: [], // Will be populated from event store
    sdkLogs: storeState.sdkLogs,
    ahoyState: storeState.ahoyState,
    simulateAhoyAction,
  };

  return <SDKContext.Provider value={value}>{children}</SDKContext.Provider>;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Main hook to access SDK context
 */
export function useSDK(): SDKContextValue {
  const context = useContext(SDKContext);
  if (!context) {
    throw new Error('useSDK must be used within an SDKProvider');
  }
  return context;
}

/**
 * Hook to get raw SDK instance
 */
export function useSDKInstance() {
  const { sdk } = useSDK();
  return sdk;
}

/**
 * Hook to get all assets
 */
export function useAssets() {
  const { assets, refreshAssets, createAsset, transitionAsset } = useSDK();
  return { assets, refreshAssets, createAsset, transitionAsset };
}

/**
 * Hook to get a single asset by ID
 */
export function useAsset(assetId: string) {
  const { getAsset } = useSDK();
  const [asset, setAsset] = useState<Asset | null>(null);

  useEffect(() => {
    setAsset(getAsset(assetId));
  }, [assetId, getAsset]);

  return asset;
}

/**
 * Hook to get all parties
 */
export function useParties() {
  const { parties, createParty, getParty } = useSDK();
  return { parties, createParty, getParty };
}

/**
 * Hook to get global asset metrics
 */
export function useAssetMetrics(serviceId?: string): AssetMetrics {
  const { getAssetMetrics } = useSDK();
  return getAssetMetrics(serviceId);
}

/**
 * Hook to get service-specific metrics
 */
export function useServiceMetrics(serviceId: string): ServiceMetrics {
  const { getServiceMetrics } = useSDK();
  return getServiceMetrics(serviceId);
}

/**
 * Hook to get SDK logs for the insight panel
 */
export function useSDKLogs() {
  const { sdkLogs } = useSDK();
  return sdkLogs;
}

/**
 * Hook to get Ahoy ecosystem state
 */
export function useAhoyState() {
  const { ahoyState, simulateAhoyAction } = useSDK();
  return { ahoyState, simulateAhoyAction };
}

/**
 * Hook to get recent events/transaction feed
 */
export function useTransactionFeed() {
  const { recentEvents, ahoyState } = useSDK();
  // Combine SDK events with Ahoy transactions for a unified feed
  return {
    events: recentEvents,
    transactions: ahoyState.transactions,
  };
}
