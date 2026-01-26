"""
Compliance resource for managing policies and decisions.
"""

from typing import Any, Dict, List, Optional

from ahoy_tokenisation.models import Policy, ComplianceDecision, Rule
from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


class ComplianceResource:
    """Manage compliance policies and audit decisions."""

    def __init__(self, http: HttpClient):
        self._http = http

    # Policy Methods
    def create_policy(
        self,
        name: str,
        type: str,
        rules: List[Dict[str, Any]],
        *,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Policy:
        """
        Create a compliance policy.

        Args:
            name: Policy name
            type: Policy type (transfer, issuance, distribution)
            rules: List of rule definitions
            description: Policy description
            metadata: Custom metadata

        Returns:
            Created Policy
        """
        data = {
            "name": name,
            "type": type,
            "rules": rules,
        }
        if description is not None:
            data["description"] = description
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post("/v1/policies", json=data)
        return Policy(**response)

    def retrieve_policy(self, policy_id: str) -> Policy:
        """
        Retrieve a policy by ID.

        Args:
            policy_id: The policy's ID

        Returns:
            Policy object
        """
        response = self._http.get(f"/v1/policies/{policy_id}")
        return Policy(**response)

    def update_policy(
        self,
        policy_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        rules: Optional[List[Dict[str, Any]]] = None,
        status: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Policy:
        """
        Update a policy (creates new version).

        Args:
            policy_id: The policy's ID
            name: New name
            description: New description
            rules: Updated rules
            status: New status (active, inactive)
            metadata: Updated metadata

        Returns:
            Updated Policy with incremented version
        """
        data = {}
        if name is not None:
            data["name"] = name
        if description is not None:
            data["description"] = description
        if rules is not None:
            data["rules"] = rules
        if status is not None:
            data["status"] = status
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.patch(f"/v1/policies/{policy_id}", json=data)
        return Policy(**response)

    def list_policies(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List policies.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            type: Filter by policy type
            status: Filter by status

        Returns:
            Paginated response with policies
        """
        params = {"limit": limit, "offset": offset}
        if type is not None:
            params["type"] = type
        if status is not None:
            params["status"] = status

        response = self._http.get("/v1/policies", params=params)
        response["data"] = [Policy(**p) for p in response.get("data", [])]
        return response

    def delete_policy(self, policy_id: str) -> None:
        """
        Delete a policy.

        Args:
            policy_id: The policy's ID
        """
        self._http.delete(f"/v1/policies/{policy_id}")

    # Policy Attachment
    def attach_policy(
        self,
        token_id: str,
        policy_id: str,
        *,
        priority: int = 0,
    ) -> Dict[str, Any]:
        """
        Attach a policy to a token.

        Args:
            token_id: The token's ID
            policy_id: The policy's ID
            priority: Evaluation priority (lower = first)

        Returns:
            Attachment details
        """
        return self._http.post(
            f"/v1/tokens/{token_id}/policies",
            json={"policyId": policy_id, "priority": priority},
        )

    def detach_policy(self, token_id: str, policy_id: str) -> None:
        """
        Detach a policy from a token.

        Args:
            token_id: The token's ID
            policy_id: The policy's ID
        """
        self._http.delete(f"/v1/tokens/{token_id}/policies/{policy_id}")

    def list_token_policies(self, token_id: str) -> List[Policy]:
        """
        List policies attached to a token.

        Args:
            token_id: The token's ID

        Returns:
            List of attached policies
        """
        response = self._http.get(f"/v1/tokens/{token_id}/policies")
        return [Policy(**p) for p in response.get("data", [])]

    # Decision Methods
    def retrieve_decision(self, decision_id: str) -> ComplianceDecision:
        """
        Retrieve a compliance decision.

        Args:
            decision_id: The decision's ID

        Returns:
            ComplianceDecision object
        """
        response = self._http.get(f"/v1/decisions/{decision_id}")
        return ComplianceDecision(**response)

    def list_decisions(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        type: Optional[str] = None,
        result: Optional[str] = None,
        policy_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List compliance decisions (audit trail).

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            type: Filter by decision type
            result: Filter by result (allow, deny)
            policy_id: Filter by policy

        Returns:
            Paginated response with decisions
        """
        params = {"limit": limit, "offset": offset}
        if type is not None:
            params["type"] = type
        if result is not None:
            params["result"] = result
        if policy_id is not None:
            params["policyId"] = policy_id

        response = self._http.get("/v1/decisions", params=params)
        response["data"] = [ComplianceDecision(**d) for d in response.get("data", [])]
        return response

    def list_all_decisions(
        self,
        *,
        type: Optional[str] = None,
        result: Optional[str] = None,
        policy_id: Optional[str] = None,
        page_size: int = 100,
    ) -> PaginatedList:
        """
        Iterate through all compliance decisions.

        Args:
            type: Filter by decision type
            result: Filter by result (allow, deny)
            policy_id: Filter by policy
            page_size: Number of items per page

        Yields:
            Decision dictionaries
        """
        params = {}
        if type is not None:
            params["type"] = type
        if result is not None:
            params["result"] = result
        if policy_id is not None:
            params["policyId"] = policy_id

        def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return self._http.get(
                "/v1/decisions",
                params={**params, "limit": limit, "offset": offset},
            )

        return PaginatedList(fetch, page_size=page_size)

    # Pre-check compliance
    def check(
        self,
        type: str,
        inputs: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Pre-check compliance without recording a decision.

        Args:
            type: Check type (transfer, issuance)
            inputs: Check inputs (varies by type)

        Returns:
            Check result with allowed flag and reasons
        """
        return self._http.post(
            "/v1/compliance/check",
            json={"type": type, "inputs": inputs},
        )


class AsyncComplianceResource:
    """Async version of ComplianceResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    async def create_policy(
        self,
        name: str,
        type: str,
        rules: List[Dict[str, Any]],
        *,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Policy:
        """Create a compliance policy."""
        data = {"name": name, "type": type, "rules": rules}
        if description is not None:
            data["description"] = description
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post("/v1/policies", json=data)
        return Policy(**response)

    async def retrieve_policy(self, policy_id: str) -> Policy:
        """Retrieve a policy by ID."""
        response = await self._http.get(f"/v1/policies/{policy_id}")
        return Policy(**response)

    async def update_policy(
        self,
        policy_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        rules: Optional[List[Dict[str, Any]]] = None,
        status: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Policy:
        """Update a policy."""
        data = {}
        if name is not None:
            data["name"] = name
        if description is not None:
            data["description"] = description
        if rules is not None:
            data["rules"] = rules
        if status is not None:
            data["status"] = status
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.patch(f"/v1/policies/{policy_id}", json=data)
        return Policy(**response)

    async def list_policies(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        type: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List policies."""
        params = {"limit": limit, "offset": offset}
        if type is not None:
            params["type"] = type
        if status is not None:
            params["status"] = status

        response = await self._http.get("/v1/policies", params=params)
        response["data"] = [Policy(**p) for p in response.get("data", [])]
        return response

    async def delete_policy(self, policy_id: str) -> None:
        """Delete a policy."""
        await self._http.delete(f"/v1/policies/{policy_id}")

    async def attach_policy(
        self,
        token_id: str,
        policy_id: str,
        *,
        priority: int = 0,
    ) -> Dict[str, Any]:
        """Attach a policy to a token."""
        return await self._http.post(
            f"/v1/tokens/{token_id}/policies",
            json={"policyId": policy_id, "priority": priority},
        )

    async def detach_policy(self, token_id: str, policy_id: str) -> None:
        """Detach a policy from a token."""
        await self._http.delete(f"/v1/tokens/{token_id}/policies/{policy_id}")

    async def list_token_policies(self, token_id: str) -> List[Policy]:
        """List policies attached to a token."""
        response = await self._http.get(f"/v1/tokens/{token_id}/policies")
        return [Policy(**p) for p in response.get("data", [])]

    async def retrieve_decision(self, decision_id: str) -> ComplianceDecision:
        """Retrieve a compliance decision."""
        response = await self._http.get(f"/v1/decisions/{decision_id}")
        return ComplianceDecision(**response)

    async def list_decisions(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        type: Optional[str] = None,
        result: Optional[str] = None,
        policy_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List compliance decisions."""
        params = {"limit": limit, "offset": offset}
        if type is not None:
            params["type"] = type
        if result is not None:
            params["result"] = result
        if policy_id is not None:
            params["policyId"] = policy_id

        response = await self._http.get("/v1/decisions", params=params)
        response["data"] = [ComplianceDecision(**d) for d in response.get("data", [])]
        return response

    def list_all_decisions(
        self,
        *,
        type: Optional[str] = None,
        result: Optional[str] = None,
        policy_id: Optional[str] = None,
        page_size: int = 100,
    ) -> AsyncPaginatedList:
        """Iterate through all compliance decisions."""
        params = {}
        if type is not None:
            params["type"] = type
        if result is not None:
            params["result"] = result
        if policy_id is not None:
            params["policyId"] = policy_id

        async def fetch(limit: int, offset: int) -> Dict[str, Any]:
            return await self._http.get(
                "/v1/decisions",
                params={**params, "limit": limit, "offset": offset},
            )

        return AsyncPaginatedList(fetch, page_size=page_size)

    async def check(
        self,
        type: str,
        inputs: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Pre-check compliance without recording a decision."""
        return await self._http.post(
            "/v1/compliance/check",
            json={"type": type, "inputs": inputs},
        )
