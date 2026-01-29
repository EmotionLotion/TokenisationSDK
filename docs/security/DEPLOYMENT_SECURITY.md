# Deployment Security Checklist

Security considerations for deploying TokenisationSDK smart contracts to production.

## Pre-Deployment

### Code Verification

- [ ] All audits completed and findings resolved
- [ ] Final code matches audited version (git hash verified)
- [ ] Compiler version locked and consistent
- [ ] Optimizer settings documented
- [ ] All dependencies pinned to specific versions

### Access Control Setup

- [ ] Owner address is multi-sig (Gnosis Safe recommended)
- [ ] Multi-sig threshold appropriate (e.g., 3/5 or 4/7)
- [ ] Agent addresses verified and documented
- [ ] Time-lock configured for critical operations
- [ ] Emergency admin separate from operational admin

### Configuration Review

- [ ] Identity registry address verified
- [ ] Compliance contract address verified
- [ ] Initial compliance modules configured
- [ ] Token metadata (name, symbol, decimals) verified
- [ ] Maximum supply (if applicable) set correctly

## Deployment Process

### Network Preparation

| Network | Chain ID | RPC URL | Verified |
|---------|----------|---------|----------|
| Mainnet | 1 | | [ ] |
| Sepolia | 11155111 | | [ ] |

### Deployment Order

1. [ ] Deploy IdentityRegistry (or verify existing)
2. [ ] Deploy ClaimTopicsRegistry
3. [ ] Deploy TrustedIssuersRegistry
4. [ ] Deploy ModularCompliance
5. [ ] Deploy RealToken
6. [ ] Configure compliance modules
7. [ ] Bind compliance to token
8. [ ] Set identity registry on token
9. [ ] Transfer ownership to multi-sig
10. [ ] Verify all contracts on Etherscan

### Gas Considerations

| Operation | Estimated Gas | ETH @ 30 gwei |
|-----------|---------------|---------------|
| Deploy RealToken | ~3,000,000 | ~0.09 ETH |
| Deploy ModularCompliance | ~1,500,000 | ~0.045 ETH |
| Configure modules | ~200,000 | ~0.006 ETH |
| Total Deployment | ~5,000,000 | ~0.15 ETH |

## Post-Deployment Verification

### Contract Verification

- [ ] Source code verified on Etherscan
- [ ] ABI published and documented
- [ ] Contract addresses documented in README
- [ ] Deployment transaction hashes recorded

### Functional Verification

```bash
# Verify owner
cast call $TOKEN_ADDRESS "owner()(address)" --rpc-url $RPC_URL

# Verify identity registry
cast call $TOKEN_ADDRESS "identityRegistry()(address)" --rpc-url $RPC_URL

# Verify compliance
cast call $TOKEN_ADDRESS "compliance()(address)" --rpc-url $RPC_URL

# Verify paused state (should be false or as intended)
cast call $TOKEN_ADDRESS "paused()(bool)" --rpc-url $RPC_URL
```

### Security Verification

- [ ] Owner is multi-sig address
- [ ] No unexpected agents configured
- [ ] Compliance modules correctly configured
- [ ] Identity registry has trusted issuers
- [ ] Pause functionality tested (on testnet)
- [ ] Freeze functionality tested (on testnet)

## Monitoring Setup

### Event Monitoring

Monitor these events for security incidents:

```solidity
// Critical - Ownership/Access
event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)
event AgentAdded(address indexed agent)
event AgentRemoved(address indexed agent)

// Critical - Token Operations
event TokensMinted(address indexed to, uint256 amount)
event TokensBurned(address indexed from, uint256 amount)
event RecoverySuccess(address indexed lostWallet, address indexed newWallet, address indexed investorOnchainID)

// Important - Compliance
event ComplianceSet(address indexed compliance)
event IdentityRegistrySet(address indexed identityRegistry)
event AddressFrozen(address indexed userAddress, bool isFrozen, address indexed agent)

// Important - State Changes
event Paused(address account)
event Unpaused(address account)
```

### Alert Thresholds

