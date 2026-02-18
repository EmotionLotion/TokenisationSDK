# Security Policy

## Reporting a Vulnerability

The Tokenisation SDK team takes security vulnerabilities seriously. We appreciate your efforts to responsibly disclose your findings.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please report security vulnerabilities by emailing:

**security@ahoy.fund**

Include the following information:

1. **Description** - Clear description of the vulnerability
2. **Impact** - What an attacker could achieve
3. **Steps to Reproduce** - Detailed reproduction steps
4. **Affected Components** - Which parts of the codebase
5. **Suggested Fix** - If you have one (optional)

### Response Timeline

| Timeline | Action |
|----------|--------|
| 24 hours | Acknowledgment of report |
| 72 hours | Initial assessment and severity rating |
| 7 days | Detailed response with remediation plan |
| 90 days | Target resolution for critical issues |

## Scope

### In Scope

- **Smart Contracts** (`contracts/src/`)
  - Token contracts (ComplianceToken, ComplianceMultiToken, ComplianceTokenUpgradeable)
  - Identity Registry and claim management
  - Compliance modules (ModularCompliance, country/balance/holder restrictions)
  - Token Factory (CREATE2 deployment)
  - Governance contracts (TokenGovernor, timelock)
  - Dividend Distributor
  - Vertical NFTs (Airline, Hotel, Car Rental, Concert)
  - Chainlink integrations (OracleRegistry, ProofOfReserve, CCIPBridge)

- **SDK** (`sdk/src/`)
  - Authentication flows
  - API client and all modules
  - Contract adapters
  - Wallet plugins (MetaMask, WalletConnect, SIWE)
  - Compliance plugins (KYC, jurisdiction, sanctions)

- **Server** (`server/src/`)
  - API endpoints (50 route modules)
  - Authentication/authorization (SIWE, JWT, API keys)
  - Database operations (Drizzle ORM)
  - Signing service (RSA key management)
  - Sanctions screening service
  - Payment rails (Stripe, Circle USDC)
  - Custody adapters (BitGo, Fireblocks)

- **React SDKs** (`sdk-react/`, `sdk-react-native/`)
  - Provider components
  - Wallet connectivity
  - KYC flows

### Out of Scope

- Third-party dependencies (report to upstream)
- Issues in test/example code only
- Social engineering attacks
- Denial of service attacks

## Severity Levels

| Level | Description | Examples |
|-------|-------------|----------|
| **Critical** | Immediate risk to funds | Private key exposure, unauthorized minting, compliance bypass |
| **High** | Significant security impact | Authentication bypass, SQL injection, signing key leakage |
| **Medium** | Limited security impact | Information disclosure, privilege escalation |
| **Low** | Minimal impact | Minor information leaks |

## Known Limitations

1. Smart contracts have not been professionally audited — see [SECURITY_AUDIT_CHECKLIST.md](SECURITY_AUDIT_CHECKLIST.md)
2. Development auth bypass exists (`AUTH_DEV_MODE`) — must be disabled in production
3. Default signing service auto-generates file-based RSA keys; production deployments should use AWS KMS via `SIGNING_PROVIDER=kms`
4. All chains default to public RPCs; production should configure private RPC URLs

## Security Best Practices

### For Partners

1. **Private Keys** - Use hardware wallets, never share keys
2. **API Keys** - Rotate regularly, use scoped permissions
3. **Environment** - Never commit `.env` files
4. **Contracts** - Verify addresses before interacting
5. **Signing** - Set `SIGNING_PROVIDER=kms` in production

### For Developers

1. **Dependencies** - Run `pnpm audit` regularly
2. **Code Review** - All changes require review
3. **Testing** - Write security-focused tests
4. **Secrets** - Use secrets management, not env files
5. **RPC URLs** - Configure private RPC endpoints for production chains

## Bug Bounty

We are evaluating a bug bounty program. Details will be announced when available.

## Contact

- **Security issues:** security@ahoy.fund
- **General questions:** [GitHub Issues](https://github.com/EmotionLotion/TokenisationSDK/issues)
