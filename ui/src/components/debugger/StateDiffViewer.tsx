import type { StateSnapshot } from '../../store';

interface StateDiffViewerProps {
  prev: StateSnapshot | null;
  current: StateSnapshot | null;
}

interface DiffEntry {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: any;
  newValue?: any;
}

function computeDiff(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  path = ''
): DiffEntry[] {
  const diffs: DiffEntry[] = [];
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

  for (const key of allKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const oldVal = oldObj?.[key];
    const newVal = newObj?.[key];

    if (oldVal === undefined && newVal !== undefined) {
      diffs.push({ path: fullPath, type: 'added', newValue: newVal });
    } else if (oldVal !== undefined && newVal === undefined) {
      diffs.push({ path: fullPath, type: 'removed', oldValue: oldVal });
    } else if (
      typeof oldVal === 'object' && oldVal !== null &&
      typeof newVal === 'object' && newVal !== null &&
      !Array.isArray(oldVal) && !Array.isArray(newVal)
    ) {
      diffs.push(...computeDiff(oldVal, newVal, fullPath));
    } else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diffs.push({ path: fullPath, type: 'changed', oldValue: oldVal, newValue: newVal });
    }
  }

  return diffs;
}

function formatValue(val: any): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'object') {
    const s = JSON.stringify(val);
    return s.length > 80 ? s.slice(0, 77) + '...' : s;
  }
  return String(val);
}

export function StateDiffViewer({ prev, current }: StateDiffViewerProps) {
  if (!prev || !current) {
    return (
      <div className="p-4 text-gray-600 text-sm italic">
        Select two consecutive snapshots to view state diff
      </div>
    );
  }

  const diffs = computeDiff(prev.state, current.state);

  if (diffs.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm">No state changes between these snapshots</div>
    );
  }

  return (
    <div className="bg-[#0d1117] rounded-lg border border-white/5 p-3 overflow-auto max-h-[500px] space-y-1">
      <div className="text-xs text-gray-500 mb-2 font-mono">
        {diffs.length} change{diffs.length !== 1 ? 's' : ''} between snapshot {prev.index} and {current.index}
      </div>
      {diffs.map((diff, i) => (
        <div
          key={i}
          className={`rounded px-2 py-1.5 font-mono text-xs border ${
            diff.type === 'added'
              ? 'bg-green-500/5 border-green-500/20'
              : diff.type === 'removed'
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-amber-500/5 border-amber-500/20'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                diff.type === 'added'
                  ? 'bg-green-500/20 text-green-400'
                  : diff.type === 'removed'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-amber-500/20 text-amber-400'
              }`}
            >
              {diff.type}
            </span>
            <span className="text-blue-300 break-all">{diff.path}</span>
          </div>
          {diff.type === 'changed' && (
            <div className="mt-1 ml-4 space-y-0.5">
              <div className="text-red-400/70">
                <span className="text-gray-600">- </span>
                {formatValue(diff.oldValue)}
              </div>
              <div className="text-green-400/70">
                <span className="text-gray-600">+ </span>
                {formatValue(diff.newValue)}
              </div>
            </div>
          )}
          {diff.type === 'added' && (
            <div className="mt-1 ml-4 text-green-400/70">
              <span className="text-gray-600">+ </span>
              {formatValue(diff.newValue)}
            </div>
          )}
          {diff.type === 'removed' && (
            <div className="mt-1 ml-4 text-red-400/70">
              <span className="text-gray-600">- </span>
              {formatValue(diff.oldValue)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
