// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IERC1410
 * @notice Full ERC-1410 Partially Fungible Token Standard Interface
 *
 * ERC-1410 enables tokens with multiple partitions (tranches), where:
 * - Each partition has independent balance tracking
 * - Partitions can have different compliance rules
 * - Tokens can be transferred between partitions
 *
 * Use cases:
 * - Security tokens with different share classes (Class A, B, C)
 * - Vesting schedules with locked/unlocked portions
 * - Regulatory tranches (accredited vs retail investors)
 * - Time-based lockups
 *
 * @dev This interface extends ERC-20 functionality with partition awareness
 */
interface IERC1410 {
    // ============================================================================
    // EVENTS
    // ============================================================================

    /**
     * @notice Emitted when tokens are transferred within a partition
     */
    event TransferByPartition(
        bytes32 indexed fromPartition,
        address operator,
        address indexed from,
        address indexed to,
        uint256 value,
        bytes data,
        bytes operatorData
    );

    /**
     * @notice Emitted when tokens are changed from one partition to another
     */
    event ChangedPartition(
        bytes32 indexed fromPartition,
        bytes32 indexed toPartition,
        uint256 value
    );

    /**
     * @notice Emitted when an operator is authorized for a partition
     */
    event AuthorizedOperatorByPartition(
        bytes32 indexed partition,
        address indexed operator,
        address indexed tokenHolder
    );

    /**
     * @notice Emitted when an operator is revoked for a partition
     */
    event RevokedOperatorByPartition(
        bytes32 indexed partition,
        address indexed operator,
        address indexed tokenHolder
    );

    /**
     * @notice Emitted when tokens are issued to a partition
     */
    event IssuedByPartition(
        bytes32 indexed partition,
        address indexed operator,
        address indexed to,
        uint256 value,
        bytes data,
        bytes operatorData
    );

    /**
     * @notice Emitted when tokens are redeemed from a partition
     */
    event RedeemedByPartition(
        bytes32 indexed partition,
        address indexed operator,
        address indexed from,
        uint256 value,
        bytes data,
        bytes operatorData
    );

    // ============================================================================
    // TOKEN INFORMATION
    // ============================================================================

    /**
     * @notice Get the total supply of tokens across all partitions
     * @return Total supply
     */
    function totalSupply() external view returns (uint256);

    /**
     * @notice Get the balance of a token holder across all partitions
     * @param tokenHolder The address to query
     * @return Total balance across all partitions
     */
    function balanceOf(address tokenHolder) external view returns (uint256);

    // ============================================================================
    // PARTITION MANAGEMENT
    // ============================================================================

    /**
     * @notice Get the balance for a specific partition
     * @param partition The partition identifier
     * @param tokenHolder The address to query
     * @return Balance in the specified partition
     */
    function balanceOfByPartition(
        bytes32 partition,
        address tokenHolder
    ) external view returns (uint256);

    /**
     * @notice Get all partitions that a token holder has tokens in
     * @param tokenHolder The address to query
     * @return Array of partition identifiers
     */
    function partitionsOf(
        address tokenHolder
    ) external view returns (bytes32[] memory);

    /**
     * @notice Get the total supply for a specific partition
     * @param partition The partition identifier
     * @return Total supply in the partition
     */
    function totalSupplyByPartition(
        bytes32 partition
    ) external view returns (uint256);

    // ============================================================================
    // TRANSFERS
    // ============================================================================

    /**
     * @notice Transfer tokens from a specific partition
     * @param partition The partition to transfer from
     * @param to The recipient address
     * @param value The amount to transfer
     * @param data Additional data for the transfer
     * @return The partition the tokens were sent from
     */
    function transferByPartition(
        bytes32 partition,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bytes32);

