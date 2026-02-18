import React from 'react';
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Building2,
  Users,
  FileText,
  Upload,
  UserPlus,
  ShieldCheck,
} from 'lucide-react';

export interface OnboardingStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
}

export interface BeneficialOwner {
  name: string;
  ownership: number;
  verified: boolean;
}

export interface OnboardingDocument {
  name: string;
  type: string;
  status: 'pending' | 'uploaded' | 'verified' | 'rejected';
}

export interface EntityOnboardingProps {
  steps: OnboardingStep[];
  beneficialOwners?: BeneficialOwner[];
  documents?: OnboardingDocument[];
  entityName?: string;
  entityType?: 'corporation' | 'llc' | 'partnership' | 'trust' | 'fund';
  onUploadDocument?: (type: string) => void;
  onAddOwner?: () => void;
  className?: string;
}

const STEP_ICON: Record<OnboardingStep['status'], React.ElementType> = {
  pending: Circle,
  in_progress: Loader2,
  completed: CheckCircle,
  rejected: XCircle,
};

const STEP_COLOR: Record<OnboardingStep['status'], string> = {
  pending: 'text-slate-500',
  in_progress: 'text-blue-400',
  completed: 'text-green-400',
  rejected: 'text-red-400',
};

const LINE_COLOR: Record<OnboardingStep['status'], string> = {
  pending: 'bg-slate-700',
  in_progress: 'bg-blue-500/40',
  completed: 'bg-green-500/40',
  rejected: 'bg-red-500/40',
};

const DOC_STATUS_STYLE: Record<OnboardingDocument['status'], { color: string; bg: string; label: string }> = {
  pending: { color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Pending' },
  uploaded: { color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Uploaded' },
  verified: { color: 'text-green-400', bg: 'bg-green-500/10', label: 'Verified' },
  rejected: { color: 'text-red-400', bg: 'bg-red-500/10', label: 'Rejected' },
};

const ENTITY_LABELS: Record<NonNullable<EntityOnboardingProps['entityType']>, string> = {
  corporation: 'Corporation',
  llc: 'LLC',
  partnership: 'Partnership',
  trust: 'Trust',
  fund: 'Fund',
};

export function EntityOnboarding({
  steps,
  beneficialOwners = [],
  documents = [],
  entityName,
  entityType,
  onUploadDocument,
  onAddOwner,
  className = '',
}: EntityOnboardingProps) {
  return (
    <div className={`bg-white/5 border border-white/10 rounded-xl overflow-hidden ${className}`} role="region" aria-label="Entity onboarding">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center gap-3">
        <Building2 className="w-5 h-5 text-violet-400" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          {entityName && <h3 className="font-semibold text-white truncate">{entityName}</h3>}
          {entityType && (
            <span className="inline-block text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2 py-0.5 mt-0.5">
              {ENTITY_LABELS[entityType]}
            </span>
          )}
        </div>
      </div>

      {/* Step Progress */}
      <div className="p-4 border-b border-white/10">
        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Progress</h4>
        <ol className="relative space-y-0">
          {steps.map((step, i) => {
            const Icon = STEP_ICON[step.status];
            const color = STEP_COLOR[step.status];
            const isLast = i === steps.length - 1;

            return (
              <li key={step.id} className="relative flex items-start gap-3 pb-4 last:pb-0">
                {/* Connecting line */}
                {!isLast && (
                  <div className={`absolute left-[9px] top-5 w-0.5 h-[calc(100%-8px)] ${LINE_COLOR[step.status]}`} />
                )}
                <Icon
                  className={`w-5 h-5 shrink-0 ${color} ${step.status === 'in_progress' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span className={`text-sm ${step.status === 'in_progress' ? 'text-white font-medium' : step.status === 'completed' ? 'text-slate-300' : 'text-slate-500'}`}>
                  {step.title}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Beneficial Owners */}
      {(beneficialOwners.length > 0 || onAddOwner) && (
        <div className="p-4 border-b border-white/10">
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" aria-hidden="true" />
            Beneficial Owners
          </h4>
          <ul className="space-y-2">
            {beneficialOwners.map((owner, i) => (
              <li key={i} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  {owner.verified ? (
                    <ShieldCheck className="w-4 h-4 text-green-400" aria-label="Verified" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-500" aria-label="Unverified" />
                  )}
                  <span className="text-sm text-slate-200">{owner.name}</span>
                </div>
                <span className="text-xs font-mono text-slate-400">{owner.ownership}%</span>
              </li>
            ))}
          </ul>
          {onAddOwner && (
            <button
              onClick={onAddOwner}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Owner
            </button>
          )}
        </div>
      )}

      {/* Documents */}
      {(documents.length > 0 || onUploadDocument) && (
        <div className="p-4">
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Documents
          </h4>
          <ul className="space-y-2">
            {documents.map((doc, i) => {
              const style = DOC_STATUS_STYLE[doc.status];
              return (
                <li key={i} className="flex items-center justify-between py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200 truncate">{doc.name}</p>
                    <p className="text-xs text-slate-500">{doc.type}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.color} ${style.bg}`}>
                      {style.label}
                    </span>
                    {doc.status === 'pending' && onUploadDocument && (
                      <button
                        onClick={() => onUploadDocument(doc.type)}
                        className="p-1 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                        aria-label={`Upload ${doc.name}`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
