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
  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const Icon = STEP_ICONS[step.status];
        const iconColor = color && step.status === 'active' ? `text-[${color}]` : STEP_COLORS[step.status];
        const isActive = i === activeStep;

        return (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-white/10' : ''
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 ${iconColor} ${step.status === 'active' ? 'animate-spin' : ''}`}
            />
            <span className={`text-sm ${isActive ? 'text-white font-medium' : 'text-gray-400'}`}>
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
