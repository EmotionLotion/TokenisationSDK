// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/tokens/AirlineTicketNFT.sol";
import "../src/identity/IdentityRegistry.sol";

/**
 * @title DeployAirlineTicket
 * @notice Deployment script for AirlineTicketNFT contract with Chainlink Automation setup
 * @dev Run with: forge script script/DeployAirlineTicket.s.sol --rpc-url $RPC_URL --broadcast
 *
 * This deploys:
 * 1. AirlineTicketNFT contract
 * 2. Configures airline operators and booking agents
 * 3. Issues sample tickets for testing
 */
contract DeployAirlineTicket is Script {
    address public airlineTicketNFT;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "DEPLOYER_PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("AHOY - AirlineTicketNFT Deployment");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AirlineTicketNFT
        console.log("1. Deploying AirlineTicketNFT...");
        AirlineTicketNFT nft = new AirlineTicketNFT(
            "AHOY Airline Tickets",
            "AHOY-TKT",
            "https://api.ahoy.io/tickets/metadata/"
        );
        airlineTicketNFT = address(nft);
        console.log("   AirlineTicketNFT:", airlineTicketNFT);

        // 2. Configure operators
        console.log("2. Configuring operators...");

        // Anvil test accounts as airline operators and agents
        address airlineOp1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address airlineOp2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        address bookingAgent = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

        nft.addAirline(airlineOp1);
        nft.addAirline(airlineOp2);
        nft.addAgent(bookingAgent);

        console.log("   Added airline operator 1:", airlineOp1);
        console.log("   Added airline operator 2:", airlineOp2);
        console.log("   Added booking agent:", bookingAgent);

        // 3. Issue sample test tickets
        console.log("3. Issuing sample tickets...");

        address passenger1 = 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;
        address passenger2 = 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc;

        // Sample flight: EK123 DXB->LHR in 7 days
        uint256 departureTime = block.timestamp + 7 days;
        uint256 arrivalTime = departureTime + 7 hours;

        uint256 ticket1 = nft.issueTicket(
            passenger1,
            "EK123",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            "A12",
            "12A",
            AirlineTicketNFT.TicketClass.BUSINESS,
            3,  // max 3 transfers
            true // transferable
        );
        console.log("   Ticket 1 (Business):", ticket1);

        uint256 ticket2 = nft.issueTicket(
            passenger2,
            "EK123",
            "EK",
            departureTime,
            arrivalTime,
            "DXB",
            "LHR",
            "A12",
            "28C",
            AirlineTicketNFT.TicketClass.ECONOMY,
            1,  // max 1 transfer
            true
        );
        console.log("   Ticket 2 (Economy):", ticket2);

        vm.stopBroadcast();

        // Output summary
        console.log("");
        console.log("===========================================");
        console.log("Deployment Complete!");
        console.log("===========================================");
        console.log("");
        console.log("Contract Addresses:");
        console.log("  AirlineTicketNFT:", airlineTicketNFT);
        console.log("");
        console.log("Airline Operators:");
        console.log("  Operator 1:", airlineOp1);
        console.log("  Operator 2:", airlineOp2);
        console.log("  Booking Agent:", bookingAgent);
        console.log("");
        console.log("Test Tickets:");
        console.log("  Ticket 1 (Business, passenger1):", ticket1);
        console.log("  Ticket 2 (Economy, passenger2):", ticket2);
        console.log("");
        console.log("Passengers:");
        console.log("  Passenger 1:", passenger1);
        console.log("  Passenger 2:", passenger2);
        console.log("");
    }
}
