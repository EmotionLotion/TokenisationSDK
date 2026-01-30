/**
 * ConfigureCompliance — Blueprint component extracted from real-estate showcase step 2.
 *
 * Displays and optionally edits compliance rules for an asset.
 */

import { useState } from 'react';

export interface ComplianceRule {
  label: string;
  value: string;
  status: boolean;
}

export interface ConfigureComplianceProps {
  rules: ComplianceRule[];
  onSave?: (rules: ComplianceRule[]) => void;
  isEditable?: boolean;
}

export function ConfigureCompliance({
  rules,
  onSave,
  isEditable = false,
}: ConfigureComplianceProps) {
  const [editableRules, setEditableRules] = useState<ComplianceRule[]>(rules);
  const [editing, setEditing] = useState(false);

  const handleToggle = (index: number) => {
    if (!isEditable) return;
    const updated = editableRules.map((r, i) =>
      i === index ? { ...r, status: !r.status } : r
    );
    setEditableRules(updated);
  };

  const handleSave = () => {
    onSave?.(editableRules);
    setEditing(false);
  };

  const displayRules = editing ? editableRules : rules;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Compliance Configuration</h3>
        {isEditable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Edit
          </button>
        )}
        {editing && (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setEditableRules(rules); }}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              Save
            </button>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {displayRules.map((item, index) => (
          <div
            key={item.label}
            className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => editing && handleToggle(index)}
                disabled={!editing}
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                  item.status
                    ? 'bg-green-500 text-white'
                    : 'bg-white/10 text-gray-500'
                } ${editing ? 'cursor-pointer hover:opacity-80' : ''}`}
              >
                {item.status ? '✓' : '○'}
              </button>
              <span className="text-sm text-gray-300">{item.label}</span>
            </div>
            <span className="text-sm font-bold text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
