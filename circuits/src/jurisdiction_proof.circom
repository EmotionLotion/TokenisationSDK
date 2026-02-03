/**
 * Jurisdiction Proof Circuit
 *
 * Proves that a user's jurisdiction (country of residence/citizenship)
 * is within an allowed set without revealing the specific country.
 *
 * Use cases:
 * - Geographic restrictions (e.g., excluding US persons)
 * - Regional compliance (e.g., EU-only offerings)
 * - OFAC/sanctions compliance
 * - Tax residency verification
 */

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./claim_verify.circom";

/**
 * Set Membership Check
 *
 * Checks if a value is a member of a fixed-size set.
 * Returns 1 if value is in set, 0 otherwise.
 *
 * @param setSize - Size of the allowed set
 */
template SetMembership(setSize) {
    signal input value;
    signal input set[setSize];

    signal output isMember;

    // Check equality with each set element
    component eq[setSize];
    signal matches[setSize];
    signal runningSum[setSize + 1];

    runningSum[0] <== 0;

    for (var i = 0; i < setSize; i++) {
        eq[i] = IsEqual();
        eq[i].in[0] <== value;
        eq[i].in[1] <== set[i];
        matches[i] <== eq[i].out;
        runningSum[i + 1] <== runningSum[i] + matches[i];
    }

    // isMember = 1 if any match found
    component hasMatch = GreaterThan(8);
    hasMatch.in[0] <== runningSum[setSize];
    hasMatch.in[1] <== 0;
    isMember <== hasMatch.out;
}

/**
 * Jurisdiction Proof Main Circuit
 *
 * Verifies jurisdiction membership using ISO 3166-1 numeric codes.
 * The allowed jurisdictions are passed as public input to allow
 * different offerings to have different geographic restrictions.
 *
 * Public Inputs:
 * - claimsRoot: Root of the claims Merkle tree
 * - currentTimestamp: Current Unix timestamp
 * - allowedJurisdictions: Array of allowed ISO country codes (numeric)
 * - externalNullifier: For proof replay prevention
 *
 * Public Outputs:
 * - nullifier: Unique proof identifier
 * - commitment: Claim commitment
 * - isAllowed: 1 if jurisdiction is allowed, 0 otherwise
 *
 * Private Inputs:
 * - jurisdictionCode: User's ISO 3166-1 numeric country code
 * - salt, identityId, expiryTimestamp: Claim metadata
 * - merklePathElements, merklePathIndices: Merkle proof
 *
 * @param merkleDepth - Depth of claims Merkle tree
 * @param maxAllowed - Maximum number of allowed jurisdictions
 */
template JurisdictionProof(merkleDepth, maxAllowed) {
    // Constants
    var CLAIM_TYPE_RESIDENCY = 2;  // RESIDENCY claim type

    // Common ISO 3166-1 numeric codes for reference:
    // US = 840, GB = 826, DE = 276, FR = 250, JP = 392
    // AE = 784, SA = 682, SG = 702, CH = 756, AU = 036

    // Public inputs
    signal input claimsRoot;
    signal input currentTimestamp;
    signal input allowedJurisdictions[maxAllowed];  // ISO numeric codes
    signal input externalNullifier;

    // Public outputs
    signal output nullifier;
    signal output commitment;
    signal output isAllowed;

    // Private inputs
    signal input jurisdictionCode;    // User's ISO numeric country code
    signal input salt;
    signal input identityId;
    signal input expiryTimestamp;
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Check if jurisdiction is in allowed set
    component membershipCheck = SetMembership(maxAllowed);
    membershipCheck.value <== jurisdictionCode;
    for (var i = 0; i < maxAllowed; i++) {
        membershipCheck.set[i] <== allowedJurisdictions[i];
    }
    isAllowed <== membershipCheck.isMember;

    // Verify the claim using base verifier
    component baseVerifier = BaseClaimVerifier(merkleDepth);
    baseVerifier.claimsRoot <== claimsRoot;
    baseVerifier.currentTimestamp <== currentTimestamp;
    baseVerifier.externalNullifier <== externalNullifier;
    baseVerifier.claimType <== CLAIM_TYPE_RESIDENCY;
    baseVerifier.claimValue <== jurisdictionCode;
    baseVerifier.salt <== salt;
    baseVerifier.identityId <== identityId;
    baseVerifier.expiryTimestamp <== expiryTimestamp;

    for (var i = 0; i < merkleDepth; i++) {
        baseVerifier.merklePathElements[i] <== merklePathElements[i];
        baseVerifier.merklePathIndices[i] <== merklePathIndices[i];
    }

    nullifier <== baseVerifier.nullifier;
    commitment <== baseVerifier.commitment;

    // Enforce claim validity
    baseVerifier.valid === 1;

    // Validate jurisdiction code is reasonable (1-999)
    component validCode = LessThan(16);
    validCode.in[0] <== jurisdictionCode;
    validCode.in[1] <== 1000;

    component positiveCode = GreaterThan(16);
    positiveCode.in[0] <== jurisdictionCode;
    positiveCode.in[1] <== 0;

    validCode.out === 1;
    positiveCode.out === 1;
}

/**
 * Exclusion Proof
 *
 * Proves that a user is NOT from a restricted jurisdiction.
 * Useful for OFAC compliance or US person exclusion.
 *
 * @param merkleDepth - Depth of claims Merkle tree
 * @param maxExcluded - Maximum number of excluded jurisdictions
 */
template JurisdictionExclusionProof(merkleDepth, maxExcluded) {
    var CLAIM_TYPE_RESIDENCY = 2;

    // Public inputs
    signal input claimsRoot;
    signal input currentTimestamp;
    signal input excludedJurisdictions[maxExcluded];  // Excluded ISO codes
    signal input externalNullifier;

    // Public outputs
    signal output nullifier;
    signal output commitment;
    signal output notExcluded;

    // Private inputs
    signal input jurisdictionCode;
    signal input salt;
    signal input identityId;
    signal input expiryTimestamp;
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Check if jurisdiction is NOT in excluded set
    component membershipCheck = SetMembership(maxExcluded);
    membershipCheck.value <== jurisdictionCode;
    for (var i = 0; i < maxExcluded; i++) {
        membershipCheck.set[i] <== excludedJurisdictions[i];
    }

    // notExcluded = 1 - isMember (if not a member, not excluded)
    notExcluded <== 1 - membershipCheck.isMember;

    // Verify the claim using base verifier
    component baseVerifier = BaseClaimVerifier(merkleDepth);
    baseVerifier.claimsRoot <== claimsRoot;
    baseVerifier.currentTimestamp <== currentTimestamp;
    baseVerifier.externalNullifier <== externalNullifier;
    baseVerifier.claimType <== CLAIM_TYPE_RESIDENCY;
    baseVerifier.claimValue <== jurisdictionCode;
    baseVerifier.salt <== salt;
    baseVerifier.identityId <== identityId;
    baseVerifier.expiryTimestamp <== expiryTimestamp;

    for (var i = 0; i < merkleDepth; i++) {
        baseVerifier.merklePathElements[i] <== merklePathElements[i];
        baseVerifier.merklePathIndices[i] <== merklePathIndices[i];
    }

    nullifier <== baseVerifier.nullifier;
    commitment <== baseVerifier.commitment;

    baseVerifier.valid === 1;
}

// Default: 20 allowed jurisdictions, 20-level Merkle tree
component main {public [claimsRoot, currentTimestamp, allowedJurisdictions, externalNullifier]} = JurisdictionProof(20, 20);
