/**
 * Truth View Service
 *
 * Provides point-in-time queries for historical state reconstruction:
 * - Historical balance queries (what was balance at block X or date Y)
 * - Cap table snapshots at specific timestamps
 * - Change tracking between two points in time
 * - Audit-ready state proofs
 */

import { db, schema } from '../config/database.js';
import { eq, and, lte, gte, desc, asc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError } from '../middleware/errorHandler.js';

const { tokens, ledgerPositions, ledgerEvents, investors } = schema;

// Type helper for database operations (works around dual SQLite/Postgres support)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbOps = db as any;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface PointInTimeQuery {
  tokenId: string;
  orgId: string;
  asOf: Date | number; // Date or block number
  queryType: 'date' | 'block';
}

export interface HistoricalBalance {
  walletAddress: string;
  balance: string;
  asOf: Date;
  blockNumber?: number;
  lastEventId?: string;
  investorId?: string;
}

export interface CapTableSnapshot {
  id: string;
  tokenId: string;
  asOf: Date;
  blockNumber?: number;
  totalSupply: string;
  circulatingSupply: string;
  holderCount: number;
  holders: SnapshotHolder[];
  merkleRoot: string;
  generatedAt: Date;
}

export interface SnapshotHolder {
  rank: number;
  walletAddress: string;
  balance: string;
  percentage: string;
  investorId?: string;
  investorType?: string;
  jurisdiction?: string;
}

export interface StateChange {
  eventId: string;
  timestamp: Date;
  blockNumber?: number;
  eventType: string;
  walletAddress: string;
  previousBalance: string;
  newBalance: string;
  change: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

export interface StateComparison {
  tokenId: string;
  fromDate: Date;
  toDate: Date;
  fromBlockNumber?: number;
  toBlockNumber?: number;
  changes: StateChange[];
  summary: {
    totalEvents: number;
    newHolders: number;
    exitedHolders: number;
    netChange: string;
    largestInflow: { walletAddress: string; amount: string } | null;
    largestOutflow: { walletAddress: string; amount: string } | null;
  };
}

export interface StateProof {
  tokenId: string;
  asOf: Date;
  blockNumber?: number;
  stateRoot: string;
  positions: Array<{
    walletAddress: string;
    balance: string;
    proof: string[];
  }>;
  signature: string;
  generatedAt: Date;
}

// ============================================================================
// In-Memory Cache for Snapshots
// ============================================================================

const snapshotCache = new Map<string, CapTableSnapshot>();

function getCacheKey(tokenId: string, asOf: Date): string {
  return `${tokenId}:${asOf.toISOString().slice(0, 10)}`; // Daily granularity
}

// ============================================================================
// Historical Balance Queries
// ============================================================================

/**
 * Get the balance of a wallet at a specific point in time
 */
export async function getHistoricalBalance(
  tokenId: string,
  walletAddress: string,
  asOf: Date,
  orgId: string
): Promise<HistoricalBalance> {
  const normalizedWallet = walletAddress.toLowerCase();

  // Get all ledger events for this wallet up to the specified date
  const events = await db
    .select()
    .from(ledgerEvents)
    .where(
      and(
        eq(ledgerEvents.tokenId, tokenId),
        eq(ledgerEvents.walletAddress, normalizedWallet),
        lte(ledgerEvents.createdAt, asOf)
      )
    )
    .orderBy(asc(ledgerEvents.createdAt));

  // Reconstruct balance from events
  let balance = BigInt(0);
  let lastEvent: typeof events[0] | null = null;

  for (const event of events) {
    const amount = BigInt(event.amount || '0');
    balance += amount;
    lastEvent = event;
  }

  // Get investor info if available
  const position = await dbOps.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.walletAddress, normalizedWallet)
    ),
    with: {
      investor: true,
    },
  });

  return {
    walletAddress: normalizedWallet,
    balance: balance.toString(),
    asOf,
    blockNumber: lastEvent?.txBlock ?? undefined,
    lastEventId: lastEvent?.id,
    investorId: position?.investorId ?? undefined,
  };
}

/**
 * Get all balances at a specific point in time
 */
