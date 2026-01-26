import { db, schema } from '../config/database.js';
import { eq, and, desc, gte, lte, sql, inArray } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

const { ledgerPositions, ledgerEvents, capTableSnapshots, tokens, investors, transfers } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface LedgerPosition {
  id: string;
  orgId: string;
  tokenId: string;
  investorId: string | null;
  walletAddress: string;
  balance: string;
  frozenBalance: string;
  lastEventRef: string | null;
  lastEventAt: Date | null;
  metadata: unknown;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface LedgerEvent {
  id: string;
  orgId: string;
  tokenId: string;
  investorId: string | null;
  eventType: string;
  fromWallet: string | null;
  toWallet: string | null;
  delta: string;
  ref: string | null;
  refType: string | null;
  txHash: string | null;
  txBlock: number | null;
  balanceBefore: string | null;
  balanceAfter: string | null;
  metadata: unknown;
  createdAt: Date | null;
}

export interface CapTableSnapshot {
  id: string;
  orgId: string;
  tokenId: string;
  asOf: Date;
  totalHolders: number;
  totalSupply: string;
  snapshot: unknown;
  merkleRoot: string | null;
  generatedBy: string | null;
  metadata: unknown;
  createdAt: Date | null;
}

export interface PositionSummary {
  tokenId: string;
  totalHolders: number;
  totalBalance: string;
  averageBalance: string;
  medianBalance: string;
  largestHolder: {
    investorId: string;
    balance: string;
    percentage: string;
  };
}

// ============================================================================
// Ledger Position Operations
// ============================================================================

export async function getPosition(
  tokenId: string,
  investorId: string,
  walletAddress: string,
  orgId: string
): Promise<LedgerPosition | null> {
  const position = await db.query.ledgerPositions.findFirst({
    where: and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.investorId, investorId),
      eq(ledgerPositions.walletAddress, walletAddress.toLowerCase()),
      eq(ledgerPositions.orgId, orgId)
    ),
  });

  return position as LedgerPosition | null;
}

export async function listPositions(orgId: string, params: {
  tokenId?: string;
  investorId?: string;
  minBalance?: string;
  maxBalance?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<LedgerPosition[]> {
  const { tokenId, investorId, minBalance, maxBalance, limit = 100, offset = 0 } = params;

  const conditions = [eq(ledgerPositions.orgId, orgId)];
  if (tokenId) conditions.push(eq(ledgerPositions.tokenId, tokenId));
  if (investorId) conditions.push(eq(ledgerPositions.investorId, investorId));

  let results = await db.select()
    .from(ledgerPositions)
    .where(and(...conditions))
    .orderBy(desc(ledgerPositions.balance))
    .limit(limit)
    .offset(offset);

  // Filter by balance range (done in JS due to string numeric comparison)
  if (minBalance) {
    const minBal = BigInt(minBalance);
    results = results.filter(p => BigInt(p.balance) >= minBal);
  }
  if (maxBalance) {
    const maxBal = BigInt(maxBalance);
    results = results.filter(p => BigInt(p.balance) <= maxBal);
  }

  return results as LedgerPosition[];
}

export async function getPositionsByWallet(
  walletAddress: string,
  orgId: string
): Promise<LedgerPosition[]> {
  const positions = await db.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.walletAddress, walletAddress.toLowerCase()),
      eq(ledgerPositions.orgId, orgId)
    ))
    .orderBy(desc(ledgerPositions.balance));

  return positions as LedgerPosition[];
}

export async function getPositionsByInvestor(
  investorId: string,
  orgId: string
): Promise<LedgerPosition[]> {
  const positions = await db.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.investorId, investorId),
      eq(ledgerPositions.orgId, orgId)
    ))
    .orderBy(desc(ledgerPositions.balance));

  return positions as LedgerPosition[];
}

// ============================================================================
// Ledger Events
// ============================================================================

export async function recordLedgerEvent(input: {
  orgId: string;
  tokenId: string;
  eventType: string;
  walletAddress: string;
  amount: string;
  txHash?: string;
  blockNumber?: number;
  metadata?: Record<string, unknown>;
}): Promise<LedgerEvent> {
  const [event] = await db.insert(ledgerEvents).values({
    orgId: input.orgId,
    tokenId: input.tokenId,
    eventType: input.eventType,
    toWallet: input.walletAddress.toLowerCase(),
    delta: input.amount,
    txHash: input.txHash,
    txBlock: input.blockNumber,
    metadata: input.metadata || {},
  }).returning();

  return event as LedgerEvent;
}

