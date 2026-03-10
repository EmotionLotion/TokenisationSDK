import React from 'react';
import { Ticket, Calendar, MapPin, ArrowRight } from 'lucide-react';

export interface TicketCardProps {
  eventName: string;
  date: string;
  seat?: string;
  status: 'valid' | 'used' | 'expired' | 'cancelled';
  type: string;
  holder: string;
  transferable: boolean;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  valid: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400' },
  used: { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400' },
  expired: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
  cancelled: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
};

export function TicketCard({
  eventName,
  date,
  seat,
  status,
  type,
  holder,
  transferable,
}: TicketCardProps) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.valid;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-400" />
            <span className="text-xs text-gray-500 uppercase tracking-wider">{type}</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style.bg} ${style.text}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        <h3 className="text-lg font-semibold text-white mt-2">{eventName}</h3>
      </div>

      {/* Details */}
      <div className="px-5 py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Calendar className="w-4 h-4" />
          <span>{date}</span>
        </div>
        {seat && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <MapPin className="w-4 h-4" />
            <span>{seat}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-xs text-gray-500">Held by: {holder}</span>
        {transferable && (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <ArrowRight className="w-3 h-3" />
            Transferable
          </span>
        )}
      </div>

      {/* Barcode placeholder */}
      <div className="px-5 py-3 border-t border-white/5 flex justify-center">
        <div className="flex gap-0.5">
          {Array.from({ length: 30 }, (_, i) => (
            <div
              key={i}
              className="bg-white/20"
              style={{
                width: Math.random() > 0.5 ? 2 : 1,
                height: 24,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
