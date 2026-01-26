// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ClaimsRegistry
 * @notice On-chain claims registry for identity verification enforcement
 * @dev Uses bitmask-based claims for gas-efficient compliance checks
 *
 * Key design principles:
 * 1. Only boolean/flags on-chain (no personal data)
 * 2. Bitmask for efficient multi-claim checks
 * 3. Expiry enforcement
 * 4. Policy-based transfer restrictions
 *
 * Claim Bitmask Positions:
 * - bit 0:  KYC_APPROVED
 * - bit 1:  RESIDENCY (must check jurisdiction separately)
 * - bit 2:  ACCREDITED_INVESTOR
 * - bit 3:  QUALIFIED_PURCHASER
 * - bit 4:  INSTITUTIONAL
 * - bit 5:  SANCTIONS_CLEAR
 * - bit 6:  PEP_CLEAR
 * - bit 7:  SOURCE_OF_FUNDS
 * - bit 8:  AGE_VERIFIED
 * - bit 9:  ENTITY_VERIFIED
 */
contract ClaimsRegistry is AccessControl, Pausable {
    // ============================================================================
    // CONSTANTS - CLAIM BITMASK POSITIONS
    // ============================================================================

    uint256 public constant CLAIM_KYC_APPROVED = 1 << 0;
    uint256 public constant CLAIM_RESIDENCY = 1 << 1;
    uint256 public constant CLAIM_ACCREDITED = 1 << 2;
    uint256 public constant CLAIM_QUALIFIED_PURCHASER = 1 << 3;
    uint256 public constant CLAIM_INSTITUTIONAL = 1 << 4;
    uint256 public constant CLAIM_SANCTIONS_CLEAR = 1 << 5;
    uint256 public constant CLAIM_PEP_CLEAR = 1 << 6;
    uint256 public constant CLAIM_SOURCE_OF_FUNDS = 1 << 7;
    uint256 public constant CLAIM_AGE_VERIFIED = 1 << 8;
    uint256 public constant CLAIM_ENTITY_VERIFIED = 1 << 9;

    // Common requirement masks
    uint256 public constant MASK_BASIC_KYC = CLAIM_KYC_APPROVED | CLAIM_SANCTIONS_CLEAR;
    uint256 public constant MASK_UAE_RESIDENT = CLAIM_KYC_APPROVED | CLAIM_RESIDENCY | CLAIM_SANCTIONS_CLEAR;
    uint256 public constant MASK_ACCREDITED = CLAIM_KYC_APPROVED | CLAIM_ACCREDITED | CLAIM_SANCTIONS_CLEAR;
    uint256 public constant MASK_INSTITUTIONAL = CLAIM_KYC_APPROVED | CLAIM_INSTITUTIONAL | CLAIM_SANCTIONS_CLEAR | CLAIM_SOURCE_OF_FUNDS;

    // ============================================================================
    // ROLES
    // ============================================================================

    bytes32 public constant CLAIMS_ADMIN_ROLE = keccak256("CLAIMS_ADMIN_ROLE");
    bytes32 public constant CLAIMS_UPDATER_ROLE = keccak256("CLAIMS_UPDATER_ROLE");

    // ============================================================================
    // STRUCTS
    // ============================================================================

    /**
     * @notice Identity claims for a wallet
     */
    struct IdentityClaims {
        uint256 claimsMask;        // Bitmask of active claims
        bytes2 jurisdiction;       // ISO 3166-1 alpha-2 country code (e.g., "AE", "US")
        uint64 claimsExpiry;       // When claims expire (0 = never)
        uint64 updatedAt;          // Last update timestamp
        bool isFrozen;             // Emergency freeze
    }

    /**
     * @notice Token policy configuration
     */
    struct TokenPolicy {
        uint256 requiredMask;      // Required claims bitmask
        bytes2 requiredJurisdiction; // Required jurisdiction (0x0000 = any)
        bool allowForeignAccredited; // Allow non-matching jurisdiction if accredited
        bool isActive;             // Whether policy is active
    }

    // ============================================================================
    // STATE
    // ============================================================================

    /// @notice Claims for each wallet
    mapping(address => IdentityClaims) private _claims;

    /// @notice Policy for each token contract
    mapping(address => TokenPolicy) private _tokenPolicies;

    /// @notice Blocked jurisdictions
    mapping(bytes2 => bool) private _blockedJurisdictions;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event ClaimsUpdated(
        address indexed wallet,
        uint256 oldMask,
        uint256 newMask,
        bytes2 jurisdiction,
        uint64 expiry
    );

    event ClaimsRevoked(address indexed wallet, string reason);

    event WalletFrozen(address indexed wallet, string reason);
    event WalletUnfrozen(address indexed wallet);

    event TokenPolicySet(
        address indexed token,
        uint256 requiredMask,
        bytes2 requiredJurisdiction,
        bool allowForeignAccredited
    );

    event JurisdictionBlocked(bytes2 indexed jurisdiction);
    event JurisdictionUnblocked(bytes2 indexed jurisdiction);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error ClaimsNotFound(address wallet);
    error ClaimsExpired(address wallet);
    error WalletIsFrozen(address wallet);
    error JurisdictionIsBlocked(bytes2 jurisdiction);
    error InsufficientClaims(address wallet, uint256 required, uint256 actual);
    error PolicyNotFound(address token);

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CLAIMS_ADMIN_ROLE, admin);
        _grantRole(CLAIMS_UPDATER_ROLE, admin);
    }

    // ============================================================================
    // CLAIMS MANAGEMENT
    // ============================================================================

    /**
     * @notice Set claims for a wallet
     * @param wallet The wallet address
     * @param claimsMask Bitmask of claims
     * @param jurisdiction ISO 3166-1 alpha-2 country code
     * @param expiry Expiration timestamp (0 = never)
     */
    function setClaims(
        address wallet,
        uint256 claimsMask,
        bytes2 jurisdiction,
        uint64 expiry
    ) external onlyRole(CLAIMS_UPDATER_ROLE) whenNotPaused {
        if (_blockedJurisdictions[jurisdiction]) revert JurisdictionIsBlocked(jurisdiction);

        uint256 oldMask = _claims[wallet].claimsMask;

        _claims[wallet] = IdentityClaims({
            claimsMask: claimsMask,
            jurisdiction: jurisdiction,
            claimsExpiry: expiry,
            updatedAt: uint64(block.timestamp),
            isFrozen: false
        });

        emit ClaimsUpdated(wallet, oldMask, claimsMask, jurisdiction, expiry);
    }

    /**
     * @notice Add claims to existing mask (OR operation)
     * @param wallet The wallet address
     * @param claimsToAdd Claims to add
     */
    function addClaims(
        address wallet,
        uint256 claimsToAdd
    ) external onlyRole(CLAIMS_UPDATER_ROLE) whenNotPaused {
        IdentityClaims storage claims = _claims[wallet];
        uint256 oldMask = claims.claimsMask;
        claims.claimsMask |= claimsToAdd;
        claims.updatedAt = uint64(block.timestamp);

        emit ClaimsUpdated(wallet, oldMask, claims.claimsMask, claims.jurisdiction, claims.claimsExpiry);
    }

    /**
     * @notice Remove claims from existing mask (AND NOT operation)
     * @param wallet The wallet address
     * @param claimsToRemove Claims to remove
     */
    function removeClaims(
        address wallet,
        uint256 claimsToRemove
    ) external onlyRole(CLAIMS_UPDATER_ROLE) whenNotPaused {
        IdentityClaims storage claims = _claims[wallet];
        uint256 oldMask = claims.claimsMask;
        claims.claimsMask &= ~claimsToRemove;
        claims.updatedAt = uint64(block.timestamp);

        emit ClaimsUpdated(wallet, oldMask, claims.claimsMask, claims.jurisdiction, claims.claimsExpiry);
    }

    /**
     * @notice Revoke all claims for a wallet
     * @param wallet The wallet address
     * @param reason Reason for revocation
     */
    function revokeClaims(
        address wallet,
        string calldata reason
    ) external onlyRole(CLAIMS_ADMIN_ROLE) whenNotPaused {
        delete _claims[wallet];
        emit ClaimsRevoked(wallet, reason);
    }

    /**
     * @notice Update claims expiry
     * @param wallet The wallet address
     * @param newExpiry New expiration timestamp
     */
    function updateExpiry(
        address wallet,
        uint64 newExpiry
    ) external onlyRole(CLAIMS_UPDATER_ROLE) whenNotPaused {
        IdentityClaims storage claims = _claims[wallet];
        claims.claimsExpiry = newExpiry;
        claims.updatedAt = uint64(block.timestamp);

        emit ClaimsUpdated(wallet, claims.claimsMask, claims.claimsMask, claims.jurisdiction, newExpiry);
    }

    // ============================================================================
    // FREEZE MANAGEMENT
    // ============================================================================

    /**
     * @notice Freeze a wallet (emergency)
     * @param wallet The wallet to freeze
     * @param reason Reason for freezing
     */
    function freezeWallet(
        address wallet,
        string calldata reason
    ) external onlyRole(CLAIMS_ADMIN_ROLE) {
        _claims[wallet].isFrozen = true;
        emit WalletFrozen(wallet, reason);
    }

    /**
     * @notice Unfreeze a wallet
     * @param wallet The wallet to unfreeze
     */
    function unfreezeWallet(address wallet) external onlyRole(CLAIMS_ADMIN_ROLE) {
        _claims[wallet].isFrozen = false;
        emit WalletUnfrozen(wallet);
    }

    // ============================================================================
    // TOKEN POLICY MANAGEMENT
    // ============================================================================

    /**
     * @notice Set policy for a token contract
     * @param token Token contract address
     * @param requiredMask Required claims bitmask
     * @param requiredJurisdiction Required jurisdiction (0x0000 for any)
     * @param allowForeignAccredited Allow foreign accredited investors
     */
    function setTokenPolicy(
        address token,
        uint256 requiredMask,
        bytes2 requiredJurisdiction,
        bool allowForeignAccredited
    ) external onlyRole(CLAIMS_ADMIN_ROLE) {
        _tokenPolicies[token] = TokenPolicy({
            requiredMask: requiredMask,
            requiredJurisdiction: requiredJurisdiction,
            allowForeignAccredited: allowForeignAccredited,
            isActive: true
        });

        emit TokenPolicySet(token, requiredMask, requiredJurisdiction, allowForeignAccredited);
    }

    /**
     * @notice Deactivate policy for a token
     * @param token Token contract address
     */
    function deactivateTokenPolicy(address token) external onlyRole(CLAIMS_ADMIN_ROLE) {
        _tokenPolicies[token].isActive = false;
    }

    // ============================================================================
    // JURISDICTION MANAGEMENT
    // ============================================================================

    /**
     * @notice Block a jurisdiction
     * @param jurisdiction ISO 3166-1 alpha-2 country code
     */
    function blockJurisdiction(bytes2 jurisdiction) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _blockedJurisdictions[jurisdiction] = true;
        emit JurisdictionBlocked(jurisdiction);
    }

    /**
     * @notice Unblock a jurisdiction
     * @param jurisdiction ISO 3166-1 alpha-2 country code
     */
    function unblockJurisdiction(bytes2 jurisdiction) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _blockedJurisdictions[jurisdiction] = false;
        emit JurisdictionUnblocked(jurisdiction);
    }

    // ============================================================================
    // COMPLIANCE CHECKS
    // ============================================================================

    /**
     * @notice Check if wallet satisfies required claims mask
     * @param wallet Wallet to check
     * @param requiredMask Required claims bitmask
     * @return bool True if all required claims are present and valid
     */
    function hasClaims(address wallet, uint256 requiredMask) public view returns (bool) {
        IdentityClaims storage claims = _claims[wallet];

        // Check frozen
        if (claims.isFrozen) return false;

        // Check expiry
        if (claims.claimsExpiry != 0 && claims.claimsExpiry < block.timestamp) return false;

        // Check jurisdiction
        if (_blockedJurisdictions[claims.jurisdiction]) return false;

        // Check claims mask
        return (claims.claimsMask & requiredMask) == requiredMask;
    }

    /**
     * @notice Check if wallet is allowed for a specific token
     * @dev This is the main compliance check called by tokens
     * @param token Token contract address
     * @param wallet Wallet to check
     * @return bool True if allowed
     */
    function isAllowed(address token, address wallet) public view returns (bool) {
        TokenPolicy storage policy = _tokenPolicies[token];

        // No policy = allow (or use default behavior)
        if (!policy.isActive) return true;

        IdentityClaims storage claims = _claims[wallet];

        // Check frozen and expiry
        if (claims.isFrozen) return false;
        if (claims.claimsExpiry != 0 && claims.claimsExpiry < block.timestamp) return false;
        if (_blockedJurisdictions[claims.jurisdiction]) return false;

        // Check base required claims
        if ((claims.claimsMask & policy.requiredMask) != policy.requiredMask) return false;

        // Check jurisdiction requirement
        if (policy.requiredJurisdiction != bytes2(0)) {
            if (claims.jurisdiction == policy.requiredJurisdiction) {
                // Jurisdiction matches - allowed
                return true;
            } else if (policy.allowForeignAccredited) {
                // Foreign but accredited allowed - check accredited claim
                return (claims.claimsMask & CLAIM_ACCREDITED) == CLAIM_ACCREDITED;
            } else {
                // Jurisdiction doesn't match and no foreign exception
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Check if transfer is compliant for a token
     * @param token Token contract address
     * @param from Sender
     * @param to Receiver
     * @return bool True if transfer is compliant
     */
    function canTransfer(address token, address from, address to) external view returns (bool) {
        return isAllowed(token, from) && isAllowed(token, to);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get claims for a wallet
     * @param wallet Wallet to query
     * @return claims The identity claims
     */
    function getClaims(address wallet) external view returns (IdentityClaims memory) {
        return _claims[wallet];
    }

    /**
     * @notice Get claims mask for a wallet
     * @param wallet Wallet to query
     * @return uint256 The claims bitmask
     */
    function getClaimsMask(address wallet) external view returns (uint256) {
        return _claims[wallet].claimsMask;
    }

    /**
     * @notice Get jurisdiction for a wallet
     * @param wallet Wallet to query
     * @return bytes2 The jurisdiction code
     */
    function getJurisdiction(address wallet) external view returns (bytes2) {
        return _claims[wallet].jurisdiction;
    }

    /**
     * @notice Check if wallet is frozen
     * @param wallet Wallet to check
     * @return bool True if frozen
     */
    function isFrozen(address wallet) external view returns (bool) {
        return _claims[wallet].isFrozen;
    }

    /**
     * @notice Get token policy
     * @param token Token contract address
     * @return policy The token policy
     */
    function getTokenPolicy(address token) external view returns (TokenPolicy memory) {
        return _tokenPolicies[token];
    }

    /**
     * @notice Check if jurisdiction is blocked
     * @param jurisdiction Jurisdiction to check
     * @return bool True if blocked
     */
    function isJurisdictionBlocked(bytes2 jurisdiction) external view returns (bool) {
        return _blockedJurisdictions[jurisdiction];
    }

    /**
     * @notice Check if claims are expired
     * @param wallet Wallet to check
     * @return bool True if expired
     */
    function isExpired(address wallet) external view returns (bool) {
        uint64 expiry = _claims[wallet].claimsExpiry;
        return expiry != 0 && expiry < block.timestamp;
    }

    // ============================================================================
    // PAUSE
    // ============================================================================

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
