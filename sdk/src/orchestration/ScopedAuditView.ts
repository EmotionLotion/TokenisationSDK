/**
 * ScopedAuditView
 *
 * Wraps UnifiedAuditLog with SHA-256 hash chains and business-scoped views.
 * Provides tamper-evident audit trails with per-business isolation.
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { AuditEntry, IAuditLog } from './UnifiedAuditLog.js';

export interface ChainedAuditEntry extends AuditEntry {
  entryHash: string;
  previousHash?: string;
  sequenceNumber: number;
}

export interface BusinessAuditView {
  businessId: string;
  entries: ChainedAuditEntry[];
  chainIntact: boolean;
}

export interface ChainVerificationResult {
  globalChainValid: boolean;
  businessChainValid: Record<string, boolean>;
  totalEntries: number;
  tamperingDetected: boolean;
  issues: string[];
}

function computeHash(content: Record<string, unknown>): string {
  const keys = Object.keys(content).sort();
  const normalized = JSON.stringify(content, keys);
  return createHash('sha256').update(normalized).digest('hex');
}

export class AuditChainManager {
  private chainedEntries: ChainedAuditEntry[] = [];
  private sequenceCounter = 0;

  constructor(private auditLog: IAuditLog) {}

  logChained(
    entry: Omit<AuditEntry, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
  ): ChainedAuditEntry {
    const id = entry.id ?? uuidv4();
    const timestamp = entry.timestamp ?? new Date().toISOString();

    const previousEntry = this.chainedEntries[this.chainedEntries.length - 1];
    const previousHash = previousEntry?.entryHash;
    const sequenceNumber = this.sequenceCounter++;

    const hashContent: Record<string, unknown> = {
      id,
      timestamp,
      source: entry.source,
      action: entry.action,
      actorId: entry.actorId,
      resourceId: entry.resourceId,
      success: entry.success,
      reason: entry.reason,
      correlationId: entry.correlationId,
      data: entry.data,
      previousHash,
      sequenceNumber,
    };

    const entryHash = computeHash(hashContent);

    const chained: ChainedAuditEntry = {
      id,
      timestamp,
      source: entry.source,
      action: entry.action,
      actorId: entry.actorId,
      resourceId: entry.resourceId,
      success: entry.success,
      reason: entry.reason,
      correlationId: entry.correlationId,
      data: entry.data,
      entryHash,
      previousHash,
      sequenceNumber,
    };

    this.chainedEntries.push(chained);

    // Also log to the underlying audit log
    this.auditLog.log({ ...entry, id, timestamp });

    return chained;
  }

  getScopedView(businessId: string): BusinessAuditView {
    const entries = this.chainedEntries.filter((e) => e.source === businessId);
    const chainIntact = this.verifySubChain(entries);
    return { businessId, entries, chainIntact };
  }

  getAuditorView(): ChainedAuditEntry[] {
    return [...this.chainedEntries];
  }

  verifyGlobalChain(): ChainVerificationResult {
    const issues: string[] = [];
    let globalChainValid = true;

    // Verify global chain
    for (let i = 1; i < this.chainedEntries.length; i++) {
      const current = this.chainedEntries[i];
      const previous = this.chainedEntries[i - 1];
      if (current.previousHash !== previous.entryHash) {
        globalChainValid = false;
        issues.push(
          `Entry ${i} (seq ${current.sequenceNumber}): previousHash mismatch`,
        );
      }
    }

    // Verify per-business chains
    const businessIds = [...new Set(this.chainedEntries.map((e) => e.source))];
    const businessChainValid: Record<string, boolean> = {};
    for (const biz of businessIds) {
      const entries = this.chainedEntries.filter((e) => e.source === biz);
      businessChainValid[biz] = this.verifySubChain(entries);
      if (!businessChainValid[biz]) {
        issues.push(`Business ${biz}: chain integrity compromised`);
      }
    }

    return {
      globalChainValid,
      businessChainValid,
      totalEntries: this.chainedEntries.length,
      tamperingDetected: !globalChainValid || issues.length > 0,
      issues,
    };
  }

  getJourneyEntries(correlationId: string): ChainedAuditEntry[] {
    return this.chainedEntries
      .filter((e) => e.correlationId === correlationId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  private verifySubChain(entries: ChainedAuditEntry[]): boolean {
    // Within the global chain, verify that each entry's hash is valid
    for (const entry of entries) {
      const hashContent: Record<string, unknown> = {
        id: entry.id,
        timestamp: entry.timestamp,
        source: entry.source,
        action: entry.action,
        actorId: entry.actorId,
        resourceId: entry.resourceId,
        success: entry.success,
        reason: entry.reason,
        correlationId: entry.correlationId,
        data: entry.data,
        previousHash: entry.previousHash,
        sequenceNumber: entry.sequenceNumber,
      };
      const expectedHash = computeHash(hashContent);
      if (entry.entryHash !== expectedHash) {
        return false;
      }
    }
    return true;
  }
}
