// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/HotelReservationNFT.sol";

/**
 * @title HotelReservationNFTTest
 * @notice Foundry tests for HotelReservationNFT lifecycle, transfer guards,
 *         dynamic metadata, Chainlink Automation, and access control.
 * @dev Run with: forge test --match-contract HotelReservationNFTTest -vvv
 */
contract HotelReservationNFTTest is Test {
    HotelReservationNFT public nft;

    address public owner = address(1);
    address public hotelOp = address(2);
    address public agent = address(3);
    address public alice = address(4);
    address public bob = address(5);
    address public stranger = address(6);

    // Check-in 7 days from now, check-out 3 nights later
    uint256 public checkInDate;
    uint256 public checkOutDate;

    function setUp() public {
        vm.warp(1_700_000_000); // deterministic start time

        checkInDate = block.timestamp + 7 days;
        checkOutDate = checkInDate + 3 days;

        vm.startPrank(owner);
        nft = new HotelReservationNFT("HotelRes", "HRES", "https://api.hotel.io/reservation/");

        // owner already has HOTEL_ROLE + ADMIN_ROLE from constructor; add hotel operator and agent
        nft.grantRole(nft.HOTEL_ROLE(), hotelOp);
        nft.grantRole(nft.AGENT_ROLE(), agent);
        vm.stopPrank();

        // Fund the contract so refund tests can pay out
        vm.deal(address(nft), 10 ether);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /// @dev Create a standard reservation for `to` with default hotel data.
    ///      Sends `value` wei along with the call (stored as amountPaid).
    function _createReservation(address to, uint256 value) internal returns (uint256 tokenId) {
        if (value > 0) vm.deal(agent, value);
        vm.prank(agent);
        tokenId = nft.createReservation{value: value}(
            to,
            "HLT-DXB-001",
            "Guest",
            "KING_DELUXE",
            checkInDate,
            checkOutDate,
            3,
            500,
            "USD",
            3,    // maxTransfers
            true  // transferable
        );
    }

    /// @dev Create a non-transferable reservation.
    function _createNonTransferable(address to) internal returns (uint256 tokenId) {
        vm.prank(agent);
        tokenId = nft.createReservation(
            to,
            "HLT-DXB-001",
            "Guest",
            "KING_DELUXE",
            checkInDate,
            checkOutDate,
            3,
            500,
            "USD",
            0,     // maxTransfers
            false  // not transferable
        );
    }

    // =========================================================================
    // TEST 1: Full lifecycle -- create -> confirm -> checkIn -> checkOut -> close
    // =========================================================================

    function test_FullLifecycle_Create_Confirm_CheckIn_CheckOut_Close() public {
        // Create
        uint256 tokenId = _createReservation(alice, 0.5 ether);
        assertEq(nft.ownerOf(tokenId), alice);

        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CREATED));

        // Confirm
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);
        r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CONFIRMED));

        // Check in
        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");
        r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CHECKED_IN));
        assertEq(r.roomNumber, "1204");

        // Check out
        vm.prank(hotelOp);
        nft.checkOut(tokenId);
        r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CHECKED_OUT));

        // Close
        vm.prank(hotelOp);
        nft.closeReservation(tokenId);
        r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CLOSED));
    }

    // =========================================================================
    // TEST 2: Transfer window -- allowed >48h before check-in
    // =========================================================================

    function test_TransferWindow_Allowed_MoreThan48h() public {
        // Current time is 7 days before check-in, well outside 48h cutoff
        uint256 tokenId = _createReservation(alice, 0);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 3: Transfer window -- blocked <48h before check-in
    // =========================================================================

    function test_TransferWindow_Blocked_LessThan48h() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Warp to exactly 48h before check-in (cutoff boundary)
        vm.warp(checkInDate - 48 hours);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                HotelReservationNFT.TransferWindowClosed.selector,
                tokenId,
                checkInDate
            )
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 4: Post-check-in transfer lock
    // =========================================================================

    function test_PostCheckIn_TransferBlocked() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Confirm and check in
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.warp(checkInDate);

        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");

        // Attempt transfer -- should revert with ReservationLockedAfterCheckIn
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(HotelReservationNFT.ReservationLockedAfterCheckIn.selector, tokenId)
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 5: Batch reservation creation for multiple guests
    // =========================================================================

    function test_BatchCreateReservations_MultipleGuests() public {
        address[] memory guests = new address[](3);
        guests[0] = alice;
        guests[1] = bob;
        guests[2] = stranger;

        string[] memory guestNames = new string[](3);
        guestNames[0] = "Alice Smith";
        guestNames[1] = "Bob Jones";
        guestNames[2] = "Charlie Brown";

        vm.prank(agent);
        uint256[] memory ids = nft.batchCreateReservations(
            guests,
            "HLT-DXB-001",
            guestNames,
            "TWIN_STANDARD",
            checkInDate,
            checkOutDate,
            3,
            400,
            "USD",
            2,
            true
        );

        assertEq(ids.length, 3);
        assertEq(nft.ownerOf(ids[0]), alice);
        assertEq(nft.ownerOf(ids[1]), bob);
        assertEq(nft.ownerOf(ids[2]), stranger);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.balanceOf(bob), 1);
        assertEq(nft.balanceOf(stranger), 1);
    }

    // =========================================================================
    // TEST 6: Room type update (dynamic metadata)
    // =========================================================================

    function test_RoomTypeUpdate_DynamicMetadata() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Hotel changes the room type
        vm.prank(hotelOp);
        nft.updateRoomType(tokenId, "SUITE_PREMIUM");

        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(r.roomType, "SUITE_PREMIUM");

        // Metadata version should have incremented (created=1, roomType change=2)
        assertEq(r.metadataVersion, 2);

        // History should have one entry
        HotelReservationNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 1);
        assertEq(history[0].field, "roomType");
        assertEq(history[0].newValue, "SUITE_PREMIUM");
    }

    // =========================================================================
    // TEST 7: Room number update -- only during CHECKED_IN
    // =========================================================================

    function test_RoomNumberUpdate_OnlyDuringCheckIn() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Confirm and check in
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        // Try to update room number before check-in -- should revert
        vm.prank(hotelOp);
        vm.expectRevert("HotelReservationNFT: can only change room when checked in");
        nft.updateRoomNumber(tokenId, "1210");

        // Now check in
        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");

        // Update room number during check-in -- should succeed
        vm.prank(hotelOp);
        nft.updateRoomNumber(tokenId, "1210");

        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(r.roomNumber, "1210");
    }

    // =========================================================================
    // TEST 8: Automation -- expire old reservations via checkUpkeep / performUpkeep
    // =========================================================================

    function test_Automation_ExpireOldReservations() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Confirm and check in
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");

        // Set minCheckInterval to 0 so upkeep is always eligible
        vm.prank(owner);
        nft.setMinCheckInterval(0);

        // Warp past checkOutDate + 24h (AUTO_EXPIRE_GRACE)
        vm.warp(checkOutDate + 24 hours + 1);

        // checkUpkeep should flag the reservation
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for expired reservation");

        // performUpkeep processes the expiration
        nft.performUpkeep(performData);

        // Reservation should be EXPIRED
        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.EXPIRED));
        assertEq(nft.getActiveReservationCount(), 0);
    }

    // =========================================================================
    // TEST 9: Automation -- auto no-show via checkUpkeep / performUpkeep
    // =========================================================================

    function test_Automation_AutoNoShow() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Confirm but do NOT check in
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        // Set minCheckInterval to 0 so upkeep is always eligible
        vm.prank(owner);
        nft.setMinCheckInterval(0);

        // Warp past checkInDate + 12h (AUTO_NO_SHOW_GRACE)
        vm.warp(checkInDate + 12 hours + 1);

        // checkUpkeep should flag the reservation
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for no-show reservation");

        // performUpkeep processes the no-show
        nft.performUpkeep(performData);

        // Reservation should be NO_SHOW
        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.NO_SHOW));
    }

    // =========================================================================
    // TEST 10: Role guard -- stranger cannot create reservation
    // =========================================================================

    function test_RoleGuard_StrangerCannotCreate() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(HotelReservationNFT.NotAgent.selector));
        nft.createReservation(
            alice,
            "HLT-DXB-001",
            "Guest",
            "KING_DELUXE",
            checkInDate,
            checkOutDate,
            3,
            500,
            "USD",
            3,
            true
        );
    }

    // =========================================================================
    // TEST 11: Role guard -- stranger cannot check in
    // =========================================================================

    function test_RoleGuard_StrangerCannotCheckIn() public {
        uint256 tokenId = _createReservation(alice, 0);

        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(HotelReservationNFT.NotHotel.selector));
        nft.checkIn(tokenId, "1204");
    }

    // =========================================================================
    // TEST 12: Role guard -- agent cannot close reservation
    // =========================================================================

    function test_RoleGuard_AgentCannotClose() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Full lifecycle to CHECKED_OUT
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");

        vm.prank(hotelOp);
        nft.checkOut(tokenId);

        // Agent tries to close -- should revert
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(HotelReservationNFT.NotHotel.selector));
        nft.closeReservation(tokenId);
    }

    // =========================================================================
    // TEST 13: Pause / unpause functionality
    // =========================================================================

    function test_Pause_BlocksTransfer() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Owner pauses the contract
        vm.prank(owner);
        nft.pause();

        // Transfer should revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(HotelReservationNFT.ContractPaused.selector));
        nft.transferFrom(alice, bob, tokenId);

        // Unpause and verify transfer works
        vm.prank(owner);
        nft.unpause();

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);
        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 14: Max transfer limit enforcement
    // =========================================================================

    function test_MaxTransfers_EnforcedAfterLimit() public {
        // Create reservation with maxTransfers = 2
        vm.prank(agent);
        uint256 tokenId = nft.createReservation(
            alice,
            "HLT-DXB-001",
            "Guest",
            "KING_DELUXE",
            checkInDate,
            checkOutDate,
            3,
            500,
            "USD",
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
            abi.encodeWithSelector(HotelReservationNFT.MaxTransfersReached.selector, tokenId, uint8(2))
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 15: Refund escrow -- deposit and claim
    // =========================================================================

    function test_RefundEscrow_DepositAndClaim() public {
        uint256 pricePaid = 2 ether;
        uint256 tokenId = _createReservation(alice, pricePaid);

        // Verify contract received the funds
        assertTrue(address(nft).balance >= pricePaid, "Contract should hold reservation funds");

        // Cancel and process refund
        vm.prank(hotelOp);
        nft.cancelReservation(tokenId, "Guest request");

        uint256 aliceBefore = alice.balance;
        vm.prank(hotelOp);
        nft.processRefund(tokenId);

        // Alice gets her money back
        assertEq(alice.balance, aliceBefore + pricePaid, "Refund should equal amount paid");
    }

    // =========================================================================
    // TEST 16: Metadata version increments correctly
    // =========================================================================

    function test_MetadataVersion_IncrementsOnEachChange() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Version starts at 1 after creation
        assertEq(nft.getMetadataVersion(tokenId), 1);

        // Confirm -> 2
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);
        assertEq(nft.getMetadataVersion(tokenId), 2);

        // Room type update -> 3
        vm.prank(hotelOp);
        nft.updateRoomType(tokenId, "SUITE_PREMIUM");
        assertEq(nft.getMetadataVersion(tokenId), 3);

        // Check in -> 4
        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");
        assertEq(nft.getMetadataVersion(tokenId), 4);

        // Check out -> 5
        vm.prank(hotelOp);
        nft.checkOut(tokenId);
        assertEq(nft.getMetadataVersion(tokenId), 5);
    }

    // =========================================================================
    // TEST 17: Cancellation from CREATED status
    // =========================================================================

    function test_Cancel_FromCreated() public {
        uint256 tokenId = _createReservation(alice, 0);

        vm.prank(hotelOp);
        nft.cancelReservation(tokenId, "Weather");

        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CANCELLED));
        assertTrue(nft.refundPending(tokenId), "Refund should be pending");
    }

    // =========================================================================
    // TEST 18: Cancellation from CONFIRMED status
    // =========================================================================

    function test_Cancel_FromConfirmed() public {
        uint256 tokenId = _createReservation(alice, 0);

        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.prank(hotelOp);
        nft.cancelReservation(tokenId, "Overbooking");

        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(uint8(r.status), uint8(HotelReservationNFT.ReservationStatus.CANCELLED));
    }

    // =========================================================================
    // TEST 19: Cannot cancel from CHECKED_IN status
    // =========================================================================

    function test_Cancel_FromCheckedIn_Reverts() public {
        uint256 tokenId = _createReservation(alice, 0);

        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");

        // Cancellation from CHECKED_IN should revert
        vm.prank(hotelOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                HotelReservationNFT.StatusNotCancellable.selector,
                tokenId,
                HotelReservationNFT.ReservationStatus.CHECKED_IN
            )
        );
        nft.cancelReservation(tokenId, "Too late");
    }

    // =========================================================================
    // TEST 20: Invalid transition -- checkIn without confirm
    // =========================================================================

    function test_InvalidTransition_CheckInWithoutConfirm() public {
        uint256 tokenId = _createReservation(alice, 0);

        // Attempt to check in directly from CREATED -- should revert
        vm.prank(hotelOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                HotelReservationNFT.InvalidStatus.selector,
                tokenId,
                HotelReservationNFT.ReservationStatus.CREATED,
                HotelReservationNFT.ReservationStatus.CONFIRMED
            )
        );
        nft.checkIn(tokenId, "1204");
    }

    // =========================================================================
    // TEST 21: Extend stay -- adds nights and payment
    // =========================================================================

    function test_ExtendStay_AddsNightsAndPayment() public {
        uint256 initialPayment = 1 ether;
        uint256 tokenId = _createReservation(alice, initialPayment);

        // Confirm and check in
        vm.prank(hotelOp);
        nft.confirmReservation(tokenId);

        vm.prank(hotelOp);
        nft.checkIn(tokenId, "1204");

        // Extend stay by 2 more nights with additional payment
        uint256 extensionPayment = 0.5 ether;
        uint256 newCheckOutDate = checkOutDate + 2 days;
        uint256 newNightCount = 5;

        vm.deal(hotelOp, extensionPayment);
        vm.prank(hotelOp);
        nft.extendStay{value: extensionPayment}(tokenId, newCheckOutDate, newNightCount);

        HotelReservationNFT.ReservationData memory r = nft.getReservationData(tokenId);
        assertEq(r.checkOutDate, newCheckOutDate, "Check-out date should be updated");
        assertEq(r.nightCount, newNightCount, "Night count should be updated");
        assertEq(r.amountPaid, initialPayment + extensionPayment, "Amount paid should include extension");
    }
}
