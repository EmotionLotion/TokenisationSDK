/**
 * NFTicket Compliance Tests
 *
 * Tests for:
 * 1. Lifecycle state transfer blocking (REDEEMED, EXPIRED, CLOSED, BURNED, FROZEN)
 * 2. Price cap enforcement (110% anti-scalping rule)
 * 3. Max resale price enforcement
 * 4. Integration with AirlineTicket pack
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
  ComplianceAction,
  type RightModel,
  type ComplianceContext,
  type PolicyDecision,
} from '../src/core/types.js';
import { ComplianceEngine } from '../src/core/ComplianceEngine.js';
import { EventStore } from '../src/core/EventStore.js';
import type { ICompliancePlugin, PartyComplianceStatus, ComplianceCheckResult } from '../src/core/interfaces.js';
import { RuleConditionType } from '../src/services/ComplianceService.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Mock compliance plugin for testing
 */
class MockCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'mock-compliance';
  private parties: Map<string, PartyComplianceStatus> = new Map();

  registerParty(partyId: string, status: Partial<PartyComplianceStatus> = {}) {
    this.parties.set(partyId, {
      partyId,
      kycVerified: true,
      accreditedInvestor: false,
      frozenUntil: undefined,
      restrictedJurisdictions: [],
      ...status,
    });
  }

  async evaluateTransfer(
    _context: { from: string; to: string; amount: string; assetId: string; timestamp: string },
    _fromStatus: PartyComplianceStatus,
    _toStatus: PartyComplianceStatus
  ): Promise<ComplianceCheckResult> {
    return { compliant: true, violations: [], warnings: [] };
  }

  async canHoldAsset(
    _partyId: string,
    _asset: RightModel,
    _status: PartyComplianceStatus
  ): Promise<ComplianceCheckResult> {
    return { compliant: true, violations: [], warnings: [] };
  }

  async checkPolicy(
    _ruleId: string,
    _context: Record<string, unknown>
  ): Promise<ComplianceCheckResult> {
    return { compliant: true, violations: [], warnings: [] };
  }

  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    return this.parties.get(partyId) || null;
  }
}

/**
 * Create a test asset with configurable state and metadata
 */
