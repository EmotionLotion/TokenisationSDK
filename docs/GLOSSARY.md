# Glossary

Technical terms and definitions used throughout the Tokenisation SDK.

---

## A

### Accredited Investor
A person or entity that meets certain wealth or income thresholds, allowing them to invest in securities not registered with regulators. In the US, this typically means:
- Net worth > $1 million (excluding primary residence), OR
- Income > $200K/year ($300K joint) for past 2 years

### AML (Anti-Money Laundering)
Regulations and procedures to prevent criminals from disguising illegally obtained funds as legitimate income. Includes transaction monitoring, suspicious activity reporting, and sanctions screening.

### API Key
A secret token used to authenticate requests to the SDK server. Format: `sk_live_xxx` (production) or `sk_test_xxx` (testing).

```typescript
const client = new ApiClient({
  apiKey: 'sk_live_your-api-key'
});
```

### Asset
The underlying real-world item being tokenized (building, artwork, security, etc.). In the SDK, an Asset is a database record that describes what's being tokenized.

---

## B

### Blockchain
A distributed ledger that records transactions across many computers. Key properties: immutable, transparent, decentralized. The SDK supports Ethereum, Polygon, Base, and Arbitrum.

### Burn
Permanently destroy tokens, removing them from circulation. Used when underlying asset is sold, redeemed, or no longer exists.

---

## C

### Cap Table (Capitalization Table)
A record of all token holders and their ownership percentages.

```typescript
const capTable = await client.tokens.getCapTable(tokenId);
// Returns: { totalSupply, holders: [{ address, balance, percentage }] }
```

### Chain ID
A unique identifier for each blockchain network:

| Network | Chain ID |
|---------|----------|
| Ethereum Mainnet | 1 |
| Polygon | 137 |
| Base | 8453 |
| Arbitrum | 42161 |
| Sepolia (testnet) | 11155111 |
| Base Sepolia | 84532 |

### Claim
A verifiable statement about an identity (e.g., "this address passed KYC"). In ERC-3643, claims are issued by trusted parties and stored on-chain.

### Compliance
The process of ensuring token operations follow regulatory requirements. Includes KYC verification, transfer restrictions, jurisdiction rules, and holder limits.

### Compliance Module
A smart contract component that enforces specific rules:

| Module | Purpose |
|--------|---------|
| `IDENTITY_REQUIRED` | Recipient must be in identity registry |
| `COUNTRY_WHITELIST` | Only allow specific countries |
| `COUNTRY_BLACKLIST` | Block specific countries |
| `MAX_HOLDERS` | Limit total number of token holders |
| `MAX_BALANCE` | Limit tokens per holder |
| `TIME_LOCK` | Prevent transfers until date |

### Custodian
A regulated entity that holds assets on behalf of investors. Can be self-custody (investor holds keys) or third-party custody.

---

## D

### Decimals
The number of decimal places a token supports. Standard is 18 decimals, meaning 1 token = 1000000000000000000 (10^18) base units.

```
1 token with 18 decimals = "1000000000000000000"
0.5 tokens = "500000000000000000"
```

### Deploy
The process of publishing a smart contract to the blockchain. Once deployed, the contract has a permanent address.

### Drizzle ORM
The database toolkit used by the SDK server. Provides type-safe database queries with PostgreSQL and SQLite support.

---

## E

### EOA (Externally Owned Account)
A standard Ethereum wallet controlled by a private key (as opposed to a smart contract wallet). Most common wallet type.

### ERC-20
The standard interface for fungible tokens on Ethereum. All tokens of the same type are identical and interchangeable.

### ERC-721
The standard for non-fungible tokens (NFTs). Each token is unique with its own token ID.

### ERC-1155
Multi-token standard supporting both fungible and non-fungible tokens in one contract.

### ERC-3643 (T-REX)
The standard for compliant security tokens. Adds identity verification and transfer restrictions to ERC-20.

Key components:
- **Token**: The actual token contract
- **Identity Registry**: Maps addresses to verified identities
- **Compliance Module**: Enforces transfer rules
- **Trusted Issuers Registry**: Who can issue identity claims

### ERC-4626
Tokenized vault standard. Represents shares in a yield-generating vault.

---

## F

### Foundry
The smart contract development framework used for this project. Includes `forge` (testing), `anvil` (local blockchain), and `cast` (CLI tools).

### Freeze
Permanently halt all token operations. More severe than pause — typically used for regulatory action or legal disputes.

---

## G

### Gas
The fee paid to execute blockchain transactions. Measured in gwei (10^-9 ETH). Higher gas = faster confirmation.

### Governance
The system for making decisions about upgrades and changes. This SDK uses multi-sig + timelock governance via `TokenGovernor`.

### Grace Period
The time window after a timelock expires during which a proposal can be executed. Default: 7 days.

---

## H

### Hash
A fixed-length string generated from input data. Used for transaction IDs, content verification, and cryptographic operations.

### Holder
An address that owns tokens. The cap table lists all holders.

---

## I

### Idempotency
The property that an operation produces the same result whether executed once or multiple times. Critical for financial operations.

```typescript
// Safe: same key = same result
await client.tokens.issue(tokenId, {
  amount: "1000",
  idempotencyKey: "issue-123"  // Prevents duplicates
});
```

### Idempotency Key
A unique string that identifies an operation. If the same key is used twice, the second request returns the original result instead of executing again.

### Identity Registry
A smart contract that maps blockchain addresses to verified identities. Required for ERC-3643 compliance.

### Implementation Contract
In the proxy pattern, the contract containing the actual logic. Can be upgraded without changing the proxy address.

### Investor
A person or entity that holds or will hold tokens. Must complete KYC before receiving tokens.

