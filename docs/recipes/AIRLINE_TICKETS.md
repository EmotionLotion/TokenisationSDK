---
sidebar_position: 1
title: Airline Ticket Tokenisation
---

# Airline Ticket Tokenisation

Tokenise airline tickets as ERC-721 NFTs with burn-after-use semantics, dynamic metadata for gate and seat changes, anti-scalping transfer controls, and Chainlink Automation for auto-expiry and refunds.

## Overview

The `AirlineTicketNFT` contract represents each ticket as a unique NFT. Tickets carry on-chain flight data (flight number, departure/arrival airports and times, gate, seat, class) and enforce airline-specific business rules at the smart-contract level.

| Feature | Implementation |
|---|---|
| Standard | ERC-721 with custom transfer guards |
| Anti-scalping | `maxTransfers` per token, 24-hour transfer window cutoff |
| Burn-after-use | NFT destroyed after boarding completion or refund |
| Dynamic metadata | On-chain gate/seat/delay updates with versioned audit trail |
| Automation | Chainlink Automation for auto-expire (departure + 6 h) and auto-refund |

## Lifecycle

```
ISSUED --> CHECKED_IN --> BOARDED --> COMPLETED (burned)
  |
  +------> CANCELLED --> REFUNDED (burned)
  |
  +------> EXPIRED (auto, departure + 6h)
```

### State Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| -- | ISSUED | `issueTicket` | Agent |
| ISSUED | CHECKED_IN | `checkIn` | Agent |
| CHECKED_IN | BOARDED | `board` | Agent |
| BOARDED | COMPLETED | `completeAndBurn` | Airline |
| ISSUED / CONFIRMED / CHECKED_IN | CANCELLED | `cancelTicket` | Airline |
| CANCELLED | REFUNDED | `processRefund` | Airline |
| ISSUED / CONFIRMED / CHECKED_IN | EXPIRED | Chainlink Automation | Keeper |

## Smart Contract

### Deploying the Contract

```solidity
AirlineTicketNFT ticket = new AirlineTicketNFT(
    "AHOY Airline Tickets",   // collection name
    "AHOY-AIR",               // symbol
    "https://api.ahoy.fund/metadata/airline/"  // base URI
);
```

### Issuing a Ticket

```solidity
uint256 tokenId = ticket.issueTicket{value: 0.5 ether}(
    passengerWallet,     // to
    "EK123",             // flightNumber
    "EK",                // airline
    1735689600,          // departureTime (Unix)
    1735718400,          // arrivalTime
    "DXB",               // departureAirport
    "LHR",               // arrivalAirport
    "B22",               // gate
    "12A",               // seat
    AirlineTicketNFT.TicketClass.BUSINESS,
    2,                   // maxTransfers
    true                 // transferable
);
```

### Batch Issuance

Issue tickets for an entire flight manifest in one transaction:

```solidity
uint256[] memory ids = ticket.batchIssueTickets(
    passengers, flightNumber, airline,
    departureTime, arrivalTime,
    departureAirport, arrivalAirport,
    gates, seats, classes,
    2,    // maxTransfers
    true  // transferable
);
```

## Transfer Restrictions (Anti-Scalping)

The contract enforces three layers of transfer protection:

1. **Transfer window cutoff** -- Transfers are blocked when `block.timestamp >= departureTime - 24 hours`. This prevents last-minute speculative resale.
2. **Max transfer count** -- Each ticket has a `maxTransfers` cap (typically 1-3). Once reached, further transfers revert.
3. **Post-check-in lock** -- After `checkIn` is called, the token becomes non-transferable.

```solidity
// Check transferability before attempting a transfer
(bool allowed, string memory reason) = ticket.canTransfer(tokenId);
```

## Dynamic Metadata

Airlines frequently update gate assignments, seats, and departure times. These are recorded on-chain with full audit history.

```solidity
// Gate change
ticket.updateGate(tokenId, "C14");

// Seat upgrade
ticket.updateSeat(tokenId, "1A", AirlineTicketNFT.TicketClass.FIRST);

// Flight delay
ticket.updateDepartureTime(tokenId, newDeparture, newArrival);
```

Every update increments `metadataVersion` and appends to the on-chain `MetadataChange[]` log:

```solidity
MetadataChange[] memory history = ticket.getMetadataHistory(tokenId);
```

## Boarding Pass Generation

Use the REST API to generate Apple Wallet / Google Wallet boarding passes from the on-chain ticket data:

```bash
# Generate a boarding pass for a checked-in ticket
curl -X POST https://api.ahoy.fund/v1/boarding-passes \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": 42,
    "contractAddress": "0x...",
    "format": "apple_wallet"
  }'
```

The response contains a signed `.pkpass` or Google Wallet JWT that updates dynamically when gate or seat metadata changes on-chain.

## API Integration

### Issue a Ticket via REST

```bash
curl -X POST https://api.ahoy.fund/v1/tickets \
  -H "X-API-Key: sk_live_..." \
  -H "Idempotency-Key: flight-EK123-seat-12A" \
  -H "Content-Type: application/json" \
  -d '{
    "passenger": "0xPassengerAddress",
    "flightNumber": "EK123",
    "airline": "EK",
    "departureTime": "2025-06-15T14:00:00Z",
    "arrivalTime": "2025-06-15T21:00:00Z",
    "departureAirport": "DXB",
    "arrivalAirport": "LHR",
    "gate": "B22",
    "seat": "12A",
    "ticketClass": "BUSINESS",
    "maxTransfers": 2,
    "transferable": true
  }'
```

### Check In

```bash
curl -X POST https://api.ahoy.fund/v1/tickets/42/check-in \
  -H "X-API-Key: sk_live_..."
```

## Chainlink Automation

The contract implements `AutomationCompatibleInterface`. Register it with Chainlink Automation to enable:

- **Auto-expiry**: Tickets not boarded within 6 hours after departure are marked `EXPIRED`.
- **Auto-refund**: Cancelled tickets with pending refunds are processed and the NFT is burned.

```solidity
// Configuration
ticket.setMinCheckInterval(3600);      // check every hour
ticket.setMaxTicketsPerUpkeep(50);     // process up to 50 per call
```

## Role-Based Access

| Role | Capabilities |
|---|---|
| **Owner** | Full admin: add/remove airlines and agents, pause, configure automation |
| **Airline** | Lifecycle operations: cancel, complete, update metadata, process refunds |
| **Agent** | Issue tickets, check in, board passengers |
