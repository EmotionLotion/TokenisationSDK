"""
Webhooks resource for managing webhook endpoints and deliveries.
"""

from typing import Any, Dict, List, Optional

from ahoy_tokenisation.models import WebhookEndpoint, WebhookDelivery
from ahoy_tokenisation.utils.http import HttpClient, AsyncHttpClient
from ahoy_tokenisation.utils.pagination import PaginatedList, AsyncPaginatedList


class WebhooksResource:
    """Manage webhook endpoints and deliveries."""

    def __init__(self, http: HttpClient):
        self._http = http

    def create(
        self,
        url: str,
        events: List[str],
        *,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> WebhookEndpoint:
        """
        Create a webhook endpoint.

        Args:
            url: The webhook URL
            events: List of event types to subscribe to
            description: Endpoint description
            metadata: Custom metadata

        Returns:
            Created WebhookEndpoint (includes secret on creation only)

        Example:
            endpoint = client.webhooks.create(
                url="https://your-app.com/webhooks/ahoy",
                events=["investor.created", "transfer.completed"],
            )
            # Store endpoint.secret securely!
        """
        data = {
            "url": url,
            "events": events,
        }
        if description is not None:
            data["description"] = description
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.post("/v1/webhooks", json=data)
        return WebhookEndpoint(**response)

    def retrieve(self, endpoint_id: str) -> WebhookEndpoint:
        """
        Retrieve a webhook endpoint.

        Args:
            endpoint_id: The endpoint's ID

        Returns:
            WebhookEndpoint object (secret not included)
        """
        response = self._http.get(f"/v1/webhooks/{endpoint_id}")
        return WebhookEndpoint(**response)

    def update(
        self,
        endpoint_id: str,
        *,
        url: Optional[str] = None,
        events: Optional[List[str]] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> WebhookEndpoint:
        """
        Update a webhook endpoint.

        Args:
            endpoint_id: The endpoint's ID
            url: New URL
            events: Updated event list
            description: New description
            status: New status (active, paused)
            metadata: Updated metadata

        Returns:
            Updated WebhookEndpoint
        """
        data = {}
        if url is not None:
            data["url"] = url
        if events is not None:
            data["events"] = events
        if description is not None:
            data["description"] = description
        if status is not None:
            data["status"] = status
        if metadata is not None:
            data["metadata"] = metadata

        response = self._http.patch(f"/v1/webhooks/{endpoint_id}", json=data)
        return WebhookEndpoint(**response)

    def delete(self, endpoint_id: str) -> None:
        """
        Delete a webhook endpoint.

        Args:
            endpoint_id: The endpoint's ID
        """
        self._http.delete(f"/v1/webhooks/{endpoint_id}")

    def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List webhook endpoints.

        Args:
            limit: Maximum number of results
            offset: Number of results to skip
            status: Filter by status

        Returns:
            Paginated response with endpoints
        """
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status

        response = self._http.get("/v1/webhooks", params=params)
        response["data"] = [WebhookEndpoint(**e) for e in response.get("data", [])]
        return response

    def rotate_secret(self, endpoint_id: str) -> WebhookEndpoint:
        """
        Rotate the webhook secret.

        Args:
            endpoint_id: The endpoint's ID

        Returns:
            WebhookEndpoint with new secret
        """
        response = self._http.post(f"/v1/webhooks/{endpoint_id}/rotate-secret")
        return WebhookEndpoint(**response)

    # Delivery Methods
    def list_deliveries(
        self,
        endpoint_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        event_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List webhook deliveries for an endpoint.

        Args:
            endpoint_id: The endpoint's ID
            limit: Maximum number of results
            offset: Number of results to skip
            status: Filter by delivery status
            event_type: Filter by event type

        Returns:
            Paginated response with deliveries
        """
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if event_type is not None:
            params["eventType"] = event_type

        response = self._http.get(f"/v1/webhooks/{endpoint_id}/deliveries", params=params)
        response["data"] = [WebhookDelivery(**d) for d in response.get("data", [])]
        return response

    def retry_delivery(self, endpoint_id: str, delivery_id: str) -> WebhookDelivery:
        """
        Retry a failed delivery.

        Args:
            endpoint_id: The endpoint's ID
            delivery_id: The delivery's ID

        Returns:
            Updated WebhookDelivery
        """
        response = self._http.post(f"/v1/webhooks/{endpoint_id}/deliveries/{delivery_id}/retry")
        return WebhookDelivery(**response)

    # Event Types
    def list_event_types(self) -> List[Dict[str, Any]]:
        """
        List available webhook event types.

        Returns:
            List of event type definitions
        """
        response = self._http.get("/v1/webhooks/event-types")
        return response.get("data", [])


class AsyncWebhooksResource:
    """Async version of WebhooksResource."""

    def __init__(self, http: AsyncHttpClient):
        self._http = http

    async def create(
        self,
        url: str,
        events: List[str],
        *,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> WebhookEndpoint:
        """Create a webhook endpoint."""
        data = {"url": url, "events": events}
        if description is not None:
            data["description"] = description
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.post("/v1/webhooks", json=data)
        return WebhookEndpoint(**response)

    async def retrieve(self, endpoint_id: str) -> WebhookEndpoint:
        """Retrieve a webhook endpoint."""
        response = await self._http.get(f"/v1/webhooks/{endpoint_id}")
        return WebhookEndpoint(**response)

    async def update(
        self,
        endpoint_id: str,
        *,
        url: Optional[str] = None,
        events: Optional[List[str]] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> WebhookEndpoint:
        """Update a webhook endpoint."""
        data = {}
        if url is not None:
            data["url"] = url
        if events is not None:
            data["events"] = events
        if description is not None:
            data["description"] = description
        if status is not None:
            data["status"] = status
        if metadata is not None:
            data["metadata"] = metadata

        response = await self._http.patch(f"/v1/webhooks/{endpoint_id}", json=data)
        return WebhookEndpoint(**response)

    async def delete(self, endpoint_id: str) -> None:
        """Delete a webhook endpoint."""
        await self._http.delete(f"/v1/webhooks/{endpoint_id}")

    async def list(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List webhook endpoints."""
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status

        response = await self._http.get("/v1/webhooks", params=params)
        response["data"] = [WebhookEndpoint(**e) for e in response.get("data", [])]
        return response

    async def rotate_secret(self, endpoint_id: str) -> WebhookEndpoint:
        """Rotate the webhook secret."""
        response = await self._http.post(f"/v1/webhooks/{endpoint_id}/rotate-secret")
        return WebhookEndpoint(**response)

    async def list_deliveries(
        self,
        endpoint_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        status: Optional[str] = None,
        event_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List webhook deliveries for an endpoint."""
        params = {"limit": limit, "offset": offset}
        if status is not None:
            params["status"] = status
        if event_type is not None:
            params["eventType"] = event_type

        response = await self._http.get(f"/v1/webhooks/{endpoint_id}/deliveries", params=params)
        response["data"] = [WebhookDelivery(**d) for d in response.get("data", [])]
        return response

    async def retry_delivery(self, endpoint_id: str, delivery_id: str) -> WebhookDelivery:
        """Retry a failed delivery."""
        response = await self._http.post(f"/v1/webhooks/{endpoint_id}/deliveries/{delivery_id}/retry")
        return WebhookDelivery(**response)

    async def list_event_types(self) -> List[Dict[str, Any]]:
        """List available webhook event types."""
        response = await self._http.get("/v1/webhooks/event-types")
        return response.get("data", [])
