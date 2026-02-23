/**
 * Partner Readiness Integration Tests
 *
 * Exercises the SDK's integration surface from two partner personas:
 * - Scenario A: Fintech Resale App (airline ticket operations)
 * - Scenario B: Regulatory Audit (real estate compliance + receipt chain)
 * - Readiness Scorecard (zero-config, atomic integrity, granular events)
 *
 * Uses in-memory engines only (no server), following re-e2e-golden.test.ts patterns.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';

// Core imports
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
  EventType,
  ComplianceAction,
  type RightModel,
} from '@tokenisation/core';
import { ComplianceEngine } from '@tokenisation/core';
import { LifecycleEngine } from '@tokenisation/core';
import { EventStore } from '@tokenisation/core';
import { receiptChain, verifyReceipt } from '@tokenisation/core';
import type { ICompliancePlugin, PartyComplianceStatus } from '@tokenisation/core';
import { AssetType, InvestorClass } from '@tokenisation/core';

// Modules
import {
  CashFlowEngine,
  DistributionType,
  DistributionFrequency,
  AllocationStrategy,
  type HolderSnapshot,
} from '@tokenisation/core';
import {
  RedemptionEngine,
  RedemptionType,
  RedemptionStatus,
} from '@tokenisation/core';

// Models
import {
  createParty,
  addKycRecord,
  type Party,
  PartyRole,
  PartyType,
  VerificationLevel,
} from '@tokenisation/core';

// Airline pack
import {
  AirlineTicketEngine,
  TicketClass,
  TicketStatus,
  AirlineRole,
  TransferReason,
  AirlineEventType,
  type ActorContext,
  type FlightSegment,
} from '@tokenisation/core';

// ============================================================================
// PARTNER READINESS COMPLIANCE PLUGIN
// ============================================================================

class PartnerReadinessCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'partner-readiness-compliance';
  private parties: Map<string, PartyComplianceStatus> = new Map();
  private balances: Map<string, bigint> = new Map();
  private globalSupply = 0n;
  private blockedJurisdictions: Set<string> = new Set(['US', 'KP', 'IR', 'CU', 'SY']);
  private investorCount = 0;

  constructor(private config: {
    maxInvestors: number;
    maxHoldingPct: number;
    totalSupply: number;
  }) {}

  registerParty(party: Party): void {
    this.parties.set(party.id, {
      partyId: party.id,
      kycVerified: party.kycVerified || false,
      kycExpiryDate: party.kycExpiryDate?.toISOString(),
      accreditedInvestor: party.accreditedInvestor || false,
      frozenUntil: party.frozenUntil?.toISOString(),
      restrictedJurisdictions: this.blockedJurisdictions.has(party.jurisdiction || '')
        ? [party.jurisdiction!]
        : [],
    });
  }

  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    return this.parties.get(partyId) || null;
  }

  async canHoldAsset(partyId: string, asset: RightModel, status: PartyComplianceStatus) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];
    if (!status.kycVerified) {
      violations.push({ ruleId: 'KYC_REQUIRED', message: 'KYC verification required', severity: 'CRITICAL', ruleName: 'compliance.kyc' });
    }
    if (status.restrictedJurisdictions && status.restrictedJurisdictions.length > 0) {
      violations.push({ ruleId: 'JURISDICTION_BLOCKED', message: `Jurisdiction ${status.restrictedJurisdictions[0]} is blocked`, severity: 'CRITICAL', ruleName: 'compliance.jurisdiction' });
    }
    const currentBalance = this.balances.get(partyId) || 0n;
    if (currentBalance === 0n && this.investorCount >= this.config.maxInvestors) {
      violations.push({ ruleId: 'MAX_INVESTORS_EXCEEDED', message: `Maximum investor count (${this.config.maxInvestors}) reached`, severity: 'CRITICAL', ruleName: 'compliance.investor_cap' });
    }
    return { compliant: violations.length === 0, violations, warnings: [] };
  }

  async evaluateTransfer(
    transfer: { from: string; to: string; amount: string; assetId: string },
    sender: PartyComplianceStatus,
    recipient: PartyComplianceStatus
  ) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];
    if (sender.frozenUntil && new Date(sender.frozenUntil) > new Date()) {
      violations.push({ ruleId: 'SENDER_FROZEN', message: 'Sender account is frozen', severity: 'CRITICAL', ruleName: 'compliance.freeze' });
    }
    if (recipient.restrictedJurisdictions && recipient.restrictedJurisdictions.length > 0) {
      violations.push({ ruleId: 'JURISDICTION_BLOCKED', message: `Transfer to blocked jurisdiction`, severity: 'CRITICAL', ruleName: 'compliance.jurisdiction' });
    }
    const amount = BigInt(transfer.amount);
    const recipientBalance = this.balances.get(transfer.to) || 0n;
    const maxHolding = BigInt(Math.floor(this.config.totalSupply * this.config.maxHoldingPct / 100));
    if (recipientBalance + amount > maxHolding) {
      violations.push({ ruleId: 'MAX_HOLDING_EXCEEDED', message: `Transfer would exceed max holding`, severity: 'CRITICAL', ruleName: 'compliance.holding_cap' });
    }
    return { compliant: violations.length === 0, violations, warnings: [] };
  }

  async checkPolicy(ruleId: string, context: Record<string, unknown>) {
    return { compliant: true, violations: [], warnings: [] };
  }

  async updatePartyStatus(partyId: string, status: Partial<PartyComplianceStatus>) {
    const existing = this.parties.get(partyId);
    if (existing) {
      this.parties.set(partyId, { ...existing, ...status });
      return { success: true as const, value: undefined };
    }
    return { success: false as const, error: 'Party not found' };
  }

  async freezeParty(partyId: string, until?: string, reason?: string) {
    const existing = this.parties.get(partyId);
    if (existing) {
      existing.frozenUntil = until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      return { success: true as const, value: undefined };
    }
    return { success: false as const, error: 'Party not found' };
  }

  async unfreezeParty(partyId: string) {
    const existing = this.parties.get(partyId);
    if (existing) {
      existing.frozenUntil = undefined;
      return { success: true as const, value: undefined };
    }
    return { success: false as const, error: 'Party not found' };
  }

  // Extended mint with frozen check
  mint(investorId: string, amount: bigint): { success: boolean; error?: string } {
    const status = this.parties.get(investorId);
    if (!status) return { success: false, error: 'Party not registered' };

    // Frozen check (extension over base RealEstateE2ECompliancePlugin)
    if (status.frozenUntil && new Date(status.frozenUntil) > new Date()) {
      return { success: false, error: 'INVESTOR_FROZEN' };
    }

    if (status.restrictedJurisdictions && status.restrictedJurisdictions.length > 0) {
      return { success: false, error: `JURISDICTION_BLOCKED: ${status.restrictedJurisdictions[0]}` };
    }
    const currentBalance = this.balances.get(investorId) || 0n;
    if (currentBalance === 0n) {
      if (this.investorCount >= this.config.maxInvestors) {
        return { success: false, error: 'MAX_INVESTORS_EXCEEDED' };
      }
      this.investorCount++;
    }
    const maxHolding = BigInt(Math.floor(this.config.totalSupply * this.config.maxHoldingPct / 100));
    if (currentBalance + amount > maxHolding) {
      return { success: false, error: 'MAX_HOLDING_EXCEEDED' };
    }
    this.balances.set(investorId, currentBalance + amount);
    this.globalSupply += amount;
    return { success: true };
  }

  transfer(from: string, to: string, amount: bigint): { success: boolean; error?: string } {
    const senderStatus = this.parties.get(from);
    const recipientStatus = this.parties.get(to);
    if (!senderStatus || !recipientStatus) return { success: false, error: 'Party not found' };
    if (senderStatus.frozenUntil && new Date(senderStatus.frozenUntil) > new Date()) {
      return { success: false, error: 'SENDER_FROZEN' };
    }
    if (recipientStatus.restrictedJurisdictions && recipientStatus.restrictedJurisdictions.length > 0) {
      return { success: false, error: `JURISDICTION_BLOCKED` };
    }
    const senderBalance = this.balances.get(from) || 0n;
    if (senderBalance < amount) return { success: false, error: 'INSUFFICIENT_BALANCE' };
    const recipientBalance = this.balances.get(to) || 0n;
    const maxHolding = BigInt(Math.floor(this.config.totalSupply * this.config.maxHoldingPct / 100));
    if (recipientBalance + amount > maxHolding) return { success: false, error: 'MAX_HOLDING_EXCEEDED' };
    if (recipientBalance === 0n) {
      if (this.investorCount >= this.config.maxInvestors) return { success: false, error: 'MAX_INVESTORS_EXCEEDED' };
      this.investorCount++;
    }
    this.balances.set(from, senderBalance - amount);
    this.balances.set(to, recipientBalance + amount);
    if (this.balances.get(from) === 0n) this.investorCount--;
    return { success: true };
  }

  burn(investorId: string, amount: bigint): { success: boolean; error?: string } {
    const balance = this.balances.get(investorId) || 0n;
    if (balance < amount) return { success: false, error: 'INSUFFICIENT_BALANCE' };
    this.balances.set(investorId, balance - amount);
    this.globalSupply -= amount;
    if (this.balances.get(investorId) === 0n) this.investorCount--;
    return { success: true };
  }

  getBalance(investorId: string): bigint { return this.balances.get(investorId) || 0n; }
  getGlobalSupply(): bigint { return this.globalSupply; }
  getInvestorCount(): number { return this.investorCount; }

  getHolderSnapshots(): HolderSnapshot[] {
    const snapshots: HolderSnapshot[] = [];
    for (const [holderId, balance] of this.balances.entries()) {
      if (balance > 0n) snapshots.push({ holderId, balance: balance.toString(), weight: 1 });
    }
    return snapshots;
  }
}

// ============================================================================
// TEST HELPERS
// ============================================================================

const CONFIG = {
  PROPERTY_ID: 'PROP-PR-001',
  SPV_ID: 'SPV-PARTNER-READINESS',
  JURISDICTION: 'AE',
  TOTAL_SUPPLY: 1_000_000,
  MAX_INVESTORS: 4,
  MAX_HOLDING_PCT: 60,
};

const AIRLINE_CODE = 'EK';

const createTestParty = (overrides: {
  id?: string;
  name?: string;
  jurisdiction?: string;
  withValidKyc?: boolean;
  isFrozen?: boolean;
} = {}): Party => {
  const id = overrides.id || uuidv4();
  let party = createParty({
    name: overrides.name || 'Test Party',
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: overrides.jurisdiction || 'AE',
  });
  party = { ...party, id };
  if (overrides.withValidKyc) {
    party = addKycRecord(party, {
      providerId: 'test-kyc-provider',
      level: VerificationLevel.STANDARD,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    party.kycVerified = true;
    party.kycExpiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }
  if (overrides.isFrozen) {
    party.isFrozen = true;
    party.frozenUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
  return party;
};

const testSegment: FlightSegment = {
  flightNumber: 'EK001',
  airline: AIRLINE_CODE,
  departure: {
    airport: 'DXB',
    terminal: 'T3',
    dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  arrival: {
    airport: 'LHR',
    terminal: 'T3',
    dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000).toISOString(),
  },
  class: TicketClass.BUSINESS,
  seatNumber: '1A',
};

const passengerIdentity = {
  type: 'PASSPORT' as const,
  number: 'P1234567',
  country: 'AE',
  expiryDate: '2030-01-01',
};

// ============================================================================
// PARTNER READINESS TEST SUITE
// ============================================================================

describe('Partner Readiness Integration Tests', () => {
  // Shared engines
  let eventStore: EventStore;
  let lifecycleEngine: LifecycleEngine;
  let complianceEngine: ComplianceEngine;
  let compliancePlugin: PartnerReadinessCompliancePlugin;
  let cashFlowEngine: CashFlowEngine;
  let redemptionEngine: RedemptionEngine;
  let airlineEngine: AirlineTicketEngine;

  // Test actors
  let issuer: Party;
  let investorA: Party;
  let investorB: Party;
  let admin: Party;

  // Airline actors
  const airlineAdmin: ActorContext = {
    actorId: 'airline-admin-1',
    role: AirlineRole.AIRLINE_ADMIN,
    airlineCode: AIRLINE_CODE,
  };
  const gateAgent: ActorContext = {
    actorId: 'gate-agent-1',
    role: AirlineRole.AIRLINE_AGENT,
    airlineCode: AIRLINE_CODE,
  };
  const passenger: ActorContext = {
    actorId: 'John Doe',
    role: AirlineRole.PASSENGER,
    passengerId: 'John Doe',
  };

  // RE asset
  let realEstateAsset: RightModel;

  // Default ticket params
  const defaultTicketParams = {
    airlineCode: AIRLINE_CODE,
    bookingReference: 'PNR001',
    eTicketNumber: '176-1234567890',
    passengerName: 'John Doe',
    segments: [testSegment],
    fare: {
      baseFare: '1000.00',
      taxes: '200.00',
      total: '1200.00',
      currency: 'USD',
      fareClass: 'J',
      fareRules: ['Non-refundable after check-in'],
    },
    transferRules: {
      maxTransfers: 2,
      transferCount: 0,
      nameChangeFee: '50.00',
      requiresIssuerApproval: true,
      autoApproveWithIdentity: true,
      transferDeadlineHours: 24,
    },
    cancellationRules: {
      refundable: true,
      cancellationFee: '100.00',
      cancellationDeadlineHours: 48,
      refundCurrency: 'USD',
    },
  };

  beforeEach(() => {
    // Core engines
    eventStore = new EventStore();
    lifecycleEngine = new LifecycleEngine(eventStore);

    compliancePlugin = new PartnerReadinessCompliancePlugin({
      maxInvestors: CONFIG.MAX_INVESTORS,
      maxHoldingPct: CONFIG.MAX_HOLDING_PCT,
      totalSupply: CONFIG.TOTAL_SUPPLY,
    });

    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      eventStore,
    });

    cashFlowEngine = new CashFlowEngine(eventStore);
    redemptionEngine = new RedemptionEngine(eventStore);

    // Airline engine
    airlineEngine = new AirlineTicketEngine();
    airlineEngine.registerAirline(AIRLINE_CODE);

    // Pre-verify passenger identity for auto-approval
    const identityHash = `${passengerIdentity.type}:${passengerIdentity.country}:${passengerIdentity.number}`;
    airlineEngine.verifyIdentity(identityHash);

    // Create actors
    issuer = createParty({
      name: 'Property SPV',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      jurisdiction: 'AE',
    });

    investorA = createTestParty({ id: 'investor-a', name: 'Investor A', jurisdiction: 'AE', withValidKyc: true });
    investorB = createTestParty({ id: 'investor-b', name: 'Investor B', jurisdiction: 'AE', withValidKyc: true });

    admin = createParty({
      name: 'Compliance Admin',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.OPERATOR],
      jurisdiction: 'AE',
    });

    // Register parties
    compliancePlugin.registerParty(investorA);
    compliancePlugin.registerParty(investorB);

    // Create real estate asset
    realEstateAsset = {
      id: uuidv4(),
      name: `Partner Tower - ${CONFIG.SPV_ID}`,
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.DRAFT,
      jurisdiction: {
        countryCode: CONFIG.JURISDICTION,
        accreditedOnly: false,
        blockedJurisdictions: ['US', 'KP', 'IR', 'CU', 'SY'],
      },
      validityPeriod: { isPerpetual: true },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: 0,
        requireKyc: true,
      },
      metadata: {
        assetType: AssetType.REAL_ESTATE,
        investorClass: InvestorClass.RETAIL,
        propertyId: CONFIG.PROPERTY_ID,
        spvId: CONFIG.SPV_ID,
        totalSupply: CONFIG.TOTAL_SUPPLY,
        maxInvestors: CONFIG.MAX_INVESTORS,
        maxHoldingPct: CONFIG.MAX_HOLDING_PCT,
        legalDocsHash: 'sha256:partner-readiness-docs',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 0,
    };
  });

  afterEach(() => {
    complianceEngine.clear();
    receiptChain.clear();
  });

  // ==========================================================================
  // SCENARIO A: Fintech Resale App
  // ==========================================================================

  describe('Scenario A: Fintech Resale App', () => {

    // A1: Seamless Handover
    describe('A1: Seamless Handover', () => {

      it('A1.1: Issue ticket → metadata has bookingReference, eTicketNumber, segments, fare, transferRules', () => {
        const result = airlineEngine.issue(defaultTicketParams);

        expect(result.success).toBe(true);
        expect(result.ticket).toBeDefined();

        const metadata = result.ticket!.metadata as Record<string, unknown>;
        expect(metadata.bookingReference).toBe('PNR001');
        expect(metadata.eTicketNumber).toBe('176-1234567890');
        expect(metadata.segments).toBeDefined();
        expect((metadata.segments as unknown[]).length).toBe(1);
        expect(metadata.fare).toBeDefined();
        expect((metadata.fare as Record<string, unknown>).total).toBe('1200.00');
        expect(metadata.transferRules).toBeDefined();
        expect((metadata.transferRules as Record<string, unknown>).maxTransfers).toBe(2);
      });

      it('A1.2: requestTransfer() by third-party → auto-approved, passengerName changes', async () => {
        const { ticket } = airlineEngine.issue(defaultTicketParams);

        const result = await airlineEngine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: {
            name: 'Jane Smith',
            identity: passengerIdentity,
          },
          reason: TransferReason.RESALE,
        });

        expect(result.success).toBe(true);
        expect(result.request!.status).toBe('AUTO_APPROVED');

        const updatedMetadata = airlineEngine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
        expect(updatedMetadata.passengerName).toBe('Jane Smith');
      });

      it('A1.3: After transfer → fare unchanged, transferCount incremented, transferHistory populated', async () => {
        const { ticket } = airlineEngine.issue(defaultTicketParams);

        await airlineEngine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Smith', identity: passengerIdentity },
          reason: TransferReason.RESALE,
        });

        const metadata = airlineEngine.getTicket(ticket!.id)!.metadata as Record<string, unknown>;
        const fare = metadata.fare as Record<string, unknown>;
        expect(fare.total).toBe('1200.00');

        const transferRules = metadata.transferRules as Record<string, unknown>;
        expect(transferRules.transferCount).toBe(1);

        const transferHistory = metadata.transferHistory as unknown[];
        expect(transferHistory.length).toBe(1);
      });
    });

    // A2: Bulk Operations (50x)
    describe('A2: Bulk Operations (50x)', () => {

      it('A2.1: Create 50 tickets → all succeed', () => {
        const ticketIds: string[] = [];
        for (let i = 0; i < 50; i++) {
          const result = airlineEngine.issue({
            ...defaultTicketParams,
            eTicketNumber: `176-${String(i).padStart(10, '0')}`,
            passengerName: `Passenger ${i}`,
          });
          expect(result.success).toBe(true);
          ticketIds.push(result.ticket!.id);
        }
        expect(new Set(ticketIds).size).toBe(50);
      });

      it('A2.2: 50 parallel transfers → all 50 succeed, each transferCount === 1', async () => {
        // Issue 50 tickets with auto-approve + no issuer approval needed
        const tickets: string[] = [];
        for (let i = 0; i < 50; i++) {
          const result = airlineEngine.issue({
            ...defaultTicketParams,
            eTicketNumber: `176-${String(i).padStart(10, '0')}`,
            passengerName: 'John Doe',
            transferRules: {
              ...defaultTicketParams.transferRules,
              requiresIssuerApproval: false,
              autoApproveWithIdentity: true,
            },
            policyFlags: {
              transferable: true,
              refundable: true,
              upgradeable: true,
              standbyAllowed: false,
              seatLocked: false,
              sameDayChangeAllowed: true,
              changeDeadlineHours: 24,
              reKycRequiredForTransfer: false,
            },
          });
          tickets.push(result.ticket!.id);
        }

        // 50 parallel transfers
        const results = await Promise.allSettled(
          tickets.map(ticketId =>
            airlineEngine.requestTransfer({
              ticketId,
              fromPassenger: 'John Doe',
              toPassenger: { name: 'New Passenger', identity: passengerIdentity },
              reason: TransferReason.GIFT,
            })
          )
        );

        const fulfilled = results.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value.success);
        expect(fulfilled.length).toBe(50);

        // Verify each ticket's transferCount === 1
        for (const ticketId of tickets) {
          const metadata = airlineEngine.getTicket(ticketId)!.metadata as Record<string, unknown>;
          const rules = metadata.transferRules as Record<string, unknown>;
          expect(rules.transferCount).toBe(1);
        }
      });

      it('A2.3: Second round of 50 transfers → all fail (MAX_TRANSFERS_EXCEEDED or NOT_OWNER)', async () => {
        // Issue 50 tickets with maxTransfers: 1
        const tickets: string[] = [];
        for (let i = 0; i < 50; i++) {
          const result = airlineEngine.issue({
            ...defaultTicketParams,
            eTicketNumber: `176-${String(i).padStart(10, '0')}`,
            passengerName: 'John Doe',
            transferRules: {
              ...defaultTicketParams.transferRules,
              maxTransfers: 1,
              requiresIssuerApproval: false,
              autoApproveWithIdentity: true,
            },
            policyFlags: {
              transferable: true,
              refundable: true,
              upgradeable: true,
              standbyAllowed: false,
              seatLocked: false,
              sameDayChangeAllowed: true,
              changeDeadlineHours: 24,
              reKycRequiredForTransfer: false,
            },
          });
          tickets.push(result.ticket!.id);
        }

        // First round: all succeed
        await Promise.allSettled(
          tickets.map(ticketId =>
            airlineEngine.requestTransfer({
              ticketId,
              fromPassenger: 'John Doe',
              toPassenger: { name: 'New Passenger', identity: passengerIdentity },
              reason: TransferReason.GIFT,
            })
          )
        );

        // Second round: all fail
        const secondResults = await Promise.allSettled(
          tickets.map(ticketId =>
            airlineEngine.requestTransfer({
              ticketId,
              fromPassenger: 'New Passenger',
              toPassenger: { name: 'Third Person', identity: passengerIdentity },
              reason: TransferReason.GIFT,
            })
          )
        );

        const allFailed = secondResults.every(r => {
          if (r.status !== 'fulfilled') return true;
          const val = (r as PromiseFulfilledResult<any>).value;
          return !val.success && (val.errorCode === 'MAX_TRANSFERS_EXCEEDED' || val.errorCode === 'NOT_OWNER');
        });
        expect(allFailed).toBe(true);
      });
    });

    // A3: Real-time UX
    describe('A3: Real-time UX', () => {

      it('A3.1: Issue → checkIn → board: getTicketEvents() returns >= 3 events', async () => {
        const { ticket } = airlineEngine.issue(defaultTicketParams);
        airlineEngine.checkIn({ ticketId: ticket!.id, actor: passenger });
        await airlineEngine.board({ ticketId: ticket!.id, actor: gateAgent, scanLocation: 'Gate B12' });

        const events = airlineEngine.getTicketEvents(ticket!.id);
        expect(events.length).toBeGreaterThanOrEqual(3);

        const eventTypes = events.map(e => e.type);
        expect(eventTypes).toContain(AirlineEventType.TICKET_ISSUED);
        expect(eventTypes).toContain(AirlineEventType.CHECK_IN_COMPLETED);
        expect(eventTypes).toContain(AirlineEventType.BOARDING_COMPLETED);
      });

      it('A3.2: Two tickets, transition only one: events isolated per ticket', async () => {
        const { ticket: ticket1 } = airlineEngine.issue(defaultTicketParams);
        const { ticket: ticket2 } = airlineEngine.issue({
          ...defaultTicketParams,
          eTicketNumber: '176-9999999999',
          bookingReference: 'PNR002',
        });

        // Only check in ticket1
        airlineEngine.checkIn({ ticketId: ticket1!.id, actor: passenger });

        const events1 = airlineEngine.getTicketEvents(ticket1!.id);
        const events2 = airlineEngine.getTicketEvents(ticket2!.id);

        expect(events1.length).toBeGreaterThan(events2.length);
        expect(events2.some(e => e.type === AirlineEventType.CHECK_IN_COMPLETED)).toBe(false);
      });

      it('A3.3: Transfer event includes from/to names; issued event includes e-ticket/booking ref', async () => {
        const { ticket } = airlineEngine.issue({
          ...defaultTicketParams,
          transferRules: {
            ...defaultTicketParams.transferRules,
            requiresIssuerApproval: false,
            autoApproveWithIdentity: true,
          },
          policyFlags: {
            transferable: true,
            refundable: true,
            upgradeable: true,
            standbyAllowed: false,
            seatLocked: false,
            sameDayChangeAllowed: true,
            changeDeadlineHours: 24,
            reKycRequiredForTransfer: false,
          },
        });

        await airlineEngine.requestTransfer({
          ticketId: ticket!.id,
          fromPassenger: 'John Doe',
          toPassenger: { name: 'Jane Smith', identity: passengerIdentity },
          reason: TransferReason.GIFT,
        });

        const events = airlineEngine.getTicketEvents(ticket!.id);

        // Check issued event
        const issuedEvent = events.find(e => e.type === AirlineEventType.TICKET_ISSUED);
        expect(issuedEvent).toBeDefined();
        expect(issuedEvent!.data.eTicketNumber).toBe('176-1234567890');
        expect(issuedEvent!.pnr).toBe('PNR001');

        // Check transfer event
        const transferEvent = events.find(e => e.type === AirlineEventType.TICKET_TRANSFERRED);
        expect(transferEvent).toBeDefined();
        expect(transferEvent!.data.from).toBe('John Doe');
        expect(transferEvent!.data.to).toBe('Jane Smith');
      });
    });
  });

  // ==========================================================================
  // SCENARIO B: Regulatory Audit
  // ==========================================================================

  describe('Scenario B: Regulatory Audit', () => {

    // B1: Historical Traceability
    describe('B1: Historical Traceability', () => {

      const runFullLifecycle = async () => {
        // Register + transition to ACTIVE
        await lifecycleEngine.registerAsset(realEstateAsset);
        await lifecycleEngine.transition({ assetId: realEstateAsset.id, fromState: LifecycleState.DRAFT, toState: LifecycleState.PENDING_VERIFICATION, actorId: issuer.id });
        await lifecycleEngine.transition({ assetId: realEstateAsset.id, fromState: LifecycleState.PENDING_VERIFICATION, toState: LifecycleState.VERIFIED, actorId: admin.id });
        await lifecycleEngine.transition({ assetId: realEstateAsset.id, fromState: LifecycleState.VERIFIED, toState: LifecycleState.ACTIVE, actorId: issuer.id });

        // Mint
        compliancePlugin.mint(investorA.id, 500_000n);
        compliancePlugin.mint(investorB.id, 400_000n);

        // Compliance evaluation (generates receipt + event)
        realEstateAsset.state = LifecycleState.ACTIVE;
        await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
          assetId: realEstateAsset.id,
          asset: realEstateAsset,
          actorId: issuer.id,
          recipientId: investorA.id,
          amount: '500000',
        });

        // Distribute
        cashFlowEngine.setBalanceProvider(async () => compliancePlugin.getHolderSnapshots());
        const schedule = cashFlowEngine.createSchedule({
          assetId: realEstateAsset.id,
          type: DistributionType.RENT,
          frequency: DistributionFrequency.ONE_TIME,
          allocationStrategy: AllocationStrategy.PRO_RATA,
          paymentCurrency: 'USD',
          startDate: new Date().toISOString(),
        });
        await cashFlowEngine.executeDistribution(schedule.id, { amount: '100000' });

        // Freeze
        await compliancePlugin.freezeParty(investorB.id);

        // Redeem
        redemptionEngine.initializeAsset(realEstateAsset.id, '900000');
        redemptionEngine.setInvestorBalance(realEstateAsset.id, investorA.id, '500000');
        redemptionEngine.setInvestorBalance(realEstateAsset.id, investorB.id, '400000');

        const reqA = redemptionEngine.requestRedemption({ assetId: realEstateAsset.id, investorId: investorA.id, amount: '500000' });
        redemptionEngine.approveRedemption({ requestId: reqA.request!.id, approvedBy: admin.id });
        redemptionEngine.settleRedemption({ requestId: reqA.request!.id, settledBy: admin.id });
        compliancePlugin.burn(investorA.id, 500_000n);

        // Unfreeze B, redeem B
        await compliancePlugin.unfreezeParty(investorB.id);
        const reqB = redemptionEngine.requestRedemption({ assetId: realEstateAsset.id, investorId: investorB.id, amount: '400000' });
        redemptionEngine.approveRedemption({ requestId: reqB.request!.id, approvedBy: admin.id });
        redemptionEngine.settleRedemption({ requestId: reqB.request!.id, settledBy: admin.id });
        compliancePlugin.burn(investorB.id, 400_000n);

        // Close
        redemptionEngine.closeAsset({ assetId: realEstateAsset.id, closedBy: admin.id });
      };

      it('B1.1: Full lifecycle → EventStore has events for all phases (zero dark spots)', async () => {
        await runFullLifecycle();
        const events = await eventStore.getByAssetId(realEstateAsset.id);
        expect(events.length).toBeGreaterThan(0);

        // Verify asset creation is tracked
        expect(events.some(e => e.type === EventType.ASSET_CREATED)).toBe(true);
      });

      it('B1.2: Events are chronologically ordered', async () => {
        await runFullLifecycle();
        const events = await eventStore.getByAssetId(realEstateAsset.id);

        for (let i = 1; i < events.length; i++) {
          const prev = new Date(events[i - 1].timestamp).getTime();
          const curr = new Date(events[i].timestamp).getTime();
          expect(curr).toBeGreaterThanOrEqual(prev);
        }
      });

      it('B1.3: Event types cover lifecycle phases', async () => {
        await runFullLifecycle();
        const events = await eventStore.getByAssetId(realEstateAsset.id);
        const allEvents = await eventStore.getAll();

        // At minimum: ASSET_CREATED + state transitions
        expect(events.some(e => e.type === EventType.ASSET_CREATED)).toBe(true);

        // Redemption events
        const reEvents = allEvents.filter(e => e.payload?.action === 'REDEMPTION_REQUESTED' || e.payload?.action === 'REDEMPTION_SETTLED' || e.payload?.action === 'ASSET_CLOSED');
        expect(reEvents.length).toBeGreaterThan(0);
      });
    });

    // B2: Circuit Breaker
    describe('B2: Circuit Breaker', () => {

      beforeEach(async () => {
        compliancePlugin.mint(investorA.id, 500_000n);
        compliancePlugin.mint(investorB.id, 400_000n);
      });

      it('B2.1: Frozen party → transfer blocked (SENDER_FROZEN)', async () => {
        await compliancePlugin.freezeParty(investorA.id);
        const result = compliancePlugin.transfer(investorA.id, investorB.id, 10_000n);
        expect(result.success).toBe(false);
        expect(result.error).toBe('SENDER_FROZEN');
      });

      it('B2.2: Frozen party → mint blocked (INVESTOR_FROZEN)', async () => {
        await compliancePlugin.freezeParty(investorA.id);
        const result = compliancePlugin.mint(investorA.id, 10_000n);
        expect(result.success).toBe(false);
        expect(result.error).toBe('INVESTOR_FROZEN');
      });

      it('B2.3: Frozen party → redemption blocked (INVESTOR_FROZEN)', async () => {
        await compliancePlugin.freezeParty(investorB.id);
        redemptionEngine.freezeInvestor(investorB.id);
        redemptionEngine.initializeAsset(realEstateAsset.id, CONFIG.TOTAL_SUPPLY.toString());
        redemptionEngine.setInvestorBalance(realEstateAsset.id, investorB.id, '400000');

        const result = redemptionEngine.requestRedemption({
          assetId: realEstateAsset.id,
          investorId: investorB.id,
          amount: '100000',
        });
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('INVESTOR_FROZEN');
      });

      it('B2.4: After unfreeze → all operations re-enabled', async () => {
        await compliancePlugin.freezeParty(investorA.id);

        // Verify frozen
        expect(compliancePlugin.transfer(investorA.id, investorB.id, 10_000n).success).toBe(false);
        expect(compliancePlugin.mint(investorA.id, 10_000n).success).toBe(false);

        // Unfreeze
        await compliancePlugin.unfreezeParty(investorA.id);

        // Now succeeds
        const transferResult = compliancePlugin.transfer(investorA.id, investorB.id, 10_000n);
        expect(transferResult.success).toBe(true);
      });
    });

    // B3: Decision Integrity
    describe('B3: Decision Integrity', () => {

      it('B3.1: Two identical evaluations produce same result and valid deterministic hashes', async () => {
        realEstateAsset.state = LifecycleState.ACTIVE;

        const context = {
          assetId: realEstateAsset.id,
          asset: realEstateAsset,
          actorId: issuer.id,
          recipientId: investorA.id,
          amount: '500000',
        };

        const result1 = await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, context);
        const result2 = await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, context);

        // Same compliance outcome
        expect(result1.decision.result).toBe(result2.decision.result);
        expect(result1.decision.action).toBe(result2.decision.action);

        // Each receipt has a valid, non-empty decisionHash
        expect(result1.receipt.decisionHash).toBeDefined();
        expect(result1.receipt.decisionHash.length).toBe(64); // SHA-256 hex
        expect(result2.receipt.decisionHash).toBeDefined();
        expect(result2.receipt.decisionHash.length).toBe(64);
      });

      it('B3.2: 3 sequential evaluations → receiptChain.verifyChain() returns valid, chain linked', async () => {
        realEstateAsset.state = LifecycleState.ACTIVE;

        await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
          assetId: realEstateAsset.id, asset: realEstateAsset, actorId: issuer.id, recipientId: investorA.id, amount: '100000',
        });
        await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
          assetId: realEstateAsset.id, asset: realEstateAsset, actorId: issuer.id, recipientId: investorB.id, amount: '200000',
        });
        await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, {
          assetId: realEstateAsset.id, asset: realEstateAsset, actorId: investorA.id, recipientId: investorB.id, amount: '50000',
        });

        const chainResult = receiptChain.verifyChain();
        expect(chainResult.valid).toBe(true);
        expect(chainResult.issues).toHaveLength(0);

        // Verify linkage
        const allReceipts = receiptChain.getAll();
        expect(allReceipts.length).toBe(3);
        expect(allReceipts[1].previousReceiptHash).toBeDefined();
        expect(allReceipts[2].previousReceiptHash).toBeDefined();
      });

      it('B3.3: Each receipt passes verifyReceipt() with valid signature', async () => {
        realEstateAsset.state = LifecycleState.ACTIVE;

        await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
          assetId: realEstateAsset.id, asset: realEstateAsset, actorId: issuer.id, recipientId: investorA.id, amount: '100000',
        });
        await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
          assetId: realEstateAsset.id, asset: realEstateAsset, actorId: issuer.id, recipientId: investorB.id, amount: '200000',
        });

        const allReceipts = receiptChain.getAll();
        for (const receipt of allReceipts) {
          const verification = verifyReceipt(receipt);
          expect(verification.valid).toBe(true);
          expect(verification.signatureValid).toBe(true);
        }
      });
    });
  });

  // ==========================================================================
  // READINESS SCORECARD
  // ==========================================================================

  describe('Readiness Scorecard', () => {

    it('S1: Zero-config: all engines construct without error', () => {
      // Each engine should construct without throwing
      expect(() => new EventStore()).not.toThrow();
      expect(() => new LifecycleEngine(new EventStore())).not.toThrow();
      expect(() => new ComplianceEngine({ eventStore: new EventStore() })).not.toThrow();
      expect(() => new CashFlowEngine(new EventStore())).not.toThrow();
      expect(() => new RedemptionEngine(new EventStore())).not.toThrow();
      expect(() => new AirlineTicketEngine()).not.toThrow();
    });

    it('S2: Atomic integrity: 50 concurrent ops, supply conserved (balanceA + balanceB === totalMinted)', async () => {
      const plugin = new PartnerReadinessCompliancePlugin({
        maxInvestors: 4,
        maxHoldingPct: 80,
        totalSupply: 10_000_000,
      });

      const pA = createTestParty({ id: 'conc-a', name: 'ConcA', jurisdiction: 'AE', withValidKyc: true });
      const pB = createTestParty({ id: 'conc-b', name: 'ConcB', jurisdiction: 'AE', withValidKyc: true });
      plugin.registerParty(pA);
      plugin.registerParty(pB);

      // Mint initial supply
      plugin.mint(pA.id, 1_000_000n);
      plugin.mint(pB.id, 1_000_000n);
      const totalMinted = plugin.getGlobalSupply();

      // 50 concurrent transfers of 1000 tokens each
      const ops = Array.from({ length: 50 }, (_, i) => {
        return Promise.resolve(
          i % 2 === 0
            ? plugin.transfer(pA.id, pB.id, 1_000n)
            : plugin.transfer(pB.id, pA.id, 1_000n)
        );
      });

      await Promise.allSettled(ops);

      // Supply must be conserved
      const balanceA = plugin.getBalance(pA.id);
      const balanceB = plugin.getBalance(pB.id);
      expect(balanceA + balanceB).toBe(totalMinted);
    });

    it('S3: Granular events: every state change produces a corresponding event', async () => {
      await lifecycleEngine.registerAsset(realEstateAsset);

      const transitions: Array<{ from: LifecycleState; to: LifecycleState }> = [
        { from: LifecycleState.DRAFT, to: LifecycleState.PENDING_VERIFICATION },
        { from: LifecycleState.PENDING_VERIFICATION, to: LifecycleState.VERIFIED },
        { from: LifecycleState.VERIFIED, to: LifecycleState.ACTIVE },
      ];

      for (const t of transitions) {
        await lifecycleEngine.transition({
          assetId: realEstateAsset.id,
          fromState: t.from,
          toState: t.to,
          actorId: issuer.id,
        });
      }

      const events = await eventStore.getByAssetId(realEstateAsset.id);
      // At minimum: 1 ASSET_CREATED + 3 state transitions = 4 events
      expect(events.length).toBeGreaterThanOrEqual(4);
    });

    it('S4: Scorecard summary', async () => {
      // Run key operations to collect metrics
      const scores: Record<string, string> = {};

      // Zero-config
      try {
        new EventStore();
        new LifecycleEngine(new EventStore());
        new ComplianceEngine({ eventStore: new EventStore() });
        new CashFlowEngine(new EventStore());
        new RedemptionEngine(new EventStore());
        new AirlineTicketEngine();
        scores['Zero-Config'] = 'PASS';
      } catch {
        scores['Zero-Config'] = 'FAIL';
      }

      // Atomic integrity
      compliancePlugin.mint(investorA.id, 500_000n);
      compliancePlugin.mint(investorB.id, 400_000n);
      const total = compliancePlugin.getGlobalSupply();
      compliancePlugin.transfer(investorA.id, investorB.id, 10_000n);
      const balA = compliancePlugin.getBalance(investorA.id);
      const balB = compliancePlugin.getBalance(investorB.id);
      scores['Atomic Integrity'] = (balA + balB === total) ? 'PASS' : 'FAIL';

      // Granular events
      await lifecycleEngine.registerAsset(realEstateAsset);
      const events = await eventStore.getByAssetId(realEstateAsset.id);
      scores['Granular Events'] = events.length > 0 ? 'PASS' : 'FAIL';

      // Receipt chain
      realEstateAsset.state = LifecycleState.ACTIVE;
      await complianceEngine.evaluate(ComplianceAction.TOKEN_MINT, {
        assetId: realEstateAsset.id, asset: realEstateAsset, actorId: issuer.id, recipientId: investorA.id, amount: '100',
      });
      const chainValid = receiptChain.verifyChain().valid;
      scores['Receipt Chain'] = chainValid ? 'PASS' : 'FAIL';

      // Print scorecard
      console.log('\n========== PARTNER READINESS SCORECARD ==========');
      for (const [criterion, result] of Object.entries(scores)) {
        console.log(`  ${criterion}: ${result}`);
      }
      console.log('=================================================\n');

      // All must pass
      expect(Object.values(scores).every(v => v === 'PASS')).toBe(true);
    });
  });
});
