/**
 * Compliance Plugin Tests
 *
 * Tests for jurisdiction and KYC compliance plugins.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockJurisdictionPlugin,
  createMockCompliancePlugin,
  type IJurisdictionPlugin,
  type ICompliancePlugin,
} from '@tokenisation/core';
import { createJurisdictionPlugin } from '@tokenisation/compliance';
import { RightType, LifecycleState, TransferabilityMode } from '@tokenisation/core';
import type { Asset } from '@tokenisation/core';

describe('Mock Jurisdiction Plugin', () => {
  let plugin: IJurisdictionPlugin;

  beforeEach(() => {
    plugin = createMockJurisdictionPlugin();
  });

  function createTestAsset(jurisdiction: string): Asset {
    return {
      id: 'test-asset',
      name: 'Test Asset',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.ACTIVE,
      transferability: TransferabilityMode.TRANSFERABLE,
      jurisdiction: { countryCode: jurisdiction },
      issuerId: 'issuer-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  it('should allow asset creation in permitted jurisdiction', async () => {
    const asset = createTestAsset('US');
    const result = await plugin.canCreateAsset(asset);
    expect(result.allowed).toBe(true);
  });

  it('should block asset creation in restricted jurisdiction', async () => {
    const asset = createTestAsset('KP'); // North Korea
    const result = await plugin.canCreateAsset(asset);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('blocked');
  });

  it('should allow transfer between permitted jurisdictions', async () => {
    const asset = createTestAsset('US');
    const result = await plugin.canTransfer(
      {
        from: { id: 'party-1', jurisdiction: 'US' } as any,
        to: { id: 'party-2', jurisdiction: 'AE' } as any,
        asset,
        amount: '1000',
      },
      'US',
      'AE'
    );
    expect(result.allowed).toBe(true);
  });

  it('should block transfer to restricted jurisdiction', async () => {
    const asset = createTestAsset('US');
    const result = await plugin.canTransfer(
      {
        from: { id: 'party-1', jurisdiction: 'US' } as any,
        to: { id: 'party-2', jurisdiction: 'IR' } as any, // Iran
        asset,
        amount: '1000',
      },
      'US',
      'IR'
    );
    expect(result.allowed).toBe(false);
  });

  it('should allow US jurisdiction assets', async () => {
    const asset = createTestAsset('US');
    const result = await plugin.canCreateAsset(asset);
    expect(result.allowed).toBe(true);
  });
});

describe('Production Jurisdiction Plugin', () => {
  it('should create plugin with default config', () => {
    const plugin = createJurisdictionPlugin();
    expect(plugin).toBeDefined();
  });

  it('should create plugin with custom rules', () => {
    const plugin = createJurisdictionPlugin({
      rules: {
        US: {
          framework: 'US_SEC',
          requireAccreditation: true,
          holdingPeriodDays: 365,
        },
      },
    });
    expect(plugin).toBeDefined();
  });

  it('should block by default when defaultAllow is false', async () => {
    const plugin = createJurisdictionPlugin({
      defaultAllow: false,
      rules: {
        US: {
          framework: 'US_SEC',
        },
      },
    });

    const asset: Asset = {
      id: 'test',
      name: 'Test',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.DRAFT,
      transferability: TransferabilityMode.TRANSFERABLE,
      jurisdiction: { countryCode: 'XX' }, // Unknown jurisdiction
      issuerId: 'issuer-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    const result = await plugin.canCreateAsset(asset);
    expect(result.allowed).toBe(false);
  });

  it('should require documents for UAE VARA framework', async () => {
    const plugin = createJurisdictionPlugin({
      rules: {
        AE: {
          framework: 'UAE_VARA',
          requiredDocuments: ['PASSPORT', 'PROOF_OF_ADDRESS'],
        },
      },
    });

    const asset: Asset = {
      id: 'test',
      name: 'Test',
      rightType: RightType.OWNERSHIP,
      state: LifecycleState.DRAFT,
      transferability: TransferabilityMode.TRANSFERABLE,
      jurisdiction: { countryCode: 'AE' },
      issuerId: 'issuer-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    const result = await plugin.canCreateAsset(asset);
    // Should be allowed but with required documents
    expect(result.allowed).toBe(true);
    expect(result.requiredDocuments).toContain('PASSPORT');
    expect(result.requiredDocuments).toContain('PROOF_OF_ADDRESS');
  });
});

describe('Mock Compliance Plugin', () => {
  let plugin: ICompliancePlugin;

  beforeEach(() => {
    plugin = createMockCompliancePlugin();
  });

  it('should return compliance status for party', async () => {
    const status = await plugin.getPartyStatus('party-1');
    expect(status).toBeDefined();
    expect(status.partyId).toBe('party-1');
  });

  it('should set and check KYC status', async () => {
    // Set KYC verified
    (plugin as any).setKycVerified('party-1', true);

    const status = await plugin.getPartyStatus('party-1');
    expect(status.kycVerified).toBe(true);
  });

  it('should evaluate transfer compliance', async () => {
    // Set both parties as KYC verified
    (plugin as any).setKycVerified('party-1', true);
    (plugin as any).setKycVerified('party-2', true);

    const result = await plugin.evaluateTransfer(
      {
        from: { id: 'party-1' } as any,
        to: { id: 'party-2' } as any,
        asset: {
          id: 'asset-1',
          name: 'Test',
          rightType: RightType.OWNERSHIP,
          state: LifecycleState.ACTIVE,
          jurisdiction: { countryCode: 'US' },
        } as any,
        amount: '1000',
      },
      { partyId: 'party-1', kycVerified: true, kycLevel: 2, compliant: true, restrictedJurisdictions: [] },
      { partyId: 'party-2', kycVerified: true, kycLevel: 2, compliant: true, restrictedJurisdictions: [] }
    );

    expect(result.compliant).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it('should flag compliance violations for non-KYC party', async () => {
    const result = await plugin.evaluateTransfer(
      {
        from: { id: 'party-1' } as any,
        to: { id: 'party-2' } as any,
        asset: {
          id: 'asset-1',
          name: 'Test',
          rightType: RightType.OWNERSHIP,
          state: LifecycleState.ACTIVE,
          jurisdiction: { countryCode: 'US' },
        } as any,
        amount: '1000',
      },
      { partyId: 'party-1', kycVerified: true, kycLevel: 2, compliant: true, restrictedJurisdictions: [] },
      { partyId: 'party-2', kycVerified: false, kycLevel: 0, compliant: false, restrictedJurisdictions: [] }
    );

    expect(result.compliant).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});
