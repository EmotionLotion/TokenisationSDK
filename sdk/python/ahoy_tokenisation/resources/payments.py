"""
Payments resource for managing payment rails and processing payments.
"""

from typing import Any, Dict, List, Optional

from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


# Type aliases
PaymentRailType = str  # 'usdc' | 'bank_ach' | 'bank_wire' | 'bank_sepa'
PaymentStatus = str    # 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'


class PaymentsResource:
    """Manage payment rails and process payments."""

    def __init__(self, http: HttpClient):
        self._http = http

    # =========================================================================
    # Rail Configuration
    # =========================================================================

    def create_rail(
        self,
        rail_type: str,
        name: str,
        config: Dict[str, Any],
        supported_currencies: List[str],
        *,
        fees: Optional[Dict[str, Any]] = None,
        limits: Optional[Dict[str, Any]] = None,
        is_default: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a payment rail configuration.

        Args:
            rail_type: Type of rail (usdc, bank_ach, bank_wire, bank_sepa)
            name: Human-readable name for the rail
            config: Rail-specific configuration
            supported_currencies: List of supported currency codes
            fees: Fee configuration (fixedFee, percentageFee, etc.)
            limits: Limit configuration (minAmount, maxAmount, etc.)
            is_default: Set as default rail for the organization
            metadata: Custom metadata

        Returns:
            Created rail configuration

        Example:
            # USDC rail
            rail = client.payments.create_rail(
                rail_type="usdc",
                name="USDC on Polygon",
                config={
                    "usdcChainId": 137,
                    "treasuryWallet": "0x...",
                    "provider": "circle",
                },
                supported_currencies=["USDC"],
            )

            # Bank ACH rail
            rail = client.payments.create_rail(
                rail_type="bank_ach",
                name="US Bank Account",
                config={
                    "accountNumber": "123456789",
                    "routingNumber": "021000021",
                    "accountHolderName": "AHOY Treasury",
                },
                supported_currencies=["USD"],
            )
        """
        data = {
            "railType": rail_type,
            "name": name,
            "config": config,
            "supportedCurrencies": supported_currencies,
            "isDefault": is_default,
        }
        if fees is not None:
            data["fees"] = fees
        if limits is not None:
            data["limits"] = limits
        if metadata is not None:
            data["metadata"] = metadata

        return self._http.post("/v1/payment-rails", json=data)

    def get_rail(self, rail_id: str) -> Dict[str, Any]:
        """
        Get a payment rail configuration.

        Args:
            rail_id: The rail's ID

        Returns:
            Rail configuration
        """
        return self._http.get(f"/v1/payment-rails/{rail_id}")

    def update_rail(
        self,
        rail_id: str,
        *,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_default: Optional[bool] = None,
        config: Optional[Dict[str, Any]] = None,
        fees: Optional[Dict[str, Any]] = None,
        limits: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Update a payment rail configuration.

        Args:
            rail_id: The rail's ID
            name: New name
            is_active: Activate or deactivate
            is_default: Set as default
            config: Updated rail-specific config
            fees: Updated fees
            limits: Updated limits
            metadata: Updated metadata

        Returns:
            Updated rail configuration
        """
        data = {}
        if name is not None:
            data["name"] = name
        if is_active is not None:
            data["isActive"] = is_active
        if is_default is not None:
            data["isDefault"] = is_default
        if config is not None:
            data["config"] = config
        if fees is not None:
            data["fees"] = fees
        if limits is not None:
            data["limits"] = limits
        if metadata is not None:
            data["metadata"] = metadata

        return self._http.patch(f"/v1/payment-rails/{rail_id}", json=data)

    def delete_rail(self, rail_id: str) -> None:
        """
        Delete (deactivate) a payment rail.

        Args:
            rail_id: The rail's ID
        """
        self._http.delete(f"/v1/payment-rails/{rail_id}")

    def list_rails(
        self,
        *,
        rail_type: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        List payment rails.

        Args:
            rail_type: Filter by rail type
            is_active: Filter by active status

        Returns:
            List of rail configurations
        """
        params = {}
        if rail_type is not None:
            params["railType"] = rail_type
        if is_active is not None:
            params["isActive"] = str(is_active).lower()

        return self._http.get("/v1/payment-rails", params=params if params else None)

    # =========================================================================
    # Payments
    # =========================================================================

    def create(
        self,
        rail_id: str,
        amount: str,
        currency: str,
        recipient_id: str,
        recipient_type: str,
        *,
        recipient_address: Optional[str] = None,
        recipient_bank_info: Optional[Dict[str, Any]] = None,
        payout_id: Optional[str] = None,
        distribution_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a payment.

        Args:
            rail_id: Payment rail ID to use
            amount: Amount to pay (as string for precision)
            currency: Currency code (USDC, USD, EUR, etc.)
            recipient_id: ID of the recipient (investor, issuer, etc.)
            recipient_type: Type of recipient (investor, issuer, treasury)
            recipient_address: Wallet address (for crypto payments)
            recipient_bank_info: Bank details (for bank payments)
            payout_id: Associated payout ID
            distribution_id: Associated distribution ID
            metadata: Custom metadata

        Returns:
            Created payment

        Example:
            # USDC payment
            payment = client.payments.create(
                rail_id="rail_...",
                amount="1000000000",  # $1000 in 6 decimals
                currency="USDC",
                recipient_id="inv_...",
                recipient_type="investor",
                recipient_address="0x...",
            )

            # Bank payment
            payment = client.payments.create(
                rail_id="rail_...",
                amount="1000000000",
                currency="USD",
                recipient_id="inv_...",
                recipient_type="investor",
                recipient_bank_info={
                    "accountHolderName": "John Doe",
                    "accountNumber": "123456789",
                    "routingNumber": "021000021",
                    "country": "US",
                },
            )
        """
        data = {
            "amount": amount,
            "currency": currency,
            "recipientId": recipient_id,
            "recipientType": recipient_type,
        }
        if recipient_address is not None:
            data["recipientAddress"] = recipient_address
        if recipient_bank_info is not None:
            data["recipientBankInfo"] = recipient_bank_info
        if payout_id is not None:
            data["payoutId"] = payout_id
        if distribution_id is not None:
            data["distributionId"] = distribution_id
        if metadata is not None:
            data["metadata"] = metadata

        return self._http.post(f"/v1/payment-rails/{rail_id}/payments", json=data)

    def create_batch(
        self,
        rail_id: str,
        currency: str,
        distribution_id: str,
        payments: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Create a batch of payments for a distribution.

        Args:
            rail_id: Payment rail ID to use
            currency: Currency code
            distribution_id: Distribution ID
            payments: List of payment inputs, each with:
                - recipientId: Recipient ID
                - amount: Payment amount
                - payoutId: Payout ID
                - recipientAddress: Wallet address (for crypto)
                - recipientBankInfo: Bank details (for bank)

        Returns:
            Batch result with payments, totalAmount, totalFees
        """
        return self._http.post(
            f"/v1/payment-rails/{rail_id}/payments/batch",
            json={
                "currency": currency,
                "distributionId": distribution_id,
                "payments": payments,
            },
        )

    def retrieve(self, payment_id: str) -> Dict[str, Any]:
        """
        Get a payment by ID.

        Args:
            payment_id: The payment's ID

        Returns:
            Payment object
        """
        return self._http.get(f"/v1/payment-rails/payments/{payment_id}")

    def list(
        self,
        *,
        status: Optional[str] = None,
        rail_type: Optional[str] = None,
        distribution_id: Optional[str] = None,
        recipient_id: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List payments.

        Args:
            status: Filter by status
            rail_type: Filter by rail type
            distribution_id: Filter by distribution
            recipient_id: Filter by recipient
            limit: Maximum results
            offset: Results to skip

        Returns:
            Paginated list of payments
        """
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if rail_type is not None:
            params["railType"] = rail_type
        if distribution_id is not None:
            params["distributionId"] = distribution_id
        if recipient_id is not None:
            params["recipientId"] = recipient_id

        return self._http.get("/v1/payment-rails/payments", params=params)

    def process(self, payment_id: str) -> Dict[str, Any]:
        """
        Process a pending payment.

        Args:
            payment_id: The payment's ID

        Returns:
            Processed payment
        """
        return self._http.post(f"/v1/payment-rails/payments/{payment_id}/process")

    def cancel(self, payment_id: str) -> Dict[str, Any]:
        """
        Cancel a pending payment.

        Args:
            payment_id: The payment's ID

        Returns:
            Cancelled payment
        """
        return self._http.post(f"/v1/payment-rails/payments/{payment_id}/cancel")

    def get_analytics(
        self,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        rail_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get payment analytics.

        Args:
            start_date: Start of date range (ISO 8601)
            end_date: End of date range (ISO 8601)
            rail_type: Filter by rail type

        Returns:
            Analytics data
        """
        params = {}
        if start_date is not None:
            params["startDate"] = start_date
        if end_date is not None:
            params["endDate"] = end_date
        if rail_type is not None:
            params["railType"] = rail_type

        return self._http.get("/v1/payment-rails/payments/analytics", params=params if params else None)


class AsyncPaymentsResource:
    """Async version of PaymentsResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    # Rail Configuration
    async def create_rail(
        self,
        rail_type: str,
        name: str,
        config: Dict[str, Any],
        supported_currencies: List[str],
        *,
        fees: Optional[Dict[str, Any]] = None,
        limits: Optional[Dict[str, Any]] = None,
        is_default: bool = False,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a payment rail configuration."""
        data = {
            "railType": rail_type,
            "name": name,
            "config": config,
            "supportedCurrencies": supported_currencies,
            "isDefault": is_default,
        }
        if fees is not None:
            data["fees"] = fees
        if limits is not None:
            data["limits"] = limits
        if metadata is not None:
            data["metadata"] = metadata

        return await self._http.post("/v1/payment-rails", json=data)

    async def get_rail(self, rail_id: str) -> Dict[str, Any]:
        """Get a payment rail configuration."""
        return await self._http.get(f"/v1/payment-rails/{rail_id}")

    async def update_rail(
        self,
        rail_id: str,
        *,
        name: Optional[str] = None,
        is_active: Optional[bool] = None,
        is_default: Optional[bool] = None,
        config: Optional[Dict[str, Any]] = None,
        fees: Optional[Dict[str, Any]] = None,
        limits: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Update a payment rail configuration."""
        data = {}
        if name is not None:
            data["name"] = name
        if is_active is not None:
            data["isActive"] = is_active
        if is_default is not None:
            data["isDefault"] = is_default
        if config is not None:
            data["config"] = config
        if fees is not None:
            data["fees"] = fees
        if limits is not None:
            data["limits"] = limits
        if metadata is not None:
            data["metadata"] = metadata

        return await self._http.patch(f"/v1/payment-rails/{rail_id}", json=data)

    async def delete_rail(self, rail_id: str) -> None:
        """Delete a payment rail."""
        await self._http.delete(f"/v1/payment-rails/{rail_id}")

    async def list_rails(
        self,
        *,
        rail_type: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """List payment rails."""
        params = {}
        if rail_type is not None:
            params["railType"] = rail_type
        if is_active is not None:
            params["isActive"] = str(is_active).lower()

        return await self._http.get("/v1/payment-rails", params=params if params else None)

    # Payments
    async def create(
        self,
        rail_id: str,
        amount: str,
        currency: str,
        recipient_id: str,
        recipient_type: str,
        *,
        recipient_address: Optional[str] = None,
        recipient_bank_info: Optional[Dict[str, Any]] = None,
        payout_id: Optional[str] = None,
        distribution_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a payment."""
        data = {
            "amount": amount,
            "currency": currency,
            "recipientId": recipient_id,
            "recipientType": recipient_type,
        }
        if recipient_address is not None:
            data["recipientAddress"] = recipient_address
        if recipient_bank_info is not None:
            data["recipientBankInfo"] = recipient_bank_info
        if payout_id is not None:
            data["payoutId"] = payout_id
        if distribution_id is not None:
            data["distributionId"] = distribution_id
        if metadata is not None:
            data["metadata"] = metadata

        return await self._http.post(f"/v1/payment-rails/{rail_id}/payments", json=data)

    async def create_batch(
        self,
        rail_id: str,
        currency: str,
        distribution_id: str,
        payments: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Create a batch of payments."""
        return await self._http.post(
            f"/v1/payment-rails/{rail_id}/payments/batch",
            json={
                "currency": currency,
                "distributionId": distribution_id,
                "payments": payments,
            },
        )

    async def retrieve(self, payment_id: str) -> Dict[str, Any]:
        """Get a payment by ID."""
        return await self._http.get(f"/v1/payment-rails/payments/{payment_id}")

    async def list(
        self,
        *,
        status: Optional[str] = None,
        rail_type: Optional[str] = None,
        distribution_id: Optional[str] = None,
        recipient_id: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """List payments."""
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if rail_type is not None:
            params["railType"] = rail_type
        if distribution_id is not None:
            params["distributionId"] = distribution_id
        if recipient_id is not None:
            params["recipientId"] = recipient_id

        return await self._http.get("/v1/payment-rails/payments", params=params)

    async def process(self, payment_id: str) -> Dict[str, Any]:
        """Process a pending payment."""
        return await self._http.post(f"/v1/payment-rails/payments/{payment_id}/process")

    async def cancel(self, payment_id: str) -> Dict[str, Any]:
        """Cancel a pending payment."""
        return await self._http.post(f"/v1/payment-rails/payments/{payment_id}/cancel")

    async def get_analytics(
        self,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        rail_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get payment analytics."""
        params = {}
        if start_date is not None:
            params["startDate"] = start_date
        if end_date is not None:
            params["endDate"] = end_date
        if rail_type is not None:
            params["railType"] = rail_type

        return await self._http.get("/v1/payment-rails/payments/analytics", params=params if params else None)
