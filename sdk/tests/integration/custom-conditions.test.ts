/**
 * Custom Condition Evaluator Integration Tests
 *
 * Tests the integration of:
 * 1. DLDConditionEvaluator - Dubai Land Department verification
 * 2. VARAConditionEvaluator - UAE VARA compliance
 * 3. CustomConditionRegistry - Evaluator management
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Custom Condition Infrastructure
import { CustomConditionRegistry } from '../../src/core/CustomConditionRegistry.js';
import {
  DLDConditionEvaluator,
  type DLDConditionEvaluatorConfig,
} from '../../src/packs/DLDConditionEvaluator.js';
import {
  VARAConditionEvaluator,
  type VARAConditionEvaluatorConfig,
  type IVARAServiceProvider,
  type VARAComplianceStatus,
  type VARARiskCategory,
} from '../../src/packs/VARAConditionEvaluator.js';

// DLD types
import type {
  DLDModule,
  TitleDeed,
  TokenizationEligibility,
  TokenizationNotification,
  DldEvent,
  TitleDeedStatus,
  PropertyType,
  OwnershipType,
} from '../../src/modules/DLDClient.js';
import type { PaginatedResponse } from '../../src/types.js';

// Core types
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
} from '../../src/core/types.js';
import type {
  CustomConditionContext,
  RightModel,
} from '../../src/core/interfaces.js';

// ============================================================================
// MOCK IMPLEMENTATIONS
// ============================================================================

/**
 * Mock DLD Module for testing - matches actual DLDModule interface
 */
class MockDLDModule implements Pick<DLDModule, 'verify' | 'canTokenize' | 'notifyTokenization' | 'getTokenizationStatus' | 'getPropertyEvents'> {
  private titleDeeds: Map<string, TitleDeed> = new Map();
  private eligibility: Map<string, TokenizationEligibility> = new Map();
  private notifications: Map<string, TokenizationNotification> = new Map();
  private propertyEvents: Map<string, DldEvent[]> = new Map();

  setTitleDeed(deedNumber: string, deed: Partial<TitleDeed>): void {
    const fullDeed: TitleDeed = {
      deedNumber,
      propertyId: deed.propertyId ?? `PROP-${deedNumber}`,
      status: deed.status ?? 'VALID',
      propertyType: deed.propertyType ?? 'RESIDENTIAL',
      ownershipType: deed.ownershipType ?? 'FREEHOLD',
      owners: deed.owners ?? [{
        id: 'owner-1',
        name: 'Test Owner',
        nationality: 'AE',
        sharePercentage: 100,
      }],
      area: deed.area ?? 100,
      areaUnit: deed.areaUnit ?? 'sqm',
      location: deed.location ?? {
        emirate: 'Dubai',
        community: 'Dubai Marina',
      },
      registrationDate: deed.registrationDate ?? new Date().toISOString(),
      encumbrances: deed.encumbrances ?? [],
      restrictions: deed.restrictions ?? [],
      verifiedAt: deed.verifiedAt ?? new Date().toISOString(),
    };
    this.titleDeeds.set(deedNumber, fullDeed);
  }

  setEligibility(propertyId: string, eligible: boolean, reasons: string[] = []): void {
    this.eligibility.set(propertyId, {
      propertyId,
      eligible,
      reasons,
      requirements: [],
      warnings: [],
      maxTokenizationPercentage: eligible ? 100 : 0,
      checkedAt: new Date().toISOString(),
    });
  }

  setNotification(referenceNumber: string, notification: Partial<TokenizationNotification>): void {
    this.notifications.set(referenceNumber, {
      referenceNumber,
      propertyId: notification.propertyId ?? 'PROP-001',
      deedNumber: notification.deedNumber ?? 'DEED-001',
      tokenContractAddress: notification.tokenContractAddress ?? '0x1234',
      totalSupply: notification.totalSupply ?? '1000000',
      status: notification.status ?? 'APPROVED',
      submittedAt: notification.submittedAt ?? new Date().toISOString(),
      acknowledgedAt: notification.acknowledgedAt,
      approvedAt: notification.approvedAt,
      rejectedAt: notification.rejectedAt,
      rejectionReason: notification.rejectionReason,
    });
  }

