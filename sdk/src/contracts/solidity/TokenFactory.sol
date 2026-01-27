// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ComplianceToken.sol";
import "./IdentityRegistry.sol";

/**
 * @title TokenFactory
 * @notice Factory contract for deploying compliance tokens with CREATE2
 * @dev Provides deterministic addresses and comprehensive token management
 *
 * Features:
 * - CREATE2 deployment for deterministic addresses
 * - Automatic identity registry deployment
 * - Token registry for tracking all deployed tokens
 * - Factory admin for governance
 */
contract TokenFactory {
    // ============================================================================
    // STRUCTS
    // ============================================================================

    struct TokenInfo {
        address deployer;
        bytes32 salt;
        string tokenStandard;
        address identityRegistry;
        uint256 deployedAt;
        bool active;
    }

    // ============================================================================
    // STATE
    // ============================================================================

    /// @notice Factory administrator
    address public factoryAdmin;

    /// @notice All deployed tokens
    address[] public deployedTokens;

    /// @notice Mapping of token address to info
    mapping(address => TokenInfo) public tokenInfo;

    /// @notice Check if address is a deployed token
    mapping(address => bool) public isDeployedToken;

    /// @notice Deployment nonce per deployer (for salt generation)
    mapping(address => uint256) public deploymentNonce;

    /// @notice Tokens deployed by each deployer
    mapping(address => address[]) private _tokensByDeployer;

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

    event FactoryAdminChanged(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    // ============================================================================
    // ERRORS
    // ============================================================================

    error OnlyFactoryAdmin();
    error TokenAlreadyExists(address token);
    error TokenNotFound(address token);
    error InvalidAddress();
    error InvalidParameters();

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyAdmin() {
        if (msg.sender != factoryAdmin) revert OnlyFactoryAdmin();
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor() {
        factoryAdmin = msg.sender;
        emit FactoryAdminChanged(address(0), msg.sender);
    }

    // ============================================================================
    // ADMIN
    // ============================================================================

    /**
     * @notice Set new factory admin
     * @param newAdmin Address of new admin
     */
    function setFactoryAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidAddress();
        address oldAdmin = factoryAdmin;
        factoryAdmin = newAdmin;
        emit FactoryAdminChanged(oldAdmin, newAdmin);
    }

    // ============================================================================
    // SALT GENERATION
    // ============================================================================

    /**
     * @notice Generate a unique salt for a deployer
     * @param deployer Address of the deployer
     * @return bytes32 Unique salt
     */
    function generateSalt(address deployer) public view returns (bytes32) {
        return keccak256(abi.encodePacked(
            deployer,
            deploymentNonce[deployer],
            block.chainid,
            address(this)
        ));
    }

    // ============================================================================
    // ADDRESS COMPUTATION
    // ============================================================================

    /**
     * @notice Compute the address for a compliance token
     * @param name Token name
     * @param symbol Token symbol
     * @param identityRegistry Identity registry address
     * @param salt Deployment salt
     * @return address Computed token address
     */
    function computeTokenAddress(
        string memory name,
        string memory symbol,
        address identityRegistry,
        bytes32 salt
    ) public view returns (address) {
        bytes memory bytecode = _getTokenBytecode(
            name,
            symbol,
            address(0), // initial owner will be set at deploy time
            identityRegistry
        );
        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(bytecode)
        ));
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Compute the address for an identity registry
     * @param salt Deployment salt
     * @return address Computed registry address
     */
    function computeRegistryAddress(bytes32 salt) public view returns (address) {
        bytes memory bytecode = _getRegistryBytecode(address(0)); // initial owner at deploy
        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(bytecode)
        ));
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Compute address for a multi-token (ERC1155 style)
     * @param identityRegistry Identity registry address
     * @param salt Deployment salt
     * @return address Computed token address
     */
    function computeMultiTokenAddress(
        address identityRegistry,
        bytes32 salt
    ) public view returns (address) {
        // For now, compute same as regular token
        // In a full implementation, this would compute ERC1155 address
        return computeTokenAddress("", "", identityRegistry, salt);
    }

    // ============================================================================
    // DEPLOYMENT
    // ============================================================================

    /**
     * @notice Deploy a new identity registry
     * @param salt Deployment salt
     * @return registryAddress Address of deployed registry
     */
    function deployIdentityRegistry(
        bytes32 salt
    ) external returns (address registryAddress) {
        bytes memory bytecode = _getRegistryBytecode(msg.sender);

        assembly {
            registryAddress := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }

        if (registryAddress == address(0)) revert InvalidParameters();

        emit IdentityRegistryDeployed(registryAddress, address(0));

        return registryAddress;
    }

    /**
     * @notice Deploy a compliance token
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply
     * @param identityRegistry Identity registry address
     * @param salt Deployment salt
     * @param initialOwner Token owner address
     * @return tokenAddress Address of deployed token
     */
    function deployComplianceToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address identityRegistry,
        bytes32 salt,
        address initialOwner
    ) external returns (address tokenAddress) {
        if (initialOwner == address(0)) revert InvalidAddress();
        if (bytes(name).length == 0 || bytes(symbol).length == 0) revert InvalidParameters();

        bytes memory bytecode = _getTokenBytecode(
            name,
            symbol,
            initialOwner,
            identityRegistry
        );

        assembly {
            tokenAddress := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }

        if (tokenAddress == address(0)) revert InvalidParameters();

        // Record deployment
        _recordDeployment(
            tokenAddress,
            msg.sender,
            salt,
            "ERC20",
            identityRegistry
        );

        // Mint initial supply if specified
        if (initialSupply > 0) {
            ComplianceToken(tokenAddress).mint(initialOwner, initialSupply);
        }

        emit TokenDeployed(
            tokenAddress,
            msg.sender,
            salt,
            name,
            symbol,
            "ERC20"
        );

        if (identityRegistry != address(0)) {
            emit IdentityRegistryDeployed(identityRegistry, tokenAddress);
        }

        return tokenAddress;
    }

    /**
     * @notice Deploy a multi-token (ERC1155 style)
     * @param identityRegistry Identity registry address
     * @param salt Deployment salt
     * @param initialOwner Token owner address
     * @return tokenAddress Address of deployed token
     */
    function deployMultiToken(
        address identityRegistry,
        bytes32 salt,
        address initialOwner
    ) external returns (address tokenAddress) {
        if (initialOwner == address(0)) revert InvalidAddress();

        // For this implementation, we deploy a regular compliance token
        // A full implementation would deploy an ERC1155 variant
        bytes memory bytecode = _getTokenBytecode(
            "MultiToken",
            "MULTI",
            initialOwner,
            identityRegistry
        );

        assembly {
            tokenAddress := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }

        if (tokenAddress == address(0)) revert InvalidParameters();

        _recordDeployment(
            tokenAddress,
            msg.sender,
            salt,
            "ERC1155",
            identityRegistry
        );

        emit TokenDeployed(
            tokenAddress,
            msg.sender,
            salt,
            "MultiToken",
            "MULTI",
            "ERC1155"
        );

        return tokenAddress;
    }

    // ============================================================================
    // TOKEN MANAGEMENT
    // ============================================================================

    /**
     * @notice Deactivate a deployed token
     * @param token Address of the token
     */
    function deactivateToken(address token) external onlyAdmin {
        if (!isDeployedToken[token]) revert TokenNotFound(token);
        tokenInfo[token].active = false;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get total count of deployed tokens
     * @return uint256 Number of deployed tokens
     */
    function getDeployedTokenCount() external view returns (uint256) {
        return deployedTokens.length;
    }

    /**
     * @notice Get deployed tokens with pagination
     * @param offset Starting index
     * @param limit Maximum number of tokens to return
     * @return address[] Array of token addresses
     */
    function getDeployedTokens(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory) {
        uint256 total = deployedTokens.length;
        if (offset >= total) return new address[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 length = end - offset;

        address[] memory result = new address[](length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = deployedTokens[offset + i];
        }

        return result;
    }

    /**
     * @notice Get tokens deployed by a specific address
     * @param deployer Address of the deployer
     * @return address[] Array of token addresses
     */
    function getTokensByDeployer(address deployer) external view returns (address[] memory) {
        return _tokensByDeployer[deployer];
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    /**
     * @dev Record a token deployment
     */
    function _recordDeployment(
        address token,
        address deployer,
        bytes32 salt,
        string memory standard,
        address registry
    ) internal {
        deployedTokens.push(token);
        isDeployedToken[token] = true;
        _tokensByDeployer[deployer].push(token);
        deploymentNonce[deployer]++;

        tokenInfo[token] = TokenInfo({
            deployer: deployer,
            salt: salt,
            tokenStandard: standard,
            identityRegistry: registry,
            deployedAt: block.timestamp,
            active: true
        });
    }

    /**
     * @dev Get bytecode for ComplianceToken
     */
    function _getTokenBytecode(
        string memory name,
        string memory symbol,
        address admin,
        address registry
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            type(ComplianceToken).creationCode,
            abi.encode(name, symbol, admin, registry)
        );
    }

    /**
     * @dev Get bytecode for IdentityRegistry
     */
    function _getRegistryBytecode(address admin) internal pure returns (bytes memory) {
        return abi.encodePacked(
            type(IdentityRegistry).creationCode,
            abi.encode(admin)
        );
    }
}
