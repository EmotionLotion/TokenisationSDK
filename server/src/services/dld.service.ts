import { db, schema } from '../config/database.js';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { NotFoundError, ValidationError, AppError } from '../middleware/errorHandler.js';
import { randomUUID } from 'crypto';

const { dldTitles, dldEvents, dldSyncJobs, assets, tokens, eventBusQueue } = schema;

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface DldTitleData {
  externalTitleDeedId: string;
  ownerName?: string;
  propertyType?: string;
  location?: {
    emirate?: string;
    community?: string;
    building?: string;
    unit?: string;
    plotNumber?: string;
  };
  area?: number;
  areaUnit?: string;
  valuationAed?: number;
  flags?: string[];
  encumbrances?: Array<{
    type: string;
    amount?: number;
    beneficiary?: string;
    registeredDate?: string;
  }>;
}

export interface DldEventData {
  externalEventId: string;
  titleDeedExternalId: string;
  type: string;
  payload: object;
  receivedAt?: Date;
}

export type DldTitleStatus = 'unknown' | 'pending' | 'verified' | 'conflict';
export type DldSyncJobType = 'poll' | 'reconcile' | 'manual';
export type DldSyncJobStatus = 'pending' | 'running' | 'succeeded' | 'failed';

// ============================================================================
// DLD Title Management
// ============================================================================

export interface CreateTitleInput {
  orgId: string;
  assetId?: string;
  externalTitleDeedId: string;
  data?: DldTitleData;
  metadata?: Record<string, unknown>;
}

export async function createTitle(input: CreateTitleInput) {
  const { orgId, assetId, externalTitleDeedId, data, metadata } = input;

  // Check for duplicates
  const existing = await db.query.dldTitles.findFirst({
    where: and(eq(dldTitles.orgId, orgId), eq(dldTitles.externalTitleDeedId, externalTitleDeedId)),
  });

  if (existing) {
    throw new ValidationError(`DLD title with ID ${externalTitleDeedId} already exists`);
  }

  // Verify asset exists if provided
  if (assetId) {
    const asset = await db.query.assets.findFirst({
      where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
    });
    if (!asset) {
      throw new NotFoundError('Asset not found');
    }
  }

  const [title] = await db.insert(dldTitles).values({
    orgId,
    assetId,
    externalTitleDeedId,
    status: 'pending',
    snapshot: data || {},
    flags: data?.flags || [],
    ownerName: data?.ownerName,
    propertyType: data?.propertyType,
    location: data?.location || {},
    area: data?.area?.toString(),
    areaUnit: data?.areaUnit || 'sqm',
    valuationAed: data?.valuationAed?.toString(),
    metadata: metadata || {},
  }).returning();

  return title;
}

export async function getTitle(id: string, orgId: string) {
  const title = await db.query.dldTitles.findFirst({
    where: and(eq(dldTitles.id, id), eq(dldTitles.orgId, orgId)),
  });

  if (!title) {
    throw new NotFoundError('DLD title not found');
  }

  return title;
}

export async function getTitleByExternalId(externalId: string, orgId: string) {
  const title = await db.query.dldTitles.findFirst({
    where: and(eq(dldTitles.externalTitleDeedId, externalId), eq(dldTitles.orgId, orgId)),
  });

  if (!title) {
    throw new NotFoundError('DLD title not found');
  }

  return title;
}

export async function getTitleByAsset(assetId: string, orgId: string) {
  const title = await db.query.dldTitles.findFirst({
    where: and(eq(dldTitles.assetId, assetId), eq(dldTitles.orgId, orgId)),
  });

  return title; // May be null
}

