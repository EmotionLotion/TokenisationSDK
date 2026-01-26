/**
 * Saga Store Interface
 *
 * Persistence layer for saga state management.
 * Enables saga recovery, monitoring, and audit trails.
 */

import type { Result } from '../types.js';
import type {
  PersistedSagaState,
  SagaQueryOptions,
  SagaSummary,
} from './types.js';

// ============================================================================
// INTERFACE
// ============================================================================

/**
 * Saga store interface for persistence
 */
export interface ISagaStore {
  /**
   * Create a new saga state
   */
  create(state: Omit<PersistedSagaState, 'createdAt' | 'updatedAt' | 'version'>): Promise<Result<PersistedSagaState, string>>;

  /**
   * Get saga state by ID
   */
  get(sagaId: string): Promise<Result<PersistedSagaState | null, string>>;

  /**
   * Update saga state (with optimistic locking)
   */
  update(sagaId: string, updates: Partial<PersistedSagaState>, expectedVersion: number): Promise<Result<PersistedSagaState, string>>;

  /**
   * Delete saga state
   */
  delete(sagaId: string): Promise<Result<boolean, string>>;

  /**
   * Query saga states
   */
  query(options: SagaQueryOptions): Promise<Result<SagaSummary[], string>>;

  /**
   * Get incomplete sagas (for recovery)
   */
  getIncomplete(): Promise<Result<PersistedSagaState[], string>>;

  /**
   * Get sagas by type
   */
  getByType(type: string, limit?: number): Promise<Result<PersistedSagaState[], string>>;

  /**
   * Count sagas by status
   */
  countByStatus(): Promise<Result<Record<string, number>, string>>;

  /**
   * Clean up old completed sagas
   */
  cleanup(olderThanDays: number): Promise<Result<number, string>>;
}

// ============================================================================
// MEMORY IMPLEMENTATION
// ============================================================================

/**
 * In-memory saga store for testing/development
 */
export class MemorySagaStore implements ISagaStore {
  private sagas: Map<string, PersistedSagaState> = new Map();

  async create(
    state: Omit<PersistedSagaState, 'createdAt' | 'updatedAt' | 'version'>
  ): Promise<Result<PersistedSagaState, string>> {
    if (this.sagas.has(state.id)) {
      return { success: false, error: `Saga already exists: ${state.id}` };
    }

    const now = new Date().toISOString();
    const fullState: PersistedSagaState = {
      ...state,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.sagas.set(state.id, fullState);
    return { success: true, data: fullState };
  }

  async get(sagaId: string): Promise<Result<PersistedSagaState | null, string>> {
    const saga = this.sagas.get(sagaId);
    return { success: true, data: saga ?? null };
  }

  async update(
    sagaId: string,
    updates: Partial<PersistedSagaState>,
    expectedVersion: number
  ): Promise<Result<PersistedSagaState, string>> {
    const existing = this.sagas.get(sagaId);
    if (!existing) {
      return { success: false, error: `Saga not found: ${sagaId}` };
    }

    if (existing.version !== expectedVersion) {
      return {
        success: false,
        error: `Version mismatch: expected ${expectedVersion}, got ${existing.version}`,
      };
    }

    const updated: PersistedSagaState = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      createdAt: existing.createdAt, // Prevent creation time change
      updatedAt: new Date().toISOString(),
      version: existing.version + 1,
    };

    this.sagas.set(sagaId, updated);
    return { success: true, data: updated };
  }

  async delete(sagaId: string): Promise<Result<boolean, string>> {
    const deleted = this.sagas.delete(sagaId);
    return { success: true, data: deleted };
  }

  async query(options: SagaQueryOptions): Promise<Result<SagaSummary[], string>> {
    let results = Array.from(this.sagas.values());

    // Apply filters
    if (options.type) {
      results = results.filter((s) => s.type === options.type);
    }

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((s) => statuses.includes(s.status));
    }

    if (options.fromDate) {
      results = results.filter((s) => s.createdAt >= options.fromDate!);
    }

    if (options.toDate) {
      results = results.filter((s) => s.createdAt <= options.toDate!);
    }

    // Sort
    const sortField = options.orderBy ?? 'createdAt';
    const sortDir = options.orderDirection === 'desc' ? -1 : 1;
    results.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      return aVal < bVal ? -sortDir : aVal > bVal ? sortDir : 0;
    });

    // Paginate
    if (options.offset) {
      results = results.slice(options.offset);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    // Map to summary
    const summaries: SagaSummary[] = results.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      currentStep: s.steps[s.currentStepIndex]?.name ?? 'unknown',
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      error: s.error,
    }));

    return { success: true, data: summaries };
  }

  async getIncomplete(): Promise<Result<PersistedSagaState[], string>> {
    const incomplete = Array.from(this.sagas.values()).filter(
      (s) => s.status === 'RUNNING' || s.status === 'COMPENSATING'
    );
    return { success: true, data: incomplete };
  }

  async getByType(type: string, limit?: number): Promise<Result<PersistedSagaState[], string>> {
    let results = Array.from(this.sagas.values())
      .filter((s) => s.type === type)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    if (limit) {
      results = results.slice(0, limit);
    }

    return { success: true, data: results };
  }

  async countByStatus(): Promise<Result<Record<string, number>, string>> {
    const counts: Record<string, number> = {};
    for (const saga of this.sagas.values()) {
      counts[saga.status] = (counts[saga.status] ?? 0) + 1;
    }
    return { success: true, data: counts };
  }

  async cleanup(olderThanDays: number): Promise<Result<number, string>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const cutoffStr = cutoff.toISOString();

    let cleaned = 0;
    for (const [id, saga] of this.sagas) {
      if (
        (saga.status === 'COMPLETED' || saga.status === 'COMPENSATED') &&
        saga.completedAt &&
        saga.completedAt < cutoffStr
      ) {
        this.sagas.delete(id);
        cleaned++;
      }
    }

    return { success: true, data: cleaned };
  }

  // Test helper
  clear(): void {
    this.sagas.clear();
  }
}

export default MemorySagaStore;
