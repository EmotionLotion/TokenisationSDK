/**
 * DLDModule Tests
 *
 * Covers title registration, verification, tokenization eligibility,
 * event ingestion, sync jobs, URL construction, and Zod validation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DLDModule, ValidationError } from '@tokenisation/realestate';

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: { data: {} } }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  } as any;
}

// ---------------------------------------------------------------------------
// Valid input fixtures
// ---------------------------------------------------------------------------

function validRegisterTitle() {
  return {
    projectId: 'proj-001',
    dldTitleNumber: 'DLD-2024-0001',
    propertyType: 'building' as const,
    emirate: 'Dubai',
    area: 'Downtown',
  };
}

function validIngestEvent() {
  return {
    dldTitleId: 'title-001',
    eventType: 'OWNERSHIP_TRANSFER',
    eventData: { previousOwner: 'Alice', newOwner: 'Bob' },
  };
}

function validCreateSyncJob() {
  return { jobType: 'poll' as const };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DLDModule', () => {
  let mod: DLDModule;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    mod = new DLDModule(http);
  });

  // ========================================================================
  // registerTitle
  // ========================================================================
  describe('registerTitle', () => {
    it('should POST to /api/v1/dld/titles with validated body', async () => {
      const input = validRegisterTitle();
      await mod.registerTitle(input);

      expect(http.post).toHaveBeenCalledWith('/api/v1/dld/titles', input);
    });

    it('should return the response data', async () => {
      const expected = { deedNumber: 'DEED-1', propertyId: 'p1', status: 'PENDING' };
      http.post.mockResolvedValue({ data: expected });

      const result = await mod.registerTitle(validRegisterTitle());
      expect(result).toEqual(expected);
    });

    it('should reject empty projectId', async () => {
      const bad = { ...validRegisterTitle(), projectId: '' };
      await expect(mod.registerTitle(bad)).rejects.toThrow(ValidationError);
    });

    it('should reject missing projectId', async () => {
      const { projectId, ...rest } = validRegisterTitle();
      await expect(mod.registerTitle(rest as any)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid propertyType', async () => {
      const bad = { ...validRegisterTitle(), propertyType: 'villa' };
      await expect(mod.registerTitle(bad as any)).rejects.toThrow(ValidationError);
    });

    it('should accept all valid propertyType values', async () => {
      for (const propertyType of ['land', 'building', 'unit'] as const) {
        http.post.mockClear();
        await mod.registerTitle({ ...validRegisterTitle(), propertyType });
        expect(http.post).toHaveBeenCalledTimes(1);
      }
    });

    it('should reject empty dldTitleNumber', async () => {
      const bad = { ...validRegisterTitle(), dldTitleNumber: '' };
      await expect(mod.registerTitle(bad)).rejects.toThrow(ValidationError);
    });
  });

  // ========================================================================
  // listTitles
  // ========================================================================
  describe('listTitles', () => {
    it('should call list helper on /api/v1/dld/titles', async () => {
      await mod.listTitles({ projectId: 'p1', limit: 10 });
      expect(http.list).toHaveBeenCalledWith('/api/v1/dld/titles', {
        projectId: 'p1',
        limit: 10,
      });
    });

    it('should work without params', async () => {
      await mod.listTitles();
      expect(http.list).toHaveBeenCalledWith('/api/v1/dld/titles', undefined);
    });
  });

  // ========================================================================
  // getTitle
  // ========================================================================
  describe('getTitle', () => {
    it('should GET /api/v1/dld/titles/:id', async () => {
      await mod.getTitle('title-1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/dld/titles/title-1');
    });

    it('should encodeURIComponent the id in the URL', async () => {
      await mod.getTitle('title/special&id');
      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/dld/titles/title%2Fspecial%26id',
      );
    });
  });

  // ========================================================================
  // updateTitle
  // ========================================================================
  describe('updateTitle', () => {
    it('should PATCH /api/v1/dld/titles/:id with input', async () => {
      const input = { status: 'verified' as const };
      await mod.updateTitle('title-1', input);

      expect(http.patch).toHaveBeenCalledWith('/api/v1/dld/titles/title-1', input);
    });

    it('should encodeURIComponent the id in the URL', async () => {
      await mod.updateTitle('id with spaces', { status: 'pending' });
      expect(http.patch).toHaveBeenCalledWith(
        '/api/v1/dld/titles/id%20with%20spaces',
        { status: 'pending' },
      );
    });
  });

  // ========================================================================
  // verify
  // ========================================================================
  describe('verify', () => {
    it('should POST to /api/v1/dld/titles/:deedNumber/verify using the deedNumber from input', async () => {
      const input = { deedNumber: 'DEED-2024-999' };
      await mod.verify(input);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/titles/DEED-2024-999/verify',
        input,
      );
    });

    it('should use the validated deedNumber (not a separate id param) in the URL', async () => {
      const input = { deedNumber: 'DEED/special', propertyId: 'p1' };
      await mod.verify(input);

      const url = http.post.mock.calls[0][0] as string;
      expect(url).toBe('/api/v1/dld/titles/DEED%2Fspecial/verify');
    });

    it('should reject empty deedNumber', async () => {
      await expect(mod.verify({ deedNumber: '' })).rejects.toThrow();
    });
  });

  // ========================================================================
  // verifyOnChain
  // ========================================================================
  describe('verifyOnChain', () => {
    it('should POST to /api/v1/dld/titles/:id/verify-onchain', async () => {
      await mod.verifyOnChain('title-42');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/titles/title-42/verify-onchain',
      );
    });

    it('should encodeURIComponent the id', async () => {
      await mod.verifyOnChain('id#hash');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/titles/id%23hash/verify-onchain',
      );
    });
  });

  // ========================================================================
  // canTokenize
  // ========================================================================
  describe('canTokenize', () => {
    it('should POST to /api/v1/dld/tokenization/check', async () => {
      const input = { propertyId: 'prop-1' };
      await mod.canTokenize(input);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/tokenization/check',
        input,
      );
    });

    it('should reject empty propertyId', async () => {
      await expect(mod.canTokenize({ propertyId: '' })).rejects.toThrow();
    });
  });

  // ========================================================================
  // notifyTokenization
  // ========================================================================
  describe('notifyTokenization', () => {
    it('should POST to /api/v1/dld/tokenization/notify', async () => {
      const input = {
        propertyId: 'prop-1',
        deedNumber: 'DEED-1',
        tokenContractAddress: '0x' + 'ab'.repeat(20),
        totalSupply: '1000000',
        issuerDetails: {
          name: 'Issuer Co',
          registrationNumber: 'REG-001',
          jurisdiction: 'AE',
        },
      };
      await mod.notifyTokenization(input);

      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/tokenization/notify',
        expect.objectContaining({ propertyId: 'prop-1' }),
      );
    });
  });

  // ========================================================================
  // ingestEvent
  // ========================================================================
  describe('ingestEvent', () => {
    it('should POST to /api/v1/dld/events with validated body', async () => {
      const input = validIngestEvent();
      await mod.ingestEvent(input);

      expect(http.post).toHaveBeenCalledWith('/api/v1/dld/events', input);
    });

    it('should reject missing eventType', async () => {
      const { eventType, ...rest } = validIngestEvent();
      await expect(mod.ingestEvent(rest as any)).rejects.toThrow(ValidationError);
    });

    it('should reject empty eventType', async () => {
      const bad = { ...validIngestEvent(), eventType: '' };
      await expect(mod.ingestEvent(bad)).rejects.toThrow(ValidationError);
    });

    it('should reject missing dldTitleId', async () => {
      const { dldTitleId, ...rest } = validIngestEvent();
      await expect(mod.ingestEvent(rest as any)).rejects.toThrow(ValidationError);
    });

    it('should reject missing eventData', async () => {
      const { eventData, ...rest } = validIngestEvent();
      await expect(mod.ingestEvent(rest as any)).rejects.toThrow(ValidationError);
    });

    it('should accept optional fields (dldEventId, occurredAt)', async () => {
      const input = {
        ...validIngestEvent(),
        dldEventId: 'ext-event-001',
        occurredAt: '2025-01-15T10:00:00Z',
      };
      await expect(mod.ingestEvent(input)).resolves.toBeDefined();
    });

    it('should include field path information in ValidationError', async () => {
      try {
        await mod.ingestEvent({ dldTitleId: '', eventType: '' } as any);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.fieldErrors.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ========================================================================
  // createSyncJob
  // ========================================================================
  describe('createSyncJob', () => {
    it('should POST to /api/v1/dld/sync-jobs with validated body', async () => {
      const input = validCreateSyncJob();
      await mod.createSyncJob(input);

      expect(http.post).toHaveBeenCalledWith('/api/v1/dld/sync-jobs', input);
    });

    it('should reject invalid jobType', async () => {
      const bad = { jobType: 'invalid' };
      await expect(mod.createSyncJob(bad as any)).rejects.toThrow(ValidationError);
    });

    it('should accept all valid jobType values', async () => {
      for (const jobType of ['poll', 'reconcile', 'manual'] as const) {
        http.post.mockClear();
        await mod.createSyncJob({ jobType });
        expect(http.post).toHaveBeenCalledTimes(1);
      }
    });

    it('should accept optional config', async () => {
      const input = { jobType: 'reconcile' as const, config: { batchSize: 50 } };
      await mod.createSyncJob(input);
      expect(http.post).toHaveBeenCalledWith('/api/v1/dld/sync-jobs', input);
    });
  });

  // ========================================================================
  // getTitleDeed (alias)
  // ========================================================================
  describe('getTitleDeed', () => {
    it('should GET /api/v1/dld/titles/:deedNumber with encoded deedNumber', async () => {
      await mod.getTitleDeed('DEED/123');
      expect(http.get).toHaveBeenCalledWith('/api/v1/dld/titles/DEED%2F123');
    });
  });

  // ========================================================================
  // processEvent
  // ========================================================================
  describe('processEvent', () => {
    it('should POST to /api/v1/dld/events/:eventId/process with encoded id', async () => {
      await mod.processEvent('evt 1');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/events/evt%201/process',
      );
    });
  });

  // ========================================================================
  // executeSyncJob
  // ========================================================================
  describe('executeSyncJob', () => {
    it('should POST to /api/v1/dld/sync-jobs/:jobId/execute with encoded id', async () => {
      await mod.executeSyncJob('job&1');
      expect(http.post).toHaveBeenCalledWith(
        '/api/v1/dld/sync-jobs/job%261/execute',
      );
    });
  });

  // ========================================================================
  // lookupByTitleNumber
  // ========================================================================
  describe('lookupByTitleNumber', () => {
    it('should GET /api/v1/dld/lookup/:dldTitleNumber with encoded value', async () => {
      await mod.lookupByTitleNumber('DLD#2024');
      expect(http.get).toHaveBeenCalledWith('/api/v1/dld/lookup/DLD%232024');
    });
  });

  // ========================================================================
  // getTokenizationStatus
  // ========================================================================
  describe('getTokenizationStatus', () => {
    it('should GET /api/v1/dld/tokenization/:referenceNumber with encoded value', async () => {
      await mod.getTokenizationStatus('ref/123');
      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/dld/tokenization/ref%2F123',
      );
    });
  });

  // ========================================================================
  // checkTitleClear
  // ========================================================================
  describe('checkTitleClear', () => {
    it('should GET /api/v1/dld/titles/:id/check-clear with encoded id', async () => {
      await mod.checkTitleClear('id with spaces');
      expect(http.get).toHaveBeenCalledWith(
        '/api/v1/dld/titles/id%20with%20spaces/check-clear',
      );
    });
  });

  // ========================================================================
  // Edge cases and ValidationError shape
  // ========================================================================
  describe('ValidationError structure', () => {
    it('registerTitle ValidationError has code VALIDATION_ERROR and fieldErrors array', async () => {
      try {
        await mod.registerTitle({ projectId: '', dldTitleNumber: '', propertyType: 'invalid' as any });
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const ve = err as ValidationError;
        expect(ve.code).toBe('VALIDATION_ERROR');
        expect(Array.isArray(ve.fieldErrors)).toBe(true);
        expect(ve.fieldErrors.length).toBeGreaterThan(0);
        // Each field error should have path and message
        for (const fe of ve.fieldErrors) {
          expect(fe).toHaveProperty('path');
          expect(fe).toHaveProperty('message');
        }
      }
    });

    it('createSyncJob ValidationError message includes label', async () => {
      try {
        await mod.createSyncJob({ jobType: 'bad' as any });
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toContain('CreateSyncJob');
      }
    });

    it('ingestEvent ValidationError message includes label', async () => {
      try {
        await mod.ingestEvent({ dldTitleId: '', eventType: '' } as any);
        expect.fail('Expected ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as Error).message).toContain('IngestEvent');
      }
    });
  });
});
