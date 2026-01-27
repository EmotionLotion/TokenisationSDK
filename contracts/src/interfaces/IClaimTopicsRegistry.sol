// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IClaimTopicsRegistry
 * @dev Interface for managing claim topics required for token transfers
 * @notice Part of ERC-3643 identity framework
 *
 * Claim topics are numerical identifiers representing types of verifications:
 * - 1: KYC (Know Your Customer)
 * - 2: AML (Anti-Money Laundering)
 * - 3: Accreditation
 * - 4: Country Whitelist
 * - 5: Country Blacklist
 * - etc.
 */
interface IClaimTopicsRegistry {
    // ============================================================================
    // EVENTS
    // ============================================================================

    /// @notice Emitted when a claim topic is added
    event ClaimTopicAdded(uint256 indexed claimTopic);

    /// @notice Emitted when a claim topic is removed
    event ClaimTopicRemoved(uint256 indexed claimTopic);

    // ============================================================================
    // CLAIM TOPIC MANAGEMENT
    // ============================================================================

    /**
     * @dev Adds a claim topic to the registry
     * @param _claimTopic The claim topic to add
     */
    function addClaimTopic(uint256 _claimTopic) external;

    /**
     * @dev Removes a claim topic from the registry
     * @param _claimTopic The claim topic to remove
     */
    function removeClaimTopic(uint256 _claimTopic) external;

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @dev Returns all required claim topics
     * @return Array of claim topic identifiers
     */
    function getClaimTopics() external view returns (uint256[] memory);

    /**
     * @dev Checks if a claim topic is required
     * @param _claimTopic The claim topic to check
     * @return True if the claim topic is required
     */
    function isClaimTopicRequired(uint256 _claimTopic) external view returns (bool);

    /**
     * @dev Returns the number of required claim topics
     */
    function getClaimTopicsCount() external view returns (uint256);
}

/**
 * @title ITrustedIssuersRegistry
 * @dev Interface for managing trusted claim issuers
 * @notice Part of ERC-3643 identity framework
 *
 * Trusted issuers are entities authorized to issue specific types of claims.
 * For example:
 * - KYC Provider A can issue claims for topics [1, 2] (KYC, AML)
 * - Accreditation Provider B can issue claims for topic [3] (Accreditation)
 */
interface ITrustedIssuersRegistry {
    // ============================================================================
    // EVENTS
    // ============================================================================

    /// @notice Emitted when a trusted issuer is added
    event TrustedIssuerAdded(
        address indexed issuer,
        uint256[] claimTopics
    );

    /// @notice Emitted when a trusted issuer is removed
    event TrustedIssuerRemoved(address indexed issuer);

    /// @notice Emitted when issuer's claim topics are updated
    event ClaimTopicsUpdated(
        address indexed issuer,
        uint256[] claimTopics
    );

    // ============================================================================
    // ISSUER MANAGEMENT
    // ============================================================================

    /**
     * @dev Adds a trusted issuer for specific claim topics
     * @param _issuer The issuer address
     * @param _claimTopics Array of claim topics this issuer can issue
     */
    function addTrustedIssuer(
        address _issuer,
        uint256[] calldata _claimTopics
    ) external;

    /**
     * @dev Removes a trusted issuer
     * @param _issuer The issuer address to remove
     */
    function removeTrustedIssuer(address _issuer) external;

    /**
     * @dev Updates the claim topics for an issuer
     * @param _issuer The issuer address
     * @param _claimTopics New array of claim topics
     */
    function updateIssuerClaimTopics(
        address _issuer,
        uint256[] calldata _claimTopics
    ) external;

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @dev Returns all trusted issuers
     * @return Array of issuer addresses
     */
    function getTrustedIssuers() external view returns (address[] memory);

    /**
     * @dev Returns the claim topics for an issuer
     * @param _issuer The issuer address
     * @return Array of claim topics
     */
    function getTrustedIssuerClaimTopics(
        address _issuer
    ) external view returns (uint256[] memory);

    /**
     * @dev Checks if an issuer is trusted
     * @param _issuer The issuer address
     * @return True if the issuer is trusted
     */
    function isTrustedIssuer(address _issuer) external view returns (bool);

    /**
     * @dev Checks if an issuer is trusted for a specific claim topic
     * @param _issuer The issuer address
     * @param _claimTopic The claim topic to check
     * @return True if the issuer is trusted for the claim topic
     */
    function hasClaimTopic(
        address _issuer,
        uint256 _claimTopic
    ) external view returns (bool);

    /**
     * @dev Returns the number of trusted issuers
     */
    function getTrustedIssuersCount() external view returns (uint256);
}

/**
 * @title Standard Claim Topics
 * @dev Library of standard claim topic constants
 */
library StandardClaimTopics {
    /// @notice Know Your Customer verification
    uint256 constant KYC = 1;

    /// @notice Anti-Money Laundering check
    uint256 constant AML = 2;

    /// @notice Accredited Investor status
    uint256 constant ACCREDITED_INVESTOR = 3;

    /// @notice Qualified Purchaser status (US)
    uint256 constant QUALIFIED_PURCHASER = 4;

    /// @notice Country/Jurisdiction whitelist
    uint256 constant COUNTRY_ALLOWED = 5;

    /// @notice Institutional Investor status
    uint256 constant INSTITUTIONAL = 6;

    /// @notice Professional Investor status (EU MiFID)
    uint256 constant PROFESSIONAL = 7;

    /// @notice Politically Exposed Person check
    uint256 constant PEP_CHECK = 8;

    /// @notice Sanctions screening
    uint256 constant SANCTIONS_CHECK = 9;

    /// @notice Source of Funds verification
    uint256 constant SOURCE_OF_FUNDS = 10;

    /// @notice Tax Residency declaration
    uint256 constant TAX_RESIDENCY = 11;

    /// @notice Beneficial Ownership declaration
    uint256 constant BENEFICIAL_OWNERSHIP = 12;
}
