// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title IIdentityRegistry
 * @notice Interface for the IdentityRegistry contract
 */
interface IIdentityRegistry {
    function isVerified(address wallet) external view returns (bool);
    function isFrozen(address wallet) external view returns (bool);
    function canTransfer(address from, address to) external view returns (bool);
    function getInvestorType(address wallet) external view returns (uint8);
    function getCountryCode(address wallet) external view returns (uint16);
}

/**
 * @title ComplianceToken
 * @notice ERC20 token with built-in compliance checks via IdentityRegistry
 * @dev All transfers are checked against the IdentityRegistry for KYC/AML compliance
 *
 * Reference: ERC-3643 T-REX Token Standard
 */
contract ComplianceToken is ERC20, ERC20Burnable, ERC20Pausable, AccessControl {
    // ============================================================================
    // ROLES
    // ============================================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // ============================================================================
    // STATE
    // ============================================================================

    /// @notice The identity registry contract
    IIdentityRegistry public identityRegistry;

    /// @notice Mapping of frozen accounts (additional to registry)
    mapping(address => bool) private _frozenAccounts;

    /// @notice Maximum number of token holders (0 = unlimited)
    uint256 public maxHolders;

    /// @notice Current number of token holders
    uint256 public holderCount;

    /// @notice Minimum transfer amount
    uint256 public minTransferAmount;

    /// @notice Maximum holding per address (0 = unlimited)
    uint256 public maxHoldingAmount;

    /// @notice Mapping to track if address is a holder
    mapping(address => bool) private _isHolder;

    /// @notice Lockup end timestamp (0 = no lockup)
    uint256 public lockupEndTime;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event IdentityRegistrySet(address indexed registry);
    event AccountFrozen(address indexed account, string reason);
    event AccountUnfrozen(address indexed account);
    event MaxHoldersUpdated(uint256 newMax);
    event MinTransferAmountUpdated(uint256 newMin);
    event MaxHoldingAmountUpdated(uint256 newMax);
    event LockupEndTimeUpdated(uint256 newEndTime);
    event ForcedTransfer(address indexed from, address indexed to, uint256 amount, string reason);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error SenderNotVerified(address sender);
    error ReceiverNotVerified(address receiver);
    error SenderFrozen(address sender);
    error ReceiverFrozen(address receiver);
    error TransferNotCompliant(address from, address to);
    error MaxHoldersReached(uint256 current, uint256 max);
    error BelowMinTransferAmount(uint256 amount, uint256 min);
    error ExceedsMaxHolding(uint256 newBalance, uint256 max);
    error InLockupPeriod(uint256 lockupEnd);
    error ZeroAddressNotAllowed();
    error IdentityRegistryNotSet();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(
        string memory name,
        string memory symbol,
        address admin,
        address registry
    ) ERC20(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);

        if (registry != address(0)) {
            identityRegistry = IIdentityRegistry(registry);
            emit IdentityRegistrySet(registry);
        }
    }

    // ============================================================================
    // TOKEN OPERATIONS
    // ============================================================================

    /**
     * @notice Mint tokens to an address
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddressNotAllowed();
        _checkComplianceForMint(to, amount);
        _updateHolderStatus(to, balanceOf(to), balanceOf(to) + amount);
        _mint(to, amount);
    }

    /**
     * @notice Forced transfer by compliance agent
     * @param from Source address
     * @param to Destination address
     * @param amount Amount to transfer
     * @param reason Reason for forced transfer
     */
    function forcedTransfer(
        address from,
        address to,
        uint256 amount,
        string calldata reason
    ) external onlyRole(AGENT_ROLE) {
        if (from == address(0) || to == address(0)) revert ZeroAddressNotAllowed();

        uint256 fromBalanceBefore = balanceOf(from);
        uint256 toBalanceBefore = balanceOf(to);

        _transfer(from, to, amount);

        _updateHolderStatus(from, fromBalanceBefore, balanceOf(from));
        _updateHolderStatus(to, toBalanceBefore, balanceOf(to));

        emit ForcedTransfer(from, to, amount, reason);
    }

    /**
     * @notice Recovery function to rescue tokens sent to wrong address
     * @param lostWallet The wallet that lost tokens
     * @param newWallet The wallet to recover to
     * @param amount Amount to recover
     */
    function recoveryTransfer(
        address lostWallet,
        address newWallet,
        uint256 amount
    ) external onlyRole(AGENT_ROLE) {
        forcedTransfer(lostWallet, newWallet, amount, "Recovery transfer");
    }

    // ============================================================================
    // FREEZE MANAGEMENT
    // ============================================================================

    /**
     * @notice Freeze an account
     * @param account Account to freeze
     * @param reason Reason for freezing
     */
    function freeze(address account, string calldata reason) external onlyRole(AGENT_ROLE) {
        _frozenAccounts[account] = true;
        emit AccountFrozen(account, reason);
    }

    /**
     * @notice Unfreeze an account
     * @param account Account to unfreeze
     */
    function unfreeze(address account) external onlyRole(AGENT_ROLE) {
        _frozenAccounts[account] = false;
        emit AccountUnfrozen(account);
    }

    /**
     * @notice Check if account is frozen (local or in registry)
     * @param account Account to check
     * @return bool True if frozen
     */
    function isFrozen(address account) public view returns (bool) {
        if (_frozenAccounts[account]) return true;
        if (address(identityRegistry) != address(0)) {
            return identityRegistry.isFrozen(account);
        }
        return false;
    }

    // ============================================================================
    // COMPLIANCE SETTINGS
    // ============================================================================

    /**
     * @notice Set the identity registry
     * @param registry New registry address
     */
    function setIdentityRegistry(address registry) external onlyRole(DEFAULT_ADMIN_ROLE) {
        identityRegistry = IIdentityRegistry(registry);
        emit IdentityRegistrySet(registry);
    }

    /**
     * @notice Set maximum holders
     * @param _maxHolders New maximum (0 = unlimited)
     */
    function setMaxHolders(uint256 _maxHolders) external onlyRole(COMPLIANCE_ROLE) {
        maxHolders = _maxHolders;
        emit MaxHoldersUpdated(_maxHolders);
    }

    /**
     * @notice Set minimum transfer amount
     * @param _minTransferAmount New minimum
     */
    function setMinTransferAmount(uint256 _minTransferAmount) external onlyRole(COMPLIANCE_ROLE) {
        minTransferAmount = _minTransferAmount;
        emit MinTransferAmountUpdated(_minTransferAmount);
    }

    /**
     * @notice Set maximum holding amount
     * @param _maxHoldingAmount New maximum (0 = unlimited)
     */
    function setMaxHoldingAmount(uint256 _maxHoldingAmount) external onlyRole(COMPLIANCE_ROLE) {
        maxHoldingAmount = _maxHoldingAmount;
        emit MaxHoldingAmountUpdated(_maxHoldingAmount);
    }

    /**
     * @notice Set lockup end time
     * @param _lockupEndTime New lockup end timestamp
     */
    function setLockupEndTime(uint256 _lockupEndTime) external onlyRole(COMPLIANCE_ROLE) {
        lockupEndTime = _lockupEndTime;
        emit LockupEndTimeUpdated(_lockupEndTime);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Check if transfer is compliant
     * @param from Sender address
     * @param to Receiver address
     * @param amount Transfer amount
     * @return bool True if compliant
     */
    function canTransfer(
        address from,
        address to,
        uint256 amount
    ) external view returns (bool) {
        // Check frozen
        if (isFrozen(from) || isFrozen(to)) return false;

        // Check lockup
        if (lockupEndTime != 0 && block.timestamp < lockupEndTime) return false;

        // Check minimum transfer
        if (minTransferAmount != 0 && amount < minTransferAmount) return false;

        // Check max holding
        if (maxHoldingAmount != 0 && balanceOf(to) + amount > maxHoldingAmount) return false;

        // Check max holders for new holder
        if (!_isHolder[to] && balanceOf(to) == 0) {
            if (maxHolders != 0 && holderCount >= maxHolders) return false;
        }

        // Check identity registry
        if (address(identityRegistry) != address(0)) {
            return identityRegistry.canTransfer(from, to);
        }

        return true;
    }

    /**
     * @notice Get holder count
     * @return uint256 Current holder count
     */
    function getHolderCount() external view returns (uint256) {
        return holderCount;
    }

    /**
     * @notice Check if address is a holder
     * @param account Address to check
     * @return bool True if holder
     */
    function isHolder(address account) external view returns (bool) {
        return _isHolder[account];
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    /**
     * @dev Hook that is called before any transfer
     */
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        // Skip checks for minting (from == 0) and burning (to == 0)
        // Minting checks are done in mint function
        // Allow burns always
        if (from != address(0) && to != address(0)) {
            _checkCompliance(from, to, amount);

            // Update holder status
            _updateHolderStatus(from, balanceOf(from), balanceOf(from) - amount);
            _updateHolderStatus(to, balanceOf(to), balanceOf(to) + amount);
        }

        super._update(from, to, amount);
    }

    /**
     * @dev Check compliance for a transfer
     */
    function _checkCompliance(address from, address to, uint256 amount) internal view {
        // Check frozen accounts
        if (isFrozen(from)) revert SenderFrozen(from);
        if (isFrozen(to)) revert ReceiverFrozen(to);

        // Check lockup period
        if (lockupEndTime != 0 && block.timestamp < lockupEndTime) {
            revert InLockupPeriod(lockupEndTime);
        }

        // Check minimum transfer amount
        if (minTransferAmount != 0 && amount < minTransferAmount) {
            revert BelowMinTransferAmount(amount, minTransferAmount);
        }

        // Check max holding amount
        if (maxHoldingAmount != 0 && balanceOf(to) + amount > maxHoldingAmount) {
            revert ExceedsMaxHolding(balanceOf(to) + amount, maxHoldingAmount);
        }

        // Check max holders for new holders
        if (!_isHolder[to] && balanceOf(to) == 0) {
            if (maxHolders != 0 && holderCount >= maxHolders) {
                revert MaxHoldersReached(holderCount, maxHolders);
            }
        }

        // Check with identity registry
        if (address(identityRegistry) != address(0)) {
            if (!identityRegistry.isVerified(from)) revert SenderNotVerified(from);
            if (!identityRegistry.isVerified(to)) revert ReceiverNotVerified(to);
            if (!identityRegistry.canTransfer(from, to)) {
                revert TransferNotCompliant(from, to);
            }
        }
    }

    /**
     * @dev Check compliance for minting
     */
    function _checkComplianceForMint(address to, uint256 amount) internal view {
        // Check frozen
        if (isFrozen(to)) revert ReceiverFrozen(to);

        // Check max holding
        if (maxHoldingAmount != 0 && balanceOf(to) + amount > maxHoldingAmount) {
            revert ExceedsMaxHolding(balanceOf(to) + amount, maxHoldingAmount);
        }

        // Check max holders
        if (!_isHolder[to] && balanceOf(to) == 0) {
            if (maxHolders != 0 && holderCount >= maxHolders) {
                revert MaxHoldersReached(holderCount, maxHolders);
            }
        }

        // Check identity registry
        if (address(identityRegistry) != address(0)) {
            if (!identityRegistry.isVerified(to)) revert ReceiverNotVerified(to);
        }
    }

    /**
     * @dev Update holder tracking
     */
    function _updateHolderStatus(
        address account,
        uint256 balanceBefore,
        uint256 balanceAfter
    ) internal {
        if (balanceBefore == 0 && balanceAfter > 0) {
            // New holder
            _isHolder[account] = true;
            holderCount++;
        } else if (balanceBefore > 0 && balanceAfter == 0) {
            // No longer a holder
            _isHolder[account] = false;
            holderCount--;
        }
    }

    // ============================================================================
    // PAUSE
    // ============================================================================

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
