// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title HoldTimeModule
 * @notice Compliance module enforcing minimum holding periods before transfers
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Features:
 * - Configurable minimum hold time per token
 * - Tracks acquisition timestamps for each holder
 * - Supports partial transfers with oldest-first consumption
 * - Emergency override for regulatory compliance
 */
contract HoldTimeModule is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event MinHoldTimeSet(uint256 indexed holdTime);
    event HoldTimeExemptionSet(address indexed account, bool exempt);
    event TokenAcquired(address indexed account, uint256 amount, uint256 timestamp);

    // ============================================================================
    // Structs
    // ============================================================================

    struct HoldingRecord {
        uint256 amount;
        uint256 acquiredAt;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Module name
    string public constant name = "HoldTimeModule";

    /// @notice Whether module is plug-and-play
    bool public constant isPlugAndPlay = false;

    /// @notice Minimum hold time in seconds (default: 0 = no restriction)
    uint256 public minHoldTime;

    /// @notice Bound token address
    address public boundToken;

    /// @notice Addresses exempt from hold time restrictions
    mapping(address => bool) public isExempt;

    /// @notice Holdings per address (array of acquisition records)
    mapping(address => HoldingRecord[]) private _holdings;

    /// @notice Total balance tracked per address
    mapping(address => uint256) private _trackedBalance;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        uint256 _minHoldTime
    ) Ownable(initialOwner) {
        minHoldTime = _minHoldTime;
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
     * @notice Set minimum hold time
     * @param holdTime Time in seconds
     */
    function setMinHoldTime(uint256 holdTime) external onlyOwner {
        minHoldTime = holdTime;
        emit MinHoldTimeSet(holdTime);
    }

    /**
     * @notice Set exemption status for an address
     * @param account Address to exempt/unexempt
     * @param exempt Whether to exempt
     */
    function setExemption(address account, bool exempt) external onlyOwner {
        isExempt[account] = exempt;
        emit HoldTimeExemptionSet(account, exempt);
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
            emit HoldTimeExemptionSet(accounts[i], exemptions[i]);
        }
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    /**
     * @notice Check if transfer is compliant with hold time requirements
     * @param from Sender address
     * @param to Recipient address (unused)
     * @param value Transfer amount
     * @return Whether compliant
     */
    function moduleCheck(
        address from,
        address to,
        uint256 value,
        address /* token */
    ) external view returns (bool) {
        // No hold time = always allowed
        if (minHoldTime == 0) {
            return true;
        }

        // Exempt addresses can always transfer
        if (isExempt[from] || isExempt[to]) {
            return true;
        }

        // Minting (from == 0) is always allowed
        if (from == address(0)) {
            return true;
        }

        // Check if sender has enough transferable balance
        uint256 transferable = getTransferableBalance(from);
        return transferable >= value;
    }

    /**
     * @notice Called when tokens are minted
     * @param to Recipient address
     * @param value Amount minted
     */
    function moduleMint(address to, uint256 value) external {
        _recordAcquisition(to, value);
    }

    /**
     * @notice Called when tokens are burned
     * @param from Holder address
     * @param value Amount burned
     */
    function moduleBurn(address from, uint256 value) external {
        _consumeHoldings(from, value);
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
        // Consume oldest holdings from sender
        _consumeHoldings(from, value);

        // Record new acquisition for recipient
        _recordAcquisition(to, value);
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Record a new token acquisition
     */
    function _recordAcquisition(address account, uint256 amount) internal {
        if (amount == 0) return;

        _holdings[account].push(HoldingRecord({
            amount: amount,
            acquiredAt: block.timestamp
        }));
        _trackedBalance[account] += amount;

        emit TokenAcquired(account, amount, block.timestamp);
    }

    /**
     * @notice Consume holdings using FIFO (oldest first)
     */
    function _consumeHoldings(address account, uint256 amount) internal {
        if (amount == 0) return;

        uint256 remaining = amount;
        HoldingRecord[] storage holdings = _holdings[account];

        for (uint256 i = 0; i < holdings.length && remaining > 0; ) {
            if (holdings[i].amount <= remaining) {
                remaining -= holdings[i].amount;
                _trackedBalance[account] -= holdings[i].amount;

                // Remove this record by swapping with last and popping
                holdings[i] = holdings[holdings.length - 1];
                holdings.pop();
                // Don't increment i since we swapped
            } else {
                holdings[i].amount -= remaining;
                _trackedBalance[account] -= remaining;
                remaining = 0;
                i++;
            }
        }
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get transferable balance (tokens past hold time)
     * @param account Holder address
     * @return Amount that can be transferred
     */
    function getTransferableBalance(address account) public view returns (uint256) {
        if (minHoldTime == 0 || isExempt[account]) {
            return _trackedBalance[account];
        }

        uint256 transferable = 0;
        uint256 cutoff = block.timestamp - minHoldTime;

        HoldingRecord[] storage holdings = _holdings[account];
        for (uint256 i = 0; i < holdings.length; i++) {
            if (holdings[i].acquiredAt <= cutoff) {
                transferable += holdings[i].amount;
            }
        }

        return transferable;
    }

    /**
     * @notice Get locked balance (tokens within hold time)
     * @param account Holder address
     * @return Amount that is locked
     */
    function getLockedBalance(address account) external view returns (uint256) {
        return _trackedBalance[account] - getTransferableBalance(account);
    }

    /**
     * @notice Get all holdings for an account
     * @param account Holder address
     * @return Array of holding records
     */
    function getHoldings(address account) external view returns (HoldingRecord[] memory) {
        return _holdings[account];
    }

    /**
     * @notice Get tracked balance
     * @param account Holder address
     * @return Total tracked balance
     */
    function getTrackedBalance(address account) external view returns (uint256) {
        return _trackedBalance[account];
    }

    /**
     * @notice Get time until a specific amount becomes transferable
     * @param account Holder address
     * @param amount Amount to check
     * @return Seconds until amount is transferable (0 if already transferable)
     */
    function timeUntilTransferable(
        address account,
        uint256 amount
    ) external view returns (uint256) {
        if (isExempt[account] || minHoldTime == 0) {
            return 0;
        }

        uint256 needed = amount;
        uint256 latestRequired = 0;

        HoldingRecord[] storage holdings = _holdings[account];

        // Sort would be expensive, so we iterate and track
        for (uint256 i = 0; i < holdings.length && needed > 0; i++) {
            uint256 unlockTime = holdings[i].acquiredAt + minHoldTime;

            if (holdings[i].amount <= needed) {
                needed -= holdings[i].amount;
                if (unlockTime > latestRequired) {
                    latestRequired = unlockTime;
                }
            } else {
                if (unlockTime > latestRequired) {
                    latestRequired = unlockTime;
                }
                needed = 0;
            }
        }

        if (needed > 0) {
            return type(uint256).max; // Insufficient balance
        }

        if (block.timestamp >= latestRequired) {
            return 0;
        }

        return latestRequired - block.timestamp;
    }
}
