/**
 * Smoke Tests — UIKitDemo (SDK Demo — Live Backend)
 * Verifies the UIKitDemo page renders correctly with all 7 sections.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock store with realistic initial state
vi.mock('../../store', () => {
  const listeners = new Set<() => void>();
  const mockStore = {
    getAssets: vi.fn(() => []),
    getParties: vi.fn(() => []),
    getBalances: vi.fn(() => ({})),
    subscribe: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    getVersion: vi.fn(() => 0),
    getSnapshot: vi.fn(() => 0),
    createAsset: vi.fn(async () => ({ id: 'AST-1', name: 'Test Asset', state: 'DRAFT' })),
    transition: vi.fn(async () => ({ success: true })),
    createParty: vi.fn(() => ({ id: 'PTY-1', name: 'Test Party' })),
    verifyKyc: vi.fn(),
    mint: vi.fn(async () => ({ success: true })),
    transfer: vi.fn(async () => ({ success: true })),
    getBalance: vi.fn(async () => '0'),
    checkTransferCompliance: vi.fn(() => ({ eligible: true })),
    updateAssetValuation: vi.fn(),
    logSdkCall: vi.fn(),
    sdk: {
      parties_: { setKyc: vi.fn() },
    },
  };
  return { sdkStore: mockStore };
});

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Smoke Tests — UIKitDemo Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the page title', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);
    expect(screen.getByText('SDK Demo — Live Backend')).toBeInTheDocument();
  });

  it('should render the subtitle description', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);
    expect(screen.getByText(/every button calls the real @tokenisation\/sdk/i)).toBeInTheDocument();
  });

  it('should render all 7 section tabs', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);

    const tabs = ['Overview', 'Asset Lifecycle', 'Parties & KYC', 'Token Operations', 'Compliance', 'Valuations', 'API Reference'];
    for (const tab of tabs) {
      expect(screen.getAllByText(tab).length).toBeGreaterThan(0);
    }
  });

  it('should show Overview section by default', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);
    expect(screen.getByText('SDK Verticals')).toBeInTheDocument();
  });

  it('should show the 5 SDK verticals in Overview', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);

    const verticals = ['Real Estate', 'Airline Tickets', 'Concert Tickets', 'Hotel Reservations', 'Car Rentals'];
    for (const v of verticals) {
      expect(screen.getByText(v)).toBeInTheDocument();
    }
  });

  it('should show stat cards in Overview', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);

    expect(screen.getByText('Total Assets')).toBeInTheDocument();
    expect(screen.getByText('Registered Parties')).toBeInTheDocument();
    expect(screen.getByText('KYC Verified')).toBeInTheDocument();
    expect(screen.getByText('Active Assets')).toBeInTheDocument();
  });

  it('should switch to Asset Lifecycle tab', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);

    fireEvent.click(screen.getAllByText('Asset Lifecycle')[0]);
    expect(screen.getAllByText(/sdk\.assets\.create\(\)/i).length).toBeGreaterThan(0);
  });

  it('should switch to Parties & KYC tab', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);

    fireEvent.click(screen.getByText('Parties & KYC'));
    expect(screen.getAllByText(/sdk\.parties\.create\(\)/i).length).toBeGreaterThan(0);
  });

  it('should switch to API Reference tab', async () => {
    const { UIKitDemo } = await import('../../pages/UIKitDemo');
    renderWithRouter(<UIKitDemo />);

    fireEvent.click(screen.getByText('API Reference'));
    expect(screen.getByText(/Quick Start/i)).toBeInTheDocument();
  });
});
