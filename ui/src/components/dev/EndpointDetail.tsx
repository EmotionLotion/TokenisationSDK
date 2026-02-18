import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { ApiEndpoint } from '../../data/api-endpoints';
import { TryItPanel } from './TryItPanel';

const METHOD_COLORS: Record<string, string> = {
    GET: 'bg-blue-400/10 text-blue-400 border-blue-400/30',
    POST: 'bg-green-400/10 text-green-400 border-green-400/30',
    PUT: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30',
    PATCH: 'bg-orange-400/10 text-orange-400 border-orange-400/30',
    DELETE: 'bg-red-400/10 text-red-400 border-red-400/30',
};

type CodeTab = 'curl' | 'javascript' | 'python';

interface EndpointDetailProps {
    endpoint: ApiEndpoint;
}

export function EndpointDetail({ endpoint }: EndpointDetailProps) {
    const [codeTab, setCodeTab] = useState<CodeTab>('curl');
    const [copied, setCopied] = useState(false);

    const allParams = [
        ...(endpoint.params || []).map(p => ({ ...p, location: 'path' })),
        ...(endpoint.queryParams || []).map(p => ({ ...p, location: 'query' })),
        ...(endpoint.bodyParams || []).map(p => ({ ...p, location: 'body' })),
    ];

    const codeExamples: Record<CodeTab, string | undefined> = {
        curl: endpoint.curlExample,
        javascript: endpoint.jsExample,
        python: endpoint.pythonExample,
    };

    const activeCode = codeExamples[codeTab] || '';

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="space-y-6">
            {/* Method + Path */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded-md text-xs font-bold border ${METHOD_COLORS[endpoint.method]}`}>
                        {endpoint.method}
                    </span>
                    <code className="text-lg font-mono text-white">{endpoint.path}</code>
                </div>
                <h2 className="text-xl font-semibold text-white">{endpoint.summary}</h2>
                <p className="text-gray-400 mt-1">{endpoint.description}</p>
            </div>

            {/* Parameters Table */}
            {allParams.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Parameters</h3>
                    <div className="glass-card overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left p-3 text-xs text-gray-500 font-medium">Name</th>
                                    <th className="text-left p-3 text-xs text-gray-500 font-medium">Type</th>
                                    <th className="text-left p-3 text-xs text-gray-500 font-medium">In</th>
                                    <th className="text-left p-3 text-xs text-gray-500 font-medium">Required</th>
                                    <th className="text-left p-3 text-xs text-gray-500 font-medium">Description</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {allParams.map((param) => (
                                    <tr key={`${param.location}-${param.name}`}>
                                        <td className="p-3 font-mono text-[#F8B032]">{param.name}</td>
                                        <td className="p-3 font-mono text-gray-400">{param.type}</td>
                                        <td className="p-3">
                                            <span className="px-2 py-0.5 text-xs rounded bg-white/5 text-gray-400">
                                                {param.location}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            {param.required ? (
                                                <span className="text-red-400 text-xs font-medium">required</span>
                                            ) : (
                                                <span className="text-gray-600 text-xs">optional</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-gray-400">{param.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Request / Response */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {endpoint.requestExample && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Request Body</h3>
                        <div className="glass-card overflow-hidden relative group">
                            <pre className="p-4 text-sm font-mono text-gray-300 overflow-x-auto">
                                {endpoint.requestExample}
                            </pre>
                            <button
                                onClick={() => handleCopy(endpoint.requestExample!)}
                                className="absolute top-3 right-3 p-1.5 rounded bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
                            </button>
                        </div>
                    </div>
                )}
                {endpoint.responseExample && (
                    <div>
                        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Response</h3>
                        <div className="glass-card overflow-hidden relative group">
                            <pre className="p-4 text-sm font-mono text-green-300/80 overflow-x-auto">
                                {endpoint.responseExample}
                            </pre>
                            <button
                                onClick={() => handleCopy(endpoint.responseExample!)}
                                className="absolute top-3 right-3 p-1.5 rounded bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Code Examples */}
            <div>
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Code Examples</h3>
                <div className="glass-card overflow-hidden">
                    <div className="flex items-center border-b border-white/10 bg-white/5">
                        {(['curl', 'javascript', 'python'] as CodeTab[]).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setCodeTab(tab)}
                                className={`px-4 py-2 text-xs font-medium transition-colors capitalize ${
                                    codeTab === tab
                                        ? 'text-[#F8B032] border-b-2 border-[#F8B032] bg-white/5'
                                        : 'text-gray-400 hover:text-white'
                                }`}
                            >
                                {tab === 'curl' ? 'cURL' : tab === 'javascript' ? 'JavaScript' : 'Python'}
                            </button>
                        ))}
                    </div>
                    <div className="relative group">
                        <pre className="p-4 text-sm font-mono text-gray-300 overflow-x-auto">
                            {activeCode}
                        </pre>
                        <button
                            onClick={() => handleCopy(activeCode)}
                            className="absolute top-3 right-3 p-1.5 rounded bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-400" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Try It */}
            <TryItPanel endpoint={endpoint} />
        </div>
    );
}
