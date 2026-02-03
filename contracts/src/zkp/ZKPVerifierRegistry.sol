// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title IVerifier
 * @notice Interface for ZK proof verifiers
 */
interface IVerifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external view returns (bool);
}

/**
 * @title ZKPVerifierRegistry
 * @notice Central registry for managing ZK proof verifiers
 *
 * This contract manages:
 * - Registration of verifier contracts for different proof types
 * - Proof verification through registered verifiers
 * - Nullifier tracking to prevent proof replay
 * - Proof caching for gas optimization
 *
 * @dev Each proof type (age, accreditation, jurisdiction, kyc) has its own
 * verifier contract generated from circom circuits.
 */
contract ZKPVerifierRegistry is Ownable, Pausable {
    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @notice Mapping of proof type to verifier contract
    mapping(bytes32 => IVerifier) public verifiers;

    /// @notice Mapping of proof type to whether it's enabled
    mapping(bytes32 => bool) public verifierEnabled;

    /// @notice Mapping of nullifier to whether it has been used
    mapping(bytes32 => bool) public nullifierUsed;

    /// @notice Mapping of nullifier to verification timestamp
    mapping(bytes32 => uint256) public nullifierTimestamp;

    /// @notice Mapping of commitment to cached proof data
    mapping(bytes32 => ProofCache) public proofCache;

    /// @notice List of registered proof types
    bytes32[] public proofTypes;

    // ============================================================================
    // STRUCTS
    // ============================================================================

    struct ProofCache {
        bytes32 proofType;
        bytes32 commitment;
        bool result;
        uint256 verifiedAt;
        uint256 expiresAt;
    }

    struct VerifierInfo {
        bytes32 proofType;
        address verifierAddress;
        bool enabled;
        uint256 registeredAt;
    }

    // ============================================================================
    // EVENTS
    // ============================================================================

    event VerifierRegistered(bytes32 indexed proofType, address verifier);
    event VerifierRemoved(bytes32 indexed proofType);
    event VerifierEnabled(bytes32 indexed proofType, bool enabled);
    event ProofVerified(
        bytes32 indexed proofType,
        bytes32 indexed nullifier,
        bytes32 commitment,
        bool result
    );
    event ProofCached(
        bytes32 indexed commitment,
        bytes32 proofType,
        uint256 expiresAt
    );
    event NullifierUsed(bytes32 indexed nullifier, bytes32 indexed proofType);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error VerifierNotRegistered(bytes32 proofType);
    error VerifierNotEnabled(bytes32 proofType);
    error VerifierAlreadyRegistered(bytes32 proofType);
    error NullifierAlreadyUsed(bytes32 nullifier);
    error InvalidVerifierAddress();
    error ProofVerificationFailed();
    error CacheExpired();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    constructor() Ownable(msg.sender) {}

    // ============================================================================
    // VERIFIER MANAGEMENT
    // ============================================================================

    /**
     * @notice Register a new verifier for a proof type
     * @param proofType The type of proof (e.g., "AGE_PROOF", "ACCREDITATION")
     * @param verifier Address of the verifier contract
     */
    function registerVerifier(
        bytes32 proofType,
        address verifier
    ) external onlyOwner {
        if (verifier == address(0)) revert InvalidVerifierAddress();
        if (address(verifiers[proofType]) != address(0)) {
            revert VerifierAlreadyRegistered(proofType);
        }

        verifiers[proofType] = IVerifier(verifier);
        verifierEnabled[proofType] = true;
        proofTypes.push(proofType);

        emit VerifierRegistered(proofType, verifier);
    }

    /**
     * @notice Update a verifier contract
     * @param proofType The proof type to update
     * @param newVerifier Address of the new verifier contract
     */
    function updateVerifier(
        bytes32 proofType,
        address newVerifier
    ) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidVerifierAddress();
        if (address(verifiers[proofType]) == address(0)) {
            revert VerifierNotRegistered(proofType);
        }

        verifiers[proofType] = IVerifier(newVerifier);

        emit VerifierRegistered(proofType, newVerifier);
    }

    /**
     * @notice Remove a verifier
     * @param proofType The proof type to remove
     */
    function removeVerifier(bytes32 proofType) external onlyOwner {
        if (address(verifiers[proofType]) == address(0)) {
            revert VerifierNotRegistered(proofType);
        }

        delete verifiers[proofType];
        delete verifierEnabled[proofType];

        emit VerifierRemoved(proofType);
    }

    /**
     * @notice Enable or disable a verifier
     * @param proofType The proof type
     * @param enabled Whether to enable or disable
     */
    function setVerifierEnabled(
        bytes32 proofType,
        bool enabled
    ) external onlyOwner {
        if (address(verifiers[proofType]) == address(0)) {
            revert VerifierNotRegistered(proofType);
        }

        verifierEnabled[proofType] = enabled;

        emit VerifierEnabled(proofType, enabled);
    }

    // ============================================================================
    // PROOF VERIFICATION
    // ============================================================================

    /**
     * @notice Verify a ZK proof
     * @param proofType Type of proof being verified
     * @param pA First proof component
     * @param pB Second proof component
     * @param pC Third proof component
     * @param pubSignals Public signals (includes nullifier and commitment)
     * @return result Whether the proof is valid
     */
    function verifyProof(
        bytes32 proofType,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[] calldata pubSignals
    ) external whenNotPaused returns (bool result) {
        // Check verifier exists and is enabled
        IVerifier verifier = verifiers[proofType];
        if (address(verifier) == address(0)) {
            revert VerifierNotRegistered(proofType);
        }
        if (!verifierEnabled[proofType]) {
            revert VerifierNotEnabled(proofType);
        }

        // Extract nullifier and commitment from public signals
        // Convention: pubSignals[0] = nullifier, pubSignals[1] = commitment
        bytes32 nullifier = bytes32(pubSignals[0]);
        bytes32 commitment = bytes32(pubSignals[1]);

        // Check nullifier hasn't been used
        if (nullifierUsed[nullifier]) {
            revert NullifierAlreadyUsed(nullifier);
        }

        // Verify the proof
        result = verifier.verifyProof(pA, pB, pC, pubSignals);

        if (result) {
            // Mark nullifier as used
            nullifierUsed[nullifier] = true;
            nullifierTimestamp[nullifier] = block.timestamp;

            emit NullifierUsed(nullifier, proofType);
        }

        emit ProofVerified(proofType, nullifier, commitment, result);

        return result;
    }

    /**
     * @notice Verify and cache a proof result
     * @param proofType Type of proof
     * @param pA First proof component
     * @param pB Second proof component
     * @param pC Third proof component
     * @param pubSignals Public signals
     * @param cacheDuration How long to cache the result (seconds)
     */
    function verifyAndCache(
        bytes32 proofType,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[] calldata pubSignals,
        uint256 cacheDuration
    ) external whenNotPaused returns (bool result) {
        result = this.verifyProof(proofType, pA, pB, pC, pubSignals);

        if (result && cacheDuration > 0) {
            bytes32 commitment = bytes32(pubSignals[1]);
            uint256 expiresAt = block.timestamp + cacheDuration;

            proofCache[commitment] = ProofCache({
                proofType: proofType,
                commitment: commitment,
                result: true,
                verifiedAt: block.timestamp,
                expiresAt: expiresAt
            });

            emit ProofCached(commitment, proofType, expiresAt);
        }

        return result;
    }

    /**
     * @notice Check if a cached proof is valid
     * @param commitment The commitment to check
     * @return valid Whether the cached proof is still valid
     */
    function isCacheValid(bytes32 commitment) external view returns (bool valid) {
        ProofCache memory cache = proofCache[commitment];
        return cache.result && block.timestamp < cache.expiresAt;
    }

    /**
     * @notice Check if a nullifier has been used
     * @param nullifier The nullifier to check
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return nullifierUsed[nullifier];
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Get verifier info for a proof type
     * @param proofType The proof type
     */
    function getVerifierInfo(
        bytes32 proofType
    ) external view returns (VerifierInfo memory) {
        return VerifierInfo({
            proofType: proofType,
            verifierAddress: address(verifiers[proofType]),
            enabled: verifierEnabled[proofType],
            registeredAt: 0 // Would need separate tracking for this
        });
    }

    /**
     * @notice Get all registered proof types
     */
    function getProofTypes() external view returns (bytes32[] memory) {
        return proofTypes;
    }

    /**
     * @notice Get cached proof data
     * @param commitment The commitment to look up
     */
    function getCachedProof(
        bytes32 commitment
    ) external view returns (ProofCache memory) {
        return proofCache[commitment];
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Pause the registry
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the registry
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Clear expired cache entries (gas optimization)
     * @param commitments Array of commitments to clear
     */
    function clearExpiredCache(bytes32[] calldata commitments) external {
        for (uint256 i = 0; i < commitments.length; i++) {
            if (block.timestamp >= proofCache[commitments[i]].expiresAt) {
                delete proofCache[commitments[i]];
            }
        }
    }
}
