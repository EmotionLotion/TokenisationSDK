/**
 * AssetContext - Context provider for generic asset operations
 *
 * This context provides:
 * - Asset fetching and caching
 * - Template-aware asset rendering
 * - Action execution with policy evaluation
 * - User portfolio management
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import type {
  AssetInstance,
  AssetTemplate,
  AssetFilter,
  ActionType,
  ActionRequest,
  ActionResult,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  Position,
  UserIdentity,
  TemplateType,
} from '../types';
import { templateRegistry, getTemplate } from '../templates/registry';
import { useTokenisation } from '../../context/TokenisationProvider';

// ============================================
// Context Types
// ============================================

export interface AssetContextValue {
  // Asset operations
  assets: AssetInstance[];
  selectedAsset: AssetInstance | null;
  isLoading: boolean;
  error: string | null;

  // Fetch operations
  fetchAssets: (filter?: AssetFilter) => Promise<void>;
  fetchAssetById: (id: string) => Promise<AssetInstance | null>;
  selectAsset: (id: string | null) => void;

  // Template operations
  templates: AssetTemplate[];
  getTemplateForAsset: (asset: AssetInstance) => AssetTemplate;

  // Action operations
  evaluateAction: (request: PolicyEvaluationRequest) => Promise<PolicyEvaluationResult>;
  executeAction: (request: ActionRequest) => Promise<ActionResult>;
  canPerformAction: (assetId: string, action: ActionType) => boolean;

  // Portfolio operations
  userPortfolio: Position[];
  fetchUserPortfolio: () => Promise<void>;
  getUserBalance: (assetId: string) => string;

  // User identity
  userIdentity: UserIdentity | null;
}

const AssetContext = createContext<AssetContextValue | null>(null);

// ============================================
// Provider Props
// ============================================

export interface AssetProviderProps {
  children: ReactNode;
  /** Initial assets to load (optional) */
  initialAssets?: AssetInstance[];
  /** Auto-fetch assets on mount */
  autoFetch?: boolean;
  /** Default filter for auto-fetch */
  defaultFilter?: AssetFilter;
  /** Callback when an asset is selected */
  onAssetSelect?: (asset: AssetInstance | null) => void;
  /** Callback on action completion */
  onActionComplete?: (action: ActionType, result: ActionResult) => void;
}

// ============================================
// Provider Component
// ============================================

