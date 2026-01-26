# AHOY Tokenisation Python SDK

Official Python SDK for the AHOY Tokenisation Platform. Tokenize real-world assets with built-in compliance.

## Installation

```bash
pip install ahoy-tokenisation
```

## Quick Start

```python
from ahoy_tokenisation import AhoyClient

# Initialize client
client = AhoyClient(api_key="sk_test_...")

# Create an investor
investor = client.investors.create(
    email="investor@example.com",
    type="individual",
    country_code="AE"
)

# Start KYC verification
kyc_session = client.investors.kyc.create(
    investor_id=investor.id,
    provider="sumsub",
    level_requested="standard"
)
print(f"KYC URL: {kyc_session.verification_url}")

# Create a token for an asset
token = client.tokens.create(
    project_id="proj_...",
    name="Marina Tower Unit 1204",
    symbol="MT1204",
    total_supply="1000000000000000000000",  # 1000 tokens
    chain_id=8453  # Base
)

# Execute a compliant transfer
transfer = client.transfers.create(
    token_id=token.id,
    from_wallet="0x...",
    to_wallet="0x...",
    amount="100000000000000000000"  # 100 tokens
)

# Check transfer status
transfer = client.transfers.retrieve(transfer.id)
print(f"Transfer status: {transfer.status}")
```

## Features

- **Investor Onboarding**: Create investors, manage KYC sessions
- **Token Management**: Create, deploy, and manage compliance tokens
- **Compliant Transfers**: Execute transfers with automatic compliance checks
- **Distributions**: Schedule and execute yield/dividend distributions
- **Webhooks**: Receive real-time notifications
- **Full Type Safety**: Pydantic models for all requests/responses

## Authentication

```python
# Using API key (recommended for server-side)
client = AhoyClient(api_key="sk_live_...")

# Using environment variable
# Set AHOY_API_KEY environment variable
client = AhoyClient()

# Custom base URL (for sandbox/self-hosted)
client = AhoyClient(
    api_key="sk_test_...",
    base_url="https://sandbox.api.ahoy.fund/v1"
)
```

## Resources

### Investors

```python
# Create investor
investor = client.investors.create(
    email="investor@example.com",
    type="individual",  # individual, institutional, qualified, accredited
    country_code="AE",
    tax_residency="AE",
    profile={"occupation": "Engineer"}
)

# List investors
investors = client.investors.list(
    status="active",
    kyc_status="approved",
    limit=50
)

# Get investor
investor = client.investors.retrieve("inv_...")

# Update investor
investor = client.investors.update(
    "inv_...",
    phone="+971501234567"
)

# KYC Operations
kyc = client.investors.kyc.create(
    investor_id="inv_...",
    provider="sumsub",
    level_requested="enhanced"
)

kyc = client.investors.kyc.approve(
    investor_id="inv_...",
    approver_id="usr_...",
    kyc_level="standard"
)

# Wallet Operations
wallet = client.investors.wallets.create(
    investor_id="inv_...",
    address="0x742d35Cc6634C0532925a3b844Bc9e7595f8fE23",
    chain_id=8453
)
```

### Tokens

```python
# Create token
token = client.tokens.create(
    project_id="proj_...",
    name="Dubai Marina Property",
    symbol="DMP",
    total_supply="1000000000000000000000000",
    chain_id=8453,
    compliance_modules=["kyc", "country_restriction"]
)

# Deploy to chain
deployment = client.tokens.deploy(
    token_id="tok_...",
    deployer_address="0x..."
)

# Issue tokens to investor
issuance = client.tokens.issue(
    token_id="tok_...",
    to_wallet="0x...",
    to_investor_id="inv_...",
    amount="100000000000000000000"
)

# Get cap table
cap_table = client.tokens.cap_table("tok_...")
```

### Transfers

