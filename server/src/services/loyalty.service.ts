/**
 * Loyalty Points Engine
 *
 * Manages earn/spend/balance/tier logic for loyalty programs tied to tokenized assets.
 * Uses rawQuery pattern consistent with flight-oracle.service.ts and scheduler.service.ts.
 *
 * @packageDocumentation
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

export type ProgramStatus = 'active' | 'paused';
export type TransactionType = 'earn' | 'spend' | 'expire' | 'adjust';

export interface TierDefinition { name: string; minPoints: number; multiplier: number; benefits: string[]; }
export interface EarnRule { action: string; points: number; multiplier?: number; }

export interface LoyaltyProgram {
  id: string; orgId: string; name: string; description: string; currency: string;
  tiers: TierDefinition[]; earnRules: EarnRule[]; redeemRules: Record<string, unknown>;
  status: ProgramStatus; createdAt: string; updatedAt: string;
}

export interface LoyaltyAccount {
  id: string; orgId: string; programId: string; investorId: string;
  balance: number; lifetimeEarned: number; lifetimeSpent: number;
  currentTier: string; tierQualifyingPoints: number; streakDays: number;
  lastActivityAt: string | null; createdAt: string;
}

export interface LoyaltyTransaction {
  id: string; orgId: string; accountId: string; programId: string;
  type: TransactionType; amount: number; balanceBefore: number; balanceAfter: number;
  action: string; referenceId: string | null; referenceType: string | null;
  description: string; metadata: Record<string, unknown>; createdAt: string;
}

export interface EarnPointsInput {
  accountId: string; action: string; referenceId?: string;
  referenceType?: string; description?: string; metadata?: Record<string, unknown>;
}

export interface SpendPointsInput {
  accountId: string; amount: number; action: string;
  referenceId?: string; description?: string;
}

export interface CreateProgramInput {
  name: string; description?: string; currency?: string;
  tiers?: TierDefinition[]; earnRules?: EarnRule[]; redeemRules?: Record<string, unknown>;
}

// ============================================================================
// Table Initialisation
// ============================================================================

let _tablesReady = false;

async function ensureTables(): Promise<void> {
  if (_tablesReady) return;
  logger.info('Loyalty: initialising tables');

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS loyalty_programs (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL DEFAULT 'POINTS',
      tiers TEXT NOT NULL DEFAULT '[]', earn_rules TEXT NOT NULL DEFAULT '[]',
      redeem_rules TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS loyalty_accounts (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, program_id TEXT NOT NULL,
      investor_id TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0,
      lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0,
      current_tier TEXT NOT NULL DEFAULT '', tier_qualifying_points INTEGER NOT NULL DEFAULT 0,
      streak_days INTEGER NOT NULL DEFAULT 0, last_activity_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

  await rawQuery(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY, org_id TEXT NOT NULL, account_id TEXT NOT NULL,
      program_id TEXT NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL,
      balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT '', reference_id TEXT, reference_type TEXT,
      description TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lp_org ON loyalty_programs(org_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_la_org_prog ON loyalty_accounts(org_id, program_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_la_investor ON loyalty_accounts(org_id, program_id, investor_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lt_account ON loyalty_transactions(account_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lt_program ON loyalty_transactions(program_id)`);
  await rawQuery(`CREATE INDEX IF NOT EXISTS idx_lt_created ON loyalty_transactions(created_at)`);

  _tablesReady = true;
  logger.info('Loyalty: tables ready');
}

// ============================================================================
// Row Mappers & Helpers
// ============================================================================

function jp(value: unknown, fallback: any): any {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value as string); } catch { return fallback; }
}

function mapProgram(r: any): LoyaltyProgram {
  return {
    id: r.id, orgId: r.org_id, name: r.name, description: r.description ?? '',
    currency: r.currency ?? 'POINTS', tiers: jp(r.tiers, []), earnRules: jp(r.earn_rules, []),
    redeemRules: jp(r.redeem_rules, {}), status: r.status as ProgramStatus,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

function mapAccount(r: any): LoyaltyAccount {
  return {
    id: r.id, orgId: r.org_id, programId: r.program_id, investorId: r.investor_id,
    balance: r.balance ?? 0, lifetimeEarned: r.lifetime_earned ?? 0,
    lifetimeSpent: r.lifetime_spent ?? 0, currentTier: r.current_tier ?? '',
    tierQualifyingPoints: r.tier_qualifying_points ?? 0, streakDays: r.streak_days ?? 0,
    lastActivityAt: r.last_activity_at ?? null, createdAt: r.created_at,
  };
}

function mapTxn(r: any): LoyaltyTransaction {
  return {
    id: r.id, orgId: r.org_id, accountId: r.account_id, programId: r.program_id,
    type: r.type as TransactionType, amount: r.amount,
    balanceBefore: r.balance_before, balanceAfter: r.balance_after,
    action: r.action ?? '', referenceId: r.reference_id ?? null,
    referenceType: r.reference_type ?? null, description: r.description ?? '',
    metadata: jp(r.metadata, {}), createdAt: r.created_at,
  };
}

// ============================================================================
// Program CRUD
// ============================================================================

/** Create a new loyalty program with optional tiers and earn rules. */
export async function createProgram(orgId: string, input: CreateProgramInput): Promise<LoyaltyProgram> {
  await ensureTables();
  if (!input.name?.trim()) throw new Error('Program name is required');

  const id = randomUUID();
  const now = new Date().toISOString();
  const tiers = input.tiers ?? [];
  const earnRules = input.earnRules ?? [];

  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i].minPoints <= tiers[i - 1].minPoints) {
      throw new Error('Tiers must be sorted by ascending minPoints with no duplicates');
    }
  }

  await rawQuery(
    `INSERT INTO loyalty_programs (id, org_id, name, description, currency, tiers, earn_rules, redeem_rules, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, orgId, input.name.trim(), input.description ?? '', input.currency ?? 'POINTS',
     JSON.stringify(tiers), JSON.stringify(earnRules), JSON.stringify(input.redeemRules ?? {}), now, now],
  );

  logger.info('Loyalty: program created', { id, orgId, name: input.name });
  const rows = await rawQuery(`SELECT * FROM loyalty_programs WHERE id = ?`, [id]);
  return mapProgram(rows[0]);
}

/** Get a single program by ID, scoped to org. */
export async function getProgram(orgId: string, programId: string): Promise<LoyaltyProgram | null> {
  await ensureTables();
  const rows = await rawQuery(`SELECT * FROM loyalty_programs WHERE id = ? AND org_id = ?`, [programId, orgId]);
  return rows.length > 0 ? mapProgram(rows[0]) : null;
}

/** List all loyalty programs for an organisation. */
export async function listPrograms(orgId: string): Promise<LoyaltyProgram[]> {
  await ensureTables();
  const rows = await rawQuery(`SELECT * FROM loyalty_programs WHERE org_id = ? ORDER BY created_at DESC`, [orgId]);
  return rows.map(mapProgram);
}

// Whitelist of allowed update field names for loyalty_programs (prevents SQL injection via object keys)
const ALLOWED_PROGRAM_UPDATE_FIELDS = new Set([
  'name', 'description', 'currency', 'tiers', 'earnRules', 'redeemRules', 'status',
]);

/** Update program fields. */
export async function updateProgram(
  orgId: string, programId: string,
  updates: Partial<Pick<CreateProgramInput, 'name' | 'description' | 'currency' | 'tiers' | 'earnRules' | 'redeemRules'> & { status: ProgramStatus }>,
): Promise<LoyaltyProgram> {
  await ensureTables();
  const existing = await getProgram(orgId, programId);
  if (!existing) throw new Error(`Program not found: ${programId}`);

  const sets: string[] = [];
  const params: unknown[] = [];
  const fieldMap: Record<string, () => void> = {
    name: () => { sets.push('name = ?'); params.push(updates.name!.trim()); },
    description: () => { sets.push('description = ?'); params.push(updates.description); },
    currency: () => { sets.push('currency = ?'); params.push(updates.currency); },
    tiers: () => { sets.push('tiers = ?'); params.push(JSON.stringify(updates.tiers)); },
    earnRules: () => { sets.push('earn_rules = ?'); params.push(JSON.stringify(updates.earnRules)); },
    redeemRules: () => { sets.push('redeem_rules = ?'); params.push(JSON.stringify(updates.redeemRules)); },
    status: () => { sets.push('status = ?'); params.push(updates.status); },
  };

  for (const [key, apply] of Object.entries(fieldMap)) {
    if (!ALLOWED_PROGRAM_UPDATE_FIELDS.has(key)) {
      throw new Error(`Invalid update field for loyalty program: ${key}`);
    }
    if ((updates as any)[key] !== undefined) apply();
  }
  if (sets.length === 0) return existing;

  sets.push('updated_at = ?');
  params.push(new Date().toISOString(), programId, orgId);

  await rawQuery(`UPDATE loyalty_programs SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, params);
  logger.info('Loyalty: program updated', { programId, orgId, fields: Object.keys(updates) });
  return (await getProgram(orgId, programId))!;
}

