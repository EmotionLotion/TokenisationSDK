import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane,
  ArrowRightLeft,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
  X,
  ArrowRight,
} from 'lucide-react';
import { sdkStore, type FlightStatus } from '../store';

// ─── Toast types ───────────────────────────────────────────────
type ToastLevel = 'info' | 'warning' | 'success' | 'error';

interface Toast {
  id: number;
  title: string;
  body: string;
  level: ToastLevel;
  createdAt: number;
}

const LEVEL_STYLES: Record<ToastLevel, { bg: string; border: string; icon: typeof Info }> = {
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Info },
  warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertTriangle },
  success: { bg: 'bg-green-500/10', border: 'border-green-500/30', icon: CheckCircle2 },
  error: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: XCircle },
};

const LEVEL_TEXT: Record<ToastLevel, string> = {
  info: 'text-blue-400',
  warning: 'text-amber-400',
  success: 'text-green-400',
  error: 'text-red-400',
};

let toastCounter = 0;

// ─── Code snippets for each action ────────────────────────────
const SNIPPETS: Record<string, string> = {
  delay: `sdk.updateFlightStatus(assetId, 'DELAYED', {
  delayMinutes: 90,
  reason: 'weather',
});`,
  gate: `sdk.updateFlightStatus(assetId, 'GATE_CHANGED', {
  newGate: 'B7',
});`,
  cancel: `sdk.updateFlightStatus(assetId, 'CANCELLED', {
  reason: 'mechanical',
});`,
  oracle: `sdk.triggerOracleUpdate(assetId, {
  price: 142.50,
  source: 'chainlink',
});`,
  transfer: `await sdk.transfer(assetId, from, to, '100');`,
};

