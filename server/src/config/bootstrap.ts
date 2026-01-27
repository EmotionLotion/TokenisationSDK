/**
 * Bootstrap Configuration
 *
 * Initializes the RegistryService with all adapters and asset pack configurations.
 * This module should be called during server startup.
 */

import { RegistryService, getRegistry } from '../services/registry/registry.service.js';
import { ASSET_PACK_CONFIGS } from './asset-packs.js';

// Adapters
import {
  DLDAdapter,
  MockJurisdictionAdapter,
  USJurisdictionAdapter,
  SGJurisdictionAdapter,
} from '../adapters/jurisdiction/index.js';

// ============================================================================
// Environment Configuration
// ============================================================================

interface BootstrapConfig {
  /** Use mock adapters for testing */
  useMocks?: boolean;
  /** DLD API configuration */
  dld?: {
    baseUrl: string;
    apiKey: string;
    environment: 'sandbox' | 'production';
  };
  /** SEC API configuration */
  sec?: {
    edgarApiKey?: string;
    environment: 'sandbox' | 'production';
  };
  /** MAS API configuration */
  mas?: {
    masApiKey?: string;
    environment: 'sandbox' | 'production';
  };
}

/**
 * Get bootstrap configuration from environment
 */
function getBootstrapConfig(): BootstrapConfig {
  const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const isProd = process.env.NODE_ENV === 'production';

  return {
    useMocks: isDev || process.env.USE_MOCK_ADAPTERS === 'true',
    dld: process.env.DLD_BASE_URL ? {
      baseUrl: process.env.DLD_BASE_URL,
      apiKey: process.env.DLD_API_KEY || '',
      environment: isProd ? 'production' : 'sandbox',
    } : undefined,
    sec: process.env.SEC_EDGAR_API_KEY ? {
      edgarApiKey: process.env.SEC_EDGAR_API_KEY,
      environment: isProd ? 'production' : 'sandbox',
    } : undefined,
    mas: process.env.MAS_API_KEY ? {
      masApiKey: process.env.MAS_API_KEY,
      environment: isProd ? 'production' : 'sandbox',
    } : undefined,
  };
}

// ============================================================================
// Bootstrap Function
// ============================================================================

/**
 * Initialize the RegistryService with adapters and asset pack configurations
 *
 * @param configOverride Optional configuration override for testing
 */
export async function bootstrapRegistry(configOverride?: Partial<BootstrapConfig>): Promise<void> {
  const config = { ...getBootstrapConfig(), ...configOverride };
  const registry = getRegistry();

  console.log('[Bootstrap] Initializing RegistryService...');

  // -------------------------------------------------------------------------
  // Register Jurisdiction Providers
  // -------------------------------------------------------------------------

  if (config.useMocks) {
    // Register mock adapters for all jurisdictions
    console.log('[Bootstrap] Using mock jurisdiction adapters');

    // Mock for UAE/Dubai
    registry.registerJurisdictionProvider(
      new MockJurisdictionAdapter({ jurisdiction: 'AE', simulatedDelay: 100 }),
      { isDefault: true, priority: 100 }
    );

    // Mock for US
    registry.registerJurisdictionProvider(
      new MockJurisdictionAdapter({ jurisdiction: 'US', simulatedDelay: 100 }),
      { priority: 100 }
    );

    // Mock for Singapore
    registry.registerJurisdictionProvider(
      new MockJurisdictionAdapter({ jurisdiction: 'SG', simulatedDelay: 100 }),
      { priority: 100 }
    );
  } else {
    // Register real adapters based on configuration

    // UAE (DLD)
    if (config.dld) {
      console.log('[Bootstrap] Registering DLD adapter for UAE');
      registry.registerJurisdictionProvider(
        new DLDAdapter({
          baseUrl: config.dld.baseUrl,
          apiKey: config.dld.apiKey,
          environment: config.dld.environment,
        }),
        { isDefault: true, priority: 10 }
      );
    } else {
      console.log('[Bootstrap] DLD not configured, using mock for UAE');
      registry.registerJurisdictionProvider(
        new MockJurisdictionAdapter({ jurisdiction: 'AE' }),
        { isDefault: true, priority: 100 }
      );
    }

    // US (SEC)
    if (config.sec) {
      console.log('[Bootstrap] Registering SEC adapter for US');
      registry.registerJurisdictionProvider(
        new USJurisdictionAdapter({
          edgarApiKey: config.sec.edgarApiKey,
          environment: config.sec.environment,
        }),
        { priority: 10 }
      );
    } else {
      console.log('[Bootstrap] SEC not configured, using mock for US');
      registry.registerJurisdictionProvider(
        new MockJurisdictionAdapter({ jurisdiction: 'US' }),
        { priority: 100 }
      );
    }

    // Singapore (MAS)
    if (config.mas) {
      console.log('[Bootstrap] Registering MAS adapter for Singapore');
      registry.registerJurisdictionProvider(
        new SGJurisdictionAdapter({
          masApiKey: config.mas.masApiKey,
          environment: config.mas.environment,
        }),
        { priority: 10 }
      );
    } else {
      console.log('[Bootstrap] MAS not configured, using mock for Singapore');
      registry.registerJurisdictionProvider(
        new MockJurisdictionAdapter({ jurisdiction: 'SG' }),
        { priority: 100 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // Register Asset Pack Configurations
  // -------------------------------------------------------------------------

  console.log('[Bootstrap] Registering asset pack configurations...');

  for (const [packId, packConfig] of Object.entries(ASSET_PACK_CONFIGS)) {
    registry.registerAssetPackConfig({
      packId: packConfig.packId,
      jurisdiction: packConfig.jurisdiction,
      jurisdictionProvider: packConfig.jurisdictionProvider,
      custodyProvider: packConfig.custodyProvider,
      kycProvider: packConfig.kycProvider,
    });
  }

  // -------------------------------------------------------------------------
  // Log Summary
  // -------------------------------------------------------------------------

  const stats = registry.getStats();
  console.log('[Bootstrap] RegistryService initialized:');
  console.log(`  - Jurisdiction providers: ${stats.jurisdictionProviders}`);
  console.log(`  - Custody providers: ${stats.custodyProviders}`);
  console.log(`  - KYC providers: ${stats.kycProviders}`);
  console.log(`  - Asset pack configs: ${stats.assetPackConfigs}`);
}

/**
 * Reset the registry (for testing)
 */
export function resetRegistry(): void {
  RegistryService.resetInstance();
}

/**
 * Check if bootstrap has been completed
 */
export function isBootstrapped(): boolean {
  const stats = getRegistry().getStats();
  return stats.assetPackConfigs > 0;
}