function createTestAsset(overrides: Partial<RightModel> = {}): RightModel {
  return {
    id: uuidv4(),
    rightType: RightType.ACCESS,
    name: 'Test Airline Ticket',
    description: 'Business Class ticket for testing',
    state: LifecycleState.ACTIVE,
    jurisdiction: {
      countryCode: 'AE',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    validityPeriod: {
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isPerpetual: false,
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      requireKyc: true,
    },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('NFTicket Compliance: Lifecycle State Transfer Blocking', () => {
  let complianceEngine: ComplianceEngine;
  let mockPlugin: MockCompliancePlugin;
  let eventStore: EventStore;
  let sender: string;
  let recipient: string;

  beforeEach(() => {
    mockPlugin = new MockCompliancePlugin();
    eventStore = new EventStore();
    complianceEngine = new ComplianceEngine({
      compliancePlugin: mockPlugin,
      eventStore,
    });

    sender = 'sender-' + uuidv4().slice(0, 8);
    recipient = 'recipient-' + uuidv4().slice(0, 8);

    // Register KYC-verified parties
    mockPlugin.registerParty(sender, { kycVerified: true });
    mockPlugin.registerParty(recipient, { kycVerified: true });
  });

  describe('REDEEMED state blocking', () => {
    it('should block transfers from REDEEMED state', async () => {
      const asset = createTestAsset({ state: LifecycleState.REDEEMED });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('DENY');
      expect(decision.violations).toContainEqual(
        expect.objectContaining({
          code: 'ASSET_NOT_TRANSFERABLE',
          rule: 'lifecycle.transfer_restriction',
        })
      );
    });

    it('should include state name in violation message', async () => {
      const asset = createTestAsset({ state: LifecycleState.REDEEMED });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      const violation = decision.violations.find(v => v.code === 'ASSET_NOT_TRANSFERABLE');
      expect(violation?.message).toContain('REDEEMED');
    });
  });

  describe('Other terminal states blocking', () => {
    const terminalStates = [
      LifecycleState.EXPIRED,
      LifecycleState.CLOSED,
      LifecycleState.BURNED,
      LifecycleState.PARTIALLY_REDEEMED,
    ];

    terminalStates.forEach((state) => {
      it(`should block transfers from ${state} state`, async () => {
        const asset = createTestAsset({ state });

        const context: ComplianceContext = {
          assetId: asset.id,
          asset,
          actorId: sender,
          recipientId: recipient,
          amount: '1',
        };

        const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

        expect(decision.result).toBe('DENY');
        expect(decision.violations).toContainEqual(
          expect.objectContaining({
            code: 'ASSET_NOT_TRANSFERABLE',
          })
        );
      });
    });
  });

  describe('FROZEN state blocking', () => {
    it('should block transfers from FROZEN state', async () => {
      const asset = createTestAsset({ state: LifecycleState.FROZEN });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('DENY');
      expect(decision.violations).toContainEqual(
        expect.objectContaining({
          code: 'ASSET_FROZEN',
          rule: 'lifecycle.frozen_restriction',
        })
      );
    });
  });

  describe('ACTIVE state allowing', () => {
    it('should allow transfers from ACTIVE state', async () => {
      const asset = createTestAsset({ state: LifecycleState.ACTIVE });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('ALLOW');
      expect(decision.violations.filter(v => v.code === 'ASSET_NOT_TRANSFERABLE')).toHaveLength(0);
    });
  });
});

describe('NFTicket Compliance: Price Cap Anti-Scalping (110% Rule)', () => {
  let complianceEngine: ComplianceEngine;
  let mockPlugin: MockCompliancePlugin;
  let eventStore: EventStore;
  let sender: string;
  let recipient: string;

  beforeEach(() => {
    mockPlugin = new MockCompliancePlugin();
    eventStore = new EventStore();
    complianceEngine = new ComplianceEngine({
      compliancePlugin: mockPlugin,
      eventStore,
    });

    sender = 'sender-' + uuidv4().slice(0, 8);
    recipient = 'recipient-' + uuidv4().slice(0, 8);

    mockPlugin.registerParty(sender, { kycVerified: true });
    mockPlugin.registerParty(recipient, { kycVerified: true });
  });

  describe('Default 110% price cap', () => {
    it('should block transfers exceeding 110% of mint price', async () => {
      const asset = createTestAsset({
        state: LifecycleState.ACTIVE,
        metadata: {
          mintPrice: '1000', // $10.00 in cents
        },
      });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1200', // $12.00 - exceeds 110% ($11.00)
        },
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('DENY');
      expect(decision.violations).toContainEqual(
        expect.objectContaining({
          code: 'PRICE_CAP_EXCEEDED',
          rule: 'anti_scalping.price_cap',
        })
      );
    });

    it('should allow transfers at exactly 110% of mint price', async () => {
      const asset = createTestAsset({
        state: LifecycleState.ACTIVE,
        metadata: {
          mintPrice: '1000',
        },
      });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1100', // Exactly 110%
        },
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('ALLOW');
      expect(decision.violations.filter(v => v.code === 'PRICE_CAP_EXCEEDED')).toHaveLength(0);
    });

    it('should allow transfers below 110% of mint price', async () => {
      const asset = createTestAsset({
        state: LifecycleState.ACTIVE,
        metadata: {
          mintPrice: '1000',
        },
      });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1050', // 105%
        },
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('ALLOW');
    });
  });

  describe('Custom price cap percentage', () => {
    it('should use custom priceCapPercent when specified', async () => {
      const asset = createTestAsset({
        state: LifecycleState.ACTIVE,
        metadata: {
          mintPrice: '1000',
          priceCapPercent: 120, // 120% cap
        },
      });

      // Should allow at 115% (below 120%)
      const allowedContext: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1150',
        },
      };

      const { decision: allowedDecision } = await complianceEngine.evaluate(
        ComplianceAction.TOKEN_TRANSFER,
        allowedContext
      );
      expect(allowedDecision.result).toBe('ALLOW');

      // Should block at 125% (above 120%)
      const blockedContext: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1250',
        },
      };

      const { decision: blockedDecision } = await complianceEngine.evaluate(
        ComplianceAction.TOKEN_TRANSFER,
        blockedContext
      );
      expect(blockedDecision.result).toBe('DENY');
      expect(blockedDecision.violations).toContainEqual(
        expect.objectContaining({ code: 'PRICE_CAP_EXCEEDED' })
      );
    });
  });

  describe('Explicit max resale price', () => {
    it('should use maxResalePrice when specified (takes precedence)', async () => {
      const asset = createTestAsset({
        state: LifecycleState.ACTIVE,
        metadata: {
          mintPrice: '1000',
          maxResalePrice: '1500', // Explicit max
        },
      });

      // Should allow at 140% (below maxResalePrice of 1500)
      const allowedContext: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1400',
        },
      };

      const { decision: allowedDecision } = await complianceEngine.evaluate(
        ComplianceAction.TOKEN_TRANSFER,
        allowedContext
      );
      expect(allowedDecision.result).toBe('ALLOW');

      // Should block above maxResalePrice
      const blockedContext: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        metadata: {
          transferPrice: '1600',
        },
      };

      const { decision: blockedDecision } = await complianceEngine.evaluate(
        ComplianceAction.TOKEN_TRANSFER,
        blockedContext
      );
      expect(blockedDecision.result).toBe('DENY');
      expect(blockedDecision.violations).toContainEqual(
        expect.objectContaining({
          code: 'MAX_RESALE_PRICE_EXCEEDED',
          rule: 'anti_scalping.max_resale_price',
        })
      );
    });
  });

  describe('No price check when no transfer price', () => {
    it('should skip price check when transferPrice not provided', async () => {
      const asset = createTestAsset({
        state: LifecycleState.ACTIVE,
        metadata: {
          mintPrice: '1000',
        },
      });

      const context: ComplianceContext = {
        assetId: asset.id,
        asset,
        actorId: sender,
        recipientId: recipient,
        amount: '1',
        // No transferPrice in metadata
      };

      const { decision } = await complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, context);

      expect(decision.result).toBe('ALLOW');
      expect(decision.violations.filter(v => v.code === 'PRICE_CAP_EXCEEDED')).toHaveLength(0);
    });
  });
});

