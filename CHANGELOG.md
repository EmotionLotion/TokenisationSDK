# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Production readiness assessment documentation
- GitHub issue templates and PR template
- CONTRIBUTING.md with detailed guidelines
- CODE_OF_CONDUCT.md
- SECURITY.md with vulnerability reporting process
- CODEOWNERS for automated PR reviews

### Changed
- Improved README with ERC-3643 compliance focus
- Updated SDK examples with ApiClient usage

### Fixed
- SQLite schema compatibility for conformance tests
- Date handling in token service for SQLite
- Missing columns in audit_log, ledger_positions, ledger_events tables

## [1.0.0] - 2026-01-15

### Added

#### SDK
- Core `ApiClient` with modules for assets, tokens, transfers, investors, compliance
- ERC-3643 compliant token adapters
- Multi-standard support: ERC-20, ERC-721, ERC-1155, ERC-1410, ERC-4626, Soulbound
- Wallet plugins: MetaMask, WalletConnect v2, SIWE authentication
- Chainlink integration: Price feeds, Automation, Functions
- Storage plugins: IPFS, S3
- Compliance plugins: KYC verification, jurisdiction rules
- Input validation schemas for contract adapters

#### Server
- Express REST API with comprehensive endpoints
- PostgreSQL and SQLite database support
- JWT and API key authentication
- Role-based access control
- Audit logging with hash chain integrity
- Webhook system with retry logic
- Event bus for async processing
- Rate limiting middleware

#### Smart Contracts
- `ComplianceToken` - ERC-20 with ERC-3643 compliance
- `ComplianceMultiToken` - ERC-1155 with per-token compliance
- `IdentityRegistry` - KYC/AML claim management
- `ModularCompliance` - Pluggable compliance modules
- `TokenFactory` - CREATE2 deterministic deployment
- `DividendDistributor` - Dividend payment management
- Compliance modules: Country restrictions, max balance, max holders, transfer fees

#### Documentation
- Comprehensive guides for SDK usage, server setup, compliance
- API reference documentation
- Architecture documentation
- Deployment runbook and operations manual

### Security
- Argon2 password hashing
- Webhook payload signing
- Input validation with Zod
- CORS configuration
- Request logging and tracing

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-01-15 | Initial release |

---

## Migration Guides

### Upgrading to 1.x

This is the initial release. No migration required.

---

## Deprecations

None yet.

---

## Known Issues

See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for known limitations and required fixes before production deployment.
