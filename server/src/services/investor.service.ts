import { db, schema } from '../config/database.js';
import { eq, and, desc, or, ilike } from 'drizzle-orm';
import { randomBytes, createHmac } from 'crypto';
import { NotFoundError, ValidationError, ConflictError } from '../middleware/errorHandler.js';
import * as auditService from './audit.service.js';
import { logger } from '../middleware/logger.js';

const { investors, investorWallets, kycSessions, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export type InvestorType = 'individual' | 'institutional' | 'qualified' | 'accredited';
export type InvestorStatus = 'pending' | 'active' | 'suspended' | 'blocked';
export type KycStatus = 'not_started' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired';
export type KycProvider = 'sumsub' | 'onfido' | 'jumio' | 'manual';
export type WalletStatus = 'pending' | 'verified' | 'blocked';

export interface CreateInvestorInput {
  orgId: string;
  externalId?: string;
  email: string;
  phone?: string;
  type: InvestorType;
  countryCode: string;
  taxResidency?: string;
  profile?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateInvestorInput {
  email?: string;
  phone?: string;
  type?: InvestorType;
  countryCode?: string;
  taxResidency?: string;
  profile?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CreateKycSessionInput {
  orgId: string;
  investorId: string;
  provider: KycProvider;
  levelRequested: string;
  metadata?: Record<string, unknown>;
}

export interface AddWalletInput {
  orgId: string;
  investorId: string;
  address: string;
  chainId: number;
  label?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// KYC Provider Adapters
// ============================================================================

/** Investor data needed for KYC session creation */
interface InvestorKycData {
  id: string;
  email: string | null;
  phone?: string | null;
  type: string;
  countryCode: string | null;
  profile?: Record<string, unknown> | null;
}

interface KycProviderAdapter {
  createSession(investor: InvestorKycData, level: string): Promise<{
    externalSessionId: string;
    redirectUrl?: string;
    webhookUrl?: string;
  }>;
  getSessionStatus(externalSessionId: string): Promise<{
    status: KycStatus;
    data?: Record<string, unknown>;
  }>;
  handleWebhook(payload: unknown, signature: string): Promise<{
    externalSessionId: string;
    status: KycStatus;
    data?: Record<string, unknown>;
  }>;
}

// Sumsub Adapter
class SumsubAdapter implements KycProviderAdapter {
  private apiUrl = process.env.SUMSUB_API_URL || 'https://api.sumsub.com';
  private appToken = process.env.SUMSUB_APP_TOKEN || '';
  private secretKey = process.env.SUMSUB_SECRET_KEY || '';

  async createSession(_investor: InvestorKycData, _level: string): Promise<{ externalSessionId: string; redirectUrl?: string }> {
    // In production, this would make actual API calls to Sumsub
    const externalId = `sums_${randomBytes(16).toString('hex')}`;

    // Mock response for MVP
    return {
      externalSessionId: externalId,
      redirectUrl: `https://cockpit.sumsub.com/checkus#/applicant/${externalId}/basicInfo`,
    };
  }

  async getSessionStatus(externalSessionId: string): Promise<{ status: KycStatus; data?: Record<string, unknown> }> {
    // In production, would call Sumsub API
    return {
      status: 'pending',
      data: { applicantId: externalSessionId },
    };
  }

  async handleWebhook(payload: unknown, _signature: string): Promise<{
    externalSessionId: string;
    status: KycStatus;
    data?: Record<string, unknown>;
  }> {
    // Verify webhook signature
    // const computedSignature = createHmac('sha256', this.secretKey)
    //   .update(JSON.stringify(payload))
    //   .digest('hex');

    const statusMap: Record<string, KycStatus> = {
      'GREEN': 'approved',
      'RED': 'rejected',
      'INIT': 'pending',
      'PENDING': 'in_review',
    };

    const typedPayload = payload as Record<string, unknown>;
    const reviewResult = typedPayload.reviewResult as Record<string, unknown> | undefined;

    return {
      externalSessionId: (typedPayload.applicantId || typedPayload.externalUserId) as string,
      status: statusMap[(reviewResult?.reviewAnswer as string) || ''] || 'pending',
      data: typedPayload,
    };
  }
}

// Onfido Adapter
class OnfidoAdapter implements KycProviderAdapter {
  private apiUrl = process.env.ONFIDO_API_URL || 'https://api.onfido.com/v3';
  private apiToken = process.env.ONFIDO_API_TOKEN || '';

  async createSession(_investor: InvestorKycData, _level: string): Promise<{ externalSessionId: string; redirectUrl?: string }> {
    const externalId = `onfido_${randomBytes(16).toString('hex')}`;

    return {
      externalSessionId: externalId,
      redirectUrl: `https://onfido.com/verification/${externalId}`,
    };
  }

  async getSessionStatus(externalSessionId: string): Promise<{ status: KycStatus; data?: Record<string, unknown> }> {
    return {
      status: 'pending',
      data: { checkId: externalSessionId },
    };
  }

  async handleWebhook(payload: unknown, _signature: string): Promise<{
    externalSessionId: string;
    status: KycStatus;
    data?: Record<string, unknown>;
  }> {
    const statusMap: Record<string, KycStatus> = {
      'complete': 'approved',
      'clear': 'approved',
      'consider': 'in_review',
      'withdrawn': 'rejected',
    };

    const typedPayload = payload as Record<string, unknown>;
    const obj = typedPayload.object as Record<string, unknown> | undefined;
    const payloadData = typedPayload.payload as Record<string, unknown> | undefined;

    return {
      externalSessionId: (obj?.id || typedPayload.check_id) as string,
      status: statusMap[(payloadData?.result as string) || ''] || 'pending',
      data: typedPayload,
    };
  }
}

// Manual Review Adapter
class ManualAdapter implements KycProviderAdapter {
  async createSession(_investor: InvestorKycData, _level: string): Promise<{ externalSessionId: string }> {
    return {
      externalSessionId: `manual_${randomBytes(16).toString('hex')}`,
    };
  }

  async getSessionStatus(externalSessionId: string): Promise<{ status: KycStatus }> {
    return { status: 'pending' };
  }

  async handleWebhook(): Promise<{ externalSessionId: string; status: KycStatus }> {
    throw new ValidationError('Manual adapter does not support webhooks');
  }
}

function getKycAdapter(provider: KycProvider): KycProviderAdapter {
  switch (provider) {
    case 'sumsub':
      return new SumsubAdapter();
    case 'onfido':
      return new OnfidoAdapter();
    case 'manual':
      return new ManualAdapter();
    default:
      throw new ValidationError(`Unsupported KYC provider: ${provider}`);
  }
}

// ============================================================================
// Investor Management
// ============================================================================

export async function createInvestor(input: CreateInvestorInput) {
  // Check for duplicate email
  const existing = await db.query.investors.findFirst({
    where: and(
      eq(investors.orgId, input.orgId),
      eq(investors.email, input.email.toLowerCase())
    ),
  });

  if (existing) {
    throw new ConflictError('Investor with this email already exists');
  }

  const [investor] = await db.insert(investors).values({
    orgId: input.orgId,
    externalId: input.externalId,
    email: input.email.toLowerCase(),
    phone: input.phone,
    type: input.type,
    jurisdiction: input.countryCode.toUpperCase(),
    countryCode: input.countryCode.toUpperCase(),
    taxResidency: input.taxResidency?.toUpperCase(),
    status: 'pending',
    kycStatus: 'not_started',
    metadata: { ...input.metadata, profile: input.profile } || {},
  }).returning();

  // Emit event
  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'investor.created',
    payload: { investorId: investor.id, email: investor.email },
  });

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'create',
    'investor',
    investor.id,
    `Investor created: ${investor.email}`
  );

  return investor;
}

export async function getInvestor(id: string, orgId: string) {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.id, id), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  return investor;
}

