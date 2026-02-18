/**
 * OracleManager - Oracle Dashboard
 *
 * Management config for data inputs:
 * - Add IoT Sources (H2O Meter ID, Telematics, etc.)
 * - Set Thresholds (Flight Delay > 4h triggers payout)
 * - Configure BrowserEventStore or Chainlink inputs
 */

import { useState, useEffect } from 'react';
import {
  Radio, Plus, Settings, RefreshCw, AlertTriangle, CheckCircle2,
  XCircle, Clock, Activity, Wifi, WifiOff, Trash2, Edit2, Eye,
  Zap, Thermometer, Droplets, Gauge, MapPin, Plane, Truck,
  ChevronDown, ChevronUp, Play, Pause, ExternalLink
} from 'lucide-react';
import { config } from '../config';

// ============================================================================
// TYPES
// ============================================================================

interface OracleSource {
  id: string;
  name: string;
  type: 'IOT' | 'API' | 'CHAINLINK' | 'MANUAL';
  category: 'WATER' | 'TELEMATICS' | 'FLIGHT' | 'WEATHER' | 'PRICE' | 'CUSTOM';
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PAUSED';
  endpoint: string;
  lastUpdate: string;
  updateFrequency: string;
  dataPoints: number;
  metadata: Record<string, string>;
}

interface ThresholdRule {
  id: string;
  sourceId: string;
  sourceName: string;
  field: string;
  operator: 'GT' | 'LT' | 'EQ' | 'GTE' | 'LTE' | 'BETWEEN';
  value: string;
  value2?: string; // For BETWEEN operator
  action: string;
  isActive: boolean;
  triggeredCount: number;
  lastTriggered?: string;
}

interface DataPoint {
  timestamp: string;
  value: number;
  source: string;
}

// ============================================================================
// MOCK DATA
// ============================================================================

const MOCK_SOURCES: OracleSource[] = [
  {
    id: 'oracle-1',
    name: 'DEWA Smart Meter #DXB-2847',
    type: 'IOT',
    category: 'WATER',
    status: 'ACTIVE',
    endpoint: 'mqtt://dewa.oracle.ahoy.tech/meters/2847',
    lastUpdate: '2024-01-15T14:30:00Z',
    updateFrequency: '5 minutes',
    dataPoints: 15420,
    metadata: {
      'Device ID': 'DXB-SM-2847',
      'Location': 'Dubai Marina, Tower 5',
      'Type': 'Ultrasonic Flow Meter',
    },
  },
  {
    id: 'oracle-2',
    name: 'Emirates Flight Status API',
    type: 'API',
    category: 'FLIGHT',
    status: 'ACTIVE',
    endpoint: 'https://api.emirates.com/flights/v2/status',
    lastUpdate: '2024-01-15T14:28:00Z',
    updateFrequency: '1 minute',
    dataPoints: 89230,
    metadata: {
      'Provider': 'Emirates Airlines',
      'Coverage': 'All Routes',
      'Data Types': 'Delays, Cancellations, Gates',
    },
  },
  {
    id: 'oracle-3',
    name: 'Chainlink ETH/USD Price Feed',
    type: 'CHAINLINK',
    category: 'PRICE',
    status: 'ACTIVE',
    endpoint: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    lastUpdate: '2024-01-15T14:29:45Z',
    updateFrequency: '1 heartbeat',
    dataPoints: 456000,
    metadata: {
      'Network': 'Ethereum Mainnet',
      'Decimals': '8',
      'Deviation': '0.5%',
    },
  },
  {
    id: 'oracle-4',
    name: 'COMET Telematics Hub',
    type: 'IOT',
    category: 'TELEMATICS',
    status: 'ACTIVE',
    endpoint: 'wss://telematics.comet.ahoy.tech/stream',
    lastUpdate: '2024-01-15T14:30:02Z',
    updateFrequency: '10 seconds',
    dataPoints: 2340000,
    metadata: {
      'Fleet Size': '2,847 vehicles',
      'Data Points': 'Speed, Location, Fuel, Driver Behavior',
    },
  },
  {
    id: 'oracle-5',
    name: 'Weather Underground Dubai',
    type: 'API',
    category: 'WEATHER',
    status: 'PAUSED',
    endpoint: 'https://api.weather.com/v3/wx/observations',
    lastUpdate: '2024-01-15T12:00:00Z',
    updateFrequency: '15 minutes',
    dataPoints: 8760,
    metadata: {
      'Location': 'Dubai, UAE',
      'Data Types': 'Temp, Humidity, Wind, Precipitation',
    },
  },
  {
    id: 'oracle-6',
    name: 'Manual Verification Queue',
    type: 'MANUAL',
    category: 'CUSTOM',
    status: 'ACTIVE',
    endpoint: 'internal://verification-queue',
    lastUpdate: '2024-01-15T14:25:00Z',
    updateFrequency: 'On submission',
    dataPoints: 342,
    metadata: {
      'Pending': '12 items',
      'Verified Today': '28 items',
    },
  },
];

