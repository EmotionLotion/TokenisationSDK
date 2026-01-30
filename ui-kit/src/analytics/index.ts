/**
 * Analytics adapter for the Tokenisation UI Kit.
 *
 * Provides a pluggable analytics layer with built-in backends for development
 * (console), production (Segment), and custom webhook endpoints.
 *
 * @example
 * ```ts
 * import { analytics, setBackend, ConsoleBackend, setupAutoTracking } from '@tokenisation/ui-kit/analytics';
 *
 * // Development
 * setBackend(new ConsoleBackend());
 *
 * // Production
 * setBackend(new SegmentBackend('WRITE_KEY'));
 *
 * // Auto-track clicks on [data-track] elements
 * setupAutoTracking();
 *
 * // Manual tracking
 * analytics.trackEvent('investment_started', { assetId: 'asset_123', amount: 5000 });
 * analytics.setUser('user_42', { plan: 'pro' });
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Properties attached to a tracked event. */
export type EventProperties = Record<string, unknown>;

/** Traits attached to a user identity. */
export type UserTraits = Record<string, unknown>;

/**
 * Pluggable analytics backend interface.
 *
 * Implement this interface to forward events to any analytics provider.
 */
export interface AnalyticsBackend {
  /** Track a named event with optional properties. */
  trackEvent(name: string, properties?: EventProperties): void;

  /** Identify a user with optional traits. */
  identify(userId: string, traits?: UserTraits): void;

  /** Track a page view. */
  page(name?: string, properties?: EventProperties): void;
}

// ---------------------------------------------------------------------------
// Built-in backends
// ---------------------------------------------------------------------------

/**
 * Console backend - logs all analytics calls to the browser console.
 * Intended for development and debugging.
 */
export class ConsoleBackend implements AnalyticsBackend {
  private readonly prefix: string;

  constructor(prefix = '[Analytics]') {
    this.prefix = prefix;
  }

  trackEvent(name: string, properties?: EventProperties): void {
    console.log(`${this.prefix} trackEvent`, name, properties ?? {});
  }

  identify(userId: string, traits?: UserTraits): void {
    console.log(`${this.prefix} identify`, userId, traits ?? {});
  }

  page(name?: string, properties?: EventProperties): void {
    console.log(`${this.prefix} page`, name ?? document.title, properties ?? {});
  }
}

/**
 * Segment backend - wraps the Segment analytics.js global (`window.analytics`).
 *
 * Expects the Segment snippet to already be loaded on the page, or accepts a
 * write key and lazily initialises the Segment library.
 */
export class SegmentBackend implements AnalyticsBackend {
  private writeKey: string | null;

  constructor(writeKey?: string) {
    this.writeKey = writeKey ?? null;
    if (this.writeKey) {
      this._ensureLoaded();
    }
  }

  trackEvent(name: string, properties?: EventProperties): void {
    this._getAnalytics()?.track(name, properties);
  }

  identify(userId: string, traits?: UserTraits): void {
    this._getAnalytics()?.identify(userId, traits);
  }

  page(name?: string, properties?: EventProperties): void {
    this._getAnalytics()?.page(name, properties);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private _getAnalytics(): SegmentAnalyticsJS | undefined {
    return (window as unknown as Record<string, unknown>).analytics as SegmentAnalyticsJS | undefined;
  }

  private _ensureLoaded(): void {
    if (typeof window === 'undefined') return;
    const existing = this._getAnalytics();
    if (existing && typeof existing.track === 'function') return;

    // Minimal Segment snippet loader
    const analytics: unknown[] = ((window as any).analytics = (window as any).analytics || []);
    if ((analytics as any).initialize) return;

    // Stub queue methods so calls before the script loads are buffered
    const methods = [
      'trackSubmit', 'trackClick', 'trackLink', 'trackForm', 'pageview',
      'identify', 'reset', 'group', 'track', 'ready', 'alias', 'debug',
      'page', 'once', 'off', 'on', 'addSourceMiddleware',
      'addIntegrationMiddleware', 'setAnonymousId', 'addDestinationMiddleware',
    ];

    for (const method of methods) {
      (analytics as any)[method] = (...args: unknown[]) => {
        (analytics as any).push([method, ...args]);
      };
    }

    (analytics as any).SNIPPET_VERSION = '4.15.3';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = `https://cdn.segment.com/analytics.js/v1/${this.writeKey}/analytics.min.js`;
    const first = document.getElementsByTagName('script')[0];
    first?.parentNode?.insertBefore(script, first);
  }
}

/** Minimal type stub for Segment analytics.js global. */
interface SegmentAnalyticsJS {
  track(event: string, properties?: Record<string, unknown>): void;
  identify(userId: string, traits?: Record<string, unknown>): void;
  page(name?: string, properties?: Record<string, unknown>): void;
}

/**
 * Custom backend - sends events as JSON POST requests to a webhook URL.
 *
 * Useful for self-hosted analytics pipelines or serverless collectors.
 */
export class CustomBackend implements AnalyticsBackend {
  private readonly url: string;
  private readonly headers: Record<string, string>;

