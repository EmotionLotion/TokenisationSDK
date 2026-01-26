/**
 * Theme Configuration for SDK Components
 *
 * Customize colors, fonts, and styles to match your brand.
 */

export interface TokenisationTheme {
  colors: {
    primary: string;
    primaryHover: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    background: string;
    surface: string;
    border: string;
    text: string;
    textSecondary: string;
    textMuted: string;
  };
  fonts: {
    family: string;
    mono: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

export const defaultTheme: TokenisationTheme = {
  colors: {
    primary: '#F8B032',
    primaryHover: '#E8A633',
    secondary: '#6366F1',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    background: '#0F172A',
    surface: '#1E293B',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
  },
  fonts: {
    family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"SF Mono", "Fira Code", monospace',
  },
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
};

/**
 * Create inline styles from theme
 */
export function createStyles(theme: TokenisationTheme = defaultTheme) {
  return {
    container: {
      fontFamily: theme.fonts.family,
      color: theme.colors.text,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${theme.colors.border}`,
      padding: theme.spacing.md,
    },
    button: {
      fontFamily: theme.fonts.family,
      backgroundColor: theme.colors.primary,
      color: '#000000',
      border: 'none',
      borderRadius: theme.borderRadius.md,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: '14px',
      transition: 'background-color 0.2s',
    },
    buttonSecondary: {
      fontFamily: theme.fonts.family,
      backgroundColor: 'transparent',
      color: theme.colors.text,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.borderRadius.md,
      padding: `${theme.spacing.sm} ${theme.spacing.md}`,
      cursor: 'pointer',
      fontWeight: 500,
      fontSize: '14px',
    },
    input: {
      fontFamily: theme.fonts.family,
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      border: `1px solid ${theme.colors.border}`,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.sm,
      fontSize: '14px',
      width: '100%',
      boxSizing: 'border-box' as const,
    },
    label: {
      fontSize: '12px',
      fontWeight: 500,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
      display: 'block',
    },
    badge: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: theme.spacing.xs,
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      borderRadius: theme.borderRadius.full,
      fontSize: '12px',
      fontWeight: 500,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      border: `1px solid ${theme.colors.border}`,
      padding: theme.spacing.md,
    },
  };
}
