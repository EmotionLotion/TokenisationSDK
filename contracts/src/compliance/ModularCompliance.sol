// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @notice Interface that compliance modules must implement
 */
interface IComplianceModule {
    function moduleCheck(address from, address to, uint256 value, address token) external view returns (bool);
    function moduleMint(address to, uint256 value) external;
    function moduleBurn(address from, uint256 value) external;
    function moduleTransfer(address from, address to, uint256 value) external;
    function name() external view returns (string memory);
    function isPlugAndPlay() external view returns (bool);
}

/**
 * @title ModularCompliance
 * @notice Modular compliance system with composable rules
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Supports multiple compliance modules that can be added/removed:
 * - Country restrictions
 * - Investor limits
 * - Transfer limits
 * - Holding periods
 * - etc.
 */
contract ModularCompliance is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event ModuleAdded(address indexed module, string name);
    event ModuleRemoved(address indexed module);
    event ModuleInteraction(address indexed module, address from, address to, uint256 value);
    event TokenBound(address indexed token);
    event TokenUnbound(address indexed token);

    // ============================================================================
    // Structs
    // ============================================================================

    struct ModuleInfo {
        bool isActive;
        string name;
        uint256 addedAt;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Array of compliance module addresses
    address[] private _modules;

    /// @notice Mapping from module address to info
    mapping(address => ModuleInfo) private _moduleInfo;

    /// @notice Bound token address
    address public boundToken;

    /// @notice Whether compliance is paused
    bool public isPaused;

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyToken() {
        require(msg.sender == boundToken, "Only bound token");
        _;
    }

    modifier whenNotPaused() {
        require(!isPaused, "Compliance paused");
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Token Binding
    // ============================================================================

    /**
     * @notice Bind a token to this compliance contract
     * @param token The token address
     */
    function bindToken(address token) external onlyOwner {
        require(boundToken == address(0), "Token already bound");
        require(token != address(0), "Invalid token");

        boundToken = token;
        emit TokenBound(token);
    }

    /**
     * @notice Unbind the current token
     */
    function unbindToken() external onlyOwner {
        require(boundToken != address(0), "No token bound");

        address oldToken = boundToken;
        boundToken = address(0);
        emit TokenUnbound(oldToken);
    }

    // ============================================================================
    // Module Management
    // ============================================================================

    /**
     * @notice Add a compliance module
     * @param module The module address
     */
    function addModule(address module) external onlyOwner {
        require(module != address(0), "Invalid module");
        require(!_moduleInfo[module].isActive, "Module already active");

        string memory moduleName;
        try IComplianceModule(module).name() returns (string memory n) {
            moduleName = n;
        } catch {
            moduleName = "Unknown";
        }

        _modules.push(module);
        _moduleInfo[module] = ModuleInfo({
            isActive: true,
            name: moduleName,
            addedAt: block.timestamp
        });

        emit ModuleAdded(module, moduleName);
    }

    /**
     * @notice Remove a compliance module
     * @param module The module address
     */
    function removeModule(address module) external onlyOwner {
        require(_moduleInfo[module].isActive, "Module not active");

        // Remove from array
        for (uint256 i = 0; i < _modules.length; i++) {
            if (_modules[i] == module) {
                _modules[i] = _modules[_modules.length - 1];
                _modules.pop();
                break;
            }
        }

        _moduleInfo[module].isActive = false;

        emit ModuleRemoved(module);
    }

    /**
     * @notice Pause compliance checks
     */
    function pause() external onlyOwner {
        isPaused = true;
    }

    /**
     * @notice Unpause compliance checks
     */
    function unpause() external onlyOwner {
        isPaused = false;
    }

    // ============================================================================
    // Compliance Checks
    // ============================================================================

    /**
     * @notice Check if a transfer is compliant
     * @param from Sender address
     * @param to Recipient address
     * @param value Transfer amount
     * @return Whether the transfer is compliant
     */
    function canTransfer(
        address from,
        address to,
        uint256 value
    ) external view returns (bool) {
        if (isPaused) {
            return true; // Allow transfers when paused (emergency mode)
        }

        // Check all modules
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            if (_moduleInfo[module].isActive) {
                try IComplianceModule(module).moduleCheck(from, to, value, boundToken) returns (bool result) {
                    if (!result) {
                        return false;
                    }
                } catch {
                    // If module reverts, consider it non-compliant
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * @notice Called when tokens are minted
     * @param to Recipient address
     * @param value Amount minted
     */
    function created(address to, uint256 value) external onlyToken whenNotPaused {
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            if (_moduleInfo[module].isActive) {
                try IComplianceModule(module).moduleMint(to, value) {} catch {}
            }
        }
    }

    /**
     * @notice Called when tokens are burned
     * @param from Holder address
     * @param value Amount burned
     */
    function destroyed(address from, uint256 value) external onlyToken whenNotPaused {
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            if (_moduleInfo[module].isActive) {
                try IComplianceModule(module).moduleBurn(from, value) {} catch {}
            }
        }
    }

    /**
     * @notice Called when tokens are transferred
     * @param from Sender address
     * @param to Recipient address
     * @param value Amount transferred
     */
    function transferred(
        address from,
        address to,
        uint256 value
    ) external onlyToken whenNotPaused {
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            if (_moduleInfo[module].isActive) {
                try IComplianceModule(module).moduleTransfer(from, to, value) {} catch {}
                emit ModuleInteraction(module, from, to, value);
            }
        }
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all active modules
     * @return Array of module addresses
     */
    function getModules() external view returns (address[] memory) {
        return _modules;
    }

    /**
     * @notice Get module info
     * @param module The module address
     * @return info The module info
     */
    function getModuleInfo(address module) external view returns (ModuleInfo memory info) {
        return _moduleInfo[module];
    }

    /**
     * @notice Check if a module is active
     * @param module The module address
     * @return Whether active
     */
    function isModuleActive(address module) external view returns (bool) {
        return _moduleInfo[module].isActive;
    }

    /**
     * @notice Get module count
     * @return The count
     */
    function getModuleCount() external view returns (uint256) {
        return _modules.length;
    }
}
