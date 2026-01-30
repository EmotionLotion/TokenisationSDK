import type { Meta, StoryObj } from '@storybook/react';
import { KYCModal } from './KYCModal';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock provider wrapper
// ---------------------------------------------------------------------------

/**
 * The KYCModal relies on useTokenisation() context. For Storybook isolation we
 * wrap it with a minimal mock provider that satisfies the component contract.
 */
function MockProvider({ children }: { children: React.ReactNode }) {
  const mockContext = {
    api: {
      parties: {
        setKyc: async (_id: string, _data: unknown) => ({ id: 'identity_mock_001' }),
      },
    },
    events: {
      emit: (type: string, payload: unknown) => console.log('[event]', type, payload),
    },
    user: { id: 'user_mock_001' },
    theme: {
      colors: {
        primary: '#F8B032',
        backgroundSecondary: 'rgba(15, 23, 42, 0.95)',
      },
    },
    isReady: true,
  };

  // Provide the context via the real provider module's context, or fall back
  // to a simple React context.
  const TokenisationContext = React.createContext(mockContext);

  return (
    <TokenisationContext.Provider value={mockContext as any}>
      {children}
    </TokenisationContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof KYCModal> = {
  title: 'Components/KYCModal',
  component: KYCModal,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MockProvider>
        <Story />
      </MockProvider>
    ),
  ],
  argTypes: {
    isOpen: { control: 'boolean' },
  },
};

export default meta;

type Story = StoryObj<typeof KYCModal>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** Default KYC modal shown from the intro step. */
export const Default: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('KYC closed'),
    onComplete: (result) => console.log('KYC complete', result),
    config: {
      requiredTier: 'STANDARD',
    },
  },
};

/** Modal opened mid-flow (skip intro, start at personal info). Simulates a returning user. */
export const InProgress: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('KYC closed'),
    onComplete: (result) => console.log('KYC complete', result),
    config: {
      requiredTier: 'STANDARD',
      skipIntro: true,
    },
  },
};

/** Pre-approved state with custom success strings. */
export const Approved: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('KYC closed'),
    onComplete: (result) => console.log('KYC complete', result),
    config: {
      requiredTier: 'ENHANCED',
      strings: {
        successTitle: 'Identity Confirmed',
        successMessage: 'Your enhanced verification is complete. You may now trade regulated assets.',
      },
    },
  },
};

/** Rejected state simulation with custom error messaging. */
export const Rejected: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('KYC closed'),
    onComplete: (result) => console.log('KYC complete', result),
    onError: (err) => console.error('KYC error', err),
    config: {
      requiredTier: 'STANDARD',
      strings: {
        errorTitle: 'Verification Unsuccessful',
      },
    },
  },
};

/** Custom step labels for white-label / i18n use case. */
export const WithCustomSteps: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log('KYC closed'),
    onComplete: (result) => console.log('KYC complete', result),
    config: {
      requiredTier: 'BASIC',
      strings: {
        title: 'Kontoverifizierung',
        subtitle: 'Bitte verifizieren Sie Ihre Identitaet, um fortzufahren.',
        startButton: 'Verifizierung starten',
        submitButton: 'Absenden',
        processingText: 'Verifizierung laeuft...',
        successTitle: 'Verifizierung abgeschlossen!',
        successMessage: 'Ihre Identitaet wurde bestaetigt.',
        errorTitle: 'Verifizierung fehlgeschlagen',
        retryButton: 'Erneut versuchen',
      },
    },
  },
};
