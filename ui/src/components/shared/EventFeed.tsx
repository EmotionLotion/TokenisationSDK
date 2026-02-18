import { useState, useEffect, useSyncExternalStore } from 'react';
import { Radio, Clock, User, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { sdkStore } from '../../store';

interface EventFeedProps {
    assetId?: string;
    accentColor?: string;
    maxEvents?: number;
    title?: string;
}

interface FeedEvent {
    id: string;
    type: string;
    actor?: string;
    details?: string;
    timestamp: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
    TRANSITION: 'bg-blue-500/20 text-blue-400',
    MINT: 'bg-green-500/20 text-green-400',
    TRANSFER: 'bg-purple-500/20 text-purple-400',
    BURN: 'bg-red-500/20 text-red-400',
    COMPLIANCE: 'bg-amber-500/20 text-amber-400',
    ORACLE: 'bg-cyan-500/20 text-cyan-400',
    SETTLEMENT: 'bg-pink-500/20 text-pink-400',
    KYC: 'bg-emerald-500/20 text-emerald-400',
    WALLET: 'bg-indigo-500/20 text-indigo-400',
    DEFAULT: 'bg-gray-500/20 text-gray-400',
};

export function EventFeed({
    assetId,
    accentColor = 'text-blue-400',
    maxEvents = 20,
    title = 'Event Feed',
}: EventFeedProps) {
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [expanded, setExpanded] = useState(true);

    const subscribe = (cb: () => void) => sdkStore.subscribe(cb);
    const getSnapshot = () => sdkStore.getVersion();
    useSyncExternalStore(subscribe, getSnapshot);

    // Pull events from SDK logs as proxy for real events
    useEffect(() => {
        const logs = sdkStore.getSdkLogs();
        const mapped: FeedEvent[] = logs
            .filter(log => !assetId || log.params?.assetId === assetId)
            .map(log => ({
                id: log.id,
                type: categorizeMethod(log.method),
                actor: log.params?.actorId || log.params?.partyId || log.params?.toPartyId || '—',
                details: formatDetails(log.method, log.params),
                timestamp: log.timestamp,
            }))
            .reverse()
            .slice(0, maxEvents);
        setEvents(mapped);
    }, [assetId, maxEvents, sdkStore.getSdkLogs().length]);

    return (
        <div className="glass-card rounded-2xl border border-white/10 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-all"
            >
                <div className="flex items-center gap-2">
                    <Radio className={`w-4 h-4 ${accentColor}`} />
                    <h3 className="font-bold text-white text-sm">{title}</h3>
                    <span className="text-xs text-gray-500">({events.length})</span>
                    {events.length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    )}
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>

            {expanded && (
                <div className="px-4 pb-4 max-h-72 overflow-y-auto space-y-1">
                    {events.length === 0 ? (
                        <p className="text-xs text-gray-600 text-center py-6">
                            No events yet. Perform SDK operations to see events here.
                        </p>
                    ) : (
                        events.map(event => (
                            <div key={event.id} className="flex items-start gap-3 p-2 bg-white/5 rounded-lg hover:bg-white/8 transition-all">
                                <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                                    <Clock className="w-3 h-3 text-gray-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.DEFAULT}`}>
                                            {event.type}
                                        </span>
                                        <span className="text-[10px] text-gray-600">
                                            {formatTime(event.timestamp)}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-300 truncate">{event.details}</p>
                                    {event.actor && event.actor !== '—' && (
                                        <p className="text-[10px] text-gray-600 flex items-center gap-1 mt-0.5">
                                            <User className="w-2.5 h-2.5" /> {event.actor.slice(0, 12)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function categorizeMethod(method: string): string {
    if (method.includes('transition')) return 'TRANSITION';
    if (method.includes('mint')) return 'MINT';
    if (method.includes('transfer') || method.includes('Transfer')) return 'TRANSFER';
    if (method.includes('burn')) return 'BURN';
    if (method.includes('compliance') || method.includes('Compliance')) return 'COMPLIANCE';
    if (method.includes('oracle') || method.includes('Oracle') || method.includes('Valuation')) return 'ORACLE';
    if (method.includes('settlement') || method.includes('Settlement')) return 'SETTLEMENT';
    if (method.includes('kyc') || method.includes('Kyc')) return 'KYC';
    if (method.includes('wallet') || method.includes('Wallet')) return 'WALLET';
    return 'DEFAULT';
}

function formatDetails(method: string, params: any): string {
    if (!params) return method;
    const parts = [method];
    if (params.amount) parts.push(`amount: ${params.amount}`);
    if (params.toState) parts.push(`→ ${params.toState}`);
    if (params.assetId) parts.push(`asset: ${String(params.assetId).slice(0, 8)}`);
    return parts.join(' • ');
}

function formatTime(timestamp: string): string {
    try {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return timestamp;
    }
}
