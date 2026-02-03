// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ZKPVerifierRegistry.sol";

/**
 * @title IComplianceModule
 * @notice Interface matching ModularCompliance module interface
 */
interface IComplianceModule {
    function moduleCheck(
        address from,
        address to,
        uint256 value,
        address token
    ) external view returns (bool);

    function moduleMint(address to, uint256 value) external;

    function moduleBurn(address from, uint256 value) external;

    function moduleTransfer(address from, address to, uint256 value) external;

    function name() external view returns (string memory);

    function isPlugAndPlay() external view returns (bool);
}

/**
 * @title ZKPComplianceModule
 * @notice Compliance module that uses ZK proofs for verification
 *
 * This module integrates with ModularCompliance to provide ZK-based
 * compliance checks:
 * - Verifies cached ZK proofs for transfers
 * - Supports multiple proof requirements
 * - Privacy-preserving compliance verification
 *
 * @dev Implements IComplianceModule for integration with ERC-3643 tokens
 */
contract ZKPComplianceModule is IComplianceModule, Ownable {
    // ============================================================================
    // STATE VARIABLES
    // ============================================================================

    /// @notice ZKP Verifier Registry
    ZKPVerifierRegistry public immutable verifierRegistry;

    /// @notice Token address this module is bound to
    address public boundToken;

    /// @notice Required proof types for transfers
    bytes32[] public requiredProofTypes;

    /// @notice Mapping of proof type to whether it's required
    mapping(bytes32 => bool) public isProofRequired;

    /// @notice Mapping of address to their verified commitment
    mapping(address => bytes32) public addressCommitment;

    /// @notice Minimum proof validity period (seconds)
    uint256 public minProofValidity;

    // ============================================================================
    // EVENTS
    // ============================================================================

    event ProofSubmitted(
        address indexed user,
        bytes32 indexed proofType,
        bytes32 commitment
    );
    event ProofRequirementAdded(bytes32 indexed proofType);
    event ProofRequirementRemoved(bytes32 indexed proofType);
    event CommitmentRegistered(address indexed user, bytes32 commitment);

    // ============================================================================
    // ERRORS
    // ============================================================================

    error NotBoundToken();
    error ProofNotVerified();
    error ProofExpired();
    error ProofAlreadyRequired();
    error ProofNotRequired();
    error InvalidCommitment();

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * @param _verifierRegistry Address of the ZKP Verifier Registry
     * @param _minProofValidity Minimum validity period for proofs (seconds)
     */
    constructor(
        address _verifierRegistry,
        uint256 _minProofValidity
    ) Ownable(msg.sender) {
        verifierRegistry = ZKPVerifierRegistry(_verifierRegistry);
        minProofValidity = _minProofValidity;
    }

    // ============================================================================
    // MODULE INTERFACE IMPLEMENTATION
    // ============================================================================

    /**
     * @notice Get module name
     */
    function name() external pure override returns (string memory) {
        return "ZKPComplianceModule";
    }

    /**
     * @notice Whether this module is plug-and-play (no configuration needed)
     */
    function isPlugAndPlay() external pure override returns (bool) {
        return false;
    }

    /**
     * @notice Check if a transfer is compliant
     * @param from Sender address
     * @param to Recipient address
     * @param value Transfer amount
     * @param token Token contract address
     * @return Whether the transfer is compliant
     */
    function moduleCheck(
        address from,
        address to,
        uint256 value,
        address token
    ) external view override returns (bool) {
        // Skip check for minting (from = zero address)
        if (from == address(0)) return true;

        // Skip check for burning (to = zero address)
        if (to == address(0)) return true;

        // Verify both parties have valid proofs for all required types
        return _verifyCompliance(from) && _verifyCompliance(to);
    }

    /**
     * @notice Hook called on mint
     */
    function moduleMint(address to, uint256 value) external override {
        // Verify recipient has valid proofs
        if (!_verifyCompliance(to)) revert ProofNotVerified();
    }

    /**
     * @notice Hook called on burn
     */
    function moduleBurn(address from, uint256 value) external override {
        // No verification needed for burns
    }

    /**
     * @notice Hook called on transfer
     */
    function moduleTransfer(
        address from,
        address to,
        uint256 value
    ) external override {
        // Verification already done in moduleCheck
    }

    // ============================================================================
    // PROOF SUBMISSION
    // ============================================================================

    /**
     * @notice Submit a ZK proof for compliance
     * @param proofType Type of proof being submitted
     * @param pA First proof component
     * @param pB Second proof component
     * @param pC Third proof component
     * @param pubSignals Public signals (nullifier, commitment, result)
     */
    function submitProof(
        bytes32 proofType,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[] calldata pubSignals
    ) external {
        // Verify the proof through registry
        bool result = verifierRegistry.verifyAndCache(
            proofType,
            pA,
            pB,
            pC,
            pubSignals,
            minProofValidity
        );

        if (!result) revert ProofNotVerified();

        // Extract commitment from public signals
        bytes32 commitment = bytes32(pubSignals[1]);

        // Register commitment for sender
        addressCommitment[msg.sender] = commitment;

        emit ProofSubmitted(msg.sender, proofType, commitment);
        emit CommitmentRegistered(msg.sender, commitment);
    }

    /**
     * @notice Register an existing commitment for an address
     * @dev Used when proof was submitted directly to verifier registry
     * @param user Address to register commitment for
     * @param commitment The commitment to register
     */
    function registerCommitment(
        address user,
        bytes32 commitment
    ) external onlyOwner {
        if (commitment == bytes32(0)) revert InvalidCommitment();

        // Verify commitment has valid cached proof
        if (!verifierRegistry.isCacheValid(commitment)) {
            revert ProofExpired();
        }

        addressCommitment[user] = commitment;

        emit CommitmentRegistered(user, commitment);
    }

    // ============================================================================
    // PROOF REQUIREMENTS
    // ============================================================================

    /**
     * @notice Add a required proof type
     * @param proofType The proof type to require
     */
    function addProofRequirement(bytes32 proofType) external onlyOwner {
        if (isProofRequired[proofType]) revert ProofAlreadyRequired();

        isProofRequired[proofType] = true;
        requiredProofTypes.push(proofType);

        emit ProofRequirementAdded(proofType);
    }

    /**
     * @notice Remove a required proof type
     * @param proofType The proof type to remove
     */
    function removeProofRequirement(bytes32 proofType) external onlyOwner {
        if (!isProofRequired[proofType]) revert ProofNotRequired();

        isProofRequired[proofType] = false;

        // Remove from array
        for (uint256 i = 0; i < requiredProofTypes.length; i++) {
            if (requiredProofTypes[i] == proofType) {
                requiredProofTypes[i] = requiredProofTypes[requiredProofTypes.length - 1];
                requiredProofTypes.pop();
                break;
            }
        }

        emit ProofRequirementRemoved(proofType);
    }

    /**
     * @notice Get all required proof types
     */
    function getRequiredProofTypes() external view returns (bytes32[] memory) {
        return requiredProofTypes;
    }

    // ============================================================================
    // INTERNAL FUNCTIONS
    // ============================================================================

    /**
     * @notice Verify an address has valid proofs for all required types
     * @param user Address to verify
     * @return Whether the user has all required valid proofs
     */
    function _verifyCompliance(address user) internal view returns (bool) {
        bytes32 commitment = addressCommitment[user];

        // Must have a registered commitment
        if (commitment == bytes32(0)) return false;

        // Check if cached proof is still valid
        if (!verifierRegistry.isCacheValid(commitment)) return false;

        // Get cached proof info
        ZKPVerifierRegistry.ProofCache memory cache = verifierRegistry.getCachedProof(commitment);

        // Verify it's for a required proof type
        if (!isProofRequired[cache.proofType]) {
            // If no specific requirements, any valid proof passes
            if (requiredProofTypes.length == 0) return true;
            return false;
        }

        return cache.result;
    }

    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================

    /**
     * @notice Check if an address has valid compliance proof
     * @param user Address to check
     */
    function hasValidProof(address user) external view returns (bool) {
        return _verifyCompliance(user);
    }

    /**
     * @notice Get user's registered commitment
     * @param user Address to look up
     */
    function getUserCommitment(address user) external view returns (bytes32) {
        return addressCommitment[user];
    }

    /**
     * @notice Get proof cache info for a user
     * @param user Address to look up
     */
    function getUserProofInfo(
        address user
    ) external view returns (
        bytes32 proofType,
        bytes32 commitment,
        bool result,
        uint256 verifiedAt,
        uint256 expiresAt
    ) {
        bytes32 userCommitment = addressCommitment[user];
        if (userCommitment == bytes32(0)) {
            return (bytes32(0), bytes32(0), false, 0, 0);
        }

        ZKPVerifierRegistry.ProofCache memory cache = verifierRegistry.getCachedProof(userCommitment);
        return (
            cache.proofType,
            cache.commitment,
            cache.result,
            cache.verifiedAt,
            cache.expiresAt
        );
    }

    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================

    /**
     * @notice Update minimum proof validity period
     * @param _minProofValidity New minimum validity (seconds)
     */
    function setMinProofValidity(uint256 _minProofValidity) external onlyOwner {
        minProofValidity = _minProofValidity;
    }

    /**
     * @notice Bind this module to a token
     * @param token Token address
     */
    function bindToken(address token) external onlyOwner {
        boundToken = token;
    }
}
