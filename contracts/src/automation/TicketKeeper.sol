// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "../tokens/AirlineTicketNFT.sol";

/**
 * @title TicketKeeper
 * @notice Chainlink Automation compatible contract for automated airline ticket lifecycle
 * @dev Delegates to AirlineTicketNFT's built-in checkUpkeep/performUpkeep but adds
 *      configurable policies and monitoring on top.
 *
 * Automated actions:
 * 1. Auto-expire tickets when departure time has passed
 * 2. Auto-process refunds for cancelled flights
 * 3. Emit notifications for upcoming departures (gate changes, delays)
 */
contract TicketKeeper is AutomationCompatibleInterface, Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event TicketAutoExpired(address indexed nftContract, uint256 indexed tokenId);
    event TicketAutoRefunded(address indexed nftContract, uint256 indexed tokenId, uint256 amount);
    event UpkeepPerformed(address indexed nftContract, uint256 expiredCount, uint256 refundedCount, uint256 timestamp);
    event NFTContractRegistered(address indexed nftContract);
    event NFTContractRemoved(address indexed nftContract);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Registered AirlineTicketNFT contracts to monitor
    address[] public nftContracts;
    mapping(address => bool) public isRegistered;

    /// @notice Minimum interval between upkeeps
    uint256 public minCheckInterval = 3600; // 1 hour

    /// @notice Last upkeep timestamp
    uint256 public lastUpkeepTime;

    /// @notice Total tickets expired/refunded across all upkeeps
    uint256 public totalExpired;
    uint256 public totalRefunded;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Contract Management
    // ============================================================================

    /**
     * @notice Register an AirlineTicketNFT contract for monitoring
     * @param nftContract Address of the AirlineTicketNFT contract
     */
    function registerNFTContract(address nftContract) external onlyOwner {
        require(!isRegistered[nftContract], "TicketKeeper: already registered");
        nftContracts.push(nftContract);
        isRegistered[nftContract] = true;
        emit NFTContractRegistered(nftContract);
    }

    /**
     * @notice Remove an AirlineTicketNFT contract from monitoring
     * @param nftContract Address to remove
     */
    function removeNFTContract(address nftContract) external onlyOwner {
        require(isRegistered[nftContract], "TicketKeeper: not registered");
        isRegistered[nftContract] = false;

        // Remove from array (swap and pop)
        for (uint256 i = 0; i < nftContracts.length; i++) {
            if (nftContracts[i] == nftContract) {
                nftContracts[i] = nftContracts[nftContracts.length - 1];
                nftContracts.pop();
                break;
            }
        }

        emit NFTContractRemoved(nftContract);
    }

    /**
     * @notice Update configuration
     */
    function setMinCheckInterval(uint256 interval) external onlyOwner {
        minCheckInterval = interval;
    }

    // ============================================================================
    // Chainlink Automation
    // ============================================================================

    /**
     * @notice Check if any registered NFT contracts need upkeep
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Encoded data of which contracts need attention
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastUpkeepTime + minCheckInterval) {
            return (false, "");
        }

        // Check each registered NFT contract
        address[] memory needsUpkeep = new address[](nftContracts.length);
        bytes[] memory upkeepData = new bytes[](nftContracts.length);
        uint256 count = 0;

        for (uint256 i = 0; i < nftContracts.length; i++) {
            if (!isRegistered[nftContracts[i]]) continue;

            try AirlineTicketNFT(payable(nftContracts[i])).checkUpkeep("") returns (bool needed, bytes memory data) {
                if (needed) {
                    needsUpkeep[count] = nftContracts[i];
                    upkeepData[count] = data;
                    count++;
                }
            } catch {
                // Skip contracts that fail checkUpkeep
                continue;
            }
        }

        if (count > 0) {
            // Trim arrays
            address[] memory trimmedContracts = new address[](count);
            bytes[] memory trimmedData = new bytes[](count);
            for (uint256 i = 0; i < count; i++) {
                trimmedContracts[i] = needsUpkeep[i];
                trimmedData[i] = upkeepData[i];
            }

            upkeepNeeded = true;
            performData = abi.encode(trimmedContracts, trimmedData);
        }
    }

    /**
     * @notice Execute upkeep on registered NFT contracts
     * @param performData Encoded contract addresses and their upkeep data
     */
    function performUpkeep(bytes calldata performData) external override {
        (address[] memory contracts, bytes[] memory data) = abi.decode(performData, (address[], bytes[]));

        uint256 totalExpiredThisRun = 0;
        uint256 totalRefundedThisRun = 0;

        for (uint256 i = 0; i < contracts.length; i++) {
            if (!isRegistered[contracts[i]]) continue;

            try AirlineTicketNFT(payable(contracts[i])).performUpkeep(data[i]) {
                // Decode the data to count expirations and refunds
                (uint256[] memory expireIds, uint256[] memory refundIds) = abi.decode(data[i], (uint256[], uint256[]));
                totalExpiredThisRun += expireIds.length;
                totalRefundedThisRun += refundIds.length;

                for (uint256 j = 0; j < expireIds.length; j++) {
                    emit TicketAutoExpired(contracts[i], expireIds[j]);
                }
                for (uint256 j = 0; j < refundIds.length; j++) {
                    emit TicketAutoRefunded(contracts[i], refundIds[j], 0);
                }
            } catch {
                // Log failed upkeep but continue with other contracts
                continue;
            }

            emit UpkeepPerformed(contracts[i], totalExpiredThisRun, totalRefundedThisRun, block.timestamp);
        }

        totalExpired += totalExpiredThisRun;
        totalRefunded += totalRefundedThisRun;
        lastUpkeepTime = block.timestamp;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    function getRegisteredContracts() external view returns (address[] memory) {
        return nftContracts;
    }

    function getStats() external view returns (
        uint256 registeredCount,
        uint256 _totalExpired,
        uint256 _totalRefunded,
        uint256 _lastUpkeepTime
    ) {
        return (nftContracts.length, totalExpired, totalRefunded, lastUpkeepTime);
    }
}
