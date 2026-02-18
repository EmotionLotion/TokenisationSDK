import React, { useMemo } from 'react';
import { Plane, UserCheck, Smartphone, DoorOpen, Armchair, Clock } from 'lucide-react';

export interface CheckInStatusProps {
  ticketId: string;
  flightNumber: string;
  status: 'not_checked_in' | 'online_check_in' | 'checked_in' | 'boarded';
  checkInOpens?: string;
  seatNumber?: string;
  gate?: string;
  boardingGroup?: string;
  onCheckIn?: () => void;
  className?: string;
}

const STEPS = [
  { key: 'not_checked_in', label: 'Not Checked In', icon: Clock },
  { key: 'online_check_in', label: 'Online Check-In', icon: Smartphone },
  { key: 'checked_in', label: 'Checked In', icon: UserCheck },
  { key: 'boarded', label: 'Boarded', icon: Plane },
] as const;

function computeCountdown(target: string): string | null {
  const diff = new Date(target).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

export function CheckInStatus({
  ticketId,
  flightNumber,
  status,
  checkInOpens,
  seatNumber,
  gate,
  boardingGroup,
  onCheckIn,
  className = '',
}: CheckInStatusProps) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  const canCheckIn = status === 'not_checked_in' || status === 'online_check_in';

  const countdown = useMemo(() => {
    if (status === 'not_checked_in' && checkInOpens) return computeCountdown(checkInOpens);
    return null;
  }, [status, checkInOpens]);

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-amber-400" />
            <span className="text-white font-semibold">{flightNumber}</span>
          </div>
          <span className="text-xs text-gray-500">ID: {ticketId}</span>
        </div>
      </div>

      {/* Step Indicator */}
      <div className="px-5 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => {
            const StepIcon = step.icon;
            const isCompleted = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <React.Fragment key={step.key}>
                {i > 0 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded ${i <= currentIdx ? 'bg-amber-400' : 'bg-white/10'}`} />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isCurrent ? 'bg-amber-400 text-black' : isCompleted ? 'bg-amber-400/20 text-amber-400' : 'bg-white/5 text-gray-500'
                    }`}
                  >
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <span className={`text-[10px] text-center leading-tight ${isCurrent ? 'text-amber-400 font-medium' : 'text-gray-500'}`}>
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Info Row */}
      {(seatNumber || gate || boardingGroup) && (
        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-4">
          {seatNumber && (
            <div className="flex items-center gap-1.5 text-sm">
              <Armchair className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">Seat</span>
              <span className="text-white font-medium">{seatNumber}</span>
            </div>
          )}
          {gate && (
            <div className="flex items-center gap-1.5 text-sm">
              <DoorOpen className="w-4 h-4 text-gray-500" />
              <span className="text-gray-400">Gate</span>
              <span className="text-white font-medium">{gate}</span>
            </div>
          )}
          {boardingGroup && (
            <div className="text-sm">
              <span className="text-gray-400">Group </span>
              <span className="text-white font-medium">{boardingGroup}</span>
            </div>
          )}
        </div>
      )}

      {/* Countdown / Action */}
      <div className="px-5 py-3">
        {countdown && (
          <p className="text-xs text-gray-500 mb-2">Check-in opens in <span className="text-blue-400 font-medium">{countdown}</span></p>
        )}
        {canCheckIn && (
          <button
            onClick={onCheckIn}
            disabled={!!countdown}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              countdown
                ? 'bg-white/5 text-gray-500 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-black cursor-pointer'
            }`}
          >
            {countdown ? 'Check-In Not Available' : 'Check In Now'}
          </button>
        )}
      </div>
    </div>
  );
}
