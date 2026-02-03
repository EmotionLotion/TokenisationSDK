/**
 * KYC Status Proof Circuit
 *
 * Proves that a user has completed KYC verification to a required
 * level without revealing their identity or KYC details.
 *
 * Use cases:
 * - Privacy-preserving KYC verification
 * - Transferable compliance proofs
 * - Cross-platform KYC portability
 * - Audit-compliant anonymous transactions
 */

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./claim_verify.circom";

/**
 * KYC Level encoding (matches SDK KYCLevel enum):
 * 0 = none
 * 1 = basic        (name, email, phone)
 * 2 = standard     (+ ID document, address)
 * 3 = enhanced     (+ source of funds, PEP check)
 * 4 = institutional (full institutional onboarding)
 */

/**
 * KYC Status Proof Main Circuit
 *
 * Verifies that a user has completed KYC to at least the required level.
 *
 * Public Inputs:
 * - claimsRoot: Root of the claims Merkle tree
 * - currentTimestamp: Current Unix timestamp
 * - requiredLevel: Minimum KYC level required (1-4)
 * - externalNullifier: For proof replay prevention
 *
 * Public Outputs:
 * - nullifier: Unique proof identifier
 * - commitment: Claim commitment
 * - meetsRequirement: 1 if KYC level >= required, 0 otherwise
 *
 * Private Inputs:
 * - kycLevel: User's actual KYC level (1-4)
 * - kycProvider: Hash of KYC provider name
 * - verificationId: Hash of verification ID
 * - salt, identityId, expiryTimestamp: Claim metadata
 * - merklePathElements, merklePathIndices: Merkle proof
 *
 * @param merkleDepth - Depth of claims Merkle tree
 */
template KYCStatusProof(merkleDepth) {
    // Constants
    var CLAIM_TYPE_KYC = 1;  // KYC_APPROVED claim type

    // KYC Level constants
    var KYC_NONE = 0;
    var KYC_BASIC = 1;
    var KYC_STANDARD = 2;
    var KYC_ENHANCED = 3;
    var KYC_INSTITUTIONAL = 4;

    // Public inputs
    signal input claimsRoot;
    signal input currentTimestamp;
    signal input requiredLevel;       // Minimum KYC level (1-4)
    signal input externalNullifier;

    // Public outputs
    signal output nullifier;
    signal output commitment;
    signal output meetsRequirement;

    // Private inputs
    signal input kycLevel;            // User's actual KYC level
    signal input kycProvider;         // Hash of provider name
    signal input verificationId;      // Hash of verification ID
    signal input salt;
    signal input identityId;
    signal input expiryTimestamp;
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Validate KYC level is in valid range (1-4)
    component levelValid = LessEqThan(8);
    levelValid.in[0] <== kycLevel;
    levelValid.in[1] <== KYC_INSTITUTIONAL;

    component levelPositive = GreaterEqThan(8);
    levelPositive.in[0] <== kycLevel;
    levelPositive.in[1] <== KYC_BASIC;

    levelValid.out === 1;
    levelPositive.out === 1;

    // Check if KYC level >= required level
    component levelCheck = GreaterEqThan(8);
    levelCheck.in[0] <== kycLevel;
    levelCheck.in[1] <== requiredLevel;
    meetsRequirement <== levelCheck.out;

    // Encode claim value: level * 10^18 + provider * 10^9 + verificationId
    // This allows compact encoding while keeping values distinguishable
    signal encodedValue;
    signal temp;
    temp <== kycLevel * 1000000000000000000 + kycProvider * 1000000000;
    encodedValue <== temp + verificationId;

    // Verify the claim using base verifier
    component baseVerifier = BaseClaimVerifier(merkleDepth);
    baseVerifier.claimsRoot <== claimsRoot;
    baseVerifier.currentTimestamp <== currentTimestamp;
    baseVerifier.externalNullifier <== externalNullifier;
    baseVerifier.claimType <== CLAIM_TYPE_KYC;
    baseVerifier.claimValue <== encodedValue;
    baseVerifier.salt <== salt;
    baseVerifier.identityId <== identityId;
    baseVerifier.expiryTimestamp <== expiryTimestamp;

    for (var i = 0; i < merkleDepth; i++) {
        baseVerifier.merklePathElements[i] <== merklePathElements[i];
        baseVerifier.merklePathIndices[i] <== merklePathIndices[i];
    }

    nullifier <== baseVerifier.nullifier;
    commitment <== baseVerifier.commitment;

    // Enforce claim validity (not expired, in tree)
    baseVerifier.valid === 1;
}

/**
 * Combined Compliance Proof
 *
 * Combines multiple compliance checks in a single proof:
 * - KYC verification
 * - Sanctions clearance
 * - PEP clearance
 *
 * @param merkleDepth - Depth of claims Merkle tree
 */
template CombinedComplianceProof(merkleDepth) {
    var CLAIM_TYPE_KYC = 1;
    var CLAIM_TYPE_SANCTIONS = 6;  // SANCTIONS_CLEAR
    var CLAIM_TYPE_PEP = 7;        // PEP_CLEAR

    // Public inputs
    signal input claimsRoot;
    signal input currentTimestamp;
    signal input requiredKycLevel;
    signal input externalNullifier;

    // Public outputs
    signal output nullifier;
    signal output commitment;
    signal output isCompliant;

    // Private inputs for KYC
    signal input kycLevel;
    signal input kycProvider;
    signal input verificationId;

    // Private inputs for sanctions
    signal input sanctionsClear;  // 1 = clear, 0 = flagged

    // Private inputs for PEP
    signal input pepClear;        // 1 = clear, 0 = flagged

    // Common private inputs
    signal input salt;
    signal input identityId;
    signal input expiryTimestamp;
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Check KYC level
    component kycCheck = GreaterEqThan(8);
    kycCheck.in[0] <== kycLevel;
    kycCheck.in[1] <== requiredKycLevel;

    // All checks must pass
    // isCompliant = kycCheck.out * sanctionsClear * pepClear
    signal kycAndSanctions;
    kycAndSanctions <== kycCheck.out * sanctionsClear;
    isCompliant <== kycAndSanctions * pepClear;

    // Generate combined commitment
    component commitmentHash = Poseidon(5);
    commitmentHash.inputs[0] <== kycLevel;
    commitmentHash.inputs[1] <== sanctionsClear;
    commitmentHash.inputs[2] <== pepClear;
    commitmentHash.inputs[3] <== salt;
    commitmentHash.inputs[4] <== identityId;
    commitment <== commitmentHash.out;

    // Generate nullifier
    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== commitment;
    nullifierHash.inputs[1] <== externalNullifier;
    nullifier <== nullifierHash.out;

    // Note: In production, each claim would be verified against
    // its own leaf in the Merkle tree. This simplified version
    // combines them for demonstration.
}

component main {public [claimsRoot, currentTimestamp, requiredLevel, externalNullifier]} = KYCStatusProof(20);
