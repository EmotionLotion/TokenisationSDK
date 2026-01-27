// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IACERouter
 * @notice Minimal interface for ACE Router interaction
 */
interface IACERouter {
    enum AttestationType {
        IDENTITY_VERIFICATION,
        ACCREDITATION,
        SANCTIONS_SCREENING,
        JURISDICTION_CHECK,
        TRANSFER_COMPLIANCE,
        CUSTOM
    }

    enum AttestationStatus {
        PENDING,
        VALID,
        EXPIRED,
        REVOKED,
        FAILED
    }

    struct Attestation {
        bytes32 attestationId;
        address subject;
        AttestationType attestationType;
        bool passed;
        uint256 validUntil;
        bytes32 schemaId;
        bytes signature;
        uint256 timestamp;
        uint8 nodeCount;
        uint8 threshold;
        AttestationStatus status;
    }

    function hasValidAttestation(
        address subject,
        AttestationType attestationType
    ) external view returns (bool hasValid, bytes32 attestationId);

    function getAttestation(bytes32 attestationId) external view returns (Attestation memory);

    function isAttestationValid(bytes32 attestationId) external view returns (bool);

    function getCachedAttestation(
        address subject,
        AttestationType attestationType
    ) external view returns (bytes32);
}

/**
 * @title IComplianceModule
 * @notice Interface for compliance modules (from ICompliance.sol)
 */
interface IComplianceModule {
    function moduleCheck(
        address _from,
        address _to,
        uint256 _value,
        address _token
    ) external view returns (bool);

    function moduleMint(address _to, uint256 _value) external;
    function moduleBurn(address _from, uint256 _value) external;
    function moduleTransfer(address _from, address _to, uint256 _value) external;
    function name() external view returns (string memory);
    function isPlugAndPlay() external view returns (bool);
}

/**
 * @title ACEComplianceModule
 * @notice Compliance module that validates Chainlink ACE attestations
 * @dev Implements IComplianceModule for integration with ERC-3643 ModularCompliance
 *
 * Features:
 * - Validates cached ACE attestations for transfers
 * - Configurable required attestation types
 * - Fallback to secondary module on ACE unavailability
 * - CCID compatibility for DeFi integration
 * - Flexible attestation requirements per token
 */
