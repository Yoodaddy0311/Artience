import io
import json
import logging
import mimetypes
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.exceptions import NotFoundError, ValidationError, ServiceError
from app.services.gcs_service import get_gcs_service
from app.config import PUBLIC_DIR, UPLOAD_DIR, THUMBNAIL_DIR, GENERATED_DIR, HISTORY_DIR, PROJECT_JSON_PATH

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studio", tags=["studio"])

_THUMBNAIL_SIZE = (128, 128)
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"}
_TEXT_EXTENSIONS = {".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".html", ".css", ".yaml", ".yml"}


def _generate_thumbnail(content: bytes, filename: str) -> dict | None:
    """Generate a 128x128 thumbnail for an image file.

    Returns a dict with thumbnail metadata on success, or None if
    thumbnail generation is not applicable or fails.
    """
    ext = Path(filename).suffix.lower()
    if ext not in _IMAGE_EXTENSIONS:
        return None

    try:
        from PIL import Image

        img = Image.open(io.BytesIO(content))
        original_width, original_height = img.size
        original_format = img.format or ext.lstrip(".")

        # Convert to RGB if needed (e.g., RGBA PNGs, palette images)
        if img.mode in ("RGBA", "P"):
            thumb = img.copy()
        else:
            thumb = img.convert("RGB")

        thumb.thumbnail(_THUMBNAIL_SIZE, Image.LANCZOS)

        thumb_filename = f"thumb_{Path(filename).stem}.png"
        thumb_path = THUMBNAIL_DIR / thumb_filename
        thumb.save(str(thumb_path), "PNG")

        # Upload thumbnail to GCS
        gcs = get_gcs_service()
        gcs_thumb_url = None
        if gcs.is_available:
            thumb_bytes = thumb_path.read_bytes()
            gcs_thumb_url = gcs.upload_bytes(
                thumb_bytes,
                f"uploads/thumbnails/{thumb_filename}",
                content_type="image/png",
            )

        return {
            "thumbnailPath": gcs_thumb_url or f"/assets/uploads/thumbnails/{thumb_filename}",
            "thumbnailSize": thumb_path.stat().st_size,
            "originalWidth": original_width,
            "originalHeight": original_height,
            "originalFormat": original_format,
            "colorMode": img.mode,
        }
    except Exception as exc:
        _logger.warning("Thumbnail generation failed for %s: %s", filename, exc)
        return None


def _extract_metadata(content: bytes, filename: str, extracted_type: str) -> dict:
    """Extract file metadata based on type."""
    meta: dict = {
        "size": len(content),
        "mimeType": mimetypes.guess_type(filename)[0] or "application/octet-stream",
    }

    if extracted_type == "document":
        ext = Path(filename).suffix.lower()
        if ext in _TEXT_EXTENSIONS:
            try:
                text = content.decode("utf-8", errors="replace")
                meta["lineCount"] = text.count("\n") + 1
                meta["encoding"] = "utf-8"
            except Exception:
                pass

    return meta

@router.get("/assets")
def get_local_assets():
    # Target the desktop public assets directory
    public_dir = PUBLIC_DIR / "assets" / "characters"
    assets = []
    
    if public_dir.exists():
        for item in public_dir.iterdir():
            if item.is_file() and item.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                assets.append(f"/assets/characters/{item.name}")

    # Also include uploaded assets
    if UPLOAD_DIR.exists():
        for item in UPLOAD_DIR.iterdir():
            if item.is_file():
                ext = item.suffix.lower()
                asset_type = "image" if ext in _IMAGE_EXTENSIONS else "document"
                asset_entry: dict = {
                    "filename": item.name,
                    "path": f"/assets/uploads/{item.name}",
                    "type": asset_type,
                    "size": item.stat().st_size,
                }
                # Include thumbnail path if one exists
                thumb_path = THUMBNAIL_DIR / f"thumb_{item.stem}.png"
                if thumb_path.exists():
                    asset_entry["thumbnail"] = f"/assets/uploads/thumbnails/thumb_{item.stem}.png"
                assets.append(asset_entry)
                
    # Include GCS-hosted assets when available
    gcs = get_gcs_service()
    if gcs.is_available:
        gcs_objects = gcs.list_objects(prefix="uploads/", max_results=200)
        for obj in gcs_objects:
            # Skip thumbnails (listed separately)
            if "/thumbnails/" in obj["name"]:
                continue
            name = obj["name"].split("/")[-1]
            ext = Path(name).suffix.lower()
            asset_type = "image" if ext in _IMAGE_EXTENSIONS else "document"
            assets.append({
                "filename": name,
                "path": obj["url"],
                "type": asset_type,
                "size": obj["size"] or 0,
                "storage": "gcs",
            })

    return {"assets": assets, "status": "synced"}


@router.post("/upload")
async def upload_asset(file: UploadFile = File(...), tags: str = Form("")):
    """S-1: Upload a file to the asset inbox with classification, thumbnail framing & tag extraction."""
    try:
        content = await file.read()
        dest = UPLOAD_DIR / file.filename
        dest.write_bytes(content)

        # Upload to GCS (async-safe: GCS SDK uses HTTP internally)
        gcs = get_gcs_service()
        gcs_url = None
        if gcs.is_available:
            mime_type = mimetypes.guess_type(file.filename)[0] or "application/octet-stream"
            gcs_url = gcs.upload_bytes(
                content,
                f"uploads/{file.filename}",
                content_type=mime_type,
            )

        parsed_tags = json.loads(tags) if tags else []
        file_ext = Path(file.filename).suffix.lower()

        # Automatic Classification & Tag scanning
        extracted_type = "unknown"
        if file_ext in _IMAGE_EXTENSIONS | {".svg"}:
            extracted_type = "image"
        elif file_ext in {".pdf", ".txt", ".md", ".json", ".csv", ".docx"}:
            extracted_type = "document"
            # simple text extraction logic for tags
            if file_ext in {".txt", ".md", ".json"}:
                sample_text = content[:1024].decode('utf-8', errors='ignore').lower()
                if "recipe" in sample_text or "command" in sample_text:
                    parsed_tags.append("Recipes")
                if "style" in sample_text or "color" in sample_text or "font" in sample_text:
                    parsed_tags.append("Theme")
        elif file_ext in {".zip", ".tar", ".gz"}:
            extracted_type = "archive"

        # Unique tag filtering
        parsed_tags = list(set(parsed_tags))

        # Post-processing: thumbnail generation + metadata extraction
        thumbnail_info = _generate_thumbnail(content, file.filename)
        metadata = _extract_metadata(content, file.filename, extracted_type)

        asset_path = gcs_url or f"/assets/uploads/{file.filename}"
        response: dict = {
            "status": "ok",
            "filename": file.filename,
            "path": asset_path,
            "size": len(content),
            "type": extracted_type,
            "tags": parsed_tags,
            "metadata": metadata,
            "storage": "gcs" if gcs_url else "local",
        }

        if thumbnail_info:
            response["thumbnail"] = thumbnail_info["thumbnailPath"]
            response["metadata"].update({
                "width": thumbnail_info["originalWidth"],
                "height": thumbnail_info["originalHeight"],
                "format": thumbnail_info["originalFormat"],
                "colorMode": thumbnail_info["colorMode"],
            })

        _logger.info(
            "Uploaded asset: %s (type=%s, size=%d)",
            file.filename, extracted_type, len(content),
        )
        return JSONResponse(response)
    except ServiceError:
        raise
    except Exception as e:
        _logger.error("Upload failed for %s: %s", file.filename, e)
        raise ServiceError(
            message="Failed to upload asset",
            error_code="asset_upload_failed",
            details={"filename": file.filename},
        )

# ── S-2: AI Builder Generate ──


@router.post("/generate")
async def generate_content(request: dict = {}):
    """S-2: Generate draft content from prompt using Claude API with rule-based fallback."""
    prompt = request.get("prompt", "")
    scope = request.get("scope", "all")
    assets = request.get("assets", [])

    draft = None
    generation_method = "rule-based"

    # ── Try LLM generation first ──
    try:
        from app.services.llm_service import LLMService

        llm = LLMService()
        if llm.is_available:
            llm_result = llm.generate_draft(prompt=prompt, scope=scope, assets=assets)

            if llm_result["status"] == "ok":
                draft = llm_result["draft"]
                generation_method = "llm"
                # Enrich with metadata
                draft["prompt"] = prompt
                draft["scope"] = scope
            else:
                _logger.warning(
                    "LLM generation returned status=%s: %s — falling back to rule-based.",
                    llm_result["status"],
                    llm_result.get("message", ""),
                )
    except Exception as exc:
        _logger.warning("LLM service error: %s — falling back to rule-based.", exc)

    # ── Fallback: rule-based generation ──
    if draft is None:
        draft = _generate_rule_based(prompt, scope)

    # Build summary from draft content
    draft["summary"] = _build_summary(draft, generation_method)

    # Save draft
    draft_path = GENERATED_DIR / "draft.json"
    draft_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")

    room_count = draft["summary"]["rooms"]
    agent_count = draft["summary"]["agents"]
    recipe_count = draft["summary"]["recipes"]
    theme_name = draft["summary"]["theme"]
    method_label = "Claude AI" if generation_method == "llm" else "Rule-based"

    result = f"""Draft generated! ({method_label})

Summary:
- {room_count} rooms
- {agent_count} agents
- {recipe_count} recipes
- Theme: {theme_name}

Check the Draft Preview tab and click Apply when ready."""

    return {"result": result, "status": "ok", "draftPath": str(draft_path), "method": generation_method}


def _generate_rule_based(prompt: str, scope: str) -> dict:
    """Original rule-based generation logic (fallback)."""
    rooms = 4
    team_size = 25
    theme = "Modern Office"

    if "개발" in prompt or "스타트업" in prompt or "오피스" in prompt:
        rooms = 6
        team_size = 15
        theme = "IT Startup"
    elif "디자인" in prompt or "스튜디오" in prompt:
        rooms = 3
        team_size = 8
        theme = "Creative Studio"
    elif "캠핑" in prompt or "자연" in prompt or "숲" in prompt:
        rooms = 5
        team_size = 10
        theme = "Forest Camping"
    elif "연구소" in prompt or "AI" in prompt:
        rooms = 8
        team_size = 20
        theme = "AI Lab (Cyberpunk)"

    return {
        "prompt": prompt,
        "scope": scope,
        "theme": {
            "name": theme,
            "primary_color": "#FFD100",
            "secondary_color": "#9DE5DC",
            "background": "#FFF8E7",
        },
        "world": {
            "grid_size": 32,
            "rooms": [
                {"id": f"room_{i+1}", "name": f"Room {i+1}", "type": "office", "width": 8, "height": 8, "x": i * 8, "y": 0}
                for i in range(rooms)
            ],
            "zones": [
                {"id": "z01", "name": "Work Area", "type": "work"},
                {"id": "z02", "name": "Social Area", "type": "social"},
            ],
        },
        "agents": [
            {"id": f"a{str(i+1).zfill(2)}", "name": f"Agent_{i+1}", "role": "General", "personality": "Diligent worker", "sprite": "default"}
            for i in range(team_size)
        ],
        "recipes": [
            {"id": "r01", "name": "System Info", "command": "node", "args": ["-v"], "description": "Show Node.js version"},
            {"id": "r02", "name": "File List", "command": "dir" if os.name == "nt" else "ls", "args": [] if os.name == "nt" else ["-la"], "description": "List files in current directory"},
            {"id": "r03", "name": "Current Path", "command": "cd" if os.name == "nt" else "pwd", "args": [], "description": "Show current working directory"},
        ],
    }


def _build_summary(draft: dict, method: str) -> dict:
    """Build a summary dict from the draft content."""
    import datetime

    theme_name = ""
    if isinstance(draft.get("theme"), dict):
        theme_name = draft["theme"].get("name", "")

    room_count = 0
    if isinstance(draft.get("world"), dict):
        room_count = len(draft["world"].get("rooms", []))

    agent_count = len(draft.get("agents", []))
    recipe_count = len(draft.get("recipes", []))

    return {
        "rooms": room_count,
        "collisionTiles": room_count * 30,
        "spawnPoints": agent_count,
        "agents": agent_count,
        "recipes": recipe_count,
        "theme": theme_name,
        "generatedAt": datetime.datetime.now().isoformat(),
        "method": method,
    }


@router.get("/draft")
async def get_draft():
    """S-3: Get current draft for preview."""
    draft_path = GENERATED_DIR / "draft.json"
    if not draft_path.exists():
        return {"summary": None, "files": [], "message": "No draft found."}

    draft = json.loads(draft_path.read_text(encoding="utf-8"))

    files = []
    for item in GENERATED_DIR.iterdir():
        if item.is_file():
            files.append({
                "filename": item.name,
                "path": f"/generated/{item.name}",
                "type": "json" if item.suffix == ".json" else "image" if item.suffix in [".png", ".jpg"] else "other",
                "size": item.stat().st_size,
            })

    return {"summary": draft.get("summary"), "files": files}


@router.post("/draft/apply")
async def apply_draft():
    """S-3: Apply draft to project.json + create history snapshot."""
    draft_path = GENERATED_DIR / "draft.json"
    if not draft_path.exists():
        raise NotFoundError(
            message="No draft to apply",
            error_code="draft_not_found",
        )

    draft = json.loads(draft_path.read_text(encoding="utf-8"))

    # Save to project.json
    project_path = PROJECT_JSON_PATH
    project_path.write_text(json.dumps(draft, ensure_ascii=False, indent=2), encoding="utf-8")

    # S-4: Create history snapshot
    import datetime
    snapshot_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    snapshot_path = HISTORY_DIR / f"{snapshot_id}.json"
    snapshot = {
        "id": snapshot_id,
        "createdAt": datetime.datetime.now().isoformat(),
        "label": f"Apply: {draft.get('prompt', 'Manual')[:50]}",
        "data": draft,
    }
    snapshot_path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"message": f"✅ project.json에 반영 완료! (스냅샷: {snapshot_id})", "snapshotId": snapshot_id}


