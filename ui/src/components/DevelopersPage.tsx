import React, { useState } from 'react';
import {
    Code, Key, Webhook, FileText, Terminal, Copy, Eye, EyeOff,
    Plus, Trash2, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle,
    ExternalLink, Download, Filter, ChevronRight, Shield, Zap, Globe, Boxes
} from 'lucide-react';
import { HostedComponentsDemo } from './HostedComponents';

// Types based on StripeSDKPlan Section 3I and 7A
type ApiKeyType = 'secret' | 'publishable' | 'restricted';
type WebhookStatus = 'active' | 'disabled' | 'failing';
type LogLevel = 'info' | 'warning' | 'error' | 'success';

interface ApiKey {
    id: string;
    name: string;
    type: ApiKeyType;
    key: string;
    lastUsed: string;
    created: string;
    permissions?: string[];
}

interface WebhookEndpoint {
    id: string;
    url: string;
    status: WebhookStatus;
    events: string[];
    successRate: number;
    lastTriggered: string;
    created: string;
}

interface ApiLog {
    id: string;
    timestamp: string;
    method: string;
    endpoint: string;
    statusCode: number;
    duration: string;
    level: LogLevel;
    requestId: string;
}

// Sample data
const SAMPLE_API_KEYS: ApiKey[] = [
    {
        id: 'key_001',
        name: 'Production Secret Key',
        type: 'secret',
        key: 'sk_live_ahoy_xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        lastUsed: '2025-01-08T09:45:00Z',
        created: '2024-06-15T00:00:00Z'
    },
    {
        id: 'key_002',
        name: 'Production Publishable Key',
        type: 'publishable',
        key: 'pk_live_ahoy_yyyyyyyyyyyyyyyyyyyyyyyyyyyy',
        lastUsed: '2025-01-08T10:30:00Z',
        created: '2024-06-15T00:00:00Z'
    },
    {
        id: 'key_003',
        name: 'Mobile App Key',
        type: 'restricted',
        key: 'rk_live_ahoy_zzzzzzzzzzzzzzzzzzzzzzzzzzzz',
        lastUsed: '2025-01-07T14:20:00Z',
        created: '2024-09-20T00:00:00Z',
        permissions: ['assets:read', 'identities:read', 'transactions:read']
    }
];

const SAMPLE_WEBHOOKS: WebhookEndpoint[] = [
    {
        id: 'wh_001',
        url: 'https://api.myapp.com/webhooks/ahoy',
        status: 'active',
        events: ['asset.created', 'asset.transferred', 'identity.verified'],
        successRate: 99.8,
        lastTriggered: '2025-01-08T10:25:00Z',
        created: '2024-07-01T00:00:00Z'
    },
    {
        id: 'wh_002',
        url: 'https://compliance.internal/hooks/ahoy',
        status: 'active',
        events: ['identity.verified', 'identity.revoked', 'policy.violated'],
        successRate: 100,
        lastTriggered: '2025-01-08T08:15:00Z',
        created: '2024-08-15T00:00:00Z'
    },
    {
        id: 'wh_003',
        url: 'https://old-system.example.com/webhook',
        status: 'failing',
        events: ['asset.created'],
        successRate: 45.2,
        lastTriggered: '2025-01-07T23:00:00Z',
        created: '2024-05-01T00:00:00Z'
    }
];

const SAMPLE_LOGS: ApiLog[] = [
    {
        id: 'log_001',
        timestamp: '2025-01-08T10:32:45Z',
        method: 'POST',
        endpoint: '/v1/assets',
        statusCode: 201,
        duration: '245ms',
        level: 'success',
        requestId: 'req_abc123'
    },
    {
        id: 'log_002',
        timestamp: '2025-01-08T10:31:22Z',
        method: 'GET',
        endpoint: '/v1/identities/id_789',
        statusCode: 200,
        duration: '89ms',
        level: 'info',
        requestId: 'req_def456'
    },
    {
        id: 'log_003',
        timestamp: '2025-01-08T10:30:15Z',
        method: 'POST',
        endpoint: '/v1/transfers',
        statusCode: 400,
        duration: '156ms',
        level: 'error',
        requestId: 'req_ghi789'
    },
    {
        id: 'log_004',
        timestamp: '2025-01-08T10:29:00Z',
        method: 'POST',
        endpoint: '/v1/policies/validate',
        statusCode: 200,
        duration: '312ms',
        level: 'warning',
        requestId: 'req_jkl012'
    },
    {
        id: 'log_005',
        timestamp: '2025-01-08T10:28:30Z',
        method: 'GET',
        endpoint: '/v1/assets',
        statusCode: 200,
        duration: '178ms',
        level: 'info',
        requestId: 'req_mno345'
    }
];

const WEBHOOK_EVENTS = [
    'asset.created', 'asset.updated', 'asset.transferred', 'asset.frozen', 'asset.retired',
    'identity.created', 'identity.verified', 'identity.revoked', 'identity.expired',
    'policy.created', 'policy.violated', 'policy.updated',
    'distribution.scheduled', 'distribution.completed', 'distribution.failed',
    'oracle.updated', 'oracle.stale'
];

