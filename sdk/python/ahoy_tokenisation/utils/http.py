"""
HTTP Client with retry logic and error handling.
"""

import time
import uuid
from typing import Any, Dict, Optional, Type, TypeVar

import httpx

from ahoy_tokenisation.exceptions import raise_for_status, RateLimitError, ServerError

T = TypeVar("T")

DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 3
RETRY_BACKOFF = 1.0


class HttpClient:
    """Synchronous HTTP client for AHOY API."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers=self._default_headers(),
        )

    def _default_headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "ahoy-tokenisation-python/1.0.0",
        }

    def request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Make an HTTP request with retry logic."""
        headers = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        elif method.upper() == "POST":
            # Auto-generate idempotency key for POST requests
            headers["Idempotency-Key"] = str(uuid.uuid4())

        last_exception: Optional[Exception] = None

        for attempt in range(self.max_retries):
            try:
                response = self._client.request(
                    method=method,
                    url=path,
                    params=params,
                    json=json,
                    headers=headers,
                )

                # Handle successful responses
                if response.status_code < 400:
                    if response.status_code == 204:
                        return {}
                    return response.json()

                # Handle error responses
                try:
                    error_data = response.json()
                except Exception:
                    error_data = {"error": response.text}

                raise_for_status(response.status_code, error_data)

            except RateLimitError as e:
                # Respect retry-after header
                retry_after = e.retry_after or (RETRY_BACKOFF * (2 ** attempt))
                if attempt < self.max_retries - 1:
                    time.sleep(retry_after)
                    last_exception = e
                    continue
                raise

            except ServerError as e:
                # Retry on server errors
                if attempt < self.max_retries - 1:
                    time.sleep(RETRY_BACKOFF * (2 ** attempt))
                    last_exception = e
                    continue
                raise

            except httpx.TimeoutException:
                if attempt < self.max_retries - 1:
                    time.sleep(RETRY_BACKOFF * (2 ** attempt))
                    continue
                raise

            except httpx.RequestError as e:
                if attempt < self.max_retries - 1:
                    time.sleep(RETRY_BACKOFF * (2 ** attempt))
                    last_exception = e
                    continue
                raise

        if last_exception:
            raise last_exception
        raise Exception("Request failed after retries")

    def get(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self.request("GET", path, params=params)

    def post(
        self,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        return self.request("POST", path, json=json, idempotency_key=idempotency_key)

    def patch(
        self,
        path: str,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return self.request("PATCH", path, json=json)

    def delete(
        self,
        path: str,
    ) -> Dict[str, Any]:
        return self.request("DELETE", path)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "HttpClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


class AsyncHttpClient:
    """Asynchronous HTTP client for AHOY API."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=timeout,
            headers=self._default_headers(),
        )

    def _default_headers(self) -> Dict[str, str]:
        return {
            "X-API-Key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "ahoy-tokenisation-python/1.0.0",
        }

    async def request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Make an async HTTP request with retry logic."""
        import asyncio

        headers = {}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        elif method.upper() == "POST":
            headers["Idempotency-Key"] = str(uuid.uuid4())

        last_exception: Optional[Exception] = None

        for attempt in range(self.max_retries):
            try:
                response = await self._client.request(
                    method=method,
                    url=path,
                    params=params,
                    json=json,
                    headers=headers,
                )

                if response.status_code < 400:
                    if response.status_code == 204:
                        return {}
                    return response.json()

                try:
                    error_data = response.json()
                except Exception:
                    error_data = {"error": response.text}

                raise_for_status(response.status_code, error_data)

            except RateLimitError as e:
                retry_after = e.retry_after or (RETRY_BACKOFF * (2 ** attempt))
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(retry_after)
                    last_exception = e
                    continue
                raise

            except ServerError as e:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(RETRY_BACKOFF * (2 ** attempt))
                    last_exception = e
                    continue
                raise

            except httpx.TimeoutException:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(RETRY_BACKOFF * (2 ** attempt))
                    continue
                raise

            except httpx.RequestError as e:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(RETRY_BACKOFF * (2 ** attempt))
                    last_exception = e
                    continue
                raise

        if last_exception:
            raise last_exception
        raise Exception("Request failed after retries")

    async def get(
        self,
        path: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self.request("GET", path, params=params)

    async def post(
        self,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self.request("POST", path, json=json, idempotency_key=idempotency_key)

    async def patch(
        self,
        path: str,
        json: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await self.request("PATCH", path, json=json)

    async def delete(
        self,
        path: str,
    ) -> Dict[str, Any]:
        return await self.request("DELETE", path)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "AsyncHttpClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
