// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

/**
 * @title FunctionsConsumer
 * @notice Chainlink Functions consumer for off-chain data verification
 * @dev Supports KYC verification, property valuation, and sanctions screening
 */
contract FunctionsConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // ============================================================================
    // Errors
    // ============================================================================

    error UnexpectedRequestID(bytes32 requestId);
    error RequestNotFound(bytes32 requestId);
    error RequestAlreadyFulfilled(bytes32 requestId);
    error InvalidRequestType();
    error SourceNotConfigured(RequestType requestType);

    // ============================================================================
    // Events
    // ============================================================================

    event RequestSent(bytes32 indexed requestId, RequestType requestType, bytes32 indexed subjectId);
    event RequestFulfilled(bytes32 indexed requestId, bytes response, bytes err);
    event KYCVerified(bytes32 indexed subjectId, bool verified, string level);
    event ValuationReceived(bytes32 indexed assetId, uint256 valuation, string currency);
    event SanctionsChecked(bytes32 indexed subjectId, bool isSanctioned);
    event SourceUpdated(RequestType requestType, string source);

    // ============================================================================
    // Enums & Structs
    // ============================================================================

    enum RequestType {
        KYC_VERIFICATION,
        PROPERTY_VALUATION,
        SANCTIONS_CHECK,
        CUSTOM
    }

    enum RequestStatus {
        PENDING,
        FULFILLED,
        FAILED
    }

    struct RequestInfo {
        RequestType requestType;
        bytes32 subjectId;
        RequestStatus status;
        bytes response;
        bytes error;
        uint256 timestamp;
    }

    struct KYCResult {
        bool verified;
        string level;         // "BASIC", "STANDARD", "ENHANCED"
        uint256 expiresAt;
        string provider;
    }

    struct ValuationResult {
        uint256 value;
        string currency;
        uint256 timestamp;
        string source;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Subscription ID for Chainlink Functions
    uint64 public subscriptionId;

    /// @notice Gas limit for callback
    uint32 public callbackGasLimit = 300_000;

    /// @notice DON ID for the network
    bytes32 public donId;

    /// @notice JavaScript sources for each request type
    mapping(RequestType => string) public sources;

    /// @notice Mapping from request ID to request info
    mapping(bytes32 => RequestInfo) public requests;

    /// @notice Mapping from subject ID to latest KYC result
    mapping(bytes32 => KYCResult) public kycResults;

    /// @notice Mapping from asset ID to latest valuation
    mapping(bytes32 => ValuationResult) public valuations;

    /// @notice Mapping from subject ID to sanctions status
    mapping(bytes32 => bool) public sanctionsStatus;

    /// @notice All request IDs for enumeration
    bytes32[] public requestIds;

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
     * @notice Set JavaScript source for a request type
     * @param requestType The type of request
     * @param source The JavaScript source code
     */
    function setSource(RequestType requestType, string calldata source) external onlyOwner {
        sources[requestType] = source;
        emit SourceUpdated(requestType, source);
    }

    // ============================================================================
    // Request Functions
    // ============================================================================

    /**
     * @notice Request KYC verification for an investor
     * @param investorId The investor identifier
     * @param externalId External KYC provider ID
     * @return requestId The Chainlink Functions request ID
     */
    function requestKYCVerification(
        bytes32 investorId,
        string calldata externalId
    ) external onlyOwner returns (bytes32 requestId) {
        if (bytes(sources[RequestType.KYC_VERIFICATION]).length == 0) {
            revert SourceNotConfigured(RequestType.KYC_VERIFICATION);
        }

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(sources[RequestType.KYC_VERIFICATION]);

        string[] memory args = new string[](1);
        args[0] = externalId;
        req.setArgs(args);

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

        requests[requestId] = RequestInfo({
            requestType: RequestType.KYC_VERIFICATION,
            subjectId: investorId,
            status: RequestStatus.PENDING,
            response: "",
            error: "",
            timestamp: block.timestamp
        });

        requestIds.push(requestId);

        emit RequestSent(requestId, RequestType.KYC_VERIFICATION, investorId);
    }

    /**
     * @notice Request property valuation
     * @param assetId The asset identifier
     * @param propertyId External property identifier (e.g., DLD ID)
     * @return requestId The Chainlink Functions request ID
     */
    function requestValuation(
        bytes32 assetId,
        string calldata propertyId
    ) external onlyOwner returns (bytes32 requestId) {
        if (bytes(sources[RequestType.PROPERTY_VALUATION]).length == 0) {
            revert SourceNotConfigured(RequestType.PROPERTY_VALUATION);
        }

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(sources[RequestType.PROPERTY_VALUATION]);

        string[] memory args = new string[](1);
        args[0] = propertyId;
        req.setArgs(args);

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

        requests[requestId] = RequestInfo({
            requestType: RequestType.PROPERTY_VALUATION,
            subjectId: assetId,
            status: RequestStatus.PENDING,
            response: "",
            error: "",
            timestamp: block.timestamp
        });

        requestIds.push(requestId);

        emit RequestSent(requestId, RequestType.PROPERTY_VALUATION, assetId);
    }

    /**
     * @notice Request sanctions check
     * @param subjectId The subject identifier
     * @param name The name to check
     * @param country The country code
     * @return requestId The Chainlink Functions request ID
     */
    function requestSanctionsCheck(
        bytes32 subjectId,
        string calldata name,
        string calldata country
    ) external onlyOwner returns (bytes32 requestId) {
        if (bytes(sources[RequestType.SANCTIONS_CHECK]).length == 0) {
            revert SourceNotConfigured(RequestType.SANCTIONS_CHECK);
        }

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(sources[RequestType.SANCTIONS_CHECK]);

        string[] memory args = new string[](2);
        args[0] = name;
        args[1] = country;
        req.setArgs(args);

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

        requests[requestId] = RequestInfo({
            requestType: RequestType.SANCTIONS_CHECK,
            subjectId: subjectId,
            status: RequestStatus.PENDING,
            response: "",
            error: "",
            timestamp: block.timestamp
        });

        requestIds.push(requestId);

        emit RequestSent(requestId, RequestType.SANCTIONS_CHECK, subjectId);
    }

    // ============================================================================
    // Callback
    // ============================================================================

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
        info.status = err.length > 0 ? RequestStatus.FAILED : RequestStatus.FULFILLED;

        emit RequestFulfilled(requestId, response, err);

        // Process response based on request type
        if (err.length == 0) {
            _processResponse(requestId, info.requestType, info.subjectId, response);
        }
    }

    /**
     * @notice Process response based on request type
     */
    function _processResponse(
        bytes32 requestId,
        RequestType requestType,
        bytes32 subjectId,
        bytes memory response
    ) internal {
        if (requestType == RequestType.KYC_VERIFICATION) {
            // Expected response: abi.encode(bool verified, string level, uint256 expiresAt)
            (bool verified, string memory level, uint256 expiresAt) = abi.decode(
                response,
                (bool, string, uint256)
            );

            kycResults[subjectId] = KYCResult({
                verified: verified,
                level: level,
                expiresAt: expiresAt,
                provider: "chainlink-functions"
            });

            emit KYCVerified(subjectId, verified, level);
        } else if (requestType == RequestType.PROPERTY_VALUATION) {
            // Expected response: abi.encode(uint256 value, string currency)
            (uint256 value, string memory currency) = abi.decode(response, (uint256, string));

            valuations[subjectId] = ValuationResult({
                value: value,
                currency: currency,
                timestamp: block.timestamp,
                source: "chainlink-functions"
            });

            emit ValuationReceived(subjectId, value, currency);
        } else if (requestType == RequestType.SANCTIONS_CHECK) {
            // Expected response: abi.encode(bool isSanctioned)
            bool sanctioned = abi.decode(response, (bool));
            sanctionsStatus[subjectId] = sanctioned;

            emit SanctionsChecked(subjectId, sanctioned);
        }
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get request info
     * @param requestId The request ID
     * @return info The request info
     */
    function getRequest(bytes32 requestId) external view returns (RequestInfo memory info) {
        return requests[requestId];
    }

    /**
     * @notice Get KYC result for an investor
     * @param investorId The investor identifier
     * @return result The KYC result
     */
    function getKYCResult(bytes32 investorId) external view returns (KYCResult memory result) {
        return kycResults[investorId];
    }

    /**
     * @notice Get valuation for an asset
     * @param assetId The asset identifier
     * @return result The valuation result
     */
    function getValuation(bytes32 assetId) external view returns (ValuationResult memory result) {
        return valuations[assetId];
    }

    /**
     * @notice Check if subject is sanctioned
     * @param subjectId The subject identifier
     * @return Whether the subject is sanctioned
     */
    function isSanctioned(bytes32 subjectId) external view returns (bool) {
        return sanctionsStatus[subjectId];
    }

    /**
     * @notice Get total number of requests
     * @return The number of requests
     */
    function getRequestCount() external view returns (uint256) {
        return requestIds.length;
    }

    /**
     * @notice Check if KYC is valid
     * @param investorId The investor identifier
     * @return isValid Whether KYC is valid and not expired
     */
    function isKYCValid(bytes32 investorId) external view returns (bool isValid) {
        KYCResult memory result = kycResults[investorId];
        return result.verified && result.expiresAt > block.timestamp;
    }
}
