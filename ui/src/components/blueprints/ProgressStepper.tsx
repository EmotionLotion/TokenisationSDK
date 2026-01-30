/**
 * ProgressStepper — Extracted from GuidedShowcase.
 *
 * Renders a step list grouped by sections, highlighting current/completed steps.
 */

import { CheckCircle } from 'lucide-react';
import type { ShowcaseStep, ShowcaseSection } from '../showcases/types';

export interface ProgressStepperProps {
  steps: ShowcaseStep[];
  currentStep: number;
  sections?: ShowcaseSection[];
  displayIndex: number;
  isRunning: boolean;
  onStepClick: (globalIndex: number) => void;
}

interface SectionGroup {
  section: ShowcaseSection;
  steps: { step: ShowcaseStep; globalIndex: number }[];
}

function groupStepsBySection(
  steps: ShowcaseStep[],
  sections?: ShowcaseSection[]
): SectionGroup[] {
  if (!sections || sections.length === 0) {
    return [{
      section: { id: 'default', label: 'Steps' },
      steps: steps.map((step, i) => ({ step, globalIndex: i })),
    }];
  }

  const groups: SectionGroup[] = [];
  const sectionMap = new Map<string, SectionGroup>();

  for (const sec of sections) {
    const group: SectionGroup = { section: sec, steps: [] };
    sectionMap.set(sec.id, group);
    groups.push(group);
  }

  steps.forEach((step, index) => {
    const group = sectionMap.get(step.sectionId);
    if (group) {
      group.steps.push({ step, globalIndex: index });
    }
  });

  return groups.filter(g => g.steps.length > 0);
}

export function ProgressStepper({
  steps,
  currentStep,
  sections,
  displayIndex,
  isRunning,
  onStepClick,
}: ProgressStepperProps) {
  const completedCount = steps.filter(s => s.completed).length;
  const sectionGroups = groupStepsBySection(steps, sections);
  const hasSections = sections && sections.length > 1;

  return (
    <div className="space-y-1">
      <h3 className="text-xs uppercase tracking-widest text-gray-500 font-medium mb-3">
        Steps ({completedCount}/{steps.length})
      </h3>
      {sectionGroups.map(group => (
        <div key={group.section.id}>
          {hasSections && (
            <div className="sticky top-0 z-10 bg-[#0a0a1a]/95 backdrop-blur-sm py-1.5 px-1 -mx-1 mb-1">
              <p className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold">
                {group.section.label}
              </p>
            </div>
          )}
          <div className="space-y-1 mb-2">
            {group.steps.map(({ step, globalIndex }) => (
              <button
                key={step.id}
                onClick={() => {
                  if (!isRunning && step.completed) {
                    onStepClick(globalIndex);
                  }
                }}
                className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all text-left border ${
                  globalIndex === displayIndex
                    ? 'bg-primary/10 border-primary/30'
                    : step.completed
                      ? 'bg-green-500/5 border-green-500/20 cursor-pointer hover:bg-green-500/10'
                      : 'bg-white/5 border-transparent'
                }`}
              >
                <div
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.completed
                      ? 'bg-green-500 text-white'
                      : globalIndex === currentStep && isRunning
                        ? 'bg-primary text-white animate-pulse'
                        : 'bg-white/10 text-gray-500'
                  }`}
                >
                  {step.completed ? <CheckCircle className="w-3.5 h-3.5" /> : step.id}
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] font-medium truncate ${step.completed ? 'text-green-400' : 'text-gray-300'}`}>
                    {step.title}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
