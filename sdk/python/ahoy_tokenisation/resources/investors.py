"""
Investors resource for managing investor accounts and KYC.
"""

from typing import Any, Dict, List, Optional

from ahoy_tokenisation.models import (
    Investor,
    InvestorType,
    InvestorStatus,
    KycSession,
    InvestorWallet,
    WalletStatus,
)
from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


class InvestorsResource:
    """Manage investors and their KYC status."""

    def __init__(self, http: HttpClient):
        self._http = http

    def create(
        self,
        email: str,
        type: str,
        country_code: str,
        *,
        external_id: Optional[str] = None,
        phone: Optional[str] = None,
        tax_residency: Optional[str] = None,
        profile: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Investor:
        """
        Create a new investor.

        Args:
            email: Investor's email address
            type: Investor type (individual, institutional, qualified, accredited)
            country_code: ISO 3166-1 alpha-2 country code
            external_id: Your system's ID for this investor
            phone: Phone number
            tax_residency: Tax residency country code
            profile: Additional profile data
            metadata: Custom metadata

        Returns:
            Created Investor object
        """
        data = {
            "email": email,
            "type": type,
            "countryCode": country_code,
        }
        if external_id is not None:
            data["externalId"] = external_id
        if phone is not None:
            data["phone"] = phone
        if tax_residency is not None:
            data["taxResidency"] = tax_residency
        if profile is not None:
            data["profile"] = profile
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post("/v1/investors", json=data)
        return Investor(**response)

    def retrieve(self, investor_id: str) -> Investor:
        """
        Retrieve an investor by ID.

        Args:
            investor_id: The investor's ID

        Returns:
            Investor object
        """
        response = self._http.get(f"/v1/investors/{investor_id}")
        return Investor(**response)

    def update(
        self,
        investor_id: str,
        *,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        status: Optional[str] = None,
        profile: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Investor:
        """
        Update an investor.

        Args:
            investor_id: The investor's ID
            email: New email address
            phone: New phone number
            status: New status
            profile: Updated profile data
            metadata: Updated metadata

        Returns:
            Updated Investor object
        """
        data = {}
        if email is not None:
            data["email"] = email
        if phone is not None:
            data["phone"] = phone
        if status is not None:
            data["status"] = status
        if profile is not None:
            data["profile"] = profile
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.patch(f"/v1/investors/{investor_id}", json=data)
        return Investor(**response)

    def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        kyc_status: Optional[str] = None,
        type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List investors with pagination.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            status: Filter by status
            kyc_status: Filter by KYC status
            type: Filter by investor type

        Returns:
            Paginated response with investors
        """
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if kyc_status is not None:
            params["kycStatus"] = kyc_status
        if type is not None:
            params["type"] = type

        response = self._http.get("/v1/investors", params=params)
        response["data"] = [Investor(**inv) for inv in response.get("data", [])]
        return response

    def list_all(
        self,
        *,
        status: Optional[str] = None,
        kyc_status: Optional[str] = None,
        type: Optional[str] = None,
        page_size: int = 100,
    ) -> PaginatedList:
        """
        Iterate through all investors.

        Args:
            status: Filter by status
            kyc_status: Filter by KYC status
            type: Filter by investor type
            page_size: Number of items per page

        Yields:
            Investor objects
        """
        params = {}
        if status is not None:
            params["status"] = status
        if kyc_status is not None:
            params["kycStatus"] = kyc_status
        if type is not None:
            params["type"] = type

        def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return self._http.get(
                "/v1/investors",
                params={**params, "limit": limit, "offset": offset},
            )

        return PaginatedList(fetch, page_size=page_size)

    # KYC Methods
    def start_kyc(
        self,
        investor_id: str,
        *,
        provider: str = "sumsub",
        level: str = "basic",
        redirect_url: Optional[str] = None,
    ) -> KycSession:
        """
        Start a KYC verification session.

        Args:
            investor_id: The investor's ID
            provider: KYC provider (sumsub, onfido, jumio)
            level: Verification level
            redirect_url: URL to redirect after verification

        Returns:
            KycSession with verification URL
        """
        data = {
            "provider": provider,
            "level": level,
        }
        if redirect_url is not None:
            data["redirectUrl"] = redirect_url

        response = self._http.post(f"/v1/investors/{investor_id}/kyc", json=data)
        return KycSession(**response)

    def get_kyc_status(self, investor_id: str) -> KycSession:
        """
        Get the current KYC session status.

        Args:
            investor_id: The investor's ID

        Returns:
            Current KycSession
        """
        response = self._http.get(f"/v1/investors/{investor_id}/kyc")
        return KycSession(**response)

    # Wallet Methods
    def add_wallet(
        self,
        investor_id: str,
        address: str,
        chain_id: int,
        *,
        label: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> InvestorWallet:
        """
        Add a wallet to an investor.

        Args:
            investor_id: The investor's ID
            address: Wallet address
            chain_id: Blockchain chain ID
            label: Optional label for the wallet
            metadata: Custom metadata

        Returns:
            Created InvestorWallet
        """
        data = {
            "address": address,
            "chainId": chain_id,
        }
        if label is not None:
            data["label"] = label
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post(f"/v1/investors/{investor_id}/wallets", json=data)
        return InvestorWallet(**response)

    def list_wallets(self, investor_id: str) -> List[InvestorWallet]:
        """
        List an investor's wallets.

        Args:
            investor_id: The investor's ID

        Returns:
            List of InvestorWallet objects
        """
        response = self._http.get(f"/v1/investors/{investor_id}/wallets")
        return [InvestorWallet(**w) for w in response.get("data", [])]

    def verify_wallet(
        self,
        investor_id: str,
        wallet_id: str,
        signature: str,
    ) -> InvestorWallet:
        """
        Verify wallet ownership via signature.

        Args:
            investor_id: The investor's ID
            wallet_id: The wallet's ID
            signature: Signed verification message

        Returns:
            Updated InvestorWallet
        """
        response = self._http.post(
            f"/v1/investors/{investor_id}/wallets/{wallet_id}/verify",
            json={"signature": signature},
        )
        return InvestorWallet(**response)


class AsyncInvestorsResource:
    """Async version of InvestorsResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    async def create(
        self,
        email: str,
        type: str,
        country_code: str,
        *,
        external_id: Optional[str] = None,
        phone: Optional[str] = None,
        tax_residency: Optional[str] = None,
        profile: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Investor:
        """Create a new investor."""
        data = {
            "email": email,
            "type": type,
            "countryCode": country_code,
        }
        if external_id is not None:
            data["externalId"] = external_id
        if phone is not None:
            data["phone"] = phone
        if tax_residency is not None:
            data["taxResidency"] = tax_residency
        if profile is not None:
            data["profile"] = profile
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post("/v1/investors", json=data)
        return Investor(**response)

    async def retrieve(self, investor_id: str) -> Investor:
        """Retrieve an investor by ID."""
        response = await self._http.get(f"/v1/investors/{investor_id}")
        return Investor(**response)

    async def update(
        self,
        investor_id: str,
        *,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        status: Optional[str] = None,
        profile: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Investor:
        """Update an investor."""
        data = {}
        if email is not None:
            data["email"] = email
        if phone is not None:
            data["phone"] = phone
        if status is not None:
            data["status"] = status
        if profile is not None:
            data["profile"] = profile
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.patch(f"/v1/investors/{investor_id}", json=data)
        return Investor(**response)

    async def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        kyc_status: Optional[str] = None,
        type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List investors with pagination."""
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if kyc_status is not None:
            params["kycStatus"] = kyc_status
        if type is not None:
            params["type"] = type

        response = await self._http.get("/v1/investors", params=params)
        response["data"] = [Investor(**inv) for inv in response.get("data", [])]
        return response

    def list_all(
        self,
        *,
        status: Optional[str] = None,
        kyc_status: Optional[str] = None,
        type: Optional[str] = None,
        page_size: int = 100,
    ) -> AsyncPaginatedList:
        """Iterate through all investors."""
        params = {}
        if status is not None:
            params["status"] = status
        if kyc_status is not None:
            params["kycStatus"] = kyc_status
        if type is not None:
            params["type"] = type

        async def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return await self._http.get(
                "/v1/investors",
                params={**params, "limit": limit, "offset": offset},
            )

        return AsyncPaginatedList(fetch, page_size=page_size)

    async def start_kyc(
        self,
        investor_id: str,
        *,
        provider: str = "sumsub",
        level: str = "basic",
        redirect_url: Optional[str] = None,
    ) -> KycSession:
        """Start a KYC verification session."""
        data = {"provider": provider, "level": level}
        if redirect_url is not None:
            data["redirectUrl"] = redirect_url

        response = await self._http.post(f"/v1/investors/{investor_id}/kyc", json=data)
        return KycSession(**response)

    async def get_kyc_status(self, investor_id: str) -> KycSession:
        """Get the current KYC session status."""
        response = await self._http.get(f"/v1/investors/{investor_id}/kyc")
        return KycSession(**response)

    async def add_wallet(
        self,
        investor_id: str,
        address: str,
        chain_id: int,
        *,
        label: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> InvestorWallet:
        """Add a wallet to an investor."""
        data = {"address": address, "chainId": chain_id}
        if label is not None:
            data["label"] = label
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post(f"/v1/investors/{investor_id}/wallets", json=data)
        return InvestorWallet(**response)

    async def list_wallets(self, investor_id: str) -> List[InvestorWallet]:
        """List an investor's wallets."""
        response = await self._http.get(f"/v1/investors/{investor_id}/wallets")
        return [InvestorWallet(**w) for w in response.get("data", [])]

    async def verify_wallet(
        self,
        investor_id: str,
        wallet_id: str,
        signature: str,
    ) -> InvestorWallet:
        """Verify wallet ownership via signature."""
        response = await self._http.post(
            f"/v1/investors/{investor_id}/wallets/{wallet_id}/verify",
            json={"signature": signature},
        )
        return InvestorWallet(**response)
