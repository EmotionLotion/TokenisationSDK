/**
 * Conformance Tests — Vertical Demo Pages
 * Verifies each vertical demo page conforms to expected UI patterns:
 * - Has a back navigation button
 * - Renders main heading/brand
 * - Contains interactive elements
 * - Does not crash with empty store state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    h3: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    img: (props: any) => <img {...props} />,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
  useInView: () => true,
}));

// Mock SDK components
vi.mock('@tokenisation/sdk/components', () => ({
  PropertyMap: () => <div data-testid="property-map">PropertyMap</div>,
  NavHistoryChart: () => <div data-testid="nav-chart">NavHistoryChart</div>,
  RentalCalendar: ({ onSelect }: any) => <div data-testid="rental-calendar">RentalCalendar</div>,
  RoomSelector: ({ onSelect }: any) => <div data-testid="room-selector">RoomSelector</div>,
  SeatSelectionMap: ({ onSelect }: any) => <div data-testid="seat-map">SeatSelectionMap</div>,
}));

// Mock store
vi.mock('../../store', () => {
  const listeners = new Set<() => void>();
  return {
    sdkStore: {
      getAssets: vi.fn(() => []),
      getParties: vi.fn(() => []),
      getServiceCredits: vi.fn(() => ({ balance: 0, creditsUsed: [], creditsPurchased: [], totalCredits: 0, totalSpent: 0 })),
      getServiceCatalog: vi.fn(() => []),
      getServiceRedemptions: vi.fn(() => []),
      purchaseServiceCredits: vi.fn(),
      redeemServiceCredits: vi.fn(),
      getBalances: vi.fn(() => ({})),
      getAhoyState: vi.fn(() => ({ transactions: [], totalCost: 0, totalCredits: 0 })),
      getSdkLogs: vi.fn(() => []),
      simulateAhoyAction: vi.fn(),
      getAsset: vi.fn(() => null),
      getParty: vi.fn(() => undefined),
      getBalance: vi.fn(async () => '0'),
      evaluatePersonaPermission: vi.fn(() => ({ allowed: true, reason: '' })),
      getOrCreatePartyForRole: vi.fn(),
      subscribe: vi.fn((fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      }),
      getVersion: vi.fn(() => 0),
      getSnapshot: vi.fn(() => 0),
      logSdkCall: vi.fn(),
      sdk: { engine: { hydrate: vi.fn(async () => {}) } },
    },
  };
});

// Mock SDKContext
vi.mock('../../contexts/SDKContext', () => ({
  useSDK: () => ({
    sdk: {},
    isInitialized: true,
    assets: [],
    getAsset: vi.fn(),
    createAsset: vi.fn(),
    transitionAsset: vi.fn(),
    refreshAssets: vi.fn(),
    parties: [],
    getParty: vi.fn(),
    createParty: vi.fn(),
    getAssetMetrics: vi.fn(() => ({ totalAssets: 0, activeAssets: 0, pendingAssets: 0, draftAssets: 0, totalValue: '0' })),
    getServiceMetrics: vi.fn(() => ({ activeUsers: 0, totalTransactions: 0, dailyVolume: '0', growthPercent: 0 })),
    recentEvents: [],
    sdkLogs: [],
    ahoyState: { transactions: [], totalCost: 0, totalCredits: 0, balance: 0, lifetimeEarned: 0, tier: 'BRONZE', recentActions: [] },
    simulateAhoyAction: vi.fn(),
    evaluatePermission: vi.fn(() => ({ allowed: true, reason: '' })),
    getOrCreatePartyForRole: vi.fn(),
  }),
  useAssets: () => ({ assets: [], refreshAssets: vi.fn(), createAsset: vi.fn(), transitionAsset: vi.fn() }),
  useParties: () => ({ parties: [], createParty: vi.fn(), getParty: vi.fn() }),
  useAssetMetrics: () => ({ totalAssets: 0, activeAssets: 0, pendingAssets: 0, draftAssets: 0, totalValue: '0' }),
  useServiceMetrics: () => ({ activeUsers: 0, totalTransactions: 0, dailyVolume: '0', growthPercent: 0 }),
  useSDKLogs: () => [],
  useAhoyState: () => ({ ahoyState: { transactions: [], totalCost: 0, totalCredits: 0, balance: 0, lifetimeEarned: 0, tier: 'BRONZE', recentActions: [] }, simulateAhoyAction: vi.fn() }),
  useTransactionFeed: () => ({ events: [], transactions: [] }),
  SDKProvider: ({ children }: any) => <>{children}</>,
}));

// Mock Ahoy context
vi.mock('../../components/ahoy/AhoyContext', () => ({
  useAhoyState: () => ({
    simulateAhoyAction: vi.fn(),
    totalCost: 0,
    totalCredits: 0,
    recentActions: [],
  }),
  AhoyProvider: ({ children }: any) => <>{children}</>,
}));

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

interface VerticalSpec {
  name: string;
  importPath: string;
  exportName: string;
  brand: string | RegExp;
  subtitle?: string | RegExp;
  hasBackButton: boolean;
}

const verticals: VerticalSpec[] = [
  {
    name: 'Real Estate',
    importPath: '../../pages/apps/RealEstateApp',
    exportName: 'RealEstateApp',
    brand: 'EstateToken',
    subtitle: /real estate/i,
    hasBackButton: true,
  },
  {
    name: 'Airline Tickets',
    importPath: '../../pages/apps/FlyPlusApp',
    exportName: 'FlyPlusApp',
    brand: 'FLY+',
    hasBackButton: true,
  },
  {
    name: 'Car Rental',
    importPath: '../../pages/apps/CarRentalApp',
    exportName: 'CarRentalApp',
    brand: 'DriveChain',
    subtitle: /fleet/i,
    hasBackButton: true,
  },
  {
    name: 'Hotel Reservation',
    importPath: '../../pages/apps/HotelApp',
    exportName: 'HotelApp',
    brand: 'LuxeStay',
    subtitle: /hospitality/i,
    hasBackButton: true,
  },
  {
    name: 'Concert Tickets',
    importPath: '../../pages/apps/ConcertApp',
    exportName: 'ConcertApp',
    brand: 'VibeTix',
    subtitle: /nft ticketing/i,
    hasBackButton: true,
  },
];

describe('Conformance Tests — Vertical Demo Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const vertical of verticals) {
    describe(`${vertical.name} (${vertical.exportName})`, () => {
      it('should render without crashing with empty store state', async () => {
        const mod = await import(vertical.importPath);
        const Component = mod[vertical.exportName];
        const { container } = renderWithRouter(<Component />);
        expect(container.firstChild).toBeTruthy();
      });

      if (vertical.hasBackButton) {
        it('should have a back navigation element', async () => {
          const mod = await import(vertical.importPath);
          const Component = mod[vertical.exportName];
          renderWithRouter(<Component />);
          expect(screen.getByText(/back to ecosystem hub/i)).toBeInTheDocument();
        });
      }

      it('should render the brand heading', async () => {
        const mod = await import(vertical.importPath);
        const Component = mod[vertical.exportName];
        renderWithRouter(<Component />);
        if (typeof vertical.brand === 'string') {
          expect(screen.getByText(vertical.brand)).toBeInTheDocument();
        } else {
          expect(screen.getByText(vertical.brand)).toBeInTheDocument();
        }
      });

      if (vertical.subtitle) {
        it('should render the subtitle/description', async () => {
          const mod = await import(vertical.importPath);
          const Component = mod[vertical.exportName];
          renderWithRouter(<Component />);
          expect(screen.getByText(vertical.subtitle!)).toBeInTheDocument();
        });
      }

      it('should contain interactive elements (buttons)', async () => {
        const mod = await import(vertical.importPath);
        const Component = mod[vertical.exportName];
        const { container } = renderWithRouter(<Component />);
        const buttons = container.querySelectorAll('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  }
});
