---
sidebar_position: 3
title: Car Rental Tokenisation
---

# Car Rental Tokenisation

Tokenise car rental agreements as ERC-721 NFTs with deposit escrow, vehicle condition tracking, multi-step inspection flow, and Chainlink Automation for overdue and no-show detection.

## Overview

The `CarRentalNFT` contract represents each rental agreement as a unique NFT. Rentals carry on-chain vehicle data (category, make, model), pickup/return locations, daily rate, deposit amount, and insurance tier. The deposit is held in the contract itself as an escrow mechanism.

| Feature | Implementation |
|---|---|
| Standard | ERC-721 with custom transfer guards |
| Deposit escrow | `createRental` is `payable`; deposit held in contract until inspection |
| Vehicle condition | Mileage and fuel level recorded at pickup and return |
| Damage tracking | `damageReport` string stored on-chain during return |
| Inspection flow | Three-way deposit resolution: release, partial charge, full charge |
| Automation | Chainlink Automation for overdue expiry (return + 24 h) and no-show (pickup + 12 h) |

## Lifecycle

```
CREATED --> CONFIRMED --> PICKED_UP --> RETURNED --> INSPECTED --> CLOSED
               |
               +---> NO_SHOW (auto, pickup + 12h)
               |
               +---> CANCELLED (deposit released)

PICKED_UP / RETURNED --> EXPIRED (auto, return + 24h)

Any --> VOID (admin override, deposit released)
```

### State Transitions

| From | To | Trigger | Actor |
|---|---|---|---|
| -- | CREATED | `createRental` (payable) | Agent |
| CREATED | CONFIRMED | `confirmRental` | Rental Company |
| CONFIRMED | PICKED_UP | `confirmPickup(tokenId, mileage, fuelLevel)` | Rental Company |
| PICKED_UP | RETURNED | `processReturn(tokenId, mileage, fuelLevel, damageReport)` | Rental Company |
| RETURNED | INSPECTED | `inspectVehicle(tokenId, resolution, chargeAmount)` | Rental Company |
| INSPECTED | CLOSED | `closeRental` | Rental Company |
| CREATED / CONFIRMED | CANCELLED | `cancelRental` | Rental Company |
| CONFIRMED | NO_SHOW | `markNoShow` or Automation | Rental Company / Keeper |
| PICKED_UP / RETURNED | EXPIRED | Chainlink Automation | Keeper |
| Any | VOID | `voidRental` | Admin |

## Smart Contract

### Deploying the Contract

```solidity
CarRentalNFT rental = new CarRentalNFT(
    "AHOY Car Rentals",
    "AHOY-CAR",
    "https://api.ahoy.fund/metadata/car-rental/"
);
```

### Creating a Rental with Deposit

The deposit is sent as `msg.value` and held in the contract until inspection:

```solidity
uint256 tokenId = rental.createRental{value: 0.5 ether}(
    renterWallet,      // to
    "HTZ",             // rentalCompanyCode
    "John Smith",      // driverName
    "SUV",             // vehicleCategory
    "Toyota",          // vehicleMake
    "RAV4",            // vehicleModel
    1735689600,        // pickupDate (Unix)
    1736035200,        // returnDate
    "LAX-T1",          // pickupLocation
    "LAX-T1",          // returnLocation
    75_00,             // dailyRate (cents)
    0.5 ether,         // depositAmount (must match msg.value)
    CarRentalNFT.InsuranceType.STANDARD,
    1,                 // maxTransfers
    true               // transferable
);
```

## Deposit Escrow

The deposit lifecycle is a critical part of the car rental flow:

```
createRental (deposit HELD)
        |
        v
    INSPECTION
   /     |      \
RELEASED  PARTIALLY   FULLY
          CHARGED     CHARGED
```

### Deposit Resolution During Inspection

After the vehicle is returned and inspected, the rental company resolves the deposit:

```solidity
// No damage -- full refund to renter
rental.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.RELEASED, 0);

// Minor damage -- charge 0.1 ETH, refund remaining 0.4 ETH
rental.inspectVehicle(
    tokenId,
    CarRentalNFT.DepositStatus.PARTIALLY_CHARGED,
    0.1 ether
);

// Major damage -- keep entire deposit
rental.inspectVehicle(
    tokenId,
    CarRentalNFT.DepositStatus.FULLY_CHARGED,
    0.5 ether
);
```

