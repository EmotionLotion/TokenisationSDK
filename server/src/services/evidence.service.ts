import { db, schema } from '../config/database.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHash } from 'crypto';
import * as auditService from './audit.service.js';
import { NotFoundError } from '../middleware/errorHandler.js';

const {
  investors,
  investorWallets,
  kycSessions,
  transfers,
  tokens,
  decisions,
  issuances,
  redemptions,
  ledgerEvents,
  ledgerPositions,
  assets,
} = schema;

// ============================================================================
// Types
// ============================================================================

export interface EvidencePack {
  /** Unique identifier for this evidence pack */
  id: string;
  /** When the pack was generated */
  generatedAt: string;
  /** Pack type */
  type: EvidencePackType;
  /** Schema version */
  version: string;
  /** Subject of the evidence pack */
  subject: {
    type: string;
    id: string;
    name?: string;
  };
  /** Organization context */
  organization: {
    id: string;
    name?: string;
  };
  /** Main data payload */
  data: Record<string, unknown>;
  /** Complete audit trail for the subject */
  auditTrail: auditService.AuditLogEntry[];
  /** Cryptographic attestation */
  attestation: EvidenceAttestation;
  /** Related entities referenced in this pack */
  relatedEntities?: Record<string, unknown[]>;
}

export type EvidencePackType =
  | 'investor_evidence_pack'
  | 'transfer_evidence_pack'
  | 'token_evidence_pack'
  | 'issuance_evidence_pack'
  | 'kyc_evidence_pack'
  | 'clawback_evidence_pack';

export interface EvidenceAttestation {
  /** Hash of the entire evidence pack data */
  contentHash: string;
  /** Algorithm used for hashing */
  algorithm: string;
  /** Timestamp of attestation */
  attestedAt: string;
  /** Server signature (if enabled) */
  signature?: string;
  /** Public key reference for verification */
  publicKeyId?: string;
}

// ============================================================================
// Evidence Pack Generators
// ============================================================================

/**
 * Generates a comprehensive evidence pack for an investor.
 * Includes KYC records, wallets, holdings, and complete audit trail.
 */
export async function generateInvestorPack(
  investorId: string,
  orgId: string
): Promise<EvidencePack> {
  // Fetch investor
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  // Fetch related data in parallel
  const [wallets, kyc, positions, transfersFrom, transfersTo, auditHistory] = await Promise.all([
    db.query.investorWallets.findMany({
      where: and(eq(investorWallets.investorId, investorId), eq(investorWallets.orgId, orgId)),
    }),
    db.query.kycSessions.findMany({
      where: and(eq(kycSessions.investorId, investorId), eq(kycSessions.orgId, orgId)),
      orderBy: desc(kycSessions.createdAt),
    }),
    db.select()
      .from(ledgerPositions)
      .where(and(eq(ledgerPositions.investorId, investorId), eq(ledgerPositions.orgId, orgId))),
    db.select()
      .from(transfers)
      .where(and(eq(transfers.fromInvestorId, investorId), eq(transfers.orgId, orgId)))
      .orderBy(desc(transfers.createdAt))
      .limit(100),
    db.select()
      .from(transfers)
      .where(and(eq(transfers.toInvestorId, investorId), eq(transfers.orgId, orgId)))
      .orderBy(desc(transfers.createdAt))
      .limit(100),
    auditService.getAuditLog(orgId, {
      resourceType: 'investor',
      resourceId: investorId,
      limit: 1000,
    }),
  ]);

  // Build evidence pack
  const data = {
    investor: sanitizeForExport(investor),
    wallets: wallets.map(sanitizeForExport),
    kycHistory: kyc.map(sanitizeForExport),
    currentHoldings: positions.map(sanitizeForExport),
    transferHistory: {
      outgoing: transfersFrom.map(sanitizeForExport),
      incoming: transfersTo.map(sanitizeForExport),
    },
    summary: {
      totalWallets: wallets.length,
      activeWallets: wallets.filter(w => w.status === 'active').length,
      kycStatus: investor.status,
      totalPositions: positions.length,
      totalTransfers: transfersFrom.length + transfersTo.length,
    },
  };

  return createEvidencePack({
    type: 'investor_evidence_pack',
    subject: {
      type: 'investor',
      id: investorId,
    },
    orgId,
    data,
    auditTrail: auditHistory,
  });
}

