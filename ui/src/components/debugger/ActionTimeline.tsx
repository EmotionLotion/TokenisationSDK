import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { StateSnapshot } from '../../store';

interface ActionTimelineProps {
  snapshots: StateSnapshot[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function ActionTimeline({ snapshots, currentIndex, onSelect }: ActionTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentIndex]);

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm italic p-4">
        No actions recorded yet. Interact with the SDK to see actions here.
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="overflow-y-auto h-full space-y-1 p-2">
      {snapshots.map((snap, i) => {
        const isActive = i === currentIndex;
        const time = new Date(snap.timestamp).toLocaleTimeString();
        const payloadSummary = snap.payload
          ? JSON.stringify(snap.payload).slice(0, 60)
          : '';

        return (
          <motion.button
            key={snap.index}
            ref={isActive ? activeRef : undefined}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
            onClick={() => onSelect(i)}
            className={`w-full text-left p-2.5 rounded-lg transition-all border ${
              isActive
                ? 'bg-amber-500/10 border-amber-500/30 ring-1 ring-amber-500/20'
                : 'bg-white/[0.02] border-transparent hover:bg-white/5 hover:border-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isActive ? 'bg-amber-500' : 'bg-white/20'
                  }`}
                />
                <span
                  className={`text-xs font-mono font-bold truncate ${
                    isActive ? 'text-amber-400' : 'text-gray-300'
                  }`}
                >
                  {snap.actionName}
                </span>
              </div>
              <span className="text-[10px] text-gray-600 font-mono shrink-0">{time}</span>
            </div>
            {payloadSummary && (
              <p className="text-[10px] text-gray-600 font-mono mt-1 ml-4 truncate">
                {payloadSummary}
              </p>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
