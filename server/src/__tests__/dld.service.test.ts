/**
 * DLD Service - Unit Tests
 *
 * Tests title CRUD, event ingestion/processing, sync jobs,
 * production guard, verification, and conflict handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db, schema } from '../config/database.js';
import {
  createTitle,
  getTitle,
  getTitleByExternalId,
  getTitleByAsset,
  listTitles,
  updateTitleSnapshot,
  verifyTitle,
  setTitleConflict,
  ingestEvent,
  processEvent,
  listEvents,
  createSyncJob,
  executeSyncJob,
} from '../services/dld.service.js';

// ============================================================================
// Suppress logger output during tests
// ============================================================================

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ============================================================================
// Helpers
// ============================================================================

let counter = 0;

/** Create an org row and return its id (satisfies FK constraints on dldTitles). */
async function createOrg(): Promise<string> {
  const slug = `org-dld-${Date.now()}-${++counter}`;
  const [org] = await db.insert(schema.orgs).values({
    name: `Test Org ${counter}`,
    slug,
  }).returning();
  return org.id;
}

function uniqueDeedId(): string {
  return `deed-${Date.now()}-${++counter}`;
}

async function createTestTitle(orgId: string, overrides: Record<string, unknown> = {}) {
  return createTitle({
    orgId,
    externalTitleDeedId: uniqueDeedId(),
    data: {
      externalTitleDeedId: 'ignored',
      ownerName: 'Test Owner',
      propertyType: 'apartment',
      location: { emirate: 'Dubai', community: 'Downtown' },
      area: 120,
      areaUnit: 'sqm',
      valuationAed: 2500000,
    },
    ...overrides,
  });
}

// ============================================================================
// createTitle
// ============================================================================

