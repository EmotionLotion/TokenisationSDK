/**
 * Type mappers between SDK Asset type and the app's DubaiProperty shape.
 *
 * The SDK Asset has a generic structure with typedMetadata for real estate,
 * while DubaiProperty is a flat, display-oriented type specific to this app.
 *
 * Phase 2: Mapper functions now delegate to the SDK's lossless bridge functions
 * (mapCoreStateToRealEstate / mapRealEstateToCoreState / mapStateToStakeStage / mapStakeStageToState)
 * instead of maintaining a local lossy mapping.
 */

import type { DubaiProperty } from '../data/dubai-properties';
import {
  mapCoreStateToRealEstate,
  mapRealEstateToCoreState,
  mapStateToStakeStage,
  mapStakeStageToState,
} from '@tokenisation/sdk';

// SDK Asset shape (subset of fields we use for mapping)
interface SDKAssetForMapping {
  id: string;
  name: string;
  description?: string | null;
  state: string;
  jurisdiction?: { countryCode: string };
  typedMetadata?: {
    assetType: string;
    propertyType?: string;
    address?: { street?: string; city?: string; state?: string; postalCode?: string; country?: string };
    area?: { value: number; unit: string };
    deedNumber?: string;
    registryId?: string;
    valuationAmount?: string;
    valuationCurrency?: string;
    valuationDate?: string;
    annualRentYield?: number;
  };
  tokenInfo?: {
    contractAddress: string;
    tokenId?: string;
    chainId: number;
    tokenStandard: string;
    totalSupply: string;
    decimals?: number;
  };
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Map SDK lifecycle state to DubaiProperty status via lossless bridge.
 */
function mapStateToStatus(state: string): DubaiProperty['status'] {
  const reState = mapCoreStateToRealEstate(state);
  const stage = mapStateToStakeStage(reState);
  // Validate it's a known DubaiProperty status, fallback to 'sourcing'
  const validStatuses: DubaiProperty['status'][] = [
    'sourcing', 'due-diligence', 'legal-structuring', 'regulatory-approval',
    'token-issuance', 'live', 'distributing', 'secondary-trading', 'frozen',
  ];
  return (validStatuses.includes(stage as DubaiProperty['status'])
    ? stage as DubaiProperty['status']
    : 'sourcing');
}

/**
 * Map DubaiProperty status to SDK lifecycle state string via lossless bridge.
 */
function mapStatusToState(status: DubaiProperty['status']): string {
  const reState = mapStakeStageToState(status);
  const coreState = mapRealEstateToCoreState(reState);
  // Return the enum key name
  const stateNames: Record<number, string> = {
    0: 'DRAFT', 1: 'PENDING_VERIFICATION', 2: 'VERIFIED', 3: 'ACTIVE',
    4: 'FROZEN', 5: 'PARTIALLY_REDEEMED', 6: 'REDEEMED', 7: 'EXPIRED',
    8: 'CLOSED', 9: 'BURNED',
  };
  return stateNames[coreState as number] || 'DRAFT';
}

/**
 * @deprecated Use mapStateToStatus instead — delegates to SDK bridge functions.
 */
export { mapStateToStatus, mapStatusToState };

/**
 * Map SDK property type to DubaiProperty property type.
 */
function mapPropertyType(sdkType?: string): DubaiProperty['propertyType'] {
  if (!sdkType) return 'residential';
  const mapping: Record<string, DubaiProperty['propertyType']> = {
    RESIDENTIAL: 'residential',
    COMMERCIAL: 'commercial',
    INDUSTRIAL: 'commercial',
    LAND: 'residential',
  };
  return mapping[sdkType.toUpperCase()] || 'residential';
}

/**
 * Convert an SDK Asset to a DubaiProperty for display.
 * Missing fields are filled with sensible defaults.
 */
export function assetToDubaiProperty(asset: SDKAssetForMapping): DubaiProperty {
  const meta = asset.typedMetadata;
  const appMeta = asset.metadata || {};

  const valuationAED = meta?.valuationAmount ? parseFloat(meta.valuationAmount) : 0;
  const totalTokens = asset.tokenInfo ? parseInt(asset.tokenInfo.totalSupply, 10) : 0;
  const tokenPriceAED = totalTokens > 0 && valuationAED > 0 ? valuationAED / totalTokens : 0;
  const annualRentYield = meta?.annualRentYield ?? 0;
  const annualRentalIncomeAED = valuationAED * (annualRentYield / 100);

  return {
    id: asset.id,
    name: asset.name,
    location: meta?.address
      ? `${meta.address.city || ''}, ${meta.address.street || ''}`.replace(/^, |, $/, '')
      : (appMeta.location as string) || '',
    district: meta?.address?.city || (appMeta.district as string) || '',
    developer: (appMeta.developer as string) || '',
    propertyType: mapPropertyType(meta?.propertyType),

    totalArea: meta?.area?.value ?? 0,
    units: (appMeta.units as number) || undefined,
    floors: (appMeta.floors as number) || undefined,
    yearBuilt: (appMeta.yearBuilt as number) || 2024,

    reraPermitNo: (appMeta.reraPermitNo as string) || '',
    titleDeedNo: meta?.deedNumber || (appMeta.titleDeedNo as string) || '',
    makaniNo: (appMeta.makaniNo as string) || '',

    valuationAED,
    valuationUSD: valuationAED * 0.2724, // approximate AED to USD
    valuationDate: meta?.valuationDate || asset.updatedAt.slice(0, 10),
    valuedBy: (appMeta.valuedBy as string) || '',

    annualRentalIncomeAED,
    grossYield: annualRentYield,
    netYield: annualRentYield * 0.83, // approximate 17% expense ratio
    occupancyRate: (appMeta.occupancyRate as number) || 90,

    tokenSymbol: (appMeta.tokenSymbol as string) || asset.name.slice(0, 5).toUpperCase(),
    totalTokens,
    tokenPriceAED,
    tokenPriceUSD: tokenPriceAED * 0.2724,
    minInvestmentAED: (appMeta.minInvestmentAED as number) || tokenPriceAED * 100,

    status: mapStateToStatus(asset.state),

    imageUrl: (appMeta.imageUrl as string) || '/assets/placeholder.jpg',

    description: asset.description || '',
    highlights: (appMeta.highlights as string[]) || [],

    tokensSold: (appMeta.tokensSold as number) ?? undefined,
    fundingGoalAED: (appMeta.fundingGoalAED as number) ?? undefined,
  };
}

/**
 * Convert a DubaiProperty to SDK AssetFormData shape for creating assets.
 */
export function dubaiPropertyToAssetFormData(property: DubaiProperty) {
  return {
    name: property.name,
    symbol: property.tokenSymbol,
    description: property.description,
    rightType: 'OWNERSHIP',
    jurisdiction: 'AE',
    totalShares: property.totalTokens,
    pricePerShare: property.tokenPriceAED,
    documents: [] as File[],
    metadata: {
      location: property.location,
      district: property.district,
      developer: property.developer,
      propertyType: property.propertyType,
      totalArea: property.totalArea,
      units: property.units,
      floors: property.floors,
      yearBuilt: property.yearBuilt,
      reraPermitNo: property.reraPermitNo,
      titleDeedNo: property.titleDeedNo,
      makaniNo: property.makaniNo,
      valuedBy: property.valuedBy,
      occupancyRate: property.occupancyRate,
      tokenSymbol: property.tokenSymbol,
      minInvestmentAED: property.minInvestmentAED,
      imageUrl: property.imageUrl,
      highlights: property.highlights,
    },
  };
}

/**
 * Convert a DubaiProperty to props for the ui-kit PropertyCard component.
 */
export function toPropertyCardProps(property: DubaiProperty) {
  return {
    name: property.name,
    location: property.location,
    type: property.propertyType === 'hospitality' ? 'commercial' as const : property.propertyType,
    valuationAED: property.valuationAED,
    valuationUSD: property.valuationUSD,
    area: property.totalArea,
    areaUnit: 'sq ft',
    yield: property.netYield,
    occupancy: property.occupancyRate,
    tokenized: ['live', 'distributing', 'token-issuance', 'secondary-trading'].includes(property.status),
    status: property.status,
    imageUrl: property.imageUrl,
  };
}

/**
 * Map DubaiProperty status to ui-kit StatusBadge variant.
 */
export function toStatusBadgeVariant(status: DubaiProperty['status']): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  const mapping: Record<DubaiProperty['status'], 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
    sourcing: 'neutral',
    'due-diligence': 'warning',
    'legal-structuring': 'warning',
    'regulatory-approval': 'info',
    'token-issuance': 'info',
    live: 'success',
    distributing: 'success',
    'secondary-trading': 'success',
    frozen: 'error',
  };
  return mapping[status] || 'neutral';
}
