// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TransferFeesModule
 * @notice Compliance module for collecting transfer fees
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Features:
 * - Configurable fee percentage (basis points)
 * - Flat fee option
 * - Fee collector address
 * - Exempt addresses (no fees charged)
 * - Fee caps (minimum and maximum)
 * - Different fee tiers for different transfer sizes
 *
 * Use cases:
 * - Platform transaction fees
 * - Regulatory levy collection
 * - Royalty payments
 */
contract TransferFeesModule is Ownable {
    using SafeERC20 for IERC20;

    // ============================================================================
    // Events
    // ============================================================================

    event FeeParametersSet(uint256 feeBps, uint256 flatFee, uint256 minFee, uint256 maxFee);
    event FeeCollectorSet(address indexed collector);
    event FeeCollected(address indexed from, address indexed to, uint256 amount, uint256 fee);
    event FeeExemptionSet(address indexed account, bool exempt);
    event FeeTierSet(uint256 threshold, uint256 feeBps);

    // ============================================================================
    // Structs
    // ============================================================================

    struct FeeTier {
        uint256 threshold;  // Minimum amount for this tier
        uint256 feeBps;     // Fee in basis points (100 = 1%)
    }

    struct FeeRecord {
        uint256 totalCollected;
        uint256 lastCollectedAt;
        uint256 transactionCount;
    }

    // ============================================================================
    // Constants
    // ============================================================================

    /// @notice Basis points denominator (10000 = 100%)
    uint256 public constant BPS_DENOMINATOR = 10000;

    /// @notice Maximum fee allowed (50%)
    uint256 public constant MAX_FEE_BPS = 5000;

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Module name
    string public constant name = "TransferFeesModule";

    /// @notice Whether module is plug-and-play
    bool public constant isPlugAndPlay = true;

    /// @notice Bound token address
    address public boundToken;

    /// @notice Address that receives fees
    address public feeCollector;

    /// @notice Fee in basis points (100 = 1%)
    uint256 public feeBps;

    /// @notice Flat fee per transfer (in token units)
    uint256 public flatFee;

    /// @notice Minimum fee per transfer
    uint256 public minFee;

    /// @notice Maximum fee per transfer (0 = no max)
    uint256 public maxFee;

    /// @notice Whether fees are enabled
    bool public feesEnabled;

    /// @notice Addresses exempt from fees
    mapping(address => bool) public isExempt;

    /// @notice Fee tiers for different transfer amounts
    FeeTier[] public feeTiers;

    /// @notice Fee collection records per address
    mapping(address => FeeRecord) public feeRecords;

    /// @notice Total fees collected
    uint256 public totalFeesCollected;

    /// @notice Pending fees to be collected
    uint256 public pendingFees;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        address _feeCollector,
        uint256 _feeBps
    ) Ownable(initialOwner) {
        require(_feeCollector != address(0), "Invalid collector");
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");

        feeCollector = _feeCollector;
        feeBps = _feeBps;
        feesEnabled = true;

        emit FeeCollectorSet(_feeCollector);
        emit FeeParametersSet(_feeBps, 0, 0, 0);
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set the bound token
     * @param token Token address
     */
    function setToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        boundToken = token;
    }

    /**
     * @notice Set fee parameters
     * @param _feeBps Fee in basis points
     * @param _flatFee Flat fee per transfer
     * @param _minFee Minimum fee
     * @param _maxFee Maximum fee (0 = no max)
     */
    function setFeeParameters(
        uint256 _feeBps,
        uint256 _flatFee,
        uint256 _minFee,
        uint256 _maxFee
    ) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        require(_maxFee == 0 || _maxFee >= _minFee, "Max must be >= min");

        feeBps = _feeBps;
        flatFee = _flatFee;
        minFee = _minFee;
        maxFee = _maxFee;

        emit FeeParametersSet(_feeBps, _flatFee, _minFee, _maxFee);
    }

    /**
     * @notice Set fee collector address
     * @param _collector New collector address
     */
    function setFeeCollector(address _collector) external onlyOwner {
        require(_collector != address(0), "Invalid collector");
        feeCollector = _collector;
        emit FeeCollectorSet(_collector);
    }

    /**
     * @notice Enable or disable fees
     * @param enabled Whether fees are enabled
     */
    function setFeesEnabled(bool enabled) external onlyOwner {
        feesEnabled = enabled;
    }

    /**
     * @notice Set exemption for an address
     * @param account Address to exempt
     * @param exempt Whether to exempt
     */
    function setExemption(address account, bool exempt) external onlyOwner {
        isExempt[account] = exempt;
        emit FeeExemptionSet(account, exempt);
    }

    /**
     * @notice Add a fee tier
     * @param threshold Minimum amount for this tier
     * @param tierFeeBps Fee in basis points for this tier
     */
    function addFeeTier(uint256 threshold, uint256 tierFeeBps) external onlyOwner {
        require(tierFeeBps <= MAX_FEE_BPS, "Fee too high");

        feeTiers.push(FeeTier({
            threshold: threshold,
            feeBps: tierFeeBps
        }));

        emit FeeTierSet(threshold, tierFeeBps);
    }

    /**
     * @notice Clear all fee tiers
     */
    function clearFeeTiers() external onlyOwner {
        delete feeTiers;
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    /**
     * @notice Check if transfer is compliant (always returns true for this module)
     * @dev This module doesn't block transfers, just calculates fees
     */
    function moduleCheck(
        address /* from */,
        address /* to */,
        uint256 /* value */,
        address /* token */
    ) external pure returns (bool) {
        // Fee module never blocks transfers
        return true;
    }

    /**
     * @notice Called when tokens are minted - no fee on mint
     */
    function moduleMint(address /* to */, uint256 /* value */) external pure {
        // No fees on minting
    }

    /**
     * @notice Called when tokens are burned - no fee on burn
     */
    function moduleBurn(address /* from */, uint256 /* value */) external pure {
        // No fees on burning
    }

    /**
     * @notice Called when tokens are transferred - calculate and record fee
     * @param from Sender address
     * @param to Recipient address
     * @param value Amount transferred
     */
    function moduleTransfer(
        address from,
        address to,
        uint256 value
    ) external {
        if (!feesEnabled || value == 0) {
            return;
        }

        // Check exemptions
        if (isExempt[from] || isExempt[to]) {
            return;
        }

        // Calculate fee
        uint256 fee = calculateFee(value);
        if (fee == 0) {
            return;
        }

        // Record the fee
        pendingFees += fee;
        feeRecords[from].totalCollected += fee;
        feeRecords[from].lastCollectedAt = block.timestamp;
        feeRecords[from].transactionCount++;

        emit FeeCollected(from, to, value, fee);
    }

    // ============================================================================
    // Fee Collection
    // ============================================================================

    /**
     * @notice Collect pending fees to fee collector
     * @dev Should be called by token contract or authorized address
     */
    function collectFees() external {
        require(pendingFees > 0, "No pending fees");
        require(boundToken != address(0), "No bound token");

        uint256 amount = pendingFees;
        pendingFees = 0;
        totalFeesCollected += amount;

        // Transfer fees from token contract to collector
        // Note: Token contract must have approved this module
        IERC20(boundToken).safeTransferFrom(msg.sender, feeCollector, amount);
    }

    /**
     * @notice Calculate fee for a transfer amount
     * @param amount Transfer amount
     * @return Fee amount
     */
    function calculateFee(uint256 amount) public view returns (uint256) {
        if (!feesEnabled) {
            return 0;
        }

        uint256 percentageFee;

        // Check tiered fees first
        if (feeTiers.length > 0) {
            uint256 applicableFeeBps = feeBps; // Default

            for (uint256 i = 0; i < feeTiers.length; i++) {
                if (amount >= feeTiers[i].threshold) {
                    applicableFeeBps = feeTiers[i].feeBps;
                }
            }

            percentageFee = (amount * applicableFeeBps) / BPS_DENOMINATOR;
        } else {
            percentageFee = (amount * feeBps) / BPS_DENOMINATOR;
        }

        // Add flat fee
        uint256 totalFee = percentageFee + flatFee;

        // Apply min/max
        if (totalFee < minFee) {
            totalFee = minFee;
        }
        if (maxFee > 0 && totalFee > maxFee) {
            totalFee = maxFee;
        }

        return totalFee;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all fee tiers
     * @return Array of fee tiers
     */
    function getFeeTiers() external view returns (FeeTier[] memory) {
        return feeTiers;
    }

    /**
     * @notice Get fee record for an address
     * @param account Address to check
     * @return Fee record
     */
    function getFeeRecord(address account) external view returns (FeeRecord memory) {
        return feeRecords[account];
    }

    /**
     * @notice Estimate fee for a transfer
     * @param from Sender address
     * @param to Recipient address
     * @param amount Transfer amount
     * @return Estimated fee
     */
    function estimateFee(
        address from,
        address to,
        uint256 amount
    ) external view returns (uint256) {
        if (!feesEnabled || isExempt[from] || isExempt[to]) {
            return 0;
        }
        return calculateFee(amount);
    }

    /**
     * @notice Get effective fee rate for an amount
     * @param amount Transfer amount
     * @return Fee rate in basis points
     */
    function getEffectiveFeeRate(uint256 amount) external view returns (uint256) {
        if (amount == 0) return 0;

        uint256 fee = calculateFee(amount);
        return (fee * BPS_DENOMINATOR) / amount;
    }
}