const MOCK_THRESHOLDS: ThresholdRule[] = [
  {
    id: 'rule-1',
    sourceId: 'oracle-2',
    sourceName: 'Emirates Flight Status',
    field: 'delay_minutes',
    operator: 'GTE',
    value: '240',
    action: 'Trigger Fly+ delay compensation payout',
    isActive: true,
    triggeredCount: 23,
    lastTriggered: '2024-01-14T18:45:00Z',
  },
  {
    id: 'rule-2',
    sourceId: 'oracle-1',
    sourceName: 'DEWA Smart Meter',
    field: 'daily_usage_liters',
    operator: 'LT',
    value: '500',
    action: 'Award H2O water savings credit',
    isActive: true,
    triggeredCount: 156,
    lastTriggered: '2024-01-15T00:00:00Z',
  },
  {
    id: 'rule-3',
    sourceId: 'oracle-4',
    sourceName: 'COMET Telematics',
    field: 'safety_score',
    operator: 'GTE',
    value: '95',
    action: 'Award COMET perfect week bonus',
    isActive: true,
    triggeredCount: 89,
    lastTriggered: '2024-01-15T08:00:00Z',
  },
  {
    id: 'rule-4',
    sourceId: 'oracle-4',
    sourceName: 'COMET Telematics',
    field: 'speed_kmh',
    operator: 'GT',
    value: '120',
    action: 'Flag driver for review',
    isActive: true,
    triggeredCount: 12,
    lastTriggered: '2024-01-15T11:23:00Z',
  },
  {
    id: 'rule-5',
    sourceId: 'oracle-3',
    sourceName: 'Chainlink ETH/USD',
    field: 'price',
    operator: 'BETWEEN',
    value: '2000',
    value2: '3000',
    action: 'Enable asset minting (market stable)',
    isActive: false,
    triggeredCount: 0,
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function OracleManager() {
  const [sources, setSources] = useState(MOCK_SOURCES);
  const [thresholds, setThresholds] = useState(MOCK_THRESHOLDS);

  useEffect(() => {
    if (!config.useApiBackend) return;
    fetch(`${config.apiUrl}/datasources`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json?.data) setSources(json.data);
        else if (Array.isArray(json)) setSources(json);
      })
      .catch(() => { /* fallback to mock data */ });
    fetch(`${config.apiUrl}/datasources/thresholds`)
      .then(res => res.ok ? res.json() : null)
      .then(json => {
        if (json?.data) setThresholds(json.data);
        else if (Array.isArray(json)) setThresholds(json);
      })
      .catch(() => { /* fallback to mock data */ });
  }, []);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [showAddThreshold, setShowAddThreshold] = useState(false);
  const [activeTab, setActiveTab] = useState<'sources' | 'thresholds' | 'logs'>('sources');

  const getStatusIcon = (status: OracleSource['status']) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'INACTIVE':
        return <XCircle className="w-4 h-4 text-gray-400" />;
      case 'ERROR':
        return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'PAUSED':
        return <Clock className="w-4 h-4 text-yellow-400" />;
    }
  };

  const getStatusColor = (status: OracleSource['status']) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'INACTIVE': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'ERROR': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'PAUSED': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    }
  };

  const getCategoryIcon = (category: OracleSource['category']) => {
    switch (category) {
      case 'WATER': return Droplets;
      case 'TELEMATICS': return Truck;
      case 'FLIGHT': return Plane;
      case 'WEATHER': return Thermometer;
      case 'PRICE': return Gauge;
      default: return Radio;
    }
  };

  const getTypeIcon = (type: OracleSource['type']) => {
    switch (type) {
      case 'IOT': return Wifi;
      case 'API': return Activity;
      case 'CHAINLINK': return Zap;
      case 'MANUAL': return Edit2;
    }
  };

  const getOperatorLabel = (op: ThresholdRule['operator']) => {
    switch (op) {
      case 'GT': return '>';
      case 'LT': return '<';
      case 'EQ': return '=';
      case 'GTE': return '≥';
      case 'LTE': return '≤';
      case 'BETWEEN': return 'between';
    }
  };

  const toggleSourceStatus = (sourceId: string) => {
    setSources(sources.map(s => {
      if (s.id === sourceId) {
        return { ...s, status: s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' };
      }
      return s;
    }));
  };

  const toggleThreshold = (thresholdId: string) => {
    setThresholds(thresholds.map(t => {
      if (t.id === thresholdId) {
        return { ...t, isActive: !t.isActive };
      }
      return t;
    }));
  };

  const activeSourcesCount = sources.filter(s => s.status === 'ACTIVE').length;
  const activeThresholdsCount = thresholds.filter(t => t.isActive).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio className="w-6 h-6 text-[#F8B032]" />
            Oracle Manager
          </h1>
          <p className="text-gray-400 mt-1">Configure data sources and threshold rules</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 px-4 py-2 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-sm text-gray-400">{activeSourcesCount} Active Sources</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#F8B032]" />
              <span className="text-sm text-gray-400">{activeThresholdsCount} Active Rules</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10">
        {(['sources', 'thresholds', 'logs'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-[#F8B032] text-[#F8B032]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'sources' && 'Data Sources'}
            {tab === 'thresholds' && 'Threshold Rules'}
            {tab === 'logs' && 'Event Logs'}
          </button>
        ))}
      </div>

      {/* Sources Tab */}
      {activeTab === 'sources' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{sources.length} data sources configured</p>
            <button
              onClick={() => setShowAddSource(true)}
              className="px-4 py-2 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Source
            </button>
          </div>

          <div className="grid gap-4">
            {sources.map((source) => {
              const CategoryIcon = getCategoryIcon(source.category);
              const TypeIcon = getTypeIcon(source.type);
              const isExpanded = expandedSource === source.id;

              return (
                <div
                  key={source.id}
                  className="glass-card rounded-xl border border-white/5 overflow-hidden"
                >
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedSource(isExpanded ? null : source.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                        <CategoryIcon className="w-6 h-6 text-[#F8B032]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white">{source.name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full border ${getStatusColor(source.status)}`}>
                            {source.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <TypeIcon className="w-3 h-3" />
                            {source.type}
                          </span>
                          <span>•</span>
                          <span>{source.updateFrequency}</span>
                          <span>•</span>
                          <span>{source.dataPoints.toLocaleString()} data points</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSourceStatus(source.id);
                        }}
                        className={`p-2 rounded-lg transition-colors ${
                          source.status === 'ACTIVE'
                            ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {source.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-white/10 pt-4">
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-3 bg-black/20 rounded-lg">
                          <p className="text-xs text-gray-500">Endpoint</p>
                          <p className="text-sm text-white font-mono truncate">{source.endpoint}</p>
                        </div>
                        <div className="p-3 bg-black/20 rounded-lg">
                          <p className="text-xs text-gray-500">Last Update</p>
                          <p className="text-sm text-white">{new Date(source.lastUpdate).toLocaleString()}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        {Object.entries(source.metadata).map(([key, value]) => (
                          <div key={key} className="p-2 bg-white/5 rounded-lg">
                            <p className="text-xs text-gray-500">{key}</p>
                            <p className="text-sm text-white">{value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button className="flex-1 px-3 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center justify-center gap-1">
                          <RefreshCw className="w-4 h-4" />
                          Test Connection
                        </button>
                        <button className="flex-1 px-3 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center justify-center gap-1">
                          <Settings className="w-4 h-4" />
                          Configure
                        </button>
                        <button className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Thresholds Tab */}
      {activeTab === 'thresholds' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{thresholds.length} threshold rules configured</p>
            <button
              onClick={() => setShowAddThreshold(true)}
              className="px-4 py-2 bg-[#F8B032] text-black font-bold rounded-lg hover:bg-[#F8B032]/90 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>

          <div className="space-y-3">
            {thresholds.map((rule) => (
              <div
                key={rule.id}
                className={`glass-card rounded-xl p-4 border transition-all ${
                  rule.isActive ? 'border-white/10' : 'border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleThreshold(rule.id)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${
                        rule.isActive ? 'bg-[#F8B032]' : 'bg-white/20'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        rule.isActive ? 'left-4' : 'left-0.5'
                      }`} />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{rule.sourceName}</span>
                        <span className="text-gray-500">•</span>
                        <code className="text-sm text-[#F8B032] bg-[#F8B032]/10 px-2 py-0.5 rounded">
                          {rule.field} {getOperatorLabel(rule.operator)} {rule.value}
                          {rule.value2 && ` and ${rule.value2}`}
                        </code>
                      </div>
                      <p className="text-sm text-gray-400 mt-1">{rule.action}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-white">{rule.triggeredCount} triggers</p>
                      {rule.lastTriggered && (
                        <p className="text-xs text-gray-500">
                          Last: {new Date(rule.lastTriggered).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button className="p-2 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="glass-card rounded-xl p-6 border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Recent Oracle Events</h3>
            <button className="px-3 py-1.5 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 transition-colors text-sm flex items-center gap-1">
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {[
              { time: '14:30:02', source: 'COMET Telematics', event: 'Data point received', type: 'info' },
              { time: '14:29:45', source: 'Chainlink ETH/USD', event: 'Price update: $2,847.32', type: 'info' },
              { time: '14:28:00', source: 'Emirates Flight API', event: 'EK 101 delay detected (45 min)', type: 'warning' },
              { time: '14:25:00', source: 'Manual Queue', event: 'Verification submitted', type: 'info' },
              { time: '14:20:15', source: 'DEWA Smart Meter', event: 'Daily usage: 423L (below threshold)', type: 'success' },
              { time: '14:15:00', source: 'Weather API', event: 'Connection timeout', type: 'error' },
            ].map((log, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg flex items-center justify-between ${
                  log.type === 'error' ? 'bg-red-500/5 border border-red-500/10' :
                  log.type === 'warning' ? 'bg-yellow-500/5 border border-yellow-500/10' :
                  log.type === 'success' ? 'bg-green-500/5 border border-green-500/10' :
                  'bg-white/5 border border-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 font-mono">{log.time}</span>
                  <span className="text-sm text-gray-300">{log.source}</span>
                  <span className="text-sm text-white">{log.event}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  log.type === 'error' ? 'bg-red-500/10 text-red-400' :
                  log.type === 'warning' ? 'bg-yellow-500/10 text-yellow-400' :
                  log.type === 'success' ? 'bg-green-500/10 text-green-400' :
                  'bg-white/10 text-gray-400'
                }`}>
                  {log.type}
                </span>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">
            View all logs →
          </button>
        </div>
      )}
    </div>
  );
}
