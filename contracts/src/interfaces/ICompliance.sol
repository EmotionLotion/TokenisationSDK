// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ICompliance
 * @dev Interface for ERC-3643 compliance contracts
 * @notice Compliance contracts enforce transfer restrictions based on:
 * - Investor eligibility
 * - Jurisdiction restrictions
 * - Holding limits
 * - Time-based restrictions
 */

/**
 * @title IComplianceModule
 * @dev Interface for modular compliance rules
 */
interface IComplianceModule {
    /**
     * @dev Checks if a transfer is compliant
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     * @param _token Token contract address
     * @return True if transfer is compliant
     */
    function moduleCheck(
        address _from,
        address _to,
        uint256 _value,
        address _token
    ) external view returns (bool);

    /**
     * @dev Called when tokens are minted
     * @param _to Recipient address
     * @param _value Amount minted
     */
    function moduleMint(address _to, uint256 _value) external;

    /**
     * @dev Called when tokens are burned
     * @param _from Holder address
     * @param _value Amount burned
     */
    function moduleBurn(address _from, uint256 _value) external;

    /**
     * @dev Called when tokens are transferred
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     */
    function moduleTransfer(address _from, address _to, uint256 _value) external;

    /**
     * @dev Returns the module name
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns true if the module is plug-and-play (no configuration needed)
     */
    function isPlugAndPlay() external view returns (bool);
}

/**
 * @title ICompliance
 * @dev Main compliance interface for ERC-3643 tokens
 */
interface ICompliance {
    // ============================================================================
    // EVENTS
    // ============================================================================

    /// @notice Emitted when a compliance module is added
    event ModuleAdded(address indexed module, string name);

    /// @notice Emitted when a compliance module is removed
    event ModuleRemoved(address indexed module);

    /// @notice Emitted when a module interacts with a transfer
    event ModuleInteraction(
        address indexed module,
        address from,
        address to,
        uint256 value
    );

    /// @notice Emitted when a token is bound to compliance
    event TokenBound(address indexed token);

    /// @notice Emitted when a token is unbound from compliance
    event TokenUnbound(address indexed token);

    // ============================================================================
    // TOKEN BINDING
    // ============================================================================

    /**
     * @dev Binds a token to this compliance contract
     * @param _token Token contract address
     */
    function bindToken(address _token) external;

    /**
     * @dev Unbinds the currently bound token
     */
    function unbindToken() external;

    /**
     * @dev Returns the bound token address
     */
    function boundToken() external view returns (address);

    /**
     * @dev Returns true if a token is bound
     */
    function isTokenBound() external view returns (bool);

    /**
     * @dev Returns the bound token address (alias for boundToken)
     */
    function getTokenBound() external view returns (address);

    // ============================================================================
    // MODULE MANAGEMENT
    // ============================================================================

    /**
     * @dev Adds a compliance module
     * @param _module Module contract address
     */
    function addModule(address _module) external;

    /**
     * @dev Removes a compliance module
     * @param _module Module contract address
     */
    function removeModule(address _module) external;

    /**
     * @dev Returns all active modules
     */
    function getModules() external view returns (address[] memory);

    /**
     * @dev Returns the number of active modules
     */
    function getModuleCount() external view returns (uint256);

    /**
     * @dev Checks if a module is active
     * @param _module Module address to check
     */
    function isModuleActive(address _module) external view returns (bool);

    // ============================================================================
    // COMPLIANCE CHECKS
    // ============================================================================

    /**
     * @dev Checks if a transfer is compliant with all modules
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     * @return True if the transfer is compliant
     */
    function canTransfer(
        address _from,
        address _to,
        uint256 _value
    ) external view returns (bool);

    // ============================================================================
    // TRANSFER HOOKS
    // ============================================================================

    /**
     * @dev Called when tokens are minted
     * @param _to Recipient address
     * @param _value Amount minted
     */
    function created(address _to, uint256 _value) external;

    /**
     * @dev Called when tokens are burned
     * @param _from Holder address
     * @param _value Amount burned
     */
    function destroyed(address _from, uint256 _value) external;

    /**
     * @dev Called when tokens are transferred
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     */
    function transferred(address _from, address _to, uint256 _value) external;

    // ============================================================================
    // PAUSE
    // ============================================================================

    /**
     * @dev Pauses compliance checks
     */
    function pause() external;

    /**
     * @dev Unpauses compliance checks
     */
    function unpause() external;

    /**
     * @dev Returns true if compliance is paused
     */
    function isPaused() external view returns (bool);
}

/**
 * @title IComplianceExtended
 * @dev Extended compliance interface with additional functionality
 */
interface IComplianceExtended is ICompliance {
    /**
     * @dev Returns detailed compliance check results
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     * @return compliant True if compliant
     * @return failedModule Address of first failing module (or zero if compliant)
     */
    function canTransferWithReason(
        address _from,
        address _to,
        uint256 _value
    ) external view returns (bool compliant, address failedModule);

    /**
     * @dev Checks compliance for a specific module
     * @param _module Module address
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     * @return True if compliant with the specified module
     */
    function checkModule(
        address _module,
        address _from,
        address _to,
        uint256 _value
    ) external view returns (bool);
}
