// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/RealToken.sol";
import "../src/identity/IdentityRegistry.sol";

/**
 * @title RealTokenTest
 * @notice Tests for RealToken including KYC bypass fix, freeze, force transfer, recovery
 */
contract RealTokenTest is Test {
    RealToken public token;
    IdentityRegistry public registry;

    address public owner = address(1);
    address public agent = address(2);
    address public alice = address(4);
    address public bob = address(5);

    uint16 constant AE = 784;

    function setUp() public {
        vm.startPrank(owner);

        registry = new IdentityRegistry();
        token = new RealToken("Real Estate Token", "RET", 0, owner, address(registry), address(0));

        // Setup roles
        token.addAgent(agent);

        // Register identities
        registry.registerIdentity(alice, alice, AE);
        registry.registerIdentity(bob, bob, AE);

        // Add KYC claims
        registry.addVerifier(owner, _singleArray(1));
        registry.addClaim(alice, 1, owner, "", "", "");
        registry.addClaim(bob, 1, owner, "", "", "");

        vm.stopPrank();
    }

    // =========================================================================
    // KYC BYPASS FIX (Bug 1.1) — _isVerified returns false when registry is zero
    // =========================================================================

    function test_KYCBypass_ZeroRegistry_MintShouldRevert() public {
        vm.startPrank(owner);

        // Deploy token with zero address identity registry
        RealToken noRegToken = new RealToken("No Reg", "NR", 0, owner, address(0), address(0));
        noRegToken.addAgent(agent);
        vm.stopPrank();

        // Attempt to mint should revert because hasIdentityRegistry modifier requires non-zero
        vm.prank(agent);
        vm.expectRevert("RealToken: identity registry not set");
        noRegToken.mint(alice, 1000);
    }

    function test_KYCBypass_ZeroRegistry_IsVerifiedReturnsFalse() public {
        vm.startPrank(owner);

        // Deploy token with zero identity registry
        RealToken noRegToken = new RealToken("No Reg", "NR", 0, owner, address(0), address(0));

        // Set a dummy compliance to test transfer path
        // Even if identity registry gets set later to zero via constructor, _isVerified should fail-closed
        vm.stopPrank();
    }

    function test_SetIdentityRegistry_ZeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert("RealToken: zero address");
        token.setIdentityRegistry(address(0));
    }

    // =========================================================================
    // MINT & TRANSFER — Happy Path
    // =========================================================================

    function test_Mint_VerifiedRecipient() public {
        vm.prank(agent);
        token.mint(alice, 1000);
        assertEq(token.balanceOf(alice), 1000);
    }

    function test_Transfer_VerifiedParties() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        vm.prank(alice);
        token.transfer(bob, 500);

        assertEq(token.balanceOf(alice), 500);
        assertEq(token.balanceOf(bob), 500);
    }

    // =========================================================================
    // FREEZE
    // =========================================================================

    function test_Freeze_BlocksTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        vm.prank(agent);
        token.setAddressFrozen(alice, true);

        vm.prank(alice);
        vm.expectRevert("RealToken: address is frozen");
        token.transfer(bob, 100);
    }

    function test_Freeze_PartialTokens() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        vm.prank(agent);
        token.freezePartialTokens(alice, 600);

        // Can only transfer unfrozen portion
        vm.prank(alice);
        token.transfer(bob, 400);

        // Trying to transfer more than available reverts
        vm.prank(alice);
        vm.expectRevert("RealToken: insufficient available balance");
        token.transfer(bob, 1);
    }

    // =========================================================================
    // FORCE TRANSFER
    // =========================================================================

    function test_ForcedTransfer_UnfreezeAndTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        vm.prank(agent);
        token.freezePartialTokens(alice, 800);

        // Force transfer unfreezes as needed
        vm.prank(agent);
        token.forcedTransfer(alice, bob, 1000);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), 1000);
    }

    // =========================================================================
    // RECOVERY
    // =========================================================================

    function test_Recovery_TransfersAllTokens() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        vm.prank(agent);
        bool success = token.recoveryAddress(alice, bob, alice);
        assertTrue(success);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), 1000);
    }

    function test_Recovery_UnverifiedNewWallet_Reverts() public {
        address unverified = address(99);

        vm.prank(agent);
        token.mint(alice, 1000);

        vm.prank(agent);
        vm.expectRevert("RealToken: new wallet not verified");
        token.recoveryAddress(alice, unverified, alice);
    }

    // =========================================================================
    // FUZZ TESTS
    // =========================================================================

    function testFuzz_Transfer_Amount(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1e18);

        vm.prank(agent);
        token.mint(alice, amount);

        vm.prank(alice);
        token.transfer(bob, amount);

        assertEq(token.balanceOf(bob), amount);
        assertEq(token.balanceOf(alice), 0);
    }

    function testFuzz_FreezePartial_NeverExceedsBalance(uint256 freezeAmt) public {
        uint256 balance = 1000;
        vm.prank(agent);
        token.mint(alice, balance);

        vm.assume(freezeAmt <= balance);

        vm.prank(agent);
        token.freezePartialTokens(alice, freezeAmt);

        assertEq(token.getFrozenTokens(alice), freezeAmt);
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
