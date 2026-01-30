import { createBrowserRouter } from 'react-router-dom';
import { PlatformLayout } from './layouts/PlatformLayout';

// Pages
import { EcosystemHub } from './pages/EcosystemHub';
import { CometApp } from './pages/apps/CometApp';
import { FlyPlusApp } from './pages/apps/FlyPlusApp';
import { H2OApp } from './pages/apps/H2OApp';
import { AMSApp } from './pages/apps/AMSApp';
import { TrouveApp } from './pages/apps/TrouveApp';
import { NexusApp } from './pages/apps/NexusApp';
import { EquityApp } from './pages/apps/EquityApp';
import { IITSApp } from './pages/apps/IITSApp';
import { GTSApp } from './pages/apps/GTSApp';
import { RealEstateApp } from './pages/apps/RealEstateApp';
import { HotelApp } from './pages/apps/HotelApp';
import { ConcertApp } from './pages/apps/ConcertApp';
import { CarRentalApp } from './pages/apps/CarRentalApp';
import { ShowcaseApp } from './pages/apps/ShowcaseApp';

// Existing page components (will be migrated)
import { Dashboard } from './components/Dashboard';
import { PolicyStudio } from './components/PolicyStudio';
import { IdentitiesPage } from './components/IdentitiesPage';
import { TransactionsPage } from './components/TransactionsPage';
import { OraclesPage } from './components/OraclesPage';
import { PayoutsPage } from './components/PayoutsPage';
import { DevelopersPage } from './components/DevelopersPage';
import { UIKitDemo } from './pages/UIKitDemo';
import { DemoWizard } from './components/DemoWizard';
import { InstitutionalDemo } from './components/InstitutionalDemo';

// New Core Components
import { AssetClassWizard } from './components/AssetClassWizard';
import { IdentityProfile } from './components/IdentityProfile';
import { UnifiedMarketplace } from './components/UnifiedMarketplace';
import { OracleManager } from './components/OracleManager';
import { StakingDashboard } from './components/StakingDashboard';

// SDK Module UI Components
import { CashFlowDashboard } from './components/CashFlowDashboard';
import { GovernancePortal } from './components/GovernancePortal';
import { EscrowTracker } from './components/EscrowTracker';
import { SoulboundProgress } from './components/SoulboundProgress';

// Module 3: Time-Travel Debugger
import { DebuggerPage } from './pages/DebuggerPage';

// Module 4: Headless Demo
import { HeadlessDemo } from './pages/HeadlessDemo';

// Module 5: Documentation & Comparison Pages
import { LibraryPage } from './components/LibraryPage';
import { HeadlessDocsPage } from './components/HeadlessDocsPage';
import { HeadlessVsLibrary } from './components/HeadlessVsLibrary';

// Module 6: Partner Admin Demo
import { PartnerApprovalDemo } from './components/blueprints/PartnerApprovalDemo';

// Module 2: Interactive Playground (lazy-loaded)
import { lazy, Suspense } from 'react';
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage').then(m => ({ default: m.PlaygroundPage })));

export const router = createBrowserRouter([
    {
        path: '/',
        element: <PlatformLayout />,
        children: [
            // Main Dashboard (Ecosystem Hub)
            {
                index: true,
                element: <EcosystemHub />,
            },
            // App Routes - Each vertical service has its own URL
            {
                path: 'app/comet',
                element: <CometApp />,
            },
            {
                path: 'app/flyplus',
                element: <FlyPlusApp />,
            },
            {
                path: 'app/h2o',
                element: <H2OApp />,
            },
            {
                path: 'app/ams',
                element: <AMSApp />,
            },
            {
                path: 'app/trouve',
                element: <TrouveApp />,
            },
            {
                path: 'app/nexus',
                element: <NexusApp />,
            },
            {
                path: 'app/equity',
                element: <EquityApp />,
            },
            {
                path: 'app/iits',
                element: <IITSApp />,
            },
            {
                path: 'app/gts',
                element: <GTSApp />,
            },
            // New Vertical Apps
            {
                path: 'app/real-estate',
                element: <RealEstateApp />,
            },
            {
                path: 'app/hotel',
                element: <HotelApp />,
            },
            {
                path: 'app/concert',
                element: <ConcertApp />,
            },
            {
                path: 'app/car-rental',
                element: <CarRentalApp />,
            },
            // Guided Showcase
            {
                path: 'showcase',
                element: <ShowcaseApp />,
            },
            {
                path: 'showcase/:vertical',
                element: <ShowcaseApp />,
            },
            // Platform Pages
            {
                path: 'assets',
                element: <Dashboard onSelectAsset={() => { }} />,
            },
            {
                path: 'identities',
                element: <IdentitiesPage />,
            },
            {
                path: 'policies',
                element: <PolicyStudio />,
            },
            {
                path: 'transactions',
                element: <TransactionsPage />,
            },
            {
                path: 'oracles',
                element: <OraclesPage />,
            },
            {
                path: 'payouts',
                element: <PayoutsPage />,
            },
            {
                path: 'developers',
                element: <DevelopersPage />,
            },
            {
                path: 'uikit',
                element: <UIKitDemo />,
            },
            {
                path: 'demo',
                element: <DemoWizard />,
            },
            {
                path: 'demo/institutional',
                element: <InstitutionalDemo />,
            },
            {
                path: 'settings',
                element: <div className="flex items-center justify-center h-full text-gray-500"><p>Settings coming soon...</p></div>,
            },
            // New Core Platform Routes
            {
                path: 'factory',
                element: <AssetClassWizard />,
            },
            {
                path: 'identity',
                element: <IdentityProfile />,
            },
            {
                path: 'marketplace',
                element: <UnifiedMarketplace />,
            },
            {
                path: 'oracle-manager',
                element: <OracleManager />,
            },
            {
                path: 'staking',
                element: <StakingDashboard />,
            },
            // SDK Module UI Routes
            {
                path: 'cashflow',
                element: <CashFlowDashboard />,
            },
            {
                path: 'governance',
                element: <GovernancePortal />,
            },
            {
                path: 'escrow',
                element: <EscrowTracker />,
            },
            {
                path: 'soulbound',
                element: <SoulboundProgress />,
            },
            // Module 3: Time-Travel Debugger
            {
                path: 'debugger',
                element: <DebuggerPage />,
            },
            // Module 2: Interactive Playground
            {
                path: 'playground',
                element: <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Loading Playground...</div>}><PlaygroundPage /></Suspense>,
            },
            {
                path: 'playground/:vertical',
                element: <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Loading Playground...</div>}><PlaygroundPage /></Suspense>,
            },
            // Module 4: Headless Demo
            {
                path: 'headless',
                element: <HeadlessDemo />,
            },
            // Module 5: Documentation & Comparison Pages
            {
                path: 'library',
                element: <LibraryPage />,
            },
            {
                path: 'headless-docs',
                element: <HeadlessDocsPage />,
            },
            {
                path: 'headless-vs-library',
                element: <HeadlessVsLibrary />,
            },
            // Module 6: Partner Admin Demo
            {
                path: 'partner-demo',
                element: <PartnerApprovalDemo />,
            },
        ],
    },
]);
