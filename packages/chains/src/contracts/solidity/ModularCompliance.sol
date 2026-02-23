// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IComplianceModule
 * @notice Interface for compliance modules
 */
interface IComplianceModule {
    /**
     * @notice Returns the name of the module
     */
    function name() external view returns (string memory);

    /**
     * @notice Check if transfer is allowed
     * @param from Sender address
     * @param to Receiver address
     * @param value Transfer amount
     * @return bool True if transfer is allowed
     */
    function moduleCheck(address from, address to, uint256 value) external view returns (bool);

    /**
     * @notice Called after a successful transfer
     * @param from Sender address
     * @param to Receiver address
     * @param value Transfer amount
     */
    function moduleTransferAction(address from, address to, uint256 value) external;

    /**
     * @notice Called after tokens are created/minted
     * @param to Recipient address
     * @param value Amount created
     */
    function moduleMintAction(address to, uint256 value) external;

    /**
     * @notice Called after tokens are destroyed/burned
     * @param from Burner address
     * @param value Amount destroyed
     */
    function moduleBurnAction(address from, uint256 value) external;

    /**
     * @notice Bind compliance to this module
     * @param compliance Address of the ModularCompliance contract
     */
    function bindCompliance(address compliance) external;

    /**
     * @notice Unbind compliance from this module
     * @param compliance Address of the ModularCompliance contract
     */
    function unbindCompliance(address compliance) external;

    /**
     * @notice Check if compliance is bound to this module
     * @param compliance Address of the ModularCompliance contract
     * @return bool True if bound
     */
    function isComplianceBound(address compliance) external view returns (bool);
}

/**
 * @title ModularCompliance
 * @notice Modular compliance contract for managing token transfer rules
 * @dev Allows adding/removing compliance modules that check transfers
 *
 * This contract implements a modular compliance architecture where:
 * - Multiple compliance modules can be added
 * - Each module checks transfers according to its rules
 * - ALL modules must approve for a transfer to succeed
 * - Modules are notified of transfers for state updates
 */
