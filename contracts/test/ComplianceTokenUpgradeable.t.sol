// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Test.sol";
import "../src/tokens/ComplianceTokenUpgradeable.sol";
import "../src/identity/IdentityRegistry.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title ComplianceTokenUpgradeableTest
 * @notice Tests for upgradeable compliance token: upgrade flow, access control, compliance
 */
contract ComplianceTokenUpgradeableTest is Test {
    ComplianceTokenUpgradeable public implementation;
    ComplianceTokenUpgradeable public token;
    IdentityRegistry public registry;
    ERC1967Proxy public proxy;

    address public owner = address(1);
    address public agent = address(2);
    address public complianceOfficer = address(3);
    address public alice = address(4);
    address public bob = address(5);
    address public timelockAddr = address(6);

    uint16 constant AE = 784;

    function setUp() public {
        vm.startPrank(owner);

        registry = new IdentityRegistry();

        // Deploy implementation
        implementation = new ComplianceTokenUpgradeable();

        // Deploy proxy
        bytes memory initData = abi.encodeCall(
            ComplianceTokenUpgradeable.initialize,
            ("Compliance Token", "CT", address(registry), owner, 1 days)
        );
        proxy = new ERC1967Proxy(address(implementation), initData);
        token = ComplianceTokenUpgradeable(address(proxy));

        // Setup roles
        token.addAgent(agent);
        token.addComplianceOfficer(complianceOfficer);
        token.setTimelockController(timelockAddr);

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
    // Helpers
    // =========================================================================

    function _singleArray(uint256 value) internal pure returns (uint256[] memory) {
        uint256[] memory arr = new uint256[](1);
        arr[0] = value;
        return arr;
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function test_Initialize_SetsValues() public view {
        assertEq(token.name(), "Compliance Token");
        assertEq(token.symbol(), "CT");
        assertEq(token.owner(), owner);
        assertEq(token.decimals(), 18);
        assertEq(token.getVersion(), "1.0.0");
    }

    function test_Initialize_CannotReinitialize() public {
        vm.expectRevert();
        token.initialize("Reinit", "RI", address(registry), owner, 1 days);
    }

    function test_Initialize_ZeroOwner_Reverts() public {
        ComplianceTokenUpgradeable impl2 = new ComplianceTokenUpgradeable();
        vm.expectRevert("ComplianceToken: invalid owner");
        new ERC1967Proxy(
            address(impl2),
            abi.encodeCall(impl2.initialize, ("T", "T", address(registry), address(0), 1 days))
        );
    }

    function test_Initialize_ZeroRegistry_Reverts() public {
        ComplianceTokenUpgradeable impl2 = new ComplianceTokenUpgradeable();
        vm.expectRevert("ComplianceToken: invalid registry");
        new ERC1967Proxy(
            address(impl2),
            abi.encodeCall(impl2.initialize, ("T", "T", address(0), owner, 1 days))
        );
    }

    function test_Initialize_ShortUpgradeDelay_Reverts() public {
        ComplianceTokenUpgradeable impl2 = new ComplianceTokenUpgradeable();
        vm.expectRevert("ComplianceToken: upgrade delay too short");
        new ERC1967Proxy(
            address(impl2),
            abi.encodeCall(impl2.initialize, ("T", "T", address(registry), owner, 1 hours))
        );
    }

    // =========================================================================
    // MINT & TRANSFER
    // =========================================================================

    function test_Mint_Success() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.totalSupply(), 1000 ether);
        assertTrue(token.isInvestor(alice));
    }

    function test_Mint_OnlyAgent() public {
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: not agent");
        token.mint(alice, 1000);
    }

    function test_Transfer_CompliantParties() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(alice);
        token.transfer(bob, 500 ether);

        assertEq(token.balanceOf(alice), 500 ether);
        assertEq(token.balanceOf(bob), 500 ether);
    }

    function test_Transfer_InsufficientBalance_Reverts() public {
        vm.prank(agent);
        token.mint(alice, 100);

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: insufficient balance");
        token.transfer(bob, 200);
    }

    // =========================================================================
    // COMPLIANCE RULES
    // =========================================================================

    function test_LockupPeriod_BlocksTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.setComplianceRules(true, false, 0, 0, 0, block.timestamp + 30 days);

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100 ether);
    }

    function test_LockupPeriod_AllowsAfterExpiry() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.setComplianceRules(true, false, 0, 0, 0, block.timestamp + 30 days);

        vm.warp(block.timestamp + 31 days);

        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 100 ether);
    }

    function test_MaxHolding_BlocksExcess() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.setComplianceRules(true, false, 0, 500 ether, 0, 0);

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 501 ether);
    }

    function test_MinTransfer_BlocksSmall() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.setComplianceRules(true, false, 0, 0, 100 ether, 0);

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 50 ether);
    }

    function test_MaxInvestorCount_Enforced() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.setComplianceRules(true, false, 1, 0, 0, 0);

        // alice is already investor #1; transfer to bob would make 2 investors
        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100 ether);
    }

    function test_CountryRestrictions_Allowed() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        uint16[] memory allowed = new uint16[](1);
        allowed[0] = AE;

        vm.prank(complianceOfficer);
        token.setAllowedCountries(allowed);

        // Both alice and bob are AE, should work
        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 100 ether);
    }

    function test_CountryRestrictions_Blocked() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        uint16[] memory blocked = new uint16[](1);
        blocked[0] = AE;

        vm.prank(complianceOfficer);
        token.setBlockedCountries(blocked);

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: transfer not compliant");
        token.transfer(bob, 100 ether);
    }

    // =========================================================================
    // FREEZE
    // =========================================================================

    function test_Freeze_BlocksTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.freeze(alice);

        assertTrue(token.isFrozen(alice));

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: account frozen");
        token.transfer(bob, 100 ether);
    }

    function test_Unfreeze_AllowsTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.freeze(alice);

        vm.prank(complianceOfficer);
        token.unfreeze(alice);

        assertFalse(token.isFrozen(alice));

        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 100 ether);
    }

    function test_Freeze_AlreadyFrozen_Reverts() public {
        vm.prank(complianceOfficer);
        token.freeze(alice);

        vm.prank(complianceOfficer);
        vm.expectRevert("ComplianceToken: already frozen");
        token.freeze(alice);
    }

    // =========================================================================
    // FORCE TRANSFER & RECOVERY
    // =========================================================================

    function test_ForceTransfer_Success() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(agent);
        token.forceTransfer(alice, bob, 500 ether, "regulatory action");

        assertEq(token.balanceOf(alice), 500 ether);
        assertEq(token.balanceOf(bob), 500 ether);
    }

    function test_ForceTransfer_EmptyReason_Reverts() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(agent);
        vm.expectRevert("ComplianceToken: reason required");
        token.forceTransfer(alice, bob, 500 ether, "");
    }

    function test_Recovery_Success() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(owner);
        token.recoveryAddress(alice, bob);

        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), 1000 ether);
    }

    function test_Recovery_UnverifiedNewWallet_Reverts() public {
        address unverified = address(99);

        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(owner);
        vm.expectRevert("ComplianceToken: new wallet not verified");
        token.recoveryAddress(alice, unverified);
    }

    // =========================================================================
    // BURN
    // =========================================================================

    function test_Burn_Success() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(alice);
        token.burn(400 ether);

        assertEq(token.balanceOf(alice), 600 ether);
        assertEq(token.totalSupply(), 600 ether);
    }

    function test_Burn_ExceedsBalance_Reverts() public {
        vm.prank(agent);
        token.mint(alice, 100);

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: burn exceeds balance");
        token.burn(200);
    }

    function test_Burn_EntireBalance_RemovesInvestor() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);
        assertTrue(token.isInvestor(alice));

        vm.prank(alice);
        token.burn(1000 ether);
        assertFalse(token.isInvestor(alice));
    }

    // =========================================================================
    // UPGRADE FLOW
    // =========================================================================

    function test_ScheduleUpgrade_Success() public {
        ComplianceTokenUpgradeable newImpl = new ComplianceTokenUpgradeable();

        vm.prank(owner);
        token.scheduleUpgrade(address(newImpl));

        (address impl, uint256 scheduledTime, bool executed) = token.pendingUpgrade();
        assertEq(impl, address(newImpl));
        assertGt(scheduledTime, block.timestamp);
        assertFalse(executed);
    }

    function test_ScheduleUpgrade_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceToken: invalid implementation");
        token.scheduleUpgrade(address(0));
    }

    function test_ScheduleUpgrade_SameImplementation_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceToken: same implementation");
        token.scheduleUpgrade(address(proxy));
    }

    function test_ScheduleUpgrade_AlreadyPending_Reverts() public {
        ComplianceTokenUpgradeable newImpl1 = new ComplianceTokenUpgradeable();
        ComplianceTokenUpgradeable newImpl2 = new ComplianceTokenUpgradeable();

        vm.startPrank(owner);
        token.scheduleUpgrade(address(newImpl1));

        vm.expectRevert("ComplianceToken: upgrade already pending");
        token.scheduleUpgrade(address(newImpl2));
        vm.stopPrank();
    }

    function test_CancelUpgrade_Success() public {
        ComplianceTokenUpgradeable newImpl = new ComplianceTokenUpgradeable();

        vm.startPrank(owner);
        token.scheduleUpgrade(address(newImpl));
        token.cancelUpgrade();
        vm.stopPrank();

        (address impl, , ) = token.pendingUpgrade();
        assertEq(impl, address(0));
    }

    function test_CancelUpgrade_NoPending_Reverts() public {
        vm.prank(owner);
        vm.expectRevert("ComplianceToken: no pending upgrade");
        token.cancelUpgrade();
    }

    function test_UpgradeToAndCall_BeforeDelay_Reverts() public {
        ComplianceTokenUpgradeable newImpl = new ComplianceTokenUpgradeable();

        vm.startPrank(owner);
        token.scheduleUpgrade(address(newImpl));

        // Try to upgrade before delay passes
        vm.expectRevert("ComplianceToken: upgrade delay not passed");
        token.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();
    }

    function test_UpgradeToAndCall_AfterDelay_Succeeds() public {
        ComplianceTokenUpgradeable newImpl = new ComplianceTokenUpgradeable();

        vm.startPrank(owner);
        token.scheduleUpgrade(address(newImpl));

        // Advance past delay
        vm.warp(block.timestamp + 1 days + 1);

        token.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        assertEq(token.implementation(), address(newImpl));
    }

    function test_UpgradeToAndCall_WrongImplementation_Reverts() public {
        ComplianceTokenUpgradeable newImpl1 = new ComplianceTokenUpgradeable();
        ComplianceTokenUpgradeable newImpl2 = new ComplianceTokenUpgradeable();

        vm.startPrank(owner);
        token.scheduleUpgrade(address(newImpl1));
        vm.warp(block.timestamp + 1 days + 1);

        vm.expectRevert("ComplianceToken: wrong implementation");
        token.upgradeToAndCall(address(newImpl2), "");
        vm.stopPrank();
    }

    function test_UpgradeToAndCall_TimelockCanUpgrade() public {
        ComplianceTokenUpgradeable newImpl = new ComplianceTokenUpgradeable();

        vm.prank(timelockAddr);
        token.scheduleUpgrade(address(newImpl));

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(timelockAddr);
        token.upgradeToAndCall(address(newImpl), "");

        assertEq(token.implementation(), address(newImpl));
    }

    function test_UpgradePreservesState() public {
        // Mint some tokens first
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        ComplianceTokenUpgradeable newImpl = new ComplianceTokenUpgradeable();

        vm.startPrank(owner);
        token.scheduleUpgrade(address(newImpl));
        vm.warp(block.timestamp + 1 days + 1);
        token.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        // State should be preserved
        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.name(), "Compliance Token");
        assertEq(token.owner(), owner);
    }

    // =========================================================================
    // PAUSE
    // =========================================================================

    function test_Pause_BlocksTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(owner);
        token.pause();

        vm.prank(alice);
        vm.expectRevert("ComplianceToken: paused");
        token.transfer(bob, 100 ether);
    }

    function test_Unpause_AllowsTransfer() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(owner);
        token.pause();

        vm.prank(owner);
        token.unpause();

        vm.prank(alice);
        token.transfer(bob, 100 ether);
        assertEq(token.balanceOf(bob), 100 ether);
    }

    // =========================================================================
    // ACCESS CONTROL
    // =========================================================================

    function test_OnlyOwner_Functions() public {
        vm.startPrank(alice);

        vm.expectRevert("ComplianceToken: not owner");
        token.addAgent(alice);

        vm.expectRevert("ComplianceToken: not owner");
        token.pause();

        vm.expectRevert("ComplianceToken: not owner");
        token.transferOwnership(alice);

        vm.stopPrank();
    }

    function test_TransferOwnership() public {
        vm.prank(owner);
        token.transferOwnership(alice);
        assertEq(token.owner(), alice);
    }

    function test_CanTransfer_ViewFunction() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        (bool canDo, string memory reason) = token.canTransfer(alice, bob, 100 ether);
        assertTrue(canDo);
        assertEq(bytes(reason).length, 0);
    }

    function test_CanTransfer_Frozen() public {
        vm.prank(agent);
        token.mint(alice, 1000 ether);

        vm.prank(complianceOfficer);
        token.freeze(alice);

        (bool canDo, string memory reason) = token.canTransfer(alice, bob, 100 ether);
        assertFalse(canDo);
        assertEq(reason, "Sender is frozen");
    }

    // =========================================================================
    // FUZZ
    // =========================================================================

    function testFuzz_MintAndBurn(uint256 mintAmount, uint256 burnAmount) public {
        vm.assume(mintAmount > 0 && mintAmount <= 1e24);
        vm.assume(burnAmount <= mintAmount);

        vm.prank(agent);
        token.mint(alice, mintAmount);

        vm.prank(alice);
        token.burn(burnAmount);

        assertEq(token.balanceOf(alice), mintAmount - burnAmount);
        assertEq(token.totalSupply(), mintAmount - burnAmount);
    }
}
