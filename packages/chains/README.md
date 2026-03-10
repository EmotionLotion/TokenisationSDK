# @tokenisation/chains

> Blockchain interaction, smart contracts, oracles, and account abstraction

The chains package handles everything that touches the blockchain — EVM chain management, smart contract adapters, Chainlink oracle integration, account abstraction (ERC-4337), MPC custody, and zero-knowledge proofs.

## Installation

```bash
pnpm add @tokenisation/chains
```

Peer dependency: `@tokenisation/core`

## Quick Start

### Deploy a Compliant Token

```typescript
import { ComplianceTokenContract } from '@tokenisation/chains';

const token = new ComplianceTokenContract({
  rpcUrl: 'https://polygon-rpc.com',
  privateKey: process.env.DEPLOYER_KEY!,
});

const result = await token.deploy({
  name: 'Marina Tower Token',
  symbol: 'MTT',
  identityRegistry: '0xRegistry...',
  compliance: '0xCompliance...',
});

console.log('Deployed at:', result.address);
```

### Read a Chainlink Price Feed

```typescript
import { createDataFeedPlugin } from '@tokenisation/chains';

const priceFeed = createDataFeedPlugin({
  rpcUrl: 'https://polygon-rpc.com',
  feeds: {
    'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  },
});

const price = await priceFeed.getLatestPrice('ETH/USD');
console.log('ETH price:', price.answer.toString());
```

## Chain Management

### EVMChainPlugin

Connect to any EVM-compatible chain with pre-configured defaults for popular networks.

```typescript
import {
  EVMChainPlugin,
  createEVMChainPlugin,
  createBasePlugin,
  createPolygonPlugin,
  createEthereumPlugin,
} from '@tokenisation/chains';
```

### ChainRegistry

Global registry of chain configurations. Ships with defaults for Ethereum, Polygon, Base, and their testnets.

```typescript
import { ChainRegistry, chainRegistry, DEFAULT_CHAINS } from '@tokenisation/chains';
import { ETHEREUM_MAINNET, POLYGON_MAINNET, BASE_MAINNET, SEPOLIA, POLYGON_AMOY, BASE_SEPOLIA } from '@tokenisation/chains';
```

## Smart Contracts

### Contract Adapters

| Adapter | Standard | Operations |
|---------|----------|-----------|
| `ERC20Adapter` | ERC-20 | transfer, approve, balanceOf, allowance |
| `ERC721Adapter` | ERC-721 | mint, burn, transferFrom, ownerOf |
| `ERC1155Adapter` | ERC-1155 | safeTransferFrom, balanceOfBatch |
| `ERC1410Adapter` | ERC-1410 | transferByPartition, balanceOfByPartition |
| `ERC4626Adapter` | ERC-4626 | deposit, withdraw, previewDeposit |
| `SoulboundAdapter` | SBT | mint (non-transferable) |

```typescript
import { ERC20Adapter, ERC721Adapter, ERC1155Adapter } from '@tokenisation/chains';
```

### ComplianceTokenContract

Full ERC-3643 (T-REX) contract interaction — deployment, identity registry management, and modular compliance.

```typescript
import { ComplianceTokenContract, COMPLIANCE_TOKEN_ABI, IDENTITY_REGISTRY_ABI } from '@tokenisation/chains';
```

### Contract ABIs

All compiled Solidity ABIs are available for direct use with ethers.js or viem:

```typescript
import { abis } from '@tokenisation/chains';
```

### Validation

Zod schemas for contract parameters with address normalization and chain ID validation:

```typescript
import {
  EthereumAddressSchema,
  ChainIdSchema,
  RpcUrlSchema,
  PrivateKeySchema,
  TokenAmountSchema,
} from '@tokenisation/chains';
```

## Chainlink Integration

