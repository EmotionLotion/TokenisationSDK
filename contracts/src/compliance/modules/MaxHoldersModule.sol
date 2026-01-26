// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MaxHoldersModule
 * @notice Compliance module limiting the maximum number of token holders
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Features:
 * - Configurable maximum holder count per token
 * - Tracks holder count automatically on transfers
 * - Prevents new holders when limit is reached
 * - Supports exempted addresses (e.g., treasury, exchanges)
 *
 * Use cases:
 * - Regulation D 506(b) offerings (max 35 non-accredited investors)
 * - Private placements with investor limits
 * - Closed-end funds with membership caps
 */
contract MaxHoldersModule is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event MaxHoldersSet(uint256 indexed maxHolders);
    event HolderAdded(address indexed holder, uint256 totalHolders);
    event HolderRemoved(address indexed holder, uint256 totalHolders);
    event HolderExemptionSet(address indexed account, bool exempt);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Module name
    string public constant name = "MaxHoldersModule";

    /// @notice Whether module is plug-and-play
    bool public constant isPlugAndPlay = false;

    /// @notice Maximum number of holders allowed (0 = unlimited)
    uint256 public maxHolders;

    /// @notice Current number of holders
    uint256 public holderCount;

    /// @notice Bound token address
    address public boundToken;

    /// @notice Mapping of current holders
    mapping(address => bool) public isHolder;

    /// @notice Addresses exempt from holder count (don't count towards limit)
    mapping(address => bool) public isExempt;

    /// @notice Array of all holders for enumeration
    address[] private _holders;

    /// @notice Index of each holder in the array
    mapping(address => uint256) private _holderIndex;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        uint256 _maxHolders
    ) Ownable(initialOwner) {
        maxHolders = _maxHolders;
        emit MaxHoldersSet(_maxHolders);
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set the bound token
     * @param token Token address
     */
    function setToken(address token) external onlyOwner {
        require(token != address(0), "Invalid token");
        boundToken = token;
    }

    /**
     * @notice Set maximum holder count
     * @param _maxHolders New maximum (0 = unlimited)
     */
    function setMaxHolders(uint256 _maxHolders) external onlyOwner {
        require(_maxHolders == 0 || _maxHolders >= holderCount, "Below current count");
        maxHolders = _maxHolders;
        emit MaxHoldersSet(_maxHolders);
    }

    /**
     * @notice Set exemption status for an address
     * @param account Address to exempt
     * @param exempt Whether to exempt
     */
    function setExemption(address account, bool exempt) external onlyOwner {
        isExempt[account] = exempt;
        emit HolderExemptionSet(account, exempt);
    }

    /**
     * @notice Batch set exemptions
     * @param accounts Addresses to update
     * @param exemptions Exemption statuses
     */
    function setExemptionsBatch(
        address[] calldata accounts,
        bool[] calldata exemptions
    ) external onlyOwner {
        require(accounts.length == exemptions.length, "Length mismatch");
        for (uint256 i = 0; i < accounts.length; i++) {
            isExempt[accounts[i]] = exemptions[i];
            emit HolderExemptionSet(accounts[i], exemptions[i]);
        }
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    /**
     * @notice Check if transfer is compliant with holder limits
     * @param from Sender address
     * @param to Recipient address
     * @param value Transfer amount
     * @return Whether compliant
     */
    function moduleCheck(
        address from,
        address to,
        uint256 value,
        address /* token */
    ) external view returns (bool) {
        // No limit = always allowed
        if (maxHolders == 0) {
            return true;
        }

        // Zero value transfers don't affect holder count
        if (value == 0) {
            return true;
        }

        // Exempt recipients don't count towards limit
        if (isExempt[to]) {
            return true;
        }

        // If recipient is already a holder, no new holder added
        if (isHolder[to]) {
            return true;
        }

        // Minting to zero address (burn) is always allowed
        if (to == address(0)) {
            return true;
        }

        // Check if adding a new holder would exceed limit
        // Note: If sender becomes non-holder, count stays same
        bool senderBecomesNonHolder = _wouldBecomeNonHolder(from, value);

        if (senderBecomesNonHolder) {
            // One out, one in - count stays same
            return true;
        }

        // Adding new holder - check if we have room
        return holderCount < maxHolders;
    }

    /**
     * @notice Called when tokens are minted
     * @param to Recipient address
     * @param value Amount minted
     */
    function moduleMint(address to, uint256 value) external {
        if (value > 0 && to != address(0)) {
            _addHolder(to);
        }
    }

    /**
     * @notice Called when tokens are burned
     * @param from Holder address
     * @param value Amount burned
     */
    function moduleBurn(address from, uint256 value) external {
        if (value > 0 && from != address(0)) {
            _checkAndRemoveHolder(from, value);
        }
    }

    /**
     * @notice Called when tokens are transferred
     * @param from Sender address
     * @param to Recipient address
     * @param value Amount transferred
     */
    function moduleTransfer(
        address from,
        address to,
        uint256 value
    ) external {
        if (value == 0) return;

        // Check if sender becomes non-holder after transfer
        if (from != address(0)) {
            _checkAndRemoveHolder(from, value);
        }

        // Add recipient as holder if not already
        if (to != address(0)) {
            _addHolder(to);
        }
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Add address as a holder
     */
    function _addHolder(address account) internal {
        if (isHolder[account] || isExempt[account]) {
            return;
        }

        isHolder[account] = true;
        _holderIndex[account] = _holders.length;
        _holders.push(account);
        holderCount++;

        emit HolderAdded(account, holderCount);
    }

    /**
     * @notice Remove address from holders if balance becomes zero
     */
    function _checkAndRemoveHolder(address account, uint256 transferAmount) internal {
        if (!isHolder[account] || isExempt[account]) {
            return;
        }

        // Get current balance from token (if bound)
        uint256 currentBalance = _getBalance(account);

        // If transfer amount equals or exceeds balance, remove holder
        if (transferAmount >= currentBalance) {
            _removeHolder(account);
        }
    }

    /**
     * @notice Remove address from holders
     */
    function _removeHolder(address account) internal {
        if (!isHolder[account]) {
            return;
        }

        isHolder[account] = false;

        // Swap with last and pop for O(1) removal
        uint256 index = _holderIndex[account];
        uint256 lastIndex = _holders.length - 1;

        if (index != lastIndex) {
            address lastHolder = _holders[lastIndex];
            _holders[index] = lastHolder;
            _holderIndex[lastHolder] = index;
        }

        _holders.pop();
        delete _holderIndex[account];
        holderCount--;

        emit HolderRemoved(account, holderCount);
    }

    /**
     * @notice Check if transfer would make sender a non-holder
     */
    function _wouldBecomeNonHolder(address account, uint256 transferAmount) internal view returns (bool) {
        if (account == address(0) || !isHolder[account]) {
            return false;
        }

        uint256 currentBalance = _getBalance(account);
        return transferAmount >= currentBalance;
    }

    /**
     * @notice Get balance from bound token
     */
    function _getBalance(address account) internal view returns (uint256) {
        if (boundToken == address(0)) {
            return 0;
        }

        (bool success, bytes memory data) = boundToken.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );

        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }

        return 0;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all current holders
     * @return Array of holder addresses
     */
    function getHolders() external view returns (address[] memory) {
        return _holders;
    }

    /**
     * @notice Get holders with pagination
     * @param offset Start index
     * @param limit Max number to return
     * @return holders Array of holder addresses
     * @return total Total holder count
     */
    function getHoldersPaginated(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory holders, uint256 total) {
        total = _holders.length;

        if (offset >= total) {
            return (new address[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        holders = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            holders[i - offset] = _holders[i];
        }
    }

    /**
     * @notice Get available holder slots
     * @return Number of slots remaining (type(uint256).max if unlimited)
     */
    function getAvailableSlots() external view returns (uint256) {
        if (maxHolders == 0) {
            return type(uint256).max;
        }
        if (holderCount >= maxHolders) {
            return 0;
        }
        return maxHolders - holderCount;
    }

    /**
     * @notice Check if a new holder can be added
     * @return Whether a new holder can be added
     */
    function canAddHolder() external view returns (bool) {
        return maxHolders == 0 || holderCount < maxHolders;
    }
}
