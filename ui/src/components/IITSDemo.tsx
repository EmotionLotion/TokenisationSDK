import { useState, useEffect } from 'react';
import {
    Building2, Activity, Vote, Siren,
    Map, Car, Users, Coins, CheckCircle2, Clock,
    Shield, Zap, AlertTriangle, Radio, TrendingUp,
    TrendingDown, Layers, ArrowRight, Lock, Database
} from 'lucide-react';
import { useSmartCity } from '../hooks/useVerticals';
import { useAhoyState } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';

type TabType = 'traffic' | 'tokenization' | 'dao' | 'emergency';

export function IITSDemo() {
    const [activeTab, setActiveTab] = useState<TabType>('traffic');
    const [recentAction, setRecentAction] = useState<string | null>(null);
    const { ahoyState, simulateAhoyAction } = useAhoyState();

    // Wire to real SDK via useSmartCity hook
    const {
        proposals,
        authorizations,
        infrastructureTokens,
        votingPower,
        isLoading,
        voteOnProposal,
        requestEmergencyAuth,
        signAuthorization,
        executeAuthorizedCommand,
        mintInfrastructureToken,
        activeProposals,
        pendingAuthorizations,
    } = useSmartCity();

    // Auto-hide toast
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    const showToast = (message: string) => setRecentAction(message);

    const handleVote = async (proposalId: string, vote: 'FOR' | 'AGAINST') => {
        const result = await voteOnProposal(proposalId, vote);
        if (result.success) {
            simulateAhoyAction('DAO_VOTE', 'IITS');
            showToast('+15 AHOY - Vote Cast Successfully!');
        }
    };

    const handleRequestAuth = async () => {
        const result = await requestEmergencyAuth('TRAFFIC_OVERRIDE', 'TRAFFIC_CONTROLLER_GRID_4');
        if (result.success) {
            simulateAhoyAction('EMERGENCY_AUTH_REQUEST', 'IITS');
            showToast('-100 AHOY - Emergency Auth Requested');
        }
    };

    const handleSignAuth = async (authId: string) => {
        const result = await signAuthorization(authId);
        if (result.success) {
            simulateAhoyAction('EMERGENCY_AUTH_SIGN', 'IITS');
            showToast('+25 AHOY - Authorization Signed!');
        }
    };

    const handleExecuteCommand = async (authId: string) => {
        const result = await executeAuthorizedCommand(authId);
        if (result.success) {
            showToast('Command Executed - Audit Logged');
        } else {
            console.error('Execution failed:', result.error);
        }
    };

    const handleMintInfrastructure = async () => {
        const result = await mintInfrastructureToken('SENSOR_NODE', { lat: 25.2048, lng: 55.2708 });
        if (result.success) {
            simulateAhoyAction('INFRASTRUCTURE_TOKEN_MINTED', 'IITS');
            showToast('+50 AHOY - Infrastructure Token Minted!');
        }
    };

    // Format time remaining
    const formatTimeRemaining = (date: Date) => {
        const diff = date.getTime() - Date.now();
        if (diff <= 0) return 'Ended';
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        if (days > 0) return `${days}d`;
        return `${hours}h`;
    };

    return (
        <div className="max-w-5xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Toast notification */}
            {recentAction && (
                <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
                    <div className={`px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg ${
                        recentAction.startsWith('+')
                            ? 'bg-green-500/20 border-green-500/30 text-green-400'
                            : recentAction.startsWith('-')
                            ? 'bg-red-500/20 border-red-500/30 text-red-400'
                            : 'bg-blue-500/20 border-blue-500/30 text-blue-400'
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
                    <div className="w-12 h-12 bg-gray-600 rounded-2xl flex items-center justify-center shadow-lg shadow-gray-500/20">
                        <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">IITS</h1>
                        <p className="text-sm text-gray-400 font-medium">Smart City Orchestration</p>
                    </div>
                </div>

                <AhoyBalanceWidget vertical="IITS" compact />
            </div>

            {/* AHOY Token Economics Banner */}
            <div className="glass-card p-4 rounded-xl border border-gray-500/20 bg-gray-900/5 mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">DAO Vote</p>
                            <p className="text-sm font-bold text-green-400">+15 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Radio className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Mint Token</p>
                            <p className="text-sm font-bold text-green-400">+50 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <TrendingDown className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Emergency Auth</p>
                            <p className="text-sm font-bold text-red-400">-100 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Sign Auth</p>
                            <p className="text-sm font-bold text-green-400">+25 AHOY</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                {[
                    { id: 'traffic', label: 'Traffic Ops', icon: Activity },
                    { id: 'tokenization', label: 'Tokenization', icon: Layers },
                    { id: 'dao', label: 'City DAO', icon: Vote },
                    { id: 'emergency', label: 'Emergency', icon: Siren },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? tab.id === 'emergency' ? 'bg-red-500 text-white' : tab.id === 'dao' ? 'bg-indigo-500 text-white' : 'bg-gray-600 text-white'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Live Map Placeholder */}
            <div className="col-span-1 md:col-span-2 glass-card h-48 rounded-2xl border border-white/5 relative overflow-hidden flex items-center justify-center bg-black/20 mb-6">
                <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900 via-transparent to-transparent"></div>
                <Map className="w-12 h-12 text-gray-700 mb-2" />
                <p className="text-gray-500 absolute bottom-4">Real-time City Digital Twin</p>

                {/* Overlay Stats */}
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md p-3 rounded-lg border border-white/10">
                    <p className="text-xs text-gray-400">Avg Speed</p>
                    <p className="font-mono font-bold text-white">42 km/h</p>
                </div>
                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-lg border border-white/10">
                    <p className="text-xs text-gray-400">Infrastructure</p>
                    <p className="font-mono font-bold text-purple-400">{infrastructureTokens.length} Tokens</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Traffic Operations Tab */}
                {activeTab === 'traffic' && (
                    <>
                        {/* Infrastructure Stats */}
                        <div className="glass-card p-6 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <Radio className="w-5 h-5 text-purple-400" />
                                    Infrastructure Network
                                </h3>
                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded border border-green-500/30">
                                    All Systems Online
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <p className="text-xs text-gray-500">Signal Controllers</p>
                                    <p className="text-xl font-mono text-white">847</p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <p className="text-xs text-gray-500">Sensor Nodes</p>
                                    <p className="text-xl font-mono text-white">2,341</p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <p className="text-xs text-gray-500">Traffic Cameras</p>
                                    <p className="text-xl font-mono text-white">1,156</p>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                                    <p className="text-xs text-gray-500">EV Chargers</p>
                                    <p className="text-xl font-mono text-white">423</p>
                                </div>
                            </div>

                            <AhoyActionButton
                                label="Register New Infrastructure"
                                points={50}
                                isEarn={true}
                                onClick={handleMintInfrastructure}
                                loading={isLoading}
                                icon={<Radio className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>

                        {/* Real-time Metrics */}
                        <div className="glass-card p-6 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" />
                                Real-time Metrics
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-400">Network Throughput</span>
                                        <span className="text-white font-mono">87%</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-2 rounded-full">
                                        <div className="bg-blue-500 h-2 rounded-full w-[87%]" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-400">Signal Optimization</span>
                                        <span className="text-white font-mono">94%</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-2 rounded-full">
                                        <div className="bg-green-500 h-2 rounded-full w-[94%]" />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-400">Emission Reduction</span>
                                        <span className="text-white font-mono">23%</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-2 rounded-full">
                                        <div className="bg-emerald-500 h-2 rounded-full w-[23%]" />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-white/5">
                                <AhoyBalanceWidget vertical="IITS" />
                            </div>
                        </div>
                    </>
                )}

                {/* Tokenization Tab */}
                {activeTab === 'tokenization' && (
                    <>
                        <div className="md:col-span-2 space-y-4">
                            {/* IITS Tokenization Model */}
                            <div className="glass-card p-6 rounded-xl border border-gray-500/20">
                                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-gray-400" />
                                    IITS Tokenization Model
                                </h3>
                                <p className="text-sm text-gray-400 mb-6">
                                    IITS tokenizes city infrastructure assets and governance rights, enabling decentralized smart city management with on-chain audit trails.
                                </p>

                                {/* Token Types */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Radio className="w-5 h-5 text-purple-400" />
                                            <span className="font-bold text-purple-400">Infrastructure NFT</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">Digital twin of physical infrastructure assets</p>
                                        <div className="text-xs text-green-400">Earn +50 AHOY per mint</div>
                                    </div>
                                    <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Vote className="w-5 h-5 text-indigo-400" />
                                            <span className="font-bold text-indigo-400">Governance Token</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">DAO voting rights for city decisions</p>
                                        <div className="text-xs text-indigo-400">Stake AHOY for voting power</div>
                                    </div>
                                    <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Lock className="w-5 h-5 text-red-400" />
                                            <span className="font-bold text-red-400">Emergency Auth SBT</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mb-2">Multi-sig emergency authorization</p>
                                        <div className="text-xs text-red-400">Requires -100 AHOY stake</div>
                                    </div>
                                </div>

                                {/* Tokenization Flow */}
                                <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                                    <h4 className="font-medium text-white mb-3">Infrastructure Tokenization Flow</h4>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-gray-500/20 rounded-lg flex items-center justify-center">
                                                <Radio className="w-5 h-5 text-gray-400" />
                                            </div>
                                            <p className="text-gray-400">Physical Asset</p>
                                            <p className="text-gray-500">Registration</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                                <Shield className="w-5 h-5 text-blue-400" />
                                            </div>
                                            <p className="text-gray-400">Verification</p>
                                            <p className="text-gray-500">Multi-sig</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-purple-500/20 rounded-lg flex items-center justify-center">
                                                <Database className="w-5 h-5 text-purple-400" />
                                            </div>
                                            <p className="text-gray-400">NFT Mint</p>
                                            <p className="text-green-400">+50 AHOY</p>
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-600" />
                                        <div className="text-center">
                                            <div className="w-10 h-10 mx-auto mb-1 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                                <Vote className="w-5 h-5 text-indigo-400" />
                                            </div>
                                            <p className="text-gray-400">DAO Control</p>
                                            <p className="text-indigo-400">Governable</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* AHOY Utility */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="glass-card p-4 rounded-xl border border-white/5">
                                    <h3 className="font-bold text-white mb-3">AHOY Utility in IITS</h3>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                                            <p className="text-xs text-gray-400 mb-1">EARN Actions</p>
                                            <ul className="space-y-1 text-sm">
                                                <li className="flex justify-between">
                                                    <span className="text-gray-300">Mint Infrastructure</span>
                                                    <span className="text-green-400">+50</span>
                                                </li>
                                                <li className="flex justify-between">
                                                    <span className="text-gray-300">DAO Vote</span>
                                                    <span className="text-green-400">+15</span>
                                                </li>
                                                <li className="flex justify-between">
                                                    <span className="text-gray-300">Sign Authorization</span>
                                                    <span className="text-green-400">+25</span>
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                                            <p className="text-xs text-gray-400 mb-1">BURN Actions</p>
                                            <ul className="space-y-1 text-sm">
                                                <li className="flex justify-between">
                                                    <span className="text-gray-300">Emergency Auth</span>
                                                    <span className="text-red-400">-100</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                <AhoyBalanceWidget vertical="IITS" />
                            </div>
                        </div>
                    </>
                )}

                {/* City DAO Tab */}
                {activeTab === 'dao' && (
                    <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {activeProposals.map(p => (
                            <div key={p.id} className="glass-card p-6 rounded-xl border border-indigo-500/20 bg-indigo-900/5">
                                <div className="flex justify-between items-start mb-4">
                                    <Vote className="w-6 h-6 text-indigo-400" />
                                    <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {formatTimeRemaining(p.endsAt)} left
                                    </span>
                                </div>
                                <h3 className="font-bold text-white text-lg mb-2">{p.title}</h3>
                                <p className="text-sm text-gray-400 mb-4 line-clamp-2">{p.description}</p>

                                {/* Vote Progress */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                        <span>For: {p.votesFor.toLocaleString()}</span>
                                        <span>Against: {p.votesAgainst.toLocaleString()}</span>
                                    </div>
                                    <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden flex">
                                        <div
                                            className="bg-green-500 h-2"
                                            style={{ width: `${(p.votesFor / (p.votesFor + p.votesAgainst)) * 100}%` }}
                                        />
                                        <div
                                            className="bg-red-500 h-2"
                                            style={{ width: `${(p.votesAgainst / (p.votesFor + p.votesAgainst)) * 100}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm text-gray-400">
                                        <Users className="w-4 h-4" /> {p.votes.toLocaleString()} votes
                                    </div>

                                    {p.hasVoted ? (
                                        <span className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-bold flex items-center gap-2 border border-green-500/30">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Voted (+15 AHOY)
                                        </span>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleVote(p.id, 'FOR')}
                                                disabled={isLoading}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold text-white transition-all"
                                            >
                                                Vote For
                                            </button>
                                            <button
                                                onClick={() => handleVote(p.id, 'AGAINST')}
                                                disabled={isLoading}
                                                className="px-4 py-2 bg-red-600/50 hover:bg-red-500 rounded-lg text-sm font-bold text-white transition-all"
                                            >
                                                Against
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {activeProposals.length === 0 && (
                            <div className="col-span-2 text-center py-12 text-gray-500">
                                <Vote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>No active proposals</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Emergency Tab */}
                {activeTab === 'emergency' && (
                    <div className="col-span-1 md:col-span-2 space-y-6">
                        {/* Active Emergency Alert */}
                        {pendingAuthorizations.length > 0 ? (
                            pendingAuthorizations.map(auth => (
                                <div key={auth.id} className="glass-card p-6 rounded-xl border border-red-500/30 bg-red-900/10">
                                    <div className="flex gap-6 items-center">
                                        <div className={`w-16 h-16 rounded-full flex items-center justify-center border ${auth.status === 'APPROVED' ? 'bg-green-500/20 border-green-500/50' : 'bg-red-500/20 border-red-500/50 animate-pulse'}`}>
                                            <Siren className={`w-8 h-8 ${auth.status === 'APPROVED' ? 'text-green-500' : 'text-red-500'}`} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-xl font-bold text-white">
                                                    {auth.type.replace(/_/g, ' ')}
                                                </h3>
                                                <span className={`text-xs px-2 py-0.5 rounded ${auth.status === 'APPROVED' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                    {auth.status}
                                                </span>
                                            </div>
                                            <p className="text-gray-400 text-sm">
                                                Resource: {auth.resourceId}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2">
                                                <span className="text-xs text-gray-500">
                                                    Signatures: {auth.signatures.length}/{auth.requiredSignatures}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    Requested by: {auth.requestedBy}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {auth.status === 'PENDING' && (
                                                <AhoyActionButton
                                                    label="Sign Authorization"
                                                    points={25}
                                                    isEarn={true}
                                                    onClick={() => handleSignAuth(auth.id)}
                                                    loading={isLoading}
                                                />
                                            )}
                                            {auth.status === 'APPROVED' && (
                                                <button
                                                    onClick={() => handleExecuteCommand(auth.id)}
                                                    disabled={isLoading}
                                                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-all active:scale-95"
                                                >
                                                    {isLoading ? 'Executing...' : 'Execute Command'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Signature Progress */}
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <div className="flex items-center gap-2">
                                            {Array.from({ length: auth.requiredSignatures }).map((_, i) => (
                                                <div
                                                    key={i}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center border ${i < auth.signatures.length ? 'bg-green-500/20 border-green-500/50' : 'bg-white/5 border-white/10'}`}
                                                >
                                                    {i < auth.signatures.length ? (
                                                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                                                    ) : (
                                                        <Shield className="w-4 h-4 text-gray-600" />
                                                    )}
                                                </div>
                                            ))}
                                            <span className="text-xs text-gray-500 ml-2">
                                                {auth.requiredSignatures - auth.signatures.length} more signature(s) needed
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="glass-card p-8 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
                                <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-white mb-2">All Clear</h3>
                                <p className="text-gray-400">No active emergency authorizations</p>
                            </div>
                        )}

                        {/* Request New Authorization */}
                        <div className="glass-card p-6 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                                Request Emergency Authorization
                            </h3>
                            <p className="text-sm text-gray-400 mb-4">
                                Emergency commands require multi-signature approval from authorized personnel. All actions are logged on-chain for audit.
                            </p>
                            <AhoyActionButton
                                label="Request Traffic Override"
                                points={100}
                                isEarn={false}
                                onClick={handleRequestAuth}
                                loading={isLoading}
                                icon={<Zap className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