/**
 * Generates a comprehensive evidence pack for a transfer.
 * Includes compliance decisions, both parties' KYC status, policy decision trace, and audit trail.
 */
export async function generateTransferPack(
  transferId: string,
  orgId: string
): Promise<EvidencePack> {
  // Fetch transfer
  const transfer = await db.query.transfers.findFirst({
    where: and(eq(transfers.id, transferId), eq(transfers.orgId, orgId)),
  });

  if (!transfer) {
    throw new NotFoundError('Transfer not found');
  }

  // Fetch related data
  const [
    token,
    complianceDecisions,
    fromInvestor,
    toInvestor,
    ledgerEventsForTransfer,
    auditHistory,
  ] = await Promise.all([
    db.query.tokens.findFirst({
      where: eq(tokens.id, transfer.tokenId),
    }),
    db.select()
      .from(decisions)
      .where(and(
        eq(decisions.subjectRef, transferId),
        eq(decisions.subjectType, 'transfer'),
        eq(decisions.orgId, orgId)
      ))
      .orderBy(desc(decisions.createdAt)),
    transfer.fromInvestorId
      ? db.query.investors.findFirst({ where: eq(investors.id, transfer.fromInvestorId) })
      : Promise.resolve(null),
    transfer.toInvestorId
      ? db.query.investors.findFirst({ where: eq(investors.id, transfer.toInvestorId) })
      : Promise.resolve(null),
    db.select()
      .from(ledgerEvents)
      .where(and(eq(ledgerEvents.ref, transferId), eq(ledgerEvents.refType, 'transfer'))),
    auditService.getAuditLog(orgId, {
      resourceType: 'transfer',
      resourceId: transferId,
      limit: 500,
    }),
  ]);

  // Fetch policy versions for each decision (decision trace requirement)
  const { policyVersions } = await import('../db/schema.js').then(m => m.default || m) as typeof schema;
  const policyDecisionTrace = await Promise.all(
    complianceDecisions
      .filter(d => d.policyVersionId)
      .map(async (decision) => {
        const policyVersion = await db.query.policyVersions?.findFirst({
          where: eq(policyVersions.id, decision.policyVersionId!),
        });
        return {
          decisionId: decision.id,
          decisionResult: decision.result,
          decisionReasons: decision.reasons,
          decisionCreatedAt: decision.createdAt,
          inputsHash: decision.inputsHash,
          policyVersion: policyVersion ? {
            id: policyVersion.id,
            policyId: policyVersion.policyId,
            version: policyVersion.version,
            ruleset: policyVersion.ruleset,
            activatedAt: policyVersion.activatedAt,
          } : null,
        };
      })
  );

  // Build evidence pack with full decision trace
  const data = {
    transfer: sanitizeForExport(transfer),
    token: token ? sanitizeForExport(token) : null,
    complianceDecisions: complianceDecisions.map(sanitizeForExport),
    // Decision trace includes policy version and ruleset for each decision
    policyDecisionTrace: policyDecisionTrace.length > 0 ? policyDecisionTrace : null,
    parties: {
      from: fromInvestor ? {
        investor: sanitizeForExport(fromInvestor),
        wallet: transfer.fromWallet,
      } : { wallet: transfer.fromWallet },
      to: toInvestor ? {
        investor: sanitizeForExport(toInvestor),
        wallet: transfer.toWallet,
      } : { wallet: transfer.toWallet },
    },
    ledgerImpact: ledgerEventsForTransfer.map(sanitizeForExport),
    timeline: buildTransferTimeline(transfer, complianceDecisions, auditHistory),
  };

  return createEvidencePack({
    type: 'transfer_evidence_pack',
    subject: {
      type: 'transfer',
      id: transferId,
    },
    orgId,
    data,
    auditTrail: auditHistory,
  });
}

