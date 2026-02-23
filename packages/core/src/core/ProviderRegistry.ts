/**
 * ProviderRegistry - Central registry for external providers
 *
 * The SDK is the brain. Providers are the body.
 * This registry connects them.
 */

import type {
  ProviderType,
  AnyProvider,
  ProviderRegistration,
  IProviderRegistry,
  ICustodyProvider,
  IKYCProvider,
  IExchangeProvider,
  ISettlementProvider,
} from './interfaces.providers.js';
import { ValidationError, SDKError, ErrorCode } from '../errors/index.js';

/**
 * ProviderRegistry implementation
 */
export class ProviderRegistry implements IProviderRegistry {
  private providers: Map<ProviderType, Map<string, ProviderRegistration>> = new Map();
  private defaults: Map<ProviderType, string> = new Map();

  constructor() {
    // Initialize maps for each provider type
    this.providers.set('custody', new Map());
    this.providers.set('kyc', new Map());
    this.providers.set('exchange', new Map());
    this.providers.set('settlement', new Map());
  }

  /**
   * Register a provider
   */
  register<T extends AnyProvider>(
    type: ProviderType,
    provider: T,
    options?: { priority?: number; isDefault?: boolean }
  ): void {
    const typeProviders = this.providers.get(type);
    if (!typeProviders) {
      throw new ValidationError(`Unknown provider type: ${type}`, {
        field: 'type',
        constraints: { allowedValues: 'custody, kyc, exchange, settlement' },
      });
    }

    const providerId = (provider as any).providerId;
    if (!providerId) {
      throw new ValidationError('Provider must have a providerId property', {
        field: 'providerId',
        constraints: { required: 'true' },
      });
    }

    const registration: ProviderRegistration<T> = {
      type,
      provider,
      priority: options?.priority ?? 100,
      isDefault: options?.isDefault ?? false,
    };

    typeProviders.set(providerId, registration as ProviderRegistration);

    // Set as default if requested or if it's the first provider of this type
    if (options?.isDefault || !this.defaults.has(type)) {
      this.defaults.set(type, providerId);
    }

    console.log(`[ProviderRegistry] Registered ${type} provider: ${providerId}`);
  }

  /**
   * Get default provider for a type
   */
  getDefault<T extends AnyProvider>(type: ProviderType): T | undefined {
    const defaultId = this.defaults.get(type);
    if (!defaultId) return undefined;
    return this.get(type, defaultId);
  }

  /**
   * Get provider by ID
   */
  get<T extends AnyProvider>(type: ProviderType, providerId: string): T | undefined {
    const typeProviders = this.providers.get(type);
    const registration = typeProviders?.get(providerId);
    return registration?.provider as T | undefined;
  }

  /**
   * Get all providers of a type
   */
  getAll<T extends AnyProvider>(type: ProviderType): T[] {
    const typeProviders = this.providers.get(type);
    if (!typeProviders) return [];

    return Array.from(typeProviders.values())
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.provider as T);
  }

  /**
   * Check if a provider is registered
   */
  has(type: ProviderType, providerId: string): boolean {
    const typeProviders = this.providers.get(type);
    return typeProviders?.has(providerId) ?? false;
  }

  /**
   * Unregister a provider
   */
  unregister(type: ProviderType, providerId: string): boolean {
    const typeProviders = this.providers.get(type);
    if (!typeProviders) return false;

    const deleted = typeProviders.delete(providerId);

    // If we deleted the default, pick a new one
    if (deleted && this.defaults.get(type) === providerId) {
      const remaining = Array.from(typeProviders.values())
        .sort((a, b) => a.priority - b.priority);
      if (remaining.length > 0) {
        this.defaults.set(type, (remaining[0].provider as any).providerId);
      } else {
        this.defaults.delete(type);
      }
    }

    return deleted;
  }

  /**
   * Health check all providers
   */
  async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [type, typeProviders] of this.providers) {
      for (const [providerId, registration] of typeProviders) {
        const key = `${type}:${providerId}`;
        try {
          const healthy = await registration.provider.healthCheck();
          results.set(key, healthy);
        } catch {
          results.set(key, false);
        }
      }
    }

    return results;
  }

  // ============================================================================
  // TYPE-SAFE CONVENIENCE METHODS
  // ============================================================================

  /**
   * Get custody provider
   */
  getCustody(providerId?: string): ICustodyProvider | undefined {
    if (providerId) {
      return this.get<ICustodyProvider>('custody', providerId);
    }
    return this.getDefault<ICustodyProvider>('custody');
  }

  /**
   * Get KYC provider
   */
  getKYC(providerId?: string): IKYCProvider | undefined {
    if (providerId) {
      return this.get<IKYCProvider>('kyc', providerId);
    }
    return this.getDefault<IKYCProvider>('kyc');
  }

  /**
   * Get exchange provider
   */
  getExchange(providerId?: string): IExchangeProvider | undefined {
    if (providerId) {
      return this.get<IExchangeProvider>('exchange', providerId);
    }
    return this.getDefault<IExchangeProvider>('exchange');
  }

  /**
   * Get settlement provider
   */
  getSettlement(providerId?: string): ISettlementProvider | undefined {
    if (providerId) {
      return this.get<ISettlementProvider>('settlement', providerId);
    }
    return this.getDefault<ISettlementProvider>('settlement');
  }

  /**
   * Register custody provider (type-safe)
   */
  registerCustody(provider: ICustodyProvider, options?: { priority?: number; isDefault?: boolean }): void {
    this.register('custody', provider, options);
  }

  /**
   * Register KYC provider (type-safe)
   */
  registerKYC(provider: IKYCProvider, options?: { priority?: number; isDefault?: boolean }): void {
    this.register('kyc', provider, options);
  }

  /**
   * Register exchange provider (type-safe)
   */
  registerExchange(provider: IExchangeProvider, options?: { priority?: number; isDefault?: boolean }): void {
    this.register('exchange', provider, options);
  }

  /**
   * Register settlement provider (type-safe)
   */
  registerSettlement(provider: ISettlementProvider, options?: { priority?: number; isDefault?: boolean }): void {
    this.register('settlement', provider, options);
  }
}

/**
 * Singleton instance
 */
export const providerRegistry = new ProviderRegistry();
