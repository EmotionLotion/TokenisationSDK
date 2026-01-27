// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";
import {IPolicyModule, IPolicyModuleRegistry} from "../compliance/policy/IPolicyModule.sol";

/**
 * @title IACERouter
 * @notice Interface for Chainlink ACE (Automated Compliance Engine) Router
 */
interface IACERouter {
    /// @notice Attestation types supported by ACE
    enum AttestationType {
        IDENTITY_VERIFICATION,    // KYC/AML verification
        ACCREDITATION,           // Investor accreditation status
        SANCTIONS_SCREENING,     // OFAC/sanctions check
        JURISDICTION_CHECK,      // Geographic eligibility
        TRANSFER_COMPLIANCE,     // Per-transfer compliance check
        CUSTOM                   // Custom attestation type
    }

    /// @notice Attestation status
    enum AttestationStatus {
        PENDING,
        VALID,
        EXPIRED,
        REVOKED,
        FAILED
    }

    /// @notice Attestation data structure
    struct Attestation {
        bytes32 attestationId;
        address subject;
        AttestationType attestationType;
        bool passed;
        uint256 validUntil;
        bytes32 schemaId;          // CCID compatibility
        bytes signature;           // DON multi-sig
        uint256 timestamp;
        uint8 nodeCount;           // Number of nodes that confirmed
        uint8 threshold;           // Required threshold
        AttestationStatus status;
    }

    /// @notice Request data for attestation
    struct AttestationRequest {
        address subject;
        AttestationType attestationType;
        bytes32 contextHash;       // Hash of transfer context if applicable
        bytes additionalData;      // Extra data for the request
    }

    // Events
    event AttestationRequested(
        bytes32 indexed requestId,
        address indexed subject,
        AttestationType attestationType,
        bytes32 contextHash
    );

    event AttestationFulfilled(
        bytes32 indexed attestationId,
        address indexed subject,
        AttestationType attestationType,
        bool passed,
        uint256 validUntil
    );

    event AttestationRevoked(bytes32 indexed attestationId, string reason);
    event AttestationExpired(bytes32 indexed attestationId);
    event FallbackTriggered(bytes32 indexed requestId, string reason);
    event DONNodeRegistered(address indexed node, uint256 weight);
    event DONNodeRemoved(address indexed node);
    event CacheTTLUpdated(AttestationType attestationType, uint256 ttl);
    event PolicyEvaluated(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount,
        bool allowed,
        uint256 moduleCount
    );
    event PolicyRegistryUpdated(address indexed registry);

    // Core functions
    function requestAttestation(AttestationRequest calldata request) external returns (bytes32 requestId);
    function getAttestation(bytes32 attestationId) external view returns (Attestation memory);
    function isAttestationValid(bytes32 attestationId) external view returns (bool);
    function getCachedAttestation(address subject, AttestationType attestationType) external view returns (bytes32);
    function revokeAttestation(bytes32 attestationId, string calldata reason) external;
}

/**
 * @title ACERouter
 * @notice Chainlink ACE (Automated Compliance Engine) DON interface
 * @dev Provides decentralized compliance attestations for DeFi composability
 *
 * Features:
 * - Request submission to Chainlink Functions
 * - Callback handling and attestation storage
 * - Caching with configurable TTL
 * - DON multi-sig verification
 * - Fallback mechanism for DON unavailability
 * - CCID compatibility for DeFi integration
 */
