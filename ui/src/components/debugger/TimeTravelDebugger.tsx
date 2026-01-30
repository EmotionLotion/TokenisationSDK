import { useState, useEffect } from 'react';
import { sdkStore } from '../../store';
import { useSDKStore } from '../../core/store';
import type { StateSnapshot } from '../../store';
import { ActionTimeline } from './ActionTimeline';
import { JsonTreeViewer } from './JsonTreeViewer';
import { StateDiffViewer } from './StateDiffViewer';
import { TimeTravelControls } from './TimeTravelControls';
import { ManualOverridePanel } from './ManualOverridePanel';

type Tab = 'state' | 'diff' | 'overrides';

export function TimeTravelDebugger() {
  // Use Zustand subscribeWithSelector for granular updates
  const zustandSnapshots = useSDKStore(s => s.snapshots);
  const zustandCurrentIndex = useSDKStore(s => s.currentSnapshotIndex);
  const zustandIsTimeTraveling = useSDKStore(s => s.isTimeTraveling);

  // Also maintain legacy sync for backward compat
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isTimeTraveling, setIsTimeTraveling] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('state');

  useEffect(() => {
    const sync = () => {
      setSnapshots(sdkStore.getSnapshots());
      setCurrentIndex(sdkStore.getCurrentSnapshotIndex());
      setIsTimeTraveling(sdkStore.getIsTimeTraveling());
    };
    sync();
    const unsub = sdkStore.subscribe(sync);
    return unsub;
  }, []);

  // Merge: prefer legacy store snapshots (they have actual data), fall back to zustand
  const effectiveSnapshots = snapshots.length > 0 ? snapshots : zustandSnapshots;
  const effectiveIndex = snapshots.length > 0 ? currentIndex : zustandCurrentIndex;
  const effectiveTimeTraveling = snapshots.length > 0 ? isTimeTraveling : zustandIsTimeTraveling;

  const handleJump = (index: number) => {
    sdkStore.jumpToSnapshot(index);
    useSDKStore.getState().jumpToSnapshot(index);
  };

  const handleReturnToLive = () => {
    sdkStore.returnToLive();
    useSDKStore.getState().returnToLive();
  };

  const handleClear = () => {
    sdkStore.clearSnapshots();
    useSDKStore.getState().clearSnapshots();
  };

  const currentSnapshot = effectiveIndex >= 0 && effectiveIndex < effectiveSnapshots.length
    ? effectiveSnapshots[effectiveIndex]
    : null;

  const prevSnapshot = effectiveIndex > 0 ? effectiveSnapshots[effectiveIndex - 1] : null;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'state', label: 'State Inspector' },
    { id: 'diff', label: 'Diff View' },
    { id: 'overrides', label: 'Manual Overrides' },
  ];

  return (
    <div className="space-y-4">
      {/* Time Travel Banner */}
      {effectiveTimeTraveling && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-sm font-medium text-amber-400">
              Time Travel Mode — Viewing snapshot {effectiveIndex + 1} of {effectiveSnapshots.length}
            </span>
          </div>
          <button
            onClick={handleReturnToLive}
            className="text-xs text-amber-400 hover:text-amber-300 underline transition-colors"
          >
            Return to Live
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="glass-card rounded-xl border border-white/10 p-4">
        <TimeTravelControls
          snapshotCount={effectiveSnapshots.length}
          currentIndex={effectiveIndex}
          isTimeTraveling={effectiveTimeTraveling}
          onJump={handleJump}
          onReturnToLive={handleReturnToLive}
          onClear={handleClear}
        />
      </div>

      {/* Main Content: 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ minHeight: '500px' }}>
        {/* Left: Action Timeline */}
        <div className="lg:col-span-4 glass-card rounded-xl border border-white/10 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
              Action History ({effectiveSnapshots.length})
            </h3>
          </div>
          <div className="flex-1 overflow-hidden">
            <ActionTimeline
              snapshots={effectiveSnapshots}
              currentIndex={effectiveIndex}
              onSelect={handleJump}
            />
          </div>
        </div>

        {/* Right: Tabbed Panel */}
        <div className="lg:col-span-8 glass-card rounded-xl border border-white/10 overflow-hidden flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-white/10 bg-white/[0.02]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs font-medium transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-amber-400 border-amber-500'
                    : 'text-gray-500 border-transparent hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
            {currentSnapshot && (
              <div className="ml-auto px-4 py-3 text-[10px] text-gray-600 font-mono">
                {currentSnapshot.actionName} @ {new Date(currentSnapshot.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'state' && (
              <JsonTreeViewer
                data={currentSnapshot?.state || null}
                label="store"
                defaultExpanded={2}
              />
            )}
            {activeTab === 'diff' && (
              <StateDiffViewer prev={prevSnapshot} current={currentSnapshot} />
            )}
            {activeTab === 'overrides' && <ManualOverridePanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
