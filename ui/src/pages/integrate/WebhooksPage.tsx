import { useState, useEffect } from 'react';
import {
    Webhook, Plus, CheckCircle, AlertTriangle, Globe, X, Trash2, Edit3, Play,
    RefreshCw, Clock, ExternalLink, Copy
} from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';

type WebhookStatus = 'active' | 'disabled' | 'failing';

interface WebhookDelivery {
    id: string;
    timestamp: string;
    event: string;
    status: 'success' | 'failed';
    statusCode: number;
    duration: number;
}

interface WebhookEndpoint {
    id: string;
    url: string;
    status: WebhookStatus;
    events: string[];
    secret: string;
    successRate: number;
    lastTriggered: string | null;
    created: string;
    recentDeliveries: WebhookDelivery[];
}

const STORAGE_KEY = 'tokenisation_webhooks';

const WEBHOOK_EVENTS = {
    'Asset Events': [
        'asset.created', 'asset.updated', 'asset.transferred', 'asset.frozen',
        'asset.unfrozen', 'asset.burned', 'asset.retired'
    ],
    'Identity Events': [
        'identity.created', 'identity.verified', 'identity.revoked',
        'identity.expired', 'identity.updated'
    ],
    'Policy Events': [
        'policy.created', 'policy.updated', 'policy.violated', 'policy.deleted'
    ],
    'Distribution Events': [
        'distribution.scheduled', 'distribution.processing',
        'distribution.completed', 'distribution.failed'
    ],
    'Transfer Events': [
        'transfer.initiated', 'transfer.approved', 'transfer.completed',
        'transfer.failed', 'transfer.cancelled'
    ],
    'Oracle Events': [
        'oracle.updated', 'oracle.stale', 'oracle.recovered'
    ]
};

const ALL_EVENTS = Object.values(WEBHOOK_EVENTS).flat();

function generateWebhookId(): string {
    return 'wh_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function generateWebhookSecret(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return 'whsec_' + Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const DEFAULT_WEBHOOKS: WebhookEndpoint[] = [
    {
        id: 'wh_001',
        url: 'https://api.myapp.com/webhooks/tokenisation',
        status: 'active',
        events: ['asset.created', 'asset.transferred', 'identity.verified'],
        secret: generateWebhookSecret(),
        successRate: 99.8,
        lastTriggered: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        created: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        recentDeliveries: [
            { id: 'd1', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), event: 'asset.transferred', status: 'success', statusCode: 200, duration: 145 },
            { id: 'd2', timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), event: 'identity.verified', status: 'success', statusCode: 200, duration: 89 },
            { id: 'd3', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(), event: 'asset.created', status: 'success', statusCode: 200, duration: 203 },
        ]
    }
];

