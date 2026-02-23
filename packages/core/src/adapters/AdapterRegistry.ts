/**
 * @fileoverview Adapter Registry Implementation
 *
 * Central registry for all pluggable adapters. The SDK uses this to
 * resolve the correct adapter based on asset type, jurisdiction, or KYC provider.
 */

import type {
  IAdapterRegistry,
  IAssetAdapter,
  IJurisdictionAdapter,
  IKycAdapter,
} from './types.js';

export class AdapterRegistry implements IAdapterRegistry {
  private assetAdapters: Map<string, IAssetAdapter> = new Map();
  private jurisdictionAdapters: Map<string, IJurisdictionAdapter> = new Map();
  private kycAdapters: Map<string, IKycAdapter> = new Map();

  // -------------------------------------------------------------------------
  // REGISTRATION
  // -------------------------------------------------------------------------

  registerAssetAdapter(adapter: IAssetAdapter): void {
    if (this.assetAdapters.has(adapter.assetType)) {
      console.warn(`Asset adapter for '${adapter.assetType}' is being overwritten`);
    }
    this.assetAdapters.set(adapter.assetType, adapter);
  }

  registerJurisdictionAdapter(adapter: IJurisdictionAdapter): void {
    if (this.jurisdictionAdapters.has(adapter.jurisdiction)) {
      console.warn(`Jurisdiction adapter for '${adapter.jurisdiction}' is being overwritten`);
    }
    this.jurisdictionAdapters.set(adapter.jurisdiction, adapter);
  }

  registerKycAdapter(adapter: IKycAdapter): void {
    if (this.kycAdapters.has(adapter.provider)) {
      console.warn(`KYC adapter for '${adapter.provider}' is being overwritten`);
    }
    this.kycAdapters.set(adapter.provider, adapter);
  }

  // -------------------------------------------------------------------------
  // RETRIEVAL
  // -------------------------------------------------------------------------

  getAssetAdapter(assetType: string): IAssetAdapter | undefined {
    return this.assetAdapters.get(assetType);
  }

  getJurisdictionAdapter(jurisdiction: string): IJurisdictionAdapter | undefined {
    return this.jurisdictionAdapters.get(jurisdiction);
  }

  getKycAdapter(provider: string): IKycAdapter | undefined {
    return this.kycAdapters.get(provider);
  }

  // -------------------------------------------------------------------------
  // ENUMERATION
  // -------------------------------------------------------------------------

  getAssetTypes(): string[] {
    return Array.from(this.assetAdapters.keys());
  }

  getJurisdictions(): string[] {
    return Array.from(this.jurisdictionAdapters.keys());
  }

  getKycProviders(): string[] {
    return Array.from(this.kycAdapters.keys());
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  /**
   * Check if an asset type is supported
   */
  hasAssetAdapter(assetType: string): boolean {
    return this.assetAdapters.has(assetType);
  }

  /**
   * Check if a jurisdiction is supported
   */
  hasJurisdictionAdapter(jurisdiction: string): boolean {
    return this.jurisdictionAdapters.has(jurisdiction);
  }

  /**
   * Check if a KYC provider is supported
   */
  hasKycAdapter(provider: string): boolean {
    return this.kycAdapters.has(provider);
  }

  /**
   * Get all adapters for a specific asset type and jurisdiction combination
   */
  getAdaptersForAsset(assetType: string, jurisdiction: string): {
    asset: IAssetAdapter | undefined;
    jurisdiction: IJurisdictionAdapter | undefined;
  } {
    return {
      asset: this.getAssetAdapter(assetType),
      jurisdiction: this.getJurisdictionAdapter(jurisdiction),
    };
  }

  /**
   * Validate that required adapters exist for an operation
   */
  validateAdapters(assetType: string, jurisdiction: string): {
    valid: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    if (!this.hasAssetAdapter(assetType)) {
      missing.push(`Asset adapter for '${assetType}'`);
    }

    if (!this.hasJurisdictionAdapter(jurisdiction)) {
      missing.push(`Jurisdiction adapter for '${jurisdiction}'`);
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Clear all registered adapters (useful for testing)
   */
  clear(): void {
    this.assetAdapters.clear();
    this.jurisdictionAdapters.clear();
    this.kycAdapters.clear();
  }
}

// Export singleton instance
export const adapterRegistry = new AdapterRegistry();
