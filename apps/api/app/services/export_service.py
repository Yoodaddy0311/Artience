"""
Export/Import Service for Dokba Studio.

Handles full project packaging (ZIP) and restoration with:
- project.json, generated/, history/, assets/ inclusion
- ZIP structure validation and path traversal prevention
- Backup/rollback on import conflicts
- Metadata embedding (export timestamp, version, file manifest)
"""

import json
import logging
import os
import shutil
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import TypedDict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Type definitions
# ---------------------------------------------------------------------------

class ExportMetadata(TypedDict):
    exported_at: str
    schema_version: str
    platform: str
    file_count: int
    total_size_bytes: int
    contents: dict[str, int]


class ImportResult(TypedDict):
    status: str
    message: str
    files_imported: int
    backup_path: str | None
    changes: dict[str, list[str]]


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EXPORT_VERSION = "1.0.0"
METADATA_FILENAME = "export_meta.json"

# Directories to include in full project export (relative to public_dir)
EXPORT_DIRS = ("generated", "history", "assets")

# Required structure markers for a valid import ZIP
REQUIRED_IMPORT_ENTRIES = ("project.json",)

# Maximum individual file size inside a ZIP (100 MB)
MAX_FILE_SIZE = 100 * 1024 * 1024

# Maximum total extracted size (1 GB)
MAX_TOTAL_SIZE = 1 * 1024 * 1024 * 1024


# ---------------------------------------------------------------------------
# Export Service
# ---------------------------------------------------------------------------

class ExportService:
    """Packages the full Dokba Studio project into a downloadable ZIP archive."""

    def __init__(self, public_dir: Path) -> None:
        self._public_dir = public_dir

    # -- public API ---------------------------------------------------------

    def export_project_zip(self) -> BytesIO:
        """Create a ZIP containing project.json + generated/ + history/ + assets/.

        Returns a seeked-to-zero BytesIO buffer ready for streaming.
        """
        zip_buffer = BytesIO()
        file_count = 0
        total_size = 0
        contents: dict[str, int] = {}

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            # 1. project.json
            project_json = self._public_dir / "project.json"
            if project_json.is_file():
                zf.write(str(project_json), "project/project.json")
                file_count += 1
                size = project_json.stat().st_size
                total_size += size
                contents["project/project.json"] = size

            # 2. Directories: generated/, history/, assets/
            for dir_name in EXPORT_DIRS:
                dir_path = self._public_dir / dir_name
                if not dir_path.is_dir():
                    continue
                for root, _dirs, files in os.walk(str(dir_path)):
                    for fname in files:
                        file_path = Path(root) / fname
                        arcname = f"{dir_name}/{file_path.relative_to(dir_path).as_posix()}"
                        zf.write(str(file_path), arcname)
                        file_count += 1
                        size = file_path.stat().st_size
                        total_size += size
                        contents[arcname] = size

            # 3. Embed metadata
            metadata: ExportMetadata = {
                "exported_at": datetime.now(timezone.utc).isoformat(),
                "schema_version": EXPORT_VERSION,
                "platform": "dokba-studio",
                "file_count": file_count,
                "total_size_bytes": total_size,
                "contents": contents,
            }
            meta_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8")
            zf.writestr(METADATA_FILENAME, meta_bytes)

        zip_buffer.seek(0)
        logger.info(
            "Export complete: %d files, %d bytes total",
            file_count,
            total_size,
        )
        return zip_buffer


# ---------------------------------------------------------------------------
# Import Service
# ---------------------------------------------------------------------------

