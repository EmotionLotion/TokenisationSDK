// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GPUComputeOracle
 * @notice Oracle for GPU compute market rates and node valuations
 * @dev Stores GPU spot prices, utilization data, and calculates NAV using DCF model
 *
 * Market data (updated by operators/Chainlink Functions):
 * - Spot price per hour per GPU model
 * - Average utilization per GPU model
 * - Supply/demand metrics
 *
 * Valuation (DCF-based NAV):
 * NAV = depreciated_hardware_value + (annual_NOI * remaining_months / 12) / (1 + discount_rate)
 */
contract GPUComputeOracle is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event MarketRateUpdated(string indexed gpuModel, uint256 spotPrice, uint16 utilization, uint256 supply);
    event NodeValuationUpdated(uint256 indexed nodeTokenId, uint256 navUsd);
    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);

    // ============================================================================
    // Structs
    // ============================================================================

    struct GPUMarketRate {
        string gpuModel;
        uint256 spotPricePerHourUsd; // 8 decimals (e.g., 177000000 = $1.77)
        uint16 avgUtilizationBps;    // basis points (8500 = 85%)
        uint256 supplyCount;
        uint256 demandScore;         // 0-10000 relative demand
        uint256 updatedAt;
    }

    struct NodeValuation {
        uint256 hardwareValueUsd;      // 8 decimals
        uint256 projectedAnnualNoiUsd; // 8 decimals
        uint16 remainingUsefulMonths;
        uint16 discountRateBps;        // basis points (1500 = 15%)
        uint256 navUsd;                // 8 decimals, computed
        uint256 updatedAt;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice GPU model string => market rate data
    mapping(bytes32 => GPUMarketRate) public marketRates;
    bytes32[] public gpuModelKeys;
    mapping(bytes32 => bool) private _gpuModelExists;

    /// @notice Node token ID => valuation data
    mapping(uint256 => NodeValuation) public nodeValuations;

    /// @notice Authorized operators
    mapping(address => bool) public operators;

    /// @notice Price precision (8 decimals)
    uint256 public constant PRICE_DECIMALS = 1e8;

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "GPUOracle: not operator");
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {
        operators[initialOwner] = true;
    }

    // ============================================================================
    // Market Rate Operations
    // ============================================================================

    /**
     * @notice Update market rate for a GPU model
     * @param gpuModel GPU model name (e.g., "H100", "RTX_4090")
     * @param spotPrice Spot price per hour in USD (8 decimals)
     * @param utilization Average utilization in basis points
     * @param supply Number of available nodes
     * @param demand Relative demand score (0-10000)
     */
    function updateMarketRate(
        string calldata gpuModel,
        uint256 spotPrice,
        uint16 utilization,
        uint256 supply,
        uint256 demand
    ) external onlyOperator {
        require(utilization <= 10000, "GPUOracle: utilization > 100%");
        require(demand <= 10000, "GPUOracle: demand > 10000");

        bytes32 key = keccak256(bytes(gpuModel));

        if (!_gpuModelExists[key]) {
            gpuModelKeys.push(key);
            _gpuModelExists[key] = true;
        }

        marketRates[key] = GPUMarketRate({
            gpuModel: gpuModel,
            spotPricePerHourUsd: spotPrice,
            avgUtilizationBps: utilization,
            supplyCount: supply,
            demandScore: demand,
            updatedAt: block.timestamp
        });

        emit MarketRateUpdated(gpuModel, spotPrice, utilization, supply);
    }

    // ============================================================================
    // Node Valuation Operations
    // ============================================================================

    /**
     * @notice Update valuation parameters for a specific node
     * @param tokenId GPU node NFT token ID
     * @param hardwareValue Current depreciated hardware value (8 decimals)
     * @param projectedNoi Projected annual net operating income (8 decimals)
     * @param remainingMonths Remaining useful life in months
     * @param discountRate Discount rate in basis points
     */
    function updateNodeValuation(
        uint256 tokenId,
        uint256 hardwareValue,
        uint256 projectedNoi,
        uint16 remainingMonths,
        uint16 discountRate
    ) external onlyOperator {
        uint256 nav = _calculateNAV(hardwareValue, projectedNoi, remainingMonths, discountRate);

        nodeValuations[tokenId] = NodeValuation({
            hardwareValueUsd: hardwareValue,
            projectedAnnualNoiUsd: projectedNoi,
            remainingUsefulMonths: remainingMonths,
            discountRateBps: discountRate,
            navUsd: nav,
            updatedAt: block.timestamp
        });

        emit NodeValuationUpdated(tokenId, nav);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Calculate NAV for a node using current stored parameters
     * @param tokenId Node token ID
     * @return nav Net asset value in USD (8 decimals)
     */
    function calculateNAV(uint256 tokenId) external view returns (uint256) {
        NodeValuation memory v = nodeValuations[tokenId];
        if (v.updatedAt == 0) return 0;
        return _calculateNAV(v.hardwareValueUsd, v.projectedAnnualNoiUsd, v.remainingUsefulMonths, v.discountRateBps);
    }

    /**
     * @notice Get market rate for a GPU model
     * @param gpuModel GPU model name
     * @return rate Market rate data
     */
    function getMarketRate(string calldata gpuModel) external view returns (GPUMarketRate memory) {
        return marketRates[keccak256(bytes(gpuModel))];
    }

    /**
     * @notice Get node valuation
     * @param tokenId Node token ID
     * @return valuation Node valuation data
     */
    function getNodeValuation(uint256 tokenId) external view returns (NodeValuation memory) {
        return nodeValuations[tokenId];
    }

    /**
     * @notice Check if market data is fresh for a GPU model
     * @param gpuModel GPU model name
     * @param maxAge Maximum acceptable age in seconds
     * @return fresh Whether data is fresh
     * @return age Current age of data in seconds
     */
    function isMarketDataFresh(string calldata gpuModel, uint256 maxAge) external view returns (bool fresh, uint256 age) {
        GPUMarketRate memory rate = marketRates[keccak256(bytes(gpuModel))];
        if (rate.updatedAt == 0) return (false, 0);
        age = block.timestamp - rate.updatedAt;
        fresh = age <= maxAge;
    }

    /**
     * @notice Get count of tracked GPU models
     */
    function getGPUModelCount() external view returns (uint256) {
        return gpuModelKeys.length;
    }

    // ============================================================================
    // Admin
    // ============================================================================

    function addOperator(address op) external onlyOwner { operators[op] = true; emit OperatorAdded(op); }
    function removeOperator(address op) external onlyOwner { operators[op] = false; emit OperatorRemoved(op); }

    // ============================================================================
    // Internal
    // ============================================================================

    /**
     * @notice Calculate NAV using DCF model
     * NAV = hardwareValue + (annualNOI * remainingMonths / 12) / (1 + discountRate/10000)
     */
    function _calculateNAV(
        uint256 hardwareValue,
        uint256 annualNoi,
        uint16 remainingMonths,
        uint16 discountRate
    ) internal pure returns (uint256) {
        // Projected total remaining income
        uint256 totalProjectedIncome = (annualNoi * remainingMonths) / 12;

        // Discount factor: 1 + rate/10000, scaled by 10000
        uint256 discountFactor = 10000 + discountRate;

        // Discounted income
        uint256 discountedIncome = (totalProjectedIncome * 10000) / discountFactor;

        return hardwareValue + discountedIncome;
    }
}