contract ACERouter is IACERouter, FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // ============================================================================
    // Errors
    // ============================================================================

    error RequestNotFound(bytes32 requestId);
    error AttestationNotFound(bytes32 attestationId);
    error AttestationExpiredError(bytes32 attestationId);
    error AttestationIsRevoked(bytes32 attestationId);
    error InvalidSignature();
    error InsufficientSignatures(uint8 provided, uint8 required);
    error SourceNotConfigured(AttestationType attestationType);
    error RequestAlreadyFulfilled(bytes32 requestId);
    error InvalidThreshold(uint8 threshold, uint8 nodeCount);
    error NotAuthorized();
    error FallbackDisabled();
    error ZeroAddress();

    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Chainlink Functions subscription ID
    uint64 public subscriptionId;

    /// @notice Gas limit for callback
    uint32 public callbackGasLimit = 300_000;

    /// @notice DON ID for the network
    bytes32 public donId;

    /// @notice JavaScript sources for each attestation type
    mapping(AttestationType => string) public sources;

    /// @notice Cache TTL per attestation type (in seconds)
    mapping(AttestationType => uint256) public cacheTTL;

    /// @notice Default cache TTL (1 hour)
    uint256 public constant DEFAULT_CACHE_TTL = 3600;

    /// @notice High-value transfer threshold (requires fresh attestation)
    uint256 public highValueThreshold = 100_000 * 10**18; // $100k equivalent

    /// @notice Mapping from request ID to request info
    mapping(bytes32 => RequestInfo) public requests;

    /// @notice Mapping from attestation ID to attestation
    mapping(bytes32 => Attestation) public attestations;

    /// @notice Mapping from (subject, attestationType) to latest attestation ID
    mapping(address => mapping(AttestationType => bytes32)) public latestAttestation;

    /// @notice DON node addresses with their weights
    mapping(address => uint256) public donNodes;

    /// @notice Array of registered DON nodes
    address[] public donNodeList;

    /// @notice Required signature threshold
    uint8 public signatureThreshold = 3;

    /// @notice Total DON node count
    uint8 public donNodeCount;

    /// @notice Fallback compliance module address
    address public fallbackModule;

    /// @notice Whether fallback is enabled
    bool public fallbackEnabled = true;

    /// @notice Request timeout (default 30 seconds)
    uint256 public requestTimeout = 30;

    /// @notice All attestation IDs for enumeration
    bytes32[] public attestationIds;

    /// @notice Policy Module Registry for on-chain policy enforcement
    IPolicyModuleRegistry public policyRegistry;

    /// @notice Whether to use policy modules for authorization (DON enforcement)
    bool public usePolicyModules = false;

    // ============================================================================
    // Structs
    // ============================================================================

    struct RequestInfo {
        AttestationRequest request;
        RequestStatus status;
        bytes32 attestationId;
        uint256 timestamp;
        bytes response;
        bytes error;
    }

    enum RequestStatus {
        PENDING,
        FULFILLED,
        FAILED,
        TIMEOUT
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(
        address router,
        uint64 _subscriptionId,
        bytes32 _donId
    ) FunctionsClient(router) ConfirmedOwner(msg.sender) {
        subscriptionId = _subscriptionId;
        donId = _donId;

        // Set default cache TTLs
        cacheTTL[AttestationType.IDENTITY_VERIFICATION] = 3600;    // 1 hour
        cacheTTL[AttestationType.ACCREDITATION] = 86400;           // 24 hours
        cacheTTL[AttestationType.SANCTIONS_SCREENING] = 3600;      // 1 hour
        cacheTTL[AttestationType.JURISDICTION_CHECK] = 86400;      // 24 hours
        cacheTTL[AttestationType.TRANSFER_COMPLIANCE] = 300;       // 5 minutes
        cacheTTL[AttestationType.CUSTOM] = 3600;                   // 1 hour
    }

    // ============================================================================
    // Configuration
    // ============================================================================

    /**
     * @notice Update subscription ID
     * @param _subscriptionId New subscription ID
     */
    function setSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        subscriptionId = _subscriptionId;
    }

    /**
     * @notice Update callback gas limit
     * @param _gasLimit New gas limit
     */
    function setCallbackGasLimit(uint32 _gasLimit) external onlyOwner {
        callbackGasLimit = _gasLimit;
    }

    /**
     * @notice Update DON ID
     * @param _donId New DON ID
     */
    function setDonId(bytes32 _donId) external onlyOwner {
        donId = _donId;
    }

    /**
     * @notice Set JavaScript source for an attestation type
     * @param attestationType The type of attestation
     * @param source The JavaScript source code
     */
    function setSource(AttestationType attestationType, string calldata source) external onlyOwner {
        sources[attestationType] = source;
    }

    /**
     * @notice Set cache TTL for an attestation type
     * @param attestationType The type of attestation
     * @param ttl TTL in seconds
     */
    function setCacheTTL(AttestationType attestationType, uint256 ttl) external onlyOwner {
        cacheTTL[attestationType] = ttl;
        emit CacheTTLUpdated(attestationType, ttl);
    }

    /**
     * @notice Set high-value transfer threshold
     * @param threshold New threshold
     */
    function setHighValueThreshold(uint256 threshold) external onlyOwner {
        highValueThreshold = threshold;
    }

    /**
     * @notice Set signature threshold
     * @param threshold New threshold
     */
    function setSignatureThreshold(uint8 threshold) external onlyOwner {
        if (threshold > donNodeCount) {
            revert InvalidThreshold(threshold, donNodeCount);
        }
        signatureThreshold = threshold;
    }

    /**
     * @notice Set fallback module address
     * @param module Fallback module address
     */
    function setFallbackModule(address module) external onlyOwner {
        fallbackModule = module;
    }

    /**
     * @notice Enable/disable fallback
     * @param enabled Whether fallback is enabled
     */
    function setFallbackEnabled(bool enabled) external onlyOwner {
        fallbackEnabled = enabled;
    }

    /**
     * @notice Set request timeout
     * @param timeout Timeout in seconds
     */
    function setRequestTimeout(uint256 timeout) external onlyOwner {
        requestTimeout = timeout;
    }

    /**
     * @notice Set policy module registry
     * @param registry The registry address
     */
    function setPolicyRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        policyRegistry = IPolicyModuleRegistry(registry);
        emit PolicyRegistryUpdated(registry);
    }

    /**
     * @notice Enable/disable policy module usage for DON enforcement
     * @param enabled Whether to use policy modules
     */
    function setUsePolicyModules(bool enabled) external onlyOwner {
        usePolicyModules = enabled;
    }

    // ============================================================================
    // DON Node Management
    // ============================================================================

    /**
     * @notice Register a DON node
     * @param node Node address
     * @param weight Node weight
     */
    function registerDONNode(address node, uint256 weight) external onlyOwner {
        if (node == address(0)) revert ZeroAddress();
        if (donNodes[node] == 0) {
            donNodeList.push(node);
            donNodeCount++;
        }
        donNodes[node] = weight;
        emit DONNodeRegistered(node, weight);
    }

    /**
     * @notice Remove a DON node
     * @param node Node address
     */
    function removeDONNode(address node) external onlyOwner {
        if (donNodes[node] == 0) revert NotAuthorized();
        donNodes[node] = 0;
        donNodeCount--;

        // Remove from array
        for (uint256 i = 0; i < donNodeList.length; i++) {
            if (donNodeList[i] == node) {
                donNodeList[i] = donNodeList[donNodeList.length - 1];
                donNodeList.pop();
                break;
            }
        }
        emit DONNodeRemoved(node);
    }

    // ============================================================================
    // Core Functions
    // ============================================================================

    /**
     * @notice Request a new attestation
     * @param request The attestation request
     * @return requestId The Chainlink Functions request ID
     */
    function requestAttestation(
        AttestationRequest calldata request
    ) external override returns (bytes32 requestId) {
        if (request.subject == address(0)) revert ZeroAddress();

        // Check for valid cached attestation
        bytes32 cachedId = latestAttestation[request.subject][request.attestationType];
        if (cachedId != bytes32(0)) {
            Attestation storage cached = attestations[cachedId];
            if (cached.status == AttestationStatus.VALID &&
                cached.validUntil > block.timestamp) {
                // Return cached attestation ID (no new request needed)
                return cachedId;
            }
        }

        // Validate source is configured
        if (bytes(sources[request.attestationType]).length == 0) {
            revert SourceNotConfigured(request.attestationType);
        }

        // Build Functions request
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(sources[request.attestationType]);

        // Encode arguments
        string[] memory args = new string[](3);
        args[0] = _addressToString(request.subject);
        args[1] = _uint256ToString(uint256(request.attestationType));
        args[2] = _bytes32ToString(request.contextHash);
        req.setArgs(args);

        // Send request
        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

        // Store request info
        requests[requestId] = RequestInfo({
            request: request,
            status: RequestStatus.PENDING,
            attestationId: bytes32(0),
            timestamp: block.timestamp,
            response: "",
            error: ""
        });

        emit AttestationRequested(
            requestId,
            request.subject,
            request.attestationType,
            request.contextHash
        );
    }

    /**
     * @notice Check transfer compliance with fresh attestation
     * @param from Sender address
     * @param to Recipient address
     * @param value Transfer amount
     * @param token Token address
     * @return requestId The request ID for tracking
     */
    function checkTransferCompliance(
        address from,
        address to,
        uint256 value,
        address token
    ) external returns (bytes32 requestId) {
        // Create context hash
        bytes32 contextHash = keccak256(abi.encodePacked(from, to, value, token, block.timestamp));

        // For high-value transfers, always get fresh attestation
        bool requireFresh = value >= highValueThreshold;

        if (!requireFresh) {
            // Check cached attestations for both parties
            bytes32 fromAttestation = latestAttestation[from][AttestationType.TRANSFER_COMPLIANCE];
            bytes32 toAttestation = latestAttestation[to][AttestationType.TRANSFER_COMPLIANCE];

            if (_isAttestationValidInternal(fromAttestation) &&
                _isAttestationValidInternal(toAttestation)) {
                // Both parties have valid attestations
                return fromAttestation; // Return existing attestation
            }
        }

        // Request new attestation
        AttestationRequest memory request = AttestationRequest({
            subject: from,
            attestationType: AttestationType.TRANSFER_COMPLIANCE,
            contextHash: contextHash,
            additionalData: abi.encode(to, value, token)
        });

        return this.requestAttestation(request);
    }

    /**
     * @notice Evaluate transfer against on-chain policy modules
     * @dev This provides authoritative on-chain policy enforcement by the DON
     * @param from Sender address
     * @param to Recipient address
     * @param amount Transfer amount
     * @param token Token address
     * @return allowed Whether the transfer is allowed
     * @return results Array of policy evaluation results
     */
    function evaluatePolicies(
        address from,
        address to,
        uint256 amount,
        address token
    ) external view returns (bool allowed, IPolicyModule.PolicyResult[] memory results) {
        if (address(policyRegistry) == address(0) || !usePolicyModules) {
            // Policy modules not configured, allow by default
            results = new IPolicyModule.PolicyResult[](0);
            return (true, results);
        }

        IPolicyModule.PolicyContext memory context = IPolicyModule.PolicyContext({
            from: from,
            to: to,
            amount: amount,
            token: token,
            assetId: bytes32(0),
            additionalData: ""
        });

        return policyRegistry.evaluateAll(context);
    }

    /**
     * @notice Check transfer compliance using both attestations and policy modules
     * @dev Combines DON attestation validation with on-chain policy evaluation
     * @param from Sender address
     * @param to Recipient address
     * @param amount Transfer amount
     * @param token Token address
     * @return compliant Whether the transfer is compliant
     * @return attestationId The attestation ID used for compliance
     * @return policyResults Array of policy results
     */
    function checkFullCompliance(
        address from,
        address to,
        uint256 amount,
        address token
    ) external view returns (
        bool compliant,
        bytes32 attestationId,
        IPolicyModule.PolicyResult[] memory policyResults
    ) {
        // Step 1: Check attestations for both parties
        bytes32 fromAttestation = latestAttestation[from][AttestationType.TRANSFER_COMPLIANCE];
        bytes32 toAttestation = latestAttestation[to][AttestationType.TRANSFER_COMPLIANCE];

        bool attestationsValid = _isAttestationValidInternal(fromAttestation) &&
                                 _isAttestationValidInternal(toAttestation);

        // Step 2: Evaluate policy modules if configured
        bool policiesPass = true;
        if (address(policyRegistry) != address(0) && usePolicyModules) {
            IPolicyModule.PolicyContext memory context = IPolicyModule.PolicyContext({
                from: from,
                to: to,
                amount: amount,
                token: token,
                assetId: bytes32(0),
                additionalData: ""
            });

            (policiesPass, policyResults) = policyRegistry.evaluateAll(context);
        } else {
            policyResults = new IPolicyModule.PolicyResult[](0);
        }

        // Transfer is compliant only if both attestations are valid and policies pass
        compliant = attestationsValid && policiesPass;
        attestationId = fromAttestation;
    }

    /**
     * @notice Get policy evaluation with early termination
     * @dev Useful for gas optimization when only the first failure matters
     * @param from Sender address
     * @param to Recipient address
     * @param amount Transfer amount
     * @param token Token address
     * @return allowed Whether transfer is allowed
     * @return failedModule Address of first failing module (or zero)
     * @return reason Failure reason if any
     */
    function evaluatePoliciesEarly(
        address from,
        address to,
        uint256 amount,
        address token
    ) external view returns (bool allowed, address failedModule, string memory reason) {
        if (address(policyRegistry) == address(0) || !usePolicyModules) {
            return (true, address(0), "");
        }

        IPolicyModule.PolicyContext memory context = IPolicyModule.PolicyContext({
            from: from,
            to: to,
            amount: amount,
            token: token,
            assetId: bytes32(0),
            additionalData: ""
        });

        // Use the registry's early termination evaluation
        return IPolicyModuleRegistry(address(policyRegistry)).evaluateWithEarlyTermination(context);
    }

    /**
     * @notice Callback function for Chainlink Functions
     * @param requestId The request ID
     * @param response The response data
     * @param err Any error data
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        RequestInfo storage info = requests[requestId];

        if (info.timestamp == 0) {
            revert RequestNotFound(requestId);
        }

        if (info.status != RequestStatus.PENDING) {
            revert RequestAlreadyFulfilled(requestId);
        }

        info.response = response;
        info.error = err;

        if (err.length > 0) {
            info.status = RequestStatus.FAILED;
            _triggerFallback(requestId, "DON response error");
            return;
        }

        info.status = RequestStatus.FULFILLED;

        // Decode response and create attestation
        _processAttestationResponse(requestId, info, response);
    }

    /**
     * @notice Process attestation response from DON
     */
    function _processAttestationResponse(
        bytes32 requestId,
        RequestInfo storage info,
        bytes memory response
    ) internal {
        // Expected response: abi.encode(bool passed, uint256 validUntil, bytes signature, uint8 nodeCount)
        (
            bool passed,
            uint256 validUntil,
            bytes memory signature,
            uint8 nodeCount
        ) = abi.decode(response, (bool, uint256, bytes, uint8));

        // Verify DON signature threshold
        if (nodeCount < signatureThreshold) {
            revert InsufficientSignatures(nodeCount, signatureThreshold);
        }

        // Create attestation ID
        bytes32 attestationId = keccak256(abi.encodePacked(
            requestId,
            info.request.subject,
            info.request.attestationType,
            block.timestamp
        ));

        // Compute schema ID for CCID compatibility
        bytes32 schemaId = _computeSchemaId(info.request.attestationType);

        // Store attestation
        attestations[attestationId] = Attestation({
            attestationId: attestationId,
            subject: info.request.subject,
            attestationType: info.request.attestationType,
            passed: passed,
            validUntil: validUntil,
            schemaId: schemaId,
            signature: signature,
            timestamp: block.timestamp,
            nodeCount: nodeCount,
            threshold: signatureThreshold,
            status: AttestationStatus.VALID
        });

        // Update latest attestation mapping
        latestAttestation[info.request.subject][info.request.attestationType] = attestationId;

        // Store request attestation ID
        info.attestationId = attestationId;

        // Add to enumeration
        attestationIds.push(attestationId);

        emit AttestationFulfilled(
            attestationId,
            info.request.subject,
            info.request.attestationType,
            passed,
            validUntil
        );
    }

    /**
     * @notice Trigger fallback mechanism
     */
    function _triggerFallback(bytes32 requestId, string memory reason) internal {
        if (!fallbackEnabled) revert FallbackDisabled();

        emit FallbackTriggered(requestId, reason);

        // In a real implementation, this would call the fallback module
        // For now, we just emit the event for off-chain handling
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get attestation by ID
     * @param attestationId The attestation ID
     * @return attestation The attestation data
     */
    function getAttestation(
        bytes32 attestationId
    ) external view override returns (Attestation memory) {
        Attestation memory attestation = attestations[attestationId];
        if (attestation.timestamp == 0) {
            revert AttestationNotFound(attestationId);
        }
        return attestation;
    }

    /**
     * @notice Check if attestation is valid
     * @param attestationId The attestation ID
     * @return isValid Whether the attestation is valid
     */
    function isAttestationValid(
        bytes32 attestationId
    ) external view override returns (bool) {
        return _isAttestationValidInternal(attestationId);
    }

    /**
     * @notice Internal attestation validity check
     */
    function _isAttestationValidInternal(bytes32 attestationId) internal view returns (bool) {
        if (attestationId == bytes32(0)) return false;

        Attestation storage attestation = attestations[attestationId];

        if (attestation.timestamp == 0) return false;
        if (attestation.status != AttestationStatus.VALID) return false;
        if (attestation.validUntil < block.timestamp) return false;
        if (!attestation.passed) return false;

        return true;
    }

    /**
     * @notice Get cached attestation for subject and type
     * @param subject The subject address
     * @param attestationType The attestation type
     * @return attestationId The cached attestation ID (or zero if none)
     */
    function getCachedAttestation(
        address subject,
        AttestationType attestationType
    ) external view override returns (bytes32) {
        bytes32 attestationId = latestAttestation[subject][attestationType];

        if (_isAttestationValidInternal(attestationId)) {
            return attestationId;
        }

        return bytes32(0);
    }

    /**
     * @notice Revoke an attestation
     * @param attestationId The attestation ID
     * @param reason Reason for revocation
     */
    function revokeAttestation(
        bytes32 attestationId,
        string calldata reason
    ) external override onlyOwner {
        Attestation storage attestation = attestations[attestationId];

        if (attestation.timestamp == 0) {
            revert AttestationNotFound(attestationId);
        }

        attestation.status = AttestationStatus.REVOKED;

        emit AttestationRevoked(attestationId, reason);
    }

    /**
     * @notice Get request info
     * @param requestId The request ID
     * @return info The request info
     */
    function getRequest(bytes32 requestId) external view returns (RequestInfo memory) {
        return requests[requestId];
    }

    /**
     * @notice Get total attestation count
     * @return count The number of attestations
     */
    function getAttestationCount() external view returns (uint256) {
        return attestationIds.length;
    }

    /**
     * @notice Get DON node list
     * @return nodes Array of node addresses
     */
    function getDONNodes() external view returns (address[] memory) {
        return donNodeList;
    }

    /**
     * @notice Check if subject has valid attestation of type
     * @param subject The subject address
     * @param attestationType The attestation type
     * @return hasValid Whether subject has valid attestation
     * @return attestationId The attestation ID if valid
     */
    function hasValidAttestation(
        address subject,
        AttestationType attestationType
    ) external view returns (bool hasValid, bytes32 attestationId) {
        attestationId = latestAttestation[subject][attestationType];
        hasValid = _isAttestationValidInternal(attestationId);
    }

    // ============================================================================
    // Helper Functions
    // ============================================================================

    /**
     * @notice Compute CCID-compatible schema ID
     */
    function _computeSchemaId(AttestationType attestationType) internal pure returns (bytes32) {
        // Schema IDs for CCID compatibility
        if (attestationType == AttestationType.IDENTITY_VERIFICATION) {
            return keccak256("ccid:schema:identity-verification:v1");
        } else if (attestationType == AttestationType.ACCREDITATION) {
            return keccak256("ccid:schema:accreditation:v1");
        } else if (attestationType == AttestationType.SANCTIONS_SCREENING) {
            return keccak256("ccid:schema:sanctions:v1");
        } else if (attestationType == AttestationType.JURISDICTION_CHECK) {
            return keccak256("ccid:schema:jurisdiction:v1");
        } else if (attestationType == AttestationType.TRANSFER_COMPLIANCE) {
            return keccak256("ccid:schema:transfer-compliance:v1");
        } else {
            return keccak256("ccid:schema:custom:v1");
        }
    }

    /**
     * @notice Convert address to string
     */
    function _addressToString(address addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(uint160(addr) >> (8 * (19 - i)) >> 4) & 0xf];
            str[3 + i * 2] = alphabet[uint8(uint160(addr) >> (8 * (19 - i))) & 0xf];
        }
        return string(str);
    }

    /**
     * @notice Convert uint256 to string
     */
    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /**
     * @notice Convert bytes32 to string
     */
    function _bytes32ToString(bytes32 value) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(66);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i] & 0x0f)];
        }
        return string(str);
    }

    /**
     * @notice Expire old attestations (can be called by anyone)
     * @param attestationId The attestation to check and expire
     */
    function expireAttestation(bytes32 attestationId) external {
        Attestation storage attestation = attestations[attestationId];

        if (attestation.timestamp == 0) {
            revert AttestationNotFound(attestationId);
        }

        if (attestation.validUntil < block.timestamp &&
            attestation.status == AttestationStatus.VALID) {
            attestation.status = AttestationStatus.EXPIRED;
            emit AttestationExpired(attestationId);
        }
    }
}
