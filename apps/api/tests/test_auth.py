"""Tests for API key authentication middleware and WebSocket token auth.

Covers:
- SEC-1: ApiKeyMiddleware and get_api_key dependency
- SEC-2: WebSocket /ws/town token validation
"""

import os
import uuid
from unittest.mock import patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.middleware.auth import ApiKeyMiddleware, get_api_key


def _make_fixture_value() -> str:
    """Generate a random fixture value for auth testing."""
    return uuid.uuid4().hex


# ── Test fixtures ─────────────────────────────────────────────────────


def _create_test_app(configured_value: str | None = None) -> FastAPI:
    """Create a minimal FastAPI app with the auth middleware wired in."""
    app = FastAPI()

    with patch("app.middleware.auth._API_KEY", configured_value):
        app.add_middleware(ApiKeyMiddleware)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/health")
    def health_alt():
        return {"status": "ok"}

    @app.get("/docs")
    def docs():
        return {"docs": True}

    @app.get("/openapi.json")
    def openapi():
        return {"openapi": "3.0.0"}

    @app.get("/redoc")
    def redoc():
        return {"redoc": True}

    @app.get("/api/protected")
    def protected():
        return {"data": "visible"}

    @app.get("/api/with-dep")
    async def with_dep(key=Depends(get_api_key)):
        return {"key": key}

    return app


# ── SEC-1: API Key Middleware Tests ───────────────────────────────────


class TestApiKeyMiddlewareDevMode:
    """When DOKBA_API_KEY is not set, all requests pass through."""

    def setup_method(self):
        self.app = _create_test_app(configured_value=None)
        self.client = TestClient(self.app)

    def test_health_accessible(self):
        resp = self.client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    @patch("app.middleware.auth._API_KEY", None)
    def test_protected_accessible_without_header(self):
        resp = self.client.get("/api/protected")
        assert resp.status_code == 200
        assert resp.json()["data"] == "visible"

    @patch("app.middleware.auth._API_KEY", None)
    def test_protected_accessible_with_arbitrary_header(self):
        resp = self.client.get(
            "/api/protected", headers={"X-API-Key": "anything"}
        )
        assert resp.status_code == 200


class TestApiKeyMiddlewareEnabled:
    """When DOKBA_API_KEY is set, requests must provide the correct value."""

    def setup_method(self):
        self.expected = _make_fixture_value()
        self.app = _create_test_app(configured_value=self.expected)
        self.client = TestClient(self.app)

    def test_health_bypasses_auth(self):
        resp = self.client.get("/api/health")
        assert resp.status_code == 200

    def test_health_alt_bypasses_auth(self):
        resp = self.client.get("/health")
        assert resp.status_code == 200

    def test_docs_bypasses_auth(self):
        resp = self.client.get("/docs")
        assert resp.status_code == 200

    def test_openapi_bypasses_auth(self):
        resp = self.client.get("/openapi.json")
        assert resp.status_code == 200

    def test_redoc_bypasses_auth(self):
        resp = self.client.get("/redoc")
        assert resp.status_code == 200

    def test_protected_rejects_missing_header(self):
        with patch("app.middleware.auth._API_KEY", self.expected):
            resp = self.client.get("/api/protected")
        assert resp.status_code == 401
        body = resp.json()
        assert body["error"]["code"] == "authentication_error"
        assert "timestamp" in body["error"]

    def test_protected_rejects_wrong_value(self):
        with patch("app.middleware.auth._API_KEY", self.expected):
            resp = self.client.get(
                "/api/protected", headers={"X-API-Key": "wrong"}
            )
        assert resp.status_code == 401

    def test_protected_accepts_correct_value(self):
        with patch("app.middleware.auth._API_KEY", self.expected):
            resp = self.client.get(
                "/api/protected",
                headers={"X-API-Key": self.expected},
            )
        assert resp.status_code == 200
        assert resp.json()["data"] == "visible"


# ── SEC-1: get_api_key Dependency Tests ───────────────────────────────


