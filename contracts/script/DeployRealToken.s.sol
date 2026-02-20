// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/tokens/RealToken.sol";
import "../src/identity/IdentityRegistry.sol";
import "../src/compliance/ModularCompliance.sol";

/**
 * @title DeployRealToken
 * @notice Deployment script for RealToken (ERC-3643) with supporting infrastructure
 * @dev Run with: forge script script/DeployRealToken.s.sol --rpc-url $RPC_URL --broadcast
 *
 * Environment variables:
 *   DEPLOYER_PRIVATE_KEY     - Private key for deployment (defaults to Anvil account 0)
 *   TOKEN_NAME               - Token name (default: "AHOY Real Estate Token")
 *   TOKEN_SYMBOL             - Token symbol (default: "AHOY-RE")
 *   TOKEN_DECIMALS           - Token decimals (default: 18)
 *   INITIAL_SUPPLY           - Initial mint amount in whole tokens (default: 0, no initial mint)
 *   IDENTITY_REGISTRY        - Existing IdentityRegistry address (deploys new one if not set)
 *   COMPLIANCE               - Existing ModularCompliance address (deploys new one if not set)
 *   SKIP_TEST_IDENTITIES     - Set to "true" to skip registering test accounts
 */
contract DeployRealToken is Script {
    // Deployed contract addresses
    address public identityRegistry;
    address public compliance;
    address public realToken;

    function run() external {
        uint256 deployerPrivateKey = vm.envOr(
            "DEPLOYER_PRIVATE_KEY",
            uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80)
        );
        address deployer = vm.addr(deployerPrivateKey);

        // Read token configuration from environment
        string memory tokenName = vm.envOr("TOKEN_NAME", string("AHOY Real Estate Token"));
        string memory tokenSymbol = vm.envOr("TOKEN_SYMBOL", string("AHOY-RE"));
        uint8 tokenDecimals = uint8(vm.envOr("TOKEN_DECIMALS", uint256(18)));
        uint256 initialSupply = vm.envOr("INITIAL_SUPPLY", uint256(0));
        bool skipTestIdentities = vm.envOr("SKIP_TEST_IDENTITIES", false);

        // Check for existing infrastructure addresses
        address existingRegistry = vm.envOr("IDENTITY_REGISTRY", address(0));
        address existingCompliance = vm.envOr("COMPLIANCE", address(0));

        console.log("===========================================");
        console.log("AHOY Tokenisation - RealToken Deployment");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Token Name:", tokenName);
        console.log("Token Symbol:", tokenSymbol);
        console.log("Token Decimals:", uint256(tokenDecimals));
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy or reuse IdentityRegistry
        if (existingRegistry != address(0)) {
            identityRegistry = existingRegistry;
            console.log("1. Using existing IdentityRegistry:", identityRegistry);
        } else {
            console.log("1. Deploying IdentityRegistry...");
            IdentityRegistry registry = new IdentityRegistry();
            identityRegistry = address(registry);
            console.log("   IdentityRegistry:", identityRegistry);
        }

        // 2. Deploy or reuse ModularCompliance
        if (existingCompliance != address(0)) {
            compliance = existingCompliance;
            console.log("2. Using existing ModularCompliance:", compliance);
        } else {
            console.log("2. Deploying ModularCompliance...");
            ModularCompliance complianceContract = new ModularCompliance(deployer);
            compliance = address(complianceContract);
            console.log("   ModularCompliance:", compliance);
        }

        // 3. Deploy RealToken
        console.log("3. Deploying RealToken...");
        RealToken token = new RealToken(
            tokenName,
            tokenSymbol,
            tokenDecimals,
            deployer,
            identityRegistry,
            compliance
        );
        realToken = address(token);
        console.log("   RealToken:", realToken);

        // 4. Bind token to compliance (if we deployed a new compliance contract)
        if (existingCompliance == address(0)) {
            console.log("4. Binding RealToken to ModularCompliance...");
            ModularCompliance(compliance).bindToken(realToken);
            console.log("   Token bound to compliance");
        } else {
            console.log("4. Skipping compliance binding (using existing compliance)");
        }

        // 5. Setup test identities (unless skipped)
        if (!skipTestIdentities && existingRegistry == address(0)) {
            console.log("5. Setting up test identities...");

            // Country codes: 784 = UAE, 840 = US (ISO 3166-1 numeric)
            uint16 UAE_COUNTRY = 784;
            uint16 US_COUNTRY = 840;

            // Register deployer as verified
            IdentityRegistry(identityRegistry).registerIdentity(deployer, deployer, UAE_COUNTRY);
            console.log("   Registered deployer as verified identity (UAE)");

            // Register Anvil default test accounts
            address testAccount1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
            address testAccount2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
            address testAccount3 = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

            IdentityRegistry(identityRegistry).registerIdentity(testAccount1, testAccount1, UAE_COUNTRY);
            IdentityRegistry(identityRegistry).registerIdentity(testAccount2, testAccount2, UAE_COUNTRY);
            IdentityRegistry(identityRegistry).registerIdentity(testAccount3, testAccount3, US_COUNTRY);

            console.log("   Registered 3 test accounts");
        } else {
            console.log("5. Skipping test identity setup");
        }

        // 6. Mint initial supply (if specified)
        if (initialSupply > 0) {
            console.log("6. Minting initial supply...");
            uint256 mintAmount = initialSupply * 10 ** uint256(tokenDecimals);
            token.mint(deployer, mintAmount);
            console.log("   Minted", initialSupply, "tokens to deployer");
        } else {
            console.log("6. Skipping initial mint (INITIAL_SUPPLY=0)");
        }

        vm.stopBroadcast();

        // Output summary
        console.log("");
        console.log("===========================================");
        console.log("RealToken Deployment Complete!");
        console.log("===========================================");
        console.log("");
        console.log("Contract Addresses:");
        console.log("  IdentityRegistry:", identityRegistry);
        console.log("  ModularCompliance:", compliance);
        console.log("  RealToken:", realToken);
        console.log("");
        console.log("Token Configuration:");
        console.log("  Name:", tokenName);
        console.log("  Symbol:", tokenSymbol);
        console.log("  Decimals:", uint256(tokenDecimals));
        console.log("  Initial Supply:", initialSupply);
        console.log("");

        if (!skipTestIdentities && existingRegistry == address(0)) {
            console.log("Test Accounts (pre-verified):");
            console.log("  Account 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (UAE)");
            console.log("  Account 2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (UAE)");
            console.log("  Account 3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (US)");
            console.log("");
        }
    }
}
