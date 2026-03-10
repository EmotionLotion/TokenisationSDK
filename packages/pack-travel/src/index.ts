/**
 * @tokenisation/pack-travel
 *
 * Travel & Hospitality vertical pack for the Tokenisation SDK.
 * Includes airline tickets, hotel reservations, car rentals, concert tickets,
 * PSS (Passenger Service System) connectors, and flight landing oracle.
 *
 * @example
 * ```typescript
 * import { PackRegistry } from '@tokenisation/core';
 * import { travelPack } from '@tokenisation/pack-travel';
 *
 * const registry = new PackRegistry();
 * await registry.load(travelPack);
 * ```
 */

import type { LoadedPack } from '@tokenisation/core';
import { manifest } from './manifest.js';

// ============================================================================
// Pack Loader
// ============================================================================

export const travelPack: LoadedPack = {
  manifest,
  activate: (context) => {
    // Register travel-specific workflows when the pack is loaded
    // Vertical workflows will be added here as they're migrated from GoldenPath
  },
};

// ============================================================================
// Re-export manifest
// ============================================================================

export { manifest } from './manifest.js';

// ============================================================================
// Airline Ticket
// ============================================================================

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
} from './packs/AirlineTicket.js';

// ============================================================================
// Car Rental
// ============================================================================

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
} from './packs/CarRental.js';

// ============================================================================
// Concert Ticket
// ============================================================================

export {
  ConcertTicketEngine,
  SeatingTier,
  ConcertTicketStatus,
  VenueRole,
  ConcertTicketEventType,
  CONCERT_TICKET_PACK,
  type ConcertTicketMetadata,
  type ConcertTicketEventRecord,
} from './packs/ConcertTicket.js';

// ============================================================================
// Hotel Reservation
// ============================================================================

export {
  HotelReservationEngine,
  RoomType,
  HotelReservationStatus,
  HotelRole,
  HotelEventType,
  HOTEL_RESERVATION_PACK,
  type HotelReservationMetadata,
  type HotelEvent,
} from './packs/HotelReservation.js';

// ============================================================================
// State Machines (namespaced to avoid collisions between verticals)
// ============================================================================

export * as AirlineStateMachine from './packs/AirlineTicketStateMachine.js';
export * as CarRentalStateMachine from './packs/CarRentalStateMachine.js';
export * as ConcertStateMachine from './packs/ConcertTicketStateMachine.js';
export * as HotelStateMachine from './packs/HotelReservationStateMachine.js';

// ============================================================================
// PSS Connectors
// ============================================================================

export * from './connectors/pss/index.js';

// ============================================================================
// Flight Landing Oracle
// ============================================================================

export * from './orchestration/FlightLandingOracle.js';

// ============================================================================
// UI Components
// ============================================================================

export {
  FlightSelector,
  type Flight,
  type FlightSelectorProps,
} from './components/FlightSelector.js';

export {
  BoardingPass,
  type BoardingPassProps,
} from './components/BoardingPass.js';

export {
  RoomSelector,
  type Room,
  type RoomSelectorProps,
} from './components/RoomSelector.js';

export {
  RentalCalendar,
  type DateRange,
  type RentalCalendarProps,
} from './components/RentalCalendar.js';

export {
  SeatSelectionMap,
  type Section,
  type SeatSelectionMapProps,
} from './components/SeatSelectionMap.js';

// ============================================================================
// React Hooks
// ============================================================================

export * from './hooks/index.js';
