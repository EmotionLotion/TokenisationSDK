import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface LogEntry {
    method: string;
    endpoint: string;
    statusCode: number;
    duration: string;
    requestId: string;
    timestamp: string;
    requestHeaders: Record<string, string>;
    requestBody?: string;
    responseHeaders: Record<string, string>;
    responseBody: string;
    timeline: { label: string; ms: number }[];
}

const SAMPLE_LOG: LogEntry = {
    method: 'POST',
    endpoint: '/v1/assets',
    statusCode: 201,
    duration: '245ms',
    requestId: 'req_abc123',
    timestamp: '2025-01-08T10:32:45Z',
    requestHeaders: {
        'Authorization': 'Bearer sk_live_ahoy_xxx...xxx',
        'Content-Type': 'application/json',
        'X-Request-Id': 'req_abc123',
        'User-Agent': 'ahoy-sdk/1.0.0 node/20.0.0',
    },
    requestBody: JSON.stringify({ name: 'Marina Tower Unit 2501', rightType: 'OWNERSHIP', jurisdiction: 'AE' }, null, 2),
    responseHeaders: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'req_abc123',
        'X-RateLimit-Remaining': '498',
        'X-RateLimit-Reset': '1704711600',
    },
    responseBody: JSON.stringify({
        id: 'asset_01HQXYZ',
        name: 'Marina Tower Unit 2501',
        rightType: 'OWNERSHIP',
        jurisdiction: 'AE',
        state: 'DRAFT',
        createdAt: '2025-01-08T10:32:45Z',
    }, null, 2),
    timeline: [
        { label: 'DNS Lookup', ms: 5 },
        { label: 'TCP Connection', ms: 12 },
        { label: 'TLS Handshake', ms: 28 },
        { label: 'Request Sent', ms: 2 },
        { label: 'Server Processing', ms: 180 },
        { label: 'Response Received', ms: 18 },
    ],
};

interface LogDetailPanelProps {
    log?: LogEntry;
}

export function LogDetailPanel({ log = SAMPLE_LOG }: LogDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<'request' | 'response' | 'timeline'>('request');
    const [copied, setCopied] = useState(false);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const totalMs = log.timeline.reduce((sum, t) => sum + t.ms, 0);

    return (
        <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4">
                <span className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                    log.method === 'GET' ? 'bg-blue-400/10 text-blue-400'
                    : log.method === 'POST' ? 'bg-green-400/10 text-green-400'
                    : 'bg-yellow-400/10 text-yellow-400'
                }`}>
                    {log.method}
                </span>
                <code className="text-sm font-mono text-white">{log.endpoint}</code>
                <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                    log.statusCode < 300 ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}>
                    {log.statusCode}
                </span>
                <span className="text-xs text-gray-500">{log.duration}</span>
                <code className="text-xs text-gray-600 font-mono ml-auto">{log.requestId}</code>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg w-fit">
                {(['request', 'response', 'timeline'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 rounded-md text-sm transition-colors capitalize ${
                            activeTab === tab
                                ? 'bg-[#F8B032] text-black font-medium'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Request Tab */}
            {activeTab === 'request' && (
                <div className="space-y-4">
                    <div>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Headers</h4>
                        <div className="glass-card p-3 space-y-1">
                            {Object.entries(log.requestHeaders).map(([key, value]) => (
                                <div key={key} className="flex gap-2 text-xs font-mono">
                                    <span className="text-[#F8B032]">{key}:</span>
                                    <span className="text-gray-400">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {log.requestBody && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase">Body</h4>
                                <button onClick={() => handleCopy(log.requestBody!)} className="p-1 hover:bg-white/10 rounded transition-colors">
                                    {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
                                </button>
                            </div>
                            <pre className="glass-card p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                                {log.requestBody}
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* Response Tab */}
            {activeTab === 'response' && (
                <div className="space-y-4">
                    <div>
                        <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Headers</h4>
                        <div className="glass-card p-3 space-y-1">
                            {Object.entries(log.responseHeaders).map(([key, value]) => (
                                <div key={key} className="flex gap-2 text-xs font-mono">
                                    <span className="text-[#F8B032]">{key}:</span>
                                    <span className="text-gray-400">{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase">Body</h4>
                            <button onClick={() => handleCopy(log.responseBody)} className="p-1 hover:bg-white/10 rounded transition-colors">
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
                            </button>
                        </div>
                        <pre className="glass-card p-3 text-xs font-mono text-green-300/80 overflow-x-auto">
                            {log.responseBody}
                        </pre>
                    </div>
                </div>
            )}

            {/* Timeline Tab */}
            {activeTab === 'timeline' && (
                <div className="glass-card p-4 space-y-3">
                    {log.timeline.map((step) => {
                        const pct = (step.ms / totalMs) * 100;
                        return (
                            <div key={step.label} className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 w-36">{step.label}</span>
                                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#F8B032]/60 rounded-full"
                                        style={{ width: `${Math.max(pct, 2)}%` }}
                                    />
                                </div>
                                <span className="text-xs font-mono text-gray-500 w-12 text-right">{step.ms}ms</span>
                            </div>
                        );
                    })}
                    <div className="pt-2 border-t border-white/10 flex justify-between text-xs">
                        <span className="text-gray-400">Total</span>
                        <span className="font-mono text-white">{totalMs}ms</span>
                    </div>
                </div>
            )}
        </div>
    );
}
