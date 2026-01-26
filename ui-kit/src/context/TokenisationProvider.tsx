import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import type { TokenisationInstance, AuthenticatedUser } from '../core/Tokenisation';
import { ApiClient } from '../core/ApiClient';
import { EventEmitter, TokenisationEventType, TokenisationEvent } from '../core/EventEmitter';
import { Theme, injectTheme } from '../core/Theme';

/**
 * Context value provided to all ui-kit components
 */
export interface TokenisationContextValue {
  /** The Tokenisation client instance */
  client: TokenisationInstance;

  /** API client for direct API calls */
  api: ApiClient;

  /** Event emitter for subscribing to events */
  events: EventEmitter;

  /** Current theme */
  theme: Theme;

  /** Whether the client is ready */
  isReady: boolean;

  /** Whether user is authenticated */
  isAuthenticated: boolean;

  /** Current authenticated user */
  user: AuthenticatedUser | null;

  /** Authenticate with wallet */
  authenticate: (address: string, signature: string, message: string) => Promise<boolean>;

  /** Logout */
  logout: () => Promise<void>;

  /** Subscribe to events */
  on: <T extends TokenisationEventType>(
    type: T,
    handler: (event: TokenisationEvent<T>) => void
  ) => () => void;
}

const TokenisationContext = createContext<TokenisationContextValue | null>(null);

export interface TokenisationProviderProps {
  /** Initialized Tokenisation client instance */
  client: TokenisationInstance;

  /** Children components */
  children: ReactNode;

  /** Callback when client becomes ready */
  onReady?: () => void;

  /** Callback on authentication change */
  onAuthChange?: (user: AuthenticatedUser | null) => void;

  /** Callback on errors */
  onError?: (error: { type: string; message: string }) => void;
}

/**
 * Provider component that makes Tokenisation available to all ui-kit components.
 *
 * @example
 * ```tsx
 * import { Tokenisation, TokenisationProvider, KYCFlow } from '@tokenisation/ui-kit';
 *
 * // Initialize client
 * const client = await Tokenisation.init({
 *   publishableKey: 'pk_test_xxx',
 *   theme: 'dark',
 * });
 *
 * function App() {
 *   return (
 *     <TokenisationProvider
 *       client={client}
 *       onReady={() => console.log('Ready!')}
 *       onAuthChange={(user) => console.log('Auth changed:', user)}
 *     >
 *       <KYCFlow onComplete={handleKycComplete} />
 *     </TokenisationProvider>
 *   );
 * }
 * ```
 */
export function TokenisationProvider({
  client,
  children,
  onReady,
  onAuthChange,
  onError,
}: TokenisationProviderProps) {
  const [isReady, setIsReady] = useState(client.isReady);
  const [user, setUser] = useState<AuthenticatedUser | null>(client.user);

  // Inject theme CSS variables
  useEffect(() => {
    injectTheme(client.theme);

    // Listen for theme changes
    const unsubscribe = client.events.on('theme:changed', (event) => {
      injectTheme(event.payload.theme);
    });

    return unsubscribe;
  }, [client]);

  // Subscribe to client events
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Ready event
    if (!client.isReady) {
      unsubscribers.push(
        client.events.once('ready', () => {
          setIsReady(true);
          onReady?.();
        })
      );
    } else {
      onReady?.();
    }

    // Auth events
    unsubscribers.push(
      client.events.on('auth:login', (event) => {
        setUser(event.payload.user);
        onAuthChange?.(event.payload.user);
      })
    );

    unsubscribers.push(
      client.events.on('auth:logout', () => {
        setUser(null);
        onAuthChange?.(null);
      })
    );

    unsubscribers.push(
      client.events.on('auth:restored', (event) => {
        setUser(event.payload.user);
        onAuthChange?.(event.payload.user);
      })
    );

    // Error events
    unsubscribers.push(
      client.events.on('error', (event) => {
        onError?.(event.payload);
      })
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [client, onReady, onAuthChange, onError]);

  // Authenticate handler
  const authenticate = useCallback(
    async (address: string, signature: string, message: string): Promise<boolean> => {
      const result = await client.authenticate(address, signature, message);
      return result.success;
    },
    [client]
  );

  // Logout handler
  const logout = useCallback(async () => {
    await client.logout();
  }, [client]);

  // Event subscription handler
  const on = useCallback(
    <T extends TokenisationEventType>(
      type: T,
      handler: (event: TokenisationEvent<T>) => void
    ) => {
      return client.events.on(type, handler);
    },
    [client]
  );

  const value: TokenisationContextValue = {
    client,
    api: client.api,
    events: client.events,
    theme: client.theme,
    isReady,
    isAuthenticated: user !== null,
    user,
    authenticate,
    logout,
    on,
  };

  return (
    <TokenisationContext.Provider value={value}>
      {children}
    </TokenisationContext.Provider>
  );
}

/**
 * Hook to access Tokenisation from any component within the provider.
 *
 * @throws Error if used outside of TokenisationProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { api, user, isAuthenticated } = useTokenisation();
 *
 *   const handleInvest = async () => {
 *     const result = await api.tokens.mint(assetId, user.id, amount);
 *     console.log('Invested:', result);
 *   };
 *
 *   return (
 *     <button onClick={handleInvest} disabled={!isAuthenticated}>
 *       Invest
 *     </button>
 *   );
 * }
 * ```
 */
export function useTokenisation(): TokenisationContextValue {
  const context = useContext(TokenisationContext);

  if (!context) {
    throw new Error(
      'useTokenisation must be used within a TokenisationProvider. ' +
        'Wrap your app with <TokenisationProvider client={client}>...</TokenisationProvider>'
    );
  }

  return context;
}

/**
 * Hook to subscribe to Tokenisation events
 *
 * @example
 * ```tsx
 * function TransactionListener() {
 *   useTokenisationEvent('transaction:confirmed', (event) => {
 *     toast.success(`Transaction confirmed: ${event.payload.txHash}`);
 *   });
 *
 *   return null;
 * }
 * ```
 */
export function useTokenisationEvent<T extends TokenisationEventType>(
  type: T,
  handler: (event: TokenisationEvent<T>) => void
): void {
  const { on } = useTokenisation();

  useEffect(() => {
    return on(type, handler);
  }, [type, handler, on]);
}
