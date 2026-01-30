/**
 * Compliance Extensions
 *
 * Extends the compliance service with lockup enforcement, whitelist gating,
 * anti-scalping price cap checks, and accreditation verification.
 * Each function returns a standardized { allowed, reason? } result.
 *
 * Creates and manages a `resale_policies` table for price cap enforcement.
 *
 * @module server/services/compliance-extensions
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';
import * as lockupService from './lockup.service.js';
import * as whitelistService from './whitelist.service.js';

// ============================================================================
// Types
// ============================================================================

export interface ComplianceCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ResalePolicy {
  id: string;
  orgId: string;
  assetId: string;
  maxMultiplier: number;
  cooldownPeriodSeconds: number;
  maxTransfersPerDay: number;
  createdAt: string;
}

export interface CreateResalePolicyInput {
  orgId: string;
  assetId: string;
  maxMultiplier: number;
  cooldownPeriodSeconds: number;
  maxTransfersPerDay: number;
}

// ============================================================================
// Table Initialization
// ============================================================================

let initialized = false;

export async function initResalePoliciesTable(): Promise<void> {
  if (initialized) return;

  try {
    await rawQuery(`
      CREATE TABLE IF NOT EXISTS resale_policies (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        max_multiplier REAL NOT NULL DEFAULT 1.5,
        cooldown_period_seconds INTEGER NOT NULL DEFAULT 86400,
        max_transfers_per_day INTEGER NOT NULL DEFAULT 10,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_resale_policies_org ON resale_policies(org_id)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_resale_policies_asset ON resale_policies(asset_id)`);
    await rawQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_resale_policies_unique ON resale_policies(org_id, asset_id)`);

    initialized = true;
    logger.info('Resale policies table initialized');
  } catch (err) {
    logger.error('Failed to initialize resale_policies table', { error: err as Error });
    throw err;
  }
}

// Auto-initialize on module load
initResalePoliciesTable().catch(() => {});

// ============================================================================
// Resale Policy Management
// ============================================================================

/**
 * Create or update a resale policy for an asset
 */
