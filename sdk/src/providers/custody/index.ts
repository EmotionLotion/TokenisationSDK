/**
 * Custody Provider Exports
 *
 * Available custody providers:
 * - MockCustodyProvider - For testing and development
 * - MPC Providers - Institutional-grade MPC custody
 *   - FireblocksCustodyProvider
 *   - LitProtocolCustodyProvider
 *   - Web3AuthCustodyProvider
 */

// Mock provider for testing
export { MockCustodyProvider, type MockCustodyProviderConfig } from './MockCustodyProvider.js';

// MPC providers
export * from './mpc/index.js';
