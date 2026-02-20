// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/oracles/GPUComputeOracle.sol";

/**
 * @title GPUComputeOracleTest
 * @notice Tests for GPUComputeOracle: DCF calculation, staleness, operator access, fuzz
 */
contract GPUComputeOracleTest is Test {
    GPUComputeOracle public oracle;

    address public owner = address(1);
    address public operator = address(2);
    address public alice = address(3);

    function setUp() public {
        vm.startPrank(owner);
        oracle = new GPUComputeOracle(owner);
        oracle.addOperator(operator);
        vm.stopPrank();
    }

    // =========================================================================
    // MARKET RATE OPERATIONS
    // =========================================================================

    function test_UpdateMarketRate_Success() public {
        vm.prank(operator);
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);

        GPUComputeOracle.GPUMarketRate memory rate = oracle.getMarketRate("H100");
        assertEq(rate.spotPricePerHourUsd, 177000000);
        assertEq(rate.avgUtilizationBps, 8500);
        assertEq(rate.supplyCount, 1000);
        assertEq(rate.demandScore, 7500);
        assertGt(rate.updatedAt, 0);
    }

    function test_UpdateMarketRate_OwnerCanUpdate() public {
        vm.prank(owner);
        oracle.updateMarketRate("A100", 100000000, 7000, 500, 6000);

        GPUComputeOracle.GPUMarketRate memory rate = oracle.getMarketRate("A100");
        assertEq(rate.spotPricePerHourUsd, 100000000);
    }

    function test_UpdateMarketRate_UnauthorizedReverts() public {
        vm.prank(alice);
        vm.expectRevert("GPUOracle: not operator");
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);
    }

    function test_UpdateMarketRate_UtilizationOverflow_Reverts() public {
        vm.prank(operator);
        vm.expectRevert("GPUOracle: utilization > 100%");
        oracle.updateMarketRate("H100", 177000000, 10001, 1000, 7500);
    }

    function test_UpdateMarketRate_DemandOverflow_Reverts() public {
        vm.prank(operator);
        vm.expectRevert("GPUOracle: demand > 10000");
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 10001);
    }

    function test_UpdateMarketRate_TrackMultipleModels() public {
        vm.startPrank(operator);
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);
        oracle.updateMarketRate("A100", 100000000, 7000, 500, 6000);
        oracle.updateMarketRate("RTX_4090", 40000000, 6000, 2000, 5000);
        vm.stopPrank();

        assertEq(oracle.getGPUModelCount(), 3);
    }

    function test_UpdateMarketRate_SameModel_Updates() public {
        vm.startPrank(operator);
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);
        oracle.updateMarketRate("H100", 200000000, 9000, 1100, 8000);
        vm.stopPrank();

        // Should not duplicate
        assertEq(oracle.getGPUModelCount(), 1);

        GPUComputeOracle.GPUMarketRate memory rate = oracle.getMarketRate("H100");
        assertEq(rate.spotPricePerHourUsd, 200000000);
    }

    // =========================================================================
    // STALENESS CHECK
    // =========================================================================

    function test_IsMarketDataFresh_True() public {
        vm.prank(operator);
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);

        (bool fresh, uint256 age) = oracle.isMarketDataFresh("H100", 3600);
        assertTrue(fresh);
        assertEq(age, 0);
    }

    function test_IsMarketDataFresh_False_AfterExpiry() public {
        vm.prank(operator);
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);

        vm.warp(block.timestamp + 7200);

        (bool fresh, uint256 age) = oracle.isMarketDataFresh("H100", 3600);
        assertFalse(fresh);
        assertEq(age, 7200);
    }

    function test_IsMarketDataFresh_NoData() public {
        (bool fresh, uint256 age) = oracle.isMarketDataFresh("NONEXISTENT", 3600);
        assertFalse(fresh);
        assertEq(age, 0);
    }

    // =========================================================================
    // NODE VALUATION & DCF
    // =========================================================================

    function test_UpdateNodeValuation_Success() public {
        vm.prank(operator);
        oracle.updateNodeValuation(
            1, // tokenId
            10000e8, // hardwareValue $10,000
            5000e8, // projectedNoi $5,000/year
            36, // remainingMonths (3 years)
            1500 // discountRate 15%
        );

        GPUComputeOracle.NodeValuation memory v = oracle.getNodeValuation(1);
        assertEq(v.hardwareValueUsd, 10000e8);
        assertEq(v.projectedAnnualNoiUsd, 5000e8);
        assertEq(v.remainingUsefulMonths, 36);
        assertEq(v.discountRateBps, 1500);
        assertGt(v.navUsd, 0);
        assertGt(v.updatedAt, 0);
    }

    function test_CalculateNAV_ZeroMonths_ReturnsHardwareOnly() public {
        vm.prank(operator);
        oracle.updateNodeValuation(1, 10000e8, 5000e8, 0, 1500);

        uint256 nav = oracle.calculateNAV(1);
        assertEq(nav, 10000e8);
    }

    function test_CalculateNAV_ZeroNoi_ReturnsHardwareOnly() public {
        vm.prank(operator);
        oracle.updateNodeValuation(1, 10000e8, 0, 36, 1500);

        uint256 nav = oracle.calculateNAV(1);
        assertEq(nav, 10000e8);
    }

    function test_CalculateNAV_NonexistentNode_ReturnsZero() public {
        uint256 nav = oracle.calculateNAV(999);
        assertEq(nav, 0);
    }

    function test_CalculateNAV_PerYearDiscounting() public {
        // 1 full year, 10% discount, $10,000 NOI, $5,000 hardware
        // Expected: $5,000 + $10,000 / 1.10 = $5,000 + $9,090.91 ≈ $14,090.91
        vm.prank(operator);
        oracle.updateNodeValuation(1, 5000e8, 10000e8, 12, 1000);

        uint256 nav = oracle.calculateNAV(1);
        // Hardware ($5,000) + discounted income (~$9,090.91)
        // Total should be approximately $14,091
        assertGt(nav, 14000e8);
        assertLt(nav, 14200e8);
    }

    function test_CalculateNAV_MultiYear_Decreasing() public {
        // NAV should be higher for longer remaining life (more discounted income)
        vm.startPrank(operator);
        oracle.updateNodeValuation(1, 5000e8, 5000e8, 12, 1500);
        oracle.updateNodeValuation(2, 5000e8, 5000e8, 36, 1500);
        vm.stopPrank();

        uint256 nav1Year = oracle.calculateNAV(1);
        uint256 nav3Year = oracle.calculateNAV(2);

        assertGt(nav3Year, nav1Year);
    }

    function test_CalculateNAV_HigherDiscount_LowerNAV() public {
        vm.startPrank(operator);
        oracle.updateNodeValuation(1, 5000e8, 10000e8, 36, 1000); // 10% discount
        oracle.updateNodeValuation(2, 5000e8, 10000e8, 36, 3000); // 30% discount
        vm.stopPrank();

        uint256 navLowDiscount = oracle.calculateNAV(1);
        uint256 navHighDiscount = oracle.calculateNAV(2);

        assertGt(navLowDiscount, navHighDiscount);
    }

    function test_CalculateNAV_PartialYear() public {
        // 6 months remaining = half a year of income discounted
        vm.prank(operator);
        oracle.updateNodeValuation(1, 5000e8, 10000e8, 6, 1000);

        uint256 nav = oracle.calculateNAV(1);
        // Hardware ($5,000) + discounted 6 months income
        // 6/12 * $10,000 = $5,000 discounted at 10% = $5,000/1.10 ≈ $4,545.45
        // Total ≈ $9,545.45
        assertGt(nav, 9400e8);
        assertLt(nav, 9700e8);
    }

    function test_CalculateNAV_FullAndPartialYears() public {
        // 18 months = 1 full year + 6 months partial
        vm.prank(operator);
        oracle.updateNodeValuation(1, 0, 10000e8, 18, 1000);

        uint256 nav = oracle.calculateNAV(1);
        // Year 1: $10,000 / 1.10 = $9,090.91
        // Partial (6 months): ($10,000 * 6/12) / 1.10^2 = $5,000 / 1.21 = $4,132.23
        // Total ≈ $13,223.14
        assertGt(nav, 13000e8);
        assertLt(nav, 13500e8);
    }

    // =========================================================================
    // OPERATOR ACCESS
    // =========================================================================

    function test_AddOperator() public {
        vm.prank(owner);
        oracle.addOperator(alice);
        assertTrue(oracle.operators(alice));
    }

    function test_RemoveOperator() public {
        vm.prank(owner);
        oracle.removeOperator(operator);
        assertFalse(oracle.operators(operator));

        vm.prank(operator);
        vm.expectRevert("GPUOracle: not operator");
        oracle.updateMarketRate("H100", 177000000, 8500, 1000, 7500);
    }

    function test_AddOperator_OnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        oracle.addOperator(alice);
    }

    // =========================================================================
    // FUZZ
    // =========================================================================

    function testFuzz_CalculateNAV_NoOverflow(
        uint256 hardwareValue,
        uint256 annualNoi,
        uint16 remainingMonths,
        uint16 discountRate
    ) public {
        vm.assume(hardwareValue <= 1e20); // $1T max
        vm.assume(annualNoi <= 1e20);
        vm.assume(remainingMonths <= 120); // 10 years max
        vm.assume(discountRate > 0 && discountRate <= 5000); // 0-50%

        vm.prank(operator);
        oracle.updateNodeValuation(1, hardwareValue, annualNoi, remainingMonths, discountRate);

        uint256 nav = oracle.calculateNAV(1);

        // NAV should always be >= hardwareValue
        assertGe(nav, hardwareValue);
    }

    function testFuzz_MarketRate_BoundaryValues(
        uint256 spotPrice,
        uint16 utilization,
        uint256 supply,
        uint256 demand
    ) public {
        vm.assume(utilization <= 10000);
        vm.assume(demand <= 10000);
        vm.assume(spotPrice <= 1e30);

        vm.prank(operator);
        oracle.updateMarketRate("TEST", spotPrice, utilization, supply, demand);

        GPUComputeOracle.GPUMarketRate memory rate = oracle.getMarketRate("TEST");
        assertEq(rate.spotPricePerHourUsd, spotPrice);
        assertEq(rate.avgUtilizationBps, utilization);
    }
}
