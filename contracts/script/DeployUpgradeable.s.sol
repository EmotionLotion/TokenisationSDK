// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/tokens/ComplianceTokenUpgradeable.sol";
import "../src/governance/TokenGovernor.sol";
import "../src/identity/IdentityRegistry.sol";

/**
 * @title DeployUpgradeable
 * @notice Production deployment script for upgradeable AHOY contracts with governance
 * @dev Run with: forge script script/DeployUpgradeable.s.sol --rpc-url $RPC_URL --broadcast --verify
 *
 * This script deploys:
 * 1. Identity Registry (non-upgradeable, foundational)
 * 2. Token Governor (multi-sig timelock governance)
 * 3. Compliance Token Implementation
 * 4. ERC1967 Proxy pointing to the implementation
 *
 * Required environment variables:
 * - DEPLOYER_PRIVATE_KEY: Deployer's private key
 * - SIGNER_1: First multi-sig signer address
 * - SIGNER_2: Second multi-sig signer address
 * - SIGNER_3: Third multi-sig signer address (optional)
 */
contract DeployUpgradeable is Script {
    // ============================================================================
    // CONFIGURATION
    // ============================================================================

    // Governance parameters
    uint256 constant MIN_DELAY = 2 days;      // Minimum timelock delay for production
    uint256 constant GRACE_PERIOD = 7 days;   // Grace period for execution
    uint256 constant REQUIRED_SIGS = 2;       // Required multi-sig approvals

    // Token parameters
    uint256 constant UPGRADE_DELAY = 2 days;  // Delay before token upgrades

    // ============================================================================
    // DEPLOYED ADDRESSES
    // ============================================================================

    address public identityRegistry;
    address public tokenGovernor;
    address public tokenImplementation;
    address public tokenProxy;

    // ============================================================================
    // MAIN DEPLOYMENT
    // ============================================================================

    function run() external {
        // Load environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Load multi-sig signers
        address[] memory signers = new address[](3);
        signers[0] = vm.envAddress("SIGNER_1");
        signers[1] = vm.envAddress("SIGNER_2");
        signers[2] = vm.envOr("SIGNER_3", address(0));

        // Filter out empty signers
        uint256 signerCount = signers[2] != address(0) ? 3 : 2;
        address[] memory activeSigners = new address[](signerCount);
        for (uint256 i = 0; i < signerCount; i++) {
            activeSigners[i] = signers[i];
        }

        console.log("===========================================");
        console.log("AHOY Tokenisation - Production Deployment");
        console.log("===========================================");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Multi-sig Signers:", signerCount);
        console.log("");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Identity Registry
        _deployIdentityRegistry();

        // 2. Deploy Token Governor (multi-sig + timelock)
        _deployGovernor(activeSigners);

        // 3. Deploy upgradeable token
        _deployUpgradeableToken(deployer);

        vm.stopBroadcast();

        // Output deployment summary
        _printSummary(deployer, activeSigners);
    }

    // ============================================================================
    // DEPLOYMENT STEPS
    // ============================================================================

    function _deployIdentityRegistry() internal {
        console.log("1. Deploying IdentityRegistry...");

        IdentityRegistry registry = new IdentityRegistry();
        identityRegistry = address(registry);

        console.log("   IdentityRegistry:", identityRegistry);
    }

    function _deployGovernor(address[] memory signers) internal {
        console.log("2. Deploying TokenGovernor (multi-sig + timelock)...");

        TokenGovernor governor = new TokenGovernor(
            signers,
            REQUIRED_SIGS,
            MIN_DELAY,
            GRACE_PERIOD
        );
        tokenGovernor = address(governor);

        console.log("   TokenGovernor:", tokenGovernor);
        console.log("   - Min Delay:", MIN_DELAY / 1 days, "days");
        console.log("   - Grace Period:", GRACE_PERIOD / 1 days, "days");
        console.log("   - Required Signatures:", REQUIRED_SIGS);
    }

    function _deployUpgradeableToken(address owner) internal {
        console.log("3. Deploying ComplianceTokenUpgradeable...");

        // Deploy implementation
        ComplianceTokenUpgradeable implementation = new ComplianceTokenUpgradeable();
        tokenImplementation = address(implementation);
        console.log("   Implementation:", tokenImplementation);

        // Prepare initialization data
        bytes memory initData = abi.encodeWithSelector(
            ComplianceTokenUpgradeable.initialize.selector,
            "AHOY Security Token",        // name
            "AHOY",                        // symbol
            identityRegistry,              // identity registry
            owner,                         // initial owner
            UPGRADE_DELAY                  // upgrade delay
        );

        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(
            tokenImplementation,
            initData
        );
        tokenProxy = address(proxy);
        console.log("   Proxy:", tokenProxy);

        // Set governance as timelock controller
        console.log("4. Configuring governance...");
        ComplianceTokenUpgradeable token = ComplianceTokenUpgradeable(tokenProxy);
        token.setTimelockController(tokenGovernor);
        console.log("   Timelock controller set to TokenGovernor");
    }

    function _printSummary(address deployer, address[] memory signers) internal view {
        console.log("");
        console.log("===========================================");
        console.log("Deployment Complete!");
        console.log("===========================================");
        console.log("");
        console.log("Contract Addresses:");
        console.log("  IdentityRegistry:      ", identityRegistry);
        console.log("  TokenGovernor:         ", tokenGovernor);
        console.log("  Token Implementation:  ", tokenImplementation);
        console.log("  Token Proxy:           ", tokenProxy);
        console.log("");
        console.log("Governance Configuration:");
        console.log("  Min Delay:             ", MIN_DELAY / 1 days, "days");
        console.log("  Grace Period:          ", GRACE_PERIOD / 1 days, "days");
        console.log("  Required Signatures:   ", REQUIRED_SIGS);
        console.log("  Upgrade Delay:         ", UPGRADE_DELAY / 1 days, "days");
        console.log("");
        console.log("Multi-sig Signers:");
        for (uint256 i = 0; i < signers.length; i++) {
            console.log("  Signer", i + 1, ":", signers[i]);
        }
        console.log("");
        console.log("Token Owner:", deployer);
        console.log("");
        console.log("IMPORTANT: Save these addresses!");
        console.log("===========================================");
    }

    // ============================================================================
    // HELPER: Deploy to specific token
    // ============================================================================

    /**
     * @dev Deploy a new upgradeable token with custom parameters
     * @param name Token name
     * @param symbol Token symbol
     * @param owner Initial owner address
     * @return proxy Address of the deployed proxy
     */
    function deployToken(
        string memory name,
        string memory symbol,
        address owner
    ) external returns (address proxy) {
        require(identityRegistry != address(0), "Deploy registry first");

        // Deploy implementation
        ComplianceTokenUpgradeable implementation = new ComplianceTokenUpgradeable();

        // Prepare initialization
        bytes memory initData = abi.encodeWithSelector(
            ComplianceTokenUpgradeable.initialize.selector,
            name,
            symbol,
            identityRegistry,
            owner,
            UPGRADE_DELAY
        );

        // Deploy proxy
        ERC1967Proxy proxyContract = new ERC1967Proxy(
            address(implementation),
            initData
        );
        proxy = address(proxyContract);

        // Set governance
        ComplianceTokenUpgradeable(proxy).setTimelockController(tokenGovernor);

        console.log("Deployed token proxy:", proxy);
        console.log("  Name:", name);
        console.log("  Symbol:", symbol);
        console.log("  Owner:", owner);
    }
}

