"""Structured exception hierarchy for the Dokba Studio API.

All custom exceptions inherit from ``DokbaError`` and carry a machine-readable
``error_code``, an HTTP ``status_code``, a human-readable ``message``, and an
optional ``details`` dict for context-specific metadata.

Usage::

    from app.exceptions import NotFoundError

    raise NotFoundError(
        message="Project not found",
        error_code="project_not_found",
        details={"project_id": "abc123"},
    )
"""


class DokbaError(Exception):
    """Base exception for all Dokba errors."""

    def __init__(
        self,
        message: str,
        error_code: str,
        status_code: int = 500,
        details: dict | None = None,
    ):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(DokbaError):
    """Resource not found (404)."""

    def __init__(
        self,
        message: str = "Resource not found",
        error_code: str = "not_found",
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=404,
            details=details,
        )


class ValidationError(DokbaError):
    """Request validation failed (422)."""

    def __init__(
        self,
        message: str = "Validation failed",
        error_code: str = "validation_error",
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=422,
            details=details,
        )


class AuthenticationError(DokbaError):
    """Authentication required or failed (401)."""

    def __init__(
        self,
        message: str = "Authentication required",
        error_code: str = "authentication_error",
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=401,
            details=details,
        )


class RateLimitError(DokbaError):
    """Rate limit exceeded (429)."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        error_code: str = "rate_limit_exceeded",
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=429,
            details=details,
        )


class ConflictError(DokbaError):
    """Resource conflict (409)."""

    def __init__(
        self,
        message: str = "Resource conflict",
        error_code: str = "conflict",
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=409,
            details=details,
        )


class ServiceError(DokbaError):
    """Downstream service unavailable (503)."""

    def __init__(
        self,
        message: str = "Service unavailable",
        error_code: str = "service_unavailable",
        details: dict | None = None,
    ):
        super().__init__(
            message=message,
            error_code=error_code,
            status_code=503,
            details=details,
        )
