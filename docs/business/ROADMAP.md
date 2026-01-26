# Production Roadmap: Visual Timeline

## 16-Week Path to Production

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION ROADMAP                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PHASE 1: SECURITY (Week 1-2)                                      CRITICAL    │
│  ════════════════════════════                                                   │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ Fix fail-open in VerificationService                      │               │
│  │ □ Fix fail-open in PolicyEvaluator                          │               │
│  │ □ Add compliance audit logging                              │               │
│  │ □ Add strict mode configuration                             │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: 1 engineer, 2 weeks | Cost: ~$10k                                     │
│                                                                                 │
│  PHASE 2: PERSISTENCE (Week 2-4)                                    HIGH       │
│  ═══════════════════════════════                                               │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ PostgreSQL EventStore implementation                      │               │
│  │ □ PostgreSQL StoragePlugin                                  │               │
│  │ □ Redis caching layer                                       │               │
│  │ □ Migration scripts and tooling                             │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: 1 engineer, 2 weeks | Cost: ~$20k                                     │
│                                                                                 │
│  PHASE 3: KYC INTEGRATION (Week 4-6)                                HIGH       │
│  ═══════════════════════════════════                                           │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ Select KYC provider (Jumio/Onfido/Persona)                │               │
│  │ □ Implement KYCProviderPlugin                               │               │
│  │ □ Webhook handler for async verification                    │               │
│  │ □ Accredited investor verification                          │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: 1 engineer, 2 weeks | Cost: ~$30k (incl. provider fees)               │
│                                                                                 │
│  PHASE 4: SMART CONTRACT AUDIT (Week 6-10)                      CRITICAL       │
│  ═════════════════════════════════════════                                     │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ Pre-audit code freeze and documentation                   │               │
│  │ □ Engage auditor (Trail of Bits/OZ/Halborn)                 │               │
│  │ □ Audit execution (3-4 weeks external)                      │               │
│  │ □ Remediation of findings                                   │               │
│  │ □ Publish audit report                                      │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: External | Cost: $50-150k                                             │
│                                                                                 │
│  PHASE 5: ORACLE HARDENING (Week 8-10)                              MEDIUM     │
│  ═════════════════════════════════════                                         │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ Default to Chainlink DataFeedPlugin                       │               │
│  │ □ Remove mock data from production path                     │               │
│  │ □ Proof of Reserve integration                              │               │
│  │ □ NAV calculation service                                   │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: 0.5 engineer, 2 weeks | Cost: ~$10k                                   │
│                                                                                 │
│  PHASE 6: LEGAL & COMPLIANCE (Week 10-14)                       CRITICAL       │
│  ════════════════════════════════════════                                      │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ Engage securities counsel                                 │               │
│  │ □ Token classification legal opinion                        │               │
│  │ □ Terms of service / privacy policy                         │               │
│  │ □ AML/KYC policy documentation                              │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: External | Cost: $20-50k                                              │
│                                                                                 │
│  PHASE 7: PRODUCTION INFRA (Week 12-16)                             HIGH       │
│  ══════════════════════════════════════                                        │
│  ┌─────────────────────────────────────────────────────────────┐               │
│  │ □ Kubernetes cluster setup                                  │               │
│  │ □ Database HA and backups                                   │               │
│  │ □ Monitoring and alerting                                   │               │
│  │ □ Security hardening / pen test                             │               │
│  │ □ Disaster recovery procedures                              │               │
│  └─────────────────────────────────────────────────────────────┘               │
│  Effort: 0.5 DevOps, 4 weeks | Cost: ~$40k                                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Gantt View

```
Week:    1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
Security ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
Persist  ░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
KYC      ░░░░░░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
Audit    ░░░░░░░░░░░░░░░░░░░░████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
Oracle   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
Legal    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████████████░░░░░░░░░░░░░░░
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
Infra    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████████████████████████
         │    │    │    │    │    │    │    │    │    │    │    │    │    │    │    │
         ▲                        ▲                        ▲                        ▲
         │                        │                        │                        │
      START                  AUDIT START              LEGAL DONE              PRODUCTION
```

