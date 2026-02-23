/**
 * Model Factory Tests
 *
 * Tests for asset, party, and evidence model creation.
 */

import { describe, it, expect } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import {
  createAsset,
  createParty,
  createEvidence,
  PartyType,
  PartyRole,
  EvidenceType,
  EvidenceStatus,
} from '@tokenisation/core';
import { RightType, LifecycleState, TransferabilityMode } from '@tokenisation/core';

describe('Asset Model', () => {
  const testIssuerId = uuidv4();

  it('should create an asset with required fields', () => {
    const asset = createAsset({
      name: 'Test Property',
      rightType: RightType.OWNERSHIP,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    expect(asset.id).toBeDefined();
    expect(asset.name).toBe('Test Property');
    expect(asset.rightType).toBe(RightType.OWNERSHIP);
    expect(asset.state).toBe(LifecycleState.DRAFT);
    expect(asset.version).toBe(0); // version starts at 0
    expect(asset.createdAt).toBeDefined();
  });

  it('should create an asset with all optional fields', () => {
    const asset = createAsset({
      name: 'Full Property',
      rightType: RightType.OWNERSHIP,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'AE', region: 'Dubai' },
      description: 'A beautiful property in Dubai',
      transferabilityRules: {
        mode: TransferabilityMode.WHITELIST_ONLY, // Use valid enum value
        requireKyc: true,
        lockupPeriodSeconds: 86400,
      },
      metadata: {
        location: 'Dubai Marina',
        bedrooms: 3,
      },
    });

    expect(asset.description).toBe('A beautiful property in Dubai');
    expect(asset.transferabilityRules.mode).toBe(TransferabilityMode.WHITELIST_ONLY);
    expect(asset.metadata?.location).toBe('Dubai Marina');
  });

  it('should create assets with different right types', () => {
    const ownership = createAsset({
      name: 'Ownership Asset',
      rightType: RightType.OWNERSHIP,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    const access = createAsset({
      name: 'Access Asset',
      rightType: RightType.ACCESS,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    const verification = createAsset({
      name: 'Verification Asset',
      rightType: RightType.VERIFICATION,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    const behavior = createAsset({
      name: 'Behavior Asset',
      rightType: RightType.BEHAVIOR,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    expect(ownership.rightType).toBe(RightType.OWNERSHIP);
    expect(access.rightType).toBe(RightType.ACCESS);
    expect(verification.rightType).toBe(RightType.VERIFICATION);
    expect(behavior.rightType).toBe(RightType.BEHAVIOR);
  });

  it('should generate unique IDs', () => {
    const asset1 = createAsset({
      name: 'Asset 1',
      rightType: RightType.OWNERSHIP,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    const asset2 = createAsset({
      name: 'Asset 2',
      rightType: RightType.OWNERSHIP,
      issuerId: testIssuerId,
      jurisdiction: { countryCode: 'US' },
    });

    expect(asset1.id).not.toBe(asset2.id);
  });
});

describe('Party Model', () => {
  it('should create an individual party', () => {
    const party = createParty({
      name: 'John Doe',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'US',
    });

    expect(party.id).toBeDefined();
    expect(party.name).toBe('John Doe');
    expect(party.type).toBe(PartyType.INDIVIDUAL);
    expect(party.roles).toContain(PartyRole.INVESTOR);
    expect(party.jurisdiction).toBe('US');
  });

  it('should create an organization party', () => {
    const party = createParty({
      name: 'Acme Corp',
      type: PartyType.ORGANIZATION,
      roles: [PartyRole.ISSUER, PartyRole.CUSTODIAN],
      jurisdiction: 'AE',
    });

    expect(party.type).toBe(PartyType.ORGANIZATION);
    expect(party.roles).toContain(PartyRole.ISSUER);
    expect(party.roles).toContain(PartyRole.CUSTODIAN);
  });

  it('should create party with contact info', () => {
    const party = createParty({
      name: 'Contact Person',
      type: PartyType.INDIVIDUAL,
      roles: [PartyRole.INVESTOR],
      jurisdiction: 'UK',
      email: 'contact@example.com',
      metadata: {
        phone: '+44123456789',
      },
    });

    expect(party.email).toBe('contact@example.com');
    expect(party.metadata?.phone).toBe('+44123456789');
  });

  it('should support primary party roles', () => {
    const roles = [
      PartyRole.INVESTOR,
      PartyRole.ISSUER,
      PartyRole.CUSTODIAN,
      PartyRole.REGULATOR,
      PartyRole.VERIFIER,
    ];

    roles.forEach((role) => {
      const party = createParty({
        name: `${role} Party`,
        type: PartyType.ORGANIZATION,
        roles: [role],
        jurisdiction: 'US',
      });
      expect(party.roles).toContain(role);
    });
  });
});

describe('Evidence Model', () => {
  const testAssetId = uuidv4();
  const testSource = {
    type: 'GOVERNMENT_REGISTRY',
    identifier: 'dubai-land-dept',
    name: 'Dubai Land Department',
    trusted: true,
  };

  it('should create evidence with required fields', () => {
    const evidence = createEvidence({
      assetId: testAssetId,
      type: EvidenceType.LEGAL_DOCUMENT,
      title: 'Title Deed',
      contentHash: 'sha256:abcdef1234567890abcdef1234567890abcdef12',
      source: testSource,
    });

    expect(evidence.id).toBeDefined();
    expect(evidence.assetId).toBe(testAssetId);
    expect(evidence.type).toBe(EvidenceType.LEGAL_DOCUMENT);
    expect(evidence.status).toBe(EvidenceStatus.PENDING);
    expect(evidence.version).toBe(0);
  });

  it('should create evidence with storage URI', () => {
    const evidence = createEvidence({
      assetId: testAssetId,
      type: EvidenceType.LEGAL_DOCUMENT,
      title: 'Contract',
      contentHash: 'sha256:1234567890abcdef1234567890abcdef12345678',
      storageUri: 'ipfs://QmTest1234567890',
      source: testSource,
    });

    expect(evidence.storageUri).toBe('ipfs://QmTest1234567890');
    expect(evidence.contentHash).toBe('sha256:1234567890abcdef1234567890abcdef12345678');
  });

  it('should support various evidence types', () => {
    const types = [
      EvidenceType.LEGAL_DOCUMENT,
      EvidenceType.FINANCIAL_DOCUMENT,
      EvidenceType.CERTIFICATE,
      EvidenceType.MEDIA,
    ];

    types.forEach((type) => {
      const evidence = createEvidence({
        assetId: testAssetId,
        type,
        title: `${type} Evidence`,
        contentHash: `sha256:${Date.now().toString(16)}0000000000000000000000`,
        source: testSource,
      });
      expect(evidence.type).toBe(type);
    });
  });

  it('should create evidence with metadata', () => {
    const evidence = createEvidence({
      assetId: testAssetId,
      type: EvidenceType.FINANCIAL_DOCUMENT,
      title: 'Appraisal Report',
      contentHash: 'sha256:1234abcd1234abcd1234abcd1234abcd12345678',
      source: {
        type: 'APPRAISAL_FIRM',
        identifier: 'smith-co',
        name: 'Smith & Co',
        trusted: true,
      },
      metadata: {
        appraiser: 'Smith & Co',
        valuation: 1500000,
        date: '2024-01-15',
      },
    });

    expect(evidence.metadata?.appraiser).toBe('Smith & Co');
    expect(evidence.metadata?.valuation).toBe(1500000);
  });

  it('should create evidence with mime type and size', () => {
    const evidence = createEvidence({
      assetId: testAssetId,
      type: EvidenceType.MEDIA,
      title: 'Property Photo',
      contentHash: 'sha256:image123456789012345678901234567890123456',
      source: testSource,
      mimeType: 'image/jpeg',
      sizeBytes: 1024000,
    });

    expect(evidence.mimeType).toBe('image/jpeg');
    expect(evidence.sizeBytes).toBe(1024000);
  });
});