```python
# Create transfer (with compliance check)
transfer = client.transfers.create(
    token_id="tok_...",
    from_wallet="0x...",
    to_wallet="0x...",
    amount="50000000000000000000",
    from_investor_id="inv_...",
    to_investor_id="inv_..."
)

# Approve transfer (if manual approval required)
transfer = client.transfers.approve("txf_...")

# Get transfer status
transfer = client.transfers.retrieve("txf_...")

# List transfers
transfers = client.transfers.list(
    token_id="tok_...",
    status="settled"
)
```

### Distributions

```python
# Create distribution schedule
schedule = client.distributions.schedules.create(
    token_id="tok_...",
    type="RENT",
    frequency="MONTHLY",
    payment_currency="USDC",
    amount="10000000000",  # 10,000 USDC
    start_date="2024-02-01T00:00:00Z"
)

# Execute distribution
distribution = client.distributions.schedules.execute(
    schedule_id="sch_...",
    amount="10000000000"
)

# Get payouts for a distribution
payouts = client.distributions.payouts("dist_...")

# Claim a payout
result = client.distributions.claim(
    distribution_id="dist_...",
    recipient_id="inv_..."
)
```

### Compliance

```python
# Check transfer compliance
decision = client.compliance.check(
    type="transfer",
    token_id="tok_...",
    from_investor_id="inv_...",
    to_investor_id="inv_...",
    amount="100000000000000000000"
)

if decision.result == "allow":
    print("Transfer is compliant")
else:
    print(f"Transfer denied: {decision.reasons}")

# Get policy
policy = client.compliance.policies.retrieve("pol_...")

# List decisions
decisions = client.compliance.decisions.list(
    token_id="tok_...",
    result="deny"
)
```

### Webhooks

```python
# Create webhook endpoint
endpoint = client.webhooks.endpoints.create(
    url="https://your-app.com/webhooks/ahoy",
    events=["transfer.settled", "investor.kyc.approved"]
)

# Verify webhook signature
from ahoy_tokenisation.utils import verify_webhook_signature

is_valid = verify_webhook_signature(
    payload=request.body,
    signature=request.headers["X-Ahoy-Signature"],
    secret=endpoint.secret
)
```

## Error Handling

```python
from ahoy_tokenisation.exceptions import (
    AhoyError,
    AuthenticationError,
    ValidationError,
    NotFoundError,
    RateLimitError,
    ComplianceError
)

try:
    transfer = client.transfers.create(...)
except ValidationError as e:
    print(f"Invalid input: {e.message}")
    print(f"Field errors: {e.errors}")
except ComplianceError as e:
    print(f"Compliance check failed: {e.reasons}")
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after} seconds")
except AhoyError as e:
    print(f"API error: {e.message}")
```

## Async Support

```python
from ahoy_tokenisation import AsyncAhoyClient

async def main():
    client = AsyncAhoyClient(api_key="sk_test_...")

    investor = await client.investors.create(
        email="investor@example.com",
        type="individual",
        country_code="AE"
    )

    # All methods support async
    transfers = await client.transfers.list(limit=10)

import asyncio
asyncio.run(main())
```

## Pagination

```python
# Auto-pagination
for investor in client.investors.list_all():
    print(investor.email)

# Manual pagination
page1 = client.investors.list(limit=50)
page2 = client.investors.list(limit=50, offset=50)

# With async
async for investor in client.investors.list_all_async():
    print(investor.email)
```

## Idempotency

```python
# Automatic idempotency key generation
transfer = client.transfers.create(
    token_id="tok_...",
    from_wallet="0x...",
    to_wallet="0x...",
    amount="100000000000000000000",
    idempotency_key="unique-request-id"
)

# Retrying the same request with same key returns original result
```

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run type checking
mypy ahoy_tokenisation

# Format code
black ahoy_tokenisation tests
ruff check ahoy_tokenisation tests
```

## Support

- Documentation: https://docs.ahoy.fund/sdk/python
- GitHub Issues: https://github.com/ahoy-fund/tokenisation-sdk/issues
- Email: support@ahoy.fund
