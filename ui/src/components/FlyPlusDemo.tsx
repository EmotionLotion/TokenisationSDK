/**
 * FlyPlusDemo - Travel Services with Tokenization
 *
 * Demonstrates:
 * - Tokenized Service Credits - Prepaid services (luggage, check-in, etc.)
 * - AHOY Token earn/burn flows for travel services
 * - Real SDK asset creation with marketplace
 *
 * Note: Airline ticket functionality lives in /showcase/airline.
 * FLY+ will be redesigned around non-airline travel experiences.
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import {
    Plane, CheckCircle2,
    Coins, TrendingUp, TrendingDown, Sparkles, Ticket, Clock,
    Luggage, CreditCard, Package, Users, ShieldCheck
} from 'lucide-react';
import { useAhoyState, useSDK } from '../contexts/SDKContext';
import { AhoyBalanceWidget } from './AhoyBalanceWidget';
import { sdkStore, type FlyPlusServiceType, FLYPLUS_SERVICE_CATALOG } from '../store';

// Custom hook for FlyPlus store data
function useFlyPlusStore() {
    const subscribe = (callback: () => void) => sdkStore.subscribe(callback);
    const getSnapshot = () => sdkStore.getVersion();

    useSyncExternalStore(subscribe, getSnapshot);

    return {
        serviceCredits: sdkStore.getServiceCredits(),
        serviceCatalog: sdkStore.getServiceCatalog(),
        serviceRedemptions: sdkStore.getServiceRedemptions(),
        purchaseServiceCredits: sdkStore.purchaseServiceCredits.bind(sdkStore),
        redeemServiceCredits: sdkStore.redeemServiceCredits.bind(sdkStore),
    };
}

export function FlyPlusDemo() {
    const [activeTab, setActiveTab] = useState<'trips' | 'services' | 'tokenization' | 'wallet'>('services');
    const [creditsToBuy, setCreditsToBuy] = useState(100);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recentAction, setRecentAction] = useState<{ action: string; points: number } | null>(null);

    // Wire to real store data
    const {
        serviceCredits,
        serviceCatalog,
        purchaseServiceCredits,
        redeemServiceCredits,
    } = useFlyPlusStore();

    const { ahoyState } = useAhoyState();
    const { assets } = useSDK();

    // Get FLYPLUS-related assets from SDK
    const flyPlusAssets = assets.filter(a => a.metadata?.vertical === 'FLYPLUS');

    // Clear recent action after 3 seconds
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    // Handler: Purchase service credits
    const handlePurchaseCredits = () => {
        setIsProcessing(true);
        const result = purchaseServiceCredits(creditsToBuy);
        if (result.success) {
            setRecentAction({ action: `${creditsToBuy} Fly+ Credits Purchased`, points: -result.ahoyCost });
        } else {
            setRecentAction({ action: result.error || 'Purchase failed', points: 0 });
        }
        setIsProcessing(false);
    };

    // Handler: Redeem service
    const handleRedeemService = (serviceType: FlyPlusServiceType, bookingId?: string) => {
        const service = serviceCatalog.find(s => s.serviceType === serviceType);
        const result = redeemServiceCredits(serviceType, bookingId);
        if (result.success) {
            setRecentAction({ action: `${service?.name} Redeemed`, points: -result.creditsUsed });
        } else {
            setRecentAction({ action: result.error || 'Redemption failed', points: 0 });
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header with AHOY Balance */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20">
                        <Plane className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">FLY+</h1>
                        <p className="text-sm text-sky-400 font-medium">Sovereign Travel Identity</p>
                        <p className="text-xs text-gray-500 mt-0.5">Tokenized service credits & travel experiences</p>
                    </div>
                </div>

                {/* AHOY Balance Widget */}
                <div className="w-72">
                    <AhoyBalanceWidget vertical="FLYPLUS" />
                </div>
            </div>

            {/* Recent Action Toast */}
            {recentAction && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 duration-300 flex items-center gap-3 ${recentAction.points > 0
                    ? 'bg-green-500/90 text-white'
                    : 'bg-red-500/90 text-white'
                    }`}>
                    {recentAction.points > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    <div>
                        <p className="font-bold">{recentAction.action}</p>
                        <p className="text-sm opacity-90">{recentAction.points > 0 ? '+' : ''}{recentAction.points} AHOY</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab('trips')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'trips' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <Plane className="w-4 h-4" /> Experiences
                </button>
                <button
                    onClick={() => setActiveTab('services')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'services' ? 'bg-green-500 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <CreditCard className="w-4 h-4" /> Service Credits
                    {serviceCredits.balance > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-green-400/20 text-green-300 rounded-full">
                            {serviceCredits.balance}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('tokenization')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'tokenization' ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <Coins className="w-4 h-4" /> Tokenization
                </button>
                <button
                    onClick={() => setActiveTab('wallet')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab === 'wallet' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                >
                    <Ticket className="w-4 h-4" /> Benefits
                </button>
            </div>

            {/* Experiences Tab (formerly Trips) */}
            {activeTab === 'trips' && (
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-4">
                        <div className="glass-card p-8 rounded-2xl border border-white/10 text-center">
                            <Plane className="w-12 h-12 text-sky-400 mx-auto mb-4" />
                            <h2 className="text-xl font-bold text-white mb-2">Coming Soon</h2>
                            <p className="text-gray-400 max-w-md mx-auto">
                                FLY+ experiences will be redesigned. Airline ticketing is available
                                in the <span className="text-sky-400 font-medium">Airline Showcase</span>.
                            </p>
                            <p className="text-xs text-gray-500 mt-4">
                                Future: tokenized travel experiences, loyalty passes, and more.
                            </p>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* Service Credits Balance */}
                        <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-green-400" /> Fly+ Credits
                                </h3>
                                <span className="text-lg font-bold text-green-400">{serviceCredits.balance}</span>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Prepaid service tokens for luggage, check-in & more.
                            </p>
                            <button
                                onClick={() => setActiveTab('services')}
                                className="w-full py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 transition-all text-sm font-bold"
                            >
                                View Services
                            </button>
                        </div>

                        {/* AHOY Actions */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-amber-400" /> AHOY Actions
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Purchase Credits</span>
                                    <span className="text-green-400 font-bold">Earn AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Redeem Service</span>
                                    <span className="text-green-400 font-bold">Use Credits</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Referral</span>
                                    <span className="text-green-400 font-bold">+200 AHOY</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Services Tab - Tokenized Service Credits */}
            {activeTab === 'services' && (
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-6">
                        {/* Service Credits Balance */}
                        <div className="glass-card p-6 rounded-2xl border border-green-500/20 bg-gradient-to-r from-green-900/20 to-slate-900/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <CreditCard className="w-6 h-6 text-green-400" />
                                        Fly+ Service Credits
                                    </h2>
                                    <p className="text-sm text-gray-400 mt-1">
                                        Prepaid tokens for premium travel services
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-4xl font-bold text-green-400">{serviceCredits.balance}</p>
                                    <p className="text-xs text-gray-400">Credits Available</p>
                                </div>
                            </div>

                            {/* Purchase Credits */}
                            <div className="mt-6 p-4 bg-black/20 rounded-xl border border-white/5">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 mb-1 block">Purchase Credits (1 AHOY = 1 Credit)</label>
                                        <input
                                            type="number"
                                            value={creditsToBuy}
                                            onChange={(e) => setCreditsToBuy(Math.max(1, parseInt(e.target.value) || 0))}
                                            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-green-500"
                                            min="1"
                                        />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-gray-400">Cost</p>
                                        <p className="text-lg font-bold text-amber-400">{creditsToBuy} AHOY</p>
                                    </div>
                                    <button
                                        onClick={handlePurchaseCredits}
                                        disabled={isProcessing}
                                        className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-bold disabled:opacity-50"
                                    >
                                        Buy Credits
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Service Catalog */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-white">Available Services</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {serviceCatalog.map((service) => {
                                    const canAfford = serviceCredits.balance >= service.tokenCost;
                                    const icons: Record<FlyPlusServiceType, React.ReactNode> = {
                                        LUGGAGE_PICKUP: <Luggage className="w-6 h-6" />,
                                        HOME_CHECKIN: <CheckCircle2 className="w-6 h-6" />,
                                        PRIORITY_SERVICE: <Sparkles className="w-6 h-6" />,
                                        PREMIUM_TRACKING: <Package className="w-6 h-6" />,
                                        FAST_TRACK_SECURITY: <ShieldCheck className="w-6 h-6" />,
                                        MEET_GREET: <Users className="w-6 h-6" />,
                                    };
                                    return (
                                        <div
                                            key={service.id}
                                            className={`p-5 rounded-xl border transition-all ${canAfford
                                                ? 'bg-white/5 border-white/10 hover:border-green-500/30 hover:bg-green-500/5'
                                                : 'bg-white/2 border-white/5 opacity-60'
                                                }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                                                    {icons[service.serviceType]}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-green-400">{service.tokenCost}</p>
                                                    <p className="text-[10px] text-gray-500">credits</p>
                                                </div>
                                            </div>
                                            <h4 className="font-bold text-white">{service.name}</h4>
                                            <p className="text-xs text-gray-400 mt-1 mb-3">{service.description}</p>
                                            <button
                                                onClick={() => handleRedeemService(service.serviceType)}
                                                disabled={!canAfford}
                                                className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${canAfford
                                                    ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
                                                    : 'bg-gray-500/10 border border-gray-500/20 text-gray-500 cursor-not-allowed'
                                                    }`}
                                            >
                                                {canAfford ? 'Redeem' : 'Insufficient Credits'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* How It Works */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-amber-400" /> How It Works
                            </h3>
                            <div className="space-y-3 text-xs">
                                <div className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                                    <p className="text-gray-300">Convert AHOY tokens to Fly+ Service Credits (1:1 ratio)</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                                    <p className="text-gray-300">Use credits to prepay for premium services</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                                    <p className="text-gray-300">Redeem at any time for luggage, check-in, and more</p>
                                </div>
                            </div>
                        </div>

                        {/* Recent Redemptions */}
                        {serviceCredits.creditsUsed.length > 0 && (
                            <div className="glass-card p-4 rounded-xl border border-white/10">
                                <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-400" /> Recent Redemptions
                                </h3>
                                <div className="space-y-2">
                                    {serviceCredits.creditsUsed.slice(0, 5).map((redemption) => {
                                        const service = serviceCatalog.find(s => s.serviceType === redemption.serviceType);
                                        return (
                                            <div key={redemption.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                                <div>
                                                    <p className="text-white font-medium">{service?.name}</p>
                                                    <p className="text-gray-500">{new Date(redemption.redeemedAt).toLocaleDateString()}</p>
                                                </div>
                                                <span className="text-green-400 font-bold">-{redemption.creditsUsed}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Benefits */}
                        <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <h3 className="font-bold text-white mb-3">Why Service Credits?</h3>
                            <div className="space-y-2 text-xs text-gray-400">
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    No cross-border payment friction
                                </p>
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    Supports micropayments
                                </p>
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    Instant redemption, no wait times
                                </p>
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    Transferable between users
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tokenization Tab */}
            {activeTab === 'tokenization' && (
                <div className="space-y-6">
                    {/* Tokenization Placeholder */}
                    <div className="glass-card p-6 rounded-xl border border-amber-500/20">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Coins className="w-5 h-5 text-amber-400" />
                            FLY+ Tokenization Model
                        </h2>
                        <p className="text-gray-400 mb-6">
                            FLY+ uses tokenized service credits as a prepaid value system. Credits are
                            purchased with AHOY tokens and redeemed for premium travel services.
                        </p>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-amber-500/20 rounded-full flex items-center justify-center">
                                    <Coins className="w-6 h-6 text-amber-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Convert AHOY</p>
                                <p className="text-xs text-gray-400 mt-1">Exchange AHOY for Fly+ Credits</p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <CreditCard className="w-6 h-6 text-green-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Hold Credits</p>
                                <p className="text-xs text-gray-400 mt-1">Prepaid service tokens in your wallet</p>
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-sky-500/20 rounded-full flex items-center justify-center">
                                    <Sparkles className="w-6 h-6 text-sky-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Redeem Services</p>
                                <p className="text-xs text-gray-400 mt-1">Use credits for premium services</p>
                            </div>
                        </div>
                    </div>

                    {/* Token Types */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="glass-card p-5 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <CreditCard className="w-5 h-5 text-green-400" />
                                <h3 className="font-bold text-white">Service Credits</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Prepaid tokens for travel services. Exchanged 1:1 from AHOY tokens.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500">
                                <p>• 1:1 AHOY exchange rate</p>
                                <p>• Redeemable for services</p>
                                <p>• Transferable between users</p>
                                <p>• No expiry</p>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Coins className="w-5 h-5 text-amber-400" />
                                <h3 className="font-bold text-white">AHOY Integration</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Earn AHOY through travel activity, convert to service credits for premium experiences.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500">
                                <p>• Earn from ecosystem activity</p>
                                <p>• Convert to Fly+ Credits</p>
                                <p>• Tier-based multipliers</p>
                                <p>• Cross-vertical rewards</p>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-purple-500/20 bg-gradient-to-b from-purple-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-5 h-5 text-purple-400" />
                                <h3 className="font-bold text-white">Loyalty SBT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Soulbound token tracking travel history and tier benefits.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500">
                                <p>• Activity history</p>
                                <p>• Tier progression</p>
                                <p>• Non-transferable</p>
                                <p>• Lifetime benefits</p>
                            </div>
                        </div>
                    </div>

                    {/* SDK Assets */}
                    {flyPlusAssets.length > 0 && (
                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3">Created Assets ({flyPlusAssets.length})</h3>
                            <div className="space-y-2">
                                {flyPlusAssets.slice(0, 5).map(asset => (
                                    <div key={asset.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                        <div>
                                            <p className="text-white font-medium">{asset.name}</p>
                                            <p className="text-gray-500 font-mono">{asset.id.slice(0, 16)}...</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${String(asset.state) === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                                            }`}>
                                            {asset.state}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Benefits Tab */}
            {activeTab === 'wallet' && (
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-white">Your Benefits</h2>

                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <p className="font-bold text-white">{ahoyState.tier} Member</p>
                                    <p className="text-xs text-gray-400">{ahoyState.lifetimeEarned.toLocaleString()} lifetime AHOY</p>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                {ahoyState.tier !== 'BRONZE' && (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Priority Service Access</span>
                                    </div>
                                )}
                                {['GOLD', 'PLATINUM', 'DIAMOND'].includes(ahoyState.tier) && (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Premium Tier Rewards</span>
                                    </div>
                                )}
                                {['PLATINUM', 'DIAMOND'].includes(ahoyState.tier) && (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Exclusive Experiences</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-white">Grow Your Network</h2>

                        <div className="glass-card p-5 rounded-xl border border-green-500/20">
                            <h3 className="font-bold text-white mb-3">Refer a Friend</h3>
                            <p className="text-xs text-gray-400 mb-3">
                                Earn 200 AHOY when your friend joins the FLY+ ecosystem.
                            </p>
                            <button className="w-full py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 transition-all text-sm font-bold">
                                Share Referral Link +200 AHOY
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
