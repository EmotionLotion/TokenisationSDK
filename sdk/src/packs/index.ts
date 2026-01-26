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
