/**
 * SSE (Server-Sent Events) Service
 *
 * Manages real-time event streaming connections per organisation.
 * Supports topic-based filtering with wildcard patterns, heartbeat
 * keep-alive, and automatic cleanup on client disconnect.
 *
 * @module sse.service
 */

import { Response } from 'express';
import { randomBytes } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface SSEConnection {
  /** Unique connection identifier */
  id: string;
  /** Express response object used for writing SSE frames */
  res: Response;
  /** Topic patterns this connection is subscribed to (supports wildcards) */
  topics: string[];
  /** Timestamp when the connection was established */
  connectedAt: Date;
}

export interface SSEEvent {
  /** Event type identifier (e.g. 'transfer.created') */
  type: string;
  /** Serialisable event payload */
  data: unknown;
  /** Optional event ID for client-side Last-Event-ID tracking */
  id?: string;
}

// ============================================================================
// SSE Service
// ============================================================================

class SSEService {
  /** Map of orgId -> set of active SSE connections */
  private connections: Map<string, Set<SSEConnection>> = new Map();

  /** Heartbeat interval handle */
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /** Heartbeat frequency in milliseconds */
  private readonly HEARTBEAT_MS = 30_000;

  constructor() {
    this.startHeartbeat();
  }

  // --------------------------------------------------------------------------
  // Connection Management
  // --------------------------------------------------------------------------

  /**
   * Register a new SSE connection for an organisation.
   *
   * Automatically sets up cleanup on client disconnect via `res.on('close')`.
   */
  addConnection(orgId: string, res: Response, topics: string[]): SSEConnection {
    const connection: SSEConnection = {
      id: `sse_${randomBytes(16).toString('hex')}`,
      res,
      topics,
      connectedAt: new Date(),
    };

    if (!this.connections.has(orgId)) {
      this.connections.set(orgId, new Set());
    }

    this.connections.get(orgId)!.add(connection);

    // Auto-cleanup on client disconnect
    res.on('close', () => {
      this.removeConnection(orgId, connection.id);
    });

    logger.info('SSE connection established', {
      connectionId: connection.id,
      orgId,
      topics,
    });

    return connection;
  }

  /**
   * Remove a specific connection by its ID.
   */
  removeConnection(orgId: string, connectionId: string): boolean {
    const orgConnections = this.connections.get(orgId);
    if (!orgConnections) return false;

    let removed = false;
    for (const conn of orgConnections) {
      if (conn.id === connectionId) {
        orgConnections.delete(conn);
        removed = true;

        // Attempt to end the response if still writable
        if (!conn.res.writableEnded) {
          try {
            conn.res.end();
          } catch {
            // Already closed
          }
        }

        logger.info('SSE connection removed', { connectionId, orgId });
        break;
      }
    }

    // Clean up empty org sets
    if (orgConnections.size === 0) {
      this.connections.delete(orgId);
    }

    return removed;
  }

  // --------------------------------------------------------------------------
  // Broadcasting
  // --------------------------------------------------------------------------

  /**
   * Broadcast an event to all connections for a given organisation.
   *
   * Events are filtered per-connection based on the connection's topic
   * subscriptions. Supports wildcard matching (e.g. `transfer.*` matches
   * `transfer.created`, `transfer.approved`).
   */
  broadcast(orgId: string, event: SSEEvent): number {
    const orgConnections = this.connections.get(orgId);
    if (!orgConnections || orgConnections.size === 0) return 0;

    let deliveredCount = 0;
    const deadConnections: SSEConnection[] = [];

    for (const conn of orgConnections) {
      // Check topic match
      if (!this.matchesTopics(conn.topics, event.type)) {
        continue;
      }

      try {
        if (conn.res.writableEnded) {
          deadConnections.push(conn);
          continue;
        }

        this.writeEvent(conn.res, event);
        deliveredCount++;
      } catch (error) {
        logger.warn('Failed to write SSE event', {
          connectionId: conn.id,
          orgId,
          error: error instanceof Error ? error.message : String(error),
        });
        deadConnections.push(conn);
      }
    }

    // Clean up dead connections
    for (const dead of deadConnections) {
      orgConnections.delete(dead);
      logger.info('Removed dead SSE connection', { connectionId: dead.id, orgId });
    }

    if (orgConnections.size === 0) {
      this.connections.delete(orgId);
    }

    return deliveredCount;
  }