export async function getInvestorByExternalId(externalId: string, orgId: string) {
  const investor = await db.query.investors.findFirst({
    where: and(eq(investors.externalId, externalId), eq(investors.orgId, orgId)),
  });

  if (!investor) {
    throw new NotFoundError('Investor not found');
  }

  return investor;
}

export async function listInvestors(orgId: string, params: {
  type?: InvestorType;
  status?: InvestorStatus;
  kycStatus?: KycStatus;
  countryCode?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { type, status, kycStatus, countryCode, search, limit = 50, offset = 0 } = params;

  const conditions = [eq(investors.orgId, orgId)];
  if (type) conditions.push(eq(investors.type, type));
  if (status) conditions.push(eq(investors.status, status));
  if (kycStatus) conditions.push(eq(investors.kycStatus, kycStatus));
  if (countryCode) conditions.push(eq(investors.countryCode, countryCode.toUpperCase()));

  let query = db.select()
    .from(investors)
    .where(and(...conditions))
    .orderBy(desc(investors.createdAt))
    .limit(limit)
    .offset(offset);

  let results = await query;

  // Apply search filter in JS for flexibility
  if (search) {
    const searchLower = search.toLowerCase();
    results = results.filter(inv =>
      inv.email?.toLowerCase().includes(searchLower) ||
      inv.externalId?.toLowerCase().includes(searchLower) ||
      inv.phone?.includes(search)
    );
  }

  return results;
}

export async function updateInvestor(id: string, orgId: string, input: UpdateInvestorInput) {
  await getInvestor(id, orgId);

  const updateData: UpdateInvestorInput & { updatedAt: Date } = { ...input, updatedAt: new Date() };
  if (input.email) updateData.email = input.email.toLowerCase();
  if (input.countryCode) updateData.countryCode = input.countryCode.toUpperCase();
  if (input.taxResidency) updateData.taxResidency = input.taxResidency.toUpperCase();

  const [updated] = await db.update(investors)
    .set(updateData)
    .where(and(eq(investors.id, id), eq(investors.orgId, orgId)))
    .returning();

  return updated;
}

export async function updateInvestorStatus(id: string, orgId: string, status: InvestorStatus, reason?: string) {
  const investor = await getInvestor(id, orgId);

  const [updated] = await db.update(investors)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(investors.id, id))
    .returning();

  // Emit event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: `investor.${status}`,
    payload: { investorId: id, previousStatus: investor.status, reason },
  });

  // Audit log
  await auditService.logSystemAction(
    orgId,
    'update',
    'investor',
    id,
    `Investor status changed to ${status}`,
    { previousStatus: investor.status, reason }
  );

  return updated;
}

