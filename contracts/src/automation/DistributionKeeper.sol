// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DistributionKeeper
 * @notice Chainlink Automation compatible contract for automated dividend distributions
 * @dev Checks for pending distributions and executes them automatically
 */
contract DistributionKeeper is AutomationCompatibleInterface, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================================
    // Errors
    // ============================================================================

    error DistributionNotFound(bytes32 distributionId);
    error DistributionAlreadyExecuted(bytes32 distributionId);
    error DistributionNotDue(bytes32 distributionId, uint256 nextExecutionTime);
    error InsufficientFunds(address token, uint256 required, uint256 available);
    error NoRecipientsConfigured(bytes32 distributionId);
    error TransferFailed(address recipient, uint256 amount);

    // ============================================================================
    // Events
    // ============================================================================

    event DistributionCreated(
        bytes32 indexed distributionId,
        bytes32 indexed assetId,
        address token,
        uint256 totalAmount,
        uint256 frequency
    );
    event DistributionExecuted(
        bytes32 indexed distributionId,
        uint256 totalDistributed,
        uint256 recipientCount,
        uint256 timestamp
    );
    event RecipientPaid(
        bytes32 indexed distributionId,
        address indexed recipient,
        uint256 amount
    );
    event DistributionPaused(bytes32 indexed distributionId);
    event DistributionResumed(bytes32 indexed distributionId);
    event RecipientUpdated(bytes32 indexed distributionId, address recipient, uint256 share);

    // ============================================================================
    // Structs
    // ============================================================================

    struct Distribution {
        bytes32 assetId;
        address token;              // ERC20 token to distribute (address(0) for native)
        uint256 totalAmount;        // Total amount per distribution
        uint256 frequency;          // Seconds between distributions
        uint256 lastExecuted;       // Last execution timestamp
        uint256 nextExecution;      // Next scheduled execution
        bool isActive;
        bool isPaused;
        uint256 executionCount;
    }

    struct Recipient {
        address wallet;
        uint256 share;              // Share in basis points (10000 = 100%)
        uint256 totalReceived;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Mapping from distribution ID to distribution info
    mapping(bytes32 => Distribution) public distributions;

    /// @notice Mapping from distribution ID to recipients
    mapping(bytes32 => Recipient[]) public recipients;

    /// @notice All distribution IDs
    bytes32[] public distributionIds;

    /// @notice Minimum time between checks
    uint256 public minCheckInterval = 3600; // 1 hour

    /// @notice Last upkeep timestamp
    uint256 public lastUpkeepTime;

    /// @notice Maximum recipients per distribution (gas limit)
    uint256 public maxRecipientsPerExecution = 100;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Distribution Management
    // ============================================================================

    /**
     * @notice Create a new distribution schedule
     * @param distributionId Unique identifier
     * @param assetId Associated asset ID
     * @param token Token to distribute
     * @param totalAmount Amount per distribution
     * @param frequency Seconds between distributions
     * @param startTime When to start (0 for immediate)
     */
    function createDistribution(
        bytes32 distributionId,
        bytes32 assetId,
        address token,
        uint256 totalAmount,
        uint256 frequency,
        uint256 startTime
    ) external onlyOwner {
        require(distributions[distributionId].assetId == bytes32(0), "Distribution exists");

        uint256 nextExec = startTime > 0 ? startTime : block.timestamp + frequency;

        distributions[distributionId] = Distribution({
            assetId: assetId,
            token: token,
            totalAmount: totalAmount,
            frequency: frequency,
            lastExecuted: 0,
            nextExecution: nextExec,
            isActive: true,
            isPaused: false,
            executionCount: 0
        });

        distributionIds.push(distributionId);

        emit DistributionCreated(distributionId, assetId, token, totalAmount, frequency);
    }

    /**
     * @notice Add or update a recipient
     * @param distributionId The distribution ID
     * @param wallet Recipient wallet
     * @param share Share in basis points
     */
    function setRecipient(
        bytes32 distributionId,
        address wallet,
        uint256 share
    ) external onlyOwner {
        if (!distributions[distributionId].isActive) {
            revert DistributionNotFound(distributionId);
        }

        Recipient[] storage recipientList = recipients[distributionId];

        // Check if recipient exists
        for (uint256 i = 0; i < recipientList.length; i++) {
            if (recipientList[i].wallet == wallet) {
                recipientList[i].share = share;
                emit RecipientUpdated(distributionId, wallet, share);
                return;
            }
        }

        // Add new recipient
        recipientList.push(Recipient({
            wallet: wallet,
            share: share,
            totalReceived: 0
        }));

        emit RecipientUpdated(distributionId, wallet, share);
    }

    /**
     * @notice Batch set recipients
     * @param distributionId The distribution ID
     * @param wallets Array of wallet addresses
     * @param shares Array of shares in basis points
     */
    function setRecipientsBatch(
        bytes32 distributionId,
        address[] calldata wallets,
        uint256[] calldata shares
    ) external onlyOwner {
        require(wallets.length == shares.length, "Length mismatch");

        // Clear existing recipients
        delete recipients[distributionId];

        for (uint256 i = 0; i < wallets.length; i++) {
            recipients[distributionId].push(Recipient({
                wallet: wallets[i],
                share: shares[i],
                totalReceived: 0
            }));
        }
    }

    /**
     * @notice Pause a distribution
     * @param distributionId The distribution ID
     */
    function pauseDistribution(bytes32 distributionId) external onlyOwner {
        distributions[distributionId].isPaused = true;
        emit DistributionPaused(distributionId);
    }

    /**
     * @notice Resume a distribution
     * @param distributionId The distribution ID
     */
    function resumeDistribution(bytes32 distributionId) external onlyOwner {
        distributions[distributionId].isPaused = false;
        emit DistributionResumed(distributionId);
    }

    /**
     * @notice Update distribution amount
     * @param distributionId The distribution ID
     * @param newAmount New total amount
     */
    function updateAmount(bytes32 distributionId, uint256 newAmount) external onlyOwner {
        distributions[distributionId].totalAmount = newAmount;
    }

    // ============================================================================
    // Chainlink Automation
    // ============================================================================

    /**
     * @notice Check if upkeep is needed (Chainlink Automation)
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData Data to pass to performUpkeep
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        // Find distributions that are due
        bytes32[] memory dueDistributions = new bytes32[](distributionIds.length);
        uint256 count = 0;

        for (uint256 i = 0; i < distributionIds.length && count < 10; i++) {
            bytes32 distId = distributionIds[i];
            Distribution memory dist = distributions[distId];

            if (
                dist.isActive &&
                !dist.isPaused &&
                block.timestamp >= dist.nextExecution &&
                recipients[distId].length > 0
            ) {
                dueDistributions[count] = distId;
                count++;
            }
        }

        if (count > 0) {
            // Trim array to actual size
            bytes32[] memory result = new bytes32[](count);
            for (uint256 i = 0; i < count; i++) {
                result[i] = dueDistributions[i];
            }

            upkeepNeeded = true;
            performData = abi.encode(result);
        }
    }

    /**
     * @notice Perform upkeep (Chainlink Automation)
     * @param performData Data from checkUpkeep
     */
    function performUpkeep(bytes calldata performData) external override {
        bytes32[] memory dueDistributions = abi.decode(performData, (bytes32[]));

        for (uint256 i = 0; i < dueDistributions.length; i++) {
            _executeDistribution(dueDistributions[i]);
        }

        lastUpkeepTime = block.timestamp;
    }

    /**
     * @notice Manual execution of a distribution
     * @param distributionId The distribution ID
     */
    function executeDistribution(bytes32 distributionId) external onlyOwner {
        _executeDistribution(distributionId);
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Execute a single distribution
     */
    function _executeDistribution(bytes32 distributionId) internal {
        Distribution storage dist = distributions[distributionId];

        if (!dist.isActive) {
            revert DistributionNotFound(distributionId);
        }

        if (dist.isPaused) {
            return; // Skip paused distributions
        }

        if (block.timestamp < dist.nextExecution) {
            revert DistributionNotDue(distributionId, dist.nextExecution);
        }

        Recipient[] storage recipientList = recipients[distributionId];

        if (recipientList.length == 0) {
            revert NoRecipientsConfigured(distributionId);
        }

        // Check balance
        uint256 balance;
        if (dist.token == address(0)) {
            balance = address(this).balance;
        } else {
            balance = IERC20(dist.token).balanceOf(address(this));
        }

        if (balance < dist.totalAmount) {
            revert InsufficientFunds(dist.token, dist.totalAmount, balance);
        }

        // Calculate and distribute
        uint256 totalDistributed = 0;
        uint256 recipientCount = recipientList.length > maxRecipientsPerExecution
            ? maxRecipientsPerExecution
            : recipientList.length;

        for (uint256 i = 0; i < recipientCount; i++) {
            Recipient storage recipient = recipientList[i];
            uint256 amount = (dist.totalAmount * recipient.share) / 10000;

            if (amount > 0) {
                if (dist.token == address(0)) {
                    (bool success, ) = recipient.wallet.call{value: amount}("");
                    if (!success) {
                        revert TransferFailed(recipient.wallet, amount);
                    }
                } else {
                    IERC20(dist.token).safeTransfer(recipient.wallet, amount);
                }

                recipient.totalReceived += amount;
                totalDistributed += amount;

                emit RecipientPaid(distributionId, recipient.wallet, amount);
            }
        }

        // Update distribution state
        dist.lastExecuted = block.timestamp;
        dist.nextExecution = block.timestamp + dist.frequency;
        dist.executionCount++;

        emit DistributionExecuted(
            distributionId,
            totalDistributed,
            recipientCount,
            block.timestamp
        );
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get distribution info
     * @param distributionId The distribution ID
     * @return distribution The distribution info
     */
    function getDistribution(bytes32 distributionId) external view returns (Distribution memory) {
        return distributions[distributionId];
    }

    /**
     * @notice Get recipients for a distribution
     * @param distributionId The distribution ID
     * @return Array of recipients
     */
    function getRecipients(bytes32 distributionId) external view returns (Recipient[] memory) {
        return recipients[distributionId];
    }

    /**
     * @notice Get all active distribution IDs
     * @return Array of distribution IDs
     */
    function getActiveDistributions() external view returns (bytes32[] memory) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < distributionIds.length; i++) {
            if (distributions[distributionIds[i]].isActive && !distributions[distributionIds[i]].isPaused) {
                activeCount++;
            }
        }

        bytes32[] memory active = new bytes32[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < distributionIds.length; i++) {
            if (distributions[distributionIds[i]].isActive && !distributions[distributionIds[i]].isPaused) {
                active[index] = distributionIds[i];
                index++;
            }
        }

        return active;
    }

    /**
     * @notice Get next scheduled distributions
     * @param count Number of distributions to return
     * @return ids Distribution IDs
     * @return times Next execution times
     */
    function getUpcomingDistributions(uint256 count) external view returns (
        bytes32[] memory ids,
        uint256[] memory times
    ) {
        // Simple implementation - returns first N active distributions
        uint256 resultCount = count > distributionIds.length ? distributionIds.length : count;
        ids = new bytes32[](resultCount);
        times = new uint256[](resultCount);

        uint256 index = 0;
        for (uint256 i = 0; i < distributionIds.length && index < resultCount; i++) {
            Distribution memory dist = distributions[distributionIds[i]];
            if (dist.isActive && !dist.isPaused) {
                ids[index] = distributionIds[i];
                times[index] = dist.nextExecution;
                index++;
            }
        }
    }

    // ============================================================================
    // Fund Management
    // ============================================================================

    /**
     * @notice Deposit native tokens for distribution
     */
    receive() external payable {}

    /**
     * @notice Withdraw excess funds
     * @param token Token address (address(0) for native)
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
