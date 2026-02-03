import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Play, RotateCcw, FastForward, Code2, Pause, ChevronRight,
  Clock, Zap, Gauge, CheckCircle2, Trophy, ArrowRight,
  Sparkles, Target, BookOpen
} from 'lucide-react';
import { CodePanel } from './CodePanel';
import { ProgressStepper } from './blueprints/ProgressStepper';
import { realEstateShowcase } from './showcases/real-estate';
import { airlineShowcase } from './showcases/airline';
import { carRentalShowcase } from './showcases/car-rental';
import { hotelShowcase } from './showcases/hotel';
import { concertShowcase } from './showcases/concert';
import type { ShowcaseConfig, ShowcaseStep, VerticalId } from './showcases/types';

type SpeedSetting = 'slow' | 'normal' | 'fast';
type ShowcaseState = 'intro' | 'running' | 'paused' | 'completed';

const SHOWCASES: ShowcaseConfig[] = [
  realEstateShowcase,
  airlineShowcase,
  carRentalShowcase,
  hotelShowcase,
  concertShowcase,
];

const COLOR_MAP: Record<string, { tab: string; tabActive: string; progress: string; bg: string; border: string }> = {
  amber:  { tab: 'hover:text-amber-400',  tabActive: 'bg-amber-500/20 text-amber-400 border-amber-500/30', progress: 'bg-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  sky:    { tab: 'hover:text-sky-400',    tabActive: 'bg-sky-500/20 text-sky-400 border-sky-500/30', progress: 'bg-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/20' },
  red:    { tab: 'hover:text-red-400',    tabActive: 'bg-red-500/20 text-red-400 border-red-500/30', progress: 'bg-red-500', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  rose:   { tab: 'hover:text-rose-400',   tabActive: 'bg-rose-500/20 text-rose-400 border-rose-500/30', progress: 'bg-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
  purple: { tab: 'hover:text-purple-400', tabActive: 'bg-purple-500/20 text-purple-400 border-purple-500/30', progress: 'bg-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
};

const SPEED_DELAYS: Record<SpeedSetting, number> = {
  slow: 1500,
  normal: 800,
  fast: 300,
};

const SPEED_LABELS: Record<SpeedSetting, { label: string; icon: typeof Clock }> = {
  slow: { label: 'Slow', icon: Clock },
  normal: { label: 'Normal', icon: Gauge },
  fast: { label: 'Fast', icon: Zap },
};

// Showcase Introduction Component
function ShowcaseIntro({
  showcase,
  colorTheme,
  onStart,
  onRunAll,
}: {
  showcase: ShowcaseConfig;
  colorTheme: typeof COLOR_MAP[string];
  onStart: () => void;
  onRunAll: () => void;
}) {
  const sectionCount = showcase.sections?.length || 1;
  const stepCount = showcase.steps.length;
  const estimatedTime = Math.ceil(stepCount * 1.5); // ~1.5 min per step

  const features = [
    { icon: Target, label: `${stepCount} Interactive Steps` },
    { icon: BookOpen, label: `${sectionCount} Sections` },
    { icon: Clock, label: `~${estimatedTime} min` },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-8 text-center">
      <div className={`w-20 h-20 rounded-2xl ${colorTheme.bg} ${colorTheme.border} border flex items-center justify-center mb-6`}>
        <div className="scale-150">{showcase.icon}</div>
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">{showcase.name}</h2>
      <p className="text-gray-400 max-w-md mb-8">{showcase.description}</p>

      {/* Features */}
      <div className="flex items-center gap-6 mb-8">
        {features.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm text-gray-400">
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Section Preview */}
      {showcase.sections && showcase.sections.length > 0 && (
        <div className="w-full max-w-lg mb-8">
          <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">What You'll Learn</p>
          <div className="grid grid-cols-1 gap-2">
            {showcase.sections.slice(0, 5).map((section, i) => (
              <div
                key={section.id}
                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5 text-left"
              >
                <div className={`w-6 h-6 rounded-full ${colorTheme.bg} ${colorTheme.border} border flex items-center justify-center text-xs font-bold`}>
                  {i + 1}
                </div>
                <span className="text-sm text-gray-300">{section.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onStart}
          className={`flex items-center gap-2 px-6 py-3 ${colorTheme.bg} ${colorTheme.border} border rounded-xl text-white font-medium hover:bg-opacity-80 transition-all shadow-lg`}
        >
          <Play className="w-5 h-5" />
          Start Step-by-Step
        </button>
        <button
          onClick={onRunAll}
          className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 font-medium hover:bg-white/10 transition-all"
        >
          <FastForward className="w-5 h-5" />
          Auto-Run All
        </button>
      </div>

      <p className="text-xs text-gray-600 mt-6">
        Tip: Use Step-by-Step to explore each action in detail
      </p>
    </div>
  );
}

// Showcase Completion Summary Component
function ShowcaseSummary({
  showcase,
  colorTheme,
  steps,
  onReset,
  onOpenPlayground,
}: {
  showcase: ShowcaseConfig;
  colorTheme: typeof COLOR_MAP[string];
  steps: ShowcaseStep[];
  onReset: () => void;
  onOpenPlayground: () => void;
}) {
  const completedSteps = steps.filter(s => s.completed).length;
  const sectionCount = showcase.sections?.length || 1;

  const achievements = [
    { icon: CheckCircle2, label: `${completedSteps} Steps Completed`, color: 'text-green-400' },
    { icon: Target, label: `${sectionCount} Sections Mastered`, color: 'text-amber-400' },
    { icon: Sparkles, label: 'SDK Fundamentals', color: 'text-purple-400' },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mb-6">
        <Trophy className="w-10 h-10 text-green-400" />
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">Showcase Complete!</h2>
      <p className="text-gray-400 max-w-md mb-8">
        You've completed the {showcase.name} showcase and learned the core SDK patterns.
      </p>

      {/* Achievements */}
      <div className="flex items-center gap-6 mb-8">
        {achievements.map(({ icon: Icon, label, color }) => (
          <div key={label} className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <span className="text-xs text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      {/* Next Steps */}
      <div className="w-full max-w-md mb-8">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-3">Next Steps</p>
        <div className="space-y-2">
          <button
            onClick={onOpenPlayground}
            className="w-full flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center gap-3">
              <Code2 className="w-5 h-5 text-primary" />
              <span className="text-sm text-white">Open in Playground</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={onReset}
            className="w-full flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-gray-400" />
              <span className="text-sm text-gray-300">Run Again</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-500 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Other Showcases */}
      <p className="text-xs text-gray-600">
        Explore other verticals to see how the SDK adapts to different use cases
      </p>
    </div>
  );
}

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

  // New state for enhanced features
  const [showcaseState, setShowcaseState] = useState<ShowcaseState>('intro');
  const [speed, setSpeed] = useState<SpeedSetting>('normal');
  const [executingStep, setExecutingStep] = useState<number | null>(null);

  // Use refs for mutable data shared across async steps
  const demoDataRef = useRef<Record<string, string>>({});
  const currentStepRef = useRef(0);
  const isRunningRef = useRef(false);
  const isPausedRef = useRef(false);
  const speedRef = useRef<SpeedSetting>('normal');

  const showcase = SHOWCASES.find(s => s.id === activeVertical)!;
  const colorTheme = COLOR_MAP[showcase.color] || COLOR_MAP.amber;

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const updateDemoData = useCallback((fn: (prev: Record<string, string>) => Record<string, string>) => {
    demoDataRef.current = fn(demoDataRef.current);
  }, []);

  // Keep speedRef in sync
  const handleSpeedChange = useCallback((newSpeed: SpeedSetting) => {
    setSpeed(newSpeed);
    speedRef.current = newSpeed;
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
    isPausedRef.current = false;
    setLog([]);
    setDisplayIndex(-1);
    setShowcaseState('intro');
    setExecutingStep(null);
    demoDataRef.current = {};
    navigate(`/showcase/${id}`, { replace: true });
  };

  const reset = () => {
    setSteps(makeSteps(showcase));
    setCurrentStep(0);
    currentStepRef.current = 0;
    setIsRunning(false);
    isRunningRef.current = false;
    isPausedRef.current = false;
    setLog([]);
    setDisplayIndex(-1);
    setShowcaseState('intro');
    setExecutingStep(null);
    demoDataRef.current = {};
  };

  const togglePause = () => {
    if (showcaseState === 'running') {
      isPausedRef.current = true;
      setShowcaseState('paused');
    } else if (showcaseState === 'paused') {
      isPausedRef.current = false;
      setShowcaseState('running');
    }
  };

  const executeStep = async (stepIndex: number, stepsSource: ShowcaseStep[]) => {
    const step = stepsSource[stepIndex];
    setExecutingStep(stepIndex);
    addLog('');
    addLog(`▶ Step ${step.id}: ${step.title}`);

    try {
      await step.action(addLog, updateDemoData, demoDataRef.current);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`⚠ Error: ${msg}`);
    }

    setExecutingStep(null);
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
    setShowcaseState('running');

    if (idx === 0) {
      addLog(`🚀 Starting ${showcase.name}...`);
    }

    try {
      await executeStep(idx, showcase.steps);
      if (currentStepRef.current >= showcase.steps.length) {
        addLog('');
        addLog('🎉 Showcase complete!');
        setShowcaseState('completed');
      } else {
        setShowcaseState('paused'); // Pause after each step in single-step mode
      }
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const runAllSteps = async () => {
    if (isRunningRef.current) return;

    // If starting from intro or reset
    if (showcaseState === 'intro' || currentStepRef.current === 0) {
      setSteps(makeSteps(showcase));
      setCurrentStep(0);
      currentStepRef.current = 0;
      setLog([]);
      setDisplayIndex(-1);
      demoDataRef.current = {};
    }

    // Wait a tick for state to flush
    await new Promise(r => setTimeout(r, 50));

    setIsRunning(true);
    isRunningRef.current = true;
    isPausedRef.current = false;
    setShowcaseState('running');

    if (currentStepRef.current === 0) {
      addLog(`🚀 Starting ${showcase.name}...`);
    } else {
      addLog(`▶ Resuming from step ${currentStepRef.current + 1}...`);
    }

    try {
      const startIdx = currentStepRef.current;
      for (let i = startIdx; i < showcase.steps.length; i++) {
        // Check for pause
        while (isPausedRef.current) {
          await new Promise(r => setTimeout(r, 100));
          if (!isRunningRef.current) return; // Stopped
        }

        await new Promise(r => setTimeout(r, SPEED_DELAYS[speedRef.current]));
        await executeStep(i, showcase.steps);
      }
      addLog('');
      addLog('🎉 Showcase complete!');
      setShowcaseState('completed');
    } finally {
      setIsRunning(false);
      isRunningRef.current = false;
    }
  };

  const startFromIntro = () => {
    setShowcaseState('paused');
    setDisplayIndex(-1);
  };

  // Which step to display in the center + code panels
  const displayStep = displayIndex >= 0 && displayIndex < steps.length
    ? steps[displayIndex]
    : steps[0];

  // Progress calculation
  const completedCount = steps.filter(s => s.completed).length;
  const progressPct = steps.length > 0 ? (completedCount / steps.length) * 100 : 0;

  // Speed selector component
  const SpeedSelector = () => (
    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
      {(Object.keys(SPEED_DELAYS) as SpeedSetting[]).map(s => {
        const { label, icon: Icon } = SPEED_LABELS[s];
        return (
          <button
            key={s}
            onClick={() => handleSpeedChange(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              speed === s
                ? 'bg-primary/20 text-primary'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        );
      })}
    </div>
  );

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
        {/* Progress bar with animated gradient when running */}
        <div className="h-1.5 bg-white/5 relative overflow-hidden">
          <div
            className={`h-full ${colorTheme.progress} transition-all duration-500 ease-out`}
            style={{ width: `${progressPct}%` }}
          />
          {isRunning && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>

      {/* Header with enhanced controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white">{showcase.name}</h2>
            {executingStep !== null && (
              <span className="flex items-center gap-2 px-3 py-1 bg-primary/20 text-primary text-xs rounded-full animate-pulse">
                <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
                Executing Step {executingStep + 1}
              </span>
            )}
            {showcaseState === 'completed' && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                <CheckCircle2 className="w-3 h-3" />
                Complete
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-1">{showcase.description}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Speed Control - show when not in intro */}
          {showcaseState !== 'intro' && <SpeedSelector />}

          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/playground/${activeVertical}`)}
              className="flex items-center gap-2 px-3 py-2 border border-primary/30 rounded-lg text-primary hover:bg-primary/10 transition-colors text-sm"
            >
              <Code2 className="w-4 h-4" />
              <span className="hidden md:inline">Playground</span>
            </button>

            {showcaseState !== 'intro' && (
              <button
                onClick={reset}
                disabled={isRunning && showcaseState !== 'paused'}
                className="flex items-center gap-2 px-3 py-2 border border-white/10 rounded-lg text-gray-400 hover:bg-white/5 hover:text-white transition-colors text-sm disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden md:inline">Reset</span>
              </button>
            )}

            {/* Pause/Resume button for Run All */}
            {(showcaseState === 'running' || showcaseState === 'paused') && (
              <button
                onClick={togglePause}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm border ${
                  showcaseState === 'paused'
                    ? 'bg-primary text-white border-primary hover:bg-primary/90'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
                }`}
              >
                {showcaseState === 'paused' ? (
                  <>
                    <Play className="w-4 h-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause
                  </>
                )}
              </button>
            )}

            {/* Run Step - when not in intro and not complete */}
            {showcaseState !== 'intro' && showcaseState !== 'completed' && (
              <button
                onClick={runSingleStep}
                disabled={isRunning || currentStep >= steps.length}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm disabled:opacity-50 shadow-lg shadow-primary/20"
              >
                <ChevronRight className="w-4 h-4" />
                Next Step
              </button>
            )}

            {/* Run All - show when paused or after reset */}
            {(showcaseState === 'paused' || (showcaseState !== 'intro' && showcaseState !== 'running' && showcaseState !== 'completed')) && (
              <button
                onClick={runAllSteps}
                disabled={isRunning}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/15 transition-colors text-sm disabled:opacity-50 border border-white/10"
              >
                <FastForward className="w-4 h-4" />
                Auto-Run
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area - Intro / Main / Summary */}
      {showcaseState === 'intro' ? (
        <div className="glass-card rounded-xl border border-white/10 overflow-hidden" style={{ minHeight: '600px' }}>
          <ShowcaseIntro
            showcase={showcase}
            colorTheme={colorTheme}
            onStart={startFromIntro}
            onRunAll={runAllSteps}
          />
        </div>
      ) : showcaseState === 'completed' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ minHeight: '600px' }}>
          {/* Left: Steps Panel - Completed State */}
          <div className="lg:col-span-3 glass-card rounded-xl border border-white/10 p-4 overflow-y-auto max-h-[700px]">
            <ProgressStepper
              steps={steps}
              currentStep={currentStep}
              sections={showcase.sections}
              displayIndex={displayIndex}
              isRunning={isRunning}
              executingStep={executingStep}
              onStepClick={setDisplayIndex}
            />
          </div>

          {/* Center: Summary */}
          <div className="lg:col-span-5 glass-card rounded-xl border border-white/10 overflow-hidden">
            <ShowcaseSummary
              showcase={showcase}
              colorTheme={colorTheme}
              steps={steps}
              onReset={reset}
              onOpenPlayground={() => navigate(`/playground/${activeVertical}`)}
            />
          </div>

          {/* Right: Code + Console */}
          <div className="lg:col-span-4 h-full">
            <CodePanel
              code={displayStep.code}
              log={log}
            />
          </div>
        </div>
      ) : (
        /* 3-Panel Layout - Running/Paused State */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" style={{ minHeight: '600px' }}>
          {/* Left: Steps Panel with Section Grouping */}
          <div className="lg:col-span-3 glass-card rounded-xl border border-white/10 p-4 overflow-y-auto max-h-[700px]">
            <ProgressStepper
              steps={steps}
              currentStep={currentStep}
              sections={showcase.sections}
              displayIndex={displayIndex}
              isRunning={isRunning}
              executingStep={executingStep}
              onStepClick={setDisplayIndex}
            />
          </div>

          {/* Center: Live UI Preview */}
          <div className="lg:col-span-5 glass-card rounded-xl border border-white/10 p-6 overflow-y-auto relative">
            {/* Executing overlay */}
            {executingStep !== null && (
              <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
                <div className="flex flex-col items-center gap-3 p-6 bg-black/60 rounded-xl border border-primary/30">
                  <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-white font-medium">Executing Step {executingStep + 1}...</p>
                  <p className="text-xs text-gray-400">{steps[executingStep]?.title}</p>
                </div>
              </div>
            )}

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
                  <p className="text-sm">Click "Next Step" to begin the showcase</p>
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
          <div className="lg:col-span-4 h-full">
            <CodePanel
              code={displayStep.code}
              log={log}
            />
          </div>
        </div>
      )}

      {/* Footer - Only show when not in intro */}
      {showcaseState !== 'intro' && (
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <div className="flex items-center gap-4">
            <span>
              {showcaseState === 'completed'
                ? `All ${steps.length} steps completed`
                : showcaseState === 'running'
                  ? `Running step ${currentStep + 1} of ${steps.length}...`
                  : currentStep > 0
                    ? `Step ${currentStep} of ${steps.length} — "${steps[Math.min(currentStep, steps.length) - 1]?.title}"`
                    : 'Ready to start'
              }
            </span>
            {showcaseState === 'paused' && currentStep > 0 && currentStep < steps.length && (
              <span className="text-amber-400">Paused</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">
              Speed: {SPEED_LABELS[speed].label}
            </span>
            {showcaseState !== 'completed' && (
              <button onClick={reset} className="hover:text-white transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
