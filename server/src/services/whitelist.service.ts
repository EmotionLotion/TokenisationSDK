/**
 * Whitelist Service
 *
 * Manages wallet whitelists per token/org for transfer eligibility.
 * Supports adding, removing, querying whitelisted addresses, and batch
 * operations including CSV import. Used by compliance to gate transfers.
 *
 * @module server/services/whitelist
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

export type WhitelistStatus = 'active' | 'removed';

export interface WhitelistEntry {
  id: string;
  orgId: string;
  tokenId: string;
  walletAddress: string;
  addedBy: string;
  expiresAt: string | null;
  status: WhitelistStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AddToWhitelistInput {
  orgId: string;
  tokenId: string;
  walletAddress: string;
  addedBy: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface BatchAddResult {
  added: number;
  skipped: number;
  errors: string[];
}

export interface CSVImportResult extends BatchAddResult {
  totalRows: number;
  parsed: number;
}

// ============================================================================
// Table Initialization
// ============================================================================

let initialized = false;

export async function initWhitelistTable(): Promise<void> {
  if (initialized) return;

  try {
    await rawQuery(`
      CREATE TABLE IF NOT EXISTS whitelists (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL,
        token_id TEXT NOT NULL,
        wallet_address TEXT NOT NULL,
        added_by TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        metadata TEXT DEFAULT '{}',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_whitelist_org ON whitelists(org_id)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_whitelist_token ON whitelists(token_id)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_whitelist_wallet ON whitelists(wallet_address)`);
    await rawQuery(`CREATE INDEX IF NOT EXISTS idx_whitelist_status ON whitelists(status)`);
    await rawQuery(`CREATE UNIQUE INDEX IF NOT EXISTS idx_whitelist_unique ON whitelists(org_id, token_id, wallet_address)`);

    initialized = true;
    logger.info('Whitelists table initialized');
  } catch (err) {
    logger.error('Failed to initialize whitelists table', { error: err as Error });
    throw err;
  }
}

// Auto-initialize on module load
initWhitelistTable().catch(() => {});

// ============================================================================
// Service Methods
// ============================================================================

/**
 * Add a wallet address to the whitelist for a token
 */