// ============================================================================
// KYC Session Management
// ============================================================================

export async function createKycSession(input: CreateKycSessionInput) {
  const investor = await getInvestor(input.investorId, input.orgId);

  // Get the KYC adapter for the provider
  const adapter = getKycAdapter(input.provider);

  // Create session with provider
  const providerResult = await adapter.createSession(investor, input.levelRequested);

  // Calculate expiry (30 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const [session] = await db.insert(kycSessions).values({
    orgId: input.orgId,
    investorId: input.investorId,
    provider: input.provider,
    externalSessionId: providerResult.externalSessionId,
    levelRequested: input.levelRequested,
    status: 'pending',
    redirectUrl: providerResult.redirectUrl,
    expiresAt,
    metadata: input.metadata || {},
  }).returning();

  // Update investor KYC status
  await db.update(investors)
    .set({
      kycStatus: 'pending',
      kycProvider: input.provider,
      updatedAt: new Date(),
    })
    .where(eq(investors.id, input.investorId));

  // Emit event
  await db.insert(eventBusQueue).values({
    orgId: input.orgId,
    topic: 'investor.kyc_started',
    payload: {
      investorId: input.investorId,
      sessionId: session.id,
      provider: input.provider,
    },
  });

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'investor_kyc_started',
    'kyc_session',
    session.id,
    `KYC session created with ${input.provider}`
  );

  return {
    ...session,
    redirectUrl: providerResult.redirectUrl,
  };
}

export async function getKycSession(id: string, orgId: string) {
  const session = await db.query.kycSessions.findFirst({
    where: and(eq(kycSessions.id, id), eq(kycSessions.orgId, orgId)),
  });

  if (!session) {
    throw new NotFoundError('KYC session not found');
  }

  return session;
}

export async function listKycSessions(investorId: string, orgId: string) {
  return db.select()
    .from(kycSessions)
    .where(and(
      eq(kycSessions.investorId, investorId),
      eq(kycSessions.orgId, orgId)
    ))
    .orderBy(desc(kycSessions.createdAt));
}

