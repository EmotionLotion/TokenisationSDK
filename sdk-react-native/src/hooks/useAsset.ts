/**
 * useAsset Hook
 *
 * Hook for fetching and managing individual tokenized assets in React Native.
 * Provides asset details, investment status, and actions.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTokenisation } from '../context/TokenisationProvider.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Asset lifecycle state
 */
export type AssetState =
  | 'draft'
  | 'pending_verification'
  | 'verified'
  | 'active'
  | 'frozen'
  | 'redeemed'
  | 'expired'
  | 'burned';

/**
 * Asset type
 */
export type AssetType =
  | 'real_estate'
  | 'private_equity'
  | 'bond'
  | 'fund'
  | 'collectible'
  | 'commodity'
  | 'other';

/**
 * Asset details
 */
export interface Asset {
  id: string;
  name: string;
  description: string;
  type: AssetType;
  state: AssetState;

  // Financial details
  totalValue: string;
  currency: string;
  tokenPrice: string;
  tokenSymbol: string;
  totalSupply: string;
  availableSupply: string;

  // Investment terms
  minimumInvestment: string;
  maximumInvestment?: string;
  expectedReturn?: string;
  investmentPeriod?: string;

  // Compliance
  jurisdiction: string;
  accreditedOnly: boolean;
  kycRequired: boolean;
  requiredKycLevel: string;

  // Dates
  createdAt: string;
  updatedAt: string;
  offeringStartDate?: string;
  offeringEndDate?: string;
  maturityDate?: string;

  // Media
  imageUrl?: string;
  documents?: AssetDocument[];

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Asset document
 */
export interface AssetDocument {
  id: string;
  name: string;
  type: 'prospectus' | 'term_sheet' | 'legal' | 'marketing' | 'other';
  url: string;
  uploadedAt: string;
}

/**
 * User's investment in the asset
 */
export interface UserInvestment {
  investmentId: string;
  amount: string;
  tokenAmount: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  investedAt: string;
  transactionHash?: string;
}

/**
 * Investment request
 */
export interface InvestmentRequest {
  amount: string;
  currency?: string;
  walletAddress?: string;
}

/**
 * Investment result
 */
export interface InvestmentResult {
  investmentId: string;
  assetId: string;
  amount: string;
  tokenAmount: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transactionHash?: string;
  error?: string;
}

/**
 * Hook options
 */
export interface UseAssetOptions {
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Include user's investment status */
  includeInvestment?: boolean;
}

/**
 * Return type for useAsset hook
 */
export interface UseAssetReturn {
  // State
  asset: Asset | null;
  investment: UserInvestment | null;
  isLoading: boolean;
  error: Error | null;

  // Actions
  refresh: () => Promise<void>;
  invest: (request: InvestmentRequest) => Promise<InvestmentResult>;

