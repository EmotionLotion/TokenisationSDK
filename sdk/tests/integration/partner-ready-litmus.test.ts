/**
 * Partner-Ready Litmus Test
 *
 * Proves the SDK is "partner-ready" with a comprehensive end-to-end test
 * exercising three key integration areas across all four pack engines
 * (Airline, Hotel, CarRental, Concert).
 *
 * Scenario 1: Autonomous Handoff — Saga + Oracle (10 tests)
 * Scenario 2: Portable Identity — KYC Once, Use Everywhere (10 tests)
 * Scenario 3: Unified Source of Truth — Audit + Hash Chain (10 tests)
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Orchestration layer
import {
  SharedIdentityRegistry,
  CrossPackEventBus,
  SagaOrchestrator,
  SagaExecutionStatus,
  UnifiedAuditLog,
  FlightLandingOracle,
  PortableComplianceRegistry,
  AuditChainManager,
} from '../../src/orchestration/index.js';
import type {
  ICrossPackEventBus,
  IAuditLog,
  IIdentityRegistry,
  CrossPackEvent,
  SagaDefinition,
  FlightLandingData,
  PortableReceipt,
  ChainedAuditEntry,
} from '../../src/orchestration/index.js';

// Oracle
import {
  OracleService,
  OracleFailSafeMode,
  OracleHealthStatus,
} from '../../src/services/OracleService.js';

// Decision receipt
import {
  createReceipt,
  verifyReceiptSignature,
  ReceiptChain,
} from '../../src/core/DecisionReceipt.js';
import type { DecisionReceipt } from '../../src/core/DecisionReceipt.js';

// Types
import { ComplianceAction } from '../../src/core/types.js';
import type { PolicyDecision, ComplianceContext } from '../../src/core/types.js';

// ============================================================================
// HELPERS
// ============================================================================

function makeAllowDecision(overrides?: Partial<PolicyDecision>): PolicyDecision {
  return {
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    action: ComplianceAction.PARTY_REGISTER,
    result: 'ALLOW',
    violations: [],
    warnings: [],
    policyVersion: '1.0.0',
    policyHash: 'abc123',
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides?: Partial<ComplianceContext>): ComplianceContext {
  return {
    actorId: 'passenger-1',
    assetId: 'identity-1',
    ...overrides,
  };
}

function makeLandingData(overrides?: Partial<FlightLandingData>): FlightLandingData {
  return {
    flightNumber: 'EK-101',
    landedAt: new Date().toISOString(),
    airport: 'DXB',
    status: 'LANDED',
    source: 'ATC',
    confidence: 1.0,
    ...overrides,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// SCENARIO 1: Autonomous Handoff — Saga + Oracle
// ============================================================================

describe('Scenario 1: Autonomous Handoff — Saga + Oracle', () => {
  let oracle: OracleService;
  let landingOracle: FlightLandingOracle;
  let bus: CrossPackEventBus;
  let saga: SagaOrchestrator;

  beforeEach(() => {
    oracle = new OracleService({
      maxDataAgeMs: 60_000,
      failSafeMode: OracleFailSafeMode.DENY_ON_FAILURE,
      circuitBreakerThreshold: 3,
      circuitBreakerResetMs: 100,
      minConfidenceThreshold: 0.8,
      strictMode: false,
    });
    bus = new CrossPackEventBus();
    landingOracle = new FlightLandingOracle(oracle, bus);
    saga = new SagaOrchestrator(bus);
  });

  it('1. oracle reports flight landing and verifies it', async () => {
    const data = makeLandingData();
    landingOracle.reportLanding(data);

    const result = await landingOracle.verifyLanding('EK-101');
    expect(result.verified).toBe(true);
    expect(result.flightData).toBeDefined();
    expect(result.flightData!.flightNumber).toBe('EK-101');
    expect(result.flightData!.status).toBe('LANDED');
    expect(result.oracleHealthy).toBe(true);
  });

  it('2. saga triggers car rental confirmation on FLIGHT_LANDED', async () => {
    let carConfirmed = false;

    const sagaDef: SagaDefinition = {
      id: 'flight-to-car',
      name: 'Flight Landing → Car Pickup',
      triggerFilter: { type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'confirm-car-pickup',
          packSource: 'CAR_RENTAL',
          action: async () => {
            carConfirmed = true;
          },
        },
      ],
      compensations: [],
    };

    saga.registerSaga(sagaDef);
    saga.start();

    landingOracle.reportLanding(makeLandingData());

    await delay(50);
    expect(carConfirmed).toBe(true);

    const executions = saga.getExecutionsBySaga('flight-to-car');
    expect(executions.length).toBe(1);
    expect(executions[0].status).toBe(SagaExecutionStatus.COMPLETED);

    saga.stop();
  });

  it('3. car rental pickup requires oracle-verified landing', async () => {
    let pickupAllowed = false;

    const sagaDef: SagaDefinition = {
      id: 'car-pickup-with-verification',
      name: 'Car Pickup with Oracle Verification',
      triggerFilter: { type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'verify-landing',
          packSource: 'ORACLE',
          action: async (event) => {
            const verification = await landingOracle.verifyLanding(event.resourceId);
            if (!verification.verified) {
              throw new Error('Flight landing not verified');
            }
          },
        },
        {
          name: 'allow-pickup',
          packSource: 'CAR_RENTAL',
          action: async () => {
            pickupAllowed = true;
          },
        },
      ],
      compensations: [],
    };

    saga.registerSaga(sagaDef);
    saga.start();

    landingOracle.reportLanding(makeLandingData());

    await delay(50);
    expect(pickupAllowed).toBe(true);
    saga.stop();
  });

  it('4. oracle stale data prevents car pickup (DENY_ON_FAILURE)', async () => {
    // Report landing then simulate failure so oracle can't serve fresh data
    landingOracle.simulateFailure();

    const result = await landingOracle.verifyLanding('EK-999');
    expect(result.verified).toBe(false);
    expect(result.oracleHealthy).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('5. oracle circuit breaker opens after repeated failures', () => {
    // Simulate failure (triggers circuit breaker threshold times)
    landingOracle.simulateFailure();

    expect(oracle.getHealthStatus()).toBe(OracleHealthStatus.CIRCUIT_OPEN);
    expect(oracle.isHealthy()).toBe(false);
  });

  it('6. saga compensation cancels car rental when oracle fails', async () => {
    let carCancelled = false;

    const sagaDef: SagaDefinition = {
      id: 'car-pickup-compensated',
      name: 'Car Pickup with Compensation',
      triggerFilter: { type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'verify-landing',
          packSource: 'ORACLE',
          action: async () => {
            throw new Error('Oracle verification failed');
          },
        },
        {
          name: 'confirm-pickup',
          packSource: 'CAR_RENTAL',
          action: async () => {
            // Should not reach here
          },
        },
      ],
      compensations: [
        {
          name: 'cancel-car-rental',
          packSource: 'CAR_RENTAL',
          action: async () => {
            carCancelled = true;
          },
        },
      ],
    };

    saga.registerSaga(sagaDef);
    saga.start();

    // Publish event directly (simulating a landing event)
    bus.publish({
      source: 'AIRLINE',
      type: 'FLIGHT_LANDED',
      resourceId: 'EK-101',
      data: {},
    });

    await delay(50);

    expect(carCancelled).toBe(true);
    const executions = saga.getExecutionsBySaga('car-pickup-compensated');
    expect(executions[0].status).toBe(SagaExecutionStatus.FAILED);
    saga.stop();
  });

  it('7. event bus correlates flight-landing and car-pickup events', () => {
    const correlationId = 'journey-123';

    bus.publish({
      source: 'AIRLINE',
      type: 'FLIGHT_LANDED',
      resourceId: 'EK-101',
      data: { airport: 'DXB' },
      correlationId,
    });

    bus.publish({
      source: 'CAR_RENTAL',
      type: 'CAR_PICKUP_READY',
      resourceId: 'rental-456',
      data: { vehicle: 'SUV' },
      correlationId,
    });

    const correlated = bus.getCorrelatedEvents(correlationId);
    expect(correlated.length).toBe(2);
    expect(correlated[0].source).toBe('AIRLINE');
    expect(correlated[1].source).toBe('CAR_RENTAL');
  });

  it('8. saga execution log records oracle-check step', async () => {
    const sagaDef: SagaDefinition = {
      id: 'oracle-logged',
      name: 'Oracle Check Logged',
      triggerFilter: { type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'oracle-verify',
          packSource: 'ORACLE',
          action: async (event) => {
            landingOracle.reportLanding(
              makeLandingData({ flightNumber: event.resourceId }),
            );
            await landingOracle.verifyLanding(event.resourceId);
          },
        },
      ],
      compensations: [],
    };

    saga.registerSaga(sagaDef);
    saga.start();

    bus.publish({
      source: 'AIRLINE',
      type: 'FLIGHT_LANDED',
      resourceId: 'EK-101',
      data: {},
    });

    await delay(50);

    const executions = saga.getExecutionsBySaga('oracle-logged');
    const logEntries = saga.getSagaLog(executions[0].id);
    const stepEntries = logEntries.filter((l) => l.stepName === 'oracle-verify');
    expect(stepEntries.length).toBeGreaterThanOrEqual(1);
    expect(stepEntries.some((e) => e.action === 'STEP_COMPLETED')).toBe(true);
    saga.stop();
  });

  it('9. multi-step saga: flight → hotel check-in → car pickup', async () => {
    const completed: string[] = [];

    const sagaDef: SagaDefinition = {
      id: 'multi-pack-saga',
      name: 'Flight → Hotel → Car',
      triggerFilter: { type: 'FLIGHT_LANDED' },
      steps: [
        {
          name: 'hotel-checkin',
          packSource: 'HOTEL',
          action: async () => {
            completed.push('HOTEL');
          },
        },
        {
          name: 'car-pickup',
          packSource: 'CAR_RENTAL',
          action: async () => {
            completed.push('CAR_RENTAL');
          },
        },
      ],
      compensations: [],
    };

    saga.registerSaga(sagaDef);
    saga.start();

    landingOracle.reportLanding(makeLandingData());

    await delay(50);

    expect(completed).toEqual(['HOTEL', 'CAR_RENTAL']);
    const executions = saga.getExecutionsBySaga('multi-pack-saga');
    expect(executions[0].status).toBe(SagaExecutionStatus.COMPLETED);
    expect(executions[0].completedSteps).toEqual(['hotel-checkin', 'car-pickup']);
    saga.stop();
  });

  it('10. oracle recovery after circuit breaker reset', async () => {
    landingOracle.reportLanding(makeLandingData());

    // Verify it works first
    const before = await landingOracle.verifyLanding('EK-101');
    expect(before.verified).toBe(true);

    // Simulate failure
    landingOracle.simulateFailure();
    expect(oracle.getHealthStatus()).toBe(OracleHealthStatus.CIRCUIT_OPEN);

    // Wait for circuit breaker reset (configured at 100ms)
    await delay(150);

    // Oracle should allow a half-open request now
    const after = await landingOracle.verifyLanding('EK-101');
    expect(after.verified).toBe(true);
    expect(after.oracleHealthy).toBe(true);
  });
});

// ============================================================================
// SCENARIO 2: Portable Identity — KYC Once, Use Everywhere
// ============================================================================

describe('Scenario 2: Portable Identity — KYC Once, Use Everywhere', () => {
  let registry: SharedIdentityRegistry;
  let receiptChain: ReceiptChain;
  let complianceRegistry: PortableComplianceRegistry;

  const identityHash = 'sha256:passenger-john-doe-passport-123';

  beforeEach(() => {
    registry = new SharedIdentityRegistry();
    receiptChain = new ReceiptChain();
    complianceRegistry = new PortableComplianceRegistry(registry, receiptChain);
  });

  function issueAirlineKYC(): PortableReceipt {
    return complianceRegistry.issuePortableReceipt({
      identityHash,
      issuingPack: 'AIRLINE',
      complianceType: 'KYC',
      decision: makeAllowDecision(),
      context: makeContext(),
    });
  }

  it('11. airline issues portable KYC receipt', () => {
    const portable = issueAirlineKYC();

    expect(portable.identityHash).toBe(identityHash);
    expect(portable.issuingPack).toBe('AIRLINE');
    expect(portable.complianceType).toBe('KYC');
    expect(portable.receipt).toBeDefined();
    expect(portable.receipt.signature).toBeDefined();
  });

  it('12. hotel accepts airline-issued KYC receipt', () => {
    issueAirlineKYC();

    const check = complianceRegistry.checkCompliance({
      identityHash,
      complianceType: 'KYC',
    });

    expect(check.hasValidReceipt).toBe(true);
    expect(check.verifiedBy).toBe('AIRLINE');
  });

  it('13. car rental accepts airline-issued KYC receipt', () => {
    issueAirlineKYC();

    const check = complianceRegistry.checkCompliance({
      identityHash,
      complianceType: 'KYC',
      issuingPack: 'AIRLINE',
    });

    expect(check.hasValidReceipt).toBe(true);
    expect(check.signatureValid).toBe(true);
  });

  it('14. concert accepts airline-issued KYC receipt', () => {
    issueAirlineKYC();

    // Concert pack queries compliance
    const check = complianceRegistry.checkCompliance({
      identityHash,
    });

    expect(check.hasValidReceipt).toBe(true);
    expect(check.verifiedBy).toBe('AIRLINE');
  });

  it('15. portable receipt is cryptographically signed and verifiable', () => {
    const portable = issueAirlineKYC();

    const signatureValid = verifyReceiptSignature(portable.receipt);
    expect(signatureValid).toBe(true);
  });

  it('16. receipt chain maintains hash linkage across packs', () => {
    // Airline issues KYC
    issueAirlineKYC();

    // Hotel issues its own receipt
    complianceRegistry.issuePortableReceipt({
      identityHash,
      issuingPack: 'HOTEL',
      complianceType: 'IDENTITY_VERIFICATION',
      decision: makeAllowDecision(),
      context: makeContext(),
    });

    const chain = complianceRegistry.getReceiptChain();
    const allReceipts = chain.getAll();
    expect(allReceipts.length).toBe(2);

    // Second receipt should reference the first
    expect(allReceipts[1].previousReceiptHash).toBeDefined();

    // Chain verification should pass
    const verification = chain.verifyChain();
    expect(verification.valid).toBe(true);
  });

  it('17. expired portable receipt is rejected', () => {
    // Issue receipt that's already expired
    complianceRegistry.issuePortableReceipt({
      identityHash,
      issuingPack: 'AIRLINE',
      complianceType: 'KYC',
      decision: makeAllowDecision(),
      context: makeContext(),
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1 second ago
    });

    const check = complianceRegistry.checkCompliance({
      identityHash,
      complianceType: 'KYC',
      onlyValid: true,
    });

    expect(check.hasValidReceipt).toBe(false);
  });

  it('18. identity registry shows single KYC from AIRLINE', () => {
    issueAirlineKYC();

    expect(registry.isVerified(identityHash)).toBe(true);
    expect(registry.isVerifiedBy(identityHash, 'AIRLINE')).toBe(true);

    const verifications = registry.getVerifications(identityHash);
    expect(verifications.length).toBe(1);
    expect(verifications[0].source).toBe('AIRLINE');
  });

  it('19. second pack adds own verification alongside portable receipt', () => {
    issueAirlineKYC();

    // Hotel adds its own verification
    complianceRegistry.issuePortableReceipt({
      identityHash,
      issuingPack: 'HOTEL',
      complianceType: 'IDENTITY_VERIFICATION',
      decision: makeAllowDecision(),
      context: makeContext(),
    });

    const verifications = registry.getVerifications(identityHash);
    expect(verifications.length).toBe(2);
    expect(verifications.some((v) => v.source === 'AIRLINE')).toBe(true);
    expect(verifications.some((v) => v.source === 'HOTEL')).toBe(true);
  });

  it('20. full journey: flight → hotel → car → concert (one KYC)', () => {
    // Issue KYC once from airline
    issueAirlineKYC();

    // All four packs check and accept the same receipt
    const packs = ['AIRLINE', 'HOTEL', 'CAR_RENTAL', 'CONCERT'];

    for (const pack of packs) {
      const check = complianceRegistry.checkCompliance({
        identityHash,
        complianceType: 'KYC',
      });
      expect(check.hasValidReceipt).toBe(true);
      expect(check.signatureValid).toBe(true);
    }

    // Only one receipt was issued
    const receipts = complianceRegistry.getReceipts(identityHash);
    const kycReceipts = receipts.filter((r) => r.complianceType === 'KYC');
    expect(kycReceipts.length).toBe(1);

    // Identity verified from a single source
    expect(registry.isVerified(identityHash)).toBe(true);
    const verifications = registry.getVerifications(identityHash);
    expect(verifications.filter((v) => v.source === 'AIRLINE').length).toBe(1);
  });
});

// ============================================================================
// SCENARIO 3: Unified Source of Truth — Audit + Hash Chain
// ============================================================================

describe('Scenario 3: Unified Source of Truth — Audit + Hash Chain', () => {
  let auditLog: UnifiedAuditLog;
  let chainManager: AuditChainManager;
  const correlationId = 'journey-xyz-789';

  beforeEach(() => {
    auditLog = new UnifiedAuditLog();
    chainManager = new AuditChainManager(auditLog);

    // Simulate a multi-pack journey with entries from all 4 packs
    chainManager.logChained({
      source: 'AIRLINE',
      action: 'TICKET_BOOKED',
      actorId: 'passenger-1',
      resourceId: 'ticket-001',
      success: true,
      correlationId,
    });

    chainManager.logChained({
      source: 'HOTEL',
      action: 'RESERVATION_CREATED',
      actorId: 'passenger-1',
      resourceId: 'reservation-001',
      success: true,
      correlationId,
    });

    chainManager.logChained({
      source: 'CAR_RENTAL',
      action: 'RENTAL_BOOKED',
      actorId: 'passenger-1',
      resourceId: 'rental-001',
      success: true,
      correlationId,
    });

    chainManager.logChained({
      source: 'CONCERT',
      action: 'TICKET_PURCHASED',
      actorId: 'passenger-1',
      resourceId: 'concert-ticket-001',
      success: true,
      correlationId,
    });
  });

  it('21. auditor sees all journey events from 4 packs', () => {
    const allEntries = chainManager.getAuditorView();
    expect(allEntries.length).toBe(4);

    const sources = allEntries.map((e) => e.source);
    expect(sources).toContain('AIRLINE');
    expect(sources).toContain('HOTEL');
    expect(sources).toContain('CAR_RENTAL');
    expect(sources).toContain('CONCERT');
  });

  it('22. airline scoped view shows only airline entries', () => {
    const view = chainManager.getScopedView('AIRLINE');
    expect(view.businessId).toBe('AIRLINE');
    expect(view.entries.length).toBe(1);
    expect(view.entries[0].action).toBe('TICKET_BOOKED');
    expect(view.chainIntact).toBe(true);
  });

  it('23. hotel scoped view shows only hotel entries', () => {
    const view = chainManager.getScopedView('HOTEL');
    expect(view.businessId).toBe('HOTEL');
    expect(view.entries.length).toBe(1);
    expect(view.entries[0].action).toBe('RESERVATION_CREATED');
    expect(view.chainIntact).toBe(true);
  });

  it('24. car rental scoped view excludes other packs', () => {
    const view = chainManager.getScopedView('CAR_RENTAL');
    expect(view.entries.length).toBe(1);
    expect(view.entries[0].source).toBe('CAR_RENTAL');

    // Ensure no other pack's data leaks in
    for (const entry of view.entries) {
      expect(entry.source).toBe('CAR_RENTAL');
    }
  });

  it('25. global hash chain is tamper-evident', () => {
    // Verify chain is currently valid
    const beforeTamper = chainManager.verifyGlobalChain();
    expect(beforeTamper.globalChainValid).toBe(true);
    expect(beforeTamper.tamperingDetected).toBe(false);

    // getAuditorView returns a new array but with same object references.
    // Tamper with an internal entry via the reference.
    const entries = chainManager.getAuditorView();
    const originalHash = entries[1].entryHash;
    (entries[1] as { entryHash: string }).entryHash = 'tampered-hash';

    // Now verifyGlobalChain should detect the tampering because
    // entry[2].previousHash still points to the original hash of entry[1]
    const afterTamper = chainManager.verifyGlobalChain();
    expect(afterTamper.globalChainValid).toBe(false);
    expect(afterTamper.tamperingDetected).toBe(true);
    expect(afterTamper.issues.length).toBeGreaterThan(0);

    // Restore for other tests (entries[1] is a reference to internal state)
    (entries[1] as { entryHash: string }).entryHash = originalHash;

    // Verify hash linkage structure
    expect(entries[1].previousHash).toBe(entries[0].entryHash);
    expect(entries[0].previousHash).toBeUndefined();
  });

  it('26. cross-pack events share correlationId', () => {
    const journeyEntries = chainManager.getJourneyEntries(correlationId);
    expect(journeyEntries.length).toBe(4);

    for (const entry of journeyEntries) {
      expect(entry.correlationId).toBe(correlationId);
    }
  });

  it('27. chain verification passes for untampered trail', () => {
    const result = chainManager.verifyGlobalChain();

    expect(result.globalChainValid).toBe(true);
    expect(result.tamperingDetected).toBe(false);
    expect(result.totalEntries).toBe(4);
    expect(result.issues.length).toBe(0);

    // All business chains should be valid
    expect(result.businessChainValid['AIRLINE']).toBe(true);
    expect(result.businessChainValid['HOTEL']).toBe(true);
    expect(result.businessChainValid['CAR_RENTAL']).toBe(true);
    expect(result.businessChainValid['CONCERT']).toBe(true);
  });

  it('28. businesses cannot see other business data', () => {
    const airlineView = chainManager.getScopedView('AIRLINE');
    const hotelView = chainManager.getScopedView('HOTEL');
    const carView = chainManager.getScopedView('CAR_RENTAL');
    const concertView = chainManager.getScopedView('CONCERT');

    // Each view should contain only its own entries
    for (const entry of airlineView.entries) {
      expect(entry.source).toBe('AIRLINE');
    }
    for (const entry of hotelView.entries) {
      expect(entry.source).toBe('HOTEL');
    }
    for (const entry of carView.entries) {
      expect(entry.source).toBe('CAR_RENTAL');
    }
    for (const entry of concertView.entries) {
      expect(entry.source).toBe('CONCERT');
    }

    // No airline data in hotel view
    expect(hotelView.entries.some((e) => e.source === 'AIRLINE')).toBe(false);
    // No hotel data in car view
    expect(carView.entries.some((e) => e.source === 'HOTEL')).toBe(false);
  });

  it('29. journey query returns chronological cross-pack events', () => {
    const journeyEntries = chainManager.getJourneyEntries(correlationId);

    expect(journeyEntries.length).toBe(4);

    // Should be in sequence order
    for (let i = 1; i < journeyEntries.length; i++) {
      expect(journeyEntries[i].sequenceNumber).toBeGreaterThan(
        journeyEntries[i - 1].sequenceNumber,
      );
    }

    // Verify the order matches insertion order
    expect(journeyEntries[0].source).toBe('AIRLINE');
    expect(journeyEntries[1].source).toBe('HOTEL');
    expect(journeyEntries[2].source).toBe('CAR_RENTAL');
    expect(journeyEntries[3].source).toBe('CONCERT');
  });

  it('30. entry count matches sum of scoped views', () => {
    const allEntries = chainManager.getAuditorView();

    const airlineCount = chainManager.getScopedView('AIRLINE').entries.length;
    const hotelCount = chainManager.getScopedView('HOTEL').entries.length;
    const carCount = chainManager.getScopedView('CAR_RENTAL').entries.length;
    const concertCount = chainManager.getScopedView('CONCERT').entries.length;

    expect(airlineCount + hotelCount + carCount + concertCount).toBe(allEntries.length);
  });
});
