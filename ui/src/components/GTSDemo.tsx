import { useState, useEffect } from 'react';
import {
    MapPin, Navigation, Activity, BarChart3,
    Clock, Car, Bike, PersonStanding, Bus,
    AlertTriangle, TrendingUp, TrendingDown, Zap, Play,
    FileText, CreditCard, CheckCircle2, Coins, Layers,
    ArrowRight, Database, Shield, Globe
} from 'lucide-react';
import { useGTS } from '../hooks/useVerticals';
import { useAhoyState } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';

type TabType = 'traffic' | 'isochrone' | 'tokenization' | 'analytics';

export function GTSDemo() {
    const [activeTab, setActiveTab] = useState<TabType>('traffic');
    const [selectedMode, setSelectedMode] = useState<'DRIVING' | 'WALKING' | 'CYCLING' | 'TRANSIT'>('DRIVING');
    const [travelTime, setTravelTime] = useState(15);
    const [recentAction, setRecentAction] = useState<string | null>(null);
    const { simulateAhoyAction } = useAhoyState();

    const {
        isochroneResults,
        routeResults,
        trafficData,
        analyticsReports,
        licenses,
        apiCalls,
        isLoading,
        calculateIsochrone,
        calculateRoute,
        getLiveTraffic,
        generateAnalyticsReport,
        purchaseApiLicense,
    } = useGTS();

    // Auto-hide toast
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    const showToast = (message: string) => setRecentAction(message);

    const handleCalculateIsochrone = async () => {
        await calculateIsochrone({ lat: 25.2048, lng: 55.2708 }, travelTime, selectedMode);
        simulateAhoyAction('API_CALL', 'GTS');
        showToast('-2 AHOY - Isochrone Calculated');
    };

    const handleCalculateRoute = async () => {
        await calculateRoute(
            { lat: 25.2048, lng: 55.2708, name: 'Dubai Mall' },
            { lat: 25.0657, lng: 55.1713, name: 'Dubai Marina' },
            'TIME'
        );
        simulateAhoyAction('API_CALL', 'GTS');
        showToast('-2 AHOY - Route Optimized');
    };

    const handleRefreshTraffic = async () => {
        await getLiveTraffic();
        simulateAhoyAction('API_CALL', 'GTS');
        showToast('-2 AHOY - Traffic Data Refreshed');
    };

    const handleGenerateReport = async () => {
        await generateAnalyticsReport('Dubai Metro Area', 'WEEKLY');
        simulateAhoyAction('ANALYTICS_REPORT_GENERATED', 'GTS');
        showToast('+25 AHOY - Report NFT Minted!');
    };

    const handlePurchaseLicense = async () => {
        await purchaseApiLicense('ROUTING', 'PRO');
        simulateAhoyAction('API_LICENSE_PURCHASED', 'GTS');
        showToast('-500 AHOY - PRO License Purchased');
    };

    const modeIcons = {
        DRIVING: Car,
        WALKING: PersonStanding,
        CYCLING: Bike,
        TRANSIT: Bus,
    };

    const congestionColors = {
        FREE_FLOW: 'text-green-400 bg-green-500/10 border-green-500/30',
        LIGHT: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        MODERATE: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
        HEAVY: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
        SEVERE: 'text-red-400 bg-red-500/10 border-red-500/30',
    };

    return (
        <div className="max-w-5xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toast notification */}
            {recentAction && (
                <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
                    <div className={`px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg ${
                        recentAction.startsWith('+')
                            ? 'bg-green-500/20 border-green-500/30 text-green-400'
                            : 'bg-red-500/20 border-red-500/30 text-red-400'
                    }`}>
                        <div className="flex items-center gap-2">
                            <Coins className="w-4 h-4" />
                            <span className="font-medium">{recentAction}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <MapPin className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">GTS</h1>
                        <p className="text-sm text-emerald-400 font-medium">Geospatial Tracking System</p>
                    </div>
                </div>

                <AhoyBalanceWidget vertical="GTS" compact />
            </div>

            {/* AHOY Token Economics Banner */}
            <div className="glass-card p-4 rounded-xl border border-emerald-500/20 bg-emerald-900/5 mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <TrendingDown className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">API Call</p>
                            <p className="text-sm font-bold text-red-400">-2 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Report NFT</p>
                            <p className="text-sm font-bold text-green-400">+25 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <CreditCard className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">PRO License</p>
                            <p className="text-sm font-bold text-red-400">-500 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Globe className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Data Contribution</p>
                            <p className="text-sm font-bold text-green-400">+5 AHOY</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                {[
                    { id: 'traffic', label: 'Live Traffic', icon: Activity },
                    { id: 'isochrone', label: 'Isochrone', icon: Clock },
                    { id: 'tokenization', label: 'Tokenization', icon: Layers },
                    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Live Traffic Tab */}
            {activeTab === 'traffic' && (
                <div className="space-y-6">
                    {/* Traffic Map Placeholder */}
                    <div className="glass-card h-64 rounded-2xl border border-white/5 relative overflow-hidden flex items-center justify-center bg-black/20">
                        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-900 via-transparent to-transparent"></div>
                        <Navigation className="w-16 h-16 text-gray-700" />
                        <p className="text-gray-500 absolute bottom-4">Live Traffic Visualization</p>

                        {/* Overlay Stats */}
                        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md p-3 rounded-lg border border-white/10">
                            <p className="text-xs text-gray-400">Segments</p>
                            <p className="font-mono font-bold text-white">{trafficData.length}</p>
                        </div>
                        <div className="absolute top-4 right-4">
                            <AhoyActionButton
                                label="Refresh"
                                points={2}
                                isEarn={false}
                                onClick={handleRefreshTraffic}
                                loading={isLoading}
                                icon={<Activity className="w-4 h-4" />}
                            />
                        </div>
                    </div>

                    {/* Traffic Segments */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {trafficData.map((seg) => (
                            <div key={seg.id} className="glass-card p-5 rounded-xl border border-white/5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="font-bold text-white">{seg.segment}</h3>
                                        <p className="text-xs text-gray-500">Updated {new Date(seg.updatedAt).toLocaleTimeString()}</p>
                                    </div>
                                    <span className={`text-xs font-bold px-2 py-1 rounded border ${congestionColors[seg.congestionLevel]}`}>
                                        {seg.congestionLevel.replace('_', ' ')}
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-3 mt-4">
                                    <div className="bg-black/20 p-2 rounded-lg text-center">
                                        <p className="text-xs text-gray-500">Speed</p>
                                        <p className="font-mono text-white">{Math.round(seg.averageSpeed)} km/h</p>
                                    </div>
                                    <div className="bg-black/20 p-2 rounded-lg text-center">
                                        <p className="text-xs text-gray-500">Delay</p>
                                        <p className="font-mono text-orange-400">+{Math.round(seg.delay)} min</p>
                                    </div>
                                    <div className="bg-black/20 p-2 rounded-lg text-center">
                                        <p className="text-xs text-gray-500">Incidents</p>
                                        <p className={`font-mono ${seg.incidents > 0 ? 'text-red-400' : 'text-green-400'}`}>{seg.incidents}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <AhoyBalanceWidget vertical="GTS" />
                </div>
            )}

            {/* Isochrone Tab */}
            {activeTab === 'isochrone' && (
                <div className="space-y-6">
                    {/* Controls */}
                    <div className="glass-card p-6 rounded-2xl border border-emerald-500/20 bg-emerald-900/5">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Clock className="w-5 h-5 text-emerald-400" />
                            Isochrone Calculator
                        </h3>
                        <p className="text-sm text-gray-400 mb-6">
                            Calculate reachable areas within a given travel time from any location.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {/* Travel Mode */}
                            <div>
                                <label className="text-xs text-gray-500 block mb-2">Travel Mode</label>
                                <div className="flex gap-2">
                                    {(['DRIVING', 'WALKING', 'CYCLING', 'TRANSIT'] as const).map((mode) => {
                                        const Icon = modeIcons[mode];
                                        return (
                                            <button
                                                key={mode}
                                                onClick={() => setSelectedMode(mode)}
                                                className={`p-3 rounded-lg border transition-all ${selectedMode === mode ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                            >
                                                <Icon className="w-5 h-5" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Travel Time */}
                            <div>
                                <label className="text-xs text-gray-500 block mb-2">Travel Time: {travelTime} min</label>
                                <input
                                    type="range"
                                    min="5"
                                    max="60"
                                    value={travelTime}
                                    onChange={(e) => setTravelTime(parseInt(e.target.value))}
                                    className="w-full accent-emerald-500"
                                />
                            </div>

                            {/* Calculate Button */}
                            <div className="flex items-end">
                                <AhoyActionButton
                                    label="Calculate"
                                    points={2}
                                    isEarn={false}
                                    onClick={handleCalculateIsochrone}
                                    loading={isLoading}
                                    icon={<Play className="w-4 h-4" />}
                                    className="w-full"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Route Calculation */}
                    <div className="glass-card p-6 rounded-2xl border border-blue-500/20 bg-blue-900/5">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Navigation className="w-5 h-5 text-blue-400" />
                            Route Optimization
                        </h3>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="text-xs text-gray-500 mb-1">Origin</p>
                                <p className="font-medium text-white">Dubai Mall</p>
                            </div>
                            <div className="bg-black/20 p-4 rounded-lg border border-white/5">
                                <p className="text-xs text-gray-500 mb-1">Destination</p>
                                <p className="font-medium text-white">Dubai Marina</p>
                            </div>
                        </div>
                        <AhoyActionButton
                            label="Calculate Route"
                            points={2}
                            isEarn={false}
                            onClick={handleCalculateRoute}
                            loading={isLoading}
                            icon={<Navigation className="w-4 h-4" />}
                            className="w-full"
                        />
                    </div>

                    {/* Results */}
                    {(isochroneResults.length > 0 || routeResults.length > 0) && (
                        <div className="glass-card p-6 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-4">Recent Calculations</h3>
                            <div className="space-y-3">
                                {isochroneResults.slice(0, 3).map((result) => (
                                    <div key={result.id} className="flex items-center justify-between bg-black/20 p-4 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-4">
                                            {(() => {
                                                const Icon = modeIcons[result.mode];
                                                return <Icon className="w-5 h-5 text-emerald-400" />;
                                            })()}
                                            <div>
                                                <p className="text-sm text-white">{result.travelTime} min {result.mode.toLowerCase()}</p>
                                                <p className="text-xs text-gray-500">Isochrone calculation</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-mono text-emerald-400">{result.area.toFixed(1)} km²</p>
                                            <p className="text-xs text-red-400">-2 AHOY</p>
                                        </div>
                                    </div>
                                ))}
                                {routeResults.slice(0, 2).map((route) => (
                                    <div key={route.id} className="flex items-center justify-between bg-black/20 p-4 rounded-lg border border-white/5">
                                        <div className="flex items-center gap-4">
                                            <Navigation className="w-5 h-5 text-blue-400" />
                                            <div>
                                                <p className="text-sm text-white">{route.origin.name || 'Origin'} → {route.destination.name || 'Dest'}</p>
                                                <p className="text-xs text-gray-500">{route.distance} km • {route.duration} min</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-mono text-blue-400">+{route.trafficDelay} delay</p>
                                            <p className="text-xs text-red-400">-2 AHOY</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tokenization Tab */}
            {activeTab === 'tokenization' && (
                <div className="space-y-6">
                    {/* GTS Tokenization Model */}
                    <div className="glass-card p-6 rounded-xl border border-emerald-500/20">
                        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-emerald-400" />
                            GTS Tokenization Model
                        </h3>
                        <p className="text-sm text-gray-400 mb-6">
                            GTS tokenizes geospatial data access, analytics reports, and API licenses as on-chain assets with transparent pricing in AHOY.
                        </p>

                        {/* Token Types */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText className="w-5 h-5 text-purple-400" />
                                    <span className="font-bold text-purple-400">Analytics NFT</span>
                                </div>
                                <p className="text-xs text-gray-400 mb-2">Verified traffic reports minted as tradeable NFTs</p>
                                <div className="text-xs text-green-400">Earn +25 AHOY per report</div>
                            </div>
                            <div className="p-4 bg-yellow-500/10 rounded-xl border border-yellow-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <CreditCard className="w-5 h-5 text-yellow-400" />
                                    <span className="font-bold text-yellow-400">API License Token</span>
                                </div>
                                <p className="text-xs text-gray-400 mb-2">Tiered API access with rate limits</p>
                                <div className="text-xs text-yellow-400">Unlock premium features</div>
                            </div>
                            <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                                <div className="flex items-center gap-2 mb-2">
                                    <Globe className="w-5 h-5 text-emerald-400" />
                                    <span className="font-bold text-emerald-400">Data Contribution</span>
                                </div>
                                <p className="text-xs text-gray-400 mb-2">Earn by sharing location data</p>
                                <div className="text-xs text-green-400">Earn +5 AHOY per contribution</div>
                            </div>
                        </div>

                        {/* Tokenization Flow */}
                        <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                            <h4 className="font-medium text-white mb-3">Analytics Report Tokenization Flow</h4>
                            <div className="flex items-center justify-between text-xs">
                                <div className="text-center">
                                    <div className="w-10 h-10 mx-auto mb-1 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                                        <Activity className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <p className="text-gray-400">Traffic Data</p>
                                    <p className="text-gray-500">Collection</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-600" />
                                <div className="text-center">
                                    <div className="w-10 h-10 mx-auto mb-1 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                        <BarChart3 className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <p className="text-gray-400">AI Analysis</p>
                                    <p className="text-gray-500">Processing</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-600" />
                                <div className="text-center">
                                    <div className="w-10 h-10 mx-auto mb-1 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                        <FileText className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <p className="text-gray-400">NFT Mint</p>
                                    <p className="text-green-400">+25 AHOY</p>
                                </div>
                                <ArrowRight className="w-4 h-4 text-gray-600" />
                                <div className="text-center">
                                    <div className="w-10 h-10 mx-auto mb-1 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                                        <Shield className="w-5 h-5 text-yellow-400" />
                                    </div>
                                    <p className="text-gray-400">Verified</p>
                                    <p className="text-yellow-400">On-Chain</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AHOY Utility */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="glass-card p-4 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-3">AHOY Utility in GTS</h3>
                            <div className="space-y-3">
                                <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                                    <p className="text-xs text-gray-400 mb-1">EARN Actions</p>
                                    <ul className="space-y-1 text-sm">
                                        <li className="flex justify-between">
                                            <span className="text-gray-300">Generate Report</span>
                                            <span className="text-green-400">+25</span>
                                        </li>
                                        <li className="flex justify-between">
                                            <span className="text-gray-300">Data Contribution</span>
                                            <span className="text-green-400">+5</span>
                                        </li>
                                    </ul>
                                </div>
                                <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                                    <p className="text-xs text-gray-400 mb-1">BURN Actions</p>
                                    <ul className="space-y-1 text-sm">
                                        <li className="flex justify-between">
                                            <span className="text-gray-300">API Call</span>
                                            <span className="text-red-400">-2</span>
                                        </li>
                                        <li className="flex justify-between">
                                            <span className="text-gray-300">PRO License</span>
                                            <span className="text-red-400">-500</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <AhoyBalanceWidget vertical="GTS" />
                    </div>
                </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Generate Report */}
                        <div className="glass-card p-6 rounded-2xl border border-purple-500/20 bg-purple-900/5">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-purple-400" />
                                Traffic Analytics
                            </h3>
                            <p className="text-sm text-gray-400 mb-6">
                                Generate comprehensive traffic reports. Reports are minted as verified NFTs on-chain.
                            </p>

                            <AhoyActionButton
                                label="Generate Weekly Report"
                                points={25}
                                isEarn={true}
                                onClick={handleGenerateReport}
                                loading={isLoading}
                                icon={<FileText className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>

                        {/* API Licenses */}
                        <div className="glass-card p-6 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-yellow-400" />
                                API Licenses
                            </h3>

                            {licenses.length > 0 ? (
                                <div className="space-y-3 mb-4">
                                    {licenses.map((lic) => (
                                        <div key={lic.id} className="flex items-center justify-between bg-black/20 p-3 rounded-lg">
                                            <div>
                                                <p className="text-sm text-white">{lic.dataType} - {lic.tier}</p>
                                                <p className="text-xs text-gray-500">{lic.usedCalls}/{lic.callsPerMonth} calls</p>
                                            </div>
                                            <CheckCircle2 className="w-5 h-5 text-green-400" />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 mb-4">No active licenses</p>
                            )}

                            <AhoyActionButton
                                label="Purchase PRO License"
                                points={500}
                                isEarn={false}
                                onClick={handlePurchaseLicense}
                                loading={isLoading}
                                icon={<CreditCard className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Analytics Reports */}
                    {analyticsReports.length > 0 && (
                        <div className="glass-card p-6 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-4">Generated Reports (NFT-Verified)</h3>
                            <div className="space-y-3">
                                {analyticsReports.map((report) => (
                                    <div key={report.id} className="bg-black/20 p-4 rounded-lg border border-purple-500/20">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-sm font-bold text-white">{report.region}</p>
                                                <p className="text-xs text-gray-500">{report.period} Report</p>
                                            </div>
                                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" />
                                                On-Chain (+25 AHOY)
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-4 gap-3">
                                            <div className="text-center">
                                                <p className="text-xs text-gray-500">Congestion</p>
                                                <p className="font-mono text-white">{report.avgCongestion}%</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-gray-500">Incidents</p>
                                                <p className="font-mono text-orange-400">{report.totalIncidents}</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-gray-500">Avg Travel</p>
                                                <p className="font-mono text-white">{report.avgTravelTime} min</p>
                                            </div>
                                            <div className="text-center">
                                                <p className="text-xs text-gray-500">Data Points</p>
                                                <p className="font-mono text-purple-400">{report.dataPoints.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
