---
sidebar_position: 4
title: Concert Ticket Tokenisation
---

# Concert Ticket Tokenisation

Tokenise concert and live event tickets as ERC-721 NFTs with on-chain anti-scalping price caps, seating tier enforcement, QR-code gate scanning, and Chainlink Automation for post-event expiry.

## Overview

The `ConcertTicketNFT` contract represents each ticket as a unique NFT. Tickets carry on-chain event data (venue, artist, event date, doors-open time) and seating information (section, row, seat, tier). The key differentiator from generic ticketing is the anti-scalping mechanism: the contract enforces a `resalePriceCap` on every transfer.

| Feature | Implementation |
|---|---|
| Standard | ERC-721 with `payable` `transferFrom` for price-cap enforcement |
| Anti-scalping | `resalePriceCap` per token; transfer reverts if `msg.value > cap` |
| Seating tiers | `GA`, `FLOOR`, `LOWER`, `UPPER`, `VIP`, `BACKSTAGE` |
| Age verification | On-chain `ageVerified` flag for restricted events |
| Gate admission | `admitFan` called at venue gate scan |
| Auto-expiry | Chainlink Automation expires unused tickets 6 hours post-event |

## Lifecycle

```
ISSUED --> ADMITTED --> USED --> CLOSED
  |
  +---> CANCELLED --> REFUNDED
  |
  +---> EXPIRED (auto, event + 6h)
  |
  +---> VOID (admin override)
```

### State Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| -- | ISSUED | `issueTicket` | Agent |
| ISSUED | ADMITTED | `admitFan` | Venue |
| ADMITTED | USED | `markUsed` | Venue |
| USED | CLOSED | `closeTicket` | Venue |
| CREATED / ISSUED | CANCELLED | `cancelTicket` | Venue |
| CANCELLED | REFUNDED | `refundTicket` | Venue |
| CREATED / ISSUED / ADMITTED | EXPIRED | Chainlink Automation | Keeper |
| Any | VOID | `voidTicket` | Admin |

## Smart Contract

### Deploying the Contract

```solidity
ConcertTicketNFT concert = new ConcertTicketNFT(
    "AHOY Concert Tickets",
    "AHOY-TIX",
    "https://api.ahoy.fund/metadata/concert/"
);
```

### Issuing a Ticket

```solidity
uint256 tokenId = concert.issueTicket{value: 0.08 ether}(
    fanWallet,          // to
    "MSG-NYC",          // venueCode
    "Madison Square Garden", // venueName
    "World Tour 2025",  // eventName
    "Coldplay",         // artist
    1735689600,         // eventDate (Unix)
    1735682400,         // doorsOpen (2 hours before)
    "FLOOR",            // section
    "A",                // row
    "12",               // seatNumber
    ConcertTicketNFT.SeatingTier.FLOOR,
    0.08 ether,         // faceValue
    0.12 ether,         // resalePriceCap (150% of face)
    "Alice Fan",        // fanName
    2,                  // maxTransfers
    true                // transferable
);
```

### Batch Issuance

Issue an entire section of tickets in one transaction:

```solidity
uint256[] memory ids = concert.batchIssueTickets(
    fans, venueCode, venueName, eventName, artist,
    eventDate, doorsOpen,
    sections, rows, seatNumbers, tiers,
    faceValue, resalePriceCap, fanNames,
    2, true
);
```

## Anti-Scalping Mechanism

The `ConcertTicketNFT` contract makes `transferFrom` a `payable` function. When a transfer includes `msg.value`, the contract checks it against `resalePriceCap`:

```solidity
// In _transferTicket:
if (ticket.resalePriceCap > 0 && msg.value > ticket.resalePriceCap) {
    revert ResalePriceExceeded(tokenId, msg.value, ticket.resalePriceCap);
}
```

If the transfer is valid, the payment is forwarded to the seller:

```solidity
// Payment forwarded to seller
if (msg.value > 0) {
    (bool success, ) = payable(from).call{value: msg.value}("");
    require(success, "ConcertTicketNFT: payment forwarding failed");
}
```

### Price Cap Strategies

