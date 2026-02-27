"""Tests for the settings router (/api/settings).

Covers:
- GET /api/settings/run — retrieve run settings with defaults
- PUT /api/settings/run — update run settings
- PUT /api/settings/run — validation (boundary values)
- Settings persistence via get_run_settings() helper
"""

import json
import os
from unittest.mock import patch

import pytest


# ── GET /api/settings/run ──────────────────────────────────────────────


class TestGetRunSettings:
    def test_returns_default_settings(self, client):
        """When no settings file exists, defaults should be returned."""
        with patch("app.routers.settings._read_all_settings", return_value={}):
            resp = client.get("/api/settings/run")
        assert resp.status_code == 200
        body = resp.json()
        assert body["maxConcurrentAgents"] == 5
        assert body["logVerbosity"] == "info"
        assert body["runTimeoutSeconds"] == 300

    def test_returns_stored_settings(self, client):
        """When settings file has stored values, they should override defaults."""
        stored = {
            "run": {
                "maxConcurrentAgents": 10,
                "logVerbosity": "debug",
                "runTimeoutSeconds": 600,
            }
        }
        with patch("app.routers.settings._read_all_settings", return_value=stored):
            resp = client.get("/api/settings/run")
        assert resp.status_code == 200
        body = resp.json()
        assert body["maxConcurrentAgents"] == 10
        assert body["logVerbosity"] == "debug"
        assert body["runTimeoutSeconds"] == 600


# ── PUT /api/settings/run ──────────────────────────────────────────────


class TestUpdateRunSettings:
    def test_update_all_fields(self, client):
        """Updating all fields should return the new values."""
        with patch("app.routers.settings._read_all_settings", return_value={}), \
             patch("app.routers.settings._write_all_settings") as mock_write:
            resp = client.put(
                "/api/settings/run",
                json={
                    "maxConcurrentAgents": 8,
                    "logVerbosity": "warn",
                    "runTimeoutSeconds": 120,
                },
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["maxConcurrentAgents"] == 8
        assert body["logVerbosity"] == "warn"
        assert body["runTimeoutSeconds"] == 120
        # Verify write was called
        mock_write.assert_called_once()

    def test_update_partial_uses_defaults(self, client):
        """Sending partial update should use Pydantic defaults for omitted fields."""
        with patch("app.routers.settings._read_all_settings", return_value={}), \
             patch("app.routers.settings._write_all_settings"):
            resp = client.put(
                "/api/settings/run",
                json={"maxConcurrentAgents": 3},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["maxConcurrentAgents"] == 3
        # Omitted fields get Pydantic defaults
        assert body["logVerbosity"] == "info"
        assert body["runTimeoutSeconds"] == 300


# ── Validation tests ───────────────────────────────────────────────────


class TestRunSettingsValidation:
    def test_max_concurrent_below_minimum(self, client):
        """maxConcurrentAgents < 1 should fail validation."""
        resp = client.put(
            "/api/settings/run",
            json={"maxConcurrentAgents": 0},
        )
        assert resp.status_code == 422

    def test_max_concurrent_above_maximum(self, client):
        """maxConcurrentAgents > 25 should fail validation."""
        resp = client.put(
            "/api/settings/run",
            json={"maxConcurrentAgents": 100},
        )
        assert resp.status_code == 422

    def test_timeout_below_minimum(self, client):
        """runTimeoutSeconds < 10 should fail validation."""
        resp = client.put(
            "/api/settings/run",
            json={"runTimeoutSeconds": 5},
        )
        assert resp.status_code == 422

    def test_timeout_above_maximum(self, client):
        """runTimeoutSeconds > 3600 should fail validation."""
        resp = client.put(
            "/api/settings/run",
            json={"runTimeoutSeconds": 7200},
        )
        assert resp.status_code == 422

    def test_invalid_log_verbosity(self, client):
        """logVerbosity must be one of debug/info/warn/error."""
        resp = client.put(
            "/api/settings/run",
            json={"logVerbosity": "verbose"},
        )
        assert resp.status_code == 422

    def test_boundary_values_accepted(self, client):
        """Boundary values should be accepted."""
        with patch("app.routers.settings._read_all_settings", return_value={}), \
             patch("app.routers.settings._write_all_settings"):
            # min boundary
            resp = client.put(
                "/api/settings/run",
                json={
                    "maxConcurrentAgents": 1,
                    "runTimeoutSeconds": 10,
                    "logVerbosity": "debug",
                },
            )
            assert resp.status_code == 200

            # max boundary
            resp = client.put(
                "/api/settings/run",
                json={
                    "maxConcurrentAgents": 25,
                    "runTimeoutSeconds": 3600,
                    "logVerbosity": "error",
                },
            )
            assert resp.status_code == 200


# ── get_run_settings() helper tests ───────────────────────────────────


class TestGetRunSettingsHelper:
    def test_defaults_when_no_file(self):
        from app.routers.settings import get_run_settings

        with patch("app.routers.settings._read_all_settings", return_value={}):
            settings = get_run_settings()
        assert settings["maxConcurrentAgents"] == 5
        assert settings["logVerbosity"] == "info"
        assert settings["runTimeoutSeconds"] == 300

    def test_merges_stored_with_defaults(self):
        from app.routers.settings import get_run_settings

        stored = {"run": {"maxConcurrentAgents": 12}}
        with patch("app.routers.settings._read_all_settings", return_value=stored):
            settings = get_run_settings()
        assert settings["maxConcurrentAgents"] == 12
        assert settings["logVerbosity"] == "info"  # default preserved
