import { createBrowserRouter, Navigate } from 'react-router-dom';
import { PlatformLayout } from './layouts/PlatformLayout';

// Ecosystem Hub (Main Dashboard)
import { EcosystemHub } from './pages/EcosystemHub';

// Platform Pages
import { Dashboard } from './components/Dashboard';
import { IdentitiesPage } from './components/IdentitiesPage';
import { PolicyStudio } from './components/PolicyStudio';
import { TransactionsPage } from './components/TransactionsPage';
import { OraclesPage } from './components/OraclesPage';
import { PayoutsPage } from './components/PayoutsPage';

// Ecosystem Product Services
import { CometApp } from './pages/apps/CometApp';
import { EquityApp } from './pages/apps/EquityApp';
import { H2OApp } from './pages/apps/H2OApp';
import { GTSApp } from './pages/apps/GTSApp';
import { AMSApp } from './pages/apps/AMSApp';
import { TrouveApp } from './pages/apps/TrouveApp';
import { IITSApp } from './pages/apps/IITSApp';
import { NexusApp } from './pages/apps/NexusApp';
import { ComputeApp } from './pages/apps/ComputeApp';

// Develop section pages
import { GettingStartedPage } from './pages/dev/GettingStartedPage';
import { ApiReferencePage } from './pages/dev/ApiReferencePage';
import { GuidesPage } from './pages/dev/GuidesPage';
import { ArchitecturePage } from './pages/dev/ArchitecturePage';
import { ChainlinkGuidePage } from './pages/dev/ChainlinkGuidePage';
import { DebuggerPage } from './pages/DebuggerPage';

// Integrate section pages
import { IntegrationOverviewPage } from './pages/integrate/IntegrationOverviewPage';
import { ApiKeysPage } from './pages/integrate/ApiKeysPage';
import { WebhooksPage } from './pages/integrate/WebhooksPage';
import { LogsPage } from './pages/integrate/LogsPage';
import { PartnerAdminPage } from './pages/integrate/PartnerAdminPage';

// Settings
import { SettingsPage } from './pages/SettingsPage';

// Lazy-loaded pages
import { lazy, Suspense } from 'react';
const PlaygroundPage = lazy(() => import('./pages/PlaygroundPage').then(m => ({ default: m.PlaygroundPage })));

const PlaygroundFallback = <div className="flex items-center justify-center h-full text-gray-500">Loading Playground...</div>;

export const router = createBrowserRouter([
    {
        path: '/',
        element: <PlatformLayout />,
        children: [
            // Main Dashboard - Ecosystem Hub
            {
                index: true,
                element: <EcosystemHub />,
            },

            // =============================================
            // PLATFORM (Core Features)
            // =============================================
            { path: 'assets', element: <Dashboard /> },
            { path: 'identities', element: <IdentitiesPage /> },
            { path: 'policies', element: <PolicyStudio /> },
            { path: 'transactions', element: <TransactionsPage /> },
            { path: 'oracles', element: <OraclesPage /> },
            { path: 'payouts', element: <PayoutsPage /> },

            // =============================================
            // ECOSYSTEM PRODUCT SERVICES
            // =============================================
            { path: 'app/comet', element: <CometApp /> },
            { path: 'app/equity', element: <EquityApp /> },
            { path: 'app/h2o', element: <H2OApp /> },
            { path: 'app/gts', element: <GTSApp /> },
            { path: 'app/ams', element: <AMSApp /> },
            { path: 'app/trouve', element: <TrouveApp /> },
            { path: 'app/iits', element: <IITSApp /> },
            { path: 'app/nexus', element: <NexusApp /> },
            { path: 'app/compute', element: <ComputeApp /> },

            // =============================================
            // DEVELOP section
            // =============================================
            { path: 'dev/getting-started', element: <GettingStartedPage /> },
            { path: 'dev/architecture', element: <ArchitecturePage /> },
            { path: 'dev/chainlink', element: <ChainlinkGuidePage /> },
            { path: 'dev/api', element: <ApiReferencePage /> },
            {
                path: 'dev/playground',
                element: <Suspense fallback={PlaygroundFallback}><PlaygroundPage /></Suspense>,
            },
            {
                path: 'dev/playground/:vertical',
                element: <Suspense fallback={PlaygroundFallback}><PlaygroundPage /></Suspense>,
            },
            { path: 'dev/debugger', element: <DebuggerPage /> },
            { path: 'dev/guides', element: <GuidesPage /> },

            // =============================================
            // INTEGRATE section
            // =============================================
            { path: 'integrate', element: <IntegrationOverviewPage /> },
            { path: 'integrate/keys', element: <ApiKeysPage /> },
            { path: 'integrate/webhooks', element: <WebhooksPage /> },
            { path: 'integrate/logs', element: <LogsPage /> },
            { path: 'integrate/partner', element: <PartnerAdminPage /> },

            // Settings
            { path: 'settings', element: <SettingsPage /> },

            // =============================================
            // REDIRECTS - Legacy vertical routes → reference apps
            // =============================================
            { path: 'app/real-estate', element: <Navigate to="/" replace /> },
            { path: 'app/flyplus', element: <Navigate to="/" replace /> },
            { path: 'app/hotel', element: <Navigate to="/" replace /> },
            { path: 'app/concert', element: <Navigate to="/" replace /> },
            { path: 'app/car-rental', element: <Navigate to="/" replace /> },
            { path: 'showcase', element: <Navigate to="/" replace /> },
            { path: 'showcase/:vertical', element: <Navigate to="/" replace /> },
            { path: 'real-estate', element: <Navigate to="/" replace /> },
            { path: 'airline', element: <Navigate to="/" replace /> },
            { path: 'hotel', element: <Navigate to="/" replace /> },
            { path: 'concert', element: <Navigate to="/" replace /> },
            { path: 'car-rental', element: <Navigate to="/" replace /> },
            { path: 'developers', element: <Navigate to="/integrate" replace /> },
            { path: 'playground', element: <Navigate to="/dev/playground" replace /> },
            { path: 'playground/:vertical', element: <Navigate to="/dev/playground" replace /> },
        ],
    },
]);