export function AssetProvider({
  children,
  initialAssets = [],
  autoFetch = false,
  defaultFilter,
  onAssetSelect,
  onActionComplete,
}: AssetProviderProps) {
  const { api, user, isAuthenticated } = useTokenisation();

  // State
  const [assets, setAssets] = useState<AssetInstance[]>(initialAssets);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPortfolio, setUserPortfolio] = useState<Position[]>([]);
  const [userIdentity, setUserIdentity] = useState<UserIdentity | null>(null);

  // Templates
  const templates = useMemo(() => Object.values(templateRegistry), []);

  // Selected asset
  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  // Get template for asset
  const getTemplateForAsset = useCallback((asset: AssetInstance): AssetTemplate => {
    if (asset.template) return asset.template;
    const templateType = (asset.metadata.templateType as TemplateType) || 'custom';
    return getTemplate(templateType) || templateRegistry.custom;
  }, []);

  // Build query string from filter
  const buildQueryString = (filter?: AssetFilter): string => {
    if (!filter) return '';
    const params = new URLSearchParams();
    if (filter.type) params.append('type', filter.type);
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      statuses.forEach(s => params.append('status', s));
    }
    if (filter.jurisdiction) params.append('jurisdiction', filter.jurisdiction);
    if (filter.issuerId) params.append('issuerId', filter.issuerId);
    if (filter.search) params.append('search', filter.search);
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };

  // Fetch assets
  const fetchAssets = useCallback(
    async (filter?: AssetFilter) => {
      setIsLoading(true);
      setError(null);
      try {
        const queryString = buildQueryString(filter);
        const response = await api.get<{ assets: AssetInstance[] }>(`/v1/assets${queryString}`);
        const fetchedAssets = response.assets || [];
        // Attach templates to assets
        const assetsWithTemplates = fetchedAssets.map((asset) => ({
          ...asset,
          template: getTemplateForAsset(asset),
        }));
        setAssets(assetsWithTemplates);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch assets';
        setError(message);
        console.error('Failed to fetch assets:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [api, getTemplateForAsset]
  );

  // Fetch single asset
  const fetchAssetById = useCallback(
    async (id: string): Promise<AssetInstance | null> => {
      try {
        const response = await api.get<{ asset: AssetInstance }>(`/v1/assets/${id}`);
        const asset = response.asset;
        if (asset) {
          const assetWithTemplate = {
            ...asset,
            template: getTemplateForAsset(asset),
          };
          // Update in cache
          setAssets((prev) => {
            const exists = prev.find((a) => a.id === id);
            if (exists) {
              return prev.map((a) => (a.id === id ? assetWithTemplate : a));
            }
            return [...prev, assetWithTemplate];
          });
          return assetWithTemplate;
        }
        return null;
      } catch (err) {
        console.error('Failed to fetch asset:', err);
        return null;
      }
    },
    [api, getTemplateForAsset]
  );

  // Select asset
  const selectAsset = useCallback(
    (id: string | null) => {
      setSelectedAssetId(id);
      const asset = id ? assets.find((a) => a.id === id) || null : null;
      onAssetSelect?.(asset);
    },
    [assets, onAssetSelect]
  );

  // Evaluate action (dry-run)
  const evaluateAction = useCallback(
    async (request: PolicyEvaluationRequest): Promise<PolicyEvaluationResult> => {
      try {
        const response = await api.post<PolicyEvaluationResult>(
          '/v1/policies/evaluate',
          request
        );
        return response;
      } catch (err) {
        return {
          allowed: false,
          reasons: ['Failed to evaluate policy'],
          requirements: [],
        };
      }
    },
    [api]
  );

  // Execute action
  const executeAction = useCallback(
    async (request: ActionRequest): Promise<ActionResult> => {
      try {
        const response = await api.post<ActionResult>(
          `/v1/assets/${request.assetId}/actions/${request.action}`,
          request.params
        );
        onActionComplete?.(request.action, response);
        // Refresh asset after action
        await fetchAssetById(request.assetId);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Action failed';
        const result: ActionResult = {
          success: false,
          message,
        };
        onActionComplete?.(request.action, result);
        return result;
      }
    },
    [api, fetchAssetById, onActionComplete]
  );

  // Check if user can perform action
  const canPerformAction = useCallback(
    (assetId: string, action: ActionType): boolean => {
      if (!isAuthenticated || !userIdentity) return false;

      const asset = assets.find((a) => a.id === assetId);
      if (!asset) return false;

      const template = getTemplateForAsset(asset);
      if (!template.availableActions.includes(action)) return false;

      // Check user permissions
      const hasPermission = userIdentity.permissions.some(
        (p) =>
          p.action === action &&
          (p.assetId === assetId || p.assetId === undefined) &&
          (p.templateType === template.type || p.templateType === undefined)
      );

      return hasPermission;
    },
    [assets, getTemplateForAsset, isAuthenticated, userIdentity]
  );

  // Fetch user portfolio
  const fetchUserPortfolio = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const response = await api.get<{ positions: Position[] }>(
        `/v1/identities/${user.id}/portfolio`
      );
      setUserPortfolio(response.positions || []);
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    }
  }, [api, user, isAuthenticated]);

  // Get user balance for asset
  const getUserBalance = useCallback(
    (assetId: string): string => {
      const position = userPortfolio.find((p) => p.assetId === assetId);
      return position?.balance || '0';
    },
    [userPortfolio]
  );

  // Fetch user identity
  useEffect(() => {
    if (isAuthenticated && user) {
      api
        .get<{ identity: UserIdentity }>(`/v1/identities/${user.id}`)
        .then((response) => {
          setUserIdentity(response.identity || null);
        })
        .catch((err) => {
          console.error('Failed to fetch user identity:', err);
        });
    } else {
      setUserIdentity(null);
    }
  }, [api, user, isAuthenticated]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchAssets(defaultFilter);
    }
  }, [autoFetch, defaultFilter, fetchAssets]);

  // Fetch portfolio when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchUserPortfolio();
    }
  }, [isAuthenticated, fetchUserPortfolio]);

  const value: AssetContextValue = {
    assets,
    selectedAsset,
    isLoading,
    error,
    fetchAssets,
    fetchAssetById,
    selectAsset,
    templates,
    getTemplateForAsset,
    evaluateAction,
    executeAction,
    canPerformAction,
    userPortfolio,
    fetchUserPortfolio,
    getUserBalance,
    userIdentity,
  };

  return <AssetContext.Provider value={value}>{children}</AssetContext.Provider>;
}

// ============================================
// Hook
// ============================================

/**
 * Hook to access asset context (optional - returns null if no provider)
 */
export function useAssetsOptional(): AssetContextValue | null {
  return useContext(AssetContext);
}

/**
 * Hook to access asset context (throws if no provider)
 */
export function useAssets(): AssetContextValue {
  const context = useContext(AssetContext);
  if (!context) {
    throw new Error(
      'useAssets must be used within an AssetProvider. ' +
        'Wrap your component with <AssetProvider>...</AssetProvider>'
    );
  }
  return context;
}

/**
 * Hook to get a single asset by ID
 * Works both with and without AssetProvider
 */
export function useAsset(assetId: string | undefined) {
  const context = useAssetsOptional();
  const [asset, setAsset] = useState<AssetInstance | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!assetId || !context) {
      setAsset(null);
      return;
    }

    // Check cache first
    const cached = context.assets.find((a) => a.id === assetId);
    if (cached) {
      setAsset(cached);
      return;
    }

    // Fetch if not in cache
    setLoading(true);
    context.fetchAssetById(assetId)
      .then((result) => setAsset(result))
      .finally(() => setLoading(false));
  }, [assetId, context]);

  const template = asset && context ? context.getTemplateForAsset(asset) : null;

  return { asset, template, loading };
}

/**
 * Hook to get available actions for an asset
 * Works both with and without AssetProvider
 */
export function useAssetActions(assetId: string | undefined) {
  const context = useAssetsOptional();

  const asset = context?.assets.find((a) => a.id === assetId);
  const template = asset && context ? context.getTemplateForAsset(asset) : null;

  const availableActions = useMemo(() => {
    if (!template) return [];
    return template.availableActions;
  }, [template]);

  const checkAction = useCallback(
    async (action: ActionType) => {
      if (!assetId || !context) return { allowed: false, reasons: ['No asset selected'], requirements: [] };
      return context.evaluateAction({
        action,
        assetId,
        actorIdentityId: '', // Will be filled by backend
      });
    },
    [assetId, context]
  );

  return {
    availableActions,
    canPerformAction: (action: ActionType) => assetId && context ? context.canPerformAction(assetId, action) : false,
    checkAction,
  };
}
