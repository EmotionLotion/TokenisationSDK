import React, { useState, useCallback } from 'react';
import {
  Ticket,
  ShieldCheck,
  Plane,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { sdkStore } from '../../store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TicketState =
  | 'BOOKED'
  | 'CHECKED_IN'
  | 'TSA_VERIFIED'
  | 'BOARDED'
  | 'IN_FLIGHT'
  | 'LANDED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DELAYED'
  | 'REFUNDED';

interface TicketLifecycleManagerProps {
  ticketId?: string;
  initialState?: TicketState;
  passengerName?: string;
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureTime?: string;
  onStateChange?: (from: TicketState, to: TicketState) => void;
  onComplete?: () => void;
}

interface HistoryEntry {
  from: TicketState;
  to: TicketState;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<TicketState, TicketState[]> = {
  BOOKED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['TSA_VERIFIED', 'CANCELLED'],
  TSA_VERIFIED: ['BOARDED', 'CANCELLED'],
  BOARDED: ['IN_FLIGHT'],
  IN_FLIGHT: ['LANDED', 'DELAYED'],
  LANDED: ['COMPLETED'],
  DELAYED: ['IN_FLIGHT', 'CANCELLED'],
  CANCELLED: ['REFUNDED'],
  COMPLETED: [],
  REFUNDED: [],
};

const HAPPY_PATH: TicketState[] = [
  'BOOKED',
  'CHECKED_IN',
  'TSA_VERIFIED',
  'BOARDED',
  'IN_FLIGHT',
  'LANDED',
  'COMPLETED',
];

const STATE_LABELS: Record<TicketState, string> = {
  BOOKED: 'Booked',
  CHECKED_IN: 'Checked In',
  TSA_VERIFIED: 'TSA Verified',
  BOARDED: 'Boarded',
  IN_FLIGHT: 'In Flight',
  LANDED: 'Landed',
  COMPLETED: 'Complete',
  CANCELLED: 'Cancelled',
  DELAYED: 'Delayed',
  REFUNDED: 'Refunded',
};

const STATE_ICONS: Record<TicketState, React.ReactNode> = {
  BOOKED: <Ticket className="w-4 h-4" />,
  CHECKED_IN: <CheckCircle className="w-4 h-4" />,
  TSA_VERIFIED: <ShieldCheck className="w-4 h-4" />,
  BOARDED: <ArrowRight className="w-4 h-4" />,
  IN_FLIGHT: <Plane className="w-4 h-4" />,
  LANDED: <Plane className="w-4 h-4 rotate-90" />,
  COMPLETED: <CheckCircle className="w-4 h-4" />,
  CANCELLED: <XCircle className="w-4 h-4" />,
  DELAYED: <Clock className="w-4 h-4" />,
  REFUNDED: <RefreshCw className="w-4 h-4" />,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function happyPathIndex(state: TicketState): number {
  return HAPPY_PATH.indexOf(state);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TicketLifecycleManager: React.FC<TicketLifecycleManagerProps> = ({
  ticketId = 'TKT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
  initialState = 'BOOKED',
  passengerName = 'Jane Doe',
  flightNumber = 'AH-1042',
  origin = 'DXB',
  destination = 'LHR',
  departureTime = new Date(Date.now() + 3600000).toISOString(),
  onStateChange,
  onComplete,
}) => {
  const [currentState, setCurrentState] = useState<TicketState>(initialState);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const transition = useCallback(
    (to: TicketState) => {
      const allowed = VALID_TRANSITIONS[currentState];
      if (!allowed.includes(to)) return;

      const entry: HistoryEntry = {
        from: currentState,
        to,
        timestamp: new Date().toISOString(),
      };

      sdkStore.logSdkCall('ticketLifecycle.transition', {
        ticketId,
        from: currentState,
        to,
      });

      setHistory((prev) => [...prev, entry]);
      setCurrentState(to);
      onStateChange?.(currentState, to);

      if (to === 'COMPLETED') {
        onComplete?.();
      }
    },
    [currentState, ticketId, onStateChange, onComplete],
  );

  const nextStates = VALID_TRANSITIONS[currentState];
  const currentHappyIdx = happyPathIndex(currentState);
  const isBranch = currentState === 'CANCELLED' || currentState === 'DELAYED' || currentState === 'REFUNDED';

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderTimelineStep = (state: TicketState, idx: number) => {
    const isActive = state === currentState && !isBranch;
    const isCompleted = currentHappyIdx > idx || (isBranch && idx < (happyPathIndex(history.length > 0 ? history[history.length - 1].from : currentState)));
    const completedViaBranch =
      !isActive &&
      !isCompleted &&
      history.some((h) => h.to === state);

    const dotClasses = isActive
      ? 'bg-blue-500 ring-2 ring-blue-400/50 text-white'
      : isCompleted || completedViaBranch
        ? 'bg-emerald-500 text-white'
        : 'bg-white/10 text-gray-500';

    const labelClasses = isActive
      ? 'text-blue-400 font-semibold'
      : isCompleted || completedViaBranch
        ? 'text-emerald-400'
        : 'text-gray-500';

    return (
      <div key={state} className="flex flex-col items-center relative z-10">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${dotClasses}`}
        >
          {STATE_ICONS[state]}
        </div>
        <span className={`mt-2 text-xs whitespace-nowrap ${labelClasses}`}>
          {STATE_LABELS[state]}
        </span>
      </div>
    );
  };

  const buttonColor = (to: TicketState): string => {
    if (to === 'CANCELLED') return 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30';
    if (to === 'DELAYED') return 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30';
    if (to === 'REFUNDED') return 'bg-orange-500/20 text-orange-400 border-orange-500/30 hover:bg-orange-500/30';
    return 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30';
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Ticket className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">Ticket Lifecycle</h3>
            <p className="text-gray-400 text-sm">{ticketId}</p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            currentState === 'COMPLETED'
              ? 'bg-emerald-500/20 text-emerald-400'
              : currentState === 'CANCELLED' || currentState === 'REFUNDED'
                ? 'bg-red-500/20 text-red-400'
                : currentState === 'DELAYED'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-blue-500/20 text-blue-400'
          }`}
        >
          {STATE_LABELS[currentState]}
        </span>
      </div>

      {/* Main content: timeline + details side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: timeline + actions (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Happy-path timeline */}
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="relative flex items-start justify-between">
              {/* Connector line */}
              <div className="absolute top-[18px] left-[18px] right-[18px] h-px bg-white/10" />
              {/* Completed connector overlay */}
              {currentHappyIdx > 0 && (
                <div
                  className="absolute top-[18px] left-[18px] h-px bg-emerald-500/60 transition-all duration-500"
                  style={{
                    width: `calc(${((isBranch ? Math.max(0, happyPathIndex(history.length > 0 ? history[history.length - 1].from : currentState)) : currentHappyIdx) / (HAPPY_PATH.length - 1)) * 100}% - 36px)`,
                  }}
                />
              )}
              {HAPPY_PATH.map((s, i) => renderTimelineStep(s, i))}
            </div>

            {/* Branching states (CANCELLED / DELAYED / REFUNDED) */}
            {(isBranch || history.some((h) => ['CANCELLED', 'DELAYED', 'REFUNDED'].includes(h.to))) && (
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 flex-wrap">
                <span className="text-xs text-gray-500 uppercase tracking-wider mr-2">Branches:</span>
                {(['DELAYED', 'CANCELLED', 'REFUNDED'] as TicketState[]).map((branch) => {
                  const isActiveBranch = currentState === branch;
                  const wasVisited = history.some((h) => h.to === branch);
                  if (!isActiveBranch && !wasVisited) return null;
                  return (
                    <div
                      key={branch}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                        isActiveBranch
                          ? branch === 'DELAYED'
                            ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                            : branch === 'CANCELLED'
                              ? 'bg-red-500/20 border-red-500/30 text-red-400'
                              : 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                          : 'bg-white/5 border-white/10 text-gray-400'
                      }`}
                    >
                      {STATE_ICONS[branch]}
                      <span>{STATE_LABELS[branch]}</span>
                      {isActiveBranch && (
                        <span className="ml-1 w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <h4 className="text-gray-300 text-sm font-medium mb-3">Available Actions</h4>
            {nextStates.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {nextStates.map((to) => (
                  <button
                    key={to}
                    onClick={() => transition(to)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${buttonColor(to)}`}
                  >
                    {STATE_ICONS[to]}
                    <span>{STATE_LABELS[to]}</span>
                    <ArrowRight className="w-3.5 h-3.5 ml-1 opacity-60" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm italic">
                No further transitions available. This ticket has reached a terminal state.
              </p>
            )}
          </div>
        </div>

        {/* Right: ticket details side panel */}
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-4">
            <h4 className="text-gray-300 text-sm font-medium">Ticket Details</h4>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Passenger</dt>
                <dd className="text-gray-200 font-medium">{passengerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Flight</dt>
                <dd className="text-gray-200 font-medium">{flightNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Route</dt>
                <dd className="text-gray-200 font-medium">
                  {origin} <ArrowRight className="w-3 h-3 inline mx-1 text-gray-500" /> {destination}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Departure</dt>
                <dd className="text-gray-200 font-medium">
                  {new Date(departureTime).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Transitions</dt>
                <dd className="text-gray-200 font-medium">{history.length}</dd>
              </div>
            </dl>
          </div>

          {/* State history log */}
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5 space-y-3">
            <h4 className="text-gray-300 text-sm font-medium">State History</h4>
            {history.length === 0 ? (
              <p className="text-gray-500 text-xs italic">No transitions yet.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {[...history].reverse().map((entry, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs border-l-2 border-white/10 pl-3 py-1"
                  >
                    <Clock className="w-3 h-3 text-gray-500 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-gray-400">{formatTime(entry.timestamp)}</span>
                      <div className="text-gray-300 mt-0.5">
                        <span className="text-gray-400">{STATE_LABELS[entry.from]}</span>
                        <ArrowRight className="w-3 h-3 inline mx-1 text-gray-600" />
                        <span
                          className={
                            entry.to === 'CANCELLED' || entry.to === 'REFUNDED'
                              ? 'text-red-400'
                              : entry.to === 'DELAYED'
                                ? 'text-amber-400'
                                : entry.to === 'COMPLETED'
                                  ? 'text-emerald-400'
                                  : 'text-blue-400'
                          }
                        >
                          {STATE_LABELS[entry.to]}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TicketLifecycleManager;