## Critical Path Items

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  BLOCKERS - Must Complete Before Production                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  🔴 BLOCKER 1: Security Fixes                                                   │
│     └── Fail-open compliance is a showstopper                                   │
│         └── Cannot deploy until fixed (Week 1-2)                                │
│                                                                                 │
│  🔴 BLOCKER 2: Smart Contract Audit                                             │
│     └── No institutional user will touch unaudited contracts                    │
│         └── Must have before any serious deployment                             │
│                                                                                 │
│  🔴 BLOCKER 3: Legal Opinion                                                    │
│     └── Token classification determines everything                              │
│         └── Securities vs utility affects all compliance                        │
│                                                                                 │
│  🟡 HIGH PRIORITY: Persistence                                                  │
│     └── Data loss on restart = unusable product                                 │
│         └── PostgreSQL implementation (Week 2-4)                                │
│                                                                                 │
│  🟡 HIGH PRIORITY: KYC Provider                                                 │
│     └── Compliance engine needs real identity verification                      │
│         └── Cannot do real transactions without it                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Budget Summary

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  INVESTMENT BREAKDOWN                                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Development (Internal)                                                         │
│  ├── Security Fixes ........................... $10,000                         │
│  ├── Persistence Layer ........................ $20,000                         │
│  ├── KYC Integration .......................... $20,000                         │
│  ├── Oracle Hardening ......................... $10,000                         │
│  └── Production Infrastructure ................ $30,000                         │
│                                            ─────────────                        │
│                                    Subtotal:   $90,000                          │
│                                                                                 │
│  External Services                                                              │
│  ├── Smart Contract Audit ............... $50,000 - $150,000                    │
│  ├── Legal Opinion ...................... $20,000 - $50,000                     │
│  ├── KYC Provider (Year 1) .............. $10,000 - $20,000                     │
│  ├── Penetration Testing ................ $10,000 - $20,000                     │
│  └── Infrastructure (Year 1) ............ $20,000 - $40,000                     │
│                                            ─────────────                        │
│                                    Subtotal:   $110,000 - $280,000              │
│                                                                                 │
│  ═══════════════════════════════════════════════════════════════                │
│  TOTAL INVESTMENT:                             $200,000 - $370,000              │
│  ═══════════════════════════════════════════════════════════════                │
│                                                                                 │
│  Timeline: 16 weeks                                                             │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Quick Reference: Immediate Actions

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  THIS WEEK - DO NOW                                                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Day 1-2: Fix VerificationService                                               │
│  ───────────────────────────────                                                │
│  File: sdk/src/services/VerificationService.ts                                  │
│  Line: ~158                                                                     │
│  Change: if (!keyEntry) return ok(undefined)                                    │
│      To: if (!keyEntry) return err('Unknown signer rejected')                   │
│                                                                                 │
│  Day 2-3: Fix PolicyEvaluator                                                   │
│  ───────────────────────────                                                    │
│  File: sdk/src/core/PolicyEvaluator.ts                                          │
│  Line: ~72                                                                      │
│  Change: if (!this.registry) return result                                      │
│      To: if (!this.registry) return { violations: ['No plugins'] }              │
│                                                                                 │
│  Day 3-4: Add Audit Logging                                                     │
│  ─────────────────────────                                                      │
│  - Log all compliance check requests                                            │
│  - Log all decisions (pass/fail/reason)                                         │
│  - Structured JSON format                                                       │
│                                                                                 │
│  Day 5: Test & Verify                                                           │
│  ──────────────────                                                             │
│  - Unit tests for rejection cases                                               │
│  - Integration test full compliance flow                                        │
│  - Verify no regression in existing tests                                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Milestone Checkpoints

| Milestone | Week | Deliverable | Success Criteria |
|-----------|------|-------------|------------------|
| M1: Secure | 2 | Security fixes deployed | All compliance checks fail-closed |
| M2: Persistent | 4 | PostgreSQL integration | Data survives restart |
| M3: Verified | 6 | KYC provider live | Real identity verification working |
| M4: Audited | 10 | Audit report published | No critical/high findings open |
| M5: Legal | 14 | Legal opinion received | Token classification clear |
| M6: Production | 16 | Production deployment | Full system operational |

---

*Document generated: January 2026*
