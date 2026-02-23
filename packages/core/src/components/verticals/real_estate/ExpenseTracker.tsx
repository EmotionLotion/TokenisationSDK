import React, { useState } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '../../theme.js';

export type ExpenseCategory = 'maintenance' | 'insurance' | 'tax' | 'utility' | 'management_fee' | 'legal' | 'marketing' | 'other';

export interface PropertyExpense {
  id: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  description: string | null;
  vendor: string | null;
  invoiceRef: string | null;
  paidAt: string | null;
  period: string | null;
  createdAt: string;
}

export interface RecordExpenseData {
  category: ExpenseCategory;
  amount: string;
  currency: string;
  description?: string;
  vendor?: string;
  invoiceRef?: string;
  paidAt?: string;
  period?: string;
}

export interface ExpenseTrackerProps {
  expenses: PropertyExpense[];
  onRecordExpense?: (data: RecordExpenseData) => void | Promise<void>;
  theme?: TokenisationTheme;
  loading?: boolean;
  showForm?: boolean;
}

const categoryLabels: Record<ExpenseCategory, string> = {
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  tax: 'Property Tax',
  utility: 'Utilities',
  management_fee: 'Management Fee',
  legal: 'Legal',
  marketing: 'Marketing',
  other: 'Other',
};

const categoryColors: Record<ExpenseCategory, string> = {
  maintenance: '#F59E0B',
  insurance: '#3B82F6',
  tax: '#EF4444',
  utility: '#10B981',
  management_fee: '#8B5CF6',
  legal: '#EC4899',
  marketing: '#06B6D4',
  other: '#6B7280',
};

const currencies = ['USD', 'AED', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];

