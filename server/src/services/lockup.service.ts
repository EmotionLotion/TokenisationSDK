/**
 * Lockup Service
 *
 * Manages token lockup schedules for founders, team members, advisors, and investors.
 * Supports cliff, linear, and milestone release types. Provides lockup enforcement
 * that can be consumed by the compliance service to block transfers of locked tokens.
 *
 * @module server/services/lockup
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

export type ReleaseType = 'cliff' | 'linear' | 'milestone';
export type LockupTier = 'founder' | 'team' | 'advisor' | 'investor';

export interface LockupSchedule {
  id: string;
  orgId: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  lockUntil: string;
  releaseType: ReleaseType;
  tier: LockupTier;
  released: boolean;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLockupInput {
  orgId: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  lockUntil: Date;
  releaseType: ReleaseType;
  tier: LockupTier;
}

export interface LockupCheckResult {
  locked: boolean;
  lockedAmount: string;
  availableAmount: string;
  lockups: Array<{
    id: string;
    amount: string;
    lockUntil: string;
    releaseType: ReleaseType;
    tier: LockupTier;
  }>;
}

export interface UnlockCallbackEvent {
  lockupId: string;
  walletAddress: string;
  tokenAddress: string;
  amount: string;
  unlockedAt: string;
  releaseType: string;
  tier: string;
}

export interface BatchUnlockCallback {
  workflowId: string;
  executionId: string;
  timestamp: string;
  unlocks: UnlockCallbackEvent[];
  totalUnlocked: number;
}

// ============================================================================
// Table Initialization
// ============================================================================

let initialized = false;

export async function initLockupTable(): Promise<void> {
  if (initialized) return;

  try {
    await rawQuery(`
      CREATE TABLE IF NOT EXISTS lockup_schedules (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        investor_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        lock_until TEXT NOT NULL,
        release_type TEXT NOT NULL DEFAULT 'cliff',
        tier TEXT NOT NULL DEFAULT 'investor',
        released INTEGER NOT NULL DEFAULT 0,
        released_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lockup_org ON lockup_schedules(org_id)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lockup_token ON lockup_schedules(token_id)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lockup_wallet ON lockup_schedules(wallet_address)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lockup_investor ON lockup_schedules(investor_id)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lockup_released ON lockup_schedules(released)`);

    initialized = true;
    logger.info('Lockup schedules table initialized');
  } catch (err) {
    logger.error('Failed to initialize lockup_schedules table', { error: err as Error });
    throw err;
  }
}

// Auto-initialize on module load
initLockupTable().catch(() => {});

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Create a new lockup schedule
 */
