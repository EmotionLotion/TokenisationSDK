/**
 * Reference Packs
 *
 * Pre-configured templates for common tokenization use cases.
 * Real estate packs (UAE, DLD, VARA) live in @tokenisation/realestate.
 */

// Asset Pack Registry - Pre-built configurations with lifecycle rules
export * from './AssetPackRegistry.js';

// Pack J: US Securities - SEC Regulation D compliant (506b/506c)
export * from './us-securities.pack.js';

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

// Individual Asset Packs — explicit exports to avoid name collisions
// Shared types are taken from AirlineTicket (first defined), others aliased

// AirlineTicket (defines canonical ActorContext, TransferRequest, etc.)
// FlightSegment skipped — collides with connectors/pss/types.ts
export {
  AirlineTicketEngine,
  TicketClass,
  TicketStatus,
  TransferApprovalStatus,
  AirlineRole,
  TransferReason,
  RevocationReason,
  CustodyModel,
  AirlineEventType,
  InMemoryDistributedLock,
  type FlightSegment as AirlineFlightSegment,
  type AirlineTicketMetadata,
  type TicketTransferRecord,
  type TransferRequest,
  type ResaleFeeConfig,
  type ResaleFeeLedgerEntry,
  type ActorContext,
  type RBACPermission,
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
  type RecoveryRequest as AirlineRecoveryRequest,
  type AirlineEvent,
  type AirlineWebhookConfig,
  type IDistributedLock,
} from './AirlineTicket.js';
// FlightSegment comes from connectors/pss/types.js (identical interface)
export * from './AirlineTicketStateMachine.js';

// CarRental — explicit to avoid collisions with AirlineTicket
export {
  CarRentalEngine,
  VehicleCategory,
  CarRentalStatus,
  DepositStatus,
  RentalRole,
  CarRentalEventType,
  CAR_RENTAL_PACK,
  type CarRentalMetadata,
  type CarRentalEvent,
  TransferApprovalStatus as CarRentalTransferApprovalStatus,
} from './CarRental.js';

// ConcertTicket — explicit to avoid collisions
export {
  ConcertTicketEngine,
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
  ConcertTicketEventType,
  CONCERT_TICKET_PACK,
  type ConcertTicketMetadata,
  type ConcertTicketEventRecord,
} from './ConcertTicket.js';

// HotelReservation — explicit to avoid collisions
export {
  HotelReservationEngine,
  RoomType,
  HotelReservationStatus,
  HotelRole,
  HotelEventType,
  HOTEL_RESERVATION_PACK,
  type HotelReservationMetadata,
  type HotelEvent,
} from './HotelReservation.js';

// Other packs (these have unique names or minimal overlap)
export * from './EventTicket.js';
export * from './GPUCompute.js';
export * from './LoyaltyPoints.js';
export * from './PhysicalAsset.js';
export * from './BehaviorScore.js';
export * from './ServiceRightTemplate.js';
export * from './VerificationCredential.js';
export * from './WarehouseReceipt.js';
