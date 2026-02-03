import { useState, useEffect } from 'react';
import {
    Key, Copy, Eye, EyeOff, Plus, Trash2, RefreshCw, CheckCircle, Shield, X, AlertTriangle
} from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';

type ApiKeyType = 'secret' | 'publishable' | 'restricted';

interface ApiKey {
    id: string;
    name: string;
    type: ApiKeyType;
    key: string;
    lastUsed: string;
    created: string;
    permissions?: string[];
}

const STORAGE_KEY = 'tokenisation_api_keys';

const AVAILABLE_PERMISSIONS = [
    'assets:read', 'assets:write', 'assets:delete',
    'identities:read', 'identities:write', 'identities:delete',
    'transactions:read', 'transactions:write',
    'policies:read', 'policies:write',
    'webhooks:read', 'webhooks:write',
    'oracles:read', 'distributions:read', 'distributions:write'
];

const DEFAULT_API_KEYS: ApiKey[] = [
    {
        id: 'key_001',
        name: 'Production Secret Key',
        type: 'secret',
        key: 'sk_live_ahoy_' + generateRandomKey(),
        lastUsed: new Date().toISOString(),
        created: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: 'key_002',
        name: 'Production Publishable Key',
        type: 'publishable',
        key: 'pk_live_ahoy_' + generateRandomKey(),
        lastUsed: new Date().toISOString(),
        created: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    }
];

