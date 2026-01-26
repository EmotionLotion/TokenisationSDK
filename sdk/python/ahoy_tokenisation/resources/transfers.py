"""
Transfers resource for managing token transfers.
"""

from typing import Any, Dict, Optional

from ahoy_tokenisation.models import Transfer, TransferStatus
from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


class TransfersResource:
    """Manage token transfers between wallets."""

    def __init__(self, http: HttpClient):
        self._http = http

    def create(
        self,
        token_id: str,
        from_wallet: str,
        to_wallet: str,
        amount: str,
        *,
        idempotency_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Transfer:
        """
        Initiate a token transfer.

        The transfer will go through compliance checks before execution.

        Args:
            token_id: The token's ID
            from_wallet: Source wallet address
            to_wallet: Destination wallet address
            amount: Amount to transfer (as string for precision)
            idempotency_key: Unique key for idempotent requests
            metadata: Custom metadata

        Returns:
            Created Transfer in pending state
        """
        data = {
            "tokenId": token_id,
            "fromWallet": from_wallet,
            "toWallet": to_wallet,
            "amount": amount,
        }
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post(
            "/v1/transfers",
            json=data,
            idempotency_key=idempotency_key,
        )
        return Transfer(**response)

    def retrieve(self, transfer_id: str) -> Transfer:
        """
        Retrieve a transfer by ID.

        Args:
            transfer_id: The transfer's ID

        Returns:
            Transfer object
        """
        response = self._http.get(f"/v1/transfers/{transfer_id}")
        return Transfer(**response)

    def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        token_id: Optional[str] = None,
        status: Optional[str] = None,
        from_wallet: Optional[str] = None,
        to_wallet: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List transfers with pagination.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            token_id: Filter by token
            status: Filter by status
            from_wallet: Filter by source wallet
            to_wallet: Filter by destination wallet

        Returns:
            Paginated response with transfers
        """
        params = {"limit": limit, "offset": offset}
        if token_id is not None:
            params["tokenId"] = token_id
        if status is not None:
            params["status"] = status
        if from_wallet is not None:
            params["fromWallet"] = from_wallet
        if to_wallet is not None:
            params["toWallet"] = to_wallet

        response = self._http.get("/v1/transfers", params=params)
        response["data"] = [Transfer(**t) for t in response.get("data", [])]
        return response

    def list_all(
        self,
        *,
        token_id: Optional[str] = None,
        status: Optional[str] = None,
        from_wallet: Optional[str] = None,
        to_wallet: Optional[str] = None,
        page_size: int = 100,
    ) -> PaginatedList:
        """
        Iterate through all transfers.

        Args:
            token_id: Filter by token
            status: Filter by status
            from_wallet: Filter by source wallet
            to_wallet: Filter by destination wallet
            page_size: Number of items per page

        Yields:
            Transfer dictionaries
        """
        params = {}
        if token_id is not None:
            params["tokenId"] = token_id
        if status is not None:
            params["status"] = status
        if from_wallet is not None:
            params["fromWallet"] = from_wallet
        if to_wallet is not None:
            params["toWallet"] = to_wallet

        def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return self._http.get(
                "/v1/transfers",
                params={**params, "limit": limit, "offset": offset},
            )

        return PaginatedList(fetch, page_size=page_size)

    def approve(self, transfer_id: str) -> Transfer:
        """
        Approve a transfer (for manual approval flows).

        Args:
            transfer_id: The transfer's ID

        Returns:
            Approved Transfer
        """
        response = self._http.post(f"/v1/transfers/{transfer_id}/approve")
        return Transfer(**response)

    def reject(
        self,
        transfer_id: str,
        *,
        reason: Optional[str] = None,
    ) -> Transfer:
        """
        Reject a transfer.

        Args:
            transfer_id: The transfer's ID
            reason: Rejection reason

        Returns:
            Rejected Transfer
        """
        data = {}
        if reason is not None:
            data["reason"] = reason

        response = self._http.post(f"/v1/transfers/{transfer_id}/reject", json=data)
        return Transfer(**response)

    def cancel(self, transfer_id: str) -> Transfer:
        """
        Cancel a pending transfer.

        Args:
            transfer_id: The transfer's ID

        Returns:
            Cancelled Transfer
        """
        response = self._http.post(f"/v1/transfers/{transfer_id}/cancel")
        return Transfer(**response)

    def check_compliance(
        self,
        token_id: str,
        from_wallet: str,
        to_wallet: str,
        amount: str,
    ) -> Dict[str, Any]:
        """
        Pre-check if a transfer would pass compliance.

        Args:
            token_id: The token's ID
            from_wallet: Source wallet address
            to_wallet: Destination wallet address
            amount: Amount to transfer

        Returns:
            Compliance check result with allowed flag and reasons
        """
        return self._http.post(
            "/v1/transfers/check",
            json={
                "tokenId": token_id,
                "fromWallet": from_wallet,
                "toWallet": to_wallet,
                "amount": amount,
            },
        )


class AsyncTransfersResource:
    """Async version of TransfersResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    async def create(
        self,
        token_id: str,
        from_wallet: str,
        to_wallet: str,
        amount: str,
        *,
        idempotency_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Transfer:
        """Initiate a token transfer."""
        data = {
            "tokenId": token_id,
            "fromWallet": from_wallet,
            "toWallet": to_wallet,
            "amount": amount,
        }
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post(
            "/v1/transfers",
            json=data,
            idempotency_key=idempotency_key,
        )
        return Transfer(**response)

    async def retrieve(self, transfer_id: str) -> Transfer:
        """Retrieve a transfer by ID."""
        response = await self._http.get(f"/v1/transfers/{transfer_id}")
        return Transfer(**response)

    async def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        token_id: Optional[str] = None,
        status: Optional[str] = None,
        from_wallet: Optional[str] = None,
        to_wallet: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List transfers with pagination."""
        params = {"limit": limit, "offset": offset}
        if token_id is not None:
            params["tokenId"] = token_id
        if status is not None:
            params["status"] = status
        if from_wallet is not None:
            params["fromWallet"] = from_wallet
        if to_wallet is not None:
            params["toWallet"] = to_wallet

        response = await self._http.get("/v1/transfers", params=params)
        response["data"] = [Transfer(**t) for t in response.get("data", [])]
        return response

    def list_all(
        self,
        *,
        token_id: Optional[str] = None,
        status: Optional[str] = None,
        from_wallet: Optional[str] = None,
        to_wallet: Optional[str] = None,
        page_size: int = 100,
    ) -> AsyncPaginatedList:
        """Iterate through all transfers."""
        params = {}
        if token_id is not None:
            params["tokenId"] = token_id
        if status is not None:
            params["status"] = status
        if from_wallet is not None:
            params["fromWallet"] = from_wallet
        if to_wallet is not None:
            params["toWallet"] = to_wallet

        async def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return await self._http.get(
                "/v1/transfers",
                params={**params, "limit": limit, "offset": offset},
            )

        return AsyncPaginatedList(fetch, page_size=page_size)

    async def approve(self, transfer_id: str) -> Transfer:
        """Approve a transfer."""
        response = await self._http.post(f"/v1/transfers/{transfer_id}/approve")
        return Transfer(**response)

    async def reject(
        self,
        transfer_id: str,
        *,
        reason: Optional[str] = None,
    ) -> Transfer:
        """Reject a transfer."""
        data = {}
        if reason is not None:
            data["reason"] = reason

        response = await self._http.post(f"/v1/transfers/{transfer_id}/reject", json=data)
        return Transfer(**response)

    async def cancel(self, transfer_id: str) -> Transfer:
        """Cancel a pending transfer."""
        response = await self._http.post(f"/v1/transfers/{transfer_id}/cancel")
        return Transfer(**response)

    async def check_compliance(
        self,
        token_id: str,
        from_wallet: str,
        to_wallet: str,
        amount: str,
    ) -> Dict[str, Any]:
        """Pre-check if a transfer would pass compliance."""
        return await self._http.post(
            "/v1/transfers/check",
            json={
                "tokenId": token_id,
                "fromWallet": from_wallet,
                "toWallet": to_wallet,
                "amount": amount,
            },
        )