export function ExpenseTracker({
  expenses,
  onRecordExpense,
  theme = defaultTheme,
  loading = false,
  showForm = true,
}: ExpenseTrackerProps) {
  const styles = createStyles(theme);

  const [formData, setFormData] = useState<RecordExpenseData>({
    category: 'maintenance',
    amount: '',
    currency: 'USD',
    description: '',
    vendor: '',
    invoiceRef: '',
    paidAt: '',
    period: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFormSection, setShowFormSection] = useState(false);

  // Calculate totals by category
  const totalsByCategory = expenses.reduce((acc, exp) => {
    const cat = exp.category;
    if (!acc[cat]) acc[cat] = 0;
    acc[cat] += parseFloat(exp.amount);
    return acc;
  }, {} as Record<string, number>);

  const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !onRecordExpense) return;

    setIsSubmitting(true);
    try {
      await onRecordExpense(formData);
      setFormData({
        category: 'maintenance',
        amount: '',
        currency: 'USD',
        description: '',
        vendor: '',
        invoiceRef: '',
        paidAt: '',
        period: '',
      });
      setShowFormSection(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div>
      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.lg,
      }}>
        <div style={{
          ...styles.card,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '4px' }}>
            Total Expenses
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: theme.colors.text }}>
            {expenses[0]?.currency || 'USD'} {totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        {Object.entries(totalsByCategory).slice(0, 3).map(([cat, total]) => (
          <div key={cat} style={{
            ...styles.card,
            textAlign: 'center',
            borderLeftWidth: '3px',
            borderLeftStyle: 'solid',
            borderLeftColor: categoryColors[cat as ExpenseCategory],
          }}>
            <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '4px' }}>
              {categoryLabels[cat as ExpenseCategory]}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: theme.colors.text }}>
              {expenses[0]?.currency || 'USD'} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>

      {/* Add Expense Button/Form */}
      {showForm && onRecordExpense && (
        <div style={{ marginBottom: theme.spacing.lg }}>
          {!showFormSection ? (
            <button
              onClick={() => setShowFormSection(true)}
              style={styles.button}
            >
              + Record Expense
            </button>
          ) : (
            <form onSubmit={handleSubmit} style={{
              ...styles.card,
              padding: theme.spacing.lg,
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: theme.spacing.md,
              }}>
                <h4 style={{ margin: 0, color: theme.colors.text }}>Record New Expense</h4>
                <button
                  type="button"
                  onClick={() => setShowFormSection(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: theme.colors.textMuted,
                    cursor: 'pointer',
                    fontSize: '20px',
                  }}
                >
                  x
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: theme.spacing.md }}>
                <div>
                  <label style={styles.label}>Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value as ExpenseCategory }))}
                    style={styles.input}
                  >
                    {Object.entries(categoryLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Amount *</label>
                  <input
                    type="text"
                    value={formData.amount}
                    onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                    style={styles.input}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label style={styles.label}>Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                    style={styles.input}
                  >
                    {currencies.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Vendor</label>
                  <input
                    type="text"
                    value={formData.vendor}
                    onChange={(e) => setFormData(prev => ({ ...prev, vendor: e.target.value }))}
                    style={styles.input}
                    placeholder="Vendor name"
                  />
                </div>

                <div>
                  <label style={styles.label}>Invoice Ref</label>
                  <input
                    type="text"
                    value={formData.invoiceRef}
                    onChange={(e) => setFormData(prev => ({ ...prev, invoiceRef: e.target.value }))}
                    style={styles.input}
                    placeholder="INV-001"
                  />
                </div>

                <div>
                  <label style={styles.label}>Paid Date</label>
                  <input
                    type="date"
                    value={formData.paidAt}
                    onChange={(e) => setFormData(prev => ({ ...prev, paidAt: e.target.value }))}
                    style={styles.input}
                  />
                </div>

                <div style={{ gridColumn: 'span 3' }}>
                  <label style={styles.label}>Description</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    style={styles.input}
                    placeholder="Brief description"
                  />
                </div>
              </div>

              <div style={{ marginTop: theme.spacing.md, display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowFormSection(false)}
                  style={styles.buttonSecondary}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.button}
                  disabled={isSubmitting || !formData.amount}
                >
                  {isSubmitting ? 'Recording...' : 'Record Expense'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Expense List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.lg, color: theme.colors.textMuted }}>
          Loading expenses...
        </div>
      ) : expenses.length === 0 ? (
        <div style={{
          ...styles.card,
          textAlign: 'center',
          color: theme.colors.textMuted,
        }}>
          No expenses recorded yet
        </div>
      ) : (
        <div style={{
          ...styles.card,
          padding: 0,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.colors.background }}>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontSize: '12px', color: theme.colors.textSecondary, fontWeight: 600 }}>Date</th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontSize: '12px', color: theme.colors.textSecondary, fontWeight: 600 }}>Category</th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontSize: '12px', color: theme.colors.textSecondary, fontWeight: 600 }}>Description</th>
                <th style={{ padding: theme.spacing.md, textAlign: 'left', fontSize: '12px', color: theme.colors.textSecondary, fontWeight: 600 }}>Vendor</th>
                <th style={{ padding: theme.spacing.md, textAlign: 'right', fontSize: '12px', color: theme.colors.textSecondary, fontWeight: 600 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense, idx) => (
                <tr
                  key={expense.id}
                  style={{
                    borderTop: idx > 0 ? `1px solid ${theme.colors.border}` : undefined,
                  }}
                >
                  <td style={{ padding: theme.spacing.md, fontSize: '14px', color: theme.colors.textSecondary }}>
                    {expense.paidAt ? formatDate(expense.paidAt) : formatDate(expense.createdAt)}
                  </td>
                  <td style={{ padding: theme.spacing.md }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '14px',
                      color: theme.colors.text,
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: categoryColors[expense.category],
                      }} />
                      {categoryLabels[expense.category]}
                    </span>
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: '14px', color: theme.colors.textSecondary }}>
                    {expense.description || '-'}
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: '14px', color: theme.colors.textSecondary }}>
                    {expense.vendor || '-'}
                  </td>
                  <td style={{ padding: theme.spacing.md, fontSize: '14px', color: theme.colors.text, textAlign: 'right', fontWeight: 500 }}>
                    {expense.currency} {parseFloat(expense.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
