"""
Pagination utilities for list endpoints.
"""

from typing import Any, AsyncIterator, Callable, Dict, Iterator, List, Optional, TypeVar

T = TypeVar("T")


class PaginatedList:
    """
    Iterator for paginated list endpoints.

    Automatically fetches next pages as you iterate.

    Example:
        for investor in client.investors.list_all():
            print(investor.email)
    """

    def __init__(
        self,
        fetch_fn: Callable[[int, int], Dict[str, Any]],
        item_key: str = "data",
        page_size: int = 100,
    ):
        self._fetch_fn = fetch_fn
        self._item_key = item_key
        self._page_size = page_size
        self._offset = 0
        self._buffer: List[Dict[str, Any]] = []
        self._exhausted = False

    def __iter__(self) -> Iterator[Dict[str, Any]]:
        return self

    def __next__(self) -> Dict[str, Any]:
        # If buffer is empty, fetch next page
        if not self._buffer and not self._exhausted:
            self._fetch_next_page()

        if not self._buffer:
            raise StopIteration

        return self._buffer.pop(0)

    def _fetch_next_page(self) -> None:
        response = self._fetch_fn(self._page_size, self._offset)
        items = response.get(self._item_key, [])

        if not items:
            self._exhausted = True
            return

        self._buffer.extend(items)
        self._offset += len(items)

        # If we got fewer items than page size, we're done
        if len(items) < self._page_size:
            self._exhausted = True


class AsyncPaginatedList:
    """
    Async iterator for paginated list endpoints.

    Example:
        async for investor in client.investors.list_all_async():
            print(investor.email)
    """

    def __init__(
        self,
        fetch_fn: Callable[[int, int], Any],  # Returns coroutine
        item_key: str = "data",
        page_size: int = 100,
    ):
        self._fetch_fn = fetch_fn
        self._item_key = item_key
        self._page_size = page_size
        self._offset = 0
        self._buffer: List[Dict[str, Any]] = []
        self._exhausted = False

    def __aiter__(self) -> AsyncIterator[Dict[str, Any]]:
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if not self._buffer and not self._exhausted:
            await self._fetch_next_page()

        if not self._buffer:
            raise StopAsyncIteration

        return self._buffer.pop(0)

    async def _fetch_next_page(self) -> None:
        response = await self._fetch_fn(self._page_size, self._offset)
        items = response.get(self._item_key, [])

        if not items:
            self._exhausted = True
            return

        self._buffer.extend(items)
        self._offset += len(items)

        if len(items) < self._page_size:
            self._exhausted = True
