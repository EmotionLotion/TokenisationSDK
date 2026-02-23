/**
 * VARAConditionEvaluator - Unit Tests
 *
 * Tests for the VARA (Virtual Assets Regulatory Authority) condition evaluator:
 * - supports() correctly identifies VARA conditions
 * - Constructor throws in production when no real provider is injected (fix 2.7)
 * - Constructor succeeds with mock in non-production
 * - Constructor succeeds with real provider in production
 * - evaluate() with passing AML score
 * - evaluate() with failing AML score below minimum
 * - Cache behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  VARAConditionEvaluator,
  type VARAConditionEvaluatorConfig,
  type IVARAServiceProvider,
  type VARAComplianceStatus,
  type VARARiskCategory,
} from '@tokenisation/realestate';
import type { CustomConditionContext } from '@tokenisation/core';

// ============================================================================
// Mock VARA Service Provider
// ============================================================================

function createMockVARAProvider(): {
  [K in keyof IVARAServiceProvider]: ReturnType<typeof vi.fn>;
} {
  return {
    verifyLicense: vi.fn(),
    checkComplianceStatus: vi.fn(),
    verifyReportingSetup: vi.fn(),
  };
}

/**
 * Helper to set up a mock provider that returns compliant results.
 * Returns the mock so individual tests can override specific methods.
 */
function createCompliantProvider(overrides: {
  amlScore?: number;
  status?: VARAComplianceStatus;
  riskCategory?: VARARiskCategory;
} = {}) {
  const mock = createMockVARAProvider();
  const now = new Date();
  const futureExpiry = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

  mock.verifyLicense.mockResolvedValue({
    valid: true,
    expiryDate: futureExpiry.toISOString(),
    status: overrides.status ?? 'COMPLIANT',
    holder: 'Test Token Issuer LLC',
  });

  mock.checkComplianceStatus.mockResolvedValue({
    status: overrides.status ?? 'COMPLIANT',
    riskCategory: overrides.riskCategory ?? 'MEDIUM',
    amlScore: overrides.amlScore ?? 85,
    lastAuditDate: now.toISOString(),
    findings: [],
  });

  mock.verifyReportingSetup.mockResolvedValue({
    configured: true,
    reportingTypes: ['investor_summary', 'transaction_summary', 'aml_sar', 'complaints_register'],
    nextReportDue: new Date(now.getFullYear(), Math.ceil((now.getMonth() + 1) / 3) * 3, 1).toISOString(),
    lastReportSubmitted: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
  });

  return mock;
}

// ============================================================================
// Fixtures
// ============================================================================