| Strategy | `resalePriceCap` | Description |
|---|---|---|
| No resale | `0` | Ticket is transferable but no payment allowed |
| Face value | `== faceValue` | Resale at original price only |
| 150% cap | `faceValue * 1.5` | Allow modest markup |
| Uncapped | `type(uint256).max` | No price restriction |

The venue can update the cap before admission:

```solidity
concert.updateResalePriceCap(tokenId, 0.10 ether);
```

## QR Code Verification

The API generates QR codes for gate scanning. Each QR encodes a signed payload that the venue scanner verifies:

```bash
# Generate a scannable QR code for a ticket
curl -X POST https://api.ahoy.fund/v1/concerts/tickets/42/qr \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "format": "svg" }'
```

The QR payload contains:

```json
{
  "tokenId": 42,
  "contractAddress": "0x...",
  "owner": "0xFanAddress",
  "eventDate": 1735689600,
  "section": "FLOOR",
  "row": "A",
  "seat": "12",
  "signature": "0x..."
}
```

When the QR is scanned at the gate, the venue backend verifies the signature, confirms on-chain ownership, and calls `admitFan`:

```bash
curl -X POST https://api.ahoy.fund/v1/concerts/tickets/42/admit \
  -H "X-API-Key: sk_live_..."
```

## Transfer Restrictions

| Rule | Value |
|---|---|
| Transfer window cutoff | 24 hours before event |
| Max transfers | Configurable per token |
| Post-admission lock | Transfers blocked after `ADMITTED` |
| Anti-scalping | `msg.value` must not exceed `resalePriceCap` |

```solidity
(bool allowed, string memory reason) = concert.canTransfer(tokenId);
```

## Age Verification

For age-restricted events, the venue can set the `ageVerified` flag:

```solidity
concert.verifyAge(tokenId);
```

This flag can be checked at admission to ensure compliance with local regulations.

## Dynamic Metadata

Events are rescheduled, seats are reassigned. The contract supports on-chain updates:

```solidity
// Reschedule event
concert.updateEventDate(tokenId, newEventDate, newDoorsOpen);

// Reassign seat (e.g., upgrade)
concert.updateSeat(tokenId, "VIP", "1", "1", ConcertTicketNFT.SeatingTier.VIP);
```

## API Integration

### Issue a Ticket via REST

```bash
curl -X POST https://api.ahoy.fund/v1/concerts/tickets \
  -H "X-API-Key: sk_live_..." \
  -H "Idempotency-Key: concert-msg-coldplay-floor-a-12" \
  -H "Content-Type: application/json" \
  -d '{
    "fan": "0xFanAddress",
    "venueCode": "MSG-NYC",
    "venueName": "Madison Square Garden",
    "eventName": "World Tour 2025",
    "artist": "Coldplay",
    "eventDate": "2025-06-15T20:00:00Z",
    "doorsOpen": "2025-06-15T18:00:00Z",
    "section": "FLOOR",
    "row": "A",
    "seatNumber": "12",
    "seatingTier": "FLOOR",
    "faceValue": "0.08",
    "resalePriceCap": "0.12",
    "fanName": "Alice Fan",
    "maxTransfers": 2,
    "transferable": true
  }'
```

### Cancel and Refund

```bash
# Cancel ticket
curl -X POST https://api.ahoy.fund/v1/concerts/tickets/42/cancel \
  -H "X-API-Key: sk_live_..." \
  -d '{ "reason": "Event cancelled by promoter" }'

# Process refund
curl -X POST https://api.ahoy.fund/v1/concerts/tickets/42/refund \
  -H "X-API-Key: sk_live_..."
```

## Chainlink Automation

Register the contract with Chainlink Automation to enable:

- **Auto-expiry**: Tickets not used within 6 hours after `eventDate` are marked `EXPIRED` and removed from active tracking.

```solidity
concert.setMinCheckInterval(3600);
concert.setMaxTicketsPerUpkeep(50);
```

## Role-Based Access

| Role | Capabilities |
|---|---|
| **Owner** | Full admin: grant/revoke roles, pause, configure automation, withdraw funds |
| **Venue** (`VENUE_ROLE`) | Admit fans, mark used, close, cancel, refund, update metadata, verify age |
| **Agent** (`AGENT_ROLE`) | Issue tickets, batch issuance |
| **Admin** (`ADMIN_ROLE`) | Void tickets (exceptional override) |
