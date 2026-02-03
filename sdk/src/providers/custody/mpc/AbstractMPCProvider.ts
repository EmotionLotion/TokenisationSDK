/**
 * AbstractMPCProvider - Base Class for MPC Providers
 *
 * Provides shared functionality for MPC custody implementations:
 * - Account management
 * - Key share tracking
 * - Signing session management
 * - ethers.js Signer creation
 *
 * Extend this class to implement specific MPC backends (Fireblocks, Lit, Web3Auth).
 */

import { v4 as uuidv4 } from 'uuid';
import type { Signer, Provider } from 'ethers';
import type { Result } from '../../../core/types.js';
import { ok, err } from '../../../core/types.js';
import type {
  CustodyArrangementType,
  CustodyAccount,
  SigningRequest,
  SignedTransaction,
} from '../../../core/interfaces.providers.js';
import type {
  IMPCProvider,
  MPCKeyShare,
  MPCKeyGenParams,
  MPCSigningSession,
  MPCSigningSessionRequest,
  MPCProviderCapabilities,
  MPCProviderConfig,
  TypedData,
} from './IMPCProvider.js';
import { MPCSigner, type MPCSignerConfig } from './MPCSigner.js';

/**
 * In-memory storage for MPC provider state
 */
interface MPCStorage {
  accounts: Map<string, CustodyAccount>;
  keyShares: Map<string, MPCKeyShare[]>; // accountId -> shares
  signingSessions: Map<string, MPCSigningSession>;
  signingRequests: Map<string, {
    request: SigningRequest;
    status: 'pending' | 'approved' | 'rejected' | 'signed' | 'expired';
    signedTransaction?: SignedTransaction;
    rejectionReason?: string;
    sessionId?: string;
  }>;
}

/**
 * AbstractMPCProvider - Base implementation for MPC custody providers
 *
 * Subclasses must implement:
 * - _generateKeySharesImpl() - Provider-specific key generation
 * - _initiateSigningImpl() - Provider-specific signing initiation
 * - _getSigningStatusImpl() - Provider-specific status checking
 *
 * @example
 * ```typescript
 * class MyMPCProvider extends AbstractMPCProvider {
 *   protected async _generateKeySharesImpl(params) { ... }
 *   protected async _initiateSigningImpl(session) { ... }
 *   protected async _getSigningStatusImpl(sessionId) { ... }
 * }
 * ```
 */
export abstract class AbstractMPCProvider implements IMPCProvider {
  abstract readonly providerId: string;
  abstract readonly providerName: string;
  readonly custodyType: CustodyArrangementType = 'mpc';

  protected storage: MPCStorage = {
    accounts: new Map(),
    keyShares: new Map(),
    signingSessions: new Map(),
    signingRequests: new Map(),
  };

  protected config: MPCProviderConfig;
  protected ethersProvider: Provider | null = null;

  constructor(config: MPCProviderConfig = {}) {
    this.config = config;
  }

  /**
   * Set ethers provider for signer creation
   */
  setEthersProvider(provider: Provider): void {
    this.ethersProvider = provider;
  }

  // ============================================================================
  // ICustodyProvider IMPLEMENTATION
  // ============================================================================