  addPropertyEvent(propertyId: string, event: Partial<DldEvent>): void {
    const events = this.propertyEvents.get(propertyId) ?? [];
    events.push({
      id: event.id ?? `event-${events.length}`,
      propertyId,
      eventType: event.eventType ?? 'OWNERSHIP_TRANSFER',
      eventDate: event.eventDate ?? new Date().toISOString(),
      description: event.description ?? 'Event description',
      parties: event.parties ?? [],
      createdAt: event.createdAt ?? new Date().toISOString(),
    });
    this.propertyEvents.set(propertyId, events);
  }

  async verify(input: { deedNumber: string; propertyId?: string }): Promise<TitleDeed> {
    const deed = this.titleDeeds.get(input.deedNumber);
    if (!deed) {
      const notFoundDeed: TitleDeed = {
        deedNumber: input.deedNumber,
        propertyId: input.propertyId ?? 'UNKNOWN',
        status: 'NOT_FOUND',
        propertyType: 'RESIDENTIAL',
        ownershipType: 'FREEHOLD',
        owners: [],
        area: 0,
        areaUnit: 'sqm',
        location: { emirate: 'Dubai', community: 'Unknown' },
        registrationDate: new Date().toISOString(),
        encumbrances: [],
        restrictions: [],
        verifiedAt: new Date().toISOString(),
      };
      return notFoundDeed;
    }
    return deed;
  }

  async canTokenize(input: { propertyId: string }): Promise<TokenizationEligibility> {
    const elig = this.eligibility.get(input.propertyId);
    if (!elig) {
      return {
        propertyId: input.propertyId,
        eligible: false,
        reasons: ['Property not found'],
        requirements: [],
        warnings: [],
        maxTokenizationPercentage: 0,
        checkedAt: new Date().toISOString(),
      };
    }
    return elig;
  }

  async notifyTokenization(input: {
    propertyId: string;
    deedNumber: string;
    tokenContractAddress: string;
    totalSupply: string;
    issuerDetails: { name: string; registrationNumber: string; jurisdiction: string };
  }): Promise<TokenizationNotification> {
    const refNum = `REF-${Date.now()}`;
    const notification: TokenizationNotification = {
      referenceNumber: refNum,
      propertyId: input.propertyId,
      deedNumber: input.deedNumber,
      tokenContractAddress: input.tokenContractAddress,
      totalSupply: input.totalSupply,
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
    };
    this.notifications.set(refNum, notification);
    return notification;
  }

  async getTokenizationStatus(referenceNumber: string): Promise<TokenizationNotification> {
    const notification = this.notifications.get(referenceNumber);
    if (!notification) {
      throw new Error(`Notification not found: ${referenceNumber}`);
    }
    return notification;
  }

