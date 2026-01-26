# Deployment Runbook

Step-by-step procedures for deploying the Tokenisation SDK to testnet and mainnet environments.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Testnet Deployment](#testnet-deployment)
4. [Mainnet Deployment](#mainnet-deployment)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)

---

## Pre-Deployment Checklist

### Code Readiness

- [ ] All tests passing (`forge test`)
- [ ] No critical Slither findings
- [ ] Code review completed and approved
- [ ] Version bumped in package.json and contracts
- [ ] CHANGELOG updated
- [ ] Git tag created for release

### Infrastructure Readiness

- [ ] RPC endpoints configured and tested
- [ ] Deployer wallet funded with native tokens
- [ ] LINK tokens available for Chainlink services
- [ ] Block explorer API keys configured
- [ ] Monitoring alerts configured

### Documentation

- [ ] Deployment addresses template ready
- [ ] Runbook reviewed by team
- [ ] Rollback plan documented

---

## Environment Setup

### Required Environment Variables

```bash
# .env.deployment
# Network RPC URLs
ETH_MAINNET_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
POLYGON_MAINNET_RPC=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
POLYGON_MUMBAI_RPC=https://polygon-mumbai.g.alchemy.com/v2/YOUR_KEY
BASE_MAINNET_RPC=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Deployer Private Key (USE HARDWARE WALLET FOR MAINNET)
DEPLOYER_PRIVATE_KEY=0x...

# Block Explorer API Keys
ETHERSCAN_API_KEY=...
POLYGONSCAN_API_KEY=...
BASESCAN_API_KEY=...

# Chainlink Addresses (set per network)
CHAINLINK_FUNCTIONS_ROUTER=0x...
CHAINLINK_AUTOMATION_REGISTRY=0x...
LINK_TOKEN=0x...
```

### Verify Balances

```bash
# Check deployer balance on target network
cast balance $DEPLOYER_ADDRESS --rpc-url $RPC_URL

# Required minimums:
# - Ethereum Mainnet: 0.5 ETH
# - Polygon: 50 MATIC
# - Base: 0.1 ETH
# - Sepolia/Mumbai: Use faucets
```

---

## Testnet Deployment

### Step 1: Deploy Core Contracts

```bash
cd /path/to/contracts

# Set network
export NETWORK=sepolia

# Deploy core contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $ETH_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv

# Record addresses from output
# IdentityRegistry: 0x...
# ClaimTopicsRegistry: 0x...
# TrustedIssuersRegistry: 0x...
# ModularCompliance: 0x...
# TokenFactory: 0x...
```

### Step 2: Deploy Chainlink Contracts

```bash
# Deploy oracle and automation contracts
forge script script/DeployChainlink.s.sol:DeployChainlink \
  --rpc-url $ETH_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv

# Record addresses:
# ChainlinkPriceFeed: 0x...
# FunctionsConsumer: 0x...
# DistributionKeeper: 0x...
# ComplianceKeeper: 0x...
```

### Step 3: Deploy Compliance Modules

```bash
# Deploy compliance modules
forge script script/DeployCompliance.s.sol:DeployCompliance \
  --rpc-url $ETH_SEPOLIA_RPC \
  --broadcast \
  --verify \
  -vvvv

# Record addresses:
# CountryRestrictionsModule: 0x...
# MaxBalanceModule: 0x...
# HoldTimeModule: 0x...
# WhitelistModule: 0x...
```

### Step 4: Configure Contracts

```bash
# Run configuration script
forge script script/Configure.s.sol:Configure \
  --rpc-url $ETH_SEPOLIA_RPC \
  --broadcast \
  -vvvv

# This script:
# - Adds compliance modules to ModularCompliance
# - Sets up trusted issuers
# - Configures claim topics
# - Sets initial parameters
```

### Step 5: Verify on Block Explorer

```bash
# Verify each contract (if not done during deployment)
forge verify-contract \
  --chain-id 11155111 \
  --watch \
  $CONTRACT_ADDRESS \
  src/compliance/ModularCompliance.sol:ModularCompliance
```

### Step 6: Fund Chainlink Services

```bash
# Fund Functions subscription
cast send $LINK_TOKEN \
  "transferAndCall(address,uint256,bytes)" \
  $FUNCTIONS_ROUTER \
  5000000000000000000 \
  $(cast abi-encode "constructor(uint64)" $SUBSCRIPTION_ID) \
  --rpc-url $ETH_SEPOLIA_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY

# Register and fund Automation upkeep
# (Use Chainlink Automation UI or script)
```

### Step 7: Smoke Tests

```bash
# Run integration tests against deployed contracts
NETWORK=sepolia npm run test:integration

# Manual verification:
# 1. Create test token
# 2. Register test identity
# 3. Execute test transfer
# 4. Verify compliance checks work
```

---

## Mainnet Deployment

### Pre-Mainnet Verification

- [ ] Testnet deployment stable for 2+ weeks
- [ ] Security audit completed
- [ ] All audit findings addressed
- [ ] Team sign-off obtained
- [ ] Legal review completed

### Step 1: Prepare Deployment

```bash
# Double-check environment
echo "Deploying to: MAINNET"
echo "Deployer: $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY)"
echo "Balance: $(cast balance $DEPLOYER_ADDRESS --rpc-url $ETH_MAINNET_RPC)"

# Confirm with team before proceeding
read -p "Type 'DEPLOY MAINNET' to continue: " confirm
if [ "$confirm" != "DEPLOY MAINNET" ]; then
  echo "Deployment cancelled"
  exit 1
fi
```

### Step 2: Deploy with Simulation First

```bash
# Simulate deployment (no broadcast)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $ETH_MAINNET_RPC \
  --slow \
  -vvvv

# Review gas estimates and addresses
# If everything looks correct, proceed with broadcast
```

### Step 3: Execute Mainnet Deployment

```bash
# Deploy with broadcast
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $ETH_MAINNET_RPC \
  --broadcast \
  --verify \
  --slow \
  -vvvv

# IMPORTANT: Record all transaction hashes and addresses
```

### Step 4: Multi-Sig Transfer (if applicable)

```bash
# Transfer ownership to multi-sig
cast send $CONTRACT_ADDRESS \
  "transferOwnership(address)" \
  $MULTISIG_ADDRESS \
  --rpc-url $ETH_MAINNET_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY
```

### Step 5: Verify All Contracts

```bash
# Verify on Etherscan
forge verify-contract \
  --chain-id 1 \
  --watch \
  --constructor-args $(cast abi-encode "constructor(address)" $OWNER) \
  $CONTRACT_ADDRESS \
  src/compliance/ModularCompliance.sol:ModularCompliance
```

### Step 6: Update Documentation

```bash
# Update deployment addresses
cat >> docs/DEPLOYMENT_ADDRESSES.md << EOF
## Ethereum Mainnet (Chain ID: 1)
Deployed: $(date)

| Contract | Address |
|----------|---------|
| IdentityRegistry | $IDENTITY_REGISTRY |
| ModularCompliance | $MODULAR_COMPLIANCE |
| TokenFactory | $TOKEN_FACTORY |
...
EOF

# Commit and push
git add docs/DEPLOYMENT_ADDRESSES.md
git commit -m "docs: add mainnet deployment addresses"
git push
```

---

## Post-Deployment Verification

### Automated Checks

```bash
# Run post-deployment verification script
npm run verify:deployment -- --network mainnet

# This checks:
# - All contracts are verified
# - Ownership is correct
# - Modules are properly configured
# - Chainlink services are funded
```

### Manual Verification

1. **Contract Ownership**
   ```bash
   cast call $CONTRACT_ADDRESS "owner()" --rpc-url $RPC_URL
   # Should return expected owner/multisig
   ```

2. **Module Configuration**
   ```bash
   cast call $MODULAR_COMPLIANCE "getModules()" --rpc-url $RPC_URL
   # Should return array of module addresses
   ```

3. **Chainlink Integration**
   ```bash
   # Check Functions subscription balance
   # Check Automation upkeep status
   ```

### Monitoring Setup

```bash
# Add contracts to monitoring
curl -X POST https://your-monitoring.com/api/contracts \
  -H "Authorization: Bearer $MONITORING_API_KEY" \
  -d '{
    "network": "ethereum",
    "address": "'$CONTRACT_ADDRESS'",
    "name": "ModularCompliance"
  }'
```

---

## Rollback Procedures

### Scenario 1: Deployment Failed Mid-Way

```bash
# 1. Identify last successful contract
# 2. Document failed state
# 3. Do NOT retry immediately

# If contracts were partially deployed:
# - They are immutable, cannot be "removed"
# - Deploy new versions and update references
# - Mark old contracts as deprecated
```

### Scenario 2: Critical Bug Found Post-Deploy

```bash
# 1. PAUSE affected contracts immediately
cast send $CONTRACT_ADDRESS "pause()" \
  --rpc-url $RPC_URL \
  --private-key $ADMIN_KEY

# 2. Assess impact
# 3. Prepare hotfix deployment
# 4. Deploy fixed version
# 5. Migrate state if needed
# 6. Update all references
# 7. Unpause or use new contracts
```

### Scenario 3: Compromised Admin Key

```bash
# 1. Rotate to backup admin immediately
# 2. Pause all contracts
# 3. Revoke compromised key permissions
# 4. Investigate breach
# 5. Deploy new contracts if needed
```

---

## Emergency Contacts

| Role | Contact |
|------|---------|
| On-Call Engineer | +1-xxx-xxx-xxxx |
| Security Team | security@company.com |
| Chainlink Support | https://chain.link/contact |

---

## Deployment Log Template

```markdown
## Deployment: [Network] - [Date]

**Deployer:** 0x...
**Commit:** abc123
**Gas Used:** X ETH

### Contracts Deployed

| Contract | Address | Tx Hash | Verified |
|----------|---------|---------|----------|
| IdentityRegistry | 0x... | 0x... | Yes |
| ... | ... | ... | ... |

### Configuration Applied

- Added modules: X, Y, Z
- Set parameters: ...
- Transferred ownership to: 0x...

### Issues Encountered

- None / List issues

### Sign-Off

- [ ] Deployer: [Name]
- [ ] Reviewer: [Name]
- [ ] Security: [Name]
```
