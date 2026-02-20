/**
 * Web3AuthCustodyProvider - Web3Auth MPC Integration
 *
 * Integrates with Web3Auth's MPC Core Kit for non-custodial key management.
 * Web3Auth uses a 2-of-3 threshold scheme with social login recovery.
 *
 * Features:
 * - Social login integration (Google, Apple, Discord, etc.)
 * - Non-custodial (user retains full control)
 * - Device-based key shares
 * - Recovery via social accounts
 *
 * @see https://web3auth.io/docs/
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '../../../core/types.js';
import { ok, err } from '../../../core/types.js';
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
 * Web3Auth-specific configuration
 */
export interface Web3AuthConfig extends MPCProviderConfig {
  /** Web3Auth Client ID */
  clientId: string;
  /** Web3Auth network */
  network: 'mainnet' | 'testnet' | 'cyan' | 'aqua';
  /** Chain configuration */
  chainConfig?: {
    chainNamespace: 'eip155' | 'solana';
    chainId: string;
    rpcTarget: string;
    displayName?: string;
    blockExplorer?: string;
    ticker?: string;
    tickerName?: string;
  };
  /** Login providers to enable */
  loginProviders?: ('google' | 'apple' | 'discord' | 'twitter' | 'email' | 'sms')[];
  /** Storage for device share */
  storageType?: 'local' | 'session' | 'memory';
  /** Redirect URL after login */
  redirectUrl?: string;
}

/**
 * Web3Auth user info
 */
interface Web3AuthUserInfo {
  email?: string;
  name?: string;
  profileImage?: string;
  verifier: string;
  verifierId: string;
  aggregateVerifier?: string;
  idToken?: string;
}

/**
 * Web3AuthCustodyProvider - Web3Auth MPC Integration
 *
 * @example
 * ```typescript
 * const web3Auth = new Web3AuthCustodyProvider({
 *   clientId: 'YOUR_WEB3AUTH_CLIENT_ID',
 *   network: 'mainnet',
 *   chainConfig: {
 *     chainNamespace: 'eip155',
 *     chainId: '0x2105', // Base
 *     rpcTarget: 'https://mainnet.base.org',
 *   },
 *   loginProviders: ['google', 'apple', 'email'],
 * });
 *
 * // Create account (user logs in with social)
 * const account = await web3Auth.createAccount({
 *   ownerId: 'user-123',
 *   label: 'Main Wallet',
 * });
 *
 * // Keys are generated after social login
 * await web3Auth.generateKeyShares({
 *   accountId: account.data.accountId,
 *   totalShares: 3,
 *   threshold: 2,
 * });
 *
 * // Get signer
 * const signer = await web3Auth.createSigner(account.data.accountId, 8453);
 * ```
 */
export class Web3AuthCustodyProvider extends AbstractMPCProvider {
  readonly providerId = 'web3auth';
  readonly providerName = 'Web3Auth MPC';

  private web3AuthConfig: Web3AuthConfig;
  private coreKitInstance: any = null;
  private userInfoMap: Map<string, Web3AuthUserInfo> = new Map();
  private deviceShareMap: Map<string, string> = new Map(); // accountId -> deviceShare

  constructor(config: Web3AuthConfig) {
    super(config);
    this.web3AuthConfig = config;
  }

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  getCapabilities(): MPCProviderCapabilities {
    return {
      supportedSchemes: ['2-of-3', '2-of-4'], // Standard and with recovery
      maxShares: 4,
      supportsClientMPC: true, // Client holds device share
      supportsHSM: false,
      supportsKeyRefresh: true,
      supportedAlgorithms: ['ECDSA'],
      supportedCurves: ['secp256k1', 'ed25519'],
      supportsTypedData: true,
      avgSigningLatencyMs: 500, // Very fast - local + network share
    };
  }

  // ============================================================================
  // KEY SHARE IMPLEMENTATION
  // ============================================================================

