"""
Webhook signature verification utilities.
"""

import hashlib
import hmac
from typing import Union


def verify_webhook_signature(
    payload: Union[str, bytes],
    signature: str,
    secret: str,
) -> bool:
    """
    Verify a webhook signature.

    Args:
        payload: The raw request body (string or bytes)
        signature: The signature from X-Ahoy-Signature header
        secret: Your webhook endpoint secret

    Returns:
        True if signature is valid, False otherwise

    Example:
        is_valid = verify_webhook_signature(
            payload=request.body,
            signature=request.headers["X-Ahoy-Signature"],
            secret="whsec_..."
        )
    """
    if isinstance(payload, str):
        payload = payload.encode("utf-8")

    expected = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    expected_signature = f"sha256={expected}"

    # Use constant-time comparison to prevent timing attacks
    return hmac.compare_digest(signature, expected_signature)


def construct_webhook_event(
    payload: Union[str, bytes],
    signature: str,
    secret: str,
) -> dict:
    """
    Verify signature and construct webhook event.

    Args:
        payload: The raw request body
        signature: The signature from X-Ahoy-Signature header
        secret: Your webhook endpoint secret

    Returns:
        Parsed webhook event data

    Raises:
        ValueError: If signature verification fails
    """
    import json

    if not verify_webhook_signature(payload, signature, secret):
        raise ValueError("Invalid webhook signature")

    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")

    return json.loads(payload)
