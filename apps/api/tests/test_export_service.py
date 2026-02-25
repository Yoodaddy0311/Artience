"""
Tests for the Export/Import service (export_service.py).

Covers:
- Export: ZIP creation with project.json, generated/, history/, assets/
- Export: Metadata embedding and verification
- Import: ZIP validation (missing project.json, path traversal, size limits)
- Import: Backup creation before overwrite
- Import: Conflict handling (overwrite vs. create tracking)
- Import: Rollback on extraction failure
- Import: Both flat and nested ZIP layouts
"""

import json
import os
import shutil
import zipfile
from io import BytesIO
from pathlib import Path

import pytest

# Adjust sys.path so we can import the service directly
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.export_service import (
    EXPORT_DIRS,
    METADATA_FILENAME,
    ExportMetadata,
    ExportService,
    ImportService,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def public_dir(tmp_path: Path) -> Path:
    """Create a realistic public directory structure for testing."""
    pub = tmp_path / "public"
    pub.mkdir()

    # project.json
    project_data = {
        "meta": {"id": "test_proj", "name": "Test", "schemaVersion": "0.2.0"},
        "theme": {"name": "Test Theme", "palette": {"bg": "#000"}},
        "world": {
            "width": 40,
            "height": 25,
            "tileSize": 32,
            "layers": {"floor": [], "wall": [], "collision": [], "objects": [], "spawn": []},
        },
        "agents": [],
        "recipes": [],
    }
    (pub / "project.json").write_text(json.dumps(project_data), encoding="utf-8")

    # generated/
    gen = pub / "generated"
    gen.mkdir()
    (gen / "draft.json").write_text('{"summary": {}}', encoding="utf-8")

    # history/
    hist = pub / "history"
    hist.mkdir()
    (hist / "20240101_120000.json").write_text('{"id": "snap1"}', encoding="utf-8")

    # assets/
    assets = pub / "assets"
    assets.mkdir()
    uploads = assets / "uploads"
    uploads.mkdir()
    (uploads / "logo.png").write_bytes(b"\x89PNG_FAKE_DATA")

    characters = assets / "characters"
    characters.mkdir()
    (characters / "sprite.png").write_bytes(b"\x89PNG_SPRITE")

    return pub


@pytest.fixture()
def empty_public_dir(tmp_path: Path) -> Path:
    """An empty public directory for import-into scenarios."""
    pub = tmp_path / "public_empty"
    pub.mkdir()
    return pub


def _create_valid_zip(project_json_path: str = "project/project.json") -> bytes:
    """Helper to build a valid project ZIP in memory."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        proj = json.dumps({"meta": {"id": "imported", "name": "Imported", "schemaVersion": "0.2.0"}})
        zf.writestr(project_json_path, proj)
        zf.writestr("generated/new_draft.json", '{"summary": {}}')
        zf.writestr("history/20250101_000000.json", '{"id": "snap_imported"}')
        zf.writestr("assets/uploads/imported_logo.png", b"\x89PNG_IMPORTED")
    return buf.getvalue()


# ===========================================================================
# Export Tests
# ===========================================================================


class TestExportService:

    def test_export_creates_valid_zip(self, public_dir: Path) -> None:
        """Export must produce a valid ZIP that can be opened."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            assert zf.testzip() is None  # No corrupted entries

    def test_export_contains_project_json(self, public_dir: Path) -> None:
        """Export ZIP must include project/project.json."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            names = zf.namelist()
            assert "project/project.json" in names

            data = json.loads(zf.read("project/project.json"))
            assert data["meta"]["id"] == "test_proj"

    def test_export_contains_generated(self, public_dir: Path) -> None:
        """Export must include all files under generated/."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            gen_files = [n for n in zf.namelist() if n.startswith("generated/")]
            assert "generated/draft.json" in gen_files

    def test_export_contains_history(self, public_dir: Path) -> None:
        """Export must include all files under history/."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            hist_files = [n for n in zf.namelist() if n.startswith("history/")]
            assert "history/20240101_120000.json" in hist_files

    def test_export_contains_assets(self, public_dir: Path) -> None:
        """Export must include all files under assets/ (uploads + characters)."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            asset_files = [n for n in zf.namelist() if n.startswith("assets/")]
            assert "assets/uploads/logo.png" in asset_files
            assert "assets/characters/sprite.png" in asset_files

    def test_export_contains_metadata(self, public_dir: Path) -> None:
        """Export must embed export_meta.json with correct structure."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            assert METADATA_FILENAME in zf.namelist()

            meta = json.loads(zf.read(METADATA_FILENAME))
            assert "exported_at" in meta
            assert meta["platform"] == "dokba-studio"
            assert meta["file_count"] > 0
            assert meta["total_size_bytes"] > 0
            assert isinstance(meta["contents"], dict)

    def test_export_empty_project(self, empty_public_dir: Path) -> None:
        """Export with no project data should still produce a valid ZIP (metadata only)."""
        service = ExportService(empty_public_dir)
        buf = service.export_project_zip()

        with zipfile.ZipFile(buf) as zf:
            assert zf.testzip() is None
            meta = json.loads(zf.read(METADATA_FILENAME))
            assert meta["file_count"] == 0

    def test_export_returns_seeked_buffer(self, public_dir: Path) -> None:
        """Buffer position must be at 0 after export (ready for streaming)."""
        service = ExportService(public_dir)
        buf = service.export_project_zip()
        assert buf.tell() == 0


# ===========================================================================
# Import Validation Tests
# ===========================================================================


class TestImportValidation:

    def test_import_rejects_invalid_zip(self, empty_public_dir: Path) -> None:
        """Import must reject non-ZIP data."""
        service = ImportService(empty_public_dir)
        with pytest.raises(ValueError, match="not a valid ZIP"):
            service.import_project_zip(b"this is not a zip file")

    def test_import_rejects_missing_project_json(self, empty_public_dir: Path) -> None:
        """Import must reject ZIPs without project.json."""
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("readme.txt", "no project.json here")

        service = ImportService(empty_public_dir)
        with pytest.raises(ValueError, match="missing project.json"):
            service.import_project_zip(buf.getvalue())

    def test_import_rejects_path_traversal(self, empty_public_dir: Path) -> None:
        """Import must reject ZIPs containing ../ path traversal entries."""
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("project.json", '{"meta": {}}')
            zf.writestr("../../../etc/passwd", "malicious")

        service = ImportService(empty_public_dir)
        with pytest.raises(ValueError, match="[Mm]alicious|traversal"):
            service.import_project_zip(buf.getvalue())

    def test_import_rejects_absolute_path(self, empty_public_dir: Path) -> None:
        """Import must reject ZIPs with absolute paths."""
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("project.json", '{"meta": {}}')
            zf.writestr("/etc/shadow", "malicious")

        service = ImportService(empty_public_dir)
        with pytest.raises(ValueError, match="[Mm]alicious|traversal"):
            service.import_project_zip(buf.getvalue())


# ===========================================================================
# Import Extraction Tests
# ===========================================================================


class TestImportExtraction:

    def test_import_flat_layout(self, empty_public_dir: Path) -> None:
        """Import accepts flat layout with project.json at root."""
        zip_bytes = _create_valid_zip("project.json")

        service = ImportService(empty_public_dir)
        result = service.import_project_zip(zip_bytes)

        assert result["status"] == "ok"
        assert result["files_imported"] > 0

        # Verify project.json was extracted
        pj = empty_public_dir / "project.json"
        assert pj.is_file()
        data = json.loads(pj.read_text(encoding="utf-8"))
        assert data["meta"]["id"] == "imported"

    def test_import_nested_layout(self, empty_public_dir: Path) -> None:
        """Import accepts nested layout with project/project.json."""
        zip_bytes = _create_valid_zip("project/project.json")

        service = ImportService(empty_public_dir)
        result = service.import_project_zip(zip_bytes)

        assert result["status"] == "ok"
        # project/project.json maps to project.json in public_dir
        pj = empty_public_dir / "project.json"
        assert pj.is_file()

    def test_import_extracts_generated(self, empty_public_dir: Path) -> None:
        """Import must extract generated/ files."""
        zip_bytes = _create_valid_zip()

        service = ImportService(empty_public_dir)
        service.import_project_zip(zip_bytes)

        assert (empty_public_dir / "generated" / "new_draft.json").is_file()

    def test_import_extracts_history(self, empty_public_dir: Path) -> None:
        """Import must extract history/ files."""
        zip_bytes = _create_valid_zip()

        service = ImportService(empty_public_dir)
        service.import_project_zip(zip_bytes)

        assert (empty_public_dir / "history" / "20250101_000000.json").is_file()

    def test_import_extracts_assets(self, empty_public_dir: Path) -> None:
        """Import must extract assets/ files."""
        zip_bytes = _create_valid_zip()

        service = ImportService(empty_public_dir)
        service.import_project_zip(zip_bytes)

        assert (empty_public_dir / "assets" / "uploads" / "imported_logo.png").is_file()

    def test_import_skips_unknown_files(self, empty_public_dir: Path) -> None:
        """Files outside known directories should be skipped."""
        buf = BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("project.json", '{"meta": {}}')
            zf.writestr("unknown_dir/file.txt", "unknown")
            zf.writestr("readme.md", "root level readme")

        service = ImportService(empty_public_dir)
        result = service.import_project_zip(buf.getvalue())

        assert "unknown_dir/file.txt" in result["changes"]["skipped"]
        assert "readme.md" in result["changes"]["skipped"]
        # project.json should still be extracted
        assert (empty_public_dir / "project.json").is_file()


# ===========================================================================
# Import Backup & Conflict Tests
# ===========================================================================


class TestImportBackupAndConflict:

    def test_import_creates_backup(self, public_dir: Path) -> None:
        """When existing data exists, import must back it up first."""
        zip_bytes = _create_valid_zip()

        service = ImportService(public_dir)
        result = service.import_project_zip(zip_bytes)

        assert result["backup_path"] is not None
        backup_path = Path(result["backup_path"])
        assert backup_path.is_dir()

        # Backup must contain original project.json
        assert (backup_path / "project.json").is_file()
        original = json.loads((backup_path / "project.json").read_text(encoding="utf-8"))
        assert original["meta"]["id"] == "test_proj"

    def test_import_no_backup_when_empty(self, empty_public_dir: Path) -> None:
        """When no existing data, backup_path should be None."""
        zip_bytes = _create_valid_zip()

        service = ImportService(empty_public_dir)
        result = service.import_project_zip(zip_bytes)

        assert result["backup_path"] is None

    def test_import_tracks_overwritten_files(self, public_dir: Path) -> None:
        """Overwritten files must appear in changes['overwritten']."""
        # Create a file that will be overwritten
        gen = public_dir / "generated"
        gen.mkdir(exist_ok=True)
        (gen / "new_draft.json").write_text("{}", encoding="utf-8")

        zip_bytes = _create_valid_zip()

        service = ImportService(public_dir)
        result = service.import_project_zip(zip_bytes)

        assert "generated/new_draft.json" in result["changes"]["overwritten"]

    def test_import_tracks_created_files(self, empty_public_dir: Path) -> None:
        """Newly created files must appear in changes['created']."""
        zip_bytes = _create_valid_zip()

        service = ImportService(empty_public_dir)
        result = service.import_project_zip(zip_bytes)

        assert len(result["changes"]["created"]) > 0
        assert "project.json" in result["changes"]["created"]


# ===========================================================================
# Import Rollback Tests
# ===========================================================================


class TestImportRollback:

    def test_rollback_restores_project_json(self, public_dir: Path) -> None:
        """After rollback, original project.json must be restored."""
        service = ImportService(public_dir)

        # Read original
        original_data = json.loads((public_dir / "project.json").read_text(encoding="utf-8"))

        # Create backup
        backup_path = service._create_backup()
        assert backup_path is not None

        # Simulate a change
        (public_dir / "project.json").write_text('{"corrupted": true}', encoding="utf-8")

        # Rollback
        service._rollback(backup_path)

        restored = json.loads((public_dir / "project.json").read_text(encoding="utf-8"))
        assert restored == original_data

    def test_rollback_restores_directories(self, public_dir: Path) -> None:
        """After rollback, original directories must be restored."""
        service = ImportService(public_dir)

        # Verify original exists
        assert (public_dir / "generated" / "draft.json").is_file()

        backup_path = service._create_backup()
        assert backup_path is not None

        # Destroy the directory
        shutil.rmtree(str(public_dir / "generated"))
        assert not (public_dir / "generated").exists()

        # Rollback
        service._rollback(backup_path)

        assert (public_dir / "generated" / "draft.json").is_file()

    def test_rollback_with_no_backup(self, public_dir: Path) -> None:
        """Rollback with None backup should not raise."""
        service = ImportService(public_dir)
        service._rollback(None)  # Should not raise


# ===========================================================================
# Round-Trip Tests
# ===========================================================================


class TestRoundTrip:

    def test_export_then_import(self, public_dir: Path, empty_public_dir: Path) -> None:
        """Exported ZIP should import cleanly into a fresh directory."""
        # Export
        export_svc = ExportService(public_dir)
        buf = export_svc.export_project_zip()
        zip_bytes = buf.getvalue()

        # Import into empty dir
        import_svc = ImportService(empty_public_dir)
        result = import_svc.import_project_zip(zip_bytes)

        assert result["status"] == "ok"

        # Verify project.json content matches
        original = json.loads((public_dir / "project.json").read_text(encoding="utf-8"))
        imported = json.loads((empty_public_dir / "project.json").read_text(encoding="utf-8"))
        assert original == imported

    def test_export_import_preserves_assets(self, public_dir: Path, empty_public_dir: Path) -> None:
        """Round-trip must preserve binary asset content."""
        export_svc = ExportService(public_dir)
        buf = export_svc.export_project_zip()

        import_svc = ImportService(empty_public_dir)
        import_svc.import_project_zip(buf.getvalue())

        original_logo = (public_dir / "assets" / "uploads" / "logo.png").read_bytes()
        imported_logo = (empty_public_dir / "assets" / "uploads" / "logo.png").read_bytes()
        assert original_logo == imported_logo

    def test_export_import_preserves_history(self, public_dir: Path, empty_public_dir: Path) -> None:
        """Round-trip must preserve history snapshots."""
        export_svc = ExportService(public_dir)
        buf = export_svc.export_project_zip()

        import_svc = ImportService(empty_public_dir)
        import_svc.import_project_zip(buf.getvalue())

        original_snap = (public_dir / "history" / "20240101_120000.json").read_text(encoding="utf-8")
        imported_snap = (empty_public_dir / "history" / "20240101_120000.json").read_text(encoding="utf-8")
        assert original_snap == imported_snap
