/**
 * Theme System
 *
 * Provides consistent styling across all components with:
 * - Light/Dark mode support
 * - CSS variable injection
 * - Custom theme configuration
 */

export interface ThemeColors {
  // Primary brand colors
  primary: string;
  primaryHover: string;
  primaryText: string;

  // Secondary colors
  secondary: string;
  secondaryHover: string;

  // Status colors
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  info: string;
  infoBg: string;

  // Background colors
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceHover: string;

  // Text colors
  text: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Border colors
  border: string;
  borderFocus: string;

  // Overlay
  overlay: string;
}

export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
}

export interface ThemeRadius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

export interface ThemeFonts {
  sans: string;
  mono: string;
}

export interface ThemeShadows {
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

export interface Theme {
  mode: 'light' | 'dark';
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
  fonts: ThemeFonts;
  shadows: ThemeShadows;
}

export interface ThemeConfig {
  mode?: 'light' | 'dark';
  colors?: Partial<ThemeColors>;
  fonts?: Partial<ThemeFonts>;
}

// Default dark theme (matches current UI)
const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    primary: '#F8B032',
    primaryHover: '#E8A633',
    primaryText: '#000000',

    secondary: '#3B82F6',
    secondaryHover: '#2563EB',

    success: '#22C55E',
    successBg: 'rgba(34, 197, 94, 0.1)',
    warning: '#F59E0B',
    warningBg: 'rgba(245, 158, 11, 0.1)',
    error: '#EF4444',
    errorBg: 'rgba(239, 68, 68, 0.1)',
    info: '#3B82F6',
    infoBg: 'rgba(59, 130, 246, 0.1)',

    background: '#0A0E1A',
    backgroundSecondary: '#0F172A',
    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceHover: 'rgba(255, 255, 255, 0.1)',

    text: '#FFFFFF',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    textInverse: '#000000',

    border: 'rgba(255, 255, 255, 0.1)',
    borderFocus: 'rgba(248, 176, 50, 0.5)',

    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },
  fonts: {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    xl: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },
};

// Light theme
const lightTheme: Theme = {
  mode: 'light',
  colors: {
    primary: '#F8B032',
    primaryHover: '#E8A633',
    primaryText: '#000000',

    secondary: '#3B82F6',
    secondaryHover: '#2563EB',

    success: '#16A34A',
    successBg: 'rgba(22, 163, 74, 0.1)',
    warning: '#D97706',
    warningBg: 'rgba(217, 119, 6, 0.1)',
    error: '#DC2626',
    errorBg: 'rgba(220, 38, 38, 0.1)',
    info: '#2563EB',
    infoBg: 'rgba(37, 99, 235, 0.1)',

    background: '#FFFFFF',
    backgroundSecondary: '#F8FAFC',
    surface: 'rgba(0, 0, 0, 0.02)',
    surfaceHover: 'rgba(0, 0, 0, 0.05)',

    text: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    textInverse: '#FFFFFF',

    border: 'rgba(0, 0, 0, 0.1)',
    borderFocus: 'rgba(248, 176, 50, 0.5)',

    overlay: 'rgba(0, 0, 0, 0.4)',
  },
  spacing: darkTheme.spacing,
  radius: darkTheme.radius,
  fonts: darkTheme.fonts,
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
    xl: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
  },
};

export const defaultTheme = darkTheme;

/**
 * Create a theme from config
 */
export function createTheme(config: 'light' | 'dark' | 'auto' | ThemeConfig): Theme {
  if (config === 'light') {
    return lightTheme;
  }

  if (config === 'dark') {
    return darkTheme;
  }

  if (config === 'auto') {
    // Check system preference
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? darkTheme : lightTheme;
    }
    return darkTheme;
  }

  // Custom config - merge with base theme
  const baseTheme = config.mode === 'light' ? lightTheme : darkTheme;

  return {
    ...baseTheme,
    mode: config.mode || baseTheme.mode,
    colors: {
      ...baseTheme.colors,
      ...config.colors,
    },
    fonts: {
      ...baseTheme.fonts,
      ...config.fonts,
    },
  };
}

/**
 * Convert theme to CSS variables
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};

  // Colors
  Object.entries(theme.colors).forEach(([key, value]) => {
    vars[`--tk-color-${kebabCase(key)}`] = value;
  });

  // Spacing
  Object.entries(theme.spacing).forEach(([key, value]) => {
    vars[`--tk-spacing-${key}`] = value;
  });

  // Radius
  Object.entries(theme.radius).forEach(([key, value]) => {
    vars[`--tk-radius-${key}`] = value;
  });

  // Fonts
  vars['--tk-font-sans'] = theme.fonts.sans;
  vars['--tk-font-mono'] = theme.fonts.mono;

  // Shadows
  Object.entries(theme.shadows).forEach(([key, value]) => {
    vars[`--tk-shadow-${key}`] = value;
  });

  return vars;
}

/**
 * Inject theme CSS variables into document
 */
export function injectTheme(theme: Theme, target?: HTMLElement): void {
  const vars = themeToCssVars(theme);
  const el = target || document.documentElement;

  Object.entries(vars).forEach(([key, value]) => {
    el.style.setProperty(key, value);
  });
}

// Helper to convert camelCase to kebab-case
function kebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}
