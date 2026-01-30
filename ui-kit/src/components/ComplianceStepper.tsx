import React from 'react';
import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react';

export interface StepConfig {
  label: string;
  status: 'pending' | 'active' | 'complete' | 'failed';
}

export interface ComplianceStepperProps {
  steps: StepConfig[];
  activeStep: number;
  color?: string;
}

const STEP_ICONS = {
  pending: Circle,
  active: Loader2,
  complete: CheckCircle,
  failed: XCircle,
};

const STEP_COLORS = {
  pending: 'text-gray-500',
  active: 'text-amber-400',
  complete: 'text-green-400',
  failed: 'text-red-400',
};

export function ComplianceStepper({ steps, activeStep, color }: ComplianceStepperProps) {
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  return (
    <div
      className="space-y-1"
      role="group"
      aria-label="Compliance verification steps"
    >
      <div
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Compliance progress: ${completedCount} of ${steps.length} steps completed`}
        className="sr-only"
      />
      <ol aria-label="Verification steps">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.status];
          const iconColor = color && step.status === 'active' ? `text-[${color}]` : STEP_COLORS[step.status];
          const isActive = i === activeStep;

          return (
            <li
              key={i}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive ? 'bg-white/10' : ''
              }`}
              aria-current={isActive ? 'step' : undefined}
              aria-label={`${step.label}: ${step.status}`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${iconColor} ${step.status === 'active' ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className={`text-sm ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
