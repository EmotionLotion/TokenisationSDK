/**
 * PluginRegistry - Central registry for all plugins
 *
 * Manages plugin registration, lookup, and lifecycle.
 * Plugins can be swapped at runtime for different use cases.
 */

import type {
  IPluginRegistry,
  PluginType,
  AnyPlugin,
  IJurisdictionPlugin,
  ICompliancePlugin,
  IOraclePlugin,
  IStoragePlugin,
  IChainPlugin,
  ITokenAdapter,
} from '../core/interfaces.js';

/**
 * Plugin registry configuration
 */
export interface PluginRegistryConfig {
  /** Whether to allow plugin replacement */
  allowReplacement?: boolean;

  /** Whether to validate plugins on registration */
  validateOnRegister?: boolean;
}

/**
 * PluginRegistry implementation
 *
 * Provides a type-safe way to register and retrieve plugins.
 */
export class PluginRegistry implements IPluginRegistry {
  private plugins: Map<string, Map<string, AnyPlugin>> = new Map();
  private config: PluginRegistryConfig;

  constructor(config: PluginRegistryConfig = {}) {
    this.config = {
      allowReplacement: true,
      validateOnRegister: true,
      ...config,
    };

    // Initialize maps for each plugin type
    const types: PluginType[] = [
      'jurisdiction',
      'compliance',
      'oracle',
      'storage',
      'chain',
      'token',
    ];

    for (const type of types) {
      this.plugins.set(type, new Map());
    }
  }

  /**
   * Register a plugin
   */
  register<T extends AnyPlugin>(type: PluginType, plugin: T): void {
    const typeMap = this.plugins.get(type);
    if (!typeMap) {
      throw new Error(`Unknown plugin type: ${type}`);
    }

    const pluginId = plugin.pluginId;

    // Check if plugin already exists
    if (typeMap.has(pluginId) && !this.config.allowReplacement) {
      throw new Error(
        `Plugin ${pluginId} already registered for type ${type}`
      );
    }

    // Validate plugin if configured
    if (this.config.validateOnRegister) {
      this.validatePlugin(type, plugin);
    }

    typeMap.set(pluginId, plugin);
  }

  /**
   * Get a plugin by type and ID
   */
  get<T extends AnyPlugin>(type: PluginType, pluginId: string): T | undefined {
    const typeMap = this.plugins.get(type);
    return typeMap?.get(pluginId) as T | undefined;
  }

  /**
   * Get all plugins of a type
   */
  getAll<T extends AnyPlugin>(type: PluginType): T[] {
    const typeMap = this.plugins.get(type);
    if (!typeMap) {
      return [];
    }
    return Array.from(typeMap.values()) as T[];
  }

  /**
   * Check if a plugin is registered
   */
  has(type: PluginType, pluginId: string): boolean {
    const typeMap = this.plugins.get(type);
    return typeMap?.has(pluginId) || false;
  }

  /**
   * Unregister a plugin
   */
  unregister(type: PluginType, pluginId: string): boolean {
    const typeMap = this.plugins.get(type);
    return typeMap?.delete(pluginId) || false;
  }

  /**
   * Get first plugin of a type (convenience method)
   */
  getFirst<T extends AnyPlugin>(type: PluginType): T | undefined {
    const all = this.getAll<T>(type);
    return all[0];
  }

  /**
   * Get jurisdiction plugin
   */
  getJurisdiction(pluginId: string): IJurisdictionPlugin | undefined {
    return this.get<IJurisdictionPlugin>('jurisdiction', pluginId);
  }

  /**
   * Get compliance plugin
   */
  getCompliance(pluginId: string): ICompliancePlugin | undefined {
    return this.get<ICompliancePlugin>('compliance', pluginId);
  }

  /**
   * Get oracle plugin
   */
  getOracle(pluginId: string): IOraclePlugin | undefined {
    return this.get<IOraclePlugin>('oracle', pluginId);
  }

