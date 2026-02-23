/**
 * End-to-End Integration Tests
 *
 * Tests complete workflows through the SDK.
 * These tests verify the integration between components.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenisationSDK,
  LifecycleState,
  RightType,
  PartyRole,
  PartyType,
  AssetIssuanceService,
  AssetType,
  InvestorClass,
  LiquidityProfile,
  CustodyManager,
  CustodyType,
  RecoveryReason,
  IndexingEngine,
  IndexedEventType,
} from '@tokenisation/sdk';

describe('E2E: Complete Asset Lifecycle', () => {
  let sdk: TokenisationSDK;

  beforeEach(() => {
    sdk = new TokenisationSDK({ useMockPlugins: true });
  });

  // Note: This test requires chain integration for full compliance enforcement
  it.skip('should complete full asset lifecycle: create → verify → activate → mint → transfer', async () => {
    // 1. Create parties
    const issuer = sdk.parties_.create({
      name: 'Test Issuer Corp',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(issuer.id, true);

    const investor1 = sdk.parties_.create({
      name: 'Alice Investor',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(investor1.id, true);

    const investor2 = sdk.parties_.create({
      name: 'Bob Investor',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'GB',
    });
    sdk.parties_.setKyc(investor2.id, true);

    // 2. Create asset
    const asset = await sdk.assets.create({
      name: 'Test Security Token',
      rightType: RightType.OWNERSHIP,
      issuerId: issuer.id,
      jurisdiction: {
        countryCode: 'US',
        accreditedOnly: true,
        blockedJurisdictions: ['KP', 'IR'],
      },
    });
    expect(asset.state).toBe(LifecycleState.DRAFT);

    // 3. Transition through lifecycle
    const pendingResult = await sdk.assets.transition(
      asset.id,
      LifecycleState.PENDING_VERIFICATION,
      issuer.id
    );
    expect(pendingResult.success).toBe(true);

    const verifyResult = await sdk.assets.verify(asset.id, issuer.id);
    expect(verifyResult.success).toBe(true);

    const activateResult = await sdk.assets.activate(asset.id, issuer.id);
    expect(activateResult.success).toBe(true);

    // 4. Mint tokens
    await sdk.tokens.mint(asset.id, investor1.id, '1000000');
    await sdk.tokens.mint(asset.id, investor2.id, '500000');

    const balance1 = await sdk.tokens.getBalance(asset.id, investor1.id);
    const balance2 = await sdk.tokens.getBalance(asset.id, investor2.id);
    expect(balance1).toBe('1000000');
    expect(balance2).toBe('500000');

    // 5. Transfer tokens
    const transferResult = await sdk.tokens.transfer(
      asset.id,
      investor1.id,
      investor2.id,
      '250000'
    );
    expect(transferResult.success).toBe(true);

    // 6. Verify final balances
    const finalBalance1 = await sdk.tokens.getBalance(asset.id, investor1.id);
    const finalBalance2 = await sdk.tokens.getBalance(asset.id, investor2.id);
    expect(finalBalance1).toBe('750000');
    expect(finalBalance2).toBe('750000');
  });

  // Note: KYC enforcement requires real compliance plugin
  it.skip('should block transfers to non-KYC parties', async () => {
    const issuer = sdk.parties_.create({
      name: 'Issuer',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(issuer.id, true);

    const kycInvestor = sdk.parties_.create({
      name: 'KYC Investor',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(kycInvestor.id, true);

    const nonKycInvestor = sdk.parties_.create({
      name: 'Non-KYC Investor',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'US',
    });
    // Note: NOT setting KYC

    const asset = await sdk.assets.create({
      name: 'Compliance Token',
      rightType: RightType.OWNERSHIP,
      issuerId: issuer.id,
      jurisdiction: {
        countryCode: 'US',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
    });

    await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await sdk.assets.verify(asset.id, issuer.id);
    await sdk.assets.activate(asset.id, issuer.id);
    await sdk.tokens.mint(asset.id, kycInvestor.id, '1000');

    // This should fail - recipient is not KYC'd
    const transferResult = await sdk.tokens.transfer(
      asset.id,
      kycInvestor.id,
      nonKycInvestor.id,
      '500'
    );
    expect(transferResult.success).toBe(false);
  });
});

describe('E2E: Asset Issuance Service', () => {
  it('should issue real estate token with auto-resolved configuration', async () => {
    const service = new AssetIssuanceService();

    const result = await service.issueAsset({
      name: 'Downtown Office Building',
      assetType: AssetType.REAL_ESTATE,
      jurisdiction: 'US',
      investorClass: InvestorClass.ACCREDITED,
      liquidityProfile: LiquidityProfile.SEMI_LIQUID,
      totalSupply: '1000000',
      lockupDays: 365,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Downtown Office Building');
      expect(result.data.compliance.kycRequired).toBe(true);
      expect(result.data.compliance.accreditationRequired).toBe(true);
      expect(result.data.compliance.lockupDays).toBe(365);
    }
  });

  it('should preview configuration without creating asset', () => {
    const service = new AssetIssuanceService();

    const preview = service.previewConfiguration({
      assetType: AssetType.PRIVATE_EQUITY,
      jurisdiction: 'US',
      investorClass: InvestorClass.QUALIFIED_PURCHASER,
      liquidityProfile: LiquidityProfile.ILLIQUID,
    });

    expect(preview.success).toBe(true);
    if (preview.success) {
      expect(preview.data.tokenStandard).toBe('Compliant Security Token');
      expect(preview.data.compliance.requireKyc).toBe(true);
      expect(preview.data.compliance.requireAccreditation).toBe(true);
    }
  });
});

describe('E2E: Custody & Recovery', () => {
  let custody: CustodyManager;

  beforeEach(() => {
    custody = new CustodyManager();
  });

  it('should complete multi-sig recovery flow', () => {
    // 1. Create custody arrangement
    const arrangement = custody.createCustodyArrangement({
      assetId: 'asset-001',
      type: CustodyType.MULTI_SIG,
      threshold: 2,
      custodians: ['custodian-a', 'custodian-b', 'custodian-c'],
    });
    expect(arrangement.type).toBe(CustodyType.MULTI_SIG);
    expect(arrangement.threshold).toBe(2);

    // 2. Initiate recovery
    const recovery = custody.initiateRecovery({
      assetId: 'asset-001',
      requestedBy: 'user-lost-keys',
      reason: RecoveryReason.LOST_KEY,
      newOwner: '0xNewOwnerAddress',
      documents: ['notarized-affidavit.pdf'],
    });
    expect(recovery.status).toBe('PENDING');
    expect(recovery.requiredApprovals).toBe(2);

    // 3. First approval
    const afterFirst = custody.approveRecovery({
      requestId: recovery.id,
      approverId: 'custodian-a',
      approverRole: 'CUSTODIAN',
      approved: true,
    });
    expect(afterFirst.status).toBe('PENDING');
    expect(afterFirst.approvals.length).toBe(1);

    // 4. Second approval - should complete
    const afterSecond = custody.approveRecovery({
      requestId: recovery.id,
      approverId: 'custodian-b',
      approverRole: 'CUSTODIAN',
      approved: true,
    });
    expect(afterSecond.status).toBe('APPROVED');
    expect(afterSecond.approvals.length).toBe(2);
    expect(afterSecond.executableAfter).toBeDefined();
  });

  it('should reject recovery if threshold cannot be met', () => {
    custody.createCustodyArrangement({
      assetId: 'asset-002',
      type: CustodyType.MULTI_SIG,
      threshold: 2,
      custodians: ['c1', 'c2', 'c3'],
    });

    const recovery = custody.initiateRecovery({
      assetId: 'asset-002',
      requestedBy: 'user',
      reason: RecoveryReason.LOST_KEY,
      newOwner: '0xNew',
      documents: [],
    });

    // Two rejections = cannot meet threshold
    custody.approveRecovery({
      requestId: recovery.id,
      approverId: 'c1',
      approverRole: 'CUSTODIAN',
      approved: false,
    });

    const afterSecondReject = custody.approveRecovery({
      requestId: recovery.id,
      approverId: 'c2',
      approverRole: 'CUSTODIAN',
      approved: false,
    });

    expect(afterSecondReject.status).toBe('REJECTED');
  });
});

describe('E2E: Indexing & Reporting', () => {
  let indexer: IndexingEngine;

  beforeEach(() => {
    indexer = new IndexingEngine();
  });

  it('should track balances across mint and transfer events', () => {
    const assetId = 'asset-test';

    // Mint events
    indexer.indexEvent({
      type: IndexedEventType.MINT,
      assetId,
      actor: 'issuer',
      data: { to: 'investor-1', amount: '1000' },
    });

    indexer.indexEvent({
      type: IndexedEventType.MINT,
      assetId,
      actor: 'issuer',
      data: { to: 'investor-2', amount: '500' },
    });

    // Transfer event
    indexer.indexEvent({
      type: IndexedEventType.TRANSFER,
      assetId,
      actor: 'investor-1',
      data: { from: 'investor-1', to: 'investor-3', amount: '200' },
    });

    // Verify balances
    const balances = indexer.getAssetBalances(assetId);
    const balanceMap = new Map(balances.map(b => [b.holder, b.balance]));

    expect(balanceMap.get('investor-1')).toBe('800');
    expect(balanceMap.get('investor-2')).toBe('500');
    expect(balanceMap.get('investor-3')).toBe('200');
  });

  it('should generate compliance report', () => {
    const assetId = 'compliance-asset';

    // Add various events
    indexer.indexEvent({
      type: IndexedEventType.MINT,
      assetId,
      actor: 'issuer',
      data: { to: 'inv-1', amount: '1000' },
    });

    indexer.indexEvent({
      type: IndexedEventType.KYC_VERIFIED,
      assetId,
      actor: 'compliance',
      data: { investor: 'inv-1', level: 'ACCREDITED' },
    });

    indexer.indexEvent({
      type: IndexedEventType.TRANSFER,
      assetId,
      actor: 'inv-1',
      data: { from: 'inv-1', to: 'inv-2', amount: '500' },
    });

    const report = indexer.generateComplianceReport(assetId);

    expect(report.assetId).toBe(assetId);
    expect(report.summary.totalTransfers).toBeGreaterThanOrEqual(1);
    expect(report.summary.kycVerifications).toBe(1);
    expect(report.summary.complianceRate).toBe(100);
  });

  it('should export audit log in CSV format', () => {
    const assetId = 'audit-asset';

    indexer.indexEvent({
      type: IndexedEventType.MINT,
      assetId,
      actor: 'issuer',
      data: { to: 'inv-1', amount: '1000' },
    });

    const csv = indexer.exportAuditLog(assetId, 'csv');

    expect(csv).toContain('timestamp');
    expect(csv).toContain('type');
    expect(csv).toContain('MINT');
  });
});

describe('E2E: Error Handling & Edge Cases', () => {
  let sdk: TokenisationSDK;

  beforeEach(() => {
    sdk = new TokenisationSDK({ useMockPlugins: true });
  });

  it('should reject invalid state transitions', async () => {
    const issuer = sdk.parties_.create({
      name: 'Issuer',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      jurisdiction: 'US',
    });

    const asset = await sdk.assets.create({
      name: 'Test',
      rightType: RightType.OWNERSHIP,
      issuerId: issuer.id,
      jurisdiction: {
        countryCode: 'US',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
    });

    // Cannot go from DRAFT directly to ACTIVE
    const result = await sdk.assets.transition(
      asset.id,
      LifecycleState.ACTIVE,
      issuer.id
    );
    expect(result.success).toBe(false);
  });

  // Note: Balance checks require real chain plugin
  it.skip('should handle transfer of more than balance', async () => {
    const issuer = sdk.parties_.create({
      name: 'Issuer',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(issuer.id, true);

    const investor1 = sdk.parties_.create({
      name: 'Investor 1',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(investor1.id, true);

    const investor2 = sdk.parties_.create({
      name: 'Investor 2',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'US',
    });
    sdk.parties_.setKyc(investor2.id, true);

    const asset = await sdk.assets.create({
      name: 'Test',
      rightType: RightType.OWNERSHIP,
      issuerId: issuer.id,
      jurisdiction: {
        countryCode: 'US',
        accreditedOnly: false,
        blockedJurisdictions: [],
      },
    });

    await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, issuer.id);
    await sdk.assets.verify(asset.id, issuer.id);
    await sdk.assets.activate(asset.id, issuer.id);
    await sdk.tokens.mint(asset.id, investor1.id, '100');

    // Try to transfer more than balance
    const result = await sdk.tokens.transfer(
      asset.id,
      investor1.id,
      investor2.id,
      '200'
    );
    expect(result.success).toBe(false);
  });
});
