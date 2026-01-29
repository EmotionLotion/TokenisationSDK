/**
 * Embed Widget Types
 *
 * Types for the embeddable investment widget that can be integrated
 * into partner websites via a simple script tag.
 */

// ============================================================================
// THEME & STYLING
// ============================================================================

/**
 * Widget theme options
 */
export type EmbedTheme = 'light' | 'dark' | 'system';

/**
 * Widget size variants
 */
export type EmbedSize = 'compact' | 'standard' | 'large';

/**
 * Custom styling options for the widget
 */
export interface EmbedStyleOptions {
  /** Primary accent color (hex) */
  accentColor?: string;
  /** Background color override */
  backgroundColor?: string;
  /** Text color override */
  textColor?: string;
  /** Border radius in pixels */
  borderRadius?: number;
  /** Font family */
  fontFamily?: string;
  /** Custom CSS to inject */
  customCss?: string;
}

// ============================================================================
// WIDGET CONFIGURATION
// ============================================================================

/**
 * Widget display modes
 */
export type EmbedMode =
  | 'invest'      // Full investment flow
  | 'view'        // Read-only asset view
  | 'portfolio'   // Portfolio summary
  | 'kyc'         // KYC flow only
  | 'checkout';   // Payment/checkout only

/**
 * Supported locales
 */
export type EmbedLocale =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'ar'
  | 'zh'
  | 'ja';

/**
 * Main widget configuration
 */
export interface EmbedWidgetConfig {
  /** Asset ID to display (required for invest/view modes) */
  assetId?: string;
  /** Widget display mode */
  mode: EmbedMode;
  /** Theme setting */
  theme?: EmbedTheme;
  /** Size variant */
  size?: EmbedSize;
  /** Locale for i18n */
  locale?: EmbedLocale;
  /** Custom styling */
  style?: EmbedStyleOptions;

  // Investment-specific options
  /** Pre-selected investment amount */
  defaultAmount?: number;
  /** Currency for display */
  currency?: string;
  /** Minimum investment amount */
  minAmount?: number;
  /** Maximum investment amount */
  maxAmount?: number;
  /** Pre-filled investor wallet address */
  investorWallet?: string;

  // Behavior options
  /** Enable animations */
  animated?: boolean;
  /** Show powered by branding */
  showBranding?: boolean;
  /** Close on backdrop click */
  closeOnBackdropClick?: boolean;
  /** Close on escape key */
  closeOnEscape?: boolean;

  // Partner customization
  /** Partner logo URL */
  partnerLogo?: string;
  /** Custom terms URL */
  termsUrl?: string;
  /** Custom privacy URL */
  privacyUrl?: string;
  /** Custom support URL */
  supportUrl?: string;
}

// ============================================================================
// EVENTS & CALLBACKS
// ============================================================================

/**
 * Investment result from the widget
 */
export interface InvestResult {
  /** Unique investment ID */
  investmentId: string;
  /** Asset ID */
  assetId: string;
  /** Investment amount */
  amount: number;
  /** Currency */
  currency: string;
  /** Number of tokens/units */
  tokenAmount: string;
  /** Token symbol */
  tokenSymbol: string;
  /** Transaction hash (if on-chain) */
  transactionHash?: string;
  /** Investment status */
  status: 'pending' | 'confirmed' | 'completed' | 'failed';
  /** Timestamp */
  timestamp: string;
}

/**
 * KYC completion result
 */
export interface KycResult {
  /** KYC verification ID */
  verificationId: string;
  /** Verification status */
  status: 'pending' | 'approved' | 'rejected' | 'needs_review';
  /** Investor ID */
  investorId?: string;
  /** Timestamp */
  timestamp: string;
}

/**
 * Widget error information
 */
