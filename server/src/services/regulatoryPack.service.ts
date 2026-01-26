import { db, schema } from '../config/database.js';
import { eq, and, lte, desc, asc } from 'drizzle-orm';
import { createHash } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import * as evidenceService from './evidence.service.js';
import { logger } from '../middleware/logger.js';

const {
  tokens,
  assets,
  transfers,
  issuances,
  redemptions,
  clawbacks,
  distributions,
  distributionPayments,
  investors,
  ledgerPositions,
  ledgerEvents,
  capTableSnapshots,
  decisions,
  policyVersions,
  auditLogs,
  domainEventsOutbox,
} = schema;

// ============================================================================
// Types
// ============================================================================

export interface RegulatoryPack {
  id: string;
  generatedAt: string;
  version: string;
  type: 'asset_regulatory_pack' | 'token_regulatory_pack';

  subject: {
    type: string;
    id: string;
    name?: string;
  };

  organization: {
    id: string;
    name?: string;
  };

  // Point-in-time reference
  asOfDate: string;
  isCurrentState: boolean;

  // Token/Asset details
  tokenDetails?: TokenDetails;
  assetDetails?: AssetDetails;

  // Holder information
  capTable: CapTableSection;

  // Transaction history
  transferHistory: TransferSection;
  issuanceHistory: IssuanceSection;
  redemptionHistory: RedemptionSection;

  // Compliance
  complianceSection: ComplianceSection;

  // Distributions
  distributionHistory: DistributionSection;

  // Attestation
  attestation: PackAttestation;
}

interface TokenDetails {
  id: string;
  name: string;
  symbol: string;
  standard: string;
  chainId: number;
  contractAddress?: string;
  deployedAt?: string;
  totalSupply: string;
  status: string;
}

interface AssetDetails {
  id: string;
  name: string;
  assetClass?: string;
  jurisdiction?: string;
  valuationCurrency?: string;
  state: string;
}

interface CapTableSection {
  snapshotDate: string;
  totalHolders: number;
  totalSupply: string;
  positions: Array<{
    investorId: string | null;
    walletAddress: string;
    balance: string;
    percentOwnership: string;
    status?: string;
    jurisdiction?: string;
  }>;
}

interface TransferSection {
  totalTransfers: number;
  transfers: Array<{
    id: string;
    fromWallet: string;
    toWallet: string;
    amount: string;
    status: string;
    txHash?: string;
    createdAt: string;
    settledAt?: string;
    complianceDecisionId?: string;
    complianceResult?: string;
  }>;
}

interface IssuanceSection {
  totalIssuances: number;
  totalMinted: string;
  issuances: Array<{
    id: string;
    toWallet: string;
    amount: string;
    status: string;
    txHash?: string;
    createdAt: string;
  }>;
}

interface RedemptionSection {
  totalRedemptions: number;
  totalRedeemed: string;
  redemptions: Array<{
    id: string;
    fromWallet: string;
    amount: string;
    status: string;
    txHash?: string;
    createdAt: string;
  }>;
}

interface ComplianceSection {
  policyVersionsUsed: Array<{
    id: string;
    policyId: string;
    version: number;
    publishedAt: string;
  }>;
  decisions: Array<{
    id: string;
    type: string;
    result: string;
    reasons: unknown[];
    inputsHash: string;
    signature?: string;
    createdAt: string;
  }>;
  identityStatuses: Array<{
    investorId: string;
    status: string;
    kycLevel?: string;
    accreditedStatus?: string;
    jurisdiction?: string;
    lastVerifiedAt?: string;
  }>;
}

interface DistributionSection {
  totalDistributions: number;
  totalDistributed: string;
  distributions: Array<{
    id: string;
    name: string;
    type: string;
    totalAmount: string;
    recordDate: string;
    paymentDate: string;
    status: string;
    totalRecipients: number;
    totalPaid?: string;
  }>;
}

interface PackAttestation {
  contentHash: string;
  algorithm: string;
  attestedAt: string;
  signature?: string;
}

// ============================================================================
// Regulatory Pack Generation
// ============================================================================

