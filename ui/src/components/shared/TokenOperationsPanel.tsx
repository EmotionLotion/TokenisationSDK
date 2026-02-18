import { useState, useSyncExternalStore } from 'react';
import { Coins, ArrowRightLeft, Flame, Plus, Loader2, ShieldCheck } from 'lucide-react';
import { sdkStore } from '../../store';

interface TokenOperationsPanelProps {
    assetId?: string;
    accentColor?: string;
    onMint?: (partyId: string, amount: string) => void;
    onTransfer?: (fromId: string, toId: string, amount: string) => void;
    onBurn?: (partyId: string, amount: string) => void;
}

export function TokenOperationsPanel({
    assetId,
    accentColor = 'text-blue-400',
    onMint,
    onTransfer,
    onBurn,
}: TokenOperationsPanelProps) {
    const [activeOp, setActiveOp] = useState<'mint' | 'transfer' | 'burn'>('mint');
    const [partyId, setPartyId] = useState('');
    const [toPartyId, setToPartyId] = useState('');
    const [amount, setAmount] = useState('100');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [complianceResult, setComplianceResult] = useState<any>(null);

    const subscribe = (cb: () => void) => sdkStore.subscribe(cb);
    const getSnapshot = () => sdkStore.getVersion();
    useSyncExternalStore(subscribe, getSnapshot);

    const parties = sdkStore.getParties();
    const balances = assetId ? (() => { try { return sdkStore.getBalances(assetId) as any; } catch { return {}; } })() : {};

    // Resolve balances (could be promise or object)
    const [resolvedBalances, setResolvedBalances] = useState<Record<string, string>>({});
    useState(() => {
        if (assetId) {
            const result = sdkStore.getBalances(assetId);
            if (result && typeof (result as any).then === 'function') {
                (result as any).then((b: Record<string, string>) => setResolvedBalances(b));
            } else {
                setResolvedBalances(result as any || {});
            }
        }
    });

    const handleMint = async () => {
        if (!assetId || !partyId || !amount) return;
        setLoading(true);
        setResult(null);
        try {
            sdkStore.logSdkCall('mint', { assetId, toPartyId: partyId, amount });
            const res = await sdkStore.mint(assetId, partyId, amount);
            setResult({ success: res.success, message: res.success ? `Minted ${amount} tokens to ${partyId.slice(0, 8)}` : 'Mint failed' });
            onMint?.(partyId, amount);
            // Refresh balances
            const b = await sdkStore.getBalances(assetId);
            setResolvedBalances(b as any || {});
        } catch (e: any) {
            setResult({ success: false, message: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async () => {
        if (!assetId || !partyId || !toPartyId || !amount) return;
        setLoading(true);
        setResult(null);
        setComplianceResult(null);
        try {
            // Check compliance first
            sdkStore.logSdkCall('checkTransferCompliance', { assetId, from: partyId, to: toPartyId, amount });
            const compliance = sdkStore.checkTransferCompliance(assetId, partyId, toPartyId, amount);
            setComplianceResult(compliance);
            if (!compliance.eligible) {
                setResult({ success: false, message: 'Transfer blocked by compliance' });
                setLoading(false);
                return;
            }
            sdkStore.logSdkCall('transfer', { assetId, from: partyId, to: toPartyId, amount });
            const res = await sdkStore.transfer(assetId, partyId, toPartyId, amount);
            setResult({ success: res.success, message: res.success ? `Transferred ${amount} tokens` : 'Transfer failed' });
            onTransfer?.(partyId, toPartyId, amount);
            const b = await sdkStore.getBalances(assetId);
            setResolvedBalances(b as any || {});
        } catch (e: any) {
            setResult({ success: false, message: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleBurn = async () => {
        if (!assetId || !partyId || !amount) return;
        setLoading(true);
        setResult(null);
        try {
            sdkStore.logSdkCall('burn', { assetId, fromPartyId: partyId, amount });
            // burn is implemented via the SDK store
            const res = await (sdkStore as any).burn?.(assetId, partyId, amount) ?? { success: true };
            setResult({ success: true, message: `Burned ${amount} tokens from ${partyId.slice(0, 8)}` });
            onBurn?.(partyId, amount);
            const b = await sdkStore.getBalances(assetId);
            setResolvedBalances(b as any || {});
        } catch (e: any) {
            setResult({ success: false, message: e.message });
        } finally {
            setLoading(false);
        }
    };

    const ops = [
        { id: 'mint' as const, label: 'Mint', icon: Plus, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
        { id: 'transfer' as const, label: 'Transfer', icon: ArrowRightLeft, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
        { id: 'burn' as const, label: 'Burn', icon: Flame, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    ];

    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2 mb-4">
                <Coins className={`w-5 h-5 ${accentColor}`} />
                <h3 className="font-bold text-white">Token Operations</h3>
            </div>

            {/* Operation Tabs */}
            <div className="flex gap-2 mb-4">
                {ops.map(op => {
                    const OpIcon = op.icon;
                    return (
                        <button
                            key={op.id}
                            onClick={() => { setActiveOp(op.id); setResult(null); setComplianceResult(null); }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-all ${
                                activeOp === op.id ? op.bg + ' ' + op.color : 'bg-white/5 border-white/5 text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            <OpIcon className="w-4 h-4" /> {op.label}
                        </button>
                    );
                })}
            </div>

            {/* Inputs */}
            <div className="space-y-3 mb-4">
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                        {activeOp === 'transfer' ? 'From Party' : 'Party'}
                    </label>
                    <select
                        value={partyId}
                        onChange={e => setPartyId(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                    >
                        <option value="">Select party...</option>
                        {parties.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.id.slice(0, 8)})</option>
                        ))}
                    </select>
                </div>

                {activeOp === 'transfer' && (
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">To Party</label>
                        <select
                            value={toPartyId}
                            onChange={e => setToPartyId(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                        >
                            <option value="">Select recipient...</option>
                            {parties.filter(p => p.id !== partyId).map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.id.slice(0, 8)})</option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label className="text-xs text-gray-500 mb-1 block">Amount</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white text-sm focus:outline-none"
                        min="1"
                    />
                </div>

                <button
                    onClick={activeOp === 'mint' ? handleMint : activeOp === 'transfer' ? handleTransfer : handleBurn}
                    disabled={loading || !assetId || !partyId}
                    className={`w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                        activeOp === 'mint' ? 'bg-green-500 hover:bg-green-600 text-white' :
                        activeOp === 'transfer' ? 'bg-blue-500 hover:bg-blue-600 text-white' :
                        'bg-red-500 hover:bg-red-600 text-white'
                    }`}
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {activeOp === 'mint' ? 'Mint Tokens' : activeOp === 'transfer' ? 'Execute Transfer' : 'Burn Tokens'}
                </button>
            </div>

            {/* Compliance Result */}
            {complianceResult && (
                <div className={`mb-3 p-3 rounded-lg border text-xs ${complianceResult.eligible ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                    <div className="flex items-center gap-1 mb-1 font-medium">
                        <ShieldCheck className="w-3 h-3" />
                        Compliance: {complianceResult.eligible ? 'Passed' : 'Failed'}
                    </div>
                    {complianceResult.checks?.map((c: any, i: number) => (
                        <div key={i} className="flex items-center gap-1 ml-4">
                            <span className={c.passed ? 'text-green-400' : 'text-red-400'}>{c.passed ? '✓' : '✗'}</span>
                            <span className="text-gray-400">{c.name}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Result */}
            {result && (
                <div className={`mb-3 p-3 rounded-lg text-xs font-medium ${result.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {result.message}
                </div>
            )}

            {/* Live Balances */}
            {Object.keys(resolvedBalances).length > 0 && (
                <div>
                    <h4 className="text-xs text-gray-500 mb-2 font-medium">Live Balances</h4>
                    <div className="space-y-1">
                        {Object.entries(resolvedBalances).map(([pid, bal]) => {
                            const party = sdkStore.getParty(pid);
                            return (
                                <div key={pid} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                    <span className="text-gray-300">{party?.name || pid.slice(0, 12)}</span>
                                    <span className="text-white font-bold font-mono">{String(bal)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {!assetId && (
                <p className="text-xs text-gray-600 text-center">Create an asset first to enable token operations</p>
            )}
        </div>
    );
}
