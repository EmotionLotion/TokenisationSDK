/**
 * Chainlink Proof of Reserve (PoR) Plugin
 *
 * Provides reserve verification for tokenized Real World Assets (RWAs).
 * Integrates with Chainlink PoR data feeds to verify that tokens are
 * adequately backed by their underlying reserves.
 *
 * Features:
 * - Real-time reserve verification
 * - Configurable collateral ratios
 * - Circuit breaker mechanism for undercollateralization
 * - Integration with ComplianceEngine for mint blocking
 * - Cached reserve status for gas efficiency
 */

import { ethers, type Provider, type Signer } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Reserve status enum matching smart contract
 */
export enum ReserveStatus {
  UNKNOWN = 0,
  FULLY_BACKED = 1,
  UNDERCOLLATERALIZED = 2,
  CIRCUIT_BREAKER = 3,
}

/**
 * Reserve check result from on-chain verification
 */
export interface ReserveCheckResult {
  status: ReserveStatus;
  reserveAmount: string;
  circulatingSupply: string;
  currentRatio: number; // Basis points
  requiredRatio: number;
  circuitBreakerRatio: number;
  mintAllowed: boolean;
  transferAllowed: boolean;
  reason: string;
  timestamp: number;
}

/**
 * Reserve configuration for a token
 */
export interface ReserveConfig {
  porFeedAddress: string;
  requiredCollateralRatio: number; // Basis points
  circuitBreakerRatio: number; // Basis points
  feedDecimals: number;
  active: boolean;
}

/**
 * Plugin configuration
 */
export interface ProofOfReservePluginConfig {
  chainId: number;
  rpcUrl: string;
  checkerAddress: string;
  privateKey?: string;
  cacheTTL?: number; // Cache TTL in milliseconds
}

/**
 * Mint allowance result
 */
export interface MintAllowance {
  allowed: boolean;
  reason: string;
  maxMintable: string;
  currentRatio: number;
}

// ============================================================================
// ABI
// ============================================================================

const PROOF_OF_RESERVE_CHECKER_ABI = [
  // Read functions
  'function checkReserve(address token) external view returns (tuple(uint8 status, uint256 reserveAmount, uint256 circulatingSupply, uint256 currentRatio, uint256 requiredRatio, uint256 circuitBreakerRatio, bool mintAllowed, bool transferAllowed, string reason, uint256 timestamp))',
  'function canMint(address token, uint256 amount) external view returns (bool allowed, string reason)',
  'function canTransfer(address token) external view returns (bool allowed, string reason)',
  'function getReserveStatus(address token) external view returns (uint8)',
  'function getReserveConfig(address token) external view returns (tuple(address porFeedAddress, uint256 requiredCollateralRatio, uint256 circuitBreakerRatio, uint8 feedDecimals, bool active))',
  'function getMaxMintable(address token) external view returns (uint256)',
  'function getRawReserveData(address token) external view returns (uint256 reserveAmount, uint256 updatedAt)',
  'function getConfiguredTokens() external view returns (address[])',
  'function globalCircuitBreaker() external view returns (bool)',
  'function stalenessThreshold() external view returns (uint256)',
  'function BASIS_POINTS() external view returns (uint256)',
  'function DEFAULT_REQUIRED_RATIO() external view returns (uint256)',
  'function DEFAULT_CIRCUIT_BREAKER_RATIO() external view returns (uint256)',

  // Write functions
  'function configureReserve(address token, address porFeed, uint256 requiredRatio, uint256 circuitBreakerRatio) external',
  'function configureReserveWithDefaults(address token, address porFeed) external',
  'function updateRatios(address token, uint256 requiredRatio, uint256 circuitBreakerRatio) external',
  'function deactivateReserve(address token) external',
  'function setGlobalCircuitBreaker(bool enabled) external',
  'function overrideStatus(address token, uint8 status) external',
  'function resetCircuitBreaker(address token) external',

  // Events
  'event ReserveConfigured(address indexed token, address porFeed, uint256 requiredRatio, uint256 circuitBreakerRatio)',
  'event ReserveStatusChanged(address indexed token, uint8 status, uint256 ratio)',
  'event CircuitBreakerTriggered(address indexed token, uint256 currentRatio, uint256 threshold)',
  'event CircuitBreakerReset(address indexed token, uint256 currentRatio)',
  'event ReserveCheckPerformed(address indexed token, bool passed, uint256 ratio)',
];

// ============================================================================
// Cache
// ============================================================================

interface CachedReserveCheck {
  result: ReserveCheckResult;
  cachedAt: number;
}

// ============================================================================
// Plugin
// ============================================================================

/**
 * Proof of Reserve Plugin
 *
 * Provides reserve verification for tokenized RWAs with circuit breaker functionality.
 */
export class ProofOfReservePlugin {
  readonly pluginId = 'chainlink-por';
  readonly checkerAddress: string;

  private chainId: number;
  private provider: Provider;
  private signer?: Signer;
  private contract: ethers.Contract;
  private cacheTTL: number;