  // --------------------------------------------------------------------------
  // Query
  // --------------------------------------------------------------------------

  /**
   * Return the number of active connections for an organisation.
   */
  getConnectionCount(orgId: string): number {
    return this.connections.get(orgId)?.size ?? 0;
  }

  /**
   * Return total connection count across all organisations.
   */
  getTotalConnectionCount(): number {
    let total = 0;
    for (const conns of this.connections.values()) {
      total += conns.size;
    }
    return total;
  }

  // --------------------------------------------------------------------------
  // Heartbeat
  // --------------------------------------------------------------------------

  /**
   * Start the heartbeat loop that sends a comment frame (`: ping`) to every
   * connected client every 30 seconds to prevent proxies / load-balancers
   * from closing idle connections.
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      const deadConnections: Array<{ orgId: string; conn: SSEConnection }> = [];

      for (const [orgId, orgConnections] of this.connections) {
        for (const conn of orgConnections) {
          try {
            if (conn.res.writableEnded) {
              deadConnections.push({ orgId, conn });
              continue;
            }

            conn.res.write(': ping\n\n');
          } catch {
            deadConnections.push({ orgId, conn });
          }
        }
      }

      // Prune dead connections discovered during heartbeat
      for (const { orgId, conn } of deadConnections) {
        const orgConns = this.connections.get(orgId);
        if (orgConns) {
          orgConns.delete(conn);
          if (orgConns.size === 0) {
            this.connections.delete(orgId);
          }
        }
      }
    }, this.HEARTBEAT_MS);

    // Prevent heartbeat from keeping the process alive
    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Stop the heartbeat timer (useful for graceful shutdown / tests).
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Write a formatted SSE event frame to a response stream.
   */
  private writeEvent(res: Response, event: SSEEvent): void {
    if (event.id) {
      res.write(`id: ${event.id}\n`);
    }

    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  }

  /**
   * Check whether any of the connection's topic patterns match the given
   * event type. An empty topics array matches everything.
   *
   * Supports:
   * - Exact match:   `transfer.created` matches `transfer.created`
   * - Wildcard:      `transfer.*` matches `transfer.created`, `transfer.approved`
   * - Global:        `*` matches any event type
   */
  private matchesTopics(topics: string[], eventType: string): boolean {
    // No topics means subscribe to everything
    if (topics.length === 0) return true;

    return topics.some((pattern) => this.matchesPattern(pattern, eventType));
  }

  /**
   * Match a single wildcard pattern against an event type string.
   */
  private matchesPattern(pattern: string, eventType: string): boolean {
    if (pattern === '*') return true;

    const patternParts = pattern.split('.');
    const eventParts = eventType.split('.');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '*') {
        // Wildcard matches the rest of the event type
        return true;
      }

      if (i >= eventParts.length || patternParts[i] !== eventParts[i]) {
        return false;
      }
    }

    return patternParts.length === eventParts.length;
  }

  /**
   * Gracefully close all connections and clean up.
   */
  shutdown(): void {
    this.stopHeartbeat();

    for (const [orgId, orgConnections] of this.connections) {
      for (const conn of orgConnections) {
        try {
          if (!conn.res.writableEnded) {
            conn.res.end();
          }
        } catch {
          // Ignore
        }
      }
      orgConnections.clear();
    }

    this.connections.clear();
    logger.info('SSE service shut down');
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const sseService = new SSEService();
