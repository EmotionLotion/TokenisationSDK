import { useState } from 'react';
import { Clock, XCircle, MapPin, ShieldOff, AlertTriangle, Lock } from 'lucide-react';
import { sdkStore } from '../../store';

interface OracleEvent {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

let eventCounter = 0;

export function OracleSimulator() {
  const [tab, setTab] = useState<'airline' | 'realestate'>('airline');
  const [events, setEvents] = useState<OracleEvent[]>([]);
  const [status, setStatus] = useState('');

  const emitEvent = (type: string, payload: Record<string, unknown>) => {
    const evt: OracleEvent = {
      id: ++eventCounter,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    setEvents(prev => [evt, ...prev].slice(0, 50));
    sdkStore.logSdkCall(`oracle.${type}`, payload);
    setStatus(`Emitted: ${type}`);
    setTimeout(() => setStatus(''), 2000);
  };

  const airlineButtons = [
    {
      label: 'Trigger Delay',
      icon: Clock,
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
      action: () => emitEvent('flight.delay', { flightId: 'FL-2024-001', delayMinutes: 120, reason: 'weather' }),
    },
    {
      label: 'Cancel Flight',
      icon: XCircle,
      color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20',
      action: () => emitEvent('flight.cancel', { flightId: 'FL-2024-001', reason: 'mechanical', refundPolicy: 'full' }),
    },
    {
      label: 'Gate Change',
      icon: MapPin,
      color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20',
      action: () => emitEvent('flight.gateChange', { flightId: 'FL-2024-001', oldGate: 'A12', newGate: 'B7' }),
    },
  ];

  const realEstateButtons = [
    {
      label: 'Force KYC Fail',
      icon: ShieldOff,
      color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20',
      action: () => emitEvent('compliance.kycFail', { investorId: 'INV-001', reason: 'document_expired', provider: 'Jumio' }),
    },
    {
      label: 'Jurisdiction Block',
      icon: AlertTriangle,
      color: 'text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20',
      action: () => emitEvent('compliance.jurisdictionBlock', { jurisdiction: 'US-NY', regulation: 'Reg D', assetId: 'PROP-001' }),
    },
    {
      label: 'Lockup Active',
      icon: Lock,
      color: 'text-purple-400 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20',
      action: () => emitEvent('compliance.lockupActive', { assetId: 'PROP-001', expiresAt: new Date(Date.now() + 86400000 * 180).toISOString(), remainingDays: 180 }),
    },
  ];

  const buttons = tab === 'airline' ? airlineButtons : realEstateButtons;

  return (
    <div className="space-y-4 p-2">
      <p className="text-xs text-gray-500">
        Simulate oracle events for different verticals. Events are logged to the debugger timeline.
      </p>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-white/5">
        {(['airline', 'realestate'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
              tab === t ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'airline' ? 'Airline' : 'Real Estate'}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-1 gap-2">
        {buttons.map(({ label, icon: Icon, action, color }) => (
          <button
            key={label}
            onClick={action}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors ${color}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>

      {/* Status feedback */}
      {status && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 font-mono">
          {status}
        </div>
      )}

      {/* Event log */}
      {events.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-gray-600 font-medium">Event Log</p>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {events.map(evt => (
              <div
                key={evt.id}
                className="text-xs font-mono px-2 py-1.5 rounded bg-white/5 border border-white/5"
              >
                <span className="text-gray-600">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </span>{' '}
                <span className="text-amber-400">{evt.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
