"""
Rate limiting middleware for the Dokba Studio API.

Algorithm: Sliding Window Counter
----------------------------------
Each client IP maintains a dict of request timestamps bucketed into
fixed-size windows. When a request arrives, the algorithm:

1. Determines the current window and the previous window.
2. Counts requests in the current (partial) window.
3. Weights the previous window's count by the fraction of overlap with
   the sliding interval.
4. Computes: effective_count = prev_count * overlap_weight + current_count
5. If effective_count >= limit, the request is rejected with 429.

This approach is more accurate than a simple fixed-window counter (avoids
the burst-at-boundary problem) while using O(1) storage per IP per route
tier -- only two counters and two timestamps per bucket.

Tiers
-----
- General API:  configurable via DOKBA_RATE_LIMIT_GENERAL  (default 60 req/min)
- Studio generate: configurable via DOKBA_RATE_LIMIT_GENERATE (default 10 req/min)
- WebSocket:    5 connections/min (hardcoded; WS connections are rare)

Cleanup
-------
A background asyncio task runs every 60 seconds and evicts entries whose
last activity is older than 120 seconds, preventing unbounded memory growth.

Thread Safety
-------------
All shared state is guarded by an asyncio.Lock per operation to prevent
concurrent coroutine races within the same event loop.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
from typing import Dict, Tuple

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------

_GENERAL_LIMIT: int = int(os.environ.get("DOKBA_RATE_LIMIT_GENERAL", "60"))
_GENERATE_LIMIT: int = int(os.environ.get("DOKBA_RATE_LIMIT_GENERATE", "10"))
_WS_LIMIT: int = int(os.environ.get("DOKBA_RATE_LIMIT_WS", "5"))

# All windows are 60-second intervals.
_WINDOW_SIZE: float = 60.0

# Entries older than this (seconds) are eligible for cleanup.
_EXPIRY_SECONDS: float = 120.0

# How often the cleanup task runs (seconds).
_CLEANUP_INTERVAL: float = 60.0


# ---------------------------------------------------------------------------
# Sliding window bucket
# ---------------------------------------------------------------------------

class _SlidingWindowBucket:
    """Tracks request counts across two adjacent fixed windows to approximate
    a true sliding window.

    Attributes:
        prev_count:    Number of requests in the previous full window.
        prev_window:   Start timestamp of the previous window.
        curr_count:    Number of requests in the current window.
        curr_window:   Start timestamp of the current window.
        last_activity: Timestamp of the most recent request (for cleanup).
    """

    __slots__ = ("prev_count", "prev_window", "curr_count", "curr_window", "last_activity")

    def __init__(self) -> None:
        self.prev_count: int = 0
        self.prev_window: float = 0.0
        self.curr_count: int = 0
        self.curr_window: float = 0.0
        self.last_activity: float = 0.0

    def _advance(self, now: float) -> None:
        """Roll windows forward so ``curr_window`` covers *now*."""
        window_start = math.floor(now / _WINDOW_SIZE) * _WINDOW_SIZE

        if window_start != self.curr_window:
            # If we jumped more than one window, the old "current" data is
            # no longer adjacent -- treat previous as zero.
            if window_start - self.curr_window > _WINDOW_SIZE:
                self.prev_count = 0
            else:
                self.prev_count = self.curr_count

            self.prev_window = self.curr_window
            self.curr_count = 0
            self.curr_window = window_start

    def is_allowed(self, limit: int, now: float) -> Tuple[bool, float]:
        """Check whether a new request should be allowed.

        Returns:
            (allowed, retry_after)
            *allowed* is True when the request passes the rate limit.
            *retry_after* is the number of seconds the caller should wait
            before retrying (only meaningful when allowed is False).
        """
        self._advance(now)

        elapsed_in_window = now - self.curr_window
        # Weight of the previous window that still overlaps the sliding interval.
        overlap_weight = max(0.0, (_WINDOW_SIZE - elapsed_in_window) / _WINDOW_SIZE)

        effective_count = self.prev_count * overlap_weight + self.curr_count

        if effective_count >= limit:
            # Estimate when the window will have rolled enough for the count
            # to drop below the limit.  Worst-case, the caller must wait
            # until the current window boundary.
            retry_after = _WINDOW_SIZE - elapsed_in_window
            return False, max(1.0, retry_after)

        # Request allowed -- record it.
        self.curr_count += 1
        self.last_activity = now
        return True, 0.0


# ---------------------------------------------------------------------------
# Route tier classification
# ---------------------------------------------------------------------------

def _classify_path(path: str) -> Tuple[str, int]:
    """Return (tier_name, limit) for a given request path.

    Classification order:
    1. Studio generate endpoint  -> stricter limit
    2. WebSocket paths           -> connection limit
    3. Everything else           -> general limit
    """
    if path == "/api/studio/generate":
        return "generate", _GENERATE_LIMIT
    if path.startswith("/ws"):
        return "ws", _WS_LIMIT
    return "general", _GENERAL_LIMIT


# ---------------------------------------------------------------------------
# Middleware (pure ASGI, no BaseHTTPMiddleware overhead)
# ---------------------------------------------------------------------------

class RateLimitMiddleware:
    """Pure-ASGI rate limiting middleware using a sliding window counter.

    Usage in ``main.py``::

        from app.middleware.rate_limit import RateLimitMiddleware

        app.add_middleware(RateLimitMiddleware)

    The middleware inspects the ``scope["type"]`` to differentiate HTTP
    requests from WebSocket handshakes and applies the appropriate tier.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

        # Keyed by (client_ip, tier_name) -> _SlidingWindowBucket
        self._buckets: Dict[Tuple[str, str], _SlidingWindowBucket] = {}
        self._lock = asyncio.Lock()

        # Lazy-init flag for the cleanup background task.
        self._cleanup_started = False

    # ------------------------------------------------------------------
    # ASGI interface
    # ------------------------------------------------------------------

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        # Ensure the cleanup loop is running.
        if not self._cleanup_started:
            self._cleanup_started = True
            asyncio.ensure_future(self._cleanup_loop())

        path: str = scope.get("path", "/")
        tier, limit = _classify_path(path)

        # Extract client IP.  Starlette stores it in scope["client"] as
        # (host, port).  Fall back to "unknown" when behind a broken proxy.
        client_tuple = scope.get("client")
        client_ip: str = client_tuple[0] if client_tuple else "unknown"

        now = time.monotonic()

        async with self._lock:
            key = (client_ip, tier)
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = _SlidingWindowBucket()
                self._buckets[key] = bucket

            allowed, retry_after = bucket.is_allowed(limit, now)

        if not allowed:
            retry_after_int = int(math.ceil(retry_after))
            _logger.warning(
                "Rate limit exceeded: ip=%s tier=%s retry_after=%ds",
                client_ip,
                tier,
                retry_after_int,
            )

            if scope["type"] == "websocket":
                # For WebSocket, we must accept then close immediately with
                # a policy violation code, because ASGI does not allow us to
                # send an HTTP response on a websocket scope.  However, we
                # can deny the upgrade by simply not accepting.  Starlette's
                # WebSocket class will raise WebSocketDisconnect on the
                # client side.  The simplest correct approach: send an HTTP
                # 429 response on the raw transport.
                response = JSONResponse(
                    content={
                        "error": "rate_limit_exceeded",
                        "message": "Too many requests",
                        "retry_after": retry_after_int,
                    },
                    status_code=429,
                    headers={"Retry-After": str(retry_after_int)},
                )
                # Rewrite scope type to http so JSONResponse can send.
                http_scope = dict(scope, type="http")
                await response(http_scope, receive, send)
                return

            # Standard HTTP 429
            response = JSONResponse(
                content={
                    "error": "rate_limit_exceeded",
                    "message": "Too many requests",
                    "retry_after": retry_after_int,
                },
                status_code=429,
                headers={"Retry-After": str(retry_after_int)},
            )
            await response(scope, receive, send)
            return

        # Request is within limits -- forward to the application.
        await self.app(scope, receive, send)

    # ------------------------------------------------------------------
    # Background cleanup
    # ------------------------------------------------------------------

    async def _cleanup_loop(self) -> None:
        """Periodically evict stale bucket entries.

        Runs forever in the background.  Entries whose ``last_activity``
        is older than ``_EXPIRY_SECONDS`` are removed to prevent the
        ``_buckets`` dict from growing without bound.
        """
        while True:
            await asyncio.sleep(_CLEANUP_INTERVAL)
            cutoff = time.monotonic() - _EXPIRY_SECONDS
            removed = 0
            async with self._lock:
                stale_keys = [
                    key for key, bucket in self._buckets.items()
                    if bucket.last_activity < cutoff and bucket.last_activity != 0.0
                ]
                for key in stale_keys:
                    del self._buckets[key]
                    removed += 1

            if removed > 0:
                _logger.debug(
                    "Rate limiter cleanup: removed %d stale entries, %d remaining",
                    removed,
                    len(self._buckets),
                )
