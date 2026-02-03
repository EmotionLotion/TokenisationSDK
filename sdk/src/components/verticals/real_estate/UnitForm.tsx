import React, { useState, useEffect } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '../../theme.js';

export type UnitType = 'studio' | 'apartment' | '1bed' | '2bed' | '3bed' | 'penthouse' | 'retail' | 'office' | 'warehouse' | 'other';
export type UnitStatus = 'vacant' | 'occupied' | 'maintenance' | 'reserved';

export interface UnitFormData {
  unitNumber: string;
  type: UnitType;
  area: number;
  tenantName?: string;
  tenantEmail?: string;
  leaseStart?: string;
  leaseEnd?: string;
  monthlyRent?: string;
  currency: string;
  status: UnitStatus;
}

export interface UnitFormProps {
  initialData?: Partial<UnitFormData>;
  onSubmit: (data: UnitFormData) => void | Promise<void>;
  onCancel?: () => void;
  theme?: TokenisationTheme;
  loading?: boolean;
  submitLabel?: string;
  title?: string;
}

const unitTypes: { value: UnitType; label: string }[] = [
  { value: 'studio', label: 'Studio' },
  { value: 'apartment', label: 'Apartment' },
  { value: '1bed', label: '1 Bedroom' },
  { value: '2bed', label: '2 Bedroom' },
  { value: '3bed', label: '3 Bedroom' },
  { value: 'penthouse', label: 'Penthouse' },
  { value: 'retail', label: 'Retail' },
  { value: 'office', label: 'Office' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'other', label: 'Other' },
];

const unitStatuses: { value: UnitStatus; label: string }[] = [
  { value: 'vacant', label: 'Vacant' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'reserved', label: 'Reserved' },
];

const currencies = ['USD', 'AED', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];

export function UnitForm({
  initialData,
  onSubmit,
  onCancel,
  theme = defaultTheme,
  loading = false,
  submitLabel = 'Save Unit',
  title = 'Unit Details',
}: UnitFormProps) {
  const styles = createStyles(theme);

  const [formData, setFormData] = useState<UnitFormData>({
    unitNumber: initialData?.unitNumber || '',
    type: initialData?.type || 'apartment',
    area: initialData?.area || 0,
    tenantName: initialData?.tenantName || '',
    tenantEmail: initialData?.tenantEmail || '',
    leaseStart: initialData?.leaseStart || '',
    leaseEnd: initialData?.leaseEnd || '',
    monthlyRent: initialData?.monthlyRent || '',
    currency: initialData?.currency || 'USD',
    status: initialData?.status || 'vacant',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({ ...prev, ...initialData }));
    }
  }, [initialData]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.unitNumber.trim()) {
      newErrors.unitNumber = 'Unit number is required';
    }
    if (formData.area <= 0) {
      newErrors.area = 'Area must be greater than 0';
    }
    if (formData.tenantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.tenantEmail)) {
      newErrors.tenantEmail = 'Invalid email format';
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

  const handleChange = (field: keyof UnitFormData, value: string | number) => {
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.md }}>
        {/* Unit Number */}
        <div>
          <label style={styles.label}>Unit Number *</label>
          <input
            type="text"
            value={formData.unitNumber}
            onChange={(e) => handleChange('unitNumber', e.target.value)}
            style={{
              ...styles.input,
              borderColor: errors.unitNumber ? theme.colors.error : theme.colors.border,
            }}
            placeholder="e.g., A-101"
          />
          {errors.unitNumber && (
            <div style={{ color: theme.colors.error, fontSize: '12px', marginTop: '4px' }}>
              {errors.unitNumber}
            </div>
          )}
        </div>

        {/* Unit Type */}
        <div>
          <label style={styles.label}>Type *</label>
          <select
            value={formData.type}
            onChange={(e) => handleChange('type', e.target.value as UnitType)}
            style={styles.input}
          >
            {unitTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Area */}
        <div>
          <label style={styles.label}>Area (sqft) *</label>
          <input
            type="number"
            value={formData.area || ''}
            onChange={(e) => handleChange('area', parseFloat(e.target.value) || 0)}
            style={{
              ...styles.input,
              borderColor: errors.area ? theme.colors.error : theme.colors.border,
            }}
            placeholder="0"
            min="0"
          />
          {errors.area && (
            <div style={{ color: theme.colors.error, fontSize: '12px', marginTop: '4px' }}>
              {errors.area}
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <label style={styles.label}>Status</label>
          <select
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value as UnitStatus)}
            style={styles.input}
          >
            {unitStatuses.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Tenant Name */}
        <div>
          <label style={styles.label}>Tenant Name</label>
          <input
            type="text"
            value={formData.tenantName}
            onChange={(e) => handleChange('tenantName', e.target.value)}
            style={styles.input}
            placeholder="John Doe"
          />
        </div>

        {/* Tenant Email */}
        <div>
          <label style={styles.label}>Tenant Email</label>
          <input
            type="email"
            value={formData.tenantEmail}
            onChange={(e) => handleChange('tenantEmail', e.target.value)}
            style={{
              ...styles.input,
              borderColor: errors.tenantEmail ? theme.colors.error : theme.colors.border,
            }}
            placeholder="tenant@example.com"
          />
          {errors.tenantEmail && (
            <div style={{ color: theme.colors.error, fontSize: '12px', marginTop: '4px' }}>
              {errors.tenantEmail}
            </div>
          )}
        </div>

        {/* Lease Start */}
        <div>
          <label style={styles.label}>Lease Start</label>
          <input
            type="date"
            value={formData.leaseStart}
            onChange={(e) => handleChange('leaseStart', e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Lease End */}
        <div>
          <label style={styles.label}>Lease End</label>
          <input
            type="date"
            value={formData.leaseEnd}
            onChange={(e) => handleChange('leaseEnd', e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Monthly Rent */}
        <div>
          <label style={styles.label}>Monthly Rent</label>
          <input
            type="text"
            value={formData.monthlyRent}
            onChange={(e) => handleChange('monthlyRent', e.target.value)}
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
          {loading ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
