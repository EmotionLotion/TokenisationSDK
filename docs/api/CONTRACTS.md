# Smart Contracts Reference

## Overview

The TokenisationSDK includes ERC-3643 compliant smart contracts for on-chain token management.

## Contract Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Token Layer                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  ComplianceToken.sol                     │    │
│  │          ERC-20 + Transfer Restrictions                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Compliance Layer                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │IdentityRegistry │  │ComplianceModule │  │ ClaimVerifier │   │
│  │ (KYC Status)    │  │ (Transfer Rules)│  │ (Attestations)│   │
│  └─────────────────┘  └─────────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Contracts

### ComplianceToken.sol

ERC-20 token with built-in transfer restrictions.

**Location:** `contracts/src/token/ComplianceToken.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IComplianceToken {
    // ERC-20 Standard
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function totalSupply() external view returns (uint256);

    // Compliance Extensions
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function freeze(address account) external;
    function unfreeze(address account) external;
    function isFrozen(address account) external view returns (bool);

    // Events
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event Freeze(address indexed account);
    event Unfreeze(address indexed account);
}
```

**Key Features:**
- Pre-transfer compliance check via `IdentityRegistry`
- Account freezing capability
- Minting and burning restricted to authorized roles
- Pausable for emergencies

### IdentityRegistry.sol

Maps wallet addresses to KYC verification status.

**Location:** `contracts/src/compliance/IdentityRegistry.sol`

```solidity
interface IIdentityRegistry {
    // Registration
    function registerIdentity(
        address wallet,
        bytes32 identityHash,
        uint16 country
    ) external;

    function removeIdentity(address wallet) external;

    // Queries
    function isVerified(address wallet) external view returns (bool);
    function getIdentity(address wallet) external view returns (
        bytes32 identityHash,
        uint16 country,
        bool verified
    );

    // Verification
    function setVerified(address wallet, bool status) external;

    // Events
    event IdentityRegistered(address indexed wallet, bytes32 identityHash);
    event IdentityRemoved(address indexed wallet);
    event VerificationUpdated(address indexed wallet, bool verified);
}
```

### ComplianceModule.sol

Defines and enforces transfer rules.

**Location:** `contracts/src/compliance/ComplianceModule.sol`

```solidity
interface IComplianceModule {
    // Check if transfer is allowed
    function canTransfer(
        address from,
        address to,
        uint256 amount
    ) external view returns (bool);

    // Get transfer denial reason
    function getTransferDenialReason(
        address from,
        address to,
        uint256 amount
    ) external view returns (string memory);

    // Module management
    function addRule(bytes32 ruleId, bytes calldata ruleData) external;
    function removeRule(bytes32 ruleId) external;
}
```

**Built-in Rules:**
- `REQUIRE_KYC` - Both parties must be KYC verified
- `COUNTRY_RESTRICT` - Block specific countries
- `MAX_HOLDERS` - Limit total number of holders
- `TRANSFER_LIMIT` - Max transfer amount per transaction
- `LOCKUP_PERIOD` - Time-based transfer restrictions

### ClaimVerifier.sol

Verifies off-chain claims/attestations.

**Location:** `contracts/src/compliance/ClaimVerifier.sol`

```solidity
interface IClaimVerifier {
    // Add trusted claim issuer
    function addClaimIssuer(address issuer, uint256 claimType) external;

    // Remove claim issuer
    function removeClaimIssuer(address issuer) external;

    // Verify a claim
    function verifyClaim(
        address subject,
        uint256 claimType,
        bytes calldata signature
    ) external view returns (bool);

    // Check if claim is valid
    function hasValidClaim(
        address subject,
        uint256 claimType
    ) external view returns (bool);
}
```

## Deployment

### Using Foundry

```bash
cd contracts

# Build
forge build

# Test
forge test

# Deploy to local network
anvil &
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast

# Deploy to testnet (Base Sepolia)
forge script script/Deploy.s.sol \
  --rpc-url https://sepolia.base.org \
  --broadcast \
  --verify
```

### Deployment Script

```solidity
// script/Deploy.s.sol
contract DeployScript is Script {
    function run() external {
        vm.startBroadcast();

        // 1. Deploy IdentityRegistry
        IdentityRegistry registry = new IdentityRegistry();

        // 2. Deploy ComplianceModule
        ComplianceModule compliance = new ComplianceModule(address(registry));

        // 3. Deploy Token
        ComplianceToken token = new ComplianceToken(
            "Property Token",
            "PROP",
            address(compliance)
        );

        vm.stopBroadcast();
    }
}
```

## Security Considerations

### Access Control

```solidity
// Roles
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

// Only admin can grant roles
function grantRole(bytes32 role, address account) external onlyRole(ADMIN_ROLE);
```

### Upgradeability

Contracts use OpenZeppelin's UUPS proxy pattern:

```solidity
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract ComplianceTokenV2 is ComplianceToken, UUPSUpgradeable {
    function _authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE) {}
}
```

### Emergency Functions

```solidity
// Pause all transfers
function pause() external onlyRole(ADMIN_ROLE);
function unpause() external onlyRole(ADMIN_ROLE);

// Emergency withdrawal (governance only)
function emergencyWithdraw(address to) external onlyRole(ADMIN_ROLE);
```

## Testing

```bash
# Run all tests
forge test

# Run specific test
forge test --match-test testTransferCompliance

# Gas report
forge test --gas-report

# Coverage
forge coverage
```

## Contract Addresses

### Testnet (Base Sepolia)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `TBD` |
| ComplianceModule | `TBD` |
| ComplianceToken | `TBD` |

### Mainnet

| Contract | Address |
|----------|---------|
| IdentityRegistry | Not deployed |
| ComplianceModule | Not deployed |
| ComplianceToken | Not deployed |

## Audit Status

**Current Status:** NOT AUDITED

Before mainnet deployment:
- [ ] Internal security review
- [ ] External audit by reputable firm
- [ ] Bug bounty program
- [ ] Formal verification (recommended)
