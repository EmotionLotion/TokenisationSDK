import { useState } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { AssetDetail } from './components/AssetDetail';
import { PartyManager } from './components/PartyManager';
import { DemoWizard } from './components/DemoWizard';
import { InstitutionalDemo } from './components/InstitutionalDemo';
import { AhoyDashboard } from './components/AhoyDashboard';
import { PolicyStudio } from './components/PolicyStudio';
import { IdentitiesPage } from './components/IdentitiesPage';
import { TransactionsPage } from './components/TransactionsPage';
import { OraclesPage } from './components/OraclesPage';
import { PayoutsPage } from './components/PayoutsPage';
import { DevelopersPage } from './components/DevelopersPage';
import { UIKitDemo } from './pages/UIKitDemo';
import { sdkStore } from './store';
import type { Asset } from './types';

// Tab type definition - matches Layout.tsx navigation
type Tab = 'dashboard' | 'ahoy' | 'parties' | 'demo' | 'institutional' | 'policies' | 'settings' | 'identities' | 'transactions' | 'oracles' | 'payouts' | 'developers' | 'uikit';

function App() {
  const [activeTab, setActiveTab] = useState<string>('ahoy');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Determine what to render based on activeTab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        if (selectedAsset) {
          return (
            <AssetDetail
              asset={selectedAsset}
              onBack={() => setSelectedAsset(null)}
            />
          );
        }
        return <Dashboard onSelectAsset={setSelectedAsset} />;

      case 'ahoy':
        return <AhoyDashboard />;

      case 'parties':
        return <PartyManager />;

      case 'policies':
        return <PolicyStudio />;

      case 'identities':
        return <IdentitiesPage />;

      case 'transactions':
        return <TransactionsPage />;

      case 'oracles':
        return <OraclesPage />;

      case 'payouts':
        return <PayoutsPage />;

      case 'developers':
        return <DevelopersPage />;

      case 'uikit':
        return <UIKitDemo />;

      case 'demo':
        return <DemoWizard />;

      case 'institutional':
        return <InstitutionalDemo />;

      case 'settings':
        return (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Settings coming soon...</p>
          </div>
        );

      default:
        return <Dashboard onSelectAsset={setSelectedAsset} />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

export default App;
