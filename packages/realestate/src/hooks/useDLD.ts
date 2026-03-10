/**
 * useDLD - Hook for Dubai Land Department operations
 *
 * Provides comprehensive DLD integration for real estate tokenization:
 * - Title deed registration and verification
 * - On-chain verification via Chainlink
 * - Sync job management
 * - Event ingestion and processing
 * - Title clearance checks
 *
 * @example
 * ```tsx
 * function PropertyVerification({ assetId }: { assetId: string }) {
 *   const {
 *     registerTitle,
 *     verifyTitle,
 *     checkTitleClear,
 *     loading,
 *     error
 *   } = useDLD();
 *
 *   const handleRegister = async () => {
 *     const title = await registerTitle({
 *       projectId: assetId,
 *       dldTitleNumber: 'DLD-2024-12345',
 *       propertyType: 'unit',
 *       emirate: 'dubai',
 *       area: 'Dubai Marina',
 *     });
 *     console.log('Title registered:', title.id);
 *   };
 *
 *   return <Button onClick={handleRegister} loading={loading}>Register Title</Button>;
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { useTokenisation } from '@tokenisation/sdk-react';

// ============================================================================
// Types
// ============================================================================

export type TitleStatus = 'pending' | 'verified' | 'disputed' | 'expired';
export type PropertyType = 'land' | 'building' | 'unit';
export type SyncJobType = 'poll' | 'reconcile' | 'manual';
export type SyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type DLDEventType =
  | 'title_registered'
  | 'title_transferred'
  | 'lien_added'
  | 'lien_removed'
  | 'dispute_filed'
  | 'dispute_resolved'
  | 'valuation_updated'
  | 'ownership_changed'
  | 'encumbrance_added'
  | 'encumbrance_removed';

export interface TitleDeedData {
  id: string;
  orgId: string;
  assetId: string | null;
  externalTitleDeedId: string;
  status: TitleStatus;
  propertyType: PropertyType;
  location: {
    emirate: string;
    community?: string;
    plotNumber?: string;
    building?: string;
    unit?: string;
  };
  snapshot: Record<string, unknown>;
  flags: string[];
  verifiedAt: string | null;
  verifiedBy: string | null;
  lastSyncAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterTitleInput {
  projectId: string;
  dldTitleNumber: string;
  propertyType: PropertyType;
  emirate?: string;
  area?: string;
  plotNumber?: string;
  buildingName?: string;
  unitNumber?: string;
  propertyDetails?: Record<string, unknown>;
}

export interface UpdateTitleInput {
  status?: TitleStatus;
  propertyDetails?: Record<string, unknown>;
}

export interface DLDEvent {
  id: string;
  orgId: string;
  titleDeedId: string;
  externalEventId: string;
  type: DLDEventType;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt: string | null;
  error: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface IngestEventInput {
  dldTitleId: string;
  eventType: DLDEventType;
  eventData: Record<string, unknown>;
  dldEventId?: string;
  occurredAt?: string;
}

export interface SyncJob {
  id: string;
  orgId: string;
  jobType: SyncJobType;
  status: SyncJobStatus;
  config: Record<string, unknown>;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSyncJobInput {
  jobType: SyncJobType;
  config?: {
    assetId?: string;
    dldTitleId?: string;
    [key: string]: unknown;
  };
}

export interface TitleClearCheck {
  titleId: string;
  isClear: boolean;
  issues: Array<{
    type: 'lien' | 'dispute' | 'encumbrance' | 'expired';
    description: string;
    severity: 'warning' | 'blocking';
  }>;
  checkedAt: string;
}

export interface OnChainVerificationResult {
  titleId: string;
  txHash: string;
  verified: boolean;
  verificationData: Record<string, unknown>;
  timestamp: string;
}

export interface TitleFilters {
  projectId?: string;
  status?: TitleStatus;
  limit?: number;
  offset?: number;
}

export interface EventFilters {
  titleId?: string;
  eventType?: DLDEventType;
  processed?: boolean;
  limit?: number;
  offset?: number;
}

export interface SyncJobFilters {
  status?: SyncJobStatus;
  jobType?: SyncJobType;
  limit?: number;
  offset?: number;
}

export interface UseDLDReturn {
  // Title operations
  registerTitle: (input: RegisterTitleInput) => Promise<TitleDeedData>;
  getTitle: (titleId: string) => Promise<TitleDeedData>;
  listTitles: (filters?: TitleFilters) => Promise<TitleDeedData[]>;
  updateTitle: (titleId: string, updates: UpdateTitleInput) => Promise<TitleDeedData>;
  verifyTitle: (titleId: string, verifiedBy?: string) => Promise<TitleDeedData>;
  verifyTitleOnChain: (titleId: string) => Promise<OnChainVerificationResult>;
  lookupByDldNumber: (dldTitleNumber: string) => Promise<TitleDeedData>;
  checkTitleClear: (titleId: string) => Promise<TitleClearCheck>;

  // Event operations
  ingestEvent: (input: IngestEventInput) => Promise<DLDEvent>;
  listEvents: (filters?: EventFilters) => Promise<DLDEvent[]>;
  getTitleEvents: (titleId: string, options?: { limit?: number; offset?: number }) => Promise<DLDEvent[]>;
  processEvent: (eventId: string) => Promise<DLDEvent>;

  // Sync job operations
  createSyncJob: (input: CreateSyncJobInput) => Promise<SyncJob>;
  listSyncJobs: (filters?: SyncJobFilters) => Promise<SyncJob[]>;
  executeSyncJob: (jobId: string) => Promise<SyncJob>;

  // State
  loading: boolean;
  error: Error | null;
  clearError: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useDLD(): UseDLDReturn {
  const { api } = useTokenisation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const wrapAsync = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      setLoading(true);
      setError(null);
      try {
        return await fn();
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ============================================================================
  // Title Operations
  // ============================================================================

  const registerTitle = useCallback(
    (input: RegisterTitleInput) =>
      wrapAsync(async () => {
        const response = await api.post<TitleDeedData>('/api/v1/dld/titles', input);
        return response.data;
      }),
    [api, wrapAsync]
  );

  const getTitle = useCallback(
    (titleId: string) =>
      wrapAsync(async () => {
        const response = await api.get<TitleDeedData>(`/api/v1/dld/titles/${titleId}`);
        return response.data;
      }),
    [api, wrapAsync]
  );

  const listTitles = useCallback(
    (filters?: TitleFilters) =>
      wrapAsync(async () => {
        const query: Record<string, string> = {};
        if (filters?.projectId) query.projectId = filters.projectId;
        if (filters?.status) query.status = filters.status;
        if (filters?.limit) query.limit = String(filters.limit);
        if (filters?.offset) query.offset = String(filters.offset);

        const response = await api.get<{ data: TitleDeedData[]; count: number }>(
          '/api/v1/dld/titles',
          query
        );
        return response.data.data;
      }),
    [api, wrapAsync]
  );

  const updateTitle = useCallback(
    (titleId: string, updates: UpdateTitleInput) =>
      wrapAsync(async () => {
        const response = await api.patch<TitleDeedData>(
          `/api/v1/dld/titles/${titleId}`,
          updates
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  const verifyTitle = useCallback(
    (titleId: string, verifiedBy?: string) =>
      wrapAsync(async () => {
        const response = await api.post<TitleDeedData>(
          `/api/v1/dld/titles/${titleId}/verify`,
          verifiedBy ? { verifiedBy } : {}
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  const verifyTitleOnChain = useCallback(
    (titleId: string) =>
      wrapAsync(async () => {
        const response = await api.post<OnChainVerificationResult>(
          `/api/v1/dld/titles/${titleId}/verify-onchain`,
          {}
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  const lookupByDldNumber = useCallback(
    (dldTitleNumber: string) =>
      wrapAsync(async () => {
        const response = await api.get<TitleDeedData>(
          `/api/v1/dld/lookup/${encodeURIComponent(dldTitleNumber)}`
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  const checkTitleClear = useCallback(
    (titleId: string) =>
      wrapAsync(async () => {
        const response = await api.get<TitleClearCheck>(
          `/api/v1/dld/titles/${titleId}/check-clear`
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  // ============================================================================
  // Event Operations
  // ============================================================================

  const ingestEvent = useCallback(
    (input: IngestEventInput) =>
      wrapAsync(async () => {
        const response = await api.post<DLDEvent>('/api/v1/dld/events', input);
        return response.data;
      }),
    [api, wrapAsync]
  );

  const listEvents = useCallback(
    (filters?: EventFilters) =>
      wrapAsync(async () => {
        const query: Record<string, string> = {};
        if (filters?.titleId) query.titleId = filters.titleId;
        if (filters?.eventType) query.eventType = filters.eventType;
        if (filters?.processed !== undefined) query.processed = String(filters.processed);
        if (filters?.limit) query.limit = String(filters.limit);
        if (filters?.offset) query.offset = String(filters.offset);

        const response = await api.get<{ data: DLDEvent[]; count: number }>(
          '/api/v1/dld/events',
          query
        );
        return response.data.data;
      }),
    [api, wrapAsync]
  );

  const getTitleEvents = useCallback(
    (titleId: string, options?: { limit?: number; offset?: number }) =>
      wrapAsync(async () => {
        const query: Record<string, string> = {};
        if (options?.limit) query.limit = String(options.limit);
        if (options?.offset) query.offset = String(options.offset);

        const response = await api.get<{ data: DLDEvent[]; count: number }>(
          `/api/v1/dld/titles/${titleId}/events`,
          query
        );
        return response.data.data;
      }),
    [api, wrapAsync]
  );

  const processEvent = useCallback(
    (eventId: string) =>
      wrapAsync(async () => {
        const response = await api.post<DLDEvent>(
          `/api/v1/dld/events/${eventId}/process`,
          {}
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  // ============================================================================
  // Sync Job Operations
  // ============================================================================

  const createSyncJob = useCallback(
    (input: CreateSyncJobInput) =>
      wrapAsync(async () => {
        const response = await api.post<SyncJob>('/api/v1/dld/sync-jobs', input);
        return response.data;
      }),
    [api, wrapAsync]
  );

  const listSyncJobs = useCallback(
    (filters?: SyncJobFilters) =>
      wrapAsync(async () => {
        const query: Record<string, string> = {};
        if (filters?.status) query.status = filters.status;
        if (filters?.jobType) query.jobType = filters.jobType;
        if (filters?.limit) query.limit = String(filters.limit);
        if (filters?.offset) query.offset = String(filters.offset);

        const response = await api.get<{ data: SyncJob[]; count: number }>(
          '/api/v1/dld/sync-jobs',
          query
        );
        return response.data.data;
      }),
    [api, wrapAsync]
  );

  const executeSyncJob = useCallback(
    (jobId: string) =>
      wrapAsync(async () => {
        const response = await api.post<SyncJob>(
          `/api/v1/dld/sync-jobs/${jobId}/execute`,
          {}
        );
        return response.data;
      }),
    [api, wrapAsync]
  );

  return {
    // Title operations
    registerTitle,
    getTitle,
    listTitles,
    updateTitle,
    verifyTitle,
    verifyTitleOnChain,
    lookupByDldNumber,
    checkTitleClear,

    // Event operations
    ingestEvent,
    listEvents,
    getTitleEvents,
    processEvent,

    // Sync job operations
    createSyncJob,
    listSyncJobs,
    executeSyncJob,

    // State
    loading,
    error,
    clearError,
  };
}
