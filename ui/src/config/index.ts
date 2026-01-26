/**
 * Application Configuration
 *
 * Reads environment variables and provides typed configuration.
 */

export const config = {
  // API Backend Configuration
  useApiBackend: import.meta.env.VITE_USE_API_BACKEND === 'true',
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1',

  // WalletConnect
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '',

  // Development mode
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

export type Config = typeof config;
