"""
AHOY Tokenisation Python SDK

Tokenize real-world assets with built-in compliance.

Usage:
    from ahoy_tokenisation import AhoyClient

    client = AhoyClient(api_key="sk_test_...")
    investor = client.investors.create(
        email="investor@example.com",
        type="individual",
        country_code="AE"
    )
"""

from ahoy_tokenisation.client import AhoyClient, AsyncAhoyClient
from ahoy_tokenisation.exceptions import (
    AhoyError,
    AuthenticationError,
    ValidationError,
    NotFoundError,
    RateLimitError,
    ComplianceError,
    ConflictError,
)
from ahoy_tokenisation.utils.webhook import verify_webhook_signature, construct_webhook_event

__version__ = "1.0.0"
__all__ = [
    # Clients
    "AhoyClient",
    "AsyncAhoyClient",
    # Exceptions
    "AhoyError",
    "AuthenticationError",
    "ValidationError",
    "NotFoundError",
    "RateLimitError",
    "ComplianceError",
    "ConflictError",
    # Utilities
    "verify_webhook_signature",
    "construct_webhook_event",
]