@router.post("/draft/regenerate")
async def regenerate_draft():
    """S-3: Regenerate draft with same/modified prompt."""
    draft_path = GENERATED_DIR / "draft.json"
    prompt = ""
    scope = "all"
    if draft_path.exists():
        old = json.loads(draft_path.read_text(encoding="utf-8"))
        prompt = old.get("prompt", "")
        scope = old.get("scope", "all")

    # Re-run generation (delegate to generate endpoint logic)
    return await generate_content({"prompt": prompt, "scope": scope})


# ── S-4: Version History ──
@router.get("/history")
async def get_history():
    """S-4: List all version history snapshots."""
    snapshots = []
    if HISTORY_DIR.exists():
        for item in sorted(HISTORY_DIR.iterdir(), key=lambda x: x.name, reverse=True):
            if item.suffix == ".json":
                try:
                    data = json.loads(item.read_text(encoding="utf-8"))
                    snapshots.append({
                        "id": data.get("id", item.stem),
                        "createdAt": data.get("createdAt", ""),
                        "label": data.get("label", item.stem),
                        "summary": data.get("data", {}).get("summary", {}),
                        "filePath": str(item),
                        "size": item.stat().st_size,
                    })
                except:
                    pass

    return {"snapshots": snapshots, "count": len(snapshots)}


