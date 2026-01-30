/**
 * useAsset Hook - Asset Creation and Management
 *
 * Provides functionality for creating, fetching, and managing tokenized assets.
 *
 * @example
 * ```tsx
 * function CreateAssetForm() {
 *   const { createAsset, loading, error } = useAsset();
 *
 *   const handleSubmit = async (data: AssetFormData) => {
 *     const result = await createAsset(data);
 *     if (result.success) {
 *       console.log('Asset created:', result.asset);
 *     }
 *   };
 *
 *   return <form onSubmit={handleSubmit}>...</form>;
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '../context/TokenisationContext.js';
import type {
  AssetFormData,
  UploadedDocument,
  Asset,
  LifecycleState,
  PolicyDecision,
  DecisionReceipt,
} from '../types/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateAssetResult {
  success: boolean;
  asset?: Asset;
  decision?: PolicyDecision;
  receipt?: DecisionReceipt;
  error?: string;
}

export interface TransitionResult {
  success: boolean;
  newState?: LifecycleState;
  decision?: PolicyDecision;
  receipt?: DecisionReceipt;
  error?: string;
}

export interface UseAssetReturn {
  /** Create a new asset */
  createAsset: (data: AssetFormData) => Promise<CreateAssetResult>;

  /** Fetch asset by ID */
  getAsset: (assetId: string) => Promise<Asset | null>;

  /** List assets (optionally filtered) */
  listAssets: (filter?: AssetFilter) => Promise<Asset[]>;

  /** Transition asset to new state */
  transitionAsset: (assetId: string, toState: LifecycleState, evidence?: Evidence) => Promise<TransitionResult>;

  /** Upload document for asset */
  uploadDocument: (assetId: string, file: File, metadata: Partial<UploadedDocument['metadata']>) => Promise<UploadedDocument>;

  /** Get asset documents */
  getDocuments: (assetId: string) => Promise<UploadedDocument[]>;

  /** Current asset being worked on */
  currentAsset: Asset | null;

  /** Set current asset */
  setCurrentAsset: (asset: Asset | null) => void;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;
}

export interface AssetFilter {
  state?: LifecycleState;
  rightType?: string;
  jurisdiction?: string;
  ownerId?: string;
  limit?: number;
  offset?: number;
}

export interface Evidence {
  type: string;
  data: Record<string, unknown>;
  documents?: string[];
}

// ============================================================================
// HOOK
// ============================================================================

