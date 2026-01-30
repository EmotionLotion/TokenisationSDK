/**
 * TokenisationElement - Web Component wrappers for tokenisation UI components.
 *
 * Registers custom elements that render React components inside Shadow DOM,
 * enabling drop-in usage without a React app shell.
 *
 * Custom elements:
 *   <tokenisation-kyc />
 *   <tokenisation-invest />
 *   <tokenisation-cap-table />
 *
 * Attributes (common):
 *   api-url    - Base URL for the tokenisation API
 *   api-key    - Publishable API key
 *   token-id   - Token / asset identifier
 *   theme      - JSON-encoded theme overrides
 *   locale     - BCP-47 locale string (default "en")
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Message shape used for cross-origin iframe communication. */
export interface TokenisationPostMessage {
  type: string;
  payload: Record<string, unknown>;
  source: 'tokenisation-element';
}

/** Parsed attribute bag shared by all elements. */
interface ElementAttributes {
  apiUrl: string;
  apiKey: string;
  tokenId: string;
  theme: Record<string, unknown> | null;
  locale: string;
}

// ---------------------------------------------------------------------------
// Observed attribute list (shared)
// ---------------------------------------------------------------------------

const OBSERVED_ATTRIBUTES = ['api-url', 'api-key', 'token-id', 'theme', 'locale'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTheme(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    console.warn('[TokenisationElement] Invalid theme JSON:', raw);
    return null;
  }
}

function readAttributes(el: HTMLElement): ElementAttributes {
  return {
    apiUrl: el.getAttribute('api-url') ?? '',
    apiKey: el.getAttribute('api-key') ?? '',
    tokenId: el.getAttribute('token-id') ?? '',
    theme: parseTheme(el.getAttribute('theme')),
    locale: el.getAttribute('locale') ?? 'en',
  };
}

function postMessageToParent(type: string, payload: Record<string, unknown>): void {
  const message: TokenisationPostMessage = {
    type,
    payload,
    source: 'tokenisation-element',
  };
  try {
    window.parent.postMessage(message, '*');
  } catch {
    // silently ignore if not in iframe context
  }
}

/**
 * Dynamically import React and ReactDOM so this module can be loaded in
 * non-React environments (the host page only needs the bundled script tag).
 */
