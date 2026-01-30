/**
 * @tokenisation/ui-kit
 *
 * Drop-in React components for tokenization UIs.
 * "Stripe Elements" for RWA tokenization.
 *
 * @example
 * ```tsx
 * import { Tokenisation, TokenisationProvider, KYCFlow, InvestButton } from '@tokenisation/ui-kit';
 *
 * // Initialize once at app startup
 * const client = await Tokenisation.init({
 *   publishableKey: 'pk_test_xxx',
 *   theme: 'dark',
 * });
 *
 * function App() {
 *   return (
 *     <TokenisationProvider client={client}>
 *       <KYCFlow onComplete={(result) => console.log('KYC:', result)} />
 *       <InvestButton assetId="asset_123" amount="1000" />
 *     </TokenisationProvider>
 *   );
 * }
 * ```
 */

// ============================================
// Core - Initialization & Configuration
// ============================================
export { Tokenisation, init, getInstance, destroy } from './core/Tokenisation';
export type {
  TokenisationConfig,
  TokenisationInstance,
  AuthenticatedUser,
  AuthResult,
} from './core/Tokenisation';

// ============================================
// Core - API Client
// ============================================
export { ApiClient, ApiClientError } from './core/ApiClient';
export type { ApiClientConfig, ApiError } from './core/ApiClient';

// ============================================
// Core - Events
// ============================================
export { EventEmitter } from './core/EventEmitter';
export type {
  TokenisationEventType,
  TokenisationEvent,
  TokenisationEventMap,
} from './core/EventEmitter';

// ============================================
// Core - Theming
// ============================================
export {
  createTheme,
  themeToCssVars,
  injectTheme,
  defaultTheme,
} from './core/Theme';
export type {
  Theme,
  ThemeConfig,
  ThemeColors,
} from './core/Theme';

// ============================================
// Context & Hooks
// ============================================
export {
  TokenisationProvider,
  useTokenisation,
  useTokenisationEvent,
} from './context/TokenisationProvider';
export type {
  TokenisationProviderProps,
  TokenisationContextValue,
} from './context/TokenisationProvider';

// ============================================
// Components - Authentication & KYC
// ============================================
export { KYCModal } from './components/KYCModal';
export type { KYCModalProps, KYCResult } from './components/KYCModal';

export { WalletConnectModal } from './components/WalletConnectModal';
export type { WalletConnectProps, WalletInfo } from './components/WalletConnectModal';

// ============================================
// Components - Asset Display
// ============================================
export { AssetCard } from './components/AssetCard';
export type { AssetCardProps } from './components/AssetCard';

export { CapTable } from './components/CapTable';
export type { CapTableProps } from './components/CapTable';

export { TransactionHistory } from './components/TransactionHistory';
export type { TransactionHistoryProps } from './components/TransactionHistory';

// ============================================
// Components - Actions
// ============================================
export { InvestButton } from './components/InvestButton';
export type { InvestButtonProps } from './components/InvestButton';

// ============================================
// Utilities
// ============================================

/**
 * Format token amount for display
 */
export function formatTokenAmount(
  amount: string | number | bigint,
  decimals: number = 18,
  displayDecimals: number = 4
): string {
  const value = typeof amount === 'bigint' ? amount : BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === 0n) {
    return whole.toLocaleString();
  }

  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, displayDecimals);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Shorten address for display
 */
export function shortenAddress(address: string, chars: number = 4): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string, locale: string = 'en-US'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format relative time
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(d);
}

// ============================================
// Generic Module (Stripe-like Elements)
// ============================================
// Re-export everything from the generic module for convenience
export * from './generic';

// Named exports for tree-shaking
export {
  // Context & Hooks
  AssetProvider,
  useAssets,
  useAsset,
  useAssetActions,
  // Templates
  templateRegistry,
  getTemplate,
  getAllTemplates,
  // Components
  GenericAssetCard,
  AssetGrid,
  FeaturedAssets,
  ActionStation,
  QuickActions,
  InvestmentFlow,
  // Atoms
  StatusBadge,
  ComplianceBadge,
  TokenAmount,
  PriceDisplay,
  BalanceDisplay,
  AddressAvatar,
  AddressList,
  ContractAddress,
} from './generic';

// ============================================
// Components - Compliance & Persona
// ============================================
export { ComplianceStepper } from './components/ComplianceStepper';
export type { ComplianceStepperProps, StepConfig } from './components/ComplianceStepper';

export { PersonaSwitcher as PersonaSwitcherComponent } from './components/PersonaSwitcher';
export type { PersonaSwitcherProps, Persona } from './components/PersonaSwitcher';

export { TicketCard } from './components/TicketCard';
export type { TicketCardProps } from './components/TicketCard';

// ============================================
// Components - Investment & Portfolio
// ============================================
export { InvestmentChart } from './components/InvestmentChart';
export type { InvestmentChartProps } from './components/InvestmentChart';

// ============================================
// Components - Fee Estimation
// ============================================
export { FeeEstimate } from './components/FeeEstimate';
export type { FeeEstimateProps, FeeEstimateData } from './components/FeeEstimate';

export { StatusBadge as StateBadge } from './generic';

// ============================================
// Components - Transaction Flow (Gap 10)
// ============================================
export { TransactionFlow } from './components/TransactionFlow';

// ============================================
// Components - Export (Gap 11)
// ============================================
export { ExportButton } from './components/ExportButton';

// ============================================
// Theme Provider (Gap 6)
// ============================================
export { ThemeProvider, useTheme } from './core/ThemeProvider';

// ============================================
// i18n System (Gap 7)
// ============================================
export { createI18n, getDirection } from './i18n/index';
export { I18nProvider, useTranslation } from './i18n/I18nProvider';

// ============================================
// Analytics (Gap 22)
// ============================================
export { analytics, trackEvent, setUser, setBackend, setupAutoTracking } from './analytics/index';

// ============================================
// Web Components / Embed (Gap 21)
// ============================================
export { registerElements } from './embed/TokenisationElement';