@router.get("/history/{id1}/diff/{id2}")
async def diff_snapshots(id1: str, id2: str):
    """Compare two version snapshots and return a structured JSON diff."""
    path1 = HISTORY_DIR / f"{id1}.json"
    path2 = HISTORY_DIR / f"{id2}.json"

    if not path1.exists():
        raise NotFoundError(
            message=f"Snapshot '{id1}' not found",
            error_code="snapshot_not_found",
            details={"snapshot_id": id1},
        )
    if not path2.exists():
        raise NotFoundError(
            message=f"Snapshot '{id2}' not found",
            error_code="snapshot_not_found",
            details={"snapshot_id": id2},
        )

    data1 = json.loads(path1.read_text(encoding="utf-8")).get("data", {})
    data2 = json.loads(path2.read_text(encoding="utf-8")).get("data", {})

    changes = _compute_json_diff(data1, data2)

    return {
        "oldId": id1,
        "newId": id2,
        "changes": changes,
        "totalChanges": len(changes),
    }


def _compute_json_diff(old: dict, new: dict, prefix: str = "") -> list[dict]:
    """Recursively compare two dicts and return a flat list of changes.

    Each change is: {path, type: "added"|"removed"|"modified", oldValue?, newValue?}
    For lists, compares by index (not deep element matching).
    """
    changes: list[dict] = []
    all_keys = set(list(old.keys()) + list(new.keys()))

    for key in sorted(all_keys):
        path = f"{prefix}.{key}" if prefix else key
        in_old = key in old
        in_new = key in new

        if in_old and not in_new:
            changes.append({"path": path, "type": "removed", "oldValue": _summarize(old[key])})
        elif not in_old and in_new:
            changes.append({"path": path, "type": "added", "newValue": _summarize(new[key])})
        else:
            old_val = old[key]
            new_val = new[key]

            if type(old_val) != type(new_val):
                changes.append({
                    "path": path, "type": "modified",
                    "oldValue": _summarize(old_val), "newValue": _summarize(new_val),
                })
            elif isinstance(old_val, dict) and isinstance(new_val, dict):
                changes.extend(_compute_json_diff(old_val, new_val, prefix=path))
            elif isinstance(old_val, list) and isinstance(new_val, list):
                if len(old_val) != len(new_val):
                    changes.append({
                        "path": path, "type": "modified",
                        "oldValue": f"[{len(old_val)} items]",
                        "newValue": f"[{len(new_val)} items]",
                    })
                else:
                    for i in range(len(old_val)):
                        item_path = f"{path}[{i}]"
                        if isinstance(old_val[i], dict) and isinstance(new_val[i], dict):
                            changes.extend(_compute_json_diff(old_val[i], new_val[i], prefix=item_path))
                        elif old_val[i] != new_val[i]:
                            changes.append({
                                "path": item_path, "type": "modified",
                                "oldValue": _summarize(old_val[i]),
                                "newValue": _summarize(new_val[i]),
                            })
            elif old_val != new_val:
                changes.append({
                    "path": path, "type": "modified",
                    "oldValue": _summarize(old_val), "newValue": _summarize(new_val),
                })

    return changes


