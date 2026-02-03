// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC1410.sol";

/**
 * @title ERC1410Token
 * @notice Implementation of ERC-1410 Partially Fungible Token Standard
 *
 * This token supports multiple partitions (tranches) with:
 * - Independent balance tracking per partition
 * - Partition-specific operators
 * - ERC-20 compatibility via default partition
 * - Issuance and redemption per partition
 *
 * @dev Partitions are identified by bytes32 values. Common patterns:
 * - keccak256("DEFAULT") for main tokens
 * - keccak256("LOCKED") for restricted tokens
 * - keccak256("CLASS_A"), keccak256("CLASS_B") for share classes
 */
contract ERC1410Token is IERC1410Extended, Ownable, Pausable, ReentrancyGuard {
    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @notice Token name
    string public name;

    /// @notice Token symbol
    string public symbol;

    /// @notice Token decimals
    uint8 public decimals;

    /// @notice Total supply across all partitions
    uint256 private _totalSupply;

    /// @notice Default partition for ERC-20 compatibility
    bytes32 public defaultPartition;

    /// @notice List of all partitions
    bytes32[] private _partitions;

    /// @notice Partition info
    struct PartitionInfo {
        string name;
        bool isLocked;
        bool exists;
        uint256 totalSupply;
        bytes32 documentHash;
        string documentUri;
    }

    /// @notice Mapping of partition to info
    mapping(bytes32 => PartitionInfo) private _partitionInfo;

    /// @notice Mapping of partition to holder to balance
    mapping(bytes32 => mapping(address => uint256)) private _balancesByPartition;

    /// @notice Mapping of holder to their partitions
    mapping(address => bytes32[]) private _holderPartitions;

    /// @notice Mapping to track if holder has partition
    mapping(address => mapping(bytes32 => bool)) private _hasPartition;

    /// @notice Mapping of partition to operator to holder to authorized
    mapping(bytes32 => mapping(address => mapping(address => bool))) private _operatorsByPartition;

    /// @notice Global controllers (can operate on any partition)
    mapping(address => bool) private _controllers;

    /// @notice Issuable flag
    bool public isIssuable;

    // ============================================================================
    // STANDARD PARTITIONS
    // ============================================================================

    bytes32 public constant DEFAULT = keccak256("DEFAULT");
    bytes32 public constant LOCKED = keccak256("LOCKED");
    bytes32 public constant VESTING = keccak256("VESTING");
    bytes32 public constant CLASS_A = keccak256("CLASS_A");
    bytes32 public constant CLASS_B = keccak256("CLASS_B");
    bytes32 public constant CLASS_C = keccak256("CLASS_C");
    bytes32 public constant FOUNDERS = keccak256("FOUNDERS");
    bytes32 public constant EMPLOYEES = keccak256("EMPLOYEES");
    bytes32 public constant INVESTORS = keccak256("INVESTORS");
    bytes32 public constant ACCREDITED = keccak256("ACCREDITED");
    bytes32 public constant RETAIL = keccak256("RETAIL");

    // ============================================================================
    // ERRORS
    // ============================================================================

    error InsufficientBalance();
    error InvalidPartition();
    error PartitionLocked();
    error InvalidOperator();
    error NotIssuable();
    error TransferFailed(bytes1 statusCode, bytes32 appCode);

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) Ownable(msg.sender) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        isIssuable = true;

        // Initialize default partition
        defaultPartition = DEFAULT;
        _createPartition(DEFAULT, "Default");
    }

    // ============================================================================
    // ERC-20 COMPATIBILITY
    // ============================================================================

    /**
     * @notice Get total supply (ERC-20 compatible)
     */
    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Get balance across all partitions (ERC-20 compatible)
     */
    function balanceOf(address tokenHolder) external view override returns (uint256) {
        uint256 total = 0;
        bytes32[] memory partitions = _holderPartitions[tokenHolder];
        for (uint256 i = 0; i < partitions.length; i++) {
            total += _balancesByPartition[partitions[i]][tokenHolder];
        }
        return total;
    }

    /**
     * @notice Transfer from default partition (ERC-20 compatible)
     */
    function transfer(address to, uint256 value) external returns (bool) {
        _transferByPartition(defaultPartition, msg.sender, to, value, "", "");
        return true;
    }

    // ============================================================================
    // PARTITION MANAGEMENT
    // ============================================================================

    function balanceOfByPartition(
        bytes32 partition,
        address tokenHolder
    ) external view override returns (uint256) {
        return _balancesByPartition[partition][tokenHolder];
    }

    function partitionsOf(
        address tokenHolder
    ) external view override returns (bytes32[] memory) {
        return _holderPartitions[tokenHolder];
    }

    function totalSupplyByPartition(
        bytes32 partition
    ) external view override returns (uint256) {
        return _partitionInfo[partition].totalSupply;
    }

    function getPartitions() external view override returns (bytes32[] memory) {
        return _partitions;
    }

    function getPartitionInfo(
        bytes32 partition
    ) external view override returns (
        string memory partitionName,
        bool isLocked,
        uint256 partitionTotalSupply,
        bytes32 documentHash,
        string memory documentUri
    ) {
        PartitionInfo storage info = _partitionInfo[partition];
        return (
            info.name,
            info.isLocked,
            info.totalSupply,
            info.documentHash,
            info.documentUri
        );
    }

    function setPartitionInfo(
        bytes32 partition,
        string calldata partitionName,
        bytes32 documentHash,
        string calldata documentUri
    ) external override onlyOwner {
        if (!_partitionInfo[partition].exists) {
            _createPartition(partition, partitionName);
        }

        PartitionInfo storage info = _partitionInfo[partition];
        info.name = partitionName;
        info.documentHash = documentHash;
        info.documentUri = documentUri;
    }

    function lockPartition(bytes32 partition) external override onlyOwner {
        if (!_partitionInfo[partition].exists) revert InvalidPartition();
        _partitionInfo[partition].isLocked = true;
    }

    function unlockPartition(bytes32 partition) external override onlyOwner {
        if (!_partitionInfo[partition].exists) revert InvalidPartition();
        _partitionInfo[partition].isLocked = false;
    }

    function isPartitionLocked(bytes32 partition) external view override returns (bool) {
        return _partitionInfo[partition].isLocked;
    }

    function getDefaultPartition() external view override returns (bytes32) {
        return defaultPartition;
    }

    function setDefaultPartition(bytes32 partition) external override onlyOwner {
        if (!_partitionInfo[partition].exists) revert InvalidPartition();
        defaultPartition = partition;
    }

    // ============================================================================
    // TRANSFERS
    // ============================================================================

    function transferByPartition(
        bytes32 partition,
        address to,
        uint256 value,
        bytes calldata data
    ) external override whenNotPaused nonReentrant returns (bytes32) {
        _transferByPartition(partition, msg.sender, to, value, data, "");
        return partition;
    }

    function operatorTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata data,
        bytes calldata operatorData
    ) external override whenNotPaused nonReentrant returns (bytes32) {
        if (!_isOperatorForPartition(partition, msg.sender, from)) {
            revert InvalidOperator();
        }
        _transferByPartition(partition, from, to, value, data, operatorData);
        return partition;
    }

    function changePartition(
        bytes32 fromPartition,
        bytes32 toPartition,
        uint256 value
    ) external override whenNotPaused nonReentrant {
        if (!_partitionInfo[fromPartition].exists) revert InvalidPartition();
        if (!_partitionInfo[toPartition].exists) {
            _createPartition(toPartition, "");
        }
        if (_partitionInfo[fromPartition].isLocked) revert PartitionLocked();

        address holder = msg.sender;

        if (_balancesByPartition[fromPartition][holder] < value) {
            revert InsufficientBalance();
        }

        // Move tokens between partitions
        _balancesByPartition[fromPartition][holder] -= value;
        _balancesByPartition[toPartition][holder] += value;

        _partitionInfo[fromPartition].totalSupply -= value;
        _partitionInfo[toPartition].totalSupply += value;

        // Update holder partitions
        _addHolderPartition(holder, toPartition);
        if (_balancesByPartition[fromPartition][holder] == 0) {
            _removeHolderPartition(holder, fromPartition);
        }

        emit ChangedPartition(fromPartition, toPartition, value);
    }

    // ============================================================================
    // TRANSFER VALIDATION
    // ============================================================================

    function canTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata /* data */
    ) external view virtual override returns (
        bytes1 statusCode,
        bytes32 appCode,
        bytes32 destinationPartition
    ) {
        // Check partition exists
        if (!_partitionInfo[partition].exists) {
            return (TransferStatusCodes.INVALID_PARTITION, "INVALID_PARTITION", bytes32(0));
        }

        // Check partition not locked
        if (_partitionInfo[partition].isLocked) {
            return (TransferStatusCodes.PARTITION_LOCKED, "PARTITION_LOCKED", bytes32(0));
        }

        // Check balance
        if (_balancesByPartition[partition][from] < value) {
            return (TransferStatusCodes.INSUFFICIENT_BALANCE, "INSUFFICIENT_BALANCE", bytes32(0));
        }

        // Check receiver
        if (to == address(0)) {
            return (TransferStatusCodes.INVALID_RECEIVER, "INVALID_RECEIVER", bytes32(0));
        }

        // All checks passed
        return (TransferStatusCodes.TRANSFER_SUCCESS, bytes32(0), partition);
    }

    // ============================================================================
    // OPERATORS
    // ============================================================================

    function isOperatorForPartition(
        bytes32 partition,
        address operator,
        address tokenHolder
    ) external view override returns (bool) {
        return _isOperatorForPartition(partition, operator, tokenHolder);
    }

    function authorizeOperatorByPartition(
        bytes32 partition,
        address operator
    ) external override {
        _operatorsByPartition[partition][operator][msg.sender] = true;
        emit AuthorizedOperatorByPartition(partition, operator, msg.sender);
    }

    function revokeOperatorByPartition(
        bytes32 partition,
        address operator
    ) external override {
        _operatorsByPartition[partition][operator][msg.sender] = false;
        emit RevokedOperatorByPartition(partition, operator, msg.sender);
    }

    // ============================================================================
    // ISSUANCE
    // ============================================================================

    function issueByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes calldata data
    ) external override onlyOwner {
        if (!isIssuable) revert NotIssuable();

        if (!_partitionInfo[partition].exists) {
            _createPartition(partition, "");
        }

        _balancesByPartition[partition][tokenHolder] += value;
        _partitionInfo[partition].totalSupply += value;
        _totalSupply += value;

        _addHolderPartition(tokenHolder, partition);

        emit IssuedByPartition(partition, msg.sender, tokenHolder, value, data, "");
    }

    // ============================================================================
    // REDEMPTION
    // ============================================================================

    function redeemByPartition(
        bytes32 partition,
        uint256 value,
        bytes calldata data
    ) external override whenNotPaused nonReentrant {
        _redeemByPartition(partition, msg.sender, value, data, "");
    }

    function operatorRedeemByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes calldata data,
        bytes calldata operatorData
    ) external override whenNotPaused nonReentrant {
        if (!_isOperatorForPartition(partition, msg.sender, tokenHolder)) {
            revert InvalidOperator();
        }
        _redeemByPartition(partition, tokenHolder, value, data, operatorData);
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    function setIssuable(bool _isIssuable) external onlyOwner {
        isIssuable = _isIssuable;
    }

    function setController(address controller, bool status) external onlyOwner {
        _controllers[controller] = status;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    function _transferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes memory data,
        bytes memory operatorData
    ) internal {
        if (!_partitionInfo[partition].exists) revert InvalidPartition();
        if (_partitionInfo[partition].isLocked) revert PartitionLocked();
        if (_balancesByPartition[partition][from] < value) revert InsufficientBalance();
        if (to == address(0)) revert TransferFailed(TransferStatusCodes.INVALID_RECEIVER, "INVALID_RECEIVER");

        _balancesByPartition[partition][from] -= value;
        _balancesByPartition[partition][to] += value;

        // Update holder partitions
        _addHolderPartition(to, partition);
        if (_balancesByPartition[partition][from] == 0) {
            _removeHolderPartition(from, partition);
        }

        emit TransferByPartition(partition, msg.sender, from, to, value, data, operatorData);
    }

    function _redeemByPartition(
        bytes32 partition,
        address tokenHolder,
        uint256 value,
        bytes memory data,
        bytes memory operatorData
    ) internal {
        if (!_partitionInfo[partition].exists) revert InvalidPartition();
        if (_balancesByPartition[partition][tokenHolder] < value) revert InsufficientBalance();

        _balancesByPartition[partition][tokenHolder] -= value;
        _partitionInfo[partition].totalSupply -= value;
        _totalSupply -= value;

        if (_balancesByPartition[partition][tokenHolder] == 0) {
            _removeHolderPartition(tokenHolder, partition);
        }

        emit RedeemedByPartition(partition, msg.sender, tokenHolder, value, data, operatorData);
    }

    function _isOperatorForPartition(
        bytes32 partition,
        address operator,
        address tokenHolder
    ) internal view returns (bool) {
        // Check if controller
        if (_controllers[operator]) return true;

        // Check if owner
        if (operator == owner()) return true;

        // Check if self
        if (operator == tokenHolder) return true;

        // Check partition-specific authorization
        return _operatorsByPartition[partition][operator][tokenHolder];
    }

    function _createPartition(bytes32 partition, string memory partitionName) internal {
        if (_partitionInfo[partition].exists) return;

        _partitionInfo[partition] = PartitionInfo({
            name: partitionName,
            isLocked: false,
            exists: true,
            totalSupply: 0,
            documentHash: bytes32(0),
            documentUri: ""
        });

        _partitions.push(partition);
    }

    function _addHolderPartition(address holder, bytes32 partition) internal {
        if (!_hasPartition[holder][partition]) {
            _holderPartitions[holder].push(partition);
            _hasPartition[holder][partition] = true;
        }
    }

    function _removeHolderPartition(address holder, bytes32 partition) internal {
        if (_hasPartition[holder][partition]) {
            bytes32[] storage partitions = _holderPartitions[holder];
            for (uint256 i = 0; i < partitions.length; i++) {
                if (partitions[i] == partition) {
                    partitions[i] = partitions[partitions.length - 1];
                    partitions.pop();
                    break;
                }
            }
            _hasPartition[holder][partition] = false;
        }
    }
}
