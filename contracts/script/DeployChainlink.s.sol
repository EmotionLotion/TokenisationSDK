// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/oracles/ChainlinkPriceFeed.sol";
import "../src/oracles/OracleRegistry.sol";
import "../src/oracles/FunctionsConsumer.sol";
import "../src/automation/DistributionKeeper.sol";
import "../src/automation/ComplianceKeeper.sol";

/**
 * @title DeployChainlink
 * @notice Deployment script for Chainlink integration contracts
 * @dev Run with: forge script script/DeployChainlink.s.sol --rpc-url $RPC_URL --broadcast
 */
contract DeployChainlink is Script {
    // Deployed contract addresses
    address public priceFeed;
    address public oracleRegistry;
    address public functionsConsumer;
    address public distributionKeeper;
    address public complianceKeeper;

    // Chainlink addresses by network
    // Sepolia testnet
    address constant SEPOLIA_FUNCTIONS_ROUTER = 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0;
    bytes32 constant SEPOLIA_DON_ID = 0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000; // "fun-ethereum-sepolia-1"

    // Price feed addresses (Sepolia)
    address constant SEPOLIA_ETH_USD = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
    address constant SEPOLIA_BTC_USD = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43;
    address constant SEPOLIA_LINK_USD = 0xc59E3633BAAC79493d908e63626716e204A45EdF;

    // Base Sepolia
    address constant BASE_SEPOLIA_FUNCTIONS_ROUTER = 0xf9B8fc078197181C841c296C876945aaa425B278;
    bytes32 constant BASE_SEPOLIA_DON_ID = 0x66756e2d626173652d7365706f6c69612d310000000000000000000000000000; // "fun-base-sepolia-1"

    // Price feed addresses (Base Sepolia)
    address constant BASE_SEPOLIA_ETH_USD = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;
    address constant BASE_SEPOLIA_BTC_USD = 0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298;
    address constant BASE_SEPOLIA_LINK_USD = 0xb113F5A928BCfF189C998ab20d753a47F9dE5A61;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);
        uint64 subscriptionId = uint64(vm.envOr("FUNCTIONS_SUBSCRIPTION_ID", uint256(0)));

        console.log("===========================================");
        console.log("Chainlink Integration - Contract Deployment");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // Determine network config
        address functionsRouter;
        bytes32 donId;
        address ethUsdFeed;
        address btcUsdFeed;
        address linkUsdFeed;

        if (block.chainid == 11155111) {
            // Sepolia
            functionsRouter = SEPOLIA_FUNCTIONS_ROUTER;
            donId = SEPOLIA_DON_ID;
            ethUsdFeed = SEPOLIA_ETH_USD;
            btcUsdFeed = SEPOLIA_BTC_USD;
            linkUsdFeed = SEPOLIA_LINK_USD;
            console.log("Network: Sepolia Testnet");
        } else if (block.chainid == 84532) {
            // Base Sepolia
            functionsRouter = BASE_SEPOLIA_FUNCTIONS_ROUTER;
            donId = BASE_SEPOLIA_DON_ID;
            ethUsdFeed = BASE_SEPOLIA_ETH_USD;
            btcUsdFeed = BASE_SEPOLIA_BTC_USD;
            linkUsdFeed = BASE_SEPOLIA_LINK_USD;
            console.log("Network: Base Sepolia Testnet");
        } else {
            console.log("WARNING: Unknown network, using Sepolia defaults");
            functionsRouter = SEPOLIA_FUNCTIONS_ROUTER;
            donId = SEPOLIA_DON_ID;
            ethUsdFeed = SEPOLIA_ETH_USD;
            btcUsdFeed = SEPOLIA_BTC_USD;
            linkUsdFeed = SEPOLIA_LINK_USD;
        }

        console.log("");

        // 1. Deploy Price Feed
        console.log("1. Deploying ChainlinkPriceFeed...");
        ChainlinkPriceFeed feed = new ChainlinkPriceFeed(deployer);
        priceFeed = address(feed);
        console.log("   ChainlinkPriceFeed:", priceFeed);

        // Configure price feeds
        console.log("   Configuring price feeds...");
        feed.configureFeed("ETH/USD", ethUsdFeed, 3600); // 1 hour heartbeat
        feed.configureFeed("BTC/USD", btcUsdFeed, 3600);
        feed.configureFeed("LINK/USD", linkUsdFeed, 3600);
        console.log("   Configured ETH/USD, BTC/USD, LINK/USD feeds");

        // 2. Deploy Oracle Registry
        console.log("2. Deploying OracleRegistry...");
        OracleRegistry registry = new OracleRegistry(deployer, priceFeed);
        oracleRegistry = address(registry);
        console.log("   OracleRegistry:", oracleRegistry);

        // Register the price feed oracle
        bytes32 chainlinkPriceOracleId = keccak256("chainlink-price-feed-v1");
        registry.registerOracle(
            chainlinkPriceOracleId,
            OracleRegistry.OracleType.CHAINLINK_PRICE_FEED,
            priceFeed,
            "Chainlink Price Feeds for ETH, BTC, LINK"
        );
        console.log("   Registered Chainlink Price Feed oracle");

        // 3. Deploy Functions Consumer
        console.log("3. Deploying FunctionsConsumer...");
        if (subscriptionId > 0) {
            FunctionsConsumer functions = new FunctionsConsumer(
                functionsRouter,
                subscriptionId,
                donId
            );
            functionsConsumer = address(functions);
            console.log("   FunctionsConsumer:", functionsConsumer);

            // Register functions oracle
            bytes32 functionsOracleId = keccak256("chainlink-functions-v1");
            registry.registerOracle(
                functionsOracleId,
                OracleRegistry.OracleType.CHAINLINK_FUNCTIONS,
                functionsConsumer,
                "Chainlink Functions for KYC, Valuations, Sanctions"
            );
            console.log("   Registered Chainlink Functions oracle");
        } else {
            console.log("   SKIPPED: No FUNCTIONS_SUBSCRIPTION_ID provided");
            console.log("   Set FUNCTIONS_SUBSCRIPTION_ID env var to deploy FunctionsConsumer");
        }

        // 4. Deploy Distribution Keeper
        console.log("4. Deploying DistributionKeeper...");
        DistributionKeeper distKeeper = new DistributionKeeper(deployer);
        distributionKeeper = address(distKeeper);
        console.log("   DistributionKeeper:", distributionKeeper);

        // 5. Deploy Compliance Keeper
        console.log("5. Deploying ComplianceKeeper...");
        ComplianceKeeper compKeeper = new ComplianceKeeper(deployer);
        complianceKeeper = address(compKeeper);
        console.log("   ComplianceKeeper:", complianceKeeper);

        // 6. Setup authorizations
        console.log("6. Setting up authorizations...");

        // Authorize deployer as NAV provider
        registry.setProviderAuthorization(deployer, true);
        console.log("   Authorized deployer as NAV provider");

        // Authorize deployer as KYC provider on ComplianceKeeper
        compKeeper.setProviderAuthorization(deployer, true);
        console.log("   Authorized deployer as KYC provider");

        vm.stopBroadcast();

        // Output summary
        console.log("");
        console.log("===========================================");
        console.log("Chainlink Deployment Complete!");
        console.log("===========================================");
        console.log("");
        console.log("Contract Addresses:");
        console.log("  ChainlinkPriceFeed:", priceFeed);
        console.log("  OracleRegistry:", oracleRegistry);
        if (functionsConsumer != address(0)) {
            console.log("  FunctionsConsumer:", functionsConsumer);
        }
        console.log("  DistributionKeeper:", distributionKeeper);
        console.log("  ComplianceKeeper:", complianceKeeper);
        console.log("");
        console.log("Configured Price Feeds:");
        console.log("  ETH/USD:", ethUsdFeed);
        console.log("  BTC/USD:", btcUsdFeed);
        console.log("  LINK/USD:", linkUsdFeed);
        console.log("");
        console.log("Next Steps:");
        console.log("  1. Fund DistributionKeeper with tokens for distributions");
        console.log("  2. Register Keepers with Chainlink Automation");
        console.log("  3. Configure JavaScript sources for Functions (if deployed)");
        console.log("  4. Add consumers to Functions subscription (if deployed)");
        console.log("");
    }
}
