"""
Tokens resource for managing security tokens.
"""

from typing import Any, Dict, List, Optional

from ahoy_tokenisation.models import Token, TokenStatus, TokenStandard, CapTableEntry
from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


class TokensResource:
    """Manage security tokens and cap tables."""

    def __init__(self, http: HttpClient):
        self._http = http

    def create(
        self,
        name: str,
        symbol: str,
        total_supply: str,
        chain_id: int,
        *,
        standard: str = "ERC3643",
        decimals: int = 18,
        compliance_modules: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Token:
        """
        Create a new token (draft state).

        Args:
            name: Token name
            symbol: Token symbol (3-5 chars)
            total_supply: Maximum supply (as string for precision)
            chain_id: Target blockchain chain ID
            standard: Token standard (ERC3643, ERC1400, ERC20)
            decimals: Token decimals (default 18)
            compliance_modules: List of compliance module IDs
            metadata: Custom metadata

        Returns:
            Created Token in draft state
        """
        data = {
            "name": name,
            "symbol": symbol,
            "totalSupply": total_supply,
            "chainId": chain_id,
            "standard": standard,
            "decimals": decimals,
        }
        if compliance_modules is not None:
            data["complianceModules"] = compliance_modules
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post("/v1/tokens", json=data)
        return Token(**response)

    def retrieve(self, token_id: str) -> Token:
        """
        Retrieve a token by ID.

        Args:
            token_id: The token's ID

        Returns:
            Token object
        """
        response = self._http.get(f"/v1/tokens/{token_id}")
        return Token(**response)

    def update(
        self,
        token_id: str,
        *,
        name: Optional[str] = None,
        compliance_modules: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Token:
        """
        Update a token (only in draft state).

        Args:
            token_id: The token's ID
            name: New name
            compliance_modules: Updated compliance modules
            metadata: Updated metadata

        Returns:
            Updated Token
        """
        data = {}
        if name is not None:
            data["name"] = name
        if compliance_modules is not None:
            data["complianceModules"] = compliance_modules
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.patch(f"/v1/tokens/{token_id}", json=data)
        return Token(**response)

    def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        chain_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        List tokens with pagination.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            status: Filter by status
            chain_id: Filter by chain ID

        Returns:
            Paginated response with tokens
        """
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if chain_id is not None:
            params["chainId"] = chain_id

        response = self._http.get("/v1/tokens", params=params)
        response["data"] = [Token(**t) for t in response.get("data", [])]
        return response

    def list_all(
        self,
        *,
        status: Optional[str] = None,
        chain_id: Optional[int] = None,
        page_size: int = 100,
    ) -> PaginatedList:
        """
        Iterate through all tokens.

        Args:
            status: Filter by status
            chain_id: Filter by chain ID
            page_size: Number of items per page

        Yields:
            Token dictionaries
        """
        params = {}
        if status is not None:
            params["status"] = status
        if chain_id is not None:
            params["chainId"] = chain_id

        def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return self._http.get(
                "/v1/tokens",
                params={**params, "limit": limit, "offset": offset},
            )

        return PaginatedList(fetch, page_size=page_size)

    def deploy(self, token_id: str) -> Token:
        """
        Deploy a draft token to the blockchain.

        Args:
            token_id: The token's ID

        Returns:
            Token in deploying state
        """
        response = self._http.post(f"/v1/tokens/{token_id}/deploy")
        return Token(**response)

    def pause(self, token_id: str) -> Token:
        """
        Pause token transfers.

        Args:
            token_id: The token's ID

        Returns:
            Paused Token
        """
        response = self._http.post(f"/v1/tokens/{token_id}/pause")
        return Token(**response)

    def unpause(self, token_id: str) -> Token:
        """
        Resume token transfers.

        Args:
            token_id: The token's ID

        Returns:
            Active Token
        """
        response = self._http.post(f"/v1/tokens/{token_id}/unpause")
        return Token(**response)

    def freeze(self, token_id: str) -> Token:
        """
        Permanently freeze token (irreversible).

        Args:
            token_id: The token's ID

        Returns:
            Frozen Token
        """
        response = self._http.post(f"/v1/tokens/{token_id}/freeze")
        return Token(**response)

    # Cap Table Methods
    def get_cap_table(self, token_id: str) -> List[CapTableEntry]:
        """
        Get the token's cap table.

        Args:
            token_id: The token's ID

        Returns:
            List of CapTableEntry objects
        """
        response = self._http.get(f"/v1/tokens/{token_id}/cap-table")
        return [CapTableEntry(**entry) for entry in response.get("data", [])]

    def get_holder_balance(self, token_id: str, wallet_address: str) -> CapTableEntry:
        """
        Get a specific holder's balance.

        Args:
            token_id: The token's ID
            wallet_address: The holder's wallet address

        Returns:
            CapTableEntry for the holder
        """
        response = self._http.get(f"/v1/tokens/{token_id}/cap-table/{wallet_address}")
        return CapTableEntry(**response)

    # Issuance Methods
    def issue(
        self,
        token_id: str,
        to_wallet: str,
        amount: str,
        *,
        idempotency_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Issue new tokens to a wallet.

        Args:
            token_id: The token's ID
            to_wallet: Recipient wallet address
            amount: Amount to issue (as string)
            idempotency_key: Unique key for idempotent requests
            metadata: Custom metadata

        Returns:
            Issuance result
        """
        data = {
            "toWallet": to_wallet,
            "amount": amount,
        }
        if metadata is not None:
            data["metadata"] = metadata

        return self._http.post(
            f"/v1/tokens/{token_id}/issue",
            json=data,
            idempotency_key=idempotency_key,
        )

    def burn(
        self,
        token_id: str,
        from_wallet: str,
        amount: str,
        *,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Burn tokens from a wallet.

        Args:
            token_id: The token's ID
            from_wallet: Source wallet address
            amount: Amount to burn (as string)
            idempotency_key: Unique key for idempotent requests

        Returns:
            Burn result
        """
        return self._http.post(
            f"/v1/tokens/{token_id}/burn",
            json={"fromWallet": from_wallet, "amount": amount},
            idempotency_key=idempotency_key,
        )


class AsyncTokensResource:
    """Async version of TokensResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    async def create(
        self,
        name: str,
        symbol: str,
        total_supply: str,
        chain_id: int,
        *,
        standard: str = "ERC3643",
        decimals: int = 18,
        compliance_modules: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Token:
        """Create a new token."""
        data = {
            "name": name,
            "symbol": symbol,
            "totalSupply": total_supply,
            "chainId": chain_id,
            "standard": standard,
            "decimals": decimals,
        }
        if compliance_modules is not None:
            data["complianceModules"] = compliance_modules
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post("/v1/tokens", json=data)
        return Token(**response)

    async def retrieve(self, token_id: str) -> Token:
        """Retrieve a token by ID."""
        response = await self._http.get(f"/v1/tokens/{token_id}")
        return Token(**response)

    async def update(
        self,
        token_id: str,
        *,
        name: Optional[str] = None,
        compliance_modules: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Token:
        """Update a token."""
        data = {}
        if name is not None:
            data["name"] = name
        if compliance_modules is not None:
            data["complianceModules"] = compliance_modules
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.patch(f"/v1/tokens/{token_id}", json=data)
        return Token(**response)

    async def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        chain_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """List tokens with pagination."""
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if chain_id is not None:
            params["chainId"] = chain_id

        response = await self._http.get("/v1/tokens", params=params)
        response["data"] = [Token(**t) for t in response.get("data", [])]
        return response

    def list_all(
        self,
        *,
        status: Optional[str] = None,
        chain_id: Optional[int] = None,
        page_size: int = 100,
    ) -> AsyncPaginatedList:
        """Iterate through all tokens."""
        params = {}
        if status is not None:
            params["status"] = status
        if chain_id is not None:
            params["chainId"] = chain_id

        async def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return await self._http.get(
                "/v1/tokens",
                params={**params, "limit": limit, "offset": offset},
            )

        return AsyncPaginatedList(fetch, page_size=page_size)

    async def deploy(self, token_id: str) -> Token:
        """Deploy a draft token to the blockchain."""
        response = await self._http.post(f"/v1/tokens/{token_id}/deploy")
        return Token(**response)

    async def pause(self, token_id: str) -> Token:
        """Pause token transfers."""
        response = await self._http.post(f"/v1/tokens/{token_id}/pause")
        return Token(**response)

    async def unpause(self, token_id: str) -> Token:
        """Resume token transfers."""
        response = await self._http.post(f"/v1/tokens/{token_id}/unpause")
        return Token(**response)

    async def freeze(self, token_id: str) -> Token:
        """Permanently freeze token."""
        response = await self._http.post(f"/v1/tokens/{token_id}/freeze")
        return Token(**response)

    async def get_cap_table(self, token_id: str) -> List[CapTableEntry]:
        """Get the token's cap table."""
        response = await self._http.get(f"/v1/tokens/{token_id}/cap-table")
        return [CapTableEntry(**entry) for entry in response.get("data", [])]

    async def get_holder_balance(self, token_id: str, wallet_address: str) -> CapTableEntry:
        """Get a specific holder's balance."""
        response = await self._http.get(f"/v1/tokens/{token_id}/cap-table/{wallet_address}")
        return CapTableEntry(**response)

    async def issue(
        self,
        token_id: str,
        to_wallet: str,
        amount: str,
        *,
        idempotency_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Issue new tokens to a wallet."""
        data = {"toWallet": to_wallet, "amount": amount}
        if metadata is not None:
            data["metadata"] = metadata

        return await self._http.post(
            f"/v1/tokens/{token_id}/issue",
            json=data,
            idempotency_key=idempotency_key,
        )

    async def burn(
        self,
        token_id: str,
        from_wallet: str,
        amount: str,
        *,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Burn tokens from a wallet."""
        return await self._http.post(
            f"/v1/tokens/{token_id}/burn",
            json={"fromWallet": from_wallet, "amount": amount},
            idempotency_key=idempotency_key,
        )
