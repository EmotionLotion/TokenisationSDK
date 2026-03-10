# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **4-package SDK architecture:** The monolithic `@tokenisation/sdk` has been refactored into four layered packages:
  - `@tokenisation/core` — Asset-class-agnostic foundation (engines, errors, types, plugins, API client, providers)
  - `@tokenisation/compliance` — KYC/AML, identity claims, jurisdiction enforcement, policy registry
  - `@tokenisation/chains` — Blockchain interaction, smart contract adapters, Chainlink oracles, account abstraction, MPC custody, ZKP
  - `@tokenisation/realestate` — UAE real estate tokenization with DLD integration, VARA compliance, 11-state lifecycle
- Build order: `core` → `compliance` | `chains` (parallel) → `realestate` → `sdk`
- Backward compatibility: `@tokenisation/sdk` umbrella package unchanged — it re-exports everything from the four packages
- Teams can now install only what they need (e.g., `@tokenisation/core` alone for non-real-estate verticals)
- Package README documentation for all four new packages
- Comprehensive error code reference documentation (51 codes across 9 error classes)
- Industry vertical support: airline, hotel, car rental, concert ticket APIs with dedicated route files, services, and NFT contracts
- Sanctions screening integration (OFAC/UN lists) with auto-refresh on startup
- Persistent signing key service (`AutoFileSigningService`) — keys survive server restarts
- RPC configuration validation at server startup with production warnings
- SDK vertical React components: BoardingPass (SVG barcode), SeatSelectionMap, RoomSelector, RentalCalendar, VenueMap
- React Native SDK wired to API client for signMessage, sendTransaction, and balance queries
- Examples environment config with `--testnet` mode and Sepolia defaults
- GitHub issue templates and PR template
- CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md

### Changed
- Compliance route now calls real `screenInvestorSanctions()` instead of hardcoded `'clear'`
- DemoWizard computes distribution percentages from amounts instead of hardcoding strings
- SeatSelectionMap defaults to empty `blockedSeats` instead of hardcoded demo values
- BoardingPass renders SVG Code 128 barcode instead of ASCII fallback
- RoomSelector supports `room.image` property for real photos
- Package manager standardized to pnpm 9+ across all workspaces

### Fixed
- SQLite schema compatibility for conformance tests
- Date handling in token service for SQLite
- Missing columns in audit_log, ledger_positions, ledger_events tables
- React hooks violation in useWallet.ts (useTokenisation called inside useCallback)

## [1.0.0] - 2026-01-15

### Added

#### SDK
- Core `ApiClient` with 27 modules: assets, tokens, transfers, investors, compliance, governance, escrow, cashFlow, audit, events, tickets, DLD, and more
- ERC-3643 compliant token adapters with full T-REX lifecycle
- Multi-standard support: ERC-20, ERC-721, ERC-1155, ERC-1410, ERC-4626, ERC-5192 (Soulbound)
- 13 pre-built asset packs: UAE Real Estate, US Securities, Airline Tickets, Hotel Reservations, Car Rental, Concert Tickets, Loyalty Points, Carbon Credits, and more
- Wallet plugins: MetaMask, WalletConnect v2, SIWE authentication
- Chainlink integration: Price Feeds, Automation (Keepers), Functions, CCIP bridge, Proof of Reserve
- Storage plugins: IPFS, S3
- Compliance plugins: KYC verification, jurisdiction rules, sanctions screening
- Plugin registry with lifecycle management
- Pre-built React components: TokenizeButton, AssetWizard, AssetCard, TransferForm, BalanceDisplay
- Deployment service supporting Ethereum, Polygon, Base, Arbitrum, Optimism + testnets

#### Server
- Express REST API with 50 route modules
- PostgreSQL and SQLite database support via Drizzle ORM (60+ tables)
- SIWE + JWT and API key authentication
- Role-based access control (IAM)
- Audit logging with hash chain integrity
- Webhook system with retry logic
- Event bus for async processing with dead letter queue
- Rate limiting middleware (Redis-backed)
- Idempotency middleware for safe retries
- Payment rails: Stripe and Circle USDC providers
- Custody adapters: BitGo and Fireblocks
- KYC provider: Sumsub integration
- Signing service: Ephemeral, File-based PEM, AWS KMS backends
- Dubai Land Department (DLD) integration
- Chainlink oracle services: flight data, NAV feeds, automation

#### Smart Contracts
- `ComplianceToken` — ERC-20 with ERC-3643 compliance (UUPS upgradeable)
- `ComplianceMultiToken` — ERC-1155 with per-token compliance
- `ComplianceTokenUpgradeable` — Full upgradeable variant
- `IdentityRegistry` — KYC/AML claim management (ERC-734/735)
- `ModularCompliance` — Pluggable compliance modules
- `TokenFactory` — CREATE2 deterministic deployment
- `TokenGovernor` — On-chain governance with timelock
- `DividendDistributor` — Dividend payment management
- `OracleRegistry` — Chainlink data feed aggregation
- `ProofOfReserve` — Reserve verification
- `CCIPBridge` — Cross-chain token transfers
- Vertical NFTs: `AirlineTicketNFT`, `HotelReservationNFT`, `CarRentalNFT`, `ConcertTicketNFT`
- `AccessPassNFT`, `ReputationSBT`, `AhoyToken`, `RealToken`
- Compliance modules: Country restrictions, max balance, max holders, transfer fees
- 108 tests across 5 test suites

#### UI Dashboard
- React admin dashboard (Vite + Tailwind CSS)
- Pages: Dashboard, Policy Studio, Identities, Transactions, Oracles, Payouts, Developers
- 18 vertical demo apps (Real Estate, Airline, Hotel, Car Rental, Concert, DePIN, etc.)
- DemoWizard for guided tokenization flow

#### UI Kit
- 50+ shared React components: AssetCard, CapTable, KYCModal, TransactionFlow, WalletConnectModal, etc.
- Storybook stories for key components
- i18n support, analytics integration, embed system

#### Infrastructure
- pnpm monorepo with workspaces
- Kubernetes manifests, Helm charts, Terraform modules in `deploy/`
- Conformance test suite (`@tokenisation/conformance-suite`)
- Project scaffolding CLI (`create-tokenised-asset`)

### Security
- Argon2 password hashing
- Webhook payload signing with cryptographic verification
- Input validation with Zod
- CORS configuration
- Request logging and tracing
- Signed compliance DecisionReceipts

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

## Known Issues

1. Smart contracts have not been professionally audited — see [SECURITY_AUDIT_CHECKLIST.md](SECURITY_AUDIT_CHECKLIST.md)
2. Server has pre-existing TypeScript errors in vertical services (hotel, car-rental, concert) and AWS KMS module resolution
3. React Native SDK uses simulated wallet connection (WalletConnect v2 integration planned)