export function useAsset(): UseAssetReturn {
  const { config, wallet, currentParty, callbacks } = useTokenisation();

  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Helper for API calls
  const apiCall = useCallback(
    async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(config.orgId ? { 'X-Org-Id': config.orgId } : {}),
        ...(wallet?.address ? { 'X-Wallet-Address': wallet.address } : {}),
      };

      const response = await fetch(`${config.apiUrl}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options?.headers },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      return response.json();
    },
    [config, wallet]
  );

  // Create asset
  const createAsset = useCallback(
    async (data: AssetFormData): Promise<CreateAssetResult> => {
      setLoading(true);
      setError(null);

      try {
        if (!wallet?.address) {
          throw new Error('Wallet not connected');
        }

        if (!currentParty) {
          throw new Error('Please complete KYC before creating assets');
        }

        // Upload documents first
        const documentIds: string[] = [];
        for (const file of data.documents) {
          const doc = await uploadDocument('pending', file, {
            type: 'proof_of_ownership',
            description: `Document for ${data.name}`,
          });
          documentIds.push(doc.id);
        }

        // Create asset via API
        const result = await apiCall<{
          asset: Asset;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
        }>('/api/v1/assets', {
          method: 'POST',
          body: JSON.stringify({
            name: data.name,
            symbol: data.symbol,
            description: data.description,
            rightType: data.rightType,
            jurisdiction: data.jurisdiction,
            totalShares: data.totalShares,
            pricePerShare: data.pricePerShare,
            ownerId: currentParty.id,
            documents: documentIds,
            metadata: data.metadata,
          }),
        });

        setCurrentAsset(result.asset);

        return {
          success: true,
          asset: result.asset,
          decision: result.decision,
          receipt: result.receipt,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [config, wallet, currentParty, apiCall]
  );

  // Get asset by ID
  const getAsset = useCallback(
    async (assetId: string): Promise<Asset | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{ asset: Asset }>(`/api/v1/assets/${assetId}`);
        return result.asset;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  // List assets
  const listAssets = useCallback(
    async (filter?: AssetFilter): Promise<Asset[]> => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (filter?.state) params.set('state', filter.state);
        if (filter?.rightType) params.set('rightType', filter.rightType);
        if (filter?.jurisdiction) params.set('jurisdiction', filter.jurisdiction);
        if (filter?.ownerId) params.set('ownerId', filter.ownerId);
        if (filter?.limit) params.set('limit', String(filter.limit));
        if (filter?.offset) params.set('offset', String(filter.offset));

        const queryString = params.toString();
        const endpoint = `/api/v1/assets${queryString ? `?${queryString}` : ''}`;

        const result = await apiCall<{ assets: Asset[] }>(endpoint);
        return result.assets;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [apiCall]
  );

  // Transition asset state
  const transitionAsset = useCallback(
    async (assetId: string, toState: LifecycleState, evidence?: Evidence): Promise<TransitionResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiCall<{
          success: boolean;
          newState: LifecycleState;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
          error?: string;
        }>(`/api/v1/assets/${assetId}/transition`, {
          method: 'POST',
          body: JSON.stringify({
            toState,
            evidence,
            actorId: currentParty?.id,
          }),
        });

        if (result.success && currentAsset?.id === assetId) {
          const prevState = currentAsset.state;
          setCurrentAsset({ ...currentAsset, state: result.newState });

          // Fire onStatusUpdate callback
          callbacks?.onStatusUpdate?.({
            type: 'asset',
            entityId: assetId,
            previousStatus: prevState,
            newStatus: result.newState,
            timestamp: new Date().toISOString(),
          });
        }

        return {
          success: result.success,
          newState: result.newState,
          decision: result.decision,
          receipt: result.receipt,
          error: result.error,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return { success: false, error: error.message };
      } finally {
        setLoading(false);
      }
    },
    [apiCall, currentParty, currentAsset, callbacks]
  );

  // Upload document
  const uploadDocument = useCallback(
    async (
      assetId: string,
      file: File,
      metadata: Partial<UploadedDocument['metadata']>
    ): Promise<UploadedDocument> => {
      // Use custom upload handler if provided
      if (config.storage?.customUpload) {
        const storageUri = await config.storage.customUpload(file, {
          type: metadata.type || 'other',
          assetId,
          ...metadata,
        });

        // Register document with API
        const result = await apiCall<{ document: UploadedDocument }>('/api/v1/documents', {
          method: 'POST',
          body: JSON.stringify({
            assetId,
            filename: file.name,
            storageUri,
            mimeType: file.type,
            size: file.size,
            metadata,
          }),
        });

        return result.document;
      }

      // Default: upload to server
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetId', assetId);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await fetch(`${config.apiUrl}/api/v1/documents/upload`, {
        method: 'POST',
        headers: config.orgId ? { 'X-Org-Id': config.orgId } : {},
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Document upload failed');
      }

      const result = await response.json();
      return result.document;
    },
    [config, apiCall]
  );

  // Get documents for asset
  const getDocuments = useCallback(
    async (assetId: string): Promise<UploadedDocument[]> => {
      const result = await apiCall<{ documents: UploadedDocument[] }>(
        `/api/v1/documents?assetId=${assetId}`
      );
      return result.documents;
    },
    [apiCall]
  );

  return {
    createAsset,
    getAsset,
    listAssets,
    transitionAsset,
    uploadDocument,
    getDocuments,
    currentAsset,
    setCurrentAsset,
    loading,
    error,
  };
}
