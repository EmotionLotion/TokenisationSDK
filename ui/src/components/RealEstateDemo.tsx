import { useState } from 'react';
import { PropertyMap, NavHistoryChart } from '@tokenisation/sdk/components';
import { Building, Coins, TrendingUp } from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';

export function RealEstateDemo() {
    const { simulateAhoyAction } = useAhoyState();
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

    const properties = [
        {
            id: 'prop-1',
            name: 'Burj Khalifa Penthouse',
            value: 15_000_000,
            location: { lat: 25.1972, lng: 55.2744 },
            type: 'RESIDENTIAL' as const,
            navHistory: [
                { date: '2023-01', nav: 100 },
                { date: '2023-02', nav: 102 },
                { date: '2023-03', nav: 105 },
                { date: '2023-04', nav: 104 },
                { date: '2023-05', nav: 108 },
                { date: '2023-06', nav: 115 },
            ]
        },
        {
            id: 'prop-2',
            name: 'Dubai Mall Retail Unit',
            value: 5_500_000,
            location: { lat: 25.1988, lng: 55.2796 },
            type: 'COMMERCIAL' as const,
            navHistory: [
                { date: '2023-01', nav: 100 },
                { date: '2023-02', nav: 101 },
                { date: '2023-03', nav: 101 },
                { date: '2023-04', nav: 102 },
                { date: '2023-05', nav: 102 },
                { date: '2023-06', nav: 103 },
            ]
        },
        {
            id: 'prop-3',
            name: 'Palm Jumeirah Villa',
            value: 8_200_000,
            location: { lat: 25.1124, lng: 55.1390 },
            type: 'RESIDENTIAL' as const,
            navHistory: [
                { date: '2023-01', nav: 100 },
                { date: '2023-02', nav: 105 },
                { date: '2023-03', nav: 110 },
                { date: '2023-04', nav: 112 },
                { date: '2023-05', nav: 120 },
                { date: '2023-06', nav: 125 },
            ]
        }
    ];

    const selectedProp = properties.find(p => p.id === selectedPropertyId);

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <Building className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">EstateToken</h1>
                        <p className="text-sm text-amber-400 font-medium">Real Estate Tokenisation Platform</p>
                    </div>
                </div>

                <div className="glass-card px-4 py-2 rounded-xl border border-white/5 flex items-center gap-3">
                    <Coins className="w-5 h-5 text-yellow-400" />
                    <span className="text-white font-bold">Total TVL: $28.7M</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Property List */}
                <div className="space-y-4">
                    <h2 className="text-lg font-bold text-white mb-4">Available Assets</h2>
                    {properties.map(p => (
                        <div
                            key={p.id}
                            onClick={() => setSelectedPropertyId(p.id)}
                            className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedPropertyId === p.id
                                    ? 'bg-amber-500/20 border-amber-500 text-white'
                                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                                }`}
                        >
                            <div className="flex justify-between font-bold">
                                <span>{p.name}</span>
                                <span className={selectedPropertyId === p.id ? 'text-amber-400' : ''}>
                                    ${(p.value / 1_000_000).toFixed(1)}M
                                </span>
                            </div>
                            <div className="text-xs opacity-70 mt-1">{p.type}</div>
                        </div>
                    ))}
                </div>

                {/* Details Section */}
                <div className="lg:col-span-2 space-y-6">
                    {selectedProp ? (
                        <div className="glass-card p-6 rounded-2xl border border-amber-500/30 bg-amber-900/5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white mb-2">{selectedProp.name}</h2>
                                    <p className="text-sm text-gray-400 mb-6">{selectedProp.type} • Dubai, UAE</p>

                                    <div className="mb-6 h-[200px]">
                                        <PropertyMap
                                            address={`${selectedProp.name}, Dubai`}
                                            latitude={selectedProp.location.lat}
                                            longitude={selectedProp.location.lng}
                                            height="100%"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-6">
                                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-2">
                                            <TrendingUp className="w-3 h-3 text-green-400" />
                                            NAV History
                                        </p>
                                        <NavHistoryChart
                                            data={selectedProp.navHistory.map(h => ({
                                                date: h.date,
                                                value: h.nav
                                            }))}
                                        />
                                    </div>

                                    <button
                                        onClick={() => simulateAhoyAction('TOKEN_MINTED', 'AMS')}
                                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20"
                                    >
                                        Invest in {selectedProp.name}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="glass-card p-8 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center h-64">
                            <Building className="w-12 h-12 text-gray-600 mb-4" />
                            <p className="text-gray-400">Select a property to view details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
