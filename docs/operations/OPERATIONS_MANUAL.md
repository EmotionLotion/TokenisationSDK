# Operations Manual

Day-to-day operations guide for the Tokenisation SDK production environment.

## Table of Contents

1. [System Overview](#system-overview)
2. [Daily Operations](#daily-operations)
3. [Monitoring & Alerts](#monitoring--alerts)
4. [Incident Response](#incident-response)
5. [Maintenance Procedures](#maintenance-procedures)
6. [Chainlink Management](#chainlink-management)
7. [Compliance Operations](#compliance-operations)
8. [Backup & Recovery](#backup--recovery)

---

## System Overview

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend/SDK                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Server                               │
│  - REST API endpoints                                           │
│  - WebSocket connections                                        │
│  - Background job processing                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Database │   │  Redis   │   │   RPC    │
        │ Postgres │   │  Cache   │   │  Nodes   │
        └──────────┘   └──────────┘   └──────────┘
                                            │
                                            ▼
                              ┌──────────────────────┐
                              │   Smart Contracts    │
                              │  (Multi-chain)       │
                              └──────────────────────┘
```

### Key Components

| Component | Purpose | Health Check |
|-----------|---------|--------------|
| API Server | REST/WebSocket endpoints | GET /health |
| PostgreSQL | Persistent data storage | pg_isready |
| Redis | Caching, sessions | redis-cli ping |
| RPC Nodes | Blockchain access | eth_blockNumber |

---

## Daily Operations

### Morning Checklist (9:00 AM)

```bash
# 1. Check system health
curl https://api.yourservice.com/health

# 2. Review overnight alerts
# Check PagerDuty/Opsgenie

# 3. Check Chainlink balances
npm run check:link-balances

# 4. Review pending distributions
npm run list:pending-distributions

# 5. Check KYC queue
npm run check:kyc-queue
```

### Key Metrics to Monitor

| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| API Latency (p95) | < 200ms | > 500ms |
| Error Rate | < 0.1% | > 1% |
| Database Connections | < 80% | > 90% |
| LINK Balance | > 10 LINK | < 5 LINK |
| Oracle Freshness | < 1 hour | > 2 hours |

### Weekly Tasks

- **Monday**: Review metrics dashboards, plan capacity
- **Wednesday**: Security scan review, update dependencies
- **Friday**: Backup verification, documentation updates

---

## Monitoring & Alerts

### Dashboard Access

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| Grafana | https://grafana.internal | Metrics |
| Kibana | https://kibana.internal | Logs |
| PagerDuty | https://pagerduty.com | Alerts |

### Alert Severity Levels

| Level | Response Time | Examples |
|-------|---------------|----------|
| P1 - Critical | 15 minutes | System down, security breach |
| P2 - High | 1 hour | Major feature broken, high error rate |
| P3 - Medium | 4 hours | Performance degradation |
| P4 - Low | Next business day | Minor issues |

### Common Alerts & Responses

#### High Error Rate

```bash
# 1. Check logs for errors
kubectl logs -l app=api-server --tail=100 | grep ERROR

# 2. Check dependent services
curl https://api.yourservice.com/health/dependencies

# 3. Check recent deployments
kubectl rollout history deployment/api-server

# 4. If recent deployment, consider rollback
kubectl rollout undo deployment/api-server
```

#### LINK Balance Low

```bash
# 1. Check current balance
npm run check:link-balances

# 2. Fund from treasury
npm run fund:link -- --subscription $SUB_ID --amount 10

# 3. Verify funding
npm run check:link-balances
```

#### Oracle Stale Data

```bash
# 1. Check oracle health
npm run check:oracle-health

# 2. Check Chainlink status page
# https://status.chain.link

# 3. If widespread issue, enable fallback
npm run oracle:enable-fallback

# 4. Notify team and monitor
```

---

## Incident Response

### Incident Classification

| Type | Description | Lead |
|------|-------------|------|
| Security | Unauthorized access, vulnerabilities | Security Team |
| Performance | Slowdowns, timeouts | SRE Team |
| Data | Data loss, corruption | Database Team |
| Integration | Third-party service issues | Backend Team |

### Response Procedure

1. **Acknowledge** - Claim incident in PagerDuty
2. **Assess** - Determine severity and impact
3. **Communicate** - Update status page, notify stakeholders
4. **Mitigate** - Stop the bleeding
5. **Resolve** - Fix the root cause
6. **Review** - Post-incident review within 48 hours

### Emergency Contacts

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| Primary On-Call | Rotates | PagerDuty | @oncall |
| Security Lead | - | - | @security |
| CTO | - | - | @cto |

---

## Maintenance Procedures

### Scheduled Maintenance Window

- **Time**: Sundays 02:00-06:00 UTC
- **Notification**: 48 hours advance notice
- **Status Page**: Update before and after

### Database Maintenance

```bash
# 1. Announce maintenance
npm run maintenance:announce

# 2. Enable maintenance mode
npm run maintenance:enable

# 3. Run vacuum and analyze
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# 4. Run pending migrations
npm run db:migrate

# 5. Disable maintenance mode
npm run maintenance:disable

# 6. Verify system health
curl https://api.yourservice.com/health
```

### Contract Upgrades

```bash
# 1. Test upgrade on testnet
forge script script/Upgrade.s.sol --rpc-url $TESTNET_RPC --broadcast

# 2. Verify on testnet for 24+ hours

# 3. Schedule mainnet upgrade
# 4. Announce to users

# 5. Execute upgrade
forge script script/Upgrade.s.sol --rpc-url $MAINNET_RPC --broadcast

# 6. Verify contracts
forge verify-contract ...

# 7. Update documentation
```

---

## Chainlink Management

### Functions Subscription Management

```bash
# Check subscription details
npm run chainlink:subscription-info -- --id $SUBSCRIPTION_ID

# Add consumer contract
npm run chainlink:add-consumer -- --id $SUB_ID --consumer $CONTRACT

# Fund subscription
npm run chainlink:fund-subscription -- --id $SUB_ID --amount 10

# Remove consumer
npm run chainlink:remove-consumer -- --id $SUB_ID --consumer $CONTRACT
```

### Automation Upkeep Management

```bash
# List all upkeeps
npm run chainlink:list-upkeeps

# Check upkeep status
npm run chainlink:upkeep-info -- --id $UPKEEP_ID

# Fund upkeep
npm run chainlink:fund-upkeep -- --id $UPKEEP_ID --amount 5

# Pause upkeep (emergency)
npm run chainlink:pause-upkeep -- --id $UPKEEP_ID

# Resume upkeep
npm run chainlink:resume-upkeep -- --id $UPKEEP_ID
```

### Cost Monitoring

```bash
# Generate monthly LINK usage report
npm run chainlink:usage-report -- --month 2024-01

# Estimate upcoming costs
npm run chainlink:estimate-costs
```

---

## Compliance Operations

### KYC Management

```bash
# Review pending KYC applications
npm run kyc:list-pending

# Manually approve/reject (if needed)
npm run kyc:review -- --user $USER_ID --action approve

# Check KYC expiring soon
npm run kyc:expiring -- --days 30

# Trigger re-verification
npm run kyc:reverify -- --user $USER_ID
```

### Whitelist Management

```bash
# Add address to whitelist
npm run whitelist:add -- --address $ADDRESS --reason "KYC verified"

# Batch add
npm run whitelist:add-batch -- --file whitelist.csv

# Remove from whitelist
npm run whitelist:remove -- --address $ADDRESS

# Export whitelist
npm run whitelist:export -- --output whitelist.csv
```

### Transfer Restrictions

```bash
# Check if transfer would be allowed
npm run compliance:check-transfer -- \
  --from $FROM_ADDRESS \
  --to $TO_ADDRESS \
  --amount 1000

# Freeze account (emergency)
npm run compliance:freeze -- --address $ADDRESS --reason "Investigation"

# Unfreeze account
npm run compliance:unfreeze -- --address $ADDRESS
```

### Reporting

```bash
# Generate compliance report
npm run compliance:report -- --period monthly --month 2024-01

# Export investor list
npm run compliance:export-investors -- --output investors.csv

# Audit trail export
npm run compliance:audit-trail -- --address $ADDRESS --output audit.csv
```

---

## Backup & Recovery

### Backup Schedule

| Data | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Database | Hourly | 30 days | S3 |
| Redis | Daily | 7 days | S3 |
| Configs | On change | Forever | Git |
| Secrets | On change | Versioned | Vault |

### Database Backup

```bash
# Manual backup
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz

# Upload to S3
aws s3 cp backup-*.sql.gz s3://backups/database/

# Verify backup
gunzip -c backup-*.sql.gz | head -100
```

### Database Restore

```bash
# 1. List available backups
aws s3 ls s3://backups/database/

# 2. Download backup
aws s3 cp s3://backups/database/backup-20240101.sql.gz .

# 3. Restore to new database
gunzip -c backup-20240101.sql.gz | psql $NEW_DATABASE_URL

# 4. Verify data integrity
psql $NEW_DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# 5. Switch over (if production restore)
# Update connection strings
```

### Disaster Recovery

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Database failure | 1 hour | 1 hour | Restore from backup |
| Region failure | 4 hours | 1 hour | Failover to DR region |
| Data corruption | 2 hours | Varies | Point-in-time recovery |

---

## Runbook Quick Reference

### Common Commands

```bash
# System health
curl https://api.yourservice.com/health

# View logs
kubectl logs -l app=api-server -f

# Check LINK balances
npm run check:link-balances

# Enable maintenance mode
npm run maintenance:enable

# Disable maintenance mode
npm run maintenance:disable

# Emergency pause contracts
npm run contracts:pause-all
```

### Important Links

- **Status Page**: https://status.yourservice.com
- **Documentation**: https://docs.yourservice.com
- **Grafana**: https://grafana.internal
- **PagerDuty**: https://yourcompany.pagerduty.com
