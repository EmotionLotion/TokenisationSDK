import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface JsonTreeViewerProps {
  data: any;
  label?: string;
  defaultExpanded?: number;
}

function ValueDisplay({ value }: { value: any }) {
  if (value === null) return <span className="text-gray-500 italic">null</span>;
  if (value === undefined) return <span className="text-gray-500 italic">undefined</span>;
  if (typeof value === 'string') return <span className="text-green-400">"{value}"</span>;
  if (typeof value === 'number') return <span className="text-amber-400">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-purple-400">{String(value)}</span>;
  return <span className="text-gray-400">{String(value)}</span>;
}

function TreeNode({
  keyName,
  value,
  depth,
  defaultExpanded,
}: {
  keyName: string;
  value: any;
  depth: number;
  defaultExpanded: number;
}) {
  const isExpandable = value !== null && typeof value === 'object';
  const [expanded, setExpanded] = useState(depth < defaultExpanded);

  if (!isExpandable) {
    return (
      <div className="flex items-start gap-1 py-0.5" style={{ paddingLeft: depth * 16 }}>
        <span className="text-blue-300 text-xs font-mono shrink-0">{keyName}:</span>
        <span className="text-xs font-mono break-all">
          <ValueDisplay value={value} />
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as [string, any])
    : Object.entries(value);

  const summary = Array.isArray(value)
    ? `Array(${value.length})`
    : `{${Object.keys(value).length}}`;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 py-0.5 hover:bg-white/5 rounded w-full text-left"
        style={{ paddingLeft: depth * 16 }}
      >
        <ChevronRight
          className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="text-blue-300 text-xs font-mono">{keyName}:</span>
        {!expanded && <span className="text-gray-600 text-xs font-mono ml-1">{summary}</span>}
      </button>
      {expanded && (
        <div>
          {entries.map(([k, v]) => (
            <TreeNode
              key={k}
              keyName={k}
              value={v}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTreeViewer({ data, label = 'State', defaultExpanded = 2 }: JsonTreeViewerProps) {
  if (data === null || data === undefined) {
    return (
      <div className="p-4 text-gray-600 text-sm italic">No state data available</div>
    );
  }

  return (
    <div className="bg-[#0d1117] rounded-lg border border-white/5 p-3 overflow-auto max-h-[500px] font-mono text-xs">
      <TreeNode keyName={label} value={data} depth={0} defaultExpanded={defaultExpanded} />
    </div>
  );
}
