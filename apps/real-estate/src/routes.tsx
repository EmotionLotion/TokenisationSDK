import { createBrowserRouter } from 'react-router-dom';
import { MarketplaceLayout } from './layouts/MarketplaceLayout';
import { InvestorLayout } from './layouts/InvestorLayout';
import { AdminLayout } from './layouts/AdminLayout';

// Marketplace pages
import { BrowseProperties } from './pages/marketplace/BrowseProperties';
import { PropertyDetail } from './pages/marketplace/PropertyDetail';

// Investor pages
import { Onboarding } from './pages/investor/Onboarding';
import { InvestFlow } from './pages/investor/InvestFlow';
import { Portfolio } from './pages/investor/Portfolio';
import { Statements } from './pages/investor/Statements';
import { CartCheckout } from './pages/investor/CartCheckout';

// Admin pages
import { Dashboard } from './pages/admin/Dashboard';
import { OnboardProperty } from './pages/admin/OnboardProperty';
import { CompliancePanel } from './pages/admin/CompliancePanel';
import { DividendManager } from './pages/admin/DividendManager';
import { ListingManager } from './pages/admin/ListingManager';
import { Approvals } from './pages/admin/Approvals';
import { ExitWindowManager } from './pages/admin/ExitWindowManager';
import { InvestorTierManager } from './pages/admin/InvestorTierManager';
import { SecondaryMarketOverview } from './pages/admin/SecondaryMarketOverview';

export const router = createBrowserRouter([
  // Public marketplace
  {
    path: '/',
    element: <MarketplaceLayout />,
    children: [
      { index: true, element: <BrowseProperties /> },
      { path: 'property/:id', element: <PropertyDetail /> },
    ],
  },

  // Investor portal
  {
    path: '/investor',
    element: <InvestorLayout />,
    children: [
      { path: 'onboarding', element: <Onboarding /> },
      { path: 'invest/:propertyId', element: <InvestFlow /> },
      { index: true, element: <Portfolio /> },
      { path: 'statements', element: <Statements /> },
      { path: 'cart', element: <CartCheckout /> },
    ],
  },

  // Admin / Issuer dashboard
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'onboard', element: <OnboardProperty /> },
      { path: 'compliance', element: <CompliancePanel /> },
      { path: 'dividends', element: <DividendManager /> },
      { path: 'listings', element: <ListingManager /> },
      { path: 'approvals', element: <Approvals /> },
      { path: 'exit-windows', element: <ExitWindowManager /> },
      { path: 'investor-tiers', element: <InvestorTierManager /> },
      { path: 'secondary-market', element: <SecondaryMarketOverview /> },
    ],
  },
]);
