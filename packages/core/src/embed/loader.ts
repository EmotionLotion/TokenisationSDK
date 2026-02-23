/**
 * Embed Loader
 *
 * Lightweight browser loader (~5KB) for the embeddable investment widget.
 * Partners include this via: <script src="cdn.example.com/embed.js">
 *
 * Creates iframe, handles postMessage communication, and provides
 * a clean API for widget interaction.
 */

import type {
  TokenisationEmbed,
  EmbedInitOptions,
  EmbedWidgetConfig,
  EmbedCallbacks,
  EmbedEventType,
  EmbedEventPayloads,
  EmbedMessage,
  InitMessage,
  EventMessage,
  ResizeMessage,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SDK_VERSION = '1.0.0';
const MESSAGE_SOURCE = 'tokenisation-embed';
const DEFAULT_BASE_URL = 'https://embed.tokenisation.io';
const IFRAME_ID = 'tokenisation-embed-iframe';
const OVERLAY_ID = 'tokenisation-embed-overlay';

// ============================================================================
// STYLES
// ============================================================================

const OVERLAY_STYLES = `
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999999;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
`;

const IFRAME_STYLES = `
  border: none;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  background: white;
  max-width: 95vw;
  max-height: 95vh;
  transform: scale(0.95);
  opacity: 0;
  transition: transform 0.2s ease-in-out, opacity 0.2s ease-in-out;
`;

const IFRAME_VISIBLE_STYLES = `
  transform: scale(1);
  opacity: 1;
`;

// Size presets
const SIZE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  compact: { width: 400, height: 500 },
  standard: { width: 500, height: 650 },
  large: { width: 600, height: 750 },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function isValidMessage(data: unknown): data is EmbedMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'source' in data &&
    (data as EmbedMessage).source === MESSAGE_SOURCE
  );
}

