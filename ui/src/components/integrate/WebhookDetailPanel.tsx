import { useState } from 'react';
import { CheckCircle, XCircle, RefreshCw, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface DeliveryAttempt {
    id: string;
    timestamp: string;
    event: string;
    statusCode: number;
    success: boolean;
    duration: string;
    payload?: string;
}

const SAMPLE_DELIVERIES: DeliveryAttempt[] = [
    { id: 'del_001', timestamp: '2025-01-08T10:25:00Z', event: 'asset.created', statusCode: 200, success: true, duration: '145ms', payload: '{"event":"asset.created","data":{"id":"asset_01HQXYZ","name":"Marina Tower Unit 2501"}}' },
    { id: 'del_002', timestamp: '2025-01-08T10:20:00Z', event: 'identity.verified', statusCode: 200, success: true, duration: '89ms', payload: '{"event":"identity.verified","data":{"partyId":"party_01ABC","level":"enhanced"}}' },
    { id: 'del_003', timestamp: '2025-01-08T10:15:00Z', event: 'asset.transferred', statusCode: 500, success: false, duration: '2034ms', payload: '{"event":"asset.transferred","data":{"txId":"tx_002","from":"party_01ABC","to":"party_02DEF"}}' },
    { id: 'del_004', timestamp: '2025-01-08T10:10:00Z', event: 'policy.violated', statusCode: 200, success: true, duration: '112ms', payload: '{"event":"policy.violated","data":{"policyId":"pol_001","assetId":"asset_01HQXYZ"}}' },
    { id: 'del_005', timestamp: '2025-01-08T10:05:00Z', event: 'asset.created', statusCode: 200, success: true, duration: '167ms', payload: '{"event":"asset.created","data":{"id":"asset_02ABCDE","name":"FlyPlus Ticket #1042"}}' },
];

interface WebhookDetailPanelProps {
    webhookUrl?: string;
}

export function WebhookDetailPanel({ webhookUrl = 'https://api.myapp.com/webhooks/ahoy' }: WebhookDetailPanelProps) {
    const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
    const [retrying, setRetrying] = useState<string | null>(null);

    const handleRetry = (id: string) => {
        setRetrying(id);
        setTimeout(() => setRetrying(null), 1500);
    };

    const formatTime = (ts: string) => {
        return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-medium text-white">Delivery History</h3>
                <code className="text-xs text-gray-500 font-mono">{webhookUrl}</code>
            </div>

            <div className="glass-card divide-y divide-white/5">
                {SAMPLE_DELIVERIES.map((delivery) => (
                    <div key={delivery.id}>
                        <div
                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => setExpandedDelivery(expandedDelivery === delivery.id ? null : delivery.id)}
                        >
                            <div className="flex items-center gap-3">
                                {delivery.success ? (
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                ) : (
                                    <XCircle className="w-4 h-4 text-red-400" />
                                )}
                                <span className="text-sm font-mono text-gray-300">{delivery.event}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                                    delivery.success ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                                }`}>
                                    {delivery.statusCode}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {delivery.duration}
                                </span>
                                <span className="text-xs text-gray-600">{formatTime(delivery.timestamp)}</span>
                                {!delivery.success && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleRetry(delivery.id); }}
                                        className="p-1 hover:bg-white/10 rounded transition-colors"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${retrying === delivery.id ? 'animate-spin' : ''}`} />
                                    </button>
                                )}
                                {expandedDelivery === delivery.id ? (
                                    <ChevronUp className="w-4 h-4 text-gray-500" />
                                ) : (
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                )}
                            </div>
                        </div>
                        {expandedDelivery === delivery.id && delivery.payload && (
                            <div className="px-3 pb-3">
                                <div className="bg-black/40 rounded-lg p-3">
                                    <p className="text-xs text-gray-500 mb-1">Payload</p>
                                    <pre className="text-xs font-mono text-gray-300 overflow-x-auto">
                                        {JSON.stringify(JSON.parse(delivery.payload), null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
