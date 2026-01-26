# Security Model

## Overview

This document outlines security considerations, known limitations, and best practices for the TokenisationSDK.

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                              │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Input Validation (Zod schemas)                        │
│  Layer 2: Authentication (SIWE / JWT)                           │
│  Layer 3: Authorization (Role-based access)                     │
│  Layer 4: Compliance Engine (Transfer rules)                    │
│  Layer 5: Smart Contract Checks (On-chain enforcement)          │
└─────────────────────────────────────────────────────────────────┘
```

## Current Implementation Status

### Implemented
- Input validation with Zod schemas
- Role-based authorization
- KYC verification requirements
- Transfer mode enforcement
- Whitelist management
- Event audit logging

### Production Requirements (Not Yet Implemented)
- Real KYC provider integration
- Hardware security module (HSM) for keys
- Rate limiting
- Multi-signature operations
- Security audit of smart contracts

## Known Security Considerations

### 1. Fail-Open Compliance (CRITICAL)

**Issue:** The mock compliance plugin approves transfers for unknown signers.

**Current Behavior:**
```typescript
// MockCompliancePlugin - approves if signer not in whitelist
async evaluateTransfer(from, to, asset, amount) {
  if (!this.whitelist.has(to.id)) {
    return { approved: true }; // FAIL-OPEN
  }
}
```

**Recommendation:** Production deployments MUST use fail-closed compliance:
```typescript
async evaluateTransfer(from, to, asset, amount) {
  if (!this.whitelist.has(to.id)) {
    return { approved: false, reason: 'Not whitelisted' }; // FAIL-CLOSED
  }
}
```

### 2. Mock Plugins in Production

**Issue:** Default plugins are for development only.

**Check:** Ensure `useMockPlugins: false` in production:
```typescript
// WRONG for production
const sdk = new TokenisationSDK({ useMockPlugins: true });

// CORRECT for production
const sdk = new TokenisationSDK({ useMockPlugins: false });
sdk.plugins.register('compliance', new ProductionCompliancePlugin());
sdk.plugins.register('storage', new ApiStoragePlugin(apiClient));
```

### 3. Smart Contract Security

**Status:** Contracts follow ERC-3643 standard but are NOT audited.

**Before Mainnet Deployment:**
- Professional security audit required
- Formal verification recommended
- Bug bounty program suggested

### 4. Key Management

**Current:** No HSM integration.

**Recommendation:**
- Use hardware wallets for deployment keys
- Implement multi-sig for admin operations
- Never store private keys in code or config files

## Authentication Flow

### SIWE (Sign-In With Ethereum)

```
1. Client requests nonce: GET /auth/siwe/nonce
2. User signs message with wallet
3. Server verifies signature: POST /auth/siwe/verify
4. Server issues JWT token
5. Client includes JWT in Authorization header
```

### JWT Security

- Tokens expire after 24 hours
- Refresh tokens available for extended sessions
- Tokens are invalidated on logout
- HTTPS required for all API calls

## Authorization Model

### Role Hierarchy

```
ADMIN
  └── OPERATOR
        └── ISSUER
              └── VERIFIER
                    └── CUSTODIAN
                          └── INVESTOR
```

### Permission Matrix

| Action | ADMIN | OPERATOR | ISSUER | VERIFIER | INVESTOR |
|--------|-------|----------|--------|----------|----------|
| Create Asset | Yes | Yes | Yes | No | No |
| Verify Asset | Yes | Yes | No | Yes | No |
| Mint Tokens | Yes | Yes | Yes | No | No |
| Transfer | Yes | Yes | Yes | Yes | Yes |
| Freeze | Yes | Yes | No | No | No |
| Burn | Yes | Yes | Yes | No | No |

## Input Validation

All inputs are validated using Zod schemas:

```typescript
const CreateAssetSchema = z.object({
  name: z.string().min(1).max(256),
  rightType: z.enum(['OWNERSHIP', 'ACCESS', 'BEHAVIOR', 'VERIFICATION']),
  issuerId: z.string().uuid(),
  jurisdiction: z.object({
    countryCode: z.string().length(2),
  }),
});
```

## Audit Logging

All operations are logged to the EventStore:

```typescript
interface AuditEvent {
  id: string;
  type: string;
  actorId: string;
  targetId: string;
  action: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  ipAddress?: string;
}
```

## Security Checklist

### Development
- [ ] Use mock plugins only in development
- [ ] Never commit secrets to version control
- [ ] Test with different permission levels
- [ ] Validate all user inputs

### Staging
- [ ] Enable HTTPS
- [ ] Use real authentication
- [ ] Test fail-closed compliance
- [ ] Review audit logs

### Production
- [ ] Professional security audit
- [ ] HSM for key management
- [ ] Multi-sig for admin operations
- [ ] Rate limiting enabled
- [ ] DDoS protection
- [ ] Regular security reviews
- [ ] Incident response plan
- [ ] Bug bounty program

## Reporting Security Issues

If you discover a security vulnerability:

1. Do NOT create a public issue
2. Email security details privately
3. Allow time for fix before disclosure
4. Coordinate on disclosure timeline

## Related Documents

- [Architecture Overview](./OVERVIEW.md) - System design
- [Plugin System](./PLUGINS.md) - Plugin security
