import React, { createContext, useState, useCallback, useMemo, useContext, useEffect } from 'react';
import { createI18n, getDirection } from './index';
import type { TranslationMap } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LocaleBundle {
  locale: string;
  direction: 'ltr' | 'rtl';
  translations: TranslationMap;
}

export interface I18nContextValue {
  /** Translate a key with optional parameter interpolation. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Current locale code. */
  locale: string;
  /** Switch locale at runtime. */
  setLocale: (locale: string) => void;
  /** Current text direction ('ltr' or 'rtl'). */
  direction: 'ltr' | 'rtl';
  /** All available locale codes. */
  availableLocales: string[];
}

export interface I18nProviderProps {
  /** Initial locale code. */
  locale: string;
  /** Map of locale code to locale bundle. */
  translations: Record<string, LocaleBundle>;
  /** Optional fallback locale when a key is missing. */
  fallbackLocale?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const I18nContext = createContext<I18nContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function I18nProvider({ locale: initialLocale, translations, fallbackLocale, children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState(initialLocale);

  // Build the i18n instance – recreate when the translations map reference changes.
  const i18n = useMemo(
    () =>
      createI18n({
        locale,
        translations,
        fallbackLocale,
      }),
    // We intentionally include `locale` so the instance is re-created on switch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translations, fallbackLocale, locale],
  );

  const direction = useMemo(() => {
    const bundle = translations[locale];
    return bundle ? bundle.direction : getDirection(locale);
  }, [locale, translations]);

  // Set document dir attribute for RTL support.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = direction;
      document.documentElement.lang = locale;
    }
  }, [direction, locale]);

  const setLocale = useCallback(
    (newLocale: string) => {
      if (translations[newLocale]) {
        setLocaleState(newLocale);
      }
    },
    [translations],
  );

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => i18n.t(key, params),
    [i18n],
  );

  const availableLocales = useMemo(() => Object.keys(translations), [translations]);

  const value = useMemo<I18nContextValue>(
    () => ({ t, locale, setLocale, direction, availableLocales }),
    [t, locale, setLocale, direction, availableLocales],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access the i18n context from any child component.
 *
 * ```tsx
 * const { t, locale, setLocale, direction } = useTranslation();
 * return <h1>{t('common.loading')}</h1>;
 * ```
 */
export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an <I18nProvider>');
  }
  return ctx;
}

export { I18nContext };
export default I18nProvider;
