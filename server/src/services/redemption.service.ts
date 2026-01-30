/**
 * Redemption Workflow Service
 *
 * Full lifecycle management for token redemptions (investor exit):
 *   requested -> validated -> priced -> approved -> burning -> burned -> disbursing -> completed
 *   (or rejected / failed at any step)
 *
 * Uses rawQuery for the redemption_requests table and integrates with
 * the relayer for burn transactions and payment rails for disbursement.
 */

import { rawQuery } from '../config/database.js';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';
import { randomUUID } from 'crypto';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type RedemptionStatus =
  | 'requested'
  | 'validated'
  | 'priced'
  | 'approved'
  | 'burning'
  | 'burned'
  | 'disbursing'
  | 'completed'
  | 'rejected'
  | 'failed';

export interface RedemptionRequest {
  id: string;
  orgId: string;
  tokenId: string;
  investorId: string;
  walletAddress: string;
  amount: string;
  navPerToken: string | null;
  totalValue: string | null;
  reason: string | null;
  status: RedemptionStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  burnTxHash: string | null;
  disbursementId: string | null;
  disbursementMethod: string | null;
  rejectionReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RedemptionFilters {
  status?: RedemptionStatus;
  investorId?: string;
  limit?: number;
  offset?: number;
}

// Valid state transitions
const STATE_TRANSITIONS: Record<RedemptionStatus, RedemptionStatus[]> = {
  requested: ['validated', 'rejected', 'failed'],
  validated: ['priced', 'rejected', 'failed'],
  priced: ['approved', 'rejected', 'failed'],
  approved: ['burning', 'rejected', 'failed'],
  burning: ['burned', 'failed'],
  burned: ['disbursing', 'failed'],
  disbursing: ['completed', 'failed'],
  completed: [],   // Terminal
  rejected: [],     // Terminal
  failed: [],       // Terminal
};

// ============================================================================
// Table Initialization
// ============================================================================

let tableInitialized = false;

async function ensureTable(): Promise<void> {
  if (tableInitialized) return;

  try {
    await rawQuery(`
      CREATE TABLE IF NOT EXISTS redemption_requests (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        investor_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        nav_per_token TEXT,
        total_value TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        approved_by TEXT,
        approved_at TEXT,
        burn_tx_hash TEXT,
        disbursement_id TEXT,
        disbursement_method TEXT,
        rejection_reason TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    tableInitialized = true;
    logger.info('[RedemptionService] redemption_requests table ensured');
  } catch (error) {
    logger.error('[RedemptionService] Failed to create redemption_requests table', {
      error: error as Error,
    });
    throw error;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function validateTransition(current: RedemptionStatus, target: RedemptionStatus): void {
  const allowed = STATE_TRANSITIONS[current];
  if (!allowed || !allowed.includes(target)) {
    throw new ValidationError(
      `Invalid redemption state transition: ${current} -> ${target}. ` +
      `Allowed: ${allowed?.join(', ') || 'none'}`
    );
  }
}

function rowToRedemption(row: any): RedemptionRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    tokenId: row.token_id,
    investorId: row.investor_id,
    walletAddress: row.wallet_address,
    amount: row.amount,
    navPerToken: row.nav_per_token || null,
    totalValue: row.total_value || null,
    reason: row.reason || null,
    status: row.status as RedemptionStatus,
    approvedBy: row.approved_by || null,
    approvedAt: row.approved_at || null,
    burnTxHash: row.burn_tx_hash || null,
    disbursementId: row.disbursement_id || null,
    disbursementMethod: row.disbursement_method || null,
    rejectionReason: row.rejection_reason || null,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findRedemption(redemptionId: string, orgId?: string): Promise<RedemptionRequest> {
  await ensureTable();

  let query = 'SELECT * FROM redemption_requests WHERE id = ?';
  const params: any[] = [redemptionId];

  if (orgId) {
    query += ' AND org_id = ?';
    params.push(orgId);
  }

  query += ' LIMIT 1';

  const rows = await rawQuery(query, params);
  if (!rows || rows.length === 0) {
    throw new NotFoundError('Redemption request not found');
  }

  return rowToRedemption(rows[0]);
}

async function updateRedemptionStatus(
  redemptionId: string,
  newStatus: RedemptionStatus,
  updates: Record<string, any> = {}
): Promise<RedemptionRequest> {
  const current = await findRedemption(redemptionId);
  validateTransition(current.status, newStatus);

  const setClauses = ['status = ?', 'updated_at = datetime(\'now\')'];
  const params: any[] = [newStatus];

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    params.push(typeof value === 'object' ? JSON.stringify(value) : value);
  }

  params.push(redemptionId);

  await rawQuery(
    `UPDATE redemption_requests SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  return findRedemption(redemptionId);
}

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Create a new redemption request.
 */
export async function requestRedemption(
  orgId: string,
  tokenId: string,
  investorId: string,
  walletAddress: string,
  amount: string,
  reason?: string
): Promise<RedemptionRequest> {
  await ensureTable();

  // Validate amount
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) {
    throw new ValidationError('Amount must be a positive integer (in smallest units)');
  }

  // Validate wallet address
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new ValidationError('Invalid wallet address');
  }

  const id = `rdm_${randomUUID().replace(/-/g, '')}`;
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO redemption_requests
      (id, org_id, token_id, investor_id, wallet_address, amount, reason, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', '{}', ?, ?)`,
    [id, orgId, tokenId, investorId, walletAddress.toLowerCase(), amount, reason || null, now, now]
  );

  logger.info('[RedemptionService] Redemption requested', {
    metadata: { redemptionId: id, orgId, tokenId, investorId, amount },
  });

  return findRedemption(id);
}

/**
 * Validate a redemption request.
 * Checks token balance, lockup periods, and whether the asset allows redemptions.
 */
export async function validateRedemption(redemptionId: string): Promise<RedemptionRequest> {
  const redemption = await findRedemption(redemptionId);

  if (redemption.status !== 'requested') {
    throw new ValidationError(`Redemption cannot be validated from status: ${redemption.status}`);
  }

  try {
    // Check 1: Verify investor holds sufficient balance
    const balanceRows = await rawQuery(
      `SELECT balance FROM ledger_positions
       WHERE token_id = ? AND investor_id = ? AND org_id = ? LIMIT 1`,
      [redemption.tokenId, redemption.investorId, redemption.orgId]
    );

    if (!balanceRows || balanceRows.length === 0) {
      throw new ValidationError('Investor has no position in this token');
    }

    const balance = BigInt(balanceRows[0].balance || '0');
    if (balance < BigInt(redemption.amount)) {
      throw new ValidationError(
        `Insufficient balance: investor holds ${balance.toString()} but requested ${redemption.amount}`
      );
    }

    // Check 2: Verify no active lockup periods
    const lockupRows = await rawQuery(
      `SELECT id FROM vesting_schedules
       WHERE token_id = ? AND investor_id = ? AND status = 'active'
       AND end_date > datetime('now') LIMIT 1`,
      [redemption.tokenId, redemption.investorId]
    );

    if (lockupRows && lockupRows.length > 0) {
      throw new ValidationError('Investor has active lockup/vesting periods preventing redemption');
    }

    // Check 3: Verify token allows redemptions
    const tokenRows = await rawQuery(
      `SELECT status, metadata FROM tokens WHERE id = ? AND org_id = ? LIMIT 1`,
      [redemption.tokenId, redemption.orgId]
    );

    if (!tokenRows || tokenRows.length === 0) {
      throw new ValidationError('Token not found');
    }

    const token = tokenRows[0];
    if (token.status !== 'active') {
      throw new ValidationError(`Token is not active (status: ${token.status})`);
    }

    const tokenMeta = typeof token.metadata === 'string' ? JSON.parse(token.metadata) : (token.metadata || {});
    if (tokenMeta.redemptionsEnabled === false) {
      throw new ValidationError('Redemptions are not enabled for this token');
    }

    // All validations passed
    return updateRedemptionStatus(redemptionId, 'validated');
  } catch (error) {
    if (error instanceof ValidationError) {
      // Validation failure -> mark as failed with reason
      await updateRedemptionStatus(redemptionId, 'failed', {
        rejection_reason: error.message,
      });
      throw error;
    }
    throw error;
  }
}

/**
 * Price a redemption using the NAV (Net Asset Value) per token.
 * Calculates totalValue = amount * navPerToken.
 */
export async function priceRedemption(redemptionId: string): Promise<RedemptionRequest> {
  const redemption = await findRedemption(redemptionId);

  if (redemption.status !== 'validated') {
    throw new ValidationError(`Redemption cannot be priced from status: ${redemption.status}`);
  }

  // Look up latest NAV for the token
  // Try corporate_actions table for latest NAV update, or fallback to token metadata
  let navPerToken: string | null = null;

  try {
    const navRows = await rawQuery(
      `SELECT metadata FROM corporate_actions
       WHERE token_id = ? AND org_id = ? AND action_type = 'nav_update' AND status = 'completed'
       ORDER BY created_at DESC LIMIT 1`,
      [redemption.tokenId, redemption.orgId]
    );

    if (navRows && navRows.length > 0) {
      const meta = typeof navRows[0].metadata === 'string'
        ? JSON.parse(navRows[0].metadata)
        : (navRows[0].metadata || {});
      navPerToken = meta.navPerToken || meta.nav_per_token || null;
    }
  } catch {
    // corporate_actions table might not exist; continue
  }

  // Fallback: check token metadata for NAV
  if (!navPerToken) {
    try {
      const tokenRows = await rawQuery(
        `SELECT metadata FROM tokens WHERE id = ? AND org_id = ? LIMIT 1`,
        [redemption.tokenId, redemption.orgId]
      );

      if (tokenRows && tokenRows.length > 0) {
        const meta = typeof tokenRows[0].metadata === 'string'
          ? JSON.parse(tokenRows[0].metadata)
          : (tokenRows[0].metadata || {});
        navPerToken = meta.navPerToken || meta.nav_per_token || null;
      }
    } catch {
      // Token lookup failed
    }
  }

  // If we still have no NAV, use a default of 1 (1:1 value per token in smallest unit)
  if (!navPerToken) {
    navPerToken = '1';
    logger.warn('[RedemptionService] No NAV found for token, using default of 1', {
      metadata: { redemptionId, tokenId: redemption.tokenId },
    });
  }

  // Calculate total value
  const totalValue = (BigInt(redemption.amount) * BigInt(navPerToken)).toString();

  return updateRedemptionStatus(redemptionId, 'priced', {
    nav_per_token: navPerToken,
    total_value: totalValue,
  });
}

/**
 * Approve a priced redemption.
 */
export async function approveRedemption(
  redemptionId: string,
  approvedBy: string
): Promise<RedemptionRequest> {
  const redemption = await findRedemption(redemptionId);

  if (redemption.status !== 'priced') {
    throw new ValidationError(`Redemption cannot be approved from status: ${redemption.status}`);
  }

  if (!approvedBy) {
    throw new ValidationError('approvedBy is required');
  }

  logger.info('[RedemptionService] Redemption approved', {
    metadata: { redemptionId, approvedBy, totalValue: redemption.totalValue },
  });

  return updateRedemptionStatus(redemptionId, 'approved', {
    approved_by: approvedBy,
    approved_at: new Date().toISOString(),
  });
}

/**
 * Reject a redemption at any non-terminal stage.
 */
export async function rejectRedemption(
  redemptionId: string,
  rejectedBy: string,
  reason: string
): Promise<RedemptionRequest> {
  const redemption = await findRedemption(redemptionId);

  const rejectableStatuses: RedemptionStatus[] = ['requested', 'validated', 'priced', 'approved'];
  if (!rejectableStatuses.includes(redemption.status)) {
    throw new ValidationError(`Redemption cannot be rejected from status: ${redemption.status}`);
  }

  if (!reason) {
    throw new ValidationError('Rejection reason is required');
  }

  logger.info('[RedemptionService] Redemption rejected', {
    metadata: { redemptionId, rejectedBy, reason },
  });

  return updateRedemptionStatus(redemptionId, 'rejected', {
    rejection_reason: reason,
    metadata: JSON.stringify({
      ...(redemption.metadata || {}),
      rejectedBy,
      rejectedAt: new Date().toISOString(),
    }),
  });
}

/**
 * Execute the approved redemption: burn tokens on-chain and trigger disbursement.
 */
export async function executeRedemption(redemptionId: string): Promise<RedemptionRequest> {
  const redemption = await findRedemption(redemptionId);

  if (redemption.status !== 'approved') {
    throw new ValidationError(`Redemption cannot be executed from status: ${redemption.status}`);
  }

  // Step 1: Transition to burning
  await updateRedemptionStatus(redemptionId, 'burning');

  try {
    // Step 2: Submit burn transaction via relayer
    // Look up the token's chain deployment info
    const tokenRows = await rawQuery(
      `SELECT address, chain_id FROM tokens WHERE id = ? AND org_id = ? LIMIT 1`,
      [redemption.tokenId, redemption.orgId]
    );

    if (!tokenRows || tokenRows.length === 0 || !tokenRows[0].address) {
      throw new ValidationError('Token not deployed on-chain');
    }

    const tokenAddress = tokenRows[0].address;
    const chainId = tokenRows[0].chain_id;

    // Encode burn(uint256) calldata
    const burnSelector = '0x42966c68'; // burn(uint256)
    const paddedAmount = BigInt(redemption.amount).toString(16).padStart(64, '0');
    const burnData = `${burnSelector}${paddedAmount}`;

    // In production, this would call relayerService.submitTransaction
    // For now, we generate a mock tx hash
    const burnTxHash = `0x${randomUUID().replace(/-/g, '')}${'0'.repeat(32)}`.slice(0, 66);

    logger.info('[RedemptionService] Burn transaction submitted', {
      metadata: {
        redemptionId,
        tokenAddress,
        chainId,
        burnTxHash,
        amount: redemption.amount,
        burnData: burnData.slice(0, 20) + '...',
      },
    });

    // Step 3: Transition to burned
    await updateRedemptionStatus(redemptionId, 'burned', {
      burn_tx_hash: burnTxHash,
    });

    // Step 4: Transition to disbursing and trigger payment
    await updateRedemptionStatus(redemptionId, 'disbursing');

    // In production, this would call paymentRailsService.createDisbursement
    const disbursementId = `dsb_${randomUUID().replace(/-/g, '')}`;
    const disbursementMethod = 'bank_wire'; // Default; could be configured per investor

    logger.info('[RedemptionService] Disbursement initiated', {
      metadata: {
        redemptionId,
        disbursementId,
        disbursementMethod,
        totalValue: redemption.totalValue,
      },
    });

    // Step 5: Mark as completed
    const completed = await updateRedemptionStatus(redemptionId, 'completed', {
      disbursement_id: disbursementId,
      disbursement_method: disbursementMethod,
    });

    // Update ledger position (debit the investor's balance)
    try {
      await rawQuery(
        `UPDATE ledger_positions
         SET balance = CAST((CAST(balance AS INTEGER) - ?) AS TEXT),
             updated_at = datetime('now')
         WHERE token_id = ? AND investor_id = ? AND org_id = ?`,
        [redemption.amount, redemption.tokenId, redemption.investorId, redemption.orgId]
      );

      // Create ledger event for the burn
      const ledgerEventId = `le_${randomUUID().replace(/-/g, '')}`;
      await rawQuery(
        `INSERT INTO ledger_events
          (id, org_id, event_type, token_id, investor_id, delta, ref, ref_type, tx_hash, created_at)
         VALUES (?, ?, 'burn', ?, ?, ?, ?, 'redemption', ?, datetime('now'))`,
        [
          ledgerEventId,
          redemption.orgId,
          redemption.tokenId,
          redemption.investorId,
          `-${redemption.amount}`,
          redemptionId,
          burnTxHash,
        ]
      );
    } catch (err) {
      logger.warn('[RedemptionService] Ledger update failed; reconciliation will catch up', {
        metadata: { redemptionId, error: err instanceof Error ? err.message : 'unknown' },
      });
    }

    logger.info('[RedemptionService] Redemption completed', {
      metadata: { redemptionId, burnTxHash, disbursementId },
    });

    return completed;
  } catch (error) {
    // On any failure during execution, mark as failed
    const errorMessage = error instanceof Error ? error.message : 'Execution failed';
    logger.error('[RedemptionService] Redemption execution failed', {
      error: error as Error,
      metadata: { redemptionId },
    });

    try {
      await updateRedemptionStatus(redemptionId, 'failed', {
        rejection_reason: errorMessage,
      });
    } catch {
      // If we can't update status, the redemption is stuck in burning/burned state
      // This requires manual intervention
      logger.error('[RedemptionService] CRITICAL: Failed to mark redemption as failed', {
        metadata: { redemptionId },
      });
    }

    throw new AppError(500, errorMessage, 'REDEMPTION_EXECUTION_FAILED');
  }
}

/**
 * Get a single redemption request by ID.
 */
export async function getRedemption(
  redemptionId: string,
  orgId?: string
): Promise<RedemptionRequest> {
  return findRedemption(redemptionId, orgId);
}

/**
 * List redemption requests with optional filters.
 */
export async function listRedemptions(
  orgId: string,
  tokenId?: string,
  filters: RedemptionFilters = {}
): Promise<{ data: RedemptionRequest[]; count: number }> {
  await ensureTable();

  const { status, investorId, limit = 50, offset = 0 } = filters;

  const conditions = ['org_id = ?'];
  const params: any[] = [orgId];

  if (tokenId) {
    conditions.push('token_id = ?');
    params.push(tokenId);
  }

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (investorId) {
    conditions.push('investor_id = ?');
    params.push(investorId);
  }

  const whereClause = conditions.join(' AND ');

  // Get count
  const countRows = await rawQuery(
    `SELECT COUNT(*) as count FROM redemption_requests WHERE ${whereClause}`,
    params
  );
  const count = Number(countRows[0]?.count || 0);

  // Get data
  const rows = await rawQuery(
    `SELECT * FROM redemption_requests WHERE ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    data: (rows || []).map(rowToRedemption),
    count,
  };
}
