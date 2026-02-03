import React, { useState } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '../../theme.js';

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface MaintenanceFormData {
  unitId?: string;
  category: string;
  priority: MaintenancePriority;
  description: string;
  assignee?: string;
  estimatedCost?: string;
  currency: string;
}

export interface UnitOption {
  id: string;
  unitNumber: string;
}

export interface MaintenanceFormProps {
  units?: UnitOption[];
  onSubmit: (data: MaintenanceFormData) => void | Promise<void>;
  onCancel?: () => void;
  theme?: TokenisationTheme;
  loading?: boolean;
  title?: string;
}

const categories = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Appliance Repair',
  'Structural',
  'Painting',
  'Flooring',
  'Roofing',
  'Landscaping',
  'Pest Control',
  'Security',
  'Cleaning',
  'General Maintenance',
  'Other',
];

const priorities: { value: MaintenancePriority; label: string; description: string }[] = [
  { value: 'low', label: 'Low', description: 'Can wait a few weeks' },
  { value: 'medium', label: 'Medium', description: 'Should be done within a week' },
  { value: 'high', label: 'High', description: 'Needs attention within 24-48 hours' },
  { value: 'urgent', label: 'Urgent', description: 'Immediate attention required' },
];

const currencies = ['USD', 'AED', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];

export function MaintenanceForm({
  units = [],
  onSubmit,
  onCancel,
  theme = defaultTheme,
  loading = false,
  title = 'New Maintenance Request',
}: MaintenanceFormProps) {
  const styles = createStyles(theme);

  const [formData, setFormData] = useState<MaintenanceFormData>({
    unitId: '',
    category: '',
    priority: 'medium',
    description: '',
    assignee: '',
    estimatedCost: '',
    currency: 'USD',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.category) {
      newErrors.category = 'Category is required';
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }
    if (formData.description.trim().length < 10) {
      newErrors.description = 'Description must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      await onSubmit(formData);
    }
  };

  const handleChange = (field: keyof MaintenanceFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const { [field]: _, ...rest } = prev;
        return rest;
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{
      ...styles.container,
      maxWidth: '600px',
    }}>
      <h3 style={{
        margin: `0 0 ${theme.spacing.lg} 0`,
        color: theme.colors.text,
        fontSize: '18px',
        fontWeight: 600,
      }}>
        {title}
      </h3>

      {/* Unit (optional) */}
      {units.length > 0 && (
        <div style={{ marginBottom: theme.spacing.md }}>
          <label style={styles.label}>Unit (optional)</label>
          <select
            value={formData.unitId}
            onChange={(e) => handleChange('unitId', e.target.value)}
            style={styles.input}
          >
            <option value="">Property-wide / Not specific</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.unitNumber}</option>
            ))}
          </select>
        </div>
      )}

      {/* Category */}
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={styles.label}>Category *</label>
        <select
          value={formData.category}
          onChange={(e) => handleChange('category', e.target.value)}
          style={{
            ...styles.input,
            borderColor: errors.category ? theme.colors.error : theme.colors.border,
          }}
        >
          <option value="">Select a category</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.category && (
          <div style={{ color: theme.colors.error, fontSize: '12px', marginTop: '4px' }}>
            {errors.category}
          </div>
        )}
      </div>

      {/* Priority */}
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={styles.label}>Priority *</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: theme.spacing.sm }}>
          {priorities.map(p => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleChange('priority', p.value)}
              style={{
                padding: theme.spacing.sm,
                backgroundColor: formData.priority === p.value
                  ? `${theme.colors.primary}20`
                  : theme.colors.background,
                border: `1px solid ${formData.priority === p.value ? theme.colors.primary : theme.colors.border}`,
                borderRadius: theme.borderRadius.md,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div style={{
                fontSize: '14px',
                fontWeight: 600,
                color: formData.priority === p.value ? theme.colors.primary : theme.colors.text,
              }}>
                {p.label}
              </div>
              <div style={{
                fontSize: '10px',
                color: theme.colors.textMuted,
                marginTop: '2px',
              }}>
                {p.description}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div style={{ marginBottom: theme.spacing.md }}>
        <label style={styles.label}>Description *</label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          style={{
            ...styles.input,
            minHeight: '100px',
            resize: 'vertical',
            borderColor: errors.description ? theme.colors.error : theme.colors.border,
          }}
          placeholder="Describe the issue in detail..."
        />
        {errors.description && (
          <div style={{ color: theme.colors.error, fontSize: '12px', marginTop: '4px' }}>
            {errors.description}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
        {/* Assignee */}
        <div>
          <label style={styles.label}>Assignee (optional)</label>
          <input
            type="text"
            value={formData.assignee}
            onChange={(e) => handleChange('assignee', e.target.value)}
            style={styles.input}
            placeholder="e.g., John's Plumbing"
          />
        </div>

        {/* Estimated Cost */}
        <div>
          <label style={styles.label}>Estimated Cost</label>
          <input
            type="text"
            value={formData.estimatedCost}
            onChange={(e) => handleChange('estimatedCost', e.target.value)}
            style={styles.input}
            placeholder="0.00"
          />
        </div>

        {/* Currency */}
        <div>
          <label style={styles.label}>Currency</label>
          <select
            value={formData.currency}
            onChange={(e) => handleChange('currency', e.target.value)}
            style={styles.input}
          >
            {currencies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: theme.spacing.md,
        marginTop: theme.spacing.lg,
        justifyContent: 'flex-end',
      }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={styles.buttonSecondary}
            disabled={loading}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          style={{
            ...styles.button,
            opacity: loading ? 0.7 : 1,
          }}
          disabled={loading}
        >
          {loading ? 'Creating...' : 'Create Request'}
        </button>
      </div>
    </form>
  );
}
