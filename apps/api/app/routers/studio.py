from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
import logging
import os
import json
import uuid
import re
from pathlib import Path

from app.exceptions import NotFoundError, ValidationError, ServiceError

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/studio", tags=["studio"])

UPLOAD_DIR = Path(__file__).parent.parent.parent.parent / "desktop" / "public" / "assets" / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.get("/assets")
def get_local_assets():
    # Target the desktop public assets directory
    public_dir = Path(__file__).parent.parent.parent.parent / "desktop" / "public" / "assets" / "characters"
    assets = []
    
    if public_dir.exists():
        for item in public_dir.iterdir():
            if item.is_file() and item.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]:
                assets.append(f"/assets/characters/{item.name}")

    # Also include uploaded assets
    if UPLOAD_DIR.exists():
        for item in UPLOAD_DIR.iterdir():
            if item.is_file():
                assets.append({
                    "filename": item.name,
                    "path": f"/assets/uploads/{item.name}",
                    "type": "image" if item.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp", ".gif"] else "document",
                    "size": item.stat().st_size,
                })
                
    return {"assets": assets, "status": "synced"}


@router.post("/upload")
async def upload_asset(file: UploadFile = File(...), tags: str = Form("")):
    """S-1: Upload a file to the asset inbox with classification, thumbnail framing & tag extraction."""
    try:
        content = await file.read()
        dest = UPLOAD_DIR / file.filename
        dest.write_bytes(content)
        
        parsed_tags = json.loads(tags) if tags else []
        file_ext = Path(file.filename).suffix.lower()

        # Automatic Classification & Tag scanning
        extracted_type = "unknown"
        if file_ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]:
            extracted_type = "image"
        elif file_ext in [".pdf", ".txt", ".md", ".json", ".csv", ".docx"]:
            extracted_type = "document"
            # simple text extraction logic for tags
            if file_ext in [".txt", ".md", ".json"]:
                sample_text = content[:1024].decode('utf-8', errors='ignore').lower()
                if "recipe" in sample_text or "command" in sample_text:
                    parsed_tags.append("Recipes")
                if "style" in sample_text or "color" in sample_text or "font" in sample_text:
                    parsed_tags.append("Theme")
        elif file_ext in [".zip", ".tar", ".gz"]:
            extracted_type = "archive"

        # Unique tag filtering
        parsed_tags = list(set(parsed_tags))

        return JSONResponse({
            "status": "ok",
            "filename": file.filename,
            "path": f"/assets/uploads/{file.filename}",
            "size": len(content),
            "type": extracted_type,
            "tags": parsed_tags,
        })
    except Exception as e:
        raise ServiceError(
            message="Failed to upload asset",
            error_code="asset_upload_failed",
            details={"filename": file.filename},
        )

# ── S-2: AI Builder Generate ──
GENERATED_DIR = Path(__file__).parent.parent.parent.parent / "desktop" / "public" / "generated"
GENERATED_DIR.mkdir(parents=True, exist_ok=True)

HISTORY_DIR = Path(__file__).parent.parent.parent.parent / "desktop" / "public" / "history"
HISTORY_DIR.mkdir(parents=True, exist_ok=True)


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
    project_path = Path(__file__).parent.parent.parent.parent / "desktop" / "public" / "project.json"
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
    project_path = Path(__file__).parent.parent.parent.parent / "desktop" / "public" / "project.json"
    project_path.write_text(json.dumps(snapshot.get("data", {}), ensure_ascii=False, indent=2), encoding="utf-8")

    return {"message": f"✅ 스냅샷 {snapshot_id}로 롤백 완료!"}


# ── S-5: Export / Import Project (Enhanced) ──
from datetime import datetime
from fastapi.responses import StreamingResponse
from app.services.export_service import ExportService, ImportService

PUBLIC_DIR = Path(__file__).parent.parent.parent.parent / "desktop" / "public"


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
