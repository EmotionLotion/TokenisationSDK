---
sidebar_position: 1
title: REST API Reference
---

# REST API Reference

Base URL: `https://api.tokenisation.io/api/v1` (production) or `https://api.test.tokenisation.io/api/v1` (sandbox)

All requests require authentication via `Authorization: Bearer sk_live_...` or `Authorization: Bearer <jwt>`. Responses use standard JSON envelopes. Pagination uses `limit` and `offset` query parameters.

---

## Auth

### POST /auth/siwe/nonce

Generate a SIWE nonce for wallet-based authentication.

| Param | Type | Description |
|-------|------|-------------|
| `address` | `string` | Ethereum address (0x-prefixed, 40 hex chars) |

```bash
curl -X POST https://api.tokenisation.io/api/v1/auth/siwe/nonce \
  -H "Content-Type: application/json" \
  -d '{"address": "0x1234567890abcdef1234567890abcdef12345678"}'
```

### POST /auth/siwe/verify

Verify a SIWE signature and create a session. Returns JWT access and refresh tokens.

| Param | Type | Description |
|-------|------|-------------|
| `message` | `string` | The SIWE message that was signed |
| `signature` | `string` | The wallet signature |

### POST /auth/refresh

Exchange a refresh token for new access and refresh tokens.

| Param | Type | Description |
|-------|------|-------------|
| `refreshToken` | `string` | A valid refresh token |

### GET /auth/me

Returns the authenticated party profile and linked wallets. Requires `Bearer <jwt>`.

### POST /auth/logout

Invalidate all active sessions for the authenticated party.

---

## Assets

### POST /assets

Create a new tokenisable asset in DRAFT state.

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Asset name (1-256 chars) |
| `rightType` | `enum` | `OWNERSHIP`, `ACCESS`, `BEHAVIOR`, or `VERIFICATION` |
| `jurisdiction` | `object` | `{countryCode, regulatoryFramework?, accreditedOnly?, blockedJurisdictions?}` |
| `transferabilityRules` | `object` | `{mode, lockupPeriodSeconds, requireKyc, maxHolders, minimumHoldingAmount}` |
| `metadata` | `object` | Arbitrary key-value metadata |

```bash
curl -X POST https://api.tokenisation.io/api/v1/assets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dubai Marina Apt 1204","rightType":"OWNERSHIP","jurisdiction":{"countryCode":"AE"}}'
```

### GET /assets

List assets with filtering. Query params: `page`, `limit`, `state`, `rightType`, `search`, `issuerId`.

### GET /assets/:id

Get asset by ID including issuer info and token holder balances.

### PATCH /assets/:id

Update an asset (DRAFT state only). Accepts: `name`, `description`, `jurisdiction`, `validityPeriod`, `transferabilityRules`, `metadata`.

### POST /assets/:id/transition

Transition asset lifecycle state. Valid transitions: DRAFT -> PENDING_VERIFICATION -> VERIFIED -> ACTIVE -> FROZEN/REDEEMED/EXPIRED/BURNED.

| Param | Type | Description |
|-------|------|-------------|
| `toState` | `enum` | Target lifecycle state |
| `reason` | `string` | Optional reason for transition |

### DELETE /assets/:id

Delete a DRAFT asset. Only the issuer can delete.

---

## Tokens

### POST /tokens

Create a token definition. Requires idempotency key.

| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Token name (1-100 chars) |
| `symbol` | `string` | Alphanumeric symbol (1-10 chars) |
| `totalSupply` | `string` | Total supply as integer string |
| `chainId` | `number` | Target blockchain chain ID |
| `standard` | `enum` | `ERC3643`, `ERC1400`, or `ERC20` |
| `complianceModules` | `string[]` | Optional compliance module identifiers |

```bash
curl -X POST https://api.tokenisation.io/api/v1/tokens \
  -H "Authorization: Bearer sk_test_xxx" \
  -H "Idempotency-Key: create-mtt-001" \
  -H "Content-Type: application/json" \
  -d '{"name":"Marina Tower Token","symbol":"MTT","totalSupply":"1000000","chainId":137,"standard":"ERC3643"}'
```

### GET /tokens

List tokens. Query: `projectId`, `status`, `chainId`, `limit`, `offset`.

### GET /tokens/:id

Get token by ID with full details.

### PATCH /tokens/:id

Update token metadata or compliance modules.

### POST /tokens/:id/deploy

