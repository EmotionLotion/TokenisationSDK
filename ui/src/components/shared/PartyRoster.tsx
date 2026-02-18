import { useState, useSyncExternalStore } from 'react';
import { Users, ShieldCheck, Plus, Globe, UserCheck, Loader2 } from 'lucide-react';
import { sdkStore } from '../../store';
import { PartyType, PartyRole } from '@tokenisation/sdk';

interface PartyRosterProps {
    accentColor?: string;
    filterRole?: string;
    onPartyCreated?: (partyId: string) => void;
}

export function PartyRoster({ accentColor = 'text-blue-400', filterRole, onPartyCreated }: PartyRosterProps) {
    const [showAdd, setShowAdd] = useState(false);
    const [name, setName] = useState('');
    const [role, setRole] = useState<string>('INVESTOR');
    const [jurisdiction, setJurisdiction] = useState('AE');
    const [loading, setLoading] = useState(false);

    const subscribe = (cb: () => void) => sdkStore.subscribe(cb);
    const getSnapshot = () => sdkStore.getVersion();
    useSyncExternalStore(subscribe, getSnapshot);

    const parties = sdkStore.getParties();
    const filtered = filterRole
        ? parties.filter(p => (p as any).roles?.includes(filterRole))
        : parties;

    const handleAddParty = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            const party = await sdkStore.createParty({
                name: name.trim(),
                type: PartyType.INDIVIDUAL,
                roles: [role as PartyRole],
                jurisdiction,
            });
            sdkStore.logSdkCall('createParty', { name, role, jurisdiction });
            onPartyCreated?.(party.id);
            setName('');
            setShowAdd(false);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyKyc = (partyId: string) => {
        sdkStore.verifyKyc(partyId);
        sdkStore.logSdkCall('verifyKyc', { partyId });
    };

    const ROLE_COLORS: Record<string, string> = {
        ISSUER: 'bg-blue-500/20 text-blue-400',
        INVESTOR: 'bg-green-500/20 text-green-400',
        CUSTODIAN: 'bg-purple-500/20 text-purple-400',
        REGULATOR: 'bg-red-500/20 text-red-400',
        TRANSFER_AGENT: 'bg-amber-500/20 text-amber-400',
        AUDITOR: 'bg-cyan-500/20 text-cyan-400',
    };

    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Users className={`w-5 h-5 ${accentColor}`} />
                    <h3 className="font-bold text-white">Parties & Stakeholders</h3>
                    <span className="text-xs text-gray-500">({filtered.length})</span>
                </div>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all text-xs font-medium"
                >
                    <Plus className="w-3 h-3" /> Add Party
                </button>
            </div>

            {/* Add Party Form */}
            {showAdd && (
                <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Party name..."
                        className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none focus:border-white/30"
                    />
                    <div className="flex gap-2">
                        <select
                            value={role}
                            onChange={e => setRole(e.target.value)}
                            className="flex-1 bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                        >
                            <option value="INVESTOR">Investor</option>
                            <option value="ISSUER">Issuer</option>
                            <option value="CUSTODIAN">Custodian</option>
                            <option value="TRANSFER_AGENT">Transfer Agent</option>
                            <option value="AUDITOR">Auditor</option>
                            <option value="REGULATOR">Regulator</option>
                        </select>
                        <select
                            value={jurisdiction}
                            onChange={e => setJurisdiction(e.target.value)}
                            className="w-24 bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                        >
                            <option value="AE">🇦🇪 AE</option>
                            <option value="US">🇺🇸 US</option>
                            <option value="GB">🇬🇧 GB</option>
                            <option value="SG">🇸🇬 SG</option>
                            <option value="KR">🇰🇷 KR</option>
                        </select>
                        <button
                            onClick={handleAddParty}
                            disabled={loading || !name.trim()}
                            className="px-4 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm font-medium hover:bg-white/20 transition-all disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                        </button>
                    </div>
                </div>
            )}

            {/* Party List */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
                {filtered.length === 0 ? (
                    <p className="text-xs text-gray-600 text-center py-4">No parties registered yet</p>
                ) : (
                    filtered.map(party => {
                        const kycVerified = (party as any).kycVerified ?? false;
                        const roles = (party as any).roles ?? [];
                        const juris = (party as any).jurisdiction ?? '—';
                        return (
                            <div key={party.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/8 transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white text-xs font-bold">
                                        {party.name.slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">{party.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {roles.map((r: string) => (
                                                <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_COLORS[r] || 'bg-gray-500/20 text-gray-400'}`}>
                                                    {r}
                                                </span>
                                            ))}
                                            <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                                                <Globe className="w-2.5 h-2.5" /> {juris}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {kycVerified ? (
                                        <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                                            <UserCheck className="w-3 h-3" /> KYC Verified
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleVerifyKyc(party.id)}
                                            className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full hover:bg-amber-500/20 transition-all"
                                        >
                                            <ShieldCheck className="w-3 h-3" /> Verify KYC
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
