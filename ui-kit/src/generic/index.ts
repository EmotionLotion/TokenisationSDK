/**
 * @tokenisation/ui-kit/generic
 *
 * Generic "Stripe Elements for Assets" module.
 * Template-aware, drop-in components for any asset type.
 *
 * @example
 * ```tsx
 * import {
 *   AssetProvider,
 *   GenericAssetCard,
 *   AssetGrid,
 *   ActionStation,
 *   InvestmentFlow,
 * } from '@tokenisation/ui-kit/generic';
 *
 * function Marketplace() {
 *   return (
 *     <AssetProvider autoFetch>
 *       <AssetGrid filter={{ type: 'real_estate' }} />
 *     </AssetProvider>
 *   );
 * }
 * ```
 */

// ============================================
// Types
// ============================================
export type {
  // Core types
  ActionType,
  TokenProfile,
  TemplateType,
  SupplyModel,
  SupplyConfig,
  PolicyType,
  Policy,
  PolicyCondition,
  AssetRights,
  MetadataField,
  AssetTemplate,
  AssetStatus,
  AssetMetadata,
  AssetInstance,
  Position,
  KYCStatus,
  RiskTier,
  UserIdentity,
  Permission,
  ActionRequest,
  ActionResult,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  AssetFilter,
  PaginationParams,
} from './types';

// ============================================
// Templates
// ============================================
export {
  templateRegistry,
  getTemplate,
  getAllTemplates,
  getTemplatesByProfile,
  isActionAvailable,
  getActionLabel,
  getActionDescription,
  // Individual templates
  realEstateTemplate,
  customTemplate,
} from './templates/registry';

// ============================================
// Context & Hooks
// ============================================
export {
  AssetProvider,
  useAssets,
  useAssetsOptional,
  useAsset,
  useAssetActions,
} from './context/AssetContext';
export type {
  AssetProviderProps,
  AssetContextValue,
} from './context/AssetContext';

// ============================================
// Atoms
// ============================================
export {
  StatusBadge,
  ComplianceBadge,
} from './atoms/StatusBadge';
export type {
  StatusBadgeProps,
  BadgeVariant,
  ComplianceBadgeProps,
} from './atoms/StatusBadge';

export {
  TokenAmount,
  PriceDisplay,
  BalanceDisplay,
} from './atoms/TokenAmount';
export type {
  TokenAmountProps,
  PriceDisplayProps,
  BalanceDisplayProps,
} from './atoms/TokenAmount';

export {
  AddressAvatar,
  AddressList,
  ContractAddress,
} from './atoms/AddressAvatar';
export type {
  AddressAvatarProps,
  AddressListProps,
  ContractAddressProps,
} from './atoms/AddressAvatar';

// ============================================
// Components
// ============================================
export {
  GenericAssetCard,
  AssetCardSkeleton,
} from './components/AssetCard';
export type {
  GenericAssetCardProps,
} from './components/AssetCard';

export {
  AssetGrid,
  FeaturedAssets,
} from './components/AssetGrid';
export type {
  AssetGridProps,
  FeaturedAssetsProps,
} from './components/AssetGrid';

export {
  ActionStation,
  QuickActions,
} from './components/ActionStation';
export type {
  ActionStationProps,
  QuickActionsProps,
} from './components/ActionStation';

export {
  InvestmentFlow,
  ModalWrapper,
} from './components/InvestmentFlow';
export type {
  InvestmentFlowProps,
  InvestmentResult,
} from './components/InvestmentFlow';

export { Showcase } from './components/Showcase';
