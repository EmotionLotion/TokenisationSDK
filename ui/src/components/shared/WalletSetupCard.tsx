import { useState, useSyncExternalStore } from 'react';
import { Wallet, Copy, Check, Shield, Loader2, Link2 } from 'lucide-react';
import { sdkStore } from '../../store';

interface WalletSetupCardProps {
    accentColor?: string;
    defaultChain?: string;
}

export function WalletSetupCard({ accentColor = 'text-blue-400', defaultChain = 'polygon' }: WalletSetupCardProps) {
    const [selectedPartyId, setSelectedPartyId] = useState('');
    const [chain, setChain] = useState(defaultChain);
    const [loading, setLoading] = useState(false);
    const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

    const subscribe = (cb: () => void) => sdkStore.subscribe(cb);
    const getSnapshot = () => sdkStore.getVersion();
    useSyncExternalStore(subscribe, getSnapshot);

    const parties = sdkStore.getParties();

    const handleCreateWallet = async () => {
        if (!selectedPartyId) return;
        setLoading(true);
        try {
            sdkStore.logSdkCall('createWallet', { partyId: selectedPartyId, chain });
            sdkStore.createWallet(selectedPartyId, { chain });
        } finally {
            setLoading(false);
        }
    };

    const handleWhitelist = (address: string) => {
        sdkStore.logSdkCall('whitelistWallet', { address });
        sdkStore.whitelistWallet(address);
    };

    const handleCopy = (addr: string) => {
        navigator.clipboard.writeText(addr);
        setCopiedAddr(addr);
        setTimeout(() => setCopiedAddr(null), 2000);
    };

    // Gather all wallets
    const walletEntries: Array<{ partyId: string; partyName: string; address: string; chain: string; whitelisted: boolean }> = [];
    for (const party of parties) {
        const w = sdkStore.getWallet(party.id);
        if (w) {
            walletEntries.push({
                partyId: party.id,
                partyName: party.name,
                address: w.address,
                chain: w.chain || chain,
                whitelisted: sdkStore.isWhitelisted(w.address),
            });
        }
    }

    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2 mb-4">
                <Wallet className={`w-5 h-5 ${accentColor}`} />
                <h3 className="font-bold text-white">Wallet Setup</h3>
            </div>

            {/* Create Wallet */}
            <div className="p-4 bg-white/5 rounded-xl border border-white/5 mb-4 space-y-3">
                <div className="flex gap-2">
                    <select
                        value={selectedPartyId}
                        onChange={e => setSelectedPartyId(e.target.value)}
                        className="flex-1 bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                    >
                        <option value="">Select party...</option>
                        {parties.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <select
                        value={chain}
                        onChange={e => setChain(e.target.value)}
                        className="w-32 bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                    >
                        <option value="polygon">Polygon</option>
                        <option value="ethereum">Ethereum</option>
                        <option value="avalanche">Avalanche</option>
                        <option value="base">Base</option>
                    </select>
                </div>
                <button
                    onClick={handleCreateWallet}
                    disabled={loading || !selectedPartyId}
                    className="w-full py-2 bg-white/10 hover:bg-white/15 border border-white/10 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                    Create Wallet
                </button>
            </div>

            {/* Wallet List */}
            {walletEntries.length > 0 ? (
                <div className="space-y-2">
                    {walletEntries.map(w => (
                        <div key={w.address} className="p-3 bg-white/5 rounded-xl border border-white/5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-white">{w.partyName}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase">{w.chain}</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                                <code className="text-xs text-gray-400 font-mono flex-1 truncate">{w.address}</code>
                                <button onClick={() => handleCopy(w.address)} className="text-gray-500 hover:text-white transition-colors">
                                    {copiedAddr === w.address ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                {w.whitelisted ? (
                                    <span className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                                        <Shield className="w-2.5 h-2.5" /> Whitelisted
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => handleWhitelist(w.address)}
                                        className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full hover:bg-amber-500/20 transition-all"
                                    >
                                        <Link2 className="w-2.5 h-2.5" /> Whitelist
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-gray-600 text-center py-2">No wallets created yet</p>
            )}
        </div>
    );
}
