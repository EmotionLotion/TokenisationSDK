/**
 * ErrorInterceptor - Global error handler for blockchain and backend errors
 *
 * Maps blockchain/backend error codes to user-friendly messages with
 * categories, severity levels, and suggested actions.
 *
 * @example
 * ```typescript
 * import { ErrorInterceptor } from '@tokenisation/sdk-react';
 *
 * const interceptor = new ErrorInterceptor();
 * try {
 *   await sendTransaction();
 * } catch (err) {
 *   const handled = interceptor.intercept(err);
 *   showToast(handled.message, handled.severity);
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Describes a single error mapping entry in the registry.
 */
export interface ErrorMapping {
  /** Unique code identifier for this error type */
  code: string;
  /** Regex pattern used to match against raw error messages */
  pattern?: RegExp;
  /** User-friendly message to display */
  message: string;
  /** Broad category the error belongs to */
  category: 'blockchain' | 'compliance' | 'network' | 'auth' | 'validation';
  /** How severe the error is */
  severity: 'info' | 'warning' | 'error' | 'critical';
  /** Optional suggested action for the user */
  action?: string;
}

/**
 * The result of intercepting an error through the ErrorInterceptor.
 */
export interface InterceptedError {
  /** The original error value that was intercepted */
  originalError: unknown;
  /** Resolved error code */
  code: string;
  /** User-friendly message */
  message: string;
  /** Error category */
  category: ErrorMapping['category'];
  /** Error severity */
  severity: ErrorMapping['severity'];
  /** Suggested user action, if any */
  action?: string;
  /** ISO-8601 timestamp of when the error was intercepted */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Default error registry
// ---------------------------------------------------------------------------

/**
 * Pre-built error registry covering common EVM errors, ERC-3643 compliance
 * errors, network errors, and authentication errors.
 */
export const ERROR_REGISTRY: ErrorMapping[] = [
  // ── EVM / blockchain errors ──────────────────────────────────────────
  {
    code: 'INSUFFICIENT_FUNDS',
    pattern: /insufficient funds/i,
    message: 'Insufficient funds for gas fees. Please add more ETH to your wallet.',
    category: 'blockchain',
    severity: 'error',
    action: 'Add funds to wallet',
  },
  {
    code: 'NONCE_TOO_LOW',
    pattern: /nonce too low/i,
    message: 'Transaction nonce conflict. Please try again.',
    category: 'blockchain',
    severity: 'warning',
    action: 'Retry transaction',
  },
  {
    code: 'GAS_TOO_LOW',
    pattern: /gas too low|underpriced/i,
    message: 'Gas price too low. Transaction may not be processed.',
    category: 'blockchain',
    severity: 'warning',
    action: 'Increase gas price',
  },
  {
    code: 'REVERTED',
    pattern: /execution reverted/i,
    message: 'Transaction was reverted by the smart contract.',
    category: 'blockchain',
    severity: 'error',
  },
  {
    code: 'USER_REJECTED',
    pattern: /user rejected|user denied/i,
    message: 'Transaction was cancelled by the user.',
    category: 'blockchain',
    severity: 'info',
  },

  // ── ERC-3643 compliance errors ───────────────────────────────────────
  {
    code: 'IDENTITY_NOT_VERIFIED',
    pattern: /identity not verified|not whitelisted/i,
    message: 'Your identity has not been verified. Complete KYC to proceed.',
    category: 'compliance',
    severity: 'error',
    action: 'Complete KYC verification',
  },
  {
    code: 'TRANSFER_NOT_COMPLIANT',
    pattern: /transfer not compliant|compliance check failed/i,
    message: 'This transfer does not meet compliance requirements.',
    category: 'compliance',
    severity: 'error',
  },
  {
    code: 'FROZEN_TOKENS',
    pattern: /tokens? (?:are |is )?frozen/i,
    message: 'These tokens are currently frozen and cannot be transferred.',
    category: 'compliance',
    severity: 'error',
  },
  {
    code: 'COUNTRY_RESTRICTED',
    pattern: /country restricted|jurisdiction blocked/i,
    message: 'This operation is restricted in your jurisdiction.',
    category: 'compliance',
    severity: 'error',
  },

  // ── Network errors ───────────────────────────────────────────────────
  {
    code: 'NETWORK_ERROR',
    pattern: /network error|fetch failed|ECONNREFUSED/i,
    message: 'Unable to connect to the server. Check your internet connection.',
    category: 'network',
    severity: 'error',
    action: 'Check connection',
  },
  {
    code: 'TIMEOUT',
    pattern: /timeout|timed out/i,
    message: 'Request timed out. The server may be experiencing high load.',
    category: 'network',
    severity: 'warning',
    action: 'Try again later',
  },

  // ── Auth errors ──────────────────────────────────────────────────────
  {
    code: 'UNAUTHORIZED',
    pattern: /unauthorized|401/i,
    message: 'Your session has expired. Please sign in again.',
    category: 'auth',
    severity: 'error',
    action: 'Sign in',
  },
  {
    code: 'FORBIDDEN',
    pattern: /forbidden|403/i,
    message: 'You do not have permission to perform this action.',
    category: 'auth',
    severity: 'error',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract a string representation from an unknown error value.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object') {
    // Handle objects with message, reason, or data.message (common in ethers.js)
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.reason === 'string') return obj.reason;
    if (obj.data && typeof (obj.data as Record<string, unknown>).message === 'string') {
      return (obj.data as Record<string, unknown>).message as string;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * Extract an error code from an unknown error value if one is present.
 */
function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.code === 'string') return obj.code;
    if (typeof obj.code === 'number') return String(obj.code);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// ErrorInterceptor class
// ---------------------------------------------------------------------------

/**
 * Global error interceptor that maps raw errors to user-friendly
 * `InterceptedError` objects using a configurable registry of patterns.
 */
export class ErrorInterceptor {
  private registry: ErrorMapping[];
  private listeners: Array<(error: InterceptedError) => void> = [];

  /**
   * Create an ErrorInterceptor.
   *
   * @param customMappings - Additional error mappings to prepend to the
   *   default registry. Custom mappings are checked first so they can
   *   override built-in patterns.
   */
  constructor(customMappings?: ErrorMapping[]) {
    // Custom mappings take precedence (checked first)
    this.registry = customMappings
      ? [...customMappings, ...ERROR_REGISTRY]
      : [...ERROR_REGISTRY];
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Intercept an error and return a structured `InterceptedError`.
   *
   * Matching is performed in order:
   * 1. If the raw error carries a `.code` property that matches a registry
   *    entry's `code` exactly, that entry wins.
   * 2. Otherwise each registry entry's `pattern` is tested against the
   *    stringified error message; the first match wins.
   * 3. If nothing matches a generic `UNKNOWN_ERROR` is returned.
   *
   * All registered listeners are notified after a match.
   */
  intercept(error: unknown): InterceptedError {
    const rawMessage = extractErrorMessage(error);
    const rawCode = extractErrorCode(error);

    // 1. Try exact code match
    let mapping: ErrorMapping | undefined;
    if (rawCode) {
      mapping = this.registry.find(
        (m) => m.code === rawCode || m.code === rawCode.toUpperCase(),
      );
    }

    // 2. Try pattern match
    if (!mapping) {
      mapping = this.registry.find((m) => m.pattern && m.pattern.test(rawMessage));
    }

    const intercepted: InterceptedError = mapping
      ? {
          originalError: error,
          code: mapping.code,
          message: mapping.message,
          category: mapping.category,
          severity: mapping.severity,
          action: mapping.action,
          timestamp: new Date().toISOString(),
        }
      : {
          originalError: error,
          code: 'UNKNOWN_ERROR',
          message: rawMessage || 'An unexpected error occurred. Please try again.',
          category: 'network' as const,
          severity: 'error' as const,
          timestamp: new Date().toISOString(),
        };

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(intercepted);
      } catch {
        // Swallow listener errors to avoid cascading failures
      }
    }

    return intercepted;
  }

  /**
   * Add a new error mapping to the registry.
   * New mappings are prepended so they take priority over existing ones.
   */
  addMapping(mapping: ErrorMapping): void {
    this.registry.unshift(mapping);
  }

  /**
   * Register a listener that is called every time an error is intercepted.
   *
   * @returns An unsubscribe function.
   */
  onError(listener: (error: InterceptedError) => void): () => void {
    this.listeners.push(listener);

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // ── Static helpers ─────────────────────────────────────────────────

  /**
   * Convenience static method that creates a one-off interceptor and
   * processes the given error.
   */
  static fromError(error: unknown): InterceptedError {
    const interceptor = new ErrorInterceptor();
    return interceptor.intercept(error);
  }
}
