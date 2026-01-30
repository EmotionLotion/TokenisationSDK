/**
 * Lightweight i18n system for TokenisationSDK UI Kit
 * Supports nested keys, parameter interpolation, RTL detection, and locale switching.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Recursive translation map – leaves are strings, branches are nested maps. */
export type TranslationMap = {
  [key: string]: string | TranslationMap;
};

/** Configuration accepted by the factory function. */
export interface I18nConfig {
  locale: string;
  translations: Record<string, { locale: string; direction: 'ltr' | 'rtl'; translations: TranslationMap }>;
  fallbackLocale?: string;
}

/** The object returned by `createI18n`. */
export interface I18nInstance {
  /** Translate a (possibly nested) key with optional parameter interpolation. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Current locale code, e.g. "en", "ar", "fr". */
  locale: string;
  /** Switch the active locale at runtime. */
  setLocale: (locale: string) => void;
  /** Text direction for the current locale. */
  direction: 'ltr' | 'rtl';
  /** All registered locale codes. */
  availableLocales: string[];
}

// ---------------------------------------------------------------------------
// RTL locales set
// ---------------------------------------------------------------------------

const RTL_LOCALES = new Set([
  'ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'ur', 'yi',
]);

/**
 * Return the text direction for a given locale string.
 * Checks the primary language subtag (e.g. "ar-SA" -> "ar").
 */
export function getDirection(locale: string): 'ltr' | 'rtl' {
  const primary = locale.split('-')[0].toLowerCase();
  return RTL_LOCALES.has(primary) ? 'rtl' : 'ltr';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-separated key against a nested translation map.
 * Returns `undefined` when the key cannot be found.
 */
function resolve(map: TranslationMap, key: string): string | undefined {
  const parts = key.split('.');
  let current: TranslationMap | string = map;

  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as TranslationMap)[part];
    if (current === undefined) return undefined;
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Replace `{param}` placeholders in a translated string.
 */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    return value !== undefined ? String(value) : match;
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an i18n instance.
 *
 * ```ts
 * import en from './locales/en';
 * import ar from './locales/ar';
 *
 * const i18n = createI18n({
 *   locale: 'en',
 *   translations: { en, ar },
 * });
 *
 * i18n.t('common.loading');              // "Loading…"
 * i18n.t('transfer.amount');             // "Amount"
 * i18n.t('common.greeting', { name: 'Ali' }); // if defined
 * ```
 */
export function createI18n(config: I18nConfig): I18nInstance {
  const { translations, fallbackLocale } = config;
  let currentLocale = config.locale;

  function getMap(): TranslationMap {
    const entry = translations[currentLocale];
    return entry ? entry.translations : {};
  }

  function getFallbackMap(): TranslationMap | null {
    if (!fallbackLocale || fallbackLocale === currentLocale) return null;
    const entry = translations[fallbackLocale];
    return entry ? entry.translations : null;
  }

  function t(key: string, params?: Record<string, string | number>): string {
    let value = resolve(getMap(), key);

    if (value === undefined) {
      const fb = getFallbackMap();
      if (fb) value = resolve(fb, key);
    }

    // Fall back to the raw key when no translation is found.
    if (value === undefined) return key;

    return params ? interpolate(value, params) : value;
  }

  function setLocale(locale: string): void {
    if (translations[locale]) {
      currentLocale = locale;
    }
  }

  const instance: I18nInstance = {
    t,
    get locale() {
      return currentLocale;
    },
    setLocale,
    get direction() {
      const entry = translations[currentLocale];
      return entry ? entry.direction : getDirection(currentLocale);
    },
    get availableLocales() {
      return Object.keys(translations);
    },
  };

  return instance;
}

// Re-export locale types for consumers
export type { I18nConfig as Config, TranslationMap as Translations, I18nInstance as Instance };
