import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, RotateCcw, FastForward, Code2 } from 'lucide-react';
import { CodePanel } from './CodePanel';
import { ProgressStepper } from './blueprints/ProgressStepper';
import { realEstateShowcase } from './showcases/real-estate';
import { airlineShowcase } from './showcases/airline';
import { carRentalShowcase } from './showcases/car-rental';
import { hotelShowcase } from './showcases/hotel';
import { concertShowcase } from './showcases/concert';
import type { ShowcaseConfig, ShowcaseStep, VerticalId } from './showcases/types';

const SHOWCASES: ShowcaseConfig[] = [
  realEstateShowcase,
  airlineShowcase,
  carRentalShowcase,
  hotelShowcase,
  concertShowcase,
];

const COLOR_MAP: Record<string, { tab: string; tabActive: string; progress: string }> = {
  amber:  { tab: 'hover:text-amber-400',  tabActive: 'bg-amber-500/20 text-amber-400 border-amber-500/30', progress: 'bg-amber-500' },
  sky:    { tab: 'hover:text-sky-400',    tabActive: 'bg-sky-500/20 text-sky-400 border-sky-500/30', progress: 'bg-sky-500' },
  red:    { tab: 'hover:text-red-400',    tabActive: 'bg-red-500/20 text-red-400 border-red-500/30', progress: 'bg-red-500' },
  rose:   { tab: 'hover:text-rose-400',   tabActive: 'bg-rose-500/20 text-rose-400 border-rose-500/30', progress: 'bg-rose-500' },
  purple: { tab: 'hover:text-purple-400', tabActive: 'bg-purple-500/20 text-purple-400 border-purple-500/30', progress: 'bg-purple-500' },
};

function makeSteps(config: ShowcaseConfig): ShowcaseStep[] {
  return config.steps.map(s => ({ ...s, completed: false }));
}

// Step grouping logic moved to ProgressStepper blueprint component

