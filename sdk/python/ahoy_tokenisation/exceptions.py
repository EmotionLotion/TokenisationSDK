"""
AHOY Tokenisation SDK Exceptions

All exceptions inherit from AhoyError for easy catching.
"""

from typing import Any, Dict, List, Optional


class AhoyError(Exception):
    """Base exception for all AHOY SDK errors."""

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

    def __str__(self) -> str:
        if self.code:
            return f"[{self.code}] {self.message}"
        return self.message

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(message={self.message!r}, code={self.code!r})"


class AuthenticationError(AhoyError):
    """Raised when authentication fails (401)."""

    def __init__(self, message: str = "Invalid or missing API key"):
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=401,
        )


class ValidationError(AhoyError):
    """Raised when request validation fails (400)."""

    def __init__(
        self,
        message: str,
        errors: Optional[List[Dict[str, str]]] = None,
    ):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=400,
            details={"errors": errors or []},
        )
        self.errors = errors or []


class NotFoundError(AhoyError):
    """Raised when a resource is not found (404)."""

    def __init__(self, resource: str, resource_id: str):
        super().__init__(
            message=f"{resource} with id '{resource_id}' not found",
            code="NOT_FOUND",
            status_code=404,
            details={"resource": resource, "resource_id": resource_id},
        )
        self.resource = resource
        self.resource_id = resource_id


class RateLimitError(AhoyError):
    """Raised when rate limit is exceeded (429)."""

    def __init__(self, retry_after: Optional[int] = None):
        super().__init__(
            message="Rate limit exceeded",
            code="RATE_LIMIT_EXCEEDED",
            status_code=429,
            details={"retry_after": retry_after},
        )
        self.retry_after = retry_after


class ComplianceError(AhoyError):
    """Raised when a compliance check fails."""

    def __init__(
        self,
        message: str,
        reasons: Optional[List[str]] = None,
        decision_id: Optional[str] = None,
    ):
        super().__init__(
            message=message,
            code="COMPLIANCE_ERROR",
            status_code=403,
            details={"reasons": reasons or [], "decision_id": decision_id},
        )
        self.reasons = reasons or []
        self.decision_id = decision_id


class ConflictError(AhoyError):
    """Raised when there's a conflict (409), e.g., idempotency key reuse."""

    def __init__(self, message: str, existing_id: Optional[str] = None):
        super().__init__(
            message=message,
            code="CONFLICT",
            status_code=409,
            details={"existing_id": existing_id},
        )
        self.existing_id = existing_id


class ServerError(AhoyError):
    """Raised when the server returns a 5xx error."""

    def __init__(self, message: str = "Internal server error"):
        super().__init__(
            message=message,
            code="SERVER_ERROR",
            status_code=500,
        )


def raise_for_status(status_code: int, response_data: Dict[str, Any]) -> None:
    """Raise appropriate exception based on status code and response."""
    error_message = response_data.get("error", "Unknown error")
    error_code = response_data.get("code")
    details = response_data.get("details", {})

    if status_code == 400:
        raise ValidationError(
            message=error_message,
            errors=details.get("errors"),
        )
    elif status_code == 401:
        raise AuthenticationError(message=error_message)
    elif status_code == 403:
        if "compliance" in error_message.lower() or error_code == "COMPLIANCE_ERROR":
            raise ComplianceError(
                message=error_message,
                reasons=details.get("reasons"),
                decision_id=details.get("decision_id"),
            )
        raise AhoyError(
            message=error_message,
            code="FORBIDDEN",
            status_code=403,
            details=details,
        )
    elif status_code == 404:
        raise NotFoundError(
            resource=details.get("resource", "Resource"),
            resource_id=details.get("resource_id", "unknown"),
        )
    elif status_code == 409:
        raise ConflictError(
            message=error_message,
            existing_id=details.get("existing_id"),
        )
    elif status_code == 429:
        raise RateLimitError(retry_after=details.get("retry_after"))
    elif status_code >= 500:
        raise ServerError(message=error_message)
    else:
        raise AhoyError(
            message=error_message,
            code=error_code,
            status_code=status_code,
            details=details,
        )
