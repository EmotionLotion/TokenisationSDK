/**
 * CometLivePanel - Live COMET Oracle Connection Panel
 *
 * Shows real-time connection to COMET server and oracle data flow.
 * Displays safety scores, events, and allows simulation for demo.
 */

import { useState } from 'react';
import {
  Wifi, WifiOff, RefreshCw, Zap, AlertTriangle,
  CheckCircle2, TrendingDown, Activity, Server,
  ChevronDown, ChevronUp, Play, Radio
} from 'lucide-react';
import { useCometLive } from '../hooks/useCometLive';

interface CometLivePanelProps {
  expanded?: boolean;
}

export function CometLivePanel({ expanded: initialExpanded = true }: CometLivePanelProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [selectedDriver, setSelectedDriver] = useState<string>('DRV-001');
  const [isSimulating, setIsSimulating] = useState(false);

  const {
    isConnected,
    isLoading,
    error,
    drivers,
    penalties,
    refreshDrivers,
    refreshScore,
    simulateDelivery,
    simulateSafetyEvent,
  } = useCometLive();

  const handleSimulateDelivery = async () => {
    setIsSimulating(true);
    await simulateDelivery(selectedDriver, 5);
    setIsSimulating(false);
  };

  const handleSimulateSafetyEvent = async (eventType: string) => {
    setIsSimulating(true);
    await simulateSafetyEvent(selectedDriver, eventType);
    setIsSimulating(false);
  };

  const currentDriver = drivers.find(d => d.id === selectedDriver);

  return (
    <div className="glass-card rounded-xl border border-cyan-500/20 bg-gradient-to-b from-cyan-900/10 to-transparent overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isConnected ? 'bg-cyan-500/20' : 'bg-red-500/20'
          }`}>
            {isConnected ? (
              <Radio className="w-5 h-5 text-cyan-400 animate-pulse" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-white flex items-center gap-2">
              COMET Live Oracle
              {isConnected && (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full">
                  CONNECTED
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400">
              {isConnected
                ? `${drivers.length} drivers • Real-time scoring`
                : error || 'Connecting...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={(e) => { e.stopPropagation(); refreshDrivers(); }}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t border-white/10 p-4 space-y-4">
          {!isConnected ? (
            <div className="text-center py-6">
              <WifiOff className="w-12 h-12 text-red-400 mx-auto mb-3 opacity-50" />
              <p className="text-gray-400 text-sm mb-2">COMET server not available</p>
              <p className="text-xs text-gray-500">
                Start the mock server: <code className="bg-white/10 px-2 py-0.5 rounded">npm run server</code>
              </p>
            </div>
          ) : (
            <>
              {/* Driver Selector */}
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Select Driver</label>
                <select
                  value={selectedDriver}
                  onChange={(e) => setSelectedDriver(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/50"
                >
                  {drivers.map(driver => (
                    <option key={driver.id} value={driver.id} className="bg-gray-900">
                      {driver.name} ({driver.id}) - {driver.tier}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Score */}
              {currentDriver?.safetyScore && (
                <div className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-white">Safety Score</h4>
                    <span className="text-xs text-gray-500">
                      via Chainlink Oracle
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className={`text-4xl font-bold ${
                        currentDriver.safetyScore.score >= 90 ? 'text-green-400' :
                        currentDriver.safetyScore.score >= 70 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {currentDriver.safetyScore.score}
                      </p>
                      <p className="text-xs text-gray-500">/ 100</p>
                    </div>

                    <div className="flex-1 space-y-1 text-xs">
                      {Object.entries(currentDriver.safetyScore.eventCounts).map(([event, count]) => (
                        <div key={event} className="flex justify-between">
                          <span className="text-gray-400">{event.replace(/_/g, ' ')}</span>
                          <span className="text-red-400">-{(penalties?.[event] || 0) * (count as number)} pts</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <p className="text-[10px] text-gray-500 mt-3">
                    Source: {currentDriver.safetyScore.source} •
                    Updated: {new Date(currentDriver.safetyScore.calculatedAt).toLocaleTimeString()}
                  </p>
                </div>
              )}

              {/* Penalty Configuration */}
              {penalties && (
                <div className="bg-white/5 rounded-lg p-4">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    Oracle Penalty Config
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {Object.entries(penalties).map(([event, penalty]) => (
                      <div key={event} className="bg-black/20 rounded p-2">
                        <p className="text-gray-400 truncate">{event.replace(/_/g, ' ')}</p>
                        <p className="text-red-400 font-mono">-{penalty}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">
                    Fetched from COMET API (not hardcoded)
                  </p>
                </div>
              )}

              {/* Simulation Controls */}
              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                  <Play className="w-4 h-4 text-green-400" />
                  Demo Simulation
                </h4>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleSimulateDelivery}
                    disabled={isSimulating}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold rounded-lg hover:bg-green-500/20 transition-all disabled:opacity-50"
                  >
                    {isSimulating ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3 h-3" />
                    )}
                    Complete Delivery
                  </button>

                  <button
                    onClick={() => handleSimulateSafetyEvent('SPEEDING')}
                    disabled={isSimulating}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-50"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Speeding Event
                  </button>

                  <button
                    onClick={() => handleSimulateSafetyEvent('HARD_BRAKE')}
                    disabled={isSimulating}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold rounded-lg hover:bg-orange-500/20 transition-all disabled:opacity-50"
                  >
                    <TrendingDown className="w-3 h-3" />
                    Hard Brake
                  </button>

                  <button
                    onClick={() => refreshScore(selectedDriver)}
                    disabled={isSimulating}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold rounded-lg hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                  >
                    <Activity className="w-3 h-3" />
                    Refresh Score
                  </button>
                </div>
              </div>

              {/* Data Flow Indicator */}
              <div className="bg-gradient-to-r from-cyan-900/20 via-purple-900/20 to-green-900/20 rounded-lg p-3">
                <div className="flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-1 text-cyan-400">
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                    COMET App
                  </div>
                  <div className="text-gray-500">→</div>
                  <div className="flex items-center gap-1 text-purple-400">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                    Chainlink DON
                  </div>
                  <div className="text-gray-500">→</div>
                  <div className="flex items-center gap-1 text-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    On-Chain SBT
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default CometLivePanel;
