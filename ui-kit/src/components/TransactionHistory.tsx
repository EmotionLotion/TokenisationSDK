import React, { useEffect, useState } from 'react';
import { Clock, ArrowRight, Coins, RefreshCw, Shield, Loader2 } from 'lucide-react';
import { useTokenisation } from '../context/TokenisationProvider';

/**
 * Props for the TransactionHistory component
 */
export interface TransactionHistoryProps {
    /** Asset ID to display transactions for */
    assetId: string;
    /** Maximum number of transactions to show */
    limit?: number;
    /** Auto-refresh interval in milliseconds (0 to disable) */
    refreshInterval?: number;
    /** Custom class name */
    className?: string;
}

interface Transaction {
    id: string;
    type: string;
    timestamp: string;
    from?: string;
    to?: string;
    amount?: string;
    actor?: string;
    data?: Record<string, any>;
}

const getEventIcon = (type: string) => {
    switch (type) {
        case 'MINT':
            return <Coins className="w-4 h-4 text-green-400" />;
        case 'TRANSFER':
            return <ArrowRight className="w-4 h-4 text-blue-400" />;
        case 'BURN':
            return <RefreshCw className="w-4 h-4 text-red-400" />;
        case 'STATE_TRANSITION':
            return <Shield className="w-4 h-4 text-purple-400" />;
        default:
            return <Clock className="w-4 h-4 text-gray-400" />;
    }
};

const getEventLabel = (type: string) => {
    switch (type) {
        case 'MINT': return 'Minted';
        case 'TRANSFER': return 'Transferred';
        case 'BURN': return 'Burned';
        case 'STATE_TRANSITION': return 'State Changed';
        case 'ASSET_CREATED': return 'Created';
        default: return type;
    }
};

/**
 * Transaction history component showing recent activity for an asset.
 * 
 * @example
 * ```tsx
 * import { TransactionHistory } from '@tokenisation/ui-kit';
 * 
 * function AssetActivity({ assetId }) {
 *   return (
 *     <TransactionHistory
 *       assetId={assetId}
 *       limit={10}
 *       refreshInterval={30000}
 *     />
 *   );
 * }
 * ```
 */
export function TransactionHistory({
    assetId,
    limit = 10,
    refreshInterval = 0,
    className = '',
}: TransactionHistoryProps) {
    const { api, isReady, theme } = useTokenisation();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

    const primaryColor = theme?.colors?.primary || '#F8B032';

    const fetchTransactions = async () => {
        if (!isReady) return;

        try {
            // Get events from the API
            const eventsResponse = await api.events.list({ assetId });
            const allEvents = eventsResponse.data || [];

            const txs: Transaction[] = allEvents
                .slice(-limit)
                .reverse()
                .map((event: any) => ({
                    id: event.id,
                    type: event.type as string,
                    timestamp: event.timestamp,
                    from: event.payload?.from,
                    to: event.payload?.to,
                    amount: event.payload?.amount,
                    actor: event.actorId,
                    data: event.payload as Record<string, any>,
                }));

            setTransactions(txs);
        } catch (err) {
            console.error('Failed to fetch transactions:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();

        if (refreshInterval > 0) {
            const interval = setInterval(fetchTransactions, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [assetId, isReady, limit, refreshInterval]);

    const formatTimestamp = (ts: string) => {
        const date = new Date(ts);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    };

    if (loading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`} role="status" aria-label="Loading transactions" aria-busy="true">
                <Loader2 className="w-6 h-6 text-[#F8B032] animate-spin" aria-hidden="true" />
                <span className="sr-only">Loading transaction history...</span>
            </div>
        );
    }

    if (transactions.length === 0) {
        return (
            <div className={`text-center p-8 ${className}`} role="status">
                <Clock className="w-12 h-12 text-gray-600 mx-auto mb-3" aria-hidden="true" />
                <p className="text-gray-400">No transactions yet</p>
            </div>
        );
    }

    return (
        <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Transaction History">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#F8B032]" aria-hidden="true" />
                    <h3 id="tx-history-heading" className="font-semibold text-white">Activity</h3>
                </div>
                <button
                    onClick={fetchTransactions}
                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Refresh transaction history"
                >
                    <RefreshCw className="w-4 h-4 text-gray-400" aria-hidden="true" />
                </button>
            </div>

            {/* Transaction List */}
            <div className="divide-y divide-white/5" role="list" aria-labelledby="tx-history-heading" aria-live="polite">
                {transactions.map((tx) => (
                    <div key={tx.id} className="p-4 hover:bg-white/5 transition-colors" role="listitem" aria-label={`${getEventLabel(tx.type)}${tx.amount ? `, ${Number(tx.amount).toLocaleString()} tokens` : ''}, ${formatTimestamp(tx.timestamp)}`}>
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center" aria-hidden="true">
                                    {getEventIcon(tx.type)}
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        {getEventLabel(tx.type)}
                                    </p>
                                    {tx.amount && (
                                        <p className="text-xs text-gray-500 font-mono">
                                            {Number(tx.amount).toLocaleString()} tokens
                                        </p>
                                    )}
                                    {tx.to && (
                                        <p className="text-xs text-gray-500">
                                            To: {tx.to.slice(0, 8)}...
                                        </p>
                                    )}
                                </div>
                            </div>
                            <span className="text-xs text-gray-500">
                                {formatTimestamp(tx.timestamp)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