/**
 * Generates a comprehensive evidence pack for a token.
 * Includes deployment info, cap table, issuances, and redemptions.
 */
export async function generateTokenPack(
  tokenId: string,
  orgId: string
): Promise<EvidencePack> {
  const token = await db.query.tokens.findFirst({
    where: and(eq(tokens.id, tokenId), eq(tokens.orgId, orgId)),
  });

  if (!token) {
    throw new NotFoundError('Token not found');
  }

  const [
    asset,
    positions,
    issuanceRecords,
    redemptionRecords,
    tokenTransfers,
    auditHistory,
  ] = await Promise.all([
    token.assetId
      ? db.query.assets.findFirst({ where: eq(assets.id, token.assetId) })
      : Promise.resolve(null),
    db.select()
      .from(ledgerPositions)
      .where(and(eq(ledgerPositions.tokenId, tokenId), eq(ledgerPositions.orgId, orgId))),
    db.select()
      .from(issuances)
      .where(and(eq(issuances.tokenId, tokenId), eq(issuances.orgId, orgId)))
      .orderBy(desc(issuances.createdAt))
      .limit(500),
    db.select()
      .from(redemptions)
      .where(and(eq(redemptions.tokenId, tokenId), eq(redemptions.orgId, orgId)))
      .orderBy(desc(redemptions.createdAt))
      .limit(500),
    db.select()
      .from(transfers)
      .where(and(eq(transfers.tokenId, tokenId), eq(transfers.orgId, orgId)))
      .orderBy(desc(transfers.createdAt))
      .limit(500),
    auditService.getAuditLog(orgId, {
      resourceType: 'token',
      resourceId: tokenId,
      limit: 1000,
    }),
  ]);

  const data = {
    token: sanitizeForExport(token),
    underlyingAsset: asset ? sanitizeForExport(asset) : null,
    capTable: {
      positions: positions.map(sanitizeForExport),
      totalHolders: positions.length,
      totalSupply: token.totalSupply,
    },
    issuances: issuanceRecords.map(sanitizeForExport),
    redemptions: redemptionRecords.map(sanitizeForExport),
    transfers: tokenTransfers.map(sanitizeForExport),
    statistics: {
      totalIssuances: issuanceRecords.length,
      totalRedemptions: redemptionRecords.length,
      totalTransfers: tokenTransfers.length,
      deployedAt: token.deployedAt,
      status: token.status,
    },
  };

  return createEvidencePack({
    type: 'token_evidence_pack',
    subject: {
      type: 'token',
      id: tokenId,
      name: `${token.name} (${token.symbol})`,
    },
    orgId,
    data,
    auditTrail: auditHistory,
  });
}

/**
 * Generates a KYC evidence pack for compliance reporting.
 */
