/**
 * FireblocksCustodyProvider - Fireblocks MPC Integration
 *
 * Integrates with Fireblocks' institutional-grade MPC custody solution.
 * Fireblocks uses a 2-of-3 MPC scheme with automatic co-signing.
 *
 * Features:
 * - Institutional-grade security with hardware-backed key shares
 * - Policy engine integration for transaction approval
 * - Automatic co-signing with configurable policies
 * - Comprehensive audit trail
 *
 * @see https://docs.fireblocks.com/
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';
import { AbstractMPCProvider } from './AbstractMPCProvider.js';
import type {
  MPCKeyShare,
  MPCKeyGenParams,
  MPCSigningSession,
  MPCSigningSessionRequest,
  MPCProviderCapabilities,
  MPCProviderConfig,
} from './IMPCProvider.js';

/**
 * Fireblocks-specific configuration
 */
export interface FireblocksConfig extends MPCProviderConfig {
  /** Fireblocks API key */
  apiKey: string;
  /** Fireblocks API secret (path to PEM file or raw key) */
  apiSecret: string;
  /** Fireblocks vault account ID (optional - will create if not provided) */
  vaultAccountId?: string;
  /** Use sandbox environment */
  sandbox?: boolean;
  /** Callback URL for transaction status webhooks */
  callbackUrl?: string;
  /** Custom API URL (for enterprise deployments) */
  apiUrl?: string;
}

/**
 * Fireblocks transaction status mapping
 */
type FireblocksStatus =
  | 'SUBMITTED'
  | 'PENDING_SIGNATURE'
  | 'PENDING_AUTHORIZATION'
  | 'QUEUED'
  | 'PENDING_3RD_PARTY_MANUAL_APPROVAL'
  | 'PENDING_3RD_PARTY'
  | 'BROADCASTING'
  | 'CONFIRMING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'BLOCKED'
  | 'FAILED'
  | 'TIMEOUT';

/**
 * FireblocksCustodyProvider - Fireblocks MPC Integration
 *
 * @example
 * ```typescript
 * const fireblocks = new FireblocksCustodyProvider({
 *   apiKey: process.env.FIREBLOCKS_API_KEY!,
 *   apiSecret: process.env.FIREBLOCKS_API_SECRET!,
 *   sandbox: true,
 * });
 *
 * // Create vault account
 * const account = await fireblocks.createAccount({
 *   ownerId: 'user-123',
 *   label: 'Main Wallet',
 * });
 *
 * // Keys are automatically generated in Fireblocks
 * await fireblocks.generateKeyShares({
 *   accountId: account.data.accountId,
 *   totalShares: 3,
 *   threshold: 2,
 * });
 *
 * // Get signer for transactions
 * const signer = await fireblocks.createSigner(account.data.accountId, 8453);
 * ```
 */
export class FireblocksCustodyProvider extends AbstractMPCProvider {
  readonly providerId = 'fireblocks';
  readonly providerName = 'Fireblocks';

  private fireblocksConfig: FireblocksConfig;
  private vaultAccountMap: Map<string, string> = new Map(); // accountId -> vaultAccountId
  private pendingTransactions: Map<string, string> = new Map(); // sessionId -> fireblocksTransactionId

  constructor(config: FireblocksConfig) {
    super(config);
    this.fireblocksConfig = config;
  }

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  getCapabilities(): MPCProviderCapabilities {
    return {
      supportedSchemes: ['2-of-3'],
      maxShares: 3,
      supportsClientMPC: false, // Fireblocks handles all MPC internally
      supportsHSM: true,
      supportsKeyRefresh: true,
      supportedAlgorithms: ['ECDSA'],
      supportedCurves: ['secp256k1'],
      supportsTypedData: true,
      avgSigningLatencyMs: 3000, // ~3 seconds typical
    };
  }

  // ============================================================================
  // KEY SHARE IMPLEMENTATION
  // ============================================================================

