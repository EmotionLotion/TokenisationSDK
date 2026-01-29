# Smart Contract Audit Checklist

Use this checklist during security audits. Mark each item as you complete the review.

## Audit Information

| Field | Value |
|-------|-------|
| **Contract Name** | |
| **Version/Commit** | |
| **Auditor** | |
| **Date Started** | |
| **Date Completed** | |
| **Solidity Version** | |

---

## 1. Access Control

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| AC-01 | Owner-only functions are protected | [ ] | |
| AC-02 | Agent-only functions are protected | [ ] | |
| AC-03 | Role changes emit events | [ ] | |
| AC-04 | Two-step ownership transfer | [ ] | |
| AC-05 | No privilege escalation paths | [ ] | |
| AC-06 | Default roles are safe | [ ] | |

---

## 2. Reentrancy Protection

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| RE-01 | External calls follow CEI pattern | [ ] | |
| RE-02 | ReentrancyGuard on sensitive functions | [ ] | |
| RE-03 | Cross-function reentrancy analyzed | [ ] | |
| RE-04 | Callbacks handled safely | [ ] | |

---

## 3. Arithmetic Safety

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| AR-01 | Using Solidity 0.8+ built-in checks | [ ] | |
| AR-02 | Unchecked blocks reviewed | [ ] | |
| AR-03 | Safe downcasting | [ ] | |
| AR-04 | Division by zero prevented | [ ] | |
| AR-05 | Multiplication before division | [ ] | |

---

## 4. Input Validation

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| IV-01 | Zero address checks | [ ] | |
| IV-02 | Array length validation | [ ] | |
| IV-03 | Amount validation (non-zero) | [ ] | |
| IV-04 | Boundary conditions | [ ] | |
| IV-05 | String/bytes length limits | [ ] | |

---

## 5. Token Standard Compliance

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| TS-01 | ERC-20 transfer returns bool | [ ] | |
| TS-02 | ERC-20 approve returns bool | [ ] | |
| TS-03 | Transfer events emitted | [ ] | |
| TS-04 | Approval events emitted | [ ] | |
| TS-05 | Zero amount transfers allowed | [ ] | |
| TS-06 | Self transfers handled | [ ] | |

---

## 6. ERC-3643 Specific

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| T3-01 | Identity registry integration | [ ] | |
| T3-02 | Compliance contract integration | [ ] | |
| T3-03 | Transfers verify identity | [ ] | |
| T3-04 | Compliance canTransfer called | [ ] | |
| T3-05 | Mint notifies compliance | [ ] | |
| T3-06 | Burn notifies compliance | [ ] | |
| T3-07 | Freeze functionality | [ ] | |
| T3-08 | Partial freeze functionality | [ ] | |
| T3-09 | Recovery mechanism | [ ] | |
| T3-10 | Pause/unpause functionality | [ ] | |
| T3-11 | Batch operations validated | [ ] | |
| T3-12 | Agent role properly restricted | [ ] | |

---

## 7. State Management

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| SM-01 | State consistent after failure | [ ] | |
| SM-02 | No uninitialized state | [ ] | |
| SM-03 | Proper initialization protection | [ ] | |
| SM-04 | Storage gaps for upgradeability | [ ] | |
| SM-05 | No storage collisions | [ ] | |

---

## 8. External Interactions

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| EI-01 | External calls return values checked | [ ] | |
| EI-02 | Failed calls handled properly | [ ] | |
| EI-03 | Untrusted contracts identified | [ ] | |
| EI-04 | Call depth attacks prevented | [ ] | |

---

## 9. Denial of Service

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| DS-01 | No unbounded loops | [ ] | |
| DS-02 | Batch limits enforced | [ ] | |
| DS-03 | Gas griefing prevented | [ ] | |
| DS-04 | Emergency pause exists | [ ] | |
| DS-05 | Funds not stuck | [ ] | |

---

## 10. Events and Logging

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| EV-01 | All state changes emit events | [ ] | |
| EV-02 | Events have indexed parameters | [ ] | |
| EV-03 | Event parameters correct | [ ] | |
| EV-04 | No sensitive data in events | [ ] | |

---

## 11. Gas Efficiency

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| GE-01 | Storage variables packed | [ ] | |
| GE-02 | Memory used appropriately | [ ] | |
| GE-03 | SLOAD/SSTORE minimized | [ ] | |
| GE-04 | Immutable where possible | [ ] | |
| GE-05 | Short-circuit evaluation | [ ] | |

---

## 12. Code Quality

| ID | Check | Status | Notes |
|----|-------|--------|-------|
| CQ-01 | NatSpec documentation complete | [ ] | |
| CQ-02 | Meaningful error messages | [ ] | |
| CQ-03 | No dead code | [ ] | |
| CQ-04 | Consistent naming | [ ] | |
| CQ-05 | Functions appropriately sized | [ ] | |

---

## Findings Summary

### Critical

| ID | Description | Status | Fixed In |
|----|-------------|--------|----------|
| | | | |

### High

| ID | Description | Status | Fixed In |
|----|-------------|--------|----------|
| | | | |

### Medium

| ID | Description | Status | Fixed In |
|----|-------------|--------|----------|
| | | | |

### Low

| ID | Description | Status | Fixed In |
|----|-------------|--------|----------|
| | | | |

### Informational

| ID | Description | Status | Fixed In |
|----|-------------|--------|----------|
| | | | |

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Lead Auditor | | | |
| Secondary Reviewer | | | |
| Project Lead | | | |

---

*Template Version: 1.0.0*
