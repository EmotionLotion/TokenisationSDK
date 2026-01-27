// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC3643
 * @dev Interface for ERC-3643 (T-REX) Security Token Standard
 * @notice The ERC-3643 standard enables compliant security tokens with:
 * - Identity verification via Identity Registry
 * - Modular compliance rules
 * - Token recovery for lost wallets
 * - Partial freezing of tokens
 * - Batch transfers
 *
 * Based on: https://eips.ethereum.org/EIPS/eip-3643
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IToken
 * @dev Main security token interface with compliance integration
 */
interface IToken is IERC20 {
    // ============================================================================
    // EVENTS
    // ============================================================================

    /// @notice Emitted when tokens are minted
    event TokensMinted(address indexed to, uint256 amount);

    /// @notice Emitted when tokens are burned
    event TokensBurned(address indexed from, uint256 amount);

    /// @notice Emitted when tokens are frozen
    event TokensFrozen(address indexed userAddress, uint256 amount);

    /// @notice Emitted when tokens are unfrozen
    event TokensUnfrozen(address indexed userAddress, uint256 amount);

    /// @notice Emitted when an address is frozen/unfrozen
    event AddressFrozen(address indexed userAddress, bool isFrozen, address indexed agent);

    /// @notice Emitted when identity registry is updated
    event IdentityRegistrySet(address indexed identityRegistry);

    /// @notice Emitted when compliance contract is updated
    event ComplianceSet(address indexed compliance);

    // Note: Paused/Unpaused events are inherited from OpenZeppelin's Pausable

    /// @notice Emitted when tokens are recovered from a lost wallet
    event RecoverySuccess(
        address indexed lostWallet,
        address indexed newWallet,
        address indexed investorOnchainID
    );

    // ============================================================================
    // TOKEN CONFIGURATION
    // ============================================================================

    /**
     * @dev Returns the identity registry contract address
     */
    function identityRegistry() external view returns (address);

    /**
     * @dev Returns the compliance contract address
     */
    function compliance() external view returns (address);

    /**
     * @dev Sets the identity registry contract
     * @param _identityRegistry The new identity registry address
     */
    function setIdentityRegistry(address _identityRegistry) external;

    /**
     * @dev Sets the compliance contract
     * @param _compliance The new compliance contract address
     */
    function setCompliance(address _compliance) external;

    // ============================================================================
    // TOKEN OPERATIONS
    // ============================================================================

    /**
     * @dev Mints tokens to a verified address
     * @param _to Address to mint tokens to
     * @param _amount Amount of tokens to mint
     */
    function mint(address _to, uint256 _amount) external;

    /**
     * @dev Burns tokens from an address
     * @param _from Address to burn tokens from
     * @param _amount Amount of tokens to burn
     */
    function burn(address _from, uint256 _amount) external;

    /**
     * @dev Force transfers tokens from one address to another
     * Only callable by authorized agents
     * @param _from Source address
     * @param _to Destination address
     * @param _amount Amount to transfer
     */
    function forcedTransfer(
        address _from,
        address _to,
        uint256 _amount
    ) external returns (bool);

    // ============================================================================
    // PAUSE/UNPAUSE
    // ============================================================================

    /**
     * @dev Pauses the token - no transfers allowed
     */
    function pause() external;

    /**
     * @dev Unpauses the token
     */
    function unpause() external;

    /**
     * @dev Returns true if the token is paused
     */
    function paused() external view returns (bool);

    // ============================================================================
    // ADDRESS FREEZING
    // ============================================================================

    /**
     * @dev Freezes an address - all their tokens become non-transferable
     * @param _userAddress Address to freeze
     * @param _freeze True to freeze, false to unfreeze
     */
    function setAddressFrozen(address _userAddress, bool _freeze) external;

    /**
     * @dev Checks if an address is frozen
     * @param _userAddress Address to check
     * @return True if frozen
     */
    function isFrozen(address _userAddress) external view returns (bool);

    // ============================================================================
    // PARTIAL TOKEN FREEZING
    // ============================================================================

    /**
     * @dev Freezes a specific amount of tokens for an address
     * @param _userAddress Address to partially freeze
     * @param _amount Amount of tokens to freeze
     */
    function freezePartialTokens(address _userAddress, uint256 _amount) external;

    /**
     * @dev Unfreezes a specific amount of tokens for an address
     * @param _userAddress Address to partially unfreeze
     * @param _amount Amount of tokens to unfreeze
     */
    function unfreezePartialTokens(address _userAddress, uint256 _amount) external;

    /**
     * @dev Returns the amount of frozen tokens for an address
     * @param _userAddress Address to check
     * @return Amount of frozen tokens
     */
    function getFrozenTokens(address _userAddress) external view returns (uint256);

    // ============================================================================
    // RECOVERY
    // ============================================================================

    /**
     * @dev Recovers tokens from a lost wallet to a new wallet
     * @param _lostWallet The wallet that was lost
     * @param _newWallet The new wallet to receive tokens
     * @param _investorOnchainID The onchain identity of the investor
     * @return True if recovery was successful
     */
    function recoveryAddress(
        address _lostWallet,
        address _newWallet,
        address _investorOnchainID
    ) external returns (bool);

    // ============================================================================
    // BATCH OPERATIONS
    // ============================================================================

    /**
     * @dev Transfers tokens to multiple addresses in a single transaction
     * @param _toList Array of recipient addresses
     * @param _amounts Array of amounts to transfer
     */
    function batchTransfer(
        address[] calldata _toList,
        uint256[] calldata _amounts
    ) external;

    /**
     * @dev Mints tokens to multiple addresses
     * @param _toList Array of recipient addresses
     * @param _amounts Array of amounts to mint
     */
    function batchMint(
        address[] calldata _toList,
        uint256[] calldata _amounts
    ) external;

    /**
     * @dev Burns tokens from multiple addresses
     * @param _fromList Array of holder addresses
     * @param _amounts Array of amounts to burn
     */
    function batchBurn(
        address[] calldata _fromList,
        uint256[] calldata _amounts
    ) external;

    /**
     * @dev Freezes multiple addresses
     * @param _userAddresses Array of addresses to freeze
     * @param _freeze Array of freeze states
     */
    function batchSetAddressFrozen(
        address[] calldata _userAddresses,
        bool[] calldata _freeze
    ) external;

    /**
     * @dev Force transfers from multiple addresses
     * @param _fromList Array of source addresses
     * @param _toList Array of destination addresses
     * @param _amounts Array of amounts
     */
    function batchForcedTransfer(
        address[] calldata _fromList,
        address[] calldata _toList,
        uint256[] calldata _amounts
    ) external;
}

/**
 * @title ITokenExtended
 * @dev Extended interface for additional security token functionality
 */
interface ITokenExtended is IToken {
    /**
     * @dev Returns the onchain ID of the token
     */
    function onchainID() external view returns (address);

    /**
     * @dev Sets the onchain ID of the token
     * @param _onchainID The onchain identity address
     */
    function setOnchainID(address _onchainID) external;

    /**
     * @dev Returns the list of agents authorized to manage the token
     */
    function agents() external view returns (address[] memory);

    /**
     * @dev Adds an agent
     * @param _agent Agent address to add
     */
    function addAgent(address _agent) external;

    /**
     * @dev Removes an agent
     * @param _agent Agent address to remove
     */
    function removeAgent(address _agent) external;

    /**
     * @dev Checks if an address is an agent
     * @param _agent Address to check
     * @return True if the address is an agent
     */
    function isAgent(address _agent) external view returns (bool);
}
