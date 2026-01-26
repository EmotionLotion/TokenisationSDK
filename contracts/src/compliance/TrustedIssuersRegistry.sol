// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TrustedIssuersRegistry
 * @notice Registry for managing trusted claim issuers
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Trusted issuers are entities authorized to issue claims for specific topics.
 * For example, a KYC provider might be trusted to issue KYC claims (topic 1).
 */
contract TrustedIssuersRegistry is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event TrustedIssuerAdded(address indexed issuer, uint256[] claimTopics);
    event TrustedIssuerRemoved(address indexed issuer);
    event ClaimTopicsUpdated(address indexed issuer, uint256[] claimTopics);
    event IssuerInfoUpdated(address indexed issuer, string name, string uri);

    // ============================================================================
    // Structs
    // ============================================================================

    struct IssuerInfo {
        bool isTrusted;
        string name;
        string uri;           // URL for issuer information
        uint256 addedAt;
        uint256 updatedAt;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Array of all trusted issuer addresses
    address[] private _trustedIssuers;

    /// @notice Mapping from issuer address to their info
    mapping(address => IssuerInfo) private _issuerInfo;

    /// @notice Mapping from issuer address to their trusted claim topics
    mapping(address => uint256[]) private _issuerClaimTopics;

    /// @notice Mapping from issuer address to topic to trusted status
    mapping(address => mapping(uint256 => bool)) private _issuerTopicTrusted;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================================
    // Issuer Management
    // ============================================================================

    /**
     * @notice Add a trusted issuer
     * @param issuer The issuer address
     * @param claimTopics The claim topics this issuer is trusted for
     */
    function addTrustedIssuer(
        address issuer,
        uint256[] calldata claimTopics
    ) external onlyOwner {
        require(issuer != address(0), "Invalid issuer address");
        require(!_issuerInfo[issuer].isTrusted, "Issuer already trusted");
        require(claimTopics.length > 0, "Must have at least one topic");

        _trustedIssuers.push(issuer);

        _issuerInfo[issuer] = IssuerInfo({
            isTrusted: true,
            name: "",
            uri: "",
            addedAt: block.timestamp,
            updatedAt: block.timestamp
        });

        _setIssuerTopics(issuer, claimTopics);

        emit TrustedIssuerAdded(issuer, claimTopics);
    }

    /**
     * @notice Add a trusted issuer with metadata
     * @param issuer The issuer address
     * @param claimTopics The claim topics
     * @param name The issuer name
     * @param uri The issuer information URI
     */
    function addTrustedIssuerWithInfo(
        address issuer,
        uint256[] calldata claimTopics,
        string calldata name,
        string calldata uri
    ) external onlyOwner {
        require(issuer != address(0), "Invalid issuer address");
        require(!_issuerInfo[issuer].isTrusted, "Issuer already trusted");
        require(claimTopics.length > 0, "Must have at least one topic");

        _trustedIssuers.push(issuer);

        _issuerInfo[issuer] = IssuerInfo({
            isTrusted: true,
            name: name,
            uri: uri,
            addedAt: block.timestamp,
            updatedAt: block.timestamp
        });

        _setIssuerTopics(issuer, claimTopics);

        emit TrustedIssuerAdded(issuer, claimTopics);
        emit IssuerInfoUpdated(issuer, name, uri);
    }

    /**
     * @notice Remove a trusted issuer
     * @param issuer The issuer address
     */
    function removeTrustedIssuer(address issuer) external onlyOwner {
        require(_issuerInfo[issuer].isTrusted, "Issuer not trusted");

        // Remove from array
        for (uint256 i = 0; i < _trustedIssuers.length; i++) {
            if (_trustedIssuers[i] == issuer) {
                _trustedIssuers[i] = _trustedIssuers[_trustedIssuers.length - 1];
                _trustedIssuers.pop();
                break;
            }
        }

        // Clear topic mappings
        uint256[] memory topics = _issuerClaimTopics[issuer];
        for (uint256 i = 0; i < topics.length; i++) {
            _issuerTopicTrusted[issuer][topics[i]] = false;
        }
        delete _issuerClaimTopics[issuer];

        _issuerInfo[issuer].isTrusted = false;

        emit TrustedIssuerRemoved(issuer);
    }

    /**
     * @notice Update claim topics for an issuer
     * @param issuer The issuer address
     * @param claimTopics New claim topics
     */
    function updateIssuerClaimTopics(
        address issuer,
        uint256[] calldata claimTopics
    ) external onlyOwner {
        require(_issuerInfo[issuer].isTrusted, "Issuer not trusted");
        require(claimTopics.length > 0, "Must have at least one topic");

        // Clear existing topics
        uint256[] memory oldTopics = _issuerClaimTopics[issuer];
        for (uint256 i = 0; i < oldTopics.length; i++) {
            _issuerTopicTrusted[issuer][oldTopics[i]] = false;
        }

        _setIssuerTopics(issuer, claimTopics);
        _issuerInfo[issuer].updatedAt = block.timestamp;

        emit ClaimTopicsUpdated(issuer, claimTopics);
    }

    /**
     * @notice Update issuer information
     * @param issuer The issuer address
     * @param name The issuer name
     * @param uri The issuer URI
     */
    function updateIssuerInfo(
        address issuer,
        string calldata name,
        string calldata uri
    ) external onlyOwner {
        require(_issuerInfo[issuer].isTrusted, "Issuer not trusted");

        _issuerInfo[issuer].name = name;
        _issuerInfo[issuer].uri = uri;
        _issuerInfo[issuer].updatedAt = block.timestamp;

        emit IssuerInfoUpdated(issuer, name, uri);
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    function _setIssuerTopics(address issuer, uint256[] calldata topics) internal {
        _issuerClaimTopics[issuer] = topics;
        for (uint256 i = 0; i < topics.length; i++) {
            _issuerTopicTrusted[issuer][topics[i]] = true;
        }
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Check if an issuer is trusted
     * @param issuer The issuer address
     * @return Whether the issuer is trusted
     */
    function isTrustedIssuer(address issuer) external view returns (bool) {
        return _issuerInfo[issuer].isTrusted;
    }

    /**
     * @notice Check if an issuer is trusted for a specific topic
     * @param issuer The issuer address
     * @param claimTopic The claim topic
     * @return Whether trusted for the topic
     */
    function hasClaimTopic(address issuer, uint256 claimTopic) external view returns (bool) {
        return _issuerInfo[issuer].isTrusted && _issuerTopicTrusted[issuer][claimTopic];
    }

    /**
     * @notice Get claim topics for an issuer
     * @param issuer The issuer address
     * @return Array of claim topics
     */
    function getIssuerClaimTopics(address issuer) external view returns (uint256[] memory) {
        return _issuerClaimTopics[issuer];
    }

    /**
     * @notice Get all trusted issuers
     * @return Array of issuer addresses
     */
    function getTrustedIssuers() external view returns (address[] memory) {
        return _trustedIssuers;
    }

    /**
     * @notice Get trusted issuers for a specific topic
     * @param claimTopic The claim topic
     * @return Array of issuer addresses trusted for this topic
     */
    function getTrustedIssuersForClaimTopic(uint256 claimTopic) external view returns (address[] memory) {
        uint256 count = 0;

        // Count matching issuers
        for (uint256 i = 0; i < _trustedIssuers.length; i++) {
            if (_issuerTopicTrusted[_trustedIssuers[i]][claimTopic]) {
                count++;
            }
        }

        // Build result array
        address[] memory result = new address[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < _trustedIssuers.length; i++) {
            if (_issuerTopicTrusted[_trustedIssuers[i]][claimTopic]) {
                result[index] = _trustedIssuers[i];
                index++;
            }
        }

        return result;
    }

    /**
     * @notice Get issuer information
     * @param issuer The issuer address
     * @return info The issuer info struct
     */
    function getIssuerInfo(address issuer) external view returns (IssuerInfo memory info) {
        return _issuerInfo[issuer];
    }

    /**
     * @notice Get number of trusted issuers
     * @return The count
     */
    function getTrustedIssuersCount() external view returns (uint256) {
        return _trustedIssuers.length;
    }
}
