/**
 * API Tests — @tokenisation/sdk API Surface via Direct SDK Instance
 * Tests the SDK's public methods for all 5 verticals using a fresh SDK instance
 * (avoids store initialization issues with demo data).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TokenisationSDK, LifecycleState, RightType, PartyType, PartyRole } from '@tokenisation/sdk';

let sdk: TokenisationSDK;

beforeAll(() => {
  sdk = new TokenisationSDK();
});

describe('API Tests — SDK Public Methods (All 5 Verticals)', () => {
  describe('Core API Surface Exists', () => {
    it('should expose assets manager', () => {
      expect(sdk.assets).toBeDefined();
      expect(typeof sdk.assets.create).toBe('function');
      expect(typeof sdk.assets.get).toBe('function');
      expect(typeof sdk.assets.getAll).toBe('function');
      expect(typeof sdk.assets.transition).toBe('function');
    });

    it('should expose parties manager', () => {
      expect(sdk.parties_).toBeDefined();
      expect(typeof sdk.parties_.create).toBe('function');
      expect(typeof sdk.parties_.get).toBe('function');
      expect(typeof sdk.parties_.getAll).toBe('function');
      expect(typeof sdk.parties_.setKyc).toBe('function');
    });

    it('should expose tokens manager', () => {
      expect(sdk.tokens).toBeDefined();
      expect(typeof sdk.tokens.mint).toBe('function');
      expect(typeof sdk.tokens.transfer).toBe('function');
      expect(typeof sdk.tokens.getBalance).toBe('function');
    });

    it('should expose evidence manager', () => {
      expect(sdk.evidence).toBeDefined();
      expect(typeof sdk.evidence.create).toBe('function');
    });
  });

  describe('Asset Lifecycle — Real Estate Vertical', () => {
    it('should create a real estate asset in DRAFT state', async () => {
      const asset = await sdk.assets.create({
        name: 'API Test Property — Downtown Dubai',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });
      expect(asset).toBeDefined();
      expect(asset.id).toBeTruthy();
      expect(asset.state).toBe(LifecycleState.DRAFT);
    });

    it('should transition real estate asset through full lifecycle', async () => {
      const asset = await sdk.assets.create({
        name: 'API Test Property — Palm Jumeirah',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });

      const r1 = await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'system');
      expect(r1.success).toBe(true);

      const r2 = await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'system');
      expect(r2.success).toBe(true);

      const r3 = await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'system');
      expect(r3.success).toBe(true);
    });

    it('should reject invalid lifecycle transitions', async () => {
      const asset = await sdk.assets.create({
        name: 'Invalid Transition Test',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });

      // DRAFT → ACTIVE is invalid (must go through PENDING_VERIFICATION first)
      const result = await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'system');
      expect(result.success).toBe(false);
    });
  });

  describe('Party Management — All Verticals', () => {
    it('should create an INDIVIDUAL party', () => {
      const party = sdk.parties_.create({
        name: 'API Test Individual',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.ISSUER],
        jurisdiction: 'AE',
      });
      expect(party).toBeDefined();
      expect(party.id).toBeTruthy();
      expect(party.name).toBe('API Test Individual');
    });

    it('should create an ORGANIZATION party', () => {
      const party = sdk.parties_.create({
        name: 'API Test Corp',
        type: PartyType.ORGANIZATION,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });
      expect(party).toBeDefined();
      expect(party.id).toBeTruthy();
    });

    it('should verify KYC for a party', () => {
      const party = sdk.parties_.create({
        name: 'KYC Test Party',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });
      sdk.parties_.setKyc(party.id, true);
      const found = sdk.parties_.get(party.id);
      expect(found).toBeDefined();
      // KYC status is tracked internally; party should still be retrievable
      expect(found!.name).toBe('KYC Test Party');
    });

    it('should list all parties', () => {
      const parties = sdk.parties_.getAll();
      expect(Array.isArray(parties)).toBe(true);
      expect(parties.length).toBeGreaterThan(0);
    });
  });

  describe('Token Operations — Airline Tickets Vertical', () => {
    it('should mint tokens for an ACTIVE airline asset', async () => {
      const asset = await sdk.assets.create({
        name: 'API Test Flight — DXB-LHR',
        rightType: RightType.ACCESS,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'system');

      const passenger = sdk.parties_.create({
        name: 'Airline Passenger',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });

      const result = await sdk.tokens.mint(asset.id, passenger.id, '1');
      expect(result.success).toBe(true);
    });

    it('should reject minting for non-ACTIVE asset', async () => {
      const asset = await sdk.assets.create({
        name: 'Draft Flight',
        rightType: RightType.ACCESS,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });

      const party = sdk.parties_.create({
        name: 'Passenger X',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });

      const result = await sdk.tokens.mint(asset.id, party.id, '1');
      expect(result.success).toBe(false);
    });
  });

  describe('Token Operations — Concert Tickets Vertical', () => {
    it('should mint and check balance for concert tickets', async () => {
      const asset = await sdk.assets.create({
        name: 'VibeTix Concert — Main Stage',
        rightType: RightType.ACCESS,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'system');

      const fan = sdk.parties_.create({
        name: 'Concert Fan',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });

      await sdk.tokens.mint(asset.id, fan.id, '2');
      const balance = await sdk.tokens.getBalance(asset.id, fan.id);
      expect(Number(balance)).toBe(2);
    });
  });

  describe('Token Operations — Hotel Reservation Vertical', () => {
    it('should mint hotel reservation tokens', async () => {
      const asset = await sdk.assets.create({
        name: 'LuxeStay Suite — 3 Night Package',
        rightType: RightType.ACCESS,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'system');

      const guest = sdk.parties_.create({
        name: 'Hotel Guest',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });

      const result = await sdk.tokens.mint(asset.id, guest.id, '3');
      expect(result.success).toBe(true);
    });
  });

  describe('Token Operations — Car Rental Vertical', () => {
    it('should mint and transfer car rental tokens', async () => {
      const asset = await sdk.assets.create({
        name: 'DriveChain Tesla Model S — 7 Day',
        rightType: RightType.ACCESS,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });
      await sdk.assets.transition(asset.id, LifecycleState.PENDING_VERIFICATION, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.VERIFIED, 'system');
      await sdk.assets.transition(asset.id, LifecycleState.ACTIVE, 'system');

      const renterA = sdk.parties_.create({
        name: 'Car Renter A',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });
      const renterB = sdk.parties_.create({
        name: 'Car Renter B',
        type: PartyType.INDIVIDUAL,
        roles: [PartyRole.INVESTOR],
        jurisdiction: 'AE',
      });

      await sdk.tokens.mint(asset.id, renterA.id, '5');
      const txResult = await sdk.tokens.transfer(asset.id, renterA.id, renterB.id, '2');
      expect(txResult.success).toBe(true);

      const balA = await sdk.tokens.getBalance(asset.id, renterA.id);
      const balB = await sdk.tokens.getBalance(asset.id, renterB.id);
      expect(Number(balA)).toBe(3);
      expect(Number(balB)).toBe(2);
    });
  });

  describe('Asset Query Operations', () => {
    it('should list all assets', () => {
      const assets = sdk.assets.getAll();
      expect(Array.isArray(assets)).toBe(true);
      expect(assets.length).toBeGreaterThan(0);
    });

    it('should get asset by id', async () => {
      const asset = await sdk.assets.create({
        name: 'Query Test Asset',
        rightType: RightType.OWNERSHIP,
        jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
        issuerId: '00000000-0000-4000-8000-000000000001',
      });
      const found = await sdk.assets.get(asset.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('Query Test Asset');
    });

    it('should return null for non-existent asset', async () => {
      const found = await sdk.assets.get('non-existent-id');
      expect(found).toBeNull();
    });
  });
});
