// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/CarRentalNFT.sol";

/**
 * @title CarRentalNFTTest
 * @notice Foundry tests for CarRentalNFT lifecycle, transfer guards,
 *         deposit escrow, dynamic metadata, Chainlink Automation, and access control.
 * @dev Run with: forge test --match-contract CarRentalNFTTest -vvv
 */
contract CarRentalNFTTest is Test {
    CarRentalNFT public nft;

    address public owner = address(1);
    address public rentalCompanyOp = address(2);
    address public agent = address(3);
    address public alice = address(4);
    address public bob = address(5);
    address public stranger = address(6);

    // Pickup 7 days from now, return 5 days after pickup
    uint256 public pickupDate;
    uint256 public returnDate;

    function setUp() public {
        vm.warp(1_700_000_000); // deterministic start time

        pickupDate = block.timestamp + 7 days;
        returnDate = pickupDate + 5 days;

        vm.startPrank(owner);
        nft = new CarRentalNFT("CarRental", "CRNT", "https://api.carrental.io/rental/");

        // owner already has RENTAL_COMPANY_ROLE + ADMIN_ROLE from constructor;
        // add extra rental company operator and agent
        nft.grantRole(nft.RENTAL_COMPANY_ROLE(), rentalCompanyOp);
        nft.grantRole(nft.AGENT_ROLE(), agent);
        vm.stopPrank();

        // Fund the contract so deposit refund tests can pay out
        vm.deal(address(nft), 10 ether);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /// @dev Create a standard rental for `to` with a given deposit amount.
    ///      Sends `depositAmount` wei along with the call (held in escrow).
    function _createRental(address to, uint256 depositAmount) internal returns (uint256 tokenId) {
        uint256 totalValue = depositAmount;
        if (totalValue > 0) vm.deal(agent, totalValue);
        vm.prank(agent);
        tokenId = nft.createRental{value: totalValue}(
            to,
            "HTZ",
            "Driver Name",
            "SUV",
            "Toyota",
            "RAV4",
            pickupDate,
            returnDate,
            "DXB Airport",
            "DXB Airport",
            200,
            depositAmount,
            CarRentalNFT.InsuranceType.STANDARD,
            3,
            true
        );
    }

    // =========================================================================
    // TEST 1: Full lifecycle -- create -> confirm -> pickup -> return ->
    //         inspect -> close
    // =========================================================================

    function test_FullLifecycle_Create_Confirm_Pickup_Return_Inspect_Close() public {
        // Create
        uint256 tokenId = _createRental(alice, 1 ether);
        assertEq(nft.ownerOf(tokenId), alice);

        CarRentalNFT.RentalData memory r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.CREATED));

        // Confirm
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);
        r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.CONFIRMED));

        // Pickup
        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);
        r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.PICKED_UP));
        assertEq(r.pickupMileage, 50000);
        assertEq(r.pickupFuelLevel, 85);

        // Return
        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 70, "");
        r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.RETURNED));
        assertEq(r.returnMileage, 51200);
        assertEq(r.returnFuelLevel, 70);

        // Inspect -- release full deposit
        uint256 aliceBefore = alice.balance;
        vm.prank(rentalCompanyOp);
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.RELEASED, 0);
        r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.INSPECTED));
        assertEq(uint8(r.depositStatus), uint8(CarRentalNFT.DepositStatus.RELEASED));
        assertEq(alice.balance, aliceBefore + 1 ether, "Alice should receive full deposit back");

        // Close
        vm.prank(rentalCompanyOp);
        nft.closeRental(tokenId);
        r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.CLOSED));
    }

    // =========================================================================
    // TEST 2: Transfer window -- allowed >24h before pickup
    // =========================================================================

    function test_TransferWindow_Allowed_MoreThan24h() public {
        // Current time is 7 days before pickup, well outside 24h cutoff
        uint256 tokenId = _createRental(alice, 0);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 3: Transfer window -- blocked <24h before pickup
    // =========================================================================

    function test_TransferWindow_Blocked_LessThan24h() public {
        uint256 tokenId = _createRental(alice, 0);

        // Warp to exactly 24h before pickup (cutoff boundary)
        vm.warp(pickupDate - 24 hours);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                CarRentalNFT.TransferWindowClosed.selector,
                tokenId,
                pickupDate
            )
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 4: Post-pickup transfer lock
    // =========================================================================

    function test_PostPickup_TransferBlocked() public {
        uint256 tokenId = _createRental(alice, 0);

        // Confirm and pickup
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 90);

        // Attempt transfer -- should revert with RentalLockedAfterPickup
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CarRentalNFT.RentalLockedAfterPickup.selector, tokenId)
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 5: Batch create rentals -- multiple drivers
    // =========================================================================

    function test_BatchCreateRentals_MultipleDrivers() public {
        address[] memory renters = new address[](3);
        renters[0] = alice;
        renters[1] = bob;
        renters[2] = stranger;

        string[] memory driverNames = new string[](3);
        driverNames[0] = "Alice Driver";
        driverNames[1] = "Bob Driver";
        driverNames[2] = "Charlie Driver";

        vm.prank(agent);
        uint256[] memory ids = nft.batchCreateRentals(
            renters,
            "HTZ",
            driverNames,
            "SUV",
            "Toyota",
            "RAV4",
            pickupDate,
            returnDate,
            "DXB Airport",
            "DXB Airport",
            200,
            CarRentalNFT.InsuranceType.STANDARD,
            3,
            true
        );

        assertEq(ids.length, 3);
        assertEq(nft.ownerOf(ids[0]), alice);
        assertEq(nft.ownerOf(ids[1]), bob);
        assertEq(nft.ownerOf(ids[2]), stranger);
        assertEq(nft.balanceOf(alice), 1);
    }

    // =========================================================================
    // TEST 6: Deposit escrow -- held on create
    // =========================================================================

    function test_DepositEscrow_HeldOnCreate() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        assertEq(nft.depositEscrow(tokenId), 1 ether, "Deposit should be held in escrow");
    }

    // =========================================================================
    // TEST 7: Deposit release -- on cancellation
    // =========================================================================

    function test_DepositRelease_OnCancellation() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        uint256 aliceBefore = alice.balance;

        vm.prank(rentalCompanyOp);
        nft.cancelRental(tokenId, "Customer requested");

        assertEq(alice.balance, aliceBefore + 1 ether, "Alice should receive deposit refund on cancel");
        assertEq(nft.depositEscrow(tokenId), 0, "Escrow should be cleared");
    }

    // =========================================================================
    // TEST 8: Deposit release -- on void (admin)
    // =========================================================================

    function test_DepositRelease_OnVoid() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        uint256 aliceBefore = alice.balance;

        // Admin voids the rental
        vm.prank(owner);
        nft.voidRental(tokenId, "System error correction");

        assertEq(alice.balance, aliceBefore + 1 ether, "Alice should receive deposit refund on void");
        assertEq(nft.depositEscrow(tokenId), 0, "Escrow should be cleared");
    }

    // =========================================================================
    // TEST 9: Inspect vehicle -- deposit released
    // =========================================================================

    function test_InspectVehicle_DepositReleased() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        // Full lifecycle to RETURNED
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 70, "");

        // Inspect with RELEASED resolution
        uint256 aliceBefore = alice.balance;
        vm.prank(rentalCompanyOp);
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.RELEASED, 0);

        assertEq(alice.balance, aliceBefore + 1 ether, "Alice should get full deposit back");
        assertEq(nft.depositEscrow(tokenId), 0, "Escrow should be cleared");
    }

    // =========================================================================
    // TEST 10: Inspect vehicle -- partially charged
    // =========================================================================

    function test_InspectVehicle_PartiallyCharged() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        // Full lifecycle to RETURNED
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 70, "Minor scratch on bumper");

        // Inspect with PARTIALLY_CHARGED -- charge 0.3 ether from 1 ether deposit
        uint256 aliceBefore = alice.balance;
        vm.prank(rentalCompanyOp);
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.PARTIALLY_CHARGED, 0.3 ether);

        assertEq(alice.balance, aliceBefore + 0.7 ether, "Alice should get 0.7 ether back");
        assertEq(nft.depositEscrow(tokenId), 0, "Escrow should be cleared");
    }

    // =========================================================================
    // TEST 11: Inspect vehicle -- fully charged
    // =========================================================================

    function test_InspectVehicle_FullyCharged() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        // Full lifecycle to RETURNED
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 20, "Severe body damage");

        // Inspect with FULLY_CHARGED -- charge full deposit
        uint256 aliceBefore = alice.balance;
        vm.prank(rentalCompanyOp);
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.FULLY_CHARGED, 1 ether);

        assertEq(alice.balance, aliceBefore, "Alice should get nothing back");
        assertEq(nft.depositEscrow(tokenId), 0, "Escrow should be cleared");
    }

    // =========================================================================
    // TEST 12: Inspect vehicle -- charge exceeds deposit reverts
    // =========================================================================

    function test_InspectVehicle_ChargeExceedsDeposit_Reverts() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        // Full lifecycle to RETURNED
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 70, "");

        // Try to charge more than deposit
        vm.prank(rentalCompanyOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                CarRentalNFT.InvalidChargeAmount.selector,
                tokenId,
                2 ether,
                1 ether
            )
        );
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.PARTIALLY_CHARGED, 2 ether);
    }

    // =========================================================================
    // TEST 13: Inspect vehicle -- already resolved reverts
    // =========================================================================

    function test_InspectVehicle_AlreadyResolved_Reverts() public {
        uint256 tokenId = _createRental(alice, 1 ether);

        // Full lifecycle to RETURNED
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 70, "");

        // First inspection -- RELEASED
        vm.prank(rentalCompanyOp);
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.RELEASED, 0);

        // Second inspection attempt -- should revert (status is now INSPECTED, not RETURNED)
        vm.prank(rentalCompanyOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                CarRentalNFT.InvalidStatus.selector,
                tokenId,
                CarRentalNFT.RentalStatus.INSPECTED,
                CarRentalNFT.RentalStatus.RETURNED
            )
        );
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.RELEASED, 0);
    }

    // =========================================================================
    // TEST 14: Automation -- expire old rentals
    // =========================================================================

    function test_Automation_ExpireOldRentals() public {
        uint256 tokenId = _createRental(alice, 0);

        // Set minCheckInterval to 0 so upkeep is always eligible
        vm.prank(owner);
        nft.setMinCheckInterval(0);

        // Confirm and pickup
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        // Warp past returnDate + 24h grace + 1
        vm.warp(returnDate + 24 hours + 1);

        // checkUpkeep should flag the rental for expiry
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for expired rental");

        // performUpkeep processes the expiration
        nft.performUpkeep(performData);

        // Rental should now be EXPIRED
        CarRentalNFT.RentalData memory r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.EXPIRED));
    }

    // =========================================================================
    // TEST 15: Automation -- auto no-show
    // =========================================================================

    function test_Automation_AutoNoShow() public {
        uint256 tokenId = _createRental(alice, 0);

        // Set minCheckInterval to 0 so upkeep is always eligible
        vm.prank(owner);
        nft.setMinCheckInterval(0);

        // Confirm but do NOT pickup
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        // Warp past pickupDate + 12h grace + 1
        vm.warp(pickupDate + 12 hours + 1);

        // checkUpkeep should flag the rental for no-show
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for no-show rental");

        // performUpkeep processes the no-show
        nft.performUpkeep(performData);

        // Rental should now be NO_SHOW
        CarRentalNFT.RentalData memory r = nft.getRentalData(tokenId);
        assertEq(uint8(r.status), uint8(CarRentalNFT.RentalStatus.NO_SHOW));
    }

    // =========================================================================
    // TEST 16: Vehicle update -- dynamic metadata
    // =========================================================================

    function test_VehicleUpdate_DynamicMetadata() public {
        uint256 tokenId = _createRental(alice, 0);

        // Update vehicle assignment
        vm.prank(rentalCompanyOp);
        nft.updateVehicle(tokenId, "Honda", "CR-V");

        CarRentalNFT.RentalData memory r = nft.getRentalData(tokenId);
        assertEq(r.vehicleMake, "Honda");
        assertEq(r.vehicleModel, "CR-V");

        // Metadata version should have incremented (created=1, vehicle update=2)
        assertEq(r.metadataVersion, 2);

        // History should have two entries (make + model)
        CarRentalNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 2);
        assertEq(history[0].field, "vehicleMake");
        assertEq(history[0].newValue, "Honda");
        assertEq(history[1].field, "vehicleModel");
        assertEq(history[1].newValue, "CR-V");
    }

    // =========================================================================
    // TEST 17: Location update -- dynamic metadata
    // =========================================================================

    function test_LocationUpdate_DynamicMetadata() public {
        uint256 tokenId = _createRental(alice, 0);

        // Update locations
        vm.prank(rentalCompanyOp);
        nft.updateLocations(tokenId, "JFK Airport", "LAX Airport");

        CarRentalNFT.RentalData memory r = nft.getRentalData(tokenId);
        assertEq(r.pickupLocation, "JFK Airport");
        assertEq(r.returnLocation, "LAX Airport");

        // Metadata version should have incremented (created=1, location update=2)
        assertEq(r.metadataVersion, 2);

        // History should have two entries (pickup + return locations)
        CarRentalNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 2);
        assertEq(history[0].field, "pickupLocation");
        assertEq(history[0].newValue, "JFK Airport");
        assertEq(history[1].field, "returnLocation");
        assertEq(history[1].newValue, "LAX Airport");
    }

    // =========================================================================
    // TEST 18: Role guard -- stranger cannot create rental
    // =========================================================================

    function test_RoleGuard_StrangerCannotCreate() public {
        // stranger is not agent, rental company, or owner -- createRental should revert
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(CarRentalNFT.NotAgent.selector));
        nft.createRental(
            alice,
            "HTZ",
            "Driver Name",
            "SUV",
            "Toyota",
            "RAV4",
            pickupDate,
            returnDate,
            "DXB Airport",
            "DXB Airport",
            200,
            0,
            CarRentalNFT.InsuranceType.STANDARD,
            3,
            true
        );
    }

    // =========================================================================
    // TEST 19: Role guard -- agent cannot close rental
    // =========================================================================

    function test_RoleGuard_AgentCannotClose() public {
        uint256 tokenId = _createRental(alice, 0);

        // Full lifecycle to INSPECTED
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        vm.prank(rentalCompanyOp);
        nft.processReturn(tokenId, 51200, 70, "");

        vm.prank(rentalCompanyOp);
        nft.inspectVehicle(tokenId, CarRentalNFT.DepositStatus.RELEASED, 0);

        // Agent tries to close -- should revert with NotRentalCompany
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(CarRentalNFT.NotRentalCompany.selector));
        nft.closeRental(tokenId);
    }

    // =========================================================================
    // TEST 20: Pause blocks transfer, unpause allows it
    // =========================================================================

    function test_Pause_BlocksTransfer() public {
        uint256 tokenId = _createRental(alice, 0);

        // Owner pauses the contract
        vm.prank(owner);
        nft.pause();

        // Transfer should revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CarRentalNFT.ContractPaused.selector));
        nft.transferFrom(alice, bob, tokenId);

        // Unpause and verify transfer works
        vm.prank(owner);
        nft.unpause();

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);
        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 21: Max transfers enforced after limit
    // =========================================================================

    function test_MaxTransfers_EnforcedAfterLimit() public {
        // Create rental with maxTransfers = 2
        vm.deal(agent, 0);
        vm.prank(agent);
        uint256 tokenId = nft.createRental(
            alice,
            "HTZ",
            "Driver Name",
            "SUV",
            "Toyota",
            "RAV4",
            pickupDate,
            returnDate,
            "DXB Airport",
            "DXB Airport",
            200,
            0,
            CarRentalNFT.InsuranceType.STANDARD,
            2,    // maxTransfers = 2
            true
        );

        // Transfer 1: alice -> bob
        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        // Transfer 2: bob -> alice
        vm.prank(bob);
        nft.transferFrom(bob, alice, tokenId);

        // Transfer 3: should revert (max 2 reached)
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CarRentalNFT.MaxTransfersReached.selector, tokenId, uint8(2))
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 22: Cancel from PICKED_UP status reverts
    // =========================================================================

    function test_Cancel_FromPickedUp_Reverts() public {
        uint256 tokenId = _createRental(alice, 0);

        // Confirm and pickup
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        vm.prank(rentalCompanyOp);
        nft.confirmPickup(tokenId, 50000, 85);

        // Attempt to cancel from PICKED_UP -- should revert
        vm.prank(rentalCompanyOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                CarRentalNFT.StatusNotCancellable.selector,
                tokenId,
                CarRentalNFT.RentalStatus.PICKED_UP
            )
        );
        nft.cancelRental(tokenId, "Changed mind");
    }

    // =========================================================================
    // TEST 23: Extend rental -- extends return date
    // =========================================================================

    function test_ExtendRental_ExtendsReturnDate() public {
        uint256 tokenId = _createRental(alice, 0);

        // Confirm rental first
        vm.prank(rentalCompanyOp);
        nft.confirmRental(tokenId);

        // Extend rental by 3 days with additional payment
        uint256 newReturnDate = returnDate + 3 days;
        uint256 extensionPayment = 0.5 ether;
        vm.deal(rentalCompanyOp, extensionPayment);

        vm.prank(rentalCompanyOp);
        nft.extendRental{value: extensionPayment}(tokenId, newReturnDate);

        CarRentalNFT.RentalData memory r = nft.getRentalData(tokenId);
        assertEq(r.returnDate, newReturnDate, "Return date should be extended");
        assertEq(r.totalPaid, extensionPayment, "Total paid should include extension payment");

        // Metadata history should record the change
        CarRentalNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 1);
        assertEq(history[0].field, "returnDate");
    }
}
