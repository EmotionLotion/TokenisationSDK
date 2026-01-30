import { SkipBack, SkipForward, StepBack, StepForward, RotateCcw, Trash2 } from 'lucide-react';

interface TimeTravelControlsProps {
  snapshotCount: number;
  currentIndex: number;
  isTimeTraveling: boolean;
  onJump: (index: number) => void;
  onReturnToLive: () => void;
  onClear: () => void;
}

export function TimeTravelControls({
  snapshotCount,
  currentIndex,
  isTimeTraveling,
  onJump,
  onReturnToLive,
  onClear,
}: TimeTravelControlsProps) {
  const canStepBack = currentIndex > 0;
  const canStepForward = currentIndex < snapshotCount - 1;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Time Travel Badge */}
      {isTimeTraveling && (
        <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded">
          Time Travel
        </span>
      )}

      {/* Transport Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onJump(0)}
          disabled={!canStepBack}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to first"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => onJump(currentIndex - 1)}
          disabled={!canStepBack}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step back"
        >
          <StepBack className="w-4 h-4" />
        </button>
        <button
          onClick={() => onJump(currentIndex + 1)}
          disabled={!canStepForward}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Step forward"
        >
          <StepForward className="w-4 h-4" />
        </button>
        <button
          onClick={() => onJump(snapshotCount - 1)}
          disabled={!canStepForward}
          className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Jump to last"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      {/* Slider */}
      {snapshotCount > 1 && (
        <input
          type="range"
          min={0}
          max={snapshotCount - 1}
          value={currentIndex >= 0 ? currentIndex : 0}
          onChange={(e) => onJump(Number(e.target.value))}
          className="flex-1 min-w-[100px] max-w-[300px] h-1.5 accent-amber-500 bg-white/10 rounded-full appearance-none cursor-pointer"
        />
      )}

      {/* Indicator */}
      <span className="text-xs text-gray-500 font-mono">
        {snapshotCount > 0
          ? `Snapshot ${currentIndex + 1} of ${snapshotCount}`
          : 'No snapshots'}
      </span>

      {/* Live Badge */}
      {!isTimeTraveling && snapshotCount > 0 && (
        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-green-500/20 text-green-400 border border-green-500/30 rounded">
          Live
        </span>
      )}

      {/* Return to Live */}
      {isTimeTraveling && (
        <button
          onClick={onReturnToLive}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/30 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Return to Live
        </button>
      )}

      {/* Clear */}
      <button
        onClick={onClear}
        disabled={snapshotCount === 0}
        className="p-1.5 rounded hover:bg-white/10 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Clear all snapshots"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