describe('DLD Service', () => {
  describe('createTitle', () => {
    it('creates a title with pending status', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      const title = await createTitle({
        orgId,
        externalTitleDeedId: deedId,
        data: {
          externalTitleDeedId: deedId,
          ownerName: 'Alice',
          propertyType: 'villa',
          area: 500,
          valuationAed: 5000000,
        },
      });

      expect(title.orgId).toBe(orgId);
      expect(title.externalTitleDeedId).toBe(deedId);
      expect(title.status).toBe('pending');
      expect(title.ownerName).toBe('Alice');
      expect(title.propertyType).toBe('villa');
      expect(title.id).toBeTruthy();
    });

    it('defaults areaUnit to sqm', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);
      expect(title.areaUnit).toBe('sqm');
    });

    it('stores area and valuationAed as strings', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);
      expect(title.area).toBe('120');
      expect(title.valuationAed).toBe('2500000');
    });

    it('throws on duplicate externalTitleDeedId for same org', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();

      await createTitle({ orgId, externalTitleDeedId: deedId });

      await expect(
        createTitle({ orgId, externalTitleDeedId: deedId })
      ).rejects.toThrow(/already exists/);
    });

    it('allows same externalTitleDeedId across different orgs', async () => {
      const deedId = uniqueDeedId();
      const orgA = await createOrg();
      const orgB = await createOrg();

      const titleA = await createTitle({ orgId: orgA, externalTitleDeedId: deedId });
      const titleB = await createTitle({ orgId: orgB, externalTitleDeedId: deedId });

      expect(titleA.orgId).toBe(orgA);
      expect(titleB.orgId).toBe(orgB);
    });

    it('stores metadata when provided', async () => {
      const orgId = await createOrg();
      const title = await createTitle({
        orgId,
        externalTitleDeedId: uniqueDeedId(),
        metadata: { source: 'api', importedBy: 'admin' },
      });

      expect(title.metadata).toEqual({ source: 'api', importedBy: 'admin' });
    });
  });

  // ==========================================================================
  // getTitle
  // ==========================================================================

  describe('getTitle', () => {
    it('returns a title by id and orgId', async () => {
      const orgId = await createOrg();
      const created = await createTestTitle(orgId);
      const fetched = await getTitle(created.id, orgId);
      expect(fetched.id).toBe(created.id);
    });

    it('throws NotFoundError for non-existent id', async () => {
      const orgId = await createOrg();
      await expect(getTitle('nonexistent-id', orgId)).rejects.toThrow(/not found/i);
    });

    it('throws NotFoundError when orgId does not match', async () => {
      const orgA = await createOrg();
      const orgB = await createOrg();
      const title = await createTestTitle(orgA);
      await expect(getTitle(title.id, orgB)).rejects.toThrow(/not found/i);
    });
  });

  // ==========================================================================
  // getTitleByExternalId
  // ==========================================================================

  describe('getTitleByExternalId', () => {
    it('returns a title by external deed id', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      const fetched = await getTitleByExternalId(deedId, orgId);
      expect(fetched.externalTitleDeedId).toBe(deedId);
    });

    it('throws NotFoundError for unknown external id', async () => {
      const orgId = await createOrg();
      await expect(getTitleByExternalId('unknown', orgId)).rejects.toThrow(/not found/i);
    });
  });

  // ==========================================================================
  // getTitleByAsset
  // ==========================================================================

  describe('getTitleByAsset', () => {
    it('returns undefined when no title is linked', async () => {
      const orgId = await createOrg();
      const result = await getTitleByAsset('no-asset-id', orgId);
      expect(result).toBeUndefined();
    });
  });

  // ==========================================================================
  // listTitles
  // ==========================================================================

  describe('listTitles', () => {
    it('returns titles for the given org', async () => {
      const orgId = await createOrg();
      await createTestTitle(orgId);
      await createTestTitle(orgId);

      const results = await listTitles(orgId);
      expect(results.length).toBe(2);
    });

    it('does not return titles from other orgs', async () => {
      const orgA = await createOrg();
      const orgB = await createOrg();
      await createTestTitle(orgA);
      await createTestTitle(orgB);

      const results = await listTitles(orgA);
      expect(results.length).toBe(1);
    });

    it('filters by status', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);
      await createTestTitle(orgId);

      await verifyTitle(title.id, orgId, 'test-verifier');

      const verified = await listTitles(orgId, { status: 'verified' });
      expect(verified.length).toBe(1);

      const pending = await listTitles(orgId, { status: 'pending' });
      expect(pending.length).toBe(1);
    });

    it('respects limit and offset', async () => {
      const orgId = await createOrg();
      for (let i = 0; i < 5; i++) {
        await createTestTitle(orgId);
      }

      const page = await listTitles(orgId, { limit: 2, offset: 0 });
      expect(page.length).toBe(2);
    });

    it('returns empty array for org with no titles', async () => {
      const orgId = await createOrg();
      const results = await listTitles(orgId);
      expect(results).toEqual([]);
    });
  });

  // ==========================================================================
  // updateTitleSnapshot
  // ==========================================================================

  describe('updateTitleSnapshot', () => {
    it('updates snapshot data and sets lastSyncedAt', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);

      const updated = await updateTitleSnapshot(title.id, orgId, {
        externalTitleDeedId: title.externalTitleDeedId,
        ownerName: 'Updated Owner',
        area: 200,
      });

      expect(updated.ownerName).toBe('Updated Owner');
      expect(updated.area).toBe('200');
      expect(updated.lastSyncedAt).toBeTruthy();
    });
  });

  // ==========================================================================
  // verifyTitle
  // ==========================================================================

  describe('verifyTitle', () => {
    it('sets status to verified', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);

      const verified = await verifyTitle(title.id, orgId, 'admin');
      expect(verified.status).toBe('verified');
      expect(verified.verifiedBy).toBe('admin');
      expect(verified.verifiedAt).toBeTruthy();
    });

    it('throws when already verified', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);

      await verifyTitle(title.id, orgId, 'admin');

      await expect(
        verifyTitle(title.id, orgId, 'admin')
      ).rejects.toThrow(/already verified/);
    });

    it('rejects verification with blocking flags', async () => {
      const orgId = await createOrg();
      const title = await createTitle({
        orgId,
        externalTitleDeedId: uniqueDeedId(),
        data: {
          externalTitleDeedId: 'x',
          flags: ['dispute'],
        },
      });

      await expect(
        verifyTitle(title.id, orgId, 'admin')
      ).rejects.toThrow(/blocking flags/);
    });
  });

  // ==========================================================================
  // setTitleConflict
  // ==========================================================================

  describe('setTitleConflict', () => {
    it('sets status to conflict and records reason', async () => {
      const orgId = await createOrg();
      const title = await createTestTitle(orgId);

      const conflicted = await setTitleConflict(title.id, orgId, 'Ownership dispute');
      expect(conflicted.status).toBe('conflict');
      expect((conflicted.metadata as Record<string, unknown>).conflictReason).toBe('Ownership dispute');
    });
  });

  // ==========================================================================
  // Event Ingestion
  // ==========================================================================

  describe('ingestEvent', () => {
    it('creates an event record', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      const event = await ingestEvent({
        externalEventId: `evt-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: { newOwner: 'Bob' },
      }, orgId);

      expect(event.type).toBe('ownership_change');
      expect(event.orgId).toBe(orgId);
      expect(event.processed).toBeFalsy();
    });

    it('is idempotent for same externalEventId', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      const eventId = `evt-idem-${Date.now()}-${++counter}`;
      const first = await ingestEvent({
        externalEventId: eventId,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: { newOwner: 'Bob' },
      }, orgId);

      const second = await ingestEvent({
        externalEventId: eventId,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: { newOwner: 'Bob' },
      }, orgId);

      expect(first.id).toBe(second.id);
    });

    it('links event to existing title', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      const title = await createTitle({ orgId, externalTitleDeedId: deedId });

      const event = await ingestEvent({
        externalEventId: `evt-link-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'valuation_update',
        payload: { valuationAed: 3000000 },
      }, orgId);

      expect(event.dldTitleId).toBe(title.id);
    });
  });

  // ==========================================================================
  // Event Processing
  // ==========================================================================

  describe('processEvent', () => {
    it('processes an ownership_change event', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      const event = await ingestEvent({
        externalEventId: `evt-proc-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: { newOwner: 'Charlie' },
      }, orgId);

      await processEvent(event.id, orgId);

      const title = await getTitleByExternalId(deedId, orgId);
      expect(title.ownerName).toBe('Charlie');
    });

    it('processes a lien_added event and sets conflict', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      const event = await ingestEvent({
        externalEventId: `evt-lien-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'lien_added',
        payload: { lienHolder: 'Bank XYZ' },
      }, orgId);

      await processEvent(event.id, orgId);

      const title = await getTitleByExternalId(deedId, orgId);
      expect(title.flags).toContain('lien');
      expect(title.status).toBe('conflict');
    });

    it('throws NotFoundError for non-existent event', async () => {
      const orgId = await createOrg();
      await expect(processEvent('nonexistent', orgId)).rejects.toThrow(/not found/i);
    });

    it('is idempotent for already processed events', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      const event = await ingestEvent({
        externalEventId: `evt-idem-proc-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: { newOwner: 'Dave' },
      }, orgId);

      const first = await processEvent(event.id, orgId);
      const second = await processEvent(event.id, orgId);

      expect(first.id).toBe(second.id);
    });
  });

  // ==========================================================================
  // listEvents
  // ==========================================================================

  describe('listEvents', () => {
    it('returns events for the given org', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      await ingestEvent({
        externalEventId: `evt-list1-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: {},
      }, orgId);

      await ingestEvent({
        externalEventId: `evt-list2-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'valuation_update',
        payload: {},
      }, orgId);

      const events = await listEvents(orgId);
      expect(events.length).toBe(2);
    });

    it('filters by type', async () => {
      const orgId = await createOrg();
      const deedId = uniqueDeedId();
      await createTitle({ orgId, externalTitleDeedId: deedId });

      await ingestEvent({
        externalEventId: `evt-f1-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'ownership_change',
        payload: {},
      }, orgId);

      await ingestEvent({
        externalEventId: `evt-f2-${Date.now()}-${++counter}`,
        titleDeedExternalId: deedId,
        type: 'valuation_update',
        payload: {},
      }, orgId);

      const filtered = await listEvents(orgId, { type: 'valuation_update' });
      expect(filtered.length).toBe(1);
      expect(filtered[0].type).toBe('valuation_update');
    });

    it('returns empty array when no events', async () => {
      const orgId = await createOrg();
      const events = await listEvents(orgId);
      expect(events).toEqual([]);
    });
  });

  // ==========================================================================
  // Sync Jobs
  // ==========================================================================

  describe('createSyncJob', () => {
    it('creates a job with pending status', async () => {
      const orgId = await createOrg();
      const job = await createSyncJob(orgId, 'poll');

      expect(job.orgId).toBe(orgId);
      expect(job.type).toBe('poll');
      expect(job.status).toBe('pending');
    });
  });

  describe('executeSyncJob', () => {
    it('executes a poll sync job', async () => {
      const orgId = await createOrg();
      await createTestTitle(orgId);

      const job = await createSyncJob(orgId, 'poll');
      const result = await executeSyncJob(job.id, orgId);

      expect(result.status).toBe('succeeded');
    });

    it('executes a reconcile sync job', async () => {
      const orgId = await createOrg();
      const job = await createSyncJob(orgId, 'reconcile');
      const result = await executeSyncJob(job.id, orgId);

      expect(result.status).toBe('succeeded');
    });

    it('throws NotFoundError for non-existent job', async () => {
      const orgId = await createOrg();
      await expect(executeSyncJob('nonexistent', orgId)).rejects.toThrow(/not found/i);
    });

    it('throws when job is not pending', async () => {
      const orgId = await createOrg();
      await createTestTitle(orgId);

      const job = await createSyncJob(orgId, 'poll');
      await executeSyncJob(job.id, orgId);

      await expect(executeSyncJob(job.id, orgId)).rejects.toThrow(/already/);
    });
  });

  // ==========================================================================
  // Production Guard (Bug 2.6)
  // ==========================================================================

  describe('executePollSync - production guard', () => {
    let originalNodeEnv: string | undefined;
    let originalDldApiUrl: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      originalDldApiUrl = process.env.DLD_API_URL;
    });

    afterEach(() => {
      if (originalNodeEnv !== undefined) {
        process.env.NODE_ENV = originalNodeEnv;
      } else {
        delete process.env.NODE_ENV;
      }
      if (originalDldApiUrl !== undefined) {
        process.env.DLD_API_URL = originalDldApiUrl;
      } else {
        delete process.env.DLD_API_URL;
      }
    });

    it('fails in production when DLD_API_URL is not set', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DLD_API_URL;

      const orgId = await createOrg();
      await createTestTitle(orgId);

      const job = await createSyncJob(orgId, 'poll');
      const result = await executeSyncJob(job.id, orgId);

      expect(result.status).toBe('failed');
      expect(result.error).toContain('DLD_API_URL');
    });

    it('succeeds in production when DLD_API_URL is set', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DLD_API_URL = 'https://api.dld.gov.ae';

      const orgId = await createOrg();
      await createTestTitle(orgId);

      const job = await createSyncJob(orgId, 'poll');
      const result = await executeSyncJob(job.id, orgId);

      expect(result.status).toBe('succeeded');
    });

    it('succeeds in non-production without DLD_API_URL', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.DLD_API_URL;

      const orgId = await createOrg();
      await createTestTitle(orgId);

      const job = await createSyncJob(orgId, 'poll');
      const result = await executeSyncJob(job.id, orgId);

      expect(result.status).toBe('succeeded');
    });
  });
});
