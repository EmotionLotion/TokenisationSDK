import { db, schema, getDbMode } from '../config/database.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import * as relayerService from './relayer.service.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// SQLite compatibility helpers: Drizzle pgTable columns handle Date->string via mapToDriverValue,
// but SQLite can't bind booleans or objects directly.
const isSqlite = () => getDbMode() === 'sqlite';
const toDbBool = (b: boolean): any => isSqlite() ? (b ? 1 : 0) : b;
const toDbJson = (obj: unknown): any => isSqlite() ? JSON.stringify(obj ?? {}) : (obj ?? {});

const {
  carRentals,
  carRentalTransfers,
  carRentalEvents,
} = schema;

// ============================================================================
// Types
// ============================================================================

export type RentalStatus =
  | 'CREATED'
  | 'CONFIRMED'
  | 'PICKED_UP'
  | 'RETURNED'
  | 'INSPECTED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'EXPIRED'
  | 'VOID';

export type TransferRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'EXPIRED';

export type DepositResolution =
  | 'RELEASED'
  | 'PARTIALLY_CHARGED'
  | 'FULLY_CHARGED';

const VALID_TRANSITIONS: Record<RentalStatus, RentalStatus[]> = {
  CREATED: ['CONFIRMED', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'VOID'],
  CONFIRMED: ['PICKED_UP', 'CANCELLED', 'NO_SHOW', 'EXPIRED', 'VOID'],
  PICKED_UP: ['RETURNED', 'VOID'],
  RETURNED: ['INSPECTED', 'VOID'],
  INSPECTED: ['CLOSED', 'VOID'],
  CLOSED: [],
  CANCELLED: ['VOID'],
  NO_SHOW: ['VOID'],
  EXPIRED: ['VOID'],
  VOID: [],
};

/**
 * On-chain function selectors for NFT contract lifecycle calls.
 * Only statuses that require an on-chain transaction are listed.
 */
const ON_CHAIN_SELECTORS: Record<string, string> = {
  PICKED_UP: '0xa1b2c3d4',   // confirmPickup(uint256)
  RETURNED:  '0xb2c3d4e5',   // processReturn(uint256)
  CLOSED:    '0xc3d4e5f6',   // closeRental(uint256)
};

// ============================================================================
// Interfaces
// ============================================================================