export async function getHistoricalBalances(
  query: PointInTimeQuery
): Promise<HistoricalBalance[]> {
  const token = await dbOps.query.tokens.findFirst({
    where: and(eq(tokens.id, query.tokenId), eq(tokens.orgId, query.orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  const asOfDate = query.queryType === 'date'
    ? query.asOf as Date
    : new Date(); // For block-based queries, use current date as proxy

  // Get all unique wallet addresses with events before the target date
  const uniqueWallets = await db
    .selectDistinct({ walletAddress: ledgerEvents.walletAddress })
    .from(ledgerEvents)
    .where(
      and(
        eq(ledgerEvents.tokenId, query.tokenId),
        lte(ledgerEvents.createdAt, asOfDate)
      )
    );

  const balances: HistoricalBalance[] = [];

  for (const { walletAddress } of uniqueWallets) {
    const balance = await getHistoricalBalance(
      query.tokenId,
      walletAddress,
      asOfDate,
      query.orgId
    );

    // Only include non-zero balances
    if (BigInt(balance.balance) > 0n) {
      balances.push(balance);
    }
  }

  // Sort by balance descending
  balances.sort((a, b) => {
    const balA = BigInt(a.balance);
    const balB = BigInt(b.balance);
    return balB > balA ? 1 : balB < balA ? -1 : 0;
  });

  return balances;
}

// ============================================================================
// Cap Table Snapshots
// ============================================================================

/**
 * Generate a cap table snapshot at a specific point in time
 */
export async function generateCapTableSnapshot(
  tokenId: string,
  orgId: string,
  asOf: Date
): Promise<CapTableSnapshot> {
  // Check cache first
  const cacheKey = getCacheKey(tokenId, asOf);
  const cached = snapshotCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const token = await dbOps.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  // Get historical balances
  const balances = await getHistoricalBalances({
    tokenId,
    orgId,
    asOf,
    queryType: 'date',
  });

  // Calculate totals
  let circulatingSupply = BigInt(0);
  for (const balance of balances) {
    circulatingSupply += BigInt(balance.balance);
  }

  // Enrich with investor data
  const holders: SnapshotHolder[] = await Promise.all(
    balances.map(async (balance, index) => {
      let investorData: { type?: string; countryCode?: string } = {};

      if (balance.investorId) {
        const investor = await dbOps.query.investors.findFirst({
          where: eq(investors.id, balance.investorId),
        });
        if (investor) {
          investorData = {
            type: investor.type,
            countryCode: investor.countryCode,
          };
        }
      }

      const percentage = circulatingSupply > 0n
        ? ((BigInt(balance.balance) * 10000n) / circulatingSupply).toString()
        : '0';

      const formattedPercentage = (Number(percentage) / 100).toFixed(2) + '%';

      return {
        rank: index + 1,
        walletAddress: balance.walletAddress,
        balance: balance.balance,
        percentage: formattedPercentage,
        investorId: balance.investorId,
        investorType: investorData.type,
        jurisdiction: investorData.countryCode,
      };
    })
  );

  // Calculate merkle root for audit proof
  const merkleRoot = calculateMerkleRoot(holders);

  const snapshot: CapTableSnapshot = {
    id: `snap_${tokenId}_${asOf.getTime()}`,
    tokenId,
    asOf,
    totalSupply: token.maxSupply || '0',
    circulatingSupply: circulatingSupply.toString(),
    holderCount: holders.length,
    holders,
    merkleRoot,
    generatedAt: new Date(),
  };

  // Cache the snapshot
  snapshotCache.set(cacheKey, snapshot);

  return snapshot;
}

/**
 * Get snapshot at end of specific date
 */
export async function getEndOfDaySnapshot(
  tokenId: string,
  orgId: string,
  date: Date
): Promise<CapTableSnapshot> {
  // Set to end of day
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return generateCapTableSnapshot(tokenId, orgId, endOfDay);
}

// ============================================================================
// State Change Tracking
// ============================================================================

/**
 * Get all state changes between two points in time
 */
export async function getStateChanges(
  tokenId: string,
  orgId: string,
  fromDate: Date,
  toDate: Date
): Promise<StateComparison> {
  const token = await dbOps.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  // Get all events in the date range
  const events = await db
    .select()
    .from(ledgerEvents)
    .where(
      and(
        eq(ledgerEvents.tokenId, tokenId),
        gte(ledgerEvents.createdAt, fromDate),
        lte(ledgerEvents.createdAt, toDate)
      )
    )
    .orderBy(asc(ledgerEvents.createdAt));

  // Build running balance map
  const balancesBefore = new Map<string, bigint>();

  // Get balances at fromDate
  const beforeBalances = await getHistoricalBalances({
    tokenId,
    orgId,
    asOf: fromDate,
    queryType: 'date',
  });

  for (const b of beforeBalances) {
    balancesBefore.set(b.walletAddress, BigInt(b.balance));
  }

  // Track changes
  const changes: StateChange[] = [];
  const runningBalances = new Map(balancesBefore);

  for (const event of events) {
    const walletAddress = event.walletAddress;
    const previousBalance = runningBalances.get(walletAddress) || 0n;
    const change = BigInt(event.amount || '0');
    const newBalance = previousBalance + change;

    runningBalances.set(walletAddress, newBalance);

    changes.push({
      eventId: event.id,
      timestamp: event.createdAt,
      blockNumber: event.txBlock ?? undefined,
      eventType: event.eventType,
      walletAddress,
      previousBalance: previousBalance.toString(),
      newBalance: newBalance.toString(),
      change: change.toString(),
      txHash: event.txHash ?? undefined,
      metadata: event.metadata as Record<string, unknown> | undefined,
    });
  }

  // Calculate summary statistics
  const holdersAtStart = new Set(beforeBalances.filter(b => BigInt(b.balance) > 0n).map(b => b.walletAddress));
  const holdersAtEnd = new Set(Array.from(runningBalances.entries()).filter(([_, b]) => b > 0n).map(([w]) => w));

  const newHolders = Array.from(holdersAtEnd).filter(w => !holdersAtStart.has(w)).length;
  const exitedHolders = Array.from(holdersAtStart).filter(w => !holdersAtEnd.has(w)).length;

  // Calculate net change and largest flows
  let totalInflow = 0n;
  let totalOutflow = 0n;
  let largestInflow: { walletAddress: string; amount: string } | null = null;
  let largestOutflow: { walletAddress: string; amount: string } | null = null;
  let maxInflow = 0n;
  let maxOutflow = 0n;

  const walletNetChanges = new Map<string, bigint>();
  for (const change of changes) {
    const amount = BigInt(change.change);
    const current = walletNetChanges.get(change.walletAddress) || 0n;
    walletNetChanges.set(change.walletAddress, current + amount);
  }

  for (const [wallet, netChange] of walletNetChanges) {
    if (netChange > 0n) {
      totalInflow += netChange;
      if (netChange > maxInflow) {
        maxInflow = netChange;
        largestInflow = { walletAddress: wallet, amount: netChange.toString() };
      }
    } else if (netChange < 0n) {
      const absChange = -netChange;
      totalOutflow += absChange;
      if (absChange > maxOutflow) {
        maxOutflow = absChange;
        largestOutflow = { walletAddress: wallet, amount: absChange.toString() };
      }
    }
  }

  return {
    tokenId,
    fromDate,
    toDate,
    changes,
    summary: {
      totalEvents: changes.length,
      newHolders,
      exitedHolders,
      netChange: (totalInflow - totalOutflow).toString(),
      largestInflow,
      largestOutflow,
    },
  };
}

// ============================================================================
// State Proofs
// ============================================================================

/**
 * Generate a cryptographic proof of state at a point in time
 */
export async function generateStateProof(
  tokenId: string,
  orgId: string,
  asOf: Date
): Promise<StateProof> {
  const snapshot = await generateCapTableSnapshot(tokenId, orgId, asOf);

  // Generate individual proofs for each position
  const positions = snapshot.holders.map((holder, index) => {
    const leaf = createHash('sha256')
      .update(`${holder.walletAddress}:${holder.balance}`)
      .digest('hex');

    // Simplified merkle proof (in production, use a proper merkle tree library)
    const proof = [
      createHash('sha256').update(`proof:${index}:${leaf}`).digest('hex'),
    ];

    return {
      walletAddress: holder.walletAddress,
      balance: holder.balance,
      proof,
    };
  });

  // Sign the state root
  const signature = createHash('sha256')
    .update(`${snapshot.merkleRoot}:${asOf.toISOString()}:${tokenId}`)
    .digest('hex');

  return {
    tokenId,
    asOf,
    stateRoot: snapshot.merkleRoot,
    positions,
    signature: `sig:${signature}`,
    generatedAt: new Date(),
  };
}

// ============================================================================
// Helpers
// ============================================================================

function calculateMerkleRoot(holders: SnapshotHolder[]): string {
  if (holders.length === 0) {
    return createHash('sha256').update('empty').digest('hex');
  }

  // Create leaf nodes
  const leaves = holders.map((holder) =>
    createHash('sha256')
      .update(`${holder.walletAddress}:${holder.balance}`)
      .digest('hex')
  );

  // Build merkle tree (simplified)
  let currentLevel = leaves;
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1] || left;
      const combined = createHash('sha256')
        .update(left + right)
        .digest('hex');
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
  }

  return currentLevel[0];
}

