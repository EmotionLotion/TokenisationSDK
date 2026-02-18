import { useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import type { ApiEndpoint } from '../../data/api-endpoints';

interface TryItPanelProps {
    endpoint: ApiEndpoint;
}

export function TryItPanel({ endpoint }: TryItPanelProps) {
    const allInputParams = [
        ...(endpoint.params || []),
        ...(endpoint.queryParams || []),
        ...(endpoint.bodyParams || []),
    ];

    const [values, setValues] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const p of allInputParams) {
            initial[p.name] = '';
        }
        return initial;
    });
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState<string | null>(null);

    const handleSend = () => {
        setLoading(true);
        setResponse(null);
        // Simulate API call
        setTimeout(() => {
            setLoading(false);
            setResponse(endpoint.responseExample || '{ "status": "ok" }');
        }, 800);
    };

    return (
        <div className="glass-card p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">Try It</h3>

            {allInputParams.length > 0 && (
                <div className="space-y-3 mb-4">
                    {allInputParams.map((param) => (
                        <div key={param.name}>
                            <label className="block text-xs text-gray-400 mb-1">
                                {param.name}
                                {param.required && <span className="text-red-400 ml-1">*</span>}
                                <span className="text-gray-600 ml-2">({param.type})</span>
                            </label>
                            <input
                                type="text"
                                value={values[param.name] || ''}
                                onChange={(e) => setValues({ ...values, [param.name]: e.target.value })}
                                placeholder={param.description}
                                className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white font-mono placeholder-gray-600 focus:outline-none focus:border-[#F8B032]/50"
                            />
                        </div>
                    ))}
                </div>
            )}

            <button
                onClick={handleSend}
                disabled={loading}
                className="px-4 py-2 bg-gradient-to-r from-[#F8B032] to-[#E8A633] text-black font-medium rounded-lg hover:shadow-lg hover:shadow-[#F8B032]/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
                {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Play className="w-4 h-4" />
                )}
                Send Request
            </button>

            {response && (
                <div className="mt-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 text-xs rounded bg-green-400/10 text-green-400 font-mono">200 OK</span>
                        <span className="text-xs text-gray-500">~145ms</span>
                    </div>
                    <pre className="p-4 bg-black/40 rounded-lg text-sm font-mono text-green-300/80 overflow-x-auto max-h-64 overflow-y-auto">
                        {response}
                    </pre>
                </div>
            )}
        </div>
    );
}
