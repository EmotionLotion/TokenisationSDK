// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IdentityRegistry
 * @notice Manages identity verification for RWA token holders
 * @dev Maps wallet addresses to KYC verification hashes and status
 *
 * Reference: ERC-3643 T-REX Identity Registry
 */
contract IdentityRegistry is AccessControl, Pausable {
    // ============================================================================
    // ROLES
    // ============================================================================

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant AGENT_ROLE = keccak256("AGENT_ROLE");

    // ============================================================================
    // STRUCTS
    // ============================================================================

    /**
     * @notice Identity information for a wallet
     */
    struct Identity {
        bytes32 kycHash;           // Hash of KYC documents
        uint16 countryCode;        // ISO 3166-1 numeric country code
        uint64 verifiedAt;         // Timestamp of verification
        uint64 expiresAt;          // Expiration timestamp (0 = never)
        bool isVerified;           // Current verification status
        bool isFrozen;             // Whether account is frozen
        uint8 investorType;        // 0=retail, 1=accredited, 2=institutional
    }

    // ============================================================================
    // STATE
    // ============================================================================

    /// @notice Mapping of wallet address to identity
    mapping(address => Identity) private _identities;

    /// @notice Mapping of address to trusted claim issuers
    mapping(address => bool) private _trustedIssuers;

    /// @notice Country blacklist (country code => blocked)
    mapping(uint16 => bool) private _blockedCountries;

    /// @notice Total verified identities count
    uint256 private _verifiedCount;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event IdentityRegistered(
        address indexed wallet,
        bytes32 kycHash,
        uint16 countryCode,
        uint8 investorType
    );

    event IdentityUpdated(
        address indexed wallet,
        bytes32 oldKycHash,
        bytes32 newKycHash
    );

    event IdentityRevoked(address indexed wallet, string reason);

    event AccountFrozen(address indexed wallet, string reason);
    event AccountUnfrozen(address indexed wallet);

    event CountryBlocked(uint16 indexed countryCode);
    event CountryUnblocked(uint16 indexed countryCode);

    event TrustedIssuerAdded(address indexed issuer);
    event TrustedIssuerRemoved(address indexed issuer);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error IdentityNotFound(address wallet);
    error IdentityAlreadyExists(address wallet);
    error IdentityExpired(address wallet);
    error AccountIsFrozen(address wallet);
    error CountryBlocked(uint16 countryCode);
    error InvalidKycHash();
    error InvalidCountryCode();
    error NotTrustedIssuer(address issuer);

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
        _grantRole(AGENT_ROLE, admin);
    }

    // ============================================================================
    // IDENTITY MANAGEMENT
    // ============================================================================

    /**
     * @notice Register a new identity
     * @param wallet The wallet address to register
     * @param kycHash Hash of KYC verification documents
     * @param countryCode ISO 3166-1 numeric country code
     * @param investorType Type of investor (0=retail, 1=accredited, 2=institutional)
     * @param expiresAt Expiration timestamp (0 = never)
     */
    function registerIdentity(
        address wallet,
        bytes32 kycHash,
        uint16 countryCode,
        uint8 investorType,
        uint64 expiresAt
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        if (kycHash == bytes32(0)) revert InvalidKycHash();
        if (countryCode == 0) revert InvalidCountryCode();
        if (_blockedCountries[countryCode]) revert CountryBlocked(countryCode);
        if (_identities[wallet].isVerified) revert IdentityAlreadyExists(wallet);

        _identities[wallet] = Identity({
            kycHash: kycHash,
            countryCode: countryCode,
            verifiedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            isVerified: true,
            isFrozen: false,
            investorType: investorType
        });

        _verifiedCount++;

        emit IdentityRegistered(wallet, kycHash, countryCode, investorType);
    }

    /**
     * @notice Update an existing identity
     * @param wallet The wallet address to update
     * @param kycHash New KYC hash
     * @param countryCode New country code
     * @param investorType New investor type
     * @param expiresAt New expiration timestamp
     */
    function updateIdentity(
        address wallet,
        bytes32 kycHash,
        uint16 countryCode,
        uint8 investorType,
        uint64 expiresAt
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        Identity storage identity = _identities[wallet];
        if (!identity.isVerified) revert IdentityNotFound(wallet);
        if (kycHash == bytes32(0)) revert InvalidKycHash();
        if (_blockedCountries[countryCode]) revert CountryBlocked(countryCode);

        bytes32 oldKycHash = identity.kycHash;

        identity.kycHash = kycHash;
        identity.countryCode = countryCode;
        identity.investorType = investorType;
        identity.expiresAt = expiresAt;
        identity.verifiedAt = uint64(block.timestamp);

        emit IdentityUpdated(wallet, oldKycHash, kycHash);
    }

    /**
     * @notice Revoke an identity
     * @param wallet The wallet address to revoke
     * @param reason Reason for revocation
     */
    function revokeIdentity(
        address wallet,
        string calldata reason
    ) external onlyRole(VERIFIER_ROLE) whenNotPaused {
        Identity storage identity = _identities[wallet];
        if (!identity.isVerified) revert IdentityNotFound(wallet);

        identity.isVerified = false;
        _verifiedCount--;

        emit IdentityRevoked(wallet, reason);
    }

    // ============================================================================
    // FREEZE MANAGEMENT
    // ============================================================================

    /**
     * @notice Freeze an account
     * @param wallet The wallet to freeze
     * @param reason Reason for freezing
     */
    function freezeAccount(
        address wallet,
        string calldata reason
    ) external onlyRole(AGENT_ROLE) {
        _identities[wallet].isFrozen = true;
        emit AccountFrozen(wallet, reason);
    }

    /**
     * @notice Unfreeze an account
     * @param wallet The wallet to unfreeze
     */
    function unfreezeAccount(address wallet) external onlyRole(AGENT_ROLE) {
        _identities[wallet].isFrozen = false;
        emit AccountUnfrozen(wallet);
    }

    // ============================================================================
    // COUNTRY MANAGEMENT
    // ============================================================================

    /**
     * @notice Block a country
     * @param countryCode ISO 3166-1 numeric country code
     */
    function blockCountry(uint16 countryCode) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _blockedCountries[countryCode] = true;
        emit CountryBlocked(countryCode);
    }

    /**
     * @notice Unblock a country
     * @param countryCode ISO 3166-1 numeric country code
     */
    function unblockCountry(uint16 countryCode) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _blockedCountries[countryCode] = false;
        emit CountryUnblocked(countryCode);
    }

    // ============================================================================
    // TRUSTED ISSUER MANAGEMENT
    // ============================================================================

    /**
     * @notice Add a trusted claim issuer
     * @param issuer Address of the issuer
     */
    function addTrustedIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _trustedIssuers[issuer] = true;
        emit TrustedIssuerAdded(issuer);
    }

    /**
     * @notice Remove a trusted claim issuer
     * @param issuer Address of the issuer
     */
    function removeTrustedIssuer(address issuer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _trustedIssuers[issuer] = false;
        emit TrustedIssuerRemoved(issuer);
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Check if an address is verified
     * @param wallet Address to check
     * @return bool True if verified and not expired
     */
    function isVerified(address wallet) external view returns (bool) {
        Identity storage identity = _identities[wallet];
        if (!identity.isVerified) return false;
        if (identity.isFrozen) return false;
        if (identity.expiresAt != 0 && identity.expiresAt < block.timestamp) return false;
        if (_blockedCountries[identity.countryCode]) return false;
        return true;
    }

    /**
     * @notice Check if an address is frozen
     * @param wallet Address to check
     * @return bool True if frozen
     */
    function isFrozen(address wallet) external view returns (bool) {
        return _identities[wallet].isFrozen;
    }

    /**
     * @notice Get identity details
     * @param wallet Address to query
     * @return identity The identity struct
     */
    function getIdentity(address wallet) external view returns (Identity memory) {
        return _identities[wallet];
    }

    /**
     * @notice Get KYC hash for an address
     * @param wallet Address to query
     * @return bytes32 The KYC hash
     */
    function getKycHash(address wallet) external view returns (bytes32) {
        return _identities[wallet].kycHash;
    }

    /**
     * @notice Get country code for an address
     * @param wallet Address to query
     * @return uint16 The country code
     */
    function getCountryCode(address wallet) external view returns (uint16) {
        return _identities[wallet].countryCode;
    }

    /**
     * @notice Get investor type for an address
     * @param wallet Address to query
     * @return uint8 The investor type
     */
    function getInvestorType(address wallet) external view returns (uint8) {
        return _identities[wallet].investorType;
    }

    /**
     * @notice Check if country is blocked
     * @param countryCode Country code to check
     * @return bool True if blocked
     */
    function isCountryBlocked(uint16 countryCode) external view returns (bool) {
        return _blockedCountries[countryCode];
    }

    /**
     * @notice Check if issuer is trusted
     * @param issuer Address to check
     * @return bool True if trusted
     */
    function isTrustedIssuer(address issuer) external view returns (bool) {
        return _trustedIssuers[issuer];
    }

    /**
     * @notice Get total verified identities count
     * @return uint256 The count
     */
    function getVerifiedCount() external view returns (uint256) {
        return _verifiedCount;
    }

    // ============================================================================
    // COMPLIANCE CHECK
    // ============================================================================

    /**
     * @notice Check if a transfer is compliant
     * @param from Sender address
     * @param to Receiver address
     * @return bool True if transfer is compliant
     */
    function canTransfer(address from, address to) external view returns (bool) {
        // Check sender
        Identity storage senderIdentity = _identities[from];
        if (!senderIdentity.isVerified) return false;
        if (senderIdentity.isFrozen) return false;
        if (senderIdentity.expiresAt != 0 && senderIdentity.expiresAt < block.timestamp) return false;

        // Check receiver
        Identity storage receiverIdentity = _identities[to];
        if (!receiverIdentity.isVerified) return false;
        if (receiverIdentity.isFrozen) return false;
        if (receiverIdentity.expiresAt != 0 && receiverIdentity.expiresAt < block.timestamp) return false;

        // Check countries
        if (_blockedCountries[senderIdentity.countryCode]) return false;
        if (_blockedCountries[receiverIdentity.countryCode]) return false;

        return true;
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