// ─── Component ─────────────────────────────────────────────────
export function EventCallbackDemo() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const prevVersionRef = useRef(sdkStore.getVersion());

  const addToast = useCallback((title: string, body: string, level: ToastLevel) => {
    const toast: Toast = { id: ++toastCounter, title, body, level, createdAt: Date.now() };
    setToasts(prev => [toast, ...prev].slice(0, 12));
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Auto-dismiss after 5s
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map(t => {
      const remaining = 5000 - (Date.now() - t.createdAt);
      if (remaining <= 0) {
        removeToast(t.id);
        return undefined;
      }
      return setTimeout(() => removeToast(t.id), remaining);
    });
    return () => timers.forEach(t => t && clearTimeout(t));
  }, [toasts, removeToast]);

  // Subscribe to store changes and map to toasts
  useEffect(() => {
    const unsub = sdkStore.subscribe(() => {
      const currentVersion = sdkStore.getVersion();
      if (currentVersion === prevVersionRef.current) return;
      prevVersionRef.current = currentVersion;

      const snapshots = sdkStore.getSnapshots();
      if (snapshots.length === 0) return;
      const latest = snapshots[snapshots.length - 1];
      const action = latest.actionName;

      // Map SDK actions to toasts
      if (action === 'FLIGHT_STATUS_UPDATE') {
        const status = latest.payload?.status as FlightStatus;
        const details = latest.payload?.details;
        if (status === 'DELAYED') {
          addToast(
            'Flight Delayed',
            `Flight delayed by ${details?.delayMinutes || '?'} min — ${details?.reason || 'unknown'}`,
            'warning',
          );
        } else if (status === 'GATE_CHANGED') {
          addToast('Gate Changed', `New gate: ${details?.newGate || '?'}`, 'info');
        } else if (status === 'CANCELLED') {
          addToast('Flight Cancelled', `Reason: ${details?.reason || 'unknown'}`, 'error');
        } else {
          addToast('Flight Status Update', `Status → ${status}`, 'info');
        }
      } else if (action === 'ORACLE_UPDATE') {
        addToast('Oracle Price Update', `Asset ${latest.payload?.assetId} oracle data refreshed`, 'info');
      } else if (action === 'TRANSFER_TOKENS') {
        addToast(
          'Transfer Complete',
          `${latest.payload?.amount} tokens transferred successfully`,
          'success',
        );
      }
    });
    return unsub;
  }, [addToast]);

  // ─── Action handlers ───────────────────────────────────────
  const demoAssetId = 'FL-2024-DEMO';

  const handleDelay = () => {
    sdkStore.updateFlightStatus(demoAssetId, 'DELAYED', {
      delayMinutes: 90,
      reason: 'weather',
    });
  };

  const handleGateChange = () => {
    sdkStore.updateFlightStatus(demoAssetId, 'GATE_CHANGED', {
      newGate: 'B7',
    });
  };

  const handleCancel = () => {
    sdkStore.updateFlightStatus(demoAssetId, 'CANCELLED', {
      reason: 'mechanical',
    });
  };

  const handleOracleUpdate = () => {
    sdkStore.triggerOracleUpdate(demoAssetId, {
      price: +(100 + Math.random() * 50).toFixed(2),
      source: 'chainlink',
      timestamp: new Date().toISOString(),
    });
  };

  const handleTransfer = async () => {
    const assets = sdkStore.getAssets();
    const parties = sdkStore.getParties();
    if (assets.length > 0 && parties.length >= 2) {
      await sdkStore.transfer(assets[0].id, parties[0].id, parties[1].id, '100');
    } else {
      // Fallback: just log + notify so toast still fires
      sdkStore.logSdkCall('tokens.transfer', { amount: '100', note: 'demo' });
      addToast('Transfer Complete', '100 tokens transferred (demo)', 'success');
    }
  };

  // ─── Action button config ──────────────────────────────────
  const actions = [
    {
      key: 'delay',
      label: 'Delay Flight',
      icon: Plane,
      color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
      onClick: handleDelay,
    },
    {
      key: 'gate',
      label: 'Change Gate',
      icon: ArrowRightLeft,
      color: 'text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20',
      onClick: handleGateChange,
    },
    {
      key: 'cancel',
      label: 'Cancel Flight',
      icon: XCircle,
      color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20',
      onClick: handleCancel,
    },
    {
      key: 'oracle',
      label: 'Oracle Price Update',
      icon: BarChart3,
      color: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20',
      onClick: handleOracleUpdate,
    },
    {
      key: 'transfer',
      label: 'Token Transfer',
      icon: ArrowRightLeft,
      color: 'text-green-400 border-green-500/30 bg-green-500/10 hover:bg-green-500/20',
      onClick: handleTransfer,
    },
  ];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Event Callback Demo</h1>
        <p className="text-sm text-gray-400 mt-1">
          Demonstrates the SDK event callback pattern — trigger actions on the left, observe real-time
          notifications on the right.
        </p>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: SDK Control Panel */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">
            SDK Control Panel
          </h2>
          <div className="space-y-3">
            {actions.map(({ key, label, icon: Icon, color, onClick }) => (
              <div key={key} className="space-y-1.5">
                <button
                  onClick={onClick}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${color}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
                <pre className="text-[10px] leading-relaxed text-gray-500 bg-black/20 rounded-md px-3 py-2 overflow-x-auto font-mono">
                  {SNIPPETS[key]}
                </pre>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Partner App Simulation */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-white tracking-wide uppercase">
            Partner App Simulation
          </h2>
          <p className="text-xs text-gray-500">
            Notifications appear here via <code className="text-gray-400">sdkStore.subscribe()</code> callback.
          </p>

          <div className="space-y-2 min-h-[300px]">
            <AnimatePresence mode="popLayout">
              {toasts.length === 0 && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center h-48 text-xs text-gray-600"
                >
                  Trigger an SDK action to see notifications...
                </motion.div>
              )}
              {toasts.map(toast => {
                const style = LEVEL_STYLES[toast.level];
                const IconComp = style.icon;
                return (
                  <motion.div
                    key={toast.id}
                    layout
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 80, scale: 0.9 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${style.bg} ${style.border}`}
                  >
                    <IconComp className={`w-4 h-4 shrink-0 mt-0.5 ${LEVEL_TEXT[toast.level]}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${LEVEL_TEXT[toast.level]}`}>{toast.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{toast.body}</p>
                    </div>
                    <button
                      onClick={() => removeToast(toast.id)}
                      className="text-gray-600 hover:text-gray-400 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom: Visual flow diagram */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white tracking-wide uppercase mb-4">
          Event Flow
        </h2>
        <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
          {[
            { label: 'SDK Action', color: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' },
            null,
            { label: 'Event Bus', color: 'border-purple-500/40 bg-purple-500/10 text-purple-400' },
            null,
            { label: 'Subscriber', color: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
            null,
            { label: 'Toast UI', color: 'border-green-500/40 bg-green-500/10 text-green-400' },
          ].map((item, i) =>
            item === null ? (
              <ArrowRight key={`arrow-${i}`} className="w-4 h-4 text-gray-600 shrink-0" />
            ) : (
              <span
                key={item.label}
                className={`px-3 py-1.5 rounded-lg border font-medium ${item.color}`}
              >
                {item.label}
              </span>
            ),
          )}
        </div>
        <p className="text-center text-[10px] text-gray-600 mt-3 font-mono">
          onStatusUpdate() / onTransferSuccess() / onOracleUpdate()
        </p>
      </div>
    </div>
  );
}
