# Troubleshooting Guide

Common issues and solutions for the Tokenisation SDK.

## Table of Contents

1. [Smart Contract Issues](#smart-contract-issues)
2. [Chainlink Issues](#chainlink-issues)
3. [KYC/Compliance Issues](#kycompliance-issues)
4. [API Server Issues](#api-server-issues)
5. [SDK Issues](#sdk-issues)
6. [Database Issues](#database-issues)

---

## Smart Contract Issues

### Transfer Fails with "Compliance check failed"

**Symptoms:**
- Token transfer reverts
- Error message includes "compliance" or "not allowed"

**Diagnosis:**
```bash
# Check if sender is verified
cast call $IDENTITY_REGISTRY "isVerified(address)" $SENDER --rpc-url $RPC

# Check compliance modules
cast call $MODULAR_COMPLIANCE "canTransfer(address,address,uint256)" $FROM $TO $AMOUNT --rpc-url $RPC

# Check specific module failures
for module in $(cast call $MODULAR_COMPLIANCE "getModules()" --rpc-url $RPC); do
  cast call $module "moduleCheck(address,address,uint256,address)" $FROM $TO $AMOUNT $TOKEN --rpc-url $RPC
done
```

**Solutions:**
1. **Sender not verified**: Complete KYC process
2. **Country restricted**: Check if user's country is blocked
3. **Whitelist required**: Add user to whitelist
4. **Hold time not met**: Wait for lockup period to expire
5. **Max balance exceeded**: Reduce transfer amount

---

### Contract Deployment Fails

**Symptoms:**
- `forge script` fails during deployment
- "Execution reverted" error

**Diagnosis:**
```bash
# Check deployer balance
cast balance $DEPLOYER_ADDRESS --rpc-url $RPC

# Estimate gas
forge script script/Deploy.s.sol --rpc-url $RPC -vvvv 2>&1 | grep "gas"

# Check constructor arguments
# Ensure all addresses are valid and non-zero
```

**Solutions:**
1. **Insufficient funds**: Fund deployer wallet
2. **Invalid constructor args**: Verify all addresses
3. **Contract too large**: Enable optimizer or split contract
4. **Gas limit too low**: Increase gas limit in script

---

### Contract Verification Fails

**Symptoms:**
- `forge verify-contract` fails
- "Already verified" or "Invalid bytecode"

**Solutions:**
```bash
# Check compiler settings match
forge verify-contract \
  --chain-id $CHAIN_ID \
  --compiler-version 0.8.20 \
  --optimizer-runs 200 \
  --watch \
  $ADDRESS \
  src/Contract.sol:Contract

# For constructor arguments
forge verify-contract \
  --constructor-args $(cast abi-encode "constructor(address,uint256)" $ARG1 $ARG2) \
  ...
```

---

## Chainlink Issues

### Functions Request Never Fulfills

**Symptoms:**
- Request sent but callback never received
- `getRequestStatus` returns PENDING indefinitely

**Diagnosis:**
```bash
# Check subscription balance
npm run chainlink:subscription-info -- --id $SUB_ID

# Check consumer is added
npm run chainlink:list-consumers -- --id $SUB_ID

# Check gas limit
# Callback may be running out of gas
```

**Solutions:**
1. **Low LINK balance**: Fund subscription
2. **Consumer not added**: Add contract to subscription
3. **Gas limit too low**: Increase `gasLimit` in request
4. **Source code error**: Test source in Functions Playground
5. **DON overloaded**: Retry after some time

---

### Price Feed Returns Stale Data

**Symptoms:**
- `latestRoundData` returns old timestamp
- Price hasn't updated in hours

**Diagnosis:**
```bash
# Check last update time
cast call $PRICE_FEED "latestRoundData()" --rpc-url $RPC

# Check Chainlink status
# https://status.chain.link
```

**Solutions:**
1. **Network issue**: Use backup RPC
2. **Feed deprecated**: Check Chainlink docs for new address
3. **Circuit breaker**: Some feeds pause during high volatility
4. **Enable fallback**: Use OracleAggregator with backup sources

---

### Automation Upkeep Not Performing

**Symptoms:**
- `checkUpkeep` returns true but `performUpkeep` never called
- Upkeep appears inactive

**Diagnosis:**
```bash
# Check upkeep details
npm run chainlink:upkeep-info -- --id $UPKEEP_ID

# Manual check
cast call $KEEPER_CONTRACT "checkUpkeep(bytes)" 0x --rpc-url $RPC

# Check if paused
cast call $KEEPER_CONTRACT "paused()" --rpc-url $RPC
```

**Solutions:**
1. **Low balance**: Fund upkeep with LINK
2. **Gas too expensive**: Increase max gas price
3. **Contract paused**: Unpause if appropriate
4. **checkUpkeep reverts**: Fix contract logic

---

## KYC/Compliance Issues

### KYC Session Expired

**Symptoms:**
- User can't complete verification
- Session URL returns 404 or expired error

**Solutions:**
1. Create new session:
```typescript
const session = await kyc.startVerification({
  userId: user.id,
  walletAddress: user.address,
});
```
2. Increase session TTL in config

---

### Webhook Not Received

**Symptoms:**
- User completed verification but status not updated
- No webhook events in logs

**Diagnosis:**
1. Check webhook URL is correct in provider dashboard
2. Verify webhook signature handling
3. Check server logs for incoming requests
4. Test with provider's webhook tester

**Solutions:**
1. **Incorrect URL**: Update in provider dashboard
2. **Signature invalid**: Verify webhook secret
3. **Firewall blocking**: Allow provider IPs
4. **Server error**: Fix handler, add error logging

---

### User Stuck in "Pending" Status

**Symptoms:**
- Verification submitted but never completes
- Provider shows waiting for review

**Solutions:**
1. Check provider dashboard for manual review queue
2. Contact provider support
3. Allow user to restart verification
4. Check if documents are readable/valid

---

## API Server Issues

### High Latency

**Symptoms:**
- API responses taking > 500ms
- Timeouts occurring

**Diagnosis:**
```bash
# Check database queries
EXPLAIN ANALYZE SELECT ...;

# Check RPC latency
time cast block-number --rpc-url $RPC

# Check Redis
redis-cli INFO stats
```

**Solutions:**
1. **Slow queries**: Add indexes, optimize queries
2. **RPC slow**: Switch to faster provider
3. **Redis full**: Increase memory or evict keys
4. **Connection pool exhausted**: Increase pool size

---

### Out of Memory

**Symptoms:**
- OOMKilled errors
- Server crashes under load

**Solutions:**
1. **Increase memory limit**: Update container resources
2. **Memory leak**: Profile with heapdump
3. **Large responses**: Implement pagination
4. **Cache bloat**: Set TTL on cached items

---

### Database Connection Errors

**Symptoms:**
- "Connection refused" or "Too many connections"

**Solutions:**
```bash
# Check active connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < now() - interval '1 hour';"

# Increase max connections (if needed)
# ALTER SYSTEM SET max_connections = 200;
```

---

## SDK Issues

### Import Errors

**Symptoms:**
- "Module not found" errors
- TypeScript type errors

**Solutions:**
```bash
# Rebuild packages
npm run build

# Clear cache
rm -rf node_modules/.cache
npm install

# Check TypeScript version
npm ls typescript
```

---

### Transaction Fails with "Nonce too low"

**Symptoms:**
- Multiple transactions fail
- "Nonce already used" error

**Solutions:**
```typescript
// Get current nonce
const nonce = await provider.getTransactionCount(address, 'pending');

// Send with explicit nonce
const tx = await contract.transfer(to, amount, { nonce });
```

---

### Gas Estimation Fails

**Symptoms:**
- "Cannot estimate gas" error
- Transaction would revert

**Diagnosis:**
```typescript
try {
  await contract.transfer.estimateGas(to, amount);
} catch (error) {
  // Check the revert reason
  console.log(error.reason);
}
```

**Solutions:**
1. Check if transfer is allowed (compliance)
2. Check sufficient balance
3. Check contract is not paused
4. Try with explicit gas limit

---

## Database Issues

### Slow Queries

**Diagnosis:**
```sql
-- Find slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Check missing indexes
SELECT schemaname, tablename, attname, null_frac, n_distinct
FROM pg_stats
WHERE schemaname = 'public';
```

**Solutions:**
1. Add appropriate indexes
2. Optimize query structure
3. Use connection pooling
4. Consider read replicas

---

### Disk Space Full

**Symptoms:**
- Write operations fail
- "No space left on device"

**Solutions:**
```bash
# Check disk usage
df -h

# Clean WAL files (if using replication)
pg_controldata | grep "Latest checkpoint's REDO WAL file"

# Vacuum to reclaim space
VACUUM FULL;
```

---

## Quick Diagnostics Script

```bash
#!/bin/bash
# health-check.sh

echo "=== System Health Check ==="

echo -n "API Server: "
curl -s https://api.yourservice.com/health | jq -r '.status'

echo -n "Database: "
pg_isready -h $DB_HOST -p 5432 && echo "OK" || echo "FAILED"

echo -n "Redis: "
redis-cli -h $REDIS_HOST ping

echo -n "RPC Node: "
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  $RPC_URL | jq -r '.result' | xargs printf "%d\n"

echo -n "LINK Balance: "
npm run check:link-balances 2>/dev/null | grep "Total"

echo "=== End Health Check ==="
```

---

## Getting Help

If issues persist:

1. **Documentation**: Check https://docs.yourservice.com
2. **GitHub Issues**: https://github.com/your-org/tokenisation-sdk/issues
3. **Support**: support@yourservice.com
4. **Emergency**: Page on-call via PagerDuty
