// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title IProofOfReserveChecker
 * @notice Interface for Chainlink Proof of Reserve (PoR) verification
 */
interface IProofOfReserveChecker {
    /// @notice Reserve status for a token
    enum ReserveStatus {
        UNKNOWN,
        FULLY_BACKED,      // Reserve >= required collateral
        UNDERCOLLATERALIZED, // Reserve < required but > circuit breaker threshold
        CIRCUIT_BREAKER     // Reserve < circuit breaker threshold, operations blocked
    }

    /// @notice Reserve configuration for a token
    struct ReserveConfig {
        address porFeedAddress;        // Chainlink PoR feed address
        uint256 requiredCollateralRatio; // Required ratio in basis points (10000 = 100%)
        uint256 circuitBreakerRatio;   // Circuit breaker threshold in basis points
        uint8 feedDecimals;            // Decimals of the PoR feed
        bool active;                   // Whether PoR checking is active
    }

    /// @notice Reserve verification result
    struct ReserveCheckResult {
        ReserveStatus status;
        uint256 reserveAmount;         // Amount in reserve (from PoR feed)
        uint256 circulatingSupply;     // Total circulating supply of token
        uint256 currentRatio;          // Current collateral ratio in basis points
        uint256 requiredRatio;         // Required collateral ratio
        uint256 circuitBreakerRatio;   // Circuit breaker threshold
        bool mintAllowed;              // Whether minting is allowed
        bool transferAllowed;          // Whether transfers are allowed
        string reason;                 // Human-readable status reason
        uint256 timestamp;             // Timestamp of check
    }

    // Events
    event ReserveConfigured(address indexed token, address porFeed, uint256 requiredRatio, uint256 circuitBreakerRatio);
    event ReserveStatusChanged(address indexed token, ReserveStatus status, uint256 ratio);
    event CircuitBreakerTriggered(address indexed token, uint256 currentRatio, uint256 threshold);
    event CircuitBreakerReset(address indexed token, uint256 currentRatio);
    event ReserveCheckPerformed(address indexed token, bool passed, uint256 ratio);

    // Core functions
    function checkReserve(address token) external view returns (ReserveCheckResult memory);
    function canMint(address token, uint256 amount) external view returns (bool allowed, string memory reason);
    function canTransfer(address token) external view returns (bool allowed, string memory reason);
    function getReserveStatus(address token) external view returns (ReserveStatus);
}

/**
 * @title ProofOfReserveChecker
 * @notice Chainlink Proof of Reserve verification with circuit breaker
 * @dev Verifies that tokenized RWAs maintain adequate reserve backing
 *
 * Features:
 * - Integrates with Chainlink PoR data feeds
 * - Configurable collateral ratios per token
 * - Circuit breaker mechanism for undercollateralization
 * - Automatic mint blocking when reserves insufficient
 * - Integration with compliance modules
 */
