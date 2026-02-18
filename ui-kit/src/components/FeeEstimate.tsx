import React from 'react';
import { Fuel, AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';

/**
 * Gas estimate data to display.
 * Matches the shape returned by useGasEstimate from sdk-react.
 */
export interface FeeEstimateData {
    chainName: string;
    nativeSymbol: string;
    estimatedCostNative: string;
    estimatedCostWei: string;
    gasPriceGwei: string;
    gasLimit: string;
    displayCost: string;
    cached?: boolean;
    timestamp?: string;
}

/**
 * Props for the FeeEstimate component.
 */
export interface FeeEstimateProps {
    /** Gas estimate data. Pass null while loading. */
    estimate: FeeEstimateData | null;
    /** Whether the estimate is being fetched */
    isLoading?: boolean;
    /** Error message if estimation failed */
    error?: string | null;
    /** Display mode */
    mode?: 'compact' | 'expanded';
    /** Callback when user clicks refresh */
    onRefresh?: () => void;
    /** Optional USD equivalent (e.g., "$4.12") */
    usdEquivalent?: string;
    /** Warn if cost exceeds this threshold in native token units */
    highCostThreshold?: number;
    /** Custom class name */
    className?: string;
}

/**
 * FeeEstimate - Displays gas fee estimation for blockchain transactions.
 *
 * Supports compact (inline) and expanded (detailed) display modes.
 */
export function FeeEstimate({
    estimate,
    isLoading = false,
    error,
    mode = 'compact',
    onRefresh,
    usdEquivalent,
    highCostThreshold,
    className = '',
}: FeeEstimateProps) {
    const isHighCost = highCostThreshold != null
        && estimate != null
        && parseFloat(estimate.estimatedCostNative) > highCostThreshold;

    if (error) {
        return (
            <div className={`flex items-center gap-1.5 text-sm text-amber-400 ${className}`}>
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Fee estimate unavailable</span>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="ml-1 text-amber-300 hover:text-amber-200 transition-colors"
                        aria-label="Retry fee estimation"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                )}
            </div>
        );
    }

    if (isLoading && !estimate) {
        return (
            <div className={`flex items-center gap-1.5 text-sm text-slate-400 ${className}`}>
                <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                <span>Estimating fee...</span>
            </div>
        );
    }

    if (!estimate) return null;

    if (mode === 'compact') {
        return (
            <div className={`flex items-center gap-1.5 text-sm ${className}`}>
                <Fuel className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className={isHighCost ? 'text-amber-400' : 'text-slate-300'}>
                    {estimate.displayCost}
                </span>
                {usdEquivalent && (
                    <span className="text-slate-500">({usdEquivalent})</span>
                )}
                {isHighCost && (
                    <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
                )}
                {isLoading && (
                    <Loader2 className="w-3 h-3 text-slate-500 animate-spin flex-shrink-0" />
                )}
                {onRefresh && !isLoading && (
                    <button
                        onClick={onRefresh}
                        className="text-slate-500 hover:text-slate-300 transition-colors"
                        aria-label="Refresh fee estimate"
                    >
                        <RefreshCw className="w-3 h-3" />
                    </button>
                )}
            </div>
        );
    }

    // Expanded mode
    return (
        <div className={`rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm ${className}`}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                    <Fuel className="w-4 h-4 text-slate-400" />
                    <span>Estimated Fee</span>
                </div>
                <div className="flex items-center gap-1">
                    {isLoading && (
                        <Loader2 className="w-3 h-3 text-slate-500 animate-spin" />
                    )}
                    {onRefresh && !isLoading && (
                        <button
                            onClick={onRefresh}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                            aria-label="Refresh fee estimate"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            <div className="flex items-baseline gap-2 mb-2">
                <span className={`text-lg font-semibold ${isHighCost ? 'text-amber-400' : 'text-white'}`}>
                    {estimate.displayCost}
                </span>
                {usdEquivalent && (
                    <span className="text-slate-400">{usdEquivalent}</span>
                )}
                {isHighCost && (
                    <span className="flex items-center gap-1 text-xs text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                        High
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
                <div className="flex justify-between">
                    <span>Network</span>
                    <span className="text-slate-300">{estimate.chainName}</span>
                </div>
                <div className="flex justify-between">
                    <span>Gas Price</span>
                    <span className="text-slate-300">{estimate.gasPriceGwei} Gwei</span>
                </div>
                <div className="flex justify-between">
                    <span>Gas Limit</span>
                    <span className="text-slate-300">{Number(estimate.gasLimit).toLocaleString()}</span>
                </div>
                {estimate.cached && (
                    <div className="flex justify-between">
                        <span>Source</span>
                        <span className="text-slate-500">cached</span>
                    </div>
                )}
            </div>
        </div>
    );
}
