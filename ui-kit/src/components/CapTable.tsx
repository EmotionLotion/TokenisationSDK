import React, { useEffect, useState } from 'react';
import { PieChart, Users, Loader2 } from 'lucide-react';
import { useTokenisation } from '../context/TokenisationProvider';

/**
 * Props for the CapTable component
 */
export interface CapTableProps {
    /** Asset ID to display cap table for */
    assetId: string;
    /** Maximum number of holders to display */
    maxHolders?: number;
    /** Show percentage breakdown */
    showPercentages?: boolean;
    /** Custom class name */
    className?: string;
}

interface Holder {
    address: string;
    name?: string;
    balance: string;
    percentage: number;
}

const COLORS = [
    '#F8B032', // Gold
    '#3B82F6', // Blue
    '#10B981', // Green
    '#8B5CF6', // Purple
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#6366F1', // Indigo
];

/**
 * Cap table visualization component showing ownership distribution.
 * 
 * @example
 * ```tsx
 * import { CapTable } from '@tokenisation/ui-kit';
 * 
 * function AssetDetails({ assetId }) {
 *   return (
 *     <CapTable
 *       assetId={assetId}
 *       maxHolders={10}
 *       showPercentages={true}
 *     />
 *   );
 * }
 * ```
 */
export function CapTable({
    assetId,
    maxHolders = 10,
    showPercentages = true,
    className = '',
}: CapTableProps) {
    const { api, isReady, theme } = useTokenisation();
    const [holders, setHolders] = useState<Holder[]>([]);
    const [loading, setLoading] = useState(true);
    const [totalSupply, setTotalSupply] = useState<bigint>(0n);

    const primaryColor = theme?.colors?.primary || '#F8B032';

    useEffect(() => {
        if (!isReady) return;

        const fetchCapTable = async () => {
            setLoading(true);
            try {
                // Fetch asset details
                const assetResponse = await api.assets.get(assetId);
                const asset = assetResponse.asset;
                const supply = BigInt(asset?.tokenInfo?.totalSupply || '0');
                setTotalSupply(supply);

                // Get all parties and their balances
                const partiesResponse = await api.parties.list();
                const parties = partiesResponse.parties || [];
                const holderData: Holder[] = [];

                for (const party of parties.slice(0, maxHolders * 2)) {
                    try {
                        const balanceResponse = await api.tokens.balance(assetId, party.id);
                        const balanceStr = balanceResponse.balance;
                        if (balanceStr && BigInt(balanceStr) > 0n) {
                            const percentage = supply > 0n
                                ? Number((BigInt(balanceStr) * 10000n) / supply) / 100
                                : 0;
                            holderData.push({
                                address: party.id,
                                name: party.name,
                                balance: balanceStr,
                                percentage,
                            });
                        }
                    } catch {
                        // Skip parties without balance
                    }
                }

                // Sort by balance descending
                holderData.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
                setHolders(holderData.slice(0, maxHolders));
            } catch (err) {
                console.error('Failed to fetch cap table:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchCapTable();
    }, [assetId, isReady, api, maxHolders]);

    if (loading) {
        return (
            <div className={`flex items-center justify-center p-8 ${className}`}>
                <Loader2 className="w-6 h-6 text-[#F8B032] animate-spin" />
            </div>
        );
    }

    if (holders.length === 0) {
        return (
            <div className={`text-center p-8 ${className}`}>
                <Users className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No holders found</p>
            </div>
        );
    }

    return (
        <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`}>
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-[#F8B032]" />
                <h3 className="font-semibold text-white">Cap Table</h3>
                <span className="text-xs text-gray-500 ml-auto">{holders.length} holders</span>
            </div>

            {/* Simple Bar Visualization */}
            {showPercentages && (
                <div className="p-4 border-b border-white/10">
                    <div className="h-8 rounded-lg overflow-hidden flex">
                        {holders.map((holder, idx) => (
                            <div
                                key={holder.address}
                                className="h-full transition-all hover:opacity-80"
                                style={{
                                    width: `${holder.percentage}%`,
                                    backgroundColor: COLORS[idx % COLORS.length],
                                    minWidth: holder.percentage > 0 ? '4px' : '0',
                                }}
                                title={`${holder.name || holder.address}: ${holder.percentage.toFixed(2)}%`}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Holder List */}
            <div className="divide-y divide-white/5">
                {holders.map((holder, idx) => (
                    <div key={holder.address} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <div>
                                <p className="text-sm text-white">{holder.name || 'Unknown'}</p>
                                <p className="text-xs text-gray-500 font-mono">
                                    {holder.address.slice(0, 8)}...{holder.address.slice(-6)}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-mono text-white">
                                {Number(holder.balance).toLocaleString()}
                            </p>
                            {showPercentages && (
                                <p className="text-xs text-gray-500">{holder.percentage.toFixed(2)}%</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
