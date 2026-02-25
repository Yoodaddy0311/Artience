"""Documents router -- upload, list, retrieve, delete, and re-parse documents.

Supported formats: PDF, TXT, MD, JSON.
Files are stored under ``data/documents/`` with a ``manifest.json`` index.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pathlib import Path
from typing import Any, Dict, List
import json
import logging
import time
import uuid

from app.services.parser_service import ParserService, SUPPORTED_EXTENSIONS

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

# ── Storage paths ────────────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "documents"
MANIFEST_PATH = DATA_DIR / "manifest.json"

# ── Service singletons ──────────────────────────────────────────────
_parser = ParserService()


# ── Helpers ──────────────────────────────────────────────────────────

def _ensure_data_dir() -> None:
    """Create the documents storage directory if it does not exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _read_manifest() -> Dict[str, Any]:
    """Load the manifest from disk.  Returns empty dict on first run."""
    _ensure_data_dir()
    if not MANIFEST_PATH.exists():
        return {}
    try:
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        _logger.error("Failed to read manifest: %s", exc)
        return {}


def _write_manifest(manifest: Dict[str, Any]) -> None:
    """Persist the manifest dict to disk."""
    _ensure_data_dir()
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _detect_file_type(filename: str) -> str:
    """Map a filename to its parser type string.

    Returns one of 'text', 'json', 'pdf' or raises HTTPException for
    unsupported extensions.
    """
    ext = Path(filename).suffix.lower()
    type_map = {
        ".txt": "text",
        ".md": "text",
        ".json": "json",
        ".pdf": "pdf",
    }
    file_type = type_map.get(ext)
    if file_type is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Accepted: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )
    return file_type


def _parse_document(file_path: Path, file_type: str) -> Dict[str, Any]:
    """Run the parser and return structured content."""
    return _parser.parse_file(str(file_path), file_type)


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """Upload a document (PDF, TXT, MD, JSON).

    The file is saved to ``data/documents/``, automatically parsed,
    and its metadata recorded in the manifest.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    file_type = _detect_file_type(file.filename)

    _ensure_data_dir()

    # Generate a unique document ID
    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    ext = Path(file.filename).suffix.lower()
    stored_name = f"{doc_id}{ext}"
    stored_path = DATA_DIR / stored_name

    # Save raw file
    try:
        content_bytes = await file.read()
        stored_path.write_bytes(content_bytes)
    except Exception as exc:
        _logger.error("Failed to save file: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}")

    # Parse
    parsed = _parse_document(stored_path, file_type)

    # Save parsed content alongside original
    parsed_path = DATA_DIR / f"{doc_id}_parsed.json"
    try:
        parsed_path.write_text(
            json.dumps(parsed, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        _logger.warning("Failed to save parsed content: %s", exc)

    # Update manifest
    manifest = _read_manifest()
    manifest[doc_id] = {
        "id": doc_id,
        "original_filename": file.filename,
        "stored_filename": stored_name,
        "parsed_filename": f"{doc_id}_parsed.json",
        "file_type": file_type,
        "extension": ext,
        "size_bytes": len(content_bytes),
        "uploaded_at": time.time(),
        "parsed_at": time.time(),
    }
    _write_manifest(manifest)

    return {
        "id": doc_id,
        "filename": file.filename,
        "file_type": file_type,
        "size_bytes": len(content_bytes),
        "status": "uploaded_and_parsed",
        "metadata": parsed.get("metadata", {}),
        "section_count": len(parsed.get("sections", [])),
    }


@router.get("/")
async def list_documents():
    """List all uploaded documents with metadata."""
    manifest = _read_manifest()
    documents: List[Dict[str, Any]] = list(manifest.values())

    # Sort newest first
    documents.sort(key=lambda d: d.get("uploaded_at", 0), reverse=True)

    return {"documents": documents, "count": len(documents)}


@router.get("/{doc_id}")
async def get_document(doc_id: str):
    """Get document metadata and parsed content."""
    manifest = _read_manifest()
    entry = manifest.get(doc_id)

    if entry is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Load parsed content
    parsed_path = DATA_DIR / entry.get("parsed_filename", "")
    parsed: Dict[str, Any] = {}
    if parsed_path.exists():
        try:
            parsed = json.loads(parsed_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            _logger.warning("Failed to read parsed content for %s: %s", doc_id, exc)

    return {
        **entry,
        "content": parsed.get("content", ""),
        "metadata": parsed.get("metadata", {}),
        "sections": parsed.get("sections", []),
    }


@router.delete("/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and its parsed content."""
    manifest = _read_manifest()
    entry = manifest.get(doc_id)

    if entry is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    # Remove stored file
    stored_path = DATA_DIR / entry.get("stored_filename", "")
    if stored_path.exists():
        try:
            stored_path.unlink()
        except OSError as exc:
            _logger.warning("Failed to delete stored file: %s", exc)

    # Remove parsed file
    parsed_path = DATA_DIR / entry.get("parsed_filename", "")
    if parsed_path.exists():
        try:
            parsed_path.unlink()
        except OSError as exc:
            _logger.warning("Failed to delete parsed file: %s", exc)

    # Remove from manifest
    del manifest[doc_id]
    _write_manifest(manifest)

    return {"id": doc_id, "status": "deleted"}


@router.post("/{doc_id}/parse")
async def reparse_document(doc_id: str):
    """Trigger re-parsing of an existing document.

    Useful after parser upgrades or to refresh extracted content.
    """
    manifest = _read_manifest()
    entry = manifest.get(doc_id)

    if entry is None:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found")

    stored_path = DATA_DIR / entry.get("stored_filename", "")
    if not stored_path.exists():
        raise HTTPException(
            status_code=410,
            detail=f"Original file for document '{doc_id}' is missing from storage",
        )

    file_type = entry.get("file_type", _detect_file_type(entry.get("original_filename", "")))

    # Re-parse
    parsed = _parse_document(stored_path, file_type)

    # Overwrite parsed content file
    parsed_path = DATA_DIR / entry.get("parsed_filename", f"{doc_id}_parsed.json")
    try:
        parsed_path.write_text(
            json.dumps(parsed, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        _logger.warning("Failed to save re-parsed content: %s", exc)

    # Update manifest timestamp
    entry["parsed_at"] = time.time()
    _write_manifest(manifest)

    return {
        "id": doc_id,
        "status": "re-parsed",
        "metadata": parsed.get("metadata", {}),
        "section_count": len(parsed.get("sections", [])),
    }
