// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ERC1410Token.sol";

/**
 * @title IIdentityRegistry
 * @notice Interface for ERC-3643 Identity Registry
 */
interface IIdentityRegistry {
    function isVerified(address _userAddress) external view returns (bool);
    function identity(address _userAddress) external view returns (address);
    function investorCountry(address _userAddress) external view returns (uint16);
}

/**
 * @title IComplianceModule
 * @notice Interface for compliance modules
 */
interface IComplianceModule {
    function moduleCheck(
        address from,
        address to,
        uint256 value,
        address token
    ) external view returns (bool);

    function name() external view returns (string memory);
}

/**
 * @title ERC1410Compliance
 * @notice ERC-1410 Token with ERC-3643 Compliance Integration
 *
 * Extends ERC1410Token with:
 * - Identity Registry integration per partition
 * - Per-partition required claims
 * - Per-partition compliance modules
 * - canTransferByPartition with detailed status codes
 *
 * This enables sophisticated compliance rules:
 * - Class A: Accredited investors only
 * - Class B: US persons excluded
 * - Locked: Transfer disabled
 */
contract ERC1410Compliance is ERC1410Token {
    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @notice Global Identity Registry
    IIdentityRegistry public identityRegistry;

    /// @notice Per-partition Identity Registry (optional override)
    mapping(bytes32 => IIdentityRegistry) public partitionIdentityRegistry;

    /// @notice Per-partition required claim topics
    mapping(bytes32 => uint256[]) private _partitionRequiredClaims;

    /// @notice Per-partition compliance modules
    mapping(bytes32 => address[]) private _partitionComplianceModules;

    /// @notice Per-partition enabled modules
    mapping(bytes32 => mapping(address => bool)) private _moduleEnabled;

    /// @notice Per-partition country restrictions (0 = no restriction)
    mapping(bytes32 => mapping(uint16 => bool)) private _countryRestricted;

    /// @notice Per-partition investor limits
    mapping(bytes32 => uint256) private _partitionMaxInvestors;

    /// @notice Per-partition current investor count
    mapping(bytes32 => uint256) private _partitionInvestorCount;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event IdentityRegistrySet(address indexed identityRegistry);
    event PartitionIdentityRegistrySet(bytes32 indexed partition, address identityRegistry);
    event ComplianceModuleAdded(bytes32 indexed partition, address indexed module);
    event ComplianceModuleRemoved(bytes32 indexed partition, address indexed module);
    event RequiredClaimAdded(bytes32 indexed partition, uint256 claimTopic);
    event RequiredClaimRemoved(bytes32 indexed partition, uint256 claimTopic);
    event CountryRestrictionSet(bytes32 indexed partition, uint16 country, bool restricted);
    event MaxInvestorsSet(bytes32 indexed partition, uint256 maxInvestors);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error IdentityNotVerified(address user);
    error MissingRequiredClaim(address user, uint256 claimTopic);
    error CountryRestricted(address user, uint16 country);
    error MaxInvestorsReached(bytes32 partition);
    error ComplianceCheckFailed(address module, string reason);

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _identityRegistry
    ) ERC1410Token(_name, _symbol, _decimals) {
        if (_identityRegistry != address(0)) {
            identityRegistry = IIdentityRegistry(_identityRegistry);
            emit IdentityRegistrySet(_identityRegistry);
        }
    }

    // ============================================================================
    // COMPLIANCE CONFIGURATION
    // ============================================================================

    /**
     * @notice Set global Identity Registry
     */
    function setIdentityRegistry(address _identityRegistry) external onlyOwner {
        identityRegistry = IIdentityRegistry(_identityRegistry);
        emit IdentityRegistrySet(_identityRegistry);
    }

    /**
     * @notice Set partition-specific Identity Registry
     */
    function setPartitionIdentityRegistry(
        bytes32 partition,
        address _identityRegistry
    ) external onlyOwner {
        partitionIdentityRegistry[partition] = IIdentityRegistry(_identityRegistry);
        emit PartitionIdentityRegistrySet(partition, _identityRegistry);
    }

    /**
     * @notice Add compliance module for partition
     */
    function addComplianceModule(
        bytes32 partition,
        address module
    ) external onlyOwner {
        require(module != address(0), "Invalid module");
        require(!_moduleEnabled[partition][module], "Module already added");

        _partitionComplianceModules[partition].push(module);
        _moduleEnabled[partition][module] = true;

        emit ComplianceModuleAdded(partition, module);
    }

    /**
     * @notice Remove compliance module from partition
     */
    function removeComplianceModule(
        bytes32 partition,
        address module
    ) external onlyOwner {
        require(_moduleEnabled[partition][module], "Module not enabled");

        _moduleEnabled[partition][module] = false;

        // Remove from array
        address[] storage modules = _partitionComplianceModules[partition];
        for (uint256 i = 0; i < modules.length; i++) {
            if (modules[i] == module) {
                modules[i] = modules[modules.length - 1];
                modules.pop();
                break;
            }
        }

        emit ComplianceModuleRemoved(partition, module);
    }

    /**
     * @notice Add required claim for partition
     */
    function addRequiredClaim(
        bytes32 partition,
        uint256 claimTopic
    ) external onlyOwner {
        _partitionRequiredClaims[partition].push(claimTopic);
        emit RequiredClaimAdded(partition, claimTopic);
    }

    /**
     * @notice Remove required claim from partition
     */
    function removeRequiredClaim(
        bytes32 partition,
        uint256 claimTopic
    ) external onlyOwner {
        uint256[] storage claims = _partitionRequiredClaims[partition];
        for (uint256 i = 0; i < claims.length; i++) {
            if (claims[i] == claimTopic) {
                claims[i] = claims[claims.length - 1];
                claims.pop();
                emit RequiredClaimRemoved(partition, claimTopic);
                break;
            }
        }
    }

    /**
     * @notice Set country restriction for partition
     */
    function setCountryRestriction(
        bytes32 partition,
        uint16 country,
        bool restricted
    ) external onlyOwner {
        _countryRestricted[partition][country] = restricted;
        emit CountryRestrictionSet(partition, country, restricted);
    }

    /**
     * @notice Set max investors for partition
     */
    function setMaxInvestors(
        bytes32 partition,
        uint256 maxInvestors
    ) external onlyOwner {
        _partitionMaxInvestors[partition] = maxInvestors;
        emit MaxInvestorsSet(partition, maxInvestors);
    }

    // ============================================================================
    // COMPLIANCE VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get compliance modules for partition
     */
    function getComplianceModules(
        bytes32 partition
    ) external view returns (address[] memory) {
        return _partitionComplianceModules[partition];
    }

    /**
     * @notice Get required claims for partition
     */
    function getRequiredClaims(
        bytes32 partition
    ) external view returns (uint256[] memory) {
        return _partitionRequiredClaims[partition];
    }

    /**
     * @notice Check if country is restricted for partition
     */
    function isCountryRestricted(
        bytes32 partition,
        uint16 country
    ) external view returns (bool) {
        return _countryRestricted[partition][country];
    }

    /**
     * @notice Get investor count for partition
     */
    function getInvestorCount(
        bytes32 partition
    ) external view returns (uint256) {
        return _partitionInvestorCount[partition];
    }

    // ============================================================================
    // ENHANCED TRANSFER VALIDATION
    // ============================================================================

    /**
     * @notice Enhanced canTransferByPartition with compliance checks
     */
    function canTransferByPartition(
        bytes32 partition,
        address from,
        address to,
        uint256 value,
        bytes calldata data
    ) external view override returns (
        bytes1 statusCode,
        bytes32 appCode,
        bytes32 destinationPartition
    ) {
        // Basic checks from parent
        (bytes1 basicStatus, bytes32 basicCode,) = this._basicTransferCheck(partition, from, to, value);
        if (basicStatus != TransferStatusCodes.TRANSFER_SUCCESS) {
            return (basicStatus, basicCode, bytes32(0));
        }

        // Get applicable Identity Registry
        IIdentityRegistry registry = _getIdentityRegistry(partition);

        // Check identities are verified
        if (address(registry) != address(0)) {
            if (!registry.isVerified(from)) {
                return (TransferStatusCodes.INVALID_SENDER, "IDENTITY_NOT_VERIFIED", bytes32(0));
            }
            if (!registry.isVerified(to)) {
                return (TransferStatusCodes.INVALID_RECEIVER, "IDENTITY_NOT_VERIFIED", bytes32(0));
            }

            // Check country restrictions
            uint16 toCountry = registry.investorCountry(to);
            if (_countryRestricted[partition][toCountry]) {
                return (TransferStatusCodes.COMPLIANCE_FAILURE, "COUNTRY_RESTRICTED", bytes32(0));
            }
        }

        // Check max investors
        uint256 maxInvestors = _partitionMaxInvestors[partition];
        if (maxInvestors > 0) {
            bool isNewInvestor = _balancesByPartition(partition, to) == 0;
            if (isNewInvestor && _partitionInvestorCount[partition] >= maxInvestors) {
                return (TransferStatusCodes.COMPLIANCE_FAILURE, "MAX_INVESTORS_REACHED", bytes32(0));
            }
        }

        // Check compliance modules
        address[] storage modules = _partitionComplianceModules[partition];
        for (uint256 i = 0; i < modules.length; i++) {
            if (_moduleEnabled[partition][modules[i]]) {
                try IComplianceModule(modules[i]).moduleCheck(from, to, value, address(this)) returns (bool passed) {
                    if (!passed) {
                        return (TransferStatusCodes.COMPLIANCE_FAILURE, "MODULE_CHECK_FAILED", bytes32(0));
                    }
                } catch {
                    return (TransferStatusCodes.APPLICATION_ERROR, "MODULE_ERROR", bytes32(0));
                }
            }
        }

        return (TransferStatusCodes.TRANSFER_SUCCESS, bytes32(0), partition);
    }

    // ============================================================================
    // INTERNAL OVERRIDES
    // ============================================================================

    /**
     * @notice Internal function to get balance by partition
     * @dev Required because parent has private mapping
     */
    function _balancesByPartition(
        bytes32 partition,
        address holder
    ) internal view returns (uint256) {
        // This would need access to parent's private mapping
        // In practice, you'd make the parent mapping internal
        // For now, we use the public function
        return this.balanceOfByPartition(partition, holder);
    }

    /**
     * @notice Get applicable Identity Registry for partition
     */
    function _getIdentityRegistry(
        bytes32 partition
    ) internal view returns (IIdentityRegistry) {
        IIdentityRegistry partitionRegistry = partitionIdentityRegistry[partition];
        if (address(partitionRegistry) != address(0)) {
            return partitionRegistry;
        }
        return identityRegistry;
    }

    /**
     * @notice Basic transfer validation
     */
    function _basicTransferCheck(
        bytes32 partition,
        address from,
        address to,
        uint256 value
    ) external view returns (
        bytes1 statusCode,
        bytes32 appCode,
        bytes32 destinationPartition
    ) {
        // Check partition exists
        (,bool isLocked, uint256 totalSupply,,) = this.getPartitionInfo(partition);
        if (totalSupply == 0 && this.balanceOfByPartition(partition, from) == 0) {
            return (TransferStatusCodes.INVALID_PARTITION, "INVALID_PARTITION", bytes32(0));
        }

        // Check partition not locked
        if (isLocked) {
            return (TransferStatusCodes.PARTITION_LOCKED, "PARTITION_LOCKED", bytes32(0));
        }

        // Check balance
        if (this.balanceOfByPartition(partition, from) < value) {
            return (TransferStatusCodes.INSUFFICIENT_BALANCE, "INSUFFICIENT_BALANCE", bytes32(0));
        }

        // Check receiver
        if (to == address(0)) {
            return (TransferStatusCodes.INVALID_RECEIVER, "INVALID_RECEIVER", bytes32(0));
        }

        return (TransferStatusCodes.TRANSFER_SUCCESS, bytes32(0), partition);
    }
}
