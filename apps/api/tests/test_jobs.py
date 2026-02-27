"""Tests for the jobs router (/api/jobs).

Covers:
- GET /api/jobs/recipes — list recipes (DB-backed)
- POST /api/jobs/recipes — create recipe
- PUT /api/jobs/recipes/{id} — update recipe
- DELETE /api/jobs/recipes/{id} — delete recipe
- GET /api/jobs/ — list jobs with pagination and status filter
- GET /api/jobs/history — list completed jobs
- POST /api/jobs/stop — stop a job (not-found error case)
- GET /api/jobs/{job_id} — get single job (not-found error case)
- Helper functions: _should_broadcast_log, _serialize_logs
"""

import json
from unittest.mock import patch, AsyncMock

import pytest


# ── Helpers ────────────────────────────────────────────────────────────


def _create_recipe(client, **overrides):
    """Helper to create a recipe via the API."""
    payload = {
        "name": "Test Recipe",
        "command": "echo",
        "args": ["hello"],
        "description": "A test recipe",
        "cwd": "",
    }
    payload.update(overrides)
    return client.post("/api/jobs/recipes", json=payload)


# ── GET /api/jobs/recipes ──────────────────────────────────────────────


class TestListRecipes:
    def test_returns_empty_list_initially(self, client):
        resp = client.get("/api/jobs/recipes")
        assert resp.status_code == 200
        body = resp.json()
        assert "recipes" in body
        assert isinstance(body["recipes"], list)
        assert len(body["recipes"]) == 0

    def test_returns_created_recipes(self, client):
        _create_recipe(client, id="r01", name="Recipe 1")
        _create_recipe(client, id="r02", name="Recipe 2")
        resp = client.get("/api/jobs/recipes")
        assert resp.status_code == 200
        recipes = resp.json()["recipes"]
        assert len(recipes) == 2

    def test_recipe_has_required_fields(self, client):
        _create_recipe(client, id="r01", name="Test")
        resp = client.get("/api/jobs/recipes")
        recipe = resp.json()["recipes"][0]
        assert "id" in recipe
        assert "name" in recipe
        assert "command" in recipe
        assert "description" in recipe
        assert "args" in recipe


# ── POST /api/jobs/recipes ─────────────────────────────────────────────


class TestCreateRecipe:
    def test_create_with_explicit_id(self, client):
        resp = _create_recipe(client, id="my-recipe", name="My Recipe")
        assert resp.status_code == 200
        recipe = resp.json()["recipe"]
        assert recipe["id"] == "my-recipe"
        assert recipe["name"] == "My Recipe"

    def test_create_auto_generates_id(self, client):
        resp = _create_recipe(client, name="Auto ID")
        assert resp.status_code == 200
        recipe = resp.json()["recipe"]
        assert recipe["id"].startswith("r")
        assert len(recipe["id"]) > 1

    def test_create_duplicate_id_returns_422(self, client):
        _create_recipe(client, id="dup", name="First")
        resp = _create_recipe(client, id="dup", name="Second")
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "recipe_duplicate"

    def test_create_preserves_args(self, client):
        resp = _create_recipe(client, id="r-args", args=["-v", "--help"])
        recipe = resp.json()["recipe"]
        assert recipe["args"] == ["-v", "--help"]


# ── PUT /api/jobs/recipes/{id} ─────────────────────────────────────────


class TestUpdateRecipe:
    def test_update_name(self, client):
        _create_recipe(client, id="r-up", name="Old Name")
        resp = client.put("/api/jobs/recipes/r-up", json={"name": "New Name"})
        assert resp.status_code == 200
        assert resp.json()["recipe"]["name"] == "New Name"

    def test_update_nonexistent_returns_404(self, client):
        resp = client.put("/api/jobs/recipes/no-such", json={"name": "X"})
        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "recipe_not_found"

    def test_partial_update_preserves_other_fields(self, client):
        _create_recipe(client, id="r-part", name="Orig", command="node")
        resp = client.put("/api/jobs/recipes/r-part", json={"name": "Updated"})
        recipe = resp.json()["recipe"]
        assert recipe["name"] == "Updated"
        assert recipe["command"] == "node"


