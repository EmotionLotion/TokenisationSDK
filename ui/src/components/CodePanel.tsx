import { Terminal } from 'lucide-react';
import { useRef, useEffect } from 'react';
import { CopyButton } from './shared/CopyButton';

export function highlightCode(code: string): string {
  const keywords = ['const', 'let', 'var', 'await', 'async', 'new', 'return', 'import', 'from', 'export', 'function', 'if', 'else', 'true', 'false'];
  let result = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Strings (single and double quotes, template literals)
  result = result.replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, '<span class="text-green-400">$&</span>');

  // Comments
  result = result.replace(/(\/\/.*$)/gm, '<span class="text-gray-600">$&</span>');

  // Keywords
  const kwPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
  result = result.replace(kwPattern, '<span class="text-purple-400">$1</span>');

  // Function calls
  result = result.replace(/(\w+)\s*\(/g, '<span class="text-blue-400">$1</span>(');

  // Numbers
  result = result.replace(/\b(\d+[\d_]*\.?\d*)\b/g, '<span class="text-amber-400">$1</span>');

  return result;
}

interface CodePanelProps {
  code: string;
  log: string[];
}

export function CodePanel({ code, log }: CodePanelProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border border-white/10">
      {/* Code Section */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-white/10 bg-black/60 flex items-center gap-2 shrink-0">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-[11px] text-gray-500 font-mono ml-2">SDK Code</span>
          <div className="ml-auto">
            <CopyButton text={code} />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-[#0d1117] p-4">
          <pre className="text-[13px] leading-relaxed font-mono whitespace-pre-wrap">
            <code dangerouslySetInnerHTML={{ __html: highlightCode(code) }} />
          </pre>
        </div>
      </div>

      {/* Console Section */}
      <div className="h-[240px] shrink-0 flex flex-col border-t border-white/10">
        <div className="px-4 py-2 bg-black/60 flex items-center gap-2 border-b border-white/5 shrink-0">
          <Terminal className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-[11px] text-gray-500 font-mono">Console</span>
        </div>
        <div ref={logRef} className="flex-1 overflow-auto bg-black/40 p-3 font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-gray-600 italic">Run a step to see output...</p>
          ) : (
            log.map((line, i) => (
              <div
                key={i}
                className={`py-0.5 ${
                  line.includes('✓') ? 'text-green-400' :
                  line.startsWith('▶') ? 'text-blue-400 font-bold mt-2' :
                  line.startsWith('🎉') ? 'text-yellow-400 font-bold mt-2' :
                  line.startsWith('🚀') ? 'text-blue-400 font-bold' :
                  'text-gray-400'
                }`}
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