def _summarize(val: object) -> str:
    """Return a short string representation for display in the diff."""
    if isinstance(val, dict):
        return f"{{{len(val)} keys}}"
    if isinstance(val, list):
        return f"[{len(val)} items]"
    if isinstance(val, str) and len(val) > 80:
        return val[:77] + "..."
    return str(val)


@router.post("/history/{snapshot_id}/rollback")
async def rollback_to_snapshot(snapshot_id: str):
    """S-4: Rollback to a specific snapshot."""
    snapshot_path = HISTORY_DIR / f"{snapshot_id}.json"
    if not snapshot_path.exists():
        raise NotFoundError(
            message=f"Snapshot '{snapshot_id}' not found",
            error_code="snapshot_not_found",
            details={"snapshot_id": snapshot_id},
        )

    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    project_path = PROJECT_JSON_PATH
    project_path.write_text(json.dumps(snapshot.get("data", {}), ensure_ascii=False, indent=2), encoding="utf-8")

    return {"message": f"✅ 스냅샷 {snapshot_id}로 롤백 완료!"}


# ── S-5: Export / Import Project (Enhanced) ──
from datetime import datetime
from fastapi.responses import StreamingResponse
from app.services.export_service import ExportService, ImportService


@router.get("/project")
async def get_project_config():
    """Read the current project.json configuration."""
    if not PROJECT_JSON_PATH.exists():
        return {"project": None, "message": "No project.json found."}
    try:
        data = json.loads(PROJECT_JSON_PATH.read_text(encoding="utf-8"))
        return {"project": data}
    except (json.JSONDecodeError, OSError) as exc:
        _logger.warning("Failed to read project.json: %s", exc)
        return {"project": None, "message": "Failed to parse project.json."}