### Cancellation Refund

When a rental is cancelled before pickup, the entire deposit is automatically returned:

```solidity
rental.cancelRental(tokenId, "Customer requested cancellation");
// Deposit is released back to originalRenter
```

## Vehicle Condition Tracking

Condition is recorded at two checkpoints:

**At pickup** (`confirmPickup`):

```solidity
rental.confirmPickup(
    tokenId,
    15230,   // odometer reading (miles)
    95       // fuel level (0-100%)
);
```

**At return** (`processReturn`):

```solidity
rental.processReturn(
    tokenId,
    15890,                    // return mileage
    72,                       // return fuel level
    "Minor scratch on rear bumper"  // damage report (empty if none)
);
```

The difference between pickup and return readings is available on-chain:

```solidity
CarRentalNFT.RentalData memory data = rental.getRentalData(tokenId);
uint256 milesDriven = data.returnMileage - data.pickupMileage;
int8 fuelDelta = int8(data.returnFuelLevel) - int8(data.pickupFuelLevel);
```

## Rental Extensions

During an active rental (`CONFIRMED` or `PICKED_UP`), the return date can be extended:

```solidity
rental.extendRental{value: 0.05 ether}(
    tokenId,
    1736121600   // newReturnDate (must be after current returnDate)
);
```

## Transfer Restrictions

| Rule | Value |
|---|---|
| Transfer window cutoff | 24 hours before pickup |
| Max transfers | Configurable per token |
| Post-pickup lock | Transfers blocked after `PICKED_UP` |

```solidity
(bool allowed, string memory reason) = rental.canTransfer(tokenId);
```

## API Integration

### Create a Rental via REST

```bash
curl -X POST https://api.ahoy.fund/v1/car-rentals \
  -H "X-API-Key: sk_live_..." \
  -H "Idempotency-Key: rental-HTZ-20250615-jsmith" \
  -H "Content-Type: application/json" \
  -d '{
    "renter": "0xRenterAddress",
    "rentalCompanyCode": "HTZ",
    "driverName": "John Smith",
    "vehicleCategory": "SUV",
    "vehicleMake": "Toyota",
    "vehicleModel": "RAV4",
    "pickupDate": "2025-06-15T10:00:00Z",
    "returnDate": "2025-06-19T10:00:00Z",
    "pickupLocation": "LAX-T1",
    "returnLocation": "LAX-T1",
    "dailyRate": 7500,
    "depositAmount": "0.5",
    "insuranceType": "STANDARD",
    "maxTransfers": 1,
    "transferable": true
  }'
```

### Process Return and Inspection

```bash
# Return vehicle
curl -X POST https://api.ahoy.fund/v1/car-rentals/42/return \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "mileage": 15890,
    "fuelLevel": 72,
    "damageReport": ""
  }'

# Inspect and release deposit
curl -X POST https://api.ahoy.fund/v1/car-rentals/42/inspect \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "RELEASED",
    "chargeAmount": "0"
  }'
```

## Chainlink Automation

Register the contract with Chainlink Automation to enable:

- **Overdue expiry**: Rentals not returned within 24 hours after `returnDate` are marked `EXPIRED`.
- **No-show detection**: Confirmed rentals where the renter does not pick up within 12 hours after `pickupDate` are marked `NO_SHOW`.

```solidity
rental.setMinCheckInterval(3600);
rental.setMaxRentalsPerUpkeep(50);
```

## Role-Based Access

| Role | Capabilities |
|---|---|
| **Owner** | Full admin: grant/revoke roles, pause, configure automation, withdraw non-escrowed funds |
| **Rental Company** (`RENTAL_COMPANY_ROLE`) | Confirm, pickup, return, inspect, close, cancel, mark no-show, extend, update vehicle/locations |
| **Agent** (`AGENT_ROLE`) | Create rentals, batch bookings |
| **Admin** (`ADMIN_ROLE`) | Void rentals (exceptional override, deposit released) |