  /**
   * Get storage plugin
   */
  getStorage(pluginId: string): IStoragePlugin | undefined {
    return this.get<IStoragePlugin>('storage', pluginId);
  }

  /**
   * Get chain plugin
   */
  getChain(pluginId: string): IChainPlugin | undefined {
    return this.get<IChainPlugin>('chain', pluginId);
  }

  /**
   * Get token adapter
   */
  getToken(pluginId: string): ITokenAdapter | undefined {
    return this.get<ITokenAdapter>('token', pluginId);
  }

  /**
   * Get plugin counts by type
   */
  getCounts(): Record<PluginType, number> {
    const counts: Record<string, number> = {};
    for (const [type, map] of this.plugins) {
      counts[type] = map.size;
    }
    return counts as Record<PluginType, number>;
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    for (const map of this.plugins.values()) {
      map.clear();
    }
  }

  /**
   * Validate plugin has required methods
   */
  private validatePlugin(type: PluginType, plugin: AnyPlugin): void {
    if (!plugin.pluginId || typeof plugin.pluginId !== 'string') {
      throw new Error('Plugin must have a valid pluginId');
    }

    // Type-specific validation
    switch (type) {
      case 'jurisdiction':
        this.validateJurisdictionPlugin(plugin as IJurisdictionPlugin);
        break;
      case 'compliance':
        this.validateCompliancePlugin(plugin as ICompliancePlugin);
        break;
      case 'oracle':
        this.validateOraclePlugin(plugin as IOraclePlugin);
        break;
      case 'storage':
        this.validateStoragePlugin(plugin as IStoragePlugin);
        break;
      case 'chain':
        this.validateChainPlugin(plugin as IChainPlugin);
        break;
      case 'token':
        this.validateTokenPlugin(plugin as ITokenAdapter);
        break;
    }
  }

  private validateJurisdictionPlugin(plugin: IJurisdictionPlugin): void {
    if (typeof plugin.canCreateAsset !== 'function') {
      throw new Error('Jurisdiction plugin must implement canCreateAsset');
    }
    if (typeof plugin.canTransfer !== 'function') {
      throw new Error('Jurisdiction plugin must implement canTransfer');
    }
  }

  private validateCompliancePlugin(plugin: ICompliancePlugin): void {
    if (typeof plugin.evaluateTransfer !== 'function') {
      throw new Error('Compliance plugin must implement evaluateTransfer');
    }
    if (typeof plugin.getPartyStatus !== 'function') {
      throw new Error('Compliance plugin must implement getPartyStatus');
    }
  }

  private validateOraclePlugin(plugin: IOraclePlugin): void {
    if (typeof plugin.fetchData !== 'function') {
      throw new Error('Oracle plugin must implement fetchData');
    }
  }

  private validateStoragePlugin(plugin: IStoragePlugin): void {
    if (typeof plugin.store !== 'function') {
      throw new Error('Storage plugin must implement store');
    }
    if (typeof plugin.retrieve !== 'function') {
      throw new Error('Storage plugin must implement retrieve');
    }
  }

  private validateChainPlugin(plugin: IChainPlugin): void {
    if (typeof plugin.connect !== 'function') {
      throw new Error('Chain plugin must implement connect');
    }
    if (typeof plugin.sendTransaction !== 'function') {
      throw new Error('Chain plugin must implement sendTransaction');
    }
  }

  private validateTokenPlugin(plugin: ITokenAdapter): void {
    if (typeof plugin.mint !== 'function') {
      throw new Error('Token plugin must implement mint');
    }
    if (typeof plugin.transfer !== 'function') {
      throw new Error('Token plugin must implement transfer');
    }
  }
}

/**
 * Create a pre-configured registry with default settings
 */
export function createPluginRegistry(
  config?: PluginRegistryConfig
): PluginRegistry {
  return new PluginRegistry(config);
}