export interface CreateRentalInput {
  orgId: string;
  rentalCompanyCode: string;
  rentalCompanyName?: string;
  vehicleCategory?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  licensePlate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  pickupDate: string; // ISO timestamp
  returnDate: string; // ISO timestamp
  driverId?: string;
  driverWallet?: string;
  driverName?: string;
  confirmationCode?: string;
  bookingReference?: string;
  transferable?: boolean;
  maxTransfers?: number;
  dailyRate?: string;
  currency?: string;
  depositAmount?: string;
  insuranceType?: string;
  insuranceProvider?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferRentalInput {
  orgId: string;
  rentalId: string;
  toWallet: string;
  toDriverId?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Rental CRUD
// ============================================================================

export async function createRental(input: CreateRentalInput) {
  const {
    orgId, rentalCompanyCode, rentalCompanyName, vehicleCategory, vehicleMake, vehicleModel,
    licensePlate, pickupLocation, returnLocation, pickupDate: pickupDateStr, returnDate: returnDateStr,
    driverId, driverWallet, driverName, confirmationCode, bookingReference,
    transferable, maxTransfers, dailyRate, currency, depositAmount,
    insuranceType, insuranceProvider, metadata,
  } = input;

  const pickupDate = new Date(pickupDateStr);
  const returnDateVal = new Date(returnDateStr);

  if (pickupDate <= new Date()) {
    throw new ValidationError('Pickup time must be in the future');
  }
  if (returnDateVal <= pickupDate) {
    throw new ValidationError('Dropoff time must be after pickup time');
  }

  // Check idempotency by confirmation code
  if (confirmationCode) {
    const existing = await db.query.carRentals.findFirst({
      where: and(eq(carRentals.orgId, orgId), eq(carRentals.confirmationCode, confirmationCode)),
    });
    if (existing) return existing;
  }

  const [rental] = await db.insert(carRentals).values({
    orgId,
    rentalCompanyCode,
    rentalCompanyName: rentalCompanyName ?? rentalCompanyCode,
    vehicleCategory: vehicleCategory ?? 'ECONOMY',
    vehicleMake: vehicleMake ?? 'Unknown',
    vehicleModel: vehicleModel ?? 'Unknown',
    licensePlate: licensePlate ?? null,
    pickupLocation: pickupLocation ?? 'TBD',
    returnLocation: returnLocation ?? pickupLocation ?? 'TBD',
    pickupDate,
    returnDate: returnDateVal,
    driverId: driverId ?? null,
    driverWallet: driverWallet ?? null,
    driverName: driverName ?? 'Unknown',
    confirmationCode: confirmationCode ?? `CR-${randomUUID().slice(0, 12).toUpperCase()}`,
    bookingReference: bookingReference ?? randomUUID().slice(0, 6).toUpperCase(),
    status: 'CREATED',
    transferable: toDbBool(transferable ?? true),
    maxTransfers: maxTransfers ?? 3,
    transferCount: 0,
    dailyRate: dailyRate ?? '0',
    currency: currency ?? 'ETH',
    depositAmount: depositAmount ?? '0',
    depositStatus: 'HELD',
    insuranceType: insuranceType ?? 'BASIC',
    insuranceProvider: insuranceProvider ?? null,
    pickupMileage: null,
    pickupFuel: null,
    returnMileage: null,
    returnFuel: null,
    damageReport: toDbJson(null),
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  // Record event
  await recordRentalEvent(orgId, rental.id, 'RENTAL_CREATED', 'SYSTEM', 'RENTAL_AGENT', null, 'CREATED', {
    rentalCompanyCode, vehicleCategory, pickupLocation, returnLocation,
  });

  logger.info('Rental created', { rentalId: rental.id, rentalCompanyCode, orgId });
  return rental;
}

export async function getRental(orgId: string, rentalId: string) {
  const rental = await db.query.carRentals.findFirst({
    where: and(eq(carRentals.id, rentalId), eq(carRentals.orgId, orgId)),
  });

  if (!rental) throw new NotFoundError('Rental not found');
  return rental;
}

export async function listRentals(orgId: string, params?: {
  rentalCompanyCode?: string;
  status?: string;
  driverId?: string;
  limit?: number;
  offset?: number;
}) {
  const conditions = [eq(carRentals.orgId, orgId)];

  if (params?.rentalCompanyCode) conditions.push(eq(carRentals.rentalCompanyCode, params.rentalCompanyCode));
  if (params?.status) conditions.push(eq(carRentals.status, params.status));
  if (params?.driverId) conditions.push(eq(carRentals.driverId, params.driverId));

  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  const results = await db.select().from(carRentals)
    .where(and(...conditions))
    .orderBy(desc(carRentals.createdAt))
    .limit(limit)
    .offset(offset);

  return { data: results, limit, offset };
}

// ============================================================================
// Lifecycle Transitions
// ============================================================================

async function transitionRental(
  orgId: string,
  rentalId: string,
  newStatus: RentalStatus,
  actor: string,
  actorRole: string,
  details?: Record<string, unknown>,
) {
  const rental = await getRental(orgId, rentalId);
  const currentStatus = rental.status as RentalStatus;

  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from ${currentStatus} to ${newStatus}`);
  }

  const now = new Date();
  const updateData: Record<string, unknown> = {
    status: newStatus,
    updatedAt: now,
  };

  if (newStatus === 'CONFIRMED') updateData.confirmedAt = now;
  if (newStatus === 'PICKED_UP') updateData.pickedUpAt = now;
  if (newStatus === 'RETURNED') updateData.returnedAt = now;
  if (newStatus === 'INSPECTED') updateData.inspectedAt = now;
  if (newStatus === 'CLOSED') updateData.closedAt = now;
  if (newStatus === 'CANCELLED') updateData.cancelledAt = now;

  // Optimistic DB update
  const [updated] = await db.update(carRentals)
    .set(updateData)
    .where(and(eq(carRentals.id, rentalId), eq(carRentals.orgId, orgId)))
    .returning();

  // On-chain saga: submit NFT contract call if this status has a selector
  const selector = ON_CHAIN_SELECTORS[newStatus];
  if (selector && rental.contractAddress && rental.chainTokenId != null) {
    const chainId = rental.chainId as number | undefined;
    const relayerAddress = process.env.RELAYER_ADDRESS;

    if (chainId && relayerAddress) {
      try {
        // ABI-encode: selector + uint256(chainTokenId)
        const tokenIdHex = BigInt(rental.chainTokenId).toString(16).padStart(64, '0');
        const calldata = `${selector}${tokenIdHex}`;

        const txRequest = await relayerService.buildTransaction({
          to: rental.contractAddress,
          from: relayerAddress,
          data: calldata,
          chainId,
        });

        const { signedTx, hash } = await relayerService.signTransaction(txRequest, orgId);
        const { txHash } = await relayerService.submitTransaction(chainId, signedTx, orgId);
        const receipt = await relayerService.waitForTransaction(chainId, txHash);

        if (receipt.status === 'failed') {
          // Rollback: revert DB to previous status
          await db.update(carRentals)
            .set({ status: currentStatus, updatedAt: new Date() })
            .where(eq(carRentals.id, rentalId));

          logger.error('On-chain tx reverted, rolling back', { rentalId, txHash, from: currentStatus, to: newStatus });
          throw new AppError(`On-chain transaction reverted for ${newStatus} (tx: ${txHash})`, 502);
        }

        // Persist txHash in rental metadata
        const existingMeta = (rental.metadata as Record<string, unknown>) ?? {};
        await db.update(carRentals)
          .set({
            metadata: toDbJson({ ...existingMeta, lastTxHash: txHash }),
          })
          .where(eq(carRentals.id, rentalId));

        logger.info('On-chain lifecycle tx confirmed', { rentalId, txHash, status: newStatus });
      } catch (error) {
        // If the error is our own AppError (rollback case), re-throw
        if (error instanceof AppError) throw error;

        // Network / relayer failure: rollback DB
        await db.update(carRentals)
          .set({ status: currentStatus, updatedAt: new Date() })
          .where(eq(carRentals.id, rentalId));

        logger.error('On-chain lifecycle call failed, rolling back', { rentalId, error });
        throw new AppError(`On-chain call failed for ${newStatus}: ${error instanceof Error ? error.message : 'Unknown error'}`, 502);
      }
    }
  }

  await recordRentalEvent(orgId, rentalId, `RENTAL_${newStatus}`, actor, actorRole, currentStatus, newStatus, details);

  logger.info('Rental transitioned', { rentalId, from: currentStatus, to: newStatus });
  return updated;
}

export async function confirmRental(orgId: string, rentalId: string, actor: string) {
  return transitionRental(orgId, rentalId, 'CONFIRMED', actor, 'RENTAL_AGENT', { action: 'confirm' });
}

export async function confirmPickup(
  orgId: string,
  rentalId: string,
  mileage: number,
  fuelLevel: string | number,
  actor: string,
) {
  const rental = await getRental(orgId, rentalId);

  if (rental.status !== 'CONFIRMED') {
    throw new ValidationError(`Cannot pick up rental in status ${rental.status}, must be CONFIRMED`);
  }

  if (mileage < 0) throw new ValidationError('Mileage must be non-negative');

  // Record pickup data before transition
  await db.update(carRentals)
    .set({
      pickupMileage: mileage,
      pickupFuel: String(fuelLevel),
      updatedAt: new Date(),
    })
    .where(and(eq(carRentals.id, rentalId), eq(carRentals.orgId, orgId)));

  return transitionRental(orgId, rentalId, 'PICKED_UP', actor, 'RENTAL_AGENT', {
    action: 'confirm_pickup',
    pickupMileage: mileage,
    pickupFuel: fuelLevel,
  });
}

export async function processReturn(
  orgId: string,
  rentalId: string,
  mileage: number,
  fuelLevel: string | number,
  damageReport: Record<string, unknown> | null | undefined,
  actor: string,
) {
  const rental = await getRental(orgId, rentalId);

  if (rental.status !== 'PICKED_UP') {
    throw new ValidationError(`Cannot return rental in status ${rental.status}, must be PICKED_UP`);
  }

  if (mileage < 0) throw new ValidationError('Mileage must be non-negative');

  // Validate return mileage is >= pickup mileage
  if (rental.pickupMileage != null && mileage < (rental.pickupMileage as number)) {
    throw new ValidationError('Return mileage cannot be less than pickup mileage');
  }

  // Record return data before transition
  await db.update(carRentals)
    .set({
      returnMileage: mileage,
      returnFuel: String(fuelLevel),
      damageReport: toDbJson(damageReport),
      updatedAt: new Date(),
    })
    .where(and(eq(carRentals.id, rentalId), eq(carRentals.orgId, orgId)));

  return transitionRental(orgId, rentalId, 'RETURNED', actor, 'RENTAL_AGENT', {
    action: 'process_return',
    returnMileage: mileage,
    returnFuel: fuelLevel,
    hasDamage: damageReport != null && Object.keys(damageReport).length > 0,
  });
}

export async function inspectVehicle(
  orgId: string,
  rentalId: string,
  depositResolution: DepositResolution,
  chargeAmount: string | null | undefined,
  actor: string,
) {
  const rental = await getRental(orgId, rentalId);

  if (rental.status !== 'RETURNED') {
    throw new ValidationError(`Cannot inspect rental in status ${rental.status}, must be RETURNED`);
  }

  const validResolutions: DepositResolution[] = ['RELEASED', 'PARTIALLY_CHARGED', 'FULLY_CHARGED'];
  if (!validResolutions.includes(depositResolution)) {
    throw new ValidationError(`Invalid deposit resolution: ${depositResolution}`);
  }

  // Validate charge amount for partial charges
  if (depositResolution === 'PARTIALLY_CHARGED') {
    if (!chargeAmount || parseFloat(chargeAmount) <= 0) {
      throw new ValidationError('Charge amount is required for partial charges');
    }
    const deposit = parseFloat(rental.depositAmount ?? '0');
    if (parseFloat(chargeAmount) >= deposit) {
      throw new ValidationError('Partial charge amount must be less than deposit amount');
    }
  }

  if (depositResolution === 'FULLY_CHARGED') {
    // chargeAmount defaults to full deposit
    chargeAmount = rental.depositAmount ?? '0';
  }

  if (depositResolution === 'RELEASED') {
    chargeAmount = '0';
  }

  // Record inspection data before transition
  await db.update(carRentals)
    .set({
      depositStatus: depositResolution,
      updatedAt: new Date(),
    })
    .where(and(eq(carRentals.id, rentalId), eq(carRentals.orgId, orgId)));

  return transitionRental(orgId, rentalId, 'INSPECTED', actor, 'RENTAL_INSPECTOR', {
    action: 'inspect_vehicle',
    depositResolution,
    chargeAmount,
  });
}

export async function closeRental(orgId: string, rentalId: string, actor: string) {
  return transitionRental(orgId, rentalId, 'CLOSED', actor, 'RENTAL_ADMIN', { action: 'close' });
}

export async function cancelRental(orgId: string, rentalId: string, reason: string, actor: string) {
  const rental = await getRental(orgId, rentalId);
  const currentStatus = rental.status as RentalStatus;

  if (!['CREATED', 'CONFIRMED'].includes(currentStatus)) {
    throw new ValidationError(`Cannot cancel rental in status ${currentStatus}, must be CREATED or CONFIRMED`);
  }

  return transitionRental(orgId, rentalId, 'CANCELLED', actor, 'RENTAL_ADMIN', { reason });
}

export async function markNoShow(orgId: string, rentalId: string, actor: string) {
  const rental = await getRental(orgId, rentalId);
  const currentStatus = rental.status as RentalStatus;

  if (!['CREATED', 'CONFIRMED'].includes(currentStatus)) {
    throw new ValidationError(`Cannot mark no-show for rental in status ${currentStatus}`);
  }

  return transitionRental(orgId, rentalId, 'NO_SHOW', actor, 'RENTAL_AGENT', { action: 'no_show' });
}

export async function voidRental(orgId: string, rentalId: string, reason: string, actor: string) {
  return transitionRental(orgId, rentalId, 'VOID', actor, 'RENTAL_ADMIN', { reason, action: 'void' });
}

// ============================================================================
// Transfer Operations
// ============================================================================

export async function requestTransfer(input: TransferRentalInput) {
  const { orgId, rentalId, toWallet, toDriverId, idempotencyKey, metadata } = input;

  // Idempotency check
  if (idempotencyKey) {
    const existing = await db.query.carRentalTransfers.findFirst({
      where: and(eq(carRentalTransfers.orgId, orgId), eq(carRentalTransfers.idempotencyKey, idempotencyKey)),
    });
    if (existing) return existing;
  }

  const rental = await getRental(orgId, rentalId);

  // Validate transfer eligibility
  if (!rental.transferable) throw new ValidationError('Rental is not transferable');
  if ((rental.transferCount ?? 0) >= (rental.maxTransfers ?? 3)) throw new ValidationError('Maximum transfers reached');

  const status = rental.status as RentalStatus;
  if (status === 'PICKED_UP') throw new ValidationError('Rental is locked after pickup');
  if (!['CREATED', 'CONFIRMED'].includes(status)) throw new ValidationError(`Cannot transfer rental in status ${status}`);

  // Transfer window guard: 24h before pickup
  const pickupTime = new Date(rental.pickupDate).getTime();
  const cutoff = pickupTime - (24 * 60 * 60 * 1000);
  if (Date.now() >= cutoff) throw new ValidationError('Transfer window closed (less than 24h before pickup)');

  const fromWallet = rental.driverWallet ?? '';
  const initialStatus: TransferRequestStatus = 'PENDING';

  const [transfer] = await db.insert(carRentalTransfers).values({
    orgId,
    rentalId,
    fromWallet,
    toWallet,
    fromDriverId: rental.driverId ?? null,
    toDriverId: toDriverId ?? null,
    status: initialStatus,
    idempotencyKey,
    metadata: toDbJson(metadata),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  await recordRentalEvent(orgId, rentalId, 'TRANSFER_REQUESTED', fromWallet, 'DRIVER', null, null, {
    transferId: transfer.id, toWallet,
  });

  logger.info('Rental transfer requested', { rentalId, transferId: transfer.id });
  return transfer;
}

export async function approveTransfer(orgId: string, transferId: string, approvedBy: string) {
  const transfer = await db.query.carRentalTransfers.findFirst({
    where: and(eq(carRentalTransfers.id, transferId), eq(carRentalTransfers.orgId, orgId)),
  });

  if (!transfer) throw new NotFoundError('Transfer request not found');
  if (transfer.status !== 'PENDING') {
    throw new ValidationError(`Cannot approve transfer in status ${transfer.status}`);
  }

  // Execute the transfer
  const rental = await getRental(orgId, transfer.rentalId);

  await db.update(carRentals).set({
    driverWallet: transfer.toWallet,
    driverId: transfer.toDriverId,
    transferCount: (rental.transferCount ?? 0) + 1,
    updatedAt: new Date(),
  }).where(eq(carRentals.id, transfer.rentalId));

  const [updated] = await db.update(carRentalTransfers).set({
    status: 'COMPLETED',
    approvedBy,
    approvedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(carRentalTransfers.id, transferId)).returning();

  await recordRentalEvent(orgId, transfer.rentalId, 'RENTAL_TRANSFERRED', approvedBy, 'RENTAL_ADMIN', null, null, {
    transferId, from: transfer.fromWallet, to: transfer.toWallet,
  });

  logger.info('Rental transfer approved and completed', { transferId, rentalId: transfer.rentalId });
  return updated;
}

export async function rejectTransfer(orgId: string, transferId: string, reason: string, rejectedBy: string) {
  const [updated] = await db.update(carRentalTransfers).set({
    status: 'REJECTED',
    rejectionReason: reason,
    updatedAt: new Date(),
  }).where(and(eq(carRentalTransfers.id, transferId), eq(carRentalTransfers.orgId, orgId))).returning();

  if (!updated) throw new NotFoundError('Transfer request not found');

  await recordRentalEvent(orgId, updated.rentalId, 'TRANSFER_REJECTED', rejectedBy, 'RENTAL_ADMIN', null, null, {
    transferId, reason,
  });

  return updated;
}

// ============================================================================
// Event History
// ============================================================================

export async function getRentalEvents(orgId: string, rentalId: string, limit = 50) {
  return db.select().from(carRentalEvents)
    .where(and(eq(carRentalEvents.orgId, orgId), eq(carRentalEvents.rentalId, rentalId)))
    .orderBy(desc(carRentalEvents.createdAt))
    .limit(limit);
}

export async function getTransferHistory(orgId: string, rentalId: string) {
  return db.select().from(carRentalTransfers)
    .where(and(eq(carRentalTransfers.orgId, orgId), eq(carRentalTransfers.rentalId, rentalId)))
    .orderBy(desc(carRentalTransfers.createdAt));
}

// ============================================================================
// Auto-Expiry (called by background worker or Chainlink Automation callback)
// ============================================================================

export async function expireStaleRentals(orgId: string) {
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const staleRentals = await db.select().from(carRentals).where(
    and(
      eq(carRentals.orgId, orgId),
      sql`${carRentals.pickupDate} < ${sixHoursAgo}`,
      sql`(${carRentals.status} = 'CREATED' OR ${carRentals.status} = 'CONFIRMED')`,
    )
  );

  const results = [];
  for (const rental of staleRentals) {
    try {
      await transitionRental(orgId, rental.id, 'EXPIRED', 'AUTOMATION', 'SYSTEM', {
        reason: 'Auto-expired: pickup time passed',
        pickupDate: rental.pickupDate,
      });
      results.push({ rentalId: rental.id, success: true });
    } catch (error: any) {
      results.push({ rentalId: rental.id, success: false, error: error.message });
    }
  }

  logger.info('Auto-expiry completed', { orgId, expired: results.filter(r => r.success).length });
  return results;
}

// ============================================================================
// Internal Helpers
// ============================================================================

async function recordRentalEvent(
  orgId: string,
  rentalId: string,
  eventType: string,
  actor: string,
  actorRole: string,
  previousState: string | null,
  newState: string | null,
  details?: Record<string, unknown>,
) {
  await db.insert(carRentalEvents).values({
    orgId,
    rentalId,
    eventType,
    actor,
    actorRole,
    previousState,
    newState,
    details: toDbJson(details),
    correlationId: randomUUID(),
    createdAt: new Date(),
  });
}