class TestGetApiKeyDependency:
    """Tests for the reusable get_api_key FastAPI dependency."""

    def test_dev_mode_returns_none(self):
        app = _create_test_app(configured_value=None)
        client = TestClient(app)
        with patch("app.middleware.auth._API_KEY", None):
            resp = client.get("/api/with-dep")
            assert resp.status_code == 200
            assert resp.json()["key"] is None

    def test_valid_value_returns_it(self):
        val = _make_fixture_value()
        app = _create_test_app(configured_value=val)
        client = TestClient(app)
        with patch("app.middleware.auth._API_KEY", val):
            resp = client.get(
                "/api/with-dep", headers={"X-API-Key": val}
            )
            assert resp.status_code == 200
            assert resp.json()["key"] == val

    def test_missing_header_returns_401(self):
        val = _make_fixture_value()
        app = _create_test_app(configured_value=val)
        client = TestClient(app)
        with patch("app.middleware.auth._API_KEY", val):
            resp = client.get("/api/with-dep")
            assert resp.status_code == 401


# ── SEC-1: Path exclusion logic ───────────────────────────────────────


class TestPathExclusion:
    """Test _is_auth_required path matching."""

    def test_excluded_paths(self):
        from app.middleware.auth import _is_auth_required

        assert not _is_auth_required("/api/health")
        assert not _is_auth_required("/health")
        assert not _is_auth_required("/docs")
        assert not _is_auth_required("/openapi.json")
        assert not _is_auth_required("/redoc")

    def test_ws_paths_excluded(self):
        from app.middleware.auth import _is_auth_required

        assert not _is_auth_required("/ws/town")
        assert not _is_auth_required("/ws/anything")
        assert not _is_auth_required("/api/cli/ws")

    def test_regular_paths_require_auth(self):
        from app.middleware.auth import _is_auth_required

        assert _is_auth_required("/api/studio/generate")
        assert _is_auth_required("/api/projects")
        assert _is_auth_required("/api/settings")


# ── SEC-2: WebSocket Token Auth Tests ─────────────────────────────────


class TestWebSocketAuth:
    """Test WebSocket token-based authentication on /ws/town."""

    def _create_ws_app(self) -> FastAPI:
        """Create a test app with the actual ws router."""
        from app.routers.ws import router

        app = FastAPI()
        app.include_router(router)
        return app

    def test_ws_connects_without_param_in_dev_mode(self):
        """When DOKBA_WS_TOKEN is not set, WS connects freely."""
        app = self._create_ws_app()
        client = TestClient(app)
        with patch("app.routers.ws._WS_TOKEN", None):
            with client.websocket_connect("/ws/town") as ws:
                ws.send_text('{"type": "ping"}')

    def test_ws_connects_with_valid_param(self):
        """When DOKBA_WS_TOKEN is set, matching param allows connection."""
        val = _make_fixture_value()
        app = self._create_ws_app()
        client = TestClient(app)
        with patch("app.routers.ws._WS_TOKEN", val):
            with client.websocket_connect(
                f"/ws/town?token={val}"
            ) as ws:
                ws.send_text('{"type": "ping"}')

    def test_ws_rejects_missing_param(self):
        """When DOKBA_WS_TOKEN is set, missing param closes with 4001."""
        val = _make_fixture_value()
        app = self._create_ws_app()
        client = TestClient(app)
        with patch("app.routers.ws._WS_TOKEN", val):
            with pytest.raises(Exception):
                with client.websocket_connect("/ws/town") as ws:
                    ws.send_text('{"type": "ping"}')

    def test_ws_rejects_wrong_param(self):
        """When DOKBA_WS_TOKEN is set, wrong param closes with 4001."""
        val = _make_fixture_value()
        app = self._create_ws_app()
        client = TestClient(app)
        with patch("app.routers.ws._WS_TOKEN", val):
            with pytest.raises(Exception):
                with client.websocket_connect(
                    "/ws/town?token=wrong"
                ) as ws:
                    ws.send_text('{"type": "ping"}')


# ── SEC-1: Error response structure ──────────────────────────────────


class TestErrorResponseFormat:
    """Verify the 401 response matches the project error format convention."""

    def test_401_response_structure(self):
        val = _make_fixture_value()
        with patch("app.middleware.auth._API_KEY", val):
            app = _create_test_app(configured_value=val)
            client = TestClient(app)
            resp = client.get("/api/protected")
        assert resp.status_code == 401
        body = resp.json()

        # Must match the error_handler.py format
        assert "error" in body
        error = body["error"]
        assert error["code"] == "authentication_error"
        assert error["message"] == "Invalid or missing API key"
        assert "details" in error
        assert "timestamp" in error
