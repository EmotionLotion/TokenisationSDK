/**
 * Embed Widget Component
 *
 * React component rendered inside the iframe for the embeddable widget.
 * Handles the investment flow UI and communicates with the parent page
 * via postMessage.
 */

import React, {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react';
import type {
  EmbedWidgetConfig,
  EmbedMessage,
  InitMessage,
  UpdateConfigMessage,
  EmbedEventType,
  EmbedEventPayloads,
  InvestResult,
  KycResult,
  EmbedError,
} from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MESSAGE_SOURCE = 'tokenisation-embed';
const SDK_VERSION = '1.0.0';

// ============================================================================
// CONTEXT
// ============================================================================

interface EmbedContextValue {
  config: EmbedWidgetConfig | null;
  publishableKey: string | null;
  baseUrl: string | null;
  isReady: boolean;
  emitEvent: <T extends EmbedEventType>(event: T, data: EmbedEventPayloads[T]) => void;
  requestClose: (reason: 'user' | 'complete' | 'error') => void;
  requestResize: (width: number, height: number) => void;
}

const EmbedContext = createContext<EmbedContextValue | null>(null);

export function useEmbedContext(): EmbedContextValue {
  const context = useContext(EmbedContext);
  if (!context) {
    throw new Error('useEmbedContext must be used within EmbedWidgetProvider');
  }
  return context;
}

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

interface EmbedWidgetProviderProps {
  children: ReactNode;
}

export function EmbedWidgetProvider({ children }: EmbedWidgetProviderProps): JSX.Element {
  const [config, setConfig] = useState<EmbedWidgetConfig | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [parentOrigin, setParentOrigin] = useState<string>('*');

  // Post message to parent
  const postMessage = useCallback((message: EmbedMessage) => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, parentOrigin);
    }
  }, [parentOrigin]);

  // Emit event to parent
  const emitEvent = useCallback(<T extends EmbedEventType>(
    event: T,
    data: EmbedEventPayloads[T]
  ) => {
    postMessage({
      type: 'EVENT',
      source: MESSAGE_SOURCE,
      version: SDK_VERSION,
      payload: { event, data },
    });
  }, [postMessage]);

  // Request close
  const requestClose = useCallback((reason: 'user' | 'complete' | 'error') => {
    emitEvent('close', { reason });
    postMessage({
      type: 'CLOSE',
      source: MESSAGE_SOURCE,
      version: SDK_VERSION,
      payload: { reason },
    });
  }, [emitEvent, postMessage]);

  // Request resize
  const requestResize = useCallback((width: number, height: number) => {
    postMessage({
      type: 'RESIZE',
      source: MESSAGE_SOURCE,
      version: SDK_VERSION,
      payload: { width, height },
    });
  }, [postMessage]);

  // Handle incoming messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as EmbedMessage;

      if (data?.source !== MESSAGE_SOURCE) return;

      // Store parent origin for future messages
      if (event.origin && event.origin !== 'null') {
        setParentOrigin(event.origin);
      }

      switch (data.type) {
        case 'INIT': {
          const initData = data as InitMessage;
          setPublishableKey(initData.payload.publishableKey);
          setConfig(initData.payload.config);
          if (initData.payload.baseUrl) {
            setBaseUrl(initData.payload.baseUrl);
          }
          setIsReady(true);
          emitEvent('loaded', { assetId: initData.payload.config.assetId });
          break;
        }

        case 'UPDATE_CONFIG': {
          const updateData = data as UpdateConfigMessage;
          setConfig(prev => prev ? { ...prev, ...updateData.payload } : null);
          break;
        }

        case 'CLOSE':
          requestClose('user');
          break;
      }
    };

    window.addEventListener('message', handleMessage);

    // Send ready message to parent
    postMessage({
      type: 'READY',
      source: MESSAGE_SOURCE,
      version: SDK_VERSION,
    });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [postMessage, emitEvent, requestClose]);

  const contextValue: EmbedContextValue = {
    config,
    publishableKey,
    baseUrl,
    isReady,
    emitEvent,
    requestClose,
    requestResize,
  };

  return (
    <EmbedContext.Provider value={contextValue}>
      {children}
    </EmbedContext.Provider>
  );
}

// ============================================================================
// WIDGET COMPONENTS
// ============================================================================

interface LoadingSpinnerProps {
  size?: number;
}

function LoadingSpinner({ size = 40 }: LoadingSpinnerProps): JSX.Element {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: '3px solid #e5e7eb',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

interface ErrorDisplayProps {
  error: EmbedError;
  onRetry?: () => void;
}

function ErrorDisplay({ error, onRetry }: ErrorDisplayProps): JSX.Element {
  return (
    <div style={{ textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>!</div>
      <h3 style={{ margin: '0 0 0.5rem 0' }}>Something went wrong</h3>
      <p style={{ color: '#6b7280', margin: '0 0 1rem 0' }}>{error.message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
          }}
        >
          Try Again
        </button>
      )}
    </div>
  );
}

// ============================================================================
// INVEST MODE COMPONENT
// ============================================================================

interface InvestModeProps {
  assetId: string;
}

