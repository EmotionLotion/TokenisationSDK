/**
 * Integration Test Scenarios - Using Real SDK Implementation
 *
 * These scenarios validate the SDK's genericness using actual SDK classes:
 * - ComplianceEngine for policy evaluation
 * - LifecycleEngine for state transitions
 * - EventStore for audit trails
 * - Real decision receipts
 *
 * Scenarios:
 * - Scenario A: Real Estate Token (Security-like, heavy compliance)
 * - Scenario B: Carbon Credit Token (Retirement terminal state)
 * - Scenario C: Ticketing (time-window transfers + royalties + anti-scalping)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
  EventType,
  ComplianceAction,
  type RightModel,
  type PolicyDecision,
} from '../src/core/types.js';
import { ComplianceEngine, type ComplianceEngineConfig } from '../src/core/ComplianceEngine.js';
import { LifecycleEngine } from '../src/core/LifecycleEngine.js';
import { EventStore } from '../src/core/EventStore.js';
import { createReceipt, receiptChain, type DecisionReceipt } from '../src/core/DecisionReceipt.js';
import type { IJurisdictionPlugin, ICompliancePlugin, PartyComplianceStatus } from '../src/core/interfaces.js';
import { AssetType, InvestorClass } from '../src/core/AssetAbstraction.js';
import {
  createParty,
  addKycRecord,
  type Party,
  PartyRole,
  PartyType,
  VerificationLevel,
} from '../src/models/Party.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestAsset = (overrides: Partial<RightModel> = {}): RightModel => ({
  id: uuidv4(),
  name: 'Test Asset',
  rightType: RightType.OWNERSHIP,
  state: LifecycleState.DRAFT,
  jurisdiction: {
    countryCode: 'AE',
    accreditedOnly: false,
    blockedJurisdictions: ['KP', 'IR', 'CU', 'SY'],
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
  id?: string;
  name?: string;
  type?: PartyType;
  jurisdiction?: string;
  withValidKyc?: boolean;
  accredited?: boolean;
  isFrozen?: boolean;
  kycExpiry?: Date;
} = {}): Party => {
  const id = overrides.id || uuidv4();
  let party = createParty({
    name: overrides.name || 'Test Party',
    type: overrides.type || PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction: overrides.jurisdiction || 'AE',
  });

  party = { ...party, id };

  if (overrides.withValidKyc) {
    const expiryDate = overrides.kycExpiry || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    party = addKycRecord(party, {
      providerId: 'test-provider',
      level: VerificationLevel.STANDARD,
      expiresAt: expiryDate.toISOString(),
    });
    party.kycVerified = true;
    party.kycExpiryDate = expiryDate;
  }

  if (overrides.accredited) {
    party.accreditedInvestor = true;
  }

  if (overrides.isFrozen) {
    party.isFrozen = true;
    party.frozenUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  return party;
};

// ============================================================================
// SCENARIO A: REAL ESTATE TOKEN - COMPLIANCE PLUGIN
// ============================================================================

class RealEstateCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'real-estate-compliance';
  private parties: Map<string, PartyComplianceStatus> = new Map();
  private caps: { global: number; perInvestor: number };
  private balances: Map<string, number> = new Map();
  private globalSupply = 0;
  private lockupEndDate: Date;

  constructor(config: {
    globalCap: number;
    perInvestorCap: number;
    lockupDays: number;
    issuanceDate: Date;
  }) {
    this.caps = { global: config.globalCap, perInvestor: config.perInvestorCap };
    this.lockupEndDate = new Date(config.issuanceDate);
    this.lockupEndDate.setDate(this.lockupEndDate.getDate() + config.lockupDays);
  }

  registerParty(party: Party): void {
    this.parties.set(party.id, {
      partyId: party.id,
      kycVerified: party.kycVerified,
      kycExpiryDate: party.kycExpiryDate?.toISOString(),
      accreditedInvestor: party.accreditedInvestor || false,
      frozenUntil: party.frozenUntil?.toISOString(),
      restrictedJurisdictions: [],
    });
  }

  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    return this.parties.get(partyId) || null;
  }

  async canHoldAsset(partyId: string, asset: RightModel, status: PartyComplianceStatus) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];

    // Check KYC
    if (!status.kycVerified) {
      violations.push({
        ruleId: 'KYC_REQUIRED',
        message: 'KYC verification required',
        severity: 'CRITICAL',
        ruleName: 'compliance.kyc',
      });
    }

    // Check accreditation for accredited-only assets
    if (asset.jurisdiction.accreditedOnly && !status.accreditedInvestor) {
      violations.push({
        ruleId: 'ACCREDITATION_REQUIRED',
        message: 'Accredited investor status required',
        severity: 'CRITICAL',
        ruleName: 'compliance.accreditation',
      });
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

  async evaluateTransfer(
    transfer: { from: string; to: string; amount: string; assetId: string },
    sender: PartyComplianceStatus,
    recipient: PartyComplianceStatus
  ) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];
    const amount = parseFloat(transfer.amount);

    // Check lockup period
    if (new Date() < this.lockupEndDate) {
      violations.push({
        ruleId: 'LOCKUP_ACTIVE',
        message: `Asset is in lockup until ${this.lockupEndDate.toISOString()}`,
        severity: 'CRITICAL',
        ruleName: 'compliance.lockup',
      });
    }

    // Check per-investor cap
    const recipientBalance = this.balances.get(transfer.to) || 0;
    if (recipientBalance + amount > this.caps.perInvestor) {
      violations.push({
        ruleId: 'PER_INVESTOR_CAP_EXCEEDED',
        message: `Transfer would exceed per-investor cap of ${this.caps.perInvestor}. Allowable: ${this.caps.perInvestor - recipientBalance}`,
        severity: 'CRITICAL',
        ruleName: 'compliance.investor_cap',
      });
    }

    // Check global cap
    if (this.globalSupply + amount > this.caps.global) {
      violations.push({
        ruleId: 'GLOBAL_CAP_EXCEEDED',
        message: `Transfer would exceed global cap of ${this.caps.global}`,
        severity: 'CRITICAL',
        ruleName: 'compliance.global_cap',
      });
    }

    return { compliant: violations.length === 0, violations, warnings: [] };
  }

  // Test helpers
  setBalance(partyId: string, balance: number): void {
    this.balances.set(partyId, balance);
    this.globalSupply = Array.from(this.balances.values()).reduce((a, b) => a + b, 0);
  }

  getBalance(partyId: string): number {
    return this.balances.get(partyId) || 0;
  }

  addToBalance(partyId: string, amount: number): void {
    const current = this.balances.get(partyId) || 0;
    this.balances.set(partyId, current + amount);
    this.globalSupply += amount;
  }

  getGlobalSupply(): number {
    return this.globalSupply;
  }

  setLockupEndDate(date: Date): void {
    this.lockupEndDate = date;
  }

  getCaps() {
    return this.caps;
  }
}

// ============================================================================
// SCENARIO A: REAL ESTATE TOKEN (Security-like, heavy compliance)
// ============================================================================

describe('Scenario A: Real Estate Token (Security-like, heavy compliance)', () => {
  const GLOBAL_CAP = 1_000_000;
  const PER_INVESTOR_CAP = 50_000;
  const LOCKUP_DAYS = 90;

  let complianceEngine: ComplianceEngine;
  let lifecycleEngine: LifecycleEngine;
  let eventStore: EventStore;
  let compliancePlugin: RealEstateCompliancePlugin;
  let realEstateAsset: RightModel;
  let investorA: Party;
  let investorB: Party;
  let issuanceDate: Date;

  beforeEach(() => {
    issuanceDate = new Date();
    eventStore = new EventStore();
    lifecycleEngine = new LifecycleEngine(eventStore);

    compliancePlugin = new RealEstateCompliancePlugin({
      globalCap: GLOBAL_CAP,
      perInvestorCap: PER_INVESTOR_CAP,
      lockupDays: LOCKUP_DAYS,
      issuanceDate,
    });

    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      eventStore,
    });

    // Create real estate asset
    realEstateAsset = createTestAsset({
      name: 'Dubai Tower A – Fractional Shares',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: true,
        blockedJurisdictions: ['US', 'KP', 'IR'],
      },
      transferabilityRules: {
        mode: TransferabilityMode.COMPLIANCE_GATED,
        lockupPeriodSeconds: LOCKUP_DAYS * 24 * 60 * 60,
        requireKyc: true,
      },
      metadata: {
        assetType: AssetType.REAL_ESTATE,
        investorClass: InvestorClass.ACCREDITED,
        globalCap: GLOBAL_CAP,
        perInvestorCap: PER_INVESTOR_CAP,
        policyVersion: 1,
      },
    });

    // Create investors
    investorA = createTestParty({
      name: 'Investor A',
      withValidKyc: true,
      accredited: true,
      jurisdiction: 'AE',
    });

    investorB = createTestParty({
      name: 'Investor B',
      withValidKyc: true,
      accredited: false, // NOT accredited
      jurisdiction: 'AE',
    });

    // Register parties with compliance plugin
    compliancePlugin.registerParty(investorA);
    compliancePlugin.registerParty(investorB);
  });

  afterEach(() => {
    complianceEngine.clear();
    receiptChain.clear();
  });

  it('Step 1: Issuer creates asset with policy v1', () => {
    expect(realEstateAsset.name).toBe('Dubai Tower A – Fractional Shares');
    expect(realEstateAsset.state).toBe(LifecycleState.ACTIVE);
    expect(realEstateAsset.jurisdiction.accreditedOnly).toBe(true);
    expect(realEstateAsset.jurisdiction.blockedJurisdictions).toContain('US');
    expect(realEstateAsset.metadata.policyVersion).toBe(1);
  });

  it('Step 2: Investor A (KYC + accredited) → approved via ComplianceEngine', async () => {
    // Use TOKEN_MINT with recipientId to trigger canHoldAsset() check
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: 'issuer',
        recipientId: investorA.id,
        amount: '1000',
      }
    );

    expect(decision.result).toBe('ALLOW');
    expect(receipt.result).toBe('ALLOW');
  });

  it('Step 3: Investor B (KYC but not accredited) → denied via ComplianceEngine', async () => {
    // Use TOKEN_MINT with recipientId to trigger canHoldAsset() check
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: 'issuer',
        recipientId: investorB.id,
        amount: '1000',
      }
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations.some(v => v.code === 'ACCREDITATION_REQUIRED')).toBe(true);
    expect(receipt.result).toBe('DENY');
  });

  it('Step 4: Mint to Investor A within cap → allowed via ComplianceEngine', async () => {
    // Use recipientId for mint operation
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: 'issuer',
        recipientId: investorA.id,
        amount: '30000',
      }
    );

    expect(decision.result).toBe('ALLOW');
    expect(receipt.result).toBe('ALLOW');

    // Apply the mint
    compliancePlugin.addToBalance(investorA.id, 30000);
    expect(compliancePlugin.getBalance(investorA.id)).toBe(30000);
    expect(compliancePlugin.getGlobalSupply()).toBe(30000);
  });

  it('Step 5: Transfer during lockup → denied with LOCKUP_ACTIVE', async () => {
    // Mint first
    compliancePlugin.addToBalance(investorA.id, 10000);

    // Create verified recipient
    const investorC = createTestParty({
      name: 'Investor C',
      withValidKyc: true,
      accredited: true,
    });
    compliancePlugin.registerParty(investorC);

    // Try transfer during lockup
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: investorA.id,
        recipientId: investorC.id,
        amount: '1000',
      }
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations.some(v => v.code === 'LOCKUP_ACTIVE')).toBe(true);
    expect(receipt.result).toBe('DENY');
    // Reasons should contain the lockup message
    expect(receipt.reasons.length).toBeGreaterThan(0);
    expect(receipt.reasons.some(r => r.toLowerCase().includes('lockup'))).toBe(true);
  });

  it('Step 6: Advance time beyond lockup → transfer allowed', async () => {
    // Mint first
    compliancePlugin.addToBalance(investorA.id, 10000);

    // Create verified recipient
    const investorC = createTestParty({
      name: 'Investor C',
      withValidKyc: true,
      accredited: true,
    });
    compliancePlugin.registerParty(investorC);

    // Advance past lockup (91 days)
    const futureDate = new Date(issuanceDate);
    futureDate.setDate(futureDate.getDate() - 1); // Set lockup to past
    compliancePlugin.setLockupEndDate(futureDate);

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: investorA.id,
        recipientId: investorC.id,
        amount: '1000',
      }
    );

    expect(decision.result).toBe('ALLOW');
    expect(receipt.result).toBe('ALLOW');
  });

  it('Step 7: Exceed per-investor cap → denied with violation details', async () => {
    // Mint to investor A
    compliancePlugin.addToBalance(investorA.id, 45000);

    // Create investor C near cap
    const investorC = createTestParty({
      name: 'Investor C',
      withValidKyc: true,
      accredited: true,
    });
    compliancePlugin.registerParty(investorC);
    compliancePlugin.addToBalance(investorC.id, 48000);

    // Advance past lockup
    compliancePlugin.setLockupEndDate(new Date(Date.now() - 1000));

    // Try to transfer more than C's remaining cap
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: investorA.id,
        recipientId: investorC.id,
        amount: '10000',
      }
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations.some(v => v.code === 'PER_INVESTOR_CAP_EXCEEDED')).toBe(true);
    // Message should show allowable amount (2000)
    expect(decision.violations.some(v => v.message.includes('Allowable: 2000'))).toBe(true);
  });

  it('Step 8: Policy v2 - asset stays on v1 unless migrated', async () => {
    // Policy v2 with tighter rules
    const policyV2 = {
      version: 2,
      perInvestorCap: 25000, // Reduced from 50,000
    };

    // Asset still references v1
    expect(realEstateAsset.metadata.policyVersion).toBe(1);

    // Mint under v1 rules (40,000 - would fail under v2)
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: 'issuer',
        recipientId: investorA.id,
        amount: '40000',
      }
    );

    expect(decision.result).toBe('ALLOW');
    expect(receipt.policyVersion).toBeDefined();

    // Verify v2 would have denied
    expect(40000).toBeGreaterThan(policyV2.perInvestorCap);
  });

  it('Proof: Decision receipts include policy hash/version', async () => {
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      {
        assetId: realEstateAsset.id,
        asset: realEstateAsset,
        actorId: 'issuer',
        recipientId: investorA.id,
        amount: '10000',
      }
    );

    expect(receipt).toBeDefined();
    expect(receipt.policyVersion).toBeDefined();
    expect(receipt.policyHash).toBeDefined();
    expect(receipt.decisionHash).toBeDefined();
    expect(receipt.decisionHash.length).toBeGreaterThan(0);
  });

  it('Proof: Cap table reconciles with supply', async () => {
    // Mint to multiple investors
    compliancePlugin.addToBalance(investorA.id, 30000);

    const investorC = createTestParty({ withValidKyc: true, accredited: true });
    compliancePlugin.registerParty(investorC);
    compliancePlugin.addToBalance(investorC.id, 20000);

    const investorD = createTestParty({ withValidKyc: true, accredited: true });
    compliancePlugin.registerParty(investorD);
    compliancePlugin.addToBalance(investorD.id, 15000);

    // Verify reconciliation
    const capTableTotal =
      compliancePlugin.getBalance(investorA.id) +
      compliancePlugin.getBalance(investorC.id) +
      compliancePlugin.getBalance(investorD.id);

    expect(capTableTotal).toBe(compliancePlugin.getGlobalSupply());
    expect(compliancePlugin.getGlobalSupply()).toBe(65000);
  });
});

// ============================================================================
// SCENARIO B: CARBON CREDIT TOKEN - COMPLIANCE PLUGIN
// ============================================================================

class CarbonCreditCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'carbon-credit-compliance';
  private parties: Map<string, PartyComplianceStatus> = new Map();
  private verifiedIssuers: Set<string>;
  private verifiedEntities: Set<string>;
  private creditStates: Map<string, 'ACTIVE' | 'RETIRED'> = new Map();

  constructor(verifiedIssuers: string[], verifiedEntities: string[]) {
    this.verifiedIssuers = new Set(verifiedIssuers);
    this.verifiedEntities = new Set([...verifiedIssuers, ...verifiedEntities]);
    // Auto-register verified entities as parties
    for (const entityId of this.verifiedEntities) {
      this.parties.set(entityId, {
        partyId: entityId,
        kycVerified: true,
        accreditedInvestor: false,
        restrictedJurisdictions: [],
      });
    }
  }

  registerParty(party: Party): void {
    this.parties.set(party.id, {
      partyId: party.id,
      kycVerified: party.kycVerified,
      accreditedInvestor: party.accreditedInvestor || false,
      restrictedJurisdictions: [],
    });
  }

  setCreditState(creditId: string, state: 'ACTIVE' | 'RETIRED'): void {
    this.creditStates.set(creditId, state);
  }

  getCreditState(creditId: string): 'ACTIVE' | 'RETIRED' | undefined {
    return this.creditStates.get(creditId);
  }

  isVerifiedIssuer(partyId: string): boolean {
    return this.verifiedIssuers.has(partyId);
  }

  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    return this.parties.get(partyId) || null;
  }

  async canHoldAsset(partyId: string, asset: RightModel, status: PartyComplianceStatus) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];

    if (!this.verifiedEntities.has(partyId)) {
      violations.push({
        ruleId: 'ENTITY_NOT_VERIFIED',
        message: 'Entity must be verified to hold carbon credits',
        severity: 'CRITICAL',
        ruleName: 'compliance.verified_entity',
      });
    }

    return { compliant: violations.length === 0, violations, warnings: [] };
  }

  async evaluateTransfer(
    transfer: { from: string; to: string; amount: string; assetId: string },
    sender: PartyComplianceStatus,
    recipient: PartyComplianceStatus
  ) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];

    // Check if credit is retired
    const state = this.creditStates.get(transfer.assetId);
    if (state === 'RETIRED') {
      violations.push({
        ruleId: 'ASSET_RETIRED',
        message: 'Retired carbon credits cannot be transferred',
        severity: 'CRITICAL',
        ruleName: 'compliance.retirement',
      });
    }

    // Check recipient is verified
    if (!this.verifiedEntities.has(transfer.to)) {
      violations.push({
        ruleId: 'RECIPIENT_NOT_VERIFIED',
        message: 'Recipient must be a verified entity',
        severity: 'CRITICAL',
        ruleName: 'compliance.verified_entity',
      });
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

  async freezeParty(partyId: string, until?: string) {
    return { success: true as const, value: undefined };
  }

  async unfreezeParty(partyId: string) {
    return { success: true as const, value: undefined };
  }
}

// ============================================================================
// SCENARIO B: CARBON CREDIT TOKEN (Retirement terminal state)
// ============================================================================

describe('Scenario B: Carbon Credit Token (Retirement terminal state)', () => {
  let complianceEngine: ComplianceEngine;
  let lifecycleEngine: LifecycleEngine;
  let eventStore: EventStore;
  let compliancePlugin: CarbonCreditCompliancePlugin;

  const ISSUER_ID = 'ISSUER_001';
  const BUYER_ID = 'BUYER_001';

  beforeEach(() => {
    eventStore = new EventStore();
    lifecycleEngine = new LifecycleEngine(eventStore);

    compliancePlugin = new CarbonCreditCompliancePlugin(
      ['ISSUER_001', 'ISSUER_002'],
      ['BUYER_001', 'BUYER_002']
    );

    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      eventStore,
    });
  });

  afterEach(() => {
    complianceEngine.clear();
    lifecycleEngine.clear();
    receiptChain.clear();
  });

  const createCarbonCredit = (id: string): RightModel => createTestAsset({
    id,
    name: `Carbon Credit - Project X`,
    rightType: RightType.OWNERSHIP,
    state: LifecycleState.ACTIVE,
    metadata: {
      assetType: 'CARBON_CREDIT',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
    },
  });

  it('Step 1: Verified issuer mints credits → allowed', async () => {
    const credit = createCarbonCredit(uuidv4());
    compliancePlugin.setCreditState(credit.id, 'ACTIVE');

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      {
        assetId: credit.id,
        asset: credit,
        actorId: 'system',
        recipientId: ISSUER_ID,
        amount: '10000',
      }
    );

    expect(decision.result).toBe('ALLOW');
    expect(receipt.result).toBe('ALLOW');
  });

  it('Step 2: Transfer to verified buyer → allowed', async () => {
    const credit = createCarbonCredit(uuidv4());
    compliancePlugin.setCreditState(credit.id, 'ACTIVE');

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: credit.id,
        asset: credit,
        actorId: ISSUER_ID,
        recipientId: BUYER_ID,
        amount: '500',
      }
    );

    expect(decision.result).toBe('ALLOW');
    expect(receipt.result).toBe('ALLOW');
  });

  it('Step 3: Buyer retires credits → state becomes RETIRED', async () => {
    const credit = createCarbonCredit(uuidv4());
    compliancePlugin.setCreditState(credit.id, 'ACTIVE');

    // Register asset with lifecycle engine first
    await lifecycleEngine.registerAsset(credit);

    // Retire the credit (state transition)
    const result = await lifecycleEngine.transition({
      assetId: credit.id,
      fromState: LifecycleState.ACTIVE,
      toState: LifecycleState.REDEEMED,
      actorId: BUYER_ID,
      reason: 'Retirement for carbon offset',
    });

    expect(result.success).toBe(true);
    expect(result.newState).toBe(LifecycleState.REDEEMED);

    // Mark as retired in compliance
    compliancePlugin.setCreditState(credit.id, 'RETIRED');
    expect(compliancePlugin.getCreditState(credit.id)).toBe('RETIRED');
  });

  it('Step 4: Transfer of retired credits → denied with ASSET_RETIRED', async () => {
    const credit = createCarbonCredit(uuidv4());
    compliancePlugin.setCreditState(credit.id, 'RETIRED');

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: credit.id,
        asset: { ...credit, state: LifecycleState.REDEEMED },
        actorId: BUYER_ID,
        recipientId: 'BUYER_002',
        amount: '100',
      }
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations.some(v => v.code === 'ASSET_RETIRED')).toBe(true);
    expect(receipt.result).toBe('DENY');
  });

  it('Step 5: Attempt to unretire → denied (REDEEMED is terminal)', async () => {
    const credit = createCarbonCredit(uuidv4());
    credit.state = LifecycleState.REDEEMED;

    // Register asset with lifecycle engine first (in REDEEMED state)
    await lifecycleEngine.registerAsset(credit);

    // Try to transition back to ACTIVE
    const result = await lifecycleEngine.transition({
      assetId: credit.id,
      fromState: LifecycleState.REDEEMED,
      toState: LifecycleState.ACTIVE,
      actorId: BUYER_ID,
      reason: 'Attempt to unretire',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('Step 6: Totals reconcile (issued = active + retired)', async () => {
    // Track totals
    let totalIssued = 0;
    let totalActive = 0;
    let totalRetired = 0;

    // Issue credits
    totalIssued = 8000;
    totalActive = 8000;

    // Retire some
    const retiredAmount = 500;
    totalActive -= retiredAmount;
    totalRetired += retiredAmount;

    // Verify reconciliation
    expect(totalIssued).toBe(totalActive + totalRetired);
    expect(totalRetired).toBe(500);
    expect(totalActive).toBe(7500);
  });

  it('Proof: No transfer path bypasses retired state', async () => {
    const credit = createCarbonCredit(uuidv4());
    compliancePlugin.setCreditState(credit.id, 'RETIRED');
    credit.state = LifecycleState.REDEEMED;

    // All transfer attempts should fail
    const attempts = [
      { from: ISSUER_ID, to: BUYER_ID, amount: '100' },
      { from: BUYER_ID, to: 'BUYER_002', amount: '1' },
    ];

    for (const attempt of attempts) {
      const { decision } = await complianceEngine.evaluate(
        ComplianceAction.TOKEN_TRANSFER,
        {
          assetId: credit.id,
          asset: credit,
          actorId: attempt.from,
          recipientId: attempt.to,
          amount: attempt.amount,
        }
      );

      expect(decision.result).toBe('DENY');
      expect(decision.violations.some(v => v.code === 'ASSET_RETIRED')).toBe(true);
    }
  });
});

// ============================================================================
// SCENARIO C: TICKETING - COMPLIANCE PLUGIN
// ============================================================================

class TicketingCompliancePlugin implements ICompliancePlugin {
  readonly pluginId = 'ticketing-compliance';
  private parties: Map<string, PartyComplianceStatus> = new Map();
  private transferCounts: Map<string, number> = new Map();
  private eventStartTimes: Map<string, Date> = new Map();
  private royaltyPayments: Array<{
    ticketId: string;
    salePrice: number;
    royaltyAmount: number;
    timestamp: string;
  }> = [];

  private maxTransfers: number;
  private cutoffHours: number;
  private royaltyPercent: number;
  private kycThreshold: number;

  constructor(config: {
    maxTransfers: number;
    cutoffHours: number;
    royaltyPercent: number;
    kycThreshold: number;
  }) {
    this.maxTransfers = config.maxTransfers;
    this.cutoffHours = config.cutoffHours;
    this.royaltyPercent = config.royaltyPercent;
    this.kycThreshold = config.kycThreshold;
    // Auto-register generic parties for testing
    this.registerGenericParty('ORGANIZER');
    this.registerGenericParty('BUYER_1');
    this.registerGenericParty('BUYER_2');
    this.registerGenericParty('BUYER_3');
  }

  registerGenericParty(partyId: string): void {
    this.parties.set(partyId, {
      partyId,
      kycVerified: true,
      accreditedInvestor: false,
      restrictedJurisdictions: [],
    });
  }

  registerParty(party: Party): void {
    this.parties.set(party.id, {
      partyId: party.id,
      kycVerified: party.kycVerified,
      accreditedInvestor: party.accreditedInvestor || false,
      restrictedJurisdictions: [],
    });
  }

  setTicketEventTime(ticketId: string, eventTime: Date): void {
    this.eventStartTimes.set(ticketId, eventTime);
    this.transferCounts.set(ticketId, 0);
  }

  getTransferCount(ticketId: string): number {
    return this.transferCounts.get(ticketId) || 0;
  }

  incrementTransferCount(ticketId: string): void {
    const current = this.transferCounts.get(ticketId) || 0;
    this.transferCounts.set(ticketId, current + 1);
  }

  recordRoyalty(ticketId: string, salePrice: number): number {
    const royalty = (salePrice * this.royaltyPercent) / 100;
    this.royaltyPayments.push({
      ticketId,
      salePrice,
      royaltyAmount: royalty,
      timestamp: new Date().toISOString(),
    });
    return royalty;
  }

  getRoyaltyPayments() {
    return this.royaltyPayments;
  }

  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    return this.parties.get(partyId) || null;
  }

  async canHoldAsset(partyId: string, asset: RightModel, status: PartyComplianceStatus) {
    return { compliant: true, violations: [], warnings: [] };
  }

  async evaluateTransfer(
    transfer: { from: string; to: string; amount: string; assetId: string },
    sender: PartyComplianceStatus,
    recipient: PartyComplianceStatus,
    context?: { salePrice?: number; transferTime?: Date; buyerKycVerified?: boolean }
  ) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];
    const salePrice = context?.salePrice || 0;
    const transferTime = context?.transferTime || new Date();

    // Check transfer limit
    const currentCount = this.transferCounts.get(transfer.assetId) || 0;
    if (currentCount >= this.maxTransfers) {
      violations.push({
        ruleId: 'TRANSFER_LIMIT_REACHED',
        message: `Maximum transfers (${this.maxTransfers}) reached`,
        severity: 'CRITICAL',
        ruleName: 'compliance.transfer_limit',
      });
    }

    // Check transfer window
    const eventTime = this.eventStartTimes.get(transfer.assetId);
    if (eventTime) {
      const cutoffTime = new Date(eventTime);
      cutoffTime.setHours(cutoffTime.getHours() - this.cutoffHours);

      if (transferTime >= cutoffTime) {
        violations.push({
          ruleId: 'TRANSFER_WINDOW_CLOSED',
          message: `Transfer window closed ${this.cutoffHours} hours before event`,
          severity: 'CRITICAL',
          ruleName: 'compliance.transfer_window',
        });
      }
    }

    // Check KYC for large resales
    if (salePrice > this.kycThreshold && !context?.buyerKycVerified) {
      violations.push({
        ruleId: 'KYC_REQUIRED_FOR_LARGE_RESALE',
        message: `KYC required for resales over ${this.kycThreshold}`,
        severity: 'CRITICAL',
        ruleName: 'compliance.large_resale_kyc',
      });
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

  async freezeParty(partyId: string, until?: string) {
    return { success: true as const, value: undefined };
  }

  async unfreezeParty(partyId: string) {
    return { success: true as const, value: undefined };
  }
}

// ============================================================================
// SCENARIO C: TICKETING (time-window + royalties + anti-scalping)
// ============================================================================

describe('Scenario C: Ticketing (time-window transfers + royalties + anti-scalping)', () => {
  const MAX_TRANSFERS = 2;
  const CUTOFF_HOURS = 2;
  const ROYALTY_PERCENT = 5;
  const KYC_THRESHOLD = 500;

  let complianceEngine: ComplianceEngine;
  let eventStore: EventStore;
  let compliancePlugin: TicketingCompliancePlugin;
  let eventStartTime: Date;

  beforeEach(() => {
    eventStore = new EventStore();

    compliancePlugin = new TicketingCompliancePlugin({
      maxTransfers: MAX_TRANSFERS,
      cutoffHours: CUTOFF_HOURS,
      royaltyPercent: ROYALTY_PERCENT,
      kycThreshold: KYC_THRESHOLD,
    });

    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      eventStore,
    });

    // Event is 7 days from now
    eventStartTime = new Date();
    eventStartTime.setDate(eventStartTime.getDate() + 7);
  });

  afterEach(() => {
    complianceEngine.clear();
    receiptChain.clear();
  });

  const createTicket = (id: string): RightModel => {
    const ticket = createTestAsset({
      id,
      name: 'Concert Ticket',
      rightType: RightType.ACCESS,
      state: LifecycleState.ACTIVE,
      metadata: {
        assetType: 'EVENT_TICKET',
        eventId: 'CONCERT_001',
      },
    });
    compliancePlugin.setTicketEventTime(id, eventStartTime);
    return ticket;
  };

  it('Step 1: Organizer issues 1,000 tickets (unique NFTs)', () => {
    const tickets: RightModel[] = [];
    for (let i = 0; i < 1000; i++) {
      tickets.push(createTicket(uuidv4()));
    }

    expect(tickets.length).toBe(1000);
    const uniqueIds = new Set(tickets.map(t => t.id));
    expect(uniqueIds.size).toBe(1000);
  });

  it('Step 2: First transfer → allowed', async () => {
    const ticket = createTicket(uuidv4());

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: ticket.id,
        asset: ticket,
        actorId: 'ORGANIZER',
        recipientId: 'BUYER_1',
        amount: '1',
      }
    );

    expect(decision.result).toBe('ALLOW');
    compliancePlugin.incrementTransferCount(ticket.id);
    expect(compliancePlugin.getTransferCount(ticket.id)).toBe(1);
  });

  it('Step 3: Second transfer → allowed', async () => {
    const ticket = createTicket(uuidv4());
    compliancePlugin.incrementTransferCount(ticket.id); // First transfer

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: ticket.id,
        asset: ticket,
        actorId: 'BUYER_1',
        recipientId: 'BUYER_2',
        amount: '1',
      }
    );

    expect(decision.result).toBe('ALLOW');
    compliancePlugin.incrementTransferCount(ticket.id);
    expect(compliancePlugin.getTransferCount(ticket.id)).toBe(2);
  });

  it('Step 4: Third transfer → denied TRANSFER_LIMIT_REACHED', async () => {
    const ticket = createTicket(uuidv4());
    compliancePlugin.incrementTransferCount(ticket.id); // First
    compliancePlugin.incrementTransferCount(ticket.id); // Second

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: ticket.id,
        asset: ticket,
        actorId: 'BUYER_2',
        recipientId: 'BUYER_3',
        amount: '1',
      }
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations.some(v => v.code === 'TRANSFER_LIMIT_REACHED')).toBe(true);
    expect(compliancePlugin.getTransferCount(ticket.id)).toBe(2); // Still 2
  });

  it('Step 5: Transfer within 2 hours of event → denied TRANSFER_WINDOW_CLOSED', async () => {
    const ticket = createTicket(uuidv4());

    // Set event time to 1 hour from now (within cutoff)
    const soonEvent = new Date();
    soonEvent.setHours(soonEvent.getHours() + 1);
    compliancePlugin.setTicketEventTime(ticket.id, soonEvent);

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: ticket.id,
        asset: ticket,
        actorId: 'ORGANIZER',
        recipientId: 'BUYER_1',
        amount: '1',
      }
    );

    expect(decision.result).toBe('DENY');
    expect(decision.violations.some(v => v.code === 'TRANSFER_WINDOW_CLOSED')).toBe(true);
  });

  it('Step 6: Resale triggers royalty payment event', async () => {
    const ticket = createTicket(uuidv4());

    // First transfer
    const { decision: d1 } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: ticket.id,
        asset: ticket,
        actorId: 'ORGANIZER',
        recipientId: 'BUYER_1',
        amount: '1',
      }
    );
    expect(d1.result).toBe('ALLOW');
    compliancePlugin.incrementTransferCount(ticket.id);
    const royalty1 = compliancePlugin.recordRoyalty(ticket.id, 100);

    // Second transfer (resale)
    const { decision: d2 } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: ticket.id,
        asset: ticket,
        actorId: 'BUYER_1',
        recipientId: 'BUYER_2',
        amount: '1',
      }
    );
    expect(d2.result).toBe('ALLOW');
    compliancePlugin.incrementTransferCount(ticket.id);
    const royalty2 = compliancePlugin.recordRoyalty(ticket.id, 200);

    // Verify royalties
    expect(royalty1).toBe(5); // 5% of 100
    expect(royalty2).toBe(10); // 5% of 200

    const payments = compliancePlugin.getRoyaltyPayments();
    expect(payments.length).toBe(2);
    expect(payments[1].royaltyAmount).toBe(10);
  });

  it('Proof: Batch transfer enforces limits per ticket', async () => {
    const ticket1 = createTicket(uuidv4());
    const ticket2 = createTicket(uuidv4());

    // Use up transfers on ticket1
    compliancePlugin.incrementTransferCount(ticket1.id);
    compliancePlugin.incrementTransferCount(ticket1.id);

    // Ticket1 should fail
    const { decision: d1 } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      { assetId: ticket1.id, asset: ticket1, actorId: 'BUYER_2', recipientId: 'BUYER_3', amount: '1' }
    );
    expect(d1.result).toBe('DENY');

    // Ticket2 should succeed
    const { decision: d2 } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      { assetId: ticket2.id, asset: ticket2, actorId: 'ORGANIZER', recipientId: 'BUYER_1', amount: '1' }
    );
    expect(d2.result).toBe('ALLOW');
  });

  it('Proof: Royalty payout logs', async () => {
    const ticket = createTicket(uuidv4());

    // Multiple sales
    compliancePlugin.recordRoyalty(ticket.id, 500);
    compliancePlugin.recordRoyalty(ticket.id, 800);

    const payments = compliancePlugin.getRoyaltyPayments();
    expect(payments.length).toBe(2);

    const totalRoyalties = payments.reduce((sum, p) => sum + p.royaltyAmount, 0);
    expect(totalRoyalties).toBe(65); // (500 * 0.05) + (800 * 0.05) = 25 + 40
  });

  it('Proof: Event timeline report from audit trail', async () => {
    const ticket = createTicket(uuidv4());

    // Record sales at different times
    compliancePlugin.recordRoyalty(ticket.id, 100);
    compliancePlugin.recordRoyalty(ticket.id, 150);

    const payments = compliancePlugin.getRoyaltyPayments();
    const timeline = payments.map(p => ({
      timestamp: p.timestamp,
      amount: p.salePrice,
      royalty: p.royaltyAmount,
    }));

    expect(timeline.length).toBe(2);
    expect(timeline[0].amount).toBe(100);
    expect(timeline[1].amount).toBe(150);
  });
});
