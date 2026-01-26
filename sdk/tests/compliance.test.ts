/**
 * Compliance Service Tests
 *
 * 20+ transfer scenarios as specified in the implementation plan.
 * Tests KYC, jurisdiction, whitelist, investor count, and other compliance rules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  ComplianceService,
  createComplianceService,
  RuleConditionType,
  type Ruleset,
} from '../src/services/ComplianceService.js';
import { createParty, addKycRecord, type Party, PartyRole, PartyType, VerificationLevel, AccreditationStatus } from '../src/models/Party.js';
import { RightType, LifecycleState, TransferabilityMode, type RightModel } from '../src/core/types.js';

describe('ComplianceService - Transfer Scenarios', () => {
  let service: ComplianceService;

  const createTestAsset = (overrides: Partial<RightModel> = {}): RightModel => ({
    id: uuidv4(),
    name: 'Test Asset',
    rightType: RightType.OWNERSHIP,
    state: LifecycleState.ACTIVE,
    jurisdiction: {
      countryCode: 'AE',
      accreditedOnly: false,
      blockedJurisdictions: [],
    },
    validityPeriod: {
      isPerpetual: true,
    },
    transferabilityRules: {
      mode: TransferabilityMode.COMPLIANCE_GATED,
      lockupPeriodSeconds: 0,
      requireKyc: true,
    },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 0,
    ...overrides,
  });

  const createTestParty = (overrides: {
    name?: string;
    type?: PartyType;
    roles?: PartyRole[];
    jurisdiction?: string;
    verificationLevel?: VerificationLevel | 'NONE' | 'STANDARD';
    withValidKyc?: boolean;
    isAccredited?: boolean;
    isFrozen?: boolean;
    freezeReason?: string;
  } = {}): Party => {
    let party = createParty({
      name: overrides.name ?? `Test Party ${uuidv4().slice(0, 8)}`,
      type: overrides.type ?? PartyType.INDIVIDUAL,
      roles: overrides.roles ?? [PartyRole.INVESTOR],
      jurisdiction: overrides.jurisdiction ?? 'AE',
    });

    // Add valid KYC record if requested or if verificationLevel is STANDARD
    const needsKyc = overrides.withValidKyc ||
                     overrides.verificationLevel === 'STANDARD' ||
                     overrides.verificationLevel === VerificationLevel.STANDARD;

    if (needsKyc) {
      party = addKycRecord(party, {
        provider: 'test-kyc-provider',
        level: VerificationLevel.STANDARD,
        verifiedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        referenceId: `kyc-${uuidv4()}`,
        validJurisdictions: ['AE', 'UK', 'US'],
      });
    }

    // Set accreditation if requested
    if (overrides.isAccredited) {
      party = {
        ...party,
        accreditationStatus: AccreditationStatus.VERIFIED,
        accreditationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    // Set frozen status if requested
    if (overrides.isFrozen) {
      party = {
        ...party,
        isFrozen: true,
        freezeReason: overrides.freezeReason ?? 'Test freeze',
      };
    }

    return party;
  };

  beforeEach(() => {
    service = new ComplianceService();
  });

  // ==========================================================================
  // SCENARIO 1-5: KYC Tests
  // ==========================================================================

  describe('KYC Compliance', () => {
    beforeEach(() => {
      service.registerRuleset({
        id: 'kyc-required',
        name: 'KYC Required',
        conditions: [
          {
            type: RuleConditionType.KYC_REQUIRED,
            enabled: true,
            params: {},
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });
    });

    it('Scenario 1: Valid transfer - both parties KYC verified', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('Scenario 2: Deny transfer - sender KYC not verified', async () => {
      const sender = createTestParty({ verificationLevel: 'NONE' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.message.includes('Sender') && v.message.includes('KYC'))).toBe(true);
    });

    it('Scenario 3: Deny transfer - receiver KYC not verified', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'NONE' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.message.includes('Receiver') && v.message.includes('KYC'))).toBe(true);
    });

    it('Scenario 4: Deny transfer - sender KYC expired', async () => {
      // Create party with expired KYC
      let sender = createParty({
        name: 'Expired KYC Sender',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });
      sender = addKycRecord(sender, {
        provider: 'test-kyc-provider',
        level: VerificationLevel.STANDARD,
        verifiedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Expired 30 days ago
        referenceId: `kyc-${uuidv4()}`,
        validJurisdictions: ['AE'],
      });

      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
    });

    it('Scenario 5: Deny transfer - both parties KYC not verified', async () => {
      const sender = createTestParty({ verificationLevel: 'NONE' });
      const receiver = createTestParty({ verificationLevel: 'NONE' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // SCENARIO 6-9: Frozen Account Tests
  // ==========================================================================

  describe('Frozen Account Compliance', () => {
    it('Scenario 6: Deny transfer - sender account frozen', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD', isFrozen: true, freezeReason: 'Suspicious activity' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.ruleId === 'FROZEN_SENDER')).toBe(true);
    });

    it('Scenario 7: Deny transfer - receiver account frozen', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD', isFrozen: true, freezeReason: 'Compliance review' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.ruleId === 'FROZEN_RECEIVER')).toBe(true);
    });

    it('Scenario 8: Deny transfer - both accounts frozen', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD', isFrozen: true });
      const receiver = createTestParty({ verificationLevel: 'STANDARD', isFrozen: true });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBe(2);
    });

    it('Scenario 9: Allow transfer - previously frozen account now unfrozen', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' }); // Not frozen
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 10-13: Whitelist Tests
  // ==========================================================================

  describe('Whitelist Compliance', () => {
    beforeEach(() => {
      service.registerRuleset({
        id: 'whitelist-required',
        name: 'Whitelist Required',
        conditions: [
          {
            type: RuleConditionType.WHITELIST_REQUIRED,
            enabled: true,
            params: {},
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });
    });

    it('Scenario 10: Allow transfer - receiver on whitelist', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      // Add receiver to whitelist
      service.addToWhitelist(asset.id, receiver.id);

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 11: Deny transfer - receiver not on whitelist', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      // Create whitelist but don't add receiver
      service.addToWhitelist(asset.id, 'some-other-party');

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.message.includes('whitelist'))).toBe(true);
    });

    it('Scenario 12: Allow transfer - no whitelist configured (open)', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      // Don't configure any whitelist - should be open

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 13: Whitelist operations work correctly', () => {
      const assetId = uuidv4();
      const partyId = uuidv4();

      // Add to whitelist
      service.addToWhitelist(assetId, partyId);
      expect(service.isWhitelisted(assetId, partyId)).toBe(true);

      // Get whitelist
      expect(service.getWhitelist(assetId)).toContain(partyId);

      // Remove from whitelist
      service.removeFromWhitelist(assetId, partyId);
      expect(service.isWhitelisted(assetId, partyId)).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 14-16: Jurisdiction Tests
  // ==========================================================================

  describe('Jurisdiction Compliance', () => {
    beforeEach(() => {
      service.registerRuleset({
        id: 'jurisdiction-rules',
        name: 'Jurisdiction Rules',
        conditions: [
          {
            type: RuleConditionType.JURISDICTION_BLACKLIST,
            enabled: true,
            params: { jurisdictions: ['KP', 'IR', 'CU', 'SY'] }, // Sanctioned countries
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });
    });

    it('Scenario 14: Allow transfer - receiver in allowed jurisdiction', async () => {
      const sender = createTestParty({ jurisdiction: 'AE', verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ jurisdiction: 'UK', verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 15: Deny transfer - receiver in blacklisted jurisdiction', async () => {
      const sender = createTestParty({ jurisdiction: 'AE', verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ jurisdiction: 'KP', verificationLevel: 'STANDARD' }); // North Korea
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.message.includes('jurisdiction') || v.message.includes('blocked'))).toBe(true);
    });

    it('Scenario 16: Jurisdiction whitelist works correctly', async () => {
      // Create a new service with whitelist instead of blacklist
      const whitelistService = new ComplianceService();
      whitelistService.registerRuleset({
        id: 'jurisdiction-whitelist',
        name: 'Jurisdiction Whitelist',
        conditions: [
          {
            type: RuleConditionType.JURISDICTION_WHITELIST,
            enabled: true,
            params: { jurisdictions: ['AE', 'UK', 'US'] },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ jurisdiction: 'AE', verificationLevel: 'STANDARD' });
      const receiverAllowed = createTestParty({ jurisdiction: 'UK', verificationLevel: 'STANDARD' });
      const receiverNotAllowed = createTestParty({ jurisdiction: 'BR', verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const resultAllowed = await whitelistService.evaluateTransfer({
        from: sender,
        to: receiverAllowed,
        asset,
        amount: '1000',
      });
      expect(resultAllowed.allowed).toBe(true);

      const resultNotAllowed = await whitelistService.evaluateTransfer({
        from: sender,
        to: receiverNotAllowed,
        asset,
        amount: '1000',
      });
      expect(resultNotAllowed.allowed).toBe(false);
    });
  });

  // ==========================================================================
  // SCENARIO 17-19: Investor Count Tests
  // ==========================================================================

  describe('Investor Count Compliance', () => {
    beforeEach(() => {
      service.registerRuleset({
        id: 'investor-limit',
        name: 'Investor Limit',
        conditions: [
          {
            type: RuleConditionType.MAX_INVESTOR_COUNT,
            enabled: true,
            params: { maxCount: 100 },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });
    });

    it('Scenario 17: Allow transfer - investor count within limit', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      service.setInvestorCount(asset.id, 50);

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 18: Deny transfer - max investor count reached', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      service.setInvestorCount(asset.id, 100); // At max

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
    });

    it('Scenario 19: Investor count management works correctly', () => {
      const assetId = uuidv4();

      expect(service.getInvestorCount(assetId)).toBe(0);

      service.setInvestorCount(assetId, 10);
      expect(service.getInvestorCount(assetId)).toBe(10);

      service.incrementInvestorCount(assetId);
      expect(service.getInvestorCount(assetId)).toBe(11);
    });
  });

  // ==========================================================================
  // SCENARIO 20-22: Holding Amount Tests
  // ==========================================================================

  describe('Holding Amount Compliance', () => {
    it('Scenario 20: Deny transfer - below minimum holding amount', async () => {
      const minHoldingService = new ComplianceService();
      minHoldingService.registerRuleset({
        id: 'min-holding',
        name: 'Minimum Holding',
        conditions: [
          {
            type: RuleConditionType.MIN_HOLDING_AMOUNT,
            enabled: true,
            params: { minAmount: '1000' },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await minHoldingService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '500', // Below minimum
      });

      expect(result.allowed).toBe(false);
    });

    it('Scenario 21: Deny transfer - exceeds maximum holding amount', async () => {
      const maxHoldingService = new ComplianceService();
      maxHoldingService.registerRuleset({
        id: 'max-holding',
        name: 'Maximum Holding',
        conditions: [
          {
            type: RuleConditionType.MAX_HOLDING_AMOUNT,
            enabled: true,
            params: { maxAmount: '10000' },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await maxHoldingService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '15000', // Above maximum
      });

      expect(result.allowed).toBe(false);
    });

    it('Scenario 22: Allow transfer - amount within allowed range', async () => {
      const rangeService = new ComplianceService();
      rangeService.registerRuleset({
        id: 'holding-range',
        name: 'Holding Range',
        conditions: [
          {
            type: RuleConditionType.MIN_HOLDING_AMOUNT,
            enabled: true,
            params: { minAmount: '100' },
            severity: 'ERROR',
          },
          {
            type: RuleConditionType.MAX_HOLDING_AMOUNT,
            enabled: true,
            params: { maxAmount: '10000' },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await rangeService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '5000', // Within range
      });

      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 23-25: Lockup Period Tests
  // ==========================================================================

  describe('Lockup Period Compliance', () => {
    beforeEach(() => {
      service.registerRuleset({
        id: 'lockup-rules',
        name: 'Lockup Rules',
        conditions: [
          {
            type: RuleConditionType.LOCKUP_PERIOD,
            enabled: true,
            params: {},
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });
    });

    it('Scenario 23: Deny transfer - within lockup period', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset({
        createdAt: new Date().toISOString(), // Created now
        transferabilityRules: {
          mode: TransferabilityMode.COMPLIANCE_GATED,
          lockupPeriodSeconds: 86400 * 30, // 30 days lockup
          requireKyc: true,
        },
      });

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.message.includes('lockup'))).toBe(true);
    });

    it('Scenario 24: Allow transfer - lockup period elapsed', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset({
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
        transferabilityRules: {
          mode: TransferabilityMode.COMPLIANCE_GATED,
          lockupPeriodSeconds: 86400 * 30, // 30 days lockup (already elapsed)
          requireKyc: true,
        },
      });

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 25: Allow transfer - no lockup period configured', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset({
        transferabilityRules: {
          mode: TransferabilityMode.COMPLIANCE_GATED,
          lockupPeriodSeconds: 0, // No lockup
          requireKyc: true,
        },
      });

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 26-28: Time Restriction Tests
  // ==========================================================================

  describe('Time Restriction Compliance', () => {
    it('Scenario 26: Deny transfer - before allowed start time', async () => {
      const timeService = new ComplianceService();
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

      timeService.registerRuleset({
        id: 'time-restriction',
        name: 'Time Restriction',
        conditions: [
          {
            type: RuleConditionType.TIME_RESTRICTION,
            enabled: true,
            params: { startTime: futureDate },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await timeService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
    });

    it('Scenario 27: Deny transfer - after allowed end time', async () => {
      const timeService = new ComplianceService();
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago

      timeService.registerRuleset({
        id: 'time-restriction',
        name: 'Time Restriction',
        conditions: [
          {
            type: RuleConditionType.TIME_RESTRICTION,
            enabled: true,
            params: { endTime: pastDate },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await timeService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
    });

    it('Scenario 28: Allow transfer - within allowed time window', async () => {
      const timeService = new ComplianceService();
      const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      timeService.registerRuleset({
        id: 'time-restriction',
        name: 'Time Restriction',
        conditions: [
          {
            type: RuleConditionType.TIME_RESTRICTION,
            enabled: true,
            params: { startTime: pastDate, endTime: futureDate },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await timeService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 29-30: Accreditation Tests
  // ==========================================================================

  describe('Accreditation Compliance', () => {
    beforeEach(() => {
      service.registerRuleset({
        id: 'accreditation-required',
        name: 'Accreditation Required',
        conditions: [
          {
            type: RuleConditionType.ACCREDITATION_REQUIRED,
            enabled: true,
            params: {},
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });
    });

    it('Scenario 29: Allow transfer - both parties accredited', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD', isAccredited: true });
      const receiver = createTestParty({ verificationLevel: 'STANDARD', isAccredited: true });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 30: Deny transfer - receiver not accredited', async () => {
      const sender = createTestParty({ verificationLevel: 'STANDARD', isAccredited: true });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' }); // Not accredited
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
    });
  });

  // ==========================================================================
  // EDGE CASES & COMBINED RULES
  // ==========================================================================

  describe('Edge Cases & Combined Rules', () => {
    it('Scenario 31: Self-transfer should be allowed', async () => {
      const party = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await service.evaluateTransfer({
        from: party,
        to: party, // Same party
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 32: Zero amount transfer should pass amount checks', async () => {
      const amountService = new ComplianceService();
      amountService.registerRuleset({
        id: 'amount-checks',
        name: 'Amount Checks',
        conditions: [
          {
            type: RuleConditionType.MIN_HOLDING_AMOUNT,
            enabled: true,
            params: { minAmount: '0' },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'STANDARD' });
      const receiver = createTestParty({ verificationLevel: 'STANDARD' });
      const asset = createTestAsset();

      const result = await amountService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '0',
      });

      expect(result.allowed).toBe(true);
    });

    it('Scenario 33: Multiple violations should all be reported', async () => {
      const multiRuleService = new ComplianceService();
      multiRuleService.registerRuleset({
        id: 'multi-rules',
        name: 'Multiple Rules',
        conditions: [
          {
            type: RuleConditionType.KYC_REQUIRED,
            enabled: true,
            params: {},
            severity: 'ERROR',
          },
          {
            type: RuleConditionType.JURISDICTION_BLACKLIST,
            enabled: true,
            params: { jurisdictions: ['KP'] },
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ jurisdiction: 'AE', verificationLevel: 'NONE' }); // No KYC
      const receiver = createTestParty({ jurisdiction: 'KP', verificationLevel: 'NONE' }); // Blacklisted + No KYC
      const asset = createTestAsset();

      const result = await multiRuleService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
    });

    it('Scenario 34: Disabled conditions should be skipped', async () => {
      const disabledService = new ComplianceService();
      disabledService.registerRuleset({
        id: 'disabled-rules',
        name: 'Disabled Rules',
        conditions: [
          {
            type: RuleConditionType.KYC_REQUIRED,
            enabled: false, // Disabled
            params: {},
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: true,
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'NONE' }); // No KYC
      const receiver = createTestParty({ verificationLevel: 'NONE' }); // No KYC
      const asset = createTestAsset();

      const result = await disabledService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      // Should pass because KYC rule is disabled
      expect(result.allowed).toBe(true);
    });

    it('Scenario 35: Inactive rulesets should not be evaluated', async () => {
      const inactiveService = new ComplianceService();
      inactiveService.registerRuleset({
        id: 'inactive-ruleset',
        name: 'Inactive Ruleset',
        conditions: [
          {
            type: RuleConditionType.KYC_REQUIRED,
            enabled: true,
            params: {},
            severity: 'ERROR',
          },
        ],
        priority: 10,
        active: false, // Inactive
        metadata: {},
      });

      const sender = createTestParty({ verificationLevel: 'NONE' });
      const receiver = createTestParty({ verificationLevel: 'NONE' });
      const asset = createTestAsset();

      const result = await inactiveService.evaluateTransfer({
        from: sender,
        to: receiver,
        asset,
        amount: '1000',
      });

      expect(result.allowed).toBe(true);
      expect(result.evaluatedRulesets).not.toContain('inactive-ruleset');
    });
  });

  // ==========================================================================
  // RULESET MANAGEMENT
  // ==========================================================================

  describe('Ruleset Management', () => {
    it('should register and retrieve rulesets', () => {
      const ruleset: Ruleset = {
        id: 'test-ruleset',
        name: 'Test Ruleset',
        conditions: [],
        priority: 5,
        active: true,
        metadata: {},
      };

      service.registerRuleset(ruleset);
      const rulesets = service.getRulesets();

      expect(rulesets.some(r => r.id === 'test-ruleset')).toBe(true);
    });

    it('should remove rulesets', () => {
      const ruleset: Ruleset = {
        id: 'removable-ruleset',
        name: 'Removable Ruleset',
        conditions: [],
        priority: 5,
        active: true,
        metadata: {},
      };

      service.registerRuleset(ruleset);
      expect(service.getRulesets().some(r => r.id === 'removable-ruleset')).toBe(true);

      service.removeRuleset('removable-ruleset');
      expect(service.getRulesets().some(r => r.id === 'removable-ruleset')).toBe(false);
    });

    it('should sort rulesets by priority', () => {
      service.registerRuleset({
        id: 'low-priority',
        name: 'Low Priority',
        conditions: [],
        priority: 1,
        active: true,
        metadata: {},
      });

      service.registerRuleset({
        id: 'high-priority',
        name: 'High Priority',
        conditions: [],
        priority: 100,
        active: true,
        metadata: {},
      });

      const rulesets = service.getRulesets();
      expect(rulesets[0]?.id).toBe('high-priority');
    });

    it('should clear all data', () => {
      const assetId = uuidv4();
      service.addToWhitelist(assetId, 'party-1');
      service.setInvestorCount(assetId, 50);
      service.registerRuleset({
        id: 'test',
        name: 'Test',
        conditions: [],
        priority: 1,
        active: true,
        metadata: {},
      });

      service.clear();

      expect(service.getWhitelist(assetId)).toHaveLength(0);
      expect(service.getInvestorCount(assetId)).toBe(0);
      expect(service.getRulesets()).toHaveLength(0);
    });
  });
});
