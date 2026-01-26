// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../tokens/ComplianceToken.sol";
import "../tokens/ComplianceMultiToken.sol";
import "../identity/IdentityRegistry.sol";

/**
 * @title TokenFactory
 * @dev Factory contract for deterministic deployment of compliance tokens using CREATE2
 * @notice Enables predictable token addresses before deployment and supports multiple token standards
 *
 * Features:
 * - CREATE2 deterministic deployment
 * - Pre-compute token addresses
 * - Registry of all deployed tokens
 * - Support for multiple token standards (ERC-3643, ERC-1400, ERC-20)
 * - Beacon proxy pattern for upgradeability (optional)
 */
contract TokenFactory {
    // ============================================================================
    // EVENTS
    // ============================================================================

    event TokenDeployed(
        address indexed tokenAddress,
        address indexed deployer,
        bytes32 indexed salt,
        string name,
        string symbol,
        string tokenStandard
    );

    event IdentityRegistryDeployed(
        address indexed registryAddress,
        address indexed tokenAddress
    );

    event FactoryAdminChanged(address indexed previousAdmin, address indexed newAdmin);

    // ============================================================================
    // STATE
    // ============================================================================

    address public factoryAdmin;

    // Registry of all deployed tokens
    address[] public deployedTokens;
    mapping(address => bool) public isDeployedToken;
    mapping(address => TokenInfo) public tokenInfo;

    struct TokenInfo {
        address deployer;
        bytes32 salt;
        string tokenStandard;
        address identityRegistry;
        uint256 deployedAt;
        bool active;
    }

    // Deployment counter per deployer (for salt generation)
    mapping(address => uint256) public deploymentNonce;

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyAdmin() {
        require(msg.sender == factoryAdmin, "TokenFactory: caller is not admin");
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor() {
        factoryAdmin = msg.sender;
    }

    // ============================================================================
    // DEPLOYMENT FUNCTIONS
    // ============================================================================

    /**
     * @notice Deploy a new ComplianceToken with deterministic address
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply (can be 0)
     * @param identityRegistry Address of identity registry (or address(0) to deploy new one)
     * @param salt Custom salt for CREATE2 (or bytes32(0) for auto-generated)
     * @param initialOwner Address to receive token ownership and initial supply
     * @return tokenAddress The address of the deployed token
     *
     * @dev CRITICAL: This function transfers full ownership to initialOwner, ensuring
     * the platform (factory) does NOT retain control of deployed tokens.
     * The initialOwner receives:
     * - Token ownership (can pause, add agents, transfer ownership)
     * - Agent role (can mint/burn tokens)
     * - Compliance officer role (can freeze accounts, set rules)
     * - Initial token supply (if > 0)
     */
    function deployComplianceToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address identityRegistry,
        bytes32 salt,
        address initialOwner
    ) external returns (address tokenAddress) {
        // Validate initial owner - must not be zero
        address newOwner = initialOwner == address(0) ? msg.sender : initialOwner;

        // Auto-generate salt if not provided
        if (salt == bytes32(0)) {
            salt = keccak256(abi.encodePacked(msg.sender, deploymentNonce[msg.sender]++));
        }

        // Deploy identity registry if not provided
        address registry = identityRegistry;
        if (registry == address(0)) {
            registry = _deployIdentityRegistry(salt);
        }

        // Compute bytecode with constructor args
        bytes memory bytecode = abi.encodePacked(
            type(ComplianceToken).creationCode,
            abi.encode(name, symbol, registry)
        );

        // Deploy using CREATE2
        tokenAddress = _deploy(bytecode, salt);

        // Get reference to deployed token
        ComplianceToken token = ComplianceToken(tokenAddress);

        // STEP 1: Add new owner as agent BEFORE transferring ownership
        // This allows them to mint tokens after they become owner
        token.addAgent(newOwner);

        // STEP 2: Add new owner as compliance officer
        // This allows them to set compliance rules
        token.addComplianceOfficer(newOwner);

        // STEP 3: Mint initial supply to the new owner (not msg.sender)
        if (initialSupply > 0) {
            token.mint(newOwner, initialSupply);
        }

        // STEP 4: CRITICAL - Transfer ownership to the partner/asset owner
        // This ensures the platform (factory) does NOT retain ownership
        token.transferOwnership(newOwner);

        // Register token with the actual owner
        _registerToken(tokenAddress, newOwner, salt, "ERC-3643", registry);

        emit TokenDeployed(tokenAddress, newOwner, salt, name, symbol, "ERC-3643");

        return tokenAddress;
    }

    /**
     * @notice Deploy a new ComplianceMultiToken (ERC-1155) with deterministic address
     * @param identityRegistry Address of identity registry (or address(0) to deploy new one)
     * @param salt Custom salt for CREATE2 (or bytes32(0) for auto-generated)
     * @param initialOwner Address to receive token ownership
     * @return tokenAddress The address of the deployed multi-token contract
     *
     * @dev CRITICAL: This function transfers full ownership to initialOwner, ensuring
     * the platform (factory) does NOT retain control of deployed tokens.
     * The initialOwner receives:
     * - Token ownership (can pause, add agents, transfer ownership, create token types)
     * - Agent role (can mint/burn tokens)
     * - Compliance officer role (can freeze accounts, set rules)
     */
    function deployMultiToken(
        address identityRegistry,
        bytes32 salt,
        address initialOwner
    ) external returns (address tokenAddress) {
        // Validate initial owner - must not be zero
        address newOwner = initialOwner == address(0) ? msg.sender : initialOwner;

        // Auto-generate salt if not provided
        if (salt == bytes32(0)) {
            salt = keccak256(abi.encodePacked(msg.sender, "multi", deploymentNonce[msg.sender]++));
        }

        // Deploy identity registry if not provided
        address registry = identityRegistry;
        if (registry == address(0)) {
            registry = _deployIdentityRegistry(salt);
        }

        // Compute bytecode with constructor args
        bytes memory bytecode = abi.encodePacked(
            type(ComplianceMultiToken).creationCode,
            abi.encode(registry)
        );

        // Deploy using CREATE2
        tokenAddress = _deploy(bytecode, salt);

        // Get reference to deployed token
        ComplianceMultiToken token = ComplianceMultiToken(tokenAddress);

        // STEP 1: Add new owner as agent BEFORE transferring ownership
        token.addAgent(newOwner);

        // STEP 2: Add new owner as compliance officer
        token.addComplianceOfficer(newOwner);

        // STEP 3: CRITICAL - Transfer ownership to the partner/asset owner
        token.transferOwnership(newOwner);

        // Register token with the actual owner
        _registerToken(tokenAddress, newOwner, salt, "ERC-1155", registry);

        emit TokenDeployed(tokenAddress, newOwner, salt, "ComplianceMultiToken", "MULTI", "ERC-1155");

        return tokenAddress;
    }

    /**
     * @notice Compute the deterministic address of a multi-token before deployment
     * @param identityRegistry Identity registry address
     * @param salt CREATE2 salt
     * @return The address where the multi-token will be deployed
     */
    function computeMultiTokenAddress(
        address identityRegistry,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(ComplianceMultiToken).creationCode,
            abi.encode(identityRegistry)
        );
        return _computeAddress(bytecode, salt);
    }

    /**
     * @notice Deploy identity registry with deterministic address
     * @param salt Salt for CREATE2
     * @return registryAddress The address of the deployed registry
     */
    function deployIdentityRegistry(bytes32 salt) external returns (address registryAddress) {
        if (salt == bytes32(0)) {
            salt = keccak256(abi.encodePacked(msg.sender, "registry", deploymentNonce[msg.sender]++));
        }
        return _deployIdentityRegistry(salt);
    }

    // ============================================================================
    // ADDRESS COMPUTATION
    // ============================================================================

    /**
     * @notice Compute the deterministic address of a token before deployment
     * @param name Token name
     * @param symbol Token symbol
     * @param identityRegistry Identity registry address
     * @param salt CREATE2 salt
     * @return The address where the token will be deployed
     */
    function computeTokenAddress(
        string memory name,
        string memory symbol,
        address identityRegistry,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(ComplianceToken).creationCode,
            abi.encode(name, symbol, identityRegistry)
        );
        return _computeAddress(bytecode, salt);
    }

    /**
     * @notice Compute the deterministic address of an identity registry
     * @param salt CREATE2 salt
     * @return The address where the registry will be deployed
     */
    function computeRegistryAddress(bytes32 salt) external view returns (address) {
        bytes memory bytecode = type(IdentityRegistry).creationCode;
        return _computeAddress(bytecode, salt);
    }

    /**
     * @notice Generate a unique salt for a deployer
     * @param deployer Address of the deployer
     * @return salt The generated salt
     */
    function generateSalt(address deployer) external view returns (bytes32) {
        return keccak256(abi.encodePacked(deployer, deploymentNonce[deployer]));
    }

    // ============================================================================
    // REGISTRY QUERIES
    // ============================================================================

    /**
     * @notice Get count of all deployed tokens
     */
    function getDeployedTokenCount() external view returns (uint256) {
        return deployedTokens.length;
    }

    /**
     * @notice Get deployed tokens with pagination
     * @param offset Start index
     * @param limit Max tokens to return
     */
    function getDeployedTokens(uint256 offset, uint256 limit) external view returns (address[] memory) {
        uint256 total = deployedTokens.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = deployedTokens[i];
        }
        return result;
    }

    /**
     * @notice Get tokens deployed by a specific address
     * @param deployer Address to query
     */
    function getTokensByDeployer(address deployer) external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < deployedTokens.length; i++) {
            if (tokenInfo[deployedTokens[i]].deployer == deployer) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < deployedTokens.length; i++) {
            if (tokenInfo[deployedTokens[i]].deployer == deployer) {
                result[index++] = deployedTokens[i];
            }
        }
        return result;
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Transfer factory admin role
     * @param newAdmin New admin address
     */
    function setFactoryAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "TokenFactory: new admin is zero address");
        emit FactoryAdminChanged(factoryAdmin, newAdmin);
        factoryAdmin = newAdmin;
    }

    /**
     * @notice Mark a token as inactive (for registry cleanup)
     * @param token Token address to deactivate
     */
    function deactivateToken(address token) external onlyAdmin {
        require(isDeployedToken[token], "TokenFactory: not a deployed token");
        tokenInfo[token].active = false;
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    function _deploy(bytes memory bytecode, bytes32 salt) internal returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        return addr;
    }

    function _computeAddress(bytes memory bytecode, bytes32 salt) internal view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }

    function _deployIdentityRegistry(bytes32 salt) internal returns (address registryAddress) {
        bytes memory bytecode = type(IdentityRegistry).creationCode;
        registryAddress = _deploy(bytecode, salt);
        emit IdentityRegistryDeployed(registryAddress, address(0));
        return registryAddress;
    }

    function _registerToken(
        address tokenAddress,
        address deployer,
        bytes32 salt,
        string memory standard,
        address registry
    ) internal {
        deployedTokens.push(tokenAddress);
        isDeployedToken[tokenAddress] = true;
        tokenInfo[tokenAddress] = TokenInfo({
            deployer: deployer,
            salt: salt,
            tokenStandard: standard,
            identityRegistry: registry,
            deployedAt: block.timestamp,
            active: true
        });
    }
}