  protected async _generateKeySharesImpl(
    params: MPCKeyGenParams
  ): Promise<Result<MPCKeyShare[], string>> {
    // Web3Auth uses 2-of-3 or 2-of-4 with optional recovery share
    if (params.totalShares < 3 || params.totalShares > 4) {
      return err('Web3Auth supports 3 or 4 shares (2-of-3 or 2-of-4 threshold)');
    }

    try {
      // Initialize MPC Core Kit if not done
      await this._initCoreKit();

      // In production, this is triggered after user login
      // The key generation is distributed across:
      // 1. Web3Auth network (managed share)
      // 2. User device (device share - stored locally)
      // 3. Social backup (recovery share - encrypted with social login)

      const publicKey = await this._generateKeys(params.accountId);

      const shares: MPCKeyShare[] = [
        {
          shareId: `${params.accountId}_network_share`,
          accountId: params.accountId,
          shareIndex: 1,
          totalShares: params.totalShares,
          threshold: 2,
          publicKey,
          holder: {
            id: 'web3auth_network',
            type: 'server',
            name: 'Web3Auth Network',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        },
        {
          shareId: `${params.accountId}_device_share`,
          accountId: params.accountId,
          shareIndex: 2,
          totalShares: params.totalShares,
          threshold: 2,
          publicKey,
          holder: {
            id: 'user_device',
            type: 'client',
            name: 'User Device',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        },
        {
          shareId: `${params.accountId}_recovery_share`,
          accountId: params.accountId,
          shareIndex: 3,
          totalShares: params.totalShares,
          threshold: 2,
          publicKey,
          holder: {
            id: 'social_recovery',
            type: 'backup',
            name: 'Social Recovery',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        },
      ];

      // Add optional 4th share for enhanced security
      if (params.totalShares === 4) {
        shares.push({
          shareId: `${params.accountId}_security_questions`,
          accountId: params.accountId,
          shareIndex: 4,
          totalShares: params.totalShares,
          threshold: 2,
          publicKey,
          holder: {
            id: 'security_questions',
            type: 'backup',
            name: 'Security Questions',
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        });
      }

      return ok(shares);
    } catch (error) {
      return err(`Web3Auth key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async _refreshKeySharesImpl(
    accountId: string,
    params: { totalShares: number; threshold: number }
  ): Promise<Result<MPCKeyShare[], string>> {
    // Web3Auth supports share refresh via MPC Core Kit
    const shares = this.storage.keyShares.get(accountId);
    if (!shares) {
      return err('No existing shares to refresh');
    }

    // In production: await this.coreKitInstance.refreshShares();

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
    const deviceShare = this.deviceShareMap.get(session.accountId);
    if (!deviceShare) {
      session.status = 'failed';
      session.error = 'Device share not found. User must be logged in.';
      return;
    }

    try {
      session.status = 'collecting';

      // Web3Auth signing is typically instant since device share is local
      // and network share is fetched from Web3Auth nodes
      setTimeout(async () => {
        await this._executeWeb3AuthSigning(session, request);
      }, this.web3AuthConfig.debug ? 50 : 300);

    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  protected async _getSigningStatusImpl(
    sessionId: string
  ): Promise<Result<Partial<MPCSigningSession>, string>> {
    // Web3Auth signing is near-instant, use local state
    return ok({});
  }

  // ============================================================================
  // PROTECTED HELPERS
  // ============================================================================

  protected async _deriveAddress(accountId: string, chainId: number): Promise<string> {
    const shares = this.storage.keyShares.get(accountId);
    if (!shares || shares.length === 0) {
      return this._generateMockAddress();
    }

    // In production, this would use the actual public key from MPC Core Kit
    // await this.coreKitInstance.getPublicKey()
    return this._generateMockAddress();
  }

  protected async _healthCheckImpl(): Promise<boolean> {
    try {
      await this._initCoreKit();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // PRIVATE METHODS - WEB3AUTH SIMULATION
  // ============================================================================

  private async _initCoreKit(): Promise<void> {
    if (this.coreKitInstance) return;

    // In production:
    // const coreKitInstance = new Web3AuthMPCCoreKit({
    //   web3AuthClientId: this.web3AuthConfig.clientId,
    //   web3AuthNetwork: this.web3AuthConfig.network,
    //   storage: new StorageType(),
    //   chainConfig: this.web3AuthConfig.chainConfig,
    // });
    // await coreKitInstance.init();

    // Simulated instance
    this.coreKitInstance = {
      initialized: true,
      network: this.web3AuthConfig.network,
    };
  }

  private async _generateKeys(accountId: string): Promise<string> {
    // In production, this happens after user login:
    // await this.coreKitInstance.loginWithOauth({ verifier, idToken });
    // or
    // await this.coreKitInstance.loginWithJWT({ verifier, idToken });

    // Store simulated device share
    const deviceShare = `device_share_${uuidv4().slice(0, 16)}`;
    this.deviceShareMap.set(accountId, deviceShare);

    // Return simulated public key
    return '04' + 'c'.repeat(128);
  }

  private async _executeWeb3AuthSigning(
    session: MPCSigningSession,
    request: MPCSigningSessionRequest
  ): Promise<void> {
    try {
      // In production:
      // const signature = await this.coreKitInstance.sign(
      //   Buffer.from(session.messageHash.slice(2), 'hex')
      // );

      session.status = 'signing';

      // Mark device and network shares as contributed
      const deviceParticipant = session.participants.find(p => p.holderId === 'user_device');
      const networkParticipant = session.participants.find(p => p.holderId === 'web3auth_network');

      if (deviceParticipant) {
        deviceParticipant.hasContributed = true;
        deviceParticipant.contributedAt = new Date().toISOString();
      }
      if (networkParticipant) {
        networkParticipant.hasContributed = true;
        networkParticipant.contributedAt = new Date().toISOString();
      }
      session.contributionCount = 2;

      // Complete signing
      session.status = 'completed';
      session.signature = this._generateMockSignature();
      session.completedAt = new Date().toISOString();

    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Signing failed';
    }
  }

  // ============================================================================
  // WEB3AUTH-SPECIFIC METHODS
  // ============================================================================

  /**
   * Initiate login with social provider
   *
   * In a real application, this would open a popup or redirect for OAuth.
   */
  async loginWithSocial(
    accountId: string,
    provider: 'google' | 'apple' | 'discord' | 'twitter' | 'email' | 'sms',
    options?: { email?: string; phone?: string }
  ): Promise<Result<Web3AuthUserInfo, string>> {
    try {
      await this._initCoreKit();

      // In production:
      // await this.coreKitInstance.loginWithOauth({
      //   verifier: provider,
      //   idToken: await getIdTokenFromProvider(provider),
      // });

      // Simulated user info
      const userInfo: Web3AuthUserInfo = {
        verifier: provider,
        verifierId: options?.email || `user_${uuidv4().slice(0, 8)}`,
        email: options?.email,
        name: 'Test User',
      };

      this.userInfoMap.set(accountId, userInfo);

      return ok(userInfo);
    } catch (error) {
      return err(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get logged in user info
   */
  getUserInfo(accountId: string): Web3AuthUserInfo | undefined {
    return this.userInfoMap.get(accountId);
  }

  /**
   * Setup recovery share with security questions
   */
  async setupSecurityQuestions(
    accountId: string,
    questions: Array<{ question: string; answer: string }>
  ): Promise<Result<void, string>> {
    const shares = this.storage.keyShares.get(accountId);
    if (!shares) {
      return err('No key shares found. Generate keys first.');
    }

    // In production:
    // await this.coreKitInstance.addSecurityQuestions(questions);

    // Mark security questions share as active
    const sqShare = shares.find(s => s.holder.id === 'security_questions');
    if (sqShare) {
      sqShare.isActive = true;
    }

    return ok(undefined);
  }

  /**
   * Recover account using security questions
   */
  async recoverWithSecurityQuestions(
    accountId: string,
    answers: Array<{ question: string; answer: string }>
  ): Promise<Result<void, string>> {
    // In production:
    // await this.coreKitInstance.recoverWithSecurityQuestions(answers);

    return ok(undefined);
  }

  /**
   * Export device share for backup
   * WARNING: This exposes sensitive material. Use with caution.
   */
  async exportDeviceShare(accountId: string): Promise<Result<string, string>> {
    const deviceShare = this.deviceShareMap.get(accountId);
    if (!deviceShare) {
      return err('Device share not found');
    }

    // In production, this would export the actual share
    // return ok(await this.coreKitInstance.exportBackupKey());

    return ok(deviceShare);
  }

  /**
   * Import device share (for device migration)
   */
  async importDeviceShare(accountId: string, shareData: string): Promise<Result<void, string>> {
    // In production:
    // await this.coreKitInstance.importBackupKey(shareData);

    this.deviceShareMap.set(accountId, shareData);
    return ok(undefined);
  }

  /**
   * Logout and clear session
   */
  async logout(accountId: string): Promise<void> {
    // In production:
    // await this.coreKitInstance.logout();

    this.userInfoMap.delete(accountId);
    // Note: device share is NOT deleted - it persists for re-login
  }

  /**
   * Enable MFA for additional security
   */
  async enableMFA(accountId: string, type: 'totp' | 'sms'): Promise<Result<{ secret?: string }, string>> {
    // In production:
    // const result = await this.coreKitInstance.enableMFA(type);

    return ok({ secret: type === 'totp' ? 'JBSWY3DPEHPK3PXP' : undefined });
  }
}

/**
 * Factory function to create Web3Auth provider
 */
export function createWeb3AuthProvider(config: Web3AuthConfig): Web3AuthCustodyProvider {
  return new Web3AuthCustodyProvider(config);
}
