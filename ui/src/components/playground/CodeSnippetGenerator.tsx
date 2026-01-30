import { useState } from 'react';
import { Code, ChevronDown, ChevronRight } from 'lucide-react';
import { highlightCode } from '../CodePanel';
import { CopyButton } from '../shared/CopyButton';
import type { ShowcaseStep } from '../showcases/types';

interface CodeSnippetGeneratorProps {
  step: ShowcaseStep | null;
}

export function CodeSnippetGenerator({ step }: CodeSnippetGeneratorProps) {
  const [expanded, setExpanded] = useState(true);

  if (!step) {
    return (
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 text-gray-600">
          <Code className="w-4 h-4" />
          <span className="text-xs">Select a step to view its code snippet</span>
        </div>
      </div>
    );
  }

  const formattedCode = `// Step ${step.id}: ${step.title}
// ${step.description}

${step.code}`;

  return (
    <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/10 hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
          )}
          <Code className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-medium text-gray-300">
            Step {step.id}: {step.title}
          </span>
        </div>
        <CopyButton text={formattedCode} />
      </button>

      {/* Code */}
      {expanded && (
        <div className="bg-[#0d1117] p-4 overflow-auto max-h-[400px]">
          <pre className="text-[13px] leading-relaxed font-mono whitespace-pre-wrap">
            <code dangerouslySetInnerHTML={{ __html: highlightCode(step.code) }} />
          </pre>
        </div>
      )}
    </div>
  );
}
