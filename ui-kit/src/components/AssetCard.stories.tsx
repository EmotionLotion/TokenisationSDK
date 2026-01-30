import type { Meta, StoryObj } from '@storybook/react';
import { AssetCard } from './AssetCard';
import type { Asset } from '@tokenisation/sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset_001',
    name: 'Dubai Marina Tower',
    rightType: 'OWNERSHIP',
    state: 'ACTIVE',
    jurisdiction: { countryCode: 'AE' },
    tokenInfo: { totalSupply: '1000000' },
    createdAt: '2025-06-15T10:00:00Z',
    ...overrides,
  } as Asset;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof AssetCard> = {
  title: 'Components/AssetCard',
  component: AssetCard,
  tags: ['autodocs'],
  argTypes: {
    showActions: { control: 'boolean' },
    className: { control: 'text' },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360, padding: 24, background: '#0f172a', minHeight: 200 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof AssetCard>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Default active asset card with actions visible. */
export const Default: Story = {
  args: {
    asset: makeAsset(),
    showActions: true,
    onClick: (asset) => console.log('Clicked', asset.id),
    onInvest: (asset) => console.log('Invest', asset.id),
  },
};

/** Asset in loading / draft state. */
export const Loading: Story = {
  args: {
    asset: makeAsset({
      name: 'Pending Asset',
      state: 'DRAFT' as any,
      tokenInfo: { totalSupply: '0' },
    }),
    showActions: false,
  },
};

/** Asset card with an image-style background hint (demonstrates custom className). */
export const WithImage: Story = {
  args: {
    asset: makeAsset({
      name: 'Luxury Villa - Palm Jumeirah',
      jurisdiction: { countryCode: 'AE' },
      tokenInfo: { totalSupply: '500' },
    }),
    showActions: true,
    className: 'ring-1 ring-amber-500/30',
  },
};

/** Real estate asset type. */
export const RealEstate: Story = {
  args: {
    asset: makeAsset({
      id: 'asset_re_002',
      name: 'Manhattan Office Block',
      rightType: 'OWNERSHIP',
      state: 'ACTIVE',
      jurisdiction: { countryCode: 'US' },
      tokenInfo: { totalSupply: '10000' },
      createdAt: '2025-03-01T08:00:00Z',
    }),
    showActions: true,
    onInvest: (asset) => console.log('Invest in RE', asset.id),
  },
};

/** Airline ticket / access token. */
export const AirlineTicket: Story = {
  args: {
    asset: makeAsset({
      id: 'asset_tkt_003',
      name: 'EK 101 Business - DXB to LHR',
      rightType: 'ACCESS',
      state: 'ACTIVE',
      jurisdiction: { countryCode: 'AE' },
      tokenInfo: { totalSupply: '1' },
      createdAt: '2025-09-20T14:30:00Z',
    }),
    showActions: false,
  },
};
