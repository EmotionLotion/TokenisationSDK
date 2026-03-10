/**
 * Reference Packs
 *
 * Generic, asset-class-agnostic pack infrastructure.
 * Vertical-specific packs live in their own packages:
 * - @tokenisation/realestate
 * - @tokenisation/compute
 * - @tokenisation/pack-travel
 * - @tokenisation/pack-loyalty
 * - @tokenisation/pack-securities
 * - @tokenisation/pack-supply-chain
 */

// Pack Manifest — Declarative pack description and registry
export * from './PackManifest.js';

// Asset Pack Registry - Pre-built configurations with lifecycle rules
export * from './AssetPackRegistry.js';

// Cross-Pack Orchestration Layer
export * from '../orchestration/SharedIdentityRegistry.js';
export * from '../orchestration/CrossPackEventBus.js';
export * from '../orchestration/SagaOrchestrator.js';
export {
  type AuditEntry as OrchestrationAuditEntry,
  type AuditFilter,
  type IAuditLog,
  UnifiedAuditLog,
} from '../orchestration/UnifiedAuditLog.js';
export * from '../orchestration/PortableComplianceReceipt.js';
export * from '../orchestration/ScopedAuditView.js';

// AssetPack Lifecycle Manager - Wires pack rules to the engine
export * from './AssetPackLifecycleManager.js';

// EventTicket — Generic event access token
export * from './EventTicket.js';

// ServiceRightTemplate — Generic service right factory
export * from './ServiceRightTemplate.js';

// ============================================================================
// @deprecated — Vertical pack re-exports for backward compatibility.
// Import from the dedicated pack package instead:
//   @tokenisation/pack-travel  (airline, hotel, car rental, concert)
//   @tokenisation/compute      (GPU compute)
//   @tokenisation/pack-loyalty (loyalty, behavior, reputation)
//   @tokenisation/pack-supply-chain (warehouse, verification, physical)
// These re-exports will be removed in the next major version.
//
// NOTE: Several pack files export identically-named types (ActorContext,
// FreezeRecord, IDistributedLock, InMemoryDistributedLock, MetadataVersion,
// RBACPermission, TransferApprovalStatus, TransferRequest, TransferRecord).
// The AirlineTicket versions are exported un-aliased; others are prefixed.
// ============================================================================

/** @deprecated Import from @tokenisation/pack-travel */
export {
  // Enums
  TicketClass,
  TicketStatus,
  TransferApprovalStatus,
  AirlineRole,
  TransferReason,
  RevocationReason,
  CustodyModel,
  AirlineEventType,
  // Interfaces / types
  type FlightSegment,
  type AirlineTicketMetadata,
  type TicketTransferRecord,
  type TransferRequest,
  type ResaleFeeConfig,
  type ResaleFeeLedgerEntry,
  type ActorContext,
  type RBACPermission,
  type IDistributedLock,
  type MetadataVersion,
  type BulkUpdateResult,
  type ReconciliationEntry,
  type ReconciliationReport,
  type RebookRecord,
  type VerificationLog,
  type AirlinePolicyFlags,
  type RevocationRecord,
  type OverrideRecord,
  type FreezeRecord,
  type RecoveryRequest,
  type AirlineEvent,
  type AirlineWebhookConfig,
  type WebhookDelivery,
  type DeadLetterEntry,
  type WebhookPayloadWithSecurity,
  type AuditLogEntry,
  type IPSSAdapter,
  type IDCSAdapter,
  // Classes
  InMemoryDistributedLock,
  AirlineTicketEngine,
  // Constants
  AIRLINE_TICKET_PACK,
  // Default export
  default as AirlineTicketEngineDefault,
} from './AirlineTicket.js';

/** @deprecated Import from @tokenisation/pack-travel */
export {
  // Enums
  VehicleCategory,
  CarRentalStatus,
  DepositStatus,
  RentalRole,
  CarRentalEventType,
  TransferApprovalStatus as CarRentalTransferApprovalStatus,
  // Interfaces / types
  type CarRentalMetadata,
  type TransferRecord as CarRentalTransferRecord,
  type TransferRequest as CarRentalTransferRequest,
  type ActorContext as CarRentalActorContext,
  type RBACPermission as CarRentalRBACPermission,
  type IDistributedLock as CarRentalIDistributedLock,
  type MetadataVersion as CarRentalMetadataVersion,
  type CarRentalEvent,
  type FreezeRecord as CarRentalFreezeRecord,
  // Classes
  InMemoryDistributedLock as CarRentalInMemoryDistributedLock,
  CarRentalEngine,
  // Constants
  CAR_RENTAL_PACK,
  // Default export
  default as CarRentalEngineDefault,
} from './CarRental.js';