contract ModularCompliance is Ownable {
    // ============================================================================
    // STRUCTS
    // ============================================================================

    struct ModuleInfo {
        bool isActive;
        string name;
        uint256 addedAt;
    }

    // ============================================================================
    // STATE
    // ============================================================================

    /// @notice The token this compliance is bound to
    address public boundToken;

    /// @notice List of active modules
    address[] private _modules;

    /// @notice Module information mapping
    mapping(address => ModuleInfo) private _moduleInfo;

    /// @notice Whether the contract is paused
    bool private _paused;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event TokenBound(address indexed token);
    event TokenUnbound(address indexed token);
    event ModuleAdded(address indexed module, string name);
    event ModuleRemoved(address indexed module);
    event ModuleInteraction(
        address indexed module,
        address from,
        address to,
        uint256 value
    );

    // ============================================================================
    // ERRORS
    // ============================================================================

    error TokenAlreadyBound();
    error TokenNotBound();
    error ModuleAlreadyAdded(address module);
    error ModuleNotFound(address module);
    error OnlyBoundToken();
    error ContractPaused();
    error InvalidAddress();

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyBoundToken() {
        if (msg.sender != boundToken) revert OnlyBoundToken();
        _;
    }

    modifier whenNotPaused() {
        if (_paused) revert ContractPaused();
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // TOKEN BINDING
    // ============================================================================

    /**
     * @notice Bind a token to this compliance contract
     * @param token Address of the token to bind
     */
    function bindToken(address token) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        if (boundToken != address(0)) revert TokenAlreadyBound();

        boundToken = token;
        emit TokenBound(token);
    }

    /**
     * @notice Unbind the current token
     */
    function unbindToken() external onlyOwner {
        if (boundToken == address(0)) revert TokenNotBound();

        address oldToken = boundToken;
        boundToken = address(0);
        emit TokenUnbound(oldToken);
    }

    // ============================================================================
    // MODULE MANAGEMENT
    // ============================================================================

    /**
     * @notice Add a compliance module
     * @param module Address of the module to add
     */
    function addModule(address module) external onlyOwner {
        if (module == address(0)) revert InvalidAddress();
        if (_moduleInfo[module].isActive) revert ModuleAlreadyAdded(module);

        string memory moduleName;
        try IComplianceModule(module).name() returns (string memory _name) {
            moduleName = _name;
        } catch {
            moduleName = "Unknown";
        }

        _modules.push(module);
        _moduleInfo[module] = ModuleInfo({
            isActive: true,
            name: moduleName,
            addedAt: block.timestamp
        });

        // Bind this compliance to the module
        try IComplianceModule(module).bindCompliance(address(this)) {} catch {}

        emit ModuleAdded(module, moduleName);
    }

    /**
     * @notice Remove a compliance module
     * @param module Address of the module to remove
     */
    function removeModule(address module) external onlyOwner {
        if (!_moduleInfo[module].isActive) revert ModuleNotFound(module);

        // Find and remove from array
        for (uint256 i = 0; i < _modules.length; i++) {
            if (_modules[i] == module) {
                _modules[i] = _modules[_modules.length - 1];
                _modules.pop();
                break;
            }
        }

        _moduleInfo[module].isActive = false;

        // Unbind compliance from the module
        try IComplianceModule(module).unbindCompliance(address(this)) {} catch {}

        emit ModuleRemoved(module);
    }

    /**
     * @notice Check if a module is active
     * @param module Address of the module
     * @return bool True if active
     */
    function isModuleActive(address module) external view returns (bool) {
        return _moduleInfo[module].isActive;
    }

    /**
     * @notice Get all active modules
     * @return address[] Array of module addresses
     */
    function getModules() external view returns (address[] memory) {
        return _modules;
    }

    /**
     * @notice Get module count
     * @return uint256 Number of active modules
     */
    function getModuleCount() external view returns (uint256) {
        return _modules.length;
    }

    /**
     * @notice Get module info
     * @param module Address of the module
     * @return info Module information struct
     */
    function getModuleInfo(address module) external view returns (ModuleInfo memory info) {
        return _moduleInfo[module];
    }

    // ============================================================================
    // COMPLIANCE CHECKS
    // ============================================================================

    /**
     * @notice Check if a transfer is allowed
     * @param from Sender address
     * @param to Receiver address
     * @param value Transfer amount
     * @return bool True if transfer is allowed by all modules
     */
    function canTransfer(
        address from,
        address to,
        uint256 value
    ) external view returns (bool) {
        if (_paused) return false;

        // Check all modules
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            try IComplianceModule(module).moduleCheck(from, to, value) returns (bool allowed) {
                if (!allowed) return false;
            } catch {
                // If module check fails, deny transfer
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Called after a transfer is executed
     * @param from Sender address
     * @param to Receiver address
     * @param value Transfer amount
     */
    function transferred(
        address from,
        address to,
        uint256 value
    ) external onlyBoundToken whenNotPaused {
        // Notify all modules
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            try IComplianceModule(module).moduleTransferAction(from, to, value) {
                emit ModuleInteraction(module, from, to, value);
            } catch {}
        }
    }

    /**
     * @notice Called after tokens are created/minted
     * @param to Recipient address
     * @param value Amount created
     */
    function created(address to, uint256 value) external onlyBoundToken whenNotPaused {
        // Notify all modules
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            try IComplianceModule(module).moduleMintAction(to, value) {
                emit ModuleInteraction(module, address(0), to, value);
            } catch {}
        }
    }

    /**
     * @notice Called after tokens are destroyed/burned
     * @param from Burner address
     * @param value Amount destroyed
     */
    function destroyed(address from, uint256 value) external onlyBoundToken whenNotPaused {
        // Notify all modules
        for (uint256 i = 0; i < _modules.length; i++) {
            address module = _modules[i];
            try IComplianceModule(module).moduleBurnAction(from, value) {
                emit ModuleInteraction(module, from, address(0), value);
            } catch {}
        }
    }

    // ============================================================================
    // PAUSE
    // ============================================================================

    /**
     * @notice Check if contract is paused
     * @return bool True if paused
     */
    function isPaused() external view returns (bool) {
        return _paused;
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _paused = true;
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _paused = false;
    }
}