class ImportService:
    """Restores a Dokba Studio project from a ZIP archive."""

    def __init__(self, public_dir: Path) -> None:
        self._public_dir = public_dir

    # -- public API ---------------------------------------------------------

    def import_project_zip(self, zip_bytes: bytes) -> ImportResult:
        """Validate, backup existing data, and extract the ZIP into public_dir.

        Raises ValueError for invalid/malicious ZIPs.
        Returns an ImportResult dict describing what happened.
        """
        # 1. Parse and validate ZIP structure
        try:
            zf = zipfile.ZipFile(BytesIO(zip_bytes))
        except zipfile.BadZipFile as exc:
            raise ValueError("Uploaded file is not a valid ZIP archive.") from exc

        self._validate_zip(zf)

        # 2. Create backup of existing data
        backup_path = self._create_backup()

        # 3. Extract with rollback on failure
        changes: dict[str, list[str]] = {
            "created": [],
            "overwritten": [],
            "skipped": [],
        }
        files_imported = 0

        try:
            files_imported = self._extract_zip(zf, changes)
        except Exception:
            logger.error("Import extraction failed, rolling back")
            self._rollback(backup_path)
            raise
        finally:
            zf.close()

        # 4. Clean up backup only on success (keep for safety)
        result: ImportResult = {
            "status": "ok",
            "message": f"Import complete. {files_imported} files processed.",
            "files_imported": files_imported,
            "backup_path": str(backup_path) if backup_path else None,
            "changes": changes,
        }
        logger.info("Import complete: %d files", files_imported)
        return result

    # -- validation ---------------------------------------------------------

    def _validate_zip(self, zf: zipfile.ZipFile) -> None:
        """Check ZIP integrity, path traversal, size limits, and required entries."""
        names = zf.namelist()

        # Skip metadata file when checking for required entries
        content_names = [n for n in names if n != METADATA_FILENAME]

        # Must contain project.json (either at root or under project/)
        has_project_json = any(
            n == "project.json" or n == "project/project.json"
            for n in content_names
        )
        if not has_project_json:
            raise ValueError(
                "Invalid project ZIP: missing project.json. "
                "The archive must contain project.json or project/project.json."
            )

        total_size = 0
        for info in zf.infolist():
            # Path traversal check
            resolved = Path(info.filename).resolve()
            if ".." in info.filename or info.filename.startswith("/"):
                raise ValueError(
                    f"Malicious path detected in ZIP: {info.filename}"
                )

            # Individual file size check
            if info.file_size > MAX_FILE_SIZE:
                raise ValueError(
                    f"File too large in ZIP: {info.filename} "
                    f"({info.file_size} bytes, max {MAX_FILE_SIZE})"
                )

            total_size += info.file_size

        # Total extracted size check
        if total_size > MAX_TOTAL_SIZE:
            raise ValueError(
                f"ZIP total extracted size too large: "
                f"{total_size} bytes (max {MAX_TOTAL_SIZE})"
            )

    # -- backup -------------------------------------------------------------

    def _create_backup(self) -> Path | None:
        """Backup existing project data before import overwrites.

        Returns the backup directory path, or None if nothing to back up.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = self._public_dir / "_backups" / f"pre_import_{timestamp}"

        items_to_backup: list[tuple[Path, str]] = []

        # project.json
        pj = self._public_dir / "project.json"
        if pj.is_file():
            items_to_backup.append((pj, "project.json"))

        # Directories
        for dir_name in EXPORT_DIRS:
            dp = self._public_dir / dir_name
            if dp.is_dir() and any(dp.iterdir()):
                items_to_backup.append((dp, dir_name))

        if not items_to_backup:
            return None

        backup_dir.mkdir(parents=True, exist_ok=True)

        for source, name in items_to_backup:
            dest = backup_dir / name
            if source.is_file():
                shutil.copy2(str(source), str(dest))
            elif source.is_dir():
                shutil.copytree(str(source), str(dest), dirs_exist_ok=True)

        logger.info("Backup created at %s", backup_dir)
        return backup_dir

    # -- extraction ---------------------------------------------------------

    def _extract_zip(
        self,
        zf: zipfile.ZipFile,
        changes: dict[str, list[str]],
    ) -> int:
        """Extract ZIP contents into the public directory with conflict handling.

        Handles two ZIP layouts:
        - Flat: project.json, generated/*, history/*, assets/*
        - Nested: project/project.json, generated/*, history/*, assets/*

        Returns the number of files extracted.
        """
        files_imported = 0
        names = zf.namelist()

        for info in zf.infolist():
            # Skip directories and metadata
            if info.is_dir() or info.filename == METADATA_FILENAME:
                continue

            # Determine destination path
            dest_relpath = self._resolve_dest_path(info.filename)
            if dest_relpath is None:
                changes["skipped"].append(info.filename)
                continue

            dest_path = self._public_dir / dest_relpath

            # Second path traversal check on resolved destination
            try:
                dest_path.resolve().relative_to(self._public_dir.resolve())
            except ValueError:
                raise ValueError(
                    f"Path traversal attempt blocked: {info.filename}"
                )

            # Track changes
            if dest_path.exists():
                changes["overwritten"].append(dest_relpath)
            else:
                changes["created"].append(dest_relpath)

            # Ensure parent directory exists
            dest_path.parent.mkdir(parents=True, exist_ok=True)

            # Extract file
            with zf.open(info) as src, open(str(dest_path), "wb") as dst:
                shutil.copyfileobj(src, dst)

            files_imported += 1

        return files_imported

    def _resolve_dest_path(self, zip_path: str) -> str | None:
        """Map a ZIP entry path to its destination relative to public_dir.

        Handles both flat and nested (project/) layouts.
        Returns None if the file should be skipped.
        """
        # project/project.json -> project.json
        if zip_path == "project/project.json":
            return "project.json"

        # project.json at root
        if zip_path == "project.json":
            return "project.json"

        # generated/*, history/*, assets/* pass through directly
        for prefix in EXPORT_DIRS:
            if zip_path.startswith(f"{prefix}/"):
                return zip_path

        # Unknown entry -- skip silently
        return None

    # -- rollback -----------------------------------------------------------

    def _rollback(self, backup_path: Path | None) -> None:
        """Restore from backup after a failed import."""
        if backup_path is None or not backup_path.is_dir():
            logger.warning("No backup available for rollback")
            return

        # Restore project.json
        backup_pj = backup_path / "project.json"
        if backup_pj.is_file():
            shutil.copy2(str(backup_pj), str(self._public_dir / "project.json"))

        # Restore directories
        for dir_name in EXPORT_DIRS:
            backup_dir = backup_path / dir_name
            dest_dir = self._public_dir / dir_name
            if backup_dir.is_dir():
                if dest_dir.exists():
                    shutil.rmtree(str(dest_dir))
                shutil.copytree(str(backup_dir), str(dest_dir))

        logger.info("Rollback complete from %s", backup_path)