function generateRandomKey(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function generateKeyId(): string {
    return 'key_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const KEY_TYPE_CONFIG: Record<ApiKeyType, { label: string; color: string; description: string; prefix: string }> = {
    secret: {
        label: 'Secret',
        color: 'text-red-400 bg-red-400/10',
        description: 'Full API access - keep secure',
        prefix: 'sk_live_ahoy_'
    },
    publishable: {
        label: 'Publishable',
        color: 'text-green-400 bg-green-400/10',
        description: 'Safe for client-side use',
        prefix: 'pk_live_ahoy_'
    },
    restricted: {
        label: 'Restricted',
        color: 'text-blue-400 bg-blue-400/10',
        description: 'Limited permissions',
        prefix: 'rk_live_ahoy_'
    }
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
    return key.substring(0, 16) + '••••••••••••••••••••';
};

export function ApiKeysPage() {
    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
    const [showRotateModal, setShowRotateModal] = useState<string | null>(null);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyType, setNewKeyType] = useState<ApiKeyType>('restricted');
    const [newKeyPermissions, setNewKeyPermissions] = useState<string[]>([]);
    const [newlyCreatedKey, setNewlyCreatedKey] = useState<ApiKey | null>(null);

    // Load from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setApiKeys(JSON.parse(stored));
        } else {
            setApiKeys(DEFAULT_API_KEYS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_API_KEYS));
        }
    }, []);

    // Save to localStorage on change
    useEffect(() => {
        if (apiKeys.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(apiKeys));
        }
    }, [apiKeys]);

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

    const createApiKey = () => {
        if (!newKeyName.trim()) return;

        const config = KEY_TYPE_CONFIG[newKeyType];
        const newKey: ApiKey = {
            id: generateKeyId(),
            name: newKeyName.trim(),
            type: newKeyType,
            key: config.prefix + generateRandomKey(),
            lastUsed: 'Never',
            created: new Date().toISOString(),
            permissions: newKeyType === 'restricted' ? newKeyPermissions : undefined
        };

        setApiKeys(prev => [...prev, newKey]);
        setNewlyCreatedKey(newKey);
        setNewKeyName('');
        setNewKeyType('restricted');
        setNewKeyPermissions([]);
        setShowCreateModal(false);
    };

    const rotateKey = (keyId: string) => {
        setApiKeys(prev => prev.map(key => {
            if (key.id === keyId) {
                const config = KEY_TYPE_CONFIG[key.type];
                return {
                    ...key,
                    key: config.prefix + generateRandomKey(),
                    created: new Date().toISOString()
                };
            }
            return key;
        }));
        setShowRotateModal(null);
    };

    const deleteKey = (keyId: string) => {
        setApiKeys(prev => prev.filter(key => key.id !== keyId));
        setShowDeleteModal(null);
    };

    const togglePermission = (permission: string) => {
        setNewKeyPermissions(prev =>
            prev.includes(permission)
                ? prev.filter(p => p !== permission)
                : [...prev, permission]
        );
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Integrate', path: '/integrate' },
                { label: 'API Keys' }
            ]} />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-[#F8B032]/10 rounded-lg">
                            <Key className="w-6 h-6 text-[#F8B032]" />
                        </div>
                        API Keys
                    </h1>
                    <p className="text-gray-400 mt-1">Manage your API keys for authentication. Keep secret keys secure.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Create New Key
                </button>
            </div>

            {/* Newly Created Key Alert */}
            {newlyCreatedKey && (
                <div className="glass-card p-4 border border-green-500/30 bg-green-500/5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                            <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                            <div>
                                <h3 className="font-medium text-white">API Key Created Successfully</h3>
                                <p className="text-sm text-gray-400 mt-1">
                                    Make sure to copy your new API key now. You won't be able to see the full key again.
                                </p>
                                <div className="flex items-center gap-2 mt-3">
                                    <code className="px-3 py-2 bg-black/30 rounded-lg font-mono text-sm text-green-400 flex-1">
                                        {newlyCreatedKey.key}
                                    </code>
                                    <button
                                        onClick={() => {
                                            copyToClipboard(newlyCreatedKey.key, 'new');
                                        }}
                                        className="px-3 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-2"
                                    >
                                        {copiedKey === 'new' ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                        {copiedKey === 'new' ? 'Copied!' : 'Copy'}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setNewlyCreatedKey(null)}
                            className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>
                </div>
            )}

            {/* API Keys List */}
            <div className="glass-card divide-y divide-white/5">
                {apiKeys.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        <Key className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>No API keys yet. Create your first key to get started.</p>
                    </div>
                ) : (
                    apiKeys.map((apiKey) => {
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
                                            title={isVisible ? 'Hide key' : 'Show key'}
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
                                            title="Copy key"
                                        >
                                            {copiedKey === apiKey.id ? (
                                                <CheckCircle className="w-4 h-4 text-green-400" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-gray-400" />
                                            )}
                                        </button>
                                        <button
                                            onClick={() => setShowRotateModal(apiKey.id)}
                                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                            title="Rotate key"
                                        >
                                            <RefreshCw className="w-4 h-4 text-gray-400" />
                                        </button>
                                        <button
                                            onClick={() => setShowDeleteModal(apiKey.id)}
                                            className="p-2 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Delete key"
                                        >
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
                                    <span>Last used: {apiKey.lastUsed === 'Never' ? 'Never' : formatDate(apiKey.lastUsed)}</span>
                                    {apiKey.permissions && (
                                        <span className="flex items-center gap-1">
                                            <Shield className="w-3 h-3" />
                                            {apiKey.permissions.length} permissions
                                        </span>
                                    )}
                                </div>
                                {apiKey.permissions && apiKey.permissions.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {apiKey.permissions.map(perm => (
                                            <span key={perm} className="px-2 py-0.5 bg-blue-400/10 text-blue-400 text-xs rounded font-mono">
                                                {perm}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-lg mx-4 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-white">Create API Key</h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Key Name</label>
                                <input
                                    type="text"
                                    value={newKeyName}
                                    onChange={(e) => setNewKeyName(e.target.value)}
                                    placeholder="e.g., Production Backend Key"
                                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#F8B032]/50"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Key Type</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(Object.keys(KEY_TYPE_CONFIG) as ApiKeyType[]).map((type) => {
                                        const config = KEY_TYPE_CONFIG[type];
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => setNewKeyType(type)}
                                                className={`p-3 rounded-lg border text-left transition-all ${
                                                    newKeyType === type
                                                        ? 'border-[#F8B032] bg-[#F8B032]/10'
                                                        : 'border-white/10 hover:border-white/20'
                                                }`}
                                            >
                                                <span className={`text-sm font-medium ${config.color.split(' ')[0]}`}>
                                                    {config.label}
                                                </span>
                                                <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {newKeyType === 'restricted' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">Permissions</label>
                                    <div className="flex flex-wrap gap-2 p-3 bg-white/5 rounded-lg border border-white/10 max-h-40 overflow-y-auto">
                                        {AVAILABLE_PERMISSIONS.map((perm) => (
                                            <button
                                                key={perm}
                                                onClick={() => togglePermission(perm)}
                                                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                                                    newKeyPermissions.includes(perm)
                                                        ? 'bg-blue-400/20 text-blue-400 border border-blue-400/30'
                                                        : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'
                                                }`}
                                            >
                                                {perm}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        {newKeyPermissions.length} permissions selected
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createApiKey}
                                disabled={!newKeyName.trim() || (newKeyType === 'restricted' && newKeyPermissions.length === 0)}
                                className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Create Key
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
                            <h2 className="text-xl font-bold text-white">Delete API Key</h2>
                        </div>
                        <p className="text-gray-400 mb-6">
                            Are you sure you want to delete this API key? This action cannot be undone and any
                            applications using this key will immediately lose access.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteModal(null)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => deleteKey(showDeleteModal)}
                                className="px-4 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors"
                            >
                                Delete Key
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rotate Confirmation Modal */}
            {showRotateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="glass-card w-full max-w-md mx-4 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-yellow-400/10 rounded-lg">
                                <RefreshCw className="w-6 h-6 text-yellow-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white">Rotate API Key</h2>
                        </div>
                        <p className="text-gray-400 mb-6">
                            Rotating this key will generate a new key and immediately invalidate the old one.
                            Make sure to update your applications with the new key.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowRotateModal(null)}
                                className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => rotateKey(showRotateModal)}
                                className="px-4 py-2 bg-yellow-500 text-black font-medium rounded-lg hover:bg-yellow-400 transition-colors"
                            >
                                Rotate Key
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