  // Local cache for reserve checks
  private cache: Map<string, CachedReserveCheck> = new Map();

  constructor(config: ProofOfReservePluginConfig) {
    this.chainId = config.chainId;
    this.checkerAddress = config.checkerAddress;
    this.cacheTTL = config.cacheTTL || 60000; // Default 1 minute

    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(
        config.checkerAddress,
        PROOF_OF_RESERVE_CHECKER_ABI,
        this.signer
      );
    } else {
      this.contract = new ethers.Contract(
        config.checkerAddress,
        PROOF_OF_RESERVE_CHECKER_ABI,
        this.provider
      );
    }
  }

  // ============================================================================
  // Core Functions
  // ============================================================================

  /**
   * Check reserve status for a token
   */
  async checkReserve(
    tokenAddress: string,
    useCache = true
  ): Promise<Result<ReserveCheckResult, string>> {
    try {
      // Check cache
      if (useCache) {
        const cached = this.cache.get(tokenAddress);
        if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
          return ok(cached.result);
        }
      }

      // Fetch from contract
      const raw = await this.contract.checkReserve(tokenAddress);

      const result: ReserveCheckResult = {
        status: Number(raw.status) as ReserveStatus,
        reserveAmount: raw.reserveAmount.toString(),
        circulatingSupply: raw.circulatingSupply.toString(),
        currentRatio: Number(raw.currentRatio),
        requiredRatio: Number(raw.requiredRatio),
        circuitBreakerRatio: Number(raw.circuitBreakerRatio),
        mintAllowed: raw.mintAllowed,
        transferAllowed: raw.transferAllowed,
        reason: raw.reason,
        timestamp: Number(raw.timestamp),
      };

      // Update cache
      this.cache.set(tokenAddress, {
        result,
        cachedAt: Date.now(),
      });

      return ok(result);
    } catch (error) {
      return err(
        `Reserve check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if minting is allowed for a specific amount
   */
  async canMint(
    tokenAddress: string,
    amount: string
  ): Promise<Result<{ allowed: boolean; reason: string }, string>> {
    try {
      const amountWei = ethers.parseUnits(amount, 18);
      const [allowed, reason] = await this.contract.canMint(tokenAddress, amountWei);

      return ok({ allowed, reason });
    } catch (error) {
      return err(
        `Mint check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if transfers are allowed for a token
   */
  async canTransfer(
    tokenAddress: string
  ): Promise<Result<{ allowed: boolean; reason: string }, string>> {
    try {
      const [allowed, reason] = await this.contract.canTransfer(tokenAddress);
      return ok({ allowed, reason });
    } catch (error) {
      return err(
        `Transfer check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the maximum mintable amount for a token
   */
  async getMaxMintable(tokenAddress: string): Promise<Result<string, string>> {
    try {
      const maxMintable = await this.contract.getMaxMintable(tokenAddress);
      return ok(ethers.formatUnits(maxMintable, 18));
    } catch (error) {
      return err(
        `Failed to get max mintable: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get mint allowance with detailed information
   */
  async getMintAllowance(
    tokenAddress: string,
    requestedAmount: string
  ): Promise<Result<MintAllowance, string>> {
    try {
      const [reserveCheck, maxMintable, canMintResult] = await Promise.all([
        this.checkReserve(tokenAddress),
        this.getMaxMintable(tokenAddress),
        this.canMint(tokenAddress, requestedAmount),
      ]);

      if (!reserveCheck.success) {
        return err(reserveCheck.error);
      }
      if (!maxMintable.success) {
        return err(maxMintable.error);
      }
      if (!canMintResult.success) {
        return err(canMintResult.error);
      }

      return ok({
        allowed: canMintResult.data.allowed,
        reason: canMintResult.data.reason,
        maxMintable: maxMintable.data,
        currentRatio: reserveCheck.data.currentRatio,
      });
    } catch (error) {
      return err(
        `Mint allowance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ============================================================================
  // Configuration Functions (require signer)
  // ============================================================================

  /**
   * Configure PoR checking for a token with custom ratios
   */
  async configureReserve(
    tokenAddress: string,
    porFeedAddress: string,
    requiredRatioBps: number,
    circuitBreakerRatioBps: number
  ): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for configuration');
    }

    try {
      const tx = await this.contract.configureReserve(
        tokenAddress,
        porFeedAddress,
        requiredRatioBps,
        circuitBreakerRatioBps
      );
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(
        `Reserve configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Configure PoR checking with default ratios (105% required, 100% circuit breaker)
   */
  async configureReserveWithDefaults(
    tokenAddress: string,
    porFeedAddress: string
  ): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for configuration');
    }

    try {
      const tx = await this.contract.configureReserveWithDefaults(tokenAddress, porFeedAddress);
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(
        `Reserve configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Update collateral ratios for a configured token
   */
  async updateRatios(
    tokenAddress: string,
    requiredRatioBps: number,
    circuitBreakerRatioBps: number
  ): Promise<Result<string, string>> {
    if (!this.signer) {
      return err('Signer required for configuration');
    }

    try {
      const tx = await this.contract.updateRatios(
        tokenAddress,
        requiredRatioBps,
        circuitBreakerRatioBps
      );
      const receipt = await tx.wait();
      return ok(receipt.hash);
    } catch (error) {
      return err(
        `Ratio update failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ============================================================================
  // View Functions
  // ============================================================================

  /**
   * Get reserve configuration for a token
   */
  async getReserveConfig(tokenAddress: string): Promise<Result<ReserveConfig, string>> {
    try {
      const raw = await this.contract.getReserveConfig(tokenAddress);

      return ok({
        porFeedAddress: raw.porFeedAddress,
        requiredCollateralRatio: Number(raw.requiredCollateralRatio),
        circuitBreakerRatio: Number(raw.circuitBreakerRatio),
        feedDecimals: Number(raw.feedDecimals),
        active: raw.active,
      });
    } catch (error) {
      return err(
        `Failed to get config: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get all configured tokens
   */
  async getConfiguredTokens(): Promise<Result<string[], string>> {
    try {
      const tokens = await this.contract.getConfiguredTokens();
      return ok(tokens);
    } catch (error) {
      return err(
        `Failed to get configured tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get raw reserve data from PoR feed
   */
  async getRawReserveData(
    tokenAddress: string
  ): Promise<Result<{ reserveAmount: string; updatedAt: number }, string>> {
    try {
      const [reserveAmount, updatedAt] = await this.contract.getRawReserveData(tokenAddress);

      return ok({
        reserveAmount: reserveAmount.toString(),
        updatedAt: Number(updatedAt),
      });
    } catch (error) {
      return err(
        `Failed to get raw reserve data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if global circuit breaker is active
   */
  async isGlobalCircuitBreakerActive(): Promise<boolean> {
    try {
      return await this.contract.globalCircuitBreaker();
    } catch {
      return false;
    }
  }

  /**
   * Get current reserve status (lightweight check)
   */
  async getReserveStatus(tokenAddress: string): Promise<ReserveStatus> {
    try {
      const status = await this.contract.getReserveStatus(tokenAddress);
      return Number(status) as ReserveStatus;
    } catch {
      return ReserveStatus.UNKNOWN;
    }
  }

  // ============================================================================
  // Compliance Integration
  // ============================================================================

  /**
   * Check if a mint operation is compliant with PoR requirements
   * Use this method from ComplianceEngine for mint compliance checks
   */
  async checkMintCompliance(
    tokenAddress: string,
    amount: string
  ): Promise<{
    compliant: boolean;
    status: ReserveStatus;
    reason: string;
    currentRatio: number;
    requiredRatio: number;
  }> {
    const reserveCheck = await this.checkReserve(tokenAddress);

    if (!reserveCheck.success) {
      return {
        compliant: false,
        status: ReserveStatus.UNKNOWN,
        reason: reserveCheck.error,
        currentRatio: 0,
        requiredRatio: 0,
      };
    }

    const canMintResult = await this.canMint(tokenAddress, amount);

    return {
      compliant: canMintResult.success ? canMintResult.data.allowed : false,
      status: reserveCheck.data.status,
      reason: canMintResult.success ? canMintResult.data.reason : canMintResult.error,
      currentRatio: reserveCheck.data.currentRatio,
      requiredRatio: reserveCheck.data.requiredRatio,
    };
  }

  /**
   * Check if a transfer is compliant with PoR requirements
   * Use this method from ComplianceEngine for transfer compliance checks
   */
  async checkTransferCompliance(tokenAddress: string): Promise<{
    compliant: boolean;
    status: ReserveStatus;
    reason: string;
  }> {
    const reserveCheck = await this.checkReserve(tokenAddress);

    if (!reserveCheck.success) {
      return {
        compliant: false,
        status: ReserveStatus.UNKNOWN,
        reason: reserveCheck.error,
      };
    }

    return {
      compliant: reserveCheck.data.transferAllowed,
      status: reserveCheck.data.status,
      reason: reserveCheck.data.reason,
    };
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Clear the local cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache TTL
   */
  getCacheTTL(): number {
    return this.cacheTTL;
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(ttlMs: number): void {
    this.cacheTTL = ttlMs;
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.cache.clear();
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Proof of Reserve plugin
 */
export function createProofOfReservePlugin(
  config: ProofOfReservePluginConfig
): ProofOfReservePlugin {
  return new ProofOfReservePlugin(config);
}

/**
 * Create PoR plugin for Base Sepolia testnet
 */
export function createBaseSepoliaPoRPlugin(
  checkerAddress: string,
  privateKey?: string
): ProofOfReservePlugin {
  return new ProofOfReservePlugin({
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    checkerAddress,
    privateKey,
  });
}

/**
 * Create PoR plugin for Ethereum Sepolia testnet
 */
export function createSepoliaPoRPlugin(
  checkerAddress: string,
  privateKey?: string
): ProofOfReservePlugin {
  return new ProofOfReservePlugin({
    chainId: 11155111,
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    checkerAddress,
    privateKey,
  });
}

export default ProofOfReservePlugin;