async function mountReact(
  shadowRoot: ShadowRoot,
  container: HTMLDivElement,
  componentName: string,
  props: Record<string, unknown>,
): Promise<void> {
  try {
    // Dynamic imports keep these peer-deps out of the critical path
    const [React, ReactDOM, uiKit] = await Promise.all([
      import('react'),
      import('react-dom/client'),
      import('../index'),
    ]);

    const componentMap: Record<string, unknown> = {
      KYCModal: (uiKit as Record<string, unknown>).KYCModal,
      InvestButton: (uiKit as Record<string, unknown>).InvestButton,
      CapTable: (uiKit as Record<string, unknown>).CapTable,
    };

    const Component = componentMap[componentName] as React.ComponentType<Record<string, unknown>> | undefined;
    if (!Component) {
      console.error(`[TokenisationElement] Unknown component: ${componentName}`);
      return;
    }

    // Inject a minimal reset stylesheet into the shadow root
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
      * { box-sizing: border-box; }
    `;
    shadowRoot.prepend(style);

    const root = (ReactDOM as any).createRoot(container);
    root.render(React.createElement(Component, props));
  } catch (err) {
    console.error(`[TokenisationElement] Failed to mount ${componentName}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

/**
 * Abstract base class for all tokenisation custom elements.
 *
 * - Attaches shadow DOM on construction
 * - Creates a container `<div>` for React rendering
 * - Re-renders when observed attributes change
 * - Provides postMessage helpers for iframe communication
 */
export abstract class TokenisationElement extends HTMLElement {
  /** Shadow root reference. */
  protected shadow: ShadowRoot;

  /** Container element for React rendering. */
  protected container: HTMLDivElement;

  /** Whether the element has been connected at least once. */
  private _connected = false;

  /** Name of the React component to render. */
  protected abstract readonly componentName: string;

  static get observedAttributes(): string[] {
    return [...OBSERVED_ATTRIBUTES];
  }

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.container = document.createElement('div');
    this.container.setAttribute('data-tokenisation-root', '');
    this.shadow.appendChild(this.container);
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  connectedCallback(): void {
    this._connected = true;
    this._render();
    this._listenForMessages();
  }

  disconnectedCallback(): void {
    this._connected = false;
    window.removeEventListener('message', this._handleMessage);
  }

  attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue !== newValue && this._connected) {
      this._render();
    }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Build props from attributes; subclasses may override to add extra props. */
  protected buildProps(): Record<string, unknown> {
    const attrs = readAttributes(this);
    return {
      apiUrl: attrs.apiUrl,
      apiKey: attrs.apiKey,
      tokenId: attrs.tokenId,
      assetId: attrs.tokenId,
      locale: attrs.locale,
      ...(attrs.theme ? { theme: attrs.theme } : {}),
    };
  }

  private _render(): void {
    const props = this.buildProps();
    mountReact(this.shadow, this.container, this.componentName, props);
  }

  // -------------------------------------------------------------------------
  // postMessage support
  // -------------------------------------------------------------------------

  /** Send a message to the parent frame. */
  protected notify(type: string, payload: Record<string, unknown> = {}): void {
    postMessageToParent(type, payload);
  }

  private _handleMessage = (event: MessageEvent): void => {
    if (event.data?.source === 'tokenisation-host') {
      this.onHostMessage(event.data.type, event.data.payload ?? {});
    }
  };

  private _listenForMessages(): void {
    window.addEventListener('message', this._handleMessage);
  }

  /** Override in subclass to handle messages from host/parent. */
  protected onHostMessage(_type: string, _payload: Record<string, unknown>): void {
    // no-op by default
  }
}

// ---------------------------------------------------------------------------
// Concrete elements
// ---------------------------------------------------------------------------

/**
 * `<tokenisation-kyc>` - Embeds the KYC verification modal.
 *
 * Extra attributes:
 *   party-id       - Party to verify
 *   required-tier  - "NONE" | "BASIC" | "STANDARD" | "ENHANCED"
 */
export class TokenisationKYC extends TokenisationElement {
  protected readonly componentName = 'KYCModal';

  protected buildProps(): Record<string, unknown> {
    const base = super.buildProps();
    return {
      ...base,
      isOpen: true,
      partyId: this.getAttribute('party-id') ?? undefined,
      config: {
        requiredTier: this.getAttribute('required-tier') ?? 'STANDARD',
      },
      onClose: () => this.notify('kyc:close'),
      onComplete: (result: unknown) => this.notify('kyc:complete', { result }),
      onError: (error: unknown) =>
        this.notify('kyc:error', {
          message: error instanceof Error ? error.message : String(error),
        }),
    };
  }

  protected onHostMessage(type: string, payload: Record<string, unknown>): void {
    if (type === 'kyc:open') {
      // Re-render to open the modal
      this.setAttribute('data-open', 'true');
    }
    if (type === 'kyc:close') {
      this.removeAttribute('data-open');
    }
  }
}

/**
 * `<tokenisation-invest>` - Embeds the invest / purchase button.
 *
 * Extra attributes:
 *   amount - Pre-filled investment amount
 */
export class TokenisationInvest extends TokenisationElement {
  protected readonly componentName = 'InvestButton';

  protected buildProps(): Record<string, unknown> {
    const base = super.buildProps();
    return {
      ...base,
      amount: this.getAttribute('amount') ?? undefined,
      onSuccess: (receipt: unknown) => this.notify('invest:success', { receipt }),
      onError: (error: unknown) =>
        this.notify('invest:error', {
          message: error instanceof Error ? error.message : String(error),
        }),
    };
  }
}

/**
 * `<tokenisation-cap-table>` - Embeds the cap table visualization.
 *
 * Extra attributes:
 *   max-holders       - Maximum holders to display (number)
 *   show-percentages  - "true" | "false"
 */
export class TokenisationCapTable extends TokenisationElement {
  protected readonly componentName = 'CapTable';

  protected buildProps(): Record<string, unknown> {
    const base = super.buildProps();
    return {
      ...base,
      maxHolders: parseInt(this.getAttribute('max-holders') ?? '10', 10) || 10,
      showPercentages: this.getAttribute('show-percentages') !== 'false',
    };
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const ELEMENT_REGISTRY: Array<{ tag: string; ctor: CustomElementConstructor }> = [
  { tag: 'tokenisation-kyc', ctor: TokenisationKYC },
  { tag: 'tokenisation-invest', ctor: TokenisationInvest },
  { tag: 'tokenisation-cap-table', ctor: TokenisationCapTable },
];

/**
 * Register all tokenisation custom elements on the global `customElements` registry.
 *
 * Safe to call multiple times; already-registered tags are silently skipped.
 *
 * @example
 * ```ts
 * import { registerElements } from '@tokenisation/ui-kit/embed';
 * registerElements();
 * ```
 */
export function registerElements(): void {
  if (typeof customElements === 'undefined') {
    console.warn('[TokenisationElement] customElements API not available.');
    return;
  }

  for (const { tag, ctor } of ELEMENT_REGISTRY) {
    if (!customElements.get(tag)) {
      customElements.define(tag, ctor);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-register on script load
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  registerElements();
}