| Event | Threshold | Alert Level |
|-------|-----------|-------------|
| OwnershipTransferred | Any | CRITICAL |
| Large mint (>1% supply) | Configurable | HIGH |
| Multiple burns in 1 hour | >10 | MEDIUM |
| Pause triggered | Any | HIGH |
| New agent added | Any | MEDIUM |

### Recommended Monitoring Tools

- **Tenderly** - Transaction monitoring and alerting
- **OpenZeppelin Defender** - Automated security monitoring
- **Forta** - Threat detection bots
- **Custom** - Subgraph + alerting system

## Incident Response

### Response Levels

| Level | Trigger | Response |
|-------|---------|----------|
| L1 - Critical | Fund loss imminent | Pause immediately, assess, communicate |
| L2 - High | Vulnerability discovered | Assess impact, prepare fix, pause if needed |
| L3 - Medium | Suspicious activity | Investigate, monitor closely |
| L4 - Low | Code improvement | Schedule for next update |

### Emergency Contacts

| Role | Name | Contact | Backup |
|------|------|---------|--------|
| Security Lead | | | |
| Operations | | | |
| Legal | | | |
| Communications | | | |

### Emergency Procedures

1. **Pause Protocol**
   ```bash
   # Via multi-sig
   cast send $TOKEN_ADDRESS "pause()" --private-key $ADMIN_KEY
   ```

2. **Freeze Specific Address**
   ```bash
   cast send $TOKEN_ADDRESS "setAddressFrozen(address,bool)" $SUSPICIOUS_ADDRESS true
   ```

3. **Communication Template**
   ```
   [SECURITY NOTICE]
   We have identified [BRIEF DESCRIPTION].
   Impact: [SCOPE]
   Status: [INVESTIGATING/CONTAINED/RESOLVED]
   Actions: [WHAT WE'RE DOING]
   User Action: [WHAT USERS SHOULD DO]
   Updates: [WHERE TO FOLLOW]
   ```

## Upgrade Considerations

If using upgradeable contracts:

- [ ] Proxy admin is separate multi-sig
- [ ] Storage layout documented
- [ ] Upgrade delay configured (timelock)
- [ ] Upgrade test performed on fork
- [ ] Rollback procedure documented

## Documentation

Maintain these documents post-deployment:

- [ ] Contract addresses by network
- [ ] ABI files
- [ ] Deployment scripts
- [ ] Access control matrix
- [ ] Incident response playbook
- [ ] Upgrade history
- [ ] Audit reports

---

## Appendix: Deployment Script Example

```bash
#!/bin/bash
# deploy.sh - Production deployment script

set -e

# Load environment
source .env

# Verify network
CHAIN_ID=$(cast chain-id --rpc-url $RPC_URL)
echo "Deploying to chain: $CHAIN_ID"

if [ "$CHAIN_ID" != "1" ]; then
    echo "ERROR: Not mainnet. Aborting."
    exit 1
fi

# Deploy contracts
echo "Deploying ModularCompliance..."
COMPLIANCE=$(forge create ModularCompliance --rpc-url $RPC_URL --private-key $DEPLOYER_KEY --json | jq -r '.deployedTo')
echo "Compliance deployed at: $COMPLIANCE"

echo "Deploying RealToken..."
TOKEN=$(forge create RealToken \
    --constructor-args $IDENTITY_REGISTRY $COMPLIANCE "Token Name" "TKN" 18 $INITIAL_OWNER \
    --rpc-url $RPC_URL \
    --private-key $DEPLOYER_KEY \
    --json | jq -r '.deployedTo')
echo "Token deployed at: $TOKEN"

# Verify contracts
echo "Verifying contracts on Etherscan..."
forge verify-contract $COMPLIANCE ModularCompliance --chain-id $CHAIN_ID
forge verify-contract $TOKEN RealToken --chain-id $CHAIN_ID

# Output
echo "Deployment complete!"
echo "Token: $TOKEN"
echo "Compliance: $COMPLIANCE"
```

---

*Last Updated: January 2026*
*Version: 1.0.0*
