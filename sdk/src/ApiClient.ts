/**
 * API Client for the Tokenisation Platform
 *
 * A Stripe-like client for interacting with the Tokenisation API.
 * This provides a clean, module-based interface for all API operations.
 *
 * @example
 * ```typescript
 * import { ApiClient } from '@tokenisation/sdk';
 *
 * const client = new ApiClient({
 *   apiKey: 'sk_test_xxxxx',
 * });
 *
 * // Create a project
 * const project = await client.projects.create({
 *   name: 'Dubai Marina Tower',
 *   jurisdiction: 'DUBAI',
 *   assetType: 'REAL_ESTATE',
 * });
 *
 * // Onboard an investor
 * const investor = await client.investors.create({
 *   email: 'investor@example.com',
 *   jurisdiction: 'AE',
 * });
 *
 * // Create and deploy a token
 * const token = await client.tokens.create({
 *   name: 'Marina Tower Token',
 *   symbol: 'MTT',
 *   chainId: 137, // Polygon
 *   projectId: project.id,
 * });
 *
 * await client.tokens.deploy(token.id);
 * ```
 */

import { HttpClient, TokenizationError } from './utils/http.js';
import { ProjectsModule } from './modules/projects.js';
import { InvestorsModule } from './modules/investors.js';
import { TokensModule } from './modules/tokens.js';
import { TransfersModule } from './modules/transfers.js';
import { ComplianceModule } from './modules/compliance.js';
import type { TokenizationSDKConfig } from './types.js';

// ============================================================================
// API Client
// ============================================================================

export class ApiClient {
  private http: HttpClient;

  /** Projects management */
  public readonly projects: ProjectsModule;

  /** Investor onboarding and KYC */
  public readonly investors: InvestorsModule;

  /** Token creation, deployment, and management */
  public readonly tokens: TokensModule;

  /** Transfer orchestration */
  public readonly transfers: TransfersModule;

  /** Compliance policies and checks */
  public readonly compliance: ComplianceModule;

  constructor(config: TokenizationSDKConfig) {
    // Validate API key format
    if (!config.apiKey || !config.apiKey.startsWith('sk_')) {
      throw new TokenizationError(
        'Invalid API key format. API keys should start with sk_test_ or sk_live_',
        'INVALID_API_KEY',
        400,
        ''
      );
    }

    // Detect environment from API key
    const environment = config.apiKey.startsWith('sk_live_') ? 'live' : 'test';

    // Set default base URL based on environment
    const baseUrl = config.baseUrl || (environment === 'live'
      ? 'https://api.tokenisation.io'
      : 'https://api.test.tokenisation.io');

    // Initialize HTTP client
    this.http = new HttpClient({
      ...config,
      baseUrl,
      environment,
    });

    // Initialize modules
    this.projects = new ProjectsModule(this.http);
    this.investors = new InvestorsModule(this.http);
    this.tokens = new TokensModule(this.http);
    this.transfers = new TransfersModule(this.http);
    this.compliance = new ComplianceModule(this.http);
  }

  /**
   * Gets the current organization info.
   */
  async getOrganization(): Promise<{
    id: string;
    name: string;
    slug: string;
    status: string;
    environment: string;
  }> {
    const response = await this.http.get<{
      id: string;
      name: string;
      slug: string;
      status: string;
      environment: string;
    }>('/api/v1/iam/me');
    return response.data;
  }

  /**
   * Health check for the API.
   */
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    db: string;
    version: string;
  }> {
    const response = await this.http.get<{
      status: string;
      timestamp: string;
      db: string;
      version: string;
    }>('/health');
    return response.data;
  }

  /**
   * Gets the raw HTTP client for advanced use cases.
   */
  getHttpClient(): HttpClient {
    return this.http;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a new ApiClient instance.
 *
 * @example
 * ```typescript
 * import { createApiClient } from '@tokenisation/sdk';
 *
 * const client = createApiClient({
 *   apiKey: process.env.TOKENISATION_API_KEY!,
 * });
 * ```
 */
export function createApiClient(config: TokenizationSDKConfig): ApiClient {
  return new ApiClient(config);
}

// Re-export the error type
export { TokenizationError };