@router.put("/project")
async def save_project_config(body: dict = {}):
    """Write updated project configuration to project.json."""
    if not body:
        raise ValidationError(
            message="Empty project data",
            error_code="empty_project",
        )
    PROJECT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    PROJECT_JSON_PATH.write_text(
        json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"status": "ok", "message": "project.json saved."}


@router.get("/export/project")
async def export_project():
    """S-5: Export full project (project.json + generated + history + assets) as ZIP.

    Returns a streaming ZIP download containing:
    - project/project.json
    - generated/**
    - history/**
    - assets/**
    - export_meta.json (timestamp, version, file manifest)
    """
    try:
        service = ExportService(PUBLIC_DIR)
        zip_buffer = service.export_project_zip()

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"dokba_project_{timestamp}.zip"

        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except Exception as e:
        _logger.exception("Export failed")
        raise ServiceError(
            message="Failed to export project",
            error_code="export_failed",
        )


@router.post("/import/project")
async def import_project(file: UploadFile = File(...)):
    """S-5: Import project ZIP with validation, backup, and conflict handling.

    Accepts a ZIP archive and:
    1. Validates ZIP structure (must contain project.json)
    2. Checks for path traversal attacks
    3. Backs up existing project data before overwriting
    4. Extracts project.json, generated/, history/, assets/
    5. Rolls back on partial failure

    Returns a JSON report of created/overwritten/skipped files.
    """
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise ValidationError(
            message="Only .zip files are accepted",
            error_code="invalid_file_type",
            details={"filename": file.filename},
        )

    try:
        content = await file.read()
    except Exception as e:
        raise ServiceError(
            message="Failed to read uploaded file",
            error_code="file_read_failed",
            details={"filename": file.filename},
        )

    if len(content) == 0:
        raise ValidationError(
            message="Uploaded ZIP file is empty",
            error_code="empty_file",
            details={"filename": file.filename},
        )

    try:
        service = ImportService(PUBLIC_DIR)
        result = service.import_project_zip(content)
        return JSONResponse(result, status_code=200)
    except ValueError as e:
        # Validation errors (bad zip, path traversal, missing project.json)
        raise ValidationError(
            message=str(e),
            error_code="import_validation_failed",
            details={"filename": file.filename},
        )
    except OSError as e:
        # Disk space / permission errors
        _logger.exception("Import failed due to OS error")
        raise ServiceError(
            message=f"File system error: {str(e)}",
            error_code="import_filesystem_error",
            details={"filename": file.filename},
        )
    except Exception as e:
        _logger.exception("Import failed unexpectedly")
        raise ServiceError(
            message="Import failed unexpectedly",
            error_code="import_failed",
            details={"filename": file.filename},
        )
