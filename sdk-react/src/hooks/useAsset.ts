/**
 * useAsset Hook - Asset Creation and Management
 *
 * Provides functionality for creating, fetching, and managing tokenized assets.
 * Uses the shared BrowserHttpClient (`api`) from TokenisationContext instead of
 * raw fetch() calls. FormData uploads still use fetch directly since
 * BrowserHttpClient only handles JSON payloads.
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
  const { api, config, wallet, currentParty, callbacks } = useTokenisation();

  const [currentAsset, setCurrentAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

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
        const response = await api.post<{
          asset: Asset;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
        }>('/api/v1/assets', {
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
        });

        const result = response.data;
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
    [api, config, wallet, currentParty]
  );

  // Get asset by ID
  const getAsset = useCallback(
    async (assetId: string): Promise<Asset | null> => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get<{ asset: Asset }>(`/api/v1/assets/${assetId}`);
        return response.data.asset;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // List assets
  const listAssets = useCallback(
    async (filter?: AssetFilter): Promise<Asset[]> => {
      setLoading(true);
      setError(null);

      try {
        const query: Record<string, string> = {};
        if (filter?.state) query.state = filter.state;
        if (filter?.rightType) query.rightType = filter.rightType;
        if (filter?.jurisdiction) query.jurisdiction = filter.jurisdiction;
        if (filter?.ownerId) query.ownerId = filter.ownerId;
        if (filter?.limit) query.limit = String(filter.limit);
        if (filter?.offset) query.offset = String(filter.offset);

        const response = await api.get<{ assets: Asset[] }>('/api/v1/assets', query);
        return response.data.assets;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  // Transition asset state
  const transitionAsset = useCallback(
    async (assetId: string, toState: LifecycleState, evidence?: Evidence): Promise<TransitionResult> => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.post<{
          success: boolean;
          newState: LifecycleState;
          decision?: PolicyDecision;
          receipt?: DecisionReceipt;
          error?: string;
        }>(`/api/v1/assets/${assetId}/transition`, {
          toState,
          evidence,
          actorId: currentParty?.id,
        });

        const result = response.data;

        if (result.success && currentAsset?.id === assetId) {
          const prevState = currentAsset.state;
          setCurrentAsset({ ...currentAsset, state: result.newState as unknown as Asset['state'] });

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
    [api, currentParty, currentAsset, callbacks]
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
        const response = await api.post<{ document: UploadedDocument }>('/api/v1/documents', {
          assetId,
          filename: file.name,
          storageUri,
          mimeType: file.type,
          size: file.size,
          metadata,
        });

        return response.data.document;
      }

      // Default: upload to server using raw fetch (FormData not supported by BrowserHttpClient)
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
    [api, config]
  );

  // Get documents for asset
  const getDocuments = useCallback(
    async (assetId: string): Promise<UploadedDocument[]> => {
      const response = await api.get<{ documents: UploadedDocument[] }>(
        '/api/v1/documents',
        { assetId }
      );
      return response.data.documents;
    },
    [api]
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
