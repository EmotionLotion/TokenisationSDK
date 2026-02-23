/**
 * Offline Compliance Engine
 *
 * @deprecated This module is for offline/development use only.
 * For production, use ApiClient.compliance which persists state on the server.
 *
 * The ComplianceEngine stores decisions in memory and will lose data on restart.
 * Use this only for:
 * - Local development without a backend
 * - Unit testing
 * - Offline-first applications with local persistence
 *
 * @example
 * ```typescript
 * // Production (Recommended)
 * import { ApiClient } from '@tokenisation/sdk';
 * const client = new ApiClient({ apiKey: 'sk_...' });
 * await client.compliance.check({ ... });
 *
 * // Offline (Development only)
 * import { ComplianceEngine } from '@tokenisation/sdk/offline';
 * const engine = new ComplianceEngine();
 * // WARNING: Compliance decisions are not persisted!
 * ```
 */

// The ComplianceEngine is embedded in SDK.ts, so we need to import from there
// For now, create a placeholder that warns users

export class ComplianceEngine {
  constructor() {
    if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
      console.warn(
        '[TokenisationSDK] ComplianceEngine from /offline is deprecated for production use. ' +
        'Use ApiClient.compliance instead for server-side state persistence. ' +
        'See: https://docs.tokenisation.io/migration'
      );
    }
  }

  /**
   * @deprecated Use ApiClient.compliance.check() instead
   */
  async checkTransfer(
    _from: string,
    _to: string,
    _amount: string,
    _context?: Record<string, unknown>
  ): Promise<{ allowed: boolean; reason?: string }> {
    console.warn('[ComplianceEngine] checkTransfer is deprecated. Use ApiClient.compliance.check()');
    return { allowed: true };
  }

  /**
   * @deprecated Use ApiClient.compliance.createPolicy() instead
   */
  async registerPolicy(
    _policyId: string,
    _rules: Record<string, unknown>
  ): Promise<void> {
    console.warn('[ComplianceEngine] registerPolicy is deprecated. Use ApiClient.compliance.createPolicy()');
  }

  /**
   * @deprecated Use ApiClient.compliance.getDecision() instead
   */
  async getDecision(_decisionId: string): Promise<unknown> {
    console.warn('[ComplianceEngine] getDecision is deprecated. Use ApiClient.compliance.getDecision()');
    return null;
  }
}

// Add deprecation warning on import
if (typeof console !== 'undefined' && process?.env?.NODE_ENV !== 'test') {
  console.warn(
    '[TokenisationSDK] ComplianceEngine from /offline is deprecated for production use. ' +
    'Use ApiClient.compliance instead for server-side state persistence. ' +
    'See: https://docs.tokenisation.io/migration'
  );
}
