/**
 * SDK Core Tests
 *
 * Tests for the main TokenisationSDK class initialization and configuration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenisationSDK,
  PartyType,
  PartyRole,
  RightType,
  LifecycleState,
} from '@tokenisation/sdk';

describe('TokenisationSDK', () => {
  describe('Initialization', () => {
    it('should initialize with default mock plugins', () => {
      const sdk = new TokenisationSDK();
      expect(sdk).toBeDefined();
      expect(sdk.isProductionMode()).toBe(false);
    });

    it('should initialize with explicit mock plugins', () => {
      const sdk = new TokenisationSDK({ useMockPlugins: true });
      expect(sdk.isProductionMode()).toBe(false);
    });

    it('should initialize in production mode with config', () => {
      const sdk = new TokenisationSDK({
        useMockPlugins: false,
        production: {
          apiEndpoint: 'https://api.test.com',
          apiKey: 'test-key',
        },
      });
      expect(sdk.isProductionMode()).toBe(true);
      expect(sdk.getProductionConfig()).toEqual({
        apiEndpoint: 'https://api.test.com',
        apiKey: 'test-key',
      });
    });

    it('should expose all core managers', () => {
      const sdk = new TokenisationSDK();
      expect(sdk.assets).toBeDefined();
      expect(sdk.parties_).toBeDefined();
      expect(sdk.evidence).toBeDefined();
      expect(sdk.tokens).toBeDefined();
    });

    it('should expose all service accessors', () => {
      const sdk = new TokenisationSDK();
      expect(sdk.engine).toBeDefined();
      expect(sdk.plugins).toBeDefined();
      // compliance and oracle services moved to @tokenisation/compliance and @tokenisation/chains
      expect(sdk.verification).toBeDefined();
      expect(sdk.indexer).toBeDefined();
      expect(sdk.events).toBeDefined();
    });

    it('should expose extension modules', () => {
      const sdk = new TokenisationSDK();
      expect(sdk.rightTypes).toBeDefined();
      expect(sdk.hooks).toBeDefined();
      expect(sdk.cashFlow).toBeDefined();
      expect(sdk.governance).toBeDefined();
      expect(sdk.escrow).toBeDefined();
    });
  });

  describe('Party Management', () => {
    let sdk: TokenisationSDK;

    beforeEach(() => {
      sdk = new TokenisationSDK();
    });

    it('should create a party', () => {
      const party = sdk.parties_.create({
        name: 'Test Issuer',
        type: PartyType.ORGANIZATION,
        roles: [PartyRole.ISSUER],
        jurisdiction: 'US',
      });

      expect(party.id).toBeDefined();
      expect(party.name).toBe('Test Issuer');
      expect(party.type).toBe(PartyType.ORGANIZATION);
      expect(party.roles).toContain(PartyRole.ISSUER);
    });

    it('should get a party by id', () => {
      const created = sdk.parties_.create({
        name: 'Test Party',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });

      const retrieved = sdk.parties_.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Party');
    });

    it('should return undefined for non-existent party', () => {
      const party = sdk.parties_.get('non-existent-id');
      expect(party).toBeUndefined();
    });

    it('should get all parties', () => {
      sdk.parties_.create({
        name: 'Party 1',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'US',
      });
      sdk.parties_.create({
        name: 'Party 2',
        type: PartyType.ORGANIZATION,
        roles: [PartyRole.ISSUER],
        jurisdiction: 'AE',
      });

      const parties = sdk.parties_.getAll();
      expect(parties.length).toBe(2);
    });

    it('should update a party', () => {
      const party = sdk.parties_.create({
        name: 'Original Name',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'US',
      });

      const result = sdk.parties_.update(party.id, { name: 'Updated Name' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Name');
      }
    });

    it('should return error when updating non-existent party', () => {
      const result = sdk.parties_.update('non-existent', { name: 'Test' });
      expect(result.success).toBe(false);
    });

    it('should set KYC status', () => {
      const party = sdk.parties_.create({
        name: 'Investor',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'US',
      });

      const result = sdk.parties_.setKyc(party.id, true);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.verificationLevel).toBe('STANDARD');
      }
    });

    it('should freeze and unfreeze a party', () => {
      const party = sdk.parties_.create({
        name: 'Investor',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'US',
      });

      const freezeResult = sdk.parties_.freeze(party.id, 'Suspicious activity');
      expect(freezeResult.success).toBe(true);
      if (freezeResult.success) {
        expect(freezeResult.data.isFrozen).toBe(true);
        expect(freezeResult.data.freezeReason).toBe('Suspicious activity');
      }

      const unfreezeResult = sdk.parties_.unfreeze(party.id);
      expect(unfreezeResult.success).toBe(true);
      if (unfreezeResult.success) {
        expect(unfreezeResult.data.isFrozen).toBe(false);
      }
    });
  });

  describe('Asset Management', () => {
    let sdk: TokenisationSDK;
    let issuerId: string;

    beforeEach(() => {
      sdk = new TokenisationSDK();
      const issuer = sdk.parties_.create({
        name: 'Test Issuer',
        type: PartyType.ORGANIZATION,
        roles: [PartyRole.ISSUER],
        jurisdiction: 'US',
      });
      issuerId = issuer.id;
      sdk.parties_.setKyc(issuerId, true);
    });

    it('should create an asset', async () => {
      const asset = await sdk.assets.create({
        name: 'Test Property',
        rightType: RightType.OWNERSHIP,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });

      expect(asset.id).toBeDefined();
      expect(asset.name).toBe('Test Property');
      expect(asset.rightType).toBe(RightType.OWNERSHIP);
      expect(asset.state).toBe(LifecycleState.DRAFT);
    });

    it('should get an asset by id', async () => {
      const created = await sdk.assets.create({
        name: 'Test Property',
        rightType: RightType.OWNERSHIP,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });

      const retrieved = await sdk.assets.get(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Property');
    });

    it('should return null for non-existent asset', async () => {
      const asset = await sdk.assets.get('non-existent');
      expect(asset).toBeNull();
    });

    it('should get all assets', async () => {
      await sdk.assets.create({
        name: 'Asset 1',
        rightType: RightType.OWNERSHIP,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });
      await sdk.assets.create({
        name: 'Asset 2',
        rightType: RightType.ACCESS,
        issuerId,
        jurisdiction: { countryCode: 'AE' },
      });

      const assets = sdk.assets.getAll();
      expect(assets.length).toBe(2);
    });

    it('should update an asset', async () => {
      const asset = await sdk.assets.create({
        name: 'Original Name',
        rightType: RightType.OWNERSHIP,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });

      const result = await sdk.assets.update(asset.id, { name: 'Updated Name' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Name');
      }
    });

    it('should update an asset', async () => {
      const asset = await sdk.assets.create({
        name: 'Test Property',
        rightType: RightType.OWNERSHIP,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });

      const result = await sdk.assets.update(asset.id, { name: 'Updated Property' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Property');
      }
    });

    it('should get assets by state', async () => {
      await sdk.assets.create({
        name: 'Draft Asset 1',
        rightType: RightType.OWNERSHIP,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });
      await sdk.assets.create({
        name: 'Draft Asset 2',
        rightType: RightType.ACCESS,
        issuerId,
        jurisdiction: { countryCode: 'US' },
      });

      const draftAssets = sdk.assets.getByState(LifecycleState.DRAFT);
      expect(draftAssets.length).toBe(2);
    });
  });

  describe('Token Operations', () => {
    let sdk: TokenisationSDK;
    let investorId: string;

    beforeEach(async () => {
      sdk = new TokenisationSDK();

      const investor = sdk.parties_.create({
        name: 'Investor',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'US',
        wallets: [{ address: '0x1234567890abcdef1234567890abcdef12345678', chain: 'ethereum' }],
      });
      sdk.parties_.setKyc(investor.id, true);
      investorId = investor.id;
    });

    it('should create an investor party', () => {
      const investor = sdk.parties_.get(investorId);
      expect(investor).toBeDefined();
      expect(investor?.roles).toContain(PartyRole.INVESTOR);
    });

    it('should fail to mint tokens for non-active asset', async () => {
      const issuer = sdk.parties_.create({
        name: 'Issuer',
        type: PartyType.ORGANIZATION,
        roles: [PartyRole.ISSUER],
        jurisdiction: 'US',
      });

      const draftAsset = await sdk.assets.create({
        name: 'Draft Asset',
        rightType: RightType.OWNERSHIP,
        issuerId: issuer.id,
        jurisdiction: { countryCode: 'US' },
      });

      const result = await sdk.tokens.mint(draftAsset.id, investorId, '1000');
      expect(result.success).toBe(false);
    });

    it('should return zero balance for non-existent holdings', async () => {
      const balance = await sdk.tokens.getBalance('non-existent-asset', investorId);
      expect(balance).toBe('0');
    });
  });

  describe('Hook Registration', () => {
    it('should register hooks', () => {
      const sdk = new TokenisationSDK();
      let hookCalled = false;

      const hookId = sdk.registerHook(
        'asset:create',
        'after',
        async () => {
          hookCalled = true;
          return { proceed: true };
        },
        { id: 'test-hook' }
      );

      expect(hookId).toBe('test-hook');
    });
  });
});