export async function createLockup(input: CreateLockupInput): Promise<LockupSchedule> {
  await initLockupTable();

  if (!input.orgId || !input.tokenId || !input.investorId || !input.walletAddress) {
    throw new Error('Missing required fields: orgId, tokenId, investorId, walletAddress');
  }

  if (!input.amount || BigInt(input.amount) <= 0n) {
    throw new Error('Amount must be a positive value');
  }

  if (!(input.lockUntil instanceof Date) || isNaN(input.lockUntil.getTime())) {
    throw new Error('lockUntil must be a valid Date');
  }

  const validReleaseTypes: ReleaseType[] = ['cliff', 'linear', 'milestone'];
  if (!validReleaseTypes.includes(input.releaseType)) {
    throw new Error(`Invalid releaseType: ${input.releaseType}. Must be one of: ${validReleaseTypes.join(', ')}`);
  }

  const validTiers: LockupTier[] = ['founder', 'team', 'advisor', 'investor'];
  if (!validTiers.includes(input.tier)) {
    throw new Error(`Invalid tier: ${input.tier}. Must be one of: ${validTiers.join(', ')}`);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO lockup_schedules (id, org_id, token_id, investor_id, wallet_address, amount, lock_until, release_type, tier, released, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      id,
      input.orgId,
      input.tokenId,
      input.investorId,
      input.walletAddress.toLowerCase(),
      input.amount,
      input.lockUntil.toISOString(),
      input.releaseType,
      input.tier,
      now,
      now,
    ]
  );

  logger.info('Lockup schedule created', { id, orgId: input.orgId, tokenId: input.tokenId, tier: input.tier });

  return {
    id,
    orgId: input.orgId,
    tokenId: input.tokenId,
    investorId: input.investorId,
    walletAddress: input.walletAddress.toLowerCase(),
    amount: input.amount,
    lockUntil: input.lockUntil.toISOString(),
    releaseType: input.releaseType,
    tier: input.tier,
    released: false,
    releasedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get lockup schedules with optional filters
 */
export async function getLockups(params: {
  orgId: string;
  tokenId?: string;
  investorId?: string;
  walletAddress?: string;
  tier?: LockupTier;
  releasedOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<LockupSchedule[]> {
  await initLockupTable();

  const conditions: string[] = ['org_id = ?'];
  const values: unknown[] = [params.orgId];

  if (params.tokenId) {
    conditions.push('token_id = ?');
    values.push(params.tokenId);
  }
  if (params.investorId) {
    conditions.push('investor_id = ?');
    values.push(params.investorId);
  }
  if (params.walletAddress) {
    conditions.push('wallet_address = ?');
    values.push(params.walletAddress.toLowerCase());
  }
  if (params.tier) {
    conditions.push('tier = ?');
    values.push(params.tier);
  }
  if (params.releasedOnly !== undefined) {
    conditions.push('released = ?');
    values.push(params.releasedOnly ? 1 : 0);
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;

  const rows = await rawQuery<any>(
    `SELECT * FROM lockup_schedules WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return rows.map(mapRowToLockup);
}

/**
 * Release a specific lockup schedule
 */
export async function releaseLockup(id: string, orgId: string): Promise<LockupSchedule> {
  await initLockupTable();

  const rows = await rawQuery<any>(
    `SELECT * FROM lockup_schedules WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );

  if (rows.length === 0) {
    throw new Error(`Lockup schedule not found: ${id}`);
  }

  const lockup = mapRowToLockup(rows[0]);

  if (lockup.released) {
    throw new Error(`Lockup ${id} is already released`);
  }

  const now = new Date().toISOString();
  await rawQuery(
    `UPDATE lockup_schedules SET released = 1, released_at = ?, updated_at = ? WHERE id = ? AND org_id = ?`,
    [now, now, id, orgId]
  );

  logger.info('Lockup released', { id, orgId });

  return {
    ...lockup,
    released: true,
    releasedAt: now,
    updatedAt: now,
  };
}

/**
 * Check lockup status for a wallet/token combination.
 * Used by compliance service to determine if a transfer should be blocked.
 *
 * For linear release types, the locked amount is pro-rated based on
 * elapsed time between creation and lockUntil.
 */
export async function checkLockup(
  orgId: string,
  tokenId: string,
  walletAddress: string,
  amount?: string
): Promise<LockupCheckResult> {
  await initLockupTable();

  const rows = await rawQuery<any>(
    `SELECT * FROM lockup_schedules
     WHERE org_id = ? AND token_id = ? AND wallet_address = ? AND released = 0`,
    [orgId, tokenId, walletAddress.toLowerCase()]
  );

  const now = new Date();
  let totalLockedAmount = 0n;
  const activeLockups: LockupCheckResult['lockups'] = [];

  for (const row of rows) {
    const lockUntil = new Date(row.lock_until);

    if (lockUntil <= now) {
      // Lockup has expired but not yet marked as released (pending CRE workflow)
      continue;
    }

    let lockedForThisSchedule = BigInt(row.amount);

    // For linear release, calculate pro-rated locked amount
    if (row.release_type === 'linear') {
      const createdAt = new Date(row.created_at);
      const totalDurationMs = lockUntil.getTime() - createdAt.getTime();
      const elapsedMs = now.getTime() - createdAt.getTime();

      if (totalDurationMs > 0 && elapsedMs > 0) {
        const releasedPortion = (BigInt(row.amount) * BigInt(Math.floor(elapsedMs))) / BigInt(Math.floor(totalDurationMs));
        lockedForThisSchedule = BigInt(row.amount) - releasedPortion;
      }
    }

    if (lockedForThisSchedule > 0n) {
      totalLockedAmount += lockedForThisSchedule;
      activeLockups.push({
        id: row.id,
        amount: lockedForThisSchedule.toString(),
        lockUntil: row.lock_until,
        releaseType: row.release_type as ReleaseType,
        tier: row.tier as LockupTier,
      });
    }
  }

  // If an amount is provided, check if the transfer would exceed available balance
  const locked = amount ? totalLockedAmount > 0n : totalLockedAmount > 0n;

  return {
    locked,
    lockedAmount: totalLockedAmount.toString(),
    availableAmount: '0', // Caller should compute from total balance minus locked
    lockups: activeLockups,
  };
}

/**
 * Process batch unlock callback from CRE lockup-monitor workflow
 */
export async function processUnlockCallback(callback: BatchUnlockCallback): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  await initLockupTable();

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  logger.info('Processing unlock callback', {
    workflowId: callback.workflowId,
    executionId: callback.executionId,
    totalUnlocks: callback.totalUnlocked,
  });

  for (const unlock of callback.unlocks) {
    try {
      // Find the matching lockup by wallet and approximate matching
      const rows = await rawQuery<any>(
        `SELECT * FROM lockup_schedules
         WHERE wallet_address = ? AND released = 0 AND lock_until <= ?
         ORDER BY lock_until ASC LIMIT 1`,
        [unlock.walletAddress.toLowerCase(), unlock.unlockedAt]
      );

      if (rows.length === 0) {
        errors.push(`No matching lockup found for wallet ${unlock.walletAddress}`);
        failed++;
        continue;
      }

      const now = new Date().toISOString();
      await rawQuery(
        `UPDATE lockup_schedules SET released = 1, released_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, rows[0].id]
      );

      processed++;
      logger.info('Lockup released via callback', { lockupId: rows[0].id, wallet: unlock.walletAddress });
    } catch (err) {
      const errMsg = `Failed to process unlock for wallet ${unlock.walletAddress}: ${(err as Error).message}`;
      errors.push(errMsg);
      failed++;
      logger.error(errMsg, { error: err as Error });
    }
  }

  logger.info('Unlock callback processing complete', { processed, failed });

  return { processed, failed, errors };
}

/**
 * Get the total locked balance for a wallet across all tokens
 */
export async function getLockedBalance(
  orgId: string,
  walletAddress: string,
  tokenId?: string
): Promise<{ totalLocked: string; byToken: Array<{ tokenId: string; lockedAmount: string }> }> {
  await initLockupTable();

  const conditions = ['org_id = ?', 'wallet_address = ?', 'released = 0'];
  const values: unknown[] = [orgId, walletAddress.toLowerCase()];

  if (tokenId) {
    conditions.push('token_id = ?');
    values.push(tokenId);
  }

  const rows = await rawQuery<any>(
    `SELECT token_id, amount, lock_until, release_type, created_at
     FROM lockup_schedules WHERE ${conditions.join(' AND ')}`,
    values
  );

  const now = new Date();
  const byTokenMap: Map<string, bigint> = new Map();

  for (const row of rows) {
    const lockUntil = new Date(row.lock_until);
    if (lockUntil <= now) continue;

    let lockedAmount = BigInt(row.amount);

    if (row.release_type === 'linear') {
      const createdAt = new Date(row.created_at);
      const totalDurationMs = lockUntil.getTime() - createdAt.getTime();
      const elapsedMs = now.getTime() - createdAt.getTime();
      if (totalDurationMs > 0 && elapsedMs > 0) {
        const releasedPortion = (BigInt(row.amount) * BigInt(Math.floor(elapsedMs))) / BigInt(Math.floor(totalDurationMs));
        lockedAmount = BigInt(row.amount) - releasedPortion;
      }
    }

    if (lockedAmount > 0n) {
      const current = byTokenMap.get(row.token_id) || 0n;
      byTokenMap.set(row.token_id, current + lockedAmount);
    }
  }

  let totalLocked = 0n;
  const byToken: Array<{ tokenId: string; lockedAmount: string }> = [];

  for (const [tid, amount] of byTokenMap.entries()) {
    totalLocked += amount;
    byToken.push({ tokenId: tid, lockedAmount: amount.toString() });
  }

  return {
    totalLocked: totalLocked.toString(),
    byToken,
  };
}

/**
 * Batch release lockups that have expired
 */
export async function batchRelease(orgId: string, tokenId?: string): Promise<{
  released: number;
  lockupIds: string[];
}> {
  await initLockupTable();

  const now = new Date().toISOString();
  const conditions = ['org_id = ?', 'released = 0', 'lock_until <= ?'];
  const values: unknown[] = [orgId, now];

  if (tokenId) {
    conditions.push('token_id = ?');
    values.push(tokenId);
  }

  // Find expired lockups
  const expiredRows = await rawQuery<any>(
    `SELECT id FROM lockup_schedules WHERE ${conditions.join(' AND ')}`,
    values
  );

  if (expiredRows.length === 0) {
    return { released: 0, lockupIds: [] };
  }

  const ids = expiredRows.map((r: any) => r.id);

  // Release them
  const placeholders = ids.map(() => '?').join(', ');
  await rawQuery(
    `UPDATE lockup_schedules SET released = 1, released_at = ?, updated_at = ? WHERE id IN (${placeholders})`,
    [now, now, ...ids]
  );

  logger.info('Batch lockup release completed', { orgId, released: ids.length });

  return {
    released: ids.length,
    lockupIds: ids,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapRowToLockup(row: any): LockupSchedule {
  return {
    id: row.id,
    orgId: row.org_id,
    tokenId: row.token_id,
    investorId: row.investor_id,
    walletAddress: row.wallet_address,
    amount: row.amount,
    lockUntil: row.lock_until,
    releaseType: row.release_type as ReleaseType,
    tier: row.tier as LockupTier,
    released: Boolean(row.released),
    releasedAt: row.released_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
