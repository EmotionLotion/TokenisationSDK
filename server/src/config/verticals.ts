/**
 * Vertical Route Classification
 *
 * Classifies server routes as SDK Core (always loaded) or Vertical Extensions
 * (conditionally loaded based on ENABLED_VERTICALS env var).
 *
 * SDK Core routes: The universal tokenisation engine — auth, assets, tokens,
 * transfers, compliance, KYC, audit, events, distributions, settlements, etc.
 *
 * Vertical Extensions: Domain-specific modules that add industry-specific
 * APIs on top of the core SDK.
 */

export type VerticalId =
  | 'real-estate'
  | 'airline'
  | 'hotel'
  | 'car-rental'
  | 'concert'
  | 'prediction-market'
  | 'travel-shield'
  | 'proof-of-funds'
  | 'depin'
  | 'gpu-compute';

export interface VerticalConfig {
  id: VerticalId;
  label: string;
  description: string;
  routePrefixes: string[];
}

export const VERTICALS: Record<VerticalId, VerticalConfig> = {
  'real-estate': {
    id: 'real-estate',
    label: 'Real Estate',
    description: 'DLD integration, property management, and real estate tokenisation',
    routePrefixes: ['/api/v1/dld', '/api/v1/properties'],
  },
  'airline': {
    id: 'airline',
    label: 'Airline',
    description: 'Ticket NFTs, boarding passes, and flight oracle integration',
    routePrefixes: ['/api/v1/tickets', '/api/v1/flights', '/api/v1/boarding-passes'],
  },
  'hotel': {
    id: 'hotel',
    label: 'Hotel',
    description: 'Hotel booking NFTs and reservation management',
    routePrefixes: ['/api/v1/hotels'],
  },
  'car-rental': {
    id: 'car-rental',
    label: 'Car Rental',
    description: 'Car rental NFTs and fleet management',
    routePrefixes: ['/api/v1/car-rentals'],
  },
  'concert': {
    id: 'concert',
    label: 'Concert',
    description: 'Concert ticket NFTs and event management',
    routePrefixes: ['/api/v1/concerts'],
  },
  'prediction-market': {
    id: 'prediction-market',
    label: 'Prediction Market',
    description: 'Prediction market contracts and settlement',
    routePrefixes: ['/api/v1/markets'],
  },
  'travel-shield': {
    id: 'travel-shield',
    label: 'Travel Shield',
    description: 'Parametric travel insurance policies',
    routePrefixes: ['/api/v1/policies'],
  },
  'proof-of-funds': {
    id: 'proof-of-funds',
    label: 'Proof of Funds',
    description: 'Verifiable proof-of-funds attestations',
    routePrefixes: ['/api/v1/proofs'],
  },
  'depin': {
    id: 'depin',
    label: 'DePIN',
    description: 'Decentralised physical infrastructure networks',
    routePrefixes: ['/api/v1/depin'],
  },
  'gpu-compute': {
    id: 'gpu-compute',
    label: 'GPU Compute',
    description: 'Tokenized GPU compute infrastructure marketplace',
    routePrefixes: ['/api/v1/gpu-nodes', '/api/v1/compute-market'],
  },
};

/**
 * Parse ENABLED_VERTICALS env var.
 * - If not set or empty → all verticals enabled (default)
 * - If set to "none" → no verticals
 * - Otherwise, comma-separated list of vertical IDs
 */
export function getEnabledVerticals(): Set<VerticalId> {
  const envVal = process.env.ENABLED_VERTICALS?.trim();

  if (!envVal || envVal === '' || envVal === '*') {
    return new Set(Object.keys(VERTICALS) as VerticalId[]);
  }

  if (envVal === 'none') {
    return new Set();
  }

  const ids = envVal.split(',').map(s => s.trim()) as VerticalId[];
  const valid = ids.filter(id => id in VERTICALS);
  return new Set(valid);
}

/**
 * Check if a specific vertical is enabled.
 */
export function isVerticalEnabled(id: VerticalId): boolean {
  return getEnabledVerticals().has(id);
}

// ============================================================================
// SERVER PLUGIN INTERFACE
//
// Formalizes the pattern used in loadVerticalRoutes(). Third-party vertical
// packages can implement this interface to register Express routes dynamically.
// ============================================================================

import type { Router, RequestHandler } from 'express';

/**
 * ServerPlugin — Interface for vertical route plugins.
 *
 * Each vertical package can export a server plugin that registers
 * Express routes into the shared application.
 *
 * @example
 * ```typescript
 * // @tokenisation/pack-travel/src/server-plugin.ts
 * export const travelServerPlugin: ServerPlugin = {
 *   id: 'travel',
 *   version: '1.0.0',
 *   routes: [
 *     { path: '/api/v1/tickets', router: ticketRouter },
 *     { path: '/api/v1/flights', router: flightOracleRouter },
 *   ],
 * };
 * ```
 */
export interface ServerPlugin {
  /** Unique plugin identifier (matches VerticalId or custom) */
  id: string;
  /** Semver version */
  version: string;
  /** Routes to register */
  routes: ServerPluginRoute[];
  /** Called before routes are registered */
  init?: (context: ServerPluginContext) => void | Promise<void>;
  /** Called during graceful shutdown */
  destroy?: () => void | Promise<void>;
}

export interface ServerPluginRoute {
  /** Express path prefix (e.g., '/api/v1/tickets') */
  path: string;
  /** Express router */
  router: Router;
  /** Additional middleware to apply before the router */
  middleware?: RequestHandler[];
}

export interface ServerPluginContext {
  /** Logger instance */
  logger: { info: (msg: string) => void; error: (msg: string) => void };
  /** Database connection (if available) */
  db?: unknown;
}
