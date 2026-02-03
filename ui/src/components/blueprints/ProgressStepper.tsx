/**
 * ProgressStepper — Extracted from GuidedShowcase.
 *
 * Renders a step list grouped by sections, highlighting current/completed steps.
 * Enhanced with animations, executing state, and better visual hierarchy.
 */

import { useState } from 'react';
import { CheckCircle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { ShowcaseStep, ShowcaseSection } from '../showcases/types';

export interface ProgressStepperProps {
  steps: ShowcaseStep[];
  currentStep: number;
  sections?: ShowcaseSection[];
  displayIndex: number;
  isRunning: boolean;
  executingStep?: number | null;
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
  executingStep,
  onStepClick,
}: ProgressStepperProps) {
  const completedCount = steps.filter(s => s.completed).length;
  const sectionGroups = groupStepsBySection(steps, sections);
  const hasSections = sections && sections.length > 1;

  // Track collapsed sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Calculate section progress
  const getSectionProgress = (group: SectionGroup) => {
    const completed = group.steps.filter(({ step }) => step.completed).length;
    return { completed, total: group.steps.length };
  };

  return (
    <div className="space-y-1">
      {/* Header with progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-widest text-gray-500 font-medium">
            Progress
          </h3>
          <span className="text-xs text-gray-400">
            {completedCount}/{steps.length}
          </span>
        </div>
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-green-500 transition-all duration-500 ease-out"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {sectionGroups.map((group, groupIdx) => {
        const { completed, total } = getSectionProgress(group);
        const isCollapsed = collapsedSections.has(group.section.id);
        const isSectionComplete = completed === total;
        const isCurrentSection = group.steps.some(({ globalIndex }) =>
          globalIndex === currentStep || globalIndex === executingStep
        );

        return (
          <div key={group.section.id} className="mb-3">
            {hasSections && (
              <button
                onClick={() => toggleSection(group.section.id)}
                className={`w-full sticky top-0 z-10 bg-[#0a0a1a]/95 backdrop-blur-sm py-2 px-2 -mx-1 mb-1 flex items-center justify-between rounded-lg border transition-all ${
                  isCurrentSection
                    ? 'border-primary/30 bg-primary/5'
                    : isSectionComplete
                      ? 'border-green-500/20 bg-green-500/5'
                      : 'border-transparent hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-gray-500" />
                  )}
                  <p className={`text-[10px] uppercase tracking-widest font-semibold ${
                    isCurrentSection ? 'text-primary' : isSectionComplete ? 'text-green-400' : 'text-gray-500'
                  }`}>
                    {group.section.label}
                  </p>
                </div>
                <span className={`text-[10px] font-medium ${
                  isSectionComplete ? 'text-green-400' : 'text-gray-600'
                }`}>
                  {completed}/{total}
                </span>
              </button>
            )}

            {/* Steps - collapsible */}
            {!isCollapsed && (
              <div className="space-y-1 pl-1">
                {group.steps.map(({ step, globalIndex }) => {
                  const isExecuting = globalIndex === executingStep;
                  const isSelected = globalIndex === displayIndex;
                  const isNext = globalIndex === currentStep && !isExecuting;

                  return (
                    <button
                      key={step.id}
                      onClick={() => {
                        if (!isRunning && step.completed) {
                          onStepClick(globalIndex);
                        }
                      }}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg transition-all text-left border ${
                        isExecuting
                          ? 'bg-primary/20 border-primary/50 shadow-lg shadow-primary/10'
                          : isSelected
                            ? 'bg-primary/10 border-primary/30'
                            : step.completed
                              ? 'bg-green-500/5 border-green-500/20 cursor-pointer hover:bg-green-500/10'
                              : isNext
                                ? 'bg-white/5 border-white/20 ring-1 ring-white/10'
                                : 'bg-white/[0.02] border-transparent hover:bg-white/5'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                          isExecuting
                            ? 'bg-primary text-white'
                            : step.completed
                              ? 'bg-green-500 text-white'
                              : isNext
                                ? 'bg-white/20 text-white'
                                : 'bg-white/10 text-gray-500'
                        }`}
                      >
                        {isExecuting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : step.completed ? (
                          <CheckCircle className="w-3.5 h-3.5" />
                        ) : (
                          step.id
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[11px] font-medium truncate ${
                          isExecuting
                            ? 'text-primary'
                            : step.completed
                              ? 'text-green-400'
                              : isNext
                                ? 'text-white'
                                : 'text-gray-400'
                        }`}>
                          {step.title}
                        </p>
                      </div>
                      {isExecuting && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