// ============================================================================
// Account Management
// ============================================================================

/** Get existing account or create a new one for the investor. */
export async function getOrCreateAccount(orgId: string, programId: string, investorId: string): Promise<LoyaltyAccount> {
  await ensureTables();
  const existing = await rawQuery(
    `SELECT * FROM loyalty_accounts WHERE org_id = ? AND program_id = ? AND investor_id = ?`,
    [orgId, programId, investorId],
  );
  if (existing.length > 0) return mapAccount(existing[0]);

  const program = await getProgram(orgId, programId);
  if (!program) throw new Error(`Program not found: ${programId}`);

  const id = randomUUID();
  const now = new Date().toISOString();
  const initialTier = calculateTier(program.tiers, 0);

  await rawQuery(
    `INSERT INTO loyalty_accounts (id, org_id, program_id, investor_id, balance, lifetime_earned, lifetime_spent, current_tier, tier_qualifying_points, streak_days, last_activity_at, created_at)
     VALUES (?, ?, ?, ?, 0, 0, 0, ?, 0, 0, NULL, ?)`,
    [id, orgId, programId, investorId, initialTier, now],
  );

  logger.info('Loyalty: account created', { id, orgId, programId, investorId });
  const rows = await rawQuery(`SELECT * FROM loyalty_accounts WHERE id = ?`, [id]);
  return mapAccount(rows[0]);
}

