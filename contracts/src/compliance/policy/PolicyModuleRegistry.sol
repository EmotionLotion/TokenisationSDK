// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule, IPolicyModuleRegistry} from "./IPolicyModule.sol";

/**
 * @title PolicyModuleRegistry
 * @notice Central registry for Chainlink ACE Policy Modules
 * @dev Manages policy module registration, ordering, and batch evaluation
 *
 * The registry coordinates multiple policy modules and provides:
 * - Priority-based evaluation ordering
 * - Module lifecycle management (activate/deactivate)
 * - Batch evaluation with early termination on failure
 * - Aggregate policy hash for DON verification
 */
contract PolicyModuleRegistry is IPolicyModuleRegistry, Ownable {
    // ============================================================================
    // Errors
    // ============================================================================

    error ModuleAlreadyRegistered(address module);
    error ModuleNotRegistered(address module);
    error InvalidModuleAddress();
    error ModuleNotActive(address module);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Mapping of module address to info
    mapping(address => ModuleInfo) public modules;

    /// @notice Array of all registered module addresses
    address[] private _registeredModules;

    /// @notice Mapping to track if module is registered
    mapping(address => bool) public isRegistered;

    /// @notice Total number of registered modules
    uint256 public moduleCount;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Module Management
    // ============================================================================

    /**
     * @notice Register a new policy module
     * @param module The module address
     * @param priority The evaluation priority (lower = first)
     */
    function registerModule(address module, uint256 priority) external override onlyOwner {
        if (module == address(0)) revert InvalidModuleAddress();
        if (isRegistered[module]) revert ModuleAlreadyRegistered(module);

        // Verify module implements IPolicyModule
        IPolicyModule policyModule = IPolicyModule(module);
        string memory name = policyModule.moduleName();
        uint256 version = policyModule.moduleVersion();

        modules[module] = ModuleInfo({
            moduleAddress: module,
            name: name,
            version: version,
            active: true,
            priority: priority,
            registeredAt: block.timestamp
        });

        _registeredModules.push(module);
        isRegistered[module] = true;
        moduleCount++;

        emit ModuleRegistered(module, name, priority);
    }

    /**
     * @notice Deactivate a policy module
     * @param module The module address
     */
    function deactivateModule(address module) external override onlyOwner {
        if (!isRegistered[module]) revert ModuleNotRegistered(module);

        modules[module].active = false;
        emit ModuleDeactivated(module);
    }

    /**
     * @notice Activate a policy module
     * @param module The module address
     */
    function activateModule(address module) external override onlyOwner {
        if (!isRegistered[module]) revert ModuleNotRegistered(module);

        modules[module].active = true;
        emit ModuleActivated(module);
    }

    /**
     * @notice Update module priority
     * @param module The module address
     * @param newPriority The new priority value
     */
    function updateModulePriority(address module, uint256 newPriority) external onlyOwner {
        if (!isRegistered[module]) revert ModuleNotRegistered(module);

        modules[module].priority = newPriority;
        emit ModulePriorityUpdated(module, newPriority);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all active modules sorted by priority
     * @return activeModules Array of active module addresses
     */
    function getActiveModules() external view override returns (address[] memory activeModules) {
        // Count active modules
        uint256 activeCount = 0;
        for (uint256 i = 0; i < _registeredModules.length; i++) {
            if (modules[_registeredModules[i]].active) {
                activeCount++;
            }
        }

        // Build array of active modules
        activeModules = new address[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < _registeredModules.length; i++) {
            if (modules[_registeredModules[i]].active) {
                activeModules[index] = _registeredModules[i];
                index++;
            }
        }

        // Sort by priority (simple bubble sort for small arrays)
        for (uint256 i = 0; i < activeCount; i++) {
            for (uint256 j = i + 1; j < activeCount; j++) {
                if (modules[activeModules[j]].priority < modules[activeModules[i]].priority) {
                    address temp = activeModules[i];
                    activeModules[i] = activeModules[j];
                    activeModules[j] = temp;
                }
            }
        }
    }

    /**
     * @notice Get module info
     * @param module The module address
     * @return info The module information
     */
    function getModuleInfo(address module) external view override returns (ModuleInfo memory info) {
        if (!isRegistered[module]) revert ModuleNotRegistered(module);
        return modules[module];
    }

    /**
     * @notice Get all registered modules
     * @return Array of all module addresses
     */
    function getAllModules() external view returns (address[] memory) {
        return _registeredModules;
    }

    // ============================================================================
    // Policy Evaluation
    // ============================================================================

    /**
     * @notice Evaluate all active modules for a context
     * @param context The policy context
     * @return allowed Whether all policies allow the action
     * @return results Array of individual policy results
     */
    function evaluateAll(
        IPolicyModule.PolicyContext calldata context
    ) external view override returns (bool allowed, IPolicyModule.PolicyResult[] memory results) {
        address[] memory activeModules = this.getActiveModules();
        results = new IPolicyModule.PolicyResult[](activeModules.length);
        allowed = true;

        for (uint256 i = 0; i < activeModules.length; i++) {
            IPolicyModule module = IPolicyModule(activeModules[i]);

            // Skip inactive modules at the module level
            if (!module.isActive()) {
                continue;
            }

            IPolicyModule.PolicyResult memory result = module.evaluate(context);
            results[i] = result;

            if (!result.allowed) {
                allowed = false;
                // Continue evaluating to collect all violations
            }
        }
    }

    /**
     * @notice Evaluate with early termination on first failure
     * @param context The policy context
     * @return allowed Whether the action is allowed
     * @return failedModule The first module that denied (or zero address if allowed)
     * @return reason The denial reason
     */
    function evaluateWithEarlyTermination(
        IPolicyModule.PolicyContext calldata context
    ) external view returns (bool allowed, address failedModule, string memory reason) {
        address[] memory activeModules = this.getActiveModules();
        allowed = true;
        failedModule = address(0);
        reason = "";

        for (uint256 i = 0; i < activeModules.length; i++) {
            IPolicyModule module = IPolicyModule(activeModules[i]);

            if (!module.isActive()) {
                continue;
            }

            IPolicyModule.PolicyResult memory result = module.evaluate(context);

            if (!result.allowed) {
                allowed = false;
                failedModule = activeModules[i];
                reason = result.reason;
                break;  // Early termination
            }
        }
    }

    /**
     * @notice Get aggregate policy hash for DON verification
     * @return hash The combined hash of all active policy configurations
     */
    function getAggregatePolicyHash() external view returns (bytes32 hash) {
        address[] memory activeModules = this.getActiveModules();
        bytes32[] memory hashes = new bytes32[](activeModules.length);

        for (uint256 i = 0; i < activeModules.length; i++) {
            hashes[i] = IPolicyModule(activeModules[i]).getPolicyHash();
        }

        hash = keccak256(abi.encodePacked(hashes));
    }
}