  async createAccount(params: {
    ownerId: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<CustodyAccount, string>> {
    const accountId = `mpc_${uuidv4().slice(0, 8)}`;

    const account: CustodyAccount = {
      accountId,
      custodyType: this.custodyType,
      providerName: this.providerName,
      addresses: [], // Will be populated after key generation
      canSign: false, // Will be true after key generation
      isActive: true,
      metadata: {
        ...params.metadata,
        ownerId: params.ownerId,
        label: params.label,
        createdAt: new Date().toISOString(),
      },
    };

    this.storage.accounts.set(accountId, account);

    return ok(account);
  }

  async getAccount(accountId: string): Promise<Result<CustodyAccount, string>> {
    const account = this.storage.accounts.get(accountId);
    if (!account) {
      return err(`Account not found: ${accountId}`);
    }
    return ok(account);
  }

  async listAccounts(ownerId: string): Promise<Result<CustodyAccount[], string>> {
    const accounts = Array.from(this.storage.accounts.values()).filter(
      (acc) => (acc.metadata as Record<string, unknown>)?.ownerId === ownerId
    );
    return ok(accounts);
  }

  async generateAddress(accountId: string, chainId: number): Promise<Result<string, string>> {
    const account = this.storage.accounts.get(accountId);
    if (!account) {
      return err(`Account not found: ${accountId}`);
    }

    const keyShares = this.storage.keyShares.get(accountId);
    if (!keyShares || keyShares.length === 0) {
      return err('No key shares generated. Call generateKeyShares first.');
    }

    // In MPC, the address is derived from the combined public key
    // For most implementations, the address is the same across all EVM chains
    const address = await this._deriveAddress(accountId, chainId);

    if (!account.addresses.includes(address)) {
      account.addresses.push(address);
    }

    return ok(address);
  }

  async requestSigning(request: SigningRequest): Promise<Result<{ requestId: string }, string>> {
    const account = this.storage.accounts.get(request.accountId);
    if (!account) {
      return err(`Account not found: ${request.accountId}`);
    }

    if (!account.canSign) {
      return err('Account cannot sign. Ensure key shares are generated.');
    }

    const requestId = `sign_${uuidv4().slice(0, 8)}`;

    // Create signing session
    const sessionResult = await this.initiateSigningSession({
      accountId: request.accountId,
      messageHash: request.transactionData,
      expiresAt: request.expiresAt,
    });

    if (!sessionResult.success) {
      return err(`Failed to initiate signing: ${sessionResult.error}`);
    }

    this.storage.signingRequests.set(requestId, {
      request,
      status: 'pending',
      sessionId: sessionResult.value.sessionId,
    });

    return ok({ requestId });
  }

  async getSigningStatus(requestId: string): Promise<Result<{
    status: 'pending' | 'approved' | 'rejected' | 'signed' | 'expired';
    signedTransaction?: SignedTransaction;
    rejectionReason?: string;
  }, string>> {
    const signingRequest = this.storage.signingRequests.get(requestId);
    if (!signingRequest) {
      return err(`Signing request not found: ${requestId}`);
    }

    // If we have a session, check its status
    if (signingRequest.sessionId) {
      const sessionResult = await this.getSigningSession(signingRequest.sessionId);
      if (sessionResult.success) {
        const session = sessionResult.value;

        switch (session.status) {
          case 'completed':
            signingRequest.status = 'signed';
            signingRequest.signedTransaction = {
              requestId,
              signature: session.signature!,
              signedAt: session.completedAt || new Date().toISOString(),
              signers: session.participants
                .filter((p) => p.hasContributed)
                .map((p) => p.holderId),
            };
            break;
          case 'failed':
            signingRequest.status = 'rejected';
            signingRequest.rejectionReason = session.error;
            break;
          case 'expired':
            signingRequest.status = 'expired';
            break;
          case 'cancelled':
            signingRequest.status = 'rejected';
            signingRequest.rejectionReason = 'Signing was cancelled';
            break;
        }
      }
    }

    return ok({
      status: signingRequest.status,
      signedTransaction: signingRequest.signedTransaction,
      rejectionReason: signingRequest.rejectionReason,
    });
  }

  async healthCheck(): Promise<boolean> {
    return this._healthCheckImpl();
  }

  // ============================================================================
  // IMPCProvider - KEY SHARE MANAGEMENT
  // ============================================================================

  async generateKeyShares(params: MPCKeyGenParams): Promise<Result<MPCKeyShare[], string>> {
    const account = this.storage.accounts.get(params.accountId);
    if (!account) {
      return err(`Account not found: ${params.accountId}`);
    }

    // Validate threshold
    if (params.threshold > params.totalShares) {
      return err('Threshold cannot exceed total shares');
    }
    if (params.threshold < 1) {
      return err('Threshold must be at least 1');
    }

    // Provider-specific key generation
    const result = await this._generateKeySharesImpl(params);
    if (!result.success) {
      return result;
    }

    // Store shares
    this.storage.keyShares.set(params.accountId, result.value);

    // Update account status
    account.canSign = true;

    // Generate address
    const address = await this._deriveAddress(params.accountId, 1);
    if (!account.addresses.includes(address)) {
      account.addresses.push(address);
    }

    return result;
  }

  async getKeyShares(accountId: string): Promise<Result<MPCKeyShare[], string>> {
    const shares = this.storage.keyShares.get(accountId);
    if (!shares) {
      return err(`No key shares found for account: ${accountId}`);
    }
    return ok(shares);
  }

  async refreshKeyShares(accountId: string): Promise<Result<MPCKeyShare[], string>> {
    const existingShares = this.storage.keyShares.get(accountId);
    if (!existingShares || existingShares.length === 0) {
      return err('No existing key shares to refresh');
    }

    const firstShare = existingShares[0];
    return this._refreshKeySharesImpl(accountId, {
      totalShares: firstShare.totalShares,
      threshold: firstShare.threshold,
    });
  }

  async deactivateKeyShare(shareId: string, reason: string): Promise<Result<void, string>> {
    for (const [accountId, shares] of this.storage.keyShares) {
      const share = shares.find((s) => s.shareId === shareId);
      if (share) {
        share.isActive = false;
        (share as any).deactivatedAt = new Date().toISOString();
        (share as any).deactivationReason = reason;
        return ok(undefined);
      }
    }
    return err(`Key share not found: ${shareId}`);
  }

  // ============================================================================
  // IMPCProvider - SIGNING SESSIONS
  // ============================================================================

  async initiateSigningSession(
    request: MPCSigningSessionRequest
  ): Promise<Result<MPCSigningSession, string>> {
    const account = this.storage.accounts.get(request.accountId);
    if (!account) {
      return err(`Account not found: ${request.accountId}`);
    }

    const keyShares = this.storage.keyShares.get(request.accountId);
    if (!keyShares || keyShares.length === 0) {
      return err('No key shares available for signing');
    }

    const activeShares = keyShares.filter((s) => s.isActive);
    const threshold = activeShares[0]?.threshold || 2;

    if (activeShares.length < threshold) {
      return err(`Insufficient active shares. Need ${threshold}, have ${activeShares.length}`);
    }

    const sessionId = `sess_${uuidv4().slice(0, 12)}`;
    const expiresAt = request.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const session: MPCSigningSession = {
      sessionId,
      accountId: request.accountId,
      status: 'initiated',
      messageHash: request.messageHash,
      threshold,
      contributionCount: 0,
      participants: activeShares.map((share) => ({
        holderId: share.holder.id,
        shareIndex: share.shareIndex,
        hasContributed: false,
      })),
      createdAt: new Date().toISOString(),
      expiresAt,
    };

    this.storage.signingSessions.set(sessionId, session);

    // Start provider-specific signing process
    this._initiateSigningImpl(session, request).catch((error) => {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Unknown error';
    });

    return ok(session);
  }

  async getSigningSession(sessionId: string): Promise<Result<MPCSigningSession, string>> {
    const session = this.storage.signingSessions.get(sessionId);
    if (!session) {
      return err(`Signing session not found: ${sessionId}`);
    }

    // Check expiry
    if (session.status !== 'completed' && session.status !== 'failed') {
      if (new Date(session.expiresAt) < new Date()) {
        session.status = 'expired';
      }
    }

    // Get latest status from provider
    const statusResult = await this._getSigningStatusImpl(sessionId);
    if (statusResult.success) {
      Object.assign(session, statusResult.value);
    }

    return ok(session);
  }

  async cancelSigningSession(sessionId: string): Promise<Result<void, string>> {
    const session = this.storage.signingSessions.get(sessionId);
    if (!session) {
      return err(`Signing session not found: ${sessionId}`);
    }

    if (session.status === 'completed' || session.status === 'failed') {
      return err('Cannot cancel completed or failed session');
    }

    session.status = 'cancelled';
    return ok(undefined);
  }

  async submitPartialSignature(
    sessionId: string,
    holderId: string,
    partialSignature: string
  ): Promise<Result<MPCSigningSession, string>> {
    const session = this.storage.signingSessions.get(sessionId);
    if (!session) {
      return err(`Signing session not found: ${sessionId}`);
    }

    if (session.status !== 'initiated' && session.status !== 'collecting') {
      return err(`Cannot submit to session in status: ${session.status}`);
    }

    const participant = session.participants.find((p) => p.holderId === holderId);
    if (!participant) {
      return err(`Participant not found: ${holderId}`);
    }

    if (participant.hasContributed) {
      return err('Participant has already contributed');
    }

    participant.hasContributed = true;
    participant.contributedAt = new Date().toISOString();
    session.contributionCount++;
    session.status = 'collecting';

    // Check if threshold reached
    if (session.contributionCount >= session.threshold) {
      session.status = 'signing';
      // Provider-specific signature combination will be called
    }

    return ok(session);
  }

  // ============================================================================
  // IMPCProvider - EIP-712 SIGNING
  // ============================================================================

  async signTypedData(
    accountId: string,
    typedData: TypedData
  ): Promise<Result<{ signature: string; sessionId?: string }, string>> {
    // Hash the typed data
    const messageHash = this._hashTypedData(typedData);

    // Initiate signing session
    const sessionResult = await this.initiateSigningSession({
      accountId,
      messageHash,
      metadata: {
        type: 'typed_data',
        domain: typedData.domain,
        primaryType: typedData.primaryType,
      },
    });

    if (!sessionResult.success) {
      return err(`Failed to initiate signing: ${sessionResult.error}`);
    }

    return ok({
      signature: '', // Will be populated when session completes
      sessionId: sessionResult.value.sessionId,
    });
  }

  async signMessage(
    accountId: string,
    message: string | Uint8Array
  ): Promise<Result<{ signature: string; sessionId?: string }, string>> {
    // Hash the message
    const messageHash = this._hashMessage(message);

    // Initiate signing session
    const sessionResult = await this.initiateSigningSession({
      accountId,
      messageHash,
      metadata: {
        type: 'personal_sign',
        messagePreview: typeof message === 'string' ? message.slice(0, 100) : '(binary)',
      },
    });

    if (!sessionResult.success) {
      return err(`Failed to initiate signing: ${sessionResult.error}`);
    }

    return ok({
      signature: '', // Will be populated when session completes
      sessionId: sessionResult.value.sessionId,
    });
  }

  // ============================================================================
  // IMPCProvider - ETHERS.JS INTEGRATION
  // ============================================================================

  async createSigner(
    accountId: string,
    chainId: number,
    options?: MPCSignerConfig & { provider?: Provider }
  ): Promise<Result<Signer, string>> {
    const account = this.storage.accounts.get(accountId);
    if (!account) {
      return err(`Account not found: ${accountId}`);
    }

    if (!account.canSign) {
      return err('Account cannot sign. Ensure key shares are generated.');
    }

    const provider = options?.provider || this.ethersProvider;
    const signer = new MPCSigner(this, accountId, chainId, provider, options);

    return ok(signer);
  }

  // ============================================================================
  // IMPCProvider - CAPABILITIES
  // ============================================================================

  abstract getCapabilities(): MPCProviderCapabilities;

  // ============================================================================
  // ABSTRACT METHODS (to be implemented by subclasses)
  // ============================================================================

  /**
   * Provider-specific key share generation
   */
  protected abstract _generateKeySharesImpl(
    params: MPCKeyGenParams
  ): Promise<Result<MPCKeyShare[], string>>;

  /**
   * Provider-specific key share refresh
   */
  protected abstract _refreshKeySharesImpl(
    accountId: string,
    params: { totalShares: number; threshold: number }
  ): Promise<Result<MPCKeyShare[], string>>;

  /**
   * Provider-specific signing initiation
   */
  protected abstract _initiateSigningImpl(
    session: MPCSigningSession,
    request: MPCSigningSessionRequest
  ): Promise<void>;

  /**
   * Provider-specific signing status check
   */
  protected abstract _getSigningStatusImpl(
    sessionId: string
  ): Promise<Result<Partial<MPCSigningSession>, string>>;

  /**
   * Provider-specific health check
   */
  protected abstract _healthCheckImpl(): Promise<boolean>;

  /**
   * Derive address from MPC public key
   */
  protected abstract _deriveAddress(
    accountId: string,
    chainId: number
  ): Promise<string>;

  // ============================================================================
  // PROTECTED HELPERS
  // ============================================================================

  /**
   * Hash typed data (EIP-712)
   */
  protected _hashTypedData(typedData: TypedData): string {
    // Simplified EIP-712 hash - real implementation would use full encoding
    const { ethers } = require('ethers');
    const domainSeparator = ethers.TypedDataEncoder.hashDomain(typedData.domain);
    const messageHash = ethers.TypedDataEncoder.hashStruct(
      typedData.primaryType,
      typedData.types,
      typedData.message
    );
    return ethers.keccak256(
      ethers.concat(['0x1901', domainSeparator, messageHash])
    );
  }

  /**
   * Hash message (EIP-191)
   */
  protected _hashMessage(message: string | Uint8Array): string {
    const { hashMessage } = require('ethers');
    return hashMessage(message);
  }

  /**
   * Generate a mock address for testing
   */
  protected _generateMockAddress(): string {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  }

  /**
   * Generate a mock signature for testing
   */
  protected _generateMockSignature(): string {
    const chars = '0123456789abcdef';
    let sig = '0x';
    for (let i = 0; i < 130; i++) {
      sig += chars[Math.floor(Math.random() * chars.length)];
    }
    return sig;
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Reset all storage (for testing)
   */
  reset(): void {
    this.storage.accounts.clear();
    this.storage.keyShares.clear();
    this.storage.signingSessions.clear();
    this.storage.signingRequests.clear();
  }

  /**
   * Force complete a signing session (for testing)
   */
  forceCompleteSession(sessionId: string, signature: string): void {
    const session = this.storage.signingSessions.get(sessionId);
    if (session) {
      session.status = 'completed';
      session.signature = signature;
      session.completedAt = new Date().toISOString();
    }
  }
}