/**
 * @title UpgradeToken
 * @notice Script to upgrade an existing token to a new implementation
 * @dev Run after deploying a new implementation version
 *
 * This is a two-step process through governance:
 * 1. Schedule upgrade on the token (via governor proposal)
 * 2. Execute upgrade after timelock (via governor execution)
 */
contract UpgradeToken is Script {
    function proposeUpgrade(
        address governor,
        address tokenProxy,
        address newImplementation
    ) external {
        uint256 signerPrivateKey = vm.envUint("SIGNER_PRIVATE_KEY");

        vm.startBroadcast(signerPrivateKey);

        // Schedule upgrade on the token via governance
        bytes memory scheduleData = abi.encodeWithSelector(
            ComplianceTokenUpgradeable.scheduleUpgrade.selector,
            newImplementation
        );

        TokenGovernor(payable(governor)).propose(
            tokenProxy,
            0,
            scheduleData,
            string(abi.encodePacked("Upgrade token to implementation at ", vm.toString(newImplementation)))
        );

        vm.stopBroadcast();

        console.log("Upgrade proposal created");
        console.log("  Token Proxy:", tokenProxy);
        console.log("  New Implementation:", newImplementation);
        console.log("");
        console.log("Next steps:");
        console.log("1. Get other signers to approve the proposal");
        console.log("2. Wait for timelock delay");
        console.log("3. Execute the governance proposal");
        console.log("4. Call upgradeToAndCall on the token");
    }

    function executeUpgrade(
        address tokenProxy,
        address newImplementation
    ) external {
        uint256 signerPrivateKey = vm.envUint("SIGNER_PRIVATE_KEY");

        vm.startBroadcast(signerPrivateKey);

        // Execute the upgrade
        ComplianceTokenUpgradeable(tokenProxy).upgradeToAndCall(
            newImplementation,
            "" // No additional call data
        );

        vm.stopBroadcast();

        console.log("Upgrade executed successfully");
        console.log("  New implementation:", ComplianceTokenUpgradeable(tokenProxy).implementation());
    }
}