# ── DELETE /api/jobs/recipes/{id} ──────────────────────────────────────


class TestDeleteRecipe:
    def test_delete_existing(self, client):
        _create_recipe(client, id="r-del", name="To Delete")
        resp = client.delete("/api/jobs/recipes/r-del")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Verify it's gone
        list_resp = client.get("/api/jobs/recipes")
        assert len(list_resp.json()["recipes"]) == 0

    def test_delete_nonexistent_returns_404(self, client):
        resp = client.delete("/api/jobs/recipes/no-such")
        assert resp.status_code == 404


# ── GET /api/jobs/ ─────────────────────────────────────────────────────


class TestListJobs:
    def test_returns_empty_list_initially(self, client):
        resp = client.get("/api/jobs/")
        assert resp.status_code == 200
        body = resp.json()
        assert body["jobs"] == []
        assert body["total"] == 0

    def test_pagination_params(self, client):
        resp = client.get("/api/jobs/?limit=10&skip=0")
        assert resp.status_code == 200
        body = resp.json()
        assert body["limit"] == 10
        assert body["skip"] == 0

    def test_status_filter(self, client):
        resp = client.get("/api/jobs/?status=RUNNING")
        assert resp.status_code == 200
        assert resp.json()["jobs"] == []


# ── GET /api/jobs/history ──────────────────────────────────────────────


class TestListHistory:
    def test_returns_empty_history_initially(self, client):
        resp = client.get("/api/jobs/history")
        assert resp.status_code == 200
        body = resp.json()
        assert body["jobs"] == []
        assert body["total"] == 0

    def test_history_pagination(self, client):
        resp = client.get("/api/jobs/history?limit=5&skip=0")
        assert resp.status_code == 200
        body = resp.json()
        assert body["limit"] == 5
        assert body["skip"] == 0


# ── POST /api/jobs/stop ────────────────────────────────────────────────


class TestStopJob:
    def test_stop_nonexistent_job_returns_404(self, client):
        resp = client.post("/api/jobs/stop?job_id=nonexistent")
        assert resp.status_code == 404
        body = resp.json()
        assert body["error"]["code"] == "job_not_found"


# ── GET /api/jobs/{job_id} ─────────────────────────────────────────────


class TestGetJob:
    def test_get_nonexistent_job_returns_404(self, client):
        resp = client.get("/api/jobs/nonexistent")
        assert resp.status_code == 404
        body = resp.json()
        assert body["error"]["code"] == "job_not_found"


# ── Helper function tests ─────────────────────────────────────────────


class TestHelperFunctions:
    def test_should_broadcast_log_default_info(self):
        from app.routers.jobs import _should_broadcast_log

        assert _should_broadcast_log("normal output", "stdout", "info")
        assert not _should_broadcast_log("DEBUG: detail", "stdout", "info")
        assert _should_broadcast_log("something failed", "stderr", "info")

    def test_should_broadcast_log_debug_verbosity(self):
        from app.routers.jobs import _should_broadcast_log

        assert _should_broadcast_log("DEBUG: detail", "stdout", "debug")
        assert _should_broadcast_log("normal output", "stdout", "debug")

    def test_should_broadcast_log_error_verbosity(self):
        from app.routers.jobs import _should_broadcast_log

        assert not _should_broadcast_log("normal output", "stdout", "error")
        assert _should_broadcast_log("ERROR: crash", "stdout", "error")
        assert _should_broadcast_log("anything", "stderr", "error")

    def test_serialize_logs_trims(self):
        from app.routers.jobs import _serialize_logs, MAX_LOGS_PER_JOB

        big_list = list(range(MAX_LOGS_PER_JOB + 100))
        result = json.loads(_serialize_logs(big_list))
        assert len(result) == MAX_LOGS_PER_JOB