const KEY_TYPE_CONFIG: Record<ApiKeyType, { label: string; color: string; description: string }> = {
    secret: {
        label: 'Secret',
        color: 'text-red-400 bg-red-400/10',
        description: 'Full API access - keep secure'
    },
    publishable: {
        label: 'Publishable',
        color: 'text-green-400 bg-green-400/10',
        description: 'Safe for client-side use'
    },
    restricted: {
        label: 'Restricted',
        color: 'text-blue-400 bg-blue-400/10',
        description: 'Limited permissions'
    }
};

export function DevelopersPage() {
    const [activeTab, setActiveTab] = useState<'keys' | 'webhooks' | 'logs' | 'components'>('keys');
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const toggleKeyVisibility = (keyId: string) => {
        const newVisible = new Set(visibleKeys);
        if (newVisible.has(keyId)) {
            newVisible.delete(keyId);
        } else {
            newVisible.add(keyId);
        }
        setVisibleKeys(newVisible);
    };

    const copyToClipboard = (text: string, keyId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(keyId);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const maskKey = (key: string) => {
        return key.substring(0, 12) + '••••••••••••••••••••••••';
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-[#F8B032]/10 rounded-lg">
                            <Code className="w-6 h-6 text-[#F8B032]" />
                        </div>
                        Developers
                    </h1>
                    <p className="text-gray-400 mt-1">API keys, webhooks, and integration tools</p>
                </div>
                <a
                    href="#"
                    className="flex items-center gap-2 text-[#F8B032] hover:text-[#E8A633] transition-colors"
                >
                    <FileText className="w-4 h-4" />
                    API Documentation
                    <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-4 gap-4">
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">API Requests (24h)</span>
                        <Zap className="w-4 h-4 text-[#F8B032]" />
                    </div>
                    <p className="text-2xl font-bold text-white">124.5K</p>
                    <p className="text-xs text-green-400 mt-1">+12% from yesterday</p>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Success Rate</span>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">99.7%</p>
                    <p className="text-xs text-gray-500 mt-1">Last 7 days</p>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Avg Latency</span>
                        <Clock className="w-4 h-4 text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">142ms</p>
                    <p className="text-xs text-gray-500 mt-1">P95: 312ms</p>
                </div>
                <div className="glass-card p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Active Webhooks</span>
                        <Webhook className="w-4 h-4 text-purple-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">3</p>
                    <p className="text-xs text-yellow-400 mt-1">1 failing</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('keys')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                        activeTab === 'keys'
                            ? 'bg-[#F8B032] text-black font-medium'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Key className="w-4 h-4" />
                    API Keys
                </button>
                <button
                    onClick={() => setActiveTab('webhooks')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                        activeTab === 'webhooks'
                            ? 'bg-[#F8B032] text-black font-medium'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Webhook className="w-4 h-4" />
                    Webhooks
                </button>
                <button
                    onClick={() => setActiveTab('logs')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                        activeTab === 'logs'
                            ? 'bg-[#F8B032] text-black font-medium'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Terminal className="w-4 h-4" />
                    Logs
                </button>
                <button
                    onClick={() => setActiveTab('components')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
                        activeTab === 'components'
                            ? 'bg-[#F8B032] text-black font-medium'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Boxes className="w-4 h-4" />
                    Components
                </button>
            </div>

            {/* API Keys Tab */}
            {activeTab === 'keys' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-gray-400 text-sm">
                            Manage your API keys for authentication. Keep secret keys secure.
                        </p>
                        <button className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Create New Key
                        </button>
                    </div>

                    <div className="glass-card divide-y divide-white/5">
                        {SAMPLE_API_KEYS.map((apiKey) => {
                            const typeConfig = KEY_TYPE_CONFIG[apiKey.type];
                            const isVisible = visibleKeys.has(apiKey.id);

                            return (
                                <div key={apiKey.id} className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${typeConfig.color.split(' ')[1]}`}>
                                                <Key className={`w-4 h-4 ${typeConfig.color.split(' ')[0]}`} />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-medium text-white">{apiKey.name}</h3>
                                                    <span className={`px-2 py-0.5 rounded text-xs ${typeConfig.color}`}>
                                                        {typeConfig.label}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500">{typeConfig.description}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => toggleKeyVisibility(apiKey.id)}
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                {isVisible ? (
                                                    <EyeOff className="w-4 h-4 text-gray-400" />
                                                ) : (
                                                    <Eye className="w-4 h-4 text-gray-400" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(apiKey.key, apiKey.id)}
                                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            >
                                                {copiedKey === apiKey.id ? (
                                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                                ) : (
                                                    <Copy className="w-4 h-4 text-gray-400" />
                                                )}
                                            </button>
                                            <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                                <RefreshCw className="w-4 h-4 text-gray-400" />
                                            </button>
                                            <button className="p-2 hover:bg-red-500/10 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <code className="flex-1 px-3 py-2 bg-black/30 rounded-lg font-mono text-sm text-gray-300">
                                            {isVisible ? apiKey.key : maskKey(apiKey.key)}
                                        </code>
                                    </div>
                                    <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
                                        <span>Created: {formatDate(apiKey.created)}</span>
                                        <span>Last used: {formatDate(apiKey.lastUsed)}</span>
                                        {apiKey.permissions && (
                                            <span className="flex items-center gap-1">
                                                <Shield className="w-3 h-3" />
                                                {apiKey.permissions.length} permissions
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Webhooks Tab */}
            {activeTab === 'webhooks' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-gray-400 text-sm">
                            Configure webhook endpoints to receive real-time event notifications.
                        </p>
                        <button className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all flex items-center gap-2">
                            <Plus className="w-4 h-4" />
                            Add Endpoint
                        </button>
                    </div>

                    <div className="glass-card divide-y divide-white/5">
                        {SAMPLE_WEBHOOKS.map((webhook) => (
                            <div key={webhook.id} className="p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${
                                            webhook.status === 'active'
                                                ? 'bg-green-400/10'
                                                : webhook.status === 'failing'
                                                ? 'bg-red-400/10'
                                                : 'bg-gray-400/10'
                                        }`}>
                                            <Globe className={`w-4 h-4 ${
                                                webhook.status === 'active'
                                                    ? 'text-green-400'
                                                    : webhook.status === 'failing'
                                                    ? 'text-red-400'
                                                    : 'text-gray-400'
                                            }`} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <code className="font-mono text-sm text-white">{webhook.url}</code>
                                                <span className={`px-2 py-0.5 rounded text-xs ${
                                                    webhook.status === 'active'
                                                        ? 'text-green-400 bg-green-400/10'
                                                        : webhook.status === 'failing'
                                                        ? 'text-red-400 bg-red-400/10'
                                                        : 'text-gray-400 bg-gray-400/10'
                                                }`}>
                                                    {webhook.status === 'active' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                                                    {webhook.status === 'failing' && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                                    {webhook.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                                <span>Success rate: <span className={webhook.successRate > 95 ? 'text-green-400' : 'text-red-400'}>{webhook.successRate}%</span></span>
                                                <span>Last triggered: {formatDate(webhook.lastTriggered)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors">
                                            Test
                                        </button>
                                        <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {webhook.events.map((event) => (
                                        <span
                                            key={event}
                                            className="px-2 py-1 bg-white/5 rounded text-xs font-mono text-gray-400"
                                        >
                                            {event}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Available Events Reference */}
                    <div className="glass-card p-4">
                        <h3 className="font-medium text-white mb-3">Available Events</h3>
                        <div className="flex flex-wrap gap-2">
                            {WEBHOOK_EVENTS.map((event) => (
                                <span
                                    key={event}
                                    className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono text-gray-400 hover:border-[#F8B032]/30 hover:text-[#F8B032] cursor-pointer transition-colors"
                                >
                                    {event}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-400">Filter:</span>
                            </div>
                            <select className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50">
                                <option value="all">All Methods</option>
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                            </select>
                            <select className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 focus:outline-none focus:border-[#F8B032]/50">
                                <option value="all">All Status</option>
                                <option value="2xx">2xx Success</option>
                                <option value="4xx">4xx Client Error</option>
                                <option value="5xx">5xx Server Error</option>
                            </select>
                        </div>
                        <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-all flex items-center gap-2">
                            <Download className="w-4 h-4" />
                            Export Logs
                        </button>
                    </div>

                    <div className="glass-card overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Endpoint</th>
                                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                                    <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Request ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {SAMPLE_LOGS.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/5 cursor-pointer transition-colors">
                                        <td className="p-4 text-sm text-gray-400 font-mono">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-mono font-medium ${
                                                log.method === 'GET'
                                                    ? 'bg-blue-400/10 text-blue-400'
                                                    : log.method === 'POST'
                                                    ? 'bg-green-400/10 text-green-400'
                                                    : log.method === 'PUT'
                                                    ? 'bg-yellow-400/10 text-yellow-400'
                                                    : 'bg-red-400/10 text-red-400'
                                            }`}>
                                                {log.method}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm font-mono text-white">{log.endpoint}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-mono ${
                                                log.statusCode >= 200 && log.statusCode < 300
                                                    ? 'bg-green-400/10 text-green-400'
                                                    : log.statusCode >= 400 && log.statusCode < 500
                                                    ? 'bg-yellow-400/10 text-yellow-400'
                                                    : 'bg-red-400/10 text-red-400'
                                            }`}>
                                                {log.statusCode}
                                            </span>
                                        </td>
                                        <td className="p-4 text-sm text-gray-400">{log.duration}</td>
                                        <td className="p-4 text-sm font-mono text-gray-500">{log.requestId}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-center gap-2">
                        <button className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:bg-white/10 transition-colors">
                            Load More
                        </button>
                    </div>
                </div>
            )}

            {/* Components Tab */}
            {activeTab === 'components' && (
                <HostedComponentsDemo />
            )}
        </div>
    );
}
