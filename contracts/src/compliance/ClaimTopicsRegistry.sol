// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ClaimTopicsRegistry
 * @notice Registry for managing claim topics required for compliance
 * @dev Part of ERC-3643 (T-REX) compliance framework
 *
 * Claim topics are numeric identifiers representing types of claims:
 * - 1: KYC verification
 * - 2: Accredited investor status
 * - 3: Country of residence
 * - 4: AML verification
 * - 5: Sanctions screening
 * - 6: Professional investor status
 * - etc.
 */
contract ClaimTopicsRegistry is Ownable {
    // ============================================================================
    // Events
    // ============================================================================

    event ClaimTopicAdded(uint256 indexed claimTopic);
    event ClaimTopicRemoved(uint256 indexed claimTopic);
    event TopicDescriptionUpdated(uint256 indexed claimTopic, string description);

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Array of required claim topics
    uint256[] private _claimTopics;

    /// @notice Mapping to check if a claim topic is required
    mapping(uint256 => bool) private _claimTopicExists;

    /// @notice Human-readable descriptions for claim topics
    mapping(uint256 => string) public claimTopicDescriptions;

    /// @notice Standard claim topic constants
    uint256 public constant TOPIC_KYC = 1;
    uint256 public constant TOPIC_ACCREDITED_INVESTOR = 2;
    uint256 public constant TOPIC_COUNTRY = 3;
    uint256 public constant TOPIC_AML = 4;
    uint256 public constant TOPIC_SANCTIONS = 5;
    uint256 public constant TOPIC_PROFESSIONAL_INVESTOR = 6;
    uint256 public constant TOPIC_QUALIFIED_PURCHASER = 7;
    uint256 public constant TOPIC_TAX_RESIDENCY = 8;

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address initialOwner) Ownable(initialOwner) {
        // Initialize standard topic descriptions
        claimTopicDescriptions[TOPIC_KYC] = "KYC Verification";
        claimTopicDescriptions[TOPIC_ACCREDITED_INVESTOR] = "Accredited Investor Status";
        claimTopicDescriptions[TOPIC_COUNTRY] = "Country of Residence";
        claimTopicDescriptions[TOPIC_AML] = "AML Verification";
        claimTopicDescriptions[TOPIC_SANCTIONS] = "Sanctions Screening";
        claimTopicDescriptions[TOPIC_PROFESSIONAL_INVESTOR] = "Professional Investor Status";
        claimTopicDescriptions[TOPIC_QUALIFIED_PURCHASER] = "Qualified Purchaser Status";
        claimTopicDescriptions[TOPIC_TAX_RESIDENCY] = "Tax Residency";
    }

    // ============================================================================
    // Topic Management
    // ============================================================================

    /**
     * @notice Add a claim topic to the registry
     * @param claimTopic The claim topic to add
     */
    function addClaimTopic(uint256 claimTopic) external onlyOwner {
        require(!_claimTopicExists[claimTopic], "Topic already exists");

        _claimTopics.push(claimTopic);
        _claimTopicExists[claimTopic] = true;

        emit ClaimTopicAdded(claimTopic);
    }

    /**
     * @notice Add multiple claim topics at once
     * @param claimTopicsToAdd Array of claim topics to add
     */
    function addClaimTopicsBatch(uint256[] calldata claimTopicsToAdd) external onlyOwner {
        for (uint256 i = 0; i < claimTopicsToAdd.length; i++) {
            uint256 topic = claimTopicsToAdd[i];
            if (!_claimTopicExists[topic]) {
                _claimTopics.push(topic);
                _claimTopicExists[topic] = true;
                emit ClaimTopicAdded(topic);
            }
        }
    }

    /**
     * @notice Remove a claim topic from the registry
     * @param claimTopic The claim topic to remove
     */
    function removeClaimTopic(uint256 claimTopic) external onlyOwner {
        require(_claimTopicExists[claimTopic], "Topic does not exist");

        // Find and remove the topic
        for (uint256 i = 0; i < _claimTopics.length; i++) {
            if (_claimTopics[i] == claimTopic) {
                _claimTopics[i] = _claimTopics[_claimTopics.length - 1];
                _claimTopics.pop();
                break;
            }
        }

        _claimTopicExists[claimTopic] = false;

        emit ClaimTopicRemoved(claimTopic);
    }

    /**
     * @notice Set description for a claim topic
     * @param claimTopic The claim topic
     * @param description Human-readable description
     */
    function setTopicDescription(uint256 claimTopic, string calldata description) external onlyOwner {
        claimTopicDescriptions[claimTopic] = description;
        emit TopicDescriptionUpdated(claimTopic, description);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Get all required claim topics
     * @return Array of claim topics
     */
    function getClaimTopics() external view returns (uint256[] memory) {
        return _claimTopics;
    }

    /**
     * @notice Check if a claim topic is required
     * @param claimTopic The claim topic to check
     * @return Whether the topic is required
     */
    function isClaimTopicRequired(uint256 claimTopic) external view returns (bool) {
        return _claimTopicExists[claimTopic];
    }

    /**
     * @notice Get the number of required claim topics
     * @return The count
     */
    function getClaimTopicsCount() external view returns (uint256) {
        return _claimTopics.length;
    }

    /**
     * @notice Get claim topic at index
     * @param index The index
     * @return The claim topic
     */
    function getClaimTopicAt(uint256 index) external view returns (uint256) {
        require(index < _claimTopics.length, "Index out of bounds");
        return _claimTopics[index];
    }

    /**
     * @notice Get topic description
     * @param claimTopic The claim topic
     * @return The description
     */
    function getTopicDescription(uint256 claimTopic) external view returns (string memory) {
        return claimTopicDescriptions[claimTopic];
    }
}
