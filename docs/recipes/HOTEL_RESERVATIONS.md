---
sidebar_position: 2
title: Hotel Reservation Tokenisation
---

# Hotel Reservation Tokenisation

Tokenise hotel reservations as ERC-721 NFTs with full lifecycle management, room upgrades, stay extensions, automated no-show detection, and on-chain audit trails.

## Overview

The `HotelReservationNFT` contract represents each booking as a unique NFT. Reservations carry on-chain hotel data (property code, room type, check-in/out dates, nightly rate) and enforce hospitality-specific business rules at the contract level.

| Feature | Implementation |
|---|---|
| Standard | ERC-721 with custom transfer guards |
| Transfer window | Transfers blocked < 48 hours before check-in |
| Room upgrades | On-chain `updateRoomType` with versioned audit trail |
| Stay extension | `extendStay` modifies check-out date (payable) |
| No-show detection | Chainlink Automation marks no-show after check-in + 12 h |
| Auto-expiry | Chainlink Automation expires reservations check-out + 24 h |

## Lifecycle

```
CREATED --> CONFIRMED --> CHECKED_IN --> CHECKED_OUT --> CLOSED
               |              |
               |              +---> EXPIRED (auto, checkout + 24h)
               |
               +---> NO_SHOW (auto, checkin + 12h)

CREATED / CONFIRMED --> CANCELLED --> refund processed
                   \--> VOID (admin override)
```

### State Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| -- | CREATED | `createReservation` | Agent |
| CREATED | CONFIRMED | `confirmReservation` | Hotel |
| CONFIRMED | CHECKED_IN | `checkIn(tokenId, roomNumber)` | Hotel |
| CHECKED_IN | CHECKED_OUT | `checkOut` | Hotel |
| CHECKED_OUT | CLOSED | `closeReservation` | Hotel |
| CREATED / CONFIRMED | CANCELLED | `cancelReservation` | Hotel |
| CONFIRMED | NO_SHOW | `markNoShow` or Automation | Hotel / Keeper |
| CHECKED_IN / CHECKED_OUT | EXPIRED | Chainlink Automation | Keeper |
| Any | VOID | `voidReservation` | Admin |

## Smart Contract

### Deploying the Contract

```solidity
HotelReservationNFT hotel = new HotelReservationNFT(
    "AHOY Hotel Reservations",
    "AHOY-HTL",
    "https://api.ahoy.fund/metadata/hotel/"
);
```

### Creating a Reservation

```solidity
uint256 tokenId = hotel.createReservation{value: 0.3 ether}(
    guestWallet,        // to
    "HLT-NYC-001",      // hotelCode
    "Jane Doe",         // guestName
    "KING_DELUXE",      // roomType
    1735689600,         // checkInDate (Unix)
    1735948800,         // checkOutDate
    3,                  // nightCount
    150_00,             // rate (in smallest unit, e.g. cents)
    "USD",              // currency
    1,                  // maxTransfers
    true                // transferable
);
```

### Group Bookings

Create reservations for an entire group in a single transaction:

```solidity
uint256[] memory ids = hotel.batchCreateReservations(
    guests, hotelCode, guestNames, roomType,
    checkInDate, checkOutDate, nightCount,
    rate, currency, 1, true
);
```

## Room Upgrades

Hotels can upgrade a guest's room type at any point before the reservation is closed, expired, or voided. The change is recorded in the on-chain metadata history.

```solidity
// Upgrade from KING_DELUXE to PRESIDENTIAL_SUITE
hotel.updateRoomType(tokenId, "PRESIDENTIAL_SUITE");
```

After check-in, the physical room number can also be changed (e.g., for maintenance reasons):

```solidity
hotel.updateRoomNumber(tokenId, "PH-01");
```

## Stay Extensions

During an active stay (status `CHECKED_IN`), the hotel can extend the check-out date. The call is payable so additional payment can be collected on-chain.

```solidity
hotel.extendStay{value: 0.1 ether}(
    tokenId,
    1736035200,  // newCheckOutDate
    4            // newNightCount
);
```

Events emitted: `StayExtended`, `MetadataUpdated`.

## No-Show Detection

No-shows are detected in two ways:

1. **Manual** -- The hotel calls `markNoShow(tokenId)` when a confirmed guest fails to arrive.
2. **Automated** -- Chainlink Automation scans active reservations. If a `CONFIRMED` reservation is still unmodified 12 hours after its `checkInDate`, it is automatically marked `NO_SHOW`.

```solidity
// Automation configuration
hotel.setMinCheckInterval(3600);
hotel.setMaxReservationsPerUpkeep(50);
```

## Transfer Restrictions

| Rule | Value |
|---|---|
| Transfer window cutoff | 48 hours before check-in |
| Max transfers | Configurable per token (default 1) |
| Post-check-in lock | Transfers blocked after `CHECKED_IN` |

```solidity
(bool allowed, string memory reason) = hotel.canTransfer(tokenId);
```

## API Integration

### Create a Reservation via REST

```bash
curl -X POST https://api.ahoy.fund/v1/hotels/reservations \
  -H "X-API-Key: sk_live_..." \
  -H "Idempotency-Key: htl-res-20250615-janedoe" \
  -H "Content-Type: application/json" \
  -d '{
    "guest": "0xGuestAddress",
    "hotelCode": "HLT-NYC-001",
    "guestName": "Jane Doe",
    "roomType": "KING_DELUXE",
    "checkInDate": "2025-06-15",
    "checkOutDate": "2025-06-18",
    "nightCount": 3,
    "rate": 15000,
    "currency": "USD",
    "maxTransfers": 1,
    "transferable": true
  }'
```

### Check-in a Guest

```bash
curl -X POST https://api.ahoy.fund/v1/hotels/reservations/42/check-in \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "roomNumber": "1204" }'
```

### Extend Stay

```bash
curl -X POST https://api.ahoy.fund/v1/hotels/reservations/42/extend \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "newCheckOutDate": "2025-06-19",
    "newNightCount": 4,
    "additionalPayment": "0.1"
  }'
```

## Refund Flow

When a reservation is cancelled, the contract marks `refundPending[tokenId] = true`. The hotel then calls `processRefund(tokenId)` to release escrowed funds back to `originalBooker`.

```solidity
hotel.cancelReservation(tokenId, "Guest requested cancellation");
hotel.processRefund(tokenId); // Sends amountPaid back to guest
```

## Role-Based Access

| Role | Capabilities |
|---|---|
| **Owner** | Full admin: grant/revoke roles, pause, configure automation, withdraw funds |
| **Hotel** (`HOTEL_ROLE`) | Confirm, check-in, check-out, close, cancel, mark no-show, update metadata |
| **Agent** (`AGENT_ROLE`) | Create reservations, batch bookings |
| **Admin** (`ADMIN_ROLE`) | Void reservations (exceptional override) |
