import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bug } from 'lucide-react';
import { TimeTravelDebugger } from '../components/debugger/TimeTravelDebugger';

export function DebuggerPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            <Bug className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Time-Travel Debugger</h1>
            <p className="text-sm text-gray-400">Inspect state snapshots, view diffs, and replay actions</p>
          </div>
        </div>
      </div>

      {/* Debugger */}
      <TimeTravelDebugger />
    </div>
  );
}
