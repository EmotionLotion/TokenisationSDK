import { CheckCircle, Clock, Loader2, XCircle, Zap } from 'lucide-react';
import type { WorkflowExecution } from '../../core/store';

interface WorkflowExecutionTimelineProps {
  executions: WorkflowExecution[];
  accentColor?: string;
  maxItems?: number;
}

const STEP_ICONS: Record<string, typeof Zap> = {
  'Trigger Received': Zap,
  'Data Fetch': Clock,
  'DON Consensus': CheckCircle,
  'On-Chain Action': Zap,
  'Callback': CheckCircle,
};

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'done':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    case 'running':
      return <Loader2 className="w-3.5 h-3.5 text-[#F8B032] animate-spin" />;
    case 'failed':
      return <XCircle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-600" />;
  }
}

export function WorkflowExecutionTimeline({
  executions,
  accentColor = 'text-[#F8B032]',
  maxItems = 5,
}: WorkflowExecutionTimelineProps) {
  const visible = executions.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl border border-white/10 text-center">
        <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No workflow executions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className={`text-sm font-medium ${accentColor}`}>Recent Executions</h4>
      {visible.map(exec => (
        <div
          key={exec.id}
          className="glass-card rounded-xl border border-white/10 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${accentColor}`} />
              <span className="text-sm font-medium text-white">{exec.workflowName}</span>
            </div>
            <span className="text-[10px] text-gray-500">
              {new Date(exec.triggeredAt).toLocaleTimeString()}
            </span>
          </div>

          {/* Timeline steps */}
          <div className="px-4 py-3">
            <div className="relative">
              {exec.steps.map((step, i) => (
                <div key={step.name} className="flex items-start gap-3 relative">
                  {/* Vertical line */}
                  {i < exec.steps.length - 1 && (
                    <div
                      className={`absolute left-[7px] top-5 bottom-0 w-px ${
                        step.status === 'done' ? 'bg-green-500/30' : 'bg-white/10'
                      }`}
                    />
                  )}

                  {/* Icon */}
                  <div className="relative z-10 mt-0.5">
                    <StepStatusIcon status={step.status} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <p className="text-xs font-medium text-white">{step.name}</p>
                    {step.detail && (
                      <p className="text-[10px] text-gray-500 mt-0.5">{step.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Result summary */}
          {exec.result && (
            <div className="px-4 py-2 bg-white/5 border-t border-white/5">
              <div className="flex items-center gap-4 text-[10px]">
                <span className="text-green-400 font-medium">
                  {(exec.result as any).success ? 'Success' : 'Failed'}
                </span>
                <span className="text-gray-500">
                  Consensus: {(exec.result as any).consensus}
                </span>
                <span className="text-gray-500">
                  Gas: {(exec.result as any).gasUsed}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
