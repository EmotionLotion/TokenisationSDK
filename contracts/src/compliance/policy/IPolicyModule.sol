// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPolicyModule
 * @notice Interface for Chainlink ACE Policy Modules
 * @dev All policy modules must implement this interface for DON enforcement
 *
 * Policy modules are the authoritative on-chain rules engine that the
 * Chainlink DON enforces. Each module handles a specific type of policy
 * (allowlist, volume limits, time restrictions, etc.)
 */
interface IPolicyModule {
    /// @notice Policy evaluation result
    struct PolicyResult {
        bool allowed;
        bytes32 policyId;
        bytes32 ruleId;
        string reason;
        uint256 timestamp;
        bytes proof;  // Cryptographic proof of evaluation
    }

    /// @notice Policy context for evaluation
    struct PolicyContext {
        address from;
        address to;
        uint256 amount;
        address token;
        bytes32 assetId;
        bytes additionalData;
    }

    // Events
    event PolicyEvaluated(
        bytes32 indexed policyId,
        address indexed subject,
        bool allowed,
        string reason
    );

    event PolicyUpdated(bytes32 indexed policyId, bytes32 indexed ruleId);

    /**
     * @notice Evaluate a policy for the given context
     * @param context The policy evaluation context
     * @return result The policy evaluation result with proof
     */
    function evaluate(PolicyContext calldata context) external view returns (PolicyResult memory result);

    /**
     * @notice Get the policy module name
     * @return name The module name
     */
    function moduleName() external view returns (string memory name);

    /**
     * @notice Get the policy module version
     * @return version The module version
     */
    function moduleVersion() external view returns (uint256 version);

    /**
     * @notice Check if the module is active
     * @return active Whether the module is active
     */
    function isActive() external view returns (bool active);

    /**
     * @notice Get the policy hash for verification
     * @return hash The keccak256 hash of current policy configuration
     */
    function getPolicyHash() external view returns (bytes32 hash);
}

/**
 * @title IPolicyModuleRegistry
 * @notice Registry for managing policy modules
 */
interface IPolicyModuleRegistry {
    /// @notice Registered policy module info
    struct ModuleInfo {
        address moduleAddress;
        string name;
        uint256 version;
        bool active;
        uint256 priority;  // Lower = higher priority
        uint256 registeredAt;
    }

    // Events
    event ModuleRegistered(address indexed module, string name, uint256 priority);
    event ModuleDeactivated(address indexed module);
    event ModuleActivated(address indexed module);
    event ModulePriorityUpdated(address indexed module, uint256 newPriority);

    /**
     * @notice Register a new policy module
     * @param module The module address
     * @param priority The evaluation priority (lower = first)
     */
    function registerModule(address module, uint256 priority) external;

    /**
     * @notice Deactivate a policy module
     * @param module The module address
     */
    function deactivateModule(address module) external;

    /**
     * @notice Activate a policy module
     * @param module The module address
     */
    function activateModule(address module) external;

    /**
     * @notice Get all active modules sorted by priority
     * @return modules Array of active module addresses
     */
    function getActiveModules() external view returns (address[] memory modules);

    /**
     * @notice Get module info
     * @param module The module address
     * @return info The module information
     */
    function getModuleInfo(address module) external view returns (ModuleInfo memory info);

    /**
     * @notice Evaluate all active modules for a context
     * @param context The policy context
     * @return allowed Whether all policies allow the action
     * @return results Array of individual policy results
     */
    function evaluateAll(
        IPolicyModule.PolicyContext calldata context
    ) external view returns (bool allowed, IPolicyModule.PolicyResult[] memory results);

    /**
     * @notice Evaluate with early termination on first failure
     * @param context The policy context
     * @return allowed Whether the action is allowed
     * @return failedModule The first module that denied (or zero address if allowed)
     * @return reason The denial reason
     */
    function evaluateWithEarlyTermination(
        IPolicyModule.PolicyContext calldata context
    ) external view returns (bool allowed, address failedModule, string memory reason);
}
