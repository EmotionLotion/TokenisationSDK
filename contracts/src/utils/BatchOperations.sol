// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BatchOperations
 * @notice Gas-optimized batch operations for token transfers and compliance checks
 * @dev Reduces gas costs by batching multiple operations into single transactions
 */
contract BatchOperations is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== EVENTS ====================

    event BatchTransferExecuted(
        address indexed token,
        address indexed from,
        uint256 totalRecipients,
        uint256 totalAmount
    );

    event BatchMintExecuted(
        address indexed token,
        uint256 totalRecipients,
        uint256 totalAmount
    );

    event BatchComplianceCheckExecuted(
        uint256 totalChecked,
        uint256 compliant,
        uint256 nonCompliant
    );

    // ==================== ERRORS ====================

    error ArrayLengthMismatch();
    error ZeroAddress();
    error ZeroAmount();
    error BatchTooLarge();
    error TransferFailed(address recipient, uint256 amount);

    // ==================== CONSTANTS ====================

    uint256 public constant MAX_BATCH_SIZE = 200;

    // ==================== STRUCTS ====================

    struct TransferParams {
        address recipient;
        uint256 amount;
    }

    struct ComplianceResult {
        address account;
        bool isCompliant;
        string reason;
    }

    // ==================== CONSTRUCTOR ====================

    constructor() Ownable(msg.sender) {}

    // ==================== BATCH TRANSFERS ====================

    /**
     * @notice Execute batch transfer of ERC20 tokens
     * @dev Caller must have approved this contract for the total amount
     * @param token Token address
     * @param recipients Array of recipients
     * @param amounts Array of amounts (must match recipients length)
     */
    function batchTransfer(
        address token,
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external nonReentrant {
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        if (recipients.length > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (token == address(0)) revert ZeroAddress();

        uint256 totalAmount = 0;

        // Calculate total and validate in single pass
        for (uint256 i = 0; i < recipients.length;) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            if (amounts[i] == 0) revert ZeroAmount();
            totalAmount += amounts[i];
            unchecked { ++i; }
        }

        // Transfer from sender to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute to recipients
        for (uint256 i = 0; i < recipients.length;) {
            IERC20(token).safeTransfer(recipients[i], amounts[i]);
            unchecked { ++i; }
        }

        emit BatchTransferExecuted(token, msg.sender, recipients.length, totalAmount);
    }

    /**
     * @notice Execute batch transfer with uniform amount
     * @dev More gas efficient when all recipients receive the same amount
     * @param token Token address
     * @param recipients Array of recipients
     * @param amountEach Amount each recipient receives
     */
    function batchTransferUniform(
        address token,
        address[] calldata recipients,
        uint256 amountEach
    ) external nonReentrant {
        if (recipients.length > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (token == address(0)) revert ZeroAddress();
        if (amountEach == 0) revert ZeroAmount();

        uint256 totalAmount = amountEach * recipients.length;

        // Transfer total from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute uniformly
        for (uint256 i = 0; i < recipients.length;) {
            if (recipients[i] == address(0)) revert ZeroAddress();
            IERC20(token).safeTransfer(recipients[i], amountEach);
            unchecked { ++i; }
        }

        emit BatchTransferExecuted(token, msg.sender, recipients.length, totalAmount);
    }

    /**
     * @notice Execute batch transfer using packed data
     * @dev Most gas efficient - recipients and amounts packed together
     * @param token Token address
     * @param params Array of TransferParams structs
     */
    function batchTransferPacked(
        address token,
        TransferParams[] calldata params
    ) external nonReentrant {
        if (params.length > MAX_BATCH_SIZE) revert BatchTooLarge();
        if (token == address(0)) revert ZeroAddress();

        uint256 totalAmount = 0;

        // Calculate total
        for (uint256 i = 0; i < params.length;) {
            if (params[i].recipient == address(0)) revert ZeroAddress();
            if (params[i].amount == 0) revert ZeroAmount();
            totalAmount += params[i].amount;
            unchecked { ++i; }
        }

        // Transfer total from sender
        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        // Distribute
        for (uint256 i = 0; i < params.length;) {
            IERC20(token).safeTransfer(params[i].recipient, params[i].amount);
            unchecked { ++i; }
        }

        emit BatchTransferExecuted(token, msg.sender, params.length, totalAmount);
    }

    // ==================== BATCH COMPLIANCE ====================

    /**
     * @notice Check compliance status for multiple addresses
     * @param complianceContract Address of compliance contract
     * @param accounts Addresses to check
     * @return results Array of compliance results
     */
    function batchCheckCompliance(
        address complianceContract,
        address[] calldata accounts
    ) external view returns (bool[] memory results) {
        if (accounts.length > MAX_BATCH_SIZE) revert BatchTooLarge();

        results = new bool[](accounts.length);

        // Interface for compliance check
        bytes4 selector = bytes4(keccak256("canTransfer(address,address,uint256)"));

        for (uint256 i = 0; i < accounts.length;) {
            // Static call to check compliance
            (bool success, bytes memory data) = complianceContract.staticcall(
                abi.encodeWithSelector(selector, accounts[i], accounts[i], 0)
            );

            results[i] = success && abi.decode(data, (bool));
            unchecked { ++i; }
        }

        return results;
    }

    // ==================== GAS ESTIMATION ====================

    /**
     * @notice Estimate gas for batch transfer
     * @dev Call this off-chain to estimate gas before execution
     * @param batchSize Number of recipients
     * @return estimated Estimated gas usage
     */
    function estimateBatchTransferGas(uint256 batchSize) external pure returns (uint256 estimated) {
        // Base cost + per-transfer cost
        // Based on empirical testing:
        // - Base: ~50,000 gas
        // - Per transfer: ~25,000 gas (ERC20 transfer + overhead)
        return 50000 + (batchSize * 25000);
    }

    // ==================== ADMIN ====================

    /**
     * @notice Rescue stuck tokens
     * @param token Token to rescue
     * @param to Recipient
     * @param amount Amount to rescue
     */
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
    }
}
