/**
 * DLD Provider Exports
 *
 * Providers for Dubai Land Department integration.
 */

// Export provider interface and types with namespacing to avoid conflicts
export type {
  IDLDProvider,
  DLDProviderConfig,
  DLDProviderFactory,
  // Types exported with Provider suffix to distinguish from module types
  TitleDeedResult as DLDProviderTitleDeedResult,
  TokenizationEligibility as DLDProviderTokenizationEligibility,
  TokenizationNotification as DLDProviderTokenizationNotification,
  TokenizationNotificationResult,
  ValuationResult,
  ValuationType,
  Owner as DLDProviderOwner,
  PropertyLocation,
  TitleDeedStatus as DLDProviderTitleDeedStatus,
  PropertyType as DLDProviderPropertyType,
  OwnershipType as DLDProviderOwnershipType,
} from './IDLDProvider.js';

export { MockDLDProvider, createMockDLDProvider } from './MockDLDProvider.js';