export interface EmbedError {
  /** Error code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

/**
 * Event types emitted by the widget
 */
export type EmbedEventType =
  | 'ready'
  | 'loaded'
  | 'invest'
  | 'invest_pending'
  | 'invest_confirmed'
  | 'invest_failed'
  | 'kyc_started'
  | 'kyc_completed'
  | 'kyc_failed'
  | 'close'
  | 'error'
  | 'resize';

/**
 * Event payloads by type
 */
export interface EmbedEventPayloads {
  ready: undefined;
  loaded: { assetId?: string };
  invest: InvestResult;
  invest_pending: InvestResult;
  invest_confirmed: InvestResult;
  invest_failed: { error: EmbedError; partialResult?: Partial<InvestResult> };
  kyc_started: { investorId?: string };
  kyc_completed: KycResult;
  kyc_failed: { error: EmbedError };
  close: { reason: 'user' | 'complete' | 'error' };
  error: EmbedError;
  resize: { width: number; height: number };
}

/**
 * Callback handlers for widget events
 */
export interface EmbedCallbacks {
  /** Called when the widget is ready */
  onReady?: () => void;
  /** Called when asset data is loaded */
  onLoaded?: (data: EmbedEventPayloads['loaded']) => void;
  /** Called when an investment is initiated */
  onInvest?: (result: InvestResult) => void;
  /** Called when investment is pending */
  onInvestPending?: (result: InvestResult) => void;
  /** Called when investment is confirmed */
  onInvestConfirmed?: (result: InvestResult) => void;
  /** Called when investment fails */
  onInvestFailed?: (data: EmbedEventPayloads['invest_failed']) => void;
  /** Called when KYC process starts */
  onKycStarted?: (data: EmbedEventPayloads['kyc_started']) => void;
  /** Called when KYC is completed */
  onKycCompleted?: (result: KycResult) => void;
  /** Called when KYC fails */
  onKycFailed?: (data: EmbedEventPayloads['kyc_failed']) => void;
  /** Called when widget is closed */
  onClose?: (data: EmbedEventPayloads['close']) => void;
  /** Called on any error */
  onError?: (error: EmbedError) => void;
  /** Called when iframe resizes */
  onResize?: (data: EmbedEventPayloads['resize']) => void;
}

// ============================================================================
// MAIN EMBED INTERFACE
// ============================================================================

/**
 * Initialization options for the embed SDK
 */
export interface EmbedInitOptions {
  /** Publishable API key */
  publishableKey: string;
  /** API base URL (defaults to production) */
  baseUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Default locale */
  locale?: EmbedLocale;
  /** Default theme */
  theme?: EmbedTheme;
}

/**
 * Main embed interface exposed globally
 */
export interface TokenisationEmbed {
  /** Initialize the embed SDK */
  init(config: EmbedInitOptions): void;

  /** Open the widget with configuration */
  open(config: EmbedWidgetConfig, callbacks?: EmbedCallbacks): void;

  /** Close the widget */
  close(): void;

  /** Check if widget is currently open */
  isOpen(): boolean;

  /** Update widget configuration (while open) */
  update(config: Partial<EmbedWidgetConfig>): void;

  /** Add event listener */
  on<T extends EmbedEventType>(
    event: T,
    callback: (payload: EmbedEventPayloads[T]) => void
  ): void;

  /** Remove event listener */
  off<T extends EmbedEventType>(
    event: T,
    callback?: (payload: EmbedEventPayloads[T]) => void
  ): void;

  /** Get current configuration */
  getConfig(): EmbedInitOptions | null;

  /** Get SDK version */
  getVersion(): string;

  /** Destroy the instance */
  destroy(): void;
}

// ============================================================================
// INTERNAL MESSAGE TYPES
// ============================================================================

/**
 * Message types for iframe <-> parent communication
 */
export type MessageType =
  | 'INIT'
  | 'READY'
  | 'UPDATE_CONFIG'
  | 'CLOSE'
  | 'EVENT'
  | 'RESIZE'
  | 'ERROR';

/**
 * Base message structure
 */
export interface EmbedMessage {
  type: MessageType;
  source: 'tokenisation-embed';
  version: string;
  payload?: unknown;
}

/**
 * Init message from parent to iframe
 */
export interface InitMessage extends EmbedMessage {
  type: 'INIT';
  payload: {
    publishableKey: string;
    config: EmbedWidgetConfig;
    baseUrl?: string;
  };
}

/**
 * Ready message from iframe to parent
 */
export interface ReadyMessage extends EmbedMessage {
  type: 'READY';
}

/**
 * Config update message
 */
export interface UpdateConfigMessage extends EmbedMessage {
  type: 'UPDATE_CONFIG';
  payload: Partial<EmbedWidgetConfig>;
}

/**
 * Close message
 */
export interface CloseMessage extends EmbedMessage {
  type: 'CLOSE';
  payload?: { reason: string };
}

/**
 * Event message from iframe to parent
 */
export interface EventMessage extends EmbedMessage {
  type: 'EVENT';
  payload: {
    event: EmbedEventType;
    data: unknown;
  };
}

/**
 * Resize message from iframe to parent
 */
export interface ResizeMessage extends EmbedMessage {
  type: 'RESIZE';
  payload: {
    width: number;
    height: number;
  };
}

/**
 * Error message
 */
export interface ErrorMessage extends EmbedMessage {
  type: 'ERROR';
  payload: EmbedError;
}

// ============================================================================
// GLOBAL DECLARATION
// ============================================================================

declare global {
  interface Window {
    Tokenisation?: TokenisationEmbed;
  }
}
