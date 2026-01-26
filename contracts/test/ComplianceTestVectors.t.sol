// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/ComplianceToken.sol";
import "../src/identity/IdentityRegistry.sol";

/**
 * @title ComplianceTestVectors
 * @notice Golden test vectors for compliance rules
 * @dev Run with: forge test --match-contract ComplianceTestVectors -vvv
 */
contract ComplianceTestVectors is Test {
    ComplianceToken public token;
    IdentityRegistry public registry;

    address public owner = address(1);
    address public agent = address(2);
    address public compliance = address(3);
    address public alice = address(4);
    address public bob = address(5);
    address public charlie = address(6);

    // Country codes
    uint16 constant US = 840;
    uint16 constant AE = 784;
    uint16 constant KP = 408; // North Korea (sanctioned)

    function setUp() public {
        vm.startPrank(owner);

        // Deploy registry
        registry = new IdentityRegistry();

        // Deploy token
        token = new ComplianceToken("Test Token", "TEST", address(registry));

        // Setup roles
        token.addAgent(agent);
        token.addComplianceOfficer(compliance);

        // Register identities with KYC
        registry.registerIdentity(alice, alice, US);
        registry.registerIdentity(bob, bob, AE);
        registry.registerIdentity(charlie, charlie, KP);

        // Add KYC claims
        registry.addVerifier(owner, _singleArray(1)); // KYC topic
        registry.addClaim(alice, 1, owner, "", "", ""); // KYC claim
        registry.addClaim(bob, 1, owner, "", "", "");   // KYC claim
        // Charlie has no KYC (sanctioned country)

        vm.stopPrank();
    }

    // =========================================================================
    // TEST VECTOR 1: KYC Required Transfers
    // =========================================================================

    function test_KYC_BothPartiesVerified_ShouldSucceed() public {
        // Setup: Mint to alice, she transfers to bob
        vm.prank(agent);
        token.mint(alice, 1000);

        // Action: Transfer
        vm.prank(alice);
        bool success = token.transfer(bob, 100);

        // Assert
        assertTrue(success, "Transfer should succeed when both parties have KYC");
        assertEq(token.balanceOf(bob), 100);
    }

    function test_KYC_RecipientNotVerified_ShouldFail() public {
        // Setup: Mint to alice, charlie has no KYC
        vm.prank(agent);
        token.mint(alice, 1000);

        // Charlie has identity but no KYC claim
        vm.prank(owner);
        registry.registerIdentity(address(7), address(7), US);

        // Action & Assert: Transfer should revert
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(address(7), 100);
    }

    function test_KYC_SenderNotVerified_ShouldFail() public {
        // Setup: Give tokens to unverified user via force transfer
        vm.prank(agent);
        token.mint(alice, 1000);

        address unverified = address(8);
        vm.prank(owner);
        registry.registerIdentity(unverified, unverified, US);
        // No KYC claim added

        vm.prank(agent);
        token.forceTransfer(alice, unverified, 500, "Test setup");

        // Action & Assert: Unverified sender cannot transfer
        vm.prank(unverified);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100);
    }

    // =========================================================================
    // TEST VECTOR 2: Country Restrictions
    // =========================================================================

    function test_Country_BlockedCountry_ShouldFail() public {
        // Setup: Block North Korea
        uint16[] memory blocked = new uint16[](1);
        blocked[0] = KP;

        vm.prank(compliance);
        token.setBlockedCountries(blocked);

        // Give charlie KYC (even with KYC, blocked country fails)
        vm.prank(owner);
        registry.addClaim(charlie, 1, owner, "", "", "");

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action & Assert: Transfer to blocked country should fail
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(charlie, 100);
    }

    function test_Country_AllowedCountryWhitelist_ShouldSucceed() public {
        // Setup: Only allow US and AE
        uint16[] memory allowed = new uint16[](2);
        allowed[0] = US;
        allowed[1] = AE;

        vm.prank(compliance);
        token.setAllowedCountries(allowed);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action: Transfer between allowed countries
        vm.prank(alice);
        bool success = token.transfer(bob, 100);

        // Assert
        assertTrue(success, "Transfer between allowed countries should succeed");
    }

    function test_Country_NotInWhitelist_ShouldFail() public {
        // Setup: Only allow US
        uint16[] memory allowed = new uint16[](1);
        allowed[0] = US;

        vm.prank(compliance);
        token.setAllowedCountries(allowed);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action & Assert: Bob (AE) not in whitelist
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100);
    }

    // =========================================================================
    // TEST VECTOR 3: Investor Limits
    // =========================================================================

    function test_InvestorLimit_ExceedsMax_ShouldFail() public {
        // Setup: Max 2 investors
        vm.prank(compliance);
        token.setComplianceRules(true, false, 2, 0, 0, 0);

        // Create third investor with KYC
        address investor3 = address(9);
        vm.startPrank(owner);
        registry.registerIdentity(investor3, investor3, US);
        registry.addClaim(investor3, 1, owner, "", "", "");
        vm.stopPrank();

        // Mint to first two investors (alice and bob)
        vm.startPrank(agent);
        token.mint(alice, 100);
        token.mint(bob, 100);
        vm.stopPrank();

        // Note: Investor limit is enforced on transfers, not mints
        // Transfer from alice to investor3 should fail because
        // investor3 would be the third investor (limit is 2)
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(investor3, 50);
    }

    function test_MaxHolding_ExceedsLimit_ShouldFail() public {
        // Setup: Max holding 500 tokens
        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 500, 0, 0);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action & Assert: Bob cannot receive more than 500
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 600);
    }

    function test_MaxHolding_WithinLimit_ShouldSucceed() public {
        // Setup: Max holding 500 tokens
        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 500, 0, 0);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action: Transfer within limit
        vm.prank(alice);
        bool success = token.transfer(bob, 400);

        // Assert
        assertTrue(success, "Transfer within max holding should succeed");
        assertEq(token.balanceOf(bob), 400);
    }

    // =========================================================================
    // TEST VECTOR 4: Lockup Period
    // =========================================================================

    function test_Lockup_BeforeExpiry_ShouldFail() public {
        // Setup: Lockup until block.timestamp + 1 day
        uint256 lockupEnd = block.timestamp + 1 days;

        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 0, 0, lockupEnd);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action & Assert: Transfer during lockup should fail
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100);
    }

    function test_Lockup_AfterExpiry_ShouldSucceed() public {
        // Setup: Lockup until block.timestamp + 1 day
        uint256 lockupEnd = block.timestamp + 1 days;

        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 0, 0, lockupEnd);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Fast forward past lockup
        vm.warp(lockupEnd + 1);

        // Action: Transfer after lockup
        vm.prank(alice);
        bool success = token.transfer(bob, 100);

        // Assert
        assertTrue(success, "Transfer after lockup should succeed");
    }

    // =========================================================================
    // TEST VECTOR 5: Freeze/Unfreeze
    // =========================================================================

    function test_Freeze_SenderFrozen_ShouldFail() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        // Freeze alice
        vm.prank(compliance);
        token.freeze(alice);

        // Action & Assert: Frozen sender cannot transfer
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: account frozen");
        token.transfer(bob, 100);
    }

    function test_Freeze_RecipientFrozen_ShouldFail() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        // Freeze bob
        vm.prank(compliance);
        token.freeze(bob);

        // Action & Assert: Cannot transfer to frozen recipient
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: account frozen");
        token.transfer(bob, 100);
    }

    function test_Unfreeze_CanTransferAfter_ShouldSucceed() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        // Freeze then unfreeze
        vm.startPrank(compliance);
        token.freeze(alice);
        token.unfreeze(alice);
        vm.stopPrank();

        // Action: Transfer after unfreeze
        vm.prank(alice);
        bool success = token.transfer(bob, 100);

        // Assert
        assertTrue(success, "Transfer after unfreeze should succeed");
    }

    // =========================================================================
    // TEST VECTOR 6: Force Transfer (Agent Bypass)
    // =========================================================================

    function test_ForceTransfer_BypassesCompliance_ShouldSucceed() public {
        // Setup: Use lockup period to create a compliance restriction
        uint256 lockupEnd = block.timestamp + 1 days;
        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 0, 0, lockupEnd);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Normal transfer should fail due to lockup
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100);

        // Action: Force transfer bypasses compliance (including lockup)
        vm.prank(agent);
        bool success = token.forceTransfer(alice, bob, 100, "Regulatory order");

        // Assert
        assertTrue(success, "Force transfer should bypass compliance");
        assertEq(token.balanceOf(bob), 100);
    }

    function test_ForceTransfer_RequiresReason_ShouldFail() public {
        vm.prank(agent);
        token.mint(alice, 1000);

        // Action & Assert: Empty reason should fail
        vm.prank(agent);
        vm.expectRevert("ComplianceToken: reason required");
        token.forceTransfer(alice, bob, 100, "");
    }

    // =========================================================================
    // TEST VECTOR 7: Minimum Transfer Amount
    // =========================================================================

    function test_MinTransfer_BelowMinimum_ShouldFail() public {
        // Setup: Minimum 100 tokens
        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 0, 100, 0);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action & Assert: Transfer below minimum should fail
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 50);
    }

    function test_MinTransfer_AtMinimum_ShouldSucceed() public {
        // Setup: Minimum 100 tokens
        vm.prank(compliance);
        token.setComplianceRules(true, false, 0, 0, 100, 0);

        vm.prank(agent);
        token.mint(alice, 1000);

        // Action: Transfer at minimum
        vm.prank(alice);
        bool success = token.transfer(bob, 100);

        // Assert
        assertTrue(success, "Transfer at minimum should succeed");
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _singleArray(uint256 value) internal pure returns (uint256[] memory) {
        uint256[] memory arr = new uint256[](1);
        arr[0] = value;
        return arr;
    }
}
