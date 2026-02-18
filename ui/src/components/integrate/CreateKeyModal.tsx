import { useState } from 'react';
import { X, Key } from 'lucide-react';

interface CreateKeyModalProps {
    open: boolean;
    onClose: () => void;
    onCreate?: (key: { name: string; type: string; environment: string; permissions: string[] }) => void;
}

const PERMISSIONS = [
    { id: 'assets:read', label: 'Assets (Read)' },
    { id: 'assets:write', label: 'Assets (Write)' },
    { id: 'identities:read', label: 'Identities (Read)' },
    { id: 'identities:write', label: 'Identities (Write)' },
    { id: 'tokens:read', label: 'Tokens (Read)' },
    { id: 'tokens:write', label: 'Tokens (Write)' },
    { id: 'transactions:read', label: 'Transactions (Read)' },
    { id: 'compliance:read', label: 'Compliance (Read)' },
    { id: 'compliance:write', label: 'Compliance (Write)' },
    { id: 'webhooks:manage', label: 'Webhooks (Manage)' },
];

export function CreateKeyModal({ open, onClose, onCreate }: CreateKeyModalProps) {
    const [name, setName] = useState('');
    const [type, setType] = useState<'secret' | 'publishable' | 'restricted'>('publishable');
    const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
    const [permissions, setPermissions] = useState<Set<string>>(new Set());

    const togglePermission = (id: string) => {
        const next = new Set(permissions);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setPermissions(next);
    };

    const handleCreate = () => {
        onCreate?.({ name, type, environment, permissions: Array.from(permissions) });
        onClose();
        setName('');
        setType('publishable');
        setPermissions(new Set());
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="glass-card w-full max-w-lg p-6 border border-white/10 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Key className="w-5 h-5 text-[#F8B032]" />
                        Create API Key
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Key Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Production Backend"
                            className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#F8B032]/50"
                        />
                    </div>

                    {/* Type */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Key Type</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['secret', 'publishable', 'restricted'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setType(t)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                                        type === t
                                            ? 'border-[#F8B032]/50 bg-[#F8B032]/10 text-[#F8B032]'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Environment */}
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Environment</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['sandbox', 'production'] as const).map((env) => (
                                <button
                                    key={env}
                                    onClick={() => setEnvironment(env)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                                        environment === env
                                            ? 'border-[#F8B032]/50 bg-[#F8B032]/10 text-[#F8B032]'
                                            : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'
                                    }`}
                                >
                                    {env}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Permissions (only for restricted) */}
                    {type === 'restricted' && (
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Permissions</label>
                            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                                {PERMISSIONS.map((perm) => (
                                    <label key={perm.id} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={permissions.has(perm.id)}
                                            onChange={() => togglePermission(perm.id)}
                                            className="rounded border-white/20 bg-white/5 text-[#F8B032] focus:ring-[#F8B032]"
                                        />
                                        <span className="text-xs text-gray-300">{perm.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/10">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={!name.trim()}
                        className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all disabled:opacity-50"
                    >
                        Create Key
                    </button>
                </div>
            </div>
        </div>
    );
}