/** @deprecated Import from @tokenisation/pack-travel */
export {
  // Enums
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
  ConcertTicketEventType,
  TransferApprovalStatus as ConcertTransferApprovalStatus,
  // Interfaces / types
  type ConcertTicketMetadata,
  type TransferRecord as ConcertTransferRecord,
  type TransferRequest as ConcertTransferRequest,
  type ActorContext as ConcertActorContext,
  type RBACPermission as ConcertRBACPermission,
  type IDistributedLock as ConcertIDistributedLock,
  type MetadataVersion as ConcertMetadataVersion,
  type ConcertTicketEventRecord,
  type FreezeRecord as ConcertFreezeRecord,
  // Classes
  InMemoryDistributedLock as ConcertInMemoryDistributedLock,
  ConcertTicketEngine,
  // Constants
  CONCERT_TICKET_PACK,
  // Default export
  default as ConcertTicketEngineDefault,
} from './ConcertTicket.js';

/** @deprecated Import from @tokenisation/pack-travel */
export {
  // Enums
  RoomType,
  HotelReservationStatus,
  HotelRole,
  HotelEventType,
  TransferApprovalStatus as HotelTransferApprovalStatus,
  // Interfaces / types
  type HotelReservationMetadata,
  type TransferRecord as HotelTransferRecord,
  type TransferRequest as HotelTransferRequest,
  type ActorContext as HotelActorContext,
  type RBACPermission as HotelRBACPermission,
  type IDistributedLock as HotelIDistributedLock,
  type MetadataVersion as HotelMetadataVersion,
  type HotelEvent,
  type FreezeRecord as HotelFreezeRecord,
  // Classes
  InMemoryDistributedLock as HotelInMemoryDistributedLock,
  HotelReservationEngine,
  // Constants
  HOTEL_RESERVATION_PACK,
  // Default export
  default as HotelReservationEngineDefault,
} from './HotelReservation.js';

/** @deprecated Import from @tokenisation/compute */
export {
  type GPUComputeConfig,
  GPUComputePack,
  createGPUComputeToken,
} from './GPUCompute.js';

/** @deprecated Import from @tokenisation/pack-loyalty */
export {
  type LoyaltyProgramConfig,
  type LoyaltyPointsMetadata,
  type PointBalance,
  type PointBatch,
  type MintRecord,
  type FraudFlag,
  LoyaltyPointsEngine,
  LOYALTY_POINTS_PACK,
  default as LoyaltyPointsEngineDefault,
} from './LoyaltyPoints.js';

/** @deprecated Import from @tokenisation/pack-loyalty */
export {
  type BehaviorScoreConfig,
  BehaviorScorePack,
  createDrivingScore,
  createLoyaltyScore,
} from './BehaviorScore.js';

/** @deprecated Import from @tokenisation/pack-supply-chain */
export {
  type PhysicalAssetConfig,
  PhysicalAssetPack,
  createAhoyCometBike,
  createCollectible,
} from './PhysicalAsset.js';

/** @deprecated Import from @tokenisation/pack-supply-chain */
export {
  type CredentialType,
  type VerificationCredentialConfig,
  VerificationCredentialPack,
  createEducationalDegree,
  createCarbonCredit,
  createProfessionalLicense,
} from './VerificationCredential.js';

/** @deprecated Import from @tokenisation/pack-supply-chain */
export {
  // Enums
  DocumentType,
  DocumentStatus,
  // Interfaces / types
  type WarehouseReceiptMetadata,
  type TransferRecord as WarehouseTransferRecord,
  type Operator,
  type Dispute,
  // Classes
  WarehouseReceiptEngine,
  // Constants
  WAREHOUSE_RECEIPT_PACK,
  // Default export
  default as WarehouseReceiptEngineDefault,
} from './WarehouseReceipt.js';
