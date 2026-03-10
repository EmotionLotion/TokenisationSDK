/**
 * Accreditation Proof Circuit
 *
 * Proves that an investor meets accreditation requirements (net worth
 * or income threshold) without revealing exact financial details.
 *
 * Use cases:
 * - SEC Regulation D (accredited investor verification)
 * - MiFID II qualified investor status
 * - VARA qualified investor requirements
 * - Net worth verification for private offerings
 */

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./claim_verify.circom";

/**
 * Accreditation Proof Main Circuit
 *
 * Supports multiple accreditation criteria:
 * - Net worth threshold (excluding primary residence)
 * - Annual income threshold (individual or joint)
 * - Professional credentials (e.g., Series 7, 65, 82)
 *
 * Public Inputs:
 * - claimsRoot: Root of the claims Merkle tree
 * - currentTimestamp: Current Unix timestamp
 * - netWorthThreshold: Minimum net worth in USD cents (0 if not checking)
 * - incomeThreshold: Minimum income in USD cents (0 if not checking)
 * - externalNullifier: For proof replay prevention
 *
 * Public Outputs:
 * - nullifier: Unique proof identifier
 * - commitment: Claim commitment
 * - isAccredited: 1 if meets any threshold, 0 otherwise
 *
 * Private Inputs:
 * - netWorth: Net worth in USD cents
 * - annualIncome: Annual income in USD cents
 * - accreditationMethod: 1=net worth, 2=income, 3=professional
 * - salt, identityId, expiryTimestamp: Claim metadata
 * - merklePathElements, merklePathIndices: Merkle proof
 *
 * @param merkleDepth - Depth of claims Merkle tree
 */
template AccreditationProof(merkleDepth) {
    // Constants - Claim types from Claims.ts
    var CLAIM_TYPE_ACCREDITED = 3;  // ACCREDITED_INVESTOR
    var CLAIM_TYPE_QUALIFIED = 4;   // QUALIFIED_PURCHASER

    // Method constants
    var METHOD_NET_WORTH = 1;
    var METHOD_INCOME = 2;
    var METHOD_PROFESSIONAL = 3;

    // Public inputs
    signal input claimsRoot;
    signal input currentTimestamp;
    signal input netWorthThreshold;   // In USD cents (e.g., 100000000 = $1M)
    signal input incomeThreshold;     // In USD cents (e.g., 20000000 = $200K)
    signal input externalNullifier;

    // Public outputs
    signal output nullifier;
    signal output commitment;
    signal output isAccredited;

    // Private inputs
    signal input netWorth;            // In USD cents
    signal input annualIncome;        // In USD cents
    signal input accreditationMethod; // 1, 2, or 3
    signal input salt;
    signal input identityId;
    signal input expiryTimestamp;
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Validate accreditation method (1, 2, or 3)
    component methodValid = LessEqThan(8);
    methodValid.in[0] <== accreditationMethod;
    methodValid.in[1] <== 3;

    component methodPositive = GreaterEqThan(8);
    methodPositive.in[0] <== accreditationMethod;
    methodPositive.in[1] <== 1;

    methodValid.out * methodPositive.out === 1;

    // Check net worth threshold
    component netWorthCheck = GreaterEqThan(64);
    netWorthCheck.in[0] <== netWorth;
    netWorthCheck.in[1] <== netWorthThreshold;

    // Check income threshold
    component incomeCheck = GreaterEqThan(64);
    incomeCheck.in[0] <== annualIncome;
    incomeCheck.in[1] <== incomeThreshold;

    // Method selection:
    // - If method == 1, use net worth check
    // - If method == 2, use income check
    // - If method == 3, always pass (professional credential)

    signal isMethodNetWorth;
    signal isMethodIncome;
    signal isMethodProfessional;

    component checkMethod1 = IsEqual();
    checkMethod1.in[0] <== accreditationMethod;
    checkMethod1.in[1] <== METHOD_NET_WORTH;
    isMethodNetWorth <== checkMethod1.out;

    component checkMethod2 = IsEqual();
    checkMethod2.in[0] <== accreditationMethod;
    checkMethod2.in[1] <== METHOD_INCOME;
    isMethodIncome <== checkMethod2.out;

    component checkMethod3 = IsEqual();
    checkMethod3.in[0] <== accreditationMethod;
    checkMethod3.in[1] <== METHOD_PROFESSIONAL;
    isMethodProfessional <== checkMethod3.out;

    // Compute accreditation status based on method
    signal netWorthPasses;
    signal incomePasses;
    signal professionalPasses;

    netWorthPasses <== isMethodNetWorth * netWorthCheck.out;
    incomePasses <== isMethodIncome * incomeCheck.out;
    professionalPasses <== isMethodProfessional;  // Always passes if professional

    // Any method passing means accredited
    isAccredited <== netWorthPasses + incomePasses + professionalPasses;

    // For claim verification, encode the method and relevant value
    // claimValue = method * 10^18 + value
    signal encodedValue;
    encodedValue <== accreditationMethod * 1000000000000000000 + netWorth + annualIncome;

    // Verify the claim using base verifier
    component baseVerifier = BaseClaimVerifier(merkleDepth);
    baseVerifier.claimsRoot <== claimsRoot;
    baseVerifier.currentTimestamp <== currentTimestamp;
    baseVerifier.externalNullifier <== externalNullifier;
    baseVerifier.claimType <== CLAIM_TYPE_ACCREDITED;
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

    // Enforce claim validity
    baseVerifier.valid === 1;
}

// Standard SEC Regulation D thresholds:
// - Net worth: $1,000,000 (excluding primary residence)
// - Income: $200,000 individual / $300,000 joint for past 2 years
//
// These are passed as public inputs to allow flexibility.

component main {public [claimsRoot, currentTimestamp, netWorthThreshold, incomeThreshold, externalNullifier]} = AccreditationProof(20);
