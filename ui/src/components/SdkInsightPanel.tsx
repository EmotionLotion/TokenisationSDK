import { useState, useEffect } from 'react';
import { Terminal, X, ChevronRight, Copy, Check } from 'lucide-react';
import { sdkStore } from '../store';

export function SdkInsightPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [logs, setLogs] = useState<{ id: string; method: string; params: any; timestamp: string }[]>([]);
    const [showCopied, setShowCopied] = useState<string | null>(null);

    useEffect(() => {
        const loadLogs = () => {
            const allLogs = sdkStore.getSdkLogs();
            setLogs(allLogs);
            // Auto-open on new log if it's recent
            if (allLogs.length > 0) {
                const uniqueId = allLogs[0].id;
                // logic to peek could go here, but let's keep it manual or persistent for now
            }
        };

        loadLogs();
        const unsubscribe = sdkStore.subscribe(loadLogs);
        return () => unsubscribe();
    }, []);

    // Effect to auto-open on new logs (optional, might be annoying, let's just show a badge/pulse)
    useEffect(() => {
        if (logs.length > 0) {
            setIsOpen(true);
            const timer = setTimeout(() => setIsOpen(false), 5000); // Auto close after 5s
            return () => clearTimeout(timer);
        }
    }, [logs.length]); // Dependencies could be better but this triggers on count change

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setShowCopied(id);
        setTimeout(() => setShowCopied(null), 2000);
    };

    if (logs.length === 0) return null;

    return (
        <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-3rem)]'}`}>
            <div className="bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl w-96 overflow-hidden flex flex-col max-h-[500px]">
                {/* Header */}
                <div
                    className="flex items-center justify-between p-3 bg-white/5 cursor-pointer border-b border-white/10"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center border border-white/10">
                            <Terminal className="w-4 h-4 text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white">SDK Insight</p>
                            <p className="text-[10px] text-gray-500 font-mono">Connected to Polygon Amoy</p>
                        </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                </div>

                {/* Content */}
                <div className="overflow-y-auto p-3 space-y-3 bg-black/50 scrollbar-thin scrollbar-thumb-white/10">
                    {logs.map((log) => (
                        <div key={log.id} className="group relative">
                            <div className="absolute left-0 top-3 bottom-0 w-px bg-white/10 ml-1.5" />
                            <div className="flex gap-3">
                                <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-black mt-1.5 relative z-10 shrink-0 animate-pulse" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-mono text-green-400 font-bold">{log.method}</span>
                                        <span className="text-[10px] text-gray-600 font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="bg-[#0c0c0c] rounded-lg p-2 border border-white/5 font-mono text-[10px] text-gray-300 overflow-x-auto relative">
                                        <pre>{JSON.stringify(log.params, null, 2)}</pre>
                                        <button
                                            onClick={() => copyToClipboard(JSON.stringify(log.params, null, 2), log.id)}
                                            className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            {showCopied === log.id ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-gray-500" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
