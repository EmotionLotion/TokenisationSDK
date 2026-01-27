/**
 * Property Service
 *
 * Integrates with the Tokenisation SDK to manage real estate tokens.
 */

import { createApiClient, type ApiClient } from '@tokenisation/sdk';

// ============================================================================
// TYPES
// ============================================================================

export interface PropertyLocation {
  address: string;
  city: string;
  country: string;
  postalCode?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface Property {
  id: string;
  assetId: string;
  tokenId?: string;
  name: string;
  description?: string;
  location: PropertyLocation;
  propertyType: 'residential' | 'commercial' | 'industrial' | 'land';
  valuation: number;
  currency: string;
  totalShares: number;
  issuedShares: number;
  pricePerShare: number;
  status: 'draft' | 'pending_verification' | 'verified' | 'tokenized' | 'frozen';
  dldTitleDeedId?: string;
  createdAt: Date;
}

export interface CreatePropertyParams {
  name: string;
  description?: string;
  location: PropertyLocation;
  propertyType?: Property['propertyType'];
  valuation: number;
  currency?: string;
  totalShares: number;
  dldTitleDeedId?: string;
}

export interface TokenizeParams {
  symbol: string;
  chainId: number;
  complianceModules?: string[];
}

export interface InvestParams {
  investorId: string;
  investorWallet: string;
  shares: number;
  paymentAmount: number;
  paymentCurrency?: string;
}

export interface DistributionParams {
  propertyId: string;
  name: string;
  amount: number;
  currency: string;
  paymentDate: string;
  type?: 'rent' | 'dividend' | 'profit_share';
}

// ============================================================================
// PROPERTY SERVICE CLASS
// ============================================================================

export class PropertyService {
  private client: ApiClient;
  private projectId: string;

  constructor(apiKey: string, projectId: string, baseUrl?: string) {
    this.client = createApiClient({
      apiKey,
      baseUrl: baseUrl || 'http://localhost:3001',
    });
    this.projectId = projectId;
  }

  /**
   * Create a new property asset
   */
  async createProperty(params: CreatePropertyParams): Promise<Property> {
    const pricePerShare = params.valuation / params.totalShares;

    // Create the asset
    const asset = await this.client.assets.create({
      name: params.name,
      description: params.description || `Real estate property at ${params.location.address}`,
      projectId: this.projectId,
      rightType: 'OWNERSHIP',
      jurisdiction: {
        country: params.location.country,
        subdivision: params.location.city,
      },
      titleDeedExternalId: params.dldTitleDeedId,
      attributes: {
        propertyType: params.propertyType || 'residential',
        location: params.location,
        valuation: params.valuation,
        currency: params.currency || 'USD',
        totalShares: params.totalShares,
        pricePerShare,
      },
      metadata: {
        type: 'real_estate',
        version: '1.0',
      },
    });

    return {
      id: `prop_${asset.id.slice(0, 8)}`,
      assetId: asset.id,
      name: asset.name,
      description: asset.description || undefined,
      location: params.location,
      propertyType: params.propertyType || 'residential',
      valuation: params.valuation,
      currency: params.currency || 'USD',
      totalShares: params.totalShares,
      issuedShares: 0,
      pricePerShare,
      status: 'draft',
      dldTitleDeedId: params.dldTitleDeedId,
      createdAt: new Date(),
    };
  }

  /**
   * Tokenize a property (deploy ERC-3643 token)
   */
  async tokenizeProperty(assetId: string, params: TokenizeParams): Promise<{ tokenId: string; address?: string }> {
    const asset = await this.client.assets.get(assetId);

    // Create and deploy the token
    const token = await this.client.tokens.create({
      name: asset.name,
      symbol: params.symbol,
      projectId: this.projectId,
      assetId,
      standard: 'ERC3643',
      chainId: params.chainId,
      decimals: 0, // Whole shares only
      maxSupply: String(asset.attributes?.totalShares || 1000),
      complianceModules: params.complianceModules || ['identity', 'country', 'investor_type'],
    });

    // Deploy the token contract
    await this.client.tokens.deploy({ tokenId: token.id });

    return {
      tokenId: token.id,
      address: token.address || undefined,
    };
  }