export async function listLedgerEvents(orgId: string, params: {
  tokenId?: string;
  walletAddress?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<LedgerEvent[]> {
  const { tokenId, walletAddress, eventType, startDate, endDate, limit = 100, offset = 0 } = params;

  const conditions = [eq(ledgerEvents.orgId, orgId)];
  if (tokenId) conditions.push(eq(ledgerEvents.tokenId, tokenId));
  // Check both fromWallet and toWallet for wallet filtering
  if (walletAddress) {
    const normalizedWallet = walletAddress.toLowerCase();
    conditions.push(sql`(${ledgerEvents.fromWallet} = ${normalizedWallet} OR ${ledgerEvents.toWallet} = ${normalizedWallet})`);
  }
  if (eventType) conditions.push(eq(ledgerEvents.eventType, eventType));
  if (startDate) conditions.push(gte(ledgerEvents.createdAt, startDate));
  if (endDate) conditions.push(lte(ledgerEvents.createdAt, endDate));

  const results = await db.select()
    .from(ledgerEvents)
    .where(and(...conditions))
    .orderBy(desc(ledgerEvents.createdAt))
    .limit(limit)
    .offset(offset);

  return results as LedgerEvent[];
}

// ============================================================================
// Cap Table Snapshots
// ============================================================================

export async function createCapTableSnapshot(
  tokenId: string,
  orgId: string,
  metadata?: Record<string, unknown>
): Promise<CapTableSnapshot> {
  // Get token info
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  // Get all positions for this token
  const positions = await db.select()
    .from(ledgerPositions)
    .where(eq(ledgerPositions.tokenId, tokenId))
    .orderBy(desc(ledgerPositions.balance));

  const totalHolders = positions.length;
  const circulatingSupply = positions.reduce(
    (sum, p) => sum + BigInt(p.balance),
    0n
  ).toString();

  // Build positions array for snapshot
  const positionsData = positions.map(p => ({
    investorId: p.investorId,
    walletAddress: p.walletAddress,
    balance: p.balance,
    percentage: BigInt(token.issuedSupply || '1') > 0n
      ? (BigInt(p.balance) * 10000n / BigInt(token.issuedSupply || '1')).toString()
      : '0',
  }));

  // Create hash of the snapshot for integrity verification
  const snapshotData = {
    tokenId,
    snapshotAt: new Date(),
    totalHolders,
    totalSupply: token.totalSupply,
    circulatingSupply,
    positions: positionsData,
  };
  const hash = createHash('sha256')
    .update(JSON.stringify(snapshotData))
    .digest('hex');

  const [snapshot] = await db.insert(capTableSnapshots).values({
    orgId,
    tokenId,
    asOf: new Date(),
    totalHolders,
    totalSupply: token.totalSupply || '0',
    snapshot: { positions: positionsData, circulatingSupply },
    merkleRoot: hash,
    generatedBy: 'system',
    metadata: metadata || {},
  }).returning();

  return snapshot as CapTableSnapshot;
}

export async function getCapTableSnapshot(id: string, orgId: string): Promise<CapTableSnapshot> {
  const snapshot = await db.query.capTableSnapshots.findFirst({
    where: and(eq(capTableSnapshots.id, id), eq(capTableSnapshots.orgId, orgId)),
  });

  if (!snapshot) {
    throw new NotFoundError('Cap table snapshot not found');
  }

  return snapshot as CapTableSnapshot;
}

export async function listCapTableSnapshots(orgId: string, params: {
  tokenId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<CapTableSnapshot[]> {
  const { tokenId, startDate, endDate, limit = 50, offset = 0 } = params;

  const conditions = [eq(capTableSnapshots.orgId, orgId)];
  if (tokenId) conditions.push(eq(capTableSnapshots.tokenId, tokenId));
  if (startDate) conditions.push(gte(capTableSnapshots.asOf, startDate));
  if (endDate) conditions.push(lte(capTableSnapshots.asOf, endDate));

  const results = await db.select()
    .from(capTableSnapshots)
    .where(and(...conditions))
    .orderBy(desc(capTableSnapshots.asOf))
    .limit(limit)
    .offset(offset);

  return results as CapTableSnapshot[];
}

export async function verifyCapTableSnapshot(id: string, orgId: string): Promise<{
  valid: boolean;
  snapshot: CapTableSnapshot;
  computedHash: string;
}> {
  const snapshot = await getCapTableSnapshot(id, orgId);

  const snapshotData = {
    tokenId: snapshot.tokenId,
    snapshotAt: snapshot.asOf.toISOString(),
    totalHolders: snapshot.totalHolders,
    totalSupply: snapshot.totalSupply,
    snapshot: snapshot.snapshot,
  };

  const computedHash = createHash('sha256')
    .update(JSON.stringify(snapshotData))
    .digest('hex');

  return {
    valid: computedHash === snapshot.merkleRoot,
    snapshot,
    computedHash,
  };
}

// ============================================================================
// Reporting & Analytics
// ============================================================================

export async function getPositionSummary(tokenId: string, orgId: string): Promise<PositionSummary> {
  const positions = await db.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.orgId, orgId)
    ))
    .orderBy(desc(ledgerPositions.balance));

  if (positions.length === 0) {
    return {
      tokenId,
      totalHolders: 0,
      totalBalance: '0',
      averageBalance: '0',
      medianBalance: '0',
      largestHolder: {
        investorId: '',
        balance: '0',
        percentage: '0',
      },
    };
  }

  const balances = positions.map(p => BigInt(p.balance));
  const totalBalance = balances.reduce((a, b) => a + b, 0n);
  const averageBalance = totalBalance / BigInt(positions.length);

  // Calculate median
  const sortedBalances = [...balances].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  const midIndex = Math.floor(sortedBalances.length / 2);
  const medianBalance = sortedBalances.length % 2 === 0
    ? (sortedBalances[midIndex - 1] + sortedBalances[midIndex]) / 2n
    : sortedBalances[midIndex];

  const largest = positions[0];
  const largestPercentage = totalBalance > 0n
    ? (BigInt(largest.balance) * 10000n / totalBalance).toString()
    : '0';

  return {
    tokenId,
    totalHolders: positions.length,
    totalBalance: totalBalance.toString(),
    averageBalance: averageBalance.toString(),
    medianBalance: medianBalance.toString(),
    largestHolder: {
      investorId: largest.investorId || '',
      balance: largest.balance,
      percentage: largestPercentage,
    },
  };
}

export async function getTokenDistribution(tokenId: string, orgId: string): Promise<{
  tokenId: string;
  distribution: {
    range: string;
    count: number;
    totalBalance: string;
    percentage: string;
  }[];
}> {
  const positions = await db.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.orgId, orgId)
    ));

  const ranges = [
    { min: 0n, max: 1000n, label: '0-1K' },
    { min: 1000n, max: 10000n, label: '1K-10K' },
    { min: 10000n, max: 100000n, label: '10K-100K' },
    { min: 100000n, max: 1000000n, label: '100K-1M' },
    { min: 1000000n, max: 10000000n, label: '1M-10M' },
    { min: 10000000n, max: null, label: '10M+' },
  ];

  const totalBalance = positions.reduce((sum, p) => sum + BigInt(p.balance), 0n);

  const distribution = ranges.map(range => {
    const inRange = positions.filter(p => {
      const bal = BigInt(p.balance);
      if (range.max === null) {
        return bal >= range.min;
      }
      return bal >= range.min && bal < range.max;
    });

    const rangeTotal = inRange.reduce((sum, p) => sum + BigInt(p.balance), 0n);
    const percentage = totalBalance > 0n
      ? (rangeTotal * 10000n / totalBalance).toString()
      : '0';

    return {
      range: range.label,
      count: inRange.length,
      totalBalance: rangeTotal.toString(),
      percentage,
    };
  });

  return { tokenId, distribution };
}

