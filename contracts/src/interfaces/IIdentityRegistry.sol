// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IIdentityRegistry
 * @dev Interface for managing identity claims and KYC verification on-chain
 * @notice Based on ERC-3643 T-REX Identity Registry pattern
 */
interface IIdentityRegistry {
    // ============================================================================
    // EVENTS
    // ============================================================================

    event IdentityRegistered(address indexed userAddress, address indexed identity);
    event IdentityRemoved(address indexed userAddress, address indexed identity);
    event IdentityUpdated(address indexed oldIdentity, address indexed newIdentity);
    event CountryUpdated(address indexed userAddress, uint16 indexed country);
    event ClaimAdded(address indexed userAddress, uint256 indexed claimTopic, bytes32 claimId);
    event ClaimRemoved(address indexed userAddress, uint256 indexed claimTopic, bytes32 claimId);
    event VerifierAdded(address indexed verifier, uint256[] claimTopics);
    event VerifierRemoved(address indexed verifier);

    // ============================================================================
    // IDENTITY MANAGEMENT
    // ============================================================================

    /**
     * @dev Register identity for a user
     * @param userAddress The address to register identity for
     * @param identity The identity contract address (can be EOA or contract)
     * @param country The country code (ISO 3166-1 numeric)
     */
    function registerIdentity(address userAddress, address identity, uint16 country) external;

    /**
     * @dev Update identity for a user
     * @param userAddress The user address
     * @param identity The new identity address
     */
    function updateIdentity(address userAddress, address identity) external;

    /**
     * @dev Update country for a user
     * @param userAddress The user address
     * @param country The new country code
     */
    function updateCountry(address userAddress, uint16 country) external;

    /**
     * @dev Remove identity for a user
     * @param userAddress The user address
     */
    function removeIdentity(address userAddress) external;

    // ============================================================================
    // CLAIM MANAGEMENT
    // ============================================================================

    /**
     * @dev Add a claim to a user's identity
     * @param userAddress The user address
     * @param claimTopic The claim topic (e.g., KYC, ACCREDITATION)
     * @param issuer The claim issuer address
     * @param signature The claim signature
     * @param data The claim data
     * @param uri The claim URI (for off-chain data)
     */
    function addClaim(
        address userAddress,
        uint256 claimTopic,
        address issuer,
        bytes memory signature,
        bytes memory data,
        string memory uri
    ) external returns (bytes32 claimId);

    /**
     * @dev Remove a claim from a user's identity
     * @param userAddress The user address
     * @param claimId The claim ID to remove
     */
    function removeClaim(address userAddress, bytes32 claimId) external;

    // ============================================================================
    // VERIFIER MANAGEMENT
    // ============================================================================

    /**
     * @dev Add a trusted verifier for specific claim topics
     * @param verifier The verifier address
     * @param claimTopics The claim topics this verifier can issue
     */
    function addVerifier(address verifier, uint256[] memory claimTopics) external;

    /**
     * @dev Remove a trusted verifier
     * @param verifier The verifier address
     */
    function removeVerifier(address verifier) external;

    /**
     * @dev Check if an address is a trusted verifier for a topic
     * @param verifier The verifier address
     * @param claimTopic The claim topic
     */
    function isVerifier(address verifier, uint256 claimTopic) external view returns (bool);

    // ============================================================================
    // QUERY FUNCTIONS
    // ============================================================================

    /**
     * @dev Get the identity address for a user
     * @param userAddress The user address
     */
    function getIdentity(address userAddress) external view returns (address);

    /**
     * @dev Get the country code for a user
     * @param userAddress The user address
     */
    function getCountry(address userAddress) external view returns (uint16);

    /**
     * @dev Check if a user has a registered identity
     * @param userAddress The user address
     */
    function hasIdentity(address userAddress) external view returns (bool);

    /**
     * @dev Check if a user has a valid claim for a topic
     * @param userAddress The user address
     * @param claimTopic The claim topic to check
     */
    function hasClaim(address userAddress, uint256 claimTopic) external view returns (bool);

    /**
     * @dev Get claim details
     * @param claimId The claim ID
     */
    function getClaim(bytes32 claimId)
        external
        view
        returns (
            uint256 topic,
            address issuer,
            bytes memory signature,
            bytes memory data,
            string memory uri,
            uint256 issuedAt,
            uint256 expiresAt
        );

    /**
     * @dev Check if a user is verified (has identity + required claims)
     * @param userAddress The user address
     * @param requiredClaims Array of required claim topics
     */
    function isVerified(address userAddress, uint256[] memory requiredClaims) external view returns (bool);
}

/**
 * @title Claim Topics
 * @dev Standard claim topic constants
 */
library ClaimTopics {
    uint256 constant KYC = 1; // Know Your Customer
    uint256 constant AML = 2; // Anti-Money Laundering
    uint256 constant ACCREDITATION = 3; // Accredited Investor
    uint256 constant COUNTRY_ALLOWED = 4; // Country whitelist
    uint256 constant COUNTRY_BLOCKED = 5; // Country blacklist (sanctioned)
    uint256 constant INSTITUTION = 6; // Institutional investor
    uint256 constant QUALIFIED_PURCHASER = 7; // Qualified purchaser
    uint256 constant REPUTATION = 8; // Reputation score
    uint256 constant DRIVER_LICENSE = 9; // Driver verification
    uint256 constant INSURANCE = 10; // Insurance verification
}

/**
 * @title Country Codes
 * @dev ISO 3166-1 numeric country codes for common jurisdictions
 */
library CountryCodes {
    uint16 constant AE = 784; // UAE
    uint16 constant US = 840; // USA
    uint16 constant GB = 826; // UK
    uint16 constant SG = 702; // Singapore
    uint16 constant JP = 392; // Japan
    uint16 constant DE = 276; // Germany
    uint16 constant FR = 250; // France

    // Sanctioned countries
    uint16 constant KP = 408; // North Korea
    uint16 constant IR = 364; // Iran
    uint16 constant CU = 192; // Cuba
    uint16 constant SY = 760; // Syria
}
