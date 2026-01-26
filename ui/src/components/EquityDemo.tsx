import { useState } from 'react';
import {
    PieChart, TrendingUp, Users, Shield,
    Briefcase, Coins, Vote, Lock, Award,
    CheckCircle2, ArrowRight
} from 'lucide-react';
import { sdkStore } from '../store';
import { motion } from 'framer-motion';

export function EquityDemo() {
    const [activeTab, setActiveTab] = useState<'founder' | 'investor' | 'employee' | 'customer'>('founder');
    const [isMinting, setIsMinting] = useState(false);

    const simulateGrant = async (role: string) => {
        setIsMinting(true);
        // SDK: Grant Equity Token
        sdkStore.logSdkCall('ahoy.equity.grant', {
            recipient: `did:ahoy:${role}:me`,
            amount: '500_000_ESOP',
            vesting: '4y_LINEAR_1y_CLIFF',
            role: role.toUpperCase()
        });

        await new Promise(r => setTimeout(r, 1500));
        sdkStore.simulateAhoyAction('ALGORITHM_PUBLISHED', 'CONNECT'); // Using this for points
        setIsMinting(false);
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                        <PieChart className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Equity & Governance</h1>
                        <p className="text-sm text-indigo-400 font-medium">Cap Table Management & Token Rights</p>
                    </div>
                </div>

                <div className="flex bg-white/5 rounded-full p-1 border border-white/10">
                    <button onClick={() => setActiveTab('founder')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'founder' ? 'bg-indigo-600 text-white' : 'text-gray-400'}`}>Founder</button>
                    <button onClick={() => setActiveTab('investor')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'investor' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Investor</button>
                    <button onClick={() => setActiveTab('employee')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'employee' ? 'bg-purple-600 text-white' : 'text-gray-400'}`}>Employee</button>
                    <button onClick={() => setActiveTab('customer')} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeTab === 'customer' ? 'bg-amber-600 text-white' : 'text-gray-400'}`}>Customer</button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">

                {/* Main Content Area */}
                <div className="col-span-12 lg:col-span-8 space-y-6">

                    {/* Founder View */}
                    {activeTab === 'founder' && (
                        <div className="space-y-6">
                            <div className="glass-card p-6 rounded-2xl border border-indigo-500/20 bg-indigo-900/5">
                                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-indigo-400" /> Executive Cap Table Overview
                                </h2>

                                {/* Simulated Cap Table Visualization */}
                                <div className="h-8 bg-white/10 rounded-full flex overflow-hidden mb-2">
                                    <div className="w-[45%] bg-indigo-500 hover:bg-indigo-400 transition-colors tooltip" title="Founders"></div>
                                    <div className="w-[20%] bg-blue-500 hover:bg-blue-400 transition-colors tooltip" title="Investors"></div>
                                    <div className="w-[15%] bg-purple-500 hover:bg-purple-400 transition-colors tooltip" title="Employee Pool"></div>
                                    <div className="w-[20%] bg-amber-500 hover:bg-amber-400 transition-colors tooltip" title="Community Treasury"></div>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 font-mono mb-6">
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500" /> Founders (45%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> Investors (20%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500" /> ESOP (15%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> Community (20%)</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <p className="text-sm text-gray-400">Voting Power</p>
                                        <p className="text-2xl font-bold text-white">4.5M <span className="text-sm text-indigo-400">veAHOY</span></p>
                                    </div>
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <p className="text-sm text-gray-400">Next Vesting Cliff</p>
                                        <p className="text-2xl font-bold text-white">12 Days</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Investor View */}
                    {activeTab === 'investor' && (
                        <div className="space-y-6">
                            <div className="glass-card p-6 rounded-2xl border border-blue-500/20 bg-blue-900/5">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">Series A Portfolio</h2>
                                        <p className="text-sm text-gray-400">Lead Investor • 4-Year Vesting</p>
                                    </div>
                                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-bold border border-blue-500/30">Preferred Stock</span>
                                </div>

                                {/* Vesting Graph Simulation */}
                                <div className="h-48 bg-black/20 rounded-xl border border-white/5 relative mb-6 overflow-hidden flex items-end px-4 gap-2">
                                    {[10, 20, 30, 40, 50, 60, 70, 80].map((h, i) => (
                                        <div key={i} className="flex-1 bg-blue-500/30 rounded-t-sm relative group hover:bg-blue-500/60 transition-all" style={{ height: `${h}%` }}>
                                            {i === 5 && (
                                                <div className="absolute top-0 right-0 w-full h-1 bg-white animate-pulse shadow-[0_0_10px_white]" />
                                            )}
                                        </div>
                                    ))}
                                    <div className="absolute top-4 right-4 text-xs font-mono text-gray-400">
                                        Current Vest: 62%
                                    </div>
                                </div>

                                <button className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-white flex items-center justify-center gap-2">
                                    <Lock className="w-4 h-4 text-gray-400" /> Manage Liquidation Preferences
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Employee View */}
                    {activeTab === 'employee' && (
                        <div className="space-y-6">
                            <div className="glass-card p-6 rounded-2xl border border-purple-500/20 bg-purple-900/5">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-xl font-bold text-white">JD</div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">John Doe</h3>
                                        <p className="text-sm text-purple-400">Senior Engineer • Joined 2024</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Product Specific Grant */}
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm font-bold text-gray-200">Fly+ Product Equity</span>
                                            <span className="text-xs text-green-400">+12% YoY</span>
                                        </div>
                                        <div className="w-full bg-white/5 h-2 rounded-full mb-1">
                                            <div className="bg-green-500 h-2 rounded-full w-[45%]" />
                                        </div>
                                        <p className="text-xs text-gray-500 text-right">45% Vested</p>
                                    </div>

                                    {/* Ecosystem Grant */}
                                    <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-sm font-bold text-gray-200">Ahoy Ecosystem Pool</span>
                                            <span className="text-xs text-blue-400">Stable</span>
                                        </div>
                                        <div className="w-full bg-white/5 h-2 rounded-full mb-1">
                                            <div className="bg-blue-500 h-2 rounded-full w-[75%]" />
                                        </div>
                                        <p className="text-xs text-gray-500 text-right">75% Vested</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => simulateGrant('employee')}
                                    disabled={isMinting}
                                    className="mt-6 w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2"
                                >
                                    {isMinting ? 'Executing Grant Contract...' : 'Claim Vested Options'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Customer View */}
                    {activeTab === 'customer' && (
                        <div className="space-y-6">
                            <div className="glass-card p-8 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-900/10 to-transparent text-center">
                                <Award className="w-16 h-16 text-amber-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
                                <h2 className="text-2xl font-bold text-white mb-2">Diamond Customer Status</h2>
                                <p className="text-gray-400 max-w-md mx-auto mb-8">
                                    Your loyalty score of 98/100 qualifies you for the Community Ownership Program. Convert your Loyalty Points into real Equity Tokens.
                                </p>

                                <div className="flex justify-center gap-8 mb-8">
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest">Points</p>
                                        <p className="text-2xl font-mono font-bold text-white">50,000</p>
                                    </div>
                                    <ArrowRight className="w-6 h-6 text-gray-600 mt-2" />
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500 uppercase tracking-widest">Equity</p>
                                        <p className="text-2xl font-mono font-bold text-amber-400">500 AHY</p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => simulateGrant('customer')}
                                    disabled={isMinting}
                                    className="px-8 py-3 bg-gradient-to-r from-amber-600 to-yellow-600 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 hover:scale-105 transition-transform"
                                >
                                    {isMinting ? 'Minting Ownership Tokens...' : 'Convert to Equity'}
                                </button>
                            </div>
                        </div>
                    )}

                </div>

                {/* Sidebar Info */}
                <div className="col-span-12 lg:col-span-4 space-y-4">
                    <div className="glass-card p-6 rounded-2xl border border-white/5">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <Vote className="w-4 h-4 text-gray-400" /> Governance Proposals
                        </h3>
                        <div className="space-y-3">
                            {[
                                { title: 'Increase Employee Pool', status: 'Active', votes: '12M' },
                                { title: 'Series B Term Sheet', status: 'Passed', votes: '45M' },
                                { title: 'Customer Dividend', status: 'Pending', votes: '8M' }
                            ].map((p, i) => (
                                <div key={i} className="bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                    <div className="flex justify-between mb-1">
                                        <span className="text-sm font-medium text-gray-200">{p.title}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.status === 'Active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>{p.status}</span>
                                    </div>
                                    <p className="text-xs text-gray-500">{p.votes} Votes Cast</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="glass-card p-6 rounded-2xl border border-white/5 bg-gradient-to-b from-indigo-900/20 to-transparent">
                        <h3 className="font-bold text-white mb-2">Smart Vesting Contracts</h3>
                        <p className="text-xs text-gray-400 mb-4">
                            All equity grants are executed via audited smart contracts on the Ahoy Permissioned Chain.
                        </p>
                        <div className="flex items-center gap-2 text-xs font-mono text-indigo-300 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Audit Verified: 0x82...a9
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
