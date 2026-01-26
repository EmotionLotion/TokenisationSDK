# Documentation

Welcome to the Tokenisation SDK documentation.

## 📚 Table of Contents

### Getting Started
New to the SDK? Start here.

| Guide | Description |
|-------|-------------|
| [Quick Start](getting-started/QUICKSTART.md) | Get running in 5 minutes |
| [Installation](getting-started/INSTALLATION.md) | Detailed setup instructions |
| [First Project](getting-started/FIRST_PROJECT.md) | Build your first tokenized asset |

### Guides
Step-by-step tutorials for common tasks.

| Guide | Description |
|-------|-------------|
| [SDK Usage](guides/SDK_USAGE.md) | Complete SDK walkthrough |
| [Compliance Setup](guides/COMPLIANCE_SETUP.md) | Configure KYC/AML rules |
| [Chainlink Integration](guides/CHAINLINK_INTEGRATION.md) | Oracle price feeds & automation |
| [Server Setup](guides/SERVER_SETUP.md) | Deploy the API server |
| [UI Kit](guides/UI_KIT.md) | Using the component library |
| [MVP Showcase](guides/MVP_SHOWCASE.md) | Feature demonstrations |

### Architecture
Understand how the SDK works under the hood.

| Document | Description |
|----------|-------------|
| [Overview](architecture/OVERVIEW.md) | System architecture |
| [Plugins](architecture/PLUGINS.md) | Plugin system design |
| [Lifecycle](architecture/LIFECYCLE.md) | Asset state machine |
| [Security](architecture/SECURITY.md) | Security considerations |
| [Technical Review](architecture/TECHNICAL_REVIEW.md) | Deep technical analysis |

### API Reference
Complete API documentation.

| Reference | Description |
|-----------|-------------|
| [SDK API](api/SDK_API.md) | TypeScript SDK reference |
| [REST API](api/REST_API.md) | HTTP API endpoints |
| [Smart Contracts](api/CONTRACTS.md) | Solidity contract reference |
| [OpenAPI Spec](api/openapi.yaml) | OpenAPI 3.0 specification |
| [Mainnet Costs](api/MAINNET_COSTS.md) | Gas costs & pricing |

### Deployment
Production deployment and operations.

| Guide | Description |
|-------|-------------|
| [Deployment Runbook](deployment/DEPLOYMENT_RUNBOOK.md) | Step-by-step deployment |
| [Contract Addresses](deployment/DEPLOYMENT_ADDRESSES.md) | Deployed contract addresses |
| [Operations Manual](deployment/OPERATIONS_MANUAL.md) | Day-to-day operations |
| [Troubleshooting](deployment/TROUBLESHOOTING.md) | Common issues & solutions |

---

## Quick Start

```bash
# Clone the repo
git clone https://github.com/EmotionLotion/TokenisationSDK.git
cd TokenisationSDK

# Install & build SDK
cd sdk && npm install && npm run build

# Run demo UI
cd ../ui && npm install && npm run dev

# Run API server
cd ../server && npm install && npm run dev
```

## Project Structure

```
TokenisationSDK/
├── sdk/                 # Core TypeScript SDK
├── contracts/           # Solidity smart contracts
├── server/              # Express API server
├── ui/                  # React dashboard
├── examples/            # Example applications
├── docker/              # Docker deployment
└── docs/                # This documentation
    ├── getting-started/ # Quick start guides
    ├── guides/          # How-to tutorials
    ├── architecture/    # Design documents
    ├── api/             # API reference
    └── deployment/      # Operations guides
```

## Quick Links

- [Main README](../README.md) - Project overview
- [SDK Source](../sdk/) - TypeScript SDK
- [Smart Contracts](../contracts/) - Solidity contracts
- [Examples](../examples/) - Example applications
