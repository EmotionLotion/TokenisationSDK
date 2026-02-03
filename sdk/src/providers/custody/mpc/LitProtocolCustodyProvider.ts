/**
 * LitProtocolCustodyProvider - Lit Protocol MPC Integration
 *
 * Integrates with Lit Protocol's decentralized MPC network.
 * Lit uses Programmable Key Pairs (PKPs) with threshold BLS signatures
 * and supports custom Lit Actions for programmable signing conditions.
 *
 * Features:
 * - Decentralized MPC network (no single point of failure)
 * - Programmable signing conditions via Lit Actions
 * - NFT-based key ownership (PKP NFTs)
 * - Cross-chain support
 *
 * @see https://developer.litprotocol.com/
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
 * Lit Protocol-specific configuration
 */
export interface LitProtocolConfig extends MPCProviderConfig {
  /** Lit network to use */
  network: 'cayenne' | 'manzano' | 'habanero' | 'custom';
  /** Custom Lit network URL (if network is 'custom') */
  litNodeUrl?: string;
  /** Authentication method for PKP access */
  authMethod?: {
    authMethodType: number;
    accessToken: string;
  };
  /** Wallet for PKP minting */
  mintingWallet?: {
    privateKey?: string;
    provider?: string;
  };
  /** Default Lit Action for signing conditions */
  defaultLitAction?: string;
}

/**
 * PKP (Programmable Key Pair) information
 */
interface PKPInfo {
  tokenId: string;
  publicKey: string;
  ethAddress: string;
}

/**
 * LitProtocolCustodyProvider - Lit Protocol MPC Integration
 *
 * @example
 * ```typescript
 * const lit = new LitProtocolCustodyProvider({
 *   network: 'cayenne', // Testnet
 *   authMethod: {
 *     authMethodType: 1, // Wallet signature
 *     accessToken: await signAuthMessage(),
 *   },
 * });
 *
 * // Create account (mints PKP NFT)
 * const account = await lit.createAccount({
 *   ownerId: 'user-123',
 *   label: 'Main Wallet',
 * });
 *
 * // Generate keys (distributed across Lit nodes)
 * await lit.generateKeyShares({
 *   accountId: account.value.accountId,
 *   totalShares: 30, // Lit uses 2/3 of 30 nodes
 *   threshold: 20,
 * });
 *
 * // Get signer
 * const signer = await lit.createSigner(account.value.accountId, 8453);
 * ```
 */
export class LitProtocolCustodyProvider extends AbstractMPCProvider {
  readonly providerId = 'lit-protocol';
  readonly providerName = 'Lit Protocol';

  private litConfig: LitProtocolConfig;
  private pkpMap: Map<string, PKPInfo> = new Map(); // accountId -> PKP
  private litClient: any = null; // LitNodeClient instance

  constructor(config: LitProtocolConfig) {
    super(config);
    this.litConfig = config;
  }

  // ============================================================================
  // CAPABILITIES
  // ============================================================================

  getCapabilities(): MPCProviderCapabilities {
    return {
      supportedSchemes: ['20-of-30', '2-of-3'], // Lit uses ~2/3 threshold
      maxShares: 30,
      supportsClientMPC: true, // Client-side Lit Actions
      supportsHSM: false,
      supportsKeyRefresh: true,
      supportedAlgorithms: ['ECDSA'],
      supportedCurves: ['secp256k1'],
      supportsTypedData: true,
      avgSigningLatencyMs: 2000, // ~2 seconds typical
    };
  }

  // ============================================================================
  // KEY SHARE IMPLEMENTATION
  // ============================================================================

