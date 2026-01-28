// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/factory/TokenFactory.sol";
import "../src/identity/IdentityRegistry.sol";
import "../src/tokens/ComplianceToken.sol";
import "../src/tokens/AirlineTicketNFT.sol";

/**
 * @title Deploy
 * @notice Deployment script for AHOY Tokenisation contracts
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
 */
contract Deploy is Script {
    // Deployed contract addresses
    address public identityRegistry;
    address public tokenFactory;
    address public sampleToken;
    address public airlineTicketNFT;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);

        console.log("===========================================");
        console.log("AHOY Tokenisation - Contract Deployment");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Identity Registry
        console.log("1. Deploying IdentityRegistry...");
        IdentityRegistry registry = new IdentityRegistry();
        identityRegistry = address(registry);
        console.log("   IdentityRegistry:", identityRegistry);

        // 2. Deploy Token Factory
        console.log("2. Deploying TokenFactory...");
        TokenFactory factory = new TokenFactory();
        tokenFactory = address(factory);
        console.log("   TokenFactory:", tokenFactory);

        // 3. Deploy sample compliance token for testing
        console.log("3. Deploying sample ComplianceToken...");
        bytes32 salt = keccak256(abi.encodePacked("AHOY_SAMPLE_TOKEN_V1"));
        sampleToken = factory.deployComplianceToken(
            "AHOY Sample Token",
            "AHOY",
            1_000_000 * 10**18, // 1M tokens
            identityRegistry,
            salt,
            deployer // Initial owner
        );
        console.log("   SampleToken:", sampleToken);

        // 4. Setup initial identities for testing
        console.log("4. Setting up test identities...");

        // Country codes: 784 = UAE, 840 = US (ISO 3166-1 numeric)
        uint16 UAE_COUNTRY = 784;
        uint16 US_COUNTRY = 840;

        // Add deployer as verified
        registry.registerIdentity(deployer, deployer, UAE_COUNTRY);
        console.log("   Registered deployer as verified identity");

        // Add test accounts (Anvil default accounts)
        address testAccount1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address testAccount2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        address testAccount3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

        registry.registerIdentity(testAccount1, testAccount1, UAE_COUNTRY);
        registry.registerIdentity(testAccount2, testAccount2, UAE_COUNTRY);
        registry.registerIdentity(testAccount3, testAccount3, US_COUNTRY);

        console.log("   Registered 3 test accounts");

        // 5. Deploy AirlineTicketNFT
        console.log("5. Deploying AirlineTicketNFT...");
        AirlineTicketNFT ticketNFT = new AirlineTicketNFT(
            "AHOY Airline Tickets",
            "AHOY-TKT",
            "https://api.ahoy.io/tickets/metadata/"
        );
        airlineTicketNFT = address(ticketNFT);
        console.log("   AirlineTicketNFT:", airlineTicketNFT);

        // Configure ticket operators
        ticketNFT.addAirline(testAccount1);
        ticketNFT.addAgent(testAccount2);
        console.log("   Added airline operator:", testAccount1);
        console.log("   Added booking agent:", testAccount2);

        vm.stopBroadcast();

        // Output summary
        console.log("");
        console.log("===========================================");
        console.log("Deployment Complete!");
        console.log("===========================================");
        console.log("");
        console.log("Contract Addresses:");
        console.log("  IdentityRegistry:", identityRegistry);
        console.log("  TokenFactory:", tokenFactory);
        console.log("  SampleToken:", sampleToken);
        console.log("  AirlineTicketNFT:", airlineTicketNFT);
        console.log("");
        console.log("Test Accounts (pre-verified):");
        console.log("  Account 1:", testAccount1, "(UAE)");
        console.log("  Account 2:", testAccount2, "(UAE)");
        console.log("  Account 3:", testAccount3, "(US)");
        console.log("");
    }
}
