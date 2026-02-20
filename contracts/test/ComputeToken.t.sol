// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/ComputeToken.sol";
import "../src/identity/IdentityRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Mock ERC20 payment token
contract MockPaymentToken is ERC20 {
    constructor() ERC20("Mock USDC", "MUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title ComputeTokenTest
 * @notice Tests for ComputeToken: KYC, country restrictions, revenue, SafeERC20, fuzz
 */
contract ComputeTokenTest is Test {
    ComputeToken public token;
    IdentityRegistry public registry;
    MockPaymentToken public paymentToken;

    address public owner = address(1);
    address public alice = address(4);
    address public bob = address(5);
    address public charlie = address(6);

    uint16 constant AE = 784;
    uint16 constant US = 840;
    uint16 constant KP = 408;

    function setUp() public {
        vm.startPrank(owner);

        registry = new IdentityRegistry();
        paymentToken = new MockPaymentToken();
        token = new ComputeToken("GPU Token", "GPU", address(registry), address(0), 1, address(paymentToken));

        // Register identities
        registry.registerIdentity(alice, alice, AE);
        registry.registerIdentity(bob, bob, US);
        registry.registerIdentity(charlie, charlie, KP);

        // Add KYC claims
        registry.addVerifier(owner, _singleArray(1));
        registry.addClaim(alice, 1, owner, "", "", "");
        registry.addClaim(bob, 1, owner, "", "", "");
        // Charlie has no KYC

        // Mint tokens
        token.mint(alice, 10000 ether);
        token.mint(bob, 5000 ether);

        vm.stopPrank();
    }

    // =========================================================================
    // KYC
    // =========================================================================

    function test_Transfer_RequiresKYC() public {
        // charlie has no KYC claim
        vm.prank(alice);
        vm.expectRevert("ComputeToken: recipient not KYC verified");
        token.transfer(charlie, 100 ether);
    }

    function test_Transfer_KYCVerified_Succeeds() public {
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 5100 ether);
    }

    // =========================================================================
    // COUNTRY RESTRICTIONS (Bug 1.3 — allowedCountries enforcement)
    // =========================================================================

    function test_AllowedCountries_BlocksUnlisted() public {
        vm.startPrank(owner);

        // Set allowed countries to only AE
        uint16[] memory allowed = new uint16[](1);
        allowed[0] = AE;

        uint16[] memory blocked = new uint16[](0);

        ComputeToken.ComplianceRules memory rules = ComputeToken.ComplianceRules({
            requireKyc: true,
            requireAccreditation: false,
            maxInvestorCount: 0,
            maxHoldingAmount: 0,
            minTransferAmount: 0,
            lockupEndTime: 0,
            allowedCountries: allowed,
            blockedCountries: blocked
        });
        token.setComplianceRules(rules);
        vm.stopPrank();

        // Bob is in US (840), not in allowed list
        vm.prank(alice);
        vm.expectRevert("ComputeToken: country not allowed");
        token.transfer(bob, 100 ether);
    }

    function test_AllowedCountries_PermitsListed() public {
        vm.startPrank(owner);

        uint16[] memory allowed = new uint16[](2);
        allowed[0] = AE;
        allowed[1] = US;

        ComputeToken.ComplianceRules memory rules = ComputeToken.ComplianceRules({
            requireKyc: true,
            requireAccreditation: false,
            maxInvestorCount: 0,
            maxHoldingAmount: 0,
            minTransferAmount: 0,
            lockupEndTime: 0,
            allowedCountries: allowed,
            blockedCountries: new uint16[](0)
        });
        token.setComplianceRules(rules);
        vm.stopPrank();

        // Both AE and US are allowed
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 5100 ether);
    }

    function test_BlockedCountries_BlocksListed() public {
        vm.startPrank(owner);

        // Add KYC for charlie so we isolate the country block test
        registry.addClaim(charlie, 1, owner, "", "", "");

        uint16[] memory blocked = new uint16[](1);
        blocked[0] = KP;

        ComputeToken.ComplianceRules memory rules = ComputeToken.ComplianceRules({
            requireKyc: true,
            requireAccreditation: false,
            maxInvestorCount: 0,
            maxHoldingAmount: 0,
            minTransferAmount: 0,
            lockupEndTime: 0,
            allowedCountries: new uint16[](0),
            blockedCountries: blocked
        });
        token.setComplianceRules(rules);
        vm.stopPrank();

        // Transfer to charlie (KP) should revert
        vm.prank(alice);
        vm.expectRevert("ComputeToken: blocked country");
        token.transfer(charlie, 100 ether);
    }

    // =========================================================================
    // REVENUE (SafeERC20 — Bug 1.4)
    // =========================================================================

    function test_DepositRevenue_SafeERC20() public {
        vm.startPrank(owner);

        // Mint payment tokens and approve
        paymentToken.mint(owner, 1000 ether);
        paymentToken.approve(address(token), 1000 ether);

        // Deposit revenue
        token.depositRevenue(1000 ether);

        assertEq(paymentToken.balanceOf(address(token)), 1000 ether);
        vm.stopPrank();
    }

    function test_ClaimRevenue_AfterDeposit() public {
        vm.startPrank(owner);
        paymentToken.mint(owner, 1000 ether);
        paymentToken.approve(address(token), 1000 ether);
        token.depositRevenue(1000 ether);
        vm.stopPrank();

        // Alice has 10000 out of 15000 total = 2/3
        uint256 claimable = token.getClaimableRevenue(alice);
        assertGt(claimable, 0);

        vm.prank(alice);
        token.claimRevenue();

        assertGt(paymentToken.balanceOf(alice), 0);
    }

    // =========================================================================
    // FREEZE / FORCE TRANSFER
    // =========================================================================

    function test_Freeze_BlocksTransfer() public {
        vm.prank(owner);
        token.freezeAccount(alice);

        vm.prank(alice);
        vm.expectRevert("ComputeToken: sender frozen");
        token.transfer(bob, 100 ether);
    }

    function test_ForceTransfer_ByAgent() public {
        vm.prank(owner);
        token.forceTransfer(alice, bob, 1000 ether, "regulatory");

        assertEq(token.balanceOf(alice), 9000 ether);
        assertEq(token.balanceOf(bob), 6000 ether);
    }

    // =========================================================================
    // FUZZ
    // =========================================================================

    function testFuzz_RevenueDistribution_NoOverflow(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1e24);

        vm.startPrank(owner);
        paymentToken.mint(owner, amount);
        paymentToken.approve(address(token), amount);
        token.depositRevenue(amount);
        vm.stopPrank();

        uint256 aliceClaim = token.getClaimableRevenue(alice);
        uint256 bobClaim = token.getClaimableRevenue(bob);

        // Total claimable should not exceed deposited (accounting for rounding)
        assertLe(aliceClaim + bobClaim, amount + 1);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    function _singleArray(uint256 value) internal pure returns (uint256[] memory) {
        uint256[] memory arr = new uint256[](1);
        arr[0] = value;
        return arr;
    }
}
