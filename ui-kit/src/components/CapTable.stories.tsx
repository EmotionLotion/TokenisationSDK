import type { Meta, StoryObj } from '@storybook/react';
import { CapTable } from './CapTable';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock provider wrapper
// ---------------------------------------------------------------------------

/**
 * CapTable relies on useTokenisation() context. We supply a mock that
 * returns deterministic holder data so stories render predictably.
 */

interface MockHolder {
  id: string;
  name: string;
  balance: string;
}

function createMockProvider(holders: MockHolder[], totalSupply = '10000') {
  return function MockProvider({ children }: { children: React.ReactNode }) {
    const mockApi = {
      assets: {
        get: async (_id: string) => ({
          asset: {
            tokenInfo: { totalSupply },
          },
        }),
      },
      parties: {
        list: async () => ({
          parties: holders.map((h) => ({ id: h.id, name: h.name })),
        }),
      },
      tokens: {
        balance: async (_assetId: string, partyId: string) => {
          const found = holders.find((h) => h.id === partyId);
          return { balance: found?.balance ?? '0' };
        },
      },
    };

    const mockContext = {
      api: mockApi,
      events: { emit: () => {} },
      user: { id: 'user_001' },
      theme: { colors: { primary: '#F8B032' } },
      isReady: true,
    };

    const TokenisationContext = React.createContext(mockContext);

    return (
      <TokenisationContext.Provider value={mockContext as any}>
        {children}
      </TokenisationContext.Provider>
    );
  };
}

// ---------------------------------------------------------------------------
// Holder datasets
// ---------------------------------------------------------------------------

const DEFAULT_HOLDERS: MockHolder[] = [
  { id: 'party_001', name: 'Sovereign Wealth Fund', balance: '4000' },
  { id: 'party_002', name: 'Institutional LP Alpha', balance: '2500' },
  { id: 'party_003', name: 'Family Office Beta', balance: '1500' },
  { id: 'party_004', name: 'Retail Investor Pool', balance: '1000' },
  { id: 'party_005', name: 'Treasury Reserve', balance: '1000' },
];

const LARGE_HOLDERS: MockHolder[] = Array.from({ length: 50 }, (_, i) => ({
  id: `party_${String(i + 1).padStart(3, '0')}`,
  name: `Holder ${i + 1}`,
  balance: String(Math.max(100, Math.floor(10000 / (i + 1)))),
}));

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof CapTable> = {
  title: 'Components/CapTable',
  component: CapTable,
  tags: ['autodocs'],
  argTypes: {
    maxHolders: { control: { type: 'number', min: 1, max: 50 } },
    showPercentages: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480, padding: 24, background: '#0f172a', minHeight: 200 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof CapTable>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Default cap table with 5 holders. */
export const Default: Story = {
  decorators: [
    (Story) => {
      const Provider = createMockProvider(DEFAULT_HOLDERS);
      return <Provider><Story /></Provider>;
    },
  ],
  args: {
    assetId: 'asset_001',
    maxHolders: 10,
    showPercentages: true,
  },
};

/** Empty cap table with no holders. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      const Provider = createMockProvider([]);
      return <Provider><Story /></Provider>;
    },
  ],
  args: {
    assetId: 'asset_empty',
    maxHolders: 10,
    showPercentages: true,
  },
};

/** Cap table with 50 holders, showing top 20. */
export const LargeDataset: Story = {
  decorators: [
    (Story) => {
      const Provider = createMockProvider(LARGE_HOLDERS, '100000');
      return <Provider><Story /></Provider>;
    },
  ],
  args: {
    assetId: 'asset_large',
    maxHolders: 20,
    showPercentages: true,
  },
};

/** Cap table configured for CSV-style export display (percentages hidden). */
export const WithExport: Story = {
  decorators: [
    (Story) => {
      const Provider = createMockProvider(DEFAULT_HOLDERS);
      return <Provider><Story /></Provider>;
    },
  ],
  args: {
    assetId: 'asset_export',
    maxHolders: 10,
    showPercentages: false,
    className: 'border border-white/20 rounded-xl',
  },
};
