"""Global exception handlers for the Dokba Studio API.

Provides three exception handlers that can be registered on the FastAPI app
via ``app.add_exception_handler()``:

- ``dokba_error_handler``  -- handles all ``DokbaError`` subclasses
- ``validation_error_handler`` -- handles Pydantic ``RequestValidationError``
- ``generic_error_handler`` -- catches any unhandled ``Exception``

Response format (consistent across all error types)::

    {
      "error": {
        "code": "not_found",
        "message": "Project not found",
        "details": {"project_id": "abc123"},
        "timestamp": "2026-02-25T12:00:00Z"
      }
    }
"""

import logging
import os
import traceback
from datetime import datetime, timezone

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.exceptions import DokbaError

_logger = logging.getLogger(__name__)

_IS_PRODUCTION = os.getenv("DOKBA_ENV", "").lower() == "production"


def _utc_now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _build_error_response(
    code: str,
    message: str,
    status_code: int,
    details: dict | None = None,
) -> JSONResponse:
    """Build a standardised JSON error response."""
    body: dict = {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "timestamp": _utc_now_iso(),
        }
    }
    return JSONResponse(status_code=status_code, content=body)


# ── Handler: DokbaError hierarchy ────────────────────────────────────


async def dokba_error_handler(request: Request, exc: DokbaError) -> JSONResponse:
    """Handle all custom ``DokbaError`` subclasses.

    Maps the exception attributes directly to the structured response.
    Server errors (5xx) are logged with full traceback.
    """
    if exc.status_code >= 500:
        _logger.error(
            "DokbaError [%s] %s – %s",
            exc.error_code,
            exc.message,
            exc.details,
            exc_info=True,
        )

    return _build_error_response(
        code=exc.error_code,
        message=exc.message,
        status_code=exc.status_code,
        details=exc.details,
    )


# ── Handler: Pydantic RequestValidationError ─────────────────────────


async def validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Handle Pydantic/FastAPI request validation errors.

    Converts the list of validation errors into a structured 422 response
    with per-field detail.
    """
    field_errors: list[dict] = []
    for err in exc.errors():
        field_errors.append(
            {
                "field": " -> ".join(str(loc) for loc in err.get("loc", [])),
                "message": err.get("msg", ""),
                "type": err.get("type", ""),
            }
        )

    return _build_error_response(
        code="validation_error",
        message="Request validation failed",
        status_code=422,
        details={"errors": field_errors},
    )


# ── Handler: Generic unhandled Exception ─────────────────────────────


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler for unexpected exceptions.

    In non-production environments the traceback is included in the
    response ``details`` to aid debugging.  In production the traceback
    is suppressed from the response but always logged.
    """
    _logger.error(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
        exc_info=True,
    )

    details: dict = {}
    if not _IS_PRODUCTION:
        details["traceback"] = traceback.format_exception(type(exc), exc, exc.__traceback__)
        details["exception_type"] = type(exc).__name__

    return _build_error_response(
        code="internal_server_error",
        message="An unexpected error occurred",
        status_code=500,
        details=details,
    )
