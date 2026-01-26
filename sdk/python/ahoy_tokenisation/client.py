"""
Main AHOY Tokenisation API client.
"""

from typing import Optional

from ahoy_tokenisation.utils.http import AsyncHttpClient, HttpClient
from ahoy_tokenisation.resources.investors import InvestorsResource, AsyncInvestorsResource
from ahoy_tokenisation.resources.tokens import TokensResource, AsyncTokensResource
from ahoy_tokenisation.resources.transfers import TransfersResource, AsyncTransfersResource
from ahoy_tokenisation.resources.distributions import DistributionsResource, AsyncDistributionsResource
from ahoy_tokenisation.resources.compliance import ComplianceResource, AsyncComplianceResource
from ahoy_tokenisation.resources.webhooks import WebhooksResource, AsyncWebhooksResource
from ahoy_tokenisation.resources.payments import PaymentsResource, AsyncPaymentsResource


DEFAULT_BASE_URL = "https://api.ahoy.fund"


class AhoyClient:
    """
    Synchronous client for the AHOY Tokenisation API.

    Example:
        from ahoy_tokenisation import AhoyClient

        client = AhoyClient(api_key="ak_live_...")

        # Create an investor
        investor = client.investors.create(
            email="investor@example.com",
            type="individual",
            country_code="AE",
        )

        # List tokens
        tokens = client.tokens.list(limit=10)
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """
        Initialize the AHOY client.

        Args:
            api_key: Your AHOY API key (starts with ak_live_ or ak_test_)
            base_url: API base URL (defaults to production)
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
        """
        self._http = HttpClient(
            base_url=base_url,
            api_key=api_key,
            timeout=timeout,
            max_retries=max_retries,
        )

        # Initialize resource classes
        self.investors = InvestorsResource(self._http)
        self.tokens = TokensResource(self._http)
        self.transfers = TransfersResource(self._http)
        self.distributions = DistributionsResource(self._http)
        self.compliance = ComplianceResource(self._http)
        self.webhooks = WebhooksResource(self._http)
        self.payments = PaymentsResource(self._http)

    def close(self) -> None:
        """Close the HTTP client connection."""
        self._http.close()

    def __enter__(self) -> "AhoyClient":
        return self

    def __exit__(self, *args) -> None:
        self.close()


class AsyncAhoyClient:
    """
    Asynchronous client for the AHOY Tokenisation API.

    Example:
        import asyncio
        from ahoy_tokenisation import AsyncAhoyClient

        async def main():
            async with AsyncAhoyClient(api_key="ak_live_...") as client:
                investor = await client.investors.create(
                    email="investor@example.com",
                    type="individual",
                    country_code="AE",
                )
                print(investor.id)

        asyncio.run(main())
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        """
        Initialize the async AHOY client.

        Args:
            api_key: Your AHOY API key
            base_url: API base URL
            timeout: Request timeout in seconds
            max_retries: Maximum number of retry attempts
        """
        self._http = AsyncHttpClient(
            base_url=base_url,
            api_key=api_key,
            timeout=timeout,
            max_retries=max_retries,
        )

        # Initialize async resource classes
        self.investors = AsyncInvestorsResource(self._http)
        self.tokens = AsyncTokensResource(self._http)
        self.transfers = AsyncTransfersResource(self._http)
        self.distributions = AsyncDistributionsResource(self._http)
        self.compliance = AsyncComplianceResource(self._http)
        self.webhooks = AsyncWebhooksResource(self._http)
        self.payments = AsyncPaymentsResource(self._http)

    async def close(self) -> None:
        """Close the HTTP client connection."""
        await self._http.close()

    async def __aenter__(self) -> "AsyncAhoyClient":
        return self

    async def __aexit__(self, *args) -> None:
        await self.close()
