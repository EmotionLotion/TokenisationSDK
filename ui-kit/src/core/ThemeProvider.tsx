/**
 * ThemeProvider - White-Label Theme Context Provider
 *
 * Fetches the organisation's theme configuration from the API and applies it
 * as CSS custom properties on the document root. Supports:
 * - Remote theme loading from API
 * - Local theme override via props
 * - localStorage persistence for offline / fast-load
 * - Reactive CSS variable injection
 *
 * @example
 * ```tsx
 * import { ThemeProvider, useTheme } from '@tokenisation/ui-kit';
 *
 * function App() {
 *   return (
 *     <ThemeProvider apiUrl="https://api.example.com" apiKey="tk_live_...">
 *       <Dashboard />
 *     </ThemeProvider>
 *   );
 * }
 *
 * function Dashboard() {
 *   const { theme, loading } = useTheme();
 *   return <div>Primary: {theme.primaryColor}</div>;
 * }
 * ```
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

// ============================================================================
// Types
// ============================================================================

export interface WhiteLabelTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  logoUrl: string | null;
  fontFamily: string;
  borderRadius: string;
  customCss: string | null;
  metadata: Record<string, unknown>;
}

export interface ThemeContextValue {
  /** Current theme configuration */
  theme: WhiteLabelTheme;
  /** Whether the theme is currently being fetched */
  loading: boolean;
  /** Last error encountered during theme fetch */
  error: Error | null;
  /** Whether the theme was loaded from the API (vs defaults/override) */
  isRemote: boolean;
  /** Manually refresh the theme from the API */
  refreshTheme: () => Promise<void>;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Base URL of the TokenisationSDK API */
  apiUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Override theme - when provided, the API is not called */
  theme?: Partial<WhiteLabelTheme>;
  /** Disable localStorage caching (default: false) */
  disableCache?: boolean;
}

// ============================================================================
// Defaults & Constants
// ============================================================================

const DEFAULT_THEME: WhiteLabelTheme = {
  primaryColor: '#F8B032',
  secondaryColor: '#3B82F6',
  accentColor: '#8B5CF6',
  backgroundColor: '#0A0E1A',
  textColor: '#FFFFFF',
  logoUrl: null,
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  borderRadius: '8px',
  customCss: null,
  metadata: {},
};

const STORAGE_KEY = 'tokenisation-sdk-theme';

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================================
// CSS Variable Injection
// ============================================================================

/**
 * Map theme fields to CSS custom property names and apply them to the
 * document root element.
 */
function applyCssVariables(theme: WhiteLabelTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;

  root.style.setProperty('--tk-primary', theme.primaryColor);
  root.style.setProperty('--tk-secondary', theme.secondaryColor);
  root.style.setProperty('--tk-accent', theme.accentColor);
  root.style.setProperty('--tk-bg', theme.backgroundColor);
  root.style.setProperty('--tk-text', theme.textColor);
  root.style.setProperty('--tk-font', theme.fontFamily);
  root.style.setProperty('--tk-radius', theme.borderRadius);

  if (theme.logoUrl) {
    root.style.setProperty('--tk-logo-url', `url(${theme.logoUrl})`);
  }
}

/**
 * Inject custom CSS into a <style> tag managed by the theme provider.
 */
function injectCustomCss(css: string | null): void {
  if (typeof document === 'undefined') return;

  const STYLE_ID = 'tk-theme-custom-css';
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!css) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = css;
}

// ============================================================================
// localStorage Helpers
// ============================================================================

function loadCachedTheme(): WhiteLabelTheme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_THEME, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore localStorage errors (SSR, private browsing, etc.)
  }
  return null;
}

function cacheTheme(theme: WhiteLabelTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Ignore
  }
}

function clearCachedTheme(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

// ============================================================================
// Provider Component
// ============================================================================

export function ThemeProvider({
  children,
  apiUrl,
  apiKey,
  theme: themeOverride,
  disableCache = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<WhiteLabelTheme>(() => {
    // Priority: override > cached > default
    if (themeOverride) {
      return { ...DEFAULT_THEME, ...themeOverride };
    }
    if (!disableCache) {
      const cached = loadCachedTheme();
      if (cached) return cached;
    }
    return { ...DEFAULT_THEME };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRemote, setIsRemote] = useState(false);

  // Fetch theme from API
  const fetchTheme = useCallback(async (): Promise<void> => {
    if (!apiUrl || !apiKey) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiUrl}/api/v1/themes`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch theme: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const remoteTheme: WhiteLabelTheme = {
        ...DEFAULT_THEME,
        ...result.data,
      };

      setTheme(remoteTheme);
      setIsRemote(true);

      if (!disableCache) {
        cacheTheme(remoteTheme);
      }
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error(String(err));
      setError(fetchError);
      // Keep current theme on error (cached or default)
    } finally {
      setLoading(false);
    }
  }, [apiUrl, apiKey, disableCache]);

  // Refresh function exposed to consumers
  const refreshTheme = useCallback(async (): Promise<void> => {
    await fetchTheme();
  }, [fetchTheme]);

  // Fetch on mount if not overridden
  useEffect(() => {
    if (themeOverride) {
      // Override provided - apply directly, skip API
      const merged = { ...DEFAULT_THEME, ...themeOverride };
      setTheme(merged);
      setIsRemote(false);

      if (!disableCache) {
        clearCachedTheme();
      }
      return;
    }

    fetchTheme();
  }, [themeOverride, fetchTheme, disableCache]);

  // Apply CSS variables whenever theme changes
  useEffect(() => {
    applyCssVariables(theme);
    injectCustomCss(theme.customCss);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      loading,
      error,
      isRemote,
      refreshTheme,
    }),
    [theme, loading, error, isRemote, refreshTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Access the current white-label theme configuration.
 *
 * Must be used inside a `<ThemeProvider>`.
 *
 * @throws {Error} If used outside of ThemeProvider
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);

  if (!ctx) {
    throw new Error(
      'useTheme() must be used within a <ThemeProvider>. ' +
      'Wrap your component tree with <ThemeProvider apiUrl="..." apiKey="...">.'
    );
  }

  return ctx;
}
