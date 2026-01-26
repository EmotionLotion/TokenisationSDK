# TokenisationSDK Documentation

> **"A Tokenisation SDK is a programmable factory that turns real-world rights, assets, or actions into verifiable, rule-based digital tokens."**

## Documentation Index

### Getting Started
| Document | Description |
|----------|-------------|
| [Quick Start](./guides/QUICKSTART.md) | Get your first asset tokenized in 5 minutes |
| [Installation](./guides/INSTALLATION.md) | Detailed setup instructions |
| [First Project](./guides/FIRST_PROJECT.md) | Step-by-step tutorial |

### Guides
| Document | Description |
|----------|-------------|
| [SDK Usage](./guides/SDK_USAGE.md) | Complete SDK API guide |
| [UI Kit](./guides/UI_KIT.md) | React component library |
| [Server Setup](./guides/SERVER_SETUP.md) | API server configuration |
| [Demo Walkthrough](./guides/MVP_SHOWCASE.md) | Full feature demonstration |

### Architecture & Reference
| Document | Description |
|----------|-------------|
| [Architecture Overview](./architecture/OVERVIEW.md) | System design and patterns |
| [Plugin System](./architecture/PLUGINS.md) | Extending the SDK |
| [Lifecycle Engine](./architecture/LIFECYCLE.md) | State machine documentation |
| [Security Model](./architecture/SECURITY.md) | Security considerations |

### API Reference
| Document | Description |
|----------|-------------|
| [SDK API](./reference/SDK_API.md) | Core SDK methods |
| [REST API](./reference/REST_API.md) | Server endpoints |
| [Smart Contracts](./reference/CONTRACTS.md) | Solidity contracts |

### Business & Planning
| Document | Description |
|----------|-------------|
| [Executive Summary](./business/EXECUTIVE_SUMMARY.md) | Product overview |
| [Roadmap](./business/ROADMAP.md) | Development timeline |
| [Implementation Plan](./business/IMPLEMENTATION_PLAN.md) | Original SDK plan |

---

## Quick Links

```bash
# Install SDK
npm install @tokenisation/sdk

# Run demo UI
cd ui && npm run dev

# Run API server
cd server && npm run dev
```

## Project Structure

```
TokenisationSDK/
├── sdk/                 # Core TypeScript SDK
├── contracts/           # Solidity smart contracts
├── server/              # Express API server
├── ui/                  # React dashboard
├── ui-kit/              # Reusable React components
└── docs/                # This documentation
    ├── guides/          # How-to guides
    ├── architecture/    # Design documents
    ├── reference/       # API documentation
    └── business/        # Business documents
```

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| SDK Core | 100% | Lifecycle, compliance, plugins (56 tests passing) |
| Smart Contracts | 100% | ERC-3643 compliant |
| API Server | 95% | SQLite/PostgreSQL ready |
| UI Dashboard | 100% | Full platform interface |
| UI Kit | 100% | 8 drop-in components |
| Token Adapters | 100% | ERC20, ERC721, Soulbound, ERC1410, ERC4626 |
| Vertical Integrations | 100% | COMET, Fly+, H2O hooks |
| AHOY Economy | 100% | Staking, rewards, governance |

## UI Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | EcosystemHub | Main dashboard |
| `/app/comet` | CometApp | COMET Logistics vertical |
| `/app/flyplus` | FlyPlusApp | Fly+ Aviation vertical |
| `/app/h2o` | H2OApp | H2O Utilities vertical |
| `/app/ams` | AMSApp | AMS Marketplace |
| `/app/trouve` | TrouveApp | Trouve service |
| `/app/connect` | ConnectApp | Connect service |
| `/app/equity` | EquityApp | Equity management |
| `/factory` | AssetClassWizard | Visual asset factory (4-step wizard) |
| `/identity` | IdentityProfile | DID/credential management |
| `/marketplace` | UnifiedMarketplace | Cross-vertical trading |
| `/oracle-manager` | OracleManager | Data feed configuration |
| `/staking` | StakingDashboard | AHOY token staking |
| `/cashflow` | CashFlowDashboard | Cash flow management |
| `/governance` | GovernancePortal | DAO governance |
| `/escrow` | EscrowTracker | Escrow tracking |
| `/soulbound` | SoulboundProgress | Soulbound token progress |
| `/assets` | Dashboard | Asset management |
| `/identities` | IdentitiesPage | Identity registry |
| `/policies` | PolicyStudio | Policy DSL editor |
| `/transactions` | TransactionsPage | Transaction history |
| `/oracles` | OraclesPage | Oracle status |
| `/payouts` | PayoutsPage | Payout management |
| `/developers` | DevelopersPage | Developer tools |

## React Hooks

### Blockchain Hooks (`hooks/useBlockchain.ts`)
- `useWalletConnection()` - Wallet status
- `useTokenBalance()` - ERC20 balance
- `useTokenTransfer()` - Token transfers
- `useTokenApproval()` - Spending approval
- `useNFT()` - NFT operations
- `useContractEvents()` - Event listening

### Vertical Hooks (`hooks/useVerticals.ts`)
- `useDriverReputation()` - COMET driver SBT
- `useFlyPlusPasses()` - Fly+ ticket NFTs
- `useWaterCredits()` - H2O IoT oracle credits

### Economy Hooks (`hooks/useAhoyToken.ts`)
- `useAhoyTokenInfo()` - Token metadata
- `useAhoyBalance()` - User balance
- `useAhoyStaking()` - Staking positions
- `useVesting()` - Vesting schedules
- `useRewardHistory()` - Reward tracking
- `useGovernance()` - Proposal voting

## Support

- **Issues**: Report bugs and feature requests
- **Discussions**: Ask questions and share ideas
