import React from 'react';
import {
  Ticket,
  Plane,
  Clock,
  MapPin,
  ArrowRight,
  CheckCircle,
  XCircle,
  Ban,
  Flame,
  AlertTriangle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TicketState =
  | 'ISSUED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'BOARDED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'BURNED'
  | 'VOID';

export interface TicketStatusProps {
  ticketId: string;
  status: TicketState;
  flightNumber?: string;
  passengerName?: string;
  departureTime?: string;
  seatNumber?: string;
  gate?: string;
  transferable?: boolean;
  transferCount?: number;
  maxTransfers?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROGRESSION: TicketState[] = ['ISSUED', 'CONFIRMED', 'CHECKED_IN', 'BOARDED', 'COMPLETED'];

const TERMINAL_STATES: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  CANCELLED: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Cancelled' },
  REFUNDED: { icon: Ban, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Refunded' },
  EXPIRED: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20', label: 'Expired' },
  BURNED: { icon: Flame, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', label: 'Burned' },
  VOID: { icon: AlertTriangle, color: 'text-gray-400', bg: 'bg-gray-500/10 border-gray-500/20', label: 'Void' },
};

const STEP_LABELS: Record<string, string> = {
  ISSUED: 'Issued',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked In',
  BOARDED: 'Boarded',
  COMPLETED: 'Completed',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TicketStatusComponent({
  ticketId,
  status,
  flightNumber,
  passengerName,
  departureTime,
  seatNumber,
  gate,
  transferable,
  transferCount,
  maxTransfers,
  className = '',
}: TicketStatusProps) {
  const isTerminal = status in TERMINAL_STATES;
  const terminalCfg = isTerminal ? TERMINAL_STATES[status] : null;
  const currentStepIdx = PROGRESSION.indexOf(status);

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">Ticket Status</span>
          </div>
          {isTerminal && terminalCfg ? (
            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${terminalCfg.bg} ${terminalCfg.color}`}>
              {React.createElement(terminalCfg.icon, { className: 'w-3 h-3' })}
              {terminalCfg.label}
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-green-500/10 border-green-500/20 text-green-400">
              {STEP_LABELS[status] || status}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1 font-mono">{ticketId}</p>
        {passengerName && <h3 className="text-lg font-semibold text-white mt-1">{passengerName}</h3>}
      </div>

      {/* Status Progression */}
      {!isTerminal && (
        <div className="px-5 py-4 border-b border-white/5">
          <div className="flex items-center gap-1">
            {PROGRESSION.map((step, i) => {
              const isCompleted = i <= currentStepIdx;
              const isCurrent = i === currentStepIdx;
              return (
                <React.Fragment key={step}>
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        isCompleted
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-white/5 text-gray-600'
                      } ${isCurrent ? 'ring-2 ring-green-400/50' : ''}`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span>{i + 1}</span>
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 text-center leading-tight ${isCompleted ? 'text-green-400' : 'text-gray-600'}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {i < PROGRESSION.length - 1 && (
                    <div className={`h-0.5 flex-1 min-w-2 mt-[-16px] ${i < currentStepIdx ? 'bg-green-500/40' : 'bg-white/10'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Terminal state banner */}
      {isTerminal && terminalCfg && (
        <div className={`px-5 py-3 border-b border-white/5 ${terminalCfg.bg.split(' ')[0]}`}>
          <div className={`flex items-center gap-2 ${terminalCfg.color}`}>
            {React.createElement(terminalCfg.icon, { className: 'w-5 h-5' })}
            <span className="text-sm font-medium">This ticket has been {terminalCfg.label.toLowerCase()}.</span>
          </div>
        </div>
      )}

      {/* Flight Info */}
      {(flightNumber || departureTime || seatNumber || gate) && (
        <div className="px-5 py-3 border-b border-white/5 grid grid-cols-2 gap-2">
          {flightNumber && (
            <div className="flex items-center gap-2 text-sm">
              <Plane className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Flight</span>
              <span className="text-slate-200 ml-auto">{flightNumber}</span>
            </div>
          )}
          {departureTime && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Departure</span>
              <span className="text-slate-200 ml-auto">{departureTime}</span>
            </div>
          )}
          {seatNumber && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Seat</span>
              <span className="text-slate-200 ml-auto">{seatNumber}</span>
            </div>
          )}
          {gate && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-gray-500" />
              <span className="text-gray-500">Gate</span>
              <span className="text-slate-200 ml-auto">{gate}</span>
            </div>
          )}
        </div>
      )}

      {/* Transfer Info */}
      <div className="px-5 py-3 flex items-center justify-between">
        {transferable !== undefined && (
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
            transferable
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
          }`}>
            <ArrowRight className="w-3 h-3" />
            {transferable ? 'Transferable' : 'Non-transferable'}
          </span>
        )}
        {transferCount !== undefined && maxTransfers !== undefined && (
          <span className="text-xs text-gray-500">
            {transferCount} of {maxTransfers} transfers used
          </span>
        )}
      </div>
    </div>
  );
}
