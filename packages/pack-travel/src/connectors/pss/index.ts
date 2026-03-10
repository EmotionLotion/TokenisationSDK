/**
 * PSS/NDC/DCS Connectors
 *
 * Airline distribution system integrations:
 * - PSS (Passenger Service System) - GDS connectivity
 * - NDC (New Distribution Capability) - IATA modern API
 * - DCS (Departure Control System) - Check-in and boarding
 *
 * @example
 * ```typescript
 * import {
 *   PSSConnectorRegistry,
 *   AmadeusNDCConnector,
 *   MockPSSConnector,
 *   MockDCSConnector,
 * } from '@tokenisation-sdk/connectors/pss';
 *
 * // Create registry
 * const registry = new PSSConnectorRegistry();
 *
 * // Register connectors
 * registry.registerNDC(new AmadeusNDCConnector({
 *   apiKey: process.env.AMADEUS_API_KEY!,
 *   apiSecret: process.env.AMADEUS_API_SECRET!,
 * }));
 *
 * registry.registerDCS(new MockDCSConnector({
 *   baseUrl: 'http://localhost:3000',
 * }));
 *
 * // Use connectors
 * const ndc = registry.getFirstByCapability('ndc-shopping');
 * const offers = await ndc.searchOffers({
 *   origin: 'JFK',
 *   destination: 'LAX',
 *   departureDate: '2024-06-15',
 *   passengers: { adults: 2 },
 * });
 * ```
 */

// Types
export * from './types.js';

// Base classes
export {
  BasePSSConnector,
  BaseNDCConnector,
  BaseDCSConnector,
  type BaseConnectorConfig,
} from './BasePSSConnector.js';

// Registry
export {
  PSSConnectorRegistry,
  type PSSRegistryConfig,
  type ConnectorCapability,
  getDefaultRegistry,
  setDefaultRegistry,
} from './registry/index.js';

// Mock connectors
export {
  MockPSSConnector,
  type MockPSSConfig,
  MockDCSConnector,
  type MockDCSConfig,
} from './mock/index.js';

// Amadeus connectors
export {
  AmadeusNDCConnector,
  type AmadeusNDCConfig,
  AmadeusDCSConnector,
  type AmadeusDCSConfig,
} from './amadeus/index.js';

// Sabre connector
export {
  SabrePSSConnector,
  type SabrePSSConfig,
} from './sabre/index.js';

// Travelport connector
export {
  TravelportPSSConnector,
  type TravelportPSSConfig,
} from './travelport/index.js';

// ============================================================================
// CONVENIENCE FACTORY FUNCTIONS
// ============================================================================

import { PSSConnectorRegistry, getDefaultRegistry } from './registry/index.js';
import { MockPSSConnector, MockDCSConnector } from './mock/index.js';

/**
 * Create a registry with mock connectors for testing
 */
export function createMockRegistry(): PSSConnectorRegistry {
  const registry = new PSSConnectorRegistry();

  registry.registerPSS(
    new MockPSSConnector({
      baseUrl: 'http://localhost:3000',
      debug: true,
    })
  );

  registry.registerDCS(
    new MockDCSConnector({
      baseUrl: 'http://localhost:3000',
      debug: true,
    })
  );

  return registry;
}

/**
 * Initialize the default registry with mock connectors
 */
export function initializeMockRegistry(): PSSConnectorRegistry {
  const registry = createMockRegistry();

  // Make this the default
  const defaultRegistry = getDefaultRegistry();

  // Copy mock connectors to default registry
  const mockPss = registry.getPSS('mock-pss');
  const mockDcs = registry.getDCS('mock-dcs');

  if (mockPss) defaultRegistry.registerPSS(mockPss);
  if (mockDcs) defaultRegistry.registerDCS(mockDcs);

  return defaultRegistry;
}