export async function getHolderMovements(orgId: string, params: {
  tokenId?: string;
  startDate: Date;
  endDate: Date;
}): Promise<{
  period: { start: string; end: string };
  newHolders: number;
  exitedHolders: number;
  netChange: number;
  volumeIn: string;
  volumeOut: string;
}> {
  const { tokenId, startDate, endDate } = params;

  const conditions = [
    eq(ledgerEvents.orgId, orgId),
    gte(ledgerEvents.createdAt, startDate),
    lte(ledgerEvents.createdAt, endDate),
  ];
  if (tokenId) conditions.push(eq(ledgerEvents.tokenId, tokenId));

  const events = await db.select()
    .from(ledgerEvents)
    .where(and(...conditions));

  let volumeIn = 0n;
  let volumeOut = 0n;
  const walletBalances = new Map<string, bigint>();

  for (const event of events) {
    const amount = BigInt(event.delta);
    if (amount > 0n) {
      volumeIn += amount;
    } else {
      volumeOut += -amount;
    }

    // Use toWallet for credits, fromWallet for debits
    const wallet = event.toWallet || event.fromWallet || '';
    const key = `${event.tokenId}:${wallet}`;
    const current = walletBalances.get(key) || 0n;
    walletBalances.set(key, current + amount);
  }

  // Count new holders (balance went from 0 to positive)
  // Count exited holders (balance went to 0)
  // This is a simplified calculation
  let newHolders = 0;
  let exitedHolders = 0;

  for (const [_, balance] of walletBalances) {
    if (balance > 0n) newHolders++;
    if (balance < 0n) exitedHolders++;
  }

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    newHolders,
    exitedHolders,
    netChange: newHolders - exitedHolders,
    volumeIn: volumeIn.toString(),
    volumeOut: volumeOut.toString(),
  };
}