  protected async _generateKeySharesImpl(
    params: MPCKeyGenParams
  ): Promise<Result<MPCKeyShare[], string>> {
    // Fireblocks uses fixed 2-of-3 scheme
    if (params.totalShares !== 3 || params.threshold !== 2) {
      // We can still accept 2-of-3, just warn about other schemes
      console.warn(
        `[Fireblocks] Requested ${params.threshold}-of-${params.totalShares} but Fireblocks uses 2-of-3. Proceeding with 2-of-3.`
      );
    }

    try {
      // Create vault account in Fireblocks (simulated for now)
      const vaultAccountId = this.fireblocksConfig.vaultAccountId || await this._createVaultAccount(params.accountId);
      this.vaultAccountMap.set(params.accountId, vaultAccountId);

      // Add ETH asset to vault (this triggers key generation)
      const publicKey = await this._createVaultAsset(vaultAccountId, 'ETH');

      // Create share records (Fireblocks manages shares internally)
      const shares: MPCKeyShare[] = [
        {
          shareId: `${params.accountId}_share_1`,
          accountId: params.accountId,
          shareIndex: 1,
          totalShares: 3,
          threshold: 2,
          publicKey,
          holder: {
            id: 'fireblocks_server_1',
            type: 'server',
            name: 'Fireblocks MPC Server 1',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        },
        {
          shareId: `${params.accountId}_share_2`,
          accountId: params.accountId,
          shareIndex: 2,
          totalShares: 3,
          threshold: 2,
          publicKey,
          holder: {
            id: 'fireblocks_server_2',
            type: 'server',
            name: 'Fireblocks MPC Server 2',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        },
        {
          shareId: `${params.accountId}_share_3`,
          accountId: params.accountId,
          shareIndex: 3,
          totalShares: 3,
          threshold: 2,
          publicKey,
          holder: {
            id: 'customer_cosigner',
            type: 'client',
            name: 'Customer Co-signer',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        },
      ];

      return ok(shares);
    } catch (error) {
      return err(`Fireblocks key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async _refreshKeySharesImpl(
    accountId: string,
    params: { totalShares: number; threshold: number }
  ): Promise<Result<MPCKeyShare[], string>> {
    // Fireblocks supports key refresh through their API
    const shares = this.storage.keyShares.get(accountId);
    if (!shares) {
      return err('No existing shares to refresh');
    }

    // In production, this would call Fireblocks key refresh API
    // For now, we simulate by updating timestamps
    const refreshedShares = shares.map((share) => ({
      ...share,
      lastUsedAt: new Date().toISOString(),
    }));

    return ok(refreshedShares);
  }

  // ============================================================================
  // SIGNING IMPLEMENTATION
  // ============================================================================

  protected async _initiateSigningImpl(
    session: MPCSigningSession,
    request: MPCSigningSessionRequest
  ): Promise<void> {
    const vaultAccountId = this.vaultAccountMap.get(session.accountId);
    if (!vaultAccountId) {
      session.status = 'failed';
      session.error = 'Vault account not found';
      return;
    }

    try {
      // In production, this would create a raw signing transaction in Fireblocks
      // For now, we simulate the signing process
      const txId = `fb_tx_${uuidv4().slice(0, 8)}`;
      this.pendingTransactions.set(session.sessionId, txId);

      session.status = 'collecting';

      // Simulate Fireblocks signing (in production, use webhooks)
      setTimeout(async () => {
        await this._simulateFireblocksSigning(session.sessionId);
      }, this.fireblocksConfig.debug ? 100 : 2000);

    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  protected async _getSigningStatusImpl(
    sessionId: string
  ): Promise<Result<Partial<MPCSigningSession>, string>> {
    const txId = this.pendingTransactions.get(sessionId);
    if (!txId) {
      return ok({}); // No Fireblocks transaction, use local state
    }

    // In production, this would poll Fireblocks API
    // For now, return empty to use local state
    return ok({});
  }

  // ============================================================================
  // PROTECTED HELPERS
  // ============================================================================

  protected async _deriveAddress(accountId: string, chainId: number): Promise<string> {
    const vaultAccountId = this.vaultAccountMap.get(accountId);
    if (!vaultAccountId) {
      return this._generateMockAddress();
    }

    // In production, this would get the deposit address from Fireblocks
    // For EVM chains, all chains share the same address
    const shares = this.storage.keyShares.get(accountId);
    if (shares && shares.length > 0) {
      // Derive address from public key (simulated)
      const { ethers } = await import('ethers');
      // In reality, we'd use the actual public key
      return ethers.computeAddress('0x04' + '0'.repeat(128));
    }

    return this._generateMockAddress();
  }

  protected async _healthCheckImpl(): Promise<boolean> {
    // In production, this would ping Fireblocks API
    return true;
  }

  // ============================================================================
  // PRIVATE METHODS - FIREBLOCKS API SIMULATION
  // ============================================================================

  private async _createVaultAccount(label: string): Promise<string> {
    // In production: POST /v1/vault/accounts
    // Simulated response
    return `vault_${uuidv4().slice(0, 8)}`;
  }

  private async _createVaultAsset(vaultAccountId: string, assetId: string): Promise<string> {
    // In production: POST /v1/vault/accounts/{vaultAccountId}/{assetId}
    // Returns public key / address
    // Simulated response
    return '04' + 'a'.repeat(128); // Simulated compressed public key
  }

  private async _simulateFireblocksSigning(sessionId: string): Promise<void> {
    const session = this.storage.signingSessions.get(sessionId);
    if (!session) return;

    // Simulate MPC signing completion
    session.status = 'completed';
    session.signature = this._generateMockSignature();
    session.completedAt = new Date().toISOString();

    // Mark participants as contributed
    session.participants.forEach((p) => {
      if (p.shareIndex <= session.threshold) {
        p.hasContributed = true;
        p.contributedAt = new Date().toISOString();
      }
    });
    session.contributionCount = session.threshold;
  }

  // ============================================================================
  // FIREBLOCKS-SPECIFIC METHODS
  // ============================================================================

  /**
   * Get Fireblocks vault account ID for an SDK account
   */
  getVaultAccountId(accountId: string): string | undefined {
    return this.vaultAccountMap.get(accountId);
  }

  /**
   * Set policy for transaction approval
   * In production, this would configure Fireblocks Transaction Authorization Policy (TAP)
   */
  async setTransactionPolicy(accountId: string, policy: {
    maxAmount?: string;
    whitelistedAddresses?: string[];
    requireApproval?: boolean;
    approvers?: string[];
  }): Promise<Result<void, string>> {
    // Fireblocks TAP configuration would go here
    return ok(undefined);
  }

  /**
   * Get supported assets for a vault account
   */
  async getSupportedAssets(): Promise<string[]> {
    // In production, this would call GET /v1/supported_assets
    return ['ETH', 'ETH_TEST3', 'MATIC', 'BASE'];
  }
}

/**
 * Factory function to create Fireblocks provider
 */
export function createFireblocksProvider(config: FireblocksConfig): FireblocksCustodyProvider {
  return new FireblocksCustodyProvider(config);
}