export async function refreshKycSessionStatus(sessionId: string, orgId: string) {
  const session = await getKycSession(sessionId, orgId);

  if (session.status === 'approved' || session.status === 'rejected') {
    return session; // Final states, don't refresh
  }

  const adapter = getKycAdapter(session.provider as KycProvider);
  const providerStatus = await adapter.getSessionStatus(session.externalSessionId!);

  if (providerStatus.status !== session.status) {
    const [updated] = await db.update(kycSessions)
      .set({
        status: providerStatus.status,
        providerData: providerStatus.data ?? null,
        updatedAt: new Date(),
        completedAt: ['approved', 'rejected'].includes(providerStatus.status) ? new Date() : null,
      })
      .where(eq(kycSessions.id, sessionId))
      .returning();

    // Update investor status if approved
    if (providerStatus.status === 'approved') {
      await updateInvestorKycStatus(session.investorId, orgId, 'approved', session.levelRequested);
    } else if (providerStatus.status === 'rejected') {
      await updateInvestorKycStatus(session.investorId, orgId, 'rejected');
    }

    return updated;
  }

  return session;
}

export async function processKycWebhook(provider: KycProvider, payload: unknown, signature: string, orgId?: string) {
  const adapter = getKycAdapter(provider);
  const result = await adapter.handleWebhook(payload, signature);

  // Find the session by external ID
  const session = await db.query.kycSessions.findFirst({
    where: eq(kycSessions.externalSessionId, result.externalSessionId),
  });

  if (!session) {
    logger.warn(`KYC webhook received for unknown session: ${result.externalSessionId}`);
    return { processed: false, reason: 'Session not found' };
  }

  // Update session
  const [updated] = await db.update(kycSessions)
    .set({
      status: result.status,
      providerData: result.data ?? null,
      updatedAt: new Date(),
      completedAt: ['approved', 'rejected'].includes(result.status) ? new Date() : null,
    })
    .where(eq(kycSessions.id, session.id))
    .returning();

  // Update investor status
  if (result.status === 'approved') {
    await updateInvestorKycStatus(session.investorId, session.orgId, 'approved', session.levelRequested);
  } else if (result.status === 'rejected') {
    await updateInvestorKycStatus(session.investorId, session.orgId, 'rejected');
  }

  return { processed: true, session: updated };
}

async function updateInvestorKycStatus(
  investorId: string,
  orgId: string,
  kycStatus: KycStatus,
  kycLevel?: string | null
) {
  const updateData: {
    kycStatus: KycStatus;
    updatedAt: Date;
    kycVerifiedAt?: Date;
    kycLevel?: string | null;
    status?: InvestorStatus;
  } = {
    kycStatus,
    updatedAt: new Date(),
  };

  if (kycStatus === 'approved') {
    updateData.kycVerifiedAt = new Date();
    updateData.kycLevel = kycLevel;
    updateData.status = 'active'; // Activate investor on KYC approval
  }

  await db.update(investors)
    .set(updateData)
    .where(eq(investors.id, investorId));

  // Emit event
  await db.insert(eventBusQueue).values({
    orgId,
    topic: kycStatus === 'approved' ? 'investor.kyc_approved' : 'investor.kyc_rejected',
    payload: { investorId, kycStatus, kycLevel },
  });

  // Audit log
  await auditService.logSystemAction(
    orgId,
    kycStatus === 'approved' ? 'investor_kyc_approved' : 'investor_kyc_rejected',
    'investor',
    investorId,
    `KYC ${kycStatus}`,
    { kycLevel }
  );
}

// Manual KYC approval (for manual review)
export async function manualKycApproval(
  investorId: string,
  orgId: string,
  approverId: string,
  kycLevel: string,
  notes?: string
) {
  const investor = await getInvestor(investorId, orgId);

  // Create a manual KYC session record
  const [session] = await db.insert(kycSessions).values({
    orgId,
    investorId,
    provider: 'manual',
    externalSessionId: `manual_${randomBytes(8).toString('hex')}`,
    levelRequested: kycLevel,
    status: 'approved',
    completedAt: new Date(),
    metadata: { approverId, notes },
  }).returning();

  // Update investor
  await updateInvestorKycStatus(investorId, orgId, 'approved', kycLevel);

  // Audit log
  await auditService.logUserAction(
    orgId,
    approverId,
    'investor_kyc_approved',
    'investor',
    investorId,
    { manual: true, kycLevel, notes }
  );

  return session;
}

