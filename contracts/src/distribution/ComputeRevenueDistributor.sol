// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ComputeRevenueDistributor
 * @notice Revenue distributor for GPU compute tokenization
 * @dev Records revenue periods, deducts operating costs, and pushes net revenue
 *      to ComputeToken contracts for holder distribution.
 *
 * Revenue waterfall:
 *   Gross Revenue
 *   - Electricity costs
 *   - Platform fee (configurable bps)
 *   - Maintenance reserve (configurable bps)
 *   - Insurance (configurable bps)
 *   = Net Revenue -> pushed to ComputeToken.depositRevenue()
 */
contract ComputeRevenueDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // Events
    // ============================================================================

    event RevenuePeriodRecorded(
        uint256 indexed periodId,
        uint256 indexed nodeTokenId,
        uint256 grossRevenue,
        uint256 netRevenue,
        uint256 periodStart,
        uint256 periodEnd
    );

    event RevenueDistributed(
        uint256 indexed periodId,
        address indexed computeToken,
        uint256 netRevenue
    );

    event FeeStructureUpdated(
        uint256 platformFeeBps,
        uint256 maintenanceReserveBps,
        uint256 insuranceBps
    );

    event OperatorAdded(address indexed operator);
    event OperatorRemoved(address indexed operator);
    event TreasuryUpdated(address indexed treasury);

    // ============================================================================
    // Structs
    // ============================================================================

    struct RevenuePeriod {
        uint256 periodId;
        uint256 nodeTokenId;
        address computeToken;
        address paymentToken;
        uint256 grossRevenue;
        uint256 electricityCost;
        uint256 platformFee;
        uint256 maintenanceReserve;
        uint256 insuranceCost;
        uint256 netRevenue;
        uint256 periodStart;
        uint256 periodEnd;
        bool distributed;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Revenue periods
    mapping(uint256 => RevenuePeriod) public revenuePeriods;
    uint256 public nextPeriodId;

    /// @notice Node token ID => compute token address
    mapping(uint256 => address) public nodeComputeTokens;

    /// @notice Node token ID => payment token address
    mapping(uint256 => address) public nodePaymentTokens;

    /// @notice Fee structure (basis points, 10000 = 100%)
    uint256 public platformFeeBps;
    uint256 public maintenanceReserveBps;
    uint256 public insuranceBps;

    /// @notice Treasury for platform fees
    address public treasury;

    /// @notice Maintenance reserve wallet
    address public maintenanceWallet;

    /// @notice Insurance wallet
    address public insuranceWallet;

    /// @notice Authorized operators
    mapping(address => bool) public operators;

    /// @notice Revenue summary per node
    mapping(uint256 => uint256) public nodeGrossRevenue;
    mapping(uint256 => uint256) public nodeNetRevenue;
    mapping(uint256 => uint256) public nodePeriodCount;

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyOperator() {
        require(operators[msg.sender] || msg.sender == owner(), "ComputeRevenue: not operator");
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        address _treasury,
        address _maintenanceWallet,
        address _insuranceWallet,
        uint256 _platformFeeBps,
        uint256 _maintenanceReserveBps,
        uint256 _insuranceBps
    ) Ownable(initialOwner) {
        require(_platformFeeBps + _maintenanceReserveBps + _insuranceBps <= 5000, "ComputeRevenue: fees > 50%");

        treasury = _treasury;
        maintenanceWallet = _maintenanceWallet;
        insuranceWallet = _insuranceWallet;
        platformFeeBps = _platformFeeBps;
        maintenanceReserveBps = _maintenanceReserveBps;
        insuranceBps = _insuranceBps;
        nextPeriodId = 1;

        operators[initialOwner] = true;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    function registerNode(uint256 nodeTokenId, address computeToken, address paymentToken) external onlyOwner {
        nodeComputeTokens[nodeTokenId] = computeToken;
        nodePaymentTokens[nodeTokenId] = paymentToken;
    }

    function updateFeeStructure(uint256 _platformFeeBps, uint256 _maintenanceReserveBps, uint256 _insuranceBps) external onlyOwner {
        require(_platformFeeBps + _maintenanceReserveBps + _insuranceBps <= 5000, "ComputeRevenue: fees > 50%");
        platformFeeBps = _platformFeeBps;
        maintenanceReserveBps = _maintenanceReserveBps;
        insuranceBps = _insuranceBps;
        emit FeeStructureUpdated(_platformFeeBps, _maintenanceReserveBps, _insuranceBps);
    }

    function setTreasury(address _treasury) external onlyOwner { treasury = _treasury; emit TreasuryUpdated(_treasury); }
    function addOperator(address op) external onlyOwner { operators[op] = true; emit OperatorAdded(op); }
    function removeOperator(address op) external onlyOwner { operators[op] = false; emit OperatorRemoved(op); }

    // ============================================================================
    // Revenue Recording
    // ============================================================================

    /**
     * @notice Record a revenue period for a GPU node
     * @param nodeTokenId The GPU node NFT token ID
     * @param grossRevenue Gross revenue in payment token units
     * @param electricityCost Electricity cost in payment token units
     * @param periodStart Start timestamp of the period
     * @param periodEnd End timestamp of the period
     * @return periodId The recorded period ID
     */
    function recordRevenuePeriod(
        uint256 nodeTokenId,
        uint256 grossRevenue,
        uint256 electricityCost,
        uint256 periodStart,
        uint256 periodEnd
    ) external onlyOperator nonReentrant returns (uint256) {
        require(nodeComputeTokens[nodeTokenId] != address(0), "ComputeRevenue: node not registered");
        require(periodEnd > periodStart, "ComputeRevenue: invalid period");
        require(grossRevenue >= electricityCost, "ComputeRevenue: costs exceed revenue");

        uint256 afterElectricity = grossRevenue - electricityCost;

        uint256 platformFee = (afterElectricity * platformFeeBps) / 10000;
        uint256 maintenanceReserve = (afterElectricity * maintenanceReserveBps) / 10000;
        uint256 insurance = (afterElectricity * insuranceBps) / 10000;
        uint256 netRevenue = afterElectricity - platformFee - maintenanceReserve - insurance;

        uint256 periodId = nextPeriodId++;

        revenuePeriods[periodId] = RevenuePeriod({
            periodId: periodId,
            nodeTokenId: nodeTokenId,
            computeToken: nodeComputeTokens[nodeTokenId],
            paymentToken: nodePaymentTokens[nodeTokenId],
            grossRevenue: grossRevenue,
            electricityCost: electricityCost,
            platformFee: platformFee,
            maintenanceReserve: maintenanceReserve,
            insuranceCost: insurance,
            netRevenue: netRevenue,
            periodStart: periodStart,
            periodEnd: periodEnd,
            distributed: false
        });

        nodeGrossRevenue[nodeTokenId] += grossRevenue;
        nodeNetRevenue[nodeTokenId] += netRevenue;
        nodePeriodCount[nodeTokenId]++;

        emit RevenuePeriodRecorded(periodId, nodeTokenId, grossRevenue, netRevenue, periodStart, periodEnd);

        return periodId;
    }

    // ============================================================================
    // Revenue Distribution
    // ============================================================================

    /**
     * @notice Distribute revenue for a recorded period
     * @param periodId The period ID to distribute
     */
    function distributeRevenue(uint256 periodId) external onlyOperator nonReentrant {
        RevenuePeriod storage period = revenuePeriods[periodId];
        require(period.periodId != 0, "ComputeRevenue: period not found");
        require(!period.distributed, "ComputeRevenue: already distributed");

        IERC20 payment = IERC20(period.paymentToken);

        // Transfer platform fee to treasury
        if (period.platformFee > 0 && treasury != address(0)) {
            payment.safeTransferFrom(msg.sender, treasury, period.platformFee);
        }

        // Transfer maintenance reserve
        if (period.maintenanceReserve > 0 && maintenanceWallet != address(0)) {
            payment.safeTransferFrom(msg.sender, maintenanceWallet, period.maintenanceReserve);
        }

        // Transfer insurance
        if (period.insuranceCost > 0 && insuranceWallet != address(0)) {
            payment.safeTransferFrom(msg.sender, insuranceWallet, period.insuranceCost);
        }

        // Approve and push net revenue to ComputeToken
        if (period.netRevenue > 0) {
            payment.safeTransferFrom(msg.sender, address(this), period.netRevenue);
            payment.forceApprove(period.computeToken, period.netRevenue);

            // Call depositRevenue on the ComputeToken
            (bool success,) = period.computeToken.call(
                abi.encodeWithSignature("depositRevenue(uint256)", period.netRevenue)
            );
            require(success, "ComputeRevenue: deposit failed");
        }

        period.distributed = true;

        emit RevenueDistributed(periodId, period.computeToken, period.netRevenue);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    function getRevenuePeriod(uint256 periodId) external view returns (RevenuePeriod memory) {
        return revenuePeriods[periodId];
    }

    function getNodeRevenueSummary(uint256 nodeTokenId) external view returns (
        uint256 totalGross, uint256 totalNet, uint256 periodCount
    ) {
        return (nodeGrossRevenue[nodeTokenId], nodeNetRevenue[nodeTokenId], nodePeriodCount[nodeTokenId]);
    }
}
