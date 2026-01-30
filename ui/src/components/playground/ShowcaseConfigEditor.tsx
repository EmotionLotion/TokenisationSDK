import { useState } from 'react';
import { ChevronDown, ChevronRight, Edit3, Code2, FileJson } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ShowcaseConfig } from '../showcases/types';

type EditMode = 'view' | 'json' | 'form';

interface ShowcaseConfigEditorProps {
  config: ShowcaseConfig;
  activeStep: number;
  onStepSelect: (index: number) => void;
  /** Called when config changes via editor (enables live HMR feel) */
  onConfigChange?: (updatedCode: string, stepIndex: number) => void;
}

export function ShowcaseConfigEditor({
  config,
  activeStep,
  onStepSelect,
  onConfigChange,
}: ShowcaseConfigEditorProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([activeStep]));
  const [editMode, setEditMode] = useState<EditMode>('view');
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState<string>('');

  const toggleStep = (index: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    onStepSelect(index);
  };

  const startEditing = (index: number) => {
    setEditingStepIndex(index);
    setEditBuffer(config.steps[index].code);
    setEditMode('json');
  };

  const applyEdit = () => {
    if (editingStepIndex !== null && onConfigChange) {
      onConfigChange(editBuffer, editingStepIndex);
    }
    setEditMode('view');
    setEditingStepIndex(null);
  };

  const cancelEdit = () => {
    setEditMode('view');
    setEditingStepIndex(null);
    setEditBuffer('');
  };

  return (
    <div className="space-y-2 overflow-y-auto max-h-[600px] pr-1">
      {/* Header with edit mode toggle */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <div>
            <h3 className="text-sm font-bold text-white">{config.name}</h3>
            <p className="text-[10px] text-gray-500">{config.steps.length} steps</p>
          </div>
        </div>
        {onConfigChange && (
          <div className="flex gap-1">
            <button
              onClick={() => setEditMode(editMode === 'json' ? 'view' : 'json')}
              className={`p-1.5 rounded transition-colors ${
                editMode === 'json' ? 'bg-primary/20 text-primary' : 'text-gray-500 hover:text-gray-300'
              }`}
              title="JSON edit mode"
            >
              <FileJson className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {config.steps.map((step, index) => {
        const isExpanded = expandedSteps.has(index);
        const isActive = index === activeStep;
        const isEditing = editingStepIndex === index && editMode === 'json';

        return (
          <div
            key={step.id}
            className={`rounded-lg border transition-colors ${
              isActive
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-white/5 bg-white/[0.02] hover:border-white/10'
            }`}
          >
            <button
              onClick={() => toggleStep(index)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
              )}
              <span className={`text-xs font-medium flex-1 ${isActive ? 'text-amber-400' : 'text-gray-300'}`}>
                {step.id}. {step.title}
              </span>
              {onConfigChange && isExpanded && (
                <Edit3
                  className="w-3 h-3 text-gray-600 hover:text-gray-400 shrink-0"
                  onClick={(e) => { e.stopPropagation(); startEditing(index); }}
                />
              )}
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-2">
                    <p className="text-[11px] text-gray-500">{step.description}</p>
                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={editBuffer}
                          onChange={(e) => setEditBuffer(e.target.value)}
                          className="w-full bg-[#0d1117] rounded p-2 border border-primary/30 text-[10px] text-gray-300 font-mono resize-none focus:outline-none focus:border-primary/60"
                          rows={10}
                          spellCheck={false}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={applyEdit}
                            className="px-2 py-1 text-[10px] bg-primary/20 text-primary rounded hover:bg-primary/30 transition-colors"
                          >
                            Apply
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-2 py-1 text-[10px] text-gray-400 hover:text-white transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-[#0d1117] rounded p-2 border border-white/5">
                        <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-[150px]">
                          {step.code.slice(0, 500)}
                          {step.code.length > 500 ? '\n...' : ''}
                        </pre>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