### Issuance
The process of creating new tokens and assigning them to an investor. Also called "minting."

---

## J

### JSON Web Token (JWT)
A token format used for authentication. The SDK server issues JWTs after login, which are included in subsequent requests.

### Jurisdiction
The legal territory whose laws apply. Affects which compliance rules are enforced and what investor types are allowed.

---

## K

### KYC (Know Your Customer)
The process of verifying a customer's identity before allowing them to transact. Required by financial regulations worldwide.

KYC status values:
- `pending` — Not yet verified
- `in_progress` — Verification underway
- `approved` — Successfully verified
- `rejected` — Failed verification
- `expired` — Verification needs renewal

---

## L

### Lifecycle State
The current status of an asset in its state machine:

```
draft → pending_verification → verified → active → [suspended|redeemed|expired] → burned
```

### Liquidity
How easily an asset can be bought or sold. Tokenization improves liquidity by enabling 24/7 trading and fractional ownership.

---

## M

### Mainnet
The production blockchain network where real value is transacted (vs testnet for development).

### Mint
Create new tokens. Same as issuance.

### Multi-Sig (Multi-Signature)
A security mechanism requiring multiple parties to approve an action. The SDK's `TokenGovernor` requires 2+ signatures for upgrades.

---

## N

### Nonce
A number used once to prevent replay attacks. In SIWE authentication, the server provides a nonce that the user signs.

---

## O

### On-Chain
Data or operations that exist/occur on the blockchain (vs off-chain which is stored in traditional databases).

### Oracle
A service that provides external data to smart contracts. Used for price feeds, random numbers, and real-world event verification.

---

## P

### Pause
Temporarily halt token transfers. Can be undone with unpause. Less severe than freeze.

### Policy
A set of compliance rules that govern token operations. Includes rules for transfers, issuance, and redemption.

### Private Key
A secret cryptographic key that controls a blockchain wallet. Never share or expose private keys.

### Project
A container that groups related tokenization work. Can contain multiple assets and tokens.

### Proxy Contract
A contract that delegates calls to an implementation contract. Enables upgrades without changing the user-facing address.

---

## Q

### Quorum
The minimum number of approvals required for a multi-sig action. Default: 2 signers.

---

## R

### Rate Limiting
Restricting how many API requests a client can make in a time period. Prevents abuse and ensures fair access.

The SDK server uses Redis for distributed rate limiting in production.

### Redemption
The process of exchanging tokens for the underlying asset or its value. Opposite of issuance.

### Right Type
What legal right the token represents:

| Type | Meaning |
|------|---------|
| `OWNERSHIP` | Title to property |
| `EQUITY` | Shares in entity |
| `DEBT` | Loan or bond |
| `REVENUE` | Income stream |
| `ACCESS` | Usage permission |
| `COMMODITY` | Physical goods |

### RPC (Remote Procedure Call)
The interface for communicating with blockchain nodes. RPC URLs are configured per chain.

---

## S

### Sanctions Screening
Checking if an address or person appears on government sanctions lists (OFAC, UN, EU, etc.).

### Security Token
A token that represents a regulated security (stock, bond, fund share). Subject to securities laws.

### Settlement
The final completion of a transfer, including any off-chain reconciliation.

### SIWE (Sign-In With Ethereum)
An authentication standard where users prove wallet ownership by signing a message. No password required.

### Smart Contract
Self-executing code deployed on a blockchain. Once deployed, runs exactly as programmed.

### Soulbound Token
A non-transferable token permanently bound to an address. Used for credentials, certifications, and identity.

### SPV (Special Purpose Vehicle)
A legal entity created to hold a specific asset. Common in real estate tokenization.

---

## T

### Testnet
A blockchain network for development and testing. Uses fake tokens with no real value.

### Timelock
A delay between proposing and executing an action. Gives stakeholders time to review and potentially veto. Default: 2 days.

### Token
A digital asset on a blockchain. Can represent ownership, access rights, or other value.

### Tranche
A portion of tokens with specific characteristics (e.g., different lockup periods or rights).

### Transaction Hash (txHash)
A unique identifier for a blockchain transaction. Used to track and verify transactions.

### Transfer
Movement of tokens from one address to another. In the SDK, transfers go through compliance checks before execution.

### T-REX
See ERC-3643.

---

## U

### UUPS (Universal Upgradeable Proxy Standard)
A proxy pattern where upgrade logic lives in the implementation contract. More gas-efficient than transparent proxy.

```
┌──────────────┐        ┌─────────────────────┐
│ ERC1967Proxy │───────▶│ Implementation (V1) │
│ (fixed addr) │        └─────────────────────┘
└──────────────┘                  │
                                  │ upgrade
                                  ▼
                        ┌─────────────────────┐
                        │ Implementation (V2) │
                        └─────────────────────┘
```

---

## V

### Verification
Confirming the authenticity or validity of something (identity, document, transaction).

### Vault
A smart contract that holds assets and issues shares. See ERC-4626.

---

## W

### Wallet
Software or hardware that stores private keys and enables blockchain transactions. Types:
- **EOA**: Standard private key wallet
- **Multi-sig**: Requires multiple signatures
- **Smart Account**: Contract-based wallet with custom logic

### Wei
The smallest unit of Ether. 1 ETH = 10^18 wei.

### Whitelist
A list of approved addresses or entities. Used in `WHITELIST_ONLY` transfer mode.

---

## Z

### Zod
A TypeScript validation library used by the SDK for input validation. Ensures data matches expected schemas before processing.

```typescript
// SDK validates all inputs automatically
const token = await client.tokens.create({
  name: "My Token",    // Must be string
  symbol: "MTK",       // 3-5 characters
  chainId: 8453        // Must be valid chain ID
});
```
