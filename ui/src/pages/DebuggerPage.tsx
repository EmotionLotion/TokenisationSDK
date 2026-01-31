import { Bug, FlaskConical, Play, CheckCircle, XCircle, Loader2, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { TimeTravelDebugger } from '../components/debugger/TimeTravelDebugger';
import { Breadcrumb } from '../components/shared/Breadcrumb';
import { useSDKStore, type SimulationConfig, type SimulationResult } from '../core/store';

type Tab = 'debugger' | 'simulations';

const SIM_ICONS: Record<string, string> = {
  'NAV Calculation': 'text-emerald-400',
  'Flight Status': 'text-sky-400',
  'Car Rental Telematics': 'text-orange-400',
  'Hotel Check-In': 'text-purple-400',
  'Concert Royalty': 'text-pink-400',
};

export function DebuggerPage() {
  const [activeTab, setActiveTab] = useState<Tab>('debugger');
  const [runningAll, setRunningAll] = useState(false);
  const [runningName, setRunningName] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, SimulationResult>>(new Map());

  const store = useSDKStore();
  const configs = store.getSimulationConfigs();

  const handleRunSimulation = (configName: string) => {
    setRunningName(configName);
    setTimeout(() => {
      const result = store.runSimulation(configName);
      setResults(prev => new Map(prev).set(configName, result));
      setRunningName(null);
    }, 600);
  };

  const handleRunAll = () => {
    setRunningAll(true);
    let i = 0;
    const run = () => {
      if (i >= configs.length) {
        setRunningAll(false);
        return;
      }
      const cfg = configs[i];
      setRunningName(cfg.name);
      setTimeout(() => {
        const result = store.runSimulation(cfg.name);
        setResults(prev => new Map(prev).set(cfg.name, result));
        setRunningName(null);
        i++;
        run();
      }, 400);
    };
    run();
  };

  const totalPassed = [...results.values()].filter(r => r.allPassed).length;
  const totalRun = results.size;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Breadcrumb items={[
        { label: 'Develop', path: '/dev/getting-started' },
        { label: 'Debugger' }
      ]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Bug className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Time-Travel Debugger</h1>
          <p className="text-sm text-gray-400">Inspect state snapshots, view diffs, and replay actions</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10 w-fit">
        <button
          onClick={() => setActiveTab('debugger')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'debugger'
              ? 'bg-[#F8B032] text-black'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Bug className="w-4 h-4" />
          Time Travel
        </button>
        <button
          onClick={() => setActiveTab('simulations')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'simulations'
              ? 'bg-[#F8B032] text-black'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <FlaskConical className="w-4 h-4" />
          Simulations
        </button>
      </div>

      {/* ==================== DEBUGGER TAB ==================== */}
      {activeTab === 'debugger' && <TimeTravelDebugger />}

      {/* ==================== SIMULATIONS TAB ==================== */}
      {activeTab === 'simulations' && (
        <div className="space-y-5">
          {/* Run All Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">
                {totalRun > 0
                  ? `${totalPassed}/${totalRun} simulations passed`
                  : `${configs.length} simulations available`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {totalRun > 0 && (
                <button
                  onClick={() => setResults(new Map())}
                  className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 hover:bg-white/10 transition-colors"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
              <button
                onClick={handleRunAll}
                disabled={runningAll || runningName !== null}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#F8B032] hover:bg-[#E8A633] text-black rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {runningAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run All
              </button>
            </div>
          </div>

          {/* Simulation Cards */}
          <div className="grid grid-cols-1 gap-4">
            {configs.map((config) => {
              const result = results.get(config.name);
              const isRunning = runningName === config.name;
              const color = SIM_ICONS[config.name] || 'text-gray-400';

              return (
                <SimulationCard
                  key={config.name}
                  config={config}
                  result={result}
                  isRunning={isRunning}
                  color={color}
                  onRun={() => handleRunSimulation(config.name)}
                  disabled={runningAll || runningName !== null}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SimulationCard({
  config,
  result,
  isRunning,
  color,
  onRun,
  disabled,
}: {
  config: SimulationConfig;
  result?: SimulationResult;
  isRunning: boolean;
  color: string;
  onRun: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
      {/* Card Header */}
      <div className="p-5 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10`}>
          <FlaskConical className={`w-5 h-5 ${color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white">{config.name}</h3>
            {result && (
              result.allPassed
                ? <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-[10px] font-medium border border-green-500/20">PASSED</span>
                : <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-medium border border-red-500/20">FAILED</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{config.description}</p>
          <p className="text-[10px] text-gray-600 mt-1">{config.testScenarios.length} test scenarios</p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              {expanded ? 'Collapse' : 'Details'}
            </button>
          )}
          <button
            onClick={onRun}
            disabled={disabled}
            className="flex items-center gap-2 px-4 py-2 bg-[#F8B032]/10 hover:bg-[#F8B032]/20 text-[#F8B032] rounded-lg text-xs font-medium transition-colors border border-[#F8B032]/20 hover:border-[#F8B032]/40 disabled:opacity-50"
          >
            {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Run
          </button>
        </div>
      </div>

      {/* Expanded Result Table */}
      {expanded && result && (
        <div className="border-t border-white/5">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">#</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Input</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Expected</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase">Actual</th>
                <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-gray-400 uppercase">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {result.scenarios.map((scenario, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3 text-xs text-gray-500 font-mono">{i + 1}</td>
                  <td className="px-5 py-3">
                    <code className="text-[11px] text-gray-400 font-mono break-all">
                      {JSON.stringify(scenario.input)}
                    </code>
                  </td>
                  <td className="px-5 py-3">
                    <code className="text-[11px] text-blue-400 font-mono break-all">
                      {JSON.stringify(scenario.expected)}
                    </code>
                  </td>
                  <td className="px-5 py-3">
                    <code className={`text-[11px] font-mono break-all ${scenario.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {JSON.stringify(scenario.actual)}
                    </code>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {scenario.passed
                      ? <CheckCircle className="w-4 h-4 text-green-400 mx-auto" />
                      : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-5 py-3 bg-white/5 text-xs text-gray-500 flex items-center justify-between">
            <span>Executed at {new Date(result.executedAt).toLocaleTimeString()}</span>
            <span className={result.allPassed ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
              {result.scenarios.filter(s => s.passed).length}/{result.scenarios.length} passed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