  protected async _generateKeySharesImpl(
    params: MPCKeyGenParams
  ): Promise<Result<MPCKeyShare[], string>> {
    try {
      // Initialize Lit client if not already done
      await this._initLitClient();

      // Mint PKP NFT (this generates distributed key shares across Lit nodes)
      const pkp = await this._mintPKP(params.accountId);
      this.pkpMap.set(params.accountId, pkp);

      // Lit's shares are distributed across their node network
      // We represent this as virtual shares for the interface
      const nodeCount = 30; // Typical Lit network size
      const threshold = 20; // 2/3 threshold

      const shares: MPCKeyShare[] = [];

      // Create representative shares for each Lit node
      for (let i = 0; i < Math.min(params.totalShares || 3, 5); i++) {
        shares.push({
          shareId: `${params.accountId}_lit_share_${i + 1}`,
          accountId: params.accountId,
          shareIndex: i + 1,
          totalShares: nodeCount,
          threshold: threshold,
          publicKey: pkp.publicKey,
          holder: {
            id: `lit_node_${i + 1}`,
            type: 'server',
            name: `Lit Network Node ${i + 1}`,
          },
          createdAt: new Date().toISOString(),
          isActive: true,
        });
      }

      return ok(shares);
    } catch (error) {
      return err(`Lit Protocol key generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  protected async _refreshKeySharesImpl(
    accountId: string,
    params: { totalShares: number; threshold: number }
  ): Promise<Result<MPCKeyShare[], string>> {
    // Lit Protocol handles key refresh internally
    // The PKP key remains the same, just the node participation changes
    const shares = this.storage.keyShares.get(accountId);
    if (!shares) {
      return err('No existing shares to refresh');
    }

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
    const pkp = this.pkpMap.get(session.accountId);
    if (!pkp) {
      session.status = 'failed';
      session.error = 'PKP not found';
      return;
    }

    try {
      await this._initLitClient();

      session.status = 'collecting';

      // Execute Lit Action for signing
      // In production, this would call the actual Lit network
      setTimeout(async () => {
        await this._executeLitSigning(session, pkp, request);
      }, this.litConfig.debug ? 100 : 1500);

    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  protected async _getSigningStatusImpl(
    sessionId: string
  ): Promise<Result<Partial<MPCSigningSession>, string>> {
    // Lit signing is typically synchronous within the Lit Action
    // Return empty to use local session state
    return ok({});
  }

  // ============================================================================
  // PROTECTED HELPERS
  // ============================================================================

  protected async _deriveAddress(accountId: string, chainId: number): Promise<string> {
    const pkp = this.pkpMap.get(accountId);
    if (!pkp) {
      return this._generateMockAddress();
    }
    return pkp.ethAddress;
  }

  protected async _healthCheckImpl(): Promise<boolean> {
    try {
      await this._initLitClient();
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // PRIVATE METHODS - LIT PROTOCOL SIMULATION
  // ============================================================================

  private async _initLitClient(): Promise<void> {
    if (this.litClient) return;

    // In production, this would initialize the actual LitNodeClient:
    // const client = new LitNodeClient({
    //   litNetwork: this.litConfig.network,
    //   debug: this.litConfig.debug,
    // });
    // await client.connect();
    // this.litClient = client;

    // Simulated client
    this.litClient = {
      connected: true,
      network: this.litConfig.network,
    };
  }

  private async _mintPKP(label: string): Promise<PKPInfo> {
    // In production, this would mint a PKP NFT:
    // const mintResult = await litContracts.pkpNftContractUtils.write.mint();
    // const pkpInfo = await litContracts.pkpNftContractUtils.read.getPkpInfo(tokenId);

    // Simulated PKP minting
    const tokenId = `lit_pkp_${uuidv4().slice(0, 8)}`;
    const publicKey = '04' + 'b'.repeat(128); // Simulated public key
    const ethAddress = this._generateMockAddress();

    return {
      tokenId,
      publicKey,
      ethAddress,
    };
  }

  private async _executeLitSigning(
    session: MPCSigningSession,
    pkp: PKPInfo,
    request: MPCSigningSessionRequest
  ): Promise<void> {
    try {
      // In production, this would execute a Lit Action:
      // const litActionCode = this.litConfig.defaultLitAction || `
      //   const sigShare = await LitActions.signEcdsa({
      //     toSign: new Uint8Array(Buffer.from(messageHash.slice(2), 'hex')),
      //     publicKey,
      //     sigName: 'sig1',
      //   });
      // `;
      //
      // const signatures = await litClient.executeJs({
      //   code: litActionCode,
      //   jsParams: { messageHash: session.messageHash, publicKey: pkp.publicKey },
      //   sessionSigs,
      // });

      // Simulated signing
      session.status = 'signing';

      // Mark nodes as participating
      const participatingCount = Math.ceil(session.participants.length * 0.7);
      for (let i = 0; i < participatingCount; i++) {
        session.participants[i].hasContributed = true;
        session.participants[i].contributedAt = new Date().toISOString();
      }
      session.contributionCount = participatingCount;

      // Complete signing
      session.status = 'completed';
      session.signature = this._generateMockSignature();
      session.completedAt = new Date().toISOString();

    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Lit Action execution failed';
    }
  }

  // ============================================================================
  // LIT PROTOCOL-SPECIFIC METHODS
  // ============================================================================

  /**
   * Get PKP info for an account
   */
  getPKPInfo(accountId: string): PKPInfo | undefined {
    return this.pkpMap.get(accountId);
  }

  /**
   * Set Lit Action for conditional signing
   *
   * Lit Actions allow programmable signing conditions:
   * - Time-based restrictions
   * - Multi-sig requirements
   * - Token gating
   * - Custom business logic
   */
  async setLitAction(accountId: string, litActionCode: string): Promise<Result<void, string>> {
    const pkp = this.pkpMap.get(accountId);
    if (!pkp) {
      return err('PKP not found for account');
    }

    // In production, this would:
    // 1. Upload Lit Action to IPFS
    // 2. Associate with PKP permissions
    // For now, store locally
    (pkp as any).litAction = litActionCode;

    return ok(undefined);
  }

  /**
   * Add permitted auth method to PKP
   *
   * Auth methods control who can use the PKP:
   * - Wallet signatures
   * - OAuth (Google, Discord)
   * - WebAuthn
   * - Custom
   */
  async addAuthMethod(
    accountId: string,
    authMethod: { type: number; id: string; publicKey?: string }
  ): Promise<Result<void, string>> {
    const pkp = this.pkpMap.get(accountId);
    if (!pkp) {
      return err('PKP not found for account');
    }

    // In production: litContracts.pkpPermissionsContractUtils.write.addPermittedAuthMethod()
    return ok(undefined);
  }

  /**
   * Get session signatures for Lit Actions
   *
   * Session signatures allow temporary access to PKP without re-authenticating.
   */
  async getSessionSigs(accountId: string, resources: string[]): Promise<Result<Record<string, unknown>, string>> {
    const pkp = this.pkpMap.get(accountId);
    if (!pkp) {
      return err('PKP not found for account');
    }

    // In production:
    // const sessionSigs = await litClient.getSessionSigs({
    //   pkpPublicKey: pkp.publicKey,
    //   authMethod: this.litConfig.authMethod,
    //   resources,
    //   chain: 'ethereum',
    // });

    // Simulated session signatures
    return ok({
      sig: 'simulated_session_sig',
      derivedVia: 'web3.eth.personal.sign',
      signedMessage: 'session request',
      address: pkp.ethAddress,
    });
  }

  /**
   * Disconnect from Lit network
   */
  async disconnect(): Promise<void> {
    if (this.litClient) {
      // In production: await this.litClient.disconnect();
      this.litClient = null;
    }
  }
}

/**
 * Factory function to create Lit Protocol provider
 */
export function createLitProtocolProvider(config: LitProtocolConfig): LitProtocolCustodyProvider {
  return new LitProtocolCustodyProvider(config);
}
