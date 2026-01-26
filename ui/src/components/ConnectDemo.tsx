/**
 * ConnectDemo - Cross-Platform Integration with Tokenization
 *
 * CONNECT is the unified API layer that enables:
 * - Cross-platform data sync between AHOY products
 * - AI Agent task delegation and completion rewards
 * - Priority queue access for premium users
 * - Discount redemption marketplace
 *
 * Tokenization:
 * - Agent Task NFTs - Proof of completed AI agent tasks
 * - Priority Access Tokens - Time-limited queue priority
 * - Discount Voucher NFTs - Transferable discount credits
 */

import { useState, useEffect } from 'react';
import {
    Link2, Zap, Bot, Clock, Ticket, RefreshCw,
    CheckCircle2, ArrowRightLeft, TrendingUp, TrendingDown,
    Coins, Sparkles, Activity, Server
} from 'lucide-react';
import { useAhoyState, useSDK } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';

interface AgentTask {
    id: string;
    name: string;
    type: 'DATA_SYNC' | 'ANALYTICS' | 'OPTIMIZATION' | 'NOTIFICATION';
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    reward: number;
    source: string;
    target: string;
    createdAt: Date;
    completedAt?: Date;
}

export function ConnectDemo() {
    const [activeTab, setActiveTab] = useState<'agents' | 'tokenization' | 'queue'>('agents');
    const [isProcessing, setIsProcessing] = useState(false);
    const [recentAction, setRecentAction] = useState<{ action: string; points: number } | null>(null);
    const [tasks, setTasks] = useState<AgentTask[]>([
        { id: 'task-1', name: 'Sync COMET delivery data to GTS', type: 'DATA_SYNC', status: 'PENDING', reward: 40, source: 'COMET', target: 'GTS', createdAt: new Date() },
        { id: 'task-2', name: 'Generate H2O conservation report', type: 'ANALYTICS', status: 'RUNNING', reward: 40, source: 'H2O', target: 'AMS', createdAt: new Date(Date.now() - 60000) },
        { id: 'task-3', name: 'Optimize FLY+ routing', type: 'OPTIMIZATION', status: 'COMPLETED', reward: 40, source: 'FLYPLUS', target: 'GTS', createdAt: new Date(Date.now() - 120000), completedAt: new Date() },
    ]);

    const { ahoyState, simulateAhoyAction } = useAhoyState();
    const { assets } = useSDK();

    // Get CONNECT-related assets from SDK
    const connectAssets = assets.filter(a => a.metadata?.vertical === 'CONNECT');

    // Clear recent action after 3 seconds
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    // Complete agent task
    const handleCompleteTask = async (taskId: string) => {
        setIsProcessing(true);

        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, status: 'RUNNING' as const } : t
        ));

        await new Promise(r => setTimeout(r, 1500));

        setTasks(prev => prev.map(t =>
            t.id === taskId ? { ...t, status: 'COMPLETED' as const, completedAt: new Date() } : t
        ));

        const result = simulateAhoyAction('AGENT_TASK_COMPLETION', 'CONNECT');
        setRecentAction({ action: 'Agent Task Completed', points: result.points });

        setIsProcessing(false);
    };

    // Request priority queue access
    const handlePriorityQueue = async () => {
        const result = simulateAhoyAction('PRIORITY_QUEUE', 'CONNECT');
        if (result.success) {
            setRecentAction({ action: 'Priority Queue Activated', points: -200 });
        }
    };

    // Redeem discount
    const handleRedeemDiscount = async () => {
        const result = simulateAhoyAction('DISCOUNT_REDEMPTION', 'CONNECT');
        if (result.success) {
            setRecentAction({ action: 'Discount Redeemed', points: -500 });
        }
    };

    // Cross-platform sync
    const handleCrossSync = async () => {
        setIsProcessing(true);
        await new Promise(r => setTimeout(r, 800));
        const result = simulateAhoyAction('CROSS_PLATFORM_SYNC', 'CONNECT');
        setRecentAction({ action: 'Cross-Platform Sync', points: result.points });
        setIsProcessing(false);
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header with AHOY Balance */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Link2 className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">CONNECT</h1>
                        <p className="text-sm text-indigo-400 font-medium">Cross-Platform Integration</p>
                        <p className="text-xs text-gray-500 mt-0.5">AI agents & unified data layer</p>
                    </div>
                </div>

                {/* AHOY Balance Widget */}
                <div className="w-72">
                    <AhoyBalanceWidget vertical="CONNECT" />
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

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab('agents')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'agents' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Bot className="w-4 h-4" /> AI Agents
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
                    onClick={() => setActiveTab('queue')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'queue' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Clock className="w-4 h-4" /> Priority Queue
                </button>
            </div>

            {/* AI Agents Tab */}
            {activeTab === 'agents' && (
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-4">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">Active Agent Tasks</h2>
                            <button
                                onClick={handleCrossSync}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold rounded-lg hover:bg-indigo-500/20 transition-all flex items-center gap-2"
                            >
                                <RefreshCw className={`w-3 h-3 ${isProcessing ? 'animate-spin' : ''}`} />
                                Sync All +20 AHOY
                            </button>
                        </div>

                        {tasks.map((task) => (
                            <div key={task.id} className="glass-card p-4 rounded-xl border border-white/5 hover:border-indigo-500/30 transition-all">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className={`p-2.5 rounded-lg ${
                                            task.status === 'COMPLETED' ? 'bg-green-500/10' :
                                            task.status === 'RUNNING' ? 'bg-blue-500/10' : 'bg-gray-500/10'
                                        }`}>
                                            {task.status === 'COMPLETED' ? (
                                                <CheckCircle2 className="w-5 h-5 text-green-500" />
                                            ) : task.status === 'RUNNING' ? (
                                                <Activity className="w-5 h-5 text-blue-400 animate-pulse" />
                                            ) : (
                                                <Bot className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-white text-sm">{task.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-indigo-400">{task.source}</span>
                                                <ArrowRightLeft className="w-3 h-3 text-gray-500" />
                                                <span className="text-xs text-purple-400">{task.target}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                                            task.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' :
                                            task.status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400' :
                                            'bg-gray-500/20 text-gray-400'
                                        }`}>
                                            {task.status}
                                        </span>

                                        {task.status === 'PENDING' && (
                                            <button
                                                onClick={() => handleCompleteTask(task.id)}
                                                disabled={isProcessing}
                                                className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold rounded-lg hover:bg-green-500/20 transition-all"
                                            >
                                                Run +{task.reward} AHOY
                                            </button>
                                        )}

                                        {task.status === 'COMPLETED' && (
                                            <span className="text-xs text-green-400 font-mono">+{task.reward}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* AHOY Actions */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-amber-400" /> AHOY Actions
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Complete Task</span>
                                    <span className="text-green-400 font-bold">+40 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Cross-Platform Sync</span>
                                    <span className="text-green-400 font-bold">+20 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                                    <span className="text-gray-300">Priority Queue</span>
                                    <span className="text-red-400 font-bold">-200 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                                    <span className="text-gray-300">Discount Redemption</span>
                                    <span className="text-red-400 font-bold">-500 AHOY</span>
                                </div>
                            </div>
                        </div>

                        {/* Platform Connections */}
                        <div className="glass-card p-4 rounded-xl border border-indigo-500/20">
                            <h3 className="font-bold text-white mb-3">Connected Platforms</h3>
                            <div className="space-y-2">
                                {['COMET', 'FLY+', 'H2O2TO', 'IITS', 'GTS', 'AMS'].map(platform => (
                                    <div key={platform} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                                        <span className="text-sm text-gray-300">{platform}</span>
                                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tokenization Tab */}
            {activeTab === 'tokenization' && (
                <div className="space-y-6">
                    {/* Tokenization Flow */}
                    <div className="glass-card p-6 rounded-xl border border-amber-500/20">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Coins className="w-5 h-5 text-amber-400" />
                            CONNECT Tokenization Model
                        </h2>
                        <p className="text-sm text-gray-400 mb-6">
                            CONNECT enables cross-platform data flow and AI agent orchestration. AHOY token is the unified currency across all AHOY products.
                        </p>

                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-indigo-500/20 rounded-full flex items-center justify-center">
                                    <Bot className="w-6 h-6 text-indigo-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Agent Task</p>
                                <p className="text-xs text-gray-400 mt-1">AI agent completes cross-platform task</p>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-indigo-500 to-green-500" />
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <Coins className="w-6 h-6 text-green-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Earn AHOY</p>
                                <p className="text-xs text-gray-400 mt-1">+40 AHOY per completed task</p>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-green-500 to-purple-500" />
                            </div>
                        </div>
                    </div>

                    {/* Token Utilities */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="glass-card p-5 rounded-xl border border-indigo-500/20 bg-gradient-to-b from-indigo-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Bot className="w-5 h-5 text-indigo-400" />
                                <h3 className="font-bold text-white">Agent Task NFT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Proof of completed AI agent tasks. Verifiable record of cross-platform operations.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500 mb-3">
                                <p>• Task ID & Timestamp</p>
                                <p>• Source & Target Systems</p>
                                <p>• Execution Hash</p>
                                <p>• Reward Amount</p>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-purple-500/20 bg-gradient-to-b from-purple-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="w-5 h-5 text-purple-400" />
                                <h3 className="font-bold text-white">Priority Access Token</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Time-limited priority queue access across all AHOY services.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500 mb-3">
                                <p>• 24-hour validity</p>
                                <p>• Cross-platform priority</p>
                                <p>• Queue skip privileges</p>
                            </div>
                            <AhoyActionButton
                                label="Get Priority"
                                points={200}
                                isEarn={false}
                                onClick={handlePriorityQueue}
                                icon={<Clock className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Ticket className="w-5 h-5 text-amber-400" />
                                <h3 className="font-bold text-white">Discount Voucher NFT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Transferable discount credits redeemable across AHOY ecosystem.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500 mb-3">
                                <p>• 20% service discount</p>
                                <p>• Transferable to others</p>
                                <p>• Stackable benefits</p>
                            </div>
                            <AhoyActionButton
                                label="Redeem Discount"
                                points={500}
                                isEarn={false}
                                onClick={handleRedeemDiscount}
                                icon={<Ticket className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* AHOY Token Flow */}
                    <div className="glass-card p-6 rounded-xl border border-amber-500/20">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-400" />
                            AHOY Token - Unified Ecosystem Currency
                        </h3>
                        <div className="grid grid-cols-6 gap-3 text-center">
                            {[
                                { name: 'COMET', color: 'orange' },
                                { name: 'FLY+', color: 'sky' },
                                { name: 'H2O2TO', color: 'cyan' },
                                { name: 'IITS', color: 'emerald' },
                                { name: 'GTS', color: 'blue' },
                                { name: 'AMS', color: 'violet' },
                            ].map(platform => (
                                <div key={platform.name} className="p-3 bg-white/5 rounded-xl border border-white/10">
                                    <p className="text-xs font-bold text-white">{platform.name}</p>
                                    <p className="text-[10px] text-gray-400 mt-1">Earn & Spend</p>
                                    <div className="w-full h-0.5 bg-amber-500/50 mt-2 rounded-full" />
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400 text-center mt-4">
                            AHOY token flows seamlessly between all products - earn in one, spend in another
                        </p>
                    </div>
                </div>
            )}

            {/* Priority Queue Tab */}
            {activeTab === 'queue' && (
                <div className="grid grid-cols-2 gap-6">
                    <div className="glass-card p-6 rounded-xl border border-purple-500/20">
                        <h2 className="text-lg font-bold text-white mb-4">Priority Queue Benefits</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-lg">
                                <p className="font-bold text-white mb-1">COMET Priority</p>
                                <p className="text-xs text-gray-400">Skip delivery queue, priority dispatch</p>
                            </div>
                            <div className="p-4 bg-white/5 rounded-lg">
                                <p className="font-bold text-white mb-1">FLY+ Priority</p>
                                <p className="text-xs text-gray-400">Fast-track check-in, priority boarding</p>
                            </div>
                            <div className="p-4 bg-white/5 rounded-lg">
                                <p className="font-bold text-white mb-1">GTS Priority</p>
                                <p className="text-xs text-gray-400">Premium API rate limits, faster responses</p>
                            </div>
                        </div>

                        <AhoyActionButton
                            label="Activate Priority (24h)"
                            points={200}
                            isEarn={false}
                            onClick={handlePriorityQueue}
                            icon={<Zap className="w-4 h-4" />}
                            className="w-full mt-6"
                        />
                    </div>

                    <div className="glass-card p-6 rounded-xl border border-amber-500/20">
                        <h2 className="text-lg font-bold text-white mb-4">Discount Marketplace</h2>
                        <div className="space-y-4">
                            <div className="p-4 bg-white/5 rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-white">20% Off Any Service</p>
                                    <p className="text-xs text-gray-400">Valid across all platforms</p>
                                </div>
                                <span className="text-amber-400 font-bold">500 AHOY</span>
                            </div>
                            <div className="p-4 bg-white/5 rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-white">Free API Calls (100)</p>
                                    <p className="text-xs text-gray-400">GTS routing & analytics</p>
                                </div>
                                <span className="text-amber-400 font-bold">300 AHOY</span>
                            </div>
                            <div className="p-4 bg-white/5 rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-white">Premium Support</p>
                                    <p className="text-xs text-gray-400">Priority customer service</p>
                                </div>
                                <span className="text-amber-400 font-bold">750 AHOY</span>
                            </div>
                        </div>

                        <AhoyActionButton
                            label="Redeem 20% Discount"
                            points={500}
                            isEarn={false}
                            onClick={handleRedeemDiscount}
                            icon={<Ticket className="w-4 h-4" />}
                            className="w-full mt-6"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