export async function manualKycRejection(
  investorId: string,
  orgId: string,
  rejectorId: string,
  reason: string
) {
  const investor = await getInvestor(investorId, orgId);

  // Create a manual KYC session record
  const [session] = await db.insert(kycSessions).values({
    orgId,
    investorId,
    provider: 'manual',
    externalSessionId: `manual_${randomBytes(8).toString('hex')}`,
    levelRequested: investor.kycLevel || 'basic',
    status: 'rejected',
    completedAt: new Date(),
    metadata: { rejectorId, reason },
  }).returning();

  // Update investor
  await updateInvestorKycStatus(investorId, orgId, 'rejected');

  // Audit log
  await auditService.logUserAction(
    orgId,
    rejectorId,
    'investor_kyc_rejected',
    'investor',
    investorId,
    { manual: true, reason }
  );

  return session;
}

// ============================================================================
// Wallet Management
// ============================================================================

export async function addWallet(input: AddWalletInput) {
  const investor = await getInvestor(input.investorId, input.orgId);

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.address)) {
    throw new ValidationError('Invalid wallet address');
  }

  // Check for duplicate address
  const existing = await db.query.investorWallets.findFirst({
    where: and(
      eq(investorWallets.orgId, input.orgId),
      eq(investorWallets.address, input.address.toLowerCase())
    ),
  });

  if (existing) {
    throw new ConflictError('Wallet address already registered');
  }

  const [wallet] = await db.insert(investorWallets).values({
    orgId: input.orgId,
    investorId: input.investorId,
    address: input.address.toLowerCase(),
    chainId: input.chainId,
    label: input.label,
    status: 'pending',
    metadata: input.metadata || {},
  }).returning();

  // Audit log
  await auditService.logSystemAction(
    input.orgId,
    'create',
    'investor',
    input.investorId,
    `Wallet added: ${input.address}`,
    { walletId: wallet.id, chainId: input.chainId }
  );

  return wallet;
}

export async function getWallet(id: string, orgId: string) {
  const wallet = await db.query.investorWallets.findFirst({
    where: and(eq(investorWallets.id, id), eq(investorWallets.orgId, orgId)),
  });

  if (!wallet) {
    throw new NotFoundError('Wallet not found');
  }

  return wallet;
}

export async function listWallets(investorId: string, orgId: string) {
  return db.select()
    .from(investorWallets)
    .where(and(
      eq(investorWallets.investorId, investorId),
      eq(investorWallets.orgId, orgId)
    ))
    .orderBy(desc(investorWallets.createdAt));
}

export async function verifyWallet(id: string, orgId: string, signature?: string) {
  const wallet = await getWallet(id, orgId);

  // In production, would verify signature against wallet address
  // For MVP, just mark as verified

  const [updated] = await db.update(investorWallets)
    .set({
      status: 'verified',
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(investorWallets.id, id))
    .returning();

  return updated;
}

export async function blockWallet(id: string, orgId: string, reason: string) {
  const wallet = await getWallet(id, orgId);

  const [updated] = await db.update(investorWallets)
    .set({
      status: 'blocked',
      updatedAt: new Date(),
    })
    .where(eq(investorWallets.id, id))
    .returning();

  // Audit log
  await auditService.logSystemAction(
    orgId,
    'update',
    'investor',
    wallet.investorId,
    `Wallet blocked: ${wallet.address}`,
    { walletId: id, reason }
  );

  return updated;
}

export async function findInvestorByWallet(address: string, orgId: string) {
  const wallet = await db.query.investorWallets.findFirst({
    where: and(
      eq(investorWallets.address, address.toLowerCase()),
      eq(investorWallets.orgId, orgId)
    ),
  });

  if (!wallet) {
    return null;
  }

  return getInvestor(wallet.investorId, orgId);
}
