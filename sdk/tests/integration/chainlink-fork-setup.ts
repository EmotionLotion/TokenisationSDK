/**
 * Anvil Fork Setup for Chainlink Integration Tests
 *
 * Manages Anvil lifecycle for forked Base Sepolia integration tests.
 * Provides skip helpers matching the existing skipIfNoStripe pattern.
 */

import { execSync, spawn, type ChildProcess } from 'child_process';

// ============================================================================
// CONSTANTS — Base Sepolia
// ============================================================================

/** Base Sepolia chain ID */
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** Chainlink Data Feed addresses on Base Sepolia */
export const DATA_FEED_ADDRESSES = {
  'ETH/USD': '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
  'BTC/USD': '0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298',
  'LINK/USD': '0xb113F5A928BCfF189C998ab20d753a47F9dE5A61',
} as const;

/** Chainlink Functions Router on Base Sepolia */
export const FUNCTIONS_ROUTER = '0xf9B8fc078197181C841c296C876945aaa425B278';

/** CCIP Router on Base Sepolia */
export const CCIP_ROUTER = '0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93';

/** Automation Registry v2.1 on Base Sepolia */
export const AUTOMATION_REGISTRY = '0xD421e2b5Dd4efbC1Eba7e71dCCC8D04B067c40Bb';

/** CCIP Chain Selector for Base Sepolia */
export const CCIP_CHAIN_SELECTOR = '10344971235874465080';

/** DON ID for Base Sepolia Functions */
export const DON_ID = 'fun-base-sepolia-1';

/** RPC URL — env override or public fallback */
export const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

// ============================================================================
// ANVIL FORK CLASS
// ============================================================================

export class AnvilFork {
  private process: ChildProcess | null = null;
  private _port: number;
  private _rpcUrl: string;

  constructor() {
    // Random port in 8600–8699 to avoid collisions between parallel runs
    this._port = 8600 + Math.floor(Math.random() * 100);
    this._rpcUrl = `http://127.0.0.1:${this._port}`;
  }

  get port(): number {
    return this._port;
  }

  get rpcUrl(): string {
    return this._rpcUrl;
  }

  /**
   * Spawn anvil and poll until the RPC endpoint responds (30s max).
   */
  async start(): Promise<void> {
    this.process = spawn('anvil', [
      '--fork-url', BASE_SEPOLIA_RPC_URL,
      '--port', String(this._port),
      '--chain-id', String(BASE_SEPOLIA_CHAIN_ID),
      '--silent',
    ], {
      stdio: 'ignore',
      detached: false,
    });

    // Surface spawn errors immediately
    this.process.on('error', (err: Error) => {
      throw new Error(`Failed to spawn anvil: ${err.message}`);
    });

    // Poll until RPC responds
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const resp = await fetch(this._rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
        });
        if (resp.ok) return;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }

    this.stop();
    throw new Error(`Anvil did not become ready on port ${this._port} within 30s`);
  }

  /**
   * SIGTERM with 2s grace, then SIGKILL.
   */
  stop(): void {
    if (!this.process) return;
    const proc = this.process;
    this.process = null;

    proc.kill('SIGTERM');

    // Fallback SIGKILL after 2s
    const killTimeout = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, 2_000);

    proc.on('exit', () => clearTimeout(killTimeout));
  }
}

// ============================================================================
// SKIP HELPERS (matches skipIfNoStripe pattern)
// ============================================================================

let _anvilInstalled: boolean | null = null;

/** Check if anvil binary is available on the system PATH. */
export function isAnvilInstalled(): boolean {
  if (_anvilInstalled !== null) return _anvilInstalled;
  try {
    execSync('anvil --version', { stdio: 'ignore', timeout: 5_000 });
    _anvilInstalled = true;
  } catch {
    _anvilInstalled = false;
  }
  return _anvilInstalled;
}

/** Cached check: anvil installed AND an RPC URL is reachable (env or default). */
export function hasAnvilAndRpc(): boolean {
  return isAnvilInstalled();
}

/**
 * Wrap a test body so it gracefully skips when Anvil is unavailable.
 * Mirrors the existing `skipIfNoStripe` helper in setup.ts.
 */
export function skipIfNoAnvil(testFn: () => void | Promise<void>) {
  return async () => {
    if (!hasAnvilAndRpc()) {
      console.log('Skipping: Anvil (Foundry) not installed');
      return;
    }
    await testFn();
  };
}
