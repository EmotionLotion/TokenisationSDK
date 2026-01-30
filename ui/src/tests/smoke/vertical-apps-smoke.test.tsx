/**
 * Smoke Tests — Vertical App Pages
 * Verifies each vertical app page renders without crashing and shows key elements.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock framer-motion to avoid animation issues in tests
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

// Mock SDK components that rely on canvas/complex rendering
vi.mock('@tokenisation/sdk/components', () => ({
  PropertyMap: () => <div data-testid="property-map">PropertyMap</div>,
  NavHistoryChart: () => <div data-testid="nav-chart">NavHistoryChart</div>,
  RentalCalendar: () => <div data-testid="rental-calendar">RentalCalendar</div>,
  RoomSelector: ({ onSelect }: any) => <div data-testid="room-selector">RoomSelector</div>,
  SeatSelectionMap: () => <div data-testid="seat-map">SeatSelectionMap</div>,
}));

// Mock store
vi.mock('../../store', () => {
  const listeners = new Set<() => void>();
  const mockStore = {
    getAssets: vi.fn(() => []),
    getParties: vi.fn(() => []),
    getServiceCredits: vi.fn(() => ({ balance: 0, creditsUsed: [], creditsPurchased: [], totalCredits: 0, totalSpent: 0 })),
    getServiceCatalog: vi.fn(() => []),
    getServiceRedemptions: vi.fn(() => []),
    purchaseServiceCredits: vi.fn(),
    redeemServiceCredits: vi.fn(),
    getAhoyState: vi.fn(() => ({ transactions: [], totalCost: 0, totalCredits: 0 })),
    getSdkLogs: vi.fn(() => []),
    simulateAhoyAction: vi.fn(),
    getAsset: vi.fn(() => null),
    getParty: vi.fn(() => undefined),
    getBalance: vi.fn(async () => '0'),
    evaluatePersonaPermission: vi.fn(() => ({ allowed: true, reason: '' })),
    getOrCreatePartyForRole: vi.fn(),
    logSdkCall: vi.fn(),
    subscribe: vi.fn((fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    getVersion: vi.fn(() => 0),
    getSnapshot: vi.fn(() => 0),
    sdk: { engine: { hydrate: vi.fn(async () => {}) } },
  };
  return { sdkStore: mockStore };
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

function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

describe('Smoke Tests — Vertical App Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RealEstateApp', () => {
    it('should render without crashing', async () => {
      const { RealEstateApp } = await import('../../pages/apps/RealEstateApp');
      const { container } = renderWithRouter(<RealEstateApp />);
      expect(container).toBeTruthy();
    });

    it('should show back navigation button', async () => {
      const { RealEstateApp } = await import('../../pages/apps/RealEstateApp');
      renderWithRouter(<RealEstateApp />);
      expect(screen.getByText(/back to ecosystem hub/i)).toBeInTheDocument();
    });
  });

  describe('FlyPlusApp (Airline Tickets)', () => {
    it('should render without crashing', async () => {
      const { FlyPlusApp } = await import('../../pages/apps/FlyPlusApp');
      const { container } = renderWithRouter(<FlyPlusApp />);
      expect(container).toBeTruthy();
    });

    it('should show back navigation button', async () => {
      const { FlyPlusApp } = await import('../../pages/apps/FlyPlusApp');
      renderWithRouter(<FlyPlusApp />);
      expect(screen.getByText(/back to ecosystem hub/i)).toBeInTheDocument();
    });
  });

  describe('CarRentalApp', () => {
    it('should render without crashing', async () => {
      const { CarRentalApp } = await import('../../pages/apps/CarRentalApp');
      const { container } = renderWithRouter(<CarRentalApp />);
      expect(container).toBeTruthy();
    });

    it('should show back navigation button', async () => {
      const { CarRentalApp } = await import('../../pages/apps/CarRentalApp');
      renderWithRouter(<CarRentalApp />);
      expect(screen.getByText(/back to ecosystem hub/i)).toBeInTheDocument();
    });
  });

  describe('HotelApp', () => {
    it('should render without crashing', async () => {
      const { HotelApp } = await import('../../pages/apps/HotelApp');
      const { container } = renderWithRouter(<HotelApp />);
      expect(container).toBeTruthy();
    });

    it('should show back navigation button', async () => {
      const { HotelApp } = await import('../../pages/apps/HotelApp');
      renderWithRouter(<HotelApp />);
      expect(screen.getByText(/back to ecosystem hub/i)).toBeInTheDocument();
    });
  });

  describe('ConcertApp', () => {
    it('should render without crashing', async () => {
      const { ConcertApp } = await import('../../pages/apps/ConcertApp');
      const { container } = renderWithRouter(<ConcertApp />);
      expect(container).toBeTruthy();
    });

    it('should show back navigation button', async () => {
      const { ConcertApp } = await import('../../pages/apps/ConcertApp');
      renderWithRouter(<ConcertApp />);
      expect(screen.getByText(/back to ecosystem hub/i)).toBeInTheDocument();
    });
  });
});
