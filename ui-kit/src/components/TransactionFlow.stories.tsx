import type { Meta, StoryObj } from '@storybook/react';
import { TransactionFlow } from './TransactionFlow';

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof TransactionFlow> = {
  title: 'Components/TransactionFlow',
  component: TransactionFlow,
  tags: ['autodocs'],
  argTypes: {
    action: {
      control: 'select',
      options: ['transfer', 'mint', 'burn', 'redeem'],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480, padding: 24, background: '#0f172a', minHeight: 300, color: '#fff' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TransactionFlow>;

// ---------------------------------------------------------------------------
// Shared defaults
// ---------------------------------------------------------------------------

const BASE_API_URL = 'https://api.tokenisation.example.com';
const BASE_API_KEY = 'pk_test_demo_storybook';

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Standard token transfer between two addresses. */
export const Transfer: Story = {
  args: {
    action: 'transfer',
    apiUrl: BASE_API_URL,
    apiKey: BASE_API_KEY,
    params: {
      token: 'tok_real_estate_001',
      from: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      to: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      amount: '250',
    },
    onComplete: (receipt) => console.log('Transfer complete:', receipt),
    onError: (err) => console.error('Transfer error:', err),
  },
};

/** Minting new tokens to an address. */
export const Mint: Story = {
  args: {
    action: 'mint',
    apiUrl: BASE_API_URL,
    apiKey: BASE_API_KEY,
    params: {
      token: 'tok_bond_002',
      to: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      amount: '1000',
    },
    onComplete: (receipt) => console.log('Mint complete:', receipt),
    onError: (err) => console.error('Mint error:', err),
  },
};

/** Burning tokens (removing from circulation). */
export const Burn: Story = {
  args: {
    action: 'burn',
    apiUrl: BASE_API_URL,
    apiKey: BASE_API_KEY,
    params: {
      token: 'tok_equity_003',
      from: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      amount: '500',
    },
    onComplete: (receipt) => console.log('Burn complete:', receipt),
    onError: (err) => console.error('Burn error:', err),
  },
};

/** Redeeming tokens for the underlying asset. */
export const Redeem: Story = {
  args: {
    action: 'redeem',
    apiUrl: BASE_API_URL,
    apiKey: BASE_API_KEY,
    params: {
      token: 'tok_ticket_004',
      from: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      amount: '1',
    },
    onComplete: (receipt) => console.log('Redeem complete:', receipt),
    onError: (err) => console.error('Redeem error:', err),
  },
};

/** Transfer flow with a custom render prop that surfaces an error state. */
export const WithError: Story = {
  args: {
    action: 'transfer',
    apiUrl: 'https://invalid.endpoint.example.com',
    apiKey: 'pk_test_invalid',
    params: {
      token: 'tok_error_test',
      from: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      to: '0x0000000000000000000000000000000000000000',
      amount: '999999999',
    },
    onComplete: (receipt) => console.log('Unexpected complete:', receipt),
    onError: (err) => console.error('Expected error:', err),
    renderStep: ({ step, status, title, description, error, onRetry, onCancel }) => (
      <div style={{ padding: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{title}</strong>
          <span style={{
            fontSize: 12,
            padding: '2px 8px',
            borderRadius: 4,
            background: status === 'error' ? '#ef444433' : status === 'completed' ? '#22c55e33' : '#f59e0b33',
            color: status === 'error' ? '#ef4444' : status === 'completed' ? '#22c55e' : '#f59e0b',
          }}>
            {status}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>{description}</p>
        {error && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12, color: '#ef4444' }}>{error.message}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={onRetry} style={{ padding: '4px 12px', borderRadius: 4, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Retry
              </button>
              <button onClick={onCancel} style={{ padding: '4px 12px', borderRadius: 4, background: '#374151', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    ),
  },
};