function makeContext(overrides: Partial<CustomConditionContext> & {
  metadata?: Record<string, unknown>;
} = {}): CustomConditionContext {
  const { metadata, ...rest } = overrides;
  return {
    assetId: 'asset-vara-001',
    asset: {
      id: 'asset-vara-001',
      name: 'Dubai Real Estate Token',
      type: 'real-estate',
      status: 'active',
      jurisdiction: { countryCode: 'AE', name: 'United Arab Emirates' },
      metadata: {
        varaLicenseNumber: 'VARA-2024-001',
        ...metadata,
      },
    } as any,
    actorId: 'actor-001',
    targetState: 'active' as any,
    ...rest,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('VARAConditionEvaluator', () => {
  let mockProvider: ReturnType<typeof createMockVARAProvider>;
  let evaluator: VARAConditionEvaluator;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockProvider = createCompliantProvider();
    evaluator = new VARAConditionEvaluator({
      varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
    });
  });

  afterEach(() => {
    // Restore NODE_ENV after each test
    process.env.NODE_ENV = originalNodeEnv;
  });

  // ==========================================================================
  // supports()
  // ==========================================================================

  describe('supports()', () => {
    it('returns true for VARA_COMPLIANCE_VERIFIED', () => {
      expect(evaluator.supports('VARA_COMPLIANCE_VERIFIED')).toBe(true);
    });

    it('returns true for VARA_REPORTING_ACTIVE', () => {
      expect(evaluator.supports('VARA_REPORTING_ACTIVE')).toBe(true);
    });

    it('returns false for DLD_OWNERSHIP_VERIFIED (not a VARA condition)', () => {
      expect(evaluator.supports('DLD_OWNERSHIP_VERIFIED')).toBe(false);
    });

    it('returns false for PROPERTY_SOLD (not a VARA condition)', () => {
      expect(evaluator.supports('PROPERTY_SOLD')).toBe(false);
    });

    it('returns false for an arbitrary unknown condition', () => {
      expect(evaluator.supports('SOME_OTHER_CONDITION')).toBe(false);
    });

    it('returns false for an empty string', () => {
      expect(evaluator.supports('')).toBe(false);
    });
  });

  // ==========================================================================
  // Constructor - production guard (fix 2.7)
  // ==========================================================================

  describe('constructor - production guard (fix 2.7)', () => {
    it('throws in production when no real provider is injected', () => {
      process.env.NODE_ENV = 'production';

      expect(() => {
        new VARAConditionEvaluator({});
      }).toThrow('real varaServiceProvider is required in production');
    });

    it('throws in production when config is default (no provider)', () => {
      process.env.NODE_ENV = 'production';

      expect(() => {
        new VARAConditionEvaluator();
      }).toThrow('real varaServiceProvider is required in production');
    });

    it('succeeds with mock in non-production (default NODE_ENV)', () => {
      process.env.NODE_ENV = 'test';

      const instance = new VARAConditionEvaluator({});

      expect(instance).toBeInstanceOf(VARAConditionEvaluator);
      expect(instance.evaluatorId).toBe('vara-condition-evaluator');
    });

    it('succeeds with mock when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';

      const instance = new VARAConditionEvaluator();

      expect(instance).toBeInstanceOf(VARAConditionEvaluator);
    });

    it('succeeds with real provider in production', () => {
      process.env.NODE_ENV = 'production';

      const realProvider = createCompliantProvider();

      const instance = new VARAConditionEvaluator({
        varaServiceProvider: realProvider as unknown as IVARAServiceProvider,
      });

      expect(instance).toBeInstanceOf(VARAConditionEvaluator);
    });
  });

  // ==========================================================================
  // evaluate() - passing AML score
  // ==========================================================================

  describe('evaluate() - passing AML score', () => {
    it('returns satisfied:true when AML score is above minimum (default 70)', async () => {
      mockProvider = createCompliantProvider({ amlScore: 85 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence).toBeDefined();
      expect(result.evidence!.amlComplianceScore).toBe(85);
      expect(result.evidence!.complianceStatus).toBe('COMPLIANT');
      expect(result.evidence!.verificationSource).toBe('vara_api');
    });

    it('returns satisfied:true when AML score is exactly at minimum', async () => {
      mockProvider = createCompliantProvider({ amlScore: 70 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
        minimumAmlScore: 70,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence!.amlComplianceScore).toBe(70);
    });

    it('returns satisfied:true with custom minimum AML score', async () => {
      mockProvider = createCompliantProvider({ amlScore: 60 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
        minimumAmlScore: 50,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
    });

    it('includes AML warning when score is below 80 but above minimum', async () => {
      mockProvider = createCompliantProvider({ amlScore: 75 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.some(w => w.includes('below recommended 80%'))).toBe(true);
    });

    it('does not include AML warning when score is 80 or above', async () => {
      mockProvider = createCompliantProvider({ amlScore: 80 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      // No AML-specific warnings (may have other warnings like license expiry)
      if (result.warnings) {
        expect(result.warnings.every(w => !w.includes('below recommended 80%'))).toBe(true);
      }
    });

    it('calls verifyLicense and checkComplianceStatus with correct license number', async () => {
      const context = makeContext({
        metadata: { varaLicenseNumber: 'VARA-CUSTOM-999' },
      });

      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(mockProvider.verifyLicense).toHaveBeenCalledWith('VARA-CUSTOM-999');
      expect(mockProvider.checkComplianceStatus).toHaveBeenCalledWith('VARA-CUSTOM-999');
    });
  });

  // ==========================================================================
  // evaluate() - failing AML score
  // ==========================================================================

  describe('evaluate() - failing AML score', () => {
    it('returns satisfied:false when AML score is below default minimum (70)', async () => {
      mockProvider = createCompliantProvider({ amlScore: 65 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('AML compliance score');
      expect(result.reason).toContain('65%');
      expect(result.reason).toContain('below minimum');
      expect(result.reason).toContain('70%');
    });

    it('returns satisfied:false when AML score is below custom minimum', async () => {
      mockProvider = createCompliantProvider({ amlScore: 79 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
        minimumAmlScore: 80,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('79%');
      expect(result.reason).toContain('80%');
    });

    it('returns satisfied:false when AML score is 0', async () => {
      mockProvider = createCompliantProvider({ amlScore: 0 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('0%');
    });

    it('includes evidence with license and compliance details when AML fails', async () => {
      mockProvider = createCompliantProvider({ amlScore: 50, riskCategory: 'HIGH' });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.evidence).toBeDefined();
      expect(result.evidence!.license).toBeDefined();
      expect(result.evidence!.compliance).toBeDefined();
    });
  });

  // ==========================================================================
  // evaluate() - compliance status checks
  // ==========================================================================

  describe('evaluate() - compliance status', () => {
    it('returns satisfied:false when license is invalid', async () => {
      mockProvider = createMockVARAProvider();
      mockProvider.verifyLicense.mockResolvedValue({
        valid: false,
        expiryDate: new Date().toISOString(),
        status: 'SUSPENDED',
        holder: 'Suspended Entity',
      });

      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('not valid');
      expect(result.reason).toContain('SUSPENDED');
    });

    it('returns satisfied:false when license is expired', async () => {
      mockProvider = createMockVARAProvider();
      const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      mockProvider.verifyLicense.mockResolvedValue({
        valid: true,
        expiryDate: pastDate.toISOString(),
        status: 'COMPLIANT',
        holder: 'Test Holder',
      });

      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('returns satisfied:false when compliance status is REMEDIATION (non-pending, non-compliant)', async () => {
      mockProvider = createCompliantProvider({ status: 'REMEDIATION', amlScore: 90 });
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('REMEDIATION');
    });

    it('returns satisfied:false when varaLicenseNumber is missing from metadata', async () => {
      const context = makeContext({ metadata: {} });
      delete (context.asset.metadata as any).varaLicenseNumber;

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('varaLicenseNumber');
      expect(mockProvider.verifyLicense).not.toHaveBeenCalled();
    });

    it('returns satisfied:false for unsupported condition', async () => {
      const context = makeContext();
      const result = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('Unsupported condition');
    });

    it('returns satisfied:false when VARA API throws an error', async () => {
      mockProvider.verifyLicense.mockRejectedValue(new Error('VARA API timeout'));

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('VARA compliance verification failed');
      expect(result.reason).toContain('VARA API timeout');
    });
  });

  // ==========================================================================
  // Cache behavior
  // ==========================================================================

  describe('cache behavior', () => {
    it('caches VARA_COMPLIANCE_VERIFIED results and reuses them on subsequent calls', async () => {
      const context = makeContext();

      // First call - should call VARA API
      const result1 = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(result1.satisfied).toBe(true);
      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(1);
      expect(mockProvider.checkComplianceStatus).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(result2.satisfied).toBe(true);
      // Mock should not have been called again
      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(1);
      expect(mockProvider.checkComplianceStatus).toHaveBeenCalledTimes(1);
    });

    it('cache expires after TTL and triggers fresh API call', async () => {
      evaluator = new VARAConditionEvaluator({
        varaServiceProvider: mockProvider as unknown as IVARAServiceProvider,
        cacheTtlMs: 50, // 50ms TTL
      });

      const context = makeContext();

      // First call
      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second call - cache expired
      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(2);
    });

    it('clearCache() removes all cached entries', async () => {
      const context = makeContext();

      // Populate cache
      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(1);

      // Clear cache
      evaluator.clearCache();

      // Next call should hit API again
      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(2);
    });

    it('different license numbers have separate cache entries', async () => {
      const context1 = makeContext({
        metadata: { varaLicenseNumber: 'VARA-001' },
      });
      const context2 = makeContext({
        metadata: { varaLicenseNumber: 'VARA-002' },
      });

      // Both calls should hit the API (different cache keys)
      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context1);
      await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context2);

      expect(mockProvider.verifyLicense).toHaveBeenCalledTimes(2);
      expect(mockProvider.verifyLicense).toHaveBeenCalledWith('VARA-001');
      expect(mockProvider.verifyLicense).toHaveBeenCalledWith('VARA-002');
    });

    it('VARA_REPORTING_ACTIVE is not cached (no caching in that path)', async () => {
      const context = makeContext();

      // Call twice
      await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);
      await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      // verifyReportingSetup should be called twice (no caching for reporting)
      expect(mockProvider.verifyReportingSetup).toHaveBeenCalledTimes(2);
    });
  });

  // ==========================================================================
  // evaluate() - VARA_REPORTING_ACTIVE
  // ==========================================================================

  describe('evaluate() - VARA_REPORTING_ACTIVE', () => {
    it('returns satisfied:true when reporting is fully configured', async () => {
      const context = makeContext();
      const result = await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence).toBeDefined();
      expect(result.evidence!.reporting).toBeDefined();
    });

    it('returns satisfied:false when reporting is not configured', async () => {
      mockProvider.verifyReportingSetup.mockResolvedValue({
        configured: false,
        reportingTypes: [],
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('not configured');
    });

    it('returns satisfied:false when required report types are missing', async () => {
      mockProvider.verifyReportingSetup.mockResolvedValue({
        configured: true,
        reportingTypes: ['investor_summary'], // Missing transaction_summary and aml_sar
      });

      const context = makeContext();
      const result = await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('Missing required VARA report types');
      expect(result.reason).toContain('transaction_summary');
      expect(result.reason).toContain('aml_sar');
    });
  });

  // ==========================================================================
  // Metadata & identity
  // ==========================================================================

  describe('evaluator identity', () => {
    it('has correct evaluatorId', () => {
      expect(evaluator.evaluatorId).toBe('vara-condition-evaluator');
    });

    it('lists all supported conditions', () => {
      expect(evaluator.supportedConditions).toEqual([
        'VARA_COMPLIANCE_VERIFIED',
        'VARA_REPORTING_ACTIVE',
      ]);
    });
  });
});
