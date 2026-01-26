"""
Distributions resource for managing yield distributions.
"""

from typing import Any, Dict, List, Optional

from ahoy_tokenisation.models import (
    DistributionSchedule,
    DistributionEvent,
    Payout,
    DistributionType,
    DistributionFrequency,
    AllocationStrategy,
)
from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


class DistributionsResource:
    """Manage yield distributions and payouts."""

    def __init__(self, http: HttpClient):
        self._http = http

    # Schedule Methods
    def create_schedule(
        self,
        token_id: str,
        type: str,
        frequency: str,
        allocation_strategy: str,
        payment_currency: str,
        start_date: str,
        *,
        amount: Optional[str] = None,
        rate: Optional[float] = None,
        end_date: Optional[str] = None,
        minimum_balance: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> DistributionSchedule:
        """
        Create a distribution schedule.

        Args:
            token_id: The token's ID
            type: Distribution type (DIVIDEND, INTEREST, ROYALTY, etc.)
            frequency: Distribution frequency (MONTHLY, QUARTERLY, etc.)
            allocation_strategy: How to allocate (PRO_RATA, EQUAL, etc.)
            payment_currency: Currency for payments (USDC, USD, etc.)
            start_date: Schedule start date (ISO 8601)
            amount: Fixed amount per distribution
            rate: Rate for percentage-based distributions
            end_date: Optional end date
            minimum_balance: Minimum token balance to qualify
            parameters: Additional parameters for allocation strategy
            metadata: Custom metadata

        Returns:
            Created DistributionSchedule
        """
        data = {
            "tokenId": token_id,
            "type": type,
            "frequency": frequency,
            "allocationStrategy": allocation_strategy,
            "paymentCurrency": payment_currency,
            "startDate": start_date,
        }
        if amount is not None:
            data["amount"] = amount
        if rate is not None:
            data["rate"] = rate
        if end_date is not None:
            data["endDate"] = end_date
        if minimum_balance is not None:
            data["minimumBalance"] = minimum_balance
        if parameters is not None:
            data["parameters"] = parameters
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post("/v1/distributions/schedules", json=data)
        return DistributionSchedule(**response)

    def get_schedule(self, schedule_id: str) -> DistributionSchedule:
        """
        Retrieve a distribution schedule.

        Args:
            schedule_id: The schedule's ID

        Returns:
            DistributionSchedule object
        """
        response = self._http.get(f"/v1/distributions/schedules/{schedule_id}")
        return DistributionSchedule(**response)

    def update_schedule(
        self,
        schedule_id: str,
        *,
        amount: Optional[str] = None,
        rate: Optional[float] = None,
        end_date: Optional[str] = None,
        is_active: Optional[bool] = None,
        parameters: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> DistributionSchedule:
        """
        Update a distribution schedule.

        Args:
            schedule_id: The schedule's ID
            amount: New fixed amount
            rate: New rate
            end_date: New end date
            is_active: Activate or deactivate schedule
            parameters: Updated parameters
            metadata: Updated metadata

        Returns:
            Updated DistributionSchedule
        """
        data = {}
        if amount is not None:
            data["amount"] = amount
        if rate is not None:
            data["rate"] = rate
        if end_date is not None:
            data["endDate"] = end_date
        if is_active is not None:
            data["isActive"] = is_active
        if parameters is not None:
            data["parameters"] = parameters
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.patch(f"/v1/distributions/schedules/{schedule_id}", json=data)
        return DistributionSchedule(**response)

    def list_schedules(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        token_id: Optional[str] = None,
        type: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        List distribution schedules.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            token_id: Filter by token
            type: Filter by distribution type
            is_active: Filter by active status

        Returns:
            Paginated response with schedules
        """
        params = {"limit": limit, "offset": offset}
        if token_id is not None:
            params["tokenId"] = token_id
        if type is not None:
            params["type"] = type
        if is_active is not None:
            params["isActive"] = is_active

        response = self._http.get("/v1/distributions/schedules", params=params)
        response["data"] = [DistributionSchedule(**s) for s in response.get("data", [])]
        return response

    def delete_schedule(self, schedule_id: str) -> None:
        """
        Delete a distribution schedule.

        Args:
            schedule_id: The schedule's ID
        """
        self._http.delete(f"/v1/distributions/schedules/{schedule_id}")

    # Distribution Event Methods
    def execute_distribution(
        self,
        schedule_id: str,
        *,
        snapshot_date: Optional[str] = None,
        override_amount: Optional[str] = None,
    ) -> DistributionEvent:
        """
        Execute a distribution from a schedule.

        Args:
            schedule_id: The schedule's ID
            snapshot_date: Date for cap table snapshot (defaults to now)
            override_amount: Override the scheduled amount

        Returns:
            Created DistributionEvent
        """
        data = {}
        if snapshot_date is not None:
            data["snapshotDate"] = snapshot_date
        if override_amount is not None:
            data["overrideAmount"] = override_amount

        response = self._http.post(
            f"/v1/distributions/schedules/{schedule_id}/execute",
            json=data if data else None,
        )
        return DistributionEvent(**response)

    def get_distribution(self, distribution_id: str) -> DistributionEvent:
        """
        Retrieve a distribution event.

        Args:
            distribution_id: The distribution's ID

        Returns:
            DistributionEvent object
        """
        response = self._http.get(f"/v1/distributions/{distribution_id}")
        return DistributionEvent(**response)

    def list_distributions(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        schedule_id: Optional[str] = None,
        token_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List distribution events.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            schedule_id: Filter by schedule
            token_id: Filter by token
            status: Filter by status

        Returns:
            Paginated response with distributions
        """
        params = {"limit": limit, "offset": offset}
        if schedule_id is not None:
            params["scheduleId"] = schedule_id
        if token_id is not None:
            params["tokenId"] = token_id
        if status is not None:
            params["status"] = status

        response = self._http.get("/v1/distributions", params=params)
        response["data"] = [DistributionEvent(**d) for d in response.get("data", [])]
        return response

    # Payout Methods
    def list_payouts(
        self,
        distribution_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        claimed: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        List payouts for a distribution.

        Args:
            distribution_id: The distribution's ID
            limit: Maximum number of results
            offset: Number of results to skip
            claimed: Filter by claimed status

        Returns:
            Paginated response with payouts
        """
        params = {"limit": limit, "offset": offset}
        if claimed is not None:
            params["claimed"] = claimed

        response = self._http.get(
            f"/v1/distributions/{distribution_id}/payouts",
            params=params,
        )
        response["data"] = [Payout(**p) for p in response.get("data", [])]
        return response

    def get_investor_payouts(
        self,
        investor_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        token_id: Optional[str] = None,
        claimed: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        List all payouts for an investor.

        Args:
            investor_id: The investor's ID
            limit: Maximum number of results
            offset: Number of results to skip
            token_id: Filter by token
            claimed: Filter by claimed status

        Returns:
            Paginated response with payouts
        """
        params = {"limit": limit, "offset": offset}
        if token_id is not None:
            params["tokenId"] = token_id
        if claimed is not None:
            params["claimed"] = claimed

        response = self._http.get(
            f"/v1/investors/{investor_id}/payouts",
            params=params,
        )
        response["data"] = [Payout(**p) for p in response.get("data", [])]
        return response

    def claim_payout(self, payout_id: str) -> Payout:
        """
        Mark a payout as claimed.

        Args:
            payout_id: The payout's ID

        Returns:
            Updated Payout
        """
        response = self._http.post(f"/v1/payouts/{payout_id}/claim")
        return Payout(**response)

    # Analytics
    def get_analytics(
        self,
        token_id: str,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get distribution analytics for a token.

        Args:
            token_id: The token's ID
            start_date: Start of date range
            end_date: End of date range

        Returns:
            Analytics data including totals and breakdowns
        """
        params = {}
        if start_date is not None:
            params["startDate"] = start_date
        if end_date is not None:
            params["endDate"] = end_date

        return self._http.get(f"/v1/tokens/{token_id}/distributions/analytics", params=params)


class AsyncDistributionsResource:
    """Async version of DistributionsResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    async def create_schedule(
        self,
        token_id: str,
        type: str,
        frequency: str,
        allocation_strategy: str,
        payment_currency: str,
        start_date: str,
        *,
        amount: Optional[str] = None,
        rate: Optional[float] = None,
        end_date: Optional[str] = None,
        minimum_balance: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> DistributionSchedule:
        """Create a distribution schedule."""
        data = {
            "tokenId": token_id,
            "type": type,
            "frequency": frequency,
            "allocationStrategy": allocation_strategy,
            "paymentCurrency": payment_currency,
            "startDate": start_date,
        }
        if amount is not None:
            data["amount"] = amount
        if rate is not None:
            data["rate"] = rate
        if end_date is not None:
            data["endDate"] = end_date
        if minimum_balance is not None:
            data["minimumBalance"] = minimum_balance
        if parameters is not None:
            data["parameters"] = parameters
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post("/v1/distributions/schedules", json=data)
        return DistributionSchedule(**response)

    async def get_schedule(self, schedule_id: str) -> DistributionSchedule:
        """Retrieve a distribution schedule."""
        response = await self._http.get(f"/v1/distributions/schedules/{schedule_id}")
        return DistributionSchedule(**response)

    async def update_schedule(
        self,
        schedule_id: str,
        *,
        amount: Optional[str] = None,
        rate: Optional[float] = None,
        end_date: Optional[str] = None,
        is_active: Optional[bool] = None,
        parameters: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> DistributionSchedule:
        """Update a distribution schedule."""
        data = {}
        if amount is not None:
            data["amount"] = amount
        if rate is not None:
            data["rate"] = rate
        if end_date is not None:
            data["endDate"] = end_date
        if is_active is not None:
            data["isActive"] = is_active
        if parameters is not None:
            data["parameters"] = parameters
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.patch(f"/v1/distributions/schedules/{schedule_id}", json=data)
        return DistributionSchedule(**response)

    async def list_schedules(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        token_id: Optional[str] = None,
        type: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """List distribution schedules."""
        params = {"limit": limit, "offset": offset}
        if token_id is not None:
            params["tokenId"] = token_id
        if type is not None:
            params["type"] = type
        if is_active is not None:
            params["isActive"] = is_active

        response = await self._http.get("/v1/distributions/schedules", params=params)
        response["data"] = [DistributionSchedule(**s) for s in response.get("data", [])]
        return response

    async def delete_schedule(self, schedule_id: str) -> None:
        """Delete a distribution schedule."""
        await self._http.delete(f"/v1/distributions/schedules/{schedule_id}")

    async def execute_distribution(
        self,
        schedule_id: str,
        *,
        snapshot_date: Optional[str] = None,
        override_amount: Optional[str] = None,
    ) -> DistributionEvent:
        """Execute a distribution from a schedule."""
        data = {}
        if snapshot_date is not None:
            data["snapshotDate"] = snapshot_date
        if override_amount is not None:
            data["overrideAmount"] = override_amount

        response = await self._http.post(
            f"/v1/distributions/schedules/{schedule_id}/execute",
            json=data if data else None,
        )
        return DistributionEvent(**response)

    async def get_distribution(self, distribution_id: str) -> DistributionEvent:
        """Retrieve a distribution event."""
        response = await self._http.get(f"/v1/distributions/{distribution_id}")
        return DistributionEvent(**response)

    async def list_distributions(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        schedule_id: Optional[str] = None,
        token_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List distribution events."""
        params = {"limit": limit, "offset": offset}
        if schedule_id is not None:
            params["scheduleId"] = schedule_id
        if token_id is not None:
            params["tokenId"] = token_id
        if status is not None:
            params["status"] = status

        response = await self._http.get("/v1/distributions", params=params)
        response["data"] = [DistributionEvent(**d) for d in response.get("data", [])]
        return response

    async def list_payouts(
        self,
        distribution_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        claimed: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """List payouts for a distribution."""
        params = {"limit": limit, "offset": offset}
        if claimed is not None:
            params["claimed"] = claimed

        response = await self._http.get(
            f"/v1/distributions/{distribution_id}/payouts",
            params=params,
        )
        response["data"] = [Payout(**p) for p in response.get("data", [])]
        return response

    async def get_investor_payouts(
        self,
        investor_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        token_id: Optional[str] = None,
        claimed: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """List all payouts for an investor."""
        params = {"limit": limit, "offset": offset}
        if token_id is not None:
            params["tokenId"] = token_id
        if claimed is not None:
            params["claimed"] = claimed

        response = await self._http.get(
            f"/v1/investors/{investor_id}/payouts",
            params=params,
        )
        response["data"] = [Payout(**p) for p in response.get("data", [])]
        return response

    async def claim_payout(self, payout_id: str) -> Payout:
        """Mark a payout as claimed."""
        response = await self._http.post(f"/v1/payouts/{payout_id}/claim")
        return Payout(**response)

    async def get_analytics(
        self,
        token_id: str,
        *,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get distribution analytics for a token."""
        params = {}
        if start_date is not None:
            params["startDate"] = start_date
        if end_date is not None:
            params["endDate"] = end_date

        return await self._http.get(f"/v1/tokens/{token_id}/distributions/analytics", params=params)
