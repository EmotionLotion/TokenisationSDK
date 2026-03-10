// Types (canonical DLD types — previously in @tokenisation/core)
export { DldTitle } from './types.js';
export { DldEvent as DldEventRecord } from './types.js';

// Models
export * from './models/RealEstateMetadata.js';

// Validation
export * from './validation/real-estate.js';

// Packs
export * from './packs/real-estate-lifecycle.js';
export * from './packs/real-estate.pack.js';
export * from './packs/UAERealEstate.js';
export * from './packs/DLDConditionEvaluator.js';
export * from './packs/VARAConditionEvaluator.js';

// Modules
export * from './modules/DLDClient.js';
export {
  PropertyModule,
  type PropertySummary as PropertyModuleSummary,
} from './modules/PropertyModule.js';
export * from './modules/NAVModule.js';
export * from './modules/InvestorTierModule.js';
export * from './modules/ExitWindowModule.js';
export {
  SecondaryMarketModule,
  type SecondaryListing,
  type PurchaseResult,
  type CreateListingInput as SecondaryMarketCreateListingInput,
} from './modules/SecondaryMarketModule.js';
export * from './modules/LegalModule.js';

// Adapters
export {
  RealEstateAdapter,
  realEstateAdapter,
  type RealEstateInput,
  type RealEstateMetadata,
} from './adapters/RealEstateAdapter.js';

// Policies
export * from './policies/uae-real-estate-policy.js';

// Providers
export * from './providers/dld/index.js';

// Components
export * from './components/index.js';
