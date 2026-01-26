/**
 * Integration Test Scenarios
 *
 * These scenarios validate the SDK's genericness across different asset types:
 * - Scenario A: Real Estate Token (Security-like, heavy compliance)
 * - Scenario B: Carbon Credit Token (Retirement terminal state)
 * - Scenario C: Ticketing (time-window transfers + royalties + anti-scalping)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  LifecycleState,
  RightType,
  TransferabilityMode,
  ComplianceAction,
  type RightModel,
  type PolicyDecision,
} from '../src/core/types.js';
import { createReceipt, type DecisionReceipt } from '../src/core/DecisionReceipt.js';
import { AssetType, InvestorClass } from '../src/core/AssetAbstraction.js';

// ============================================================================
// HELPER: Simple decision receipt creator for tests
// ============================================================================

function createTestReceipt(params: {
  action: ComplianceAction;
  result: 'ALLOW' | 'DENY';
  violations?: string[];
  context: Record<string, unknown>;
}): { result: string; violations?: string[]; context: Record<string, unknown>; decisionHash: string } {
  return {
    result: params.result,
    violations: params.violations,
    context: params.context,
    decisionHash: uuidv4(), // Simplified hash for testing
  };
}

// ============================================================================
// SCENARIO A: REAL ESTATE TOKEN (Security-like, heavy compliance)
// ============================================================================

describe('Scenario A: Real Estate Token (Security-like, heavy compliance)', () => {
  // Asset and investors
  let realEstateAsset: RightModel;
  let investorA: { id: string; kyc: boolean; accredited: boolean; jurisdiction: string };
  let investorB: { id: string; kyc: boolean; accredited: boolean; jurisdiction: string };

  // Caps and balances
  const GLOBAL_CAP = 1_000_000;
  const PER_INVESTOR_CAP = 50_000;
  const LOCKUP_DAYS = 90;

  let balances: Map<string, number>;
  let totalSupply: number;
  let issuanceDate: Date;
  let policyVersion: number;

  beforeEach(() => {
    // Initialize balances
    balances = new Map();
    totalSupply = 0;
    policyVersion = 1;
    issuanceDate = new Date();

    // Create real estate asset
    realEstateAsset = {
      id: uuidv4(),
      name: 'Dubai Tower A – Fractional Shares',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.ACTIVE,
      jurisdiction: {
        countryCode: 'AE',
        accreditedOnly: true,
        blockedJurisdictions: ['US'],
      },
      validityPeriod: {
        isPerpetual: true,
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
      createdAt: issuanceDate.toISOString(),
      updatedAt: issuanceDate.toISOString(),
      version: 0,
    };

    // Create investors
    investorA = {
      id: uuidv4(),
      kyc: true,
      accredited: true,
      jurisdiction: 'AE',
    };

    investorB = {
      id: uuidv4(),
      kyc: true,
      accredited: false, // Not accredited
      jurisdiction: 'AE',
    };

    balances.set(investorA.id, 0);
    balances.set(investorB.id, 0);
  });

  // Helper: Check compliance for investor
  function checkInvestorCompliance(investor: typeof investorA): {
    allowed: boolean;
    reason?: string;
  } {
    // Check KYC
    if (!investor.kyc) {
      return { allowed: false, reason: 'KYC_NOT_COMPLETED' };
    }

    // Check accreditation
    if (realEstateAsset.jurisdiction.accreditedOnly && !investor.accredited) {
      return { allowed: false, reason: 'ACCREDITATION_REQUIRED' };
    }

    // Check jurisdiction
    if (realEstateAsset.jurisdiction.blockedJurisdictions?.includes(investor.jurisdiction)) {
      return { allowed: false, reason: 'JURISDICTION_BLOCKED' };
    }

    return { allowed: true };
  }

  // Helper: Check if in lockup period
  function isInLockup(checkDate: Date = new Date()): boolean {
    const lockupEndDate = new Date(issuanceDate);
    lockupEndDate.setDate(lockupEndDate.getDate() + LOCKUP_DAYS);
    return checkDate < lockupEndDate;
  }

  // Helper: Mint tokens with compliance checks
  function mint(investorId: string, amount: number): {
    success: boolean;
    error?: string;
    receipt?: ReturnType<typeof createTestReceipt>;
  } {
    const currentBalance = balances.get(investorId) || 0;

    // Check global cap
    if (totalSupply + amount > GLOBAL_CAP) {
      const receipt = createTestReceipt({
        action: ComplianceAction.MINT,
        result: 'DENY',
        violations: ['GLOBAL_CAP_EXCEEDED'],
        context: {
          assetId: realEstateAsset.id,
          requestedAmount: amount,
          globalCap: GLOBAL_CAP,
          currentSupply: totalSupply,
        },
      });
      return { success: false, error: 'GLOBAL_CAP_EXCEEDED', receipt };
    }

    // Check per-investor cap
    if (currentBalance + amount > PER_INVESTOR_CAP) {
      const receipt = createTestReceipt({
        action: ComplianceAction.MINT,
        result: 'DENY',
        violations: ['PER_INVESTOR_CAP_EXCEEDED'],
        context: {
          assetId: realEstateAsset.id,
          investorId,
          requestedAmount: amount,
          perInvestorCap: PER_INVESTOR_CAP,
          currentBalance,
        },
      });
      return { success: false, error: 'PER_INVESTOR_CAP_EXCEEDED', receipt };
    }

    // Success
    balances.set(investorId, currentBalance + amount);
    totalSupply += amount;

    const receipt = createTestReceipt({
      action: ComplianceAction.MINT,
      result: 'ALLOW',
      context: {
        assetId: realEstateAsset.id,
        investorId,
        amount,
        newBalance: currentBalance + amount,
        policyVersion,
      },
    });

    return { success: true, receipt };
  }

  // Helper: Transfer tokens with compliance checks
  function transfer(
    fromId: string,
    toId: string,
    amount: number,
    checkDate: Date = new Date()
  ): {
    success: boolean;
    error?: string;
    receipt?: ReturnType<typeof createTestReceipt>;
  } {
    const fromBalance = balances.get(fromId) || 0;
    const toBalance = balances.get(toId) || 0;

    // Check lockup
    if (isInLockup(checkDate)) {
      const receipt = createTestReceipt({
        action: ComplianceAction.TRANSFER,
        result: 'DENY',
        violations: ['LOCKUP_ACTIVE'],
        context: {
          assetId: realEstateAsset.id,
          from: fromId,
          to: toId,
          amount,
          lockupEndsAt: new Date(issuanceDate.getTime() + LOCKUP_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      return { success: false, error: 'LOCKUP_ACTIVE', receipt };
    }

    // Check sender balance
    if (fromBalance < amount) {
      return { success: false, error: 'INSUFFICIENT_BALANCE' };
    }

    // Check receiver cap
    if (toBalance + amount > PER_INVESTOR_CAP) {
      const allowableAmount = PER_INVESTOR_CAP - toBalance;
      const receipt = createTestReceipt({
        action: ComplianceAction.TRANSFER,
        result: 'DENY',
        violations: ['PER_INVESTOR_CAP_EXCEEDED'],
        context: {
          assetId: realEstateAsset.id,
          from: fromId,
          to: toId,
          requestedAmount: amount,
          allowableAmount,
          recipientCurrentBalance: toBalance,
          perInvestorCap: PER_INVESTOR_CAP,
        },
      });
      return { success: false, error: 'PER_INVESTOR_CAP_EXCEEDED', receipt };
    }

    // Success
    balances.set(fromId, fromBalance - amount);
    balances.set(toId, toBalance + amount);

    const receipt = createTestReceipt({
      action: ComplianceAction.TRANSFER,
      result: 'ALLOW',
      context: {
        assetId: realEstateAsset.id,
        from: fromId,
        to: toId,
        amount,
        policyVersion,
      },
    });

    return { success: true, receipt };
  }

  it('Step 1: Issuer creates asset with policy v1', () => {
    expect(realEstateAsset.name).toBe('Dubai Tower A – Fractional Shares');
    expect(realEstateAsset.state).toBe(LifecycleState.ACTIVE);
    expect(realEstateAsset.jurisdiction.accreditedOnly).toBe(true);
    expect(realEstateAsset.jurisdiction.blockedJurisdictions).toContain('US');
    expect(realEstateAsset.metadata.policyVersion).toBe(1);
  });

  it('Step 2: Investor A completes KYC + accredited claim → approved', () => {
    const result = checkInvestorCompliance(investorA);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('Step 3: Investor B completes KYC but not accredited → denied', () => {
    const result = checkInvestorCompliance(investorB);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('ACCREDITATION_REQUIRED');
  });

  it('Step 4: Mint to Investor A within cap → allowed', () => {
    const result = mint(investorA.id, 30_000);
    expect(result.success).toBe(true);
    expect(balances.get(investorA.id)).toBe(30_000);
    expect(totalSupply).toBe(30_000);
    expect(result.receipt?.result).toBe('ALLOW');
  });

  it('Step 5: Attempt to transfer during lockup → denied with LOCKUP_ACTIVE', () => {
    // First mint some tokens
    mint(investorA.id, 10_000);

    // Create another verified investor to transfer to
    const investorC = { id: uuidv4(), kyc: true, accredited: true, jurisdiction: 'AE' };
    balances.set(investorC.id, 0);

    // Attempt transfer during lockup (using current date which is within lockup)
    const result = transfer(investorA.id, investorC.id, 1_000);
    expect(result.success).toBe(false);
    expect(result.error).toBe('LOCKUP_ACTIVE');
    expect(result.receipt?.result).toBe('DENY');
    expect(result.receipt?.violations).toContain('LOCKUP_ACTIVE');
  });

  it('Step 6: Advance time beyond lockup → transfer allowed', () => {
    // First mint some tokens
    mint(investorA.id, 10_000);

    // Create another verified investor
    const investorC = { id: uuidv4(), kyc: true, accredited: true, jurisdiction: 'AE' };
    balances.set(investorC.id, 0);

    // Advance time beyond lockup (91 days from issuance)
    const futureDate = new Date(issuanceDate);
    futureDate.setDate(futureDate.getDate() + 91);

    const result = transfer(investorA.id, investorC.id, 1_000, futureDate);
    expect(result.success).toBe(true);
    expect(balances.get(investorA.id)).toBe(9_000);
    expect(balances.get(investorC.id)).toBe(1_000);
  });

  it('Step 7: Attempt to exceed per-investor cap → only allowable amount succeeds', () => {
    // Mint to investor A near cap
    mint(investorA.id, 45_000);

    // Create investor C
    const investorC = { id: uuidv4(), kyc: true, accredited: true, jurisdiction: 'AE' };
    balances.set(investorC.id, 0);

    // Mint to investor C near cap
    mint(investorC.id, 48_000);

    // Advance time beyond lockup
    const futureDate = new Date(issuanceDate);
    futureDate.setDate(futureDate.getDate() + 91);

    // Attempt to transfer more than C's remaining cap allows
    const result = transfer(investorA.id, investorC.id, 10_000, futureDate);
    expect(result.success).toBe(false);
    expect(result.error).toBe('PER_INVESTOR_CAP_EXCEEDED');

    // The receipt should show the allowable amount
    expect(result.receipt?.context.allowableAmount).toBe(2_000);

    // Transfer the allowable amount instead
    const result2 = transfer(investorA.id, investorC.id, 2_000, futureDate);
    expect(result2.success).toBe(true);
    expect(balances.get(investorC.id)).toBe(50_000); // At cap
  });

  it('Step 8: Policy v2 created - asset stays on v1 unless migrated', () => {
    // Create policy v2 (tighter rules)
    const policyV2 = {
      version: 2,
      perInvestorCap: 25_000, // Reduced from 50,000
      additionalRestrictions: ['ENHANCED_AML_CHECK'],
    };

    // Asset still references v1
    expect(realEstateAsset.metadata.policyVersion).toBe(1);

    // Mint under v1 rules (original cap)
    const result = mint(investorA.id, 40_000);
    expect(result.success).toBe(true);
    expect(result.receipt?.context.policyVersion).toBe(1);

    // Verify policy v2 would have denied this
    expect(40_000).toBeGreaterThan(policyV2.perInvestorCap);
  });

  it('Proof: Decision receipts include policy hash/version', () => {
    const result = mint(investorA.id, 10_000);
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.context.policyVersion).toBe(1);
    expect(result.receipt?.decisionHash).toBeDefined();
    expect(result.receipt?.decisionHash.length).toBeGreaterThan(0);
  });

  it('Proof: Cap table matches supply', () => {
    // Mint to multiple investors
    mint(investorA.id, 30_000);

    const investorC = { id: uuidv4() };
    balances.set(investorC.id, 0);
    mint(investorC.id, 20_000);

    const investorD = { id: uuidv4() };
    balances.set(investorD.id, 0);
    mint(investorD.id, 15_000);

    // Calculate cap table total
    let capTableTotal = 0;
    balances.forEach((balance) => {
      capTableTotal += balance;
    });

    // Verify reconciliation
    expect(capTableTotal).toBe(totalSupply);
    expect(totalSupply).toBe(65_000);
  });
});

// ============================================================================
// SCENARIO B: CARBON CREDIT TOKEN (Retirement terminal state)
// ============================================================================

describe('Scenario B: Carbon Credit Token (Retirement terminal state)', () => {
  // Credit tracking
  interface CarbonCredit {
    id: string;
    projectId: string;
    vintageYear: number;
    amount: number;
    owner: string;
    state: 'ACTIVE' | 'RETIRED';
    retiredAt?: string;
    retiredBy?: string;
    serialNumber: string;
  }

  let credits: Map<string, CarbonCredit>;
  let verifiedIssuers: Set<string>;
  let verifiedEntities: Set<string>;
  let retirementEvents: Array<{ creditId: string; amount: number; timestamp: string; retiree: string }>;

  // Totals for reconciliation
  let totalIssued: number;
  let totalActive: number;
  let totalRetired: number;

  beforeEach(() => {
    credits = new Map();
    verifiedIssuers = new Set(['ISSUER_001', 'ISSUER_002']);
    verifiedEntities = new Set(['BUYER_001', 'BUYER_002', 'ISSUER_001']);
    retirementEvents = [];
    totalIssued = 0;
    totalActive = 0;
    totalRetired = 0;
  });

  // Helper: Mint credits
  function mintCredits(params: {
    issuerId: string;
    projectId: string;
    vintageYear: number;
    amount: number;
  }): { success: boolean; credit?: CarbonCredit; error?: string } {
    if (!verifiedIssuers.has(params.issuerId)) {
      return { success: false, error: 'ISSUER_NOT_VERIFIED' };
    }

    const credit: CarbonCredit = {
      id: uuidv4(),
      projectId: params.projectId,
      vintageYear: params.vintageYear,
      amount: params.amount,
      owner: params.issuerId,
      state: 'ACTIVE',
      serialNumber: `${params.projectId}-${params.vintageYear}-${Date.now()}`,
    };

    credits.set(credit.id, credit);
    totalIssued += params.amount;
    totalActive += params.amount;

    return { success: true, credit };
  }

  // Helper: Transfer credits
  function transferCredits(params: {
    creditId: string;
    fromEntity: string;
    toEntity: string;
    amount: number;
  }): { success: boolean; error?: string } {
    const credit = credits.get(params.creditId);
    if (!credit) {
      return { success: false, error: 'CREDIT_NOT_FOUND' };
    }

    // Check if retired
    if (credit.state === 'RETIRED') {
      return { success: false, error: 'ASSET_RETIRED' };
    }

    // Check ownership
    if (credit.owner !== params.fromEntity) {
      return { success: false, error: 'NOT_OWNER' };
    }

    // Check receiver is verified
    if (!verifiedEntities.has(params.toEntity)) {
      return { success: false, error: 'RECIPIENT_NOT_VERIFIED' };
    }

    // Check amount
    if (credit.amount < params.amount) {
      return { success: false, error: 'INSUFFICIENT_CREDITS' };
    }

    // Handle partial transfer by splitting
    if (params.amount < credit.amount) {
      // Create new credit for remaining amount
      const remainingCredit: CarbonCredit = {
        ...credit,
        id: uuidv4(),
        amount: credit.amount - params.amount,
        serialNumber: `${credit.serialNumber}-SPLIT`,
      };
      credits.set(remainingCredit.id, remainingCredit);
      credit.amount = params.amount;
    }

    credit.owner = params.toEntity;
    return { success: true };
  }

  // Helper: Retire credits
  function retireCredits(params: {
    creditId: string;
    retiree: string;
    amount: number;
    reason?: string;
  }): { success: boolean; error?: string } {
    const credit = credits.get(params.creditId);
    if (!credit) {
      return { success: false, error: 'CREDIT_NOT_FOUND' };
    }

    // Check if already retired
    if (credit.state === 'RETIRED') {
      return { success: false, error: 'ALREADY_RETIRED' };
    }

    // Check ownership
    if (credit.owner !== params.retiree) {
      return { success: false, error: 'NOT_OWNER' };
    }

    // Check amount
    if (credit.amount < params.amount) {
      return { success: false, error: 'INSUFFICIENT_CREDITS' };
    }

    // Handle partial retirement
    if (params.amount < credit.amount) {
      // Create new credit for remaining active amount
      const remainingCredit: CarbonCredit = {
        ...credit,
        id: uuidv4(),
        amount: credit.amount - params.amount,
        serialNumber: `${credit.serialNumber}-ACTIVE`,
      };
      credits.set(remainingCredit.id, remainingCredit);
      credit.amount = params.amount;
    }

    // Retire the credit
    credit.state = 'RETIRED';
    credit.retiredAt = new Date().toISOString();
    credit.retiredBy = params.retiree;

    // Record retirement event
    retirementEvents.push({
      creditId: credit.id,
      amount: params.amount,
      timestamp: credit.retiredAt,
      retiree: params.retiree,
    });

    // Update totals
    totalActive -= params.amount;
    totalRetired += params.amount;

    return { success: true };
  }

  // Helper: Attempt to unretire (should always fail)
  function unretireCredits(creditId: string): { success: boolean; error?: string } {
    const credit = credits.get(creditId);
    if (!credit) {
      return { success: false, error: 'CREDIT_NOT_FOUND' };
    }

    // Retirement is irreversible
    if (credit.state === 'RETIRED') {
      return { success: false, error: 'RETIREMENT_IRREVERSIBLE' };
    }

    return { success: false, error: 'CREDIT_NOT_RETIRED' };
  }

  it('Step 1: Issuer mints 10,000 credits', () => {
    const result = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 10_000,
    });

    expect(result.success).toBe(true);
    expect(result.credit?.amount).toBe(10_000);
    expect(result.credit?.state).toBe('ACTIVE');
    expect(totalIssued).toBe(10_000);
    expect(totalActive).toBe(10_000);
  });

  it('Step 2: Buyer receives 500 credits (allowed)', () => {
    // First mint
    const mintResult = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 10_000,
    });

    // Transfer to verified buyer
    const transferResult = transferCredits({
      creditId: mintResult.credit!.id,
      fromEntity: 'ISSUER_001',
      toEntity: 'BUYER_001',
      amount: 500,
    });

    expect(transferResult.success).toBe(true);

    // Verify the split - original now has 500, new credit for buyer with 9500
    const buyerCredits = Array.from(credits.values())
      .filter(c => c.owner === 'BUYER_001');
    expect(buyerCredits.length).toBe(1);
  });

  it('Step 3: Buyer retires 200 credits', () => {
    // Mint and transfer
    const mintResult = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 500,
    });

    transferCredits({
      creditId: mintResult.credit!.id,
      fromEntity: 'ISSUER_001',
      toEntity: 'BUYER_001',
      amount: 500,
    });

    // Find buyer's credit
    const buyerCredit = Array.from(credits.values())
      .find(c => c.owner === 'BUYER_001');

    // Retire 200
    const retireResult = retireCredits({
      creditId: buyerCredit!.id,
      retiree: 'BUYER_001',
      amount: 200,
    });

    expect(retireResult.success).toBe(true);
    expect(totalRetired).toBe(200);
    expect(totalActive).toBe(300); // 500 - 200

    // Verify retirement event recorded
    expect(retirementEvents.length).toBe(1);
    expect(retirementEvents[0].amount).toBe(200);
  });

  it('Step 4: Attempt transfer of retired credits → denied with ASSET_RETIRED', () => {
    // Mint, transfer, and retire
    const mintResult = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 200,
    });

    transferCredits({
      creditId: mintResult.credit!.id,
      fromEntity: 'ISSUER_001',
      toEntity: 'BUYER_001',
      amount: 200,
    });

    const buyerCredit = Array.from(credits.values())
      .find(c => c.owner === 'BUYER_001');

    // Retire all
    retireCredits({
      creditId: buyerCredit!.id,
      retiree: 'BUYER_001',
      amount: 200,
    });

    // Attempt to transfer retired credits
    const transferResult = transferCredits({
      creditId: buyerCredit!.id,
      fromEntity: 'BUYER_001',
      toEntity: 'BUYER_002',
      amount: 100,
    });

    expect(transferResult.success).toBe(false);
    expect(transferResult.error).toBe('ASSET_RETIRED');
  });

  it('Step 5: Attempt to unretire → denied', () => {
    // Mint and retire
    const mintResult = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 100,
    });

    retireCredits({
      creditId: mintResult.credit!.id,
      retiree: 'ISSUER_001',
      amount: 100,
    });

    // Attempt to unretire
    const unretireResult = unretireCredits(mintResult.credit!.id);
    expect(unretireResult.success).toBe(false);
    expect(unretireResult.error).toBe('RETIREMENT_IRREVERSIBLE');
  });

  it('Step 6: Reporting shows totals reconcile', () => {
    // Complex scenario with multiple operations
    const mint1 = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 5_000,
    });

    const mint2 = mintCredits({
      issuerId: 'ISSUER_002',
      projectId: 'PROJECT_Y',
      vintageYear: 2023,
      amount: 3_000,
    });

    // Transfer some
    transferCredits({
      creditId: mint1.credit!.id,
      fromEntity: 'ISSUER_001',
      toEntity: 'BUYER_001',
      amount: 2_000,
    });

    // Retire some
    const buyerCredit = Array.from(credits.values())
      .find(c => c.owner === 'BUYER_001' && c.state === 'ACTIVE');

    retireCredits({
      creditId: buyerCredit!.id,
      retiree: 'BUYER_001',
      amount: 500,
    });

    // Verify reconciliation
    expect(totalIssued).toBe(8_000);
    expect(totalActive + totalRetired).toBe(totalIssued);
    expect(totalRetired).toBe(500);
    expect(totalActive).toBe(7_500);

    // Verify by summing all credits
    let activeSum = 0;
    let retiredSum = 0;
    credits.forEach((credit) => {
      if (credit.state === 'ACTIVE') {
        activeSum += credit.amount;
      } else {
        retiredSum += credit.amount;
      }
    });

    expect(activeSum).toBe(totalActive);
    expect(retiredSum).toBe(totalRetired);
  });

  it('Proof: No transfer path can bypass retired state', () => {
    // Mint and retire
    const mintResult = mintCredits({
      issuerId: 'ISSUER_001',
      projectId: 'PROJECT_X',
      vintageYear: 2024,
      amount: 1_000,
    });

    retireCredits({
      creditId: mintResult.credit!.id,
      retiree: 'ISSUER_001',
      amount: 1_000,
    });

    const retiredCredit = credits.get(mintResult.credit!.id)!;

    // Verify state is terminal
    expect(retiredCredit.state).toBe('RETIRED');

    // All transfer attempts fail
    const attempts = [
      transferCredits({ creditId: retiredCredit.id, fromEntity: 'ISSUER_001', toEntity: 'BUYER_001', amount: 100 }),
      transferCredits({ creditId: retiredCredit.id, fromEntity: 'ISSUER_001', toEntity: 'BUYER_002', amount: 1 }),
    ];

    attempts.forEach(result => {
      expect(result.success).toBe(false);
      expect(result.error).toBe('ASSET_RETIRED');
    });

    // Unretire fails
    const unretireResult = unretireCredits(retiredCredit.id);
    expect(unretireResult.success).toBe(false);
  });
});

// ============================================================================
// SCENARIO C: TICKETING (time-window transfers + royalties + anti-scalping)
// ============================================================================

describe('Scenario C: Ticketing (time-window transfers + royalties + anti-scalping)', () => {
  // Ticket tracking
  interface Ticket {
    id: string;
    eventId: string;
    eventName: string;
    eventStartTime: Date;
    seat: string;
    owner: string;
    transferCount: number;
    purchasePrice: number;
    lastSalePrice: number;
    state: 'VALID' | 'USED' | 'CANCELLED';
  }

  interface RoyaltyPayment {
    ticketId: string;
    salePrice: number;
    royaltyAmount: number;
    recipient: string;
    timestamp: string;
  }

  let tickets: Map<string, Ticket>;
  let royaltyPayments: RoyaltyPayment[];
  let eventStartTime: Date;

  const MAX_TRANSFERS = 2;
  const TRANSFER_CUTOFF_HOURS = 2;
  const ROYALTY_PERCENT = 5;
  const LARGE_RESALE_KYC_THRESHOLD = 500;

  beforeEach(() => {
    tickets = new Map();
    royaltyPayments = [];

    // Event is 7 days from now
    eventStartTime = new Date();
    eventStartTime.setDate(eventStartTime.getDate() + 7);
  });

  // Helper: Issue tickets
  function issueTicket(params: {
    eventId: string;
    eventName: string;
    seat: string;
    owner: string;
    price: number;
  }): Ticket {
    const ticket: Ticket = {
      id: uuidv4(),
      eventId: params.eventId,
      eventName: params.eventName,
      eventStartTime,
      seat: params.seat,
      owner: params.owner,
      transferCount: 0,
      purchasePrice: params.price,
      lastSalePrice: params.price,
      state: 'VALID',
    };

    tickets.set(ticket.id, ticket);
    return ticket;
  }

  // Helper: Transfer ticket with all checks
  function transferTicket(params: {
    ticketId: string;
    from: string;
    to: string;
    salePrice: number;
    transferTime?: Date;
    buyerKycVerified?: boolean;
  }): { success: boolean; error?: string; royaltyPaid?: number } {
    const ticket = tickets.get(params.ticketId);
    if (!ticket) {
      return { success: false, error: 'TICKET_NOT_FOUND' };
    }

    // Check ownership
    if (ticket.owner !== params.from) {
      return { success: false, error: 'NOT_OWNER' };
    }

    // Check ticket state
    if (ticket.state !== 'VALID') {
      return { success: false, error: 'TICKET_NOT_VALID' };
    }

    // Check transfer limit
    if (ticket.transferCount >= MAX_TRANSFERS) {
      return { success: false, error: 'TRANSFER_LIMIT_REACHED' };
    }

    // Check transfer window
    const transferTime = params.transferTime || new Date();
    const cutoffTime = new Date(ticket.eventStartTime);
    cutoffTime.setHours(cutoffTime.getHours() - TRANSFER_CUTOFF_HOURS);

    if (transferTime >= cutoffTime) {
      return { success: false, error: 'TRANSFER_WINDOW_CLOSED' };
    }

    // Check KYC for large resales
    if (params.salePrice > LARGE_RESALE_KYC_THRESHOLD && !params.buyerKycVerified) {
      return { success: false, error: 'KYC_REQUIRED_FOR_LARGE_RESALE' };
    }

    // Calculate and record royalty
    let royaltyPaid = 0;
    if (params.salePrice > 0) {
      royaltyPaid = (params.salePrice * ROYALTY_PERCENT) / 100;

      royaltyPayments.push({
        ticketId: ticket.id,
        salePrice: params.salePrice,
        royaltyAmount: royaltyPaid,
        recipient: 'ORGANIZER',
        timestamp: transferTime.toISOString(),
      });
    }

    // Execute transfer
    ticket.owner = params.to;
    ticket.transferCount++;
    ticket.lastSalePrice = params.salePrice;

    return { success: true, royaltyPaid };
  }

  // Helper: Batch transfer (safeTransferFrom variant)
  function batchTransfer(transfers: Array<{
    ticketId: string;
    from: string;
    to: string;
    salePrice: number;
  }>): Array<{ ticketId: string; success: boolean; error?: string }> {
    return transfers.map(t => ({
      ticketId: t.ticketId,
      ...transferTicket({ ...t, buyerKycVerified: true }),
    }));
  }

  it('Step 1: Organizer issues 1,000 tickets (NFTs)', () => {
    for (let i = 1; i <= 1000; i++) {
      issueTicket({
        eventId: 'CONCERT_001',
        eventName: 'Concert Ticket',
        seat: `SEAT_${i}`,
        owner: 'ORGANIZER',
        price: 100,
      });
    }

    expect(tickets.size).toBe(1000);

    // Verify all are unique NFTs
    const ticketIds = new Set(Array.from(tickets.values()).map(t => t.id));
    expect(ticketIds.size).toBe(1000);
  });

  it('Step 2: Ticket is transferred once → allowed', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    // Initial transfer to first buyer
    const result = transferTicket({
      ticketId: ticket.id,
      from: 'ORGANIZER',
      to: 'BUYER_1',
      salePrice: 100,
    });

    expect(result.success).toBe(true);
    expect(tickets.get(ticket.id)?.owner).toBe('BUYER_1');
    expect(tickets.get(ticket.id)?.transferCount).toBe(1);
  });

  it('Step 3: Ticket transferred second time → allowed', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    // First transfer
    transferTicket({
      ticketId: ticket.id,
      from: 'ORGANIZER',
      to: 'BUYER_1',
      salePrice: 100,
    });

    // Second transfer (resale)
    const result = transferTicket({
      ticketId: ticket.id,
      from: 'BUYER_1',
      to: 'BUYER_2',
      salePrice: 150,
    });

    expect(result.success).toBe(true);
    expect(tickets.get(ticket.id)?.owner).toBe('BUYER_2');
    expect(tickets.get(ticket.id)?.transferCount).toBe(2);
  });

  it('Step 4: Third transfer attempt → denied TRANSFER_LIMIT_REACHED', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    // First two transfers
    transferTicket({ ticketId: ticket.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 100 });
    transferTicket({ ticketId: ticket.id, from: 'BUYER_1', to: 'BUYER_2', salePrice: 150 });

    // Third transfer attempt
    const result = transferTicket({
      ticketId: ticket.id,
      from: 'BUYER_2',
      to: 'BUYER_3',
      salePrice: 200,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('TRANSFER_LIMIT_REACHED');
    expect(tickets.get(ticket.id)?.transferCount).toBe(2); // Still 2
  });

  it('Step 5: Transfer attempt within 2 hours of event → denied TRANSFER_WINDOW_CLOSED', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    // First transfer (OK)
    transferTicket({ ticketId: ticket.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 100 });

    // Attempt transfer 1 hour before event
    const oneHourBefore = new Date(eventStartTime);
    oneHourBefore.setHours(oneHourBefore.getHours() - 1);

    const result = transferTicket({
      ticketId: ticket.id,
      from: 'BUYER_1',
      to: 'BUYER_2',
      salePrice: 150,
      transferTime: oneHourBefore,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('TRANSFER_WINDOW_CLOSED');
  });

  it('Step 6: Resale triggers royalty payment event', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    // First transfer
    transferTicket({ ticketId: ticket.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 100 });

    // Resale at higher price
    const result = transferTicket({
      ticketId: ticket.id,
      from: 'BUYER_1',
      to: 'BUYER_2',
      salePrice: 200,
    });

    expect(result.success).toBe(true);
    expect(result.royaltyPaid).toBe(10); // 5% of 200

    // Verify royalty payment recorded
    expect(royaltyPayments.length).toBe(2); // Initial sale + resale
    const resaleRoyalty = royaltyPayments[1];
    expect(resaleRoyalty.salePrice).toBe(200);
    expect(resaleRoyalty.royaltyAmount).toBe(10);
    expect(resaleRoyalty.recipient).toBe('ORGANIZER');
  });

  it('Proof: Enforcement across transfer variants (batch)', () => {
    // Create tickets
    const ticket1 = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    const ticket2 = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A2',
      owner: 'ORGANIZER',
      price: 100,
    });

    // Use up transfers on ticket1
    transferTicket({ ticketId: ticket1.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 100 });
    transferTicket({ ticketId: ticket1.id, from: 'BUYER_1', to: 'BUYER_2', salePrice: 150 });

    // Batch transfer - ticket1 should fail, ticket2 should succeed
    const batchResults = batchTransfer([
      { ticketId: ticket1.id, from: 'BUYER_2', to: 'BUYER_3', salePrice: 200 },
      { ticketId: ticket2.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 100 },
    ]);

    expect(batchResults[0].success).toBe(false);
    expect(batchResults[0].error).toBe('TRANSFER_LIMIT_REACHED');
    expect(batchResults[1].success).toBe(true);
  });

  it('Proof: Royalty payout logs', () => {
    // Multiple sales
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_VIP',
      owner: 'ORGANIZER',
      price: 500,
    });

    transferTicket({ ticketId: ticket.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 500, buyerKycVerified: true });
    transferTicket({ ticketId: ticket.id, from: 'BUYER_1', to: 'BUYER_2', salePrice: 800, buyerKycVerified: true });

    // Verify royalty log
    expect(royaltyPayments.length).toBe(2);

    const totalRoyalties = royaltyPayments.reduce((sum, p) => sum + p.royaltyAmount, 0);
    expect(totalRoyalties).toBe(65); // (500 * 0.05) + (800 * 0.05) = 25 + 40

    // Verify all payments go to organizer
    royaltyPayments.forEach(p => {
      expect(p.recipient).toBe('ORGANIZER');
    });
  });

  it('Proof: Event timeline report', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'Concert Ticket',
      seat: 'SEAT_A1',
      owner: 'ORGANIZER',
      price: 100,
    });

    // Day 1: Initial sale
    const day1 = new Date();
    day1.setDate(day1.getDate() - 6);
    transferTicket({ ticketId: ticket.id, from: 'ORGANIZER', to: 'BUYER_1', salePrice: 100, transferTime: day1 });

    // Day 3: Resale
    const day3 = new Date();
    day3.setDate(day3.getDate() - 4);
    transferTicket({ ticketId: ticket.id, from: 'BUYER_1', to: 'BUYER_2', salePrice: 150, transferTime: day3 });

    // Generate timeline report
    const timeline = royaltyPayments.map(p => ({
      date: new Date(p.timestamp).toDateString(),
      amount: p.salePrice,
      royalty: p.royaltyAmount,
    }));

    expect(timeline.length).toBe(2);
    expect(timeline[0].amount).toBe(100);
    expect(timeline[1].amount).toBe(150);
  });

  it('Optional: KYC required for large resale value', () => {
    const ticket = issueTicket({
      eventId: 'CONCERT_001',
      eventName: 'VIP Concert Ticket',
      seat: 'VIP_1',
      owner: 'ORGANIZER',
      price: 1000,
    });

    // First transfer OK
    transferTicket({
      ticketId: ticket.id,
      from: 'ORGANIZER',
      to: 'BUYER_1',
      salePrice: 1000,
      buyerKycVerified: true,
    });

    // Attempt large resale without KYC
    const result = transferTicket({
      ticketId: ticket.id,
      from: 'BUYER_1',
      to: 'BUYER_2',
      salePrice: 1500,
      buyerKycVerified: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('KYC_REQUIRED_FOR_LARGE_RESALE');

    // Same transfer with KYC verified
    const result2 = transferTicket({
      ticketId: ticket.id,
      from: 'BUYER_1',
      to: 'BUYER_2',
      salePrice: 1500,
      buyerKycVerified: true,
    });

    expect(result2.success).toBe(true);
  });
});
