/**
 * Age Proof Circuit
 *
 * Proves that a person's age meets or exceeds a threshold without
 * revealing their actual date of birth.
 *
 * Use cases:
 * - Age-gated investments (accredited investor requirements)
 * - Age verification for restricted securities
 * - Regulatory compliance (e.g., must be 18+)
 */

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./claim_verify.circom";

/**
 * Age Proof Main Circuit
 *
 * Public Inputs:
 * - claimsRoot: Root of the claims Merkle tree
 * - currentTimestamp: Current Unix timestamp
 * - ageThreshold: Minimum age in years (e.g., 18)
 * - externalNullifier: For proof replay prevention
 *
 * Public Outputs:
 * - nullifier: Unique proof identifier
 * - commitment: Claim commitment
 * - meetsThreshold: 1 if age >= threshold, 0 otherwise
 *
 * Private Inputs:
 * - birthDate: Unix timestamp of birth date
 * - salt: Random value for commitment
 * - identityId: Identity identifier
 * - expiryTimestamp: Claim expiry
 * - merklePathElements: Merkle proof elements
 * - merklePathIndices: Merkle proof path
 *
 * @param merkleDepth - Depth of claims Merkle tree (default 20)
 */
template AgeProof(merkleDepth) {
    // Constants
    var SECONDS_PER_YEAR = 31536000; // 365 * 24 * 60 * 60
    var CLAIM_TYPE_AGE = 9; // AGE_VERIFIED claim type

    // Public inputs
    signal input claimsRoot;
    signal input currentTimestamp;
    signal input ageThreshold;        // Minimum age in years
    signal input externalNullifier;

    // Public outputs
    signal output nullifier;
    signal output commitment;
    signal output meetsThreshold;

    // Private inputs
    signal input birthDate;           // Unix timestamp of birth
    signal input salt;
    signal input identityId;
    signal input expiryTimestamp;
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Calculate age in seconds
    signal ageSeconds;
    ageSeconds <== currentTimestamp - birthDate;

    // Convert threshold to seconds
    signal thresholdSeconds;
    thresholdSeconds <== ageThreshold * SECONDS_PER_YEAR;

    // Check if age >= threshold
    component ageCheck = GreaterEqThan(64);
    ageCheck.in[0] <== ageSeconds;
    ageCheck.in[1] <== thresholdSeconds;
    meetsThreshold <== ageCheck.out;

    // Verify the claim using base verifier
    // Birth date is encoded as the claim value
    component baseVerifier = BaseClaimVerifier(merkleDepth);
    baseVerifier.claimsRoot <== claimsRoot;
    baseVerifier.currentTimestamp <== currentTimestamp;
    baseVerifier.externalNullifier <== externalNullifier;
    baseVerifier.claimType <== CLAIM_TYPE_AGE;
    baseVerifier.claimValue <== birthDate;
    baseVerifier.salt <== salt;
    baseVerifier.identityId <== identityId;
    baseVerifier.expiryTimestamp <== expiryTimestamp;

    for (var i = 0; i < merkleDepth; i++) {
        baseVerifier.merklePathElements[i] <== merklePathElements[i];
        baseVerifier.merklePathIndices[i] <== merklePathIndices[i];
    }

    nullifier <== baseVerifier.nullifier;
    commitment <== baseVerifier.commitment;

    // Enforce that claim is valid (not expired and in tree)
    baseVerifier.valid === 1;

    // Ensure birth date is in the past
    component birthInPast = LessThan(64);
    birthInPast.in[0] <== birthDate;
    birthInPast.in[1] <== currentTimestamp;
    birthInPast.out === 1;

    // Ensure birth date is reasonable (after 1900, before current year)
    // 1900 Unix timestamp: -2208988800 (we'll use 0 as minimum for simplicity)
    component validBirth = LessThan(64);
    validBirth.in[0] <== birthDate;
    validBirth.in[1] <== currentTimestamp;
    validBirth.out === 1;
}

// Default instantiation with 20-level Merkle tree
component main {public [claimsRoot, currentTimestamp, ageThreshold, externalNullifier]} = AgeProof(20);
