import React from 'react';
import { Building2, Ticket, Award, Activity, Globe, Clock, Shield } from 'lucide-react';
import type { Asset, RightType, LifecycleState } from '@tokenisation/sdk';

/**
 * Props for the AssetCard component
 */
export interface AssetCardProps {
    /** The asset to display */
    asset: Asset;
    /** Show action buttons (View, Invest) */
    showActions?: boolean;
    /** Callback when card is clicked */
    onClick?: (asset: Asset) => void;
    /** Callback when invest button is clicked */
    onInvest?: (asset: Asset) => void;
    /** Custom class name */
    className?: string;
}

const getTypeIcon = (rightType: RightType) => {
    const icons: Record<RightType, React.ReactNode> = {
        'OWNERSHIP': <Building2 className="w-5 h-5 text-blue-400" />,
        'ACCESS': <Ticket className="w-5 h-5 text-purple-400" />,
        'VERIFICATION': <Shield className="w-5 h-5 text-green-400" />,
        'BEHAVIOR': <Activity className="w-5 h-5 text-orange-400" />,
    };
    return icons[rightType] || <Award className="w-5 h-5 text-gray-400" />;
};

const getStateColor = (state: LifecycleState): string => {
    const colors: Record<LifecycleState, string> = {
        'DRAFT': 'bg-gray-500/20 text-gray-400 border-gray-500/30',
        'PENDING_VERIFICATION': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        'VERIFIED': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        'ACTIVE': 'bg-green-500/20 text-green-400 border-green-500/30',
        'FROZEN': 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        'REDEEMED': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
        'EXPIRED': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        'BURNED': 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[state] || 'bg-gray-500/20 text-gray-400';
};

/**
 * Standardized asset card component for displaying tokenized assets.
 * 
 * @example
 * ```tsx
 * import { AssetCard } from '@tokenisation/ui-kit';
 * 
 * function AssetList({ assets }) {
 *   return (
 *     <div className="grid grid-cols-3 gap-4">
 *       {assets.map(asset => (
 *         <AssetCard
 *           key={asset.id}
 *           asset={asset}
 *           showActions={true}
 *           onClick={(a) => navigate(`/assets/${a.id}`)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function AssetCard({ asset, showActions = false, onClick, onInvest, className = '' }: AssetCardProps) {
    const jurisdictionCode = typeof asset.jurisdiction === 'string'
        ? asset.jurisdiction
        : asset.jurisdiction?.countryCode || 'Global';

    const totalSupply = asset.tokenInfo?.totalSupply || '0';

    return (
        <div
            className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:border-white/20 transition-all cursor-pointer ${className}`}
            onClick={() => onClick?.(asset)}
        >
            {/* Header */}
            <div className="p-4 border-b border-white/5">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">
                            {getTypeIcon(asset.rightType)}
                        </div>
                        <div>
                            <h3 className="font-semibold text-white truncate max-w-[200px]">{asset.name}</h3>
                            <p className="text-xs text-gray-500">{asset.rightType}</p>
                        </div>
                    </div>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium border ${getStateColor(asset.state)}`}>
                        {asset.state}
                    </span>
                </div>
            </div>

            {/* Details */}
            <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-400">
                        <Globe className="w-4 h-4" />
                        <span>{jurisdictionCode}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Total Supply</span>
                    <span className="font-mono text-white">{Number(totalSupply).toLocaleString()}</span>
                </div>
            </div>

            {/* Actions */}
            {showActions && (
                <div className="p-4 pt-0 flex gap-2">
                    <button
                        className="flex-1 py-2 bg-white/5 text-white text-sm rounded-lg hover:bg-white/10 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick?.(asset);
                        }}
                    >
                        View Details
                    </button>
                    {asset.state === 'ACTIVE' && onInvest && (
                        <button
                            className="flex-1 py-2 bg-[#F8B032] text-black text-sm font-semibold rounded-lg hover:bg-[#E8A633] transition-colors"
                            onClick={(e) => {
                                e.stopPropagation();
                                onInvest(asset);
                            }}
                        >
                            Invest
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
