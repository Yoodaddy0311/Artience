"""Tests for the Version Diff endpoint and helper functions (Batch 2).

Covers:
- GET /api/studio/history/{id1}/diff/{id2}
- _compute_json_diff helper
- _summarize helper
"""

import json
from pathlib import Path
from unittest.mock import patch

import pytest


# ── GET /api/studio/history/{id1}/diff/{id2} ─────────

class TestDiffSnapshots:
    def test_diff_two_valid_snapshots(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        snap1 = {
            "id": "snap_001",
            "createdAt": "2026-01-01T00:00:00",
            "data": {"theme": {"name": "Office"}, "agents": [{"id": "a01"}]},
        }
        snap2 = {
            "id": "snap_002",
            "createdAt": "2026-01-02T00:00:00",
            "data": {"theme": {"name": "Lab"}, "agents": [{"id": "a01"}, {"id": "a02"}]},
        }
        (fake_history / "snap_001.json").write_text(json.dumps(snap1), encoding="utf-8")
        (fake_history / "snap_002.json").write_text(json.dumps(snap2), encoding="utf-8")

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/snap_001/diff/snap_002")

        assert resp.status_code == 200
        data = resp.json()
        assert data["oldId"] == "snap_001"
        assert data["newId"] == "snap_002"
        assert data["totalChanges"] > 0
        assert isinstance(data["changes"], list)

    def test_diff_detects_modified_fields(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        snap1 = {"id": "s1", "data": {"name": "Old", "count": 5}}
        snap2 = {"id": "s2", "data": {"name": "New", "count": 5}}
        (fake_history / "s1.json").write_text(json.dumps(snap1), encoding="utf-8")
        (fake_history / "s2.json").write_text(json.dumps(snap2), encoding="utf-8")

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/s1/diff/s2")

        data = resp.json()
        changes = data["changes"]
        modified = [c for c in changes if c["type"] == "modified"]
        assert len(modified) == 1
        assert modified[0]["path"] == "name"
        assert modified[0]["oldValue"] == "Old"
        assert modified[0]["newValue"] == "New"

    def test_diff_detects_added_and_removed(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        snap1 = {"id": "s1", "data": {"old_field": "val"}}
        snap2 = {"id": "s2", "data": {"new_field": "val"}}
        (fake_history / "s1.json").write_text(json.dumps(snap1), encoding="utf-8")
        (fake_history / "s2.json").write_text(json.dumps(snap2), encoding="utf-8")

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/s1/diff/s2")

        data = resp.json()
        types = {c["type"] for c in data["changes"]}
        assert "added" in types
        assert "removed" in types

    def test_diff_identical_snapshots(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        snap = {"id": "s1", "data": {"name": "Same", "count": 10}}
        (fake_history / "s1.json").write_text(json.dumps(snap), encoding="utf-8")
        (fake_history / "s2.json").write_text(json.dumps(snap), encoding="utf-8")

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/s1/diff/s2")

        data = resp.json()
        assert data["totalChanges"] == 0
        assert data["changes"] == []

    def test_404_when_first_snapshot_missing(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        snap2 = {"id": "s2", "data": {}}
        (fake_history / "s2.json").write_text(json.dumps(snap2), encoding="utf-8")

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/missing/diff/s2")

        assert resp.status_code == 404
        assert resp.json()["error"]["code"] == "snapshot_not_found"

    def test_404_when_second_snapshot_missing(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        snap1 = {"id": "s1", "data": {}}
        (fake_history / "s1.json").write_text(json.dumps(snap1), encoding="utf-8")

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/s1/diff/missing")

        assert resp.status_code == 404

    def test_404_when_both_snapshots_missing(self, client, tmp_path):
        from app.routers import studio

        fake_history = tmp_path / "history"
        fake_history.mkdir()

        with patch.object(studio, "HISTORY_DIR", fake_history):
            resp = client.get("/api/studio/history/a/diff/b")

        assert resp.status_code == 404


# ── _compute_json_diff unit tests ────────────────────

class TestComputeJsonDiff:
    def test_added_key(self):
        from app.routers.studio import _compute_json_diff

        changes = _compute_json_diff({}, {"key": "val"})
        assert len(changes) == 1
        assert changes[0]["type"] == "added"
        assert changes[0]["path"] == "key"

    def test_removed_key(self):
        from app.routers.studio import _compute_json_diff

        changes = _compute_json_diff({"key": "val"}, {})
        assert len(changes) == 1
        assert changes[0]["type"] == "removed"

    def test_modified_value(self):
        from app.routers.studio import _compute_json_diff

        changes = _compute_json_diff({"key": "old"}, {"key": "new"})
        assert len(changes) == 1
        assert changes[0]["type"] == "modified"
        assert changes[0]["oldValue"] == "old"
        assert changes[0]["newValue"] == "new"

    def test_nested_dict_diff(self):
        from app.routers.studio import _compute_json_diff

        old = {"theme": {"name": "A", "color": "#FFF"}}
        new = {"theme": {"name": "B", "color": "#FFF"}}
        changes = _compute_json_diff(old, new)
        assert len(changes) == 1
        assert changes[0]["path"] == "theme.name"

    def test_list_length_change(self):
        from app.routers.studio import _compute_json_diff

        old = {"items": [1, 2]}
        new = {"items": [1, 2, 3]}
        changes = _compute_json_diff(old, new)
        assert len(changes) == 1
        assert changes[0]["type"] == "modified"
        assert "[2 items]" in changes[0]["oldValue"]
        assert "[3 items]" in changes[0]["newValue"]

    def test_list_element_change(self):
        from app.routers.studio import _compute_json_diff

        old = {"items": [{"id": "a01", "name": "Sera"}]}
        new = {"items": [{"id": "a01", "name": "Luna"}]}
        changes = _compute_json_diff(old, new)
        assert len(changes) == 1
        assert "items[0].name" in changes[0]["path"]

    def test_type_change(self):
        from app.routers.studio import _compute_json_diff

        changes = _compute_json_diff({"key": "string"}, {"key": 42})
        assert len(changes) == 1
        assert changes[0]["type"] == "modified"

    def test_no_changes(self):
        from app.routers.studio import _compute_json_diff

        changes = _compute_json_diff({"a": 1, "b": 2}, {"a": 1, "b": 2})
        assert changes == []


# ── _summarize unit tests ────────────────────────────

class TestSummarize:
    def test_dict_summary(self):
        from app.routers.studio import _summarize

        assert _summarize({"a": 1, "b": 2}) == "{2 keys}"

    def test_list_summary(self):
        from app.routers.studio import _summarize

        assert _summarize([1, 2, 3]) == "[3 items]"

    def test_long_string_truncation(self):
        from app.routers.studio import _summarize

        long_str = "x" * 100
        result = _summarize(long_str)
        assert len(result) == 80
        assert result.endswith("...")

    def test_short_string_unchanged(self):
        from app.routers.studio import _summarize

        assert _summarize("hello") == "hello"

    def test_number_converted_to_string(self):
        from app.routers.studio import _summarize

        assert _summarize(42) == "42"
