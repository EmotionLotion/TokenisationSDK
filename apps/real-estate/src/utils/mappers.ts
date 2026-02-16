/**
 * Type mappers between SDK Asset type and the app's DubaiProperty shape.
 *
 * The SDK Asset has a generic structure with typedMetadata for real estate,
 * while DubaiProperty is a flat, display-oriented type specific to this app.
 */

import type { DubaiProperty } from '../data/dubai-properties';

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
 * Map SDK lifecycle state to DubaiProperty status.
 */
function mapStateToStatus(state: string): DubaiProperty['status'] {
  const mapping: Record<string, DubaiProperty['status']> = {
    DRAFT: 'sourcing',
    PENDING_VERIFICATION: 'due-diligence',
    VERIFIED: 'legal-structuring',
    ACTIVE: 'live',
    FROZEN: 'live',
    SUSPENDED: 'live',
    REDEEMED: 'distributing',
    TERMINATED: 'distributing',
    // API-level states (lowercase)
    draft: 'sourcing',
    pending_verification: 'due-diligence',
    verified: 'legal-structuring',
    tokenized: 'live',
    frozen: 'live',
    closed: 'distributing',
  };
  return mapping[state] || 'sourcing';
}

/**
 * Map DubaiProperty status to SDK lifecycle state.
 */
function mapStatusToState(status: DubaiProperty['status']): string {
  const mapping: Record<DubaiProperty['status'], string> = {
    sourcing: 'DRAFT',
    'due-diligence': 'PENDING_VERIFICATION',
    'legal-structuring': 'VERIFIED',
    'regulatory-approval': 'VERIFIED',
    'token-issuance': 'ACTIVE',
    live: 'ACTIVE',
    distributing: 'ACTIVE',
  };
  return mapping[status] || 'DRAFT';
}

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
    tokenized: ['live', 'distributing', 'token-issuance'].includes(property.status),
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
  };
  return mapping[status] || 'neutral';
}

// Re-export helper types
export { mapStateToStatus, mapStatusToState };
