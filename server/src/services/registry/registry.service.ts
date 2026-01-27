/**
 * RegistryService - Central registry for server-side adapters
 *
 * Manages registration and retrieval of:
 * - Jurisdiction providers (DLD, SEC, MAS)
 * - Custody providers (Fireblocks, BitGo)
 * - KYC providers (Onfido, Jumio)
 *
 * Supports dynamic adapter loading by AssetPack configuration.
 */

import type {
  IJurisdictionProvider,
  ICustodyProvider,
  IKYCProvider,
} from '../../interfaces/index.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Adapter set returned when loading adapters for an AssetPack
 */
export interface AdapterSet {
  /** Jurisdiction provider (if configured) */
  jurisdictionProvider?: IJurisdictionProvider;
  /** Custody provider (if configured) */
  custodyProvider?: ICustodyProvider;
  /** KYC provider (if configured) */
  kycProvider?: IKYCProvider;
}

/**
 * Asset pack configuration for adapter loading
 */
export interface AssetPackAdapterConfig {
  /** Pack identifier */
  packId: string;
  /** Jurisdiction code (e.g., 'AE', 'US') */
  jurisdiction?: string;
  /** Jurisdiction provider name override */
  jurisdictionProvider?: string;
  /** Custody provider name */
  custodyProvider?: string;
  /** KYC provider name */
  kycProvider?: string;
}

/**
 * Provider registration options
 */
export interface ProviderOptions {
  /** Whether this is the default provider */
  isDefault?: boolean;
  /** Priority (lower = higher priority) */
  priority?: number;
}

/**
 * Provider registration metadata
 */
interface ProviderRegistration<T> {
  provider: T;
  isDefault: boolean;
  priority: number;
  registeredAt: Date;
}

// ============================================================================
// Registry Service
// ============================================================================

/**
 * RegistryService - Central registry for all server-side adapters
 */
export class RegistryService {
  private static instance: RegistryService;

  // Provider registries
  private jurisdictionProviders = new Map<string, ProviderRegistration<IJurisdictionProvider>>();
  private custodyProviders = new Map<string, ProviderRegistration<ICustodyProvider>>();
  private kycProviders = new Map<string, ProviderRegistration<IKYCProvider>>();

  // Default provider cache
  private defaultJurisdiction: string | null = null;
  private defaultCustody: string | null = null;
  private defaultKYC: string | null = null;

