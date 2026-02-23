/**
 * MockCustodyProvider - Reference Implementation
 *
 * A mock custody provider for testing and demonstration.
 * Partners can use this as a template for building their own
 * integrations with Fireblocks, BitGo, Anchorage, etc.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Result } from '@tokenisation/core';
import { ok, err } from '@tokenisation/core';
import type {
  ICustodyProvider,
  CustodyArrangementType,
  CustodyAccount,
  SigningRequest,
  SignedTransaction,
} from '@tokenisation/core';

/**
 * In-memory storage for mock data
 */
interface MockStorage {
  accounts: Map<string, CustodyAccount>;
  signingRequests: Map<string, {
    request: SigningRequest;
    status: 'pending' | 'approved' | 'rejected' | 'signed' | 'expired';
    signedTransaction?: SignedTransaction;
    rejectionReason?: string;
  }>;
}

/**
 * MockCustodyProvider Configuration
 */
export interface MockCustodyProviderConfig {
  /** Simulated signing delay in ms (default: 100) */
  signingDelay?: number;
  /** Auto-approve signing requests (default: true) */
  autoApprove?: boolean;
  /** Simulate failures for testing (default: false) */
  simulateFailures?: boolean;
  /** Failure rate when simulateFailures is true (0-1, default: 0.1) */
  failureRate?: number;
}

/**
 * MockCustodyProvider - For testing and development
 *
 * @example
 * ```typescript
 * import { MockCustodyProvider } from '@tokenisation/sdk';
 *
 * const custody = new MockCustodyProvider({
 *   autoApprove: true,
 *   signingDelay: 500,
 * });
 *
 * // Register with provider registry
 * providerRegistry.registerCustody(custody, { isDefault: true });
 *
 * // Create an account
 * const result = await custody.createAccount({
 *   ownerId: 'user-123',
 *   label: 'Main Wallet',
 * });
 * ```
 */
export class MockCustodyProvider implements ICustodyProvider {
  readonly providerId = 'mock-custody';
  readonly providerName = 'Mock Custody Provider';
  readonly custodyType: CustodyArrangementType = 'self';

  private storage: MockStorage = {
    accounts: new Map(),
    signingRequests: new Map(),
  };

  private config: Required<MockCustodyProviderConfig>;

  constructor(config: MockCustodyProviderConfig = {}) {
    this.config = {
      signingDelay: config.signingDelay ?? 100,
      autoApprove: config.autoApprove ?? true,
      simulateFailures: config.simulateFailures ?? false,
      failureRate: config.failureRate ?? 0.1,
    };
  }

