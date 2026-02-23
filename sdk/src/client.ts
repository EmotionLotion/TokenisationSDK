/**
 * Tokenisation SDK - Client Entry Point
 *
 * Browser-safe exports for frontend applications.
 *
 * @packageDocumentation
 */

// Re-export core (browser-safe modules, models, plugins, errors, utils)
export * from '@tokenisation/core';

// Re-export compliance (explicit to avoid name collisions with core)
export {
  ComplianceService,
  createComplianceService,
  RuleConditionType,
  JurisdictionPlugin,
  createJurisdictionPlugin,
  KYCCompliancePlugin,
  createKYCCompliancePlugin,
  KycPlugin,
  createKycPlugin,
  SumsubProvider,
  MockKYCProvider,
  ClaimType,
  ClaimBitmask,
  RequirementMasks,
  ClaimsService,
  DenyReason,
  PolicyRegistry,
  UAE_REAL_ESTATE_POLICY,
} from '@tokenisation/compliance';

// Re-export realestate (explicit to avoid name collisions with core)
// Colliding names kept from core: AssetPackConfig, CreateScheduleInput, DldEvent,
// InvestorTier, RealEstateMetadata, RealEstateMetadataSchema, RedemptionRequest,
// ValidationError.

export {
  // --- Models ---
  // RealEstateMetadataSchema — skipped (collides with core)
  // RealEstateMetadata (type) — skipped (collides with core)

  // --- Validation ---
  // ValidationError — skipped (collides with core)
  parseOrThrow,
  createPropertyInputSchema,
  type CreatePropertyInput,
  updatePropertyInputSchema,
  type UpdatePropertyInput,
  propertyUnitInputSchema,
  type PropertyUnitInput,
  maintenanceRequestInputSchema,
  type MaintenanceRequestInput,
  expenseInputSchema,
  type ExpenseInput,
  navValuationInputSchema,
  type NAVValuationInput,
  createListingInputSchema,
  type CreateListingInput,
  assignTierInputSchema,
  type AssignTierInput,
  checkEligibilityInputSchema,
  type CheckEligibilityInput,
  createScheduleInputSchema,
  // CreateScheduleInput (type) — skipped (collides with core)
  redemptionRequestInputSchema,
  type RedemptionRequestInput,
  dldRegisterTitleInputSchema,
  type DLDRegisterTitleInput,
  dldIngestEventInputSchema,
  type DLDIngestEventInput,
  dldCreateSyncJobInputSchema,
  type DLDCreateSyncJobInput,

  // --- Packs: Lifecycle ---
  RealEstateLifecycleStates,
  type RealEstateLifecycleState,
  REAL_ESTATE_LIFECYCLE,
  mapCoreStateToRealEstate,
  mapRealEstateToCoreState,
  mapStakeStageToState,
  mapStateToStakeStage,
  registerRealEstateLifecycle,

  // --- Packs: Real Estate Pack ---
  // AssetPackConfig — skipped (collides with core)
  type CreateRealEstatePackOptions,
  dubaiRealEstatePack,
  adgmRealEstatePack,
  genericRealEstatePack,
  createRealEstatePack,
  baseLifecycleRules,
  baseComplianceRules,
  baseRequiredVerifications,
  baseDistributionSchedule,
  baseGovernanceSettings,
  baseMetadataSchema,
  baseDefaults,
  dubaiLifecycleRules,
  varaComplianceRules,
  dldVerifications,
  dubaiMetadataSchema,
  adgmComplianceRules,
  adgmVerifications,

  // --- Packs: UAE Real Estate ---
  type UAERealEstateConfig,
  UAERealEstatePack,
  createUAERealEstateToken,

  // --- Packs: DLD Condition Evaluator ---
  type DLDConditionEvaluatorConfig,
  DLDConditionEvaluator,

  // --- Packs: VARA Condition Evaluator ---
  type VARAComplianceStatus,
  type VARARiskCategory,
  type VARAComplianceCheckResult,
  type IVARAServiceProvider,
  type VARAConditionEvaluatorConfig,
  VARAConditionEvaluator,

  // --- Modules: DLD Client ---
  type TitleDeedStatus,
  type PropertyType,
  type OwnershipType,
  type Owner,
  type TitleDeed,
  type TokenizationEligibility,
  type TokenizationNotification,
  type Valuation,
  // DldEvent — skipped (collides with core)
  type PropertySummary,
  DLDModule,

  // --- Modules: Property ---
  PropertyModule,
  type PropertyModuleSummary,

  // --- Modules: NAV ---
  NAVModule,
  type NAVRecord,
  type ValuationSource,
  type NAVWithSources,
  type NAVHistoryResponse,
  type ManualValuationInput,

  // --- Modules: Investor Tier ---
  InvestorTierModule,
  // InvestorTier (type) — skipped (collides with core)
  type InvestorPlan,
  type TierEligibilityResult,
  type TierViolation,
  type InvestorTierInfo,

  // --- Modules: Exit Window ---
  ExitWindowModule,
  type ExitWindow,
  type ExitWindowSchedule,
  // RedemptionRequest — skipped (collides with core)

  // --- Modules: Secondary Market ---
  SecondaryMarketModule,
  type SecondaryListing,
  type PurchaseResult,
  type SecondaryMarketCreateListingInput,

  // --- Modules: Legal ---
  LegalModule,
  type ConfigureKYCInput,
  type KYCConfiguration,
  type VerificationSession,
  type VerificationStatus,
  type FreezeResult,
  type UnfreezeResult,

  // --- Providers: DLD ---
  type IDLDProvider,
  type DLDProviderConfig,
  type DLDProviderFactory,
  type DLDProviderTitleDeedResult,
  type DLDProviderTokenizationEligibility,
  type DLDProviderTokenizationNotification,
  type TokenizationNotificationResult,
  type ValuationResult,
  type ValuationType,
  type DLDProviderOwner,
  type PropertyLocation,
  type DLDProviderTitleDeedStatus,
  type DLDProviderPropertyType,
  type DLDProviderOwnershipType,
  MockDLDProvider,
  createMockDLDProvider,
} from '@tokenisation/realestate';