export async function createResalePolicy(input: CreateResalePolicyInput): Promise<ResalePolicy> {
  await initResalePoliciesTable();

  if (!input.orgId || !input.assetId) {
    throw new Error('Missing required fields: orgId, assetId');
  }
  if (input.maxMultiplier <= 0) {
    throw new Error('maxMultiplier must be greater than 0');
  }
  if (input.cooldownPeriodSeconds < 0) {
    throw new Error('cooldownPeriodSeconds must be non-negative');
  }
  if (input.maxTransfersPerDay < 1) {
    throw new Error('maxTransfersPerDay must be at least 1');
  }

  // Upsert: check for existing policy
  const existing = await rawQuery<any>(
    `SELECT id FROM resale_policies WHERE org_id = ? AND asset_id = ?`,
    [input.orgId, input.assetId]
  );

  const now = new Date().toISOString();

  if (existing.length > 0) {
    await rawQuery(
      `UPDATE resale_policies SET max_multiplier = ?, cooldown_period_seconds = ?, max_transfers_per_day = ? WHERE id = ?`,
      [input.maxMultiplier, input.cooldownPeriodSeconds, input.maxTransfersPerDay, existing[0].id]
    );
    logger.info('Resale policy updated', { id: existing[0].id, assetId: input.assetId });

    return {
      id: existing[0].id,
      orgId: input.orgId,
      assetId: input.assetId,
      maxMultiplier: input.maxMultiplier,
      cooldownPeriodSeconds: input.cooldownPeriodSeconds,
      maxTransfersPerDay: input.maxTransfersPerDay,
      createdAt: now,
    };
  }

  const id = randomUUID();

  await rawQuery(
    `INSERT INTO resale_policies (id, org_id, asset_id, max_multiplier, cooldown_period_seconds, max_transfers_per_day, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.assetId, input.maxMultiplier, input.cooldownPeriodSeconds, input.maxTransfersPerDay, now]
  );

  logger.info('Resale policy created', { id, orgId: input.orgId, assetId: input.assetId });

  return {
    id,
    orgId: input.orgId,
    assetId: input.assetId,
    maxMultiplier: input.maxMultiplier,
    cooldownPeriodSeconds: input.cooldownPeriodSeconds,
    maxTransfersPerDay: input.maxTransfersPerDay,
    createdAt: now,
  };
}

/**
 * Get resale policy for an asset
 */
export async function getResalePolicy(orgId: string, assetId: string): Promise<ResalePolicy | null> {
  await initResalePoliciesTable();

  const rows = await rawQuery<any>(
    `SELECT * FROM resale_policies WHERE org_id = ? AND asset_id = ?`,
    [orgId, assetId]
  );

  if (rows.length === 0) return null;

  return {
    id: rows[0].id,
    orgId: rows[0].org_id,
    assetId: rows[0].asset_id,
    maxMultiplier: rows[0].max_multiplier,
    cooldownPeriodSeconds: rows[0].cooldown_period_seconds,
    maxTransfersPerDay: rows[0].max_transfers_per_day,
    createdAt: rows[0].created_at,
  };
}

// ============================================================================
// Compliance Check Functions
// ============================================================================

/**
 * Check if a transfer violates lockup restrictions.
 * Calls the lockup service to determine if the sender's tokens are still locked.
 */
export async function checkLockup(
  orgId: string,
  tokenId: string,
  fromWallet: string,
  amount: string
): Promise<ComplianceCheckResult> {
  try {
    const lockupResult = await lockupService.checkLockup(orgId, tokenId, fromWallet, amount);

    if (!lockupResult.locked) {
      return { allowed: true };
    }

    // If locked, check if the transfer amount exceeds available (unlocked) balance.
    // The caller must supply the total balance separately; here we only know locked amount.
    // If any lockups exist that are still active, we report locked amount so the caller
    // can compare against the wallet's total balance.
    return {
      allowed: false,
      reason: `Transfer blocked: ${lockupResult.lockedAmount} tokens are locked across ${lockupResult.lockups.length} active lockup(s). ` +
              `Lockup tiers: ${[...new Set(lockupResult.lockups.map((l) => l.tier))].join(', ')}. ` +
              `Earliest unlock: ${lockupResult.lockups.reduce((min, l) => l.lockUntil < min ? l.lockUntil : min, lockupResult.lockups[0]?.lockUntil || 'N/A')}.`,
    };
  } catch (err) {
    logger.error('Lockup check failed', { error: err as Error, orgId, tokenId, fromWallet });
    return {
      allowed: false,
      reason: `Lockup check failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Check if the recipient wallet is whitelisted for the token.
 * Non-whitelisted wallets are blocked from receiving tokens.
 */
export async function checkWhitelist(
  orgId: string,
  tokenId: string,
  toWallet: string
): Promise<ComplianceCheckResult> {
  try {
    const whitelisted = await whitelistService.isWhitelisted(orgId, tokenId, toWallet);

    if (whitelisted) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Transfer blocked: recipient wallet ${toWallet.toLowerCase()} is not whitelisted for token ${tokenId}.`,
    };
  } catch (err) {
    logger.error('Whitelist check failed', { error: err as Error, orgId, tokenId, toWallet });
    return {
      allowed: false,
      reason: `Whitelist check failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Check if the transfer price exceeds the resale policy price cap.
 * Anti-scalping measure: enforces a maximum multiplier on the original issuance price.
 *
 * The transferPrice should be the per-unit price of the token in the secondary trade.
 * The function looks up the asset's resale policy and the original issuance price
 * from the offerings table. If transferPrice > issuancePrice * maxMultiplier, it blocks.
 */
export async function checkPriceCap(
  orgId: string,
  tokenId: string,
  transferPrice: number
): Promise<ComplianceCheckResult> {
  try {
    await initResalePoliciesTable();

    if (transferPrice <= 0) {
      return { allowed: false, reason: 'Transfer price must be positive.' };
    }

    // Look up the token's asset ID to find the resale policy
    const tokenRows = await rawQuery<any>(
      `SELECT asset_id FROM tokens WHERE id = ? AND org_id = ?`,
      [tokenId, orgId]
    );

    if (tokenRows.length === 0) {
      // No token found; cannot check price cap, allow by default
      return { allowed: true };
    }

    const assetId = tokenRows[0].asset_id;
    if (!assetId) {
      // Token has no asset; price cap not applicable
      return { allowed: true };
    }

    const policy = await getResalePolicy(orgId, assetId);
    if (!policy) {
      // No resale policy configured; allow
      return { allowed: true };
    }

    // Get the original issuance price from offerings
    const offeringRows = await rawQuery<any>(
      `SELECT price_per_token FROM offerings WHERE token_id = ? AND org_id = ? ORDER BY created_at ASC LIMIT 1`,
      [tokenId, orgId]
    );

    if (offeringRows.length === 0) {
      // No offering found; cannot determine base price, allow
      return { allowed: true };
    }

    const issuancePrice = parseFloat(offeringRows[0].price_per_token);
    if (issuancePrice <= 0) {
      return { allowed: true };
    }

    const maxAllowedPrice = issuancePrice * policy.maxMultiplier;

    if (transferPrice > maxAllowedPrice) {
      return {
        allowed: false,
        reason: `Transfer blocked: price ${transferPrice} exceeds maximum allowed price of ${maxAllowedPrice.toFixed(2)} ` +
                `(issuance price ${issuancePrice} x ${policy.maxMultiplier} multiplier). Anti-scalping policy for asset ${assetId}.`,
      };
    }

    // Also check daily transfer count (anti-churning)
    const oneDayAgo = new Date(Date.now() - 86400 * 1000).toISOString();
    const transferCountRows = await rawQuery<any>(
      `SELECT COUNT(*) as count FROM transfers WHERE token_id = ? AND org_id = ? AND created_at >= ?`,
      [tokenId, orgId, oneDayAgo]
    );

    const dailyTransfers = transferCountRows[0]?.count || 0;
    if (dailyTransfers >= policy.maxTransfersPerDay) {
      return {
        allowed: false,
        reason: `Transfer blocked: daily transfer limit of ${policy.maxTransfersPerDay} reached for token ${tokenId}. ` +
                `Current count: ${dailyTransfers}. Cooldown policy for asset ${assetId}.`,
      };
    }

    return { allowed: true };
  } catch (err) {
    logger.error('Price cap check failed', { error: err as Error, orgId, tokenId, transferPrice });
    return {
      allowed: false,
      reason: `Price cap check failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Check if an investor meets accreditation requirements for a token.
 * Some assets are restricted to accredited investors only.
 */
export async function checkAccreditation(
  orgId: string,
  investorId: string,
  tokenId: string
): Promise<ComplianceCheckResult> {
  try {
    // Check if the token/asset requires accredited investors
    const tokenRows = await rawQuery<any>(
      `SELECT asset_id, metadata FROM tokens WHERE id = ? AND org_id = ?`,
      [tokenId, orgId]
    );

    if (tokenRows.length === 0) {
      return { allowed: true };
    }

    // Parse token metadata to check for accreditation requirement
    let tokenMetadata: Record<string, unknown> = {};
    try {
      tokenMetadata = typeof tokenRows[0].metadata === 'string'
        ? JSON.parse(tokenRows[0].metadata)
        : (tokenRows[0].metadata || {});
    } catch {
      tokenMetadata = {};
    }

    // Check if accreditation is required (can be set in token metadata or asset attributes)
    const requiresAccreditation = tokenMetadata.requiresAccreditation === true ||
      tokenMetadata.investorRestriction === 'accredited_only';

    if (!requiresAccreditation && tokenRows[0].asset_id) {
      // Also check the asset for accreditation requirements
      const assetRows = await rawQuery<any>(
        `SELECT attributes FROM assets WHERE id = ? AND org_id = ?`,
        [tokenRows[0].asset_id, orgId]
      );

      if (assetRows.length > 0) {
        let assetAttrs: Record<string, unknown> = {};
        try {
          assetAttrs = typeof assetRows[0].attributes === 'string'
            ? JSON.parse(assetRows[0].attributes)
            : (assetRows[0].attributes || {});
        } catch {
          assetAttrs = {};
        }

        if (assetAttrs.requiresAccreditation !== true && assetAttrs.investorRestriction !== 'accredited_only') {
          // No accreditation requirement found
          return { allowed: true };
        }
      } else {
        // No asset found, no accreditation requirement
        if (!requiresAccreditation) {
          return { allowed: true };
        }
      }
    } else if (!requiresAccreditation) {
      return { allowed: true };
    }

    // Accreditation IS required -- check the investor's status
    const investorRows = await rawQuery<any>(
      `SELECT accredited_status, accredited_verified_at, accredited_expires_at, classification FROM investors WHERE id = ? AND org_id = ?`,
      [investorId, orgId]
    );

    if (investorRows.length === 0) {
      return {
        allowed: false,
        reason: `Transfer blocked: investor ${investorId} not found. Accreditation verification required for token ${tokenId}.`,
      };
    }

    const investor = investorRows[0];

    // Check accreditation status
    if (investor.accredited_status !== 'accredited' && investor.accredited_status !== 'verified') {
      return {
        allowed: false,
        reason: `Transfer blocked: investor ${investorId} is not accredited (status: ${investor.accredited_status || 'unknown'}). ` +
                `Token ${tokenId} requires accredited investors only.`,
      };
    }

    // Check accreditation expiry
    if (investor.accredited_expires_at) {
      const expiresAt = new Date(investor.accredited_expires_at);
      if (expiresAt <= new Date()) {
        return {
          allowed: false,
          reason: `Transfer blocked: investor ${investorId} accreditation expired on ${investor.accredited_expires_at}. ` +
                  `Re-verification required for token ${tokenId}.`,
        };
      }
    }

    // Check classification (institutional investors are typically auto-accredited)
    if (investor.classification === 'institutional') {
      return { allowed: true };
    }

    return { allowed: true };
  } catch (err) {
    logger.error('Accreditation check failed', { error: err as Error, orgId, investorId, tokenId });
    return {
      allowed: false,
      reason: `Accreditation check failed: ${(err as Error).message}`,
    };
  }
}
