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
  - Token contracts (ComplianceToken, ComplianceMultiToken)
  - Identity Registry
  - Compliance modules
  - Token Factory
  - Dividend Distributor

- **SDK** (`sdk/src/`)
  - Authentication flows
  - API client
  - Contract adapters
  - Wallet plugins

- **Server** (`server/src/`)
  - API endpoints
  - Authentication/authorization
  - Database operations

### Out of Scope

- Third-party dependencies (report to upstream)
- Issues in test/example code only
- Social engineering attacks
- Denial of service attacks

## Severity Levels

| Level | Description | Examples |
|-------|-------------|----------|
| **Critical** | Immediate risk to funds | Private key exposure, unauthorized minting, compliance bypass |
| **High** | Significant security impact | Authentication bypass, SQL injection |
| **Medium** | Limited security impact | Information disclosure, privilege escalation |
| **Low** | Minimal impact | Minor information leaks |

## Known Limitations

The following are known limitations documented in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md):

1. Smart contracts have not been professionally audited
2. No upgradeable proxy pattern implemented yet
3. No timelock/multi-sig governance yet
4. Development auth bypass exists (disabled in production)

## Security Best Practices

### For Partners

1. **Private Keys** - Use hardware wallets, never share keys
2. **API Keys** - Rotate regularly, use scoped permissions
3. **Environment** - Never commit `.env` files
4. **Contracts** - Verify addresses before interacting

### For Developers

1. **Dependencies** - Run `npm audit` regularly
2. **Code Review** - All changes require review
3. **Testing** - Write security-focused tests
4. **Secrets** - Use secrets management, not env files

## Bug Bounty

We are evaluating a bug bounty program. Details will be announced when available.

## Contact

- **Security issues:** security@ahoy.fund
- **General questions:** [GitHub Discussions](https://github.com/EmotionLotion/TokenisationSDK/discussions)