  /**
   * Create a new custody account
   */
  async createAccount(params: {
    ownerId: string;
    label?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Result<CustodyAccount, string>> {
    if (this.shouldFail()) {
      return err('Simulated failure: Unable to create account');
    }

    const accountId = `acc_${uuidv4().slice(0, 8)}`;
    const address = this.generateMockAddress();

    const account: CustodyAccount = {
      accountId,
      custodyType: this.custodyType,
      providerName: this.providerName,
      addresses: [address],
      canSign: true,
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

  /**
   * Get account details
   */
  async getAccount(accountId: string): Promise<Result<CustodyAccount, string>> {
    const account = this.storage.accounts.get(accountId);

    if (!account) {
      return err(`Account not found: ${accountId}`);
    }

    return ok(account);
  }

  /**
   * List accounts for an owner
   */
  async listAccounts(ownerId: string): Promise<Result<CustodyAccount[], string>> {
    const accounts = Array.from(this.storage.accounts.values()).filter(
      (acc) => (acc.metadata as any)?.ownerId === ownerId
    );

    return ok(accounts);
  }

  /**
   * Generate new address for account
   */
  async generateAddress(accountId: string, _chainId: number): Promise<Result<string, string>> {
    const account = this.storage.accounts.get(accountId);

    if (!account) {
      return err(`Account not found: ${accountId}`);
    }

    const newAddress = this.generateMockAddress();
    account.addresses.push(newAddress);

    return ok(newAddress);
  }

  /**
   * Request transaction signing
   */
  async requestSigning(request: SigningRequest): Promise<Result<{ requestId: string }, string>> {
    const account = this.storage.accounts.get(request.accountId);

    if (!account) {
      return err(`Account not found: ${request.accountId}`);
    }

    if (!account.canSign) {
      return err('Account cannot sign transactions');
    }

    if (!account.isActive) {
      return err('Account is not active');
    }

    const requestId = `sign_${uuidv4().slice(0, 8)}`;

    this.storage.signingRequests.set(requestId, {
      request,
      status: 'pending',
    });

    // Auto-approve if configured
    if (this.config.autoApprove) {
      this.processSigningRequest(requestId);
    }

    return ok({ requestId });
  }

  /**
   * Get signing status
   */
  async getSigningStatus(requestId: string): Promise<Result<{
    status: 'pending' | 'approved' | 'rejected' | 'signed' | 'expired';
    signedTransaction?: SignedTransaction;
    rejectionReason?: string;
  }, string>> {
    const signingRequest = this.storage.signingRequests.get(requestId);

    if (!signingRequest) {
      return err(`Signing request not found: ${requestId}`);
    }

    return ok({
      status: signingRequest.status,
      signedTransaction: signingRequest.signedTransaction,
      rejectionReason: signingRequest.rejectionReason,
    });
  }

  /**
   * Check if provider is available
   */
  async healthCheck(): Promise<boolean> {
    return !this.shouldFail();
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Process a signing request (simulate async signing)
   */
  private async processSigningRequest(requestId: string): Promise<void> {
    await this.delay(this.config.signingDelay);

    const signingRequest = this.storage.signingRequests.get(requestId);
    if (!signingRequest) return;

    if (this.shouldFail()) {
      signingRequest.status = 'rejected';
      signingRequest.rejectionReason = 'Simulated signing failure';
      return;
    }

    // Check expiration
    if (signingRequest.request.expiresAt) {
      const expiresAt = new Date(signingRequest.request.expiresAt);
      if (expiresAt < new Date()) {
        signingRequest.status = 'expired';
        return;
      }
    }

    // Simulate signing
    signingRequest.status = 'signed';
    signingRequest.signedTransaction = {
      requestId,
      signature: this.generateMockSignature(),
      signedAt: new Date().toISOString(),
      signers: [this.generateMockAddress()],
    };
  }

  /**
   * Generate a mock Ethereum address
   */
  private generateMockAddress(): string {
    const chars = '0123456789abcdef';
    let address = '0x';
    for (let i = 0; i < 40; i++) {
      address += chars[Math.floor(Math.random() * chars.length)];
    }
    return address;
  }

  /**
   * Generate a mock signature
   */
  private generateMockSignature(): string {
    const chars = '0123456789abcdef';
    let sig = '0x';
    for (let i = 0; i < 130; i++) {
      sig += chars[Math.floor(Math.random() * chars.length)];
    }
    return sig;
  }

  /**
   * Check if we should simulate a failure
   */
  private shouldFail(): boolean {
    return this.config.simulateFailures && Math.random() < this.config.failureRate;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // TEST HELPERS
  // ============================================================================

  /**
   * Reset all storage (for testing)
   */
  reset(): void {
    this.storage.accounts.clear();
    this.storage.signingRequests.clear();
  }

  /**
   * Manually approve a signing request (for testing)
   */
  approveSigningRequest(requestId: string): void {
    this.processSigningRequest(requestId);
  }

  /**
   * Manually reject a signing request (for testing)
   */
  rejectSigningRequest(requestId: string, reason: string): void {
    const signingRequest = this.storage.signingRequests.get(requestId);
    if (signingRequest) {
      signingRequest.status = 'rejected';
      signingRequest.rejectionReason = reason;
    }
  }
}