    /**
     * @notice Transfer tokens from a specific partition on behalf of holder
     * @param partition The partition to transfer from
     * @param from The sender address
     * @param to The recipient address
     * @param value The amount to transfer
     * @param data Additional data for the transfer
     * @param operatorData Additional data from the operator
     * @return The partition the tokens were sent from
     */
    function operatorTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata operatorData
    ) external returns (bytes32);

    // ============================================================================
    // TRANSFER VALIDATION
    // ============================================================================

    /**
     * @notice Check if a transfer can be executed
     * @param partition The partition to transfer from
     * @param from The sender address
     * @param to The recipient address
     * @param value The amount to transfer
     * @param data Additional data
     * @return statusCode ERC-1066 status code
     * @return appCode Application-specific status code
     * @return destinationPartition The partition tokens would go to
     */
    function canTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata data
    ) external view returns (
        bytes1 statusCode,
        bytes32 appCode,
        bytes32 destinationPartition
    );

    // ============================================================================
    // OPERATORS
    // ============================================================================

    /**
     * @notice Check if an address is an operator for a partition
     * @param partition The partition identifier
     * @param operator The operator address
     * @param tokenHolder The token holder address
     * @return Whether the operator is authorized
     */
    function isOperatorForPartition(
        bytes32 partition,
        address operator,
        address tokenHolder
    ) external view returns (bool);

    /**
     * @notice Authorize an operator for a specific partition
     * @param partition The partition identifier
     * @param operator The operator address to authorize
     */
    function authorizeOperatorByPartition(
        bytes32 partition,
        address operator
    ) external;

    /**
     * @notice Revoke an operator for a specific partition
     * @param partition The partition identifier
     * @param operator The operator address to revoke
     */
    function revokeOperatorByPartition(
        bytes32 partition,
        address operator
    ) external;

    // ============================================================================
    // ISSUANCE
    // ============================================================================

    /**
     * @notice Issue tokens to a specific partition
     * @param partition The partition to issue to
     * @param tokenHolder The recipient address
     * @param value The amount to issue
     * @param data Additional data for the issuance
     */
    function issueByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes calldata data
    ) external;

    // ============================================================================
    // REDEMPTION
    // ============================================================================

    /**
     * @notice Redeem tokens from a specific partition
     * @param partition The partition to redeem from
     * @param value The amount to redeem
     * @param data Additional data for the redemption
     */
    function redeemByPartition(
        bytes32 partition,
        uint256 value,
        bytes calldata data
    ) external;

    /**
     * @notice Redeem tokens from a specific partition on behalf of holder
     * @param partition The partition to redeem from
     * @param tokenHolder The holder address
     * @param value The amount to redeem
     * @param data Additional data
     * @param operatorData Additional data from operator
     */
    function operatorRedeemByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes calldata data,
        bytes calldata operatorData
    ) external;
}

/**
 * @title IERC1410Extended
 * @notice Extended interface with additional partition management
 */
interface IERC1410Extended is IERC1410 {
    /**
     * @notice Get partition metadata
     */
    function getPartitionInfo(
        bytes32 partition
    ) external view returns (
        string memory name,
        bool isLocked,
        uint256 totalSupply,
        bytes32 documentHash,
        string memory documentUri
    );

    /**
     * @notice Get all partitions
     */
    function getPartitions() external view returns (bytes32[] memory);

    /**
     * @notice Set partition metadata
     */
    function setPartitionInfo(
        bytes32 partition,
        string calldata name,
        bytes32 documentHash,
        string calldata documentUri
    ) external;

    /**
     * @notice Lock a partition (prevent transfers)
     */
    function lockPartition(bytes32 partition) external;

    /**
     * @notice Unlock a partition
     */
    function unlockPartition(bytes32 partition) external;

    /**
     * @notice Check if partition is locked
     */
    function isPartitionLocked(bytes32 partition) external view returns (bool);

    /**
     * @notice Move tokens between partitions (same holder)
     */
    function changePartition(
        bytes32 fromPartition,
        bytes32 toPartition,
        uint256 value
    ) external;

    /**
     * @notice Get default partition for ERC-20 compatibility
     */
    function getDefaultPartition() external view returns (bytes32);

    /**
     * @notice Set default partition
     */
    function setDefaultPartition(bytes32 partition) external;
}

/**
 * @title ERC-1066 Status Codes
 * @notice Standard transfer status codes
 */
library TransferStatusCodes {
    // Success codes (0x5X)
    bytes1 constant TRANSFER_SUCCESS = 0x50;
    bytes1 constant TRANSFER_VERIFIED = 0x51;

    // Failure codes (0x5X)
    bytes1 constant TRANSFER_FAILURE = 0x50;
    bytes1 constant INSUFFICIENT_BALANCE = 0x52;
    bytes1 constant INSUFFICIENT_ALLOWANCE = 0x53;
    bytes1 constant TRANSFERS_HALTED = 0x54;
    bytes1 constant FUNDS_LOCKED = 0x55;
    bytes1 constant INVALID_SENDER = 0x56;
    bytes1 constant INVALID_RECEIVER = 0x57;
    bytes1 constant INVALID_OPERATOR = 0x58;

    // Application-specific (0xAX)
    bytes1 constant APPLICATION_ERROR = 0xA0;
    bytes1 constant COMPLIANCE_FAILURE = 0xA1;
    bytes1 constant PARTITION_LOCKED = 0xA2;
    bytes1 constant INVALID_PARTITION = 0xA3;
}
