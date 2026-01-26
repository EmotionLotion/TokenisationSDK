// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {ReputationSBT} from "../src/tokens/ReputationSBT.sol";
import {AhoyToken} from "../src/tokens/AhoyToken.sol";

/**
 * @title DeployCometDemo
 * @notice Deploys COMET demo contracts to Base Sepolia
 *
 * Usage:
 * 1. Set your private key: export PRIVATE_KEY=0x...
 * 2. Run: forge script script/DeployCometDemo.s.sol --rpc-url base_sepolia --broadcast --verify
 */
contract DeployCometDemo is Script {
    // Base Sepolia Chainlink Functions Router
    // See: https://docs.chain.link/chainlink-functions/supported-networks
    address constant CHAINLINK_FUNCTIONS_ROUTER_BASE_SEPOLIA = 0xf9B8fc078197181C841c296C876945aaa425B278;
    bytes32 constant DON_ID_BASE_SEPOLIA = 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000; // "fun-base-sepolia-1"

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AHOY Token
        AhoyToken ahoy = new AhoyToken();
        console2.log("AhoyToken deployed at:", address(ahoy));

        // 2. Deploy ReputationSBT for COMET drivers
        ReputationSBT sbt = new ReputationSBT(
            "COMET Driver Reputation",
            "COMET-SBT",
            "https://api.ahoy.io/metadata/comet-sbt/"
        );
        console2.log("ReputationSBT deployed at:", address(sbt));

        // 3. Configure: Add SBT as a minter for AHOY (so it can reward drivers)
        ahoy.addMinter(address(sbt), 1_000_000 * 1e18); // 1M AHOY limit
        console2.log("SBT added as AHOY minter with 1M limit");

        // 4. Mint initial AHOY supply for demo
        ahoy.mint(deployer, 10_000_000 * 1e18, "INITIAL_DEMO_SUPPLY");
        console2.log("Minted 10M AHOY to deployer for demo");

        vm.stopBroadcast();

        // Output deployment summary
        console2.log("");
        console2.log("=== DEPLOYMENT SUMMARY ===");
        console2.log("Network: Base Sepolia");
        console2.log("AhoyToken:", address(ahoy));
        console2.log("ReputationSBT:", address(sbt));
        console2.log("");
        console2.log("Next steps:");
        console2.log("1. Verify contracts on Basescan");
        console2.log("2. Update UI with contract addresses");
        console2.log("3. (Optional) Deploy CometFunctionsConsumer for Chainlink");
    }
}

/**
 * @title DeployChainlinkConsumer
 * @notice Separate script to deploy Chainlink Functions consumer
 * @dev Requires a Chainlink Functions subscription ID
 *
 * Usage:
 * 1. Create subscription at functions.chain.link
 * 2. Fund with LINK
 * 3. Set SUBSCRIPTION_ID env var
 * 4. Run: forge script script/DeployCometDemo.s.sol:DeployChainlinkConsumer --rpc-url base_sepolia --broadcast
 */
contract DeployChainlinkConsumer is Script {
    address constant CHAINLINK_FUNCTIONS_ROUTER = 0xf9B8fc078197181C841c296C876945aaa425B278;
    bytes32 constant DON_ID = 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        uint64 subscriptionId = uint64(vm.envUint("SUBSCRIPTION_ID"));

        console2.log("Deploying CometFunctionsConsumer...");
        console2.log("Subscription ID:", subscriptionId);

        vm.startBroadcast(deployerPrivateKey);

        // Note: This would require importing the CometFunctionsConsumer
        // and having Chainlink contracts installed
        // For now, this is a placeholder

        console2.log("CometFunctionsConsumer deployment requires:");
        console2.log("1. forge install smartcontractkit/chainlink --no-commit");
        console2.log("2. Add remappings for @chainlink/contracts");
        console2.log("3. Create Chainlink Functions subscription");

        vm.stopBroadcast();
    }
}
