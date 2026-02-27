"""Tests for the Project API endpoints (Batch 2).

Covers:
- GET /api/studio/project — read project.json
- PUT /api/studio/project — write project.json
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest


# ── GET /api/studio/project ──────────────────────────

class TestGetProjectConfig:
    def test_returns_project_when_file_exists(self, client, tmp_path):
        from app.routers import studio

        fake_project = tmp_path / "project.json"
        project_data = {
            "version": "1.0.0",
            "meta": {"id": "test-project", "name": "Test"},
            "agents": [],
            "recipes": [],
        }
        fake_project.write_text(json.dumps(project_data), encoding="utf-8")

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            resp = client.get("/api/studio/project")

        assert resp.status_code == 200
        data = resp.json()
        assert data["project"] is not None
        assert data["project"]["version"] == "1.0.0"
        assert data["project"]["meta"]["name"] == "Test"

    def test_returns_null_when_file_missing(self, client, tmp_path):
        from app.routers import studio

        fake_path = tmp_path / "nonexistent" / "project.json"

        with patch.object(studio, "PROJECT_JSON_PATH", fake_path):
            resp = client.get("/api/studio/project")

        assert resp.status_code == 200
        data = resp.json()
        assert data["project"] is None
        assert "message" in data

    def test_returns_null_on_invalid_json(self, client, tmp_path):
        from app.routers import studio

        fake_project = tmp_path / "project.json"
        fake_project.write_text("{ invalid json !!!", encoding="utf-8")

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            resp = client.get("/api/studio/project")

        assert resp.status_code == 200
        data = resp.json()
        assert data["project"] is None
        assert "message" in data

    def test_returns_complex_project_data(self, client, tmp_path):
        from app.routers import studio

        fake_project = tmp_path / "project.json"
        project_data = {
            "version": "2.0.0",
            "meta": {"id": "p1", "name": "Complex"},
            "theme": {"palette": {"primary": "#FFD100"}},
            "agents": [
                {"id": "a01", "name": "Sera", "role": "Developer"},
                {"id": "a02", "name": "Luna", "role": "Designer"},
            ],
            "recipes": [{"id": "r01", "name": "Build", "command": "npm run build"}],
        }
        fake_project.write_text(json.dumps(project_data), encoding="utf-8")

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            resp = client.get("/api/studio/project")

        data = resp.json()
        assert len(data["project"]["agents"]) == 2
        assert data["project"]["agents"][0]["name"] == "Sera"


# ── PUT /api/studio/project ──────────────────────────

class TestSaveProjectConfig:
    def test_save_valid_project(self, client, tmp_path):
        from app.routers import studio

        fake_project = tmp_path / "project.json"

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            resp = client.put(
                "/api/studio/project",
                json={"version": "1.0.0", "meta": {"name": "Saved"}},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

        # Verify the file was actually written
        saved = json.loads(fake_project.read_text(encoding="utf-8"))
        assert saved["version"] == "1.0.0"
        assert saved["meta"]["name"] == "Saved"

    def test_save_preserves_unicode(self, client, tmp_path):
        from app.routers import studio

        fake_project = tmp_path / "project.json"

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            resp = client.put(
                "/api/studio/project",
                json={"meta": {"name": "한국어 프로젝트"}, "description": "日本語テスト"},
            )

        assert resp.status_code == 200
        saved = json.loads(fake_project.read_text(encoding="utf-8"))
        assert saved["meta"]["name"] == "한국어 프로젝트"
        assert saved["description"] == "日本語テスト"

    def test_save_creates_parent_directory(self, client, tmp_path):
        from app.routers import studio

        fake_project = tmp_path / "nested" / "dir" / "project.json"

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            resp = client.put(
                "/api/studio/project",
                json={"version": "1.0.0"},
            )

        assert resp.status_code == 200
        assert fake_project.exists()

    def test_roundtrip_save_then_load(self, client, tmp_path):
        """Save a project and then load it back, verifying data integrity."""
        from app.routers import studio

        fake_project = tmp_path / "project.json"
        project_data = {
            "version": "3.0.0",
            "meta": {"id": "roundtrip", "name": "Roundtrip Test"},
            "agents": [{"id": "a01", "name": "Agent1"}],
        }

        with patch.object(studio, "PROJECT_JSON_PATH", fake_project):
            save_resp = client.put("/api/studio/project", json=project_data)
            assert save_resp.status_code == 200

            load_resp = client.get("/api/studio/project")
            assert load_resp.status_code == 200

        loaded = load_resp.json()["project"]
        assert loaded["version"] == "3.0.0"
        assert loaded["meta"]["id"] == "roundtrip"
        assert len(loaded["agents"]) == 1
