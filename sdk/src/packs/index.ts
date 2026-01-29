/**
 * Reference Packs
 *
 * Pre-configured templates for common tokenization use cases.
 * These demonstrate how to use the SDK for specific asset types.
 */

// Asset Pack Registry - Pre-built configurations with lifecycle rules
export * from './AssetPackRegistry.js';

// Pack A: UAE Real Estate - OWNERSHIP Right
export * from './UAERealEstate.js';

// Pack B: Event Ticket - ACCESS Right
export * from './EventTicket.js';

// Pack C: Driving/Loyalty Score - BEHAVIOR State
export * from './BehaviorScore.js';

// Pack D: Physical Asset (Ahoy Comet Bike) - OWNERSHIP
export * from './PhysicalAsset.js';

// Pack E: Verification Credentials (Education/IP) - VERIFICATION Right
export * from './VerificationCredential.js';

// Pack F: Loyalty Points - BEHAVIOR (fungible rewards)
export * from './LoyaltyPoints.js';

// Pack G: Warehouse Receipts - OWNERSHIP (supply chain)
export * from './WarehouseReceipt.js';

// Pack H: Airline Tickets - ACCESS (conditional transfer)
export * from './AirlineTicket.js';

// Pack K: Hotel Reservations - ACCESS (hospitality)
// Selective re-export to avoid duplicate symbols already exported by AirlineTicket/WarehouseReceipt
export {
  RoomType,
  HotelReservationStatus,
  type HotelReservationMetadata,
  HotelEventType,
  type HotelEvent,
  HotelRole,
  HotelReservationEngine,
  HOTEL_RESERVATION_PACK,
} from './HotelReservation.js';

// Pack L: Car Rental - ACCESS (mobility, deposit workflow)
export {
  VehicleCategory,
  CarRentalStatus,
  DepositStatus,
  type CarRentalMetadata,
  RentalRole,
  CarRentalEventType,
  type CarRentalEvent,
  CarRentalEngine,
  CAR_RENTAL_PACK,
} from './CarRental.js';

// Pack M: Concert Tickets - ACCESS (entertainment, anti-scalping)
export {
  SeatingTier,
  ConcertTicketStatus,
  type ConcertTicketMetadata,
  VenueRole,
  ConcertTicketEventType,
  type ConcertTicketEventRecord,
  ConcertTicketEngine,
  CONCERT_TICKET_PACK,
} from './ConcertTicket.js';

// Service Right Template - Shared utilities for service-right packs
export * from './ServiceRightTemplate.js';

// Jurisdiction-Specific Packs
// Pack I: Dubai Real Estate - UAE VARA compliant with DLD integration
export * from './dubai-real-estate.pack.js';

// Pack J: US Securities - SEC Regulation D compliant (506b/506c)
export * from './us-securities.pack.js';

// Cross-Pack Orchestration Layer
// Selective re-export to avoid AuditEntry conflict with audit/AuditLog
export * from '../orchestration/SharedIdentityRegistry.js';
export * from '../orchestration/CrossPackEventBus.js';
export * from '../orchestration/SagaOrchestrator.js';
export {
  type AuditEntry as OrchestrationAuditEntry,
  type AuditFilter,
  type IAuditLog,
  UnifiedAuditLog,
} from '../orchestration/UnifiedAuditLog.js';
export * from '../orchestration/FlightLandingOracle.js';
export * from '../orchestration/PortableComplianceReceipt.js';
export * from '../orchestration/ScopedAuditView.js';

// Custom Condition Evaluators
// DLD Condition Evaluator - Dubai Land Department verification
export * from './DLDConditionEvaluator.js';

// VARA Condition Evaluator - UAE VARA regulatory compliance
export * from './VARAConditionEvaluator.js';

// AssetPack Lifecycle Manager - Wires pack rules to the engine
export * from './AssetPackLifecycleManager.js';