function InvestMode({ assetId }: InvestModeProps): JSX.Element {
  const { config, emitEvent, requestClose } = useEmbedContext();
  const [step, setStep] = useState<'amount' | 'confirm' | 'processing' | 'complete' | 'error'>('amount');
  const [amount, setAmount] = useState(config?.defaultAmount?.toString() || '');
  const [error, setError] = useState<EmbedError | null>(null);
  const [result, setResult] = useState<InvestResult | null>(null);

  const handleAmountSubmit = useCallback(() => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError({ code: 'INVALID_AMOUNT', message: 'Please enter a valid amount' });
      return;
    }
    if (config?.minAmount && numAmount < config.minAmount) {
      setError({ code: 'MIN_AMOUNT', message: `Minimum investment is ${config.currency || 'USD'} ${config.minAmount}` });
      return;
    }
    if (config?.maxAmount && numAmount > config.maxAmount) {
      setError({ code: 'MAX_AMOUNT', message: `Maximum investment is ${config.currency || 'USD'} ${config.maxAmount}` });
      return;
    }
    setError(null);
    setStep('confirm');
  }, [amount, config]);

  const handleConfirm = useCallback(async () => {
    setStep('processing');

    try {
      // Simulate investment processing
      // In production, this would call the API
      await new Promise(resolve => setTimeout(resolve, 2000));

      const investResult: InvestResult = {
        investmentId: `inv_${Date.now()}`,
        assetId,
        amount: parseFloat(amount),
        currency: config?.currency || 'USD',
        tokenAmount: (parseFloat(amount) / 100).toFixed(4),
        tokenSymbol: 'TKN',
        status: 'pending',
        timestamp: new Date().toISOString(),
      };

      setResult(investResult);
      emitEvent('invest', investResult);
      emitEvent('invest_pending', investResult);

      // Simulate confirmation
      await new Promise(resolve => setTimeout(resolve, 1500));

      const confirmedResult = { ...investResult, status: 'confirmed' as const };
      setResult(confirmedResult);
      emitEvent('invest_confirmed', confirmedResult);

      setStep('complete');
    } catch (err) {
      const investError: EmbedError = {
        code: 'INVEST_FAILED',
        message: err instanceof Error ? err.message : 'Investment failed',
      };
      setError(investError);
      emitEvent('invest_failed', { error: investError });
      setStep('error');
    }
  }, [amount, assetId, config, emitEvent]);

  const handleClose = useCallback(() => {
    requestClose(step === 'complete' ? 'complete' : 'user');
  }, [requestClose, step]);

  return (
    <div style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Invest</h2>
        <button
          onClick={handleClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            padding: '0.25rem',
          }}
        >
          &times;
        </button>
      </div>

      {/* Step: Amount */}
      {step === 'amount' && (
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
            Investment Amount ({config?.currency || 'USD'})
          </label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            style={{
              width: '100%',
              padding: '0.75rem',
              fontSize: '1rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.375rem',
              marginBottom: '1rem',
            }}
          />
          {error && (
            <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
              {error.message}
            </p>
          )}
          <button
            onClick={handleAmountSubmit}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: config?.style?.accentColor || '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Continue
          </button>
        </div>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && (
        <div>
          <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem 0', color: '#6b7280' }}>You are investing</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>
              {config?.currency || 'USD'} {parseFloat(amount).toLocaleString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setStep('amount')}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              style={{
                flex: 1,
                padding: '0.75rem',
                backgroundColor: config?.style?.accentColor || '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <LoadingSpinner />
          <p style={{ marginTop: '1rem', color: '#6b7280' }}>Processing your investment...</p>
        </div>
      )}

      {/* Step: Complete */}
      {step === 'complete' && result && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>&#10004;</div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Investment Complete</h3>
          <p style={{ color: '#6b7280', margin: '0 0 1rem 0' }}>
            You have invested {config?.currency || 'USD'} {result.amount.toLocaleString()}
          </p>
          <p style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
            Investment ID: {result.investmentId}
          </p>
          <button
            onClick={handleClose}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              backgroundColor: config?.style?.accentColor || '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Step: Error */}
      {step === 'error' && error && (
        <ErrorDisplay error={error} onRetry={() => setStep('amount')} />
      )}

      {/* Branding */}
      {config?.showBranding !== false && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af' }}>
          Powered by Tokenisation
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VIEW MODE COMPONENT
// ============================================================================

interface ViewModeProps {
  assetId: string;
}

function ViewMode({ assetId }: ViewModeProps): JSX.Element {
  const { config, requestClose } = useEmbedContext();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading asset data
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Asset Details</h2>
        <button
          onClick={() => requestClose('user')}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
          }}
        >
          &times;
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <LoadingSpinner />
        </div>
      ) : (
        <div>
          <p style={{ color: '#6b7280' }}>Asset ID: {assetId}</p>
          {/* Asset details would be rendered here */}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN WIDGET COMPONENT
// ============================================================================

export function EmbedWidget(): JSX.Element {
  const { config, isReady } = useEmbedContext();

  if (!isReady || !config) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: '300px',
      }}>
        <LoadingSpinner />
      </div>
    );
  }

  // Apply theme
  const isDark = config.theme === 'dark' ||
    (config.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const containerStyle: React.CSSProperties = {
    backgroundColor: isDark ? '#1f2937' : '#ffffff',
    color: isDark ? '#f9fafb' : '#111827',
    minHeight: '100%',
    fontFamily: config.style?.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };

  // Inject custom CSS if provided
  useEffect(() => {
    if (!config.style?.customCss) return undefined;

    const style = document.createElement('style');
    style.textContent = config.style.customCss;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [config.style?.customCss]);

  return (
    <div style={containerStyle}>
      {config.mode === 'invest' && config.assetId && (
        <InvestMode assetId={config.assetId} />
      )}
      {config.mode === 'view' && config.assetId && (
        <ViewMode assetId={config.assetId} />
      )}
      {/* Other modes would be implemented similarly */}
    </div>
  );
}

// ============================================================================
// APP ROOT
// ============================================================================

export function EmbedApp(): JSX.Element {
  return (
    <EmbedWidgetProvider>
      <EmbedWidget />
    </EmbedWidgetProvider>
  );
}

export default EmbedApp;
