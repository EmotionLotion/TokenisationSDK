// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IdentityRegistry} from "../src/identity/IdentityRegistry.sol";
import {ComplianceToken} from "../src/tokens/ComplianceToken.sol";
import {ChainlinkPriceFeed} from "../src/oracles/ChainlinkPriceFeed.sol";
import {OracleRegistry} from "../src/oracles/OracleRegistry.sol";
import {ModularCompliance} from "../src/compliance/ModularCompliance.sol";
import {TrustedIssuersRegistry} from "../src/compliance/TrustedIssuersRegistry.sol";
import {ClaimTopicsRegistry} from "../src/compliance/ClaimTopicsRegistry.sol";
import {DividendDistributor} from "../src/distribution/DividendDistributor.sol";

/**
 * @title Multi-Chain Deployment Script
 * @notice Deploys the tokenization platform to multiple chains
 * @dev Usage:
 *   For Sepolia:     forge script script/DeployMultiChain.s.sol --rpc-url $SEPOLIA_RPC --broadcast
 *   For Base Sepolia: forge script script/DeployMultiChain.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
 *   For Polygon:     forge script script/DeployMultiChain.s.sol --rpc-url $POLYGON_RPC --broadcast
 */
contract DeployMultiChain is Script {
    // Chain IDs
    uint256 constant ETHEREUM_MAINNET = 1;
    uint256 constant POLYGON = 137;
    uint256 constant BASE = 8453;
    uint256 constant ARBITRUM = 42161;
    uint256 constant OPTIMISM = 10;
    uint256 constant SEPOLIA = 11155111;
    uint256 constant BASE_SEPOLIA = 84532;
    uint256 constant ARBITRUM_SEPOLIA = 421614;

    // Chainlink Price Feed Addresses by chain
    mapping(uint256 => address) public ethUsdFeeds;
    mapping(uint256 => address) public linkTokens;

    // Deployed addresses
    struct DeployedContracts {
        address identityRegistry;
        address claimTopicsRegistry;
        address trustedIssuersRegistry;
        address modularCompliance;
        address oracleRegistry;
        address priceFeed;
        address dividendDistributor;
    }

    function setUp() public {
        // ETH/USD Price Feeds
        ethUsdFeeds[ETHEREUM_MAINNET] = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;
        ethUsdFeeds[POLYGON] = 0xF9680D99D6C9589e2a93a78A04A279e509205945;
        ethUsdFeeds[BASE] = 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70;
        ethUsdFeeds[ARBITRUM] = 0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612;
        ethUsdFeeds[OPTIMISM] = 0x13e3Ee699D1909E989722E753853AE30b17e08c5;
        ethUsdFeeds[SEPOLIA] = 0x694AA1769357215DE4FAC081bf1f309aDC325306;
        ethUsdFeeds[BASE_SEPOLIA] = 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1;

        // LINK Token Addresses
        linkTokens[ETHEREUM_MAINNET] = 0x514910771AF9Ca656af840dff83E8264EcF986CA;
        linkTokens[POLYGON] = 0xb0897686c545045aFc77CF20eC7A532E3120E0F1;
        linkTokens[BASE] = 0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196;
        linkTokens[ARBITRUM] = 0xf97f4df75117a78c1A5a0DBb814Af92458539FB4;
        linkTokens[OPTIMISM] = 0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6;
        linkTokens[SEPOLIA] = 0x779877A7B0D9E8603169DdbD7836e478b4624789;
        linkTokens[BASE_SEPOLIA] = 0xE4aB69C077896252FAFBD49EFD26B5D171A32410;
    }

    function run() public returns (DeployedContracts memory) {
        uint256 chainId = block.chainid;
        console.log("Deploying to chain:", chainId);
        console.log("Chain name:", getChainName(chainId));

        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerPrivateKey);

        DeployedContracts memory contracts = deployCore(chainId);

        vm.stopBroadcast();

        logDeployedAddresses(contracts);

        return contracts;
    }

    function deployCore(uint256 chainId) internal returns (DeployedContracts memory) {
        DeployedContracts memory contracts;

        // 1. Deploy Identity Registry
        IdentityRegistry identityRegistry = new IdentityRegistry();
        contracts.identityRegistry = address(identityRegistry);
        console.log("IdentityRegistry deployed:", contracts.identityRegistry);

        // 2. Deploy Claim Topics Registry
        ClaimTopicsRegistry claimTopicsRegistry = new ClaimTopicsRegistry(msg.sender);
        contracts.claimTopicsRegistry = address(claimTopicsRegistry);
        console.log("ClaimTopicsRegistry deployed:", contracts.claimTopicsRegistry);

        // 3. Deploy Trusted Issuers Registry
        TrustedIssuersRegistry trustedIssuersRegistry = new TrustedIssuersRegistry(msg.sender);
        contracts.trustedIssuersRegistry = address(trustedIssuersRegistry);
        console.log("TrustedIssuersRegistry deployed:", contracts.trustedIssuersRegistry);

        // 4. Deploy Modular Compliance
        ModularCompliance modularCompliance = new ModularCompliance(msg.sender);
        contracts.modularCompliance = address(modularCompliance);
        console.log("ModularCompliance deployed:", contracts.modularCompliance);

        // 5. Deploy Price Feed first (if Chainlink available on this chain)
        if (ethUsdFeeds[chainId] != address(0)) {
            ChainlinkPriceFeed priceFeed = new ChainlinkPriceFeed(ethUsdFeeds[chainId]);
            contracts.priceFeed = address(priceFeed);
            console.log("ChainlinkPriceFeed deployed:", contracts.priceFeed);
        }

        // 6. Deploy Oracle Registry (with price feed if available)
        OracleRegistry oracleRegistry = new OracleRegistry(
            msg.sender,
            contracts.priceFeed != address(0) ? contracts.priceFeed : address(0)
        );
        contracts.oracleRegistry = address(oracleRegistry);
        console.log("OracleRegistry deployed:", contracts.oracleRegistry);

        // 7. Deploy Dividend Distributor
        DividendDistributor dividendDistributor = new DividendDistributor(msg.sender);
        contracts.dividendDistributor = address(dividendDistributor);
        console.log("DividendDistributor deployed:", contracts.dividendDistributor);

        return contracts;
    }

    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == ETHEREUM_MAINNET) return "Ethereum Mainnet";
        if (chainId == POLYGON) return "Polygon";
        if (chainId == BASE) return "Base";
        if (chainId == ARBITRUM) return "Arbitrum One";
        if (chainId == OPTIMISM) return "Optimism";
        if (chainId == SEPOLIA) return "Sepolia";
        if (chainId == BASE_SEPOLIA) return "Base Sepolia";
        if (chainId == ARBITRUM_SEPOLIA) return "Arbitrum Sepolia";
        return "Unknown";
    }

    function isTestnet(uint256 chainId) internal pure returns (bool) {
        return chainId == SEPOLIA || chainId == BASE_SEPOLIA || chainId == ARBITRUM_SEPOLIA;
    }

    function logDeployedAddresses(DeployedContracts memory contracts) internal pure {
        console.log("\n========== DEPLOYED CONTRACTS ==========");
        console.log("IdentityRegistry:       ", contracts.identityRegistry);
        console.log("ClaimTopicsRegistry:    ", contracts.claimTopicsRegistry);
        console.log("TrustedIssuersRegistry: ", contracts.trustedIssuersRegistry);
        console.log("ModularCompliance:      ", contracts.modularCompliance);
        console.log("OracleRegistry:         ", contracts.oracleRegistry);
        console.log("ChainlinkPriceFeed:     ", contracts.priceFeed);
        console.log("DividendDistributor:    ", contracts.dividendDistributor);
        console.log("=========================================\n");
    }
}

/**
 * @title Deploy Token Script
 * @notice Deploys a compliance token linked to existing infrastructure
 */
contract DeployToken is Script {
    function run(
        address identityRegistry,
        string memory name,
        string memory symbol
    ) public returns (address) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        ComplianceToken token = new ComplianceToken(
            name,
            symbol,
            identityRegistry
        );

        console.log("ComplianceToken deployed:", address(token));
        console.log("  Name:", name);
        console.log("  Symbol:", symbol);

        vm.stopBroadcast();

        return address(token);
    }
}
