/**
 * DLDConditionEvaluator - Unit Tests
 *
 * Tests for the Dubai Land Department condition evaluator:
 * - supports() correctly identifies DLD conditions
 * - evaluatePropertySold() with metadata confirmation
 * - evaluatePropertySold() fails when propertyId is missing (fix 2.8)
 * - evaluatePropertySold() queries DLD events when no metadata confirmation
 * - Cache behavior (results are cached within TTL)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DLDConditionEvaluator } from '../../src/packs/DLDConditionEvaluator.js';
import type { DLDConditionEvaluatorConfig } from '../../src/packs/DLDConditionEvaluator.js';
import type { CustomConditionContext } from '../../src/core/interfaces.js';
import type { DLDModule } from '../../src/modules/DLDClient.js';

// ============================================================================
// Mock DLDModule
// ============================================================================

function createMockDLDModule(): {
  [K in keyof DLDModule]: ReturnType<typeof vi.fn>;
} {
  return {
    verify: vi.fn(),
    getTitleDeed: vi.fn(),
    getProperty: vi.fn(),
    canTokenize: vi.fn(),
    notifyTokenization: vi.fn(),
    getTokenizationStatus: vi.fn(),
    getValuation: vi.fn(),
    getValuationHistory: vi.fn(),
    getEvents: vi.fn(),
    getPropertyEvents: vi.fn(),
    searchProperties: vi.fn(),
    getAssetProperties: vi.fn(),
    linkPropertyToAsset: vi.fn(),
    unlinkPropertyFromAsset: vi.fn(),
  } as any;
}

// ============================================================================
// Fixtures
// ============================================================================

function makeContext(overrides: Partial<CustomConditionContext> & {
  metadata?: Record<string, unknown>;
} = {}): CustomConditionContext {
  const { metadata, ...rest } = overrides;
  return {
    assetId: 'asset-001',
    asset: {
      id: 'asset-001',
      name: 'Dubai Marina Tower Unit 42A',
      type: 'real-estate',
      status: 'active',
      jurisdiction: { countryCode: 'AE', name: 'United Arab Emirates' },
      metadata: {
        titleDeedNumber: 'TD-2024-001',
        propertyId: 'PROP-001',
        ...metadata,
      },
    } as any,
    actorId: 'actor-001',
    targetState: 'redeemed' as any,
    ...rest,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('DLDConditionEvaluator', () => {
  let mockDLD: ReturnType<typeof createMockDLDModule>;
  let evaluator: DLDConditionEvaluator;

  beforeEach(() => {
    mockDLD = createMockDLDModule();
    evaluator = new DLDConditionEvaluator({
      dldModule: mockDLD as unknown as DLDModule,
    });
  });

  // ==========================================================================
  // supports()
  // ==========================================================================

  describe('supports()', () => {
    it('returns true for DLD_OWNERSHIP_VERIFIED', () => {
      expect(evaluator.supports('DLD_OWNERSHIP_VERIFIED')).toBe(true);
    });

    it('returns true for DLD_TOKENIZATION_REGISTERED', () => {
      expect(evaluator.supports('DLD_TOKENIZATION_REGISTERED')).toBe(true);
    });

    it('returns true for PROPERTY_SOLD', () => {
      expect(evaluator.supports('PROPERTY_SOLD')).toBe(true);
    });

    it('returns false for VARA_COMPLIANCE_VERIFIED (not a DLD condition)', () => {
      expect(evaluator.supports('VARA_COMPLIANCE_VERIFIED')).toBe(false);
    });

    it('returns false for an arbitrary unknown condition', () => {
      expect(evaluator.supports('UNKNOWN_CONDITION')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(evaluator.supports('')).toBe(false);
    });
  });

  // ==========================================================================
  // evaluatePropertySold() - sale confirmed in metadata
  // ==========================================================================

  describe('evaluatePropertySold() - metadata confirmation', () => {
    it('returns satisfied:true when saleConfirmed is true and saleReferenceNumber is present', async () => {
      const context = makeContext({
        metadata: {
          titleDeedNumber: 'TD-2024-001',
          propertyId: 'PROP-001',
          saleConfirmed: true,
          saleReferenceNumber: 'SALE-REF-001',
        },
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence).toBeDefined();
      expect(result.evidence!.saleReferenceNumber).toBe('SALE-REF-001');
      expect(result.evidence!.confirmedInMetadata).toBe(true);
      // Should NOT call getPropertyEvents since metadata already confirms
      expect(mockDLD.getPropertyEvents).not.toHaveBeenCalled();
    });

    it('does not short-circuit when saleConfirmed is true but saleReferenceNumber is missing', async () => {
      const context = makeContext({
        metadata: {
          titleDeedNumber: 'TD-2024-001',
          propertyId: 'PROP-001',
          saleConfirmed: true,
          // No saleReferenceNumber
        },
      });

      // Mock getPropertyEvents to return no sale events
      mockDLD.getPropertyEvents.mockResolvedValue({
        data: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      // Should have queried DLD since saleReferenceNumber was missing
      expect(mockDLD.getPropertyEvents).toHaveBeenCalled();
      expect(result.satisfied).toBe(false);
    });

    it('does not short-circuit when saleConfirmed is false', async () => {
      const context = makeContext({
        metadata: {
          titleDeedNumber: 'TD-2024-001',
          propertyId: 'PROP-001',
          saleConfirmed: false,
          saleReferenceNumber: 'SALE-REF-001',
        },
      });

      mockDLD.getPropertyEvents.mockResolvedValue({
        data: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(mockDLD.getPropertyEvents).toHaveBeenCalled();
      expect(result.satisfied).toBe(false);
    });
  });

  // ==========================================================================
  // evaluatePropertySold() - propertyId missing (fix 2.8)
  // ==========================================================================

  describe('evaluatePropertySold() - propertyId missing (fix 2.8)', () => {
    it('returns satisfied:false when propertyId is missing and sale is not confirmed in metadata', async () => {
      const context = makeContext({
        metadata: {
          titleDeedNumber: 'TD-2024-001',
          // propertyId intentionally omitted
        },
      });
      // Remove propertyId from asset metadata
      delete (context.asset.metadata as any).propertyId;

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('propertyId');
      expect(mockDLD.getPropertyEvents).not.toHaveBeenCalled();
    });

    it('returns satisfied:false with descriptive reason when both titleDeedNumber and propertyId are missing', async () => {
      const context = makeContext({
        metadata: {},
      });
      delete (context.asset.metadata as any).titleDeedNumber;
      delete (context.asset.metadata as any).propertyId;

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('titleDeedNumber');
      expect(result.reason).toContain('propertyId');
    });
  });

  // ==========================================================================
  // evaluatePropertySold() - queries DLD events
  // ==========================================================================

  describe('evaluatePropertySold() - queries DLD events', () => {
    it('returns satisfied:true when a SALE event is found in DLD events', async () => {
      const context = makeContext();

      mockDLD.getPropertyEvents.mockResolvedValue({
        data: [
          {
            id: 'evt-001',
            propertyId: 'PROP-001',
            eventType: 'SALE',
            eventDate: '2024-06-15T10:00:00Z',
            description: 'Property sold',
            parties: [
              { role: 'seller', name: 'Original Owner' },
              { role: 'buyer', name: 'New Owner' },
            ],
            value: '5000000',
            currency: 'AED',
            createdAt: '2024-06-15T10:00:00Z',
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence).toBeDefined();
      expect(result.evidence!.saleEvent).toBeDefined();
      expect(result.evidence!.verificationSource).toBe('dld_events');
      expect(mockDLD.getPropertyEvents).toHaveBeenCalledWith('PROP-001', { limit: 10 });
    });

    it('returns satisfied:true when an OWNERSHIP_TRANSFER event is found', async () => {
      const context = makeContext();

      mockDLD.getPropertyEvents.mockResolvedValue({
        data: [
          {
            id: 'evt-002',
            propertyId: 'PROP-001',
            eventType: 'OWNERSHIP_TRANSFER',
            eventDate: '2024-07-01T12:00:00Z',
            description: 'Ownership transferred',
            parties: [],
            createdAt: '2024-07-01T12:00:00Z',
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence!.saleEvent.eventType).toBe('OWNERSHIP_TRANSFER');
    });

    it('returns satisfied:false when no sale or transfer event exists in DLD events', async () => {
      const context = makeContext();

      mockDLD.getPropertyEvents.mockResolvedValue({
        data: [
          {
            id: 'evt-003',
            propertyId: 'PROP-001',
            eventType: 'VALUATION_UPDATE',
            eventDate: '2024-05-01T08:00:00Z',
            description: 'Annual valuation',
            parties: [],
            createdAt: '2024-05-01T08:00:00Z',
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('No sale event found');
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    });

    it('returns satisfied:false when DLD getPropertyEvents returns an empty list', async () => {
      const context = makeContext();

      mockDLD.getPropertyEvents.mockResolvedValue({
        data: [],
        total: 0,
        limit: 10,
        offset: 0,
      });

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('No sale event found');
    });

    it('returns satisfied:false when DLD API throws an error', async () => {
      const context = makeContext();

      mockDLD.getPropertyEvents.mockRejectedValue(new Error('DLD API unreachable'));

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('DLD sale verification failed');
      expect(result.reason).toContain('DLD API unreachable');
    });
  });

  // ==========================================================================
  // Cache behavior
  // ==========================================================================

  describe('cache behavior', () => {
    it('caches DLD_OWNERSHIP_VERIFIED results and reuses them on subsequent calls', async () => {
      const context = makeContext();

      // Set up mocks for ownership verification
      mockDLD.verify.mockResolvedValue({
        deedNumber: 'TD-2024-001',
        propertyId: 'PROP-001',
        status: 'VALID',
        propertyType: 'RESIDENTIAL',
        ownershipType: 'FREEHOLD',
        owners: [],
        area: 1200,
        areaUnit: 'sqft',
        location: { emirate: 'Dubai', community: 'Dubai Marina' },
        registrationDate: '2020-01-01',
        encumbrances: [],
        restrictions: [],
        verifiedAt: new Date().toISOString(),
      });

      mockDLD.canTokenize.mockResolvedValue({
        propertyId: 'PROP-001',
        eligible: true,
        reasons: [],
        requirements: [],
        warnings: [],
        maxTokenizationPercentage: 100,
        checkedAt: new Date().toISOString(),
      });

      // First call - should call DLD API
      const result1 = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(result1.satisfied).toBe(true);
      expect(mockDLD.verify).toHaveBeenCalledTimes(1);
      expect(mockDLD.canTokenize).toHaveBeenCalledTimes(1);

      // Second call - should use cache, not call API again
      const result2 = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(result2.satisfied).toBe(true);
      expect(result2.evidence!.verificationSource).toBe('cache');
      expect(mockDLD.verify).toHaveBeenCalledTimes(1); // Still 1
      expect(mockDLD.canTokenize).toHaveBeenCalledTimes(1); // Still 1
    });

    it('cache expires after TTL and triggers fresh API call', async () => {
      // Use a very short TTL
      evaluator = new DLDConditionEvaluator({
        dldModule: mockDLD as unknown as DLDModule,
        cacheTtlMs: 50, // 50ms TTL
      });

      const context = makeContext();

      mockDLD.verify.mockResolvedValue({
        deedNumber: 'TD-2024-001',
        propertyId: 'PROP-001',
        status: 'VALID',
        propertyType: 'RESIDENTIAL',
        ownershipType: 'FREEHOLD',
        owners: [],
        area: 1200,
        areaUnit: 'sqft',
        location: { emirate: 'Dubai', community: 'Dubai Marina' },
        registrationDate: '2020-01-01',
        encumbrances: [],
        restrictions: [],
        verifiedAt: new Date().toISOString(),
      });

      mockDLD.canTokenize.mockResolvedValue({
        propertyId: 'PROP-001',
        eligible: true,
        reasons: [],
        requirements: [],
        warnings: [],
        maxTokenizationPercentage: 100,
        checkedAt: new Date().toISOString(),
      });

      // First call
      await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(mockDLD.verify).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second call - cache expired, should call API again
      await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(mockDLD.verify).toHaveBeenCalledTimes(2);
    });

    it('requireFreshVerification bypasses cache entirely', async () => {
      evaluator = new DLDConditionEvaluator({
        dldModule: mockDLD as unknown as DLDModule,
        requireFreshVerification: true,
      });

      const context = makeContext();

      mockDLD.verify.mockResolvedValue({
        deedNumber: 'TD-2024-001',
        propertyId: 'PROP-001',
        status: 'VALID',
        propertyType: 'RESIDENTIAL',
        ownershipType: 'FREEHOLD',
        owners: [],
        area: 1200,
        areaUnit: 'sqft',
        location: { emirate: 'Dubai', community: 'Dubai Marina' },
        registrationDate: '2020-01-01',
        encumbrances: [],
        restrictions: [],
        verifiedAt: new Date().toISOString(),
      });

      mockDLD.canTokenize.mockResolvedValue({
        propertyId: 'PROP-001',
        eligible: true,
        reasons: [],
        requirements: [],
        warnings: [],
        maxTokenizationPercentage: 100,
        checkedAt: new Date().toISOString(),
      });

      // Call twice in quick succession
      await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      // Both should have hit the API
      expect(mockDLD.verify).toHaveBeenCalledTimes(2);
      expect(mockDLD.canTokenize).toHaveBeenCalledTimes(2);
    });

    it('clearCache() removes all cached entries', async () => {
      const context = makeContext();

      mockDLD.verify.mockResolvedValue({
        deedNumber: 'TD-2024-001',
        propertyId: 'PROP-001',
        status: 'VALID',
        propertyType: 'RESIDENTIAL',
        ownershipType: 'FREEHOLD',
        owners: [],
        area: 1200,
        areaUnit: 'sqft',
        location: { emirate: 'Dubai', community: 'Dubai Marina' },
        registrationDate: '2020-01-01',
        encumbrances: [],
        restrictions: [],
        verifiedAt: new Date().toISOString(),
      });

      mockDLD.canTokenize.mockResolvedValue({
        propertyId: 'PROP-001',
        eligible: true,
        reasons: [],
        requirements: [],
        warnings: [],
        maxTokenizationPercentage: 100,
        checkedAt: new Date().toISOString(),
      });

      // Populate cache
      await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(evaluator.getCacheStats().size).toBe(1);

      // Clear cache
      evaluator.clearCache();
      expect(evaluator.getCacheStats().size).toBe(0);

      // Next call should hit API again
      await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(mockDLD.verify).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // evaluate() with unsupported condition
  // ==========================================================================

  describe('evaluate() edge cases', () => {
    it('returns satisfied:false for unsupported condition', async () => {
      const context = makeContext();

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('Unsupported condition');
    });

    it('evaluator has correct evaluatorId', () => {
      expect(evaluator.evaluatorId).toBe('dld-condition-evaluator');
    });

    it('evaluator lists all three supported conditions', () => {
      expect(evaluator.supportedConditions).toEqual([
        'DLD_OWNERSHIP_VERIFIED',
        'DLD_TOKENIZATION_REGISTERED',
        'PROPERTY_SOLD',
      ]);
    });
  });
});