const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export function WebhooksPage() {
    const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
    const [showDetailModal, setShowDetailModal] = useState<string | null>(null);
    const [editingWebhook, setEditingWebhook] = useState<WebhookEndpoint | null>(null);
    const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

    // Form state
    const [newUrl, setNewUrl] = useState('');
    const [newEvents, setNewEvents] = useState<string[]>([]);
    const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

    // Load from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setWebhooks(JSON.parse(stored));
        } else {
            setWebhooks(DEFAULT_WEBHOOKS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WEBHOOKS));
        }
    }, []);

    // Save to localStorage
    useEffect(() => {
        if (webhooks.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(webhooks));
        }
    }, [webhooks]);

    const createWebhook = () => {
        if (!newUrl.trim() || newEvents.length === 0) return;

        const newWebhook: WebhookEndpoint = {
            id: generateWebhookId(),
            url: newUrl.trim(),
            status: 'active',
            events: newEvents,
            secret: generateWebhookSecret(),
            successRate: 100,
            lastTriggered: null,
            created: new Date().toISOString(),
            recentDeliveries: []
        };

        setWebhooks(prev => [...prev, newWebhook]);
        setNewUrl('');
        setNewEvents([]);
        setShowCreateModal(false);
    };

    const updateWebhook = () => {
        if (!editingWebhook || !newUrl.trim() || newEvents.length === 0) return;

        setWebhooks(prev => prev.map(wh =>
            wh.id === editingWebhook.id
                ? { ...wh, url: newUrl.trim(), events: newEvents }
                : wh
        ));
        setEditingWebhook(null);
        setNewUrl('');
        setNewEvents([]);
    };

    const deleteWebhook = (id: string) => {
        setWebhooks(prev => prev.filter(wh => wh.id !== id));
        setShowDeleteModal(null);
    };

    const toggleWebhookStatus = (id: string) => {
        setWebhooks(prev => prev.map(wh =>
            wh.id === id
                ? { ...wh, status: wh.status === 'disabled' ? 'active' : 'disabled' }
                : wh
        ));
    };

    const testWebhook = async (id: string) => {
        setTestingWebhook(id);
        setTestResult(null);

        // Simulate webhook test
        await new Promise(resolve => setTimeout(resolve, 1500));

        const webhook = webhooks.find(wh => wh.id === id);
        const success = Math.random() > 0.2; // 80% success rate for demo

        if (success && webhook) {
            // Add test delivery to history
            const testDelivery: WebhookDelivery = {
                id: 'd_' + Date.now(),
                timestamp: new Date().toISOString(),
                event: 'test.ping',
                status: 'success',
                statusCode: 200,
                duration: Math.floor(Math.random() * 200) + 50
            };

            setWebhooks(prev => prev.map(wh =>
                wh.id === id
                    ? {
                        ...wh,
                        lastTriggered: new Date().toISOString(),
                        recentDeliveries: [testDelivery, ...wh.recentDeliveries.slice(0, 9)]
                    }
                    : wh
            ));
        }

        setTestResult({
            id,
            success,
            message: success
                ? 'Test webhook delivered successfully (200 OK)'
                : 'Failed to deliver test webhook (Connection refused)'
        });
        setTestingWebhook(null);
    };

    const toggleEvent = (event: string) => {
        setNewEvents(prev =>
            prev.includes(event)
                ? prev.filter(e => e !== event)
                : [...prev, event]
        );
    };

    const selectAllEvents = () => {
        setNewEvents(ALL_EVENTS);
    };

    const clearAllEvents = () => {
        setNewEvents([]);
    };

    const copySecret = (secret: string, id: string) => {
        navigator.clipboard.writeText(secret);
        setCopiedSecret(id);
        setTimeout(() => setCopiedSecret(null), 2000);
    };

    const openEditModal = (webhook: WebhookEndpoint) => {
        setEditingWebhook(webhook);
        setNewUrl(webhook.url);
        setNewEvents(webhook.events);
    };

    const selectedWebhook = showDetailModal ? webhooks.find(wh => wh.id === showDetailModal) : null;

    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Integrate', path: '/integrate' },
                { label: 'Webhooks' }
            ]} />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-purple-400/10 rounded-lg">
                            <Webhook className="w-6 h-6 text-purple-400" />
                        </div>
                        Webhooks
                    </h1>
                    <p className="text-gray-400 mt-1">Configure webhook endpoints to receive real-time event notifications.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Add Endpoint
                </button>
            </div>

            {/* Test Result Alert */}
            {testResult && (
                <div className={`glass-card p-4 border ${testResult.success ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            {testResult.success ? (
                                <CheckCircle className="w-5 h-5 text-green-400" />
                            ) : (
                                <AlertTriangle className="w-5 h-5 text-red-400" />
                            )}
                            <span className={testResult.success ? 'text-green-400' : 'text-red-400'}>
                                {testResult.message}
                            </span>
                        </div>
                        <button
                            onClick={() => setTestResult(null)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </div>
            )}

            {/* Webhooks List */}
            <div className="glass-card divide-y divide-white/5">
                {webhooks.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Webhook className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No webhooks configured. Add your first endpoint to receive events.</p>
                    </div>
                ) : (
                    webhooks.map((webhook) => (
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
                                            <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                                                webhook.status === 'active'
                                                    ? 'text-green-400 bg-green-400/10'
                                                    : webhook.status === 'failing'
                                                    ? 'text-red-400 bg-red-400/10'
                                                    : 'text-gray-400 bg-gray-400/10'
                                            }`}>
                                                {webhook.status === 'active' && <CheckCircle className="w-3 h-3" />}
                                                {webhook.status === 'failing' && <AlertTriangle className="w-3 h-3" />}
                                                {webhook.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                            <span>
                                                Success rate:
                                                <span className={webhook.successRate > 95 ? 'text-green-400 ml-1' : 'text-red-400 ml-1'}>
                                                    {webhook.successRate}%
                                                </span>
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Last triggered: {formatRelativeTime(webhook.lastTriggered)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => testWebhook(webhook.id)}
                                        disabled={testingWebhook === webhook.id || webhook.status === 'disabled'}
                                        className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                    >
                                        {testingWebhook === webhook.id ? (
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Play className="w-3 h-3" />
                                        )}
                                        Test
                                    </button>
                                    <button
                                        onClick={() => toggleWebhookStatus(webhook.id)}
                                        className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                            webhook.status === 'disabled'
                                                ? 'bg-green-400/10 text-green-400 hover:bg-green-400/20'
                                                : 'bg-white/5 text-gray-300 hover:bg-white/10'
                                        }`}
                                    >
                                        {webhook.status === 'disabled' ? 'Enable' : 'Disable'}
                                    </button>
                                    <button
                                        onClick={() => openEditModal(webhook)}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                        title="Edit"
                                    >
                                        <Edit3 className="w-4 h-4 text-gray-400" />
                                    </button>
                                    <button
                                        onClick={() => setShowDetailModal(webhook.id)}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                        title="View details"
                                    >
                                        <ExternalLink className="w-4 h-4 text-gray-400" />
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteModal(webhook.id)}
                                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4 text-red-400" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {webhook.events.slice(0, 5).map((event) => (
                                    <span
                                        key={event}
                                        className="px-2 py-1 bg-white/5 rounded text-xs font-mono text-gray-400"
                                    >
                                        {event}
                                    </span>
                                ))}
                                {webhook.events.length > 5 && (
                                    <span className="px-2 py-1 bg-white/5 rounded text-xs text-gray-500">
                                        +{webhook.events.length - 5} more
                                    </span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Available Events Reference */}
            <div className="glass-card p-4">
                <h3 className="font-medium text-white mb-3">Available Events</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {Object.entries(WEBHOOK_EVENTS).map(([category, events]) => (
                        <div key={category}>
                            <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">{category}</h4>
                            <div className="flex flex-wrap gap-1">
                                {events.map((event) => (
                                    <span
                                        key={event}
                                        className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono text-gray-400"
                                    >
                                        {event}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || editingWebhook) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">
                                {editingWebhook ? 'Edit Webhook' : 'Add Webhook Endpoint'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingWebhook(null);
                                    setNewUrl('');
                                    setNewEvents([]);
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Endpoint URL</label>
                                <input
                                    type="url"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    placeholder="https://api.yourapp.com/webhooks"
                                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50 font-mono"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-300">Events to Subscribe</label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={selectAllEvents}
                                            className="text-xs text-[#F8B032] hover:underline"
                                        >
                                            Select All
                                        </button>
                                        <span className="text-gray-600">|</span>
                                        <button
                                            onClick={clearAllEvents}
                                            className="text-xs text-gray-400 hover:underline"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4 p-4 bg-white/5 rounded-lg border border-white/10 max-h-64 overflow-y-auto">
                                    {Object.entries(WEBHOOK_EVENTS).map(([category, events]) => (
                                        <div key={category}>
                                            <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-2">{category}</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {events.map((event) => (
                                                    <button
                                                        key={event}
                                                        onClick={() => toggleEvent(event)}
                                                        className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                                                            newEvents.includes(event)
                                                                ? 'bg-purple-400/20 text-purple-400 border border-purple-400/30'
                                                                : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
                                                        }`}
                                                    >
                                                        {event}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                    {newEvents.length} events selected
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingWebhook(null);
                                    setNewUrl('');
                                    setNewEvents([]);
                                }}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={editingWebhook ? updateWebhook : createWebhook}
                                disabled={!newUrl.trim() || newEvents.length === 0}
                                className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {editingWebhook ? 'Update Webhook' : 'Create Webhook'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {showDetailModal && selectedWebhook && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Webhook Details</h2>
                            <button
                                onClick={() => setShowDetailModal(null)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider">Endpoint URL</label>
                                <code className="block mt-1 px-3 py-2 bg-black/30 rounded-lg font-mono text-sm text-white">
                                    {selectedWebhook.url}
                                </code>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider">Signing Secret</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <code className="flex-1 px-3 py-2 bg-black/30 rounded-lg font-mono text-sm text-gray-400">
                                        {selectedWebhook.secret}
                                    </code>
                                    <button
                                        onClick={() => copySecret(selectedWebhook.secret, selectedWebhook.id)}
                                        className="px-3 py-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                                    >
                                        {copiedSecret === selectedWebhook.id ? (
                                            <CheckCircle className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <Copy className="w-4 h-4 text-gray-400" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Use this secret to verify webhook signatures
                                </p>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider">Subscribed Events ({selectedWebhook.events.length})</label>
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {selectedWebhook.events.map(event => (
                                        <span key={event} className="px-2 py-1 bg-purple-400/10 text-purple-400 text-xs rounded font-mono">
                                            {event}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-gray-500 uppercase tracking-wider">Recent Deliveries</label>
                                {selectedWebhook.recentDeliveries.length === 0 ? (
                                    <p className="text-sm text-gray-500 mt-2">No deliveries yet</p>
                                ) : (
                                    <div className="mt-2 space-y-2">
                                        {selectedWebhook.recentDeliveries.map(delivery => (
                                            <div key={delivery.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    {delivery.status === 'success' ? (
                                                        <CheckCircle className="w-4 h-4 text-green-400" />
                                                    ) : (
                                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                                    )}
                                                    <span className="text-xs font-mono text-gray-300">{delivery.event}</span>
                                                </div>
                                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                                    <span className={delivery.statusCode === 200 ? 'text-green-400' : 'text-red-400'}>
                                                        {delivery.statusCode}
                                                    </span>
                                                    <span>{delivery.duration}ms</span>
                                                    <span>{formatRelativeTime(delivery.timestamp)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                                <div>
                                    <label className="text-xs text-gray-500">Created</label>
                                    <p className="text-sm text-white">{formatDate(selectedWebhook.created)}</p>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500">Last Triggered</label>
                                    <p className="text-sm text-white">{formatDate(selectedWebhook.lastTriggered)}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setShowDetailModal(null)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-md mx-4 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-400/10 rounded-lg">
                                <AlertTriangle className="w-6 h-6 text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Delete Webhook</h2>
                        </div>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to delete this webhook endpoint? You will stop receiving
                            event notifications at this URL immediately.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteModal(null)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => deleteWebhook(showDeleteModal)}
                                className="px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Delete Webhook
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
