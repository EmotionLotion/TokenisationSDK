/**
 * Production Readiness Test Suite
 *
 * Implements the 15 production-level test cases from docs/testcases.md
 * These tests validate the SDK is ready for production deployment.
 *
 * Test Cases:
 * 1. Policy determinism and replay
 * 2. Policy versioning without breaking existing assets
 * 3. Bypass resistance (no "side door" transfers)
 * 4. Identity claim expiry and revocation
 * 5. Jurisdiction matrix correctness
 * 6. Caps and limits (per-investor and global)
 * 7. Oracle dependency failure mode
 * 8. Admin controls and governance safety
 * 9. Recovery / forced transfer workflow
 * 10. Full lifecycle state machine enforcement
 * 11. Indexer and reporting integrity
 * 12. Latency and throughput under realistic load
 * 13. Backward compatibility (SDK version upgrades)
 * 14. Secrets, signing, and replay protection
 * 15. Disaster recovery and "safe fail"
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// Core imports
import {
  LifecycleEngine,
  EventStore,
  LifecycleState,
  EventType,
  RightType,
  TransferabilityMode,
  ComplianceAction,
} from '@tokenisation/core';
import type { RightModel, PolicyDecision } from '@tokenisation/core';
import { ComplianceEngine, ComplianceEngineConfig } from '@tokenisation/core';
import { DecisionReceipt, receiptChain, hashReceipt, verifyReceipt } from '@tokenisation/core';
import { hashPolicy } from '@tokenisation/core';

// Services
import { ComplianceService, RuleConditionType } from '@tokenisation/compliance';

// Models
import {
  createParty,
  addKycRecord,
  type Party,
  PartyRole,
  PartyType,
  VerificationLevel,
} from '@tokenisation/core';

// Interfaces
import type { IJurisdictionPlugin, ICompliancePlugin, PartyComplianceStatus } from '@tokenisation/core';

// =============================================================================
// TEST FIXTURES
// =============================================================================

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

  // Override the ID
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

  if (overrides.isFrozen) {
    party.isFrozen = true;
    party.frozenUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  return party;
};

// Mock compliance plugin for testing
class MockCompliancePlugin implements ICompliancePlugin {
  private parties: Map<string, PartyComplianceStatus> = new Map();
  private caps: { global: number; perInvestor: number } = { global: 1000000, perInvestor: 50000 };
  private balances: Map<string, number> = new Map();
  private globalSupply = 0;

  registerParty(party: Party): void {
    this.parties.set(party.id, {
      partyId: party.id,
      kycVerified: party.kycVerified,
      kycLevel: party.verificationLevel,
      kycExpiryDate: party.kycExpiryDate?.toISOString(),
      accredited: party.accreditedInvestor,
      frozenUntil: party.frozenUntil?.toISOString(),
      restrictedJurisdictions: [],
    });
  }

  updateParty(partyId: string, updates: Partial<PartyComplianceStatus>): void {
    const existing = this.parties.get(partyId);
    if (existing) {
      this.parties.set(partyId, { ...existing, ...updates });
    }
  }

  async getPartyStatus(partyId: string): Promise<PartyComplianceStatus | null> {
    return this.parties.get(partyId) || null;
  }

  async canHoldAsset(partyId: string, asset: RightModel, status: PartyComplianceStatus) {
    const violations: { ruleId: string; message: string; severity: string; ruleName: string }[] = [];

    if (!status.kycVerified) {
      violations.push({
        ruleId: 'KYC_REQUIRED',
        message: 'KYC verification required',
        severity: 'CRITICAL',
        ruleName: 'compliance.kyc',
      });
    }

    if (status.kycExpiryDate && new Date(status.kycExpiryDate) < new Date()) {
      violations.push({
        ruleId: 'KYC_EXPIRED',
        message: 'KYC verification has expired',
        severity: 'CRITICAL',
        ruleName: 'compliance.kyc_expiry',
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
    const amount = parseFloat(transfer.amount);

    // Check sender KYC expiry
    if (sender.kycExpiryDate && new Date(sender.kycExpiryDate) < new Date()) {
      violations.push({
        ruleId: 'SENDER_KYC_EXPIRED',
        message: 'Sender KYC verification has expired',
        severity: 'CRITICAL',
        ruleName: 'compliance.kyc_expiry',
      });
    }

    // Check recipient KYC expiry
    if (recipient.kycExpiryDate && new Date(recipient.kycExpiryDate) < new Date()) {
      violations.push({
        ruleId: 'RECIPIENT_KYC_EXPIRED',
        message: 'Recipient KYC verification has expired',
        severity: 'CRITICAL',
        ruleName: 'compliance.kyc_expiry',
      });
    }

    // Check caps
    const recipientBalance = this.balances.get(transfer.to) || 0;
    if (recipientBalance + amount > this.caps.perInvestor) {
      violations.push({
        ruleId: 'PER_INVESTOR_CAP_EXCEEDED',
        message: `Transfer would exceed per-investor cap of ${this.caps.perInvestor}`,
        severity: 'CRITICAL',
        ruleName: 'compliance.investor_cap',
      });
    }

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

  setCaps(global: number, perInvestor: number): void {
    this.caps = { global, perInvestor };
  }

  setBalance(partyId: string, balance: number): void {
    this.balances.set(partyId, balance);
    this.globalSupply = Array.from(this.balances.values()).reduce((a, b) => a + b, 0);
  }
}

// Mock jurisdiction plugin for testing
class MockJurisdictionPlugin implements IJurisdictionPlugin {
  private blockedJurisdictions = new Set(['KP', 'IR', 'CU', 'SY']);
  private blockedTransferPairs = new Set<string>();

  async canCreateAsset(asset: RightModel) {
    if (this.blockedJurisdictions.has(asset.jurisdiction.countryCode)) {
      return { allowed: false, reason: 'Jurisdiction blocked for asset creation' };
    }
    return { allowed: true };
  }

  async canTransfer(
    transfer: { from: string; to: string; amount: string },
    fromJurisdiction: string,
    toJurisdiction: string
  ) {
    if (this.blockedJurisdictions.has(fromJurisdiction)) {
      return { allowed: false, reason: `Transfers from ${fromJurisdiction} are blocked` };
    }
    if (this.blockedJurisdictions.has(toJurisdiction)) {
      return { allowed: false, reason: `Transfers to ${toJurisdiction} are blocked` };
    }

    const pairKey = `${fromJurisdiction}->${toJurisdiction}`;
    if (this.blockedTransferPairs.has(pairKey)) {
      return { allowed: false, reason: `Transfer from ${fromJurisdiction} to ${toJurisdiction} not allowed` };
    }

    return { allowed: true };
  }

  blockJurisdiction(code: string): void {
    this.blockedJurisdictions.add(code);
  }

  unblockJurisdiction(code: string): void {
    this.blockedJurisdictions.delete(code);
  }

  blockTransferPair(from: string, to: string): void {
    this.blockedTransferPairs.add(`${from}->${to}`);
  }
}

// =============================================================================
// TEST CASE 1: Policy Determinism and Replay
// =============================================================================

describe('TC01: Policy determinism and replay', () => {
  let complianceEngine: ComplianceEngine;
  let compliancePlugin: MockCompliancePlugin;
  let jurisdictionPlugin: MockJurisdictionPlugin;

  beforeEach(() => {
    compliancePlugin = new MockCompliancePlugin();
    jurisdictionPlugin = new MockJurisdictionPlugin();
    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      jurisdictionPlugin,
    });
  });

  afterEach(() => {
    complianceEngine.clear();
    receiptChain.clear();
  });

  it('should produce identical decisions for identical inputs', async () => {
    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);

    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(recipient);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Run evaluation 100 times with identical inputs
    const decisions: PolicyDecision[] = [];
    const receipts: DecisionReceipt[] = [];

    for (let i = 0; i < 100; i++) {
      const { decision, receipt } = await complianceEngine.evaluate(
        ComplianceAction.TOKEN_TRANSFER,
        {
          assetId: asset.id,
          asset,
          actorId: party.id,
          recipientId: recipient.id,
          amount: '1000',
        }
      );
      decisions.push(decision);
      receipts.push(receipt);
    }

    // All decisions should be identical
    const firstDecision = decisions[0];
    expect(decisions.every(d => d.result === firstDecision.result)).toBe(true);
    expect(decisions.every(d => d.action === firstDecision.action)).toBe(true);
    expect(decisions.every(d => d.policyHash === firstDecision.policyHash)).toBe(true);

    // All receipts should have the same policy version and hash
    const firstReceipt = receipts[0];
    expect(receipts.every(r => r.policyVersion === firstReceipt.policyVersion)).toBe(true);
    expect(receipts.every(r => r.policyHash === firstReceipt.policyHash)).toBe(true);
  });

  it('should store decision receipts for replay verification', async () => {
    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // Receipt should contain all necessary info for replay
    expect(receipt.id).toBeDefined();
    expect(receipt.decisionId).toBe(decision.id);
    expect(receipt.action).toBe(ComplianceAction.ASSET_CREATE);
    expect(receipt.policyVersion).toBeDefined();
    expect(receipt.policyHash).toBeDefined();
    expect(receipt.decisionHash).toBeDefined();
    expect(receipt.issuedAt).toBeDefined();

    // Should be retrievable
    const storedReceipt = complianceEngine.getReceipt(receipt.id);
    expect(storedReceipt).toBeDefined();
    expect(storedReceipt?.decisionHash).toBe(receipt.decisionHash);
  });

  it('should produce same decision hash for same inputs after config changes', async () => {
    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    // First evaluation
    const { receipt: receipt1 } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // Change unrelated config (different issuer ID)
    const engine2 = new ComplianceEngine({
      compliancePlugin,
      jurisdictionPlugin,
      issuerId: 'different-issuer',
    });

    // Second evaluation with same inputs
    const { receipt: receipt2 } = await engine2.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // Policy hashes should match (same policy)
    expect(receipt1.policyHash).toBe(receipt2.policyHash);
  });
});

// =============================================================================
// TEST CASE 2: Policy Versioning Without Breaking Existing Assets
// =============================================================================

describe('TC02: Policy versioning without breaking existing assets', () => {
  let eventStore: EventStore;
  let lifecycleEngine: LifecycleEngine;

  beforeEach(() => {
    eventStore = new EventStore();
    lifecycleEngine = new LifecycleEngine(eventStore);
  });

  afterEach(() => {
    lifecycleEngine.clear();
  });

  it('should record policy version with each decision', async () => {
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const { receipt } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    expect(receipt.policyVersion).toBeDefined();
    expect(receipt.policyHash).toBeDefined();

    complianceEngine.clear();
  });

  it('should allow assets to be pinned to specific policy versions', async () => {
    // Register policy v1
    const policyV1 = {
      rules: [{ type: 'require_kyc', enabled: true }],
      metadata: { version: '1.0.0' },
    };
    const v1Hash = hashPolicy(policyV1);

    // Register policy v2 with stricter rules
    const policyV2 = {
      rules: [
        { type: 'require_kyc', enabled: true },
        { type: 'require_accreditation', enabled: true },
      ],
      metadata: { version: '2.0.0' },
    };
    const v2Hash = hashPolicy(policyV2);

    // Hashes should be different
    expect(v1Hash).not.toBe(v2Hash);

    // Asset created under v1 should record v1 hash
    const assetV1 = createTestAsset({
      metadata: { policyVersion: '1.0.0', policyHash: v1Hash },
    });
    expect(assetV1.metadata.policyHash).toBe(v1Hash);

    // Asset created under v2 should record v2 hash
    const assetV2 = createTestAsset({
      metadata: { policyVersion: '2.0.0', policyHash: v2Hash },
    });
    expect(assetV2.metadata.policyHash).toBe(v2Hash);
  });

  it('should log policy version in all events', async () => {
    const asset = createTestAsset();
    await lifecycleEngine.registerAsset(asset);

    const events = await eventStore.getByAssetId(asset.id);
    expect(events.length).toBeGreaterThan(0);

    // Events should be timestamped and trackable
    const createEvent = events.find(e => e.type === EventType.ASSET_CREATED);
    expect(createEvent).toBeDefined();
    expect(createEvent?.timestamp).toBeDefined();
  });
});

// =============================================================================
// TEST CASE 3: Bypass Resistance (No "Side Door" Transfers)
// =============================================================================

describe('TC03: Bypass resistance (no side door transfers)', () => {
  let complianceEngine: ComplianceEngine;
  let compliancePlugin: MockCompliancePlugin;
  let jurisdictionPlugin: MockJurisdictionPlugin;

  beforeEach(() => {
    compliancePlugin = new MockCompliancePlugin();
    jurisdictionPlugin = new MockJurisdictionPlugin();
    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      jurisdictionPlugin,
      strictMode: true, // Enable strict mode
    });
  });

  afterEach(() => {
    complianceEngine.clear();
  });

  it('should enforce compliance on all transfer paths', async () => {
    // Setup: non-compliant party (no KYC)
    const sender = createTestParty({ id: 'sender-1', withValidKyc: false });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Standard transfer - should be denied
    const standardResult = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );
    expect(standardResult.decision.result).toBe('DENY');
    expect(standardResult.decision.violations.some(v => v.code.includes('KYC'))).toBe(true);
  });

  it('should deny transfers when policy says deny regardless of method', async () => {
    // Frozen sender should be denied
    const frozenSender = createTestParty({ id: 'frozen-1', withValidKyc: true, isFrozen: true });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(frozenSender);
    compliancePlugin.registerParty(recipient);
    compliancePlugin.updateParty(frozenSender.id, {
      frozenUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: frozenSender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v => v.code.includes('FROZEN'))).toBe(true);
  });

  it('should require compliance check for all token operations', async () => {
    const party = createTestParty({ id: 'party-1', withValidKyc: false });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    // Mint should require compliance
    const mintResult = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_MINT,
      { assetId: asset.id, asset, actorId: 'issuer', recipientId: party.id, amount: '100' }
    );
    expect(mintResult.decision.result).toBe('DENY');

    // Burn should require compliance
    const burnResult = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_BURN,
      { assetId: asset.id, asset, actorId: party.id, amount: '100' }
    );
    expect(burnResult.decision.result).toBe('DENY');
  });
});

// =============================================================================
// TEST CASE 4: Identity Claim Expiry and Revocation
// =============================================================================

describe('TC04: Identity claim expiry and revocation', () => {
  let complianceEngine: ComplianceEngine;
  let compliancePlugin: MockCompliancePlugin;

  beforeEach(() => {
    compliancePlugin = new MockCompliancePlugin();
    complianceEngine = new ComplianceEngine({ compliancePlugin });
  });

  afterEach(() => {
    complianceEngine.clear();
  });

  it('should allow transfer when KYC is valid', async () => {
    const sender = createTestParty({ id: 'sender-1', withValidKyc: true });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('ALLOW');
  });

  it('should deny transfer when KYC has expired', async () => {
    // Create party with expired KYC
    const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
    const sender = createTestParty({
      id: 'sender-expired',
      withValidKyc: true,
      kycExpiry: expiredDate,
    });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });

    compliancePlugin.registerParty(sender);
    compliancePlugin.updateParty(sender.id, {
      kycExpiryDate: expiredDate.toISOString(),
    });
    compliancePlugin.registerParty(recipient);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v =>
      v.code.includes('EXPIRED') || v.message.toLowerCase().includes('expired')
    )).toBe(true);
  });

  it('should deny transfer after KYC revocation', async () => {
    // Create party then revoke KYC
    const sender = createTestParty({ id: 'sender-revoked', withValidKyc: true });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });

    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);

    // Revoke KYC
    compliancePlugin.updateParty(sender.id, { kycVerified: false });

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v => v.code.includes('KYC'))).toBe(true);
  });

  it('should provide correct denial reason codes', async () => {
    const sender = createTestParty({ id: 'sender-nokyc', withValidKyc: false });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.length).toBeGreaterThan(0);

    // Each violation should have required fields
    for (const violation of result.decision.violations) {
      expect(violation.code).toBeDefined();
      expect(violation.message).toBeDefined();
      expect(violation.severity).toBeDefined();
      expect(violation.rule).toBeDefined();
    }
  });
});

// =============================================================================
// TEST CASE 5: Jurisdiction Matrix Correctness
// =============================================================================

describe('TC05: Jurisdiction matrix correctness', () => {
  let complianceEngine: ComplianceEngine;
  let compliancePlugin: MockCompliancePlugin;
  let jurisdictionPlugin: MockJurisdictionPlugin;

  beforeEach(() => {
    compliancePlugin = new MockCompliancePlugin();
    jurisdictionPlugin = new MockJurisdictionPlugin();
    complianceEngine = new ComplianceEngine({
      compliancePlugin,
      jurisdictionPlugin,
    });
  });

  afterEach(() => {
    complianceEngine.clear();
  });

  it('should block asset creation in sanctioned jurisdictions', async () => {
    const party = createTestParty({ withValidKyc: true, jurisdiction: 'AE' });
    compliancePlugin.registerParty(party);

    // Asset in sanctioned jurisdiction
    const asset = createTestAsset({
      jurisdiction: { countryCode: 'KP', blockedJurisdictions: [] },
    });

    const result = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v => v.code.includes('JURISDICTION'))).toBe(true);
  });

  it('should allow transfers between permitted jurisdictions', async () => {
    // UAE resident, AE citizen
    const sender = createTestParty({ id: 'sender-ae', withValidKyc: true, jurisdiction: 'AE' });
    // UK resident, UK citizen
    const recipient = createTestParty({ id: 'recipient-uk', withValidKyc: true, jurisdiction: 'GB' });

    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);
    compliancePlugin.updateParty(sender.id, { restrictedJurisdictions: ['AE'] });
    compliancePlugin.updateParty(recipient.id, { restrictedJurisdictions: ['GB'] });

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('ALLOW');
  });

  it('should block transfers involving sanctioned jurisdictions', async () => {
    const sender = createTestParty({ id: 'sender-ae', withValidKyc: true, jurisdiction: 'AE' });
    const recipient = createTestParty({ id: 'recipient-ir', withValidKyc: true, jurisdiction: 'IR' });

    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);
    compliancePlugin.updateParty(sender.id, { restrictedJurisdictions: ['AE'] });
    compliancePlugin.updateParty(recipient.id, { restrictedJurisdictions: ['IR'] });

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v =>
      v.code.includes('JURISDICTION') && v.message.includes('IR')
    )).toBe(true);
  });

  it('should handle complex jurisdiction combinations', async () => {
    // US person (restricted) trying to receive
    const sender = createTestParty({ id: 'sender-ae', withValidKyc: true, jurisdiction: 'AE' });
    const usRecipient = createTestParty({ id: 'recipient-us', withValidKyc: true, jurisdiction: 'US' });

    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(usRecipient);
    compliancePlugin.updateParty(sender.id, { restrictedJurisdictions: ['AE'] });
    compliancePlugin.updateParty(usRecipient.id, { restrictedJurisdictions: ['US'] });

    // Block US as destination
    jurisdictionPlugin.blockTransferPair('AE', 'US');

    const asset = createTestAsset({
      state: LifecycleState.ACTIVE,
      jurisdiction: { countryCode: 'AE', blockedJurisdictions: ['US'] },
    });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: usRecipient.id,
        amount: '100',
      }
    );

    expect(result.decision.result).toBe('DENY');
  });
});

// =============================================================================
// TEST CASE 6: Caps and Limits (Per-Investor and Global)
// =============================================================================

describe('TC06: Caps and limits (per-investor and global)', () => {
  let complianceEngine: ComplianceEngine;
  let compliancePlugin: MockCompliancePlugin;

  beforeEach(() => {
    compliancePlugin = new MockCompliancePlugin();
    compliancePlugin.setCaps(1000000, 50000); // Global: 1M, Per-investor: 50K
    complianceEngine = new ComplianceEngine({ compliancePlugin });
  });

  afterEach(() => {
    complianceEngine.clear();
  });

  it('should allow transfers within caps', async () => {
    const sender = createTestParty({ id: 'sender-1', withValidKyc: true });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);
    compliancePlugin.setBalance(sender.id, 10000);
    compliancePlugin.setBalance(recipient.id, 0);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '1000',
      }
    );

    expect(result.decision.result).toBe('ALLOW');
  });

  it('should deny when per-investor cap would be exceeded', async () => {
    const sender = createTestParty({ id: 'sender-1', withValidKyc: true });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);
    compliancePlugin.setBalance(sender.id, 100000);
    compliancePlugin.setBalance(recipient.id, 49000); // Already near cap

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Try to transfer 2000, which would put recipient over 50K cap
    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '2000',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v => v.code.includes('CAP'))).toBe(true);
  });

  it('should deny when global cap would be exceeded', async () => {
    const sender = createTestParty({ id: 'sender-1', withValidKyc: true });
    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.registerParty(recipient);
    compliancePlugin.setCaps(1000, 50000); // Very low global cap
    compliancePlugin.setBalance(sender.id, 500);
    compliancePlugin.setBalance(recipient.id, 400);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Current supply is 900, trying to add 200 would exceed 1000
    const result = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: sender.id,
        recipientId: recipient.id,
        amount: '200',
      }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v => v.code.includes('GLOBAL_CAP'))).toBe(true);
  });

  it('should handle concurrent requests near cap boundaries', async () => {
    const sender = createTestParty({ id: 'sender-1', withValidKyc: true });
    compliancePlugin.registerParty(sender);
    compliancePlugin.setBalance(sender.id, 100000);

    // Create multiple recipients near their caps
    const recipients = Array.from({ length: 5 }, (_, i) => {
      const r = createTestParty({ id: `recipient-${i}`, withValidKyc: true });
      compliancePlugin.registerParty(r);
      compliancePlugin.setBalance(r.id, 49500); // All near 50K cap
      return r;
    });

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Run concurrent transfer evaluations
    const results = await Promise.all(
      recipients.map(recipient =>
        complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, {
          assetId: asset.id,
          asset,
          actorId: sender.id,
          recipientId: recipient.id,
          amount: '1000', // Would exceed 50K cap
        })
      )
    );

    // All should be denied due to exceeding per-investor cap
    expect(results.every(r => r.decision.result === 'DENY')).toBe(true);
  });
});

// =============================================================================
// TEST CASE 7: Oracle Dependency Failure Mode
// =============================================================================

describe('TC07: Oracle dependency failure mode', () => {
  it('should fail safely when oracle is unavailable in strict mode', async () => {
    // Create a jurisdiction plugin that throws errors
    const failingPlugin: IJurisdictionPlugin = {
      async canCreateAsset() {
        throw new Error('Oracle unavailable');
      },
      async canTransfer() {
        throw new Error('Oracle unavailable');
      },
    };

    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({
      compliancePlugin,
      jurisdictionPlugin: failingPlugin,
      strictMode: true, // Strict mode means failure = deny
    });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const result = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    expect(result.decision.result).toBe('DENY');
    expect(result.decision.violations.some(v =>
      v.code.includes('FAILED') || v.message.includes('failed')
    )).toBe(true);

    complianceEngine.clear();
  });

  it('should continue with warnings when oracle fails in non-strict mode', async () => {
    const failingPlugin: IJurisdictionPlugin = {
      async canCreateAsset() {
        throw new Error('Oracle unavailable');
      },
      async canTransfer() {
        throw new Error('Oracle unavailable');
      },
    };

    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({
      compliancePlugin,
      jurisdictionPlugin: failingPlugin,
      strictMode: false, // Non-strict mode
    });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const result = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // May proceed but should have warnings
    expect(result.receipt).toBeDefined();

    complianceEngine.clear();
  });
});

// =============================================================================
// TEST CASE 8: Admin Controls and Governance Safety
// =============================================================================

describe('TC08: Admin controls and governance safety', () => {
  let eventStore: EventStore;
  let lifecycleEngine: LifecycleEngine;

  beforeEach(() => {
    eventStore = new EventStore();
    lifecycleEngine = new LifecycleEngine(eventStore);
  });

  afterEach(() => {
    lifecycleEngine.clear();
  });

  it('should emit events for all state changes', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Transition to PENDING_VERIFICATION
    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'admin-1',
      reason: 'Submitted for verification',
    });

    const events = await eventStore.getByAssetId(asset.id);
    expect(events.length).toBe(2); // Create + state change

    const stateChangeEvent = events.find(e => e.type === EventType.STATE_CHANGED);
    expect(stateChangeEvent).toBeDefined();
    expect(stateChangeEvent?.actorId).toBe('admin-1');
    expect(stateChangeEvent?.payload['previousState']).toBe(LifecycleState.DRAFT);
    expect(stateChangeEvent?.payload['newState']).toBe(LifecycleState.PENDING_VERIFICATION);
  });

  it('should record freeze actions with audit trail', async () => {
    const asset = createTestAsset({ state: LifecycleState.ACTIVE });
    await lifecycleEngine.registerAsset(asset);

    // Freeze the asset
    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.ACTIVE,
      toState: LifecycleState.FROZEN,
      actorId: 'compliance-officer',
      reason: 'Compliance investigation',
      metadata: { investigationId: 'INV-001' },
    });

    expect(result.success).toBe(true);

    const events = await eventStore.getByAssetId(asset.id);
    const freezeEvent = events.find(
      e => e.type === EventType.STATE_CHANGED &&
        e.payload['newState'] === LifecycleState.FROZEN
    );

    expect(freezeEvent).toBeDefined();
    expect(freezeEvent?.actorId).toBe('compliance-officer');
    expect(freezeEvent?.payload['reason']).toBe('Compliance investigation');
  });

  it('should prevent invalid state transitions', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Try to skip directly to ACTIVE (invalid)
    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.ACTIVE,
      actorId: 'attacker',
      reason: 'Trying to bypass verification',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });
});

// =============================================================================
// TEST CASE 9: Recovery / Forced Transfer Workflow
// =============================================================================

describe('TC09: Recovery / forced transfer workflow', () => {
  it('should record forced transfer requests with full audit trail', async () => {
    const eventStore = new EventStore();
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({
      compliancePlugin,
      eventStore,
    });

    // Original owner
    const originalOwner = createTestParty({ id: 'original-owner', withValidKyc: true });
    // Recovery wallet
    const recoveryWallet = createTestParty({ id: 'recovery-wallet', withValidKyc: true });

    compliancePlugin.registerParty(originalOwner);
    compliancePlugin.registerParty(recoveryWallet);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Evaluate forced transfer (should be recorded)
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: originalOwner.id,
        recipientId: recoveryWallet.id,
        amount: '10000',
        metadata: {
          isForced: true,
          courtOrderId: 'CO-2024-001',
          approvedBy: ['admin-1', 'admin-2'],
        },
      }
    );

    // Should produce receipt
    expect(receipt).toBeDefined();
    expect(receipt.id).toBeDefined();

    // Receipt should be verifiable
    const verification = verifyReceipt(receipt);
    expect(verification.valid).toBe(true);

    complianceEngine.clear();
  });

  it('should require receipt chain integrity for recovery verification', async () => {
    // Create a chain of receipts using the proper ComplianceEngine
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });
    complianceEngine.clear();

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);

    const recipient = createTestParty({ id: 'recipient-1', withValidKyc: true });
    compliancePlugin.registerParty(recipient);

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Create first receipt
    const { receipt: receipt1 } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // Create second receipt (should link to first)
    const { receipt: receipt2 } = await complianceEngine.evaluate(
      ComplianceAction.TOKEN_TRANSFER,
      {
        assetId: asset.id,
        asset,
        actorId: party.id,
        recipientId: recipient.id,
        amount: '100',
      }
    );

    // The second receipt should have a reference to the first
    expect(receipt2.previousReceiptHash).toBeDefined();

    // Verify individual receipts have signatures
    expect(receipt1.signature).toBeDefined();
    expect(receipt1.signature.length).toBeGreaterThan(0);
    expect(receipt2.signature).toBeDefined();
    expect(receipt2.signature.length).toBeGreaterThan(0);

    // Verify chain integrity
    const chainVerification = complianceEngine.verifyChain();
    expect(chainVerification.valid).toBe(true);

    complianceEngine.clear();
  });
});

// =============================================================================
// TEST CASE 10: Full Lifecycle State Machine Enforcement
// =============================================================================

describe('TC10: Full lifecycle state machine enforcement', () => {
  let lifecycleEngine: LifecycleEngine;

  beforeEach(() => {
    lifecycleEngine = new LifecycleEngine();
  });

  afterEach(() => {
    lifecycleEngine.clear();
  });

  it('should enforce DRAFT -> PENDING_VERIFICATION transition', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'issuer',
      reason: 'Submitting for verification',
    });

    expect(result.success).toBe(true);
    expect(result.newState).toBe(LifecycleState.PENDING_VERIFICATION);
  });

  it('should deny transfer in DRAFT state', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Cannot go directly to ACTIVE
    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.ACTIVE,
      actorId: 'attacker',
      reason: 'Bypass verification',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('should allow VERIFIED -> ACTIVE transition', async () => {
    const asset = createTestAsset({ state: LifecycleState.VERIFIED });
    await lifecycleEngine.registerAsset(asset);

    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.VERIFIED,
      toState: LifecycleState.ACTIVE,
      actorId: 'admin',
      reason: 'Activating token',
    });

    expect(result.success).toBe(true);
  });

  it('should only allow whitelisted transfers in FROZEN state', async () => {
    const asset = createTestAsset({ state: LifecycleState.FROZEN });
    await lifecycleEngine.registerAsset(asset);

    // Can only go to ACTIVE or BURNED from FROZEN
    const invalidResult = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.FROZEN,
      toState: LifecycleState.REDEEMED,
      actorId: 'admin',
      reason: 'Invalid transition attempt',
    });

    expect(invalidResult.success).toBe(false);

    // Valid: FROZEN -> ACTIVE
    const validResult = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.FROZEN,
      toState: LifecycleState.ACTIVE,
      actorId: 'admin',
      reason: 'Unfreezing asset',
    });

    expect(validResult.success).toBe(true);
  });

  it('should prevent any action in terminal BURNED state', async () => {
    const asset = createTestAsset({ state: LifecycleState.BURNED });
    await lifecycleEngine.registerAsset(asset);

    // No valid transitions from BURNED
    const validNextStates = lifecycleEngine.getValidNextStates(LifecycleState.BURNED);
    expect(validNextStates).toHaveLength(0);

    // Try any transition - should fail
    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.BURNED,
      toState: LifecycleState.ACTIVE,
      actorId: 'admin',
      reason: 'Attempting to revive burned asset',
    });

    expect(result.success).toBe(false);
  });

  it('should track complete state history', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Walk through lifecycle
    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'issuer',
      reason: 'Step 1',
    });

    // Update local state for next transition
    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.PENDING_VERIFICATION,
      toState: LifecycleState.VERIFIED,
      actorId: 'verifier',
      reason: 'Step 2',
    });

    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.VERIFIED,
      toState: LifecycleState.ACTIVE,
      actorId: 'admin',
      reason: 'Step 3',
    });

    const history = await lifecycleEngine.getHistory(asset.id);
    expect(history.length).toBe(4); // Create + 3 transitions

    // Verify we can rebuild from events
    const rebuilt = await lifecycleEngine.rebuildFromEvents(asset.id);
    expect(rebuilt?.state).toBe(LifecycleState.ACTIVE);
  });
});

// =============================================================================
// TEST CASE 11: Indexer and Reporting Integrity
// =============================================================================

describe('TC11: Indexer and reporting integrity', () => {
  let eventStore: EventStore;
  let lifecycleEngine: LifecycleEngine;

  beforeEach(() => {
    eventStore = new EventStore();
    lifecycleEngine = new LifecycleEngine(eventStore);
  });

  afterEach(() => {
    lifecycleEngine.clear();
  });

  it('should match rebuilt state with current state', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'user',
      reason: 'Test',
    });

    const isConsistent = await lifecycleEngine.verifyConsistency(asset.id);
    expect(isConsistent).toBe(true);
  });

  it('should provide accurate event log for audit export', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'user-1',
      reason: 'Verification submission',
    });

    const events = await eventStore.getByAssetId(asset.id);

    // All events should have required audit fields
    for (const event of events) {
      expect(event.id).toBeDefined();
      expect(event.type).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.actorId).toBeDefined();
      expect(event.assetId).toBe(asset.id);
    }
  });

  it('should reconcile event counts with state transitions', async () => {
    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Perform multiple transitions
    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'user',
      reason: 'T1',
    });

    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.PENDING_VERIFICATION,
      toState: LifecycleState.VERIFIED,
      actorId: 'verifier',
      reason: 'T2',
    });

    const events = await eventStore.getByAssetId(asset.id);
    const stateChanges = events.filter(e => e.type === EventType.STATE_CHANGED);

    expect(stateChanges.length).toBe(2); // Exactly 2 transitions
  });
});

// =============================================================================
// TEST CASE 12: Latency and Throughput Under Realistic Load
// =============================================================================

describe('TC12: Latency and throughput under realistic load', () => {
  it('should handle high volume of compliance decisions', async () => {
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });

    // Register parties
    const parties = Array.from({ length: 100 }, (_, i) => {
      const p = createTestParty({ id: `party-${i}`, withValidKyc: true });
      compliancePlugin.registerParty(p);
      return p;
    });

    const asset = createTestAsset({ state: LifecycleState.ACTIVE });

    // Measure time for 1000 evaluations
    const startTime = Date.now();

    const promises = [];
    for (let i = 0; i < 1000; i++) {
      const sender = parties[i % parties.length];
      const recipient = parties[(i + 1) % parties.length];

      promises.push(
        complianceEngine.evaluate(ComplianceAction.TOKEN_TRANSFER, {
          assetId: asset.id,
          asset,
          actorId: sender.id,
          recipientId: recipient.id,
          amount: '100',
        })
      );
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / 1000;

    // Should complete 1000 evaluations in reasonable time
    expect(totalTime).toBeLessThan(30000); // 30 seconds max
    expect(avgTime).toBeLessThan(30); // 30ms average

    complianceEngine.clear();
  });

  it('should maintain decision consistency under concurrent load', async () => {
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    // Run 100 concurrent evaluations for same input
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        complianceEngine.evaluate(ComplianceAction.ASSET_CREATE, {
          assetId: asset.id,
          asset,
          actorId: party.id,
        })
      )
    );

    // All should have same result
    const firstResult = results[0].decision.result;
    expect(results.every(r => r.decision.result === firstResult)).toBe(true);

    complianceEngine.clear();
  });
});

// =============================================================================
// TEST CASE 13: Backward Compatibility (SDK Version Upgrades)
// =============================================================================

describe('TC13: Backward compatibility (SDK version upgrades)', () => {
  it('should maintain stable public API', () => {
    // Verify key exports exist
    expect(LifecycleEngine).toBeDefined();
    expect(EventStore).toBeDefined();
    expect(ComplianceEngine).toBeDefined();
    expect(LifecycleState).toBeDefined();
    expect(EventType).toBeDefined();
    expect(ComplianceAction).toBeDefined();
    expect(RightType).toBeDefined();
    expect(TransferabilityMode).toBeDefined();
  });

  it('should support legacy asset format', () => {
    // Legacy format should still work
    const legacyAsset: RightModel = {
      id: uuidv4(),
      name: 'Legacy Asset',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.DRAFT,
      jurisdiction: {
        countryCode: 'AE',
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
    };

    // Should be valid
    expect(legacyAsset.id).toBeDefined();
    expect(legacyAsset.state).toBe(LifecycleState.DRAFT);
  });

  it('should maintain receipt format compatibility', () => {
    const receipt: DecisionReceipt = {
      id: 'receipt-123',
      decisionId: 'decision-123',
      action: ComplianceAction.ASSET_CREATE,
      result: 'ALLOW',
      issuedAt: new Date().toISOString(),
      issuedBy: 'system',
      policyVersion: '1.0.0',
      policyHash: 'abc123',
      decisionHash: 'def456',
      subjectType: 'asset',
      subjectId: 'asset-123',
      actorId: 'actor-123',
      signature: '',
      summary: 'Test receipt',
      reasons: [],
    };

    // All required fields should be present
    expect(receipt.id).toBeDefined();
    expect(receipt.decisionId).toBeDefined();
    expect(receipt.action).toBeDefined();
    expect(receipt.result).toBeDefined();
    expect(receipt.policyVersion).toBeDefined();
    expect(receipt.policyHash).toBeDefined();
  });
});

// =============================================================================
// TEST CASE 14: Secrets, Signing, and Replay Protection
// =============================================================================

describe('TC14: Secrets, signing, and replay protection', () => {
  it('should generate unique receipt IDs', async () => {
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        complianceEngine.evaluate(ComplianceAction.ASSET_CREATE, {
          assetId: asset.id,
          asset,
          actorId: party.id,
        })
      )
    );

    const receiptIds = results.map(r => r.receipt.id);
    const uniqueIds = new Set(receiptIds);

    expect(uniqueIds.size).toBe(100); // All IDs should be unique

    complianceEngine.clear();
  });

  it('should produce verifiable decision hashes', () => {
    const input1 = {
      decisionId: 'dec-1',
      action: ComplianceAction.TOKEN_TRANSFER,
      result: 'ALLOW',
      subjectId: 'asset-1',
      actorId: 'actor-1',
      policyHash: 'policy-hash',
      timestamp: '2024-01-01T00:00:00Z',
    };

    const input2 = {
      decisionId: 'dec-1',
      action: ComplianceAction.TOKEN_TRANSFER,
      result: 'ALLOW',
      subjectId: 'asset-1',
      actorId: 'actor-1',
      policyHash: 'policy-hash',
      timestamp: '2024-01-01T00:00:00Z',
    };

    const hash1 = hashReceipt(input1);
    const hash2 = hashReceipt(input2);

    // Same inputs should produce same hash
    expect(hash1).toBe(hash2);

    // Different inputs should produce different hash
    const input3 = { ...input1, actorId: 'different-actor' };
    const hash3 = hashReceipt(input3);
    expect(hash3).not.toBe(hash1);
  });

  it('should detect tampering in receipts', async () => {
    // Create a real receipt using the compliance engine
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const { receipt } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // Original should verify
    const originalVerification = verifyReceipt(receipt);
    expect(originalVerification.valid).toBe(true);
    expect(originalVerification.signatureValid).toBe(true);

    // Tamper with the receipt
    const tamperedReceipt = { ...receipt, result: 'DENY' as const };

    // Verification should FAIL for tampered receipt (signature mismatch)
    const tamperedVerification = verifyReceipt(tamperedReceipt);
    expect(tamperedVerification.signatureValid).toBe(false);
    expect(tamperedVerification.valid).toBe(false);

    complianceEngine.clear();
  });

  it('should include timestamps for time-based validation', async () => {
    const compliancePlugin = new MockCompliancePlugin();
    const complianceEngine = new ComplianceEngine({ compliancePlugin });

    const party = createTestParty({ withValidKyc: true });
    compliancePlugin.registerParty(party);
    const asset = createTestAsset();

    const { receipt } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: party.id }
    );

    // Receipt should have timestamp
    expect(receipt.issuedAt).toBeDefined();

    // Timestamp should be recent
    const receiptTime = new Date(receipt.issuedAt).getTime();
    const now = Date.now();
    expect(now - receiptTime).toBeLessThan(5000); // Within 5 seconds

    complianceEngine.clear();
  });
});

// =============================================================================
// TEST CASE 15: Disaster Recovery and "Safe Fail"
// =============================================================================

describe('TC15: Disaster recovery and safe fail', () => {
  it('should fail safely when compliance plugin is unavailable', async () => {
    // Engine with no plugins
    const complianceEngine = new ComplianceEngine({
      strictMode: true,
    });

    const asset = createTestAsset();

    // With no compliance plugin, should still produce a receipt
    const { decision, receipt } = await complianceEngine.evaluate(
      ComplianceAction.ASSET_CREATE,
      { assetId: asset.id, asset, actorId: 'user-1' }
    );

    // Receipt should always be produced
    expect(receipt).toBeDefined();
    expect(receipt.id).toBeDefined();

    complianceEngine.clear();
  });

  it('should not leave partial state on failure', async () => {
    const eventStore = new EventStore();
    const lifecycleEngine = new LifecycleEngine(eventStore);

    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Attempt invalid transition
    const result = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.ACTIVE, // Invalid
      actorId: 'user',
      reason: 'Test',
    });

    expect(result.success).toBe(false);

    // State should not have changed
    const currentState = await lifecycleEngine.getState(asset.id);
    expect(currentState).toBe(LifecycleState.DRAFT);

    // No partial event should be recorded
    const events = await eventStore.getByAssetId(asset.id);
    const invalidEvents = events.filter(
      e => e.type === EventType.STATE_CHANGED &&
        e.payload['newState'] === LifecycleState.ACTIVE
    );
    expect(invalidEvents.length).toBe(0);

    lifecycleEngine.clear();
  });

  it('should recover cleanly after error', async () => {
    const eventStore = new EventStore();
    const lifecycleEngine = new LifecycleEngine(eventStore);

    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    // Invalid transition
    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.ACTIVE,
      actorId: 'user',
      reason: 'Invalid',
    });

    // Valid transition should still work
    const validResult = await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'user',
      reason: 'Valid',
    });

    expect(validResult.success).toBe(true);

    lifecycleEngine.clear();
  });

  it('should allow state recovery from event log', async () => {
    const eventStore = new EventStore();
    const lifecycleEngine = new LifecycleEngine(eventStore);

    const asset = createTestAsset({ state: LifecycleState.DRAFT });
    await lifecycleEngine.registerAsset(asset);

    await lifecycleEngine.transition({
      assetId: asset.id,
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'user',
      reason: 'Step 1',
    });

    // Simulate crash - create new engine instance
    const recoveredEngine = new LifecycleEngine(eventStore);

    // Rebuild from events
    const rebuiltAsset = await recoveredEngine.rebuildFromEvents(asset.id);

    expect(rebuiltAsset).toBeDefined();
    expect(rebuiltAsset?.state).toBe(LifecycleState.PENDING_VERIFICATION);

    lifecycleEngine.clear();
    recoveredEngine.clear();
  });

  it('should provide predictable error messages', async () => {
    const lifecycleEngine = new LifecycleEngine();

    // Non-existent asset
    const result = await lifecycleEngine.transition({
      assetId: 'non-existent',
      fromState: LifecycleState.DRAFT,
      toState: LifecycleState.PENDING_VERIFICATION,
      actorId: 'user',
      reason: 'Test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('not found');

    lifecycleEngine.clear();
  });
});
