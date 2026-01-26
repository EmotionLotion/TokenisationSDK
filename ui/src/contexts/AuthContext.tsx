/**
 * Authentication Context
 *
 * Provides SIWE authentication state and methods throughout the app.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
import { SiweMessage } from 'siwe';
import { API_URL } from '../config/wagmi';

interface Party {
  id: string;
  name: string;
  type: string;
  roles: string[];
  jurisdiction: string;
  verificationLevel: string;
  kycVerified: boolean;
  accreditedInvestor?: boolean;
  isFrozen?: boolean;
}

interface AuthSession {
  token: string;
  refreshToken: string;
  party: Party;
  address: string;
  chainId: number;
  expiresAt: Date;
}

interface AuthContextValue {
  session: AuthSession | null;
  party: Party | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'ahoy_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load session from storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.expiresAt && new Date(parsed.expiresAt) > new Date()) {
          setSession({
            ...parsed,
            expiresAt: new Date(parsed.expiresAt),
          });
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  // Clear session when wallet disconnects
  useEffect(() => {
    if (!isConnected && session) {
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [isConnected, session]);

  // Clear session when address changes
  useEffect(() => {
    if (session && address && session.address.toLowerCase() !== address.toLowerCase()) {
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [address, session]);

  const signIn = useCallback(async () => {
    if (!address || !chainId) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Get nonce from server
      const nonceResponse = await fetch(`${API_URL}/api/v1/auth/siwe/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      if (!nonceResponse.ok) {
        throw new Error('Failed to get nonce');
      }

      const { nonce, expiresAt } = await nonceResponse.json();

      // 2. Build SIWE message
      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: 'Sign in to AHOY Platform to manage your tokenized assets.',
        uri: window.location.origin,
        version: '1',
        chainId,
        nonce,
        issuedAt: new Date().toISOString(),
        expirationTime: expiresAt,
      });

      const preparedMessage = message.prepareMessage();

      // 3. Sign message
      const signature = await signMessageAsync({ message: preparedMessage });

      // 4. Verify with server
      const verifyResponse = await fetch(`${API_URL}/api/v1/auth/siwe/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: preparedMessage, signature }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error?.message || 'Verification failed');
      }

      const { token, refreshToken, party } = await verifyResponse.json();

      // 5. Create session
      const newSession: AuthSession = {
        token,
        refreshToken,
        party,
        address,
        chainId,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      };

      setSession(newSession);
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, signMessageAsync]);

  const signOut = useCallback(async () => {
    if (session?.token) {
      try {
        await fetch(`${API_URL}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`,
          },
        });
      } catch {
        // Ignore logout errors
      }
    }

    setSession(null);
    localStorage.removeItem(SESSION_KEY);
    disconnect();
  }, [session, disconnect]);

  const refreshSession = useCallback(async () => {
    if (!session?.refreshToken) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const { token, refreshToken } = await response.json();

      const newSession: AuthSession = {
        ...session,
        token,
        refreshToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      };

      setSession(newSession);
      localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    } catch {
      // Refresh failed, clear session
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  const getToken = useCallback(() => {
    return session?.token || null;
  }, [session]);

  const value: AuthContextValue = {
    session,
    party: session?.party || null,
    isAuthenticated: !!session && new Date() < session.expiresAt,
    isLoading,
    error,
    signIn,
    signOut,
    refreshSession,
    getToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
