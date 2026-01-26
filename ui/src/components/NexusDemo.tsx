import { useState } from 'react';
import {
    Code2, Users, ChevronRight, CheckCircle,
    Terminal, Key, Plus, AlertCircle,
    Cpu, GitBranch, Layers, Bot,
    Database, Network, Lock, Coins, Play
} from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';

type TabType = 'orchestration' | 'accounts' | 'agents' | 'developers';

interface Agent {
    id: string;
    name: string;
    type: string;
    status: 'active' | 'idle' | 'processing';
    tasksCompleted: number;
    ahoyEarned: number;
}

export function NexusDemo() {
    const [activeTab, setActiveTab] = useState<TabType>('orchestration');
    const { ahoyState, simulateAhoyAction } = useAhoyState();

    const [accounts, setAccounts] = useState([
        { id: 'acct_1K9x...', name: 'RideShare Fleet A', status: 'active', volume: '12,450 AHOY', users: 142 },
        { id: 'acct_1K9y...', name: 'GreenEnergy Co', status: 'active', volume: '8,200 AHOY', users: 85 },
        { id: 'acct_1K9z...', name: 'Urban Data Node', status: 'pending', volume: '0 AHOY', users: 1 },
    ]);

    const handleAddAccount = () => {
        const newAccount = {
            id: `acct_${Math.random().toString(36).substr(2, 5)}...`,
            name: 'New Platform User',
            status: 'active',
            volume: '0 AHOY',
            users: 1
        };
        setAccounts(prev => [newAccount, ...prev]);
        simulateAhoyAction('AGENT_TASK_COMPLETION', 'AMS');
    };

    const [agents] = useState<Agent[]>([
        { id: 'agent-1', name: 'Fleet Optimizer', type: 'COMET', status: 'active', tasksCompleted: 1247, ahoyEarned: 623 },
        { id: 'agent-2', name: 'Luggage Tracker', type: 'FLY+', status: 'processing', tasksCompleted: 892, ahoyEarned: 446 },
        { id: 'agent-3', name: 'Leak Detector', type: 'H2O', status: 'active', tasksCompleted: 2156, ahoyEarned: 1078 },
        { id: 'agent-4', name: 'Route Planner', type: 'GTS', status: 'idle', tasksCompleted: 567, ahoyEarned: 283 },
    ]);

    const connectedServices = [
        { name: 'GTS', status: 'connected', dataFlow: '45K/day' },
        { name: 'COMET', status: 'connected', dataFlow: '12K/day' },
        { name: 'FLY+', status: 'connected', dataFlow: '8K/day' },
        { name: 'H2O', status: 'connected', dataFlow: '23K/day' },
        { name: 'AMS', status: 'connected', dataFlow: '89K/day' },
    ];

    const handleRunAgent = (agentId: string) => {
        simulateAhoyAction('AGENT_TASK_COMPLETION', 'AMS');
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Network className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Nexus Orchestration</h1>
                        <p className="text-sm text-indigo-400 font-medium">AI Orchestration + Platform Infrastructure</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="glass-card px-4 py-2 rounded-xl border border-yellow-500/20 bg-yellow-900/10">
                        <div className="flex items-center gap-2">
                            <Coins className="w-5 h-5 text-yellow-400" />
                            <div>
                                <p className="text-xs text-gray-400">AHOY Balance</p>
                                <p className="font-mono font-bold text-yellow-400">{ahoyState.balance}</p>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleAddAccount}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-all flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Account
                    </button>
                </div>
            </div>

            {/* Token Economics Banner */}
            <div className="glass-card p-4 rounded-xl border border-indigo-500/20 bg-indigo-900/5 mb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Bot className="w-4 h-4 text-green-400" />
                            <span className="text-sm text-gray-400">Agent Task:</span>
                            <span className="text-sm font-bold text-green-400">+40 AHOY</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Cpu className="w-4 h-4 text-purple-400" />
                            <span className="text-sm text-gray-400">Orchestration Call:</span>
                            <span className="text-sm font-bold text-yellow-400">0.05 AHOY</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm text-gray-400">Local-First:</span>
                            <span className="text-sm font-bold text-cyan-400">Zero Data Leakage</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                {[
                    { id: 'orchestration', label: 'Orchestration', icon: GitBranch },
                    { id: 'agents', label: 'AI Agents', icon: Bot },
                    { id: 'accounts', label: 'Connected Accounts', icon: Users },
                    { id: 'developers', label: 'Developers', icon: Terminal },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                            activeTab === tab.id
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Orchestration Tab */}
                {activeTab === 'orchestration' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            {/* Unified Context View */}
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-indigo-400" />
                                    Unified Context (Tree-of-Thought)
                                </h3>
                                <p className="text-sm text-gray-400 mb-4">
                                    Real-time shared context across all AHOY services. Advanced reasoning transforms raw data into actionable insights.
                                </p>

                                {/* Service Connections Visualization */}
                                <div className="bg-black/20 rounded-xl p-6 border border-white/5">
                                    <div className="flex items-center justify-center gap-4 flex-wrap">
                                        {connectedServices.map((service, i) => (
                                            <div key={i} className="flex flex-col items-center">
                                                <div className="w-16 h-16 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center mb-2 group hover:bg-indigo-500/20 transition-all">
                                                    <Database className="w-6 h-6 text-indigo-400 group-hover:scale-110 transition-transform" />
                                                </div>
                                                <p className="text-xs font-bold text-white">{service.name}</p>
                                                <p className="text-[10px] text-green-400">{service.dataFlow}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-4 text-center">
                                        <p className="text-xs text-gray-500">All data flows through Nexus Orchestration orchestration layer</p>
                                    </div>
                                </div>
                            </div>

                            {/* Query Intelligence */}
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <Cpu className="w-5 h-5 text-purple-400" />
                                    Query Intelligence
                                </h3>
                                <div className="bg-black/40 rounded-lg p-4 font-mono text-sm">
                                    <p className="text-gray-500 mb-2">// Natural language query</p>
                                    <p className="text-cyan-400 mb-4">"Which drivers have the best safety scores and are available for a high-value delivery near Dubai Marina?"</p>
                                    <p className="text-gray-500 mb-2">// Orchestrated response (0.05 AHOY)</p>
                                    <p className="text-green-400">→ Cross-referencing COMET driver data with GTS location...</p>
                                    <p className="text-green-400">→ Checking H2O environmental conditions...</p>
                                    <p className="text-green-400">→ Found 3 drivers: Ahmed (97.2), Sara (96.8), Omar (95.1)</p>
                                </div>
                                <button
                                    onClick={() => simulateAhoyAction('AGENT_TASK_COMPLETION', 'AMS')}
                                    className="mt-4 w-full py-3 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg font-bold hover:bg-purple-500/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <Play className="w-4 h-4" />
                                    Run Query (+40 AHOY)
                                </button>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">Orchestration Stats</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Queries Today</span>
                                        <span className="font-mono text-white">8,942</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Avg Response</span>
                                        <span className="font-mono text-green-400">124ms</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">AHOY Revenue</span>
                                        <span className="font-mono text-yellow-400">447.1</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Connected Services</span>
                                        <span className="font-mono text-indigo-400">5</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-green-900/5">
                                <h3 className="font-bold text-green-400 mb-2 flex items-center gap-2">
                                    <Lock className="w-4 h-4" />
                                    Local-First Architecture
                                </h3>
                                <p className="text-sm text-gray-400">
                                    Sensitive data stays within your infrastructure. Only aggregated insights and model parameters are shared.
                                </p>
                            </div>
                        </div>
                    </>
                )}

                {/* Agents Tab */}
                {activeTab === 'agents' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h3 className="font-bold text-white flex items-center gap-2">
                                        <Bot className="w-5 h-5 text-indigo-400" />
                                        AI Agents
                                    </h3>
                                    <button className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400 text-xs font-medium hover:bg-indigo-500/20 transition-colors flex items-center gap-1">
                                        <Plus className="w-3 h-3" />
                                        Deploy Agent
                                    </button>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {agents.map(agent => (
                                        <div key={agent.id} className="p-4 hover:bg-white/5 transition-colors">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                                                        agent.status === 'active' ? 'bg-green-500/10 border-green-500/30' :
                                                        agent.status === 'processing' ? 'bg-yellow-500/10 border-yellow-500/30' :
                                                        'bg-gray-500/10 border-gray-500/30'
                                                    }`}>
                                                        <Bot className={`w-6 h-6 ${
                                                            agent.status === 'active' ? 'text-green-400' :
                                                            agent.status === 'processing' ? 'text-yellow-400 animate-pulse' :
                                                            'text-gray-400'
                                                        }`} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white">{agent.name}</p>
                                                        <p className="text-xs text-gray-500">{agent.type} Service</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    <div className="text-right">
                                                        <p className="text-sm font-mono text-white">{agent.tasksCompleted}</p>
                                                        <p className="text-xs text-gray-500">Tasks</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-mono text-green-400">+{agent.ahoyEarned}</p>
                                                        <p className="text-xs text-gray-500">AHOY</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRunAgent(agent.id)}
                                                        className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/20 transition-all"
                                                    >
                                                        <Play className="w-4 h-4 text-indigo-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Agent Economics */}
                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">Agent Economics</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Task Reward</span>
                                        <span className="font-mono text-green-400">+40 AHOY</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Deployment Cost</span>
                                        <span className="font-mono text-yellow-400">100 AHOY</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Hourly Compute</span>
                                        <span className="font-mono text-yellow-400">2 AHOY</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card p-4 rounded-xl border border-indigo-500/20 bg-indigo-900/5">
                                <h3 className="font-bold text-indigo-400 mb-2">Total Agent Earnings</h3>
                                <p className="text-3xl font-bold text-white mb-1">
                                    {agents.reduce((sum, a) => sum + a.ahoyEarned, 0).toLocaleString()}
                                    <span className="text-lg text-gray-500 ml-2">AHOY</span>
                                </p>
                                <p className="text-xs text-gray-500">From {agents.reduce((sum, a) => sum + a.tasksCompleted, 0).toLocaleString()} completed tasks</p>
                            </div>
                        </div>
                    </>
                )}

                {/* Accounts Tab */}
                {activeTab === 'accounts' && (
                    <>
                        <div className="lg:col-span-2">
                            <div className="glass-card rounded-xl border border-white/5 overflow-hidden">
                                <div className="p-4 border-b border-white/5 flex justify-between items-center">
                                    <h3 className="font-bold text-white">Connected Accounts</h3>
                                    <span className="text-xs text-gray-500">{accounts.length} accounts</span>
                                </div>
                                <div className="divide-y divide-white/5">
                                    {accounts.map((acct, idx) => (
                                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold border border-indigo-500/20">
                                                    {acct.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">{acct.name}</p>
                                                    <p className="text-xs text-gray-500 font-mono">{acct.id}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-8">
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500">Volume</p>
                                                    <p className="text-white font-mono text-sm">{acct.volume}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500">Users</p>
                                                    <p className="text-white font-mono text-sm">{acct.users}</p>
                                                </div>
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                    acct.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'
                                                }`}>
                                                    {acct.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="glass-card p-4 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-3">Platform Stats</h3>
                                <div className="space-y-3">
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Total Volume</span>
                                        <span className="font-mono text-white">452,100 AHOY</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Platform Fee</span>
                                        <span className="font-mono text-yellow-400">5%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-sm text-gray-400">Revenue</span>
                                        <span className="font-mono text-green-400">22,605 AHOY</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Developers Tab */}
                {activeTab === 'developers' && (
                    <>
                        <div className="lg:col-span-2 space-y-4">
                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <Key className="w-5 h-5 text-yellow-500" />
                                    API Keys
                                </h3>
                                <div className="space-y-2">
                                    <div className="bg-black/50 p-4 rounded-lg font-mono text-sm text-gray-400 flex justify-between items-center border border-white/10">
                                        <span>pk_live_51Mz...q8jL</span>
                                        <button className="text-gray-600 hover:text-white">Copy</button>
                                    </div>
                                    <div className="bg-black/50 p-4 rounded-lg font-mono text-sm text-gray-400 flex justify-between items-center border border-white/10">
                                        <span>sk_live_02Rt...99xK</span>
                                        <button className="text-gray-600 hover:text-white">Reveal</button>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-card p-6 rounded-xl border border-white/5">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <Terminal className="w-5 h-5 text-indigo-400" />
                                    Orchestration SDK
                                </h3>
                                <div className="bg-black/40 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                    <pre className="text-gray-300">{`import { AhoyConnect } from '@ahoy/connect';

const connect = new AhoyConnect({
  apiKey: 'pk_live_...',
  localFirst: true // Data stays on-premise
});

// Query across all services (0.05 AHOY)
const result = await connect.query({
  prompt: "Find available drivers near Dubai Marina",
  services: ['COMET', 'GTS'],
  context: { urgency: 'high' }
});

// Deploy an AI Agent (100 AHOY)
const agent = await connect.deployAgent({
  name: 'Delivery Optimizer',
  service: 'COMET',
  trigger: 'new_delivery',
  action: 'optimize_route'
});

// Agent earns +40 AHOY per task`}</pre>
                                </div>
                            </div>
                        </div>

                        <div className="glass-card p-4 rounded-xl border border-white/5">
                            <h3 className="font-bold text-white mb-3">SDK Features</h3>
                            <ul className="space-y-2 text-sm text-gray-400">
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    Cross-service queries
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    AI Agent deployment
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    Local-first architecture
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    AHOY token integration
                                </li>
                                <li className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    Tree-of-Thought reasoning
                                </li>
                            </ul>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