| Plugin | Factory | Description |
|--------|---------|-------------|
| **DataFeedPlugin** | `createDataFeedPlugin` | Read Chainlink price feeds (ETH/USD, BTC/USD, etc.) |
| **AutomationPlugin** | `createAutomationPlugin` | Chainlink Automation (Keepers) for scheduled on-chain tasks |
| **FunctionsPlugin** | `createFunctionsPlugin` | Off-chain compute via Chainlink Functions |
| **CCIPBridgePlugin** | `createCCIPBridgePlugin` | Cross-chain token transfers via CCIP |
| **ProofOfReservePlugin** | `createProofOfReservePlugin` | On-chain reserve verification |
| **OracleAggregator** | `createOracleAggregator` | Multi-source price aggregation |
| **OracleMonitorPlugin** | `createOracleMonitor` | Oracle health and staleness monitoring |
| **AcePlugin** | `createAcePlugin` | Automated Compliance Engine attestations |
| **DecoPlugin** | `createDecoPlugin` | DECO-based data attestation |
| **CCIDPlugin** | `createCCIDPlugin` | Cross-chain identity |
| **LinkManagerPlugin** | `createLinkManager` | LINK token management for oracle funding |

Each plugin ships with chain-specific factory variants (e.g., `createDataFeedPluginForBase`, `createDataFeedPluginForPolygon`).

## Services

| Service | Description |
|---------|-------------|
| `DeploymentService` | Token deployment orchestration with CREATE2 deterministic addresses |
| `ProductionDeploymentService` | Production-grade deployment with verification and multi-sig |
| `GasEstimator` | Gas estimation and optimization across chains |
| `OracleService` | Oracle data feed management and caching |
| `ReconciliationService` | On-chain / off-chain state reconciliation |
| `MultisigWallet` | Multi-signature wallet operations (Gnosis Safe compatible) |
| `TimelockController` | Timelock governance for contract upgrades |

```typescript
import {
  DeploymentService,
  GasEstimator,
  OracleService,
  ReconciliationService,
  MultisigWallet,
  TimelockController,
} from '@tokenisation/chains';
```

## Account Abstraction (ERC-4337)

Gasless transactions for end users through smart contract wallets:

```typescript
import { createAAModule, createSmartAccountFactory, createUserOperationBuilder } from '@tokenisation/chains';

// Bundler providers
import { createPimlicoBundler, createBiconomyBundler, createAlchemyBundler } from '@tokenisation/chains';

// Paymasters (gas sponsorship)
import { createSponsorPaymaster, createVerifyingPaymaster } from '@tokenisation/chains';
```

## MPC Custody

Multi-party computation custody providers for institutional key management:

```typescript
import { FireblocksCustodyProvider, LitProtocolCustodyProvider, Web3AuthCustodyProvider } from '@tokenisation/chains';
```

## Zero-Knowledge Proofs

Privacy-preserving compliance checks — prove KYC, accreditation, or jurisdiction status without revealing personal data:

```typescript
import { ZKPPlugin, createZKPPlugin, CircuitManager, createCircuitManager } from '@tokenisation/chains';
import type { ZKProof, Groth16Proof, AgeProofInput, AccreditationProofInput } from '@tokenisation/chains';
```

## Connectors

| Connector | Description |
|-----------|-------------|
| **DocuSign** | Electronic signature integration for legal documents |
| **WalletPass** | Apple Wallet and Google Pay pass generation |

```typescript
import { DocuSignConnector } from '@tokenisation/chains';
import { AppleWalletPass, GooglePayPass } from '@tokenisation/chains';
```

## Bridges

Cross-chain data and lifecycle management:

```typescript
import { DataFeedBridge, AutomationLifecycleManager, FlightDataFunctionsBridge } from '@tokenisation/chains';
```

## Related Packages

| Package | Description |
|---------|-------------|
| [`@tokenisation/core`](../core/README.md) | Foundation — engines, error classes, plugin interfaces |
| [`@tokenisation/compliance`](../compliance/README.md) | KYC/AML, identity claims, policy evaluation |
| [`@tokenisation/realestate`](../realestate/README.md) | UAE real estate with DLD/VARA integration |
| [`@tokenisation/sdk`](../../sdk/README.md) | Umbrella package — re-exports everything |
