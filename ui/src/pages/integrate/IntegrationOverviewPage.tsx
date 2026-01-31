import { Link } from 'react-router-dom';
import {
    BarChart3, Zap, CheckCircle, Clock, Webhook,
    Key, Terminal, Shield, ArrowRight, ToggleLeft, ToggleRight,
    DollarSign, Globe, Play, Loader2
} from 'lucide-react';
import { useState } from 'react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { StatsRow, type StatCard } from '../../components/shared/StatsRow';
import { useSDKStore } from '../../core/store';

const STATS: StatCard[] = [
    {
        label: 'API Requests (24h)',
        value: '124.5K',
        change: '+12% from yesterday',
        changeColor: 'text-green-400',
        icon: Zap,
        iconColor: 'text-[#F8B032]',
    },
    {
        label: 'Success Rate',
        value: '99.7%',
        change: 'Last 7 days',
        changeColor: 'text-gray-500',
        icon: CheckCircle,
        iconColor: 'text-green-400',
    },
    {
        label: 'Avg Latency',
        value: '142ms',
        change: 'P95: 312ms',
        changeColor: 'text-gray-500',
        icon: Clock,
        iconColor: 'text-blue-400',
    },
    {
        label: 'Active Webhooks',
        value: '3',
        change: '1 failing',
        changeColor: 'text-yellow-400',
        icon: Webhook,
        iconColor: 'text-purple-400',
    },
];

const QUICK_ACTIONS = [
    { label: 'API Keys', description: 'Manage authentication keys', icon: Key, path: '/integrate/keys', color: 'text-[#F8B032]' },
    { label: 'Webhooks', description: 'Configure event endpoints', icon: Webhook, path: '/integrate/webhooks', color: 'text-purple-400' },
    { label: 'Logs & Monitoring', description: 'View API request logs', icon: Terminal, path: '/integrate/logs', color: 'text-blue-400' },
    { label: 'Partner Admin', description: 'Manage partner approvals', icon: Shield, path: '/integrate/partner', color: 'text-emerald-400' },
];

const RECENT_ACTIVITY = [
    { method: 'POST', endpoint: '/v1/assets', status: 201, time: '2 min ago' },
    { method: 'GET', endpoint: '/v1/identities/id_789', status: 200, time: '4 min ago' },
    { method: 'POST', endpoint: '/v1/transfers', status: 400, time: '5 min ago' },
    { method: 'POST', endpoint: '/v1/policies/validate', status: 200, time: '6 min ago' },
    { method: 'GET', endpoint: '/v1/assets', status: 200, time: '7 min ago' },
];

const PAYMENT_FLOW_STEPS = [
    { label: 'Discover', description: 'Agent fetches /.well-known/x402-manifest.json' },
    { label: 'Call', description: 'Agent calls API endpoint' },
    { label: '402', description: 'Server returns 402 Payment Required' },
    { label: 'Pay', description: 'Agent sends USDC payment' },
    { label: 'Retry', description: 'Agent retries with payment proof' },
    { label: 'Success', description: 'Server returns 200 OK' },
];