/**
 * Generate a comprehensive regulatory pack for a token/asset.
 * Can generate for current state or reconstruct at a point in time.
 */
export async function generateRegulatoryPack(
  tokenId: string,
  orgId: string,
  options: {
    asOfDate?: Date;
    includeAllTransfers?: boolean;
    includeIdentityDetails?: boolean;
    limit?: number;
  } = {}
): Promise<RegulatoryPack> {
  const {
    asOfDate,
    includeAllTransfers = true,
    includeIdentityDetails = true,
    limit = 1000,
  } = options;

  const asOfTimestamp = asOfDate || new Date();
  const isCurrentState = !asOfDate;

  // Get token
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  // Get asset if linked
  const asset = token.assetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, token.assetId) })
    : null;

  // Generate sections in parallel
  const [
    capTable,
    transferHistory,
    issuanceHistory,
    redemptionHistory,
    complianceSection,
    distributionHistory,
    auditHistory,
  ] = await Promise.all([
    getCapTableSection(tokenId, orgId, asOfTimestamp, limit),
    getTransferSection(tokenId, orgId, asOfTimestamp, includeAllTransfers ? limit : 100),
    getIssuanceSection(tokenId, orgId, asOfTimestamp, limit),
    getRedemptionSection(tokenId, orgId, asOfTimestamp, limit),
    getComplianceSection(tokenId, orgId, asOfTimestamp, includeIdentityDetails, limit),
    getDistributionSection(tokenId, orgId, asOfTimestamp, limit),
    auditService.getAuditLog(orgId, {
      resourceType: 'token',
      resourceId: tokenId,
      limit: limit,
    }),
  ]);

  const packId = `rp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const pack: Omit<RegulatoryPack, 'attestation'> = {
    id: packId,
    generatedAt: new Date(),
    version: '1.0',
    type: 'token_regulatory_pack',
    subject: {
      type: 'token',
      id: tokenId,
      name: `${token.name} (${token.symbol})`,
    },
    organization: {
      id: orgId,
    },
    asOfDate: asOfTimestamp.toISOString(),
    isCurrentState,
    tokenDetails: {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      standard: token.standard,
      chainId: token.chainId,
      contractAddress: token.address || undefined,
      deployedAt: token.deployedAt?.toISOString() || undefined,
      totalSupply: token.totalSupply || '0',
      status: token.status,
    },
    assetDetails: asset ? {
      id: asset.id,
      name: asset.name,
      assetClass: asset.assetClass || undefined,
      jurisdiction: asset.jurisdiction || undefined,
      valuationCurrency: asset.valuationCurrency || undefined,
      state: asset.state,
    } : undefined,
    capTable,
    transferHistory,
    issuanceHistory,
    redemptionHistory,
    complianceSection,
    distributionHistory,
  };

  // Generate attestation
  const attestation = generatePackAttestation(pack);

  return {
    ...pack,
    attestation,
  };
}

// ============================================================================
// Point-in-Time Reconstruction
// ============================================================================

/**
 * Reconstruct the state of a token at a specific point in time.
 * Uses event sourcing from snapshots + events.
 */
export async function reconstructStateAtTime(
  tokenId: string,
  orgId: string,
  targetDate: Date
): Promise<{
  positions: Array<{ walletAddress: string; balance: string }>;
  totalSupply: string;
  reconstructionMethod: string;
  sourceSnapshot?: string;
  eventsApplied: number;
}> {
  // Find the most recent snapshot before target date
  const snapshot = await db.select()
    .from(capTableSnapshots)
    .where(and(
      eq(capTableSnapshots.tokenId, tokenId),
      eq(capTableSnapshots.orgId, orgId),
      lte(capTableSnapshots.asOf, targetDate)
    ))
    .orderBy(desc(capTableSnapshots.asOf))
    .limit(1);

  let positions: Map<string, bigint>;
  let eventsApplied = 0;
  let reconstructionMethod: string;
  let sourceSnapshot: string | undefined;

  if (snapshot.length > 0) {
    // Start from snapshot
    const snapshotData = snapshot[0].snapshot as {
      positions: Array<{ walletAddress: string; balance: string }>;
    };

    positions = new Map(
      snapshotData.positions.map(p => [p.walletAddress.toLowerCase(), BigInt(p.balance)])
    );
    sourceSnapshot = snapshot[0].id;
    reconstructionMethod = 'snapshot_plus_events';

    // Apply events after snapshot up to target date
    const events = await db.select()
      .from(ledgerEvents)
      .where(and(
        eq(ledgerEvents.tokenId, tokenId),
        lte(ledgerEvents.createdAt, targetDate)
      ))
      .orderBy(asc(ledgerEvents.createdAt));

    // Filter events after snapshot
    const snapshotAsOf = snapshot[0].asOf;
    for (const event of events) {
      if (event.createdAt && event.createdAt > snapshotAsOf) {
        applyLedgerEvent(positions, event);
        eventsApplied++;
      }
    }
  } else {
    // No snapshot - reconstruct from genesis
    positions = new Map();
    reconstructionMethod = 'full_event_replay';

    // Apply all events up to target date
    const events = await db.select()
      .from(ledgerEvents)
      .where(and(
        eq(ledgerEvents.tokenId, tokenId),
        lte(ledgerEvents.createdAt, targetDate)
      ))
      .orderBy(asc(ledgerEvents.createdAt));

    for (const event of events) {
      applyLedgerEvent(positions, event);
      eventsApplied++;
    }
  }

  // Calculate total supply
  let totalSupply = 0n;
  const positionArray: Array<{ walletAddress: string; balance: string }> = [];

  for (const [wallet, balance] of positions.entries()) {
    if (balance > 0n) {
      totalSupply += balance;
      positionArray.push({ walletAddress: wallet, balance: balance.toString() });
    }
  }

  return {
    positions: positionArray,
    totalSupply: totalSupply.toString(),
    reconstructionMethod,
    sourceSnapshot,
    eventsApplied,
  };
}

function applyLedgerEvent(positions: Map<string, bigint>, event: any): void {
  const amount = BigInt(event.amount || '0');

  switch (event.eventType) {
    case 'mint':
    case 'issuance':
      if (event.toWallet) {
        const current = positions.get(event.toWallet.toLowerCase()) || 0n;
        positions.set(event.toWallet.toLowerCase(), current + amount);
      }
      break;

    case 'burn':
    case 'redemption':
      if (event.fromWallet) {
        const current = positions.get(event.fromWallet.toLowerCase()) || 0n;
        positions.set(event.fromWallet.toLowerCase(), current - amount);
      }
      break;

    case 'transfer':
      if (event.fromWallet) {
        const fromCurrent = positions.get(event.fromWallet.toLowerCase()) || 0n;
        positions.set(event.fromWallet.toLowerCase(), fromCurrent - amount);
      }
      if (event.toWallet) {
        const toCurrent = positions.get(event.toWallet.toLowerCase()) || 0n;
        positions.set(event.toWallet.toLowerCase(), toCurrent + amount);
      }
      break;
  }
}

// ============================================================================
// Section Generators
// ============================================================================

async function getCapTableSection(
  tokenId: string,
  orgId: string,
  asOfDate: Date,
  limit: number
): Promise<CapTableSection> {
  // For current state, use ledger positions directly
  const positions = await db.select()
    .from(ledgerPositions)
    .where(and(
      eq(ledgerPositions.tokenId, tokenId),
      eq(ledgerPositions.orgId, orgId)
    ))
    .limit(limit);

  const nonZeroPositions = positions.filter(p => BigInt(p.balance) > 0n);

  // Calculate total supply
  const totalSupply = nonZeroPositions.reduce(
    (sum, p) => sum + BigInt(p.balance),
    0n
  );

  // Calculate ownership percentages
  const positionsWithPercent = nonZeroPositions.map(p => ({
    investorId: p.investorId,
    walletAddress: p.walletAddress,
    balance: p.balance,
    percentOwnership: totalSupply > 0n
      ? ((BigInt(p.balance) * 10000n) / totalSupply).toString() // Basis points
      : '0',
  }));

  return {
    snapshotDate: asOfDate.toISOString(),
    totalHolders: nonZeroPositions.length,
    totalSupply: totalSupply.toString(),
    positions: positionsWithPercent,
  };
}

async function getTransferSection(
  tokenId: string,
  orgId: string,
  asOfDate: Date,
  limit: number
): Promise<TransferSection> {
  const transferList = await db.select()
    .from(transfers)
    .where(and(
      eq(transfers.tokenId, tokenId),
      eq(transfers.orgId, orgId),
      lte(transfers.createdAt, asOfDate)
    ))
    .orderBy(desc(transfers.createdAt))
    .limit(limit);

  return {
    totalTransfers: transferList.length,
    transfers: transferList.map(t => ({
      id: t.id,
      fromWallet: t.fromWallet,
      toWallet: t.toWallet,
      amount: t.amount,
      status: t.status,
      txHash: t.txHash || undefined,
      createdAt: t.createdAt!.toISOString(),
      settledAt: t.settledAt?.toISOString() || undefined,
      complianceDecisionId: t.decisionId || undefined,
    })),
  };
}

async function getIssuanceSection(
  tokenId: string,
  orgId: string,
  asOfDate: Date,
  limit: number
): Promise<IssuanceSection> {
  const issuanceList = await db.select()
    .from(issuances)
    .where(and(
      eq(issuances.tokenId, tokenId),
      eq(issuances.orgId, orgId),
      lte(issuances.createdAt, asOfDate)
    ))
    .orderBy(desc(issuances.createdAt))
    .limit(limit);

  const totalMinted = issuanceList
    .filter(i => i.status === 'confirmed' || i.status === 'settled')
    .reduce((sum, i) => sum + BigInt(i.amount), 0n);

  return {
    totalIssuances: issuanceList.length,
    totalMinted: totalMinted.toString(),
    issuances: issuanceList.map(i => ({
      id: i.id,
      toWallet: i.toWallet,
      amount: i.amount,
      status: i.status,
      txHash: i.txHash || undefined,
      createdAt: i.createdAt!.toISOString(),
    })),
  };
}

async function getRedemptionSection(
  tokenId: string,
  orgId: string,
  asOfDate: Date,
  limit: number
): Promise<RedemptionSection> {
  const redemptionList = await db.select()
    .from(redemptions)
    .where(and(
      eq(redemptions.tokenId, tokenId),
      eq(redemptions.orgId, orgId),
      lte(redemptions.createdAt, asOfDate)
    ))
    .orderBy(desc(redemptions.createdAt))
    .limit(limit);

  const totalRedeemed = redemptionList
    .filter(r => r.status === 'confirmed' || r.status === 'completed')
    .reduce((sum, r) => sum + BigInt(r.amount), 0n);

  return {
    totalRedemptions: redemptionList.length,
    totalRedeemed: totalRedeemed.toString(),
    redemptions: redemptionList.map(r => ({
      id: r.id,
      fromWallet: r.fromWallet,
      amount: r.amount,
      status: r.status,
      txHash: r.txHash || undefined,
      createdAt: r.createdAt!.toISOString(),
    })),
  };
}

async function getComplianceSection(
  tokenId: string,
  orgId: string,
  asOfDate: Date,
  includeIdentityDetails: boolean,
  limit: number
): Promise<ComplianceSection> {
  // Get policy versions used
  const policyVersionList = await db.select()
    .from(policyVersions)
    .where(and(
      eq(policyVersions.orgId, orgId),
      lte(policyVersions.publishedAt, asOfDate)
    ))
    .orderBy(desc(policyVersions.publishedAt))
    .limit(50);

  // Get decisions for this token
  const decisionList = await db.select()
    .from(decisions)
    .where(and(
      eq(decisions.orgId, orgId),
      eq(decisions.subjectRef, tokenId),
      lte(decisions.createdAt, asOfDate)
    ))
    .orderBy(desc(decisions.createdAt))
    .limit(limit);

  // Get identity statuses if requested
  let identityStatuses: ComplianceSection['identityStatuses'] = [];
  if (includeIdentityDetails) {
    // Get all investors who have held this token
    const investorIds = new Set<string>();
    const positions = await db.select()
      .from(ledgerPositions)
      .where(eq(ledgerPositions.tokenId, tokenId));

    positions.forEach(p => {
      if (p.investorId) investorIds.add(p.investorId);
    });

    if (investorIds.size > 0) {
      const investorList = await db.query.investors.findMany({
        where: and(eq(investors.orgId, orgId)),
      });

      identityStatuses = investorList
        .filter(i => investorIds.has(i.id))
        .map(i => ({
          investorId: i.id,
          status: i.status,
          kycLevel: i.classification || undefined,
          accreditedStatus: i.accreditedStatus || undefined,
          jurisdiction: i.jurisdiction || undefined,
        }));
    }
  }

  return {
    policyVersionsUsed: policyVersionList.map(pv => ({
      id: pv.id,
      policyId: pv.policyId,
      version: pv.version,
      publishedAt: pv.publishedAt!.toISOString(),
    })),
    decisions: decisionList.map(d => ({
      id: d.id,
      type: d.type,
      result: d.result,
      reasons: d.reasons as unknown[],
      inputsHash: d.inputsHash,
      signature: d.signature || undefined,
      createdAt: d.createdAt!.toISOString(),
    })),
    identityStatuses,
  };
}

async function getDistributionSection(
  tokenId: string,
  orgId: string,
  asOfDate: Date,
  limit: number
): Promise<DistributionSection> {
  const distributionList = await db.select()
    .from(distributions)
    .where(and(
      eq(distributions.tokenId, tokenId),
      eq(distributions.orgId, orgId),
      lte(distributions.createdAt, asOfDate)
    ))
    .orderBy(desc(distributions.createdAt))
    .limit(limit);

  const totalDistributed = distributionList
    .filter(d => d.status === 'completed')
    .reduce((sum, d) => sum + BigInt(d.totalPaid || d.totalAmount), 0n);

  return {
    totalDistributions: distributionList.length,
    totalDistributed: totalDistributed.toString(),
    distributions: distributionList.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      totalAmount: d.totalAmount,
      recordDate: d.recordDate!.toString(),
      paymentDate: d.paymentDate!.toString(),
      status: d.status,
      totalRecipients: d.totalRecipients || 0,
      totalPaid: d.totalPaid || undefined,
    })),
  };
}

// ============================================================================
// Attestation
// ============================================================================

function generatePackAttestation(pack: Omit<RegulatoryPack, 'attestation'>): PackAttestation {
  const canonicalData = JSON.stringify({
    id: pack.id,
    generatedAt: pack.generatedAt,
    asOfDate: pack.asOfDate,
    subject: pack.subject,
    capTableHash: createHash('sha256').update(JSON.stringify(pack.capTable)).digest('hex'),
    transferHistoryHash: createHash('sha256').update(JSON.stringify(pack.transferHistory)).digest('hex'),
    complianceSectionHash: createHash('sha256').update(JSON.stringify(pack.complianceSection)).digest('hex'),
  });

  const contentHash = createHash('sha256').update(canonicalData).digest('hex');

  return {
    contentHash,
    algorithm: 'SHA-256',
    attestedAt: new Date(),
  };
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export regulatory pack as JSON.
 */
export async function exportRegulatoryPackJson(
  tokenId: string,
  orgId: string,
  options: Parameters<typeof generateRegulatoryPack>[2] = {}
): Promise<{ filename: string; content: string; mimeType: string }> {
  const pack = await generateRegulatoryPack(tokenId, orgId, options);

  const filename = `regulatory_pack_${pack.subject.name?.replace(/[^a-zA-Z0-9]/g, '_') || tokenId}_${pack.asOfDate.split('T')[0]}.json`;

  return {
    filename,
    content: JSON.stringify(pack, null, 2),
    mimeType: 'application/json',
  };
}
