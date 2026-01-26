# Deployment Addresses

This document contains the deployed contract addresses for the Tokenisation SDK across all supported networks.

> **Note**: This file should be updated after each deployment. See the [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md) for procedures.

---

## Mainnet Deployments

### Ethereum Mainnet (Chain ID: 1)

**Status**: Not yet deployed

| Contract | Address | Verified | Deployment Date |
|----------|---------|----------|-----------------|
| IdentityRegistry | - | - | - |
| ClaimTopicsRegistry | - | - | - |
| TrustedIssuersRegistry | - | - | - |
| ModularCompliance | - | - | - |
| TokenFactory | - | - | - |
| ChainlinkPriceFeed | - | - | - |
| FunctionsConsumer | - | - | - |
| DistributionKeeper | - | - | - |
| ComplianceKeeper | - | - | - |

**Chainlink Services:**
- Functions Subscription ID: -
- Automation Upkeeps: -

---

### Polygon Mainnet (Chain ID: 137)

**Status**: Not yet deployed

| Contract | Address | Verified | Deployment Date |
|----------|---------|----------|-----------------|
| IdentityRegistry | - | - | - |
| ClaimTopicsRegistry | - | - | - |
| TrustedIssuersRegistry | - | - | - |
| ModularCompliance | - | - | - |
| TokenFactory | - | - | - |
| ChainlinkPriceFeed | - | - | - |
| FunctionsConsumer | - | - | - |
| DistributionKeeper | - | - | - |
| ComplianceKeeper | - | - | - |

---

### Base Mainnet (Chain ID: 8453)

**Status**: Not yet deployed

| Contract | Address | Verified | Deployment Date |
|----------|---------|----------|-----------------|
| IdentityRegistry | - | - | - |
| ModularCompliance | - | - | - |
| TokenFactory | - | - | - |

---

## Testnet Deployments

### Sepolia (Chain ID: 11155111)

**Status**: Ready for deployment

| Contract | Address | Verified | Deployment Date |
|----------|---------|----------|-----------------|
| IdentityRegistry | TBD | - | - |
| ClaimTopicsRegistry | TBD | - | - |
| TrustedIssuersRegistry | TBD | - | - |
| ModularCompliance | TBD | - | - |
| TokenFactory | TBD | - | - |
| ChainlinkPriceFeed | TBD | - | - |
| FunctionsConsumer | TBD | - | - |
| DistributionKeeper | TBD | - | - |
| ComplianceKeeper | TBD | - | - |
| CountryRestrictionsModule | TBD | - | - |
| MaxBalanceModule | TBD | - | - |
| HoldTimeModule | TBD | - | - |
| MaxHoldersModule | TBD | - | - |
| WhitelistModule | TBD | - | - |
| TransferFeesModule | TBD | - | - |

**Chainlink Addresses (Sepolia):**
- LINK Token: `0x779877A7B0D9E8603169DdbD7836e478b4624789`
- Functions Router: `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0`
- Automation Registry: `0x86EFBD0b6736Bed994962f9797049422A3A8E8Ad`
- ETH/USD Price Feed: `0x694AA1769357215DE4FAC081bf1f309aDC325306`

---

### Mumbai (Polygon Testnet) (Chain ID: 80001)

**Status**: Ready for deployment

| Contract | Address | Verified | Deployment Date |
|----------|---------|----------|-----------------|
| IdentityRegistry | TBD | - | - |
| ModularCompliance | TBD | - | - |
| TokenFactory | TBD | - | - |

**Chainlink Addresses (Mumbai):**
- LINK Token: `0x326C977E6efc84E512bB9C30f76E30c160eD06FB`
- Functions Router: `0x6E2dc0F9DB014aE19888F539E59285D2Ea04244C`
- MATIC/USD Price Feed: `0xd0D5e3DB44DE05E9F294BB0a3bEEaF030DE24Ada`

---

### Base Sepolia (Chain ID: 84532)

**Status**: Ready for deployment

| Contract | Address | Verified | Deployment Date |
|----------|---------|----------|-----------------|
| IdentityRegistry | TBD | - | - |
| ModularCompliance | TBD | - | - |
| TokenFactory | TBD | - | - |

**Chainlink Addresses (Base Sepolia):**
- LINK Token: `0xE4aB69C077896252FAFBD49EFD26B5D171A32410`
- Functions Router: `0xf9B8fc078197181C841c296C876945aaa425B278`
- ETH/USD Price Feed: `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1`

---

## Compliance Modules

### Available Modules

| Module | Description | Mainnet | Testnet |
|--------|-------------|---------|---------|
| CountryRestrictionsModule | Block transfers from/to sanctioned countries | - | TBD |
| MaxBalanceModule | Limit maximum token holding per address | - | TBD |
| HoldTimeModule | Enforce minimum holding periods | - | TBD |
| MaxHoldersModule | Limit total number of token holders | - | TBD |
| WhitelistModule | Whitelist-based transfer restrictions | - | TBD |
| TransferFeesModule | Collect transfer fees | - | TBD |

---

## Contract Verification

All contracts are verified on their respective block explorers:

- **Etherscan**: https://etherscan.io
- **Polygonscan**: https://polygonscan.com
- **Basescan**: https://basescan.org

### Verification Commands

```bash
# Sepolia
forge verify-contract \
  --chain-id 11155111 \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  <ADDRESS> \
  src/Contract.sol:Contract

# Mumbai
forge verify-contract \
  --chain-id 80001 \
  --etherscan-api-key $POLYGONSCAN_API_KEY \
  <ADDRESS> \
  src/Contract.sol:Contract
```

---

## Deployment History

| Date | Network | Version | Commit | Notes |
|------|---------|---------|--------|-------|
| - | - | - | - | Initial deployment pending |

---

## Important Notes

1. **Mainnet Addresses**: Only use addresses from this document for mainnet interactions
2. **Testnet Addresses**: May be redeployed without notice; do not use for production
3. **Verification**: Always verify contract addresses on block explorers before interaction
4. **Updates**: This document is updated after each deployment via CI/CD

---

## Related Documents

- [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md)
- [Contract Reference](../api/CONTRACTS.md)
- [Chainlink Integration Guide](../guides/CHAINLINK_INTEGRATION.md)
