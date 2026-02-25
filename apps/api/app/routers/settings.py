from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import Literal
import json
import os

router = APIRouter()

# ── Constants ──────────────────────────────────────────
SETTINGS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data")
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")

DEFAULT_RUN_SETTINGS = {
    "maxConcurrentAgents": 5,
    "logVerbosity": "info",
    "runTimeoutSeconds": 300,
}


# ── Schema ─────────────────────────────────────────────
class RunSettingsUpdate(BaseModel):
    maxConcurrentAgents: int = Field(default=5, ge=1, le=25)
    logVerbosity: Literal["debug", "info", "warn", "error"] = "info"
    runTimeoutSeconds: int = Field(default=300, ge=10, le=3600)


class RunSettingsResponse(BaseModel):
    maxConcurrentAgents: int
    logVerbosity: str
    runTimeoutSeconds: int


# ── Helpers ────────────────────────────────────────────
def _read_all_settings() -> dict:
    """Read the full settings.json file, returning empty dict on failure."""
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _write_all_settings(data: dict) -> None:
    """Write the full settings dict to settings.json, creating dir if needed."""
    os.makedirs(SETTINGS_DIR, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def get_run_settings() -> dict:
    """Return the current run settings, merged with defaults."""
    all_settings = _read_all_settings()
    stored = all_settings.get("run", {})
    return {**DEFAULT_RUN_SETTINGS, **stored}


# ── Endpoints ──────────────────────────────────────────
@router.get("/run", response_model=RunSettingsResponse)
def get_run_settings_endpoint():
    """Get current run settings."""
    return get_run_settings()


@router.put("/run", response_model=RunSettingsResponse)
def update_run_settings_endpoint(body: RunSettingsUpdate):
    """Update run settings and persist to disk."""
    all_settings = _read_all_settings()
    new_run = {
        "maxConcurrentAgents": body.maxConcurrentAgents,
        "logVerbosity": body.logVerbosity,
        "runTimeoutSeconds": body.runTimeoutSeconds,
    }
    all_settings["run"] = new_run
    _write_all_settings(all_settings)
    return {**DEFAULT_RUN_SETTINGS, **new_run}