export async function addToWhitelist(input: AddToWhitelistInput): Promise<WhitelistEntry> {
  await initWhitelistTable();

  if (!input.orgId || !input.tokenId || !input.walletAddress || !input.addedBy) {
    throw new Error('Missing required fields: orgId, tokenId, walletAddress, addedBy');
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(input.walletAddress)) {
    throw new Error(`Invalid wallet address: ${input.walletAddress}`);
  }

  const normalizedAddress = input.walletAddress.toLowerCase();

  // Check if already whitelisted (and active)
  const existing = await rawQuery<any>(
    `SELECT id, status FROM whitelists WHERE org_id = ? AND token_id = ? AND wallet_address = ?`,
    [input.orgId, input.tokenId, normalizedAddress]
  );

  if (existing.length > 0) {
    if (existing[0].status === 'active') {
      throw new Error(`Wallet ${normalizedAddress} is already whitelisted for token ${input.tokenId}`);
    }
    // Re-activate removed entry
    const now = new Date().toISOString();
    await rawQuery(
      `UPDATE whitelists SET status = 'active', added_by = ?, expires_at = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      [
        input.addedBy,
        input.expiresAt?.toISOString() || null,
        JSON.stringify(input.metadata || {}),
        now,
        existing[0].id,
      ]
    );

    logger.info('Whitelist entry reactivated', { id: existing[0].id, wallet: normalizedAddress });

    const rows = await rawQuery<any>(`SELECT * FROM whitelists WHERE id = ?`, [existing[0].id]);
    return mapRowToEntry(rows[0]);
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await rawQuery(
    `INSERT INTO whitelists (id, org_id, token_id, wallet_address, added_by, expires_at, status, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    [
      id,
      input.orgId,
      input.tokenId,
      normalizedAddress,
      input.addedBy,
      input.expiresAt?.toISOString() || null,
      JSON.stringify(input.metadata || {}),
      now,
      now,
    ]
  );

  logger.info('Wallet added to whitelist', { id, orgId: input.orgId, tokenId: input.tokenId, wallet: normalizedAddress });

  return {
    id,
    orgId: input.orgId,
    tokenId: input.tokenId,
    walletAddress: normalizedAddress,
    addedBy: input.addedBy,
    expiresAt: input.expiresAt?.toISOString() || null,
    status: 'active',
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Remove a wallet from the whitelist
 */
export async function removeFromWhitelist(
  orgId: string,
  tokenId: string,
  walletAddress: string
): Promise<WhitelistEntry> {
  await initWhitelistTable();

  const normalizedAddress = walletAddress.toLowerCase();

  const rows = await rawQuery<any>(
    `SELECT * FROM whitelists WHERE org_id = ? AND token_id = ? AND wallet_address = ? AND status = 'active'`,
    [orgId, tokenId, normalizedAddress]
  );

  if (rows.length === 0) {
    throw new Error(`Wallet ${normalizedAddress} is not whitelisted for token ${tokenId}`);
  }

  const now = new Date().toISOString();
  await rawQuery(
    `UPDATE whitelists SET status = 'removed', updated_at = ? WHERE id = ?`,
    [now, rows[0].id]
  );

  logger.info('Wallet removed from whitelist', { id: rows[0].id, wallet: normalizedAddress });

  return {
    ...mapRowToEntry(rows[0]),
    status: 'removed',
    updatedAt: now,
  };
}

/**
 * Get whitelisted wallets for a token with optional filters
 */
export async function getWhitelist(params: {
  orgId: string;
  tokenId: string;
  status?: WhitelistStatus;
  limit?: number;
  offset?: number;
}): Promise<WhitelistEntry[]> {
  await initWhitelistTable();

  const conditions: string[] = ['org_id = ?', 'token_id = ?'];
  const values: unknown[] = [params.orgId, params.tokenId];

  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }

  const limit = params.limit || 100;
  const offset = params.offset || 0;

  const rows = await rawQuery<any>(
    `SELECT * FROM whitelists WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  return rows.map(mapRowToEntry);
}

/**
 * Check if a wallet is whitelisted for a given token.
 * Also checks expiry: expired entries are treated as not whitelisted.
 */
export async function isWhitelisted(
  orgId: string,
  tokenId: string,
  walletAddress: string
): Promise<boolean> {
  await initWhitelistTable();

  const normalizedAddress = walletAddress.toLowerCase();

  const rows = await rawQuery<any>(
    `SELECT id, expires_at FROM whitelists WHERE org_id = ? AND token_id = ? AND wallet_address = ? AND status = 'active'`,
    [orgId, tokenId, normalizedAddress]
  );

  if (rows.length === 0) return false;

  // Check expiry
  if (rows[0].expires_at) {
    const expiresAt = new Date(rows[0].expires_at);
    if (expiresAt <= new Date()) {
      // Auto-expire: mark as removed
      await rawQuery(
        `UPDATE whitelists SET status = 'removed', updated_at = ? WHERE id = ?`,
        [new Date().toISOString(), rows[0].id]
      );
      return false;
    }
  }

  return true;
}

/**
 * Add multiple wallets to the whitelist in a single batch
 */
export async function batchAdd(
  orgId: string,
  tokenId: string,
  wallets: Array<{ walletAddress: string; metadata?: Record<string, unknown> }>,
  addedBy: string,
  expiresAt?: Date
): Promise<BatchAddResult> {
  await initWhitelistTable();

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of wallets) {
    try {
      await addToWhitelist({
        orgId,
        tokenId,
        walletAddress: entry.walletAddress,
        addedBy,
        expiresAt,
        metadata: entry.metadata,
      });
      added++;
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('already whitelisted')) {
        skipped++;
      } else if (message.includes('Invalid wallet address')) {
        errors.push(`Invalid address: ${entry.walletAddress}`);
      } else {
        errors.push(`Failed to add ${entry.walletAddress}: ${message}`);
      }
    }
  }

  logger.info('Batch whitelist add completed', { orgId, tokenId, added, skipped, errors: errors.length });

  return { added, skipped, errors };
}

/**
 * Import wallets from a CSV string.
 *
 * Expected CSV format:
 *   walletAddress[,metadata_key1,metadata_key2,...]
 *
 * First row is treated as header. The first column must be the wallet address.
 * Subsequent columns are treated as metadata key-value pairs using the header as keys.
 */
export async function importFromCSV(
  orgId: string,
  tokenId: string,
  csvContent: string,
  addedBy: string,
  expiresAt?: Date
): Promise<CSVImportResult> {
  await initWhitelistTable();

  const lines = csvContent.trim().split('\n').map((l) => l.trim()).filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const walletColIndex = headers.findIndex(
    (h) => h.toLowerCase() === 'walletaddress' || h.toLowerCase() === 'wallet_address' || h.toLowerCase() === 'address' || h.toLowerCase() === 'wallet'
  );

  if (walletColIndex === -1) {
    throw new Error('CSV must have a column named "walletAddress", "wallet_address", "address", or "wallet"');
  }

  const metadataHeaders = headers.filter((_, i) => i !== walletColIndex);
  const dataLines = lines.slice(1);

  const wallets: Array<{ walletAddress: string; metadata?: Record<string, unknown> }> = [];
  const parseErrors: string[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const columns = dataLines[i].split(',').map((c) => c.trim());
    const walletAddress = columns[walletColIndex];

    if (!walletAddress) {
      parseErrors.push(`Row ${i + 2}: empty wallet address`);
      continue;
    }

    const metadata: Record<string, unknown> = {};
    let metaIdx = 0;
    for (let j = 0; j < columns.length; j++) {
      if (j === walletColIndex) continue;
      if (metaIdx < metadataHeaders.length && columns[j]) {
        metadata[metadataHeaders[metaIdx]] = columns[j];
      }
      metaIdx++;
    }

    wallets.push({ walletAddress, metadata: Object.keys(metadata).length > 0 ? metadata : undefined });
  }

  const result = await batchAdd(orgId, tokenId, wallets, addedBy, expiresAt);

  return {
    totalRows: dataLines.length,
    parsed: wallets.length,
    added: result.added,
    skipped: result.skipped,
    errors: [...parseErrors, ...result.errors],
  };
}

// ============================================================================
// Helpers
// ============================================================================

function mapRowToEntry(row: any): WhitelistEntry {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
  } catch {
    metadata = {};
  }

  return {
    id: row.id,
    orgId: row.org_id,
    tokenId: row.token_id,
    walletAddress: row.wallet_address,
    addedBy: row.added_by,
    expiresAt: row.expires_at || null,
    status: row.status as WhitelistStatus,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