  async getPropertyEvents(
    propertyId: string,
    _params?: { limit?: number; offset?: number }
  ): Promise<PaginatedResponse<DldEvent>> {
    const events = this.propertyEvents.get(propertyId) ?? [];
    return {
      data: events,
      pagination: {
        page: 1,
        pageSize: events.length,
        totalCount: events.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
  }
}

/**
 * Mock VARA Service Provider for testing
 */
class MockVARAServiceProvider implements IVARAServiceProvider {
  private licenses: Map<string, {
    valid: boolean;
    expiryDate: string;
    status: VARAComplianceStatus;
    holder: string;
  }> = new Map();

  private complianceStatuses: Map<string, {
    status: VARAComplianceStatus;
    riskCategory: VARARiskCategory;
    amlScore: number;
    lastAuditDate?: string;
    findings: string[];
  }> = new Map();

  private reportingSetups: Map<string, {
    configured: boolean;
    reportingTypes: string[];
    nextReportDue?: string;
    lastReportSubmitted?: string;
  }> = new Map();

  setLicense(licenseNumber: string, license: {
    valid: boolean;
    expiryDate: string;
    status: VARAComplianceStatus;
    holder: string;
  }): void {
    this.licenses.set(licenseNumber, license);
  }

  setComplianceStatus(licenseNumber: string, status: {
    status: VARAComplianceStatus;
    riskCategory: VARARiskCategory;
    amlScore: number;
    lastAuditDate?: string;
    findings: string[];
  }): void {
    this.complianceStatuses.set(licenseNumber, status);
  }

  setReportingSetup(licenseNumber: string, setup: {
    configured: boolean;
    reportingTypes: string[];
    nextReportDue?: string;
    lastReportSubmitted?: string;
  }): void {
    this.reportingSetups.set(licenseNumber, setup);
  }

  async verifyLicense(licenseNumber: string): Promise<{
    valid: boolean;
    expiryDate: string;
    status: VARAComplianceStatus;
    holder: string;
  }> {
    const license = this.licenses.get(licenseNumber);
    if (!license) {
      return {
        valid: false,
        expiryDate: new Date().toISOString(),
        status: 'SUSPENDED',
        holder: 'Unknown',
      };
    }
    return license;
  }

  async checkComplianceStatus(licenseNumber: string): Promise<{
    status: VARAComplianceStatus;
    riskCategory: VARARiskCategory;
    amlScore: number;
    lastAuditDate?: string;
    findings: string[];
  }> {
    const status = this.complianceStatuses.get(licenseNumber);
    if (!status) {
      return {
        status: 'PENDING',
        riskCategory: 'HIGH',
        amlScore: 0,
        findings: ['License not found'],
      };
    }
    return status;
  }

  async verifyReportingSetup(licenseNumber: string, _assetId: string): Promise<{
    configured: boolean;
    reportingTypes: string[];
    nextReportDue?: string;
    lastReportSubmitted?: string;
  }> {
    const setup = this.reportingSetups.get(licenseNumber);
    if (!setup) {
      return { configured: false, reportingTypes: [] };
    }
    return setup;
  }
}

// ============================================================================
// CUSTOM CONDITION REGISTRY TESTS
// ============================================================================

describe('CustomConditionRegistry', () => {
  let registry: CustomConditionRegistry;
  let dldModule: MockDLDModule;
  let varaService: MockVARAServiceProvider;

  beforeEach(() => {
    registry = new CustomConditionRegistry();
    dldModule = new MockDLDModule();
    varaService = new MockVARAServiceProvider();
  });

  describe('Evaluator Registration', () => {
    it('should register and retrieve evaluators', () => {
      const dldEvaluator = new DLDConditionEvaluator({ dldModule: dldModule as unknown as DLDModule });
      const varaEvaluator = new VARAConditionEvaluator({ varaServiceProvider: varaService });

      registry.register(dldEvaluator);
      registry.register(varaEvaluator);

      expect(registry.getEvaluator('DLD_OWNERSHIP_VERIFIED')).toBe(dldEvaluator);
      expect(registry.getEvaluator('VARA_COMPLIANCE_VERIFIED')).toBe(varaEvaluator);
    });

    it('should list all registered evaluators', () => {
      const dldEvaluator = new DLDConditionEvaluator({ dldModule: dldModule as unknown as DLDModule });
      const varaEvaluator = new VARAConditionEvaluator({ varaServiceProvider: varaService });

      registry.register(dldEvaluator);
      registry.register(varaEvaluator);

      const evaluators = registry.listEvaluators();
      expect(evaluators.length).toBe(2);
      expect(evaluators.map(e => e.evaluatorId)).toContain('dld-condition-evaluator');
      expect(evaluators.map(e => e.evaluatorId)).toContain('vara-condition-evaluator');
    });

    it('should return undefined for unregistered conditions', () => {
      expect(registry.getEvaluator('UNKNOWN_CONDITION')).toBeUndefined();
    });
  });

  describe('Condition Evaluation', () => {
    it('should evaluate conditions through registered evaluators', async () => {
      dldModule.setTitleDeed('DEED-123', {
        propertyId: 'PROP-001',
        status: 'VALID',
      });
      dldModule.setEligibility('PROP-001', true);

      const dldEvaluator = new DLDConditionEvaluator({ dldModule: dldModule as unknown as DLDModule });
      registry.register(dldEvaluator);

      const context: CustomConditionContext = {
        assetId: 'asset-001',
        asset: createMockAsset({
          metadata: {
            titleDeedNumber: 'DEED-123',
            propertyId: 'PROP-001',
          },
        }),
        actorId: 'actor-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await registry.evaluate('DLD_OWNERSHIP_VERIFIED', context);
      expect(result.satisfied).toBe(true);
      expect(result.evidence).toBeDefined();
    });

    it('should return not satisfied for unregistered conditions', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-001',
        asset: createMockAsset(),
        actorId: 'actor-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await registry.evaluate('UNKNOWN_CONDITION', context);
      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('No evaluator registered');
    });
  });
});

// ============================================================================
// DLD CONDITION EVALUATOR TESTS
// ============================================================================

describe('DLDConditionEvaluator', () => {
  let evaluator: DLDConditionEvaluator;
  let dldModule: MockDLDModule;

  beforeEach(() => {
    dldModule = new MockDLDModule();
    evaluator = new DLDConditionEvaluator({ dldModule: dldModule as unknown as DLDModule });
  });

  describe('DLD_OWNERSHIP_VERIFIED', () => {
    it('should verify ownership when DLD confirms title deed', async () => {
      dldModule.setTitleDeed('DEED-456', {
        propertyId: 'PROP-456',
        status: 'VALID',
        owners: [{
          id: 'owner-1',
          name: 'Property Owner LLC',
          nationality: 'AE',
          sharePercentage: 100,
        }],
        location: {
          emirate: 'Dubai',
          community: 'Palm Jumeirah',
          building: 'Villa 123',
        },
      });
      dldModule.setEligibility('PROP-456', true);

      const context: CustomConditionContext = {
        assetId: 'asset-456',
        asset: createMockAsset({
          metadata: {
            titleDeedNumber: 'DEED-456',
            propertyId: 'PROP-456',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence?.titleDeed).toBeDefined();
    });

    it('should fail when title deed not found', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-invalid',
        asset: createMockAsset({
          metadata: {
            titleDeedNumber: 'INVALID-DEED',
            propertyId: 'PROP-INVALID',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('NOT_FOUND');
    });

    it('should fail when property not eligible for tokenization', async () => {
      dldModule.setTitleDeed('DEED-789', {
        propertyId: 'PROP-789',
        status: 'VALID',
      });
      dldModule.setEligibility('PROP-789', false, ['Under mortgage', 'Pending litigation']);

      const context: CustomConditionContext = {
        assetId: 'asset-789',
        asset: createMockAsset({
          metadata: {
            titleDeedNumber: 'DEED-789',
            propertyId: 'PROP-789',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('not eligible for tokenization');
    });

    it('should fail when metadata missing titleDeedNumber', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-no-deed',
        asset: createMockAsset({
          metadata: {
            propertyId: 'PROP-001',
            // titleDeedNumber missing
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('Title deed number is required');
    });

    it('should fail when property has encumbrances', async () => {
      dldModule.setTitleDeed('DEED-ENC', {
        propertyId: 'PROP-ENC',
        status: 'VALID',
        encumbrances: ['Mortgage to Bank XYZ'],
      });
      dldModule.setEligibility('PROP-ENC', true);

      const context: CustomConditionContext = {
        assetId: 'asset-enc',
        asset: createMockAsset({
          metadata: {
            titleDeedNumber: 'DEED-ENC',
            propertyId: 'PROP-ENC',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_OWNERSHIP_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('encumbrances');
    });
  });

  describe('DLD_TOKENIZATION_REGISTERED', () => {
    it('should register tokenization notification', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-reg-001',
        asset: createMockAsset({
          metadata: {
            propertyId: 'PROP-REG-001',
            titleDeedNumber: 'DEED-REG-001',
            tokenContractAddress: '0x1234567890abcdef',
            issuerName: 'Token Issuer Ltd',
            issuerRegistrationNumber: 'REG-123',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_TOKENIZATION_REGISTERED', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence?.notification).toBeDefined();
    });

    it('should fail when tokenContractAddress missing', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-no-contract',
        asset: createMockAsset({
          metadata: {
            propertyId: 'PROP-001',
            titleDeedNumber: 'DEED-001',
            // tokenContractAddress missing
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('DLD_TOKENIZATION_REGISTERED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('tokenContractAddress');
    });
  });

  describe('PROPERTY_SOLD', () => {
    it('should detect property sale event', async () => {
      dldModule.addPropertyEvent('PROP-SOLD-001', {
        eventType: 'SALE',
        description: 'Property sold to new owner',
      });

      const context: CustomConditionContext = {
        assetId: 'asset-sold-001',
        asset: createMockAsset({
          metadata: {
            propertyId: 'PROP-SOLD-001',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.REDEEMED,
      };

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence?.saleEvent).toBeDefined();
    });

    it('should fail when no sale event exists', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-not-sold',
        asset: createMockAsset({
          metadata: {
            propertyId: 'PROP-NOT-SOLD',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.REDEEMED,
      };

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('No sale event found');
    });

    it('should succeed when sale is confirmed in metadata', async () => {
      const context: CustomConditionContext = {
        assetId: 'asset-confirmed-sale',
        asset: createMockAsset({
          metadata: {
            propertyId: 'PROP-CONFIRMED',
            saleConfirmed: true,
            saleReferenceNumber: 'SALE-REF-123',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.REDEEMED,
      };

      const result = await evaluator.evaluate('PROPERTY_SOLD', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence?.confirmedInMetadata).toBe(true);
    });
  });
});

// ============================================================================
// VARA CONDITION EVALUATOR TESTS
// ============================================================================

describe('VARAConditionEvaluator', () => {
  let evaluator: VARAConditionEvaluator;
  let varaService: MockVARAServiceProvider;

  beforeEach(() => {
    varaService = new MockVARAServiceProvider();
    evaluator = new VARAConditionEvaluator({
      varaServiceProvider: varaService,
      minimumAmlScore: 70,
    });
  });

  describe('VARA_COMPLIANCE_VERIFIED', () => {
    it('should verify compliance when license is valid and compliant', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      varaService.setLicense('VARA-001', {
        valid: true,
        expiryDate: futureDate.toISOString(),
        status: 'COMPLIANT',
        holder: 'Test VASP Ltd',
      });

      varaService.setComplianceStatus('VARA-001', {
        status: 'COMPLIANT',
        riskCategory: 'MEDIUM',
        amlScore: 85,
        lastAuditDate: new Date().toISOString(),
        findings: [],
      });

      const context: CustomConditionContext = {
        assetId: 'asset-vara-001',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-001',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence?.complianceStatus).toBe('COMPLIANT');
      expect(result.evidence?.amlComplianceScore).toBe(85);
    });

    it('should fail when license is invalid', async () => {
      varaService.setLicense('VARA-INVALID', {
        valid: false,
        expiryDate: new Date().toISOString(),
        status: 'SUSPENDED',
        holder: 'Suspended VASP',
      });

      const context: CustomConditionContext = {
        assetId: 'asset-invalid',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-INVALID',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('not valid');
    });

    it('should fail when license is expired', async () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);

      varaService.setLicense('VARA-EXPIRED', {
        valid: true,
        expiryDate: pastDate.toISOString(),
        status: 'COMPLIANT',
        holder: 'Expired VASP',
      });

      const context: CustomConditionContext = {
        assetId: 'asset-expired',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-EXPIRED',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should fail when AML score is below threshold', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      varaService.setLicense('VARA-LOWAML', {
        valid: true,
        expiryDate: futureDate.toISOString(),
        status: 'COMPLIANT',
        holder: 'Low AML VASP',
      });

      varaService.setComplianceStatus('VARA-LOWAML', {
        status: 'COMPLIANT',
        riskCategory: 'HIGH',
        amlScore: 50, // Below 70 threshold
        findings: ['AML procedures need improvement'],
      });

      const context: CustomConditionContext = {
        assetId: 'asset-lowaml',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-LOWAML',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('AML compliance score');
    });

    it('should include warning when license expires soon', async () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15); // 15 days from now

      varaService.setLicense('VARA-EXPIRING', {
        valid: true,
        expiryDate: soonDate.toISOString(),
        status: 'COMPLIANT',
        holder: 'Expiring VASP',
      });

      varaService.setComplianceStatus('VARA-EXPIRING', {
        status: 'COMPLIANT',
        riskCategory: 'LOW',
        amlScore: 90,
        findings: [],
      });

      const context: CustomConditionContext = {
        assetId: 'asset-expiring',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-EXPIRING',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);

      expect(result.satisfied).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('renewal required'))).toBe(true);
    });
  });

  describe('VARA_REPORTING_ACTIVE', () => {
    it('should verify when reporting is configured', async () => {
      varaService.setReportingSetup('VARA-REPORTING', {
        configured: true,
        reportingTypes: ['investor_summary', 'transaction_summary', 'aml_sar'],
        nextReportDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastReportSubmitted: new Date().toISOString(),
      });

      const context: CustomConditionContext = {
        assetId: 'asset-reporting',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-REPORTING',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      expect(result.satisfied).toBe(true);
      expect(result.evidence?.reporting).toBeDefined();
    });

    it('should fail when reporting not configured', async () => {
      varaService.setReportingSetup('VARA-NOREPORT', {
        configured: false,
        reportingTypes: [],
      });

      const context: CustomConditionContext = {
        assetId: 'asset-noreport',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-NOREPORT',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('not configured');
    });

    it('should fail when required report types are missing', async () => {
      varaService.setReportingSetup('VARA-PARTIAL', {
        configured: true,
        reportingTypes: ['investor_summary'], // Missing transaction_summary and aml_sar
      });

      const context: CustomConditionContext = {
        assetId: 'asset-partial',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-PARTIAL',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      const result = await evaluator.evaluate('VARA_REPORTING_ACTIVE', context);

      expect(result.satisfied).toBe(false);
      expect(result.reason).toContain('Missing required');
    });
  });

  describe('Caching', () => {
    it('should cache compliance results', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      varaService.setLicense('VARA-CACHE', {
        valid: true,
        expiryDate: futureDate.toISOString(),
        status: 'COMPLIANT',
        holder: 'Cache Test VASP',
      });

      varaService.setComplianceStatus('VARA-CACHE', {
        status: 'COMPLIANT',
        riskCategory: 'LOW',
        amlScore: 90,
        findings: [],
      });

      const context: CustomConditionContext = {
        assetId: 'asset-cache',
        asset: createMockAsset({
          metadata: {
            varaLicenseNumber: 'VARA-CACHE',
          },
        }),
        actorId: 'issuer-001',
        targetState: LifecycleState.ACTIVE,
      };

      // First call
      const result1 = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(result1.satisfied).toBe(true);

      // Change the underlying data (but cached result should be returned)
      varaService.setComplianceStatus('VARA-CACHE', {
        status: 'SUSPENDED',
        riskCategory: 'HIGH',
        amlScore: 10,
        findings: ['Critical violations'],
      });

      // Second call should return cached result
      const result2 = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(result2.satisfied).toBe(true); // Still true due to caching

      // Clear cache and verify new result
      evaluator.clearCache();
      const result3 = await evaluator.evaluate('VARA_COMPLIANCE_VERIFIED', context);
      expect(result3.satisfied).toBe(false); // Now returns fresh result
    });
  });
});

// ============================================================================
// COMBINED INTEGRATION TESTS
// ============================================================================

describe('Full Integration: Dubai Real Estate Tokenization Flow', () => {
  let registry: CustomConditionRegistry;
  let dldModule: MockDLDModule;
  let varaService: MockVARAServiceProvider;

  beforeEach(() => {
    registry = new CustomConditionRegistry();
    dldModule = new MockDLDModule();
    varaService = new MockVARAServiceProvider();

    const dldEvaluator = new DLDConditionEvaluator({ dldModule: dldModule as unknown as DLDModule });
    const varaEvaluator = new VARAConditionEvaluator({
      varaServiceProvider: varaService,
      minimumAmlScore: 70,
    });

    registry.register(dldEvaluator);
    registry.register(varaEvaluator);
  });

  it('should complete full tokenization verification flow', async () => {
    // Setup valid DLD registration
    dldModule.setTitleDeed('DEED-FULL-001', {
      propertyId: 'PROP-FULL-001',
      status: 'VALID',
      owners: [{
        id: 'owner-1',
        name: 'Premium Properties LLC',
        nationality: 'AE',
        sharePercentage: 100,
      }],
      location: {
        emirate: 'Dubai',
        community: 'Dubai Marina',
        building: 'Tower A',
        unit: 'Unit 2501',
      },
    });
    dldModule.setEligibility('PROP-FULL-001', true);

    // Setup valid VARA compliance
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    varaService.setLicense('VARA-FULL-001', {
      valid: true,
      expiryDate: futureDate.toISOString(),
      status: 'COMPLIANT',
      holder: 'Premium Token Issuer Ltd',
    });

    varaService.setComplianceStatus('VARA-FULL-001', {
      status: 'COMPLIANT',
      riskCategory: 'LOW',
      amlScore: 92,
      lastAuditDate: new Date().toISOString(),
      findings: [],
    });

    varaService.setReportingSetup('VARA-FULL-001', {
      configured: true,
      reportingTypes: ['investor_summary', 'transaction_summary', 'aml_sar'],
      nextReportDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const asset = createMockAsset({
      metadata: {
        titleDeedNumber: 'DEED-FULL-001',
        propertyId: 'PROP-FULL-001',
        varaLicenseNumber: 'VARA-FULL-001',
        tokenContractAddress: '0x1234567890abcdef',
        issuerName: 'Premium Token Issuer Ltd',
        issuerRegistrationNumber: 'REG-PREMIUM-001',
      },
    });

    const context: CustomConditionContext = {
      assetId: 'dubai-full-001',
      asset,
      actorId: 'issuer-001',
      targetState: LifecycleState.ACTIVE,
    };

    // Verify all conditions pass
    const dldResult = await registry.evaluate('DLD_OWNERSHIP_VERIFIED', context);
    expect(dldResult.satisfied).toBe(true);

    const varaComplianceResult = await registry.evaluate('VARA_COMPLIANCE_VERIFIED', context);
    expect(varaComplianceResult.satisfied).toBe(true);

    const varaReportingResult = await registry.evaluate('VARA_REPORTING_ACTIVE', context);
    expect(varaReportingResult.satisfied).toBe(true);

    // Register tokenization
    const tokenizationResult = await registry.evaluate('DLD_TOKENIZATION_REGISTERED', context);
    expect(tokenizationResult.satisfied).toBe(true);
  });

  it('should block tokenization when DLD verification fails', async () => {
    // DLD verification will fail (no setup)
    const asset = createMockAsset({
      metadata: {
        titleDeedNumber: 'DEED-INVALID',
        propertyId: 'PROP-INVALID',
        varaLicenseNumber: 'VARA-001',
      },
    });

    const context: CustomConditionContext = {
      assetId: 'blocked-asset',
      asset,
      actorId: 'issuer-001',
      targetState: LifecycleState.ACTIVE,
    };

    const result = await registry.evaluate('DLD_OWNERSHIP_VERIFIED', context);
    expect(result.satisfied).toBe(false);
  });

  it('should block tokenization when VARA compliance fails', async () => {
    // Setup valid DLD
    dldModule.setTitleDeed('DEED-VARA-FAIL', {
      propertyId: 'PROP-VARA-FAIL',
      status: 'VALID',
    });
    dldModule.setEligibility('PROP-VARA-FAIL', true);

    // VARA license is suspended (no setup = defaults to invalid)

    const asset = createMockAsset({
      metadata: {
        titleDeedNumber: 'DEED-VARA-FAIL',
        propertyId: 'PROP-VARA-FAIL',
        varaLicenseNumber: 'VARA-SUSPENDED',
      },
    });

    const context: CustomConditionContext = {
      assetId: 'vara-fail-asset',
      asset,
      actorId: 'issuer-001',
      targetState: LifecycleState.ACTIVE,
    };

    // DLD passes
    const dldResult = await registry.evaluate('DLD_OWNERSHIP_VERIFIED', context);
    expect(dldResult.satisfied).toBe(true);

    // VARA fails
    const varaResult = await registry.evaluate('VARA_COMPLIANCE_VERIFIED', context);
    expect(varaResult.satisfied).toBe(false);
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockAsset(overrides: Partial<RightModel> = {}): RightModel {
  return {
    id: overrides.id ?? 'mock-asset-001',
    name: overrides.name ?? 'Mock Asset',
    rightType: overrides.rightType ?? RightType.OWNERSHIP,
    state: overrides.state ?? LifecycleState.DRAFT,
    issuerId: overrides.issuerId ?? 'issuer-001',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    totalSupply: overrides.totalSupply ?? '1000000',
    fractionalization: overrides.fractionalization ?? {
      enabled: true,
      minFraction: '1',
      maxFractions: 1000000,
    },
    transferability: overrides.transferability ?? {
      mode: TransferabilityMode.PERMISSIONED,
      rules: [],
    },
    metadata: overrides.metadata ?? {},
    jurisdiction: overrides.jurisdiction ?? {
      countryCode: 'AE',
    },
    version: overrides.version ?? 1,
  };
}