  // Asset pack configurations
  private assetPackConfigs = new Map<string, AssetPackAdapterConfig>();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): RegistryService {
    if (!RegistryService.instance) {
      RegistryService.instance = new RegistryService();
    }
    return RegistryService.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    RegistryService.instance = new RegistryService();
  }

  // ============================================================================
  // Jurisdiction Provider Management
  // ============================================================================

  /**
   * Register a jurisdiction provider
   * @param provider The provider to register
   * @param options Registration options
   */
  registerJurisdictionProvider(
    provider: IJurisdictionProvider,
    options: ProviderOptions = {}
  ): void {
    const key = provider.jurisdiction;
    const { isDefault = false, priority = 100 } = options;

    this.jurisdictionProviders.set(key, {
      provider,
      isDefault,
      priority,
      registeredAt: new Date(),
    });

    if (isDefault || this.defaultJurisdiction === null) {
      this.defaultJurisdiction = key;
    }
  }

  /**
   * Get jurisdiction provider by jurisdiction code
   * @param jurisdiction ISO country code
   */
  getJurisdictionProvider(jurisdiction: string): IJurisdictionProvider | undefined {
    return this.jurisdictionProviders.get(jurisdiction)?.provider;
  }

  /**
   * Get default jurisdiction provider
   */
  getDefaultJurisdictionProvider(): IJurisdictionProvider | undefined {
    if (this.defaultJurisdiction) {
      return this.jurisdictionProviders.get(this.defaultJurisdiction)?.provider;
    }
    return undefined;
  }

  /**
   * Get all registered jurisdiction providers
   */
  getAllJurisdictionProviders(): IJurisdictionProvider[] {
    return Array.from(this.jurisdictionProviders.values())
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.provider);
  }

  /**
   * Unregister a jurisdiction provider
   * @param jurisdiction ISO country code
   */
  unregisterJurisdictionProvider(jurisdiction: string): boolean {
    const deleted = this.jurisdictionProviders.delete(jurisdiction);
    if (deleted && this.defaultJurisdiction === jurisdiction) {
      this.defaultJurisdiction = this.jurisdictionProviders.size > 0
        ? this.jurisdictionProviders.keys().next().value ?? null
        : null;
    }
    return deleted;
  }

  // ============================================================================
  // Custody Provider Management
  // ============================================================================

  /**
   * Register a custody provider
   * @param provider The provider to register
   * @param options Registration options
   */
  registerCustodyProvider(
    provider: ICustodyProvider,
    options: ProviderOptions = {}
  ): void {
    const key = provider.providerId;
    const { isDefault = false, priority = 100 } = options;

    this.custodyProviders.set(key, {
      provider,
      isDefault,
      priority,
      registeredAt: new Date(),
    });

    if (isDefault || this.defaultCustody === null) {
      this.defaultCustody = key;
    }
  }

  /**
   * Get custody provider by name
   * @param name Provider identifier
   */
  getCustodyProvider(name: string): ICustodyProvider | undefined {
    return this.custodyProviders.get(name)?.provider;
  }

  /**
   * Get default custody provider
   */
  getDefaultCustodyProvider(): ICustodyProvider | undefined {
    if (this.defaultCustody) {
      return this.custodyProviders.get(this.defaultCustody)?.provider;
    }
    return undefined;
  }

  /**
   * Get all registered custody providers
   */
  getAllCustodyProviders(): ICustodyProvider[] {
    return Array.from(this.custodyProviders.values())
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.provider);
  }

  /**
   * Unregister a custody provider
   * @param name Provider identifier
   */
  unregisterCustodyProvider(name: string): boolean {
    const deleted = this.custodyProviders.delete(name);
    if (deleted && this.defaultCustody === name) {
      this.defaultCustody = this.custodyProviders.size > 0
        ? this.custodyProviders.keys().next().value ?? null
        : null;
    }
    return deleted;
  }

  // ============================================================================
  // KYC Provider Management
  // ============================================================================

  /**
   * Register a KYC provider
   * @param provider The provider to register
   * @param options Registration options
   */
  registerKYCProvider(
    provider: IKYCProvider,
    options: ProviderOptions = {}
  ): void {
    const key = provider.providerId;
    const { isDefault = false, priority = 100 } = options;

    this.kycProviders.set(key, {
      provider,
      isDefault,
      priority,
      registeredAt: new Date(),
    });

    if (isDefault || this.defaultKYC === null) {
      this.defaultKYC = key;
    }
  }

  /**
   * Get KYC provider by name
   * @param name Provider identifier
   */
  getKYCProvider(name: string): IKYCProvider | undefined {
    return this.kycProviders.get(name)?.provider;
  }

  /**
   * Get default KYC provider
   */
  getDefaultKYCProvider(): IKYCProvider | undefined {
    if (this.defaultKYC) {
      return this.kycProviders.get(this.defaultKYC)?.provider;
    }
    return undefined;
  }

  /**
   * Get all registered KYC providers
   */
  getAllKYCProviders(): IKYCProvider[] {
    return Array.from(this.kycProviders.values())
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.provider);
  }

  /**
   * Unregister a KYC provider
   * @param name Provider identifier
   */
  unregisterKYCProvider(name: string): boolean {
    const deleted = this.kycProviders.delete(name);
    if (deleted && this.defaultKYC === name) {
      this.defaultKYC = this.kycProviders.size > 0
        ? this.kycProviders.keys().next().value ?? null
        : null;
    }
    return deleted;
  }

  // ============================================================================
  // Asset Pack Configuration
  // ============================================================================

  /**
   * Register adapter configuration for an asset pack
   * @param config Asset pack adapter configuration
   */
  registerAssetPackConfig(config: AssetPackAdapterConfig): void {
    this.assetPackConfigs.set(config.packId, config);
  }

  /**
   * Get adapter configuration for an asset pack
   * @param packId Asset pack identifier
   */
  getAssetPackConfig(packId: string): AssetPackAdapterConfig | undefined {
    return this.assetPackConfigs.get(packId);
  }

  /**
   * Load adapters for an asset pack
   * @param packId Asset pack identifier
   * @returns AdapterSet with configured providers
   */
  async loadAdaptersForAssetPack(packId: string): Promise<AdapterSet> {
    const config = this.assetPackConfigs.get(packId);
    const adapters: AdapterSet = {};

    if (config) {
      // Load jurisdiction provider
      if (config.jurisdiction) {
        adapters.jurisdictionProvider = this.getJurisdictionProvider(config.jurisdiction);
      } else if (config.jurisdictionProvider) {
        // Try to find by provider name
        for (const [, reg] of this.jurisdictionProviders) {
          if (reg.provider.providerName === config.jurisdictionProvider) {
            adapters.jurisdictionProvider = reg.provider;
            break;
          }
        }
      }

      // Load custody provider
      if (config.custodyProvider) {
        adapters.custodyProvider = this.getCustodyProvider(config.custodyProvider);
      }

      // Load KYC provider
      if (config.kycProvider) {
        adapters.kycProvider = this.getKYCProvider(config.kycProvider);
      }
    }

    // Fall back to defaults for missing providers
    if (!adapters.jurisdictionProvider) {
      adapters.jurisdictionProvider = this.getDefaultJurisdictionProvider();
    }
    if (!adapters.custodyProvider) {
      adapters.custodyProvider = this.getDefaultCustodyProvider();
    }
    if (!adapters.kycProvider) {
      adapters.kycProvider = this.getDefaultKYCProvider();
    }

    return adapters;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Health check all registered providers
   * @returns Map of provider ID to health status
   */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    // Check jurisdiction providers
    for (const [key, reg] of this.jurisdictionProviders) {
      try {
        results.set(`jurisdiction:${key}`, await reg.provider.healthCheck());
      } catch {
        results.set(`jurisdiction:${key}`, false);
      }
    }

    // Check custody providers
    for (const [key, reg] of this.custodyProviders) {
      try {
        results.set(`custody:${key}`, await reg.provider.healthCheck());
      } catch {
        results.set(`custody:${key}`, false);
      }
    }

    // Check KYC providers
    for (const [key, reg] of this.kycProviders) {
      try {
        results.set(`kyc:${key}`, await reg.provider.healthCheck());
      } catch {
        results.set(`kyc:${key}`, false);
      }
    }

    return results;
  }

  /**
   * Get registration statistics
   */
  getStats(): {
    jurisdictionProviders: number;
    custodyProviders: number;
    kycProviders: number;
    assetPackConfigs: number;
  } {
    return {
      jurisdictionProviders: this.jurisdictionProviders.size,
      custodyProviders: this.custodyProviders.size,
      kycProviders: this.kycProviders.size,
      assetPackConfigs: this.assetPackConfigs.size,
    };
  }

  /**
   * Check if a provider exists
   * @param type Provider type
   * @param name Provider name/identifier
   */
  hasProvider(
    type: 'jurisdiction' | 'custody' | 'kyc',
    name: string
  ): boolean {
    switch (type) {
      case 'jurisdiction':
        return this.jurisdictionProviders.has(name);
      case 'custody':
        return this.custodyProviders.has(name);
      case 'kyc':
        return this.kycProviders.has(name);
      default:
        return false;
    }
  }
}

// Export singleton getter
export const getRegistry = (): RegistryService => RegistryService.getInstance();
