// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/distribution/ComputeRevenueDistributor.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC20 payment token for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "MUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Mock ComputeToken that accepts depositRevenue calls
contract MockComputeToken {
    IERC20 public paymentToken;
    uint256 public lastDeposit;

    constructor(address _paymentToken) {
        paymentToken = IERC20(_paymentToken);
    }

    function depositRevenue(uint256 amount) external {
        paymentToken.transferFrom(msg.sender, address(this), amount);
        lastDeposit = amount;
    }
}

/**
 * @title ComputeRevenueDistributorTest
 * @notice Tests for revenue waterfall, forceApprove, double-distribution prevention
 */
contract ComputeRevenueDistributorTest is Test {
    ComputeRevenueDistributor public distributor;
    MockUSDC public usdc;
    MockComputeToken public computeToken;

    address public owner = address(1);
    address public operator = address(2);
    address public treasury = address(3);
    address public maintenanceWallet = address(4);
    address public insuranceWallet = address(5);
    address public alice = address(6);

    uint256 constant PLATFORM_FEE_BPS = 1000; // 10%
    uint256 constant MAINTENANCE_BPS = 500;    // 5%
    uint256 constant INSURANCE_BPS = 200;      // 2%

    function setUp() public {
        vm.startPrank(owner);

        usdc = new MockUSDC();
        computeToken = new MockComputeToken(address(usdc));

        distributor = new ComputeRevenueDistributor(
            owner,
            treasury,
            maintenanceWallet,
            insuranceWallet,
            PLATFORM_FEE_BPS,
            MAINTENANCE_BPS,
            INSURANCE_BPS
        );

        distributor.addOperator(operator);
        distributor.registerNode(1, address(computeToken), address(usdc));

        vm.stopPrank();
    }

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    function test_Constructor_SetsCorrectValues() public view {
        assertEq(distributor.platformFeeBps(), PLATFORM_FEE_BPS);
        assertEq(distributor.maintenanceReserveBps(), MAINTENANCE_BPS);
        assertEq(distributor.insuranceBps(), INSURANCE_BPS);
        assertEq(distributor.treasury(), treasury);
    }

    function test_RegisterNode() public {
        vm.prank(owner);
        distributor.registerNode(2, address(computeToken), address(usdc));

        assertEq(distributor.nodeComputeTokens(2), address(computeToken));
        assertEq(distributor.nodePaymentTokens(2), address(usdc));
    }

    function test_UpdateFeeStructure() public {
        vm.prank(owner);
        distributor.updateFeeStructure(800, 400, 100);

        assertEq(distributor.platformFeeBps(), 800);
        assertEq(distributor.maintenanceReserveBps(), 400);
        assertEq(distributor.insuranceBps(), 100);
    }

    function test_UpdateFeeStructure_ExceedsMax_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("ComputeRevenue: fees > 50%");
        distributor.updateFeeStructure(3000, 2000, 1001);
    }

    function test_Constructor_FeesExceedMax_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("ComputeRevenue: fees > 50%");
        new ComputeRevenueDistributor(owner, treasury, maintenanceWallet, insuranceWallet, 3000, 2000, 1001);
    }

    // =========================================================================
    // REVENUE RECORDING
    // =========================================================================

    function test_RecordRevenuePeriod_Success() public {
        vm.warp(100 days);

        vm.prank(operator);
        uint256 periodId = distributor.recordRevenuePeriod(
            1, // nodeTokenId
            10000e18, // grossRevenue
            2000e18, // electricityCost
            block.timestamp - 30 days,
            block.timestamp
        );

        assertEq(periodId, 1);

        ComputeRevenueDistributor.RevenuePeriod memory period = distributor.getRevenuePeriod(periodId);
        assertEq(period.grossRevenue, 10000e18);
        assertEq(period.electricityCost, 2000e18);

        // After electricity: 8000e18
        // Platform fee: 8000 * 10% = 800
        // Maintenance: 8000 * 5% = 400
        // Insurance: 8000 * 2% = 160
        // Net: 8000 - 800 - 400 - 160 = 6640
        assertEq(period.platformFee, 800e18);
        assertEq(period.maintenanceReserve, 400e18);
        assertEq(period.insuranceCost, 160e18);
        assertEq(period.netRevenue, 6640e18);
        assertFalse(period.distributed);
    }

    function test_RecordRevenuePeriod_UnregisteredNode_Reverts() public {
        vm.prank(operator);
        vm.expectRevert("ComputeRevenue: node not registered");
        distributor.recordRevenuePeriod(999, 10000e18, 2000e18, 1, 100);
    }

    function test_RecordRevenuePeriod_InvalidPeriod_Reverts() public {
        vm.prank(operator);
        vm.expectRevert("ComputeRevenue: invalid period");
        distributor.recordRevenuePeriod(1, 10000e18, 2000e18, 100, 50);
    }

    function test_RecordRevenuePeriod_CostsExceedRevenue_Reverts() public {
        vm.prank(operator);
        vm.expectRevert("ComputeRevenue: costs exceed revenue");
        distributor.recordRevenuePeriod(1, 1000e18, 2000e18, 1, 100);
    }

    function test_RecordRevenuePeriod_UpdatesSummary() public {
        vm.startPrank(operator);
        distributor.recordRevenuePeriod(1, 10000e18, 2000e18, 1, 100);
        distributor.recordRevenuePeriod(1, 5000e18, 1000e18, 100, 200);
        vm.stopPrank();

        (uint256 totalGross, uint256 totalNet, uint256 count) = distributor.getNodeRevenueSummary(1);
        assertEq(totalGross, 15000e18);
        assertEq(count, 2);
        assertGt(totalNet, 0);
    }

    function test_RecordRevenuePeriod_OnlyOperator() public {
        vm.prank(alice);
        vm.expectRevert("ComputeRevenue: not operator");
        distributor.recordRevenuePeriod(1, 10000e18, 2000e18, 1, 100);
    }

    // =========================================================================
    // REVENUE DISTRIBUTION
    // =========================================================================

    function test_DistributeRevenue_Success() public {
        // Record period
        vm.prank(operator);
        uint256 periodId = distributor.recordRevenuePeriod(1, 10000e18, 2000e18, 1, 100);

        ComputeRevenueDistributor.RevenuePeriod memory period = distributor.getRevenuePeriod(periodId);

        // Total needed: platformFee + maintenance + insurance + netRevenue
        uint256 totalNeeded = period.platformFee + period.maintenanceReserve + period.insuranceCost + period.netRevenue;

        // Fund operator with enough USDC and approve
        usdc.mint(operator, totalNeeded);
        vm.prank(operator);
        usdc.approve(address(distributor), totalNeeded);

        // Distribute
        vm.prank(operator);
        distributor.distributeRevenue(periodId);

        // Verify distribution
        ComputeRevenueDistributor.RevenuePeriod memory after_ = distributor.getRevenuePeriod(periodId);
        assertTrue(after_.distributed);

        assertEq(usdc.balanceOf(treasury), period.platformFee);
        assertEq(usdc.balanceOf(maintenanceWallet), period.maintenanceReserve);
        assertEq(usdc.balanceOf(insuranceWallet), period.insuranceCost);
        assertEq(usdc.balanceOf(address(computeToken)), period.netRevenue);
    }

    function test_DistributeRevenue_DoubleDistribution_Reverts() public {
        vm.prank(operator);
        uint256 periodId = distributor.recordRevenuePeriod(1, 10000e18, 2000e18, 1, 100);

        ComputeRevenueDistributor.RevenuePeriod memory period = distributor.getRevenuePeriod(periodId);
        uint256 totalNeeded = period.platformFee + period.maintenanceReserve + period.insuranceCost + period.netRevenue;

        usdc.mint(operator, totalNeeded * 2);
        vm.startPrank(operator);
        usdc.approve(address(distributor), totalNeeded * 2);
        distributor.distributeRevenue(periodId);

        vm.expectRevert("ComputeRevenue: already distributed");
        distributor.distributeRevenue(periodId);
        vm.stopPrank();
    }

    function test_DistributeRevenue_NonexistentPeriod_Reverts() public {
        vm.prank(operator);
        vm.expectRevert("ComputeRevenue: period not found");
        distributor.distributeRevenue(999);
    }

    // =========================================================================
    // ADMIN
    // =========================================================================

    function test_AddRemoveOperator() public {
        vm.startPrank(owner);
        distributor.addOperator(alice);
        assertTrue(distributor.operators(alice));

        distributor.removeOperator(alice);
        assertFalse(distributor.operators(alice));
        vm.stopPrank();
    }

    function test_SetTreasury() public {
        vm.prank(owner);
        distributor.setTreasury(alice);
        assertEq(distributor.treasury(), alice);
    }

    // =========================================================================
    // FUZZ
    // =========================================================================

    function testFuzz_RevenueWaterfall_NoOverflow(uint256 grossRevenue, uint256 electricityCost) public {
        vm.assume(grossRevenue > 0 && grossRevenue <= 1e24);
        vm.assume(electricityCost <= grossRevenue);

        vm.prank(operator);
        uint256 periodId = distributor.recordRevenuePeriod(1, grossRevenue, electricityCost, 1, 100);

        ComputeRevenueDistributor.RevenuePeriod memory period = distributor.getRevenuePeriod(periodId);

        // Fees + net should equal afterElectricity
        uint256 afterElectricity = grossRevenue - electricityCost;
        uint256 totalFees = period.platformFee + period.maintenanceReserve + period.insuranceCost;
        assertEq(totalFees + period.netRevenue, afterElectricity);
    }
}
