"""Tests for the Artifacts endpoints (Batch 2).

Covers:
- GET /api/jobs/artifacts — list artifacts across completed jobs
- GET /api/jobs/{job_id}/artifacts — list artifacts for a specific job
- GET /api/jobs/artifacts/{job_id}/{filename} — download artifact file
"""

import json
from datetime import datetime, timezone

import pytest
from app.models.job import Job


# ── Helpers ────────────────────────────────────────────

def _make_job(db, job_id, status="SUCCESS", artifacts=None, recipe_name="test"):
    """Insert a Job row with the given status and artifacts JSON."""
    job = Job(
        id=job_id,
        recipe_id="r01",
        recipe_name=recipe_name,
        assigned_agent_id="a01",
        status=status,
        command="echo",
        logs="[]",
        artifacts=json.dumps(artifacts or []),
        completed_at=datetime.now(timezone.utc) if status != "RUNNING" else None,
    )
    db.add(job)
    db.commit()
    return job


# ── GET /api/jobs/artifacts ───────────────────────────

class TestListAllArtifacts:
    def test_empty_when_no_jobs(self, client):
        resp = client.get("/api/jobs/artifacts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["artifacts"] == []
        assert data["total"] == 0

    def test_returns_artifacts_from_completed_jobs(self, client, db_session):
        arts = [{"name": "output.log", "path": "/api/jobs/artifacts/j1/output.log", "type": "document", "size": 100}]
        _make_job(db_session, "j1", status="SUCCESS", artifacts=arts)
        _make_job(db_session, "j2", status="RUNNING", artifacts=arts)  # should be excluded

        resp = client.get("/api/jobs/artifacts")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["artifacts"][0]["jobId"] == "j1"

    def test_includes_error_and_stopped_jobs(self, client, db_session):
        art = [{"name": "err.log", "type": "document", "size": 50}]
        _make_job(db_session, "j1", status="ERROR", artifacts=art)
        _make_job(db_session, "j2", status="STOPPED", artifacts=art)
        _make_job(db_session, "j3", status="CANCELED", artifacts=art)

        resp = client.get("/api/jobs/artifacts")
        data = resp.json()
        assert data["total"] == 3

    def test_pagination_skip_limit(self, client, db_session):
        for i in range(5):
            art = [{"name": f"file_{i}.txt", "type": "document", "size": 10}]
            _make_job(db_session, f"j{i}", status="SUCCESS", artifacts=art)

        resp = client.get("/api/jobs/artifacts?skip=2&limit=2")
        data = resp.json()
        assert len(data["artifacts"]) == 2
        assert data["total"] == 5
        assert data["skip"] == 2
        assert data["limit"] == 2

    def test_enriches_artifacts_with_jobId_and_recipeName(self, client, db_session):
        art = [{"name": "result.json", "type": "document", "size": 200}]
        _make_job(db_session, "j1", status="SUCCESS", artifacts=art, recipe_name="My Recipe")

        resp = client.get("/api/jobs/artifacts")
        data = resp.json()
        assert data["artifacts"][0]["jobId"] == "j1"
        assert data["artifacts"][0]["recipeName"] == "My Recipe"

    def test_excludes_running_queued_jobs(self, client, db_session):
        art = [{"name": "a.log", "type": "document", "size": 10}]
        _make_job(db_session, "j1", status="RUNNING", artifacts=art)
        _make_job(db_session, "j2", status="QUEUED", artifacts=art)

        resp = client.get("/api/jobs/artifacts")
        data = resp.json()
        assert data["total"] == 0


# ── GET /api/jobs/{job_id}/artifacts ──────────────────

class TestGetJobArtifacts:
    def test_returns_artifacts_for_existing_job(self, client, db_session):
        art = [
            {"name": "output.log", "type": "document", "size": 100},
            {"name": "screenshot.png", "type": "image", "size": 500},
        ]
        _make_job(db_session, "j1", status="SUCCESS", artifacts=art)

        resp = client.get("/api/jobs/j1/artifacts")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["artifacts"]) == 2
        assert data["jobId"] == "j1"

    def test_returns_empty_artifacts_for_job_with_none(self, client, db_session):
        _make_job(db_session, "j1", status="SUCCESS", artifacts=[])

        resp = client.get("/api/jobs/j1/artifacts")
        data = resp.json()
        assert data["artifacts"] == []

    def test_404_for_nonexistent_job(self, client):
        resp = client.get("/api/jobs/nonexistent/artifacts")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "job_not_found"

    def test_enriches_with_jobId_and_recipeName(self, client, db_session):
        art = [{"name": "data.csv", "type": "document", "size": 300}]
        _make_job(db_session, "j1", status="SUCCESS", artifacts=art, recipe_name="Export CSV")

        resp = client.get("/api/jobs/j1/artifacts")
        data = resp.json()
        assert data["artifacts"][0]["jobId"] == "j1"
        assert data["artifacts"][0]["recipeName"] == "Export CSV"


# ── GET /api/jobs/artifacts/{job_id}/{filename} ──────

class TestDownloadArtifact:
    def test_404_for_nonexistent_file(self, client):
        resp = client.get("/api/jobs/artifacts/j1/missing.log")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "artifact_not_found"

    def test_path_traversal_blocked(self, client):
        """Ensure ../../../etc/passwd style attacks are sanitized to just the filename."""
        resp = client.get("/api/jobs/artifacts/j1/../../etc/passwd")
        assert resp.status_code == 404

    def test_download_existing_file(self, client, tmp_path, monkeypatch):
        """Create a real artifact file and verify download returns it."""
        from app.routers import jobs

        fake_artifacts_dir = tmp_path / "artifacts"
        fake_artifacts_dir.mkdir()
        job_dir = fake_artifacts_dir / "j1"
        job_dir.mkdir()
        test_file = job_dir / "output.log"
        test_file.write_text("hello world", encoding="utf-8")

        monkeypatch.setattr(jobs, "ARTIFACTS_DIR", fake_artifacts_dir)

        resp = client.get("/api/jobs/artifacts/j1/output.log")
        assert resp.status_code == 200
        assert b"hello world" in resp.content


# ── _classify_artifact_type unit tests ───────────────

class TestClassifyArtifactType:
    def test_image_types(self):
        from app.routers.jobs import _classify_artifact_type

        for ext in ("png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"):
            assert _classify_artifact_type(f"file.{ext}") == "image"

    def test_document_types(self):
        from app.routers.jobs import _classify_artifact_type

        for ext in ("pdf", "txt", "md", "json", "csv", "docx", "xlsx", "log"):
            assert _classify_artifact_type(f"file.{ext}") == "document"

    def test_archive_types(self):
        from app.routers.jobs import _classify_artifact_type

        for ext in ("zip", "tar", "gz", "7z", "rar"):
            assert _classify_artifact_type(f"file.{ext}") == "archive"

    def test_unknown_type(self):
        from app.routers.jobs import _classify_artifact_type

        assert _classify_artifact_type("file.xyz") == "other"
        assert _classify_artifact_type("noext") == "other"
