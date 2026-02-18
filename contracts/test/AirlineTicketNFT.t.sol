// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/tokens/AirlineTicketNFT.sol";

/**
 * @title AirlineTicketNFTTest
 * @notice Foundry tests for AirlineTicketNFT lifecycle, transfer guards,
 *         dynamic metadata, Chainlink Automation, and access control.
 * @dev Run with: forge test --match-contract AirlineTicketNFTTest -vvv
 */
contract AirlineTicketNFTTest is Test {
    AirlineTicketNFT public nft;

    address public owner = address(1);
    address public airlineOp = address(2);
    address public agent = address(3);
    address public alice = address(4);
    address public bob = address(5);
    address public stranger = address(6);

    // Departure 7 days from now, arrival 10 hours later
    uint256 public departureTime;
    uint256 public arrivalTime;

    function setUp() public {
        vm.warp(1_700_000_000); // deterministic start time

        departureTime = block.timestamp + 7 days;
        arrivalTime = departureTime + 10 hours;

        vm.startPrank(owner);
        nft = new AirlineTicketNFT("AirTicket", "ATKT", "https://api.airline.io/ticket/");

        // owner is already airline (set in constructor); add extra airline operator and agent
        nft.addAirline(airlineOp);
        nft.addAgent(agent);
        vm.stopPrank();

        // Fund the contract so refund tests can pay out
        vm.deal(address(nft), 10 ether);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /// @dev Issue a standard economy ticket to `to` with default flight data.
    ///      Sends `value` wei along with the call (stored as pricePaid).
    function _issueTicket(address to, uint256 value) internal returns (uint256 tokenId) {
        if (value > 0) vm.deal(agent, value);
        vm.prank(agent);
        tokenId = nft.issueTicket{value: value}(
            to,
            "EK501",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            "B22",
            "12A",
            AirlineTicketNFT.TicketClass.ECONOMY,
            3,   // maxTransfers
            true // transferable
        );
    }

    /// @dev Issue a non-transferable ticket.
    function _issueNonTransferable(address to) internal returns (uint256 tokenId) {
        vm.prank(agent);
        tokenId = nft.issueTicket(
            to,
            "EK501",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            "B22",
            "12A",
            AirlineTicketNFT.TicketClass.ECONOMY,
            0,    // maxTransfers
            false // not transferable
        );
    }

    // =========================================================================
    // TEST 1: Full lifecycle -- issue -> check-in -> board -> complete (burn)
    // =========================================================================

    function test_FullLifecycle_Issue_CheckIn_Board_Complete() public {
        // Issue
        uint256 tokenId = _issueTicket(alice, 0.5 ether);
        assertEq(nft.ownerOf(tokenId), alice);

        AirlineTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(AirlineTicketNFT.TicketStatus.ISSUED));

        // Check in
        vm.prank(agent);
        nft.checkIn(tokenId);
        t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(AirlineTicketNFT.TicketStatus.CHECKED_IN));

        // Board
        vm.prank(agent);
        nft.board(tokenId);
        t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(AirlineTicketNFT.TicketStatus.BOARDED));

        // Complete and burn (airline-only)
        vm.prank(airlineOp);
        nft.completeAndBurn(tokenId);

        // Token should no longer exist
        vm.expectRevert("AirlineTicketNFT: nonexistent token");
        nft.ownerOf(tokenId);
    }

    // =========================================================================
    // TEST 2: Transfer window -- allowed >24h before departure
    // =========================================================================

    function test_TransferWindow_Allowed_MoreThan24h() public {
        // Current time is 7 days before departure, well outside 24h cutoff
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);

        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 3: Transfer window -- blocked <24h before departure
    // =========================================================================

    function test_TransferWindow_Blocked_LessThan24h() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Warp to exactly 24h before departure (cutoff boundary)
        vm.warp(departureTime - 24 hours);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                AirlineTicketNFT.TransferWindowClosed.selector,
                tokenId,
                departureTime
            )
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 4: Post-check-in transfer lock
    // =========================================================================

    function test_PostCheckIn_TransferBlocked() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Check in the ticket
        vm.prank(agent);
        nft.checkIn(tokenId);

        // Attempt transfer -- should revert with TicketLockedAfterCheckIn
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AirlineTicketNFT.TicketLockedAfterCheckIn.selector, tokenId)
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 5: Batch ticket issuance
    // =========================================================================

    function test_BatchIssue_MultiplePax() public {
        address[] memory passengers = new address[](3);
        passengers[0] = alice;
        passengers[1] = bob;
        passengers[2] = stranger;

        string[] memory gates = new string[](1);
        gates[0] = "B22";

        string[] memory seats = new string[](3);
        seats[0] = "1A";
        seats[1] = "1B";
        seats[2] = "1C";

        AirlineTicketNFT.TicketClass[] memory classes = new AirlineTicketNFT.TicketClass[](3);
        classes[0] = AirlineTicketNFT.TicketClass.BUSINESS;
        classes[1] = AirlineTicketNFT.TicketClass.BUSINESS;
        classes[2] = AirlineTicketNFT.TicketClass.ECONOMY;

        vm.prank(agent);
        uint256[] memory ids = nft.batchIssueTickets(
            passengers,
            "EK501",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            gates,
            seats,
            classes,
            2,
            true
        );

        assertEq(ids.length, 3);
        assertEq(nft.ownerOf(ids[0]), alice);
        assertEq(nft.ownerOf(ids[1]), bob);
        assertEq(nft.ownerOf(ids[2]), stranger);
        assertEq(nft.balanceOf(alice), 1);
    }

    // =========================================================================
    // TEST 6: Gate update (dynamic metadata)
    // =========================================================================

    function test_GateUpdate_DynamicMetadata() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Airline changes the gate
        vm.prank(airlineOp);
        nft.updateGate(tokenId, "C15");

        AirlineTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(t.gate, "C15");

        // Metadata version should have incremented (issued=1, gate change=2)
        assertEq(t.metadataVersion, 2);

        // History should have one entry
        AirlineTicketNFT.MetadataChange[] memory history = nft.getMetadataHistory(tokenId);
        assertEq(history.length, 1);
        assertEq(history[0].field, "gate");
        assertEq(history[0].newValue, "C15");
    }

    // =========================================================================
    // TEST 7: Seat upgrade (dynamic metadata)
    // =========================================================================

    function test_SeatUpgrade_DynamicMetadata() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Airline upgrades seat from economy 12A to business 2F
        vm.prank(airlineOp);
        nft.updateSeat(tokenId, "2F", AirlineTicketNFT.TicketClass.BUSINESS);

        AirlineTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(t.seat, "2F");
        assertEq(uint8(t.ticketClass), uint8(AirlineTicketNFT.TicketClass.BUSINESS));
        assertEq(t.metadataVersion, 2);
    }

    // =========================================================================
    // TEST 8: Automation -- expire old tickets via checkUpkeep / performUpkeep
    // =========================================================================

    function test_Automation_ExpireOldTickets() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Set minCheckInterval to 0 so upkeep is always eligible
        vm.prank(owner);
        nft.setMinCheckInterval(0);

        // Warp past departure + 6 hours (expiry threshold)
        vm.warp(departureTime + 6 hours + 1);

        // checkUpkeep should flag the ticket
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for expired ticket");

        // performUpkeep processes the expiration
        nft.performUpkeep(performData);

        // Ticket should still exist (EXPIRED, not burned) but removed from active set
        AirlineTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(AirlineTicketNFT.TicketStatus.EXPIRED));
        assertEq(nft.getActiveTicketCount(), 0);
    }

    // =========================================================================
    // TEST 9: Automation -- auto-refund via checkUpkeep / performUpkeep
    // =========================================================================

    function test_Automation_AutoRefundCancelled() public {
        uint256 pricePaid = 1 ether;
        uint256 tokenId = _issueTicket(alice, pricePaid);

        // Airline cancels the ticket (sets refundPending = true)
        vm.prank(airlineOp);
        nft.cancelTicket(tokenId, "Flight cancelled");

        // Set minCheckInterval to 0 and warp so lastUpkeepTime check passes
        vm.prank(owner);
        nft.setMinCheckInterval(0);
        vm.warp(block.timestamp + 1);

        // Record alice's balance before refund
        uint256 aliceBefore = alice.balance;

        // checkUpkeep should find the cancelled ticket with pending refund
        (bool upkeepNeeded, bytes memory performData) = nft.checkUpkeep("");
        assertTrue(upkeepNeeded, "Upkeep should be needed for auto-refund");

        // performUpkeep processes the refund and burns the ticket
        nft.performUpkeep(performData);

        // Alice should have received the refund
        assertEq(alice.balance, aliceBefore + pricePaid, "Alice should receive refund");

        // Token should be burned (ownerOf reverts)
        vm.expectRevert("AirlineTicketNFT: nonexistent token");
        nft.ownerOf(tokenId);
    }

    // =========================================================================
    // TEST 10: Role guards -- non-authorized caller reverts
    // =========================================================================

    function test_RoleGuard_StrangerCannotIssue() public {
        // stranger is not agent, airline, or owner -- issueTicket should revert
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AirlineTicketNFT.NotAgent.selector));
        nft.issueTicket(
            alice,
            "EK501",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            "B22",
            "12A",
            AirlineTicketNFT.TicketClass.ECONOMY,
            3,
            true
        );
    }

    function test_RoleGuard_StrangerCannotCheckIn() public {
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AirlineTicketNFT.NotAgent.selector));
        nft.checkIn(tokenId);
    }

    function test_RoleGuard_AgentCannotCompleteAndBurn() public {
        // completeAndBurn requires onlyAirline, agent alone is not enough
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(agent);
        nft.checkIn(tokenId);

        vm.prank(agent);
        nft.board(tokenId);

        // Agent (not airline) tries to complete
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(AirlineTicketNFT.NotAirline.selector));
        nft.completeAndBurn(tokenId);
    }

    // =========================================================================
    // TEST 11: Pause / unpause functionality
    // =========================================================================

    function test_Pause_BlocksTransfer() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Owner pauses the contract
        vm.prank(owner);
        nft.pause();

        // Transfer should revert
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AirlineTicketNFT.ContractPaused.selector));
        nft.transferFrom(alice, bob, tokenId);

        // Unpause and verify transfer works
        vm.prank(owner);
        nft.unpause();

        vm.prank(alice);
        nft.transferFrom(alice, bob, tokenId);
        assertEq(nft.ownerOf(tokenId), bob);
    }

    // =========================================================================
    // TEST 12: Max transfer limit enforcement
    // =========================================================================

    function test_MaxTransfers_EnforcedAfterLimit() public {
        // Issue ticket with maxTransfers = 3
        vm.prank(agent);
        uint256 tokenId = nft.issueTicket(
            alice,
            "EK501",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            "B22",
            "12A",
            AirlineTicketNFT.TicketClass.ECONOMY,
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
            abi.encodeWithSelector(AirlineTicketNFT.MaxTransfersReached.selector, tokenId, uint8(2))
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 13: Refund escrow -- deposit and claim
    // =========================================================================

    function test_RefundEscrow_DepositAndClaim() public {
        uint256 pricePaid = 2 ether;
        uint256 tokenId = _issueTicket(alice, pricePaid);

        // Verify contract received the funds
        // (setUp already dealt 10 ether, plus 2 ether from issueTicket)
        assertTrue(address(nft).balance >= pricePaid, "Contract should hold ticket funds");

        // Cancel and process refund
        vm.prank(airlineOp);
        nft.cancelTicket(tokenId, "Airline schedule change");

        uint256 aliceBefore = alice.balance;
        vm.prank(airlineOp);
        nft.processRefund(tokenId);

        // Alice gets her money back
        assertEq(alice.balance, aliceBefore + pricePaid, "Refund should equal price paid");
    }

    // =========================================================================
    // TEST 14: Metadata version increments correctly
    // =========================================================================

    function test_MetadataVersion_IncrementsOnEachChange() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Version starts at 1 after issuance
        assertEq(nft.getMetadataVersion(tokenId), 1);

        // Gate change -> 2
        vm.prank(airlineOp);
        nft.updateGate(tokenId, "D10");
        assertEq(nft.getMetadataVersion(tokenId), 2);

        // Seat upgrade -> 3
        vm.prank(airlineOp);
        nft.updateSeat(tokenId, "3A", AirlineTicketNFT.TicketClass.FIRST);
        assertEq(nft.getMetadataVersion(tokenId), 3);

        // Check-in -> 4
        vm.prank(agent);
        nft.checkIn(tokenId);
        assertEq(nft.getMetadataVersion(tokenId), 4);

        // Board -> 5
        vm.prank(agent);
        nft.board(tokenId);
        assertEq(nft.getMetadataVersion(tokenId), 5);
    }

    // =========================================================================
    // TEST 15: Cancellation from ISSUED status
    // =========================================================================

    function test_Cancel_FromIssued() public {
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(airlineOp);
        nft.cancelTicket(tokenId, "Weather");

        AirlineTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(AirlineTicketNFT.TicketStatus.CANCELLED));
        assertTrue(nft.refundPending(tokenId), "Refund should be pending");
    }

    // =========================================================================
    // TEST 16: Cancellation from CHECKED_IN status
    // =========================================================================

    function test_Cancel_FromCheckedIn() public {
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(agent);
        nft.checkIn(tokenId);

        vm.prank(airlineOp);
        nft.cancelTicket(tokenId, "Gate closed");

        AirlineTicketNFT.TicketData memory t = nft.getTicketData(tokenId);
        assertEq(uint8(t.status), uint8(AirlineTicketNFT.TicketStatus.CANCELLED));
    }

    // =========================================================================
    // TEST 17: Cannot cancel from BOARDED status
    // =========================================================================

    function test_Cancel_FromBoarded_Reverts() public {
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(agent);
        nft.checkIn(tokenId);

        vm.prank(agent);
        nft.board(tokenId);

        // Cancellation from BOARDED should revert
        vm.prank(airlineOp);
        vm.expectRevert("AirlineTicketNFT: cannot cancel in current status");
        nft.cancelTicket(tokenId, "Too late");
    }

    // =========================================================================
    // TEST 18: Cannot transition to invalid states (board without check-in)
    // =========================================================================

    function test_InvalidTransition_BoardWithoutCheckIn() public {
        uint256 tokenId = _issueTicket(alice, 0);

        // Attempt to board directly from ISSUED -- should revert
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(
                AirlineTicketNFT.InvalidStatus.selector,
                tokenId,
                AirlineTicketNFT.TicketStatus.ISSUED,
                AirlineTicketNFT.TicketStatus.CHECKED_IN
            )
        );
        nft.board(tokenId);
    }

    // =========================================================================
    // TEST 19: Cannot complete without boarding
    // =========================================================================

    function test_InvalidTransition_CompleteWithoutBoard() public {
        uint256 tokenId = _issueTicket(alice, 0);

        vm.prank(agent);
        nft.checkIn(tokenId);

        // Attempt to complete from CHECKED_IN (expected BOARDED)
        vm.prank(airlineOp);
        vm.expectRevert(
            abi.encodeWithSelector(
                AirlineTicketNFT.InvalidStatus.selector,
                tokenId,
                AirlineTicketNFT.TicketStatus.CHECKED_IN,
                AirlineTicketNFT.TicketStatus.BOARDED
            )
        );
        nft.completeAndBurn(tokenId);
    }

    // =========================================================================
    // TEST 20: Non-transferable ticket cannot be transferred
    // =========================================================================

    function test_NonTransferable_TransferReverts() public {
        uint256 tokenId = _issueNonTransferable(alice);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(AirlineTicketNFT.TicketNotTransferable.selector, tokenId)
        );
        nft.transferFrom(alice, bob, tokenId);
    }

    // =========================================================================
    // TEST 21: Stranger cannot pause the contract
    // =========================================================================

    function test_RoleGuard_StrangerCannotPause() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AirlineTicketNFT.NotOwner.selector));
        nft.pause();
    }
}