function injectStyles(): void {
  if (document.getElementById('tokenisation-embed-styles')) return;

  const style = document.createElement('style');
  style.id = 'tokenisation-embed-styles';
  style.textContent = `
    .tokenisation-embed-overlay { ${OVERLAY_STYLES} }
    .tokenisation-embed-overlay.visible { opacity: 1; }
    .tokenisation-embed-iframe { ${IFRAME_STYLES} }
    .tokenisation-embed-iframe.visible { ${IFRAME_VISIBLE_STYLES} }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// EMBED IMPLEMENTATION
// ============================================================================

class TokenisationEmbedImpl implements TokenisationEmbed {
  private config: EmbedInitOptions | null = null;
  private widgetConfig: EmbedWidgetConfig | null = null;
  private callbacks: EmbedCallbacks = {};
  private eventListeners: Map<EmbedEventType, Set<(payload: unknown) => void>> = new Map();
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLDivElement | null = null;
  private instanceId: string = generateId();
  private isInitialized: boolean = false;
  private isWidgetOpen: boolean = false;

  constructor() {
    // Bind methods
    this.handleMessage = this.handleMessage.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleOverlayClick = this.handleOverlayClick.bind(this);
  }

  /**
   * Initialize the embed SDK
   */
  init(config: EmbedInitOptions): void {
    if (this.isInitialized) {
      console.warn('[Tokenisation] SDK already initialized');
      return;
    }

    if (!config.publishableKey) {
      throw new Error('[Tokenisation] publishableKey is required');
    }

    if (!config.publishableKey.startsWith('pk_')) {
      throw new Error('[Tokenisation] Invalid publishableKey format. Must start with "pk_"');
    }

    this.config = {
      ...config,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
    };

    // Inject styles
    injectStyles();

    // Add message listener
    window.addEventListener('message', this.handleMessage);

    this.isInitialized = true;

    if (config.debug) {
      console.log('[Tokenisation] SDK initialized', { version: SDK_VERSION });
    }
  }

  /**
   * Open the widget
   */
  open(config: EmbedWidgetConfig, callbacks?: EmbedCallbacks): void {
    if (!this.isInitialized || !this.config) {
      throw new Error('[Tokenisation] SDK not initialized. Call init() first.');
    }

    if (this.isWidgetOpen) {
      console.warn('[Tokenisation] Widget is already open');
      return;
    }

    this.widgetConfig = config;
    this.callbacks = callbacks || {};

    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.id = OVERLAY_ID;
    this.overlay.className = 'tokenisation-embed-overlay';
    this.overlay.addEventListener('click', this.handleOverlayClick);

    // Create iframe
    this.iframe = document.createElement('iframe');
    this.iframe.id = IFRAME_ID;
    this.iframe.className = 'tokenisation-embed-iframe';

    // Set dimensions
    const size = config.size || 'standard';
    const dimensions = SIZE_DIMENSIONS[size] || SIZE_DIMENSIONS.standard;
    this.iframe.style.width = `${dimensions.width}px`;
    this.iframe.style.height = `${dimensions.height}px`;

    // Build iframe URL
    const iframeUrl = this.buildIframeUrl(config);
    this.iframe.src = iframeUrl;

    // Add keyboard listener
    document.addEventListener('keydown', this.handleKeyDown);

    // Append to DOM
    this.overlay.appendChild(this.iframe);
    document.body.appendChild(this.overlay);

    // Trigger animation after append
    requestAnimationFrame(() => {
      this.overlay?.classList.add('visible');
      this.iframe?.classList.add('visible');
    });

    this.isWidgetOpen = true;

    if (this.config.debug) {
      console.log('[Tokenisation] Widget opened', config);
    }
  }

  /**
   * Close the widget
   */
  close(): void {
    if (!this.isWidgetOpen) return;

    // Animate out
    this.overlay?.classList.remove('visible');
    this.iframe?.classList.remove('visible');

    // Remove after animation
    setTimeout(() => {
      this.overlay?.remove();
      this.iframe?.remove();
      this.overlay = null;
      this.iframe = null;
    }, 200);

    // Remove listeners
    document.removeEventListener('keydown', this.handleKeyDown);

    this.isWidgetOpen = false;
    this.widgetConfig = null;
    this.callbacks = {};

    // Emit close event
    this.emitEvent('close', { reason: 'user' });

    if (this.config?.debug) {
      console.log('[Tokenisation] Widget closed');
    }
  }

  /**
   * Check if widget is open
   */
  isOpen(): boolean {
    return this.isWidgetOpen;
  }

  /**
   * Update widget configuration
   */
  update(config: Partial<EmbedWidgetConfig>): void {
    if (!this.isWidgetOpen || !this.iframe?.contentWindow) {
      console.warn('[Tokenisation] Cannot update: widget not open');
      return;
    }

    this.widgetConfig = { ...this.widgetConfig!, ...config };

    this.postMessage({
      type: 'UPDATE_CONFIG',
      source: MESSAGE_SOURCE,
      version: SDK_VERSION,
      payload: config,
    });
  }

  /**
   * Add event listener
   */
  on<T extends EmbedEventType>(
    event: T,
    callback: (payload: EmbedEventPayloads[T]) => void
  ): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as (payload: unknown) => void);
  }

  /**
   * Remove event listener
   */
  off<T extends EmbedEventType>(
    event: T,
    callback?: (payload: EmbedEventPayloads[T]) => void
  ): void {
    if (!callback) {
      this.eventListeners.delete(event);
    } else {
      this.eventListeners.get(event)?.delete(callback as (payload: unknown) => void);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbedInitOptions | null {
    return this.config;
  }

  /**
   * Get SDK version
   */
  getVersion(): string {
    return SDK_VERSION;
  }

  /**
   * Destroy the instance
   */
  destroy(): void {
    this.close();
    window.removeEventListener('message', this.handleMessage);
    this.eventListeners.clear();
    this.config = null;
    this.isInitialized = false;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private buildIframeUrl(config: EmbedWidgetConfig): string {
    const baseUrl = this.config!.baseUrl!;
    const params = new URLSearchParams();

    params.set('pk', this.config!.publishableKey);
    params.set('mode', config.mode);
    params.set('instance', this.instanceId);

    if (config.assetId) params.set('asset', config.assetId);
    if (config.theme) params.set('theme', config.theme);
    if (config.locale) params.set('locale', config.locale);
    if (config.currency) params.set('currency', config.currency);
    if (config.defaultAmount) params.set('amount', config.defaultAmount.toString());

    return `${baseUrl}/widget?${params.toString()}`;
  }

  private postMessage(message: EmbedMessage): void {
    if (!this.iframe?.contentWindow) return;

    this.iframe.contentWindow.postMessage(message, this.config!.baseUrl!);
  }

  private handleMessage(event: MessageEvent): void {
    // Validate origin
    if (!this.config?.baseUrl?.startsWith(event.origin)) {
      return;
    }

    // Validate message format
    if (!isValidMessage(event.data)) {
      return;
    }

    const message = event.data as EmbedMessage;

    if (this.config?.debug) {
      console.log('[Tokenisation] Received message', message);
    }

    switch (message.type) {
      case 'READY':
        this.handleReady();
        break;

      case 'EVENT':
        this.handleEvent(message as EventMessage);
        break;

      case 'RESIZE':
        this.handleResize(message as ResizeMessage);
        break;

      case 'CLOSE':
        this.close();
        break;

      case 'ERROR':
        this.handleError(message);
        break;
    }
  }

  private handleReady(): void {
    // Send init message to iframe
    const initMessage: InitMessage = {
      type: 'INIT',
      source: MESSAGE_SOURCE,
      version: SDK_VERSION,
      payload: {
        publishableKey: this.config!.publishableKey,
        config: this.widgetConfig!,
        baseUrl: this.config!.baseUrl,
      },
    };

    this.postMessage(initMessage);

    // Emit ready event
    this.emitEvent('ready', undefined);
    this.callbacks.onReady?.();
  }

  private handleEvent(message: EventMessage): void {
    const { event, data } = message.payload;

    // Emit to generic listeners
    this.emitEvent(event, data as EmbedEventPayloads[typeof event]);

    // Call specific callbacks
    switch (event) {
      case 'loaded':
        this.callbacks.onLoaded?.(data as EmbedEventPayloads['loaded']);
        break;
      case 'invest':
        this.callbacks.onInvest?.(data as EmbedEventPayloads['invest']);
        break;
      case 'invest_pending':
        this.callbacks.onInvestPending?.(data as EmbedEventPayloads['invest_pending']);
        break;
      case 'invest_confirmed':
        this.callbacks.onInvestConfirmed?.(data as EmbedEventPayloads['invest_confirmed']);
        break;
      case 'invest_failed':
        this.callbacks.onInvestFailed?.(data as EmbedEventPayloads['invest_failed']);
        break;
      case 'kyc_started':
        this.callbacks.onKycStarted?.(data as EmbedEventPayloads['kyc_started']);
        break;
      case 'kyc_completed':
        this.callbacks.onKycCompleted?.(data as EmbedEventPayloads['kyc_completed']);
        break;
      case 'kyc_failed':
        this.callbacks.onKycFailed?.(data as EmbedEventPayloads['kyc_failed']);
        break;
      case 'close':
        this.callbacks.onClose?.(data as EmbedEventPayloads['close']);
        this.close();
        break;
      case 'error':
        this.callbacks.onError?.(data as EmbedEventPayloads['error']);
        break;
    }
  }

  private handleResize(message: ResizeMessage): void {
    const { width, height } = message.payload;

    if (this.iframe) {
      this.iframe.style.width = `${width}px`;
      this.iframe.style.height = `${height}px`;
    }

    this.emitEvent('resize', { width, height });
    this.callbacks.onResize?.({ width, height });
  }

  private handleError(message: EmbedMessage): void {
    const error = message.payload as EmbedEventPayloads['error'];
    this.emitEvent('error', error);
    this.callbacks.onError?.(error);

    console.error('[Tokenisation] Widget error', error);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.widgetConfig?.closeOnEscape !== false) {
      this.close();
    }
  }

  private handleOverlayClick(event: MouseEvent): void {
    if (
      event.target === this.overlay &&
      this.widgetConfig?.closeOnBackdropClick !== false
    ) {
      this.close();
    }
  }

  private emitEvent<T extends EmbedEventType>(
    event: T,
    payload: EmbedEventPayloads[T]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(payload));
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new embed instance
 *
 * @example
 * ```typescript
 * const embed = createEmbed();
 *
 * embed.init({ publishableKey: 'pk_test_xxx' });
 *
 * embed.open({
 *   assetId: 'ast_123',
 *   mode: 'invest',
 *   theme: 'light',
 * }, {
 *   onInvest: (result) => {
 *     console.log('Investment completed:', result);
 *   },
 *   onClose: () => {
 *     console.log('Widget closed');
 *   },
 * });
 * ```
 */
export function createEmbed(): TokenisationEmbed {
  return new TokenisationEmbedImpl();
}

// ============================================================================
// AUTO-INIT FOR SCRIPT TAG USAGE
// ============================================================================

/**
 * Auto-initialize when loaded via script tag
 */
export function autoInit(): void {
  if (typeof window !== 'undefined') {
    // Create global instance
    window.Tokenisation = createEmbed();

    // Check for auto-init attribute
    const script = document.currentScript as HTMLScriptElement | null;
    if (script) {
      const publishableKey = script.getAttribute('data-publishable-key');
      if (publishableKey) {
        const debug = script.getAttribute('data-debug') === 'true';
        const baseUrl = script.getAttribute('data-base-url') || undefined;
        const locale = (script.getAttribute('data-locale') as EmbedInitOptions['locale']) || undefined;
        const theme = (script.getAttribute('data-theme') as EmbedInitOptions['theme']) || undefined;

        window.Tokenisation.init({
          publishableKey,
          debug,
          baseUrl,
          locale,
          theme,
        });
      }
    }
  }
}

// Auto-init when script loads
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }
}
