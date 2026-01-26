// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITokenFactory
 * @dev Interface for token factory with CREATE2 deterministic deployment
 */
interface ITokenFactory {
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
    // DEPLOYMENT FUNCTIONS
    // ============================================================================

    /**
     * @notice Deploy a new ComplianceToken with deterministic address
     * @param name Token name
     * @param symbol Token symbol
     * @param initialSupply Initial token supply
     * @param identityRegistry Address of identity registry (or address(0) to deploy new)
     * @param salt Custom salt for CREATE2 (or bytes32(0) for auto-generated)
     * @return tokenAddress The deployed token address
     */
    function deployComplianceToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address identityRegistry,
        bytes32 salt,
        address initialOwner
    ) external returns (address tokenAddress);

    /**
     * @notice Deploy identity registry with deterministic address
     * @param salt Salt for CREATE2
     * @return registryAddress The deployed registry address
     */
    function deployIdentityRegistry(bytes32 salt) external returns (address registryAddress);

    // ============================================================================
    // ADDRESS COMPUTATION
    // ============================================================================

    /**
     * @notice Compute token address before deployment
     */
    function computeTokenAddress(
        string memory name,
        string memory symbol,
        address identityRegistry,
        bytes32 salt
    ) external view returns (address);

    /**
     * @notice Compute registry address before deployment
     */
    function computeRegistryAddress(bytes32 salt) external view returns (address);

    /**
     * @notice Generate unique salt for deployer
     */
    function generateSalt(address deployer) external view returns (bytes32);

    // ============================================================================
    // REGISTRY QUERIES
    // ============================================================================

    function getDeployedTokenCount() external view returns (uint256);

    function getDeployedTokens(uint256 offset, uint256 limit) external view returns (address[] memory);

    function getTokensByDeployer(address deployer) external view returns (address[] memory);

    function isDeployedToken(address token) external view returns (bool);

    function tokenInfo(address token) external view returns (TokenInfo memory);
}
