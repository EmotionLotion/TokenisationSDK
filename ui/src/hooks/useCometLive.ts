/**
 * useCometLive Hook
 *
 * Connects the UI to the live COMET mock server.
 * Provides real-time driver data, safety scores, and event simulation.
 */

import { useState, useEffect, useCallback } from 'react';
import { cometApi, type CometApiDriver, type CometSafetyScore } from '../services/cometApi';
import { sdkStore } from '../store';

export interface LiveDriver extends CometApiDriver {
  safetyScore: CometSafetyScore | null;
  isOnline: boolean;
}

export interface UseCometLiveReturn {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Data
  drivers: LiveDriver[];
  penalties: Record<string, number> | null;

  // Actions
  refreshDrivers: () => Promise<void>;
  refreshScore: (driverId: string) => Promise<CometSafetyScore | null>;
  simulateDelivery: (driverId: string, rating?: number) => Promise<void>;
  simulateSafetyEvent: (driverId: string, eventType: string) => Promise<void>;

  // Sync to store
  syncToStore: () => void;
}

export function useCometLive(autoConnect: boolean = true): UseCometLiveReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<LiveDriver[]>([]);
  const [penalties, setPenalties] = useState<Record<string, number> | null>(null);

  // Check connection and load initial data
  useEffect(() => {
    if (!autoConnect) return;

    const connect = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const healthy = await cometApi.checkHealth();
        if (!healthy) {
          throw new Error('COMET server not available');
        }

        setIsConnected(true);

        // Load initial data
        const [apiDrivers, apiPenalties] = await Promise.all([
          cometApi.getDrivers(),
          cometApi.getSafetyPenalties(),
        ]);

        // Get safety scores for each driver
        const driversWithScores = await Promise.all(
          apiDrivers.map(async (driver) => {
            try {
              const score = await cometApi.getDriverSafetyScore(driver.id);
              return {
                ...driver,
                safetyScore: score,
                isOnline: driver.status !== 'INACTIVE',
              };
            } catch {
              return {
                ...driver,
                safetyScore: null,
                isOnline: driver.status !== 'INACTIVE',
              };
            }
          })
        );

        setDrivers(driversWithScores);
        setPenalties(apiPenalties);

        console.log('✅ Connected to COMET server');
        console.log(`   ${driversWithScores.length} drivers loaded`);

      } catch (e) {
        const message = e instanceof Error ? e.message : 'Connection failed';
        setError(message);
        setIsConnected(false);
        console.warn('⚠️ COMET server not available, using local data');
      } finally {
        setIsLoading(false);
      }
    };

    connect();

    // Start polling for updates
    cometApi.startPolling(5000);

    return () => {
      cometApi.stopPolling();
    };
  }, [autoConnect]);

  // Refresh all drivers
  const refreshDrivers = useCallback(async () => {
    if (!isConnected) return;

    try {
      const apiDrivers = await cometApi.getDrivers();
      const driversWithScores = await Promise.all(
        apiDrivers.map(async (driver) => {
          try {
            const score = await cometApi.getDriverSafetyScore(driver.id);
            return { ...driver, safetyScore: score, isOnline: driver.status !== 'INACTIVE' };
          } catch {
            return { ...driver, safetyScore: null, isOnline: driver.status !== 'INACTIVE' };
          }
        })
      );
      setDrivers(driversWithScores);
    } catch (e) {
      console.error('Failed to refresh drivers:', e);
    }
  }, [isConnected]);

  // Refresh single driver's score
  const refreshScore = useCallback(async (driverId: string): Promise<CometSafetyScore | null> => {
    if (!isConnected) return null;

    try {
      const score = await cometApi.getDriverSafetyScore(driverId);

      setDrivers(prev => prev.map(d =>
        d.id === driverId ? { ...d, safetyScore: score } : d
      ));

      return score;
    } catch (e) {
      console.error('Failed to refresh score:', e);
      return null;
    }
  }, [isConnected]);

  // Simulate delivery completion
  const simulateDelivery = useCallback(async (driverId: string, rating: number = 5) => {
    if (!isConnected) return;

    try {
      const result = await cometApi.simulateDeliveryComplete(driverId, rating);
      console.log('📦 Delivery completed:', result.delivery.id);

      // Refresh the driver's data
      await refreshScore(driverId);
      await refreshDrivers();

      // Also update the local store
      sdkStore.simulateAhoyAction('DELIVERY_COMPLETE', 'COMET');

    } catch (e) {
      console.error('Failed to simulate delivery:', e);
    }
  }, [isConnected, refreshScore, refreshDrivers]);

  // Simulate safety event
  const simulateSafetyEvent = useCallback(async (driverId: string, eventType: string) => {
    if (!isConnected) return;

    try {
      await cometApi.simulateSafetyEvent(driverId, eventType);
      console.log(`⚠️ Safety event: ${eventType} for ${driverId}`);

      // Refresh the driver's score
      await refreshScore(driverId);

    } catch (e) {
      console.error('Failed to simulate safety event:', e);
    }
  }, [isConnected, refreshScore]);

  // Sync COMET data to the local store
  const syncToStore = useCallback(() => {
    if (drivers.length === 0) return;

    for (const driver of drivers) {
      const storeDriver = cometApi.transformDriverForStore(driver, driver.safetyScore || undefined);

      // Update store's driver list (this would need store modification)
      console.log('Syncing driver to store:', storeDriver.name, storeDriver.safetyScore);
    }

    sdkStore.notify(); // Trigger store update
  }, [drivers]);

  return {
    isConnected,
    isLoading,
    error,
    drivers,
    penalties,
    refreshDrivers,
    refreshScore,
    simulateDelivery,
    simulateSafetyEvent,
    syncToStore,
  };
}

export default useCometLive;
