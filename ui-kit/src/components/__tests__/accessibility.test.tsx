/**
 * Accessibility Audit Tests
 *
 * Validates key ui-kit components against WCAG 2.1 AA using jest-axe.
 * Run with: npx vitest run src/components/__tests__/accessibility.test.tsx
 */

import React from 'react';
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { expect, describe, it } from 'vitest';

expect.extend(toHaveNoViolations);

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const mockAsset = {
  id: 'asset-1',
  orgId: 'org-1',
  name: 'Dubai Marina Tower Unit 1201',
  description: 'Premium waterfront property',
  rightType: 'OWNERSHIP' as const,
  lifecycleState: 'ACTIVE' as const,
  jurisdiction: 'AE',
  metadata: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockProperty = {
  id: 'prop-1',
  name: 'Marina Heights',
  location: 'Dubai Marina',
  type: 'Residential',
  area: 1200,
  areaUnit: 'sqft',
  price: '2500000',
  currency: 'AED',
  imageUrl: '',
};

const mockTicket = {
  id: 'ticket-1',
  flightNumber: 'EK 202',
  departure: 'DXB',
  arrival: 'LHR',
  departureTime: new Date(Date.now() + 86400000).toISOString(),
  arrivalTime: new Date(Date.now() + 86400000 + 25200000).toISOString(),
  passenger: 'John Doe',
  seat: '14A',
  class: 'Business',
  status: 'CONFIRMED' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Accessibility Audit', () => {
  describe('AssetCard', () => {
    it('should have no accessibility violations', async () => {
      // Dynamic import to handle potential module resolution
      const { AssetCard } = await import('../AssetCard');
      const { container } = render(
        <AssetCard asset={mockAsset} showActions={true} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('PropertyCard', () => {
    it('should have no accessibility violations', async () => {
      const { PropertyCard } = await import('../PropertyCard');
      const { container } = render(
        <PropertyCard property={mockProperty} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('TicketCard', () => {
    it('should have no accessibility violations', async () => {
      const { TicketCard } = await import('../TicketCard');
      const { container } = render(
        <TicketCard ticket={mockTicket} />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('WalletConnectModal', () => {
    it('should have no accessibility violations when open', async () => {
      const { WalletConnectModal } = await import('../WalletConnectModal');
      const { container } = render(
        <WalletConnectModal
          isOpen={true}
          onClose={() => {}}
          onConnect={() => {}}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('KYCModal', () => {
    it('should have no accessibility violations when open', async () => {
      // KYCModal uses context — wrap with a minimal mock provider
      const { KYCModal } = await import('../KYCModal');
      const { container } = render(
        <div role="dialog" aria-label="Identity Verification">
          <KYCModal
            isOpen={true}
            onClose={() => {}}
            onComplete={() => {}}
          />
        </div>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('TransactionFlow', () => {
    it('should have no accessibility violations', async () => {
      const { TransactionFlow } = await import('../TransactionFlow');
      const { container } = render(
        <TransactionFlow
          type="mint"
          assetId="asset-1"
          amount="100"
          onComplete={() => {}}
          onError={() => {}}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
