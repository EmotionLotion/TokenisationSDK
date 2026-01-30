import { useState, useEffect } from 'react';
import {
    Droplets, Waves, Leaf, BarChart3, Award, Zap,
    ArrowRight, CheckCircle2, AlertTriangle, Building2,
    Coins, TrendingDown, TrendingUp, Gauge, ThermometerSun,
    Eye, Shield, Globe, MapPin, Layers, Database, Lock
} from 'lucide-react';
import { useAhoyState, useSDK } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';

type TabType = 'overview' | 'meters' | 'tokenization' | 'marketplace';

interface IoTMeter {
    id: string;
    name: string;
    location: string;
    flowRate: number;
    pressure: number;
    temperature: number;
    status: 'normal' | 'anomaly' | 'leak';
    dailyUsage: number;
    savingsPercent: number;
}

interface WaterCredit {
    id: string;
    waterSaved: number;
    creditsEarned: number;
    period: string;
    verifiedBy: string;
    mintedAt: string;
    status: 'ACTIVE' | 'SOLD' | 'REDEEMED';
}

export function H2OTODemo() {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isProcessing, setIsProcessing] = useState(false);
    const [recentAction, setRecentAction] = useState<string | null>(null);
    const { ahoyState, simulateAhoyAction } = useAhoyState();
    const { assets: sdkAssets, createAsset } = useSDK();

    // Simulated IoT meters for multi-tenant building
    const [meters, setMeters] = useState<IoTMeter[]>([
        { id: 'M001', name: 'Main Supply', location: 'Building Entrance', flowRate: 12.4, pressure: 3.2, temperature: 24.5, status: 'normal', dailyUsage: 2450, savingsPercent: 12 },
        { id: 'M002', name: 'Floor 1-5', location: 'Residential Block A', flowRate: 8.7, pressure: 3.1, temperature: 24.8, status: 'normal', dailyUsage: 1820, savingsPercent: 18 },
        { id: 'M003', name: 'Floor 6-10', location: 'Residential Block B', flowRate: 15.2, pressure: 2.9, temperature: 25.1, status: 'anomaly', dailyUsage: 3200, savingsPercent: -5 },
        { id: 'M004', name: 'Parking/Common', location: 'Basement', flowRate: 2.1, pressure: 3.0, temperature: 23.2, status: 'normal', dailyUsage: 420, savingsPercent: 25 },
        { id: 'M005', name: 'Pool & Garden', location: 'Rooftop', flowRate: 0.0, pressure: 3.3, temperature: 26.0, status: 'leak', dailyUsage: 890, savingsPercent: -15 },
    ]);

    // Water credits earned (now linked to SDK assets)
    const [credits, setCredits] = useState<WaterCredit[]>([
        { id: 'WC001', waterSaved: 1500, creditsEarned: 75, period: 'December 2025', verifiedBy: 'DEWA Oracle', mintedAt: '2026-01-02', status: 'ACTIVE' },
        { id: 'WC002', waterSaved: 2200, creditsEarned: 110, period: 'November 2025', verifiedBy: 'DEWA Oracle', mintedAt: '2025-12-01', status: 'ACTIVE' },
    ]);

    // Simulate real-time updates
    useEffect(() => {
        const interval = setInterval(() => {
            setMeters(prev => prev.map(meter => ({
                ...meter,
                flowRate: meter.status === 'leak' ? 0 : Math.max(0, meter.flowRate + (Math.random() - 0.5) * 2),
                pressure: meter.pressure + (Math.random() - 0.5) * 0.1,
                temperature: meter.temperature + (Math.random() - 0.5) * 0.2,
            })));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    // Auto-hide toast
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    const showToast = (message: string) => setRecentAction(message);

    const totalWaterSaved = credits.reduce((sum, c) => sum + c.waterSaved, 0);
    const totalCreditsEarned = credits.reduce((sum, c) => sum + c.creditsEarned, 0);

    // EARN: Mint water credits from conservation
    const handleMintCredits = async () => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 1500));

        const newCredit: WaterCredit = {
            id: `WC${String(credits.length + 1).padStart(3, '0')}`,
            waterSaved: 1800,
            creditsEarned: 90,
            period: 'January 2026',
            verifiedBy: 'DEWA Oracle',
            mintedAt: new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
        };
        setCredits(prev => [newCredit, ...prev]);

        // Create SDK asset
        createAsset({
            type: 'WATER_CREDIT',
            name: `Water Credit - ${newCredit.period}`,
            metadata: { waterSaved: 1800, creditsEarned: 90 },
        });

        simulateAhoyAction('WATER_SAVINGS_BONUS', 'H2O');
        showToast('+75 AHOY - Water Credits Minted!');
        setIsProcessing(false);
    };

    // BURN: Pay bill with AHOY discount
    const handlePayBill = async () => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 1000));
        simulateAhoyAction('UTILITY_PAYMENT', 'H2O');
        showToast('-30 AHOY - Bill Paid with Discount!');
        setIsProcessing(false);
    };

    // EARN: Report leak
    const handleReportLeak = async (meterId: string) => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 800));
        simulateAhoyAction('DATA_CONTRIBUTION', 'H2O');
        showToast('+25 AHOY - Leak Reported!');
        setIsProcessing(false);
    };

    // BURN: Purchase premium analytics
    const handlePurchaseAnalytics = async () => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 1000));
        simulateAhoyAction('PREMIUM_ANALYTICS', 'H2O');
        showToast('-100 AHOY - Premium Analytics Unlocked!');
        setIsProcessing(false);
    };

    // EARN: Sell credits on marketplace
    const handleSellCredits = async (creditId: string) => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 1200));
        setCredits(prev => prev.map(c => c.id === creditId ? { ...c, status: 'SOLD' as const } : c));
        simulateAhoyAction('CREDIT_SOLD', 'H2O');
        showToast('+50 AHOY - Credits Sold!');
        setIsProcessing(false);
    };

    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'leak':
                return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', dot: 'bg-red-500' };
            case 'anomaly':
                return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', dot: 'bg-yellow-500' };
            default:
                return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', dot: 'bg-green-500' };
        }
    };

    // Get SDK water credit assets
    const sdkWaterCredits = sdkAssets.filter(a => a.name.includes('Water Credit'));

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                        <Droplets className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">H2OTO</h1>
                        <p className="text-sm text-cyan-400 font-medium">AI-Powered Water Technology</p>
                    </div>
                </div>

                <AhoyBalanceWidget vertical="H2O" compact />
            </div>

            {/* AHOY Token Economics Banner */}
            <div className="glass-card p-4 rounded-xl border border-cyan-500/20 bg-cyan-900/5 mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Conservation</p>
                            <p className="text-sm font-bold text-green-400">+75 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Leak Report</p>
                            <p className="text-sm font-bold text-green-400">+25 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <TrendingDown className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Bill Payment</p>
                            <p className="text-sm font-bold text-red-400">-30 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <BarChart3 className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Analytics</p>
                            <p className="text-sm font-bold text-red-400">-100 AHOY</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                {[
                    { id: 'overview', label: 'Water Management', icon: BarChart3 },
                    { id: 'meters', label: 'IoT Meters', icon: Gauge },
                    { id: 'tokenization', label: 'Tokenization', icon: Layers },
                    { id: 'marketplace', label: 'ESG Marketplace', icon: Globe },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            {/* Building Overview */}
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <Building2 className="w-5 h-5 text-cyan-400" />
                                        Marina Tower - Water Management
                                    </h3>
                                    <span className="text-xs text-gray-500">5 AI Virtual Meters</span>
                                </div>

                                <div className="grid grid-cols-4 gap-4 mb-6">
                                    {[
                                        { label: 'Daily Usage', value: '8,780L', icon: Waves, color: 'cyan' },
                                        { label: 'vs Last Month', value: '-12%', icon: TrendingDown, color: 'green' },
                                        { label: 'Active Alerts', value: '2', icon: AlertTriangle, color: 'yellow' },
                                        { label: 'Credits Earned', value: totalCreditsEarned.toString(), icon: Award, color: 'green' },
                                    ].map((stat, i) => (
                                        <div key={i} className="text-center p-3 bg-black/20 rounded-lg border border-white/5">
                                            <stat.icon className={`w-5 h-5 mx-auto mb-2 text-${stat.color}-400`} />
                                            <p className="text-lg font-bold text-white">{stat.value}</p>
                                            <p className="text-xs text-gray-500">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Quick meter status */}
                                <div className="space-y-2">
                                    {meters.slice(0, 3).map(meter => {
                                        const styles = getStatusStyles(meter.status);
                                        return (
                                            <div key={meter.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-2 h-2 rounded-full ${styles.dot} animate-pulse`} />
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{meter.name}</p>
                                                        <p className="text-xs text-gray-500">{meter.location}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <p className="text-sm font-mono text-white">{meter.flowRate.toFixed(1)} L/min</p>
                                                        <p className="text-xs text-gray-500">{meter.dailyUsage}L today</p>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${styles.bg} ${styles.text} border ${styles.border}`}>
                                                        {meter.status}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Bill Payment Card */}
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-bold text-white mb-1">January 2026 Bill</h3>
                                        <p className="text-sm text-gray-400">Due in 5 days • DEWA Account #12345</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-bold text-white">245.00 <span className="text-sm text-gray-400">AED</span></p>
                                        <p className="text-sm text-cyan-400">Save 10% with AHOY</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <AhoyActionButton
                                        label="Pay with AHOY"
                                        points={30}
                                        isEarn={false}
                                        onClick={handlePayBill}
                                        loading={isProcessing}
                                        icon={<Coins className="w-4 h-4" />}
                                        className="flex-1"
                                    />
                                    <button className="px-6 py-2 bg-white/5 border border-white/10 rounded-lg font-medium text-gray-400 hover:text-white transition-all">
                                        Pay AED
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="space-y-4">
                            <AhoyBalanceWidget vertical="H2O" />

                            <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-green-900/5">
                                <h3 className="font-bold text-green-400 mb-2">This Month's Savings</h3>
                                <p className="text-3xl font-bold text-white mb-1">1,800L</p>
                                <p className="text-sm text-gray-400 mb-3">12% below average</p>
                                <AhoyActionButton
                                    label="Mint Water Credits"
                                    points={75}
                                    isEarn={true}
                                    onClick={handleMintCredits}
                                    loading={isProcessing}
                                    icon={<Leaf className="w-4 h-4" />}
                                    className="w-full"
                                />
                            </div>
                        </div>
                    </>
                )}

                {/* IoT Meters Tab */}
                {activeTab === 'meters' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <Gauge className="w-5 h-5 text-cyan-400" />
                                        AI Virtual Flowmeters
                                    </h3>
                                    <span className="text-xs bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded border border-cyan-500/20">
                                        Live Data
                                    </span>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {meters.map(meter => {
                                        const styles = getStatusStyles(meter.status);
                                        return (
                                            <div key={meter.id} className="p-4 hover:bg-white/5 transition-colors">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${styles.bg} border ${styles.border}`}>
                                                            <Droplets className={`w-5 h-5 ${styles.text}`} />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-white">{meter.name}</p>
                                                            <p className="text-xs text-gray-500 flex items-center gap-1">
                                                                <MapPin className="w-3 h-3" />
                                                                {meter.location}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        {meter.status === 'leak' && (
                                                            <AhoyActionButton
                                                                label="Report"
                                                                points={25}
                                                                isEarn={true}
                                                                onClick={() => handleReportLeak(meter.id)}
                                                                loading={isProcessing}
                                                            />
                                                        )}
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${styles.bg} ${styles.text} border ${styles.border}`}>
                                                            {meter.status}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-4 gap-4">
                                                    <div className="text-center p-2 bg-black/20 rounded-lg">
                                                        <Waves className="w-4 h-4 mx-auto mb-1 text-cyan-400" />
                                                        <p className="text-sm font-mono text-white">{meter.flowRate.toFixed(1)}</p>
                                                        <p className="text-[10px] text-gray-500">L/min</p>
                                                    </div>
                                                    <div className="text-center p-2 bg-black/20 rounded-lg">
                                                        <Gauge className="w-4 h-4 mx-auto mb-1 text-blue-400" />
                                                        <p className="text-sm font-mono text-white">{meter.pressure.toFixed(1)}</p>
                                                        <p className="text-[10px] text-gray-500">bar</p>
                                                    </div>
                                                    <div className="text-center p-2 bg-black/20 rounded-lg">
                                                        <ThermometerSun className="w-4 h-4 mx-auto mb-1 text-orange-400" />
                                                        <p className="text-sm font-mono text-white">{meter.temperature.toFixed(1)}</p>
                                                        <p className="text-[10px] text-gray-500">°C</p>
                                                    </div>
                                                    <div className="text-center p-2 bg-black/20 rounded-lg">
                                                        <TrendingDown className={`w-4 h-4 mx-auto mb-1 ${meter.savingsPercent >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                                                        <p className={`text-sm font-mono ${meter.savingsPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                            {meter.savingsPercent >= 0 ? '-' : '+'}{Math.abs(meter.savingsPercent)}%
                                                        </p>
                                                        <p className="text-[10px] text-gray-500">vs avg</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Meter Info Panel */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">How It Works</h3>
                                <p className="text-sm text-gray-400 mb-3">
                                    AI virtual flowmeters use machine learning to analyze pipe acoustics and pressure patterns - no hardware installation required.
                                </p>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Cost vs Hardware</span>
                                        <span className="text-green-400 font-bold">90% cheaper</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Installation Time</span>
                                        <span className="text-cyan-400 font-mono">&lt; 1 hour</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Accuracy</span>
                                        <span className="text-white font-mono">±2%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card p-4 rounded-xl border border-red-500/20 bg-red-900/5">
                                <h3 className="font-bold text-red-400 mb-2 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    Active Alerts
                                </h3>
                                <div className="space-y-2">
                                    <div className="p-2 bg-black/20 rounded-lg border border-red-500/20">
                                        <p className="text-sm text-white">Pool & Garden - Leak Detected</p>
                                        <p className="text-xs text-gray-500">Estimated loss: 50L/hour</p>
                                    </div>
                                    <div className="p-2 bg-black/20 rounded-lg border border-yellow-500/20">
                                        <p className="text-sm text-white">Floor 6-10 - High Usage</p>
                                        <p className="text-xs text-gray-500">15% above baseline</p>
                                    </div>
                                </div>
                            </div>

                            <AhoyActionButton
                                label="Unlock Premium Analytics"
                                points={100}
                                isEarn={false}
                                onClick={handlePurchaseAnalytics}
                                loading={isProcessing}
                                icon={<BarChart3 className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </>
                )}

                {/* Tokenization Tab */}
                {activeTab === 'tokenization' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            {/* H2O Tokenization Model */}
                            <div className="glass-card p-6 rounded-xl border border-cyan-500/20">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-cyan-400" />
                                    H2O Tokenization Model
                                </h3>
                                <p className="text-sm text-gray-400 mb-6">
                                    H2OTO tokenizes water conservation achievements and utility data, creating tradeable ESG credits backed by verified IoT sensor readings.
                                </p>

                                {/* Token Types */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Leaf className="w-5 h-5 text-green-400" />
                                            <span className="font-bold text-green-400">Water Credit NFT</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">Tradeable ESG asset representing verified water savings</p>
                                        <div className="text-xs text-green-400">Earn +75 AHOY per mint</div>
                                    </div>
                                    <div className="p-4 bg-cyan-500/10 rounded-xl border border-cyan-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Database className="w-5 h-5 text-cyan-400" />
                                            <span className="font-bold text-cyan-400">IoT Data Token</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">On-chain usage data verified by DEWA oracle</p>
                                        <div className="text-xs text-cyan-400">Real-time verification</div>
                                    </div>
                                    <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lock className="w-5 h-5 text-purple-400" />
                                            <span className="font-bold text-purple-400">Conservation SBT</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">Non-transferable badge for sustained conservation</p>
                                        <div className="text-xs text-purple-400">Unlocks premium tiers</div>
                                    </div>
                                </div>

                                {/* Tokenization Flow */}
                                <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                                    <h4 className="font-medium text-white mb-3">Water Credit Tokenization Flow</h4>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                                                <Gauge className="w-5 h-5 text-cyan-400" />
                                            </div>
                                            <p className="text-gray-400">IoT Meter</p>
                                            <p className="text-gray-500">Reading</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                                <Shield className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <p className="text-gray-400">DEWA Oracle</p>
                                            <p className="text-gray-500">Verification</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-green-500/20 rounded-lg flex items-center justify-center">
                                                <Leaf className="w-5 h-5 text-green-400" />
                                            </div>
                                            <p className="text-gray-400">NFT Mint</p>
                                            <p className="text-green-400">+75 AHOY</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                                                <Globe className="w-5 h-5 text-yellow-400" />
                                            </div>
                                            <p className="text-gray-400">ESG Market</p>
                                            <p className="text-yellow-400">Tradeable</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Minted Credits */}
                            <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h3 className="font-bold text-white">Your Water Credit NFTs</h3>
                                    <span className="text-xs text-gray-500">{credits.length} minted</span>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {credits.map(credit => (
                                        <div key={credit.id} className="p-4 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                        credit.status === 'ACTIVE' ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/30'
                                                    }`}>
                                                        <Leaf className={`w-5 h-5 ${credit.status === 'ACTIVE' ? 'text-green-400' : 'text-gray-400'}`} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white">{credit.period}</p>
                                                        <p className="text-xs text-gray-500">{credit.waterSaved.toLocaleString()}L saved • {credit.verifiedBy}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <p className="font-bold text-green-400">{credit.creditsEarned} credits</p>
                                                        <p className="text-xs text-gray-500">{credit.mintedAt}</p>
                                                    </div>
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                        credit.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
                                                        credit.status === 'SOLD' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' :
                                                        'bg-gray-500/10 text-gray-400 border border-gray-500/30'
                                                    }`}>
                                                        {credit.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Tokenization Stats */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">AHOY Utility in H2O</h3>
                                <div className="space-y-3">
                                    <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                                        <p className="text-xs text-gray-400 mb-1">EARN Actions</p>
                                        <ul className="space-y-1 text-sm">
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Mint Credits</span>
                                                <span className="text-green-400">+75</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Report Leak</span>
                                                <span className="text-green-400">+25</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Sell Credits</span>
                                                <span className="text-green-400">+50</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                                        <p className="text-xs text-gray-400 mb-1">BURN Actions</p>
                                        <ul className="space-y-1 text-sm">
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Bill Payment</span>
                                                <span className="text-red-400">-30</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Premium Analytics</span>
                                                <span className="text-red-400">-100</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card p-4 rounded-xl border border-cyan-500/20 bg-cyan-900/5">
                                <h3 className="font-bold text-cyan-400 mb-2">Oracle Verification</h3>
                                <p className="text-sm text-gray-400 mb-3">
                                    All water savings are verified by DEWA utility oracle before NFT minting.
                                </p>
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                        IoT Sensor Verified
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                        DEWA Oracle Validated
                                    </div>
                                    <div className="flex items-center gap-2 text-gray-400">
                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                        Blockchain Recorded
                                    </div>
                                </div>
                            </div>

                            {/* SDK Assets */}
                            {sdkWaterCredits.length > 0 && (
                                <div className="glass-card p-4 rounded-xl border border-white/5">
                                    <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                        <Database className="w-4 h-4 text-cyan-400" />
                                        SDK Assets
                                    </h3>
                                    <div className="space-y-2">
                                        {sdkWaterCredits.slice(0, 3).map(asset => (
                                            <div key={asset.id} className="p-2 bg-black/20 rounded-lg border border-white/5">
                                                <p className="text-xs font-mono text-cyan-400 truncate">{asset.id}</p>
                                                <p className="text-xs text-gray-500">{(asset as any).rightType} • {asset.state}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Marketplace Tab */}
                {activeTab === 'marketplace' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-cyan-400" />
                                    ESG Credit Marketplace
                                </h3>
                                <p className="text-sm text-gray-400 mb-6">
                                    Trade verified water conservation credits with corporations seeking to offset their environmental impact.
                                </p>

                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { buyer: 'Emirates NBD', type: 'Corporate ESG', credits: 5000, price: '2,500 AHOY', status: 'Open' },
                                        { buyer: 'DEWA Green Fund', type: 'Government', credits: 10000, price: '4,500 AHOY', status: 'Open' },
                                        { buyer: 'Masdar City', type: 'Sustainability', credits: 2500, price: '1,250 AHOY', status: 'Filled' },
                                        { buyer: 'Dubai Holdings', type: 'Corporate ESG', credits: 7500, price: '3,750 AHOY', status: 'Open' },
                                    ].map((order, i) => (
                                        <div key={i} className={`p-4 rounded-xl border ${order.status === 'Open' ? 'border-white/10 bg-black/20' : 'border-gray-500/20 bg-gray-900/20'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <p className="font-bold text-white">{order.buyer}</p>
                                                <span className={`text-xs px-2 py-0.5 rounded ${order.status === 'Open' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                                                    {order.status}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2">{order.type}</p>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-gray-400">{order.credits.toLocaleString()} credits</span>
                                                <span className="text-cyan-400 font-mono">{order.price}</span>
                                            </div>
                                            {order.status === 'Open' && credits.some(c => c.status === 'ACTIVE') && (
                                                <button
                                                    onClick={() => handleSellCredits(credits.find(c => c.status === 'ACTIVE')?.id || '')}
                                                    disabled={isProcessing}
                                                    className="mt-3 w-full py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/20 transition-all disabled:opacity-50"
                                                >
                                                    Sell Credits (+50 AHOY)
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Market Stats */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">Market Stats</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Credit Price</span>
                                        <span className="font-mono text-cyan-400">0.5 AHOY</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">24h Volume</span>
                                        <span className="font-mono text-white">12,450</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Total Supply</span>
                                        <span className="font-mono text-white">1.2M</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Your Credits</span>
                                        <span className="font-mono text-green-400">{credits.filter(c => c.status === 'ACTIVE').reduce((sum, c) => sum + c.creditsEarned, 0)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card p-4 rounded-xl border border-yellow-500/20 bg-yellow-900/5">
                                <h3 className="font-bold text-yellow-400 mb-2">Your Portfolio Value</h3>
                                <p className="text-2xl font-bold text-white">
                                    {(credits.filter(c => c.status === 'ACTIVE').reduce((sum, c) => sum + c.creditsEarned, 0) * 0.5).toFixed(0)} AHOY
                                </p>
                                <p className="text-xs text-gray-500">Based on current market price</p>
                            </div>

                            <AhoyBalanceWidget vertical="H2O" />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