Deploy token to chain. Returns unsigned deployment transaction.

| Param | Type | Description |
|-------|------|-------------|
| `deployerAddress` | `string` | Deployer wallet address |
| `gasLimit` | `string` | Optional gas limit override |

### POST /tokens/:id/confirm-deployment

Confirm on-chain deployment with contract address, tx hash, and block number.

### POST /tokens/:tokenId/issue

Issue tokens to an investor. Requires idempotency key.

| Param | Type | Description |
|-------|------|-------------|
| `investorId` | `uuid` | Target investor ID |
| `walletAddress` | `string` | Target wallet address |
| `amount` | `string` | Amount as integer string |

### POST /tokens/:tokenId/redeem

Redeem (burn) tokens from an investor wallet.

### POST /tokens/:tokenId/burn

Direct burn tokens. Requires `fromWallet` and `amount`.

### POST /tokens/:tokenId/tranches

Create a tranche with name, supply, restrictions, and optional vesting schedule.

### GET /tokens/:tokenId/tranches

List tranches for a token.

### GET /tokens/:tokenId/cap-table

Get the full cap table with investor positions and percentages.

### POST /tokens/:tokenId/clawback

Initiate a regulatory clawback. Requires minimum 10-char reason.

### POST /tokens/:tokenId/clawbacks/:id/approve

Approve a pending clawback.

### POST /tokens/:tokenId/clawbacks/:id/execute

Execute an approved clawback on-chain.

### POST /tokens/:id/pause | /unpause | /freeze

Pause, unpause, or freeze a token. Freeze requires a `reason`.

---

## Investors

### POST /investors

Register a new investor.

| Param | Type | Description |
|-------|------|-------------|
| `email` | `string` | Investor email |
| `type` | `enum` | `individual`, `institutional`, `qualified`, `accredited` |
| `countryCode` | `string` | ISO 3166-1 alpha-2 country code |
| `taxResidency` | `string` | Optional tax residency country |

```bash
curl -X POST https://api.tokenisation.io/api/v1/investors \
  -H "Authorization: Bearer sk_test_xxx" \
  -H "Content-Type: application/json" \
  -d '{"email":"investor@example.com","type":"individual","countryCode":"AE"}'
```

### GET /investors

List investors. Filter by: `type`, `status`, `kycStatus`, `countryCode`, `search`.

### GET /investors/:id

Get investor by ID.

### PATCH /investors/:id

Update investor profile.

### POST /investors/:id/kyc

Create a KYC verification session. Providers: `sumsub`, `onfido`, `jumio`, `manual`.

### POST /investors/:id/kyc/approve

Manually approve an investor's KYC. Requires `approverId` and `kycLevel`.

### POST /investors/:id/wallets

Link a wallet to an investor. Requires `address` and `chainId`.

### POST /investors/:id/wallets/:walletId/verify

Verify wallet ownership via signature.

### GET /investors/lookup/wallet/:address

Reverse lookup: find an investor by wallet address.

---

## Transfers

### POST /transfers

Create a transfer request (Step 1 of the transfer saga).

| Param | Type | Description |
|-------|------|-------------|
| `tokenId` | `uuid` | Token to transfer |
| `fromWallet` | `string` | Sender wallet address |
| `toWallet` | `string` | Recipient wallet address |
| `amount` | `string` | Amount as integer string |

### POST /transfers/execute

Execute the full transfer saga in one call: create, precheck, optional auto-approve, sign.

### GET /transfers

List transfers. Filter by: `tokenId`, `status`, `fromWallet`, `toWallet`.

### GET /transfers/:id

Get transfer by ID with full audit trail.

### POST /transfers/:id/precheck

Step 2: Run compliance precheck on a pending transfer.

### POST /transfers/:id/approve

Step 3: Approve a prechecked transfer.

### POST /transfers/:id/sign

Step 4: Sign the transfer. Mode: `custodial` (server signs) or `non_custodial` (returns unsigned tx).

### POST /transfers/:id/submit

Step 5: Submit a signed transaction hash (non-custodial flow).

### POST /transfers/:id/confirm

Step 6: Confirm transaction mined with `blockNumber`.

### POST /transfers/:id/reconcile

Step 7: Reconcile transfer against on-chain state.

### POST /transfers/:id/settle

Step 8: Mark transfer as fully settled.

### POST /transfers/:id/cancel

Cancel a pending transfer with optional `reason`.

### POST /transfers/batch