export async function listTitles(orgId: string, params: {
  status?: string;
  assetId?: string;
  projectId?: string; // Alias for assetId
  limit?: number;
  offset?: number;
} = {}) {
  const { status, assetId, projectId, limit = 50, offset = 0 } = params;
  const effectiveAssetId = assetId || projectId;

  const conditions = [eq(dldTitles.orgId, orgId)];
  if (status) conditions.push(eq(dldTitles.status, status));
  if (effectiveAssetId) conditions.push(eq(dldTitles.assetId, effectiveAssetId));

  return db.select()
    .from(dldTitles)
    .where(and(...conditions))
    .orderBy(desc(dldTitles.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateTitleSnapshot(id: string, orgId: string, data: DldTitleData) {
  const title = await getTitle(id, orgId);

  const [updated] = await db.update(dldTitles)
    .set({
      snapshot: data,
      flags: data.flags || title.flags,
      ownerName: data.ownerName || title.ownerName,
      propertyType: data.propertyType || title.propertyType,
      location: data.location || title.location,
      area: data.area?.toString() || title.area,
      areaUnit: data.areaUnit || title.areaUnit,
      valuationAed: data.valuationAed?.toString() || title.valuationAed,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dldTitles.id, id))
    .returning();

  return updated;
}

export async function verifyTitle(id: string, orgId: string, verifiedBy: string) {
  const title = await getTitle(id, orgId);

  if (title.status === 'verified') {
    throw new ValidationError('Title is already verified');
  }

  // Check for blocking flags
  const blockingFlags = ['dispute', 'lien', 'transfer_locked'];
  const hasBlockingFlags = title.flags?.some(f => blockingFlags.includes(f));

  if (hasBlockingFlags) {
    throw new ValidationError(`Cannot verify title with blocking flags: ${title.flags?.join(', ')}`);
  }

  const [updated] = await db.update(dldTitles)
    .set({
      status: 'verified',
      verifiedAt: new Date(),
      verifiedBy,
      updatedAt: new Date(),
    })
    .where(eq(dldTitles.id, id))
    .returning();

  // Emit event
  await emitDldEvent(orgId, 'dld.asset.verified', {
    titleId: id,
    externalTitleDeedId: title.externalTitleDeedId,
    assetId: title.assetId,
  });

  return updated;
}

export async function setTitleConflict(id: string, orgId: string, reason: string) {
  const title = await getTitle(id, orgId);

  const [updated] = await db.update(dldTitles)
    .set({
      status: 'conflict',
      metadata: {
        ...(title.metadata as Record<string, unknown> || {}),
        conflictReason: reason,
        conflictAt: new Date(),
      },
      updatedAt: new Date(),
    })
    .where(eq(dldTitles.id, id))
    .returning();

  // Emit conflict event
  await emitDldEvent(orgId, 'dld.conflict.raised', {
    titleId: id,
    externalTitleDeedId: title.externalTitleDeedId,
    assetId: title.assetId,
    reason,
  });

  // Auto-freeze associated token if exists
  if (title.assetId) {
    await freezeAssetTokens(title.assetId, orgId, `DLD conflict: ${reason}`);
  }

  return updated;
}

export async function linkTitleToAsset(titleId: string, assetId: string, orgId: string) {
  const title = await getTitle(titleId, orgId);

  const asset = await db.query.assets.findFirst({
    where: and(eq(assets.id, assetId), eq(assets.orgId, orgId)),
  });

  if (!asset) {
    throw new NotFoundError('Asset not found');
  }

  const [updated] = await db.update(dldTitles)
    .set({
      assetId,
      updatedAt: new Date(),
    })
    .where(eq(dldTitles.id, titleId))
    .returning();

  // Update asset with DLD reference
  await db.update(assets)
    .set({
      titleDeedExternalId: title.externalTitleDeedId,
      verificationState: { dldTitleId: titleId, dldStatus: title.status },
      updatedAt: new Date(),
    })
    .where(eq(assets.id, assetId));

  return updated;
}

// ============================================================================
// DLD Event Processing
// ============================================================================

export async function ingestEvent(input: DldEventData, orgId: string) {
  const { externalEventId, titleDeedExternalId, type, payload, receivedAt } = input;

  // Check for duplicate
  if (externalEventId) {
    const existing = await db.query.dldEvents.findFirst({
      where: and(eq(dldEvents.orgId, orgId), eq(dldEvents.externalEventId, externalEventId)),
    });

    if (existing) {
      return existing; // Idempotent
    }
  }

  // Find associated title
  const title = await db.query.dldTitles.findFirst({
    where: and(eq(dldTitles.externalTitleDeedId, titleDeedExternalId), eq(dldTitles.orgId, orgId)),
  });

  const [event] = await db.insert(dldEvents).values({
    orgId,
    externalEventId: externalEventId || `evt_${randomUUID().replace(/-/g, '')}`,
    titleDeedExternalId,
    dldTitleId: title?.id,
    type,
    payload: payload as any,
    receivedAt: receivedAt || new Date(),
    processed: false,
  }).returning();

  return event;
}

export async function processEvent(eventId: string, orgId: string) {
  const event = await db.query.dldEvents.findFirst({
    where: and(eq(dldEvents.id, eventId), eq(dldEvents.orgId, orgId)),
  });

  if (!event) {
    throw new NotFoundError('DLD event not found');
  }

  if (event.processed) {
    return event; // Already processed
  }

  try {
    // Find or create title
    let title = event.dldTitleId
      ? await db.query.dldTitles.findFirst({ where: eq(dldTitles.id, event.dldTitleId) })
      : await db.query.dldTitles.findFirst({
          where: and(eq(dldTitles.externalTitleDeedId, event.titleDeedExternalId), eq(dldTitles.orgId, orgId)),
        });

    if (!title) {
      // Create new title from event
      [title] = await db.insert(dldTitles).values({
        orgId,
        externalTitleDeedId: event.titleDeedExternalId,
        status: 'unknown',
        snapshot: event.payload as any,
      }).returning();
    }

    // Process based on event type
    await processEventByType(event.type, event.payload as Record<string, unknown>, title, orgId);

    // Mark as processed
    await db.update(dldEvents)
      .set({
        processed: true,
        processedAt: new Date(),
        dldTitleId: title.id,
      })
      .where(eq(dldEvents.id, eventId));

    return event;
  } catch (error) {
    // Mark as failed
    await db.update(dldEvents)
      .set({
        error: error instanceof Error ? error.message : 'Processing failed',
      })
      .where(eq(dldEvents.id, eventId));

    throw error;
  }
}

async function processEventByType(
  type: string,
  payload: Record<string, unknown>,
  title: typeof dldTitles.$inferSelect,
  orgId: string
) {
  const flagUpdates: string[] = [...(title.flags || [])];

  switch (type) {
    case 'ownership_change':
      // Update owner
      await db.update(dldTitles)
        .set({
          ownerName: payload.newOwner as string,
          snapshot: { ...(title.snapshot as object), ...payload },
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dldTitles.id, title.id));
      break;

    case 'lien_added':
      if (!flagUpdates.includes('lien')) {
        flagUpdates.push('lien');
      }
      await updateTitleFlags(title.id, flagUpdates, orgId, 'Lien added to property');
      break;

    case 'lien_removed':
      const lienIndex = flagUpdates.indexOf('lien');
      if (lienIndex > -1) {
        flagUpdates.splice(lienIndex, 1);
      }
      await db.update(dldTitles)
        .set({ flags: flagUpdates, updatedAt: new Date() })
        .where(eq(dldTitles.id, title.id));
      break;

    case 'dispute_filed':
      if (!flagUpdates.includes('dispute')) {
        flagUpdates.push('dispute');
      }
      await updateTitleFlags(title.id, flagUpdates, orgId, 'Dispute filed on property');
      break;

    case 'dispute_resolved':
      const disputeIndex = flagUpdates.indexOf('dispute');
      if (disputeIndex > -1) {
        flagUpdates.splice(disputeIndex, 1);
      }
      await db.update(dldTitles)
        .set({ flags: flagUpdates, status: 'verified', updatedAt: new Date() })
        .where(eq(dldTitles.id, title.id));
      break;

    case 'transfer_locked':
      if (!flagUpdates.includes('transfer_locked')) {
        flagUpdates.push('transfer_locked');
      }
      await updateTitleFlags(title.id, flagUpdates, orgId, 'Transfers locked by DLD');
      break;

    case 'transfer_unlocked':
      const lockIndex = flagUpdates.indexOf('transfer_locked');
      if (lockIndex > -1) {
        flagUpdates.splice(lockIndex, 1);
      }
      await db.update(dldTitles)
        .set({ flags: flagUpdates, updatedAt: new Date() })
        .where(eq(dldTitles.id, title.id));
      break;

    case 'valuation_update':
      await db.update(dldTitles)
        .set({
          valuationAed: (payload.valuationAed as number)?.toString(),
          snapshot: { ...(title.snapshot as object), ...payload },
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dldTitles.id, title.id));
      break;

    default:
      // Unknown event type - just update snapshot
      await db.update(dldTitles)
        .set({
          snapshot: { ...(title.snapshot as object), lastEvent: { type, payload } },
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dldTitles.id, title.id));
  }
}

async function updateTitleFlags(titleId: string, flags: string[], orgId: string, reason: string) {
  const title = await db.query.dldTitles.findFirst({ where: eq(dldTitles.id, titleId) });
  if (!title) return;

  await db.update(dldTitles)
    .set({
      flags,
      status: 'conflict',
      updatedAt: new Date(),
    })
    .where(eq(dldTitles.id, titleId));

  // Emit conflict and freeze tokens
  await emitDldEvent(orgId, 'dld.conflict.raised', {
    titleId,
    externalTitleDeedId: title.externalTitleDeedId,
    assetId: title.assetId,
    reason,
    flags,
  });

  if (title.assetId) {
    await freezeAssetTokens(title.assetId, orgId, reason);
  }
}

async function freezeAssetTokens(assetId: string, orgId: string, reason: string) {
  // Find all tokens for this asset
  const assetTokens = await db.select()
    .from(tokens)
    .where(and(eq(tokens.assetId, assetId), eq(tokens.orgId, orgId)));

  for (const token of assetTokens) {
    if (token.status === 'active') {
      await db.update(tokens)
        .set({
          status: 'frozen',
          metadata: {
            ...(token.metadata as Record<string, unknown> || {}),
            frozenReason: reason,
            frozenAt: new Date(),
          },
          updatedAt: new Date(),
        })
        .where(eq(tokens.id, token.id));

      await emitDldEvent(orgId, 'token.frozen', {
        tokenId: token.id,
        assetId,
        reason,
      });
    }
  }
}

export async function listEvents(orgId: string, params: {
  titleDeedExternalId?: string;
  titleId?: string; // Alias for titleDeedExternalId
  type?: string;
  processed?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  const { titleDeedExternalId, titleId, type, processed, limit = 50, offset = 0 } = params;
  const effectiveTitleId = titleDeedExternalId || titleId;

  const conditions = [eq(dldEvents.orgId, orgId)];
  if (effectiveTitleId) conditions.push(eq(dldEvents.titleDeedExternalId, effectiveTitleId));
  if (type) conditions.push(eq(dldEvents.type, type));
  if (processed !== undefined) conditions.push(eq(dldEvents.processed, processed));

  return db.select()
    .from(dldEvents)
    .where(and(...conditions))
    .orderBy(desc(dldEvents.receivedAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// DLD Sync Jobs
// ============================================================================

export async function createSyncJob(orgId: string, type: DldSyncJobType, options: {
  assetId?: string;
  dldTitleId?: string;
  metadata?: Record<string, unknown>;
} = {}) {
  const [job] = await db.insert(dldSyncJobs).values({
    orgId,
    type,
    assetId: options.assetId,
    dldTitleId: options.dldTitleId,
    status: 'pending',
    metadata: options.metadata || {},
  }).returning();

  return job;
}

export async function executeSyncJob(jobId: string, orgId: string): Promise<typeof dldSyncJobs.$inferSelect> {
  const job = await db.query.dldSyncJobs.findFirst({
    where: and(eq(dldSyncJobs.id, jobId), eq(dldSyncJobs.orgId, orgId)),
  });

  if (!job) {
    throw new NotFoundError('Sync job not found');
  }

  if (job.status !== 'pending') {
    throw new ValidationError(`Job is already ${job.status}`);
  }

  // Mark as running
  await db.update(dldSyncJobs)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(dldSyncJobs.id, jobId));

  try {
    let result: object;

    switch (job.type) {
      case 'poll':
        result = await executePollSync(job, orgId);
        break;
      case 'reconcile':
        result = await executeReconcileSync(job, orgId);
        break;
      case 'manual':
        result = await executeManualSync(job, orgId);
        break;
      default:
        throw new ValidationError(`Unknown sync type: ${job.type}`);
    }

    // Mark as succeeded
    const [updated] = await db.update(dldSyncJobs)
      .set({
        status: 'succeeded',
        result: result as any,
        completedAt: new Date(),
      })
      .where(eq(dldSyncJobs.id, jobId))
      .returning();

    return updated;
  } catch (error) {
    // Mark as failed
    const [updated] = await db.update(dldSyncJobs)
      .set({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Sync failed',
        completedAt: new Date(),
      })
      .where(eq(dldSyncJobs.id, jobId))
      .returning();

    return updated;
  }
}

async function executePollSync(job: typeof dldSyncJobs.$inferSelect, orgId: string): Promise<object> {
  // In production, this would poll the DLD API for updates
  // For now, simulate with mock data

  const titlesToSync = job.dldTitleId
    ? [await db.query.dldTitles.findFirst({ where: eq(dldTitles.id, job.dldTitleId) })]
    : await db.select().from(dldTitles).where(eq(dldTitles.orgId, orgId));

  let syncedCount = 0;

  for (const title of titlesToSync) {
    if (title) {
      // Mock: Update last synced time
      await db.update(dldTitles)
        .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(dldTitles.id, title.id));
      syncedCount++;
    }
  }

  return { syncedCount, type: 'poll' };
}

async function executeReconcileSync(job: typeof dldSyncJobs.$inferSelect, orgId: string): Promise<object> {
  // Reconcile internal state with DLD
  const titles = job.dldTitleId
    ? [await db.query.dldTitles.findFirst({ where: eq(dldTitles.id, job.dldTitleId) })]
    : await db.select().from(dldTitles).where(eq(dldTitles.orgId, orgId));

  let reconciledCount = 0;
  const conflicts: string[] = [];

  for (const title of titles) {
    if (title) {
      // Check for unprocessed events
      const unprocessedEvents = await db.select()
        .from(dldEvents)
        .where(and(
          eq(dldEvents.dldTitleId, title.id),
          eq(dldEvents.processed, false)
        ));

      for (const event of unprocessedEvents) {
        try {
          await processEvent(event.id, orgId);
          reconciledCount++;
        } catch (error) {
          conflicts.push(`Event ${event.id}: ${error instanceof Error ? error.message : 'Failed'}`);
        }
      }
    }
  }

  return { reconciledCount, conflicts, type: 'reconcile' };
}

async function executeManualSync(job: typeof dldSyncJobs.$inferSelect, orgId: string): Promise<object> {
  // Manual sync for specific asset or title
  if (!job.assetId && !job.dldTitleId) {
    throw new ValidationError('Manual sync requires assetId or dldTitleId');
  }

  let title: typeof dldTitles.$inferSelect | undefined;

  if (job.dldTitleId) {
    title = await db.query.dldTitles.findFirst({ where: eq(dldTitles.id, job.dldTitleId) }) || undefined;
  } else if (job.assetId) {
    title = await db.query.dldTitles.findFirst({
      where: and(eq(dldTitles.assetId, job.assetId), eq(dldTitles.orgId, orgId)),
    }) || undefined;
  }

  if (!title) {
    throw new NotFoundError('DLD title not found');
  }

  // Update last synced
  await db.update(dldTitles)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(dldTitles.id, title.id));

  return { titleId: title.id, externalId: title.externalTitleDeedId, type: 'manual' };
}

export async function listSyncJobs(orgId: string, params: {
  type?: string;
  jobType?: string; // Alias for type
  status?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const { type, jobType, status, limit = 50, offset = 0 } = params;
  const effectiveType = type || jobType;

  const conditions = [eq(dldSyncJobs.orgId, orgId)];
  if (effectiveType) conditions.push(eq(dldSyncJobs.type, effectiveType));
  if (status) conditions.push(eq(dldSyncJobs.status, status));

  return db.select()
    .from(dldSyncJobs)
    .where(and(...conditions))
    .orderBy(desc(dldSyncJobs.createdAt))
    .limit(limit)
    .offset(offset);
}

// ============================================================================
// Additional Functions (Route Compatibility)
// ============================================================================

/**
 * Register a new title (alias for createTitle)
 */
export async function registerTitle(input: CreateTitleInput) {
  return createTitle(input);
}

/**
 * Update a title's properties
 */
export async function updateTitle(id: string, orgId: string, updates: {
  status?: string;
  currentOwnerName?: string;
  currentOwnerAddress?: string;
  snapshot?: DldTitleData;
}) {
  const title = await getTitle(id, orgId);
  if (!title) {
    throw new NotFoundError('Title');
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.status) updateData.status = updates.status;
  if (updates.currentOwnerName) updateData.currentOwnerName = updates.currentOwnerName;
  if (updates.currentOwnerAddress) updateData.currentOwnerAddress = updates.currentOwnerAddress;
  if (updates.snapshot) updateData.snapshot = updates.snapshot;

  const [updated] = await db.update(dldTitles)
    .set(updateData)
    .where(and(eq(dldTitles.id, id), eq(dldTitles.orgId, orgId)))
    .returning();

  return updated;
}

/**
 * Get events for a specific title
 */
export async function getTitleEvents(titleId: string, orgId: string, params: {
  limit?: number;
  offset?: number;
} = {}) {
  const { limit = 50, offset = 0 } = params;

  return db.select()
    .from(dldEvents)
    .where(and(
      eq(dldEvents.titleDeedExternalId, titleId),
      eq(dldEvents.orgId, orgId)
    ))
    .orderBy(desc(dldEvents.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Look up a title by DLD title number
 */
export async function lookupByDldTitleNumber(titleNumber: string, orgId: string) {
  return db.select()
    .from(dldTitles)
    .where(and(
      eq(dldTitles.externalTitleDeedId, titleNumber),
      eq(dldTitles.orgId, orgId)
    ))
    .limit(1)
    .then(rows => rows[0] || null);
}

/**
 * Check if a title is clear (no encumbrances or conflicts)
 */
export async function checkTitleClear(titleId: string, orgId: string): Promise<{
  isClear: boolean;
  issues: string[];
  lastChecked: Date;
}> {
  const title = await getTitle(titleId, orgId);
  if (!title) {
    throw new NotFoundError('Title');
  }

  const issues: string[] = [];

  // Check for conflict status
  if (title.status === 'conflict') {
    issues.push('Title has an unresolved conflict');
  }

  // Check snapshot for encumbrances
  const snapshot = title.snapshot as DldTitleData | null;
  if (snapshot?.encumbrances && snapshot.encumbrances.length > 0) {
    issues.push(`Title has ${snapshot.encumbrances.length} encumbrance(s)`);
  }

  return {
    isClear: issues.length === 0,
    issues,
    lastChecked: new Date(),
  };
}

// ============================================================================
// Helpers
// ============================================================================

async function emitDldEvent(orgId: string, topic: string, payload: object) {
  await db.insert(eventBusQueue).values({
    orgId,
    topic,
    eventId: `evt_${randomUUID().replace(/-/g, '')}`,
    payload: payload as any,
    trace: { timestamp: new Date() } as any,
    status: 'pending',
  });
}
