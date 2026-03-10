import { useState, useEffect } from 'react';
import {
    Network, Cpu, BrainCircuit, Search,
    ShieldCheck, DollarSign, ArrowRight, Brain,
    Coins, Play, CheckCircle2, Loader2, TrendingUp,
    TrendingDown, Layers, Database, Lock, Shield
} from 'lucide-react';
// TODO: useFederatedML hook lives in the ui/ app — wire to vertical-specific hook or pass as props
import { useFederatedML } from '../hooks/useVerticals';
// TODO: These imports reference the ui/ app's context — wire to vertical-specific providers or pass as props
import { useAhoyState } from '../contexts/SDKContext';
// TODO: AhoyBalanceWidget lives in pack-loyalty ui — import from @tokenisation/pack-loyalty/ui once published
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';

type TabType = 'hub' | 'compute' | 'tokenization' | 'rag';

export function TrouveLabsDemo() {
    const [activeTab, setActiveTab] = useState<TabType>('hub');
    const [queryInput, setQueryInput] = useState('');
    const [selectedModel, setSelectedModel] = useState('mdl_fin_01');
    const [recentAction, setRecentAction] = useState<string | null>(null);
    const { simulateAhoyAction } = useAhoyState();

    // Wire to real SDK via useFederatedML hook
    const {
        models,
        contributions,
        queries,
        earnedTokens,
        trainingStatus,
        isLoading,
        joinTrainingRound,
        executeRAGQuery,
        mintModelNFT,
        resetTrainingStatus,
    } = useFederatedML();

    // Auto-hide toast
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    const showToast = (message: string) => setRecentAction(message);

    const handleStartTraining = async () => {
        const result = await joinTrainingRound(selectedModel, '24GB_VRAM', 15420);
        if (result.success) {
            simulateAhoyAction('COMPUTE_CONTRIBUTION', 'TROUVE');
            showToast('+50 AHOY - Training Round Completed!');
        }
    };

    const handleQuery = async () => {
        if (!queryInput.trim()) return;

        const result = await executeRAGQuery(queryInput, 'mdl_med_03');
        if (result.success) {
            simulateAhoyAction('RAG_QUERY', 'TROUVE');
            showToast('-0.12 AHOY - Query Executed');
        }
        setQueryInput('');
    };

    const handleMintModel = async () => {
        const result = await mintModelNFT('CustomModel v1', 'CUSTOM', '91.5%', '0.04');
        if (result.success) {
            simulateAhoyAction('MODEL_NFT_MINTED', 'TROUVE');
            showToast('+200 AHOY - Model NFT Minted!');
        }
    };

    // Get latest query result
    const latestQuery = queries.find(q => q.status === 'COMPLETED');

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
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-pink-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/20">
                        <Brain className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Trouve Labs</h1>
                        <p className="text-sm text-pink-400 font-medium">Decentralized Intelligence & Knowledge Graphs</p>
                    </div>
                </div>

                <AhoyBalanceWidget vertical="TROUVE" compact />
            </div>

            {/* AHOY Token Economics Banner */}
            <div className="glass-card p-4 rounded-xl border border-pink-500/20 bg-pink-900/5 mb-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <TrendingUp className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Compute</p>
                            <p className="text-sm font-bold text-green-400">+50 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <BrainCircuit className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Model NFT</p>
                            <p className="text-sm font-bold text-green-400">+200 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                            <TrendingDown className="w-4 h-4 text-red-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">RAG Query</p>
                            <p className="text-sm font-bold text-red-400">-0.12 AHOY</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                            <Database className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-400">Data</p>
                            <p className="text-sm font-bold text-green-400">+15 AHOY</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                {[
                    { id: 'hub', label: 'Model Hub', icon: BrainCircuit },
                    { id: 'compute', label: 'Compute Farm', icon: Cpu },
                    { id: 'tokenization', label: 'Tokenization', icon: Layers },
                    { id: 'rag', label: 'Graph RAG', icon: Search },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                {/* Model Hub */}
                {activeTab === 'hub' && (
                    <>
                        {models.map(m => (
                            <div key={m.id} className="glass-card p-5 rounded-xl border border-white/5 hover:border-green-500/30 transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-green-500/10 rounded-lg">
                                        <BrainCircuit className="w-6 h-6 text-green-400" />
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs bg-white/5 px-2 py-1 rounded text-gray-400 block mb-1">{m.usageCost} AHOY/use</span>
                                        <span className="text-xs text-gray-500">{m.participants} participants</span>
                                    </div>
                                </div>
                                <h3 className="font-bold text-white text-lg">{m.name}</h3>
                                <p className="text-sm text-gray-500 mb-4">Round {m.currentRound.toLocaleString()} / {m.totalRounds.toLocaleString()}</p>
                                <div className="flex items-center gap-4 text-sm mb-4">
                                    <span className="text-green-400 font-bold">ACC: {m.accuracy}</span>
                                    <span className="text-gray-400">Verifiable</span>
                                </div>
                                <button
                                    onClick={() => setSelectedModel(m.id)}
                                    className={`w-full py-2 rounded-lg text-sm font-bold transition-all border ${selectedModel === m.id ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/5 hover:bg-white/10 text-white border-white/10'}`}
                                >
                                    {selectedModel === m.id ? 'Selected' : 'Select Model'}
                                </button>
                            </div>
                        ))}

                        {/* Mint New Model */}
                        <div className="glass-card p-5 rounded-xl border border-dashed border-white/20 hover:border-pink-500/30 transition-all flex flex-col items-center justify-center text-center">
                            <Coins className="w-8 h-8 text-pink-400 mb-3" />
                            <h3 className="font-bold text-white mb-2">Mint Model NFT</h3>
                            <p className="text-xs text-gray-500 mb-4">Tokenize your ML model IP</p>
                            <button
                                onClick={handleMintModel}
                                disabled={isLoading}
                                className="px-4 py-2 bg-pink-500/10 border border-pink-500/30 text-pink-400 rounded-lg hover:bg-pink-500/20 transition-all text-sm font-bold"
                            >
                                {isLoading ? 'Minting...' : 'Create Model NFT'}
                            </button>
                        </div>
                    </>
                )}

                {/* Compute Farm */}
                {activeTab === 'compute' && (
                    <div className="col-span-2 glass-card p-8 rounded-2xl border border-emerald-500/20 bg-emerald-900/5">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                <Cpu className="w-6 h-6 text-emerald-400" />
                                Active Training Node
                            </h2>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${trainingStatus === 'training' ? 'bg-yellow-500 animate-ping' : trainingStatus === 'completed' ? 'bg-green-500' : 'bg-gray-500'} `} />
                                <span className={`text-xs font-bold uppercase ${trainingStatus === 'training' ? 'text-yellow-400' : trainingStatus === 'completed' ? 'text-green-400' : 'text-gray-400'}`}>
                                    {trainingStatus === 'training' ? 'COMPUTING' : trainingStatus === 'completed' ? 'COMPLETED' : 'IDLE'}
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="bg-black/20 p-4 rounded-xl text-center border border-white/5">
                                <p className="text-xs text-gray-500">GPU Util</p>
                                <p className="text-xl font-mono text-white mt-1">{trainingStatus === 'training' ? '98%' : '12%'}</p>
                            </div>
                            <div className="bg-black/20 p-4 rounded-xl text-center border border-white/5">
                                <p className="text-xs text-gray-500">Total Earnings</p>
                                <p className="text-xl font-mono text-emerald-400 mt-1">{earnedTokens.toLocaleString()} TROUVE</p>
                            </div>
                            <div className="bg-black/20 p-4 rounded-xl text-center border border-white/5">
                                <p className="text-xs text-gray-500">Jobs Completed</p>
                                <p className="text-xl font-mono text-white mt-1">{contributions.filter(c => c.status === 'REWARDED').length}</p>
                            </div>
                        </div>

                        {/* Terminal Output */}
                        <div className="bg-black/40 rounded-xl p-4 font-mono text-xs text-gray-400 mb-6 border border-white/5 h-32 overflow-y-auto">
                            <p className="text-green-500">&gt; Trouve Labs Federated Learning Node</p>
                            <p>&gt; Initializing local trainer...</p>
                            <p>&gt; Connecting to aggregator node [10.2.4.55]...</p>
                            <p>&gt; Downloading global model weights...</p>
                            {trainingStatus === 'training' && (
                                <p className="text-emerald-400 animate-pulse">&gt; Processing batch {Math.floor(Math.random() * 9999)}... (ZK-SNARK proof generating)</p>
                            )}
                            {trainingStatus === 'completed' && contributions[0] && (
                                <>
                                    <p className="text-blue-400">&gt; Gradients hash: {contributions[0].gradientsHash}</p>
                                    <p className="text-green-400">&gt; Gradients submitted successfully! (+{contributions[0].reward} TROUVE)</p>
                                    <p className="text-green-400">&gt; Proof of compute NFT minted to wallet</p>
                                </>
                            )}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={handleStartTraining}
                                disabled={trainingStatus === 'training' || isLoading}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {trainingStatus === 'training' ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Training in Progress...</>
                                ) : (
                                    <><Play className="w-4 h-4" /> Start Federated Round</>
                                )}
                            </button>

                            {trainingStatus === 'completed' && (
                                <button
                                    onClick={resetTrainingStatus}
                                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all"
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* Recent Contributions */}
                        {contributions.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-white/10">
                                <h3 className="text-sm font-bold text-white mb-3">Recent Contributions</h3>
                                <div className="space-y-2">
                                    {contributions.slice(0, 3).map(c => (
                                        <div key={c.id} className="flex items-center justify-between bg-black/20 p-3 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 className={`w-4 h-4 ${c.status === 'REWARDED' ? 'text-green-400' : 'text-yellow-400'}`} />
                                                <span className="text-sm text-gray-400">{c.roundId}</span>
                                            </div>
                                            <span className="text-sm font-mono text-emerald-400">+{c.reward} TROUVE</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Tokenization Tab */}
                {activeTab === 'tokenization' && (
                    <div className="col-span-2 space-y-6">
                        {/* Trouve Tokenization Model */}
                        <div className="glass-card p-6 rounded-xl border border-pink-500/20">
                            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                <Layers className="w-5 h-5 text-pink-400" />
                                Trouve Tokenization Model
                            </h3>
                            <p className="text-sm text-gray-400 mb-6">
                                Trouve Labs tokenizes AI compute contributions, ML models, and knowledge graph queries. Earn AHOY by contributing GPU power and data.
                            </p>

                            {/* Token Types */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="p-4 bg-pink-500/10 rounded-xl border border-pink-500/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <BrainCircuit className="w-5 h-5 text-pink-400" />
                                        <span className="font-bold text-pink-400">Model NFT</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">ML models as tradeable IP with usage royalties</p>
                                    <div className="text-xs text-green-400">Earn +200 AHOY per mint</div>
                                </div>
                                <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Cpu className="w-5 h-5 text-emerald-400" />
                                        <span className="font-bold text-emerald-400">Compute SBT</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">Proof of compute contribution badges</p>
                                    <div className="text-xs text-green-400">Earn +50 AHOY per round</div>
                                </div>
                                <div className="p-4 bg-teal-500/10 rounded-xl border border-teal-500/30">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Database className="w-5 h-5 text-teal-400" />
                                        <span className="font-bold text-teal-400">Data Token</span>
                                    </div>
                                    <p className="text-xs text-gray-400 mb-2">Knowledge graph contributions</p>
                                    <div className="text-xs text-green-400">Earn +15 AHOY per dataset</div>
                                </div>
                            </div>

                            {/* Tokenization Flow */}
                            <div className="p-4 bg-black/20 rounded-xl border border-white/5">
                                <h4 className="font-medium text-white mb-3">Federated Learning Tokenization Flow</h4>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="text-center">
                                        <div className="w-10 h-10 mx-auto mb-1 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                                            <Cpu className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        <p className="text-gray-400">GPU Power</p>
                                        <p className="text-gray-500">Contribution</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-gray-600" />
                                    <div className="text-center">
                                        <div className="w-10 h-10 mx-auto mb-1 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                            <Shield className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <p className="text-gray-400">ZK-SNARK</p>
                                        <p className="text-gray-500">Verification</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-gray-600" />
                                    <div className="text-center">
                                        <div className="w-10 h-10 mx-auto mb-1 bg-pink-500/20 rounded-lg flex items-center justify-center">
                                            <Lock className="w-5 h-5 text-pink-400" />
                                        </div>
                                        <p className="text-gray-400">SBT Mint</p>
                                        <p className="text-green-400">+50 AHOY</p>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-gray-600" />
                                    <div className="text-center">
                                        <div className="w-10 h-10 mx-auto mb-1 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                                            <Coins className="w-5 h-5 text-yellow-400" />
                                        </div>
                                        <p className="text-gray-400">Rewards</p>
                                        <p className="text-yellow-400">Distributed</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AHOY Utility */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">AHOY Utility in Trouve</h3>
                                <div className="space-y-3">
                                    <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                                        <p className="text-xs text-gray-400 mb-1">EARN Actions</p>
                                        <ul className="space-y-1 text-sm">
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Model NFT Mint</span>
                                                <span className="text-green-400">+200</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Compute Round</span>
                                                <span className="text-green-400">+50</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Data Contribution</span>
                                                <span className="text-green-400">+15</span>
                                            </li>
                                        </ul>
                                    </div>
                                    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                                        <p className="text-xs text-gray-400 mb-1">BURN Actions</p>
                                        <ul className="space-y-1 text-sm">
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">RAG Query</span>
                                                <span className="text-red-400">-0.12</span>
                                            </li>
                                            <li className="flex justify-between">
                                                <span className="text-gray-300">Model Access</span>
                                                <span className="text-red-400">-0.05+</span>
                                            </li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <AhoyBalanceWidget vertical="TROUVE" />
                        </div>
                    </div>
                )}

                {/* Graph RAG */}
                {activeTab === 'rag' && (
                    <div className="col-span-2 space-y-6">
                        {/* Query Input */}
                        <div className="glass-card p-6 rounded-2xl border border-teal-500/20 bg-teal-900/5">
                            <div className="flex gap-4">
                                <Search className="w-8 h-8 text-teal-400 shrink-0" />
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-white mb-2">Verified Knowledge Graph Query</h3>
                                    <div className="relative mb-4">
                                        <input
                                            type="text"
                                            value={queryInput}
                                            onChange={(e) => setQueryInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                                            placeholder="Ask the sovereign knowledge base..."
                                            className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-white focus:outline-none focus:border-teal-500"
                                        />
                                        <button
                                            onClick={handleQuery}
                                            disabled={isLoading || !queryInput.trim()}
                                            className="absolute right-2 top-1.5 p-1.5 bg-teal-500/20 hover:bg-teal-500/40 rounded-lg text-teal-400 transition-all disabled:opacity-50"
                                        >
                                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="flex gap-4 text-xs">
                                        <span className="flex items-center gap-1 text-gray-400"><ShieldCheck className="w-3 h-3 text-green-500" /> Source Verified</span>
                                        <span className="flex items-center gap-1 text-gray-400"><DollarSign className="w-3 h-3 text-yellow-500" /> 0.12 AHOY/Query</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Latest Query Result */}
                        {latestQuery && (
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 bg-teal-500/10 rounded-lg">
                                        <BrainCircuit className="w-5 h-5 text-teal-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h4 className="font-bold text-white">Query Result</h4>
                                            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">Verified</span>
                                        </div>
                                        <p className="text-sm text-gray-300 mb-3">{latestQuery.result}</p>
                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                            <span>Model: {latestQuery.model}</span>
                                            <span>Sources: {latestQuery.sourceCount}</span>
                                            <span>Cost: {latestQuery.cost} AHOY</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Query History */}
                        {queries.length > 0 && (
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-4">Query History</h3>
                                <div className="space-y-3">
                                    {queries.slice(0, 5).map(q => (
                                        <div key={q.id} className="flex items-center justify-between bg-black/20 p-3 rounded-lg">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white truncate">{q.query}</p>
                                                <p className="text-xs text-gray-500">{q.model}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`text-xs px-2 py-0.5 rounded ${q.status === 'COMPLETED' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                                    {q.status}
                                                </span>
                                                <span className="text-xs font-mono text-gray-400">{q.cost} AHOY</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