contract ACEComplianceModule is IComplianceModule, Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event ACERouterSet(address indexed router);
    event FallbackModuleSet(address indexed module);
    event RequiredAttestationAdded(IACERouter.AttestationType attestationType);
    event RequiredAttestationRemoved(IACERouter.AttestationType attestationType);
    event AttestationCheckPassed(address indexed subject, IACERouter.AttestationType attestationType, bytes32 attestationId);
    event AttestationCheckFailed(address indexed subject, IACERouter.AttestationType attestationType);
    event FallbackUsed(address indexed from, address indexed to, uint256 value);
    event StrictModeSet(bool enabled);
    event TokenBound(address indexed token);

    // ============================================================================
    // Errors
    // ============================================================================

    error ACERouterNotSet();
    error InvalidAttestationType();
    error AttestationRequired(address subject, IACERouter.AttestationType attestationType);
    error FallbackFailed();
    error ZeroAddress();
    error TokenNotBound();

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Module name
    string public constant override name = "ACEComplianceModule";

    /// @notice Module is not plug-and-play (requires configuration)
    bool public constant override isPlugAndPlay = false;

    /// @notice ACE Router contract
    IACERouter public aceRouter;

    /// @notice Fallback compliance module
    IComplianceModule public fallbackModule;

    /// @notice Bound token address
    address public boundToken;

    /// @notice Whether to use strict mode (fail if ACE unavailable)
    bool public strictMode;

    /// @notice Required attestation types for senders
    mapping(IACERouter.AttestationType => bool) public requiredSenderAttestations;

    /// @notice Required attestation types for receivers
    mapping(IACERouter.AttestationType => bool) public requiredReceiverAttestations;

    /// @notice Array of required sender attestation types
    IACERouter.AttestationType[] private _senderAttestationTypes;

    /// @notice Array of required receiver attestation types
    IACERouter.AttestationType[] private _receiverAttestationTypes;

    /// @notice Addresses exempt from ACE checks
    mapping(address => bool) public exempt;

    /// @notice Minimum value threshold for ACE checks (below this, skip checks)
    uint256 public minimumValueThreshold;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address initialOwner,
        address _aceRouter
    ) Ownable(initialOwner) {
        if (_aceRouter != address(0)) {
            aceRouter = IACERouter(_aceRouter);
            emit ACERouterSet(_aceRouter);
        }

        // Default: require identity verification for both parties
        _addRequiredSenderAttestation(IACERouter.AttestationType.IDENTITY_VERIFICATION);
        _addRequiredReceiverAttestation(IACERouter.AttestationType.IDENTITY_VERIFICATION);
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Set the ACE Router address
     * @param router ACE Router contract address
     */
    function setACERouter(address router) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        aceRouter = IACERouter(router);
        emit ACERouterSet(router);
    }

    /**
     * @notice Set the fallback compliance module
     * @param module Fallback module address
     */
    function setFallbackModule(address module) external onlyOwner {
        fallbackModule = IComplianceModule(module);
        emit FallbackModuleSet(module);
    }

    /**
     * @notice Set strict mode
     * @param enabled Whether to enable strict mode
     */
    function setStrictMode(bool enabled) external onlyOwner {
        strictMode = enabled;
        emit StrictModeSet(enabled);
    }

    /**
     * @notice Bind the module to a token
     * @param token Token address
     */
    function bindToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        boundToken = token;
        emit TokenBound(token);
    }

    /**
     * @notice Set minimum value threshold
     * @param threshold Minimum transfer value for ACE checks
     */
    function setMinimumValueThreshold(uint256 threshold) external onlyOwner {
        minimumValueThreshold = threshold;
    }

    /**
     * @notice Add a required sender attestation type
     * @param attestationType The attestation type to require
     */
    function addRequiredSenderAttestation(
        IACERouter.AttestationType attestationType
    ) external onlyOwner {
        _addRequiredSenderAttestation(attestationType);
    }

    /**
     * @notice Add a required receiver attestation type
     * @param attestationType The attestation type to require
     */
    function addRequiredReceiverAttestation(
        IACERouter.AttestationType attestationType
    ) external onlyOwner {
        _addRequiredReceiverAttestation(attestationType);
    }

    /**
     * @notice Remove a required sender attestation type
     * @param attestationType The attestation type to remove
     */
    function removeRequiredSenderAttestation(
        IACERouter.AttestationType attestationType
    ) external onlyOwner {
        if (!requiredSenderAttestations[attestationType]) revert InvalidAttestationType();

        requiredSenderAttestations[attestationType] = false;

        // Remove from array
        for (uint256 i = 0; i < _senderAttestationTypes.length; i++) {
            if (_senderAttestationTypes[i] == attestationType) {
                _senderAttestationTypes[i] = _senderAttestationTypes[_senderAttestationTypes.length - 1];
                _senderAttestationTypes.pop();
                break;
            }
        }

        emit RequiredAttestationRemoved(attestationType);
    }

    /**
     * @notice Remove a required receiver attestation type
     * @param attestationType The attestation type to remove
     */
    function removeRequiredReceiverAttestation(
        IACERouter.AttestationType attestationType
    ) external onlyOwner {
        if (!requiredReceiverAttestations[attestationType]) revert InvalidAttestationType();

        requiredReceiverAttestations[attestationType] = false;

        // Remove from array
        for (uint256 i = 0; i < _receiverAttestationTypes.length; i++) {
            if (_receiverAttestationTypes[i] == attestationType) {
                _receiverAttestationTypes[i] = _receiverAttestationTypes[_receiverAttestationTypes.length - 1];
                _receiverAttestationTypes.pop();
                break;
            }
        }

        emit RequiredAttestationRemoved(attestationType);
    }

    /**
     * @notice Set exemption status for an address
     * @param account The address to exempt or un-exempt
     * @param isExempt Whether the address is exempt
     */
    function setExemption(address account, bool isExempt) external onlyOwner {
        exempt[account] = isExempt;
    }

    /**
     * @notice Batch set exemption status
     * @param accounts Array of addresses
     * @param isExempt Whether addresses are exempt
     */
    function setExemptionBatch(address[] calldata accounts, bool isExempt) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            exempt[accounts[i]] = isExempt;
        }
    }

    // ============================================================================
    // Internal Configuration
    // ============================================================================

    function _addRequiredSenderAttestation(IACERouter.AttestationType attestationType) internal {
        if (requiredSenderAttestations[attestationType]) return; // Already added

        requiredSenderAttestations[attestationType] = true;
        _senderAttestationTypes.push(attestationType);
        emit RequiredAttestationAdded(attestationType);
    }

    function _addRequiredReceiverAttestation(IACERouter.AttestationType attestationType) internal {
        if (requiredReceiverAttestations[attestationType]) return; // Already added

        requiredReceiverAttestations[attestationType] = true;
        _receiverAttestationTypes.push(attestationType);
        emit RequiredAttestationAdded(attestationType);
    }

    // ============================================================================
    // IComplianceModule Implementation
    // ============================================================================

    /**
     * @notice Check if a transfer is compliant based on ACE attestations
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     * @param _token Token address
     * @return Whether the transfer is compliant
     */
    function moduleCheck(
        address _from,
        address _to,
        uint256 _value,
        address _token
    ) external view override returns (bool) {
        // Skip checks for mint (from == 0) or burn (to == 0) operations
        if (_from == address(0) || _to == address(0)) {
            return true;
        }

        // Skip checks below minimum threshold
        if (_value < minimumValueThreshold) {
            return true;
        }

        // Check exemptions
        if (exempt[_from] && exempt[_to]) {
            return true;
        }

        // If ACE router not set, use fallback or fail
        if (address(aceRouter) == address(0)) {
            return _handleNoACERouter(_from, _to, _value, _token);
        }

        // Check sender attestations (if not exempt)
        if (!exempt[_from]) {
            if (!_checkSubjectAttestations(_from, _senderAttestationTypes)) {
                return _handleAttestationFailure(_from, _to, _value, _token);
            }
        }

        // Check receiver attestations (if not exempt)
        if (!exempt[_to]) {
            if (!_checkSubjectAttestations(_to, _receiverAttestationTypes)) {
                return _handleAttestationFailure(_from, _to, _value, _token);
            }
        }

        return true;
    }

    /**
     * @notice Handle minting (no ACE checks needed)
     */
    function moduleMint(address /* _to */, uint256 /* _value */) external pure override {
        // No action needed for minting
    }

    /**
     * @notice Handle burning (no ACE checks needed)
     */
    function moduleBurn(address /* _from */, uint256 /* _value */) external pure override {
        // No action needed for burning
    }

    /**
     * @notice Handle transfer completion
     */
    function moduleTransfer(
        address /* _from */,
        address /* _to */,
        uint256 /* _value */
    ) external pure override {
        // Check happens in moduleCheck, no action needed here
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /**
     * @notice Check all required attestations for a subject
     * @param subject The address to check
     * @param attestationTypes Array of required attestation types
     * @return Whether all attestations are valid
     */
    function _checkSubjectAttestations(
        address subject,
        IACERouter.AttestationType[] storage attestationTypes
    ) internal view returns (bool) {
        for (uint256 i = 0; i < attestationTypes.length; i++) {
            IACERouter.AttestationType attestationType = attestationTypes[i];

            (bool hasValid, bytes32 attestationId) = aceRouter.hasValidAttestation(
                subject,
                attestationType
            );

            if (!hasValid) {
                return false;
            }

            // Additional check: ensure attestation passed
            IACERouter.Attestation memory attestation = aceRouter.getAttestation(attestationId);
            if (!attestation.passed) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Handle case where ACE Router is not set
     */
    function _handleNoACERouter(
        address _from,
        address _to,
        uint256 _value,
        address _token
    ) internal view returns (bool) {
        if (strictMode) {
            return false;
        }

        // Try fallback module
        if (address(fallbackModule) != address(0)) {
            return fallbackModule.moduleCheck(_from, _to, _value, _token);
        }

        // No fallback, allow by default in non-strict mode
        return true;
    }

    /**
     * @notice Handle attestation check failure
     */
    function _handleAttestationFailure(
        address _from,
        address _to,
        uint256 _value,
        address _token
    ) internal view returns (bool) {
        // Try fallback module if available
        if (address(fallbackModule) != address(0)) {
            return fallbackModule.moduleCheck(_from, _to, _value, _token);
        }

        return false;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get required sender attestation types
     * @return Array of required attestation types
     */
    function getRequiredSenderAttestations()
        external
        view
        returns (IACERouter.AttestationType[] memory)
    {
        return _senderAttestationTypes;
    }

    /**
     * @notice Get required receiver attestation types
     * @return Array of required attestation types
     */
    function getRequiredReceiverAttestations()
        external
        view
        returns (IACERouter.AttestationType[] memory)
    {
        return _receiverAttestationTypes;
    }

    /**
     * @notice Check if a subject has all required attestations
     * @param subject The address to check
     * @param isSender Whether to check sender or receiver requirements
     * @return hasAll Whether all required attestations are present
     * @return missing Number of missing attestations
     */
    function checkAttestationStatus(
        address subject,
        bool isSender
    ) external view returns (bool hasAll, uint256 missing) {
        if (address(aceRouter) == address(0)) {
            return (false, isSender ? _senderAttestationTypes.length : _receiverAttestationTypes.length);
        }

        IACERouter.AttestationType[] storage types = isSender
            ? _senderAttestationTypes
            : _receiverAttestationTypes;

        missing = 0;
        for (uint256 i = 0; i < types.length; i++) {
            (bool hasValid,) = aceRouter.hasValidAttestation(subject, types[i]);
            if (!hasValid) {
                missing++;
            }
        }

        hasAll = missing == 0;
    }

    /**
     * @notice Get attestation details for a subject
     * @param subject The address to check
     * @param attestationType The attestation type
     * @return hasAttestation Whether subject has this attestation
     * @return isValid Whether the attestation is currently valid
     * @return attestationId The attestation ID
     */
    function getSubjectAttestation(
        address subject,
        IACERouter.AttestationType attestationType
    ) external view returns (bool hasAttestation, bool isValid, bytes32 attestationId) {
        if (address(aceRouter) == address(0)) {
            return (false, false, bytes32(0));
        }

        (isValid, attestationId) = aceRouter.hasValidAttestation(subject, attestationType);
        hasAttestation = attestationId != bytes32(0);
    }

    /**
     * @notice Check compliance for a potential transfer
     * @param _from Sender address
     * @param _to Recipient address
     * @param _value Transfer amount
     * @param _token Token address
     * @return compliant Whether transfer would be compliant
     * @return senderPassed Whether sender passed checks
     * @return receiverPassed Whether receiver passed checks
     */
    function previewTransferCompliance(
        address _from,
        address _to,
        uint256 _value,
        address _token
    ) external view returns (bool compliant, bool senderPassed, bool receiverPassed) {
        // Handle special cases
        if (_from == address(0) || _to == address(0)) {
            return (true, true, true);
        }

        if (_value < minimumValueThreshold) {
            return (true, true, true);
        }

        if (exempt[_from] && exempt[_to]) {
            return (true, true, true);
        }

        if (address(aceRouter) == address(0)) {
            bool fallbackResult = _handleNoACERouter(_from, _to, _value, _token);
            return (fallbackResult, fallbackResult, fallbackResult);
        }

        senderPassed = exempt[_from] || _checkSubjectAttestations(_from, _senderAttestationTypes);
        receiverPassed = exempt[_to] || _checkSubjectAttestations(_to, _receiverAttestationTypes);
        compliant = senderPassed && receiverPassed;
    }
}
