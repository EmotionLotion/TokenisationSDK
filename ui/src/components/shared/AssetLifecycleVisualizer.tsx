import { useState } from 'react';
import { CheckCircle, Circle, ArrowRight, Loader2, Lock } from 'lucide-react';
import { sdkStore } from '../../store';

export interface LifecycleNode {
    state: string;
    label: string;
    description?: string;
}

interface AssetLifecycleVisualizerProps {
    assetId?: string;
    currentState?: string;
    nodes?: LifecycleNode[];
    accentColor?: string;
    actorId?: string;
    onTransition?: (fromState: string, toState: string) => void;
}

const DEFAULT_NODES: LifecycleNode[] = [
    { state: 'DRAFT', label: 'Draft', description: 'Initial creation' },
    { state: 'PENDING_VERIFICATION', label: 'Pending', description: 'Awaiting KYC/AML' },
    { state: 'VERIFIED', label: 'Verified', description: 'Compliance approved' },
    { state: 'ACTIVE', label: 'Active', description: 'Fully operational' },
    { state: 'FROZEN', label: 'Frozen', description: 'Temporarily suspended' },
    { state: 'REDEEMED', label: 'Redeemed', description: 'Lifecycle complete' },
];

export function AssetLifecycleVisualizer({
    assetId,
    currentState = 'DRAFT',
    nodes = DEFAULT_NODES,
    accentColor = 'text-blue-400',
    actorId,
    onTransition,
}: AssetLifecycleVisualizerProps) {
    const [transitioning, setTransitioning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const currentIndex = nodes.findIndex(n => n.state === currentState);

    const handleTransition = async (targetState: string) => {
        if (!assetId || !actorId) return;
        setTransitioning(true);
        setError(null);
        try {
            sdkStore.logSdkCall('transition', { assetId, toState: targetState, actorId });
            const result = await sdkStore.transition(assetId, targetState as any, actorId);
            if (result.success) {
                onTransition?.(currentState, targetState);
            } else {
                setError(result.error || 'Transition failed');
            }
        } catch (e: any) {
            setError(e.message || 'Transition error');
        } finally {
            setTransitioning(false);
        }
    };

    const getNodeStatus = (index: number) => {
        if (index < currentIndex) return 'completed';
        if (index === currentIndex) return 'current';
        return 'pending';
    };

    return (
        <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-sm font-bold text-white mb-1">Asset Lifecycle</h3>
            <p className="text-xs text-gray-500 mb-6">
                {assetId ? `Asset: ${assetId.slice(0, 12)}...` : 'No asset selected'}
            </p>

            {/* Horizontal flow */}
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {nodes.map((node, i) => {
                    const status = getNodeStatus(i);
                    const isNext = i === currentIndex + 1;
                    const canClick = isNext && assetId && actorId && !transitioning;

                    return (
                        <div key={node.state} className="flex items-center">
                            {/* Node */}
                            <button
                                onClick={() => canClick && handleTransition(node.state)}
                                disabled={!canClick}
                                className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-xl transition-all min-w-[80px] ${
                                    status === 'current'
                                        ? 'bg-white/10 border border-white/20 shadow-lg scale-105'
                                        : status === 'completed'
                                        ? 'bg-white/5 border border-white/5 opacity-80'
                                        : canClick
                                        ? 'bg-white/5 border border-dashed border-white/20 hover:bg-white/10 hover:border-white/30 cursor-pointer'
                                        : 'bg-white/2 border border-white/5 opacity-40'
                                }`}
                            >
                                {status === 'completed' ? (
                                    <CheckCircle className="w-5 h-5 text-green-400" />
                                ) : status === 'current' ? (
                                    transitioning ? (
                                        <Loader2 className={`w-5 h-5 ${accentColor} animate-spin`} />
                                    ) : (
                                        <Circle className={`w-5 h-5 ${accentColor} fill-current`} />
                                    )
                                ) : canClick ? (
                                    <Circle className="w-5 h-5 text-gray-500" />
                                ) : (
                                    <Lock className="w-4 h-4 text-gray-600" />
                                )}
                                <span className={`text-xs font-medium ${
                                    status === 'current' ? 'text-white' : status === 'completed' ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                    {node.label}
                                </span>
                                {node.description && (
                                    <span className="text-[10px] text-gray-600 leading-tight text-center">
                                        {node.description}
                                    </span>
                                )}
                            </button>

                            {/* Connector */}
                            {i < nodes.length - 1 && (
                                <div className="flex items-center px-1">
                                    <div className={`w-6 h-px ${
                                        i < currentIndex ? 'bg-green-500' : 'bg-gray-700'
                                    }`} />
                                    <ArrowRight className={`w-3 h-3 ${
                                        i < currentIndex ? 'text-green-500' : 'text-gray-700'
                                    }`} />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {error && (
                <div className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    {error}
                </div>
            )}

            {!assetId && (
                <p className="mt-3 text-xs text-gray-600 text-center">
                    Create an asset to enable lifecycle transitions
                </p>
            )}
        </div>
    );
}
