/**
 * Base Claim Verification Circuit
 *
 * Provides core functionality for verifying claims using ZK proofs:
 * - Merkle tree membership proofs
 * - Poseidon hashing
 * - Claim commitment generation
 *
 * This is the base template extended by specific claim circuits.
 */

pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/**
 * Poseidon Merkle Tree Membership Proof
 *
 * Verifies that a leaf exists in a Merkle tree with given root.
 * Uses Poseidon hash function for SNARK-friendly verification.
 *
 * @param levels - Number of levels in the tree (max 32)
 */
template MerkleTreeVerifier(levels) {
    // Public inputs
    signal input root;

    // Private inputs
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Intermediate signals
    signal hashes[levels + 1];
    hashes[0] <== leaf;

    component hashers[levels];
    component mux[levels];

    for (var i = 0; i < levels; i++) {
        // Ensure pathIndices are binary
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        hashers[i] = Poseidon(2);
        mux[i] = Mux1();

        // If pathIndex is 0, hash(current, sibling)
        // If pathIndex is 1, hash(sibling, current)
        mux[i].c[0] <== hashes[i];
        mux[i].c[1] <== pathElements[i];
        mux[i].s <== pathIndices[i];

        hashers[i].inputs[0] <== mux[i].out;
        hashers[i].inputs[1] <== pathIndices[i] * (hashes[i] - pathElements[i]) + pathElements[i];

        hashes[i + 1] <== hashers[i].out;
    }

    // Verify computed root matches input root
    root === hashes[levels];
}

/**
 * Claim Commitment Generator
 *
 * Creates a commitment to a claim value without revealing it.
 * commitment = Poseidon(claimType, claimValue, salt, identityId)
 */
template ClaimCommitment() {
    signal input claimType;
    signal input claimValue;
    signal input salt;
    signal input identityId;

    signal output commitment;

    component hasher = Poseidon(4);
    hasher.inputs[0] <== claimType;
    hasher.inputs[1] <== claimValue;
    hasher.inputs[2] <== salt;
    hasher.inputs[3] <== identityId;

    commitment <== hasher.out;
}

/**
 * Nullifier Generator
 *
 * Creates a unique nullifier to prevent proof replay.
 * nullifier = Poseidon(commitment, externalNullifier)
 */
template NullifierGenerator() {
    signal input commitment;
    signal input externalNullifier;

    signal output nullifier;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== commitment;
    hasher.inputs[1] <== externalNullifier;

    nullifier <== hasher.out;
}

/**
 * Range Check
 *
 * Verifies that a value is within a range [min, max].
 * Uses comparator circuits for safe comparison.
 */
template RangeCheck(n) {
    signal input value;
    signal input min;
    signal input max;

    signal output inRange;

    component geMin = GreaterEqThan(n);
    component leMax = LessEqThan(n);

    geMin.in[0] <== value;
    geMin.in[1] <== min;

    leMax.in[0] <== value;
    leMax.in[1] <== max;

    inRange <== geMin.out * leMax.out;
}

/**
 * Base Claim Verifier
 *
 * Abstract template for claim verification. Specific claim types
 * extend this with their own verification logic.
 *
 * @param merkleDepth - Depth of the claims Merkle tree
 */
template BaseClaimVerifier(merkleDepth) {
    // Public inputs
    signal input claimsRoot;          // Root of claims Merkle tree
    signal input currentTimestamp;    // Current time for expiry check
    signal input externalNullifier;   // For proof replay prevention

    // Public outputs
    signal output nullifier;          // Proof nullifier
    signal output commitment;         // Claim commitment
    signal output valid;              // Whether claim is valid

    // Private inputs
    signal input claimType;           // Type of claim
    signal input claimValue;          // Claim value
    signal input salt;                // Random salt
    signal input identityId;          // Identity identifier
    signal input expiryTimestamp;     // When claim expires
    signal input merklePathElements[merkleDepth];
    signal input merklePathIndices[merkleDepth];

    // Generate commitment
    component commitmentGen = ClaimCommitment();
    commitmentGen.claimType <== claimType;
    commitmentGen.claimValue <== claimValue;
    commitmentGen.salt <== salt;
    commitmentGen.identityId <== identityId;
    commitment <== commitmentGen.commitment;

    // Generate nullifier
    component nullifierGen = NullifierGenerator();
    nullifierGen.commitment <== commitment;
    nullifierGen.externalNullifier <== externalNullifier;
    nullifier <== nullifierGen.nullifier;

    // Create leaf for Merkle tree (commitment + expiry)
    component leafHasher = Poseidon(2);
    leafHasher.inputs[0] <== commitment;
    leafHasher.inputs[1] <== expiryTimestamp;
    signal leaf <== leafHasher.out;

    // Verify Merkle membership
    component merkleVerifier = MerkleTreeVerifier(merkleDepth);
    merkleVerifier.root <== claimsRoot;
    merkleVerifier.leaf <== leaf;
    for (var i = 0; i < merkleDepth; i++) {
        merkleVerifier.pathElements[i] <== merklePathElements[i];
        merkleVerifier.pathIndices[i] <== merklePathIndices[i];
    }

    // Check expiry
    component notExpired = LessThan(64);
    notExpired.in[0] <== currentTimestamp;
    notExpired.in[1] <== expiryTimestamp;

    valid <== notExpired.out;
}