  // Computed
  canInvest: boolean;
  isInvested: boolean;
  remainingSupply: string;
  percentFunded: number;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for managing a single asset
 *
 * @example
 * ```tsx
 * function AssetDetailScreen({ assetId }: { assetId: string }) {
 *   const {
 *     asset,
 *     investment,
 *     isLoading,
 *     canInvest,
 *     invest,
 *   } = useAsset(assetId);
 *
 *   if (isLoading) return <ActivityIndicator />;
 *   if (!asset) return <Text>Asset not found</Text>;
 *
 *   const handleInvest = async () => {
 *     const result = await invest({ amount: '1000' });
 *     if (result.status === 'completed') {
 *       Alert.alert('Success', 'Investment completed!');
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Text>{asset.name}</Text>
 *       <Text>Price: {asset.tokenPrice} {asset.currency}</Text>
 *       {canInvest && (
 *         <Button onPress={handleInvest} title="Invest Now" />
 *       )}
 *       {investment && (
 *         <Text>Your investment: {investment.amount}</Text>
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function useAsset(
  assetId: string,
  options: UseAssetOptions = {}
): UseAssetReturn {
  const { refreshInterval = 0, includeInvestment = true } = options;

  const { client, wallet, user, config } = useTokenisation();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [investment, setInvestment] = useState<UserInvestment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch asset data
  const fetchAsset = useCallback(async () => {
    if (!client || !assetId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // In a real implementation:
      // const assetData = await client.assets.get(assetId);
      // const investmentData = includeInvestment && wallet.address
      //   ? await client.investments.getByAsset(assetId, wallet.address)
      //   : null;

      // Mock data
      const mockAsset: Asset = {
        id: assetId,
        name: 'Example Property Fund',
        description: 'A diversified real estate investment fund',
        type: 'real_estate',
        state: 'active',
        totalValue: '10000000',
        currency: 'USD',
        tokenPrice: '100',
        tokenSymbol: 'EPF',
        totalSupply: '100000',
        availableSupply: '75000',
        minimumInvestment: '1000',
        maximumInvestment: '100000',
        expectedReturn: '8-12%',
        investmentPeriod: '5 years',
        jurisdiction: 'US',
        accreditedOnly: false,
        kycRequired: true,
        requiredKycLevel: 'standard',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        offeringStartDate: new Date().toISOString(),
      };

      setAsset(mockAsset);

      // Mock investment if connected
      if (includeInvestment && wallet.address) {
        // 50% chance of having an existing investment (for demo)
        if (Math.random() > 0.5) {
          setInvestment({
            investmentId: `inv_${assetId}_${wallet.address.slice(2, 10)}`,
            amount: '5000',
            tokenAmount: '50',
            status: 'completed',
            investedAt: new Date().toISOString(),
          });
        } else {
          setInvestment(null);
        }
      }

      if (config.debug) {
        console.log('[Tokenisation] Fetched asset:', assetId);
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Failed to fetch asset');
      setError(fetchError);

      if (config.debug) {
        console.error('[Tokenisation] Asset fetch error:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, assetId, wallet.address, includeInvestment, config.debug]);

  // Initial fetch
  useEffect(() => {
    fetchAsset();
  }, [fetchAsset]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(fetchAsset, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval, fetchAsset]);

  // Invest in the asset
  const invest = useCallback(async (request: InvestmentRequest): Promise<InvestmentResult> => {
    if (!client || !wallet.isConnected || !wallet.address) {
      throw new Error('Wallet not connected');
    }

    if (!asset) {
      throw new Error('Asset not loaded');
    }

    try {
      if (config.debug) {
        console.log('[Tokenisation] Investing in asset:', assetId, request);
      }

      // Validate investment amount
      const amount = parseFloat(request.amount);
      const minInvestment = parseFloat(asset.minimumInvestment);
      const maxInvestment = asset.maximumInvestment ? parseFloat(asset.maximumInvestment) : Infinity;

      if (amount < minInvestment) {
        throw new Error(`Minimum investment is ${asset.minimumInvestment} ${asset.currency}`);
      }

      if (amount > maxInvestment) {
        throw new Error(`Maximum investment is ${asset.maximumInvestment} ${asset.currency}`);
      }

      // In a real implementation:
      // const result = await client.investments.create({
      //   assetId,
      //   amount: request.amount,
      //   currency: request.currency || asset.currency,
      //   walletAddress: request.walletAddress || wallet.address,
      // });

      // Mock implementation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const tokenAmount = (amount / parseFloat(asset.tokenPrice)).toFixed(4);

      const result: InvestmentResult = {
        investmentId: `inv_${Date.now()}`,
        assetId,
        amount: request.amount,
        tokenAmount,
        status: 'pending',
      };

      // Update local investment state
      setInvestment({
        investmentId: result.investmentId,
        amount: result.amount,
        tokenAmount: result.tokenAmount,
        status: 'pending',
        investedAt: new Date().toISOString(),
      });

      return result;
    } catch (err) {
      const investError = err instanceof Error ? err.message : 'Investment failed';
      return {
        investmentId: '',
        assetId,
        amount: request.amount,
        tokenAmount: '0',
        status: 'failed',
        error: investError,
      };
    }
  }, [client, wallet.isConnected, wallet.address, asset, assetId, config.debug]);

  // Can invest (computed)
  const canInvest = useMemo(() => {
    if (!asset || !wallet.isConnected) return false;
    if (asset.state !== 'active') return false;
    if (parseFloat(asset.availableSupply) <= 0) return false;
    if (asset.kycRequired && user.kycStatus !== 'approved') return false;
    return true;
  }, [asset, wallet.isConnected, user.kycStatus]);

  // Is invested (computed)
  const isInvested = useMemo(() => {
    return !!investment && investment.status === 'completed';
  }, [investment]);

  // Remaining supply (computed)
  const remainingSupply = useMemo(() => {
    return asset?.availableSupply || '0';
  }, [asset?.availableSupply]);

  // Percent funded (computed)
  const percentFunded = useMemo(() => {
    if (!asset) return 0;
    const total = parseFloat(asset.totalSupply);
    const available = parseFloat(asset.availableSupply);
    if (total <= 0) return 100;
    return Math.round(((total - available) / total) * 100);
  }, [asset?.totalSupply, asset?.availableSupply]);

  return {
    // State
    asset,
    investment,
    isLoading,
    error,

    // Actions
    refresh: fetchAsset,
    invest,

    // Computed
    canInvest,
    isInvested,
    remainingSupply,
    percentFunded,
  };
}

export default useAsset;
