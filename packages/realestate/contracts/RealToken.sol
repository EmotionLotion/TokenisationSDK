// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IToken} from "../interfaces/IERC3643.sol";
import {ICompliance} from "../interfaces/ICompliance.sol";
import {IIdentityRegistry} from "../interfaces/IIdentityRegistry.sol";

/**
 * @title RealToken
 * @notice ERC-3643 compliant security token for real-world assets
 * @dev Implements the full T-REX token standard with:
 * - Identity Registry integration for investor verification
 * - Modular Compliance for transfer restrictions
 * - Address freezing and partial token freezing
 * - Recovery mechanism for lost wallets
 * - Batch operations for efficiency
 *
 * Designed for tokenization of:
 * - Real estate
 * - Securities
 * - Fund interests
 * - Other regulated assets
 */
contract RealToken is ERC20, Ownable, Pausable, ReentrancyGuard, IToken {
    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Identity Registry contract for KYC/AML verification
    address private _identityRegistry;

    /// @notice Compliance contract for transfer restrictions
    address private _compliance;

    /// @notice Mapping of frozen addresses
    mapping(address => bool) private _frozen;

    /// @notice Mapping of frozen token amounts per address
    mapping(address => uint256) private _frozenTokens;

    /// @notice List of agents authorized to manage the token
    address[] private _agents;
    mapping(address => bool) private _isAgent;

    /// @notice Onchain identity of the token
    address private _onchainID;

    /// @notice Token decimals (usually 0 for security tokens)
    uint8 private immutable _decimals;

    // ============================================================================
    // Modifiers
    // ============================================================================

    /**
     * @dev Restricts function to owner or agents
     */
    modifier onlyOwnerOrAgent() {
        require(
            msg.sender == owner() || _isAgent[msg.sender],
            "RealToken: caller is not owner or agent"
        );
        _;
    }

    /**
     * @dev Ensures address is not frozen
     */
    modifier notFrozen(address _userAddress) {
        require(!_frozen[_userAddress], "RealToken: address is frozen");
        _;
    }

    /**
     * @dev Ensures token has identity registry set
     */
    modifier hasIdentityRegistry() {
        require(_identityRegistry != address(0), "RealToken: identity registry not set");
        _;
    }

    /**
     * @dev Ensures token has compliance set
     */
    modifier hasCompliance() {
        require(_compliance != address(0), "RealToken: compliance not set");
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    /**
     * @notice Creates a new RealToken
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Token decimals (typically 0 or 18)
     * @param initialOwner_ Initial owner address
     * @param identityRegistry_ Identity registry address (can be zero, set later)
     * @param compliance_ Compliance contract address (can be zero, set later)
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address initialOwner_,
        address identityRegistry_,
        address compliance_
    ) ERC20(name_, symbol_) Ownable(initialOwner_) {
        _decimals = decimals_;
        _identityRegistry = identityRegistry_;
        _compliance = compliance_;
    }

    // ============================================================================
    // ERC20 Overrides
    // ============================================================================

    /**
     * @notice Returns the number of decimals
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Transfer tokens with compliance check
     */
    function transfer(
        address to,
        uint256 amount
    ) public virtual override(ERC20, IERC20) whenNotPaused notFrozen(msg.sender) returns (bool) {
        _checkCompliance(msg.sender, to, amount);
        _checkAvailableBalance(msg.sender, amount);
        bool success = super.transfer(to, amount);
        if (success) {
            _notifyComplianceTransfer(msg.sender, to, amount);
        }
        return success;
    }

    /**
     * @notice TransferFrom with compliance check
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public virtual override(ERC20, IERC20) whenNotPaused notFrozen(from) returns (bool) {
        _checkCompliance(from, to, amount);
        _checkAvailableBalance(from, amount);
        bool success = super.transferFrom(from, to, amount);
        if (success) {
            _notifyComplianceTransfer(from, to, amount);
        }
        return success;
    }

    // ============================================================================
    // Token Configuration (IToken)
    // ============================================================================

    /**
     * @notice Returns the identity registry address
     */
    function identityRegistry() external view override returns (address) {
        return _identityRegistry;
    }

    /**
     * @notice Returns the compliance contract address
     */
    function compliance() external view override returns (address) {
        return _compliance;
    }

    /**
     * @notice Sets the identity registry
     */
    function setIdentityRegistry(address identityRegistry_) external override onlyOwner {
        require(identityRegistry_ != address(0), "RealToken: zero address");
        _identityRegistry = identityRegistry_;
        emit IdentityRegistrySet(identityRegistry_);
    }

    /**
     * @notice Sets the compliance contract
     */
    function setCompliance(address compliance_) external override onlyOwner {
        require(compliance_ != address(0), "RealToken: zero address");
        _compliance = compliance_;
        emit ComplianceSet(compliance_);
    }

    // ============================================================================
    // Token Operations (IToken)
    // ============================================================================

    /**
     * @notice Mint tokens to a verified address
     */
    function mint(
        address to,
        uint256 amount
    ) external override onlyOwnerOrAgent hasIdentityRegistry {
        require(_isVerified(to), "RealToken: recipient not verified");
        _mint(to, amount);
        _notifyComplianceMint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @notice Burn tokens from an address
     */
    function burn(
        address from,
        uint256 amount
    ) external override onlyOwnerOrAgent {
        _checkAvailableBalance(from, amount);
        _burn(from, amount);
        _notifyComplianceBurn(from, amount);
        emit TokensBurned(from, amount);
    }

    /**
     * @notice Force transfer tokens (agent only)
     */
    function forcedTransfer(
        address from,
        address to,
        uint256 amount
    ) external override onlyOwnerOrAgent hasIdentityRegistry returns (bool) {
        require(_isVerified(to), "RealToken: recipient not verified");

        // Unfreeze tokens if needed for the transfer
        if (_frozenTokens[from] > 0 && balanceOf(from) - _frozenTokens[from] < amount) {
            uint256 needed = amount - (balanceOf(from) - _frozenTokens[from]);
            _frozenTokens[from] -= needed;
            emit TokensUnfrozen(from, needed);
        }

        _transfer(from, to, amount);
        _notifyComplianceTransfer(from, to, amount);
        return true;
    }

    // ============================================================================
    // Pause/Unpause (IToken)
    // ============================================================================

    /**
     * @notice Pause the token
     */
    function pause() external override onlyOwnerOrAgent {
        _pause();
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause the token
     */
    function unpause() external override onlyOwnerOrAgent {
        _unpause();
        emit Unpaused(msg.sender);
    }

    /**
     * @notice Check if paused
     */
    function paused() public view override(Pausable, IToken) returns (bool) {
        return super.paused();
    }

    // ============================================================================
    // Address Freezing (IToken)
    // ============================================================================

    /**
     * @notice Freeze or unfreeze an address
     */
    function setAddressFrozen(
        address userAddress,
        bool freeze
    ) external override onlyOwnerOrAgent {
        _frozen[userAddress] = freeze;
        emit AddressFrozen(userAddress, freeze, msg.sender);
    }

    /**
     * @notice Check if address is frozen
     */
    function isFrozen(address userAddress) external view override returns (bool) {
        return _frozen[userAddress];
    }

    // ============================================================================
    // Partial Token Freezing (IToken)
    // ============================================================================

    /**
     * @notice Freeze a specific amount of tokens
     */
    function freezePartialTokens(
        address userAddress,
        uint256 amount
    ) external override onlyOwnerOrAgent {
        require(
            balanceOf(userAddress) >= _frozenTokens[userAddress] + amount,
            "RealToken: insufficient balance to freeze"
        );
        _frozenTokens[userAddress] += amount;
        emit TokensFrozen(userAddress, amount);
    }

    /**
     * @notice Unfreeze a specific amount of tokens
     */
    function unfreezePartialTokens(
        address userAddress,
        uint256 amount
    ) external override onlyOwnerOrAgent {
        require(_frozenTokens[userAddress] >= amount, "RealToken: insufficient frozen tokens");
        _frozenTokens[userAddress] -= amount;
        emit TokensUnfrozen(userAddress, amount);
    }

    /**
     * @notice Get frozen token amount for an address
     */
    function getFrozenTokens(address userAddress) external view override returns (uint256) {
        return _frozenTokens[userAddress];
    }

    // ============================================================================
    // Recovery (IToken)
    // ============================================================================

    /**
     * @notice Recover tokens from a lost wallet
     */
    function recoveryAddress(
        address lostWallet,
        address newWallet,
        address investorOnchainID
    ) external override onlyOwnerOrAgent nonReentrant returns (bool) {
        require(lostWallet != address(0), "RealToken: invalid lost wallet");
        require(newWallet != address(0), "RealToken: invalid new wallet");
        require(balanceOf(lostWallet) > 0, "RealToken: no tokens to recover");
        require(_isVerified(newWallet), "RealToken: new wallet not verified");

        // Verify the investor's identity matches
        if (_identityRegistry != address(0) && investorOnchainID != address(0)) {
            address lostIdentity = IIdentityRegistry(_identityRegistry).getIdentity(lostWallet);
            require(
                lostIdentity == investorOnchainID,
                "RealToken: identity mismatch"
            );
        }

        // Transfer all tokens
        uint256 amount = balanceOf(lostWallet);
        _frozenTokens[lostWallet] = 0; // Unfreeze for recovery
        _frozen[lostWallet] = false;

        _transfer(lostWallet, newWallet, amount);

        emit RecoverySuccess(lostWallet, newWallet, investorOnchainID);
        return true;
    }

    // ============================================================================
    // Batch Operations (IToken)
    // ============================================================================

    /**
     * @notice Batch transfer to multiple recipients
     */
    function batchTransfer(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external override whenNotPaused notFrozen(msg.sender) {
        require(toList.length == amounts.length, "RealToken: length mismatch");
        require(toList.length <= 100, "RealToken: batch too large");

        for (uint256 i = 0; i < toList.length; i++) {
            transfer(toList[i], amounts[i]);
        }
    }

    /**
     * @notice Batch mint to multiple recipients
     */
    function batchMint(
        address[] calldata toList,
        uint256[] calldata amounts
    ) external override onlyOwnerOrAgent hasIdentityRegistry {
        require(toList.length == amounts.length, "RealToken: length mismatch");
        require(toList.length <= 100, "RealToken: batch too large");

        for (uint256 i = 0; i < toList.length; i++) {
            require(_isVerified(toList[i]), "RealToken: recipient not verified");
            _mint(toList[i], amounts[i]);
            _notifyComplianceMint(toList[i], amounts[i]);
            emit TokensMinted(toList[i], amounts[i]);
        }
    }

    /**
     * @notice Batch burn from multiple holders
     */
    function batchBurn(
        address[] calldata fromList,
        uint256[] calldata amounts
    ) external override onlyOwnerOrAgent {
        require(fromList.length == amounts.length, "RealToken: length mismatch");
        require(fromList.length <= 100, "RealToken: batch too large");

        for (uint256 i = 0; i < fromList.length; i++) {
            _checkAvailableBalance(fromList[i], amounts[i]);
            _burn(fromList[i], amounts[i]);
            _notifyComplianceBurn(fromList[i], amounts[i]);
            emit TokensBurned(fromList[i], amounts[i]);
        }
    }

    /**
     * @notice Batch freeze/unfreeze addresses
     */
    function batchSetAddressFrozen(
        address[] calldata userAddresses,
        bool[] calldata freeze
    ) external override onlyOwnerOrAgent {
        require(userAddresses.length == freeze.length, "RealToken: length mismatch");
        require(userAddresses.length <= 100, "RealToken: batch too large");

        for (uint256 i = 0; i < userAddresses.length; i++) {
            _frozen[userAddresses[i]] = freeze[i];
            emit AddressFrozen(userAddresses[i], freeze[i], msg.sender);
        }
    }

    /**
     * @notice Batch forced transfer
     */
    function batchForcedTransfer(
        address[] calldata fromList,
        address[] calldata toList,
        uint256[] calldata amounts
    ) external override onlyOwnerOrAgent hasIdentityRegistry {
        require(
            fromList.length == toList.length && toList.length == amounts.length,
            "RealToken: length mismatch"
        );
        require(fromList.length <= 100, "RealToken: batch too large");

        for (uint256 i = 0; i < fromList.length; i++) {
            require(_isVerified(toList[i]), "RealToken: recipient not verified");

            if (_frozenTokens[fromList[i]] > 0 && balanceOf(fromList[i]) - _frozenTokens[fromList[i]] < amounts[i]) {
                uint256 needed = amounts[i] - (balanceOf(fromList[i]) - _frozenTokens[fromList[i]]);
                _frozenTokens[fromList[i]] -= needed;
                emit TokensUnfrozen(fromList[i], needed);
            }

            _transfer(fromList[i], toList[i], amounts[i]);
            _notifyComplianceTransfer(fromList[i], toList[i], amounts[i]);
        }
    }

    // ============================================================================
    // Agent Management
    // ============================================================================

    /**
     * @notice Add an agent
     */
    function addAgent(address agent) external onlyOwner {
        require(agent != address(0), "RealToken: zero address");
        require(!_isAgent[agent], "RealToken: already agent");
        _agents.push(agent);
        _isAgent[agent] = true;
    }

    /**
     * @notice Remove an agent
     */
    function removeAgent(address agent) external onlyOwner {
        require(_isAgent[agent], "RealToken: not agent");
        _isAgent[agent] = false;

        // Remove from array
        for (uint256 i = 0; i < _agents.length; i++) {
            if (_agents[i] == agent) {
                _agents[i] = _agents[_agents.length - 1];
                _agents.pop();
                break;
            }
        }
    }

    /**
     * @notice Check if address is an agent
     */
    function isAgent(address agent) external view returns (bool) {
        return _isAgent[agent];
    }

    /**
     * @notice Get all agents
     */
    function agents() external view returns (address[] memory) {
        return _agents;
    }

    // ============================================================================
    // Onchain ID
    // ============================================================================

    /**
     * @notice Get token's onchain ID
     */
    function onchainID() external view returns (address) {
        return _onchainID;
    }

    /**
     * @notice Set token's onchain ID
     */
    function setOnchainID(address onchainID_) external onlyOwner {
        _onchainID = onchainID_;
    }

    // ============================================================================
    // Events (compliance notifications)
    // ============================================================================

    event ComplianceNotificationFailed(string operation, address indexed from, address indexed to, uint256 amount, bytes reason);

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @dev Check if address is verified in identity registry
     */
    function _isVerified(address userAddress) internal view returns (bool) {
        if (_identityRegistry == address(0)) {
            return false; // Fail-closed: no identity registry means no verification possible
        }
        return IIdentityRegistry(_identityRegistry).hasIdentity(userAddress);
    }

    /**
     * @dev Check compliance for a transfer
     */
    function _checkCompliance(address from, address to, uint256 amount) internal view {
        if (_compliance != address(0)) {
            require(
                ICompliance(_compliance).canTransfer(from, to, amount),
                "RealToken: transfer not compliant"
            );
        }
        if (_identityRegistry != address(0)) {
            require(_isVerified(to), "RealToken: recipient not verified");
        }
    }

    /**
     * @dev Check available (non-frozen) balance
     */
    function _checkAvailableBalance(address account, uint256 amount) internal view {
        require(
            balanceOf(account) - _frozenTokens[account] >= amount,
            "RealToken: insufficient available balance"
        );
    }

    /**
     * @dev Notify compliance of mint
     */
    function _notifyComplianceMint(address to, uint256 amount) internal {
        if (_compliance != address(0)) {
            try ICompliance(_compliance).created(to, amount) {} catch (bytes memory reason) {
                emit ComplianceNotificationFailed("mint", address(0), to, amount, reason);
            }
        }
    }

    /**
     * @dev Notify compliance of burn
     */
    function _notifyComplianceBurn(address from, uint256 amount) internal {
        if (_compliance != address(0)) {
            try ICompliance(_compliance).destroyed(from, amount) {} catch (bytes memory reason) {
                emit ComplianceNotificationFailed("burn", from, address(0), amount, reason);
            }
        }
    }

    /**
     * @dev Notify compliance of transfer
     */
    function _notifyComplianceTransfer(address from, address to, uint256 amount) internal {
        if (_compliance != address(0)) {
            try ICompliance(_compliance).transferred(from, to, amount) {} catch (bytes memory reason) {
                emit ComplianceNotificationFailed("transfer", from, to, amount, reason);
            }
        }
    }
}
