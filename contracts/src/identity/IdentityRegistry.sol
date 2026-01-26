// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IIdentityRegistry.sol";

/**
 * @title IdentityRegistry
 * @dev Implementation of on-chain identity and KYC management
 * @notice Manages user identities, claims, and verification status
 */
contract IdentityRegistry is IIdentityRegistry {
    // ============================================================================
    // STATE
    // ============================================================================

    struct Identity {
        address identityAddress;
        uint16 country;
        bool exists;
    }

    struct Claim {
        uint256 topic;
        address issuer;
        bytes signature;
        bytes data;
        string uri;
        uint256 issuedAt;
        uint256 expiresAt;
        bool valid;
    }

    struct Verifier {
        bool active;
        mapping(uint256 => bool) allowedTopics;
    }

    // User address => Identity
    mapping(address => Identity) private _identities;

    // Claim ID => Claim
    mapping(bytes32 => Claim) private _claims;

    // User address => Claim topic => Claim IDs
    mapping(address => mapping(uint256 => bytes32[])) private _userClaims;

    // Verifier address => Verifier info
    mapping(address => Verifier) private _verifiers;

    // Admin and roles
    address public admin;
    mapping(address => bool) public operators;

    // ============================================================================
    // MODIFIERS
    // ============================================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "IdentityRegistry: not admin");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == admin || operators[msg.sender], "IdentityRegistry: not operator");
        _;
    }

    modifier onlyVerifier(uint256 claimTopic) {
        require(_verifiers[msg.sender].active && _verifiers[msg.sender].allowedTopics[claimTopic], "Not authorized verifier");
        _;
    }

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor() {
        admin = msg.sender;
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    function setOperator(address operator, bool status) external onlyAdmin {
        operators[operator] = status;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin address");
        admin = newAdmin;
    }

    // ============================================================================
    // IDENTITY MANAGEMENT
    // ============================================================================

    function registerIdentity(address userAddress, address identity, uint16 country) external override onlyOperator {
        require(userAddress != address(0), "Invalid user address");
        require(!_identities[userAddress].exists, "Identity already registered");

        _identities[userAddress] = Identity({identityAddress: identity, country: country, exists: true});

        emit IdentityRegistered(userAddress, identity);
        emit CountryUpdated(userAddress, country);
    }

    function updateIdentity(address userAddress, address identity) external override onlyOperator {
        require(_identities[userAddress].exists, "Identity not registered");

        address oldIdentity = _identities[userAddress].identityAddress;
        _identities[userAddress].identityAddress = identity;

        emit IdentityUpdated(oldIdentity, identity);
    }

    function updateCountry(address userAddress, uint16 country) external override onlyOperator {
        require(_identities[userAddress].exists, "Identity not registered");

        _identities[userAddress].country = country;

        emit CountryUpdated(userAddress, country);
    }

    function removeIdentity(address userAddress) external override onlyOperator {
        require(_identities[userAddress].exists, "Identity not registered");

        address identity = _identities[userAddress].identityAddress;
        delete _identities[userAddress];

        emit IdentityRemoved(userAddress, identity);
    }

    // ============================================================================
    // CLAIM MANAGEMENT
    // ============================================================================

    function addClaim(
        address userAddress,
        uint256 claimTopic,
        address issuer,
        bytes memory signature,
        bytes memory data,
        string memory uri
    ) external override onlyVerifier(claimTopic) returns (bytes32 claimId) {
        require(_identities[userAddress].exists, "Identity not registered");

        claimId = keccak256(abi.encodePacked(userAddress, claimTopic, issuer, block.timestamp));

        _claims[claimId] = Claim({
            topic: claimTopic,
            issuer: issuer,
            signature: signature,
            data: data,
            uri: uri,
            issuedAt: block.timestamp,
            expiresAt: 0, // No expiry by default
            valid: true
        });

        _userClaims[userAddress][claimTopic].push(claimId);

        emit ClaimAdded(userAddress, claimTopic, claimId);
    }

    function addClaimWithExpiry(
        address userAddress,
        uint256 claimTopic,
        address issuer,
        bytes memory signature,
        bytes memory data,
        string memory uri,
        uint256 expiresAt
    ) external onlyVerifier(claimTopic) returns (bytes32 claimId) {
        require(_identities[userAddress].exists, "Identity not registered");
        require(expiresAt > block.timestamp, "Invalid expiry");

        claimId = keccak256(abi.encodePacked(userAddress, claimTopic, issuer, block.timestamp));

        _claims[claimId] = Claim({
            topic: claimTopic,
            issuer: issuer,
            signature: signature,
            data: data,
            uri: uri,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            valid: true
        });

        _userClaims[userAddress][claimTopic].push(claimId);

        emit ClaimAdded(userAddress, claimTopic, claimId);
    }

    function removeClaim(address userAddress, bytes32 claimId) external override {
        Claim storage claim = _claims[claimId];
        require(claim.valid, "Claim not found or invalid");
        require(
            msg.sender == claim.issuer || msg.sender == admin || operators[msg.sender],
            "Not authorized to remove claim"
        );

        claim.valid = false;

        emit ClaimRemoved(userAddress, claim.topic, claimId);
    }

    // ============================================================================
    // VERIFIER MANAGEMENT
    // ============================================================================

    function addVerifier(address verifier, uint256[] memory claimTopics) external override onlyAdmin {
        require(verifier != address(0), "Invalid verifier address");

        _verifiers[verifier].active = true;
        for (uint256 i = 0; i < claimTopics.length; i++) {
            _verifiers[verifier].allowedTopics[claimTopics[i]] = true;
        }

        emit VerifierAdded(verifier, claimTopics);
    }

    function removeVerifier(address verifier) external override onlyAdmin {
        _verifiers[verifier].active = false;

        emit VerifierRemoved(verifier);
    }

    function updateVerifierTopics(address verifier, uint256[] memory claimTopics, bool allowed) external onlyAdmin {
        require(_verifiers[verifier].active, "Verifier not active");

        for (uint256 i = 0; i < claimTopics.length; i++) {
            _verifiers[verifier].allowedTopics[claimTopics[i]] = allowed;
        }
    }

    function isVerifier(address verifier, uint256 claimTopic) external view override returns (bool) {
        return _verifiers[verifier].active && _verifiers[verifier].allowedTopics[claimTopic];
    }

    // ============================================================================
    // QUERY FUNCTIONS
    // ============================================================================

    function getIdentity(address userAddress) external view override returns (address) {
        return _identities[userAddress].identityAddress;
    }

    function getCountry(address userAddress) external view override returns (uint16) {
        return _identities[userAddress].country;
    }

    function hasIdentity(address userAddress) external view override returns (bool) {
        return _identities[userAddress].exists;
    }

    function hasClaim(address userAddress, uint256 claimTopic) external view override returns (bool) {
        bytes32[] storage claimIds = _userClaims[userAddress][claimTopic];

        for (uint256 i = 0; i < claimIds.length; i++) {
            Claim storage claim = _claims[claimIds[i]];
            if (claim.valid) {
                // Check if expired
                if (claim.expiresAt == 0 || claim.expiresAt > block.timestamp) {
                    return true;
                }
            }
        }

        return false;
    }

    function getClaim(bytes32 claimId)
        external
        view
        override
        returns (
            uint256 topic,
            address issuer,
            bytes memory signature,
            bytes memory data,
            string memory uri,
            uint256 issuedAt,
            uint256 expiresAt
        )
    {
        Claim storage claim = _claims[claimId];
        require(claim.valid, "Claim not found or invalid");

        return (claim.topic, claim.issuer, claim.signature, claim.data, claim.uri, claim.issuedAt, claim.expiresAt);
    }

    function isVerified(address userAddress, uint256[] memory requiredClaims) external view override returns (bool) {
        if (!_identities[userAddress].exists) {
            return false;
        }

        for (uint256 i = 0; i < requiredClaims.length; i++) {
            if (!this.hasClaim(userAddress, requiredClaims[i])) {
                return false;
            }
        }

        return true;
    }

    function getClaimIds(address userAddress, uint256 claimTopic) external view returns (bytes32[] memory) {
        return _userClaims[userAddress][claimTopic];
    }

    // ============================================================================
    // BATCH OPERATIONS
    // ============================================================================

    function batchRegisterIdentities(
        address[] memory userAddresses,
        address[] memory identities,
        uint16[] memory countries
    ) external onlyOperator {
        require(
            userAddresses.length == identities.length && identities.length == countries.length, "Array length mismatch"
        );

        for (uint256 i = 0; i < userAddresses.length; i++) {
            if (!_identities[userAddresses[i]].exists) {
                _identities[userAddresses[i]] =
                    Identity({identityAddress: identities[i], country: countries[i], exists: true});

                emit IdentityRegistered(userAddresses[i], identities[i]);
                emit CountryUpdated(userAddresses[i], countries[i]);
            }
        }
    }
}