export async function generateKycPack(
  investorId: string,
  orgId: string
): Promise<EvidencePack> {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, investorId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  const [kycHistory, wallets, kycAuditHistory] = await Promise.all([
    db.query.kycSessions.findMany({
      where: and(eq(kycSessions.investorId, investorId), eq(kycSessions.orgId, orgId)),
      orderBy: desc(kycSessions.createdAt),
    }),
    db.query.investorWallets.findMany({
      where: and(eq(investorWallets.investorId, investorId), eq(investorWallets.orgId, orgId)),
    }),
    auditService.getAuditLog(orgId, {
      resourceType: 'kyc_session',
      limit: 500,
    }),
  ]);

  // Filter audit logs related to this investor's KYC
  const relevantAuditLogs = kycAuditHistory.filter(log =>
    kycHistory.some(kyc => log.resourceId === kyc.id) ||
    log.resourceId === investorId
  );

  const data = {
    investor: {
      id: investor.id,
      type: investor.type,
      jurisdiction: investor.jurisdiction,
      classification: investor.classification,
      riskTier: investor.riskTier,
      status: investor.status,
      accreditedStatus: investor.accreditedStatus,
      createdAt: investor.createdAt,
    },
    kycSessions: kycHistory.map(session => ({
      id: session.id,
      provider: session.provider,
      status: session.status,
      level: session.level,
      checks: session.checks,
      failureReasons: session.failureReasons,
      expiresAt: session.expiresAt,
      completedAt: session.completedAt,
      createdAt: session.createdAt,
    })),
    verifiedWallets: wallets.filter(w => w.verifiedAt).map(w => ({
      address: w.address,
      chainId: w.chainId,
      verifiedAt: w.verifiedAt,
    })),
    complianceTimeline: buildKycTimeline(investor, kycHistory),
  };

  return createEvidencePack({
    type: 'kyc_evidence_pack',
    subject: {
      type: 'investor',
      id: investorId,
    },
    orgId,
    data,
    auditTrail: relevantAuditLogs,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function createEvidencePack(params: {
  type: EvidencePackType;
  subject: { type: string; id: string; name?: string };
  orgId: string;
  data: Record<string, unknown>;
  auditTrail: auditService.AuditLogEntry[];
}): EvidencePack {
  const packId = `evp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const generatedAt = new Date().toISOString();

  const pack: Omit<EvidencePack, 'attestation'> = {
    id: packId,
    generatedAt,
    type: params.type,
    version: '1.0',
    subject: params.subject,
    organization: {
      id: params.orgId,
    },
    data: params.data,
    auditTrail: params.auditTrail,
  };

  // Generate attestation
  const attestation = generateAttestation(pack);

  return {
    ...pack,
    attestation,
  };
}

function generateAttestation(pack: Omit<EvidencePack, 'attestation'>): EvidenceAttestation {
  // Create a canonical JSON representation
  const canonicalData = JSON.stringify({
    id: pack.id,
    generatedAt: pack.generatedAt,
    type: pack.type,
    version: pack.version,
    subject: pack.subject,
    data: pack.data,
    auditTrailHash: createHash('sha256')
      .update(JSON.stringify(pack.auditTrail))
      .digest('hex'),
  });

  const contentHash = createHash('sha256').update(canonicalData).digest('hex');

  return {
    contentHash,
    algorithm: 'SHA-256',
    attestedAt: new Date().toISOString(),
    // Signature would be added here if server-side signing is configured
  };
}

function sanitizeForExport(obj: Record<string, unknown>): Record<string, unknown> {
  // Remove sensitive fields that shouldn't be in evidence packs
  const sensitiveFields = ['passwordHash', 'secret', 'piiRef', 'metadata'];
  const sanitized = { ...obj };

  for (const field of sensitiveFields) {
    if (field in sanitized && field !== 'metadata') {
      delete sanitized[field];
    }
  }

  return sanitized;
}

function buildTransferTimeline(
  transfer: Record<string, unknown>,
  complianceDecisions: Array<Record<string, unknown>>,
  auditLogs: auditService.AuditLogEntry[]
): Array<{ timestamp: string; event: string; details?: string }> {
  const timeline: Array<{ timestamp: string; event: string; details?: string }> = [];

  // Add transfer events
  if (transfer.createdAt) {
    timeline.push({
      timestamp: String(transfer.createdAt),
      event: 'Transfer created',
      details: `Amount: ${transfer.amount}`,
    });
  }

  // Add compliance decisions
  for (const decision of complianceDecisions) {
    timeline.push({
      timestamp: String(decision.createdAt),
      event: `Compliance ${decision.result}`,
      details: JSON.stringify(decision.reasons),
    });
  }

  // Add status changes from audit log
  for (const log of auditLogs) {
    if (log.action.includes('status') || log.action.includes('approved') || log.action.includes('confirmed')) {
      timeline.push({
        timestamp: String(log.createdAt),
        event: log.action,
        details: log.description || undefined,
      });
    }
  }

  // Sort by timestamp
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return timeline;
}

function buildKycTimeline(
  investor: Record<string, unknown>,
  kycSessions: Array<Record<string, unknown>>
): Array<{ timestamp: string; event: string; details?: string }> {
  const timeline: Array<{ timestamp: string; event: string; details?: string }> = [];

  // Add investor creation
  if (investor.createdAt) {
    timeline.push({
      timestamp: String(investor.createdAt),
      event: 'Investor registered',
    });
  }

  // Add KYC sessions
  for (const session of kycSessions) {
    timeline.push({
      timestamp: String(session.createdAt),
      event: `KYC session started (${session.provider})`,
      details: `Level: ${session.level}`,
    });

    if (session.completedAt) {
      timeline.push({
        timestamp: String(session.completedAt),
        event: `KYC ${session.status}`,
        details: session.status === 'rejected'
          ? JSON.stringify(session.failureReasons)
          : undefined,
      });
    }
  }

  // Sort by timestamp
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return timeline;
}

// ============================================================================
// Clawback Evidence Pack
// ============================================================================

/**
 * Generates a comprehensive evidence pack for a clawback operation.
 * Includes compliance approval, both parties' data, and complete audit trail.
 */
export async function generateClawbackPack(
  clawbackId: string,
  orgId: string
): Promise<EvidencePack> {
  const { clawbacks, complianceApprovals, policyVersions } = await import('../db/schema.js').then(m => m.default || m) as typeof schema;

  const clawback = await db.query.clawbacks.findFirst({
    where: and(eq(clawbacks.id, clawbackId), eq(clawbacks.orgId, orgId)),
  });

  if (!clawback) {
    throw new NotFoundError('Clawback not found');
  }

  // Fetch related data
  const [
    token,
    complianceApproval,
    fromInvestor,
    toInvestor,
    complianceDecisions,
    auditHistory,
  ] = await Promise.all([
    db.query.tokens.findFirst({
      where: eq(tokens.id, clawback.tokenId),
    }),
    clawback.complianceApprovalId
      ? db.query.complianceApprovals?.findFirst({
          where: eq(complianceApprovals.id, clawback.complianceApprovalId),
        })
      : Promise.resolve(null),
    clawback.fromInvestorId
      ? db.query.investors.findFirst({ where: eq(investors.id, clawback.fromInvestorId) })
      : Promise.resolve(null),
    clawback.toInvestorId
      ? db.query.investors.findFirst({ where: eq(investors.id, clawback.toInvestorId) })
      : Promise.resolve(null),
    db.select()
      .from(decisions)
      .where(and(
        eq(decisions.subjectRef, clawbackId),
        eq(decisions.subjectType, 'clawback'),
        eq(decisions.orgId, orgId)
      ))
      .orderBy(desc(decisions.createdAt)),
    auditService.getAuditLog(orgId, {
      resourceType: 'clawback',
      resourceId: clawbackId,
      limit: 500,
    }),
  ]);

  // Get policy version if available from compliance decision
  let policyVersion = null;
  if (complianceDecisions.length > 0 && complianceDecisions[0].policyVersionId) {
    policyVersion = await db.query.policyVersions?.findFirst({
      where: eq(policyVersions.id, complianceDecisions[0].policyVersionId),
    });
  }

  const data = {
    clawback: {
      id: clawback.id,
      tokenId: clawback.tokenId,
      fromWallet: clawback.fromWallet,
      toWallet: clawback.toWallet,
      amount: clawback.amount,
      reason: clawback.reason,
      reasonCode: clawback.reasonCode,
      legalReference: clawback.legalReference,
      status: clawback.status,
      txHash: clawback.txHash,
      txBlock: clawback.txBlock,
      requestedAt: clawback.requestedAt,
      approvedAt: clawback.approvedAt,
      executedAt: clawback.executedAt,
      confirmedAt: clawback.confirmedAt,
    },
    token: token ? {
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      address: token.address,
      chainId: token.chainId,
    } : null,
    complianceApproval: complianceApproval ? {
      id: complianceApproval.id,
      operationType: complianceApproval.operationType,
      status: complianceApproval.status,
      requestedAt: complianceApproval.requestedAt,
      approvals: complianceApproval.approvals,
      rejections: complianceApproval.rejections,
      finalDecision: complianceApproval.finalDecision,
      finalizedAt: complianceApproval.finalizedAt,
    } : null,
    policyDecision: policyVersion ? {
      policyVersionId: policyVersion.id,
      policyId: policyVersion.policyId,
      version: policyVersion.version,
      ruleset: policyVersion.ruleset,
    } : null,
    complianceDecisions: complianceDecisions.map(d => ({
      id: d.id,
      type: d.type,
      result: d.result,
      reasons: d.reasons,
      inputsHash: d.inputsHash,
      signature: d.signature,
      createdAt: d.createdAt,
    })),
    parties: {
      from: fromInvestor ? {
        id: fromInvestor.id,
        type: fromInvestor.type,
        jurisdiction: fromInvestor.jurisdiction,
        status: fromInvestor.status,
        wallet: clawback.fromWallet,
      } : { wallet: clawback.fromWallet },
      to: toInvestor ? {
        id: toInvestor.id,
        type: toInvestor.type,
        jurisdiction: toInvestor.jurisdiction,
        status: toInvestor.status,
        wallet: clawback.toWallet,
      } : { wallet: clawback.toWallet },
    },
    approvalChain: {
      requestedBy: clawback.requestedBy,
      requestedAt: clawback.requestedAt,
      approvedBy: clawback.approvedBy,
      approvedAt: clawback.approvedAt,
      rejectedBy: clawback.rejectedBy,
      rejectedAt: clawback.rejectedAt,
      rejectionReason: clawback.rejectionReason,
      executedBy: clawback.executedBy,
      executedAt: clawback.executedAt,
    },
    timeline: buildClawbackTimeline(clawback as any, complianceApproval as any, auditHistory),
  };

  return createEvidencePack({
    type: 'clawback_evidence_pack' as EvidencePackType,
    subject: {
      type: 'clawback',
      id: clawbackId,
    },
    orgId,
    data,
    auditTrail: auditHistory,
  });
}

function buildClawbackTimeline(
  clawback: Record<string, unknown>,
  approval: Record<string, unknown> | null,
  auditLogs: auditService.AuditLogEntry[]
): Array<{ timestamp: string; event: string; details?: string }> {
  const timeline: Array<{ timestamp: string; event: string; details?: string }> = [];

  // Add clawback lifecycle events
  if (clawback.requestedAt) {
    timeline.push({
      timestamp: String(clawback.requestedAt),
      event: 'Clawback requested',
      details: `Reason: ${clawback.reasonCode} - ${String(clawback.reason).substring(0, 100)}`,
    });
  }

  if (approval?.requestedAt) {
    timeline.push({
      timestamp: String(approval.requestedAt),
      event: 'Compliance approval requested',
    });
  }

  if (clawback.approvedAt) {
    timeline.push({
      timestamp: String(clawback.approvedAt),
      event: 'Clawback approved',
      details: `Approved by: ${clawback.approvedBy}`,
    });
  }

  if (clawback.rejectedAt) {
    timeline.push({
      timestamp: String(clawback.rejectedAt),
      event: 'Clawback rejected',
      details: String(clawback.rejectionReason),
    });
  }

  if (clawback.executedAt) {
    timeline.push({
      timestamp: String(clawback.executedAt),
      event: 'Clawback execution started',
      details: `Executed by: ${clawback.executedBy}`,
    });
  }

  if (clawback.confirmedAt) {
    timeline.push({
      timestamp: String(clawback.confirmedAt),
      event: 'Clawback confirmed on-chain',
      details: `TX: ${clawback.txHash}`,
    });
  }

  // Add relevant audit events
  for (const log of auditLogs) {
    if (!timeline.some(t => t.event.includes(log.action))) {
      timeline.push({
        timestamp: String(log.createdAt),
        event: log.action,
        details: log.description || undefined,
      });
    }
  }

  // Sort by timestamp
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return timeline;
}