describe('NFTicket Compliance: Business Class Ticket Full Lifecycle', () => {
  let complianceEngine: ComplianceEngine;
  let mockPlugin: MockCompliancePlugin;
  let eventStore: EventStore;
  let airline: string;
  let passenger: string;
  let buyer: string;

  beforeEach(() => {
    mockPlugin = new MockCompliancePlugin();
    eventStore = new EventStore();
    complianceEngine = new ComplianceEngine({
      compliancePlugin: mockPlugin,
      eventStore,
    });

    airline = 'airline-emirates';
    passenger = 'passenger-' + uuidv4().slice(0, 8);
    buyer = 'buyer-' + uuidv4().slice(0, 8);

    mockPlugin.registerParty(airline, { kycVerified: true, accreditedInvestor: true });
    mockPlugin.registerParty(passenger, { kycVerified: true });
    mockPlugin.registerParty(buyer, { kycVerified: true });
  });

  it('should allow full lifecycle: DRAFT → ACTIVE → REDEEMED with transfer blocking', async () => {
    // Step 1: Create ticket in DRAFT state
    const ticket = createTestAsset({
      name: 'EK123 Business Class - DXB to LHR',
      state: LifecycleState.DRAFT,
      metadata: {
        assetType: 'AIRLINE_TICKET',
        ticketClass: 'BUSINESS',
        flightNumber: 'EK123',
        departure: 'DXB',
        arrival: 'LHR',
        mintPrice: '500000', // $5,000 in cents
      },
    });

    expect(ticket.state).toBe(LifecycleState.DRAFT);

    // Step 2: Activate ticket (simulating state change)
    const activeTicket = { ...ticket, state: LifecycleState.ACTIVE };

    // Step 3: Verify transfer is allowed in ACTIVE state
    const transferContext: ComplianceContext = {
      assetId: activeTicket.id,
      asset: activeTicket,
      actorId: passenger,
      recipientId: buyer,
      amount: '1',
      metadata: {
        transferPrice: '520000', // $5,200 - within 110% cap ($5,500)
      },
    };

    const { decision: activeTransferDecision } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      transferContext
    );
    expect(activeTransferDecision.result).toBe('ALLOW');

    // Step 4: Redeem ticket (simulating boarding)
    const redeemedTicket = { ...activeTicket, state: LifecycleState.REDEEMED };

    // Step 5: Verify transfer is BLOCKED in REDEEMED state
    const blockedContext: ComplianceContext = {
      assetId: redeemedTicket.id,
      asset: redeemedTicket,
      actorId: buyer,
      recipientId: passenger,
      amount: '1',
    };

    const { decision: redeemedTransferDecision } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      blockedContext
    );

    expect(redeemedTransferDecision.result).toBe('DENY');
    expect(redeemedTransferDecision.violations).toContainEqual(
      expect.objectContaining({
        code: 'ASSET_NOT_TRANSFERABLE',
        message: expect.stringContaining('REDEEMED'),
      })
    );
  });

  it('should block scalping attempt (price > 110%)', async () => {
    const ticket = createTestAsset({
      name: 'EK456 Business Class - DXB to JFK',
      state: LifecycleState.ACTIVE,
      metadata: {
        assetType: 'AIRLINE_TICKET',
        ticketClass: 'BUSINESS',
        mintPrice: '800000', // $8,000 in cents
      },
    });

    // Scalper tries to sell at $10,000 (125% of mint price)
    const scalpingContext: ComplianceContext = {
      assetId: ticket.id,
      asset: ticket,
      actorId: passenger,
      recipientId: buyer,
      amount: '1',
      metadata: {
        transferPrice: '1000000', // $10,000 - exceeds 110% cap ($8,800)
      },
    };

    const { decision } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      scalpingContext
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations).toContainEqual(
      expect.objectContaining({
        code: 'PRICE_CAP_EXCEEDED',
        rule: 'anti_scalping.price_cap',
      })
    );
  });
});

describe('RuleConditionType enum', () => {
  it('should have PRICE_CAP rule type', () => {
    expect(RuleConditionType.PRICE_CAP).toBe('PRICE_CAP');
  });

  it('should have MAX_RESALE_PRICE rule type', () => {
    expect(RuleConditionType.MAX_RESALE_PRICE).toBe('MAX_RESALE_PRICE');
  });

  it('should have LIFECYCLE_STATE_RESTRICTION rule type', () => {
    expect(RuleConditionType.LIFECYCLE_STATE_RESTRICTION).toBe('LIFECYCLE_STATE_RESTRICTION');
  });
});
