// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/ConcertTicketNFT.sol";

/**
 * @title ConcertTicketNFTTest
 * @notice Foundry tests for ConcertTicketNFT lifecycle, anti-scalping, transfer guards,
 *         dynamic metadata, Chainlink Automation, and access control.
 * @dev Run with: forge test --match-contract ConcertTicketNFTTest -vvv
 */
contract ConcertTicketNFTTest is Test {
    ConcertTicketNFT public nft;

    address public owner = address(1);
    address public venueOp = address(2);
    address public agent = address(3);
    address public alice = address(4);
    address public bob = address(5);
    address public stranger = address(6);

    uint256 public eventDate;
    uint256 public doorsOpen;

    function setUp() public {
        vm.warp(1_700_000_000); // deterministic start time

        eventDate = block.timestamp + 7 days;
        doorsOpen = eventDate - 2 hours;

        vm.startPrank(owner);
        nft = new ConcertTicketNFT("ConcertTicket", "CTKT", "https://api.concert.io/ticket/");

        // owner already has VENUE_ROLE + ADMIN_ROLE from constructor; grant extra roles
        nft.grantRole(nft.VENUE_ROLE(), venueOp);
        nft.grantRole(nft.AGENT_ROLE(), agent);
        vm.stopPrank();

        // Fund the contract so refund tests can pay out
        vm.deal(address(nft), 10 ether);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /// @dev Issue a standard VIP ticket to `to` with default concert data.
    ///      Sends `value` wei along with the call (stored as pricePaid).
    function _issueTicket(address to, uint256 value) internal returns (uint256 tokenId) {
        if (value > 0) vm.deal(agent, value);
        vm.prank(agent);
        tokenId = nft.issueTicket{value: value}(
            to,
            "VEN-001",
            "Dubai Arena",
            "Summer Fest 2024",
            "DJ Premier",
            eventDate,
            doorsOpen,
            "A",
            "5",
            "12",
            ConcertTicketNFT.SeatingTier.VIP,
            0.5 ether,  // faceValue
            0.75 ether, // resalePriceCap
            "Fan Name",
            3,    // maxTransfers
            true  // transferable
        );
    }

    /// @dev Issue a non-transferable ticket.
    function _issueNonTransferable(address to) internal returns (uint256 tokenId) {
        vm.prank(agent);
        tokenId = nft.issueTicket(
            to,
            "VEN-001",
            "Dubai Arena",
            "Summer Fest 2024",
            "DJ Premier",
            eventDate,
            doorsOpen,
            "A",
            "5",
            "12",
            ConcertTicketNFT.SeatingTier.VIP,
            0.5 ether,  // faceValue
            0.75 ether, // resalePriceCap
            "Fan Name",
            0,     // maxTransfers
            false  // not transferable
        );
    }

    // =========================================================================
    // TEST 1: Full lifecycle -- issue -> admit -> markUsed -> close
    // =========================================================================

    function test_FullLifecycle_Issue_Admit_Use_Close() public {
        // Issue
        uint256 tokenId = _issueTicket(alice, 0.5 ether);
        assertEq(nft.ownerOf(tokenId), alice);

        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.ISSUED));

        // Admit fan
        vm.prank(venueOp);
        nft.admitFan(tokenId);
        t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.ADMITTED));

        // Mark used
        vm.prank(venueOp);
        nft.markUsed(tokenId);
        t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.USED));

        // Close ticket
        vm.prank(venueOp);
        nft.closeTicket(tokenId);
        t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.CLOSED));
    }

    // =========================================================================
    // TEST 2: Transfer window -- allowed >24h before event
    // =========================================================================

    function test_TransferWindow_Allowed_MoreThan24h() public {
        // Current time is 7 days before event, well outside 24h cutoff
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 3: Transfer window -- blocked <24h before event
    // =========================================================================

    function test_TransferWindow_Blocked_LessThan24h() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Warp to exactly 24h before event (cutoff boundary)
        vm.warp(eventDate - 24 hours);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConcertTicketNFT.TransferWindowClosed.selector,
                tokenId,
                eventDate
            )
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 4: Post-admission transfer lock
    // =========================================================================

    function test_PostAdmission_TransferBlocked() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Admit the fan
        vm.prank(venueOp);
        nft.admitFan(tokenId);

        // Attempt transfer -- should revert with TicketLockedAfterAdmission
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ConcertTicketNFT.TicketLockedAfterAdmission.selector, tokenId)
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 5: Batch ticket issuance
    // =========================================================================

    function test_BatchIssueTickets_MultipleFans() public {
        address[] memory fans = new address[](3);
        fans[0] = alice;
        fans[1] = bob;
        fans[2] = stranger;

        string[] memory sections = new string[](3);
        sections[0] = "A";
        sections[1] = "B";
        sections[2] = "C";

        string[] memory rows = new string[](3);
        rows[0] = "1";
        rows[1] = "2";
        rows[2] = "3";

        string[] memory seatNumbers = new string[](3);
        seatNumbers[0] = "10";
        seatNumbers[1] = "11";
        seatNumbers[2] = "12";

        ConcertTicketNFT.SeatingTier[] memory tiers = new ConcertTicketNFT.SeatingTier[](3);
        tiers[0] = ConcertTicketNFT.SeatingTier.VIP;
        tiers[1] = ConcertTicketNFT.SeatingTier.FLOOR;
        tiers[2] = ConcertTicketNFT.SeatingTier.GA;

        string[] memory fanNames = new string[](3);
        fanNames[0] = "Alice Fan";
        fanNames[1] = "Bob Fan";
        fanNames[2] = "Stranger Fan";

        vm.prank(agent);
        uint256[] memory ids = nft.batchIssueTickets(
            fans,
            "VEN-001",
            "Dubai Arena",
            "Summer Fest 2024",
            "DJ Premier",
            eventDate,
            doorsOpen,
            sections,
            rows,
            seatNumbers,
            tiers,
            0.5 ether,  // faceValue
            0.75 ether,  // resalePriceCap
            fanNames,
            3,    // maxTransfers
            true  // transferable
        );

        assertEq(ids.length, 3);
        assertEq(nft.ownerOf(ids[0]), alice);
        assertEq(nft.ownerOf(ids[1]), bob);
        assertEq(nft.ownerOf(ids[2]), stranger);
        assertEq(nft.balanceOf(alice), 1);
    }

    // =========================================================================
    // TEST 6: Anti-scalping -- transfer within cap succeeds, payment forwarded
    // =========================================================================

    function test_AntiScalping_TransferWithinCap() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Alice approves bob so bob (buyer) can call transferFrom
        vm.prank(alice);
        nft.approve(bob, tokenId);

        // Fund bob (the buyer)
        vm.deal(bob, 1 ether);

        uint256 aliceBefore = alice.balance;

        // Bob calls transferFrom with msg.value == resalePriceCap (0.75 ether)
        vm.prank(bob);
        nft.transferFrom{value: 0.75 ether}(alice, bob, tokenId);

        // Bob should now own the ticket
        assertEq(nft.ownerOf(tokenId), bob);

        // Payment should have been forwarded to alice (the seller / from address)
        assertEq(alice.balance, aliceBefore + 0.75 ether, "Alice should receive resale payment");
    }

    // =========================================================================
    // TEST 7: Anti-scalping -- transfer exceeds cap reverts
    // =========================================================================

    function test_AntiScalping_TransferExceedsCap_Reverts() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Alice approves bob
        vm.prank(alice);
        nft.approve(bob, tokenId);

        // Fund bob
        vm.deal(bob, 2 ether);

        // Bob tries to transfer with value > resalePriceCap (0.75 ether)
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConcertTicketNFT.ResalePriceExceeded.selector,
                tokenId,
                1 ether,
                0.75 ether
            )
        );
        nft.transferFrom{value: 1 ether}(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 8: Anti-scalping -- gift transfer (zero value) always succeeds
    // =========================================================================

    function test_AntiScalping_GiftTransfer_ZeroValue() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Alice transfers as a gift (zero value)
        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 9: Refund ticket sends ETH back to buyer
    // =========================================================================

    function test_RefundTicket_SendsETH() public {
        uint256 pricePaid = 1 ether;
        uint256 tokenId = _issueTicket(alice, pricePaid);

        // Cancel the ticket
        vm.prank(venueOp);
        nft.cancelTicket(tokenId, "Event cancelled");

        // Record alice's balance before refund
        uint256 aliceBefore = alice.balance;

        // Process refund
        vm.prank(venueOp);
        nft.refundTicket(tokenId);

        // Alice should have received the refund
        assertEq(alice.balance, aliceBefore + pricePaid, "Alice should receive refund");

        // Status should be REFUNDED
        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.REFUNDED));
    }

    // =========================================================================
    // TEST 10: Automation -- expire post-event via checkUpkeep / performUpkeep
    // =========================================================================

    function test_Automation_ExpirePostEvent() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Set minCheckInterval to 0 so upkeep is always eligible
        vm.prank(owner);
        nft.setMinCheckInterval(0);

        // Warp past event + 6 hours (expiry threshold)
        vm.warp(eventDate + 6 hours + 1);

        // checkUpkeep should flag the ticket
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for expired ticket");

        // performUpkeep processes the expiration
        nft.performUpkeep(performData);

        // Ticket should be EXPIRED
        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.EXPIRED));
        assertEq(nft.getActiveTicketCount(), 0);
    }

    // =========================================================================
    // TEST 11: Seat update (dynamic metadata)
    // =========================================================================

    function test_SeatUpdate_DynamicMetadata() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Venue updates the seat
        vm.prank(venueOp);
        nft.updateSeat(tokenId, "B", "10", "25", ConcertTicketNFT.SeatingTier.BACKSTAGE);

        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(t.section, "B");
        assertEq(t.row, "10");
        assertEq(t.seatNumber, "25");
        assertEq(uint8(t.seatingTier), uint8(ConcertTicketNFT.SeatingTier.BACKSTAGE));

        // Metadata version should have incremented (issued=1, seat change=2)
        assertEq(t.metadataVersion, 2);

        // History should have one entry
        ConcertTicketNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 1);
        assertEq(history[0].field, "seat");
    }

    // =========================================================================
    // TEST 12: Event date update (dynamic metadata)
    // =========================================================================

    function test_EventDateUpdate_DynamicMetadata() public {
        uint256 tokenId = _issueTicket(alice, 0);

        uint256 newEventDate = eventDate + 14 days;
        uint256 newDoorsOpen = newEventDate - 2 hours;

        // Venue reschedules the event
        vm.prank(venueOp);
        nft.updateEventDate(tokenId, newEventDate, newDoorsOpen);

        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(t.eventDate, newEventDate);
        assertEq(t.doorsOpen, newDoorsOpen);

        // Metadata version should have incremented (issued=1, date change=2)
        assertEq(t.metadataVersion, 2);

        // History should have one entry
        ConcertTicketNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 1);
        assertEq(history[0].field, "eventDate");
    }

    // =========================================================================
    // TEST 13: Resale price cap update
    // =========================================================================

    function test_ResalePriceCapUpdate() public {
        uint256 tokenId = _issueTicket(alice, 0);

        uint256 newCap = 1.5 ether;

        // Venue updates the resale price cap
        vm.prank(venueOp);
        nft.updateResalePriceCap(tokenId, newCap);

        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(t.resalePriceCap, newCap);

        // Metadata version should have incremented (issued=1, cap change=2)
        assertEq(t.metadataVersion, 2);

        // History should have one entry
        ConcertTicketNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 1);
        assertEq(history[0].field, "resalePriceCap");
    }

    // =========================================================================
    // TEST 14: Age verification
    // =========================================================================

    function test_AgeVerification() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Verify age is not set initially
        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertFalse(t.ageVerified);

        // Venue verifies age
        vm.prank(venueOp);
        nft.verifyAge(tokenId);

        t = nft.getTicketData(tokenId);
        assertTrue(t.ageVerified, "Age should be verified");
    }

    // =========================================================================
    // TEST 15: Role guard -- stranger cannot issue ticket
    // =========================================================================

    function test_RoleGuard_StrangerCannotIssue() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(ConcertTicketNFT.NotAgent.selector));
        nft.issueTicket(
            alice,
            "VEN-001",
            "Dubai Arena",
            "Summer Fest 2024",
            "DJ Premier",
            eventDate,
            doorsOpen,
            "A",
            "5",
            "12",
            ConcertTicketNFT.SeatingTier.VIP,
            0.5 ether,
            0.75 ether,
            "Fan Name",
            3,
            true
        );
    }

    // =========================================================================
    // TEST 16: Role guard -- agent cannot close ticket (requires venue)
    // =========================================================================

    function test_RoleGuard_AgentCannotClose() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Advance through lifecycle to USED
        vm.prank(venueOp);
        nft.admitFan(tokenId);

        vm.prank(venueOp);
        nft.markUsed(tokenId);

        // Agent (not venue) tries to close
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(ConcertTicketNFT.NotVenue.selector));
        nft.closeTicket(tokenId);
    }

    // =========================================================================
    // TEST 17: Pause blocks transfer, unpause allows it
    // =========================================================================

    function test_Pause_BlocksTransfer() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Owner pauses the contract
        vm.prank(owner);
        nft.pause();

        // Transfer should revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ConcertTicketNFT.ContractPaused.selector));
        nft.transferFrom(alice, bob, tokenId);

        // Unpause and verify transfer works
        vm.prank(owner);
        nft.unpause();

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);
        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 18: Max transfers enforced after limit
    // =========================================================================

    function test_MaxTransfers_EnforcedAfterLimit() public {
        // Issue ticket with maxTransfers = 2
        vm.prank(agent);
        uint256 tokenId = nft.issueTicket(
            alice,
            "VEN-001",
            "Dubai Arena",
            "Summer Fest 2024",
            "DJ Premier",
            eventDate,
            doorsOpen,
            "A",
            "5",
            "12",
            ConcertTicketNFT.SeatingTier.VIP,
            0.5 ether,
            0.75 ether,
            "Fan Name",
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
            abi.encodeWithSelector(ConcertTicketNFT.MaxTransfersReached.selector, tokenId, uint8(2))
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 19: Metadata version increments on each change
    // =========================================================================

    function test_MetadataVersion_IncrementsOnEachChange() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Version starts at 1 after issuance
        assertEq(nft.getMetadataVersion(tokenId), 1);

        // Seat update -> 2
        vm.prank(venueOp);
        nft.updateSeat(tokenId, "B", "10", "25", ConcertTicketNFT.SeatingTier.FLOOR);
        assertEq(nft.getMetadataVersion(tokenId), 2);

        // Admit -> 3
        vm.prank(venueOp);
        nft.admitFan(tokenId);
        assertEq(nft.getMetadataVersion(tokenId), 3);

        // Mark used -> 4
        vm.prank(venueOp);
        nft.markUsed(tokenId);
        assertEq(nft.getMetadataVersion(tokenId), 4);
    }

    // =========================================================================
    // TEST 20: Cancel from ISSUED status
    // =========================================================================

    function test_Cancel_FromIssued() public {
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(venueOp);
        nft.cancelTicket(tokenId, "Event cancelled");

        ConcertTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(ConcertTicketNFT.TicketStatus.CANCELLED));
        assertTrue(nft.refundPending(tokenId), "Refund should be pending");
    }

    // =========================================================================
    // TEST 21: Cancel from ADMITTED status reverts (not cancellable)
    // =========================================================================

    function test_Cancel_FromAdmitted_Reverts() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Admit fan
        vm.prank(venueOp);
        nft.admitFan(tokenId);

        // Attempt to cancel from ADMITTED -- should revert
        vm.prank(venueOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConcertTicketNFT.StatusNotCancellable.selector,
                tokenId,
                ConcertTicketNFT.TicketStatus.ADMITTED
            )
        );
        nft.cancelTicket(tokenId, "Too late");
    }

    // =========================================================================
    // TEST 22: Invalid transition -- markUsed without admission
    // =========================================================================

    function test_InvalidTransition_AdmitWithoutIssue() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Attempt to markUsed directly from ISSUED (expected ADMITTED)
        vm.prank(venueOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                ConcertTicketNFT.InvalidStatus.selector,
                tokenId,
                ConcertTicketNFT.TicketStatus.ISSUED,
                ConcertTicketNFT.TicketStatus.ADMITTED
            )
        );
        nft.markUsed(tokenId);
    }

    // =========================================================================
    // TEST 23: Non-transferable ticket cannot be transferred
    // =========================================================================

    function test_NonTransferable_TransferReverts() public {
        uint256 tokenId = _issueNonTransferable(alice);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ConcertTicketNFT.TicketNotTransferable.selector, tokenId)
        );
        nft.transferFrom(alice, bob, tokenId);
    }
}