contract ProofOfReserveChecker is IProofOfReserveChecker, Ownable {
    // ============================================================================
    // Errors
    // ============================================================================

    error PoRFeedNotConfigured(address token);
    error InvalidCollateralRatio(uint256 required, uint256 circuitBreaker);
    error ZeroAddress();
    error StalePoRData(uint256 updatedAt, uint256 threshold);
    error InvalidFeedResponse();

    // ============================================================================
    // Constants
    // ============================================================================

    /// @notice Basis points denominator
    uint256 public constant BASIS_POINTS = 10000;

    /// @notice Default required collateral ratio (105% = 10500 bp)
    uint256 public constant DEFAULT_REQUIRED_RATIO = 10500;

    /// @notice Default circuit breaker ratio (100% = 10000 bp)
    uint256 public constant DEFAULT_CIRCUIT_BREAKER_RATIO = 10000;

    /// @notice Maximum staleness for PoR data (1 hour)
    uint256 public constant MAX_STALENESS = 3600;

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Reserve configuration per token
    mapping(address => ReserveConfig) public reserveConfigs;

    /// @notice Cached reserve status per token
    mapping(address => ReserveStatus) public cachedStatus;

    /// @notice Last status update time per token
    mapping(address => uint256) public lastStatusUpdate;

    /// @notice Global circuit breaker (blocks all operations)
    bool public globalCircuitBreaker;

    /// @notice Staleness threshold for PoR data
    uint256 public stalenessThreshold = MAX_STALENESS;

    /// @notice List of configured tokens
    address[] public configuredTokens;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Configure PoR checking for a token
     * @param token Token address
     * @param porFeed Chainlink PoR feed address
     * @param requiredRatio Required collateral ratio in basis points
     * @param circuitBreakerRatio Circuit breaker threshold in basis points
     */
    function configureReserve(
        address token,
        address porFeed,
        uint256 requiredRatio,
        uint256 circuitBreakerRatio
    ) external onlyOwner {
        if (token == address(0) || porFeed == address(0)) revert ZeroAddress();
        if (circuitBreakerRatio > requiredRatio) {
            revert InvalidCollateralRatio(requiredRatio, circuitBreakerRatio);
        }

        // Get feed decimals
        AggregatorV3Interface feed = AggregatorV3Interface(porFeed);
        uint8 decimals = feed.decimals();

        // Check if this is a new token
        if (!reserveConfigs[token].active) {
            configuredTokens.push(token);
        }

        reserveConfigs[token] = ReserveConfig({
            porFeedAddress: porFeed,
            requiredCollateralRatio: requiredRatio,
            circuitBreakerRatio: circuitBreakerRatio,
            feedDecimals: decimals,
            active: true
        });

        emit ReserveConfigured(token, porFeed, requiredRatio, circuitBreakerRatio);
    }

    /**
     * @notice Configure PoR with default ratios
     * @param token Token address
     * @param porFeed Chainlink PoR feed address
     */
    function configureReserveWithDefaults(
        address token,
        address porFeed
    ) external onlyOwner {
        if (token == address(0) || porFeed == address(0)) revert ZeroAddress();

        AggregatorV3Interface feed = AggregatorV3Interface(porFeed);
        uint8 decimals = feed.decimals();

        if (!reserveConfigs[token].active) {
            configuredTokens.push(token);
        }

        reserveConfigs[token] = ReserveConfig({
            porFeedAddress: porFeed,
            requiredCollateralRatio: DEFAULT_REQUIRED_RATIO,
            circuitBreakerRatio: DEFAULT_CIRCUIT_BREAKER_RATIO,
            feedDecimals: decimals,
            active: true
        });

        emit ReserveConfigured(token, porFeed, DEFAULT_REQUIRED_RATIO, DEFAULT_CIRCUIT_BREAKER_RATIO);
    }

    /**
     * @notice Update collateral ratios for a token
     * @param token Token address
     * @param requiredRatio New required ratio in basis points
     * @param circuitBreakerRatio New circuit breaker ratio in basis points
     */
    function updateRatios(
        address token,
        uint256 requiredRatio,
        uint256 circuitBreakerRatio
    ) external onlyOwner {
        if (!reserveConfigs[token].active) revert PoRFeedNotConfigured(token);
        if (circuitBreakerRatio > requiredRatio) {
            revert InvalidCollateralRatio(requiredRatio, circuitBreakerRatio);
        }

        reserveConfigs[token].requiredCollateralRatio = requiredRatio;
        reserveConfigs[token].circuitBreakerRatio = circuitBreakerRatio;

        emit ReserveConfigured(
            token,
            reserveConfigs[token].porFeedAddress,
            requiredRatio,
            circuitBreakerRatio
        );
    }

    /**
     * @notice Deactivate PoR checking for a token
     * @param token Token address
     */
    function deactivateReserve(address token) external onlyOwner {
        reserveConfigs[token].active = false;
    }

    /**
     * @notice Set global circuit breaker (emergency use)
     * @param enabled Whether to enable global circuit breaker
     */
    function setGlobalCircuitBreaker(bool enabled) external onlyOwner {
        globalCircuitBreaker = enabled;
    }

    /**
     * @notice Set staleness threshold for PoR data
     * @param threshold New threshold in seconds
     */
    function setStalenessThreshold(uint256 threshold) external onlyOwner {
        stalenessThreshold = threshold;
    }

    // ============================================================================
    // Core Functions
    // ============================================================================

    /**
     * @notice Check reserve status for a token
     * @param token Token address
     * @return result Reserve check result with detailed information
     */
    function checkReserve(address token) external view override returns (ReserveCheckResult memory result) {
        result.timestamp = block.timestamp;

        // Check global circuit breaker
        if (globalCircuitBreaker) {
            result.status = ReserveStatus.CIRCUIT_BREAKER;
            result.mintAllowed = false;
            result.transferAllowed = false;
            result.reason = "Global circuit breaker active";
            return result;
        }

        ReserveConfig memory config = reserveConfigs[token];

        // If not configured, return unknown status (allows operations)
        if (!config.active) {
            result.status = ReserveStatus.UNKNOWN;
            result.mintAllowed = true;
            result.transferAllowed = true;
            result.reason = "PoR not configured for token";
            return result;
        }

        // Get reserve amount from PoR feed
        (uint256 reserveAmount, uint256 updatedAt) = _getReserveAmount(config);

        // Check staleness
        if (block.timestamp - updatedAt > stalenessThreshold) {
            result.status = ReserveStatus.CIRCUIT_BREAKER;
            result.mintAllowed = false;
            result.transferAllowed = false;
            result.reason = "PoR data is stale";
            return result;
        }

        // Get circulating supply
        uint256 supply = IERC20(token).totalSupply();

        result.reserveAmount = reserveAmount;
        result.circulatingSupply = supply;
        result.requiredRatio = config.requiredCollateralRatio;
        result.circuitBreakerRatio = config.circuitBreakerRatio;

        // Calculate current ratio
        if (supply == 0) {
            result.currentRatio = type(uint256).max; // Infinite ratio if no supply
            result.status = ReserveStatus.FULLY_BACKED;
            result.mintAllowed = true;
            result.transferAllowed = true;
            result.reason = "No circulating supply";
            return result;
        }

        result.currentRatio = (reserveAmount * BASIS_POINTS) / supply;

        // Determine status
        if (result.currentRatio >= config.requiredCollateralRatio) {
            result.status = ReserveStatus.FULLY_BACKED;
            result.mintAllowed = true;
            result.transferAllowed = true;
            result.reason = "Fully collateralized";
        } else if (result.currentRatio >= config.circuitBreakerRatio) {
            result.status = ReserveStatus.UNDERCOLLATERALIZED;
            result.mintAllowed = false;
            result.transferAllowed = true;
            result.reason = "Undercollateralized - minting blocked";
        } else {
            result.status = ReserveStatus.CIRCUIT_BREAKER;
            result.mintAllowed = false;
            result.transferAllowed = false;
            result.reason = "Circuit breaker triggered - reserves critically low";
        }

        return result;
    }

    /**
     * @notice Check if minting is allowed for a token
     * @param token Token address
     * @param amount Amount to mint
     * @return allowed Whether minting is allowed
     * @return reason Reason if not allowed
     */
    function canMint(
        address token,
        uint256 amount
    ) external view override returns (bool allowed, string memory reason) {
        if (globalCircuitBreaker) {
            return (false, "Global circuit breaker active");
        }

        ReserveConfig memory config = reserveConfigs[token];

        if (!config.active) {
            return (true, "PoR not configured");
        }

        // Get current reserve and supply
        (uint256 reserveAmount, uint256 updatedAt) = _getReserveAmount(config);

        if (block.timestamp - updatedAt > stalenessThreshold) {
            return (false, "PoR data is stale");
        }

        uint256 currentSupply = IERC20(token).totalSupply();
        uint256 newSupply = currentSupply + amount;

        // Check if reserve can support new supply
        uint256 requiredReserve = (newSupply * config.requiredCollateralRatio) / BASIS_POINTS;

        if (reserveAmount >= requiredReserve) {
            return (true, "Reserve sufficient for mint");
        }

        return (false, "Insufficient reserves for mint amount");
    }

    /**
     * @notice Check if transfers are allowed for a token
     * @param token Token address
     * @return allowed Whether transfers are allowed
     * @return reason Reason if not allowed
     */
    function canTransfer(
        address token
    ) external view override returns (bool allowed, string memory reason) {
        if (globalCircuitBreaker) {
            return (false, "Global circuit breaker active");
        }

        ReserveConfig memory config = reserveConfigs[token];

        if (!config.active) {
            return (true, "PoR not configured");
        }

        ReserveCheckResult memory result = this.checkReserve(token);
        return (result.transferAllowed, result.reason);
    }

    /**
     * @notice Get current reserve status for a token
     * @param token Token address
     * @return status Current reserve status
     */
    function getReserveStatus(
        address token
    ) external view override returns (ReserveStatus) {
        if (globalCircuitBreaker) {
            return ReserveStatus.CIRCUIT_BREAKER;
        }

        if (!reserveConfigs[token].active) {
            return ReserveStatus.UNKNOWN;
        }

        ReserveCheckResult memory result = this.checkReserve(token);
        return result.status;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get reserve configuration for a token
     * @param token Token address
     * @return config Reserve configuration
     */
    function getReserveConfig(address token) external view returns (ReserveConfig memory) {
        return reserveConfigs[token];
    }

    /**
     * @notice Get all configured tokens
     * @return tokens Array of configured token addresses
     */
    function getConfiguredTokens() external view returns (address[] memory) {
        return configuredTokens;
    }

    /**
     * @notice Get raw PoR feed data for a token
     * @param token Token address
     * @return reserveAmount Current reserve amount
     * @return updatedAt Timestamp of last update
     */
    function getRawReserveData(
        address token
    ) external view returns (uint256 reserveAmount, uint256 updatedAt) {
        ReserveConfig memory config = reserveConfigs[token];
        if (!config.active) revert PoRFeedNotConfigured(token);
        return _getReserveAmount(config);
    }

    /**
     * @notice Calculate maximum mintable amount based on current reserves
     * @param token Token address
     * @return maxMintable Maximum amount that can be minted
     */
    function getMaxMintable(address token) external view returns (uint256 maxMintable) {
        ReserveConfig memory config = reserveConfigs[token];

        if (!config.active) {
            return type(uint256).max; // No limit if not configured
        }

        (uint256 reserveAmount,) = _getReserveAmount(config);
        uint256 currentSupply = IERC20(token).totalSupply();

        // Calculate maximum supply that can be supported
        uint256 maxSupply = (reserveAmount * BASIS_POINTS) / config.requiredCollateralRatio;

        if (maxSupply > currentSupply) {
            return maxSupply - currentSupply;
        }

        return 0;
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Get reserve amount from PoR feed
     */
    function _getReserveAmount(
        ReserveConfig memory config
    ) internal view returns (uint256 amount, uint256 updatedAt) {
        AggregatorV3Interface feed = AggregatorV3Interface(config.porFeedAddress);

        (
            /* uint80 roundId */,
            int256 answer,
            /* uint256 startedAt */,
            uint256 updatedAtRaw,
            /* uint80 answeredInRound */
        ) = feed.latestRoundData();

        if (answer < 0) revert InvalidFeedResponse();

        amount = uint256(answer);
        updatedAt = updatedAtRaw;
    }

    // ============================================================================
    // Emergency Functions
    // ============================================================================

    /**
     * @notice Manually update cached status (for emergency override)
     * @param token Token address
     * @param status New status to set
     */
    function overrideStatus(
        address token,
        ReserveStatus status
    ) external onlyOwner {
        cachedStatus[token] = status;
        lastStatusUpdate[token] = block.timestamp;
        emit ReserveStatusChanged(token, status, 0);
    }

    /**
     * @notice Reset circuit breaker for a token (requires adequate reserves)
     * @param token Token address
     */
    function resetCircuitBreaker(address token) external onlyOwner {
        ReserveCheckResult memory result = this.checkReserve(token);

        // Only allow reset if reserves are adequate
        require(
            result.currentRatio >= reserveConfigs[token].circuitBreakerRatio,
            "Reserves still insufficient"
        );

        cachedStatus[token] = result.status;
        lastStatusUpdate[token] = block.timestamp;

        emit CircuitBreakerReset(token, result.currentRatio);
    }
}