  constructor(webhookUrl: string, headers?: Record<string, string>) {
    this.url = webhookUrl;
    this.headers = headers ?? {};
  }

  trackEvent(name: string, properties?: EventProperties): void {
    this._send({ type: 'track', event: name, properties: properties ?? {}, timestamp: new Date().toISOString() });
  }

  identify(userId: string, traits?: UserTraits): void {
    this._send({ type: 'identify', userId, traits: traits ?? {}, timestamp: new Date().toISOString() });
  }

  page(name?: string, properties?: EventProperties): void {
    this._send({
      type: 'page',
      name: name ?? (typeof document !== 'undefined' ? document.title : ''),
      properties: properties ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  private _send(body: Record<string, unknown>): void {
    try {
      const payload = JSON.stringify(body);
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(this.url, blob);
      } else {
        fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers },
          body: payload,
          keepalive: true,
        }).catch(() => {
          // fire-and-forget
        });
      }
    } catch {
      // swallow errors - analytics should never break the app
    }
  }
}

// ---------------------------------------------------------------------------
// No-op backend (default)
// ---------------------------------------------------------------------------

class NoopBackend implements AnalyticsBackend {
  trackEvent(): void { /* noop */ }
  identify(): void { /* noop */ }
  page(): void { /* noop */ }
}

// ---------------------------------------------------------------------------
// Analytics singleton
// ---------------------------------------------------------------------------

/** Internal state */
let _backend: AnalyticsBackend = new NoopBackend();
let _userId: string | null = null;
let _userTraits: UserTraits = {};
let _autoTrackingCleanup: (() => void) | null = null;

/**
 * Set the active analytics backend.
 *
 * Call this once during app initialisation. Any previously buffered
 * user identification is automatically replayed to the new backend.
 */
export function setBackend(backend: AnalyticsBackend): void {
  _backend = backend;

  // Replay user identity to new backend
  if (_userId) {
    _backend.identify(_userId, _userTraits);
  }
}

/**
 * Track a named event with optional properties.
 */
export function trackEvent(name: string, properties?: EventProperties): void {
  _backend.trackEvent(name, properties);
}

/**
 * Identify the current user. Traits are merged with any previously set traits.
 */
export function setUser(userId: string, traits?: UserTraits): void {
  _userId = userId;
  _userTraits = { ..._userTraits, ...traits };
  _backend.identify(userId, _userTraits);
}

/**
 * Track a page view.
 */
export function page(name?: string, properties?: EventProperties): void {
  _backend.page(name, properties);
}

/**
 * Set up automatic click tracking on elements with a `data-track` attribute.
 *
 * The attribute value is used as the event name. Additional `data-track-*`
 * attributes are forwarded as event properties.
 *
 * @example
 * ```html
 * <button data-track="cta_clicked" data-track-variant="hero">Sign Up</button>
 * ```
 *
 * @returns A cleanup function that removes the listener.
 */
export function setupAutoTracking(): () => void {
  // Prevent duplicate listeners
  if (_autoTrackingCleanup) {
    _autoTrackingCleanup();
  }

  const handler = (event: Event): void => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-track]');
    if (!target) return;

    const eventName = target.getAttribute('data-track');
    if (!eventName) return;

    const properties: EventProperties = {};
    for (const attr of Array.from(target.attributes)) {
      if (attr.name.startsWith('data-track-')) {
        const key = attr.name
          .slice('data-track-'.length)
          .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        properties[key] = attr.value;
      }
    }

    // Add element metadata
    properties.elementTag = target.tagName.toLowerCase();
    properties.elementText = (target.textContent ?? '').trim().slice(0, 100);

    trackEvent(eventName, properties);
  };

  document.addEventListener('click', handler, { capture: true });

  _autoTrackingCleanup = () => {
    document.removeEventListener('click', handler, { capture: true } as EventListenerOptions);
    _autoTrackingCleanup = null;
  };

  return _autoTrackingCleanup;
}

// ---------------------------------------------------------------------------
// Convenience singleton
// ---------------------------------------------------------------------------

/**
 * Analytics singleton with all public API methods.
 *
 * @example
 * ```ts
 * import { analytics } from '@tokenisation/ui-kit/analytics';
 * analytics.trackEvent('button_clicked', { label: 'Invest' });
 * ```
 */
export const analytics = {
  trackEvent,
  setUser,
  setBackend,
  page,
  setupAutoTracking,
} as const;

export default analytics;
