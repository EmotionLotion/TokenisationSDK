import React from 'react';
import {
  Calendar,
  ArrowRight,
  Clock,
  Plane,
  Navigation,
  MapPin,
  XCircle,
  Plane as PlaneIcon,
} from 'lucide-react';

export interface FlightEvent {
  type: 'scheduled' | 'gate_change' | 'delay' | 'boarding' | 'departed' | 'diverted' | 'landed' | 'cancelled';
  timestamp: string;
  details?: string;
}

export interface FlightEventTimelineProps {
  events: FlightEvent[];
  flightNumber: string;
  className?: string;
}

const EVENT_CONFIG: Record<
  FlightEvent['type'],
  { icon: React.ComponentType<{ className?: string }>; color: string; dotBg: string; label: string }
> = {
  scheduled: { icon: Calendar, color: 'text-blue-400', dotBg: 'bg-blue-500', label: 'Scheduled' },
  gate_change: { icon: ArrowRight, color: 'text-blue-400', dotBg: 'bg-blue-500', label: 'Gate Change' },
  delay: { icon: Clock, color: 'text-amber-400', dotBg: 'bg-amber-500', label: 'Delay' },
  boarding: { icon: Plane, color: 'text-blue-400', dotBg: 'bg-blue-500', label: 'Boarding' },
  departed: { icon: PlaneIcon, color: 'text-blue-400', dotBg: 'bg-blue-500', label: 'Departed' },
  diverted: { icon: Navigation, color: 'text-amber-400', dotBg: 'bg-amber-500', label: 'Diverted' },
  landed: { icon: MapPin, color: 'text-green-400', dotBg: 'bg-green-500', label: 'Landed' },
  cancelled: { icon: XCircle, color: 'text-red-400', dotBg: 'bg-red-500', label: 'Cancelled' },
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FlightEventTimeline({
  events,
  flightNumber,
  className = '',
}: FlightEventTimelineProps) {
  // Most recent event first
  const sorted = [...events].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Plane className="w-5 h-5 text-amber-400" />
          <span className="text-xs text-gray-500 uppercase tracking-wider">Flight Timeline</span>
        </div>
        <h3 className="text-lg font-semibold text-white mt-1">{flightNumber}</h3>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4">
        <div className="relative">
          {sorted.map((event, i) => {
            const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.scheduled;
            const Icon = config.icon;
            const isLast = i === sorted.length - 1;

            return (
              <div key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {/* Vertical Line */}
                {!isLast && (
                  <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-white/10" />
                )}

                {/* Dot */}
                <div className={`relative z-10 w-6 h-6 rounded-full ${config.dotBg}/20 flex items-center justify-center shrink-0 mt-0.5`}>
                  <div className={`w-2.5 h-2.5 rounded-full ${config.dotBg}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color} shrink-0`} />
                    <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                    <span className="text-xs text-gray-500 ml-auto shrink-0">
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                  {event.details && (
                    <p className="text-sm text-gray-400 mt-1">{event.details}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {sorted.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">No events recorded yet.</p>
        )}
      </div>
    </div>
  );
}