/** Get account by ID, scoped to org. */
export async function getAccount(orgId: string, accountId: string): Promise<LoyaltyAccount | null> {
  await ensureTables();
  const rows = await rawQuery(`SELECT * FROM loyalty_accounts WHERE id = ? AND org_id = ?`, [accountId, orgId]);
  return rows.length > 0 ? mapAccount(rows[0]) : null;
}

/** Get account by investor within a specific program. */
export async function getAccountByInvestor(orgId: string, programId: string, investorId: string): Promise<LoyaltyAccount | null> {
  await ensureTables();
  const rows = await rawQuery(
    `SELECT * FROM loyalty_accounts WHERE org_id = ? AND program_id = ? AND investor_id = ?`,
    [orgId, programId, investorId],
  );
  return rows.length > 0 ? mapAccount(rows[0]) : null;
}

// ============================================================================
// Earn & Spend
// ============================================================================

/** Earn points based on program earn rules. Applies tier multiplier, records transaction, checks tier upgrade. */
export async function earnPoints(orgId: string, input: EarnPointsInput): Promise<LoyaltyTransaction> {
  await ensureTables();
  const { accountId, action, referenceId, referenceType, description, metadata } = input;

  const account = await getAccount(orgId, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  const program = await getProgram(orgId, account.programId);
  if (!program) throw new Error(`Program not found: ${account.programId}`);
  if (program.status !== 'active') throw new Error(`Program is not active: ${program.id}`);

  const rule = program.earnRules.find((r) => r.action === action);
  if (!rule) throw new Error(`No earn rule found for action: ${action}`);

  // Calculate points: base * rule multiplier * tier multiplier
  let points = rule.points;
  if (rule.multiplier) points = Math.round(points * rule.multiplier);

  const tierDef = program.tiers.find((t) => t.name === account.currentTier);
  if (tierDef && tierDef.multiplier > 1) points = Math.round(points * tierDef.multiplier);
  if (points <= 0) throw new Error('Calculated earn amount must be positive');

  const balanceBefore = account.balance;
  const balanceAfter = balanceBefore + points;
  const now = new Date().toISOString();
  const txnId = randomUUID();

  await rawQuery(
    `INSERT INTO loyalty_transactions (id, org_id, account_id, program_id, type, amount, balance_before, balance_after, action, reference_id, reference_type, description, metadata, created_at)
     VALUES (?, ?, ?, ?, 'earn', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [txnId, orgId, accountId, account.programId, points, balanceBefore, balanceAfter, action,
     referenceId ?? null, referenceType ?? null,
     description ?? `Earned ${points} ${program.currency} for ${action}`, JSON.stringify(metadata ?? {}), now],
  );

  await rawQuery(
    `UPDATE loyalty_accounts SET balance = ?, lifetime_earned = ?, tier_qualifying_points = ?, last_activity_at = ? WHERE id = ?`,
    [balanceAfter, account.lifetimeEarned + points, account.tierQualifyingPoints + points, now, accountId],
  );

  // Check tier upgrade with refreshed account
  const refreshed = await getAccount(orgId, accountId);
  if (refreshed) await checkTierUpgrade(orgId, refreshed, program);

  logger.info('Loyalty: points earned', { accountId, action, points, balanceAfter, programId: program.id });
  const txnRows = await rawQuery(`SELECT * FROM loyalty_transactions WHERE id = ?`, [txnId]);
  return mapTxn(txnRows[0]);
}

/** Spend (debit) points. Validates sufficient balance. */
export async function spendPoints(orgId: string, input: SpendPointsInput): Promise<LoyaltyTransaction> {
  await ensureTables();
  const { accountId, amount, action, referenceId, description } = input;
  if (amount <= 0) throw new Error('Spend amount must be positive');

  const account = await getAccount(orgId, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);

  const program = await getProgram(orgId, account.programId);
  if (!program) throw new Error(`Program not found: ${account.programId}`);
  if (program.status !== 'active') throw new Error(`Program is not active: ${program.id}`);
  if (account.balance < amount) throw new Error(`Insufficient balance: requested ${amount}, available ${account.balance}`);

  const balanceBefore = account.balance;
  const balanceAfter = balanceBefore - amount;
  const now = new Date().toISOString();
  const txnId = randomUUID();

  await rawQuery(
    `INSERT INTO loyalty_transactions (id, org_id, account_id, program_id, type, amount, balance_before, balance_after, action, reference_id, reference_type, description, metadata, created_at)
     VALUES (?, ?, ?, ?, 'spend', ?, ?, ?, ?, ?, NULL, ?, '{}', ?)`,
    [txnId, orgId, accountId, account.programId, amount, balanceBefore, balanceAfter, action,
     referenceId ?? null, description ?? `Spent ${amount} ${program.currency} on ${action}`, now],
  );

  await rawQuery(
    `UPDATE loyalty_accounts SET balance = ?, lifetime_spent = ?, last_activity_at = ? WHERE id = ?`,
    [balanceAfter, account.lifetimeSpent + amount, now, accountId],
  );

  logger.info('Loyalty: points spent', { accountId, action, amount, balanceAfter, programId: program.id });
  const txnRows = await rawQuery(`SELECT * FROM loyalty_transactions WHERE id = ?`, [txnId]);
  return mapTxn(txnRows[0]);
}

// ============================================================================
// Balance & History
// ============================================================================

/** Get current balance and tier for an account. */
export async function getBalance(orgId: string, accountId: string): Promise<{ balance: number; currentTier: string; lifetimeEarned: number; lifetimeSpent: number }> {
  await ensureTables();
  const account = await getAccount(orgId, accountId);
  if (!account) throw new Error(`Account not found: ${accountId}`);
  return { balance: account.balance, currentTier: account.currentTier, lifetimeEarned: account.lifetimeEarned, lifetimeSpent: account.lifetimeSpent };
}

/** Get paginated transaction history for an account. */
export async function getTransactionHistory(orgId: string, accountId: string, limit = 50, offset = 0): Promise<{ data: LoyaltyTransaction[]; total: number }> {
  await ensureTables();
  const countRows = await rawQuery<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM loyalty_transactions WHERE org_id = ? AND account_id = ?`, [orgId, accountId]);
  const rows = await rawQuery(
    `SELECT * FROM loyalty_transactions WHERE org_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [orgId, accountId, limit, offset],
  );
  return { data: rows.map(mapTxn), total: countRows[0]?.cnt ?? 0 };
}

// ============================================================================
// Tier Logic
// ============================================================================

/** Calculate tier from qualifying points. Returns highest tier whose minPoints threshold is met. */
export function calculateTier(tiers: TierDefinition[], qualifyingPoints: number): string {
  if (!tiers || tiers.length === 0) return '';
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (qualifyingPoints >= tiers[i].minPoints) return tiers[i].name;
  }
  return tiers[0].name;
}

/** Check and apply tier changes after earning points. */
export async function checkTierUpgrade(orgId: string, account: LoyaltyAccount, program: LoyaltyProgram): Promise<{ changed: boolean; previousTier: string; newTier: string }> {
  const newTier = calculateTier(program.tiers, account.tierQualifyingPoints);
  if (newTier === account.currentTier) return { changed: false, previousTier: account.currentTier, newTier };

  await rawQuery(`UPDATE loyalty_accounts SET current_tier = ? WHERE id = ? AND org_id = ?`, [newTier, account.id, orgId]);
  logger.info('Loyalty: tier changed', { accountId: account.id, previousTier: account.currentTier, newTier, qualifyingPoints: account.tierQualifyingPoints });
  return { changed: true, previousTier: account.currentTier, newTier };
}

// ============================================================================
// Expiry (batch operation for scheduler)
// ============================================================================

/** Expire points from earn transactions older than N days. Returns accounts affected and total expired. */
export async function expirePoints(orgId: string, programId: string, olderThanDays: number): Promise<{ accountsAffected: number; totalExpired: number }> {
  await ensureTables();
  if (olderThanDays <= 0) throw new Error('olderThanDays must be a positive number');

  const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();

  const candidates = await rawQuery<{ account_id: string; expirable: number }>(
    `SELECT account_id, SUM(amount) as expirable FROM loyalty_transactions
     WHERE org_id = ? AND program_id = ? AND type = 'earn' AND created_at < ?
     GROUP BY account_id HAVING expirable > 0`, [orgId, programId, cutoff],
  );

  const alreadyExpired = await rawQuery<{ account_id: string; expired: number }>(
    `SELECT account_id, SUM(amount) as expired FROM loyalty_transactions
     WHERE org_id = ? AND program_id = ? AND type = 'expire' GROUP BY account_id`, [orgId, programId],
  );
  const expiredMap = new Map(alreadyExpired.map((r) => [r.account_id, r.expired ?? 0]));

  let accountsAffected = 0;
  let totalExpired = 0;

  for (const c of candidates) {
    const net = c.expirable - (expiredMap.get(c.account_id) ?? 0);
    if (net <= 0) continue;

    const account = await getAccount(orgId, c.account_id);
    if (!account) continue;

    const expireAmount = Math.min(net, account.balance);
    if (expireAmount <= 0) continue;

    const now = new Date().toISOString();
    await rawQuery(
      `INSERT INTO loyalty_transactions (id, org_id, account_id, program_id, type, amount, balance_before, balance_after, action, reference_id, reference_type, description, metadata, created_at)
       VALUES (?, ?, ?, ?, 'expire', ?, ?, ?, 'POINT_EXPIRY', NULL, NULL, ?, '{}', ?)`,
      [randomUUID(), orgId, c.account_id, programId, expireAmount, account.balance, account.balance - expireAmount,
       `Expired ${expireAmount} points older than ${olderThanDays} days`, now],
    );

    await rawQuery(`UPDATE loyalty_accounts SET balance = ?, last_activity_at = ? WHERE id = ?`,
      [account.balance - expireAmount, now, c.account_id]);

    accountsAffected++;
    totalExpired += expireAmount;
  }

  logger.info('Loyalty: points expiry completed', { orgId, programId, olderThanDays, accountsAffected, totalExpired });
  return { accountsAffected, totalExpired };
}

// ============================================================================
// Leaderboard & Analytics
// ============================================================================

/** Top accounts by lifetime earned points. */
export async function getLeaderboard(orgId: string, programId: string, limit = 10): Promise<LoyaltyAccount[]> {
  await ensureTables();
  const rows = await rawQuery(
    `SELECT * FROM loyalty_accounts WHERE org_id = ? AND program_id = ? ORDER BY lifetime_earned DESC LIMIT ?`,
    [orgId, programId, limit],
  );
  return rows.map(mapAccount);
}

/** Aggregate analytics: total accounts, points issued/redeemed/expired, active rate. */
export async function getProgramAnalytics(orgId: string, programId: string): Promise<{
  totalAccounts: number; totalPointsIssued: number; totalPointsRedeemed: number;
  totalPointsExpired: number; activeAccounts: number; activeRate: number;
}> {
  await ensureTables();

  const [acctRows, activeRows, issuedRows, redeemedRows, expiredRows] = await Promise.all([
    rawQuery<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM loyalty_accounts WHERE org_id = ? AND program_id = ?`, [orgId, programId]),
    rawQuery<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM loyalty_accounts WHERE org_id = ? AND program_id = ? AND last_activity_at >= ?`,
      [orgId, programId, new Date(Date.now() - 30 * 86400000).toISOString()]),
    rawQuery<{ total: number }>(`SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_transactions WHERE org_id = ? AND program_id = ? AND type = 'earn'`, [orgId, programId]),
    rawQuery<{ total: number }>(`SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_transactions WHERE org_id = ? AND program_id = ? AND type = 'spend'`, [orgId, programId]),
    rawQuery<{ total: number }>(`SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_transactions WHERE org_id = ? AND program_id = ? AND type = 'expire'`, [orgId, programId]),
  ]);

  const totalAccounts = acctRows[0]?.cnt ?? 0;
  const activeAccounts = activeRows[0]?.cnt ?? 0;

  return {
    totalAccounts,
    totalPointsIssued: issuedRows[0]?.total ?? 0,
    totalPointsRedeemed: redeemedRows[0]?.total ?? 0,
    totalPointsExpired: expiredRows[0]?.total ?? 0,
    activeAccounts,
    activeRate: totalAccounts > 0 ? Math.round((activeAccounts / totalAccounts) * 10000) / 100 : 0,
  };
}
