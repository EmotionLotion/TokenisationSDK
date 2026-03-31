// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title DividendDistributor
 * @notice Handles dividend distributions for security tokens
 * @dev Supports both push and pull-based distribution models
 */
contract DividendDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================================
    // Events
    // ============================================================================

    event DividendDeclared(
        uint256 indexed dividendId,
        address indexed token,
        address paymentToken,
        uint256 totalAmount,
        uint256 recordDate,
        uint256 paymentDate
    );

    event DividendClaimed(
        uint256 indexed dividendId,
        address indexed holder,
        uint256 amount
    );

    event DividendPushed(
        uint256 indexed dividendId,
        address indexed holder,
        uint256 amount
    );

    event DividendRecycled(
        uint256 indexed dividendId,
        uint256 amount
    );

    event SnapshotTaken(
        address indexed token,
        uint256 indexed snapshotId,
        uint256 totalSupply
    );

    // ============================================================================
    // Structs
    // ============================================================================

    struct Dividend {
        uint256 id;
        address securityToken;      // The security token for dividend
        address paymentToken;       // Token used for payment (USDC, etc.)
        uint256 totalAmount;        // Total dividend pool
        uint256 claimedAmount;      // Amount already claimed
        uint256 recordDate;         // Snapshot date for eligibility
        uint256 paymentDate;        // When payments can start
        uint256 expiryDate;         // When unclaimed dividends can be recycled
        uint256 snapshotId;         // Snapshot ID for balance lookup
        bool isActive;
        bool isPushBased;           // If true, distribute automatically
    }

    struct HolderClaim {
        bool claimed;
        uint256 amount;
        uint256 claimedAt;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice All declared dividends
    mapping(uint256 => Dividend) public dividends;

    /// @notice Claim status per dividend per holder
    mapping(uint256 => mapping(address => HolderClaim)) public claims;

    /// @notice Total dividends declared
    uint256 public dividendCount;

    /// @notice Snapshot balances: token => snapshotId => holder => balance
    mapping(address => mapping(uint256 => mapping(address => uint256))) private _snapshotBalances;

    /// @notice Snapshot total supply: token => snapshotId => totalSupply
    mapping(address => mapping(uint256 => uint256)) private _snapshotTotalSupply;

    /// @notice Current snapshot ID per token
    mapping(address => uint256) public currentSnapshotId;

    /// @notice List of holders per token (for push distribution)
    mapping(address => address[]) private _tokenHolders;
    mapping(address => mapping(address => bool)) private _isHolder;

    /// @notice Default expiry period (90 days)
    uint256 public defaultExpiryPeriod = 90 days;

    /// @notice Maximum holders per push batch
    uint256 public maxPushBatchSize = 100;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Snapshot Management
    // ============================================================================

    /**
     * @notice Take a snapshot of token balances
     * @param token The security token
     * @param holders Array of holder addresses
     * @return snapshotId The snapshot ID
     */
    function takeSnapshot(
        address token,
        address[] calldata holders
    ) external onlyOwner returns (uint256 snapshotId) {
        currentSnapshotId[token]++;
        snapshotId = currentSnapshotId[token];

        uint256 totalSupply = 0;

        for (uint256 i = 0; i < holders.length; i++) {
            address holder = holders[i];
            uint256 balance = IERC20(token).balanceOf(holder);

            if (balance > 0) {
                _snapshotBalances[token][snapshotId][holder] = balance;
                totalSupply += balance;

                // Track holders
                if (!_isHolder[token][holder]) {
                    _tokenHolders[token].push(holder);
                    _isHolder[token][holder] = true;
                }
            }
        }

        _snapshotTotalSupply[token][snapshotId] = totalSupply;

        emit SnapshotTaken(token, snapshotId, totalSupply);
    }

    // ============================================================================
    // Dividend Declaration
    // ============================================================================

    /**
     * @notice Declare a new dividend
     * @param securityToken The security token
     * @param paymentToken The payment token (USDC, USDT, etc.)
     * @param totalAmount Total dividend amount
     * @param snapshotId Snapshot to use for balances
     * @param paymentDate When payment starts
     * @param isPushBased Whether to auto-distribute
     * @return dividendId The new dividend ID
     */
    function declareDividend(
        address securityToken,
        address paymentToken,
        uint256 totalAmount,
        uint256 snapshotId,
        uint256 paymentDate,
        bool isPushBased
    ) external onlyOwner returns (uint256 dividendId) {
        require(securityToken != address(0), "Invalid security token");
        require(paymentToken != address(0), "Invalid payment token");
        require(totalAmount > 0, "Amount must be positive");
        require(snapshotId <= currentSnapshotId[securityToken], "Invalid snapshot");
        require(paymentDate >= block.timestamp, "Payment date in past");

        // Transfer payment tokens to this contract
        IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), totalAmount);

        dividendCount++;
        dividendId = dividendCount;

        dividends[dividendId] = Dividend({
            id: dividendId,
            securityToken: securityToken,
            paymentToken: paymentToken,
            totalAmount: totalAmount,
            claimedAmount: 0,
            recordDate: block.timestamp,
            paymentDate: paymentDate,
            expiryDate: paymentDate + defaultExpiryPeriod,
            snapshotId: snapshotId,
            isActive: true,
            isPushBased: isPushBased
        });

        emit DividendDeclared(
            dividendId,
            securityToken,
            paymentToken,
            totalAmount,
            block.timestamp,
            paymentDate
        );
    }

    // ============================================================================
    // Dividend Claims (Pull-based)
    // ============================================================================

    /**
     * @notice Claim dividend for caller
     * @param dividendId The dividend to claim
     */
    function claimDividend(uint256 dividendId) external nonReentrant {
        _claimDividend(dividendId, msg.sender);
    }

    /**
     * @notice Claim multiple dividends
     * @param dividendIds Array of dividend IDs
     */
    function claimDividends(uint256[] calldata dividendIds) external nonReentrant {
        for (uint256 i = 0; i < dividendIds.length; i++) {
            _claimDividend(dividendIds[i], msg.sender);
        }
    }

    function _claimDividend(uint256 dividendId, address holder) internal {
        Dividend storage div = dividends[dividendId];

        require(div.isActive, "Dividend not active");
        require(block.timestamp >= div.paymentDate, "Payment not started");
        require(block.timestamp < div.expiryDate, "Dividend expired");
        require(!claims[dividendId][holder].claimed, "Already claimed");

        uint256 amount = calculateDividend(dividendId, holder);
        require(amount > 0, "No dividend to claim");

        claims[dividendId][holder] = HolderClaim({
            claimed: true,
            amount: amount,
            claimedAt: block.timestamp
        });

        div.claimedAmount += amount;

        IERC20(div.paymentToken).safeTransfer(holder, amount);

        emit DividendClaimed(dividendId, holder, amount);
    }

    // ============================================================================
    // Dividend Distribution (Push-based)
    // ============================================================================

    /**
     * @notice Push dividends to holders
     * @param dividendId The dividend to distribute
     * @param holders Array of holder addresses
     */
    function pushDividends(
        uint256 dividendId,
        address[] calldata holders
    ) external onlyOwner nonReentrant {
        Dividend storage div = dividends[dividendId];

        require(div.isActive, "Dividend not active");
        require(block.timestamp >= div.paymentDate, "Payment not started");
        require(holders.length <= maxPushBatchSize, "Batch too large");

        for (uint256 i = 0; i < holders.length; i++) {
            address holder = holders[i];

            if (claims[dividendId][holder].claimed) continue;

            uint256 amount = calculateDividend(dividendId, holder);
            if (amount == 0) continue;

            claims[dividendId][holder] = HolderClaim({
                claimed: true,
                amount: amount,
                claimedAt: block.timestamp
            });

            div.claimedAmount += amount;

            IERC20(div.paymentToken).safeTransfer(holder, amount);

            emit DividendPushed(dividendId, holder, amount);
        }
    }

    // ============================================================================
    // Dividend Calculation
    // ============================================================================

    /**
     * @notice Calculate dividend for a holder
     * @param dividendId The dividend
     * @param holder The holder address
     * @return amount The dividend amount
     */
    function calculateDividend(
        uint256 dividendId,
        address holder
    ) public view returns (uint256 amount) {
        Dividend storage div = dividends[dividendId];

        if (!div.isActive || claims[dividendId][holder].claimed) {
            return 0;
        }

        uint256 holderBalance = _snapshotBalances[div.securityToken][div.snapshotId][holder];
        uint256 totalSupply = _snapshotTotalSupply[div.securityToken][div.snapshotId];

        if (totalSupply == 0 || holderBalance == 0) {
            return 0;
        }

        amount = (div.totalAmount * holderBalance) / totalSupply;

        // Prevent rounding dust from being locked: cap to remaining undistributed amount
        uint256 remaining = div.totalAmount - div.claimedAmount;
        if (amount > remaining) {
            amount = remaining;
        }
    }

    // ============================================================================
    // Recycle Unclaimed Dividends
    // ============================================================================

    /**
     * @notice Recycle unclaimed dividends after expiry
     * @param dividendId The dividend to recycle
     * @param recipient Where to send unclaimed funds
     */
    function recycleDividend(
        uint256 dividendId,
        address recipient
    ) external onlyOwner nonReentrant {
        Dividend storage div = dividends[dividendId];

        require(div.isActive, "Dividend not active");
        require(block.timestamp >= div.expiryDate, "Not expired yet");

        uint256 unclaimed = div.totalAmount - div.claimedAmount;
        require(unclaimed > 0, "Nothing to recycle");

        div.isActive = false;

        IERC20(div.paymentToken).safeTransfer(recipient, unclaimed);

        emit DividendRecycled(dividendId, unclaimed);
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set default expiry period
     * @param period New period in seconds
     */
    function setDefaultExpiryPeriod(uint256 period) external onlyOwner {
        require(period >= 7 days, "Period too short");
        defaultExpiryPeriod = period;
    }

    /**
     * @notice Set max push batch size
     * @param size New batch size
     */
    function setMaxPushBatchSize(uint256 size) external onlyOwner {
        require(size > 0 && size <= 500, "Invalid size");
        maxPushBatchSize = size;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get dividend info
     * @param dividendId The dividend ID
     * @return div The dividend struct
     */
    function getDividend(uint256 dividendId) external view returns (Dividend memory div) {
        return dividends[dividendId];
    }

    /**
     * @notice Get holder claim info
     * @param dividendId The dividend ID
     * @param holder The holder address
     * @return claim The claim info
     */
    function getClaimInfo(
        uint256 dividendId,
        address holder
    ) external view returns (HolderClaim memory claim) {
        return claims[dividendId][holder];
    }

    /**
     * @notice Get snapshot balance
     * @param token The token
     * @param snapshotId The snapshot
     * @param holder The holder
     * @return balance The balance at snapshot
     */
    function getSnapshotBalance(
        address token,
        uint256 snapshotId,
        address holder
    ) external view returns (uint256 balance) {
        return _snapshotBalances[token][snapshotId][holder];
    }

    /**
     * @notice Get claimable dividends for a holder
     * @param holder The holder address
     * @return dividendIds Array of claimable dividend IDs
     * @return amounts Array of claimable amounts
     */
    function getClaimableDividends(
        address holder
    ) external view returns (uint256[] memory dividendIds, uint256[] memory amounts) {
        uint256 count = 0;

        // Count claimable
        for (uint256 i = 1; i <= dividendCount; i++) {
            if (calculateDividend(i, holder) > 0) {
                count++;
            }
        }

        dividendIds = new uint256[](count);
        amounts = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 1; i <= dividendCount; i++) {
            uint256 amount = calculateDividend(i, holder);
            if (amount > 0) {
                dividendIds[index] = i;
                amounts[index] = amount;
                index++;
            }
        }
    }
}
