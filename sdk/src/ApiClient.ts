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
import { AssetsModule } from './modules/assets.js';
import { EventsModule } from './modules/events.js';
import { WebhooksModule } from './modules/webhooks.js';
import { AuditModule } from './modules/audit.js';
import { GovernanceModule } from './modules/GovernanceClient.js';
import { EscrowModule } from './modules/EscrowClient.js';
import { CashFlowModule } from './modules/CashFlowClient.js';
import { DLDModule } from './modules/DLDClient.js';
import { LegalModule } from './modules/LegalModule.js';
import { SecondaryMarketModule } from './modules/SecondaryMarketModule.js';
import { InvestorTierModule } from './modules/InvestorTierModule.js';
import { ExitWindowModule } from './modules/ExitWindowModule.js';
import { PropertyModule } from './modules/PropertyModule.js';
import { NAVModule } from './modules/NAVModule.js';
import type { TokenizationSDKConfig } from './types.js';

// ============================================================================
// API Client
// ============================================================================

export class ApiClient {
  private http: HttpClient;

  /** Projects management */
  public readonly projects: ProjectsModule;

  /** Asset management (tokenizable assets) */
  public readonly assets: AssetsModule;

  /** Investor onboarding and KYC */
  public readonly investors: InvestorsModule;

  /** Token creation, deployment, and management */
  public readonly tokens: TokensModule;

  /** Transfer orchestration */
  public readonly transfers: TransfersModule;

  /** Compliance policies and checks */
  public readonly compliance: ComplianceModule;

  /** Event bus for publishing and querying events */
  public readonly events: EventsModule;

  /** Webhook endpoints for real-time notifications */
  public readonly webhooks: WebhooksModule;

  /** Audit logs and evidence pack generation */
  public readonly audit: AuditModule;

  /** Governance - proposals, voting, delegation */
  public readonly governance: GovernanceModule;

  /** Escrow - conditional transfers, milestones */
  public readonly escrow: EscrowModule;

  /** Cash flow - distributions, dividends, payouts */
  public readonly cashflow: CashFlowModule;

  /** DLD - Dubai Land Department integration */
  public readonly dld: DLDModule;

  /** Legal - KYC/AML compliance, investor verification, freeze/unfreeze */
  public readonly legal: LegalModule;

  /** Secondary market - P2P listings and purchases */
  public readonly secondaryMarket: SecondaryMarketModule;

  /** Investor tiers - per-tier investment limits and eligibility */
  public readonly investorTiers: InvestorTierModule;

  /** Exit windows - scheduler-driven redemption windows */
  public readonly exitWindows: ExitWindowModule;

  /** Property management - units, maintenance, expenses */
  public readonly properties: PropertyModule;

  /** NAV - Net Asset Value calculation and history */
  public readonly nav: NAVModule;

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
    this.assets = new AssetsModule(this.http);
    this.investors = new InvestorsModule(this.http);
    this.tokens = new TokensModule(this.http);
    this.transfers = new TransfersModule(this.http);
    this.compliance = new ComplianceModule(this.http);
    this.events = new EventsModule(this.http);
    this.webhooks = new WebhooksModule(this.http);
    this.audit = new AuditModule(this.http);
    this.governance = new GovernanceModule(this.http);
    this.escrow = new EscrowModule(this.http);
    this.cashflow = new CashFlowModule(this.http);
    this.dld = new DLDModule(this.http);
    this.legal = new LegalModule(this.http);
    this.secondaryMarket = new SecondaryMarketModule(this.http);
    this.investorTiers = new InvestorTierModule(this.http);
    this.exitWindows = new ExitWindowModule(this.http);
    this.properties = new PropertyModule(this.http);
    this.nav = new NAVModule(this.http);
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