Create up to 100 transfers in a single batch.

### POST /transfers/estimate-gas

Estimate gas cost without creating a transfer.

---

## Compliance

### POST /compliance/policies

Create a compliance policy with a versioned ruleset.

### GET /compliance/policies

List policies. Filter by: `type`, `status`.

### GET /compliance/policies/:id

Get policy with current version and ruleset.

### POST /compliance/policies/:id/versions

Publish a new version of a policy's ruleset.

### POST /compliance/decisions/transfer

Evaluate a transfer against compliance policies. Returns allow/deny decision with reasons.

### POST /compliance/decisions/issuance

Evaluate an issuance against compliance policies.

### POST /compliance/policies/simulate/transfer

Dry-run a transfer decision without persisting. Returns the same decision structure.

### GET /compliance/receipts

List compliance receipts with filtering by `assetId`, `result`.

---

## DLD (Dubai Land Department)

### POST /dld/titles

Register a DLD title deed linked to a project.

| Param | Type | Description |
|-------|------|-------------|
| `projectId` | `uuid` | Linked asset/project ID |
| `dldTitleNumber` | `string` | Official DLD title deed number |
| `propertyType` | `enum` | `land`, `building`, or `unit` |
| `emirate` | `string` | Emirate (default: `dubai`) |

### GET /dld/titles

List registered titles. Filter by `projectId`, `status`.

### POST /dld/titles/:id/verify

Verify a title deed against the DLD registry.

### POST /dld/titles/:id/verify-onchain

Verify title on-chain via Chainlink Functions.

### GET /dld/lookup/:dldTitleNumber

Look up a title by its DLD title number.

### GET /dld/titles/:id/check-clear

Check if a title is free of disputes, liens, and encumbrances.

---

## Webhooks

### POST /webhooks/endpoints

Create a webhook endpoint. Returns a signing secret (shown only once).

### GET /webhooks/endpoints

List webhook endpoints.

### PATCH /webhooks/endpoints/:id

Update endpoint URL, events, or status.

### DELETE /webhooks/endpoints/:id

Delete a webhook endpoint.

### POST /webhooks/endpoints/:id/rotate-secret

Rotate the signing secret for an endpoint.

### GET /webhooks/deliveries

List webhook deliveries. Filter by `endpointId`, `status`, `eventType`.

### POST /webhooks/deliveries/:id/retry

Retry a failed delivery.

### POST /webhooks/test

Send a test event to all matching endpoints.

---

## Settlements

### POST /settlements

Create a settlement record linked to a transaction hash.

### GET /settlements

List settlements. Filter by `status`, `chainId`, `transferId`.

### POST /settlements/:id/update-confirmations

Update confirmation count for a pending settlement.

---

## Distributions

### POST /distributions

Create a distribution (dividend, rent, yield, etc.) for a token.

| Param | Type | Description |
|-------|------|-------------|
| `tokenId` | `uuid` | Token ID |
| `type` | `enum` | `dividend`, `interest`, `rent`, `royalty`, `revenue_share`, etc. |
| `totalAmount` | `string` | Total distribution amount |
| `currency` | `string` | Payment currency code |
| `paymentMethod` | `enum` | `on_chain`, `bank_transfer`, `mixed` |

### GET /distributions

List distributions for your organisation.

---

## Vesting

### POST /vesting/schedules

Create a vesting schedule for an investor.

| Param | Type | Description |
|-------|------|-------------|
| `tokenId` | `uuid` | Token ID |
| `investorId` | `uuid` | Investor ID |
| `vestingType` | `enum` | `linear`, `cliff`, `cliff_then_linear`, `milestone`, `graded` |
| `totalAmount` | `string` | Total vesting amount |
| `vestingMonths` | `number` | Vesting duration in months |

### GET /vesting/schedules

List vesting schedules. Filter by `tokenId`, `investorId`, `status`.

### GET /vesting/schedules/:id

Get a specific vesting schedule with unlock timeline.

---

## Audit

### GET /audit/events

List audit trail events for your organisation. Filter by `assetId`, `actorId`, `type`.

---

## Error Responses

All errors follow a consistent envelope:

```json
{
  "error": {
    "message": "Asset not found",
    "code": "NOT_FOUND",
    "statusCode": 404
  }
}
```

Common status codes: `400` (validation), `401` (unauthorized), `403` (forbidden), `404` (not found), `409` (conflict), `429` (rate limited), `500` (internal).
