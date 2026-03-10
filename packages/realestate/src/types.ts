/**
 * Real Estate Types — DLD (Dubai Land Department) and related types
 *
 * These types were previously in @tokenisation/core/types.ts.
 * This is the canonical location for all real-estate-specific types.
 */

// ============================================================================
// DLD Types
// ============================================================================

export interface DldTitle {
  id: string;
  orgId: string;
  assetId: string | null;
  externalTitleDeedId: string;
  status: 'unknown' | 'pending' | 'verified' | 'conflict';
  snapshot: Record<string, unknown>;
  flags: string[];
  lastSyncAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DldEvent {
  id: string;
  titleId: string;
  eventType: string;
  externalEventId: string | null;
  payload: Record<string, unknown>;
  processedAt: string | null;
  status: 'pending' | 'processed' | 'ignored' | 'error';
  error: string | null;
  createdAt: string;
}
