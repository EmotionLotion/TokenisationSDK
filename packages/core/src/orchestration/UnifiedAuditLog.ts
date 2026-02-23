/**
 * UnifiedAuditLog
 *
 * Centralized audit logging across all pack engines.
 * Supports structured filtering by source, action, actor, resource, and correlation.
 */

import { v4 as uuidv4 } from 'uuid';

export interface AuditEntry {
  id: string;
  timestamp: string;
  source: string;
  action: string;
  actorId: string;
  resourceId: string;
  success: boolean;
  reason?: string;
  correlationId?: string;
  data?: Record<string, unknown>;
}

export interface AuditFilter {
  source?: string;
  action?: string;
  actorId?: string;
  resourceId?: string;
  success?: boolean;
  correlationId?: string;
  fromDate?: string;
  toDate?: string;
}

export interface IAuditLog {
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): string;
  query(filter: AuditFilter): AuditEntry[];
  getAll(): AuditEntry[];
  getByResource(resourceId: string): AuditEntry[];
  getByCorrelation(correlationId: string): AuditEntry[];
  clear(): void;
}

export class UnifiedAuditLog implements IAuditLog {
  private entries: AuditEntry[] = [];

  log(entry: Omit<AuditEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string }): string {
    const id = entry.id ?? uuidv4();
    const fullEntry: AuditEntry = {
      id,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      source: entry.source,
      action: entry.action,
      actorId: entry.actorId,
      resourceId: entry.resourceId,
      success: entry.success,
      reason: entry.reason,
      correlationId: entry.correlationId,
      data: entry.data,
    };

    this.entries.push(fullEntry);
    return id;
  }

  query(filter: AuditFilter): AuditEntry[] {
    return this.entries.filter(e => {
      if (filter.source !== undefined && e.source !== filter.source) return false;
      if (filter.action !== undefined && e.action !== filter.action) return false;
      if (filter.actorId !== undefined && e.actorId !== filter.actorId) return false;
      if (filter.resourceId !== undefined && e.resourceId !== filter.resourceId) return false;
      if (filter.success !== undefined && e.success !== filter.success) return false;
      if (filter.correlationId !== undefined && e.correlationId !== filter.correlationId) return false;
      if (filter.fromDate !== undefined && e.timestamp < filter.fromDate) return false;
      if (filter.toDate !== undefined && e.timestamp > filter.toDate) return false;
      return true;
    });
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  getByResource(resourceId: string): AuditEntry[] {
    return this.entries.filter(e => e.resourceId === resourceId);
  }

  getByCorrelation(correlationId: string): AuditEntry[] {
    return this.entries.filter(e => e.correlationId === correlationId);
  }

  clear(): void {
    this.entries = [];
  }
}
