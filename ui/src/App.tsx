import { useState } from 'react';
import { SDKLayout } from './components/SDKLayout';
import { SDKUseCasesHome } from './components/SDKUseCasesHome';
import { ShowcaseRunner } from './components/ShowcaseRunner';
import { realEstateShowcase } from './components/showcases/real-estate';
import { airlineShowcase } from './components/showcases/airline';
import { carRentalShowcase } from './components/showcases/car-rental';
import { hotelShowcase } from './components/showcases/hotel';
import { concertShowcase } from './components/showcases/concert';
import type { ShowcaseConfig } from './components/showcases/types';

// SDK Use Case tabs
type SDKTab = 'home' | 'real-estate' | 'airline' | 'car-rental' | 'hotel' | 'concert';

const showcaseMap: Record<string, ShowcaseConfig> = {
  'real-estate': realEstateShowcase,
  'airline': airlineShowcase,
  'car-rental': carRentalShowcase,
  'hotel': hotelShowcase,
  'concert': concertShowcase,
};

function App() {
  const [activeTab, setActiveTab] = useState<SDKTab>('home');

  const renderContent = () => {
    if (activeTab === 'home') {
      return <SDKUseCasesHome onSelectUseCase={(id) => setActiveTab(id as SDKTab)} />;
    }

    const showcase = showcaseMap[activeTab];
    if (showcase) {
      return <ShowcaseRunner showcase={showcase} onBack={() => setActiveTab('home')} />;
    }

    return <SDKUseCasesHome onSelectUseCase={(id) => setActiveTab(id as SDKTab)} />;
  };

  return (
    <SDKLayout activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as SDKTab)}>
      {renderContent()}
    </SDKLayout>
  );
}

export default App;
