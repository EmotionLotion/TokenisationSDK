/**
 * CometDemo - Logistics & Fleet Management with Tokenization
 *
 * Demonstrates:
 * - Driver Reputation SBTs (Soulbound Tokens) - non-transferable achievement tokens
 * - Carbon Credit NFTs - tradeable environmental credits
 * - AHOY Token earn/burn flows for logistics operations
 * - Real SDK asset creation with lifecycle states
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import {
    Truck, Package, Leaf, ShieldCheck, MapPin,
    Zap, CheckCircle2, Award, TrendingUp, TrendingDown,
    Coins, FileCheck, Clock, AlertTriangle, Sparkles, Plus, Play, UserCheck
} from 'lucide-react';
import { useDriverReputation, getDriverLeaderboard, type DriverReputation } from '../hooks/useVerticals';
import { useAhoyState, useSDK } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';
import { sdkStore, type CometDelivery, type CometDriver } from '../store';
import { CometLivePanel } from './CometLivePanel';
import { TokenizationFlowPanel } from './TokenizationFlowPanel';

export function CometDemo() {
    const [activeTab, setActiveTab] = useState<'flow' | 'fleet' | 'tokenization' | 'drivers'>('flow');
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
    const [recentAction, setRecentAction] = useState<{ action: string; points: number } | null>(null);
    const [leaderboard, setLeaderboard] = useState<DriverReputation[]>([]);

    // Subscribe to store changes for real-time updates
    const storeVersion = useSyncExternalStore(
        (callback) => sdkStore.subscribe(callback),
        () => sdkStore.getVersion()
    );

    // Get real deliveries and drivers from store
    const deliveries = sdkStore.getDeliveries();
    const drivers = sdkStore.getDrivers();
    const driverLeaderboard = sdkStore.getDriverLeaderboard();

    // Wire to real SDK via hooks
    const {
        reputation,
        events,
        isLoading,
        mintReputationSBT,
        recordEvent
    } = useDriverReputation('DRV-001');

    const { ahoyState, simulateAhoyAction } = useAhoyState();
    const { assets } = useSDK();

    // Get COMET-related assets from SDK
    const cometAssets = assets.filter(a => a.metadata?.vertical === 'COMET');

    // Load leaderboard from localStorage
    useEffect(() => {
        const loadLeaderboard = () => {
            const drivers = getDriverLeaderboard();
            setLeaderboard(drivers.slice(0, 10)); // Top 10
        };
        loadLeaderboard();
    }, [reputation, storeVersion]); // Refresh when reputation or store changes

    // Clear recent action after 3 seconds
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    // Create a new random delivery
    const handleCreateDelivery = () => {
        sdkStore.generateRandomDelivery();
        setRecentAction({ action: 'New Delivery Created', points: 0 });
    };

    // Assign delivery to available driver
    const handleAssignDelivery = (deliveryId: string) => {
        const availableDriver = drivers.find(d => d.status === 'AVAILABLE');
        if (availableDriver) {
            const result = sdkStore.assignDelivery(deliveryId, availableDriver.id);
            if (result.success) {
                setRecentAction({ action: `Assigned to ${availableDriver.name}`, points: 0 });
            }
        }
    };

    // Start delivery (pickup complete)
    const handleStartDelivery = (deliveryId: string) => {
        const result = sdkStore.startDelivery(deliveryId);
        if (result.success) {
            setRecentAction({ action: 'Delivery Started', points: 0 });
        }
    };

    // Handle delivery completion with tokenization
    const handleDeliveryComplete = async (delivery: CometDelivery) => {
        setIsProcessing(true);
        setSelectedDriver(delivery.driverName);

        const result = sdkStore.completeDelivery(delivery.id, true);
        if (result.success) {
            setRecentAction({ action: 'Delivery Completed', points: result.ahoyEarned || 0 });

            // Record event for driver reputation
            recordEvent('PERFECT_DELIVERY', {
                deliveryId: delivery.id,
                driverName: delivery.driverName,
                timestamp: new Date().toISOString()
            });
        }

        await new Promise(r => setTimeout(r, 500));
        setIsProcessing(false);
        setSelectedDriver(null);
    };

    // Handle priority dispatch
    const handlePriorityDispatch = async (delivery: CometDelivery) => {
        setIsProcessing(true);
        const result = sdkStore.priorityDispatch(delivery.id);
        if (result.success) {
            setRecentAction({ action: 'Priority Dispatch', points: -(result.ahoyCost || 0) });
        } else {
            setRecentAction({ action: result.error || 'Failed', points: 0 });
        }
        setIsProcessing(false);
    };

    // Handle SBT minting
    const handleMintSBT = async () => {
        setIsProcessing(true);
        const result = await mintReputationSBT();
        if (result.success) {
            simulateAhoyAction('REPUTATION_SBT_MINTED', 'COMET');
            setRecentAction({ action: 'Reputation SBT Minted!', points: 150 });
        }
        setIsProcessing(false);
    };

    // Handle carbon credit minting
    const handleMintCarbonCredit = async () => {
        setIsProcessing(true);

        // Simulate carbon credit NFT creation
        simulateAhoyAction('CARBON_CREDIT_EARNED', 'COMET');
        setRecentAction({ action: 'Carbon Credit Minted', points: 75 });

        await new Promise(r => setTimeout(r, 1000));
        setIsProcessing(false);
    };

    // Handle express delivery upgrade (BURN action)
    const handleExpressUpgrade = async () => {
        const result = simulateAhoyAction('EXPRESS_DELIVERY', 'COMET');
        if (result.success) {
            setRecentAction({ action: 'Express Delivery', points: -100 });
        }
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header with AHOY Balance */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                        <Truck className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">COMET</h1>
                        <p className="text-sm text-orange-400 font-medium">Logistics & Fleet AI</p>
                        <p className="text-xs text-gray-500 mt-0.5">Tokenized fleet management with driver rewards</p>
                    </div>
                </div>

                {/* AHOY Balance Widget */}
                <div className="w-72">
                    <AhoyBalanceWidget vertical="COMET" />
                </div>
            </div>

            {/* Recent Action Toast */}
            {recentAction && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 duration-300 flex items-center gap-3 ${
                    recentAction.points > 0
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

            {/* Live Oracle Panel */}
            <div className="mb-6">
                <CometLivePanel expanded={false} />
            </div>

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab('flow')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'flow' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Zap className="w-4 h-4" /> Live Flow
                </button>
                <button
                    onClick={() => setActiveTab('fleet')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'fleet' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Package className="w-4 h-4" /> Fleet Operations
                </button>
                <button
                    onClick={() => setActiveTab('tokenization')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'tokenization' ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Coins className="w-4 h-4" /> Tokenization
                </button>
                <button
                    onClick={() => setActiveTab('drivers')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'drivers' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Award className="w-4 h-4" /> Driver Reputation
                </button>
            </div>

            {/* Live Flow Tab - E2E Tokenization Demo */}
            {activeTab === 'flow' && (
                <TokenizationFlowPanel />
            )}

            {/* Fleet Operations Tab */}
            {activeTab === 'fleet' && (
                <div className="grid grid-cols-3 gap-6">
                    {/* Deliveries List */}
                    <div className="col-span-2 space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-white">Active Deliveries ({deliveries.length})</h2>
                            <button
                                onClick={handleCreateDelivery}
                                className="px-3 py-2 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 transition-all flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> New Delivery
                            </button>
                        </div>

                        {deliveries.length === 0 ? (
                            <div className="glass-card p-8 rounded-xl border border-white/5 text-center">
                                <Package className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                                <p className="text-gray-400 mb-4">No deliveries yet</p>
                                <button
                                    onClick={handleCreateDelivery}
                                    className="px-4 py-2 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 transition-all"
                                >
                                    Create First Delivery
                                </button>
                            </div>
                        ) : (
                            deliveries.slice(0, 10).map((d) => (
                                <div key={d.id} className="glass-card p-4 rounded-xl border border-white/5 hover:border-orange-500/30 transition-all">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2.5 rounded-lg ${
                                                d.status === 'DELIVERED' ? 'bg-green-500/10' :
                                                d.status === 'IN_TRANSIT' ? 'bg-blue-500/10' :
                                                d.status === 'ASSIGNED' ? 'bg-purple-500/10' : 'bg-gray-500/10'
                                            }`}>
                                                {d.status === 'DELIVERED' ? (
                                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                ) : d.status === 'IN_TRANSIT' ? (
                                                    <Truck className="w-5 h-5 text-blue-400" />
                                                ) : d.status === 'ASSIGNED' ? (
                                                    <UserCheck className="w-5 h-5 text-purple-400" />
                                                ) : (
                                                    <Clock className="w-5 h-5 text-gray-400" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-white">{d.driverName || 'Unassigned'}</p>
                                                <p className="text-xs text-gray-500">{d.pickupAddress} → {d.deliveryAddress}</p>
                                                <p className="text-xs text-gray-600 font-mono">ID: {d.id}</p>
                                            </div>
                                        </div>

                                        <div className="text-center">
                                            <p className="text-sm font-bold text-gray-200">
                                                {d.status === 'DELIVERED' ? 'Done' : `${d.estimatedTime} min`}
                                            </p>
                                            <p className="text-xs text-green-400 flex items-center gap-1">
                                                <Leaf className="w-3 h-3" /> {d.carbonEmission.toFixed(1)} kg
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="text-sm font-bold text-white">{d.amount}</p>
                                            <p className="text-xs text-gray-500">{d.customerName}</p>
                                        </div>

                                        <div className="flex gap-2">
                                            {d.status === 'PENDING' && (
                                                <>
                                                    <button
                                                        onClick={() => handleAssignDelivery(d.id)}
                                                        disabled={!drivers.some(dr => dr.status === 'AVAILABLE')}
                                                        className="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold rounded-lg hover:bg-purple-500/20 transition-all disabled:opacity-50"
                                                    >
                                                        Assign
                                                    </button>
                                                    <button
                                                        onClick={() => handlePriorityDispatch(d)}
                                                        disabled={parseInt(ahoyState.balance) < 50}
                                                        className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50"
                                                    >
                                                        Priority -50
                                                    </button>
                                                </>
                                            )}
                                            {d.status === 'ASSIGNED' && (
                                                <button
                                                    onClick={() => handleStartDelivery(d.id)}
                                                    className="px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-500/20 transition-all flex items-center gap-1"
                                                >
                                                    <Play className="w-3 h-3" /> Start
                                                </button>
                                            )}
                                            {d.status === 'IN_TRANSIT' && (
                                                <button
                                                    onClick={() => handleDeliveryComplete(d)}
                                                    disabled={isProcessing}
                                                    className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold rounded-lg hover:bg-green-500/20 transition-all flex items-center gap-2"
                                                >
                                                    {isProcessing && selectedDriver === d.driverName ? (
                                                        <div className="w-3 h-3 border-2 border-green-400 rounded-full animate-spin border-t-transparent" />
                                                    ) : (
                                                        <Zap className="w-3 h-3" />
                                                    )}
                                                    Complete +AHOY
                                                </button>
                                            )}
                                            {d.status === 'DELIVERED' && (
                                                <span className="px-3 py-1.5 bg-green-500/10 text-green-400 text-xs font-bold rounded-lg flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> {d.isPerfect ? 'Perfect!' : 'Done'}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Express Delivery Option */}
                        <div className="glass-card p-4 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-900/10 to-transparent">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Sparkles className="w-5 h-5 text-amber-400" />
                                    <div>
                                        <p className="font-bold text-white">Express Delivery Mode</p>
                                        <p className="text-xs text-gray-400">Upgrade all pending deliveries to express</p>
                                    </div>
                                </div>
                                <AhoyActionButton
                                    label="Upgrade All"
                                    points={100}
                                    isEarn={false}
                                    onClick={handleExpressUpgrade}
                                    icon={<Zap className="w-4 h-4" />}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Stats */}
                    <div className="space-y-4">
                        {/* Fleet Drivers */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Truck className="w-4 h-4 text-orange-400" /> Fleet Drivers ({drivers.length})
                            </h3>
                            <div className="space-y-2">
                                {drivers.map((driver) => (
                                    <div key={driver.id} className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${
                                                driver.status === 'AVAILABLE' ? 'bg-green-400' :
                                                driver.status === 'ON_DELIVERY' ? 'bg-blue-400' : 'bg-gray-400'
                                            }`} />
                                            <span className="text-sm text-white">{driver.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">{driver.overallScore.toFixed(1)} pts</p>
                                            <p className="text-xs text-amber-400">{driver.totalDeliveries} trips</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-amber-400" /> AHOY Actions
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Complete Delivery</span>
                                    <span className="text-green-400 font-bold">+10 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Perfect Delivery</span>
                                    <span className="text-green-400 font-bold">+100 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                                    <span className="text-gray-300">Priority Dispatch</span>
                                    <span className="text-red-400 font-bold">-50 AHOY</span>
                                </div>
                            </div>
                        </div>

                        {/* Carbon Credits */}
                        <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Leaf className="w-5 h-5 text-green-400" />
                                <h3 className="font-bold text-white">Carbon Credits</h3>
                            </div>
                            <p className="text-2xl font-bold text-white mb-1">
                                {deliveries.filter(d => d.status === 'DELIVERED').reduce((sum, d) => sum + d.carbonEmission, 0).toFixed(1)} kg
                            </p>
                            <p className="text-xs text-gray-400 mb-3">Total CO2 from deliveries</p>

                            <AhoyActionButton
                                label="Mint Carbon NFT"
                                points={75}
                                isEarn={true}
                                onClick={handleMintCarbonCredit}
                                loading={isProcessing}
                                icon={<FileCheck className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Tokenization Tab */}
            {activeTab === 'tokenization' && (
                <div className="space-y-6">
                    {/* Tokenization Flow Diagram */}
                    <div className="glass-card p-6 rounded-xl border border-amber-500/20">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Coins className="w-5 h-5 text-amber-400" />
                            COMET Tokenization Model
                        </h2>

                        <div className="grid grid-cols-4 gap-4">
                            {/* Step 1 */}
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-blue-500/20 rounded-full flex items-center justify-center">
                                    <Truck className="w-6 h-6 text-blue-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Delivery</p>
                                <p className="text-xs text-gray-400 mt-1">Driver completes delivery with GPS verification</p>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-blue-500 to-green-500" />
                            </div>

                            {/* Step 2 */}
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <Coins className="w-6 h-6 text-green-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Earn AHOY</p>
                                <p className="text-xs text-gray-400 mt-1">+10 AHOY per delivery, bonuses for streaks</p>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-green-500 to-purple-500" />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mt-6">
                            {/* Step 3 */}
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-purple-500/20 rounded-full flex items-center justify-center">
                                    <Award className="w-6 h-6 text-purple-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Build Rep</p>
                                <p className="text-xs text-gray-400 mt-1">Accumulate scores for Soulbound Token</p>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-purple-500 to-amber-500" />
                            </div>

                            {/* Step 4 */}
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-amber-500/20 rounded-full flex items-center justify-center">
                                    <ShieldCheck className="w-6 h-6 text-amber-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Mint SBT</p>
                                <p className="text-xs text-gray-400 mt-1">Non-transferable reputation on-chain</p>
                            </div>

                            {/* Arrow */}
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
                            </div>
                        </div>
                    </div>

                    {/* Asset Types */}
                    <div className="grid grid-cols-3 gap-4">
                        {/* Driver Reputation SBT */}
                        <div className="glass-card p-5 rounded-xl border border-purple-500/20 bg-gradient-to-b from-purple-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Award className="w-5 h-5 text-purple-400" />
                                <h3 className="font-bold text-white">Driver Reputation SBT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Soulbound Token representing driver performance. Non-transferable, verifiable on-chain.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500 mb-3">
                                <p>• Safety Score: 0-100</p>
                                <p>• Efficiency Rating</p>
                                <p>• Total Deliveries</p>
                                <p>• Incident History</p>
                            </div>
                            <AhoyActionButton
                                label="Mint SBT"
                                points={150}
                                isEarn={true}
                                onClick={handleMintSBT}
                                disabled={!!reputation?.sbtTokenId}
                                loading={isProcessing}
                                icon={<ShieldCheck className="w-4 h-4" />}
                                className="w-full"
                            />
                            {reputation?.sbtTokenId && (
                                <p className="text-xs text-green-400 mt-2 text-center">SBT Already Minted</p>
                            )}
                        </div>

                        {/* Carbon Credit NFT */}
                        <div className="glass-card p-5 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Leaf className="w-5 h-5 text-green-400" />
                                <h3 className="font-bold text-white">Carbon Credit NFT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Tradeable carbon offset credits verified by VERRA standard. Earned through eco-friendly routing.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500 mb-3">
                                <p>• CO2 Offset Amount</p>
                                <p>• Verification Hash</p>
                                <p>• Trading Enabled</p>
                                <p>• ESG Marketplace</p>
                            </div>
                            <AhoyActionButton
                                label="Mint Credit"
                                points={75}
                                isEarn={true}
                                onClick={handleMintCarbonCredit}
                                loading={isProcessing}
                                icon={<FileCheck className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>

                        {/* AHOY Token Utility */}
                        <div className="glass-card p-5 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Coins className="w-5 h-5 text-amber-400" />
                                <h3 className="font-bold text-white">AHOY Token</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Utility token for the COMET ecosystem. Earn through performance, spend on premium features.
                            </p>
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs p-2 bg-green-500/10 rounded">
                                    <span className="text-green-400">Delivery Complete</span>
                                    <span className="text-green-400 font-bold">+10</span>
                                </div>
                                <div className="flex justify-between text-xs p-2 bg-green-500/10 rounded">
                                    <span className="text-green-400">Safety Bonus</span>
                                    <span className="text-green-400 font-bold">+50</span>
                                </div>
                                <div className="flex justify-between text-xs p-2 bg-red-500/10 rounded">
                                    <span className="text-red-400">Priority Access</span>
                                    <span className="text-red-400 font-bold">-50</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SDK Assets Created */}
                    {cometAssets.length > 0 && (
                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3">Created Assets ({cometAssets.length})</h3>
                            <div className="space-y-2">
                                {cometAssets.slice(0, 5).map(asset => (
                                    <div key={asset.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                        <div>
                                            <p className="text-white font-medium">{asset.name}</p>
                                            <p className="text-gray-500 font-mono">{asset.id.slice(0, 16)}...</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                                            String(asset.state) === 'ACTIVE' ? 'bg-green-500/20 text-green-400' :
                                            String(asset.state) === 'VERIFIED' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-gray-500/20 text-gray-400'
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

            {/* Drivers Tab */}
            {activeTab === 'drivers' && reputation && (
                <div className="grid grid-cols-2 gap-6">
                    {/* Driver Reputation Card */}
                    <div className="glass-card p-6 rounded-xl border border-purple-500/20 bg-gradient-to-b from-purple-900/10 to-transparent">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-purple-500/20 rounded-full flex items-center justify-center">
                                    <Award className="w-6 h-6 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-white">Driver Reputation</h3>
                                    <p className="text-xs text-gray-400">{reputation.driverId}</p>
                                </div>
                            </div>
                            {reputation.sbtTokenId ? (
                                <span className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-bold rounded-full border border-green-500/30">
                                    SBT Active
                                </span>
                            ) : (
                                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 text-xs font-bold rounded-full border border-gray-500/30">
                                    No SBT
                                </span>
                            )}
                        </div>

                        <div className="text-center mb-6">
                            <p className="text-5xl font-bold text-white">{reputation.overallScore.toFixed(1)}</p>
                            <p className="text-sm text-gray-400">Overall Score</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-6">
                            <div className="p-3 bg-white/5 rounded-xl text-center">
                                <ShieldCheck className="w-5 h-5 text-green-400 mx-auto mb-1" />
                                <p className="text-xl font-bold text-white">{reputation.safetyScore}</p>
                                <p className="text-[10px] text-gray-500">Safety</p>
                            </div>
                            <div className="p-3 bg-white/5 rounded-xl text-center">
                                <Zap className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                                <p className="text-xl font-bold text-white">{reputation.efficiencyScore}</p>
                                <p className="text-[10px] text-gray-500">Efficiency</p>
                            </div>
                            <div className="p-3 bg-white/5 rounded-xl text-center">
                                <Clock className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                                <p className="text-xl font-bold text-white">{reputation.reliabilityScore}</p>
                                <p className="text-[10px] text-gray-500">Reliability</p>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Total Deliveries</span>
                                <span className="text-white font-mono">{reputation.totalDeliveries.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Perfect Deliveries</span>
                                <span className="text-green-400 font-mono">{reputation.perfectDeliveries.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">On-Time Rate</span>
                                <span className="text-blue-400 font-mono">{reputation.onTimeRate}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Incidents</span>
                                <span className={`font-mono ${reputation.incidentCount === 0 ? 'text-green-400' : 'text-amber-400'}`}>
                                    {reputation.incidentCount}
                                </span>
                            </div>
                        </div>

                        {!reputation.sbtTokenId && (
                            <div className="mt-6">
                                <AhoyActionButton
                                    label="Mint Reputation SBT"
                                    points={150}
                                    isEarn={true}
                                    onClick={handleMintSBT}
                                    loading={isProcessing}
                                    icon={<Award className="w-4 h-4" />}
                                    className="w-full"
                                />
                            </div>
                        )}
                    </div>

                    {/* Badges & Events */}
                    <div className="space-y-4">
                        {/* Badges */}
                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-4">Earned Badges</h3>
                            <div className="grid grid-cols-3 gap-3">
                                {reputation.badges.map(badge => (
                                    <div key={badge.id} className="p-3 bg-white/5 rounded-xl text-center border border-amber-500/20">
                                        <div className="w-10 h-10 mx-auto mb-2 bg-amber-500/20 rounded-full flex items-center justify-center">
                                            <Sparkles className="w-5 h-5 text-amber-400" />
                                        </div>
                                        <p className="text-xs font-bold text-white">{badge.name}</p>
                                        <p className="text-[10px] text-gray-500 mt-1">{badge.requirement}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Events */}
                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-4">Recent Events</h3>
                            <div className="space-y-2">
                                {events.length > 0 ? events.slice(0, 5).map(event => (
                                    <div key={event.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                                        <div className="flex items-center gap-2">
                                            {event.scoreImpact >= 0 ? (
                                                <TrendingUp className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <TrendingDown className="w-4 h-4 text-red-400" />
                                            )}
                                            <span className="text-sm text-gray-300">{event.type.replace(/_/g, ' ')}</span>
                                        </div>
                                        <span className={`text-xs font-mono ${event.scoreImpact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {event.scoreImpact >= 0 ? '+' : ''}{event.scoreImpact.toFixed(1)}
                                        </span>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500 text-center py-4">No events yet. Complete a delivery!</p>
                                )}
                            </div>
                        </div>

                        {/* Leaderboard Preview */}
                        <div className="glass-card p-5 rounded-xl border border-orange-500/20">
                            <h3 className="font-bold text-white mb-4">Fleet Leaderboard</h3>
                            <div className="space-y-2">
                                {driverLeaderboard.length > 0 ? driverLeaderboard.slice(0, 5).map((driver, index) => (
                                    <div key={driver.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                index === 0 ? 'bg-amber-500 text-white' :
                                                index === 1 ? 'bg-gray-400 text-white' :
                                                'bg-amber-700 text-white'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            <span className="text-sm text-white">{driver.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-400">{driver.overallScore.toFixed(1)} pts</p>
                                            <p className="text-xs text-amber-400 font-mono">{driver.totalDeliveries} deliveries</p>
                                            <p className="text-xs text-green-400 font-mono">{driver.ahoyBalance} AHOY</p>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-sm text-gray-500 text-center py-4">No drivers yet. Complete deliveries to appear!</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
