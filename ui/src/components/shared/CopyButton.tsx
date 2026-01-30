import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
  text: string;
  className?: string;
  label?: string;
}

export function CopyButton({ text, className = '', label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 p-1.5 rounded hover:bg-white/10 transition-colors ${className}`}
      title={copied ? 'Copied!' : (label || 'Copy to clipboard')}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-500" />
      )}
      {label && (
        <span className="text-xs text-gray-500">{copied ? 'Copied' : label}</span>
      )}
    </button>
  );
}