export function IntegrationOverviewPage() {
    const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
    const [simulatingAgent, setSimulatingAgent] = useState(false);
    const [agentStep, setAgentStep] = useState(-1);
    const store = useSDKStore();
    const manifest = store.getX402Manifest();

    const simulateAgentCall = () => {
        setSimulatingAgent(true);
        setAgentStep(0);
        const interval = setInterval(() => {
            setAgentStep(prev => {
                if (prev >= PAYMENT_FLOW_STEPS.length - 1) {
                    clearInterval(interval);
                    setTimeout(() => { setSimulatingAgent(false); setAgentStep(-1); }, 2000);
                    return prev;
                }
                return prev + 1;
            });
        }, 800);
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Integrate' }
            ]} />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-[#F8B032]/10 rounded-lg">
                            <BarChart3 className="w-6 h-6 text-[#F8B032]" />
                        </div>
                        Integration Overview
                    </h1>
                    <p className="text-gray-400 mt-1">Monitor your integration health and manage configuration.</p>
                </div>
            </div>

            {/* Stats Row */}
            <StatsRow stats={STATS} />

            {/* Environment Switcher */}
            <div className="glass-card p-4 flex items-center justify-between">
                <div>
                    <h3 className="font-medium text-white">Environment</h3>
                    <p className="text-sm text-gray-400 mt-0.5">
                        {environment === 'sandbox'
                            ? 'Sandbox mode — test data only, no real transactions.'
                            : 'Production mode — live transactions and real assets.'}
                    </p>
                </div>
                <button
                    onClick={() => setEnvironment(environment === 'sandbox' ? 'production' : 'sandbox')}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                >
                    {environment === 'sandbox' ? (
                        <>
                            <ToggleLeft className="w-6 h-6 text-yellow-400" />
                            <span className="text-sm font-medium text-yellow-400">Sandbox</span>
                        </>
                    ) : (
                        <>
                            <ToggleRight className="w-6 h-6 text-green-400" />
                            <span className="text-sm font-medium text-green-400">Production</span>
                        </>
                    )}
                </button>
            </div>

            {/* x402 Agent Payments Section */}
            <div className="glass-card rounded-xl border border-[#F8B032]/20 overflow-hidden">
                <div className="p-5 border-b border-white/5 flex items-center gap-3">
                    <div className="p-2 bg-[#F8B032]/10 rounded-lg">
                        <DollarSign className="w-5 h-5 text-[#F8B032]" />
                    </div>
                    <div>
                        <h3 className="font-medium text-white">x402 Agent Payments</h3>
                        <p className="text-xs text-gray-400">HTTP 402-based micropayments for AI agent SDK access</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
                        <Globe className="w-3 h-3" />
                        <span className="font-mono">/.well-known/x402-manifest.json</span>
                    </div>
                </div>

                {/* Payment Flow Diagram */}
                <div className="p-5 border-b border-white/5">
                    <p className="text-xs text-gray-500 mb-3 font-medium">Payment Flow</p>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2">
                        {PAYMENT_FLOW_STEPS.map((step, i) => (
                            <div key={step.label} className="flex items-center gap-2 shrink-0">
                                {i > 0 && <ArrowRight className="w-3 h-3 text-gray-600" />}
                                <div className={`px-3 py-2 rounded-lg border transition-all ${
                                    agentStep === i
                                        ? 'bg-[#F8B032]/10 border-[#F8B032]/30 text-[#F8B032]'
                                        : agentStep > i
                                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                                        : 'bg-white/5 border-white/10 text-gray-400'
                                }`}>
                                    <p className="text-xs font-bold">{step.label}</p>
                                    <p className="text-[9px] opacity-70">{step.description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={simulateAgentCall}
                        disabled={simulatingAgent}
                        className="mt-3 px-4 py-2 bg-[#F8B032]/10 text-[#F8B032] border border-[#F8B032]/20 rounded-lg text-xs font-medium hover:bg-[#F8B032]/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {simulatingAgent ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        Simulate Agent Call
                    </button>
                </div>

                {/* Manifest Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase">Endpoint</th>
                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase">Method</th>
                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase">Price</th>
                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase">Token</th>
                                <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase">Description</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {manifest.map((entry, i) => (
                                <tr key={i} className="hover:bg-white/5 transition-colors">
                                    <td className="px-5 py-3 text-sm font-mono text-white">{entry.endpoint}</td>
                                    <td className="px-5 py-3">
                                        <span className="px-2 py-0.5 bg-green-400/10 text-green-400 rounded text-[10px] font-mono">{entry.method}</span>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="text-sm font-mono text-[#F8B032] font-bold">{entry.price}</span>
                                    </td>
                                    <td className="px-5 py-3 text-sm text-gray-400">{entry.tokenSymbol}</td>
                                    <td className="px-5 py-3 text-xs text-gray-500">{entry.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-4 gap-4">
                {QUICK_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <Link
                            key={action.label}
                            to={action.path}
                            className="glass-card p-5 hover:border-white/20 transition-all group"
                        >
                            <Icon className={`w-6 h-6 ${action.color} mb-3`} />
                            <h3 className="font-medium text-white group-hover:text-[#F8B032] transition-colors">{action.label}</h3>
                            <p className="text-xs text-gray-500 mt-1">{action.description}</p>
                            <ArrowRight className="w-4 h-4 text-gray-600 mt-3 group-hover:text-[#F8B032] transition-colors" />
                        </Link>
                    );
                })}
            </div>

            {/* Recent Activity */}
            <div className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="font-medium text-white">Recent Activity</h3>
                    <Link to="/integrate/logs" className="text-sm text-[#F8B032] hover:text-[#E8A633] transition-colors flex items-center gap-1">
                        View all <ArrowRight className="w-3 h-3" />
                    </Link>
                </div>
                <table className="w-full">
                    <tbody className="divide-y divide-white/5">
                        {RECENT_ACTIVITY.map((item, index) => (
                            <tr key={index} className="hover:bg-white/5 transition-colors">
                                <td className="p-3 pl-4">
                                    <span className={`px-2 py-1 rounded text-xs font-mono font-medium ${
                                        item.method === 'GET'
                                            ? 'bg-blue-400/10 text-blue-400'
                                            : 'bg-green-400/10 text-green-400'
                                    }`}>
                                        {item.method}
                                    </span>
                                </td>
                                <td className="p-3 text-sm font-mono text-white">{item.endpoint}</td>
                                <td className="p-3">
                                    <span className={`px-2 py-1 rounded text-xs font-mono ${
                                        item.status >= 200 && item.status < 300
                                            ? 'bg-green-400/10 text-green-400'
                                            : 'bg-yellow-400/10 text-yellow-400'
                                    }`}>
                                        {item.status}
                                    </span>
                                </td>
                                <td className="p-3 pr-4 text-sm text-gray-500 text-right">{item.time}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
