/**
 * Tests for Asset Abstraction Layer
 *
 * Verifies that the SDK correctly resolves high-level asset descriptors
 * to appropriate token standards without exposing ERC terminology.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetType,
  InvestorClass,
  LiquidityProfile,
  FractionalizationType,
  resolveTokenStandard,
  AssetDescriptor,
  TokenStandard,
  getAssetTypeDescription,
  getJurisdictionInfo,
} from '../src/core/AssetAbstraction.js';
import {
  AssetIssuanceService,
  AssetIssuanceError,
} from '../src/services/AssetIssuanceService.js';
import { RightType, TransferabilityMode } from '../src/core/types.js';

describe('Asset Abstraction Layer', () => {
  describe('resolveTokenStandard', () => {
    it('should resolve equity to ERC-3643 compliant token', () => {
      const descriptor: AssetDescriptor = {
        name: 'Acme Corp Series A',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
        investorClass: InvestorClass.ACCREDITED,
        liquidityProfile: LiquidityProfile.ILLIQUID,
        fractionalization: FractionalizationType.DIVISIBLE,
        lockupDays: 365,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.standard).toBe(TokenStandard.ERC3643);
      expect(result.rightType).toBe(RightType.OWNERSHIP);
      expect(result.compliance.requireKyc).toBe(true);
      expect(result.compliance.requireAccreditation).toBe(true);
      expect(result.compliance.lockupDays).toBe(365);
    });

    it('should resolve whole collectible to ERC-721 NFT', () => {
      const descriptor: AssetDescriptor = {
        name: 'Rare Painting',
        assetType: AssetType.ART_COLLECTIBLE,
        jurisdiction: 'CH',
        investorClass: InvestorClass.RETAIL,
        liquidityProfile: LiquidityProfile.LIQUID,
        fractionalization: FractionalizationType.WHOLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.standard).toBe(TokenStandard.ERC721);
      expect(result.decimals).toBe(0);
      expect(result.rightType).toBe(RightType.OWNERSHIP);
    });

    it('should resolve multi-class fund to ERC-1155', () => {
      const descriptor: AssetDescriptor = {
        name: 'Multi-Tranche Fund',
        assetType: AssetType.FUND,
        jurisdiction: 'SG',
        investorClass: InvestorClass.INSTITUTIONAL,
        liquidityProfile: LiquidityProfile.SEMI_LIQUID,
        fractionalization: FractionalizationType.MULTI_CLASS,
        lockupDays: 90,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.standard).toBe(TokenStandard.ERC1155);
      expect(result.isMultiToken).toBe(true);
    });

    it('should resolve non-transferable credential to soulbound', () => {
      const descriptor: AssetDescriptor = {
        name: 'Professional Certification',
        assetType: AssetType.CREDENTIAL,
        jurisdiction: 'US',
        investorClass: InvestorClass.RETAIL,
        liquidityProfile: LiquidityProfile.NON_TRANSFERABLE,
        fractionalization: FractionalizationType.WHOLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.standard).toBe(TokenStandard.SOULBOUND);
      expect(result.transferMode).toBe(TransferabilityMode.NON_TRANSFERABLE);
      expect(result.rightType).toBe(RightType.ACCESS);
    });

    it('should resolve revenue share to ERC-4626 vault', () => {
      const descriptor: AssetDescriptor = {
        name: 'Music Royalty Stream',
        assetType: AssetType.REVENUE_SHARE,
        jurisdiction: 'GB',
        investorClass: InvestorClass.ACCREDITED,
        liquidityProfile: LiquidityProfile.SEMI_LIQUID,
        fractionalization: FractionalizationType.DIVISIBLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.standard).toBe(TokenStandard.ERC4626);
      expect(result.rightType).toBe(RightType.OWNERSHIP);
    });

    it('should resolve carbon credit to verification right type', () => {
      const descriptor: AssetDescriptor = {
        name: 'Verified Carbon Units',
        assetType: AssetType.CARBON_CREDIT,
        jurisdiction: 'CH',
        investorClass: InvestorClass.RETAIL,
        liquidityProfile: LiquidityProfile.LIQUID,
        fractionalization: FractionalizationType.DIVISIBLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.rightType).toBe(RightType.VERIFICATION);
    });

    it('should always block sanctioned countries', () => {
      const descriptor: AssetDescriptor = {
        name: 'Test Asset',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
        investorClass: InvestorClass.RETAIL,
        liquidityProfile: LiquidityProfile.LIQUID,
        fractionalization: FractionalizationType.DIVISIBLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.compliance.countryBlacklist).toContain('KP'); // North Korea
      expect(result.compliance.countryBlacklist).toContain('IR'); // Iran
      expect(result.compliance.countryBlacklist).toContain('CU'); // Cuba
      expect(result.compliance.countryBlacklist).toContain('SY'); // Syria
    });

    it('should set country whitelist when additional jurisdictions provided', () => {
      const descriptor: AssetDescriptor = {
        name: 'UAE Real Estate',
        assetType: AssetType.REAL_ESTATE,
        jurisdiction: 'AE',
        investorClass: InvestorClass.ACCREDITED,
        liquidityProfile: LiquidityProfile.ILLIQUID,
        fractionalization: FractionalizationType.FIXED_SHARES,
        lockupDays: 365,
        blockedJurisdictions: [],
        additionalJurisdictions: ['US', 'GB', 'SG'],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.compliance.countryWhitelist).toContain('AE');
      expect(result.compliance.countryWhitelist).toContain('US');
      expect(result.compliance.countryWhitelist).toContain('GB');
      expect(result.compliance.countryWhitelist).toContain('SG');
    });

    it('should limit qualified purchaser to 100 investors', () => {
      const descriptor: AssetDescriptor = {
        name: 'QP Fund',
        assetType: AssetType.PRIVATE_EQUITY,
        jurisdiction: 'US',
        investorClass: InvestorClass.QUALIFIED_PURCHASER,
        liquidityProfile: LiquidityProfile.ILLIQUID,
        fractionalization: FractionalizationType.DIVISIBLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.compliance.maxInvestors).toBeLessThanOrEqual(100);
      expect(result.compliance.requireAccreditation).toBe(true);
    });

    it('should provide rationale for decisions', () => {
      const descriptor: AssetDescriptor = {
        name: 'Test',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
        investorClass: InvestorClass.ACCREDITED,
        liquidityProfile: LiquidityProfile.SEMI_LIQUID,
        fractionalization: FractionalizationType.DIVISIBLE,
        lockupDays: 0,
        blockedJurisdictions: [],
        additionalJurisdictions: [],
        metadata: {},
      };

      const result = resolveTokenStandard(descriptor);

      expect(result.rationale.length).toBeGreaterThan(0);
      expect(result.rationale.some(r => r.includes('ERC-3643'))).toBe(true);
    });
  });

  describe('AssetIssuanceService', () => {
    let service: AssetIssuanceService;

    beforeEach(() => {
      service = new AssetIssuanceService();
    });

    it('should issue an asset with minimal configuration', async () => {
      const result = await service.issueAsset({
        name: 'Simple Token',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Simple Token');
        expect(result.data.assetType).toBe(AssetType.EQUITY);
        expect(result.data.state).toBe('DRAFT');
        expect(result.data.id).toBeDefined();
      }
    });

    it('should issue real estate token with full configuration', async () => {
      const result = await service.issueAsset({
        name: 'Dubai Marina Tower Unit 4501',
        assetType: AssetType.REAL_ESTATE,
        jurisdiction: 'AE',
        investorClass: InvestorClass.ACCREDITED,
        liquidityProfile: LiquidityProfile.SEMI_LIQUID,
        totalSupply: '1000000',
        lockupDays: 365,
        maxInvestors: 99,
        additionalJurisdictions: ['US', 'GB'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.compliance.kycRequired).toBe(true);
        expect(result.data.compliance.accreditationRequired).toBe(true);
        expect(result.data.compliance.lockupDays).toBe(365);
        expect(result.data.compliance.allowedCountries).toContain('AE');
        expect(result.data.supply.total).toBe('1000000');
      }
    });

    it('should reject invalid descriptor', async () => {
      const result = await service.issueAsset({
        // Missing required fields
        assetType: AssetType.EQUITY,
      } as any);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_DESCRIPTOR');
      }
    });

    it('should list issued assets', async () => {
      await service.issueAsset({
        name: 'Asset 1',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
      });
      await service.issueAsset({
        name: 'Asset 2',
        assetType: AssetType.REAL_ESTATE,
        jurisdiction: 'AE',
      });

      const all = service.listAssets();
      expect(all.length).toBe(2);

      const equityOnly = service.listAssets({ assetType: AssetType.EQUITY });
      expect(equityOnly.length).toBe(1);
      expect(equityOnly[0].name).toBe('Asset 1');
    });

    it('should activate asset', async () => {
      const issueResult = await service.issueAsset({
        name: 'Test Asset',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
      });

      expect(issueResult.success).toBe(true);
      if (!issueResult.success) return;

      const activateResult = await service.activateAsset(issueResult.data.id);

      expect(activateResult.success).toBe(true);
      if (activateResult.success) {
        expect(activateResult.data.state).toBe('ACTIVE');
      }
    });

    it('should freeze active asset', async () => {
      const issueResult = await service.issueAsset({
        name: 'Test Asset',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
      });
      if (!issueResult.success) return;

      await service.activateAsset(issueResult.data.id);
      const freezeResult = await service.freezeAsset(issueResult.data.id, 'Compliance investigation');

      expect(freezeResult.success).toBe(true);
      if (freezeResult.success) {
        expect(freezeResult.data.state).toBe('FROZEN');
      }
    });

    it('should preview configuration without issuing', () => {
      const result = service.previewConfiguration({
        assetType: AssetType.PRIVATE_EQUITY,
        jurisdiction: 'US',
        investorClass: InvestorClass.QUALIFIED_PURCHASER,
        liquidityProfile: LiquidityProfile.ILLIQUID,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tokenStandard).toBe('Compliant Security Token');
        expect(result.data.compliance.requireAccreditation).toBe(true);
        expect(result.data.rationale.length).toBeGreaterThan(0);
      }
    });

    it('should get asset type info', () => {
      const info = service.getAssetTypeInfo(AssetType.EQUITY);

      expect(info.description).toBe('Company shares or stock');
      expect(info.typicalStandard).toBe('Compliant Security Token');
      expect(info.complianceNotes.length).toBeGreaterThan(0);
    });

    it('should get jurisdiction info', () => {
      const info = service.getJurisdictionInfo('US');

      expect(info.name).toBe('United States');
      expect(info.framework).toContain('SEC');
      expect(info.notes.length).toBeGreaterThan(0);
    });

    it('should call resolution callback when provided', async () => {
      let capturedResolution: any = null;

      const serviceWithCallback = new AssetIssuanceService({
        onResolution: (descriptor, config) => {
          capturedResolution = { descriptor, config };
        },
      });

      await serviceWithCallback.issueAsset({
        name: 'Test',
        assetType: AssetType.EQUITY,
        jurisdiction: 'US',
      });

      expect(capturedResolution).not.toBeNull();
      expect(capturedResolution.config.standard).toBeDefined();
    });
  });

  describe('Helper Functions', () => {
    it('should provide descriptions for all asset types', () => {
      const assetTypes = Object.values(AssetType);

      for (const type of assetTypes) {
        const description = getAssetTypeDescription(type);
        expect(description).toBeDefined();
        expect(description.length).toBeGreaterThan(0);
      }
    });

    it('should provide info for common jurisdictions', () => {
      const jurisdictions = ['US', 'AE', 'GB', 'SG', 'CH'];

      for (const code of jurisdictions) {
        const info = getJurisdictionInfo(code);
        expect(info.name).toBeDefined();
        expect(info.notes.length).toBeGreaterThan(0);
      }
    });

    it('should provide fallback for unknown jurisdictions', () => {
      const info = getJurisdictionInfo('XX');

      expect(info.name).toBe('XX');
      expect(info.notes).toContain('Consult local legal counsel for regulatory requirements');
    });
  });
});