  /**
   * Process an investment (issue shares to investor)
   */
  async processInvestment(tokenId: string, params: InvestParams): Promise<{
    investmentId: string;
    shares: number;
    status: string;
  }> {
    // Verify investor is eligible
    const investor = await this.client.investors.get(params.investorId);

    if (investor.kycStatus !== 'passed') {
      throw new Error('Investor KYC not verified');
    }

    // Issue tokens to investor
    const issuance = await this.client.tokens.mint({
      tokenId,
      toWallet: params.investorWallet,
      toInvestorId: params.investorId,
      amount: String(params.shares),
      metadata: {
        paymentAmount: params.paymentAmount,
        paymentCurrency: params.paymentCurrency || 'USD',
      },
      idempotencyKey: `invest-${tokenId}-${params.investorId}-${Date.now()}`,
    });

    return {
      investmentId: issuance.id,
      shares: params.shares,
      status: issuance.status,
    };
  }

  /**
   * Create a dividend/rent distribution
   */
  async createDistribution(params: DistributionParams): Promise<{ distributionId: string; status: string }> {
    // Get the property's token
    const assets = await this.client.assets.list({
      projectId: this.projectId,
      limit: 100,
    });

    const asset = assets.data.find(a => a.id.includes(params.propertyId.replace('prop_', '')));
    if (!asset) {
      throw new Error('Property not found');
    }

    const tokens = await this.client.tokens.list({
      assetId: asset.id,
      limit: 1,
    });

    if (tokens.data.length === 0) {
      throw new Error('Property not tokenized');
    }

    const token = tokens.data[0];

    // Create the distribution
    const distribution = await this.client.distributions.create({
      tokenId: token.id,
      name: params.name,
      description: `${params.type || 'rent'} distribution for ${asset.name}`,
      type: params.type || 'rent',
      totalAmount: String(params.amount),
      currency: params.currency,
      paymentDate: params.paymentDate,
      recordDate: new Date().toISOString().split('T')[0],
      allocationStrategy: 'pro_rata',
      paymentMethod: 'on_chain',
    });

    return {
      distributionId: distribution.id,
      status: distribution.status,
    };
  }

  /**
   * Get property details
   */
  async getProperty(assetId: string): Promise<Property | null> {
    try {
      const asset = await this.client.assets.get(assetId);

      const tokens = await this.client.tokens.list({
        assetId,
        limit: 1,
      });

      const token = tokens.data[0];

      return {
        id: `prop_${asset.id.slice(0, 8)}`,
        assetId: asset.id,
        tokenId: token?.id,
        name: asset.name,
        description: asset.description || undefined,
        location: asset.attributes?.location as PropertyLocation,
        propertyType: asset.attributes?.propertyType as Property['propertyType'],
        valuation: asset.attributes?.valuation as number,
        currency: asset.attributes?.currency as string || 'USD',
        totalShares: asset.attributes?.totalShares as number,
        issuedShares: token ? Number(token.issuedSupply || 0) : 0,
        pricePerShare: asset.attributes?.pricePerShare as number,
        status: this.mapAssetState(asset.state),
        dldTitleDeedId: asset.titleDeedExternalId || undefined,
        createdAt: new Date(asset.createdAt),
      };
    } catch {
      return null;
    }
  }

  /**
   * List all properties
   */
  async listProperties(): Promise<Property[]> {
    const assets = await this.client.assets.list({
      projectId: this.projectId,
      limit: 100,
    });

    const properties: Property[] = [];

    for (const asset of assets.data) {
      if (asset.metadata?.type === 'real_estate') {
        const property = await this.getProperty(asset.id);
        if (property) {
          properties.push(property);
        }
      }
    }

    return properties;
  }

  /**
   * Get cap table (investor holdings)
   */
  async getCapTable(tokenId: string): Promise<Array<{
    investorId: string;
    wallet: string;
    shares: number;
    percentage: number;
  }>> {
    const positions = await this.client.ledger.getPositions({ tokenId });

    const totalShares = positions.reduce((sum, p) => sum + Number(p.balance), 0);

    return positions.map(p => ({
      investorId: p.investorId || 'unknown',
      wallet: p.walletAddress,
      shares: Number(p.balance),
      percentage: totalShares > 0 ? (Number(p.balance) / totalShares) * 100 : 0,
    }));
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private mapAssetState(state: string): Property['status'] {
    switch (state) {
      case 'DRAFT':
        return 'draft';
      case 'PENDING_VERIFICATION':
        return 'pending_verification';
      case 'VERIFIED':
        return 'verified';
      case 'TOKENIZED':
        return 'tokenized';
      case 'FROZEN':
        return 'frozen';
      default:
        return 'draft';
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createPropertyService(
  apiKey: string,
  projectId: string,
  baseUrl?: string
): PropertyService {
  return new PropertyService(apiKey, projectId, baseUrl);
}