export async function getTransferVolume(orgId: string, params: {
  tokenId?: string;
  startDate: Date;
  endDate: Date;
  groupBy?: 'day' | 'week' | 'month';
}): Promise<{
  period: { start: string; end: string };
  totalVolume: string;
  totalTransfers: number;
  data: { date: string; volume: string; count: number }[];
}> {
  const { tokenId, startDate, endDate, groupBy = 'day' } = params;

  const conditions = [
    eq(transfers.orgId, orgId),
    gte(transfers.createdAt, startDate),
    lte(transfers.createdAt, endDate),
    eq(transfers.status, 'settled'),
  ];
  if (tokenId) conditions.push(eq(transfers.tokenId, tokenId));

  const transferData = await db.select()
    .from(transfers)
    .where(and(...conditions))
    .orderBy(transfers.createdAt);

  // Group by period
  const groups = new Map<string, { volume: bigint; count: number }>();

  for (const t of transferData) {
    let key: string;
    const date = new Date(t.createdAt ?? new Date());

    if (groupBy === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    const existing = groups.get(key) || { volume: 0n, count: 0 };
    groups.set(key, {
      volume: existing.volume + BigInt(t.amount),
      count: existing.count + 1,
    });
  }

  const data = Array.from(groups.entries())
    .map(([date, { volume, count }]) => ({
      date,
      volume: volume.toString(),
      count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalVolume = data.reduce((sum, d) => sum + BigInt(d.volume), 0n);
  const totalTransfers = data.reduce((sum, d) => sum + d.count, 0);

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    totalVolume: totalVolume.toString(),
    totalTransfers,
    data,
  };
}

// ============================================================================
// Portfolio View
// ============================================================================

export async function getInvestorPortfolio(investorId: string, orgId: string): Promise<{
  investorId: string;
  holdings: {
    tokenId: string;
    tokenName: string;
    tokenSymbol: string;
    walletAddress: string;
    balance: string;
    lockedBalance: string;
  }[];
  totalPositions: number;
}> {
  const positions = await db.select({
    position: ledgerPositions,
    token: tokens,
  })
    .from(ledgerPositions)
    .innerJoin(tokens, eq(ledgerPositions.tokenId, tokens.id))
    .where(and(
      eq(ledgerPositions.investorId, investorId),
      eq(ledgerPositions.orgId, orgId)
    ));

  const holdings = positions.map(({ position, token }) => ({
    tokenId: position.tokenId,
    tokenName: token.name,
    tokenSymbol: token.symbol,
    walletAddress: position.walletAddress,
    balance: position.balance,
    lockedBalance: position.frozenBalance || '0',
  }));

  return {
    investorId,
    holdings,
    totalPositions: holdings.length,
  };
}