export function GuidedShowcase() {
  const { vertical } = useParams<{ vertical?: string }>();
  const navigate = useNavigate();

  const initialVertical = (vertical as VerticalId) || 'real-estate';
  const [activeVertical, setActiveVertical] = useState<VerticalId>(
    SHOWCASES.find(s => s.id === initialVertical) ? initialVertical : 'real-estate'
  );

  const [steps, setSteps] = useState<ShowcaseStep[]>(() =>
    makeSteps(SHOWCASES.find(s => s.id === activeVertical)!)
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [displayIndex, setDisplayIndex] = useState(-1); // -1 = show placeholder

  // Use refs for mutable data shared across async steps
  const demoDataRef = useRef<Record<string, string>>({});
  const currentStepRef = useRef(0);
  const isRunningRef = useRef(false);

  const showcase = SHOWCASES.find(s => s.id === activeVertical)!;
  const colorTheme = COLOR_MAP[showcase.color] || COLOR_MAP.amber;

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const updateDemoData = useCallback((fn: (prev: Record<string, string>) => Record<string, string>) => {
    demoDataRef.current = fn(demoDataRef.current);
  }, []);

  const switchVertical = (id: VerticalId) => {
    if (isRunningRef.current) return;
    const config = SHOWCASES.find(s => s.id === id)!;
    setActiveVertical(id);
    setSteps(makeSteps(config));
    setCurrentStep(0);
    currentStepRef.current = 0;
    setIsRunning(false);
    isRunningRef.current = false;
    setLog([]);
    setDisplayIndex(-1);
    demoDataRef.current = {};
    navigate(`/showcase/${id}`, { replace: true });
  };

  const reset = () => {
    setSteps(makeSteps(showcase));
    setCurrentStep(0);
    currentStepRef.current = 0;
    setIsRunning(false);
    isRunningRef.current = false;
    setLog([]);
    setDisplayIndex(-1);
    demoDataRef.current = {};
  };

  const executeStep = async (stepIndex: number, stepsSource: ShowcaseStep[]) => {
    const step = stepsSource[stepIndex];
    addLog('');
    addLog(`▶ Step ${step.id}: ${step.title}`);

    try {
      await step.action(addLog, updateDemoData, demoDataRef.current);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`⚠ Error: ${msg}`);
    }

    setSteps(prev => prev.map((s, i) =>
      i === stepIndex ? { ...s, completed: true } : s
    ));
    setDisplayIndex(stepIndex);
    const next = stepIndex + 1;
    setCurrentStep(next);
    currentStepRef.current = next;
  };

  const runSingleStep = async () => {
    const idx = currentStepRef.current;
    if (idx >= steps.length || isRunningRef.current) return;

    setIsRunning(true);
    isRunningRef.current = true;

    if (idx === 0) {
      addLog(`🚀 Starting ${showcase.name}...`);
    }

    try {
      await executeStep(idx, showcase.steps);
      if (currentStepRef.current >= showcase.steps.length) {
        addLog('');
        addLog('🎉 Showcase complete!');
      }
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const runAllSteps = async () => {
    if (isRunningRef.current) return;
    reset();

    // Wait a tick for reset state to flush
    await new Promise(r => setTimeout(r, 50));

    setIsRunning(true);
    isRunningRef.current = true;

    addLog(`🚀 Starting ${showcase.name}...`);

    try {
      for (let i = 0; i < showcase.steps.length; i++) {
        await new Promise(r => setTimeout(r, 800));
        await executeStep(i, showcase.steps);
      }
      addLog('');
      addLog('🎉 Showcase complete!');
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  // Which step to display in the center + code panels
  const displayStep = displayIndex >= 0 && displayIndex < steps.length
    ? steps[displayIndex]
    : steps[0];

  // Progress calculation
  const completedCount = steps.filter(s => s.completed).length;
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Vertical Tabs */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-2 flex flex-wrap gap-1">
          {SHOWCASES.map(sc => {
            const c = COLOR_MAP[sc.color] || COLOR_MAP.amber;
            const isActive = sc.id === activeVertical;
            return (
              <button
                key={sc.id}
                onClick={() => switchVertical(sc.id)}
                disabled={isRunning}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all text-sm font-medium border ${
                  isActive
                    ? c.tabActive
                    : `bg-transparent text-gray-400 border-transparent ${c.tab} hover:bg-white/5`
                } disabled:opacity-50`}
              >
                {sc.icon}
                <span className="hidden sm:inline">{sc.shortName}</span>
              </button>
            );
          })}
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-white/5">
          <div
            className={`h-full ${colorTheme.progress} transition-all duration-500 ease-out`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{showcase.name}</h2>
          <p className="text-sm text-gray-400 mt-1">{showcase.description}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/playground/${activeVertical}`)}
            className="flex items-center gap-2 px-3 py-2 border border-primary/30 rounded-lg text-primary hover:bg-primary/10 transition-colors text-sm"
          >
            <Code2 className="w-4 h-4" />
            Open in Playground
          </button>
          <button
            onClick={reset}
            disabled={isRunning}
            className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors text-sm disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={runSingleStep}
            disabled={isRunning || currentStep >= steps.length}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 shadow-lg shadow-primary/20"
          >
            <Play className="w-4 h-4" />
            Run Step
          </button>
          <button
            onClick={runAllSteps}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/15 transition-colors text-sm disabled:opacity-50 border border-white/10"
          >
            <FastForward className="w-4 h-4" />
            Run All
          </button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ minHeight: '600px' }}>
        {/* Left: Steps Panel with Section Grouping */}
        <div className="lg:col-span-2 glass-card rounded-xl border border-white/10 p-4 overflow-y-auto max-h-[700px]">
          <ProgressStepper
            steps={steps}
            currentStep={currentStep}
            sections={showcase.sections}
            displayIndex={displayIndex}
            isRunning={isRunning}
            onStepClick={setDisplayIndex}
          />
        </div>

        {/* Center: Live UI Preview */}
        <div className="lg:col-span-5 glass-card rounded-xl border border-white/10 p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs uppercase tracking-widest text-gray-500 font-medium">Live Preview</h3>
            {displayIndex >= 0 && (
              <span className="text-xs text-gray-500">
                Step {displayIndex + 1} of {steps.length}
              </span>
            )}
          </div>
          <div>
            {displayIndex < 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                <Play className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Click "Run Step" to begin the showcase</p>
                <p className="text-xs mt-1 opacity-50">{showcase.description}</p>
              </div>
            ) : displayStep.render ? (
              displayStep.render(demoDataRef.current)
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-gray-600">
                <p className="text-sm">Step {displayStep.id}: {displayStep.title}</p>
                <p className="text-xs mt-1 opacity-50">{displayStep.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: Code + Console */}
        <div className="lg:col-span-5 h-full">
          <CodePanel
            code={displayStep.code}
            log={log}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {currentStep >= steps.length && currentStep > 0
            ? `All ${steps.length} steps completed`
            : currentStep > 0
              ? `Step ${currentStep} of ${steps.length} — "${steps[Math.min(currentStep, steps.length) - 1]?.title}"`
              : 'Ready to start'
          }
        </span>
        <div className="flex items-center gap-4">
          <button onClick={reset} className="hover:text-white transition-colors">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
