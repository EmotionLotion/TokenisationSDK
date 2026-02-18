import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export interface CodeBlockProps {
    code?: string;
    language?: string;
    tabs?: { label: string; code: string }[];
}

export function CodeBlock({ code, language = 'bash', tabs }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    const displayCode = tabs ? tabs[activeTab].code : (code ?? '');

    const handleCopy = () => {
        navigator.clipboard.writeText(displayCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-lg border border-white/10 overflow-hidden">
            {tabs && (
                <div className="flex items-center gap-0 border-b border-white/10 bg-white/5">
                    {tabs.map((tab, index) => (
                        <button
                            key={tab.label}
                            onClick={() => setActiveTab(index)}
                            className={`px-4 py-2 text-xs font-medium transition-colors ${
                                index === activeTab
                                    ? 'text-[#F8B032] border-b-2 border-[#F8B032] bg-white/5'
                                    : 'text-gray-400 hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}
            <div className="relative group">
                <pre className="p-4 bg-black/40 overflow-x-auto text-sm">
                    <code className={`language-${language} text-gray-300 font-mono`}>
                        {displayCode}
                    </code>
                </pre>
                <button
                    onClick={handleCopy}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-white/5 border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10"
                >
                    {copied ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                        <Copy className="w-3.5 h-3.5 text-gray-400" />
                    )}
                </button>
            </div>
        </div>
    );
}
