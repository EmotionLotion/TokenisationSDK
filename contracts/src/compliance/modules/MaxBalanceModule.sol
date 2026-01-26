// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MaxBalanceModule
 * @notice Compliance module for maximum balance/ownership limits
 * @dev Prevents whale accumulation and ensures distribution
 */
contract MaxBalanceModule is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event MaxBalanceSet(uint256 maxBalance);
    event MaxPercentageSet(uint256 maxPercentage);
    event ExemptAddressAdded(address indexed account);
    event ExemptAddressRemoved(address indexed account);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Maximum token balance per holder (0 = unlimited)
    uint256 public maxBalance;

    /// @notice Maximum percentage of total supply per holder (basis points, 10000 = 100%)
    uint256 public maxPercentage;

    /// @notice Addresses exempt from limits
    mapping(address => bool) public exemptAddresses;

    /// @notice Module name
    string public constant name = "MaxBalanceModule";

    /// @notice Whether module is plug-and-play
    bool public constant isPlugAndPlay = true;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        uint256 _maxBalance,
        uint256 _maxPercentage
    ) Ownable(initialOwner) {
        maxBalance = _maxBalance;
        maxPercentage = _maxPercentage;
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set maximum balance limit
     * @param _maxBalance New max balance (0 for unlimited)
     */
    function setMaxBalance(uint256 _maxBalance) external onlyOwner {
        maxBalance = _maxBalance;
        emit MaxBalanceSet(_maxBalance);
    }

    /**
     * @notice Set maximum percentage limit
     * @param _maxPercentage New max percentage in basis points
     */
    function setMaxPercentage(uint256 _maxPercentage) external onlyOwner {
        require(_maxPercentage <= 10000, "Invalid percentage");
        maxPercentage = _maxPercentage;
        emit MaxPercentageSet(_maxPercentage);
    }

    /**
     * @notice Add an exempt address
     * @param account Address to exempt
     */
    function addExemptAddress(address account) external onlyOwner {
        exemptAddresses[account] = true;
        emit ExemptAddressAdded(account);
    }

    /**
     * @notice Remove an exempt address
     * @param account Address to remove exemption
     */
    function removeExemptAddress(address account) external onlyOwner {
        exemptAddresses[account] = false;
        emit ExemptAddressRemoved(account);
    }

    // ============================================================================
    // Compliance Module Interface
    // ============================================================================

    /**
     * @notice Check if transfer is compliant
     */
    function moduleCheck(
        address /* from */,
        address to,
        uint256 value,
        address token
    ) external view returns (bool) {
        // Exempt addresses bypass all checks
        if (exemptAddresses[to]) {
            return true;
        }

        // Get current balance of recipient
        uint256 currentBalance = IERC20(token).balanceOf(to);
        uint256 newBalance = currentBalance + value;

        // Check absolute max balance
        if (maxBalance > 0 && newBalance > maxBalance) {
            return false;
        }

        // Check percentage of total supply
        if (maxPercentage > 0) {
            uint256 totalSupply = IERC20(token).totalSupply();
            if (totalSupply > 0) {
                uint256 newPercentage = (newBalance * 10000) / totalSupply;
                if (newPercentage > maxPercentage) {
                    return false;
                }
            }
        }

        return true;
    }

    function moduleMint(address /* to */, uint256 /* value */) external pure {
        // Could add additional mint checks here
    }

    function moduleBurn(address /* from */, uint256 /* value */) external pure {
        // No action needed on burn
    }

    function moduleTransfer(
        address /* from */,
        address /* to */,
        uint256 /* value */
    ) external pure {
        // No action needed (check happens in moduleCheck)
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Check if an address is exempt
     * @param account The address to check
     * @return Whether exempt
     */
    function isExempt(address account) external view returns (bool) {
        return exemptAddresses[account];
    }

    /**
     * @notice Calculate max allowed balance based on total supply
     * @param token The token address
     * @return maxAllowed The maximum allowed balance
     */
    function getMaxAllowedBalance(address token) external view returns (uint256 maxAllowed) {
        if (maxBalance > 0 && maxPercentage == 0) {
            return maxBalance;
        }

        if (maxPercentage > 0) {
            uint256 totalSupply = IERC20(token).totalSupply();
            uint256 percentageLimit = (totalSupply * maxPercentage) / 10000;

            if (maxBalance > 0) {
                return maxBalance < percentageLimit ? maxBalance : percentageLimit;
            }
            return percentageLimit;
        }

        return type(uint256).max;
    }
}
