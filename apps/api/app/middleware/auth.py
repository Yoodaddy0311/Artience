"""API key authentication middleware and dependency for the Dokba Studio API.

Provides two authentication mechanisms:

1. ``ApiKeyMiddleware`` -- ASGI middleware that validates the ``X-API-Key``
   header on every HTTP request (excluding health/docs/WebSocket paths).

2. ``get_api_key`` -- FastAPI dependency for route-level API key validation,
   useful when you want explicit per-route control instead of global middleware.

**Dev-friendly behaviour**: When the ``DOKBA_API_KEY`` environment variable is
not set, both mechanisms silently skip authentication so that local development
works without any configuration.

Error response format (matches ``app.middleware.error_handler``)::

    {
      "error": {
        "code": "authentication_error",
        "message": "Invalid or missing API key",
        "details": {},
        "timestamp": "2026-02-25T12:00:00Z"
      }
    }
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import APIKeyHeader
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

_logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────

_API_KEY: Optional[str] = os.getenv("DOKBA_API_KEY")

# Paths that never require authentication.
_EXCLUDED_PATHS: frozenset[str] = frozenset(
    {
        "/api/health",
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
    }
)

# WebSocket path prefixes that are handled by their own auth mechanism.
_WS_PATH_PREFIXES: tuple[str, ...] = ("/ws/", "/api/cli/ws")


def _is_auth_required(path: str) -> bool:
    """Determine whether the given path requires API key validation.

    Returns ``False`` for excluded paths (health, docs) and WebSocket
    endpoints (which use their own token-based auth).
    """
    if path in _EXCLUDED_PATHS:
        return False

    for prefix in _WS_PATH_PREFIXES:
        if path.startswith(prefix):
            return False

    return True


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_401_response() -> JSONResponse:
    """Build a structured 401 JSON response consistent with the error handler."""
    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "code": "authentication_error",
                "message": "Invalid or missing API key",
                "details": {},
                "timestamp": _utc_now_iso(),
            }
        },
    )


# ── ASGI Middleware ───────────────────────────────────────────────────


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Validate ``X-API-Key`` header on every HTTP request.

    When ``DOKBA_API_KEY`` is not set the middleware becomes a transparent
    pass-through (dev mode).  WebSocket upgrade requests are always skipped
    because WebSocket authentication is handled separately at the endpoint
    level.
    """

    async def dispatch(self, request: Request, call_next):
        # Dev mode: no API key configured -- allow everything.
        if not _API_KEY:
            return await call_next(request)

        # Skip WebSocket upgrade requests entirely.
        if request.headers.get("upgrade", "").lower() == "websocket":
            return await call_next(request)

        # Skip excluded paths (health, docs, etc.).
        if not _is_auth_required(request.url.path):
            return await call_next(request)

        # Validate the API key header.
        provided_key = request.headers.get("x-api-key")

        if not provided_key or provided_key != _API_KEY:
            _logger.warning(
                "Rejected request to %s -- invalid or missing API key",
                request.url.path,
            )
            return _build_401_response()

        return await call_next(request)


# ── FastAPI Dependency ────────────────────────────────────────────────

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def get_api_key(
    api_key: Optional[str] = Security(_api_key_header),
) -> Optional[str]:
    """FastAPI dependency that validates the ``X-API-Key`` header.

    Usage::

        @router.get("/protected")
        async def protected_route(key: str = Depends(get_api_key)):
            ...

    When ``DOKBA_API_KEY`` is not set, returns ``None`` (dev mode -- no
    validation).  When set, raises ``HTTPException(401)`` if the header
    is missing or does not match.
    """
    # Dev mode: no key configured -- skip validation.
    if not _API_KEY:
        return None

    if not api_key or api_key != _API_KEY:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "authentication_error",
                    "message": "Invalid or missing API key",
                    "details": {},
                    "timestamp": _utc_now_iso(),
                }
            },
        )

    return api_key
